import { FieldType } from '@prisma/client';
import { SectionTemplate } from '../dto/paper-section.dto';
import {
  ExcelTemplateDef, ExcelColumnaDef, ExcelFormatoCelda, ExcelOrigenBinding,
  EXCEL_MISMO_PAPEL,
} from './excel-template.types';

/**
 * Plantilla Excel genérica (EXC-24, §5.5 del documento de diseño) — a
 * diferencia de las 6 plantillas del catálogo (`*.template.ts`, cada una
 * escrita a mano para un papel/sección concretos), esta construye el
 * `ExcelTemplateDef` EN TIEMPO DE EJECUCIÓN a partir de lo que
 * `PAPER_TEMPLATES[paperCode]` ya declara — no hace falta escribir una
 * plantilla nueva por cada papel que un auditor quiera trabajar fuera de
 * línea.
 *
 * Alcance: solo cubre los `fieldType` "simples" (~93% de las 526 secciones
 * del sistema al contarlas — ver §5.5 del documento): MATRIX se traduce a
 * TABLA, los escalares (TEXTAREA/TEXT/CURRENCY/BOOLEAN/ENUM_SELECT/DATE/
 * PERCENTAGE) a ESCALAR. El resto (ACCOUNT_SCHEDULE, CHECKLIST, FLOWCHART,
 * SAMPLE_ITEM_REGISTER, etc.) ya tiene su propio panel interactivo en
 * pantalla y queda fuera a propósito — son flujos de trabajo, no tablas
 * planas, y forzarlos a un Excel genérico perdería su lógica real.
 *
 * Diferencia deliberada con las 6 plantillas de negocio: aquí NINGUNA
 * columna es CONTROLADA — no hay forma genérica de saber qué campo de un
 * papel arbitrario "pertenece a la app" vs. "lo escribe el auditor" (esa
 * distinción es justamente lo que sí sabían las plantillas hechas a mano).
 * El modo de escritura es REEMPLAZA implícito (sin `transformacion`): el
 * motor ya hace exactamente eso por defecto, que además es el mismo
 * comportamiento que tiene hoy editar la grilla en pantalla — no es menos
 * seguro, es el mismo modelo mental que ya usa el auditor.
 */

// ─── Elegibilidad ────────────────────────────────────────────────────────────

const FORMATO_POR_FIELD_TYPE: Partial<Record<FieldType, ExcelFormatoCelda>> = {
  [FieldType.TEXTAREA]:    'TEXTO',
  [FieldType.TEXT]:        'TEXTO',
  [FieldType.CURRENCY]:    'MONEDA',
  [FieldType.PERCENTAGE]:  'PORCENTAJE',
  [FieldType.BOOLEAN]:     'BOOLEANO',
  [FieldType.DATE]:        'FECHA',
  [FieldType.ENUM_SELECT]: 'TEXTO',
  [FieldType.NUMBER]:      'NUMERO',
};

const ESCALARES_ELEGIBLES = new Set<FieldType>(Object.keys(FORMATO_POR_FIELD_TYPE) as FieldType[]);

export function esFieldTypeElegible(fieldType: FieldType): boolean {
  return fieldType === FieldType.MATRIX || ESCALARES_ELEGIBLES.has(fieldType);
}

// ─── Inferencia de columnas para secciones MATRIX ───────────────────────────

/**
 * Casi todos los `aiHint` de `paper-templates.ts` empiezan con
 * "Columnas: A | B | C ..." (convención seguida en las 526 secciones del
 * sistema, confirmado al contarlas para el documento de diseño) — se
 * aprovecha como bootstrap para una sección MATRIX que todavía no tiene
 * ninguna fila real de la que inferir columnas.
 */
function parseColumnasDeAiHint(aiHint?: string): string[] | null {
  if (!aiHint) return null;
  const m = /^\s*Columnas:\s*(.+?)(?:\.|$)/m.exec(aiHint);
  if (!m) return null;
  const columnas = m[1].split('|').map(s => s.trim()).filter(Boolean);
  return columnas.length > 0 ? columnas : null;
}

function claveDesdeEncabezado(encabezado: string, usadas: Set<string>): string {
  let base = encabezado.trim() || 'columna';
  let clave = base;
  let n = 2;
  while (usadas.has(clave)) { clave = `${base}_${n}`; n++; }
  usadas.add(clave);
  return clave;
}

/** Formato heurístico de una columna a partir de sus valores reales (best-effort, nunca falla). */
function inferirFormatoColumna(rows: Record<string, unknown>[], clave: string): ExcelFormatoCelda {
  const valores = rows.map(r => r[clave]).filter(v => v !== null && v !== undefined && v !== '');
  if (valores.length === 0) return 'TEXTO';
  const todasNumericas = valores.every(v => typeof v === 'number' || (typeof v === 'string' && /^-?[\d,.]+$/.test(v.trim())));
  if (todasNumericas) return 'NUMERO';
  const todasFecha = valores.every(v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v));
  if (todasFecha) return 'FECHA';
  return 'TEXTO';
}

