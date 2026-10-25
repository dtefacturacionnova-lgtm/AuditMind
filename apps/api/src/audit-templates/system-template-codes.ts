/**
 * Identificadores estables de las plantillas de sistema que el código referencia (`AuditTemplate.code`, único por organización).
 * Revisión de Cartera (2026-10-25): el código existía en el esquema pero ninguna siembra lo escribía, así que en una organización
 * sin ese dato puesto a mano «Aprobar encargo» fallaba con 404.
 */
export const EXTERNAL_FINANCIAL_TEMPLATE_CODE = 'AUDIT_EXTERNAL_FINANCIAL_V1';
export const EXTERNAL_FINANCIAL_TEMPLATE_NAME = 'Auditoría Financiera Externa v1.0';
