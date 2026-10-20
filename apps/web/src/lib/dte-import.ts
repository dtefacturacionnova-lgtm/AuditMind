/**
 * Importación de archivos JSON de DTE (uno por archivo, o un arreglo por archivo) hacia el motor «Validación DTE». Funciones puras:
 * el componente `DteJsonUpload` lee los bytes del navegador y los pasa aquí.
 *
 * Acepta las dos versiones del documento (V1 y V2.0), las descargas del portal del MH (con `responseMH` en la raíz) y los defectos de
 * formato que `parseDteJson` sabe reparar (BOM, texto sobrante, objeto sin nombre, Latin-1). Lo reparado se informa, no se oculta.
 */

import { decodeDteBytes, parseDteJson } from './dte-json';
import { detectDteVersion, isConfirmedV1 } from './dte-version';

export interface DteFileResult {
  name: string;
  records: Record<string, unknown>[];
  /** Documentos del archivo según la versión que usará el motor: V1 confirmada vs. el resto (que se valida como V2.0). */
  v1: number;
  v2: number;
  /** Defectos de formato que se corrigieron al leer el archivo. */
  repairs: string[];
  /** Elementos del archivo que no tenían bloque `identificacion` y no se enviaron. */
  omittedItems: number;
  /** Si se omitió el archivo completo, por qué. */
  skipped?: string;
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Un DTE siempre trae el bloque `identificacion`; lo que no lo trae no es un documento (puede ser un evento, un catálogo, otra cosa). */
const looksLikeDte = (v: unknown): v is Record<string, unknown> => isObject(v) && isObject(v.identificacion);

export function parseDteFile(name: string, bytes: Uint8Array): DteFileResult {
  const empty: DteFileResult = { name, records: [], v1: 0, v2: 0, repairs: [], omittedItems: 0 };
  const { text, latin1 } = decodeDteBytes(bytes);
  const repairs = latin1 ? ['codificación Latin-1 (el archivo no era UTF-8)'] : [];

  let raw: unknown;
  try {
    const parsed = parseDteJson(text);
    raw = parsed.value;
    repairs.push(...parsed.repairs);
  } catch {
    return { ...empty, skipped: 'no es un JSON válido' };
  }

  const items = Array.isArray(raw) ? raw : [raw];
  const records = items.filter(looksLikeDte);
  if (records.length === 0) return { ...empty, repairs, skipped: 'no contiene ningún DTE (falta el bloque identificacion)' };   // ya se lista como archivo omitido: sus elementos no se cuentan otra vez

  let v1 = 0;
  for (const r of records) if (isConfirmedV1(detectDteVersion(r))) v1++;
  return { name, records, v1, v2: records.length - v1, repairs, omittedItems: items.length - records.length };
}

export interface DteImportSummary {
  records: Record<string, unknown>[];
  files: DteFileResult[];
  skipped: DteFileResult[];
  repaired: DteFileResult[];
  totals: { documents: number; v1: number; v2: number; omittedItems: number };
}

export function summarizeImport(results: DteFileResult[]): DteImportSummary {
  const files = results.filter((r) => !r.skipped);
  const records: Record<string, unknown>[] = [];
  for (const f of files) for (const r of f.records) records.push(r);
  return {
    records,
    files,
    skipped: results.filter((r) => r.skipped),
    repaired: files.filter((f) => f.repairs.length > 0),
    totals: {
      documents: records.length,
      v1: files.reduce((s, f) => s + f.v1, 0),
      v2: files.reduce((s, f) => s + f.v2, 0),
      omittedItems: results.reduce((s, f) => s + f.omittedItems, 0),
    },
  };
}
