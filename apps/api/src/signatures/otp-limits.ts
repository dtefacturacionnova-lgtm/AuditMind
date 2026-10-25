/**
 * Parámetros del código de verificación por correo (OTP) y de la sesión corta que se abre al acertarlo.
 * Los comparten la firma por enlace (`signatures/`) y el portal PBC (`pbc/`): viven en un solo archivo para que, si se
 * ajustan, cambien en los dos a la vez (docs/firma-externa-por-enlace.md §6 y docs/portal-pbc-codigo-por-correo.md §2).
 */
export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;

export const OTP_TTL_MS = 10 * 60_000;            // vigencia de un código
export const OTP_MIN_GAP_MS = 60_000;             // espera entre códigos
export const OTP_MAX_SENDS_PER_HOUR = 5;          // códigos por solicitud y hora
export const OTP_MAX_SENDS_PER_DAY = 10;          // códigos por solicitud y día
export const OTP_MAX_FAILS_PER_CODE = 5;          // fallos con un mismo código → se invalida
export const OTP_MAX_FAILS_PER_HOUR = 10;         // fallos por hora → bloqueo
export const OTP_LOCK_MS = HOUR_MS;               // duración del bloqueo
/**
 * Bloqueos acumulados: al tercero el enlace queda inservible hasta que el equipo lo regenere (sin esto se podían probar
 * ~240 códigos por día durante toda la vigencia del enlace).
 */
export const OTP_MAX_LOCKS = 3;
export const SESSION_TTL_MS = 30 * 60_000;        // sesión tras acertar el código, sin extensión
