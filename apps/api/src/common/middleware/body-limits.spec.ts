import express from 'express';
import type { AddressInfo } from 'net';
import { allowsLargeBody, applyBodyParsers } from './body-limits';

const JWT = 'Bearer aaaa.bbbb.cccc';

describe('allowsLargeBody', () => {
  const req = (path: string, authorization?: string) => ({ path, headers: authorization === undefined ? {} : { authorization } }) as any;

  it('solo la ruta de análisis con un token con forma de JWT', () => {
    expect(allowsLargeBody(req('/api/v1/ai/analytics/dte_validation', JWT))).toBe(true);
    expect(allowsLargeBody(req('/api/v1/ai/analytics/dte_validation/pdf', JWT))).toBe(true);
  });

  it('sin token, o con un token que no parece JWT, no', () => {
    expect(allowsLargeBody(req('/api/v1/ai/analytics/dte_validation'))).toBe(false);
    expect(allowsLargeBody(req('/api/v1/ai/analytics/dte_validation', 'Bearer abc'))).toBe(false);
    expect(allowsLargeBody(req('/api/v1/ai/analytics/dte_validation', 'Basic aaaa.bbbb.cccc'))).toBe(false);
    expect(allowsLargeBody(req('/api/v1/ai/analytics/dte_validation', 'Bearer a.b.c; drop'))).toBe(false);
  });

  it('el resto de la API conserva el límite normal aunque traiga token', () => {
    expect(allowsLargeBody(req('/api/v1/audits', JWT))).toBe(false);
    expect(allowsLargeBody(req('/api/v1/ai/chat', JWT))).toBe(false);
    expect(allowsLargeBody(req('/api/v1/ai/analytics-otro', JWT))).toBe(false);
    expect(allowsLargeBody(req('/api/v1/signatures/public/x', JWT))).toBe(false);
  });
});

describe('applyBodyParsers (servidor real)', () => {
  let server: import('http').Server;
  let base: string;

  beforeAll(async () => {
    const app = express();
    applyBodyParsers(app);
    app.post('*', (req, res) => res.json({ recibido: JSON.stringify(req.body ?? null).length }));
    // el mismo manejo de errores que Nest: un cuerpo demasiado grande llega como 413
    app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(err.status ?? 500).json({ error: err.type ?? err.message }));
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const post = (path: string, kb: number, authorization?: string) =>
    fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(authorization ? { authorization } : {}) },
      body: JSON.stringify({ records: [{ texto: 'x'.repeat(kb * 1024) }] }),
    });

  it('un lote de 1 MB pasa en la ruta de análisis con token', async () => {
    const res = await post('/api/v1/ai/analytics/dte_validation', 1024, JWT);
    expect(res.status).toBe(200);
    expect((await res.json()).recibido).toBeGreaterThan(1024 * 1024);
  });

  it('esa misma carga se rechaza sin token y en cualquier otra ruta', async () => {
    expect((await post('/api/v1/ai/analytics/dte_validation', 1024)).status).toBe(413);
    expect((await post('/api/v1/audits', 1024, JWT)).status).toBe(413);
  });

  it('las peticiones pequeñas siguen pasando en todas partes', async () => {
    expect((await post('/api/v1/audits', 10, JWT)).status).toBe(200);
    expect((await post('/api/v1/ai/analytics/dte_validation', 10)).status).toBe(200);
  });

  it('la ruta de análisis tiene su propio tope (25 MB)', async () => {
    const res = await post('/api/v1/ai/analytics/dte_validation', 26 * 1024, JWT);
    expect(res.status).toBe(413);
  });
});
