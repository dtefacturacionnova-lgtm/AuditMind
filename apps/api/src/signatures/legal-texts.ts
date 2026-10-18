/**
 * Textos legales de la firma electrónica simple (docs/firma-externa-por-enlace.md §15).
 *
 * Son constantes VERSIONADAS: cada firma guarda la versión y el texto literal que el firmante
 * vio. Cambiar un texto = crear una versión nueva (v2…) y apuntar la constante vigente a ella;
 * las firmas anteriores conservan el texto con el que se firmaron.
 * Revisión legal recomendada (no bloqueante).
 */

export const CONSENT_VERSION = 'v1';
export const PRIVACY_VERSION = 'v1';

const CONSENT_TEXT_V1 =
  'Declaro que los datos de identificación que ingresé son verdaderos, que leí el documento «{título}» ' +
  'y que lo firmo electrónicamente por mi propia voluntad. Acepto que esta firma electrónica simple, junto ' +
  'con el registro de la fecha y hora, la dirección IP, el navegador utilizado, la verificación de mi correo ' +
  'electrónico y la huella digital (SHA-256) del documento, sirva como constancia de mi firma.';

const PRIVACY_NOTICE_V1 =
  '{Organización} utiliza AuditMind para gestionar esta firma. Para dejar constancia se registran tu nombre, ' +
  'cargo, correo electrónico, dirección IP, navegador, fecha y hora, y los archivos que adjuntes. Estos datos ' +
  'se conservan junto con el documento como evidencia del trabajo de auditoría, durante el plazo de conservación ' +
  'de {Organización}, y solo los consulta su equipo, conforme a la legislación aplicable de protección de datos personales.';

const DECLINE_NOTICE_V1 =
  'Al no firmar, se informará a {Organización} tu decisión y el motivo que escribas.';

/** Sustituye {título} y {Organización}. Los valores se insertan como texto plano (el HTML lo escapa quien lo muestre). */
function fill(template: string, vars: { title?: string; organization?: string }): string {
  // Funciones de reemplazo: un valor con "$&" o "$1" se inserta literal, no como patrón de replace().
  return template
    .replace(/\{título\}/g, () => vars.title ?? '')
    .replace(/\{Organización\}/g, () => vars.organization ?? '');
}

export const renderConsentText = (title: string) => fill(CONSENT_TEXT_V1, { title });
export const renderPrivacyNotice = (organization: string) => fill(PRIVACY_NOTICE_V1, { organization });
export const renderDeclineNotice = (organization: string) => fill(DECLINE_NOTICE_V1, { organization });
