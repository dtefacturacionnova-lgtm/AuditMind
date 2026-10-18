import { sha256Hex } from './signature-crypto.util';

/**
 * Bitácora encadenada por hash (docs/firma-externa-por-enlace.md §8).
 * Cada evento incluye el hash del anterior: editar o borrar un evento en la BD
 * rompe la cadena, y la cabeza impresa en el PDF sellado deja de coincidir.
 */

/** JSON con claves ordenadas y sin espacios: la misma entrada da siempre la misma cadena. */
export function canonicalJson(value: unknown): string {
  const normalize = (v: unknown): unknown => {
    if (v instanceof Date) return v.toISOString();
    if (Array.isArray(v)) return v.map(normalize);
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v as Record<string, unknown>).sort()) {
        const item = (v as Record<string, unknown>)[k];
        if (item !== undefined) out[k] = normalize(item);
      }
      return out;
    }
    return v;
  };
  return JSON.stringify(normalize(value ?? null));
}

export interface ChainEvent {
  seq: number;
  type: string;
  at: Date;
  ip?: string | null;
  userAgent?: string | null;
  actorId?: string | null;
  detail?: unknown;
  prevHash: string;
  hash: string;
}

/** `prevHash` del evento 1 de cada solicitud. */
export const genesisHash = (requestId: string): string => sha256Hex(`signature-request:${requestId}`);

export function computeEventHash(
  prevHash: string,
  ev: Pick<ChainEvent, 'seq' | 'type' | 'at' | 'ip' | 'userAgent' | 'actorId' | 'detail'>,
): string {
  return sha256Hex(
    [
      prevHash,
      String(ev.seq),
      ev.type,
      ev.at.toISOString(),
      ev.ip ?? '',
      ev.userAgent ?? '',
      ev.actorId ?? '',
      canonicalJson(ev.detail ?? null),
    ].join('|'),
  );
}

/** Construye el siguiente evento de la cadena (lo usa el servicio dentro de la transacción). */
export function buildNextEvent(
  requestId: string,
  last: { seq: number; hash: string } | null,
  ev: Omit<ChainEvent, 'seq' | 'prevHash' | 'hash'>,
): ChainEvent {
  const seq = (last?.seq ?? 0) + 1;
  const prevHash = last?.hash ?? genesisHash(requestId);
  const full = { ...ev, seq, prevHash, hash: '' };
  full.hash = computeEventHash(prevHash, full);
  return full;
}

export interface ChainVerification {
  ok: boolean;
  headHash: string | null;
  brokenAtSeq?: number;
  reason?: string;
}

/** Recalcula toda la cadena. Los eventos deben venir ordenados por `seq`. */
export function verifyChain(requestId: string, events: ChainEvent[]): ChainVerification {
  let prev = genesisHash(requestId);
  let expectedSeq = 1;
  for (const ev of events) {
    if (ev.seq !== expectedSeq) {
      return { ok: false, headHash: null, brokenAtSeq: expectedSeq, reason: 'Falta un evento o la numeración está alterada' };
    }
    if (ev.prevHash !== prev) {
      return { ok: false, headHash: null, brokenAtSeq: ev.seq, reason: 'El enlace con el evento anterior no coincide' };
    }
    if (computeEventHash(prev, ev) !== ev.hash) {
      return { ok: false, headHash: null, brokenAtSeq: ev.seq, reason: 'El contenido del evento fue alterado' };
    }
    prev = ev.hash;
    expectedSeq++;
  }
  return { ok: true, headHash: events.length ? prev : null };
}
