/* eslint-disable @typescript-eslint/no-explicit-any */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { ArgumentMetadata, BadRequestException, ValidationPipe } from '@nestjs/common';
import { TransformationType } from 'class-transformer';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { defaultMetadataStorage } = require('class-transformer/cjs/storage');
import { getMetadataStorage, IsBoolean, IsOptional } from 'class-validator';
import { StrictBoolean, strictBooleanValue } from './strict-boolean.decorator';

/** EXACTAMENTE la configuración de apps/api/src/main.ts */
const pipe = () => new ValidationPipe({
  whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true },
});
const body = (metatype: any): ArgumentMetadata => ({ type: 'body', metatype });
const query = (metatype: any): ArgumentMetadata => ({ type: 'query', metatype });

class Old { @IsBoolean() flag!: boolean; }
class Required { @StrictBoolean() flag!: boolean; }
class Optional { @IsOptional() @StrictBoolean() flag?: boolean; }

describe('el problema original (documentado)', () => {
  it('con @IsBoolean() a secas, la conversión implícita global vuelve true cualquier texto: "false", "0", "no", "sí"', async () => {
    for (const bad of ['false', '0', 'no', 'sí', 'cualquier cosa']) {
      const out = await pipe().transform({ flag: bad }, body(Old));
      expect((out as Old).flag).toBe(true); // ← el bug: "false" activaba el campo
    }
  });
});

