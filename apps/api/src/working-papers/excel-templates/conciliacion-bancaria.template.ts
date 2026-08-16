import { Prisma } from '@prisma/client';
import { ExcelTemplateDef, EXCEL_MISMO_PAPEL, ExcelValorLeido } from './excel-template.types';

/**
 * Fase 2 del catálogo (§4 del documento de diseño): Conciliación Bancaria.
 * Papel base: `PT-FIN-C-SUST` (pensada para C-01, Caja y Bancos — pero el
 * botón se muestra en S1 de cualquier instancia de C-SUST; ver nota de
 * alcance en `excel-templates.registry.ts`).
 *
 * Primera plantilla que combina varios rangos ESCALAR + una TABLA en un solo
 * cálculo — por eso motivó `ctx.rangoLeido()` (EXC-09). El cálculo vive
 * completo en `transformacion`, anclado al rango de la tabla de partidas.
 *
 * Escribe (o reemplaza) una única fila calculada en S1 ("Diferencias
 * Identificadas") — la misma sección MATRIX que ya alimenta B-08 vía
 * "Consolidar Diferencias" (`propagateDiferencias`, que espera exactamente
 * estas claves: 'Área/Cuenta', 'Descripción de la diferencia', 'Saldo según
 * cliente ($)', 'Saldo según auditor ($)', 'Diferencia ($)', 'Naturaleza...',
 * 'Proponer AJE...' — ver `paper-sections.service.ts`). La fila se marca con
 * `_excelOrigen` (prefijo `_` = campo interno, `MatrixGridPanel` nunca lo
 * muestra como columna) para poder reemplazarla en cada re-subida sin tocar
 * ninguna otra fila que el auditor haya agregado a mano en la UI.
 */

const MARCA_ORIGEN = 'CONCILIACION_BANCARIA';

interface FilaPartida {
  tipo?: unknown;
  afecta?: unknown;
  descripcion?: unknown;
  monto?: unknown;
  fecha?: unknown;
}

function numeroDeEscalar(v: ExcelValorLeido | null): number {
  if (!v || v.tipo !== 'ESCALAR') return 0;
  const n = Number(v.valor);
  return Number.isFinite(n) ? n : 0;
}

