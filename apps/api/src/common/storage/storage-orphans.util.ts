import { ownerOfPath } from './storage-url.service';

/**
 * Archivos huérfanos del bucket `audit-files` (lote C de la revisión de 2026-10-25).
 *
 * Una fila que se borra (papel, procedimiento, paso, encargo) NO borra los archivos que colgaban de ella en Supabase Storage, así
 * que quedaban carpetas cuyo dueño ya no existe. Este módulo decide, sin tocar nada, qué archivos son de qué dueño y cuáles dueños
 * ya no existen. Es deliberadamente PRUDENTE: solo es «huérfano» el archivo cuya ruta nombra a un dueño con forma de id de la base
 * (cuid) que consultado ya no existe. Todo lo demás (carpetas con otro nombre, rutas que no encajan en ninguna familia) va a
 * `unknown` para que una persona lo mire; nunca se mueve ni se borra solo.
 */
export type OwnerKind = 'audit' | 'paper' | 'step';

export interface OwnedFiles { kind: OwnerKind; id: string; files: string[] }

export interface OrphanReport {
  totalFiles: number;
  /** Archivos cuyo dueño existe (o no se pudo comprobar): no se tocan. */
  keptFiles: number;
  /** Dueños inexistentes con todos los archivos que les quedan. */
  orphans: OwnedFiles[];
  /** Rutas que no encajan en una familia conocida o cuyo «dueño» no tiene forma de id: solo informativas. */
  unknown: string[];
}

/** Forma de un id de la base (cuid de Prisma). Un nombre de carpeta que no la tenga nunca se trata como dueño inexistente. */
const CUID = /^c[a-z0-9]{20,30}$/;
const ID_SEGMENT = /^[A-Za-z0-9_-]{8,64}$/;

/** Dueño de una ruta. Añade a `ownerOfPath` la familia de la firma por enlace: `signature-requests/<encargo>/<solicitud>/…`. */
export function ownerOfStoredPath(path: string): { kind: OwnerKind; id: string } | null {
  const seg = path.split('/');
  if (seg[0] === 'signature-requests') return seg.length >= 4 && ID_SEGMENT.test(seg[1]) ? { kind: 'audit', id: seg[1] } : null;
  return ownerOfPath(path);
}

/** Reparte las rutas por dueño. Las que no tienen dueño reconocible (o su dueño no es un id de la base) quedan aparte. */
export function groupByOwner(paths: string[]): { owned: Map<string, OwnedFiles>; unknown: string[] } {
  const owned = new Map<string, OwnedFiles>();
  const unknown: string[] = [];
  for (const path of paths) {
    const owner = ownerOfStoredPath(path);
    if (!owner || !CUID.test(owner.id)) { unknown.push(path); continue; }
    const key = `${owner.kind}:${owner.id}`;
    const entry = owned.get(key) ?? { kind: owner.kind, id: owner.id, files: [] };
    entry.files.push(path);
    owned.set(key, entry);
  }
  return { owned, unknown };
}

/**
 * Informe de huérfanos. `existing` trae, por tipo de dueño, los ids que SÍ existen en la base entre los que se consultaron; un tipo
 * ausente de `existing` significa «no se pudo comprobar» y sus archivos se conservan (nunca se declara huérfano lo que no se verificó).
 */
export function buildOrphanReport(paths: string[], existing: Partial<Record<OwnerKind, Set<string>>>): OrphanReport {
  const { owned, unknown } = groupByOwner(paths);
  const orphans: OwnedFiles[] = [];
  let kept = 0;
  for (const entry of owned.values()) {
    const alive = existing[entry.kind];
    if (alive && !alive.has(entry.id)) orphans.push(entry);
    else kept += entry.files.length;
  }
  orphans.sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
  return { totalFiles: paths.length, keptFiles: kept, orphans, unknown };
}

/** Carpeta de cuarentena: los huérfanos se MUEVEN aquí (no se borran) y se pueden devolver a su ruta original. */
export const QUARANTINE_ROOT = '_orphans-quarantine';
export const quarantinePathOf = (path: string, day: string) => `${QUARANTINE_ROOT}/${day}/${path}`;
