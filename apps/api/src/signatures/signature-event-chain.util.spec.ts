import { buildNextEvent, canonicalJson, ChainEvent, computeEventHash, genesisHash, verifyChain } from './signature-event-chain.util';

const T0 = new Date('2026-10-18T12:00:00.000Z');

function chain(requestId: string, n: number): ChainEvent[] {
  const out: ChainEvent[] = [];
  for (let i = 0; i < n; i++) {
    out.push(buildNextEvent(requestId, out.length ? out[out.length - 1] : null, {
      type: i === n - 1 ? 'SIGNED' : 'CREATED',
      at: new Date(T0.getTime() + i * 1000),
      ip: '203.0.113.7',
      userAgent: 'Mozilla/5.0',
      actorId: null,
      detail: { paso: i, nombre: 'Ana' },
    }));
  }
  return out;
}

describe('canonicalJson', () => {
  it('ordena claves y no deja espacios', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, { z: 1, y: 2 }] } })).toBe('{"a":{"c":[3,{"y":2,"z":1}],"d":2},"b":1}');
  });
  it('trata null y undefined igual, y omite claves undefined', () => {
    expect(canonicalJson(undefined)).toBe('null');
    expect(canonicalJson(null)).toBe('null');
    expect(canonicalJson({ a: undefined, b: 1 })).toBe('{"b":1}');
  });
  it('serializa fechas en ISO', () => {
    expect(canonicalJson({ d: T0 })).toBe('{"d":"2026-10-18T12:00:00.000Z"}');
  });
});

describe('bitácora encadenada', () => {
  it('una cadena íntegra verifica y devuelve la cabeza', () => {
    const ev = chain('req1', 5);
    const v = verifyChain('req1', ev);
    expect(v.ok).toBe(true);
    expect(v.headHash).toBe(ev[4].hash);
    expect(ev[0].prevHash).toBe(genesisHash('req1'));
  });

  it('una cadena vacía es válida y no tiene cabeza', () => {
    expect(verifyChain('req1', [])).toEqual({ ok: true, headHash: null });
  });

  it('editar el contenido de un evento rompe la cadena en ese evento', () => {
    const ev = chain('req1', 5);
    ev[2] = { ...ev[2], detail: { paso: 2, nombre: 'Otra persona' } };
    const v = verifyChain('req1', ev);
    expect(v.ok).toBe(false);
    expect(v.brokenAtSeq).toBe(3);
  });

  it('cambiar la IP de un evento se detecta', () => {
    const ev = chain('req1', 3);
    ev[1] = { ...ev[1], ip: '198.51.100.9' };
    expect(verifyChain('req1', ev).ok).toBe(false);
  });

  it('borrar un evento intermedio se detecta', () => {
    const ev = chain('req1', 5);
    ev.splice(2, 1);
    const v = verifyChain('req1', ev);
    expect(v.ok).toBe(false);
    expect(v.brokenAtSeq).toBe(3);
  });

  it('reordenar eventos se detecta', () => {
    const ev = chain('req1', 4);
    [ev[1], ev[2]] = [ev[2], ev[1]];
    expect(verifyChain('req1', ev).ok).toBe(false);
  });

  it('recalcular el hash de un evento alterado sin rehacer los siguientes también se detecta', () => {
    const ev = chain('req1', 4);
    const tampered = { ...ev[1], detail: { paso: 99 } };
    tampered.hash = computeEventHash(tampered.prevHash, tampered);
    ev[1] = tampered;
    const v = verifyChain('req1', ev);
    expect(v.ok).toBe(false);
    expect(v.brokenAtSeq).toBe(3); // el evento 3 apunta al hash viejo del 2
  });

  it('una cadena de otra solicitud no verifica contra esta', () => {
    expect(verifyChain('req2', chain('req1', 3)).ok).toBe(false);
  });

  it('la cabeza cambia si cambia cualquier evento (sirve como huella en el PDF sellado)', () => {
    const a = verifyChain('req1', chain('req1', 4)).headHash;
    const b = verifyChain('req1', chain('req1', 5)).headHash;
    expect(a).not.toEqual(b);
  });
});
