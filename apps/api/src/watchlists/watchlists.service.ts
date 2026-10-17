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

// Una lista se considera ATRASADA si su ultima sincronizacion EXITOSA tiene mas
// de este numero de dias. Lo usan la verificacion semanal (repara) y la
// pantalla de Listas de Sanciones (avisa) — antes una lista podia llevar
// semanas sin actualizarse (OFAC >20 dias) sin que nada lo senalara.
export const WATCHLIST_STALE_AFTER_DAYS = 3;

// Una corrida en estado RUNNING mas vieja que esto quedo huerfana (reinicio del
// servidor / deploy a mitad de la sincronizacion) y bloquearia para siempre
// toda corrida futura via el guard "ya hay una sincronizacion en curso".
const RUNNING_EXPIRES_MS = 30 * 60 * 1000;

// Reintentos de la llamada al ai-service (descarga + parseo). El cron nocturno
// fallaba con "fetch failed" intermitente: se reintenta ante errores de red y
// 5xx, nunca ante 4xx (clave interna invalida, fuente desconocida...).
const PARSE_RETRY_DELAYS_MS = [0, 15_000, 60_000];

// Orden de ejecucion dentro de una misma corrida: las listas se procesan una
// tras otra (antes las 3 arrancaban a la vez, sumando carga justo cuando otros
// crons del servidor tambien arrancan). Primero las pequenas.
const SYNC_ORDER: WatchlistSourceList[] = [
  WatchlistSourceList.UN_CONSOLIDATED,
  WatchlistSourceList.UK_SANCTIONS,
  WatchlistSourceList.OFAC_SDN,
];

class NonRetryableError extends Error {}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** `fetch failed` por si solo no dice nada: la causa real (ECONNRESET, UND_ERR_*,
 *  timeout...) viaja en `err.cause` y antes se perdia. */
