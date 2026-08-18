import { Prisma } from '@prisma/client';
import { ExcelTemplateDef, EXCEL_MISMO_PAPEL, ExcelValorLeido } from './excel-template.types';

/**
 * Conciliación de Cuentas por Pagar (auxiliar de proveedores vs. contabilidad).
 * Papel base: `PT-FIN-C-SUST` (pensada para C-03/C-04, Cuentas por Pagar —
 * misma nota de alcance que Conciliación de CxC/Bancaria/Arqueo de Caja: se
 * muestra en S1 de cualquier instancia de C-SUST, no solo el área de CxP).
 *
 * Clon deliberado de `CONCILIACION_CXC` — mismo cálculo (auxiliar por
 * antigüedad vs. mayor), invertido para el lado pasivo. Única diferencia de
 * contenido, tomada de un workpaper real que compartió el usuario (E220-2
 * Conciliación CxP proveedores): el auxiliar de proveedores con frecuencia
 * incluye saldos con PARTES RELACIONADAS que no son CxP comercial — en el
 * ejemplo real esa exclusión era la práctica totalidad del saldo del
 * auxiliar. Se resta antes de comparar (`AM_CxpPartesRelacionadas`, escalar
 * LIBRE opcional — 0 si no aplica).
 */

const MARCA_ORIGEN = 'CONCILIACION_CXP';

const RANGOS_ANTIGUEDAD = ['0 a 30 días', '31 a 60 días', '61 a 90 días', 'Más de 90 días'];

interface FilaAntiguedad {
  rango?: unknown;
  saldo?: unknown;
}

function numeroDeEscalar(v: ExcelValorLeido | null): number {
  if (!v || v.tipo !== 'ESCALAR') return 0;
  const n = Number(v.valor);
  return Number.isFinite(n) ? n : 0;
}

