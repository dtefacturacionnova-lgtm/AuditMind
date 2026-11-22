/* eslint-disable @typescript-eslint/no-explicit-any */
import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { SKIP_STORAGE_SIGNING_KEY } from '../common/storage/skip-storage-signing.decorator';
import { PublicThrottlerGuard } from '../signatures/public-throttle';
import { PublicPlansController, pricingPublished } from './public-plans.controller';

const build = (env: Record<string, string | undefined> = {}) => {
  const plans = { publicCatalog: jest.fn(async (contact: unknown) => ({ currency: 'USD', plans: [], packs: [], contact })) };
  const config = { get: (k: string) => env[k] } as any;
  return { controller: new PublicPlansController(plans as any, config), plans };
};

describe('pricingPublished — el interruptor', () => {
  it('solo el texto exacto «true» publica', () => {
    expect(pricingPublished('true')).toBe(true);
    for (const v of ['false', 'TRUE', 'True', '1', 'yes', 'sí', '', ' true', undefined, null, true, 1]) expect(pricingPublished(v)).toBe(false);
  });
});

describe('GET /public/plans', () => {
  it('apagado (por defecto) responde 404 y ni siquiera consulta la base', async () => {
    const { controller, plans } = build({});
    await expect(controller.catalog()).rejects.toBeInstanceOf(NotFoundException);
    expect(plans.publicCatalog).not.toHaveBeenCalled();
    const off = build({ PUBLIC_PRICING_ENABLED: 'false', SALES_CONTACT_EMAIL: 'ventas@auditmind.com' });
    await expect(off.controller.catalog()).rejects.toBeInstanceOf(NotFoundException);
    expect(off.plans.publicCatalog).not.toHaveBeenCalled();
  });

  it('encendido devuelve el catálogo con el contacto configurado en el servidor', async () => {
    const { controller, plans } = build({ PUBLIC_PRICING_ENABLED: 'true', SALES_CONTACT_EMAIL: 'ventas@auditmind.com', SALES_CONTACT_WHATSAPP: '+503 7000-0000' });
    const r = await controller.catalog();
    expect(plans.publicCatalog).toHaveBeenCalledWith({ email: 'ventas@auditmind.com', whatsapp: '+503 7000-0000' });
    expect((r as any).currency).toBe('USD');
  });

  it('encendido y sin contacto configurado: el contacto llega vacío (la página no mostrará botones)', async () => {
    const { controller, plans } = build({ PUBLIC_PRICING_ENABLED: 'true' });
    await controller.catalog();
    expect(plans.publicCatalog).toHaveBeenCalledWith({ email: undefined, whatsapp: undefined });
  });

  it('la ruta es pública (sin login), no firma enlaces de Storage y se puede guardar 60 segundos', () => {
    const handler = PublicPlansController.prototype.catalog;
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBe(true);
    expect(Reflect.getMetadata(SKIP_STORAGE_SIGNING_KEY, PublicPlansController)).toBe(true);
    expect(Reflect.getMetadata('path', PublicPlansController)).toBe('public/plans');
    const headers = Reflect.getMetadata('__headers__', handler) as Array<{ name: string; value: string }>;
    expect(headers).toEqual([{ name: 'Cache-Control', value: 'public, max-age=60' }]);
  });

  it('lleva su guardia y su límite de uso por IP (holgado: lo consulta el servidor de la web, que comparte IP entre todos los visitantes)', () => {
    const guards = Reflect.getMetadata('__guards__', PublicPlansController) as unknown[];
    expect(guards).toContain(PublicThrottlerGuard);
    const handler = PublicPlansController.prototype.catalog;
    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', handler)).toBe(120);
    expect(Reflect.getMetadata('THROTTLER:TTLdefault', handler)).toBe(60_000);
  });

  it('solo expone lectura: no hay otros métodos en el controlador', () => {
    const methods = Object.getOwnPropertyNames(PublicPlansController.prototype).filter((m) => m !== 'constructor');
    expect(methods).toEqual(['catalog']);
  });
});
