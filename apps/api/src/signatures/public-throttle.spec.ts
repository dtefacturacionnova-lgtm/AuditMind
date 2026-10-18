import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Throttle, ThrottlerModule } from '@nestjs/throttler';
import { PublicThrottlerGuard } from './public-throttle';

@Controller('t')
@UseGuards(PublicThrottlerGuard)
class TestController {
  @Get('a') @Throttle({ default: { limit: 3, ttl: 60_000 } }) a() { return { ok: true }; }
  @Get('b') @Throttle({ default: { limit: 3, ttl: 60_000 } }) b() { return { ok: true }; }
}

async function startApp(trustProxy: boolean): Promise<{ app: INestApplication; url: string }> {
  const moduleRef = await Test.createTestingModule({
    imports: [ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }])],
    controllers: [TestController],
    providers: [PublicThrottlerGuard],
  }).compile();
  const app = moduleRef.createNestApplication();
  if (trustProxy) app.getHttpAdapter().getInstance().set('trust proxy', 'loopback');
  await app.listen(0, '127.0.0.1');
  const url = await app.getUrl();
  return { app, url: url.replace('[::1]', '127.0.0.1') };
}

const hit = (url: string, path: string, xff?: string) =>
  fetch(`${url}/t/${path}`, { headers: xff ? { 'x-forwarded-for': xff } : {} });

describe('PublicThrottlerGuard con trust proxy (como en producción tras nginx)', () => {
  let app: INestApplication; let url: string;
  beforeAll(async () => { ({ app, url } = await startApp(true)); });
  afterAll(async () => { await app.close(); });

  it('deja pasar hasta el límite y luego responde 429 en español con Retry-After', async () => {
    for (let i = 0; i < 3; i++) expect((await hit(url, 'a', '203.0.113.5')).status).toBe(200);
    const blocked = await hit(url, 'a', '203.0.113.5');
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).message).toBe('Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.');
    expect(blocked.headers.get('retry-after')).toBeTruthy();
  });

  it('cada IP real tiene su propio contador', async () => {
    for (let i = 0; i < 3; i++) await hit(url, 'b', '198.51.100.10');
    expect((await hit(url, 'b', '198.51.100.10')).status).toBe(429);
    expect((await hit(url, 'b', '198.51.100.11')).status).toBe(200);
  });

  it('falsificar la izquierda de X-Forwarded-For NO sirve para esquivar el límite', async () => {
    // nginx agrega la IP real a la DERECHA; el cliente solo controla lo de la izquierda.
    // La IP 203.0.113.5 ya agotó el límite en /a: cambiar el prefijo no la libera.
    for (const spoof of ['9.9.9.9, 203.0.113.5', '1.2.3.4, 5.6.7.8, 203.0.113.5']) {
      expect((await hit(url, 'a', spoof)).status).toBe(429);
    }
  });

  it('cada ruta lleva su propio contador', async () => {
    expect((await hit(url, 'b', '203.0.113.5')).status).toBe(200); // /b no se tocó para esta IP
  });
});

describe('sin trust proxy (el error que evita main.ts)', () => {
  let app: INestApplication; let url: string;
  beforeAll(async () => { ({ app, url } = await startApp(false)); });
  afterAll(async () => { await app.close(); });

  it('todas las IP parecen una sola y se bloquean entre sí', async () => {
    await hit(url, 'a', '10.0.0.1'); await hit(url, 'a', '10.0.0.2'); await hit(url, 'a', '10.0.0.3');
    expect((await hit(url, 'a', '10.0.0.4')).status).toBe(429); // otro cliente distinto, bloqueado igual
  });
});