export interface LayoutColumna { clave: string; encabezado: string; formato?: ExcelFormatoCelda; ancho?: number }
export interface LayoutSeccion {
  sectionKey: string; label: string; fieldType: string;
  columnas?: LayoutColumna[]; // presente solo si fieldType === MATRIX
}
export interface GenericLayoutDescriptor { paperCode: string; secciones: LayoutSeccion[] }

/**
 * Infiere columnas para una sección MATRIX: primero de las filas YA
 * existentes (fuente de verdad — puede haber evolucionado más allá del
 * `aiHint` original), y solo si no hay ninguna fila, del `aiHint`. Si
 * ninguna de las dos fuentes da nada usable, devuelve `null` — el llamador
 * decide si omitir la sección con advertencia (EXC-28), nunca genera una
 * tabla vacía sin encabezados reales.
 */
export function inferirColumnasMatriz(rows: Record<string, unknown>[], aiHint?: string): LayoutColumna[] | null {
  if (rows.length > 0) {
    const usadas = new Set<string>();
    const claves = new Set<string>();
    for (const r of rows) for (const k of Object.keys(r)) { if (!k.startsWith('_') && k !== 'id') claves.add(k); }
    if (claves.size === 0) return null;
    return Array.from(claves).map(clave => ({
      clave, encabezado: clave, formato: inferirFormatoColumna(rows, clave),
    }));
  }
  const encabezados = parseColumnasDeAiHint(aiHint);
  if (!encabezados) return null;
  const usadas = new Set<string>();
  return encabezados.map(encabezado => ({
    clave: claveDesdeEncabezado(encabezado, usadas), encabezado, formato: 'TEXTO' as ExcelFormatoCelda,
  }));
}

// ─── Construcción del ExcelTemplateDef ──────────────────────────────────────

interface SeccionEntrada { tpl: SectionTemplate; rows: Record<string, unknown>[] }

export interface ConstruirDefGenericaResultado {
  def: ExcelTemplateDef;
  omitidas: Array<{ sectionKey: string; motivo: string }>;
}

const NOMBRE_HOJA_INVALIDO = /[[\]*?:/\\]/g;
function nombreHoja(sectionKey: string, label: string): string {
  const base = `${sectionKey} ${label}`.replace(NOMBRE_HOJA_INVALIDO, ' ').trim();
  return base.slice(0, 31) || sectionKey;
}

/**
 * Construye el `ExcelTemplateDef` genérico para un subconjunto de secciones
 * de un papel. Devuelve también qué secciones se omitieron y por qué (para
 * que el llamador las muestre como advertencia — EXC-28 — en vez de fallar
 * toda la descarga por una sola sección problemática).
 */
