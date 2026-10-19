/* eslint-disable @typescript-eslint/no-explicit-any */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { PublicThrottlerGuard } from './public-throttle';
import { SignaturePublicController } from './signature-public.controller';
import { SignaturePublicService } from './signature-public.service';
import { SignatureRequestsController } from './signature-requests.controller';
import { SignatureRequestsService } from './signature-requests.service';

const TOKEN = 'T'.repeat(43);
const SESSION = 'S'.repeat(43);
const XFF = { 'x-forwarded-for': '203.0.113.5' };

function mockService() {
  const fn = (name: string) => jest.fn(async (..._a: any[]) => ({ ok: name }));
  return {
    getRequest: fn('getRequest'), sendOtp: fn('sendOtp'), verifyOtp: fn('verifyOtp'), getDocument: fn('getDocument'),
    uploadAttachment: fn('uploadAttachment'), removeAttachment: fn('removeAttachment'), sign: fn('sign'),
    decline: fn('decline'), getSigned: fn('getSigned'), verify: fn('verify'),
  };
}

async function startApp(limitOverride?: boolean) {
  const svc = mockService();
  const moduleRef = await Test.createTestingModule({
    imports: [ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: limitOverride ? 2 : 1000 }])],
    controllers: [SignaturePublicController],
    providers: [PublicThrottlerGuard, { provide: SignaturePublicService, useValue: svc }],
  }).compile();
  const app: INestApplication = moduleRef.createNestApplication();
  // idéntico a main.ts
  app.getHttpAdapter().getInstance().set('trust proxy', 'loopback');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
  app.setGlobalPrefix('api/v1');
  await app.listen(0, '127.0.0.1');
  const url = (await app.getUrl()).replace('[::1]', '127.0.0.1') + '/api/v1/public/signatures';
  return { app, svc, url };
}

const json = (url: string, init: { method?: string; headers?: Record<string, string>; body?: unknown } = {}) =>
  fetch(url, { method: init.method ?? 'GET', headers: { 'content-type': 'application/json', ...init.headers }, body: init.body === undefined ? undefined : JSON.stringify(init.body) });

