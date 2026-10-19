import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsBoolean } from 'class-validator';

/**
 * Booleano ESTRICTO para DTO.
 *
 * Problema (confirmado con una prueba HTTP real): el ValidationPipe global de main.ts usa
 * `transform: true` + `enableImplicitConversion: true`. Con esa opción class-transformer convierte la
 * propiedad con `Boolean(valor)` ANTES de que `@IsBoolean()` valide, y `Boolean("false")`, `Boolean("0")`
 * y `Boolean("no")` son `true`. Resultado: `{ "active": "false" }` activaba el registro, y `{ "consent": "sí" }`
 * pasaba como verdadero.
 *
 * Solución: leer el valor ORIGINAL del cuerpo (`obj[key]`, que la conversión implícita no toca) y aceptar solo:
 *   - un booleano de verdad (`true` / `false`), o
 *   - los textos exactos `"true"` / `"false"` (así llegan los booleanos en multipart/form-data y en query strings).
 * Una cadena vacía cuenta como "no enviado". Cualquier otra cosa (`"sí"`, `"yes"`, `1`, `"0"`, `{}`…) se deja
 * tal cual y `@IsBoolean()` responde 400, en vez de convertirse en `true` en silencio.
 *
 * Úsese SIEMPRE en lugar de `@IsBoolean()`: `strict-boolean.spec.ts` falla si algún DTO conserva un
 * `@IsBoolean()` sin esta protección.
 */
export function strictBooleanValue(raw: unknown): unknown {
  if (typeof raw === 'boolean') return raw;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === '') return undefined;
  return raw;
}

export function StrictBoolean(): PropertyDecorator {
  return applyDecorators(
    Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => strictBooleanValue(obj[key])),
    IsBoolean(),
  );
}