export function construirDefGenerica(paperCode: string, entradas: SeccionEntrada[]): ConstruirDefGenericaResultado {
  const hojas: ExcelTemplateDef['hojas'] = [];
  const origen: ExcelOrigenBinding[] = [];
  const destino: ExcelTemplateDef['destino'] = [];
  const layoutSecciones: LayoutSeccion[] = [];
  const omitidas: ConstruirDefGenericaResultado['omitidas'] = [];

  entradas.forEach(({ tpl, rows }, i) => {
    if (!esFieldTypeElegible(tpl.fieldType)) {
      omitidas.push({ sectionKey: tpl.sectionKey, motivo: `Tipo de sección '${tpl.fieldType}' no soportado por la plantilla genérica — tiene su propio panel interactivo en pantalla.` });
      return;
    }

    const hoja = nombreHoja(tpl.sectionKey, tpl.label);
    const rangoNombre = `AM_GEN_${tpl.sectionKey}`.replace(/[^A-Za-z0-9_]/g, '_');
    const anclaFila = i === 0 ? 7 : 3; // primera hoja reserva la cabecera del encargo (filas 1-4 + etiqueta en 6)

    if (tpl.fieldType === FieldType.MATRIX) {
      const columnas = inferirColumnasMatriz(rows, tpl.aiHint);
      if (!columnas) {
        omitidas.push({ sectionKey: tpl.sectionKey, motivo: 'Sección vacía y sin columnas declarables en su ayuda — agregue al menos una fila en pantalla antes de poder descargarla.' });
        return;
      }
      // +10 filas de relleno SIEMPRE, más allá de las filas reales — sin esto,
      // el rango con nombre queda fijo exactamente en el número de filas
      // existentes y el auditor no tiene dónde agregar un ítem nuevo fuera de
      // línea (confirmado con una prueba real que falló exactamente por esto).
      const filasMinimas = Math.min(rows.length + 10, 2000);
      hojas.push({ nombre: hoja, congelarEn: `A${anclaFila + 1}`, anchoColumnas: columnas.map(() => 22) });
      origen.push({
        rango: {
          rangoNombre, hoja, ancla: `A${anclaFila}`, zona: 'LIBRE',
          forma: {
            tipo: 'TABLA',
            columnas: columnas.map((c): ExcelColumnaDef => ({ clave: c.clave, encabezado: c.encabezado, ancho: 22, formato: c.formato })),
            filasMinimas, filasMaximas: 2000,
          },
          etiqueta: tpl.label,
        },
        fuente: () => rows,
      });
      destino.push({ rangoNombre, escribeEn: { paperCode: EXCEL_MISMO_PAPEL, sectionKey: tpl.sectionKey } });
      layoutSecciones.push({ sectionKey: tpl.sectionKey, label: tpl.label, fieldType: tpl.fieldType, columnas });
    } else {
      const formato = FORMATO_POR_FIELD_TYPE[tpl.fieldType] ?? 'TEXTO';
      const valorActual = rows[0]?.['__valor'];
      hojas.push({ nombre: hoja, congelarEn: `A${anclaFila}`, anchoColumnas: [60] });
      origen.push({
        rango: { rangoNombre, hoja, ancla: `A${anclaFila}`, zona: 'LIBRE', forma: { tipo: 'ESCALAR', formato }, etiqueta: tpl.label },
        fuente: () => (valorActual ?? null) as string | number | boolean | Date | null,
      });
      destino.push({ rangoNombre, escribeEn: { paperCode: EXCEL_MISMO_PAPEL, sectionKey: tpl.sectionKey } });
      layoutSecciones.push({ sectionKey: tpl.sectionKey, label: tpl.label, fieldType: tpl.fieldType });
    }
  });

  const layout: GenericLayoutDescriptor = { paperCode, secciones: layoutSecciones };

  const def: ExcelTemplateDef = {
    key: 'GENERICA',
    label: 'Plantilla genérica — trabajar fuera de línea',
    descripcion: 'Descarga las secciones elegidas de este papel para trabajarlas fuera de línea. Al volver a subir el archivo, cada sección se reemplaza tal cual quedó en el Excel — igual que editarla directamente en pantalla.',
    paperCodeAplicable: [paperCode],
    version: 1,
    hojas: hojas.length > 0 ? hojas : [{ nombre: 'Sin datos', anchoColumnas: [40] }],
    origen,
    destino,
    genericLayout: JSON.stringify(layout),
  };

  return { def, omitidas };
}

/**
 * Reconstruye el MISMO `ExcelTemplateDef` a partir del descriptor sellado en
 * el manifiesto (`leerGenerica()`) — usa el layout TAL COMO se congeló al
 * generar el archivo, no vuelve a inferir columnas de datos que pudieron
 * haber cambiado en pantalla mientras el auditor trabajaba fuera de línea.
 */
export function construirDefDesdeLayout(layout: GenericLayoutDescriptor): ExcelTemplateDef {
  const hojas: ExcelTemplateDef['hojas'] = [];
  const origen: ExcelOrigenBinding[] = [];
  const destino: ExcelTemplateDef['destino'] = [];

  layout.secciones.forEach((s, i) => {
    const hoja = nombreHoja(s.sectionKey, s.label);
    const rangoNombre = `AM_GEN_${s.sectionKey}`.replace(/[^A-Za-z0-9_]/g, '_');
    const anclaFila = i === 0 ? 7 : 3;

    if (s.fieldType === FieldType.MATRIX && s.columnas) {
      hojas.push({ nombre: hoja, congelarEn: `A${anclaFila + 1}`, anchoColumnas: s.columnas.map(() => 22) });
      origen.push({
        rango: {
          rangoNombre, hoja, ancla: `A${anclaFila}`, zona: 'LIBRE',
          forma: { tipo: 'TABLA', columnas: s.columnas.map((c): ExcelColumnaDef => ({ clave: c.clave, encabezado: c.encabezado, ancho: 22, formato: c.formato })), filasMinimas: 5, filasMaximas: 2000 },
          etiqueta: s.label,
        },
      });
    } else {
      const formato = FORMATO_POR_FIELD_TYPE[s.fieldType as FieldType] ?? 'TEXTO';
      hojas.push({ nombre: hoja, congelarEn: `A${anclaFila}`, anchoColumnas: [60] });
      origen.push({ rango: { rangoNombre, hoja, ancla: `A${anclaFila}`, zona: 'LIBRE', forma: { tipo: 'ESCALAR', formato }, etiqueta: s.label } });
    }
    destino.push({ rangoNombre, escribeEn: { paperCode: EXCEL_MISMO_PAPEL, sectionKey: s.sectionKey } });
  });

  return {
    key: 'GENERICA',
    label: 'Plantilla genérica — trabajar fuera de línea',
    paperCodeAplicable: [layout.paperCode],
    version: 1,
    hojas: hojas.length > 0 ? hojas : [{ nombre: 'Sin datos', anchoColumnas: [40] }],
    origen, destino,
    genericLayout: JSON.stringify(layout),
  };
}
