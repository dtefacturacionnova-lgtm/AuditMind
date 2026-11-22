import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SavePackDto } from './dto/billing.dto';

/** Mismas opciones que el ValidationPipe global de la aplicación (whitelist + forbidNonWhitelisted). */
const check = async (body: Record<string, unknown>) => {
  const errors = await validate(plainToInstance(SavePackDto, body), { whitelist: true, forbidNonWhitelisted: true });
  return errors.map((e) => e.property).sort();
};

describe('SavePackDto — lo que acepta el catálogo de paquetes', () => {
  it('acepta un paquete normal (crear) y una edición parcial', async () => {
    expect(await check({ code: 'AI_2000', kind: 'AI', name: '+2,000 peticiones', quantity: 2000, priceUsd: 9.5, active: true, sortOrder: 15 })).toEqual([]);
    expect(await check({ priceUsd: 0 })).toEqual([]); // gratis es válido (promoción)
    expect(await check({ active: false })).toEqual([]);
  });

  it('rechaza cantidades que no son enteros positivos o que desbordarían la columna', async () => {
    expect(await check({ quantity: 0 })).toEqual(['quantity']);
    expect(await check({ quantity: -5 })).toEqual(['quantity']);
    expect(await check({ quantity: 1.5 })).toEqual(['quantity']);
    expect(await check({ quantity: 100_000_001 })).toEqual(['quantity']);
    expect(await check({ quantity: 2_147_483_648 })).toEqual(['quantity']);
    expect(await check({ quantity: 100_000_000 })).toEqual([]);
  });

  it('rechaza precios negativos, no numéricos o que desbordarían la columna (antes daban un error 500)', async () => {
    expect(await check({ priceUsd: -0.01 })).toEqual(['priceUsd']);
    expect(await check({ priceUsd: 10_000_000 })).toEqual(['priceUsd']);
    expect(await check({ priceUsd: 1e12 })).toEqual(['priceUsd']);
    expect(await check({ priceUsd: '5' })).toEqual(['priceUsd']);
    expect(await check({ priceUsd: Number.NaN })).toEqual(['priceUsd']);
    expect(await check({ priceUsd: 9_999_999 })).toEqual([]);
  });

  it('el orden va de 0 a 1000 y el tipo solo puede ser AI o STORAGE', async () => {
    expect(await check({ sortOrder: -1 })).toEqual(['sortOrder']);
    expect(await check({ sortOrder: 1001 })).toEqual(['sortOrder']);
    expect(await check({ kind: 'VIDEO' })).toEqual(['kind']);
  });

  it('los booleanos son estrictos (ni «sí», ni 0 ni 1 valen como verdadero) y no se aceptan campos de más', async () => {
    expect(await check({ active: 'sí' })).toEqual(['active']);
    expect(await check({ active: 0 })).toEqual(['active']);
    expect(await check({ active: 1 })).toEqual(['active']);
    expect(await check({ recurring: 'yes' })).toEqual(['recurring']);
    expect(await check({ active: false, recurring: true })).toEqual([]);
    expect(await check({ id: 'x' })).toEqual(['id']);
    expect(await check({ organizationId: 'x' })).toEqual(['organizationId']);
  });

  it('el nombre admite hasta 120 caracteres', async () => {
    expect(await check({ name: 'x'.repeat(120) })).toEqual([]);
    expect(await check({ name: 'x'.repeat(121) })).toEqual(['name']);
  });
});