describe('@StrictBoolean() con la configuración real del ValidationPipe', () => {
  it('acepta booleanos de verdad y los textos exactos "true"/"false" (multipart y query string)', async () => {
    expect(((await pipe().transform({ flag: true }, body(Required))) as Required).flag).toBe(true);
    expect(((await pipe().transform({ flag: false }, body(Required))) as Required).flag).toBe(false);
    expect(((await pipe().transform({ flag: 'true' }, body(Required))) as Required).flag).toBe(true);
    expect(((await pipe().transform({ flag: 'false' }, body(Required))) as Required).flag).toBe(false); // ← antes: true
    expect(((await pipe().transform({ flag: 'false' }, query(Required))) as Required).flag).toBe(false);
  });

  it.each([['sí'], ['yes'], ['no'], ['on'], ['0'], ['1'], ['TRUE'], [1], [0], [{}], [[]], [null]])(
    'rechaza %p con 400 (antes se convertía en true en silencio)',
    async (bad) => {
      await expect(pipe().transform({ flag: bad }, body(Required))).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it('campo obligatorio ausente o vacío → 400; opcional ausente, nulo o vacío → se omite', async () => {
    await expect(pipe().transform({}, body(Required))).rejects.toBeInstanceOf(BadRequestException);
    await expect(pipe().transform({ flag: '' }, body(Required))).rejects.toBeInstanceOf(BadRequestException);
    for (const empty of [{}, { flag: undefined }, { flag: null }, { flag: '' }]) {
      const out = (await pipe().transform(empty, body(Optional))) as Optional;
      expect(out.flag ?? null).toBeNull();
    }
  });

  it('sigue rechazando campos de más (whitelist) y no altera los demás tipos', async () => {
    await expect(pipe().transform({ flag: true, extra: 1 }, body(Required))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('la función pura no toca nada que no sea booleano', () => {
    expect(strictBooleanValue('sí')).toBe('sí');
    expect(strictBooleanValue(1)).toBe(1);
    expect(strictBooleanValue(undefined)).toBeUndefined();
    expect(strictBooleanValue('')).toBeUndefined();
  });
});

describe('DTO reales del proyecto, con la configuración real del pipe', () => {
  // Importados aquí (no arriba) para no cargar todo el proyecto en las pruebas puras de arriba.
  /* eslint-disable @typescript-eslint/no-var-requires */
  const { UpdateOrganizationDto } = require('../../organizations/dto/update-organization.dto');
  const { UpdateEntityTypeDto } = require('../../catalogs/dto/catalogs.dto');
  const { UpdateAuditProjectDto } = require('../../audit-projects/dto/audit-project.dto');
  /* eslint-enable @typescript-eslint/no-var-requires */

  it('UpdateOrganizationDto.active: "false" desactiva (antes ACTIVABA la organización); "sí" se rechaza', async () => {
    expect(((await pipe().transform({ active: 'false' }, body(UpdateOrganizationDto))) as any).active).toBe(false);
    expect(((await pipe().transform({ active: false }, body(UpdateOrganizationDto))) as any).active).toBe(false);
    expect(((await pipe().transform({ active: true }, body(UpdateOrganizationDto))) as any).active).toBe(true);
    await expect(pipe().transform({ active: 'sí' }, body(UpdateOrganizationDto))).rejects.toBeInstanceOf(BadRequestException);
    // y sin el campo, el DTO sigue funcionando (es opcional)
    expect(((await pipe().transform({ name: 'Despacho' }, body(UpdateOrganizationDto))) as any).active).toBeUndefined();
  });

  it('catálogos y proyectos: el mismo comportamiento', async () => {
    expect(((await pipe().transform({ active: 'false' }, body(UpdateEntityTypeDto))) as any).active).toBe(false);
    expect(((await pipe().transform({ includeInPlan: 'false' }, body(UpdateAuditProjectDto))) as any).includeInPlan).toBe(false);
    await expect(pipe().transform({ active: '0' }, body(UpdateEntityTypeDto))).rejects.toBeInstanceOf(BadRequestException);
    await expect(pipe().transform({ includeInPlan: 1 }, body(UpdateAuditProjectDto))).rejects.toBeInstanceOf(BadRequestException);
  });
});

// ─── Cobertura: NINGÚN DTO del proyecto conserva el hueco ────────────────────
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) { if (name !== 'node_modules' && name !== 'testing') sourceFiles(full, out); }
    else if (full.endsWith('.ts') && !full.endsWith('.spec.ts') && !full.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

describe('cobertura de todo el proyecto', () => {
  const SRC = resolve(__dirname, '..', '..');
  const files = sourceFiles(SRC).filter((f) => /@IsBoolean\(|@StrictBoolean\(/.test(readFileSync(f, 'utf-8')));

  it('hay DTO con booleanos (la prueba no es vacía)', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('TODA propiedad validada con isBoolean tiene una transformación que lee el valor original', () => {
    for (const f of files) require(f); // registra las clases en los metadatos de class-validator / class-transformer
    const validations = (getMetadataStorage() as any).validationMetadatas as Map<unknown, Array<{ name: string; propertyName: string; target: any }>>;
    const unprotected: string[] = [];
    let checked = 0;
    for (const [, metas] of validations) {
      for (const m of metas) {
        if (m.name !== 'isBoolean' || m.target === Old) continue; // `Old` es la clase de demostración del bug, a propósito
        checked++;
        const transforms = defaultMetadataStorage.findTransformMetadatas(m.target, m.propertyName, TransformationType.PLAIN_TO_CLASS);
        if (transforms.length === 0) unprotected.push(`${m.target?.name ?? '?'}.${m.propertyName}`);
      }
    }
    expect(checked).toBeGreaterThan(25);
    expect(unprotected).toEqual([]); // usar @StrictBoolean() en vez de @IsBoolean()
  });

  it('y ninguna usa @IsBoolean() a secas en el código fuente (salvo el decorador y la firma, que ya leen el valor original)', () => {
    const allowed = ['strict-boolean.decorator.ts', join('signatures', 'dto', 'signature.dto.ts')];
    const offenders = files
      .filter((f) => !allowed.some((a) => f.endsWith(a)))
      .filter((f) => readFileSync(f, 'utf-8').split('\n').some((l) => /@IsBoolean\(/.test(l) && !/^\s*\/\//.test(l)));
    expect(offenders.map((f) => f.slice(SRC.length + 1))).toEqual([]);
  });
});
