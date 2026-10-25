import { Injectable, Logger } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { PrismaService } from '../../prisma/prisma.service';
import { visibleAuditWhere } from '../utils/investigation-scope.util';

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

/**
 * DUEÑO de cada ruta del bucket (2026-10-25, cierra la limitación de la auditoría de 2026-10-18): una URL en una respuesta
 * solo se firma si la ruta pertenece a un encargo de la organización de quien consulta y que esa persona puede ver (modo
 * investigación incluido). Antes se firmaba CUALQUIER ruta que apareciera en la respuesta, así que quien pegara en un campo de
 * texto la ruta de un archivo de otra organización (o de una investigación ajena) recibía un enlace de descarga.
 * Las familias de rutas son las que genera el propio código al subir (ver cada `.upload(...)`); una ruta que no encaja en
 * ninguna NO se firma (se niega por defecto):
 *   <auditId>/…                              archivos de papeles de expediente
 *   evidence|request-docs|signed-papers|restored/<auditId>/…
 *   sections|docevidence|acct-schedule/<paperId>/…
 *   procedures/<paperId>/<procedureId>/…     y   procedures/steps/<stepId>/…
 */
const ID_SEGMENT = /^[A-Za-z0-9_-]{8,64}$/;
const AUDIT_FAMILIES = new Set(['evidence', 'request-docs', 'signed-papers', 'restored']);
const PAPER_FAMILIES = new Set(['sections', 'docevidence', 'acct-schedule']);

export type PathOwner = { kind: 'audit' | 'paper' | 'step'; id: string };

/** De quién es un archivo del bucket según su ruta, o null si la ruta no es de ninguna familia conocida. */
export function ownerOfPath(path: string): PathOwner | null {
  const seg = path.split('/');
  const [first, second] = seg;
  if (AUDIT_FAMILIES.has(first)) return seg.length >= 3 && ID_SEGMENT.test(second) ? { kind: 'audit', id: second } : null;
  if (PAPER_FAMILIES.has(first)) return seg.length >= 3 && ID_SEGMENT.test(second) ? { kind: 'paper', id: second } : null;
  if (first === 'procedures') {
    if (second === 'steps') return seg.length >= 4 && ID_SEGMENT.test(seg[2]) ? { kind: 'step', id: seg[2] } : null;
    return seg.length >= 4 && ID_SEGMENT.test(second) ? { kind: 'paper', id: second } : null;
  }
  if (first === 'signature-requests') return null; // tiene su propia regla (PDF sellado)
  return seg.length >= 2 && ID_SEGMENT.test(first) ? { kind: 'audit', id: first } : null;
}

/** Ruta "normal" del bucket: sin `..`, sin segmentos vacíos, sin barras invertidas ni barra inicial. */
export function isPlainStoragePath(p: string): boolean {
  return p.length > 0 && !p.startsWith('/') && !p.includes('\\') && p.split('/').every((seg) => seg !== '' && seg !== '.' && seg !== '..');
}

export interface SigningScope {
  /** Organización de quien hace la petición (null en rutas sin sesión). */
  organizationId?: string | null;
  /** Quién es (para el modo investigación). Sin estos dos datos no se firma ningún archivo de un encargo. */
  userId?: string | null;
  role?: string | null;
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
    const out = await this.ownedPaths(plain.filter((p) => !p.startsWith(SIGNATURE_PREFIX)), scope);
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

  /** Las rutas cuyo dueño (encargo, papel o paso) es de la organización del usuario y él puede ver. Una consulta por tipo de dueño. */
  private async ownedPaths(paths: string[], scope: SigningScope): Promise<string[]> {
    if (paths.length === 0 || !scope.organizationId || !scope.userId || !scope.role) return [];
    const viewer = { id: scope.userId, role: scope.role, organizationId: scope.organizationId };
    const visible = visibleAuditWhere(viewer);
    const owners = new Map<string, PathOwner>();
    for (const p of paths) { const o = ownerOfPath(p); if (o) owners.set(p, o); }
    const idsOf = (kind: PathOwner['kind']) => [...new Set([...owners.values()].filter((o) => o.kind === kind).map((o) => o.id))];

    const [audits, papers, steps] = await Promise.all([
      idsOf('audit').length === 0 ? [] : this.prisma.audit.findMany({ where: { id: { in: idsOf('audit') }, ...visible }, select: { id: true } }),
      idsOf('paper').length === 0 ? [] : this.prisma.workingPaper.findMany({ where: { id: { in: idsOf('paper') }, audit: visible }, select: { id: true } }),
      idsOf('step').length === 0 ? [] : this.prisma.auditStep.findMany({ where: { id: { in: idsOf('step') }, procedure: { section: { paper: { audit: visible } } } }, select: { id: true } }),
    ]);
    const okAudit = new Set(audits.map((a) => a.id));
    const okPaper = new Set(papers.map((a) => a.id));
    const okStep = new Set(steps.map((a) => a.id));
    return paths.filter((p) => {
      const o = owners.get(p);
      return !!o && (o.kind === 'audit' ? okAudit : o.kind === 'paper' ? okPaper : okStep).has(o.id);
    });
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
