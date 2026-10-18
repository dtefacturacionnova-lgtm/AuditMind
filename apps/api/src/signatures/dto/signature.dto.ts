import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsEnum, IsInt, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { SignatureDocumentType } from '@prisma/client';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
/**
 * El ValidationPipe global usa `enableImplicitConversion`, que convierte CUALQUIER texto no vacío en `true`
 * ("false", "0" y "no" incluidos) ANTES de que @IsBoolean lo valide. Para las casillas que importan (el
 * consentimiento de la firma) se lee el valor ORIGINAL del cuerpo: solo un booleano de verdad es válido.
 */
const rawValue = ({ obj, key }: { obj: Record<string, unknown>; key: string }) => obj[key];
const trimLower = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);

// IMPORTANTE: el ValidationPipe global (whitelist + forbidNonWhitelisted) solo valida CLASES con decoradores;
// un cuerpo tipado inline no se valida. Por eso todo cuerpo de estos endpoints es una clase.

export class CreateSignatureRequestDto {
  @IsEnum(SignatureDocumentType) documentType!: SignatureDocumentType;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(64) targetId!: string;
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(120) signerName!: string;
  @Transform(trimLower) @IsEmail() @MaxLength(254) signerEmail!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(120) signerRole?: string;
  @IsOptional() @IsInt() @Min(1) @Max(60) expiresInDays?: number;
  @IsOptional() @Transform(rawValue) @IsBoolean() reminderEnabled?: boolean;
  /** Datos propios del tipo de documento: cada adaptador los valida; el servicio limita el tamaño total. */
  @IsOptional() @IsObject() payload?: Record<string, unknown>;
}

export class ResendSignatureRequestDto {
  @IsOptional() @IsInt() @Min(1) @Max(60) expiresInDays?: number;
}

export class RevokeSignatureRequestDto {
  @Transform(trim) @IsString() @MinLength(5) @MaxLength(500) reason!: string;
}

export class OtpVerifyDto {
  @IsString() @Matches(/^\d{6}$/, { message: 'El código son 6 dígitos.' }) code!: string;
}

export class SignDto {
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(120) signedName!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(120) signedRole?: string;
  @Transform(rawValue) @IsBoolean() consent!: boolean;
  /** La estructura la valida el adaptador del tipo de documento. */
  @IsOptional() @IsObject() response?: Record<string, unknown>;
}

export class DeclineDto {
  @Transform(trim) @IsString() @MinLength(5) @MaxLength(1000) reason!: string;
}
