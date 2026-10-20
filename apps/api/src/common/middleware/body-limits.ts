import { json, urlencoded } from 'express';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

// Límite del cuerpo de las peticiones. Express trae 100 KB por defecto, que es poco para el CAATs «Validación DTE»: el navegador
// manda el JSON completo de cada documento (≈5-15 KB cada uno) y un lote real de unos cientos ya lo supera (413 «request entity
// too large»). Se sube SOLO para esa ruta y SOLO si la petición trae un token de sesión con forma de JWT; el resto de la API
// conserva los 100 KB. Es una barrera de forma, no de autenticación: quien valida el token es JwtAuthGuard, que corre después
// de leer el cuerpo. Detrás está nginx (client_max_body_size 50M).

export const DEFAULT_BODY_LIMIT = '100kb';
export const ANALYTICS_BODY_LIMIT = '25mb';
export const ANALYTICS_PATH = '/api/v1/ai/analytics';

const BEARER_JWT = /^Bearer [\w-]+\.[\w-]+\.[\w-]+$/;

/** ¿Esta petición puede mandar un cuerpo grande? Ruta de análisis CAATs + token con forma de JWT. */
export function allowsLargeBody(req: Pick<Request, 'path' | 'headers'>): boolean {
  const auth = req.headers.authorization;
  if (typeof auth !== 'string' || !BEARER_JWT.test(auth)) return false;
  return req.path === ANALYTICS_PATH || req.path.startsWith(`${ANALYTICS_PATH}/`);
}

/**
 * Registra los lectores de cuerpo en lugar de los que Nest trae por defecto (hay que crear la app con `bodyParser: false`).
 * El lector grande va primero: al dejar el cuerpo ya leído, el lector normal de 100 KB lo salta (body-parser ignora lo ya leído).
 */
export function applyBodyParsers(app: { use: (...handlers: RequestHandler[]) => unknown }): void {
  const large = json({ limit: ANALYTICS_BODY_LIMIT });
  app.use((req: Request, res: Response, next: NextFunction) => (allowsLargeBody(req) ? large(req, res, next) : next()));
  app.use(json({ limit: DEFAULT_BODY_LIMIT }));
  app.use(urlencoded({ extended: true, limit: DEFAULT_BODY_LIMIT }));
}
