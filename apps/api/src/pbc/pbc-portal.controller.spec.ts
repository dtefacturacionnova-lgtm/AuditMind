/* eslint-disable @typescript-eslint/no-explicit-any */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { PublicThrottlerGuard } from '../signatures/public-throttle';
import { PbcController } from './pbc.controller';
import { PbcPortalController } from './pbc-portal.controller';
import { PbcService } from './pbc.service';

const TOKEN = 'T'.repeat(43);
const XFF = { 'x-forwarded-for': '203.0.113.7' };

function mockService() {
  const fn = (name: string) => jest.fn(async (..._a: any[]) => ({ ok: name }));
  return {
    findByToken: fn('findByToken'), addMessageByToken: fn('addMessageByToken'), submitByToken: fn('submitByToken'),
    getPortalLink: fn('getPortalLink'), regenerateToken: fn('regenerateToken'),
  };
}

async function startApp(limit = 1000) {
  const svc = mockService();
  const moduleRef = await Test.createTestingModule({
    imports: [ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit }])],
    controllers: [PbcPortalController, PbcController],
    providers: [PublicThrottlerGuard, { provide: PbcService, useValue: svc }],
  }).compile();
  const app: INestApplication = moduleRef.createNestApplication();
  app.getHttpAdapter().getInstance().set('trust proxy', 'loopback'); // idéntico a main.ts
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
  app.setGlobalPrefix('api/v1');
  await app.listen(0, '127.0.0.1');
  const base = (await app.getUrl()).replace('[::1]', '127.0.0.1') + '/api/v1';
  return { app, svc, base };
}

const call = (url: string, init: { method?: string; headers?: Record<string, string>; body?: unknown } = {}) =>
  fetch(url, { method: init.method ?? 'GET', headers: { 'content-type': 'application/json', ...init.headers }, body: init.body === undefined ? undefined : JSON.stringify(init.body) });

