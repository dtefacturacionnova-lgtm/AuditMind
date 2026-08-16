import { ExcelTemplateKey, ExcelTemplateRegistry } from './excel-template.types';
import { COMPOSICION_CUENTA_TEMPLATE } from './composicion-cuenta.template';
import { CONCILIACION_BANCARIA_TEMPLATE } from './conciliacion-bancaria.template';
import { REVISION_ANALITICA_TEMPLATE } from './revision-analitica.template';
import { CIRCULARIZACION_CXC_TEMPLATE } from './circularizacion-cxc.template';

/**
 * Registro de plantillas Excel disponibles (EXC-03). Espeja la convención de
 * `PAPER_TEMPLATES` en `paper-templates.ts`: un mapa estático, sin tabla en BD.
 *
 * Fases 1-4 publicadas (Composición de Cuenta, Conciliación Bancaria, Revisión
 * Analítica, Circularización de CxC). La restante del catálogo (§4: Arqueo de
 * Caja) es la fase 5, todavía no construida — agregar una entrada aquí es todo
 * lo que hace falta para publicarla.
 *
 * Nota de alcance conocida: `CONCILIACION_BANCARIA` aplica a `PT-FIN-C-SUST`,
 * el mismo paperCode que usan las 14 áreas sustantivas (C-01..C-14) — no hay
 * una señal programática que distinga "esta instancia es Caja y Bancos" de
 * las demás, así que el botón se muestra en S1 de CUALQUIER área. El auditor
 * simplemente no lo usa si no aplica; una mejora futura sería exponer un
 * `areaTag` en `WorkingPaper` para filtrar esto en la UI. `CIRCULARIZACION_CXC`
 * tiene la misma limitación sobre `PT-NIA530 S5` (un solo papel para todo el
 * encargo, no solo CxC) — ver la nota en `circularizacion-cxc.template.ts`.
 */
export const EXCEL_TEMPLATES: Partial<Record<ExcelTemplateKey, ExcelTemplateRegistry[ExcelTemplateKey]>> = {
  COMPOSICION_CUENTA: COMPOSICION_CUENTA_TEMPLATE,
  CONCILIACION_BANCARIA: CONCILIACION_BANCARIA_TEMPLATE,
  REVISION_ANALITICA: REVISION_ANALITICA_TEMPLATE,
  CIRCULARIZACION_CXC: CIRCULARIZACION_CXC_TEMPLATE,
};

export function getExcelTemplate(key: string) {
  return EXCEL_TEMPLATES[key as ExcelTemplateKey];
}