export const CONCILIACION_CXP_TEMPLATE: ExcelTemplateDef = {
  key: 'CONCILIACION_CXP',
  label: 'Conciliación de CxP (Auxiliar vs. Contabilidad)',
  descripcion:
    'Concilia el total del auxiliar de proveedores por antigüedad de saldos (excluyendo partes relacionadas, si aplica) con el saldo de Cuentas por Pagar según contabilidad (mayor). Si queda una diferencia real, se registra automáticamente en Diferencias Identificadas (S1).',
  paperCodeAplicable: ['PT-FIN-C-SUST'],
  version: 1,
  hojas: [
    { nombre: 'Conciliación CxP', congelarEn: 'A19', anchoColumnas: [26, 20] },
    { nombre: 'Saldos TB', congelarEn: 'A3', anchoColumnas: [14, 35, 16, 16, 16] },
  ],
  origen: [
    {
      rango: {
        rangoNombre: 'AM_SaldoContabilidad', hoja: 'Conciliación CxP', ancla: 'A7', zona: 'LIBRE',
        forma: { tipo: 'ESCALAR', formato: 'MONEDA' },
        etiqueta: 'Saldo de Cuentas por Pagar según contabilidad (mayor)',
      },
    },
    {
      rango: {
        rangoNombre: 'AM_CxpPartesRelacionadas', hoja: 'Conciliación CxP', ancla: 'A10', zona: 'LIBRE',
        forma: { tipo: 'ESCALAR', formato: 'MONEDA' },
        etiqueta: 'CxP con partes relacionadas incluida en el auxiliar (se resta antes de conciliar)',
        nota: 'Deje en 0 si el auxiliar de proveedores no mezcla saldos con partes relacionadas.',
      },
    },
    {
      rango: {
        rangoNombre: 'AM_FechaCorte', hoja: 'Conciliación CxP', ancla: 'A13', zona: 'LIBRE',
        forma: { tipo: 'ESCALAR', formato: 'FECHA' },
        etiqueta: 'Fecha de corte del auxiliar de proveedores',
        nota: 'Solo documental — no participa en el cálculo',
      },
    },
    {
      rango: {
        rangoNombre: 'AM_Antiguedad', hoja: 'Conciliación CxP', ancla: 'A17', zona: 'LIBRE',
        forma: {
          tipo: 'TABLA',
          columnas: [
            { clave: 'rango', encabezado: 'Antigüedad', ancho: 26, zona: 'CONTROLADA' },
            { clave: 'saldo', encabezado: 'Saldo según auxiliar ($)', ancho: 20, formato: 'MONEDA', zona: 'LIBRE' },
          ],
          filasMinimas: 4, filasMaximas: 4,
        },
        etiqueta: 'Antigüedad de saldos — auxiliar de proveedores (comercial, sin partes relacionadas)',
        nota: 'Complete el saldo de cada rango, tomado del reporte de antigüedad del auxiliar de proveedores. No agregue ni quite filas — los 4 rangos son fijos.',
      },
      fuente: () => RANGOS_ANTIGUEDAD.map(rango => ({ rango })),
    },
    {
      rango: {
        rangoNombre: 'AM_SaldosTB', hoja: 'Saldos TB', ancla: 'A2', zona: 'CONTROLADA',
        forma: {
          tipo: 'TABLA',
          columnas: [
            { clave: 'cuenta',         encabezado: 'Cuenta',         ancho: 14 },
            { clave: 'descripcion',    encabezado: 'Descripción',    ancho: 35 },
            { clave: 'saldo_actual',   encabezado: 'Saldo actual',   ancho: 16, formato: 'MONEDA' },
            { clave: 'saldo_anterior', encabezado: 'Saldo anterior', ancho: 16, formato: 'MONEDA' },
            { clave: 'sub_sumaria',    encabezado: 'Sub-sumaria',    ancho: 14 },
          ],
          filasMinimas: 1, filasMaximas: 800,
        },
        etiqueta: 'Referencia — Balance de Comprobación (B-00)',
        nota: 'Solo consulta; no se lee de vuelta al subir el archivo',
      },
      fuente: async (ctx) => await ctx.saldosTB(),
    },
  ],
  destino: [
    {
      rangoNombre: 'AM_Antiguedad',
      escribeEn: { paperCode: EXCEL_MISMO_PAPEL, sectionKey: 'S1' },
      transformacion: (valorLeido, ctx) => {
        const saldoContabilidad = numeroDeEscalar(ctx.rangoLeido('AM_SaldoContabilidad'));
        const cxpPartesRelacionadas = numeroDeEscalar(ctx.rangoLeido('AM_CxpPartesRelacionadas'));
        const fechaCorteValor = ctx.rangoLeido('AM_FechaCorte');
        const fechaCorte = fechaCorteValor?.tipo === 'ESCALAR' && fechaCorteValor.valor instanceof Date
          ? fechaCorteValor.valor.toISOString().slice(0, 10)
          : 'sin especificar';

        const filas = (valorLeido.tipo === 'TABLA' ? valorLeido.filas : []) as FilaAntiguedad[];
        let totalAuxiliarBruto = 0;
        for (const f of filas) {
          const saldo = Number(f.saldo ?? 0) || 0;
          totalAuxiliarBruto += saldo;
        }
        const totalAuxiliarComercial = totalAuxiliarBruto - cxpPartesRelacionadas;

        const diferencia = totalAuxiliarComercial - saldoContabilidad;

        const existentes = ctx.filas('S1') as Array<Record<string, unknown>>;
        // Filas de OTRAS fuentes (hallazgos manuales, Conciliación Bancaria,
        // Conciliación de CxC, Arqueo de Caja, evidencia de campo) se
        // conservan intactas — solo se reemplaza lo que ESTA plantilla
        // escribió antes.
        const conservadas = existentes.filter(r => r['_excelOrigen'] !== MARCA_ORIGEN);

        if (Math.abs(diferencia) < 0.01) {
          // Concilia: no hay nada que reportar. Si una subida anterior sí
          // había dejado una diferencia, esta re-subida la retira.
          return conservadas as unknown as Prisma.InputJsonValue;
        }

        const detalleExclusion = cxpPartesRelacionadas > 0
          ? ` (auxiliar bruto $${totalAuxiliarBruto.toFixed(2)} menos $${cxpPartesRelacionadas.toFixed(2)} de CxP con partes relacionadas)`
          : '';

        const fila = {
          '_excelOrigen': MARCA_ORIGEN,
          'N°': String(conservadas.length + 1),
          'Área/Cuenta': 'Cuentas por Pagar — Conciliación Auxiliar vs. Contabilidad',
          'Descripción de la diferencia':
            `Diferencia no conciliada al ${fechaCorte} entre el total del auxiliar de proveedores comercial `
            + `($${totalAuxiliarComercial.toFixed(2)})${detalleExclusion} y el saldo de Cuentas por Pagar según contabilidad ($${saldoContabilidad.toFixed(2)}).`,
          'Saldo según cliente ($)': saldoContabilidad.toFixed(2),
          'Saldo según auditor ($)': totalAuxiliarComercial.toFixed(2),
          'Diferencia ($)': diferencia.toFixed(2),
          'Naturaleza (Error/Estimación/Fraude/No ajustable)': 'Error',
          'Proponer AJE (Sí/No/Pendiente)': 'Pendiente',
        };

        return [...conservadas, fila] as unknown as Prisma.InputJsonValue;
      },
    },
  ],
};
