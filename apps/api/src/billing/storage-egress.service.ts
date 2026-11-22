import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { StorageUrlService } from '../common/storage/storage-url.service';
import { PrismaService } from '../prisma/prisma.service';
import { FILE_TYPE_KEYS, FileTypeKey } from './billing.constants';
import {
  EGRESS_DEDUP_MAX, EgressAccumulator, egressDayKey, egressMeterEnabled, encodeStoragePath,
} from './storage-egress';
import { classifyFile } from './storage-usage.service';

const FLUSH_EVERY_MS = 60_000;
const WARN_EVERY_MS = 10 * 60_000;
const URL_PATH = (col: Prisma.Sql) => Prisma.sql`substring(${col} from '/storage/v1/object/public/audit-files/(.*)$')`;

export interface EgressMonth {
  /** false cuando la tabla aún no existe (SQL sin aplicar) o la consulta falló: la pantalla debe decir «no medido», no «0». */
  available: boolean;
  files: number;
  bytes: number;
  byType: Record<FileTypeKey, number>;
}

const emptyByType = (): Record<FileTypeKey, number> => Object.fromEntries(FILE_TYPE_KEYS.map((k) => [k, 0])) as Record<FileTypeKey, number>;

/**
 * Mide las descargas por organización (ver storage-egress.ts para QUÉ se mide y sus límites). Se cuelga de `StorageUrlService`: cada vez que el API
 * entrega enlaces de archivos a una persona, anota —fuera del camino de la respuesta— cuántos archivos y cuántos bytes eran, una vez por archivo y
 * día. Lo anotado se acumula en memoria y se escribe cada minuto con un solo INSERT … ON CONFLICT. Cualquier falla (tabla sin crear, base caída)
 * se ignora y se avisa en el log como máximo cada 10 minutos: medir nunca debe tumbar ni retrasar una respuesta.
 */
