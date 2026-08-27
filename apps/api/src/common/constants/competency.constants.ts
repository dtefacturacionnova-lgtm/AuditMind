// NIGC 1 Art. 32(b) / A88-A94 exige que la firma defina y monitoree la
// competencia y la educación profesional continua de su personal, pero el
// estándar no fija un número de horas — cada firma define su propia política.
// 40h/año es el mínimo de referencia por defecto (alineado al esquema CPE del
// IIA para certificación CIA), no un mandato legal de esta jurisdicción.
//
// Vive en `common/` (no en `qaip/`) porque lo consume también
// `portfolio/acceptance.service.ts` (dimensión "Competencia y Recursos" del
// Radar de Aceptación) — evita que PortfolioModule y QaipModule se importen
// circularmente solo por esta constante.
export const DEFAULT_MIN_CPE_HOURS_YEAR = 40;
