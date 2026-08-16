import { Prisma } from '@prisma/client';
import { ExcelTemplateDef, EXCEL_MISMO_PAPEL, ExcelValorLeido } from './excel-template.types';

/**
 * Fase 5 del catálogo (§4.1, última pendiente): Arqueo de Caja (NIA 501 —
 * verificación física de existencias, aplicada a efectivo). Papel base:
 * `PT-FIN-C-SUST` (pensada para C-01, Caja y Bancos — mismo botón que
 * Conciliación Bancaria, misma nota de alcance: se muestra en S1 de
 * cualquier instancia de C-SUST, no solo C-01).
 *
 * Estructura casi idéntica a Conciliación Bancaria (fase 2): varios rangos
 * ESCALAR + dos TABLA combinados en un solo cálculo vía `ctx.rangoLeido()`,
 * una única fila calculada escrita en S1 con su propio marcador
 * `_excelOrigen`. Se reutiliza el mismo esquema de fila que ya consume
 * `propagateDiferencias` (B-08) — ningún cambio en ese servicio.
 *
 * Diferencia real con Conciliación Bancaria: dos tablas de origen en vez de
 * una — denominaciones contadas (billetes y monedas) y vales/comprobantes de
 * caja chica pendientes de reembolso —, ambas leídas vía `rangoLeido` por la
 * `transformacion` anclada en la primera. `_excelOrigen: 'ARQUEO_CAJA'` es un
 * marcador DISTINTO al de Conciliación Bancaria a propósito: si el mismo
 * papel C-01 usa ambas plantillas, cada una reemplaza solo su propia fila —
 * nunca la de la otra.
 */

const MARCA_ORIGEN = 'ARQUEO_CAJA';

const DENOMINACIONES_USD = ['100.00', '50.00', '20.00', '10.00', '5.00', '2.00', '1.00', '0.50', '0.25', '0.10', '0.05', '0.01'];

interface FilaDenominacion { denominacion?: unknown; cantidad?: unknown; }
interface FilaVale { descripcion?: unknown; monto?: unknown; autorizadoPor?: unknown; fecha?: unknown; }

function numeroDeEscalar(v: ExcelValorLeido | null): number {
  if (!v || v.tipo !== 'ESCALAR') return 0;
  const n = Number(v.valor);
  return Number.isFinite(n) ? n : 0;
}

