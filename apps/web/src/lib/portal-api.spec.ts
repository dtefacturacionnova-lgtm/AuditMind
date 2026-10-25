import { PortalApiError, portalApi, toPortalError } from './portal-api';

/** El token del enlace y la sesión viajan SOLO en cabeceras; nunca en la ruta, la query ni las cookies. */
const TOKEN = 'T'.repeat(43);
const SESSION = 'S'.repeat(43);

function mockFetch(status: number, body: unknown) {
  const fn = jest.fn(async (_url: string, _init: RequestInit) => ({
    ok: status >= 200 && status < 300, status,
    json: async () => body,
  }) as unknown as Response);
  (global as unknown as { fetch: typeof fn }).fetch = fn;
  return fn;
}
const lastCall = (fn: jest.Mock) => ({ url: fn.mock.calls.at(-1)![0] as string, init: fn.mock.calls.at(-1)![1] as RequestInit });

describe('cliente del portal PBC', () => {
  afterEach(() => jest.restoreAllMocks());

  it('la portada y el envío del código llevan el token en la cabecera, nunca en la URL', async () => {
    const fn = mockFetch(200, { orgName: 'D', maskedEmail: 'j•••@c•••.com', expiresAt: null });
    await portalApi.cover(TOKEN);
    let { url, init } = lastCall(fn);
    expect(url).toMatch(/\/pbc-portal$/);
    expect(url).not.toContain(TOKEN);
    expect((init.headers as Record<string, string>)['X-Portal-Token']).toBe(TOKEN);
    expect((init.headers as Record<string, string>)['X-Portal-Session']).toBeUndefined();

    await portalApi.sendOtp(TOKEN);
    ({ url, init } = lastCall(fn));
    expect(url).toMatch(/\/pbc-portal\/otp\/send$/);
    expect(init.method).toBe('POST');
  });

  it('el código viaja en el cuerpo y la sesión SOLO en su cabecera', async () => {
    const fn = mockFetch(200, { sessionToken: SESSION, sessionExpiresAt: 'x' });
    await portalApi.verifyOtp(TOKEN, '123456');
    let { url, init } = lastCall(fn);
    expect(url).not.toContain('123456');
    expect(JSON.parse(init.body as string)).toEqual({ code: '123456' });

    await portalApi.request(TOKEN, SESSION);
    ({ url, init } = lastCall(fn));
    expect(url).toMatch(/\/pbc-portal\/request$/);
    expect(url).not.toContain(SESSION);
    expect((init.headers as Record<string, string>)['X-Portal-Session']).toBe(SESSION);

    await portalApi.post(TOKEN, SESSION, '/message', { content: 'hola' });
    ({ url, init } = lastCall(fn));
    expect(url).toMatch(/\/pbc-portal\/message$/);
    expect((init.headers as Record<string, string>)['X-Portal-Token']).toBe(TOKEN);
    expect((init.headers as Record<string, string>)['X-Portal-Session']).toBe(SESSION);
  });

  it('todas las peticiones salen sin cookies, sin caché y sin Referer', async () => {
    const fn = mockFetch(200, {});
    await portalApi.cover(TOKEN);
    await portalApi.request(TOKEN, SESSION);
    for (const [, init] of fn.mock.calls as [string, RequestInit][]) {
      expect(init.credentials).toBe('omit');
      expect(init.cache).toBe('no-store');
      expect(init.referrerPolicy).toBe('no-referrer');
    }
  });

  it('un error de la API conserva estado, mensaje y la marca del bloqueo definitivo', async () => {
    mockFetch(423, { message: 'Bloqueado', reason: 'locked-permanent' });
    await expect(portalApi.sendOtp(TOKEN)).rejects.toMatchObject({ status: 423, message: 'Bloqueado', reason: 'locked-permanent' });
    mockFetch(400, { message: ['El código son 6 dígitos.', 'otro'] });
    await expect(portalApi.verifyOtp(TOKEN, 'abc')).rejects.toMatchObject({ status: 400, message: 'El código son 6 dígitos. otro' });
  });

  it('sin red responde con estado 0 y un mensaje claro', async () => {
    (global as unknown as { fetch: () => Promise<never> }).fetch = jest.fn(async () => { throw new TypeError('Failed to fetch'); });
    await expect(portalApi.cover(TOKEN)).rejects.toMatchObject({ status: 0 });
  });

  it('toPortalError tolera cuerpos raros', () => {
    expect(toPortalError(500, null)).toBeInstanceOf(PortalApiError);
    expect(toPortalError(500, 'texto').message).toBe('No se pudo completar la operación.');
    expect(toPortalError(401, { message: 'No' }).reason).toBeUndefined();
  });
});
