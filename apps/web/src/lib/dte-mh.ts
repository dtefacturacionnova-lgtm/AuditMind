/**
 * Confirmación de un lote de DTE con la consulta pública del Ministerio de Hacienda, desde el navegador. Funciones puras (el envío al
 * servidor se inyecta): la consulta la hace el servicio de IA (`apps/ai-service/app/services/caats/dte_mh.py`), de a un documento con una
 * pausa para no provocar el límite (429) del MH, y por eso aquí el lote se reparte en tandas de MAX_LOTE_MH — una sola petición con todo se
 * pasaría del tiempo que aguantan nginx y la API. Al final se manda el lote completo al motor «Validación DTE» junto con las respuestas de
 * Hacienda (`mh_consultas`) y el informe sale con los hallazgos de la consulta mezclados con los demás.
 */

/** Lo que admite el servicio por llamada. */
export const MAX_LOTE_MH = 25;
/** Tope de documentos por corrida desde la pantalla (≈ 1 s por documento: 300 son unos 5 minutos). */
export const MAX_DOCS_MH = 300;
const SEGUNDOS_POR_DOCUMENTO = 1;

export const ERROR_CONEXION_MH = 'Error de conexión MH';

export interface DteParaMh {
  identificacion: { codigoGeneracion: string; fecEmi: string; ambiente: string };
}

export interface ConsultaMh {
  codigo_generacion: string;
  estado: string;
  [campo: string]: unknown;
}

const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** De un DTE solo viaja lo que la consulta necesita: el código de generación, la fecha de emisión y el ambiente. */
export function reducirParaMh(dte: Record<string, unknown>): DteParaMh | null {
  const iden = (dte?.identificacion ?? {}) as Record<string, unknown>;
  const codigoGeneracion = texto(iden.codigoGeneracion);
  if (!codigoGeneracion) return null;
  return { identificacion: { codigoGeneracion, fecEmi: texto(iden.fecEmi), ambiente: texto(iden.ambiente) } };
}

/** Los documentos a consultar, sin repetir (el mismo código consultado dos veces sería gastar el límite del MH) y en tandas del tamaño que admite el servicio. */
export function lotesParaMh(records: Record<string, unknown>[], size = MAX_LOTE_MH): { total: number; lotes: DteParaMh[][] } {
  const vistos = new Set<string>();
  const unicos: DteParaMh[] = [];
  for (const r of records) {
    const d = reducirParaMh(r);
    const key = d?.identificacion.codigoGeneracion.toUpperCase();
    if (d && key && !vistos.has(key)) { vistos.add(key); unicos.push(d); }
  }
  const lotes: DteParaMh[][] = [];
  for (let i = 0; i < unicos.length; i += size) lotes.push(unicos.slice(i, i + size));
  return { total: unicos.length, lotes };
}

/** Cuántos documentos se consultarían (sin repetidos ni sin código) y cuánto tardaría, en minutos redondeados hacia arriba. */
export function estimarConsulta(records: Record<string, unknown>[]): { documentos: number; minutos: number; excedeTope: boolean } {
  const { total } = lotesParaMh(records);
  return { documentos: total, minutos: Math.max(1, Math.ceil((total * SEGUNDOS_POR_DOCUMENTO) / 60)), excedeTope: total > MAX_DOCS_MH };
}

export type EnviarAlServidor = (path: string, body: unknown) => Promise<unknown>;

export interface OpcionesValidacion {
  consultarMh: boolean;
  post: EnviarAlServidor;
  /** Avance de la consulta a Hacienda: documentos ya consultados de los que hay en total. */
  onProgreso?: (hecho: number, total: number) => void;
}

/**
 * Corre «Validación DTE». Sin `consultarMh` es la misma llamada de siempre. Con ella, antes consulta a Hacienda tanda por tanda: una tanda
 * que falla (red, tiempo) deja a sus documentos como «Error de conexión MH» —el informe los marca como no confirmados y la auditoría
 * sigue—, pero si fallan TODAS se detiene con el error, porque entonces el problema no es de los documentos (sesión vencida, servicio caído).
 */
export async function ejecutarValidacionDte(records: Record<string, unknown>[], opciones: OpcionesValidacion): Promise<Record<string, unknown>> {
  const { consultarMh, post, onProgreso } = opciones;
  if (!consultarMh) return (await post('/ai/analytics/dte_validation', { records })) as Record<string, unknown>;

  const { total, lotes } = lotesParaMh(records);
  if (total > MAX_DOCS_MH) throw new Error(`La consulta a Hacienda admite hasta ${MAX_DOCS_MH} documentos por corrida y el lote tiene ${total}. Divídelo o ejecuta el análisis sin la consulta.`);

  const consultas: ConsultaMh[] = [];
  let fallidas = 0;
  let ultimoError: unknown;
  let hecho = 0;
  onProgreso?.(0, total);
  for (const lote of lotes) {
    try {
      const resp = (await post('/ai/analytics/dte_mh', { records: lote })) as { consultas?: ConsultaMh[] } | undefined;
      if (!Array.isArray(resp?.consultas)) throw new Error('Respuesta inesperada de la consulta a Hacienda');
      consultas.push(...resp.consultas);
    } catch (err) {
      fallidas++;
      ultimoError = err;
      for (const d of lote) consultas.push({ codigo_generacion: d.identificacion.codigoGeneracion, estado: ERROR_CONEXION_MH });
    }
    hecho += lote.length;
    onProgreso?.(hecho, total);
  }
  if (lotes.length > 0 && fallidas === lotes.length) {
    throw new Error(`No se pudo consultar a Hacienda: ${ultimoError instanceof Error ? ultimoError.message : 'error desconocido'}`);
  }
  return (await post('/ai/analytics/dte_validation', { records, mh_consultas: consultas })) as Record<string, unknown>;
}
