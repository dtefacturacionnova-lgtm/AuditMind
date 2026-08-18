import { Prisma } from '@prisma/client';
import { ExcelTemplateDef, EXCEL_MISMO_PAPEL, ExcelValorLeido } from './excel-template.types';

/**
 * Conciliación de Cuentas por Cobrar (auxiliar vs. contabilidad). Papel base:
 * `PT-FIN-C-SUST` (pensada para C-02, Cuentas por Cobrar — misma nota de
 * alcance que Conciliación Bancaria/Arqueo de Caja: se muestra en S1 de
 * cualquier instancia de C-SUST, no solo C-02).
 *
 * Distinta de `CIRCULARIZACION_CXC` (NIA 505, confirmaciones externas sobre
 * la muestra de `PT-NIA530 S5`) — esta plantilla es la conciliación interna
 * del total del auxiliar de clientes (por antigüedad de saldos) contra el
 * saldo de CxC según el mayor/contabilidad, sin depender de confirmación de
 * terceros. Contenido inspirado en un papel de trabajo real que compartió el
 * usuario (E210-2 Conciliación CxC Clientes) — antigüedad por rangos fijos
 * (0-30/31-60/61-90/+90) sumada y comparada contra la cifra de contabilidad.
 *
 * Misma estructura que Conciliación Bancaria (fase 2): un ESCALAR + una TABLA
 * combinados en un solo cálculo vía `ctx.rangoLeido()`, una única fila
 * calculada escrita en S1 con su propio marcador `_excelOrigen`.
 */

const MARCA_ORIGEN = 'CONCILIACION_CXC';

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

export const CONCILIACION_CXC_TEMPLATE: ExcelTemplateDef = {
  key: 'CONCILIACION_CXC',
  label: 'Conciliación de CxC (Auxiliar vs. Contabilidad)',
  descripcion:
    'Concilia el total del auxiliar de clientes por antigüedad de saldos con el saldo de Cuentas por Cobrar según contabilidad (mayor). Si queda una diferencia real, se registra automáticamente en Diferencias Identificadas (S1).',
  paperCodeAplicable: ['PT-FIN-C-SUST'],
  version: 1,
  hojas: [
    { nombre: 'Conciliación CxC', congelarEn: 'A16', anchoColumnas: [26, 20] },
    { nombre: 'Saldos TB', congelarEn: 'A3', anchoColumnas: [14, 35, 16, 16, 16] },
  ],
  origen: [
    {
      rango: {
        rangoNombre: 'AM_SaldoContabilidad', hoja: 'Conciliación CxC', ancla: 'A7', zona: 'LIBRE',
        forma: { tipo: 'ESCALAR', formato: 'MONEDA' },
        etiqueta: 'Saldo de Cuentas por Cobrar según contabilidad (mayor)',
      },
    },
    {
      rango: {
        rangoNombre: 'AM_FechaCorte', hoja: 'Conciliación CxC', ancla: 'A10', zona: 'LIBRE',
        forma: { tipo: 'ESCALAR', formato: 'FECHA' },
        etiqueta: 'Fecha de corte del auxiliar de clientes',
        nota: 'Solo documental — no participa en el cálculo',
      },
    },
    {
      rango: {
        rangoNombre: 'AM_Antiguedad', hoja: 'Conciliación CxC', ancla: 'A14', zona: 'LIBRE',
        forma: {
          tipo: 'TABLA',
          columnas: [
            { clave: 'rango', encabezado: 'Antigüedad', ancho: 26, zona: 'CONTROLADA' },
            { clave: 'saldo', encabezado: 'Saldo según auxiliar ($)', ancho: 20, formato: 'MONEDA', zona: 'LIBRE' },
          ],
          filasMinimas: 4, filasMaximas: 4,
        },
        etiqueta: 'Antigüedad de saldos — auxiliar de clientes',
        nota: 'Complete el saldo de cada rango, tomado del reporte de antigüedad del auxiliar de clientes. No agregue ni quite filas — los 4 rangos son fijos.',
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
        const fechaCorteValor = ctx.rangoLeido('AM_FechaCorte');
        const fechaCorte = fechaCorteValor?.tipo === 'ESCALAR' && fechaCorteValor.valor instanceof Date
          ? fechaCorteValor.valor.toISOString().slice(0, 10)
          : 'sin especificar';

        const filas = (valorLeido.tipo === 'TABLA' ? valorLeido.filas : []) as FilaAntiguedad[];
        let totalAuxiliar = 0;
        for (const f of filas) {
          const saldo = Number(f.saldo ?? 0) || 0;
          totalAuxiliar += saldo;
        }

        const diferencia = totalAuxiliar - saldoContabilidad;

        const existentes = ctx.filas('S1') as Array<Record<string, unknown>>;
        // Filas de OTRAS fuentes (hallazgos manuales, Conciliación Bancaria,
        // Arqueo de Caja, evidencia de campo) se conservan intactas — solo se
        // reemplaza lo que ESTA plantilla escribió antes.
        const conservadas = existentes.filter(r => r['_excelOrigen'] !== MARCA_ORIGEN);

        if (Math.abs(diferencia) < 0.01) {
          // Concilia: no hay nada que reportar. Si una subida anterior sí
          // había dejado una diferencia, esta re-subida la retira.
          return conservadas as unknown as Prisma.InputJsonValue;
        }

        const fila = {
          '_excelOrigen': MARCA_ORIGEN,
          'N°': String(conservadas.length + 1),
          'Área/Cuenta': 'Cuentas por Cobrar — Conciliación Auxiliar vs. Contabilidad',
          'Descripción de la diferencia':
            `Diferencia no conciliada al ${fechaCorte} entre el total del auxiliar de clientes por antigüedad `
            + `($${totalAuxiliar.toFixed(2)}) y el saldo de Cuentas por Cobrar según contabilidad ($${saldoContabilidad.toFixed(2)}).`,
          'Saldo según cliente ($)': saldoContabilidad.toFixed(2),
          'Saldo según auditor ($)': totalAuxiliar.toFixed(2),
          'Diferencia ($)': diferencia.toFixed(2),
          'Naturaleza (Error/Estimación/Fraude/No ajustable)': 'Error',
          'Proponer AJE (Sí/No/Pendiente)': 'Pendiente',
        };

        return [...conservadas, fila] as unknown as Prisma.InputJsonValue;
      },
    },
  ],
};
