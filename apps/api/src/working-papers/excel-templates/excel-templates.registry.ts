import { ExcelTemplateKey, ExcelTemplateRegistry } from './excel-template.types';
import { COMPOSICION_CUENTA_TEMPLATE } from './composicion-cuenta.template';
import { CONCILIACION_BANCARIA_TEMPLATE } from './conciliacion-bancaria.template';
import { REVISION_ANALITICA_TEMPLATE } from './revision-analitica.template';
import { CIRCULARIZACION_CXC_TEMPLATE } from './circularizacion-cxc.template';
import { CONCILIACION_CXC_TEMPLATE } from './conciliacion-cxc.template';
import { ARQUEO_CAJA_TEMPLATE } from './arqueo-caja.template';

/**
 * Registro de plantillas Excel disponibles (EXC-03). Espeja la convención de
 * `PAPER_TEMPLATES` en `paper-templates.ts`: un mapa estático, sin tabla en BD.
 *
 * Catálogo (§4): Composición de Cuenta, Conciliación Bancaria, Revisión
 * Analítica, Circularización de CxC, Conciliación de CxC y Arqueo de Caja.
 *
 * Nota de alcance conocida: `CONCILIACION_BANCARIA`, `ARQUEO_CAJA` y
 * `CONCILIACION_CXC` aplican a `PT-FIN-C-SUST`, el mismo paperCode que usan
 * las 14 áreas sustantivas (C-01..C-14) — no hay una señal programática que
 * distinga "esta instancia es Caja y Bancos"/"es CxC" de las demás, así que
 * las tres se muestran en S1 de CUALQUIER área. El auditor simplemente no
 * usa la que no aplica; una mejora futura sería exponer un `areaTag` en
 * `WorkingPaper` para filtrar esto en la UI. Las tres escriben en S1 con su
 * propio marcador `_excelOrigen` (distinto entre sí), así que coexisten sin
 * pisarse en el mismo papel. `CIRCULARIZACION_CXC` tiene la misma limitación
 * sobre `PT-NIA530 S5` (un solo papel para todo el encargo, no solo CxC) —
 * ver la nota en `circularizacion-cxc.template.ts`.
 */
export const EXCEL_TEMPLATES: Partial<Record<ExcelTemplateKey, ExcelTemplateRegistry[ExcelTemplateKey]>> = {
  COMPOSICION_CUENTA: COMPOSICION_CUENTA_TEMPLATE,
  CONCILIACION_BANCARIA: CONCILIACION_BANCARIA_TEMPLATE,
  REVISION_ANALITICA: REVISION_ANALITICA_TEMPLATE,
  CIRCULARIZACION_CXC: CIRCULARIZACION_CXC_TEMPLATE,
  CONCILIACION_CXC: CONCILIACION_CXC_TEMPLATE,
  ARQUEO_CAJA: ARQUEO_CAJA_TEMPLATE,
};

export function getExcelTemplate(key: string) {
  return EXCEL_TEMPLATES[key as ExcelTemplateKey];
}