describe('Portal PBC público · token en cabecera, validación y límite por IP', () => {
  let app: INestApplication; let svc: ReturnType<typeof mockService>; let base: string;
  beforeAll(async () => { ({ app, svc, base } = await startApp()); });
  afterAll(async () => { await app.close(); });
  beforeEach(() => jest.clearAllMocks());

  it('lee el token de la CABECERA X-Portal-Token y responde sin caché', async () => {
    const res = await call(`${base}/pbc-portal`, { headers: { 'x-portal-token': TOKEN, ...XFF } });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(svc.findByToken).toHaveBeenCalledWith(TOKEN);
  });

  it('el token NUNCA se acepta por la ruta ni por la query (las rutas viejas ya no existen)', async () => {
    await call(`${base}/pbc-portal?token=${TOKEN}`, { headers: XFF });
    expect(svc.findByToken).toHaveBeenCalledWith(undefined);
    for (const path of [`/pbc/portal/${TOKEN}`, `/pbc/portal/${TOKEN}/message`, `/pbc-portal/${TOKEN}`]) {
      const res = await call(`${base}${path}`, { method: path.endsWith('message') ? 'POST' : 'GET', headers: XFF, body: path.endsWith('message') ? { content: 'x' } : undefined });
      expect(res.status).toBe(404);
    }
    expect(svc.findByToken).toHaveBeenCalledTimes(1);
    expect(svc.addMessageByToken).not.toHaveBeenCalled();
  });

  it('mensaje y envío: toman el token de la cabecera y validan el cuerpo (largo, tipos, campos de más)', async () => {
    const h = { 'x-portal-token': TOKEN, ...XFF };
    expect((await call(`${base}/pbc-portal/message`, { method: 'POST', headers: h, body: { content: 'Hola', attachmentUrls: ['a.pdf'] } })).status).toBe(201);
    expect(svc.addMessageByToken).toHaveBeenCalledWith(TOKEN, 'Hola', ['a.pdf']);
    expect((await call(`${base}/pbc-portal/message`, { method: 'POST', headers: h, body: { content: '' } })).status).toBe(400);
    expect((await call(`${base}/pbc-portal/message`, { method: 'POST', headers: h, body: { content: 'x'.repeat(5001) } })).status).toBe(400);
    expect((await call(`${base}/pbc-portal/message`, { method: 'POST', headers: h, body: { content: 'ok', attachmentUrls: new Array(11).fill('a') } })).status).toBe(400);
    expect((await call(`${base}/pbc-portal/message`, { method: 'POST', headers: h, body: { content: 'ok', attachmentUrls: ['x'.repeat(501)] } })).status).toBe(400);
    expect((await call(`${base}/pbc-portal/message`, { method: 'POST', headers: h, body: { content: 'ok', organizationId: 'otra' } })).status).toBe(400);
    expect(svc.addMessageByToken).toHaveBeenCalledTimes(1);

    expect((await call(`${base}/pbc-portal/submit`, { method: 'POST', headers: h, body: { auditeeNotes: 'listo', fileUrls: ['f.pdf'] } })).status).toBe(201);
    expect(svc.submitByToken).toHaveBeenCalledWith(TOKEN, ['f.pdf'], 'listo');
    expect((await call(`${base}/pbc-portal/submit`, { method: 'POST', headers: h, body: { auditeeNotes: 'x'.repeat(5001) } })).status).toBe(400);
  });

  it('las rutas del portal son públicas y las del equipo (copiar y regenerar enlace) NO', () => {
    const isPublic = (cls: any, method: string) => Reflect.getMetadata(IS_PUBLIC_KEY, cls.prototype[method]) === true;
    for (const m of ['getRequest', 'addMessage', 'submit']) expect(isPublic(PbcPortalController, m)).toBe(true);
    for (const m of ['getPortalLink', 'regenerateToken', 'findOne', 'create']) expect(isPublic(PbcController, m)).toBe(false);
  });

  it('copiar y regenerar el enlace no se cachean', async () => {
    for (const [method, path] of [['GET', '/pbc/p1/portal-link'], ['POST', '/pbc/p1/regenerate-token']] as const) {
      const res = await call(`${base}${path}`, { method, headers: XFF, body: method === 'POST' ? {} : undefined });
      expect(res.status).toBeLessThan(300);
      expect(res.headers.get('cache-control')).toBe('no-store');
    }
  });
});

describe('Portal PBC público · límite de intentos por IP', () => {
  it('bloquea con 429 al pasar las 30 lecturas por minuto de una IP, sin afectar a otra', async () => {
    const { app, base } = await startApp();
    try {
      const ip = (n: string) => ({ 'x-portal-token': TOKEN, 'x-forwarded-for': n });
      for (let i = 0; i < 30; i++) expect((await call(`${base}/pbc-portal`, { headers: ip('198.51.100.9') })).status).toBe(200);
      const blocked = await call(`${base}/pbc-portal`, { headers: ip('198.51.100.9') });
      expect(blocked.status).toBe(429);
      expect((await blocked.json()).message).toMatch(/Demasiadas solicitudes/);
      // otra IP en la misma ventana sigue pasando
      expect((await call(`${base}/pbc-portal`, { headers: ip('198.51.100.10') })).status).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('las escrituras (mensaje y envío) tienen su propio tope de 10 por minuto', async () => {
    const { app, base } = await startApp();
    try {
      const h = { 'x-portal-token': TOKEN, 'x-forwarded-for': '198.51.100.20' };
      for (let i = 0; i < 10; i++) expect((await call(`${base}/pbc-portal/message`, { method: 'POST', headers: h, body: { content: 'hola' } })).status).toBe(201);
      expect((await call(`${base}/pbc-portal/message`, { method: 'POST', headers: h, body: { content: 'hola' } })).status).toBe(429);
    } finally {
      await app.close();
    }
  });
});
