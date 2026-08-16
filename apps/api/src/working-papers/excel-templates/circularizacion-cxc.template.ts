import { ExcelTemplateDef, EXCEL_MISMO_PAPEL } from './excel-template.types';

/**
 * Fase 4 del catálogo (§4.1): Circularización / Conciliación de CxC — cierra
 * el ciclo de NIA 505 (Confirmaciones Externas) sobre la muestra que NIA 530
 * ya seleccionó: seleccionar (S5 de `PT-NIA530`) → confirmar (esta plantilla,
 * fuera de línea) → recalcular UEL (botón existente de S4, sin tocar).
 *
 * Round-trip de `PT-NIA530 S5` (`SampleItemRegisterPanel.tsx`, tipo
 * `SampleItemRow`) — NO se crea una sección nueva ni se extiende el esquema:
 * los campos que la circularización necesita ya existen en `SampleItemRow`
 * (`descripcion` para la respuesta/nota del cliente o el procedimiento
 * alternativo aplicado, `execRef` para la referencia del papel de ejecución
 * cuando no hubo respuesta, `fecha` para la fecha de respuesta). Igual que en
 * fase 3, es la clave interna (`id`, ya estable y única por ítem) la que
 * permite usar `FUSIONA_POR_CLAVE` nativo sin `transformacion` propia — nunca
 * un campo de negocio, porque `itemRef` no está garantizado único entre áreas
 * distintas dentro de la misma S5.
 *
 * Nota de alcance conocida (mismo patrón que Conciliación Bancaria): `S5` es
 * una sola tabla para TODO el encargo (CxC, CxP, Inventarios, Caja…), no solo
 * C-02 — la plantilla trae TODOS los ítems de la muestra, no solo los de
 * cuentas por cobrar. El auditor solo trabaja las filas que le correspondan;
 * una mejora futura sería filtrar por `areaKey` (el mecanismo ya existe en el
 * motor desde EXC-09, solo falta una UI para elegir el área antes de descargar).
 *
 * La plantilla NO puede crear ítems nuevos: la columna clave (`id`) es interna
 * y CONTROLADA — una fila sin ese valor (todo el relleno de `filasMinimas`) se
 * omite silenciosamente por el motor genérico (`omitidasSinClave`), y una fila
 * con un `id` alterado a mano simplemente no calza con ningún ítem existente y
 * se agregaría como fila nueva sin `attachments` — riesgo aceptado, idéntico al
 * de `codigo`/`accountCode` en las plantillas anteriores, no específico de esta.
 */

export const CIRCULARIZACION_CXC_TEMPLATE: ExcelTemplateDef = {
  key: 'CIRCULARIZACION_CXC',
  label: 'Circularización de Confirmaciones (NIA 505)',
  descripcion:
    'Trae la muestra ya seleccionada en el Registro de Selección de Ítems (S5) para que el auditor registre, fuera de línea, la respuesta de cada cliente confirmado o el procedimiento alternativo aplicado cuando no hubo respuesta.',
  paperCodeAplicable: ['PT-NIA530'],
  version: 1,
  hojas: [
    { nombre: 'Circularización', congelarEn: 'A8', anchoColumnas: [14, 20, 16, 38, 16, 16, 14, 20] },
  ],
  origen: [
    {
      rango: {
        rangoNombre: 'AM_Confirmaciones', hoja: 'Circularización', ancla: 'A7', zona: 'LIBRE',
        forma: {
          tipo: 'TABLA',
          columnas: [
            { clave: 'id',           encabezado: 'ID interno (no editar)',          ancho: 14, zona: 'CONTROLADA' },
            { clave: 'area',         encabezado: 'Área',                             ancho: 20, zona: 'CONTROLADA' },
            { clave: 'itemRef',      encabezado: 'Ítem / Referencia',                ancho: 16, zona: 'CONTROLADA' },
            { clave: 'descripcion',  encabezado: 'Descripción / Respuesta del cliente', ancho: 38, zona: 'LIBRE' },
            { clave: 'bookValue',    encabezado: 'Valor en libros',                  ancho: 16, formato: 'MONEDA', zona: 'CONTROLADA' },
            { clave: 'auditedValue', encabezado: 'Valor confirmado',                 ancho: 16, formato: 'MONEDA', zona: 'LIBRE' },
            { clave: 'fecha',        encabezado: 'Fecha de respuesta',               ancho: 14, formato: 'FECHA', zona: 'LIBRE' },
            { clave: 'execRef',      encabezado: 'Ref. procedimiento alternativo',   ancho: 20, zona: 'LIBRE' },
          ],
          filasMinimas: 5, filasMaximas: 500,
        },
        etiqueta: 'Muestra seleccionada (NIA 530 S5) — un ítem por fila',
        nota: 'Complete Valor confirmado, Descripción/Respuesta, Fecha de respuesta y, si no hubo respuesta, la referencia del procedimiento alternativo aplicado. Las demás columnas se refrescan solas en cada descarga — no las edite.',
      },
      fuente: async (ctx) => ctx.filas('S5'),
    },
  ],
  destino: [
    {
      rangoNombre: 'AM_Confirmaciones',
      escribeEn: { paperCode: EXCEL_MISMO_PAPEL, sectionKey: 'S5' },
      modo: 'FUSIONA_POR_CLAVE',
      claveFusion: 'id',
    },
  ],
};
