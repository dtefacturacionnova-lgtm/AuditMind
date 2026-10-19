/**
 * Token de un enlace público que llega en el FRAGMENTO de la URL (`/firmar#<token>`, `/portal#<token>`).
 * El fragmento no viaja al servidor ni a los logs de nginx, ni sale en el Referer. Se lee UNA vez, se borra de la barra
 * de direcciones y del historial de la PESTAÑA al instante, y vive solo en memoria: recargar la página lo pierde a
 * propósito (hay que volver a abrir el enlace del correo).
 *
 * Límite conocido (revisión de seguridad F5b, 2026-10-19): el historial GLOBAL del navegador (y su sincronización)
 * guarda la URL tal como se abrió, con el fragmento. En un equipo compartido, otra persona podría reabrir el enlace desde
 * el autocompletado. En /firmar eso no basta: hace falta además el código que llega al correo. El portal PBC no tiene
 * ese segundo paso: ahí el resguardo es el vencimiento del enlace y «Regenerar enlace».
 *
 * Se borra DOS veces: el efecto de un componente hijo corre antes que el del router de Next 15, que apenas entonces
 * envuelve `history.replaceState` para sincronizar su propia copia de la URL. Con una sola llamada el router conserva la
 * URL con el `#token` y la reescribe en la barra ante cualquier actualización suya (se reprodujo con una recarga en
 * caliente). Ver el Fix 41 de la memoria del proyecto.
 */
export const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;

export type FragmentWindow = {
  location: { hash: string; pathname: string; search: string };
  history: { replaceState: (data: unknown, unused: string, url?: string | null) => void };
  setTimeout: (handler: () => void, ms: number) => unknown;
};

export type FragmentToken =
  | { kind: 'missing' }
  | { kind: 'malformed' }
  | { kind: 'ok'; token: string };

export function captureFragmentToken(win: FragmentWindow = window as unknown as FragmentWindow): FragmentToken {
  const fragment = win.location.hash.replace(/^#/, '');
  if (!fragment) return { kind: 'missing' };

  const clean = win.location.pathname + win.location.search;
  win.history.replaceState(null, '', clean);
  win.setTimeout(() => win.history.replaceState(null, '', clean), 0);

  // El formato se comprueba en el navegador: basura no se manda al servidor.
  return TOKEN_FORMAT.test(fragment) ? { kind: 'ok', token: fragment } : { kind: 'malformed' };
}
