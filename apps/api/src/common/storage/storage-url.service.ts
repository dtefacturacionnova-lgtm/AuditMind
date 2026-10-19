import { Injectable, Logger } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Bucket `audit-files` PRIVADO (auditoría de seguridad 2026-10-18).
 *
 * Antes el bucket era público: cualquiera con el enlace de un adjunto lo
 * descargaba sin sesión y para siempre. Ahora la base sigue guardando la URL
 * "pública" canónica (`.../object/public/audit-files/<ruta>`) — sirve como
 * identificador de la ruta — y la API la convierte en un enlace firmado de
 * corta vida al RESPONDER (`signResponse`). En sentido contrario, si el
 * navegador devuelve un enlace firmado al guardar (p. ej. al editar un papel),
 * `normalizeInbound` lo restaura a la forma canónica para no persistir un
 * enlace que vence.
 */
export const STORAGE_BUCKET = 'audit-files';
const SIGNED_TTL_SECONDS = 2 * 60 * 60;   // 2 h de vida por enlace firmado
const CACHE_REUSE_MS = 30 * 60 * 1000;    // se reutiliza 30 min: al cliente le quedan >= 90 min
const CACHE_MAX_ENTRIES = 5000;
const SIGN_BATCH = 200;

const PUBLIC_MARK = `/storage/v1/object/public/${STORAGE_BUCKET}/`;
const SIGNED_MARK = `/storage/v1/object/sign/${STORAGE_BUCKET}/`;
const URL_BODY = `[^\\s"'<>\\\\)]`;
const PUBLIC_RE = new RegExp(`https?:\\/\\/${URL_BODY}+?\\/storage\\/v1\\/object\\/public\\/${STORAGE_BUCKET}\\/(${URL_BODY.replace(')', '')}+?)(?=[?#\\s"'<>\\\\)]|$)`, 'g');
const SIGNED_RE = new RegExp(`(https?:\\/\\/${URL_BODY}+?\\/storage\\/v1\\/object\\/)sign(\\/${STORAGE_BUCKET}\\/[^\\s"'<>\\\\)?#]+)\\?token=[A-Za-z0-9._-]+(?:&[A-Za-z0-9._=%-]*)?`, 'g');

const safeDecode = (s: string): string => { try { return decodeURIComponent(s); } catch { return s; } };

/**
 * Archivos de la firma por enlace (docs/firma-externa-por-enlace.md §4). Los originales, adjuntos y la cuarentena SOLO
 * salen por `GET /signature-requests/:id/file/...`, que valida rol y acceso (revisión de seguridad F5b, 2026-10-19:
 * el interceptor firmaba cualquier ruta que apareciera en una respuesta, p. ej. una pegada en un campo de texto).
 * Lo único que se firma aquí es el PDF sellado que la carta o el papel de entrevista enlazan, y solo si la solicitud es
 * de la organización de quien consulta.
 */
const SIGNATURE_PREFIX = 'signature-requests/';
const SIGNED_PDF_RE = /^signature-requests\/[^/]+\/([0-9a-f-]{36})\/signed\.pdf$/;

/** Ruta "normal" del bucket: sin `..`, sin segmentos vacíos, sin barras invertidas ni barra inicial. */
export function isPlainStoragePath(p: string): boolean {
  return p.length > 0 && !p.startsWith('/') && !p.includes('\\') && p.split('/').every((seg) => seg !== '' && seg !== '.' && seg !== '..');
}

export interface SigningScope {
  /** Organización de quien hace la petición (null en rutas sin sesión). */
  organizationId?: string | null;
}

@Injectable()
export class StorageUrlService {
  private readonly logger = new Logger(StorageUrlService.name);
  private readonly supabase: SupabaseClient;
  private readonly cache = new Map<string, { url: string; at: number }>();

  constructor(private readonly prisma: PrismaService) {
    this.supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  }

