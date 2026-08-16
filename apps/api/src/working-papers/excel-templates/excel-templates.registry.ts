import { ExcelTemplateKey, ExcelTemplateRegistry } from './excel-template.types';
import { COMPOSICION_CUENTA_TEMPLATE } from './composicion-cuenta.template';
import { CONCILIACION_BANCARIA_TEMPLATE } from './conciliacion-bancaria.template';
import { REVISION_ANALITICA_TEMPLATE } from './revision-analitica.template';

/**
 * Registro de plantillas Excel disponibles (EXC-03). Espeja la convención de
 * `PAPER_TEMPLATES` en `paper-templates.ts`: un mapa estático, sin tabla en BD.
 *
 * Fases 1-3 publicadas (Composición de Cuenta, Conciliación Bancaria, Revisión
 * Analítica). Las 2 restantes del catálogo (§4: Circularización de CxC,
 * Arqueo de Caja) son las fases 4-5, todavía no construidas — agregar una
 * entrada aquí es todo lo que hace falta para publicarlas.
 *
 * Nota de alcance conocida: `CONCILIACION_BANCARIA` aplica a `PT-FIN-C-SUST`,
 * el mismo paperCode que usan las 14 áreas sustantivas (C-01..C-14) — no hay
 * una señal programática que distinga "esta instancia es Caja y Bancos" de
 * las demás, así que el botón se muestra en S1 de CUALQUIER área. El auditor
 * simplemente no lo usa si no aplica; una mejora futura sería exponer un
 * `areaTag` en `WorkingPaper` para filtrar esto en la UI.
 */
export const EXCEL_TEMPLATES: Partial<Record<ExcelTemplateKey, ExcelTemplateRegistry[ExcelTemplateKey]>> = {
  COMPOSICION_CUENTA: COMPOSICION_CUENTA_TEMPLATE,
  CONCILIACION_BANCARIA: CONCILIACION_BANCARIA_TEMPLATE,
  REVISION_ANALITICA: REVISION_ANALITICA_TEMPLATE,
};

export function getExcelTemplate(key: string) {
  return EXCEL_TEMPLATES[key as ExcelTemplateKey];
}
