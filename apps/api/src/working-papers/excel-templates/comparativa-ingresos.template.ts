import { Prisma } from '@prisma/client';
import { ExcelTemplateDef, EXCEL_MISMO_PAPEL } from './excel-template.types';

/**
 * Comparativa de Ingresos — cruce mensual de 4 fuentes independientes de la
 * cifra de ventas. Papel base: `PT-FIN-C-SUST` (misma nota de alcance que el
 * resto del catálogo: se muestra en S1 de cualquier instancia de C-SUST, no
 * solo la del área de Ingresos).
 *
 * Contenido inspirado en un workpaper real que compartió el usuario (E100.02
 * Comparativa de ingresos): 12 filas fijas (una por mes) × 4 fuentes
 * (Declaración de IVA, Registros de IVA, Contabilidad, Pago a Cuenta de
 * renta) — el motor calcula 3 diferencias encadenadas por mes, no confía en
 * ninguna fórmula que el auditor haya dejado en el archivo:
 *   A) Registros de IVA vs. Declaración de IVA — lo que el libro de ventas
 *      registra vs. lo efectivamente declarado al fisco.
 *   B) Contabilidad vs. Registros de IVA — el mayor contable vs. el libro de
 *      IVA (completitud/oportunidad del registro de ventas).
 *   C) Contabilidad vs. Pago a Cuenta — el mayor contable vs. la base usada
 *      para el pago a cuenta de renta.
 * Si cualquiera de las 3 difiere en un mes, se documentan juntas en una sola
 * fila de ese mes (mismo patrón que Prueba de PPE) — no una fila por cheque
 * de diferencia, para no inundar Diferencias Identificadas.
 *
 * Fuera de alcance a propósito (v1): la fila "TOTALES" anual que trae el
 * workpaper de referencia, y la 4ª diferencia cruzada (Declaración de IVA
 * vs. Pago a Cuenta) — es redundante una vez que A+B+C ya encadenan las 4
 * cifras, y sumar una 4ª combinación no aporta información nueva.
 */

const MARCA_ORIGEN = 'COMPARATIVA_INGRESOS';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

interface FilaMes {
  mes?: unknown;
  declaracionIva?: unknown;
  registrosIva?: unknown;
  contabilidad?: unknown;
  pagoACuenta?: unknown;
}