  /** Qué rutas de las encontradas en la respuesta se pueden firmar para quien consulta. */
  async allowedPaths(paths: string[], scope: SigningScope): Promise<string[]> {
    const plain = paths.filter(isPlainStoragePath);
    const out = plain.filter((p) => !p.startsWith(SIGNATURE_PREFIX));
    const signedPdfs = plain.filter((p) => SIGNED_PDF_RE.test(p));
    if (signedPdfs.length > 0 && scope.organizationId) {
      const rows = await this.prisma.signatureRequest.findMany({
        where: { organizationId: scope.organizationId, signedPdfPath: { in: signedPdfs } },
        select: { signedPdfPath: true },
      });
      for (const r of rows) if (r.signedPdfPath) out.push(r.signedPdfPath);
    }
    return out;
  }

  // ─── Recorrido de strings (solo objetos planos y arrays) ───────────────────
  // Se ignoran Date, Buffer, Decimal, streams, etc. — cualquier instancia de clase.
  private mapStrings(node: unknown, fn: (s: string) => string, seen: WeakSet<object>): unknown {
    if (typeof node === 'string') return fn(node);
    if (!node || typeof node !== 'object') return node;
    if (seen.has(node as object)) return node;
    if (Array.isArray(node)) {
      seen.add(node);
      for (let i = 0; i < node.length; i++) node[i] = this.mapStrings(node[i], fn, seen);
      return node;
    }
    const proto = Object.getPrototypeOf(node);
    if (proto !== Object.prototype && proto !== null) return node;
    seen.add(node as object);
    const rec = node as Record<string, unknown>;
    for (const k of Object.keys(rec)) rec[k] = this.mapStrings(rec[k], fn, seen);
    return node;
  }

  // ─── Entrada: enlace firmado -> forma canónica ─────────────────────────────
  normalizeInbound<T>(body: T): T {
    return this.mapStrings(
      body,
      (s) => (s.includes(SIGNED_MARK) ? s.replace(SIGNED_RE, '$1public$2') : s),
      new WeakSet(),
    ) as T;
  }

  // ─── Salida: forma canónica -> enlace firmado ──────────────────────────────
  async signResponse<T>(data: T, scope: SigningScope = {}): Promise<T> {
    const paths = new Set<string>();
    this.mapStrings(data, (s) => {
      if (s.includes(PUBLIC_MARK)) for (const m of s.matchAll(PUBLIC_RE)) paths.add(safeDecode(m[1]));
      return s;
    }, new WeakSet());
    if (paths.size === 0) return data;

    const allowed = await this.allowedPaths([...paths], scope);
    if (allowed.length === 0) return data;
    const signed = await this.signPaths(allowed);
    return this.mapStrings(
      data,
      (s) => (s.includes(PUBLIC_MARK)
        ? s.replace(PUBLIC_RE, (full: string, p: string) => signed.get(safeDecode(p)) ?? full)
        : s),
      new WeakSet(),
    ) as T;
  }

  /** Firma una ruta del bucket (uso interno puntual). */
  async signPath(path: string): Promise<string | null> {
    return (await this.signPaths([path])).get(path) ?? null;
  }

  private async signPaths(paths: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const now = Date.now();
    const missing: string[] = [];
    for (const p of paths) {
      const hit = this.cache.get(p);
      if (hit && now - hit.at < CACHE_REUSE_MS) out.set(p, hit.url);
      else missing.push(p);
    }
    for (let i = 0; i < missing.length; i += SIGN_BATCH) {
      const chunk = missing.slice(i, i + SIGN_BATCH);
      try {
        const { data, error } = await this.supabase.storage.from(STORAGE_BUCKET).createSignedUrls(chunk, SIGNED_TTL_SECONDS);
        if (error || !data) { this.logger.warn(`No se pudieron firmar ${chunk.length} URL(s): ${error?.message ?? 'sin datos'}`); continue; }
        for (const row of data) {
          if (row.signedUrl && row.path) {
            out.set(row.path, row.signedUrl);
            if (this.cache.size >= CACHE_MAX_ENTRIES) this.cache.clear();
            this.cache.set(row.path, { url: row.signedUrl, at: now });
          }
        }
      } catch (err) {
        this.logger.warn(`Fallo al firmar URLs de Storage: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return out;
  }
}
