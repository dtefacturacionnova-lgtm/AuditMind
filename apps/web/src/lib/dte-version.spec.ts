import { detectDteVersion, isConfirmedV1, V1_VERSION_BY_TIPO, V2_VERSION_BY_TIPO } from './dte-version';

const doc = (tipoDte: string, version?: unknown, extra: Record<string, unknown> = {}) => ({ identificacion: { tipoDte, ...(version === undefined ? {} : { version }) }, ...extra });

describe('detectDteVersion', () => {
  it('cada tipo se reconoce por la versión exacta de su esquema, en V1 y en V2.0', () => {
    for (const [tipo, v] of Object.entries(V2_VERSION_BY_TIPO)) expect(detectDteVersion(doc(tipo, v))).toEqual({ version: 'v2', reason: 'version_exacta_v2', confidence: 'high' });
    for (const [tipo, v] of Object.entries(V1_VERSION_BY_TIPO)) expect(detectDteVersion(doc(tipo, v))).toEqual({ version: 'v1', reason: 'version_exacta_v1', confidence: 'high' });
  });

  it('el mismo número es de una versión u otra según el tipo (la «3» es V1 del CCF y V2.0 de la exportación)', () => {
    expect(detectDteVersion(doc('03', 3)).version).toBe('v1');
    expect(detectDteVersion(doc('11', 3)).version).toBe('v2');
    expect(detectDteVersion(doc('03', 4)).version).toBe('v2');
  });

  it('un número que no es el de ninguna versión se apoya en el distrito; sin él es V1 con confianza baja', () => {
    expect(detectDteVersion(doc('01', 9, { emisor: { direccion: { distrito: '01' } } }))).toEqual({ version: 'v2', reason: 'distrito', confidence: 'medium' });
    expect(detectDteVersion(doc('01', 9, { receptor: { direccion: { distrito: '05' } } })).reason).toBe('distrito');
    expect(detectDteVersion(doc('01'))).toEqual({ version: 'v1', reason: 'sin_senales', confidence: 'low' });
  });

  it('lo que no es un documento no rompe', () => {
    for (const raro of [null, undefined, 'texto', 5]) expect(detectDteVersion(raro).reason).toBe('no_es_objeto');
  });
});

describe('isConfirmedV1', () => {
  it('solo es V1 confirmada la que trae el número exacto de su tipo', () => {
    expect(isConfirmedV1(detectDteVersion(doc('01', 1)))).toBe(true);
    expect(isConfirmedV1(detectDteVersion(doc('03', 3)))).toBe(true);
    expect(isConfirmedV1(detectDteVersion(doc('01')))).toBe(false);          // sin señales: el motor lo valida como V2.0
    expect(isConfirmedV1(detectDteVersion(doc('01', 9)))).toBe(false);
    expect(isConfirmedV1(detectDteVersion(doc('01', 2)))).toBe(false);
  });
});