export const CONCILIACION_BANCARIA_TEMPLATE: ExcelTemplateDef = {
  key: 'CONCILIACION_BANCARIA',
  label: 'Conciliación Bancaria',
  descripcion:
    'Concilia el saldo según banco con el saldo según libros — depósitos en tránsito, cheques pendientes, notas no registradas. Si queda una diferencia real, se registra automáticamente en Diferencias Identificadas (S1).',
  paperCodeAplicable: ['PT-FIN-C-SUST'],
  version: 1,
  hojas: [
    { nombre: 'Conciliación', congelarEn: 'A18', anchoColumnas: [22, 30, 16, 14] },
    { nombre: 'Saldos TB', congelarEn: 'A3', anchoColumnas: [14, 35, 16, 16, 16] },
  ],
  origen: [
    {
      rango: {
        rangoNombre: 'AM_SaldoBanco', hoja: 'Conciliación', ancla: 'A7', zona: 'LIBRE',
        forma: { tipo: 'ESCALAR', formato: 'MONEDA' },
        etiqueta: 'Saldo según banco (estado de cuenta al cierre)',
      },
    },
    {
      rango: {
        rangoNombre: 'AM_SaldoLibros', hoja: 'Conciliación', ancla: 'A10', zona: 'LIBRE',
        forma: { tipo: 'ESCALAR', formato: 'MONEDA' },
        etiqueta: 'Saldo según libros (mayor al cierre)',
      },
    },
    {
      rango: {
        rangoNombre: 'AM_FechaCorte', hoja: 'Conciliación', ancla: 'A13', zona: 'LIBRE',
        forma: { tipo: 'ESCALAR', formato: 'FECHA' },
        etiqueta: 'Fecha de corte de la conciliación',
        nota: 'Solo documental — no participa en el cálculo',
      },
    },
    {
      rango: {
        rangoNombre: 'AM_Partidas', hoja: 'Conciliación', ancla: 'A17', zona: 'LIBRE',
        forma: {
          tipo: 'TABLA',
          columnas: [
            {
              clave: 'tipo', encabezado: 'Tipo de partida', ancho: 26,
              opciones: ['Depósito en tránsito', 'Cheque pendiente de cobro', 'Nota de débito no registrada', 'Nota de crédito no registrada', 'Otro'],
            },
            { clave: 'afecta', encabezado: 'Afecta a', ancho: 10, opciones: ['Banco', 'Libros'] },
            { clave: 'descripcion', encabezado: 'Descripción', ancho: 35 },
            { clave: 'monto', encabezado: 'Monto (con signo)', ancho: 16, formato: 'MONEDA' },
            { clave: 'fecha', encabezado: 'Fecha', ancho: 14, formato: 'FECHA' },
          ],
          filasMinimas: 10, filasMaximas: 200,
        },
        etiqueta: 'Partidas conciliatorias',
        nota: '"Afecta a": de qué lado ajusta esta partida. "Monto": positivo suma, negativo resta — el auditor decide el signo.',
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
      rangoNombre: 'AM_Partidas',
      escribeEn: { paperCode: EXCEL_MISMO_PAPEL, sectionKey: 'S1' },
      transformacion: (valorLeido, ctx) => {
        const saldoBanco = numeroDeEscalar(ctx.rangoLeido('AM_SaldoBanco'));
        const saldoLibros = numeroDeEscalar(ctx.rangoLeido('AM_SaldoLibros'));
        const fechaCorteValor = ctx.rangoLeido('AM_FechaCorte');
        const fechaCorte = fechaCorteValor?.tipo === 'ESCALAR' && fechaCorteValor.valor instanceof Date
          ? fechaCorteValor.valor.toISOString().slice(0, 10)
          : 'sin especificar';

        const partidas = (valorLeido.tipo === 'TABLA' ? valorLeido.filas : []) as FilaPartida[];
        let ajusteBanco = 0;
        let ajusteLibros = 0;
        for (const p of partidas) {
          const monto = Number(p.monto ?? 0) || 0;
          if (!monto) continue;
          const afecta = String(p.afecta ?? '').trim();
          if (afecta === 'Banco') ajusteBanco += monto;
          else if (afecta === 'Libros') ajusteLibros += monto;
          // partidas sin "afecta" declarado no se pueden clasificar — se ignoran
          // del cálculo (no se pierden: siguen visibles en la hoja del auditor).
        }

        const saldoBancoConciliado = saldoBanco + ajusteBanco;
        const saldoLibrosConciliado = saldoLibros + ajusteLibros;
        const diferencia = saldoBancoConciliado - saldoLibrosConciliado;

        const existentes = ctx.filas('S1') as Array<Record<string, unknown>>;
        // Filas de OTRAS fuentes (hallazgos manuales, otras plantillas) se
        // conservan intactas — solo se reemplaza lo que esta plantilla escribió antes.
        const conservadas = existentes.filter(r => r['_excelOrigen'] !== MARCA_ORIGEN);

        if (Math.abs(diferencia) < 0.01) {
          // Conciliación cuadra: no hay nada que reportar. Si una subida
          // anterior sí había dejado una diferencia, esta re-subida la retira.
          return conservadas as unknown as Prisma.InputJsonValue;
        }

        const fila = {
          '_excelOrigen': MARCA_ORIGEN,
          'N°': String(conservadas.length + 1),
          'Área/Cuenta': 'Caja y Bancos — Conciliación Bancaria',
          'Descripción de la diferencia':
            `Diferencia no conciliada en la conciliación bancaria al ${fechaCorte}: `
            + `saldo según banco conciliado $${saldoBancoConciliado.toFixed(2)} vs. `
            + `saldo según libros conciliado $${saldoLibrosConciliado.toFixed(2)}.`,
          'Saldo según cliente ($)': saldoLibrosConciliado.toFixed(2),
          'Saldo según auditor ($)': saldoBancoConciliado.toFixed(2),
          'Diferencia ($)': diferencia.toFixed(2),
          'Naturaleza (Error/Estimación/Fraude/No ajustable)': 'Error',
          'Proponer AJE (Sí/No/Pendiente)': 'Pendiente',
        };

        return [...conservadas, fila] as unknown as Prisma.InputJsonValue;
      },
    },
  ],
};
