import { ExcelTemplateDef, EXCEL_MISMO_PAPEL } from './excel-template.types';

/**
 * Fase 3 del catálogo (§4.2 del documento de diseño): Revisión Analítica —
 * cierra el requisito NIA 520.7 que hoy no se documenta en ningún lado del
 * papel: explicación puntual, por cuenta, de cada variación significativa.
 *
 * Round-trip de `PT-FIN-B07` S1c — una sección NUEVA (no S1). `S1` lo
 * sobrescribe por completo `propagateFinancialAnalysis` cada vez que el
 * auditor pulsa "Propagar desde Balance" (ver `paper-sections.service.ts` —
 * no tiene merge, es un `update` directo); agregar columnas ahí las habría
 * perdido en el primer refresco. S1c vive aparte y esa propagación nunca la
 * toca.
 *
 * Primera plantilla del catálogo que usa `modo: 'FUSIONA_POR_CLAVE'` del
 * motor genérico SIN `transformacion` propia: S1c es un MATRIX plano (sin
 * `id`/`attachments` que fabricar como en Composición de Cuenta), así que el
 * merge nativo por clave alcanza — las columnas CONTROLADAS (código, cuenta,
 * variación %) siempre se refrescan desde S1 en cada descarga; las LIBRE
 * (explicación, es razonable) las conserva el motor automáticamente.
 */

const UMBRAL_VARIACION_PCT = 20; // mismo umbral que ya documenta el aiHint de S1

export const REVISION_ANALITICA_TEMPLATE: ExcelTemplateDef = {
  key: 'REVISION_ANALITICA',
  label: 'Revisión Analítica (NIA 520)',
  descripcion:
    'Trae las variaciones significativas del Análisis Horizontal (S1) para que el auditor documente la explicación obtenida y si es razonable — requisito NIA 520.7.',
  paperCodeAplicable: ['PT-FIN-B07'],
  version: 1,
  hojas: [
    { nombre: 'Explicación de Variaciones', congelarEn: 'A8', anchoColumnas: [12, 32, 14, 45, 22] },
  ],
  origen: [
    {
      rango: {
        rangoNombre: 'AM_Explicaciones', hoja: 'Explicación de Variaciones', ancla: 'A7', zona: 'LIBRE',
        forma: {
          tipo: 'TABLA',
          columnas: [
            { clave: 'codigo',       encabezado: 'Código',                              ancho: 12, zona: 'CONTROLADA' },
            { clave: 'cuenta',       encabezado: 'Cuenta',                               ancho: 32, zona: 'CONTROLADA' },
            { clave: 'variacionPct', encabezado: 'Variación % Actual vs Anterior',       ancho: 14, formato: 'NUMERO', zona: 'CONTROLADA' },
            { clave: 'explicacion',  encabezado: 'Explicación de la variación',          ancho: 45, zona: 'LIBRE' },
            {
              clave: 'esRazonable', encabezado: '¿Es razonable?', ancho: 22, zona: 'LIBRE',
              opciones: ['Sí', 'No', 'Requiere procedimiento adicional'],
            },
          ],
          filasMinimas: 5, filasMaximas: 150,
        },
        etiqueta: `Variaciones significativas (>${UMBRAL_VARIACION_PCT}% y > Materialidad de Ejecución)`,
        nota: 'Código/Cuenta/Variación % se traen de S1 y se refrescan en cada descarga — edite solo Explicación y ¿Es razonable?',
      },
      fuente: async (ctx) => {
        const s1 = ctx.filas('S1');
        const { me } = await ctx.materialidad();
        const significativas = s1.filter(r => {
          const pct = Math.abs(parseFloat(String(r['Variación % Actual vs Anterior'] ?? '')));
          const monto = Math.abs(parseFloat(String(r['Variación $ Actual vs Anterior'] ?? '')));
          if (!Number.isFinite(pct) || pct <= UMBRAL_VARIACION_PCT) return false;
          if (me != null && Number.isFinite(monto) && monto <= me) return false;
          return true;
        });

        // Trae lo que el auditor ya haya documentado en una subida anterior,
        // para que re-descargar no le muestre una hoja en blanco y pierda su
        // propio avance — mismo principio que el round-trip de S7 en fase 1.
        const yaDocumentadas = new Map(
          ctx.filas('S1c').map(r => [String(r['codigo'] ?? '').trim(), r]),
        );

        return significativas.map(r => {
          const codigo = String(r['Código'] ?? '');
          const previa = yaDocumentadas.get(codigo);
          return {
            codigo,
            cuenta: r['Cuenta'],
            variacionPct: r['Variación % Actual vs Anterior'],
            explicacion: previa?.['explicacion'] ?? '',
            esRazonable: previa?.['esRazonable'] ?? '',
          };
        });
      },
    },
  ],
  destino: [
    {
      rangoNombre: 'AM_Explicaciones',
      escribeEn: { paperCode: EXCEL_MISMO_PAPEL, sectionKey: 'S1c' },
      modo: 'FUSIONA_POR_CLAVE',
      claveFusion: 'codigo',
    },
  ],
};
