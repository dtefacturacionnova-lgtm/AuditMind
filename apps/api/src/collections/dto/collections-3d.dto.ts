import {
  IsString, IsOptional, IsEnum, IsNumber, IsInt, Min, Max, MaxLength, MinLength, IsIn, Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CollectionContactMethod, CreditNoteStatus, PromiseStatus, WriteOffStatus } from '@prisma/client';

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const YMD_MSG = 'La fecha debe tener el formato AAAA-MM-DD.';
const MONEY = { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 } as const;

// ── Notas de crédito ────────────────────────────────────────────────────────
export class RegisterCreditNoteDto {
  @ApiProperty({ example: 'DTE-05-M001P001-000000000000012', description: 'Número de control de la nota de crédito (DTE 05).' })
  @IsString() @MinLength(3) @MaxLength(60)
  creditNoteNumber: string;

  @ApiPropertyOptional({ description: 'Código de generación (UUID).' })
  @IsOptional() @IsString() @MaxLength(60)
  generationCode?: string;

  @ApiPropertyOptional({ description: 'Fecha de emisión; por defecto hoy.' })
  @IsOptional() @Matches(YMD, { message: YMD_MSG })
  issueDate?: string;

  @ApiProperty({ description: 'Monto NETO que se acredita (sin IVA).' })
  @IsNumber(MONEY)
  netAmount: number;

  @ApiPropertyOptional({ description: 'IVA de la nota de crédito.' })
  @IsOptional() @IsNumber(MONEY)
  taxAmount?: number;

  @ApiProperty({ example: 'El cliente reclamó horas que no se trabajaron; se acredita el ajuste acordado.' })
  @IsString() @MinLength(10) @MaxLength(500)
  reason: string;
}

export class ListCreditNotesQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() clientId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() invoiceId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() engagementId?: string;
  @ApiPropertyOptional({ enum: CreditNoteStatus }) @IsOptional() @IsEnum(CreditNoteStatus) status?: CreditNoteStatus;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @ApiPropertyOptional({ default: 100 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) pageSize?: number;
}

// ── Castigos ────────────────────────────────────────────────────────────────
export class RegisterWriteOffDto {
  @ApiProperty({ description: 'Monto que se castiga (> 0 y ≤ saldo de la factura). Puede ser parcial.' })
  @IsNumber(MONEY)
  amount: number;

  @ApiPropertyOptional({ description: 'Fecha del castigo; por defecto hoy.' })
  @IsOptional() @Matches(YMD, { message: YMD_MSG })
  writtenOffOn?: string;

  @ApiProperty({ example: 'El cliente cerró operaciones y se agotaron las gestiones de cobro.' })
  @IsString() @MinLength(10) @MaxLength(500)
  reason: string;
}

export class ListWriteOffsQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() clientId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() invoiceId?: string;
  @ApiPropertyOptional({ enum: WriteOffStatus }) @IsOptional() @IsEnum(WriteOffStatus) status?: WriteOffStatus;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @ApiPropertyOptional({ default: 100 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) pageSize?: number;
}

// ── Gestión de cobro ────────────────────────────────────────────────────────
export class CreateCollectionNoteDto {
  @ApiProperty() @IsString() clientId: string;
  @ApiPropertyOptional({ description: 'Factura a la que se refiere el contacto (opcional).' }) @IsOptional() @IsString() invoiceId?: string;
  @ApiPropertyOptional({ description: 'Encargo al que se refiere el contacto (opcional).' }) @IsOptional() @IsString() engagementId?: string;

  @ApiPropertyOptional({ description: 'Fecha del contacto; por defecto hoy.' })
  @IsOptional() @Matches(YMD, { message: YMD_MSG })
  contactedOn?: string;

  @ApiProperty({ enum: CollectionContactMethod }) @IsEnum(CollectionContactMethod) method: CollectionContactMethod;
  @ApiPropertyOptional({ description: 'Persona del cliente con quien se habló.' }) @IsOptional() @IsString() @MaxLength(120) contactName?: string;
  @ApiProperty({ description: 'Qué se habló.' }) @IsString() @MinLength(3) @MaxLength(2000) note: string;

