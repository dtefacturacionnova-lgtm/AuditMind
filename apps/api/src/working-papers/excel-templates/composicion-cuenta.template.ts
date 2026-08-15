import { Prisma } from '@prisma/client';
import { ExcelTemplateDef, EXCEL_MISMO_PAPEL } from './excel-template.types';

/**
 * Fase 1 del catálogo (§4 del documento de diseño): Composición / Análisis de
 * Cuenta. Round-trips la sección S7 ("Analítica de Cuentas — Desagregación
 * por Cuenta del Mayor", `FieldType.ACCOUNT_SCHEDULE`) de `PT-FIN-C-SUST`.
 *
 * Diseño: S7 ya vive en la app como una cédula libre por fila (`AccountScheduleRow`
 * en `apps/web/.../AccountScheduleSection.tsx`) donde NINGÚN campo es "decidido
 * por el sistema" — hasta el saldo es algo que el auditor transcribe y verifica
 * contra el TB, no un valor que la app imponga. Por eso esta plantilla no tiene
 * columnas CONTROLADAS: la hoja "Cédula" es de trabajo libre completo, y el TB
 * se ofrece aparte como hoja de solo consulta (nunca se lee de vuelta).
 *
 * `transformacion` hace su propio merge por `accountCode` en vez de usar
 * `modo: 'FUSIONA_POR_CLAVE'` del motor: una fila NUEVA de `AccountScheduleRow`
 * necesita `id` y `attachments` que el motor genérico no conoce — el merge
 * genérico por clave no sabe fabricar esos campos para filas nuevas sin arriesgar
 * pisarlos en filas ya existentes. Se implementa aquí, con acceso a la fila
 * completa existente vía `ctx.filas('S7')`.
 */
export const COMPOSICION_CUENTA_TEMPLATE: ExcelTemplateDef = {
  key: 'COMPOSICION_CUENTA',
  label: 'Composición de Cuenta',
  descripcion:
    'Desglosa el saldo del área por cuenta del mayor. Trae la Analítica de Cuentas (S7) tal cual está, se trabaja fuera de línea y se sube de vuelta — nunca borra adjuntos ni otras filas.',
  paperCodeAplicable: ['PT-FIN-C-SUST'],
  version: 1,
  hojas: [
    { nombre: 'Cédula', congelarEn: 'A8', anchoColumnas: [16, 30, 16, 14, 18, 10, 45] },
    { nombre: 'Saldos TB', congelarEn: 'A3', anchoColumnas: [14, 35, 16, 16, 16] },
  ],
  origen: [
    {
      rango: {
        rangoNombre: 'AM_Cedula', hoja: 'Cédula', ancla: 'A7', zona: 'LIBRE',
        forma: {
          tipo: 'TABLA',
          columnas: [
            { clave: 'accountCode', encabezado: 'Cuenta', ancho: 16, ayuda: 'Código de la cuenta del mayor — consulte la hoja "Saldos TB" para verlas todas.' },
            { clave: 'accountName', encabezado: 'Nombre de la cuenta', ancho: 30 },
            { clave: 'balanceCurrent', encabezado: 'Saldo al cierre', ancho: 16, formato: 'MONEDA' },
            { clave: 'adjustments', encabezado: 'Ajustes', ancho: 14, formato: 'MONEDA' },
            { clave: 'reclassifications', encabezado: 'Reclasificaciones', ancho: 18, formato: 'MONEDA' },
            { clave: 'tickMark', encabezado: 'Marca', ancho: 10, opciones: ['✓', 'Σ', 'C', 'A', 'E', 'R', '✕', '—'] },
            { clave: 'notes', encabezado: 'Notas', ancho: 45 },
          ],
          filasMinimas: 15, filasMaximas: 300,
        },
        etiqueta: 'Analítica de Cuentas (S7)',
        nota: 'Una fila por cuenta del mayor. Filas ya existentes se pre-llenan; agregue nuevas al final con su Cuenta.',
      },
      fuente: (ctx) => ctx.filas('S7'),
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
        nota: 'Solo consulta. Esta hoja no se lee de vuelta al subir el archivo.',
      },
      fuente: async (ctx) => await ctx.saldosTB(),
    },
  ],
  destino: [
    {
      rangoNombre: 'AM_Cedula',
      escribeEn: { paperCode: EXCEL_MISMO_PAPEL, sectionKey: 'S7' },
      transformacion: (valorLeido, ctx) => {
        const filasExcel = valorLeido.tipo === 'TABLA' ? valorLeido.filas : [];
        const existentes = ctx.filas('S7') as Array<Record<string, unknown>>;
        const porCodigo = new Map(
          existentes.map(r => [String(r.accountCode ?? '').trim(), r]),
        );
        const usados = new Set<string>();
        const resultado: Array<Record<string, unknown>> = [];

        // Celda en blanco en una fila YA existente = "el auditor no la tocó" → se
        // conserva el valor previo, nunca se resetea a 0/''. Solo una fila NUEVA
        // (sin `previa`) usa el default. Sin esto, re-subir un archivo donde el
        // auditor solo editó UNA columna borraría silenciosamente las demás.
        const strOr = (v: unknown, fallback: string): string =>
          (v === null || v === undefined) ? fallback : String(v);
        const numOr = (v: unknown, fallback: number): number =>
          (v === null || v === undefined || v === '') ? fallback : (Number(v) || 0);

        for (const fila of filasExcel) {
          const codigo = String(fila.accountCode ?? '').trim();
          if (!codigo) continue; // fila en blanco (relleno de filasMinimas) — se ignora, no es un error
          usados.add(codigo);
          const previa = porCodigo.get(codigo);
          resultado.push({
            id:                previa?.id ?? `excel-${codigo}`,
            attachments:       previa?.attachments ?? [],
            accountCode:       codigo,
            accountName:       strOr(fila.accountName, String(previa?.accountName ?? '')),
            balanceCurrent:    numOr(fila.balanceCurrent, Number(previa?.balanceCurrent ?? 0) || 0),
            adjustments:       numOr(fila.adjustments, Number(previa?.adjustments ?? 0) || 0),
            reclassifications: numOr(fila.reclassifications, Number(previa?.reclassifications ?? 0) || 0),
            tickMark:          strOr(fila.tickMark, String(previa?.tickMark ?? '')),
            notes:             strOr(fila.notes, String(previa?.notes ?? '')),
          });
        }

        // Cuentas que ya estaban en S7 y el auditor no tocó en esta subida se conservan tal cual.
        for (const [codigo, fila] of porCodigo) {
          if (!usados.has(codigo)) resultado.push(fila);
        }

        return resultado as unknown as Prisma.InputJsonValue;
      },
    },
  ],
};
