import { ExcelTemplateKey, ExcelTemplateRegistry } from './excel-template.types';
import { COMPOSICION_CUENTA_TEMPLATE } from './composicion-cuenta.template';

/**
 * Registro de plantillas Excel disponibles (EXC-03). Espeja la convención de
 * `PAPER_TEMPLATES` en `paper-templates.ts`: un mapa estático, sin tabla en BD.
 *
 * Fase 1 (Composición de Cuenta) publicada. Las 5 plantillas restantes del
 * catálogo (§4 del documento de diseño: Conciliación Bancaria, Arqueo de Caja,
 * Revisión Analítica, Circularización de CxC, Conciliación Fiscal) son las
 * fases 2-5, todavía no construidas — agregar una entrada aquí es todo lo que
 * hace falta para publicarlas, el motor y los endpoints ya están listos.
 */
export const EXCEL_TEMPLATES: Partial<Record<ExcelTemplateKey, ExcelTemplateRegistry[ExcelTemplateKey]>> = {
  COMPOSICION_CUENTA: COMPOSICION_CUENTA_TEMPLATE,
};

export function getExcelTemplate(key: string) {
  return EXCEL_TEMPLATES[key as ExcelTemplateKey];
}
