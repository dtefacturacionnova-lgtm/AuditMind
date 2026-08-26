import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, WatchlistSourceList, WatchlistSyncStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// OFAC SDN por sí solo trae ~19,300 registros — un upsert secuencial (uno a
// la vez) tarda decenas de minutos (confirmado en vivo: 1,170 registros en
// ~2 minutos antes de interrumpirlo). Se procesa en lotes en paralelo en vez
// de una fila a la vez (mismo espíritu que fixes_and_lessons #32 de esta
// sesión, pero a una escala donde ni siquiera subir el timeout alcanza — acá
// hace falta paralelizar). 40 es conservador frente al límite de conexiones
// del pooler de Supabase (transaction mode) sin acercarse a saturarlo.
const UPSERT_BATCH_SIZE = 40;

// Todas las listas activas hoy — único lugar a tocar al agregar una nueva
// fuente (ej. UE, una vez resuelto el bloqueo de cuenta — ver config.py del
// ai-service).
const ALL_SOURCE_LISTS = [
  WatchlistSourceList.OFAC_SDN,
  WatchlistSourceList.UN_CONSOLIDATED,
  WatchlistSourceList.UK_SANCTIONS,
];

const SOURCE_SLUG: Record<WatchlistSourceList, 'ofac' | 'un' | 'uk'> = {
  [WatchlistSourceList.OFAC_SDN]: 'ofac',
  [WatchlistSourceList.UN_CONSOLIDATED]: 'un',
  [WatchlistSourceList.UK_SANCTIONS]: 'uk',
};

interface ParsedWatchlistRecord {
  external_id: string;
  entity_type: 'INDIVIDUAL' | 'ENTITY' | 'OTHER';
  primary_name: string;
  aliases: string[];
  programs: string[];
  nationality: string[];
  countries: string[];
  date_of_birth: string | null;
  place_of_birth: string | null;
  remarks: string | null;
  source_updated_at: string | null;
  raw_record: Record<string, unknown>;
}