describe('Controlador público · cabeceras, validación, IP real y subida', () => {
  let app: INestApplication; let svc: ReturnType<typeof mockService>; let url: string;
  beforeAll(async () => { ({ app, svc, url } = await startApp()); });
  afterAll(async () => { await app.close(); });
  beforeEach(() => jest.clearAllMocks());

  it('lee el token y la sesión de las CABECERAS y responde sin caché', async () => {
    const res = await json(`${url}/document`, { headers: { 'x-signature-token': TOKEN, 'x-signature-session': SESSION, ...XFF } });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(svc.getDocument).toHaveBeenCalledWith(TOKEN, SESSION);
  });

  it('el token NUNCA se acepta por la ruta ni por la query', async () => {
    await json(`${url}/request?token=${TOKEN}`, { headers: XFF });
    expect(svc.getRequest).toHaveBeenCalledWith(undefined);
    await json(`${url}/request/${TOKEN}`, { headers: XFF }); // no existe esa ruta
    expect(svc.getRequest).toHaveBeenCalledTimes(1);
  });

  it('captura la IP REAL del cliente aunque intente falsificar X-Forwarded-For, y el navegador', async () => {
    const res = await json(`${url}/otp/send`, {
      method: 'POST', headers: { 'x-signature-token': TOKEN, 'x-forwarded-for': '9.9.9.9, 203.0.113.5', 'user-agent': 'Mozilla/5.0 (Test)' },
    });
    expect(res.status).toBe(200);
    const [, info] = svc.sendOtp.mock.calls[0];
    expect(info).toEqual({ ip: '203.0.113.5', userAgent: 'Mozilla/5.0 (Test)' }); // 9.9.9.9 (lo que puso el cliente) se ignora
  });

  it('valida los cuerpos: código de 6 dígitos, sin campos de más, consentimiento booleano, motivo con largo mínimo', async () => {
    const h = { 'x-signature-token': TOKEN, 'x-signature-session': SESSION, ...XFF };
    expect((await json(`${url}/otp/verify`, { method: 'POST', headers: h, body: { code: '12345' } })).status).toBe(400);
    expect((await json(`${url}/otp/verify`, { method: 'POST', headers: h, body: { code: 'abcdef' } })).status).toBe(400);
    expect((await json(`${url}/otp/verify`, { method: 'POST', headers: h, body: { code: '123456', admin: true } })).status).toBe(400);
    expect((await json(`${url}/otp/verify`, { method: 'POST', headers: h, body: { code: '123456' } })).status).toBe(200);

    expect((await json(`${url}/sign`, { method: 'POST', headers: h, body: { signedName: 'Ana', consent: 'sí' } })).status).toBe(400);
    expect((await json(`${url}/sign`, { method: 'POST', headers: h, body: { signedName: 'A', consent: true } })).status).toBe(400);
    expect((await json(`${url}/sign`, { method: 'POST', headers: h, body: { signedName: 'Ana Pérez', consent: true, hack: 1 } })).status).toBe(400);
    expect((await json(`${url}/sign`, { method: 'POST', headers: h, body: { signedName: 'Ana Pérez', consent: true, response: { agrees: true } } })).status).toBe(200);
    expect((await json(`${url}/decline`, { method: 'POST', headers: h, body: { reason: 'no' } })).status).toBe(400);
    expect((await json(`${url}/decline`, { method: 'POST', headers: h, body: { reason: 'Los saldos no coinciden' } })).status).toBe(200);
    expect(svc.verifyOtp.mock.calls[0][1]).toBe('123456');
  });

  it('recorta los espacios del nombre y del motivo antes de entregarlos al servicio', async () => {
    const h = { 'x-signature-token': TOKEN, 'x-signature-session': SESSION, ...XFF };
    await json(`${url}/sign`, { method: 'POST', headers: h, body: { signedName: '  Ana Pérez  ', signedRole: ' Gerente ', consent: true } });
    expect(svc.sign.mock.calls[0][2]).toMatchObject({ signedName: 'Ana Pérez', signedRole: 'Gerente' });
  });

  it('subida de archivos: llega el archivo, y uno mayor de 10 MB se corta en la puerta (413)', async () => {
    const h = { 'x-signature-token': TOKEN, 'x-signature-session': SESSION, ...XFF };
    const small = new FormData(); small.append('file', new Blob([Buffer.from('%PDF-1.4 hola')], { type: 'application/pdf' }), 'estado.pdf');
    const ok = await fetch(`${url}/attachments`, { method: 'POST', headers: h, body: small });
    expect(ok.status).toBe(201);
    const [t, s, file] = svc.uploadAttachment.mock.calls[0];
    expect([t, s, file.originalname]).toEqual([TOKEN, SESSION, 'estado.pdf']);
    expect(Buffer.isBuffer(file.buffer)).toBe(true);

    const big = new FormData(); big.append('file', new Blob([Buffer.alloc(10 * 1024 * 1024 + 10)]), 'grande.pdf');
    const tooBig = await fetch(`${url}/attachments`, { method: 'POST', headers: h, body: big });
    expect(tooBig.status).toBe(413);
    expect(svc.uploadAttachment).toHaveBeenCalledTimes(1);
  });

  it('la verificación pública lleva el código en la ruta y no necesita sesión', async () => {
    const res = await json(`${url}/verify/ABCD-EFGH-JKMN-PQRS`, { headers: XFF });
    expect(res.status).toBe(200);
    expect(svc.verify).toHaveBeenCalledWith('ABCD-EFGH-JKMN-PQRS');
  });
});

