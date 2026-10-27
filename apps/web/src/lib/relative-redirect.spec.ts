import { NextRequest } from 'next/server';
import { publicOrigin, redirectTo } from './relative-redirect';

const h = (o: Record<string, string>) => new Headers(o);
const req = (headers: Record<string, string>) => new NextRequest('https://localhost:3008/dashboard', { headers });

describe('origen público detrás de nginx', () => {
  it('usa el dominio que reenvía nginx, no el origen interno', () => {
    expect(publicOrigin(h({ host: 'auditoria.ianovatechsystems.com', 'x-forwarded-proto': 'https' }), 'https://localhost:3008'))
      .toBe('https://auditoria.ianovatechsystems.com');
    expect(publicOrigin(h({ host: 'a.example.com:8443', 'x-forwarded-proto': 'https' }), 'x')).toBe('https://a.example.com:8443');
  });

  it('x-forwarded-host manda sobre host y con varios valores se toma el primero', () => {
    expect(publicOrigin(h({ host: '127.0.0.1:3008', 'x-forwarded-host': 'app.midominio.com, otro.com', 'x-forwarded-proto': 'https, http' }), 'x'))
      .toBe('https://app.midominio.com');
  });

  it('sin x-forwarded-proto (desarrollo local) conserva el origen de la petición', () => {
    expect(publicOrigin(h({ host: 'localhost:3000' }), 'http://localhost:3000')).toBe('http://localhost:3000');
  });

  it('rechaza un host con forma rara o un protocolo inventado', () => {
    for (const host of ['evil.com/ruta', 'a b.com', 'x.com@evil.com', 'http://evil.com', '']) {
      expect(publicOrigin(h({ host, 'x-forwarded-proto': 'https' }), 'https://seguro.local')).toBe('https://seguro.local');
    }
    expect(publicOrigin(h({ host: 'ok.com', 'x-forwarded-proto': 'javascript' }), 'https://seguro.local')).toBe('https://seguro.local');
  });
});

describe('redirección del middleware', () => {
  it('manda a la misma página pública aunque Next crea estar en localhost:3008', () => {
    const r = redirectTo(req({ host: 'auditoria.ianovatechsystems.com', 'x-forwarded-proto': 'https' }), '/login');
    expect(r.status).toBe(307);
    expect(r.headers.get('location')).toBe('https://auditoria.ianovatechsystems.com/login');
    expect(redirectTo(req({ host: 'auditoria.ianovatechsystems.com', 'x-forwarded-proto': 'https' }), '/dashboard/audits').headers.get('location'))
      .toBe('https://auditoria.ianovatechsystems.com/dashboard/audits');
  });

  it('en desarrollo (sin proxy) sigue yendo al origen de la petición', () => {
    expect(redirectTo(req({}), '/login').headers.get('location')).toBe('https://localhost:3008/login');
  });

  it('rechaza lo que no sea una ruta interna', () => {
    for (const bad of ['https://otro.com', '//otro.com', 'login', '/\\otro', '/a\r\nSet-Cookie: x=1', '']) {
      expect(() => redirectTo(req({}), bad)).toThrow();
    }
  });
});
