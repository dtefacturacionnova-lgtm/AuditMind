/**
 * Versión del esquema de un DTE (V1 o V2.0, normativa del MH de mayo de 2026). Funciones puras.
 *
 * Copiado de dtes-y-analítica-sv (src/lib/dte-version.ts), donde se probó con documentos reales de ambas versiones. Es el MISMO criterio
 * que usa el validador del servicio de IA (`app/services/caats/dte_versions.py`): la pantalla de importación lo muestra y el motor lo aplica.
 *
 * Cada tipo de documento tiene su propia versión de esquema, y la V2.0 cambió la de todos (`identificacion.version`):
 * FE 1 → 2, CCF 3 → 4, NR 3 → 4, NC 3 → 4, ND 3 → 4, CR 1 → 2, CL 1 → 2, DCL 1 → 2, FEX 1 → 3, FSE 1 → 2, CD 1 → 2.
 * El MH valida ese número contra el esquema, así que un documento V2.0 siempre trae el exacto de su tipo. Por eso es la señal
 * principal; la dirección con `distrito` (campo nuevo de la V2.0, CAT-008) es la de apoyo. El sello en la raíz del JSON no se usa
 * como señal: no es fiable (también puede venir en documentos V1).
 */

export type DteVersion = 'v1' | 'v2';

export interface VersionDetection {
  version: DteVersion;
  reason: 'version_exacta_v2' | 'version_exacta_v1' | 'distrito' | 'sin_senales' | 'no_es_objeto';
  confidence: 'high' | 'medium' | 'low';
}

/** `identificacion.version` de cada tipo en la V2.0 (esquemas oficiales `svfe-json-schemas`). */
export const V2_VERSION_BY_TIPO: Record<string, number> = {
  '01': 2, '03': 4, '04': 4, '05': 4, '06': 4, '07': 2, '08': 2, '09': 2, '11': 3, '14': 2, '15': 2,
};

/** `identificacion.version` de cada tipo en la V1 (la normativa anterior). */
export const V1_VERSION_BY_TIPO: Record<string, number> = {
  '01': 1, '03': 3, '04': 3, '05': 3, '06': 3, '07': 1, '08': 1, '09': 1, '11': 1, '14': 1, '15': 1,
};

const text = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined);

export function detectDteVersion(json: any): VersionDetection {
  if (!json || typeof json !== 'object') return { version: 'v1', reason: 'no_es_objeto', confidence: 'low' };
  const tipo = String(json.identificacion?.tipoDte ?? '');
  const version = Number(json.identificacion?.version);
  if (Number.isFinite(version)) {
    if (V2_VERSION_BY_TIPO[tipo] === version) return { version: 'v2', reason: 'version_exacta_v2', confidence: 'high' };
    if (V1_VERSION_BY_TIPO[tipo] === version) return { version: 'v1', reason: 'version_exacta_v1', confidence: 'high' };
  }
  if (text(json.emisor?.direccion?.distrito) || text(json.receptor?.direccion?.distrito)) {
    return { version: 'v2', reason: 'distrito', confidence: 'medium' };
  }
  return { version: 'v1', reason: 'sin_senales', confidence: 'low' };
}

/** V1 confirmada: el documento trae el número de versión V1 exacto de su tipo (lo que el motor trata como V1; el resto se valida como V2.0). */
export function isConfirmedV1(d: VersionDetection): boolean {
  return d.version === 'v1' && d.reason === 'version_exacta_v1';
}
