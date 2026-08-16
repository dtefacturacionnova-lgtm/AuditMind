import { ExcelTemplateKey, ExcelTemplateRegistry } from './excel-template.types';
import { COMPOSICION_CUENTA_TEMPLATE } from './composicion-cuenta.template';
import { CONCILIACION_BANCARIA_TEMPLATE } from './conciliacion-bancaria.template';
import { REVISION_ANALITICA_TEMPLATE } from './revision-analitica.template';
import { CIRCULARIZACION_CXC_TEMPLATE } from './circularizacion-cxc.template';
import { ARQUEO_CAJA_TEMPLATE } from './arqueo-caja.template';

/**
 * Registro de plantillas Excel disponibles (EXC-03). Espeja la convención de
 * `PAPER_TEMPLATES` en `paper-templates.ts`: un mapa estático, sin tabla en BD.
 *
 * Catálogo completo (§4): las 5 fases están publicadas — Composición de
 * Cuenta, Conciliación Bancaria, Revisión Analítica, Circularización de CxC
 * y Arqueo de Caja.
 *
 * Nota de alcance conocida: `CONCILIACION_BANCARIA` y `ARQUEO_CAJA` aplican
 * a `PT-FIN-C-SUST`, el mismo paperCode que usan las 14 áreas sustantivas
 * (C-01..C-14) — no hay una señal programática que distinga "esta instancia
 * es Caja y Bancos" de las demás, así que ambos botones se muestran en S1 de
 * CUALQUIER área. El auditor simplemente no los usa si no aplica; una mejora
 * futura sería exponer un `areaTag` en `WorkingPaper` para filtrar esto en la
 * UI. Ambas escriben en S1 con su propio marcador `_excelOrigen` (distinto
 * entre sí), así que pueden coexistir sin pisarse en el mismo papel C-01.
 * `CIRCULARIZACION_CXC` tiene la misma limitación sobre `PT-NIA530 S5` (un
 * solo papel para todo el encargo, no solo CxC) — ver la nota en
 * `circularizacion-cxc.template.ts`.
 */
export const EXCEL_TEMPLATES: Partial<Record<ExcelTemplateKey, ExcelTemplateRegistry[ExcelTemplateKey]>> = {
  COMPOSICION_CUENTA: COMPOSICION_CUENTA_TEMPLATE,
  CONCILIACION_BANCARIA: CONCILIACION_BANCARIA_TEMPLATE,
  REVISION_ANALITICA: REVISION_ANALITICA_TEMPLATE,
  CIRCULARIZACION_CXC: CIRCULARIZACION_CXC_TEMPLATE,
  ARQUEO_CAJA: ARQUEO_CAJA_TEMPLATE,
};

export function getExcelTemplate(key: string) {
  return EXCEL_TEMPLATES[key as ExcelTemplateKey];
}
