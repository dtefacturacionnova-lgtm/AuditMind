import type { CellValue } from 'exceljs';
import { ExcelFormatoCelda, ExcelValorCelda, ExcelAdvertencia } from './excel-template.types';

/**
 * Utilidades puras de direcciones A1 y saneamiento de valores de celda.
 * Aisladas del servicio principal porque el saneamiento (`sanearValorCelda`)
 * es control de seguridad #3 del diseño (§3.1.3): nada de lo que ExcelJS
 * entrega sale de aquí sin pasar por esta función.
 */

// ─── Direcciones A1 ──────────────────────────────────────────────────────────

export function colToNum(letras: string): number {
  let n = 0;
  for (const ch of letras.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

export function numToCol(n: number): string {
  let s = '';
  let x = n;
  while (x > 0) {
    const rem = (x - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

const CELDA_RE = /^\$?([A-Za-z]+)\$?(\d+)$/;

/** Parsea una dirección de celda simple ('B6', '$B$6') a {col, row} 1-indexado. */
export function parseCelda(addr: string): { col: number; row: number } {
  const m = CELDA_RE.exec(addr.trim());
  if (!m) throw new Error(`Dirección de celda inválida: '${addr}'`);
  return { col: colToNum(m[1]), row: parseInt(m[2], 10) };
}

/** Arma el literal `'Hoja'!$B$6:$E$45` que espera `workbook.definedNames.add()`. */
export function rangoA1(
  hoja: string, colDesde: number, filaDesde: number, colHasta: number, filaHasta: number,
): string {
  const ini = `$${numToCol(colDesde)}$${filaDesde}`;
  const fin = `$${numToCol(colHasta)}$${filaHasta}`;
  return ini === fin ? `'${hoja}'!${ini}` : `'${hoja}'!${ini}:${fin}`;
}

export interface RangoParseado {
  hoja: string;
  colDesde: number; filaDesde: number;
  colHasta: number; filaHasta: number;
}

const RANGO_RE = /^(?:'([^']+)'|([^!']+))!\$?([A-Za-z]+)\$?(\d+)(?::\$?([A-Za-z]+)\$?(\d+))?$/;

/** Parsea un string de rango tal como lo devuelve `definedNames.getRanges()`. */
export function parseRangoDefinido(rangoStr: string): RangoParseado | null {
  const m = RANGO_RE.exec(rangoStr.trim());
  if (!m) return null;
  const hoja = m[1] ?? m[2];
  const colDesde = colToNum(m[3]);
  const filaDesde = parseInt(m[4], 10);
  const colHasta = m[5] ? colToNum(m[5]) : colDesde;
  const filaHasta = m[6] ? parseInt(m[6], 10) : filaDesde;
  return { hoja, colDesde, filaDesde, colHasta, filaHasta };
}

// ─── Saneamiento de valores (control de seguridad #3) ───────────────────────

/**
 * Reduce cualquier `CellValue` de ExcelJS a un primitivo confiable:
 * fórmulas → su resultado cacheado (nunca la expresión), rich text → texto
 * plano, hipervínculos → su texto visible (la URL se descarta), errores →
 * `null` + advertencia. Nunca lanza — cualquier forma no reconocida se trata
 * como vacía y se deja constancia en `advertencias`.
 */
export function sanearValorCelda(
  raw: CellValue,
  rangoNombre: string,
  celda: string,
  advertencias: ExcelAdvertencia[],
): ExcelValorCelda {
  if (raw === null || raw === undefined) return null;
  if (raw instanceof Date) return raw;
  if (typeof raw === 'number' || typeof raw === 'string' || typeof raw === 'boolean') return raw;

  if (typeof raw === 'object') {
    if ('error' in raw) {
      advertencias.push({
        rangoNombre, celda,
        mensaje: `La celda contenía un error de fórmula (${raw.error}) — se guardó como vacío`,
      });
      return null;
    }
    if ('richText' in raw) {
      return raw.richText.map(r => r.text).join('');
    }
    if ('hyperlink' in raw) {
      // La URL se descarta a propósito: nunca se persiste un enlace controlado
      // por el archivo subido (ver §3.1.3, control #3).
      return raw.text ?? null;
    }
    if ('formula' in raw) {
      const result = raw.result;
      if (result && typeof result === 'object' && 'error' in result) {
        advertencias.push({
          rangoNombre, celda,
          mensaje: `La fórmula de la celda resultó en error (${result.error}) — se guardó como vacío`,
        });
        return null;
      }
      // Solo el resultado cacheado — la expresión de la fórmula nunca se lee ni se ejecuta.
      return sanearValorCelda(result ?? null, rangoNombre, celda, advertencias);
    }
  }

  advertencias.push({ rangoNombre, celda, mensaje: 'Tipo de celda no reconocido — se guardó como vacío' });
  return null;
}

/** Coerción best-effort al tipo declarado por la columna/rango (§ contrato EXC-01). */
export function coaccionarPorFormato(
  valor: ExcelValorCelda,
  formato?: ExcelFormatoCelda,
): ExcelValorCelda {
  if (valor === null || !formato) return valor;

  switch (formato) {
    case 'ENTERO':
    case 'NUMERO':
    case 'MONEDA':
    case 'PORCENTAJE': {
      if (typeof valor === 'number') return valor;
      const n = parseFloat(String(valor).replace(/[^\d.-]/g, ''));
      return Number.isFinite(n) ? n : null;
    }
    case 'FECHA': {
      if (valor instanceof Date) return valor;
      const d = new Date(String(valor));
      return Number.isNaN(d.getTime()) ? null : d;
    }
    case 'BOOLEANO': {
      if (typeof valor === 'boolean') return valor;
      const s = String(valor).trim().toLowerCase();
      if (['sí', 'si', 'true', 'yes', 'x'].includes(s)) return true;
      if (['no', 'false'].includes(s)) return false;
      return null;
    }
    case 'TEXTO':
    default:
      return typeof valor === 'string' ? valor : String(valor);
  }
}

/** Formato numérico de Excel (`numFmt`) por defecto para cada `ExcelFormatoCelda`. */
export function numFmtPorFormato(formato?: ExcelFormatoCelda): string | undefined {
  switch (formato) {
    case 'ENTERO':     return '#,##0';
    case 'NUMERO':     return '#,##0.00';
    case 'MONEDA':     return '$#,##0.00;($#,##0.00)';
    case 'PORCENTAJE': return '0.00%';
    case 'FECHA':      return 'dd/mm/yyyy';
    case 'TEXTO':      return '@';
    default:           return undefined;
  }
}