  @ApiPropertyOptional({ description: 'Fecha en que el cliente prometió pagar.' })
  @IsOptional() @Matches(YMD, { message: YMD_MSG })
  promiseDate?: string;

  @ApiPropertyOptional({ description: 'Monto prometido (requiere la fecha de la promesa).' })
  @IsOptional() @IsNumber(MONEY)
  promiseAmount?: number;

  @ApiPropertyOptional({ description: 'Cuándo volver a contactar.' })
  @IsOptional() @Matches(YMD, { message: YMD_MSG })
  nextFollowUpOn?: string;
}

export class UpdateCollectionNoteDto {
  @ApiPropertyOptional() @IsOptional() @Matches(YMD, { message: YMD_MSG }) contactedOn?: string;
  @ApiPropertyOptional({ enum: CollectionContactMethod }) @IsOptional() @IsEnum(CollectionContactMethod) method?: CollectionContactMethod;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) contactName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(3) @MaxLength(2000) note?: string;
  @ApiPropertyOptional({ description: 'Cambia la fecha de la promesa (solo si la nota ya tiene una).' }) @IsOptional() @Matches(YMD, { message: YMD_MSG }) promiseDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber(MONEY) promiseAmount?: number;
  @ApiPropertyOptional({ description: 'Cuándo volver a contactar; cadena vacía lo quita.' }) @IsOptional() @IsString() @Matches(/^(\d{4}-\d{2}-\d{2})?$/, { message: YMD_MSG }) nextFollowUpOn?: string;
}

export class SetPromiseStatusDto {
  @ApiProperty({ enum: PromiseStatus }) @IsEnum(PromiseStatus) status: PromiseStatus;
}

export class ListCollectionNotesQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() clientId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() invoiceId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() engagementId?: string;
  @ApiPropertyOptional({ enum: PromiseStatus }) @IsOptional() @IsEnum(PromiseStatus) promiseStatus?: PromiseStatus;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @ApiPropertyOptional({ default: 100 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) pageSize?: number;
}

export class AlertsQueryDto {
  @ApiPropertyOptional({ default: 15, description: 'Días sin gestión para avisar de una factura vencida.' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(180)
  staleDays?: number;
}

// ── Hitos cumplidos (alimentan el devengado por hitos) ──────────────────────
export class SetItemCompletionDto {
  @ApiPropertyOptional({ nullable: true, description: 'Día en que se cumplió el hito (AAAA-MM-DD). null o ausente lo marca como no cumplido.' })
  @IsOptional() @Matches(YMD, { message: YMD_MSG })
  completedOn?: string | null;
}

// ── Reportes (3c) ───────────────────────────────────────────────────────────
export class AgingQueryDto {
  @ApiPropertyOptional({ description: 'Fecha de corte (AAAA-MM-DD); por defecto hoy. No puede ser futura.' })
  @IsOptional() @Matches(YMD, { message: YMD_MSG })
  asOf?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() clientId?: string;

  @ApiPropertyOptional({ description: 'Incluir el detalle por factura de cada cliente.' })
  @IsOptional() @IsIn(['true', 'false'])
  detail?: string;
}

export class StatementQueryDto {
  @ApiPropertyOptional({ description: 'Fecha de corte (AAAA-MM-DD); por defecto hoy. No puede ser futura.' })
  @IsOptional() @Matches(YMD, { message: YMD_MSG })
  asOf?: string;

  @ApiPropertyOptional({ description: 'Desde cuándo se listan los movimientos; antes de esa fecha solo se muestra el saldo anterior.' })
  @IsOptional() @Matches(YMD, { message: YMD_MSG })
  from?: string;
}

export class SummaryQueryDto {
  @ApiPropertyOptional({ description: 'Fecha de corte (AAAA-MM-DD); por defecto hoy.' })
  @IsOptional() @Matches(YMD, { message: YMD_MSG })
  asOf?: string;
}
