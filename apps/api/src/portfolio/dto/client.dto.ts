import {
  IsString, IsOptional, IsEmail, IsInt, IsEnum, Min, Max,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ClientStatus } from '@prisma/client';

/** '' llega seguido desde formularios HTML para un campo opcional vacío —
 *  @IsOptional() de class-validator solo salta la validación en null/undefined,
 *  así que sin esto @IsEmail() rechaza un campo de contacto que el usuario
 *  simplemente dejó en blanco. */
const emptyToUndefined = () => Transform(({ value }) => (value === '' ? undefined : value));

export class CreateClientDto {
  @ApiProperty({ example: 'Empresa Comercial Demo SA de CV' })
  @IsString()
  legalName: string;

  @ApiPropertyOptional({ example: 'Comercial Demo' })
  @IsOptional()
  @IsString()
  tradeName?: string;

  @ApiPropertyOptional({ example: '0614-010185-101-7', description: 'NIT / RUC / Tax ID' })
  @IsOptional()
  @IsString()
  taxId?: string;

  @ApiPropertyOptional({ example: 'Comercio al por mayor' })
  @IsOptional()
  @IsString()
  industry?: string;

  @ApiPropertyOptional({ example: 'Lic. Roberto Morales' })
  @IsOptional()
  @IsString()
  contactName?: string;

  @ApiPropertyOptional({ example: 'contacto@cliente.com' })
  @emptyToUndefined()
  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @ApiPropertyOptional({ example: '+503 2222-3333' })
  @IsOptional()
  @IsString()
  contactPhone?: string;

  @ApiPropertyOptional({ example: 'San Salvador, El Salvador' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 12, description: 'Mes de cierre fiscal (1-12)' })
  @IsOptional()
  @IsInt()
  @Min(1) @Max(12)
  fiscalYearEndMonth?: number;

  @ApiPropertyOptional({ example: 31, description: 'Día de cierre fiscal (1-31)' })
  @IsOptional()
  @IsInt()
  @Min(1) @Max(31)
  fiscalYearEndDay?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

/**
 * Edición de datos generales del prospecto/cliente.
 *
 * NO incluye `status` a propósito: el estado del cliente solo se mueve mediante
 * las transiciones explícitas del pipeline (start-acceptance, decide, proposals,
 * sign de la carta de compromiso), nunca con un PATCH genérico.
 */
export class UpdateClientDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  legalName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tradeName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  taxId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  industry?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contactName?: string;

  @ApiPropertyOptional()
  @emptyToUndefined()
  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contactPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1) @Max(12)
  fiscalYearEndMonth?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1) @Max(31)
  fiscalYearEndDay?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ListClientsQueryDto {
  @ApiPropertyOptional({ enum: ClientStatus })
  @IsOptional()
  @IsEnum(ClientStatus)
  status?: ClientStatus;
}
