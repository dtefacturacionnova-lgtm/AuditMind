/* eslint-disable @typescript-eslint/no-explicit-any */
import { HttpException } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { EntitlementsService } from './entitlements.service';
import { SubscriptionGuard } from './subscription.guard';
import { Entitlements, computeEntitlements } from './entitlements';

const DAY = 24 * 60 * 60 * 1000;
const day = (n: number) => new Date(Date.now() + n * DAY);

const entFor = (over: Record<string, unknown> = {}, endsInDays: number | null = 100): Entitlements =>
  computeEntitlements({
    status: 'ACTIVE', months: 12, currentPeriodEnd: endsInDays === null ? null : day(endsInDays), trialEndsAt: null, extraUsers: 0, exempt: false, overrides: {},
    planSnapshot: { code: 'EMPRESA_DESPACHO', name: 'Empresa Despacho', audience: 'EMPRESA', modules: ['CARTERA', 'RIESGOS'], functions: ['FIRMA'], assistants: ['MINERVA'], limits: {} },
    ...over,
  } as any, { graceDays: 7, readOnlyDays: 60 });

function build(mode: 'OFF' | 'OBSERVE' | 'ENFORCE', ent: Entitlements | null) {
  const settings: any = { get: jest.fn(async () => ({ enforcementMode: mode })) };
  const entitlements = new EntitlementsService({} as any, settings);
  jest.spyOn(entitlements, 'get').mockResolvedValue(ent);
  return { guard: new SubscriptionGuard(settings, entitlements), settings, entitlements };
}

/** Un controlador falso con la ruta declarada como la lee Nest (metadatos de `@Controller` y del método). */
function ctx(controller: string, method: string, user: any = { id: 'u1', role: 'AUDITOR', organizationId: 'org1' }, handlerPath = '/') {
  class C {}
  function handler() { /* */ }
  Reflect.defineMetadata(PATH_METADATA, controller, C);
  Reflect.defineMetadata(PATH_METADATA, handlerPath, handler);
  return { getType: () => 'http', getClass: () => C, getHandler: () => handler, switchToHttp: () => ({ getRequest: () => ({ user: user ?? undefined, method }) }) } as any;
}

const denied = async (p: Promise<boolean>) => {
  try { await p; return null; } catch (e) { return e as HttpException; }
};

describe('SubscriptionGuard — interruptor y excepciones', () => {
  it('con el interruptor en OFF no hace nada (ni siquiera consulta la suscripción)', async () => {
    const { guard, entitlements } = build('OFF', entFor());
    expect(await guard.canActivate(ctx('plans', 'POST'))).toBe(true);
    expect(entitlements.get).not.toHaveBeenCalled();
  });

  it('sin usuario (rutas públicas) y el SUPER_ADMIN pasan siempre, aun en ENFORCE', async () => {
    const { guard } = build('ENFORCE', entFor({ status: 'SUSPENDED' }));
    expect(await guard.canActivate(ctx('plans', 'POST', null))).toBe(true);
    expect(await guard.canActivate(ctx('plans', 'POST', { id: 's', role: 'SUPER_ADMIN', organizationId: 'org1' }))).toBe(true);
  });

  it('organizaciones exentas (Piloto / Interno) y sin suscripción nunca se bloquean', async () => {
    expect(await build('ENFORCE', entFor({ exempt: true, status: 'SUSPENDED' })).guard.canActivate(ctx('plans', 'POST'))).toBe(true);
    expect(await build('ENFORCE', null).guard.canActivate(ctx('plans', 'POST'))).toBe(true);
  });

  it('un contexto que no es HTTP pasa', async () => {
    const { guard } = build('ENFORCE', entFor());
    expect(await guard.canActivate({ getType: () => 'rpc' } as any)).toBe(true);
  });
});