// Motor CAATs #18 — Screening de Sanciones (OFAC + ONU). ai-service SOLO
// descarga+parsea (apps/ai-service/app/routers/watchlists.py) — este
// servicio es quien escribe, siguiendo el mismo fire-and-forget +
// DB-tracked-status ya establecido en DataSourcesService.runImport().
@Injectable()
export class WatchlistsService {
  private readonly logger = new Logger(WatchlistsService.name);
  private readonly aiServiceUrl: string;
  private readonly internalKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.aiServiceUrl = this.config.get<string>('AI_SERVICE_URL', 'http://localhost:3003');
    this.internalKey = this.config.get<string>('AI_SERVICE_INTERNAL_KEY', 'auditmind-internal-2026-xK9mP3qR');
  }

  async triggerSync(sourceList: WatchlistSourceList | undefined, triggeredBy: 'CRON' | 'MANUAL', triggeredById?: string) {
    const lists = sourceList ? [sourceList] : ALL_SOURCE_LISTS;

    // Evita corridas superpuestas — sin esto, un cron que dispara mientras la
    // corrida anterior de la MISMA lista sigue en curso (ej. OFAC tardó más
    // de lo normal) apila sincronizaciones concurrentes contra el mismo
    // origen y la misma tabla (encontrado en vivo al verificar esta feature).
    const yaCorriendo = await this.prisma.watchlistSync.findMany({
      where: { sourceList: { in: lists }, status: WatchlistSyncStatus.RUNNING },
      select: { sourceList: true },
    });
    if (yaCorriendo.length > 0) {
      throw new ConflictException(
        `Ya hay una sincronización en curso para: ${yaCorriendo.map((s) => s.sourceList).join(', ')} — espere a que termine.`,
      );
    }

    const syncs = await Promise.all(
      lists.map((list) =>
        this.prisma.watchlistSync.create({
          data: { sourceList: list, status: WatchlistSyncStatus.RUNNING, triggeredBy, triggeredById },
        }),
      ),
    );

    // Fire-and-forget — no se espera a que terminen para responder (molde
    // DataSourcesService.executeImportBackground).
    for (const sync of syncs) {
      this.executeSyncBackground(sync.id, sync.sourceList).catch((err) =>
        this.logger.error(`Sync ${sync.id} (${sync.sourceList}) falló sin capturarse: ${err.message}`, err.stack),
      );
    }

    return syncs;
  }

  async getSyncStatus() {
    const lists = ALL_SOURCE_LISTS;
    const [latestSyncs, entryCounts] = await Promise.all([
      Promise.all(
        lists.map((list) =>
          this.prisma.watchlistSync.findFirst({ where: { sourceList: list }, orderBy: { startedAt: 'desc' } }),
        ),
      ),
      Promise.all(
        lists.map((list) => this.prisma.watchlistEntry.count({ where: { sourceList: list, active: true } })),
      ),
    ]);

    return lists.map((list, i) => ({
      sourceList: list,
      lastSync: latestSyncs[i],
      activeEntryCount: entryCounts[i],
    }));
  }

  async getSyncById(id: string) {
    return this.prisma.watchlistSync.findUnique({ where: { id } });
  }

  private async executeSyncBackground(syncId: string, sourceList: WatchlistSourceList) {
    const source = SOURCE_SLUG[sourceList];
    try {
      const res = await fetch(`${this.aiServiceUrl}/watchlists/parse/${source}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-key': this.internalKey },
        signal: AbortSignal.timeout(180_000), // los XML son varios MB, la descarga+parseo puede tardar
      });
      if (!res.ok) {
        throw new Error(`ai-service respondió ${res.status}: ${await res.text()}`);
      }
      const { records } = (await res.json()) as { records: ParsedWatchlistRecord[] };

      let upserted = 0;
      for (let i = 0; i < records.length; i += UPSERT_BATCH_SIZE) {
        const batch = records.slice(i, i + UPSERT_BATCH_SIZE);
        await Promise.all(
          batch.map((r) =>
            this.prisma.watchlistEntry.upsert({
              where: { sourceList_externalId: { sourceList, externalId: r.external_id } },
              create: {
                sourceList,
                externalId: r.external_id,
                entityType: r.entity_type,
                primaryName: r.primary_name,
                aliases: r.aliases,
                programs: r.programs,
                nationality: r.nationality,
                countries: r.countries,
                dateOfBirth: r.date_of_birth,
                placeOfBirth: r.place_of_birth,
                remarks: r.remarks,
                rawRecord: r.raw_record as Prisma.InputJsonValue,
                active: true,
                sourceUpdatedAt: r.source_updated_at ? new Date(r.source_updated_at) : null,
                lastSyncId: syncId,
              },
              update: {
                entityType: r.entity_type,
                primaryName: r.primary_name,
                aliases: r.aliases,
                programs: r.programs,
                nationality: r.nationality,
                countries: r.countries,
                dateOfBirth: r.date_of_birth,
                placeOfBirth: r.place_of_birth,
                remarks: r.remarks,
                rawRecord: r.raw_record as Prisma.InputJsonValue,
                active: true,
                sourceUpdatedAt: r.source_updated_at ? new Date(r.source_updated_at) : null,
                lastSyncId: syncId,
              },
            }),
          ),
        );
        upserted += batch.length;
      }

      // Cualquier entrada activa de esta lista que esta corrida NO tocó ya
      // no está en la fuente — se marca como dada de baja, nunca se borra
      // (ver comentario en el modelo Prisma).
      const deactivated = await this.prisma.watchlistEntry.updateMany({
        where: { sourceList, active: true, lastSyncId: { not: syncId } },
        data: { active: false },
      });

      await this.prisma.watchlistSync.update({
        where: { id: syncId },
        data: {
          status: WatchlistSyncStatus.COMPLETED,
          recordsFetched: records.length,
          recordsUpserted: upserted,
          recordsDeactivated: deactivated.count,
          completedAt: new Date(),
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Sincronización de ${sourceList} (${syncId}) falló: ${message}`);
      await this.prisma.watchlistSync.update({
        where: { id: syncId },
        data: { status: WatchlistSyncStatus.FAILED, errorMsg: message, completedAt: new Date() },
      });
    }
  }
}
