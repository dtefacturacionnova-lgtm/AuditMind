import { CATALOG_REVALIDATE_SECONDS, CATALOG_TIMEOUT_MS, loadPublicCatalog } from './load-public-catalog';

const catalog = { currency: 'USD', plans: [{ code: 'P', name: 'Plan', audience: 'PERSONA', prices: [{ months: 1, priceUsd: 10 }] }], packs: [], contact: { email: null, whatsapp: null } };
const reply = (status: number, body?: unknown, json = true): Response => ({
  status, ok: status >= 200 && status < 300, json: async () => { if (!json) throw new SyntaxError('no es JSON'); return body; },
} as Response);

describe('loadPublicCatalog', () => {
  it('lee el catálogo y lo deja listo para pintar', async () => {
    const f = jest.fn(async () => reply(200, catalog));
    const r = await loadPublicCatalog('https://api.auditmind.test/api/v1', f as never);
    expect(r).not.toBeNull();
    expect(r).not.toBe('DISABLED');
    expect((r as { plans: Array<{ code: string }> }).plans.map((p) => p.code)).toEqual(['P']);
  });

  it('pide la dirección correcta, sin cookies ni credenciales, con plazo y guardando la respuesta 60 segundos', async () => {
    const f = jest.fn(async () => reply(200, catalog));
    await loadPublicCatalog('https://api.auditmind.test/api/v1///', f as never);
    const [url, init] = f.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(url).toBe('https://api.auditmind.test/api/v1/public/plans');
    expect(init.credentials).toBe('omit');
    expect(init.headers).toEqual({ Accept: 'application/json' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.next).toEqual({ revalidate: CATALOG_REVALIDATE_SECONDS });
    expect(CATALOG_TIMEOUT_MS).toBe(5000);
    expect(CATALOG_REVALIDATE_SECONDS).toBe(60);
    expect(Object.keys(init)).not.toContain('body');
    expect(JSON.stringify(init.headers)).not.toMatch(/authorization|cookie/i);
  });

  it('404 = la página de precios no está publicada', async () => {
    expect(await loadPublicCatalog('http://x/api', jest.fn(async () => reply(404)) as never)).toBe('DISABLED');
  });

  it('una respuesta con error NO se usa aunque traiga un catálogo en el cuerpo (por ejemplo, una página de error que lo imita)', async () => {
    for (const status of [400, 401, 403, 429, 500, 503]) {
      expect(await loadPublicCatalog('http://x/api', jest.fn(async () => reply(status, catalog)) as never)).toBeNull();
    }
  });

  it('errores del servidor, límite de uso o respuestas raras dan null (nunca una excepción)', async () => {
    for (const status of [429, 500, 502, 503]) expect(await loadPublicCatalog('http://x/api', jest.fn(async () => reply(status)) as never)).toBeNull();
    expect(await loadPublicCatalog('http://x/api', jest.fn(async () => reply(200, undefined, false)) as never)).toBeNull(); // no es JSON
    expect(await loadPublicCatalog('http://x/api', jest.fn(async () => reply(200, { nada: 1 })) as never)).toBeNull(); // no es un catálogo
    expect(await loadPublicCatalog('http://x/api', jest.fn(async () => reply(200, null)) as never)).toBeNull();
  });

  it('API caído, sin red o con tiempo agotado: null', async () => {
    expect(await loadPublicCatalog('http://x/api', jest.fn(async () => { throw new TypeError('fetch failed'); }) as never)).toBeNull();
    expect(await loadPublicCatalog('http://x/api', jest.fn(async () => { throw new DOMException('timeout', 'TimeoutError'); }) as never)).toBeNull();
  });
});