export const ARQUEO_CAJA_TEMPLATE: ExcelTemplateDef = {
  key: 'ARQUEO_CAJA',
  label: 'Arqueo de Caja',
  descripcion:
    'Registra el conteo físico de efectivo (denominaciones) y los vales/comprobantes de caja chica pendientes de reembolso, y lo compara contra el saldo según libros. Si queda una diferencia real, se registra automáticamente en Diferencias Identificadas (S1).',
  paperCodeAplicable: ['PT-FIN-C-SUST'],
  version: 1,
  hojas: [
    { nombre: 'Arqueo de Caja', congelarEn: 'A15', anchoColumnas: [30, 16, 20, 14] },
    { nombre: 'Saldos TB', congelarEn: 'A3', anchoColumnas: [14, 35, 16, 16, 16] },
  ],
  origen: [
    {
      rango: {
        rangoNombre: 'AM_SaldoLibros', hoja: 'Arqueo de Caja', ancla: 'A7', zona: 'LIBRE',
        forma: { tipo: 'ESCALAR', formato: 'MONEDA' },
        etiqueta: 'Saldo según libros al momento del arqueo',
      },
    },
    {
      rango: {
        rangoNombre: 'AM_FechaArqueo', hoja: 'Arqueo de Caja', ancla: 'A10', zona: 'LIBRE',
        forma: { tipo: 'ESCALAR', formato: 'FECHA' },
        etiqueta: 'Fecha del arqueo',
        nota: 'Solo documental — no participa en el cálculo',
      },
    },
    {
      rango: {
        rangoNombre: 'AM_Denominaciones', hoja: 'Arqueo de Caja', ancla: 'A14', zona: 'LIBRE',
        forma: {
          tipo: 'TABLA',
          columnas: [
            { clave: 'denominacion', encabezado: 'Denominación ($)', ancho: 18, formato: 'MONEDA', opciones: DENOMINACIONES_USD },
            { clave: 'cantidad', encabezado: 'Cantidad contada', ancho: 16, formato: 'ENTERO' },
          ],
          filasMinimas: 15, filasMaximas: 100,
        },
        etiqueta: 'Conteo físico — billetes y monedas',
        nota: 'Una fila por denominación efectivamente contada. El subtotal por denominación y el total se calculan al procesar el archivo, no hace falta escribir fórmulas.',
      },
    },
    {
      rango: {
        rangoNombre: 'AM_Vales', hoja: 'Arqueo de Caja', ancla: 'A32', zona: 'LIBRE',
        forma: {
          tipo: 'TABLA',
          columnas: [
            { clave: 'descripcion', encabezado: 'Descripción', ancho: 30 },
            { clave: 'monto', encabezado: 'Monto ($)', ancho: 16, formato: 'MONEDA' },
            { clave: 'autorizadoPor', encabezado: 'Autorizado por', ancho: 20 },
            { clave: 'fecha', encabezado: 'Fecha', ancho: 14, formato: 'FECHA' },
          ],
          filasMinimas: 5, filasMaximas: 100,
        },
        etiqueta: 'Vales / comprobantes de caja chica pendientes de reembolso',
        nota: 'Solo vales físicamente presentes en la caja al momento del arqueo — cuentan como parte del efectivo arqueado.',
      },
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
      rangoNombre: 'AM_Denominaciones',
      escribeEn: { paperCode: EXCEL_MISMO_PAPEL, sectionKey: 'S1' },
      transformacion: (valorLeido, ctx) => {
        const saldoLibros = numeroDeEscalar(ctx.rangoLeido('AM_SaldoLibros'));
        const fechaArqueoValor = ctx.rangoLeido('AM_FechaArqueo');
        const fechaArqueo = fechaArqueoValor?.tipo === 'ESCALAR' && fechaArqueoValor.valor instanceof Date
          ? fechaArqueoValor.valor.toISOString().slice(0, 10)
          : 'sin especificar';

        const denominaciones = (valorLeido.tipo === 'TABLA' ? valorLeido.filas : []) as FilaDenominacion[];
        let totalDenominaciones = 0;
        for (const d of denominaciones) {
          const valor = Number(d.denominacion ?? 0) || 0;
          const cantidad = Number(d.cantidad ?? 0) || 0;
          if (!valor || !cantidad) continue;
          totalDenominaciones += valor * cantidad;
        }

        const valesValor = ctx.rangoLeido('AM_Vales');
        const vales = (valesValor?.tipo === 'TABLA' ? valesValor.filas : []) as FilaVale[];
        let totalVales = 0;
        for (const v of vales) {
          const monto = Number(v.monto ?? 0) || 0;
          if (!monto) continue;
          totalVales += monto;
        }

        const totalContado = totalDenominaciones + totalVales;
        const diferencia = totalContado - saldoLibros;

        const existentes = ctx.filas('S1') as Array<Record<string, unknown>>;
        // Filas de OTRAS fuentes (hallazgos manuales, Conciliación Bancaria,
        // otras plantillas) se conservan intactas — solo se reemplaza lo que
        // ESTA plantilla escribió antes (marcador propio, distinto al de CB).
        const conservadas = existentes.filter(r => r['_excelOrigen'] !== MARCA_ORIGEN);

        if (Math.abs(diferencia) < 0.01) {
          // Arqueo cuadra: no hay nada que reportar. Si una subida anterior
          // sí había dejado una diferencia, esta re-subida la retira.
          return conservadas as unknown as Prisma.InputJsonValue;
        }

        const fila = {
          '_excelOrigen': MARCA_ORIGEN,
          'N°': String(conservadas.length + 1),
          'Área/Cuenta': 'Caja — Arqueo Físico',
          'Descripción de la diferencia':
            `Diferencia no conciliada en el arqueo de caja al ${fechaArqueo}: `
            + `total contado $${totalContado.toFixed(2)} (denominaciones $${totalDenominaciones.toFixed(2)} + vales $${totalVales.toFixed(2)}) `
            + `vs. saldo según libros $${saldoLibros.toFixed(2)}.`,
          'Saldo según cliente ($)': saldoLibros.toFixed(2),
          'Saldo según auditor ($)': totalContado.toFixed(2),
          'Diferencia ($)': diferencia.toFixed(2),
          'Naturaleza (Error/Estimación/Fraude/No ajustable)': 'Error',
          'Proponer AJE (Sí/No/Pendiente)': 'Pendiente',
        };

        return [...conservadas, fila] as unknown as Prisma.InputJsonValue;
      },
    },
  ],
};
