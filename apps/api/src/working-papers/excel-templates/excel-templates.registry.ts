import { ExcelTemplateKey, ExcelTemplateRegistry } from './excel-template.types';

/**
 * Registro de plantillas Excel disponibles (EXC-03). Espeja la convención de
 * `PAPER_TEMPLATES` en `paper-templates.ts`: un mapa estático, sin tabla en BD.
 *
 * Vacío a propósito — las 6 plantillas del catálogo (§4 del documento de
 * diseño: Composición de Cuenta, Conciliación Bancaria, Arqueo de Caja,
 * Revisión Analítica, Circularización de CxC, Conciliación Fiscal) son las
 * fases 1-5, todavía no construidas. El motor (EXC-01/EXC-02) y los
 * endpoints (EXC-03) ya están listos para recibirlas — agregar una entrada
 * aquí es todo lo que hace falta para publicarla.
 */
export const EXCEL_TEMPLATES: Partial<Record<ExcelTemplateKey, ExcelTemplateRegistry[ExcelTemplateKey]>> = {};

export function getExcelTemplate(key: string) {
  return EXCEL_TEMPLATES[key as ExcelTemplateKey];
}