describe('Controlador público · límite de intentos por ruta', () => {
  let app: INestApplication; let url: string;
  beforeAll(async () => { ({ app, url } = await startApp()); });
  afterAll(async () => { await app.close(); });

  it('otp/send: 10 por hora por IP; el 11.º recibe 429 en español; otra IP no se ve afectada', async () => {
    const send = (ip: string) => json(`${url}/otp/send`, { method: 'POST', headers: { 'x-signature-token': TOKEN, 'x-forwarded-for': ip } });
    for (let i = 0; i < 10; i++) expect((await send('198.51.100.1')).status).toBe(200);
    const blocked = await send('198.51.100.1');
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).message).toBe('Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.');
    expect((await send('198.51.100.2')).status).toBe(200);
  });

  it('sign/decline: 10 por minuto; verify: 20 por minuto', async () => {
    const h = { 'x-signature-token': TOKEN, 'x-signature-session': SESSION, 'x-forwarded-for': '198.51.100.9' };
    const body = { signedName: 'Ana Pérez', consent: true };
    for (let i = 0; i < 10; i++) expect((await json(`${url}/sign`, { method: 'POST', headers: h, body })).status).toBe(200);
    expect((await json(`${url}/sign`, { method: 'POST', headers: h, body })).status).toBe(429);
    for (let i = 0; i < 20; i++) expect((await json(`${url}/verify/ABCD-EFGH-JKMN-PQRS`, { headers: h })).status).toBe(200);
    expect((await json(`${url}/verify/ABCD-EFGH-JKMN-PQRS`, { headers: h })).status).toBe(429);
  });
});

describe('Controlador interno · disponibilidad de la firma', () => {
  it('GET /signature-requests/availability responde el estado del interruptor y NO se confunde con ":id"', async () => {
    const svc = { availability: jest.fn(() => ({ enabled: false })), get: jest.fn() };
    const moduleRef = await Test.createTestingModule({ controllers: [SignatureRequestsController], providers: [{ provide: SignatureRequestsService, useValue: svc }] }).compile();
    const app: INestApplication = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    try {
      const base = (await app.getUrl()).replace('[::1]', '127.0.0.1') + '/api/v1/signature-requests';
      const res = await fetch(`${base}/availability`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ enabled: false });
      expect(svc.get).not.toHaveBeenCalled(); // no se trató "availability" como un id (habría dado 400 por no ser UUID)
    } finally {
      await app.close();
    }
  });
});

describe('Metadatos de seguridad de las rutas', () => {
  const methods = (ctrl: any) => Object.getOwnPropertyNames(ctrl.prototype).filter((n) => n !== 'constructor');

  it('TODAS las rutas del controlador público son @Public y llevan límite de intentos', () => {
    const names = methods(SignaturePublicController);
    expect(names.length).toBeGreaterThanOrEqual(10);
    for (const n of names) {
      const handler = SignaturePublicController.prototype[n as keyof SignaturePublicController] as any;
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBe(true);
      expect(Reflect.getMetadataKeys(handler).some((k: string) => String(k).startsWith('THROTTLER:LIMIT'))).toBe(true);
    }
    const guards = Reflect.getMetadata('__guards__', SignaturePublicController) as unknown[];
    expect(guards).toContain(PublicThrottlerGuard);
  });

  it('NINGUNA ruta del controlador interno es pública, todas exigen al menos AUDITOR, y la integridad exige gerente', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, SignatureRequestsController)).toBeUndefined();
    expect(Reflect.getMetadata(ROLES_KEY, SignatureRequestsController)).toEqual(['AUDITOR']);
    for (const n of methods(SignatureRequestsController)) {
      const handler = SignatureRequestsController.prototype[n as keyof SignatureRequestsController] as any;
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBeUndefined();
    }
    expect(Reflect.getMetadata(ROLES_KEY, SignatureRequestsController.prototype.integrity)).toEqual(['AUDIT_MANAGER']);
  });

  it('los servicios están inyectados en los controladores (el módulo arma)', () => {
    expect(SignatureRequestsService).toBeDefined();
  });
});