describe('SubscriptionGuard — módulos', () => {
  it('ENFORCE: un módulo que el plan no incluye devuelve 403 MODULO_NO_INCLUIDO con el módulo', async () => {
    const { guard } = build('ENFORCE', entFor());
    const e = await denied(guard.canActivate(ctx('plans', 'GET')));
    expect(e).toBeInstanceOf(HttpException);
    expect(e!.getStatus()).toBe(403);
    expect(e!.getResponse()).toMatchObject({ code: 'MODULO_NO_INCLUIDO', module: 'PLAN_ANUAL' });
  });

  it('un módulo incluido pasa; el núcleo pasa siempre', async () => {
    const { guard } = build('ENFORCE', entFor());
    expect(await guard.canActivate(ctx('portfolio', 'POST'))).toBe(true);
    expect(await guard.canActivate(ctx('audits', 'POST'))).toBe(true);
    expect(await guard.canActivate(ctx('working-papers', 'PATCH'))).toBe(true);
  });

  it('las funciones se exigen igual que los módulos (firma sí, forense no)', async () => {
    const { guard } = build('ENFORCE', entFor());
    expect(await guard.canActivate(ctx('signature-requests', 'POST'))).toBe(true);
    expect((await denied(guard.canActivate(ctx('investigation-graph', 'GET'))))!.getResponse()).toMatchObject({ code: 'MODULO_NO_INCLUIDO', module: 'FORENSE' });
    expect((await denied(guard.canActivate(ctx('audits/:auditId/investigation-report', 'GET'))))!.getResponse()).toMatchObject({ module: 'FORENSE' });
  });

  it('los ajustes por cliente abren un módulo suelto sin cambiar de plan', async () => {
    const { guard } = build('ENFORCE', entFor({ overrides: { addModules: ['PLAN_ANUAL'] } }));
    expect(await guard.canActivate(ctx('plans', 'GET'))).toBe(true);
  });

  it('OBSERVE: no bloquea, solo registra lo que habría bloqueado', async () => {
    const { guard, entitlements } = build('OBSERVE', entFor());
    const spy = jest.spyOn(entitlements, 'violate');
    expect(await guard.canActivate(ctx('plans', 'GET'))).toBe(true);
    expect(spy).toHaveBeenCalledWith('OBSERVE', 'org1', 403, 'MODULO_NO_INCLUIDO', expect.any(String), { module: 'PLAN_ANUAL' });
  });
});

describe('SubscriptionGuard — vigencia (solo lectura)', () => {
  const vencida = (dias: number) => entFor({}, -dias);

  it('en gracia (venció hace menos de 7 días) todo sigue funcionando', async () => {
    const { guard } = build('ENFORCE', vencida(3));
    expect(await guard.canActivate(ctx('findings', 'POST'))).toBe(true);
  });

  it('en solo lectura: las consultas pasan, crear/editar/borrar devuelven 402 LICENCIA_VENCIDA', async () => {
    const { guard } = build('ENFORCE', vencida(20));
    expect(await guard.canActivate(ctx('findings', 'GET'))).toBe(true);
    for (const m of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      const e = await denied(guard.canActivate(ctx('findings', m)));
      expect(e!.getStatus()).toBe(402);
      expect(e!.getResponse()).toMatchObject({ code: 'LICENCIA_VENCIDA' });
    }
  });

  it('en solo lectura siguen pasando iniciar sesión, pagar, notificaciones y exportar', async () => {
    const { guard } = build('ENFORCE', vencida(20));
    expect(await guard.canActivate(ctx('auth', 'POST', undefined))).toBe(true);
    expect(await guard.canActivate(ctx('billing', 'POST', undefined, 'payments'))).toBe(true);
    expect(await guard.canActivate(ctx('notifications', 'PATCH'))).toBe(true);
    expect(await guard.canActivate(ctx('ai', 'POST', undefined, 'analytics/:type/pdf'))).toBe(true);
  });

  it('en solo lectura el chat de IA se detiene (cuesta dinero)', async () => {
    const { guard } = build('ENFORCE', vencida(20));
    expect((await denied(guard.canActivate(ctx('ai', 'POST', undefined, 'chat'))))!.getStatus()).toBe(402);
  });

  it('suspendida: igual que solo lectura', async () => {
    const { guard } = build('ENFORCE', entFor({ status: 'SUSPENDED' }));
    expect((await denied(guard.canActivate(ctx('findings', 'POST'))))!.getStatus()).toBe(402);
    expect(await guard.canActivate(ctx('findings', 'GET'))).toBe(true);
  });

  it('la vigencia se revisa antes que el módulo: vencida y sin módulo → 402', async () => {
    const { guard } = build('ENFORCE', vencida(20));
    expect((await denied(guard.canActivate(ctx('plans', 'POST'))))!.getStatus()).toBe(402);
  });
});