function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = (err as Error & { cause?: { code?: string; name?: string; message?: string } }).cause;
  if (!cause) return err.message;
  const detail = [cause.code ?? cause.name, cause.message].filter(Boolean).join(': ');
  return detail ? `${err.message} [${detail}]` : err.message;
}

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

    await this.expireStaleRunning();

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
    // DataSourcesService.executeImportBackground). Las listas se procesan en
    // SECUENCIA (no las 3 a la vez): las filas ya quedaron en RUNNING, asi que
    // el guard de arriba y la pantalla las ven como "en curso" desde el inicio.
    const ordered = [...syncs].sort((a, b) => SYNC_ORDER.indexOf(a.sourceList) - SYNC_ORDER.indexOf(b.sourceList));
    this.runSequentially(ordered).catch((err) =>
      this.logger.error(`Corrida de sincronización falló sin capturarse: ${describeError(err)}`),
    );

    return syncs;
  }

  private async runSequentially(syncs: { id: string; sourceList: WatchlistSourceList }[]) {
    for (const sync of syncs) {
      const t0 = Date.now();
      await this.executeSyncBackground(sync.id, sync.sourceList).catch((err) =>
        this.logger.error(`Sync ${sync.id} (${sync.sourceList}) falló sin capturarse: ${describeError(err)}`),
      );
      this.logger.log(`Sync ${sync.sourceList} terminó en ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    }
  }

  /** Marca como FAILED las corridas RUNNING huerfanas (ver RUNNING_EXPIRES_MS). */
  private async expireStaleRunning() {
    const res = await this.prisma.watchlistSync.updateMany({
      where: { status: WatchlistSyncStatus.RUNNING, startedAt: { lt: new Date(Date.now() - RUNNING_EXPIRES_MS) } },
      data: {
        status: WatchlistSyncStatus.FAILED,
        errorMsg: 'Corrida interrumpida (el servidor se reinició o la corrida superó 30 minutos)',
        completedAt: new Date(),
      },
    });
    if (res.count > 0) this.logger.warn(`${res.count} corrida(s) de sincronización huérfana(s) marcada(s) como FAILED`);
  }

  /**
   * Verificacion semanal: cualquier lista cuya ultima sincronizacion EXITOSA sea
   * mas vieja que WATCHLIST_STALE_AFTER_DAYS (o que nunca se haya sincronizado) se
   * vuelve a sincronizar. Es la red de seguridad de la corrida diaria — no la
   * reemplaza (una lista cargada solo una vez por semana quedaria hasta 7 dias
   * desactualizada para el screening de PLD).
   */
  async repairStale(): Promise<{ sourceList: WatchlistSourceList; ageDays: number | null; action: string }[]> {
    await this.expireStaleRunning();
    const results: { sourceList: WatchlistSourceList; ageDays: number | null; action: string }[] = [];
    for (const list of ALL_SOURCE_LISTS) {
      const last = await this.prisma.watchlistSync.findFirst({
        where: { sourceList: list, status: WatchlistSyncStatus.COMPLETED },
        orderBy: { completedAt: 'desc' },
        select: { completedAt: true },
      });
      const ageDays = last?.completedAt ? (Date.now() - last.completedAt.getTime()) / 86_400_000 : null;
      if (ageDays !== null && ageDays <= WATCHLIST_STALE_AFTER_DAYS) {
        results.push({ sourceList: list, ageDays, action: 'al día' });
        continue;
      }
      this.logger.warn(
        `ALERTA: ${list} desactualizada (${ageDays === null ? 'nunca sincronizada' : `${ageDays.toFixed(1)} días`}) — se vuelve a sincronizar`,
      );
      try {
        await this.triggerSync(list, 'CRON');
        results.push({ sourceList: list, ageDays, action: 're-sincronización lanzada' });
      } catch (err) {
        results.push({ sourceList: list, ageDays, action: `omitida: ${describeError(err)}` });
      }
    }
    return results;
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

    const lastSuccesses = await Promise.all(
      lists.map((list) =>
        this.prisma.watchlistSync.findFirst({
          where: { sourceList: list, status: WatchlistSyncStatus.COMPLETED },
          orderBy: { completedAt: 'desc' },
          select: { completedAt: true },
        }),
      ),
    );

    return lists.map((list, i) => {
      const lastSuccessAt = lastSuccesses[i]?.completedAt ?? null;
      const daysSinceSuccess = lastSuccessAt ? (Date.now() - lastSuccessAt.getTime()) / 86_400_000 : null;
      return {
        sourceList: list,
        lastSync: latestSyncs[i],
        activeEntryCount: entryCounts[i],
        lastSuccessAt,
        daysSinceSuccess,
        // Sin ninguna corrida exitosa tambien cuenta como atrasada.
        isStale: daysSinceSuccess === null || daysSinceSuccess > WATCHLIST_STALE_AFTER_DAYS,
      };
    });
  }

  async getSyncById(id: string) {
    return this.prisma.watchlistSync.findUnique({ where: { id } });
  }

  /** Descarga + parseo via ai-service, con reintentos ante fallos transitorios. */
  private async fetchParsed(source: string): Promise<ParsedWatchlistRecord[]> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < PARSE_RETRY_DELAYS_MS.length; attempt++) {
      if (PARSE_RETRY_DELAYS_MS[attempt] > 0) await sleep(PARSE_RETRY_DELAYS_MS[attempt]);
      try {
        const res = await fetch(`${this.aiServiceUrl}/watchlists/parse/${source}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-internal-key': this.internalKey },
          signal: AbortSignal.timeout(180_000), // los XML son varios MB, la descarga+parseo puede tardar
        });
        if (!res.ok) {
          const detail = `ai-service respondió ${res.status}: ${await res.text()}`;
          // 4xx = peticion mal formada / clave invalida: reintentar no lo arregla.
          throw res.status >= 500 ? new Error(detail) : new NonRetryableError(detail);
        }
        const { records } = (await res.json()) as { records: ParsedWatchlistRecord[] };
        return records;
      } catch (err) {
        lastErr = err;
        if (err instanceof NonRetryableError) throw err;
        this.logger.warn(
          `parse/${source}: intento ${attempt + 1}/${PARSE_RETRY_DELAYS_MS.length} falló — ${describeError(err)}`,
        );
      }
    }
    throw lastErr;
  }

  private async executeSyncBackground(syncId: string, sourceList: WatchlistSourceList) {
    const source = SOURCE_SLUG[sourceList];
    try {
      const records = await this.fetchParsed(source);

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
      const message = describeError(err);
      this.logger.error(`Sincronización de ${sourceList} (${syncId}) falló: ${message}`);
      await this.prisma.watchlistSync.update({
        where: { id: syncId },
        data: { status: WatchlistSyncStatus.FAILED, errorMsg: message, completedAt: new Date() },
      });
    }
  }
}