export const COMPARATIVA_INGRESOS_TEMPLATE: ExcelTemplateDef = {
  key: 'COMPARATIVA_INGRESOS',
  label: 'Comparativa de Ingresos',
  descripcion:
    'Cruza mes a mes la cifra de ventas según la Declaración de IVA, los Registros de IVA, la Contabilidad y el Pago a Cuenta de renta. Si un mes tiene diferencia entre cualquiera de las 4 fuentes, se registra automáticamente en Diferencias Identificadas (S1).',
  paperCodeAplicable: ['PT-FIN-C-SUST'],
  version: 1,
  hojas: [
    { nombre: 'Comparativa', congelarEn: 'A8', anchoColumnas: [14, 18, 18, 18, 18] },
    { nombre: 'Saldos TB', congelarEn: 'A3', anchoColumnas: [14, 35, 16, 16, 16] },
  ],
  origen: [
    {
      rango: {
        rangoNombre: 'AM_Comparativa', hoja: 'Comparativa', ancla: 'A7', zona: 'LIBRE',
        forma: {
          tipo: 'TABLA',
          columnas: [
            { clave: 'mes', encabezado: 'Mes', ancho: 14, zona: 'CONTROLADA' },
            { clave: 'declaracionIva', encabezado: 'Declaración de IVA ($)', ancho: 18, formato: 'MONEDA' },
            { clave: 'registrosIva', encabezado: 'Registros de IVA ($)', ancho: 18, formato: 'MONEDA' },
            { clave: 'contabilidad', encabezado: 'Contabilidad ($)', ancho: 18, formato: 'MONEDA' },
            { clave: 'pagoACuenta', encabezado: 'Pago a Cuenta ($)', ancho: 18, formato: 'MONEDA' },
          ],
          filasMinimas: 12, filasMaximas: 12,
        },
        etiqueta: 'Ventas mensuales según 4 fuentes independientes',
        nota: 'Complete la cifra de cada fuente para cada mes. No agregue ni quite filas — los 12 meses son fijos. Deje en 0 los meses sin actividad.',
      },
      fuente: () => MESES.map(mes => ({ mes })),
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
      rangoNombre: 'AM_Comparativa',
      escribeEn: { paperCode: EXCEL_MISMO_PAPEL, sectionKey: 'S1' },
      transformacion: (valorLeido, ctx) => {
        const filas = (valorLeido.tipo === 'TABLA' ? valorLeido.filas : []) as FilaMes[];
        const existentes = ctx.filas('S1') as Array<Record<string, unknown>>;
        // Filas de OTRAS fuentes (hallazgos manuales, otras plantillas, evidencia
        // de campo) se conservan intactas — solo se reemplaza lo que ESTA
        // plantilla escribió antes.
        const conservadas = existentes.filter(r => r['_excelOrigen'] !== MARCA_ORIGEN);
        const nuevas: Array<Record<string, unknown>> = [];
        let seq = conservadas.length;

        for (const f of filas) {
          const mes = String(f.mes ?? '').trim();
          if (!mes) continue;

          const declaracionIva = Number(f.declaracionIva ?? 0) || 0;
          const registrosIva = Number(f.registrosIva ?? 0) || 0;
          const contabilidad = Number(f.contabilidad ?? 0) || 0;
          const pagoACuenta = Number(f.pagoACuenta ?? 0) || 0;

          const difA = registrosIva - declaracionIva;
          const difB = contabilidad - registrosIva;
          const difC = contabilidad - pagoACuenta;

          const huboA = Math.abs(difA) >= 0.01;
          const huboB = Math.abs(difB) >= 0.01;
          const huboC = Math.abs(difC) >= 0.01;
          if (!huboA && !huboB && !huboC) continue; // las 4 fuentes cuadran ese mes — nada que reportar

          const partes: string[] = [];
          if (huboA) {
            partes.push(
              `Registros de IVA ($${registrosIva.toFixed(2)}) no cuadra con la Declaración de IVA ($${declaracionIva.toFixed(2)})`,
            );
          }
          if (huboB) {
            partes.push(
              `Contabilidad ($${contabilidad.toFixed(2)}) no cuadra con Registros de IVA ($${registrosIva.toFixed(2)})`,
            );
          }
          if (huboC) {
            partes.push(
              `Contabilidad ($${contabilidad.toFixed(2)}) no cuadra con el Pago a Cuenta ($${pagoACuenta.toFixed(2)})`,
            );
          }

          // Una sola cifra resumen para las columnas estándar de Diferencias
          // Identificadas — se usa la primera verificación que falló; el
          // detalle completo de las que fallaron vive en la descripción.
          const [saldoCliente, saldoAuditor, diferencia] = huboA
            ? [declaracionIva, registrosIva, difA]
            : huboB
              ? [registrosIva, contabilidad, difB]
              : [pagoACuenta, contabilidad, difC];

          seq++;
          nuevas.push({
            '_excelOrigen': MARCA_ORIGEN,
            'N°': String(seq),
            'Área/Cuenta': `Ingresos — ${mes}`,
            'Descripción de la diferencia': `En ${mes}, ${partes.join('; y ')}.`,
            'Saldo según cliente ($)': saldoCliente.toFixed(2),
            'Saldo según auditor ($)': saldoAuditor.toFixed(2),
            'Diferencia ($)': diferencia.toFixed(2),
            'Naturaleza (Error/Estimación/Fraude/No ajustable)': 'Error',
            'Proponer AJE (Sí/No/Pendiente)': 'Pendiente',
          });
        }

        return [...conservadas, ...nuevas] as unknown as Prisma.InputJsonValue;
      },
    },
  ],
};
