// Static "how this was calculated" reference text shown via MethodologyInfo.
// Keyed by paperCode → sectionKey. Purely informational — no AI call, no network
// request, so it opens instantly and never errors. Extend this map when adding
// the same explainer to other analytical papers (e.g. PT-FIN-B08, PT-FIN-B09).

export interface MethodologyEntry {
  title: string;
  intro: string;
  points: string[];
}

export const PAPER_METHODOLOGY: Record<string, Record<string, MethodologyEntry>> = {
  'PT-FIN-B07': {
    S1: {
      title: 'Metodología — Análisis Horizontal (NIA 520)',
      intro: 'Compara el saldo de cada cuenta del balance y del estado de resultados entre el período actual, el anterior y el previo a ese, para exponer variaciones que ameriten explicación.',
      points: [
        'Origen de los datos: saldos clasificados propagados desde B-00 (Balance de Comprobación).',
        'Var % = (Saldo Actual − Saldo Anterior) ÷ |Saldo Anterior| × 100. Se calcula igual para el par Anterior vs Año-2.',
        'Tendencia: se determina por el signo y la consistencia de la variación en ambos períodos comparados (↑ Creciente / ↓ Decreciente / → Estable).',
        'Semáforo de atención: se calcula automáticamente por fila tomando la mayor variación % encontrada — rojo si ≥20%, amarillo si ≥10%, verde si es menor. No sustituye el juicio profesional, solo prioriza dónde mirar primero.',
        'Regla de materialidad: conforme NIA 520.5, una variación inusual y no consistente con la expectativa del auditor —especialmente si el monto supera la Materialidad de Ejecución (ME) de A-06/A-04— debe investigarse y documentarse.',
      ],
    },
    S2: {
      title: 'Metodología — Análisis Vertical',
      intro: 'Expresa cada cuenta como porcentaje de un total representativo, para detectar cambios en la estructura financiera relativa del cliente.',
      points: [
        'Balance General: cada cuenta se expresa como % del Total de Activos.',
        'Estado de Resultados: cada cuenta se expresa como % del Total de Ingresos.',
        'Se calcula para el año actual y el año anterior; la columna "Variación pp" es la diferencia en puntos porcentuales entre ambos períodos (no es una variación %, es una resta directa de dos porcentajes).',
        'Una variación mayor a 5 puntos porcentuales en una cuenta amerita explicación — suele señalar reclasificaciones, nuevas líneas de negocio o errores de registro.',
      ],
    },
    S3: {
      title: 'Metodología — Razones Financieras',
      intro: 'Calcula los indicadores estándar de liquidez, endeudamiento, rentabilidad y actividad para el año actual y el anterior, comparándolos contra el período previo y, cuando aplica, contra un benchmark sectorial.',
      points: [
        'Liquidez: Corriente = Activo Corriente / Pasivo Corriente · Ácida = (Activo Corriente − Inventario) / Pasivo Corriente · Inmediata = Caja / Pasivo Corriente.',
        'Endeudamiento: D/E = Pasivo Total / Patrimonio · Cobertura de Intereses = EBIT / Gastos Financieros.',
        'Rentabilidad: ROA = Utilidad Neta / Activo Total · ROE = Utilidad Neta / Patrimonio · Margen Bruto y Margen Neto sobre Ingresos.',
        'Actividad: Rotación de CxC = Ingresos / CxC Promedio (y sus Días = 365 / Rotación) · Rotación de Inventario = Costo de Ventas / Inventario Promedio (y sus Días) · Rotación de CxP = Compras / CxP Promedio (y sus Días).',
        'La dirección "buena" de cada razón depende de su naturaleza (ej. liquidez alta es favorable, pero un D/E alto no lo es) — la columna "Interpretación" documenta el juicio del auditor sobre cada resultado, no se infiere automáticamente.',
      ],
    },
    S4: {
      title: 'Metodología — Procedimientos Sugeridos por Variación',
      intro: 'Traduce las variaciones significativas detectadas en S1 (Horizontal), S2 (Vertical) y S3 (Ratios) en procedimientos sustantivos concretos, referenciados a la NIA aplicable.',
      points: [
        'Cada fila parte de una variación puntual — no es un procedimiento genérico, sino uno diseñado para responder a ese hallazgo específico (NIA 520.7).',
        'La columna "NIA Aplicable" ancla el procedimiento a la norma que lo exige o sustenta (ej. NIA 505 para confirmaciones, NIA 570 para empresa en marcha).',
        '"Transferir a A-08" marca si el procedimiento debe incorporarse formalmente al programa de auditoría — actualmente es una marca manual del auditor (Sí/No), no una transferencia automática.',
      ],
    },
    S5: {
      title: 'Metodología — Indicadores de Riesgo de Fraude (NIA 240)',
      intro: 'Evalúa patrones típicos de manipulación de resultados a partir de las relaciones entre cuentas ya calculadas en S1–S3.',
      points: [
        'Ingresos que crecen desproporcionadamente frente a cuentas por cobrar → posible reconocimiento anticipado de ingresos.',
        'Márgenes inusualmente estables período a período → posible suavización de resultados ("income smoothing").',
        'Concentración de transacciones significativas en el último mes del período → posible "window dressing".',
        'Cambios en políticas contables sin justificación clara, o crecimiento de activos sin respaldo en flujos de efectivo.',
        'Si se activa la presunción de fraude en el reconocimiento de ingresos, debe documentarse expresamente conforme NIA 240.27.',
      ],
    },
    S6: {
      title: 'Metodología — Conclusión de Procedimientos Analíticos (NIA 520)',
      intro: 'Sintetiza el resultado de S1 a S5 en una conclusión única sobre si los procedimientos analíticos preliminares dan soporte suficiente o requieren pruebas adicionales.',
      points: [
        'Distinguir variaciones explicadas (consistentes con la expectativa del auditor) de las inexplicadas (que requieren evidencia adicional).',
        'Señalar las áreas de mayor riesgo que emergieron del análisis, para retroalimentar la evaluación de riesgos de A-05.',
        'Si existen variaciones inexplicadas significativas, describir los procedimientos adicionales diseñados para responder a ellas (NIA 520.7) — normalmente los mismos listados en S4.',
      ],
    },
  },
  'PT-FIN-B08': {
    S1: {
      title: 'Metodología — Diferencias Identificadas (NIA 450)',
      intro: 'Consolida en una sola tabla todas las excepciones detectadas durante la ejecución, tomándolas directamente de la sección S1 de cada papel de prueba sustantiva (C-01..C-14) y de análisis normativo (C-13/C-15) de esta auditoría.',
      points: [
        'Botón "Consolidar Diferencias": recorre S1 de cada PT-FIN-C-SUST y PT-FIN-C-NORM del encargo y copia solo las filas con una diferencia distinta de cero.',
        'De PT-FIN-C-SUST se copia el saldo según cliente, según auditor y la diferencia entre ambos. De PT-FIN-C-NORM (hallazgos de cumplimiento, sin comparación de saldos) se copia el "Impacto potencial en EEFF" como la diferencia.',
        'Tipo: se marca "Por Estimación" cuando la Naturaleza de origen menciona una estimación contable; el resto (errores, fraude, no ajustables, hallazgos normativos) se marca "Factual".',
        'Sobrescribe la tabla completa en cada corrida — no acumula ediciones manuales, porque es un reflejo directo de lo registrado en los papeles de ejecución. Las anotaciones propias del auditor sobre los ajustes viven en S4-S9.',
      ],
    },
    S2: {
      title: 'Metodología — Totales Acumulados vs Materialidad (NIA 450.A16)',
      intro: 'Agrupa las diferencias de S1 en tres categorías (Factual, Por Estimación, Proyectada) y las compara contra la Materialidad de Ejecución (UAE) y la Materialidad Global (MG) definidas en A-06 (PT-A4).',
      points: [
        'Se recalcula junto con S1 al presionar "Consolidar Diferencias" — si A-06 aún no tiene materialidad definida, esta tabla no puede calcularse y se avisa en el mensaje del botón.',
        'La categoría "Proyectada" (incorrecciones extrapoladas de una muestra, NIA 530) queda en cero: ningún papel de ejecución produce hoy ese dato de forma estructurada — hay que completarla manualmente si aplica.',
        '"Total" es la suma de las tres categorías. "¿Supera UAE/MG?" compara ese total contra los umbrales de A-06.',
      ],
    },
    S3: {
      title: 'Metodología — Semáforo de Opinión',
      intro: 'Traduce el total acumulado de S2 en una señal de riesgo para la opinión, ANTES de considerar qué ajustes acepta el cliente.',
      points: [
        'VERDE: total acumulado < UAE. AMARILLO: UAE ≤ total < MG. ROJO: total ≥ MG.',
        'Es un semáforo preliminar/bruto: se calcula sobre el total de diferencias identificadas en S1, no sobre las que finalmente queden "no ajustadas" tras la respuesta del cliente en S5 — esa relación fila-a-fila (qué AJE cubre qué diferencia) no está automatizada.',
        'El auditor debe revisar y, si corresponde, sobrescribir manualmente este valor una vez conocidas las decisiones del cliente sobre cada AJE (S4/S5), antes de fijar la opinión final en S8.',
      ],
    },
  },
};

export function getMethodology(paperCode: string | null | undefined, sectionKey: string): MethodologyEntry | undefined {
  if (!paperCode) return undefined;
  return PAPER_METHODOLOGY[paperCode]?.[sectionKey];
}