@Injectable()
export class StorageEgressService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StorageEgressService.name);
  private readonly acc = new EgressAccumulator();
  private seen = new Set<string>();
  private seenDay = '';
  private timer: NodeJS.Timeout | null = null;
  private flushing = false;
  private lastWarnAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
    private readonly config: ConfigService,
  ) {}

  isEnabled(): boolean {
    return egressMeterEnabled(this.config.get<string>('EGRESS_METER_ENABLED'), this.config.get<string>('NODE_ENV'));
  }

  onModuleInit(): void {
    if (!this.isEnabled()) return;
    // StorageUrlService está registrado en AppModule (no en este módulo): se busca la misma instancia compartida, no se crea otra.
    const storageUrl = this.moduleRef.get(StorageUrlService, { strict: false });
    storageUrl.addIssuedListener((organizationId, paths) => { void this.record(organizationId, paths); });
    this.timer = setInterval(() => { void this.flush(); }, FLUSH_EVERY_MS);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.flush();
  }

  private warn(message: string): void {
    const now = Date.now();
    if (now - this.lastWarnAt < WARN_EVERY_MS) return;
    this.lastWarnAt = now;
    this.logger.warn(message);
  }

  /** Anota los archivos que recibieron enlace. Devuelve cuántos archivos NUEVOS (no contados hoy) con tamaño conocido sumó. Nunca lanza. */
  async record(organizationId: string, paths: string[], now: Date = new Date()): Promise<number> {
    let marked: string[] = [];
    try {
      const day = egressDayKey(now);
      if (day !== this.seenDay || this.seen.size > EGRESS_DEDUP_MAX) { this.seen = new Set(); this.seenDay = day; }
      const fresh = [...new Set(paths)].filter((p) => !this.seen.has(`${organizationId}|${p}`));
      if (fresh.length === 0) return 0;
      marked = fresh.map((p) => `${organizationId}|${p}`);
      for (const k of marked) this.seen.add(k);

      const files = await this.lookupFiles(fresh);
      for (const f of files) this.acc.add(organizationId, day, classifyFile(f.mime, f.name), f.bytes);
      return files.length;
    } catch (err) {
      for (const k of marked) this.seen.delete(k); // si falló la búsqueda, que el próximo enlace de ese archivo sí se cuente

      this.warn(`No se pudo anotar la descarga: ${err instanceof Error ? err.message.split('\n').slice(-1)[0] : String(err)}`);
      return 0;
    }
  }

  /**
   * Tamaño y tipo de cada ruta, buscando en las tablas que guardan archivos. Las rutas sin tamaño conocido (por ejemplo los PDF sellados de los
   * papeles) no se cuentan: mejor medir de menos que inventar un tamaño. Un archivo cuenta una sola vez aunque aparezca en dos tablas.
   */
  async lookupFiles(paths: string[]): Promise<Array<{ path: string; mime: string | null; name: string | null; bytes: number }>> {
    if (paths.length === 0) return [];
    const back = new Map<string, string>();
    for (const p of paths) { back.set(p, p); back.set(encodeStoragePath(p), p); }
    const candidates = [...back.keys()];
    const any = Prisma.sql`ANY(${candidates}::text[])`;
    const requestPath = URL_PATH(Prisma.sql`ard."fileUrl"`);
    const paperPath = URL_PATH(Prisma.sql`wp."fileUrl"`);
    const rows = await this.prisma.$queryRaw<Array<{ path: string; mime: string | null; name: string | null; bytes: bigint | number | null }>>(Prisma.sql`
      SELECT f.path, f.mime, f.name, f.bytes FROM (
        SELECT fe."storageKey" AS path, fe."mimeType" AS mime, fe."filename" AS name, fe."size"::bigint AS bytes
          FROM "field_evidences" fe WHERE fe."storageKey" = ${any}
        UNION ALL
        SELECT se."storageKey", se."mimeType", se."fileName", se."size"::bigint
          FROM "step_evidences" se WHERE se."storageKey" = ${any}
        UNION ALL
        SELECT ${requestPath}, ard."mimeType", ard."filename", ard."fileSize"::bigint
          FROM "audit_request_documents" ard WHERE ${requestPath} = ${any}
        UNION ALL
        SELECT ${paperPath}, wp."mimeType", wp."originalFilename", wp."fileSize"::bigint
          FROM "working_papers" wp WHERE wp."fileUrl" IS NOT NULL AND wp."fileSize" IS NOT NULL AND ${paperPath} = ${any}
      ) f`);
    const byPath = new Map<string, { path: string; mime: string | null; name: string | null; bytes: number }>();
    for (const r of rows) {
      const path = back.get(r.path) ?? r.path;
      const bytes = Number(r.bytes ?? 0);
      const prev = byPath.get(path);
      if (!prev || bytes > prev.bytes) byPath.set(path, { path, mime: r.mime, name: r.name, bytes });
    }
    return [...byPath.values()];
  }

  /** Escribe lo acumulado (un solo INSERT … ON CONFLICT que suma). Lo que no se pueda escribir se descarta con aviso. */
  async flush(): Promise<void> {
    if (this.flushing || this.acc.size === 0) return;
    this.flushing = true;
    const entries = this.acc.drain();
    try {
      const values = entries.map((e) => Prisma.sql`(${e.organizationId}, ${e.day}::date, ${e.fileType}, ${e.files}, ${BigInt(e.bytes)})`);
      await this.prisma.$executeRaw(Prisma.sql`
        INSERT INTO "storage_egress_daily" ("organizationId", "day", "fileType", "files", "bytes") VALUES ${Prisma.join(values)}
        ON CONFLICT ("organizationId", "day", "fileType") DO UPDATE
          SET "files" = "storage_egress_daily"."files" + EXCLUDED."files", "bytes" = "storage_egress_daily"."bytes" + EXCLUDED."bytes"`);
    } catch (err) {
      this.warn(`No se pudieron guardar ${entries.length} registro(s) de descargas: ${err instanceof Error ? err.message.split('\n').slice(-1)[0] : String(err)}`);
    } finally {
      this.flushing = false;
    }
  }

  /** Descargas del mes (AAAA-MM) por organización, para «Consumo». Si la tabla no existe devuelve `available: false` para todas. */
  async month(periodKey: string): Promise<{ available: boolean; byOrg: Map<string, EgressMonth> }> {
    try {
      const rows = await this.prisma.$queryRaw<Array<{ org: string; type: string; files: bigint | number; bytes: bigint | number }>>(Prisma.sql`
        SELECT "organizationId" AS org, "fileType" AS type, SUM("files") AS files, SUM("bytes") AS bytes
          FROM "storage_egress_daily"
         WHERE "day" >= (${periodKey} || '-01')::date AND "day" < ((${periodKey} || '-01')::date + interval '1 month')
         GROUP BY 1, 2`);
      const byOrg = new Map<string, EgressMonth>();
      for (const r of rows) {
        const cur = byOrg.get(r.org) ?? { available: true, files: 0, bytes: 0, byType: emptyByType() };
        const bytes = Number(r.bytes ?? 0);
        const type = (FILE_TYPE_KEYS as readonly string[]).includes(r.type) ? (r.type as FileTypeKey) : 'OTROS';
        cur.files += Number(r.files ?? 0);
        cur.bytes += bytes;
        cur.byType[type] += bytes;
        byOrg.set(r.org, cur);
      }
      return { available: true, byOrg };
    } catch (err) {
      this.warn(`No se pudieron leer las descargas del mes: ${err instanceof Error ? err.message.split('\n').slice(-1)[0] : String(err)}`);
      return { available: false, byOrg: new Map() };
    }
  }
}
