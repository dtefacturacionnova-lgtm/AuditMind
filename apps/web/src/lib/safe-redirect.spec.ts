import { DEFAULT_AFTER_LOGIN, safeAfterLoginPath } from './safe-redirect';

describe('safeAfterLoginPath', () => {
  it('rutas del panel pasan tal cual', () => {
    expect(safeAfterLoginPath('/dashboard')).toBe('/dashboard');
    expect(safeAfterLoginPath('/dashboard/audits/123?tab=papers#x')).toBe('/dashboard/audits/123?tab=papers#x');
  });
  it('sin valor: el panel', () => {
    expect(safeAfterLoginPath(null)).toBe(DEFAULT_AFTER_LOGIN);
    expect(safeAfterLoginPath('')).toBe(DEFAULT_AFTER_LOGIN);
  });
  it('nunca otro sitio, javascript: ni rutas fuera del panel', () => {
    for (const bad of [
      'javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'https://evil.example/firmar', '//evil.example', '/\\evil.example',
      '/dashboardx', '/dashboard//evil.example', '/dashboard/\\evil', '/login', '/firmar#token', 'dashboard', ' /dashboard',
      '/dashboard\n/x', 'data:text/html,hola',
    ]) expect({ bad, out: safeAfterLoginPath(bad) }).toEqual({ bad, out: DEFAULT_AFTER_LOGIN });
  });
});
