import {
  IsString, IsOptional, IsEnum, IsNumber, IsArray, ValidateNested, IsInt, Min, Max, MinLength, MaxLength, ArrayMaxSize, IsIn, Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ClientInvoiceStatus, ClientPaymentMethod, ClientPaymentStatus, FeeProgressMethod, FeeType, ScheduleItemKind, WithholdingTaxType,
} from '@prisma/client';
import { StrictBoolean } from '../../common/validators/strict-boolean.decorator';

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const YMD_MSG = 'La fecha debe tener el formato AAAA-MM-DD.';
const MONEY = { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 } as const;

// ── Honorario y adendas ─────────────────────────────────────────────────────
export class SetFeeDto {
  @ApiProperty({ enum: FeeType })
  @IsEnum(FeeType)
  feeType: FeeType;

  @ApiPropertyOptional({ description: 'Honorario NETO en USD (sin IVA). Obligatorio con feeType = FIXED, salvo que se importe de la propuesta.' })
  @IsOptional()
  @IsNumber(MONEY)
  totalAmount?: number;

  @ApiPropertyOptional({ description: 'Toma el honorario de la propuesta aceptada del encargo (solo si está en USD).' })
  @IsOptional()
  @StrictBoolean()
  importFromProposal?: boolean;

  @ApiPropertyOptional({ example: 30, description: 'Días de crédito que se suman a la fecha de la factura.' })
  @IsOptional()
  @IsInt() @Min(0) @Max(365)
  paymentTermDays?: number;

  @ApiPropertyOptional({ enum: FeeProgressMethod })
  @IsOptional()
  @IsEnum(FeeProgressMethod)
  progressMethod?: FeeProgressMethod;

  @ApiPropertyOptional({ description: 'Avance manual 0–100; solo con progressMethod = MANUAL.' })
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false }) @Min(0) @Max(100)
  manualProgressPct?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString() @MaxLength(2000)
  notes?: string;
}

export class AmendFeeDto {
  @ApiProperty({ example: '2026-06-30' })
  @Matches(YMD, { message: YMD_MSG })
  date: string;

  @ApiProperty({ example: 'Alcance ampliado: se agrega la revisión de precios de transferencia.' })
  @IsString() @MinLength(5) @MaxLength(500)
  reason: string;

  @ApiProperty({ description: 'Cambio al honorario neto: positivo sube, negativo baja.' })
  @IsNumber(MONEY)
  amountDelta: number;
}

// ── Calendario ──────────────────────────────────────────────────────────────
export class MilestoneDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(120)
  label: string;

  @ApiProperty({ example: '2026-04-15' })
  @Matches(YMD, { message: YMD_MSG })
  date: string;

  @ApiPropertyOptional({ description: 'Porcentaje de lo que falta por programar. Todos los hitos usan porcentaje o todos usan monto.' })
  @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 })
  percent?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsNumber(MONEY)
  amount?: number;
}

export class GenerateScheduleDto {
  @ApiProperty({ enum: ['EQUAL', 'MILESTONES', 'SINGLE'] })
  @IsIn(['EQUAL', 'MILESTONES', 'SINGLE'])
  mode: 'EQUAL' | 'MILESTONES' | 'SINGLE';

  @ApiPropertyOptional({ example: 12 })
  @IsOptional() @IsInt() @Min(1) @Max(60)
  count?: number;

  @ApiPropertyOptional({ example: '2026-02-01', description: 'Fecha de la primera cuota (EQUAL) o del pago único (SINGLE).' })
  @IsOptional() @Matches(YMD, { message: YMD_MSG })
  firstDate?: string;

  @ApiPropertyOptional({ example: 1, description: 'Cada cuántos meses (EQUAL): 1, 2, 3, 4, 6 o 12.' })
  @IsOptional() @IsInt()
  everyMonths?: number;

  @ApiPropertyOptional({ type: [MilestoneDto] })
  @IsOptional() @IsArray() @ArrayMaxSize(60) @ValidateNested({ each: true }) @Type(() => MilestoneDto)
  milestones?: MilestoneDto[];

  @ApiPropertyOptional({ description: 'Etiqueta del pago único.' })
  @IsOptional() @IsString() @MaxLength(120)
  label?: string;

  @ApiPropertyOptional({ description: 'Reemplaza las cuotas programadas que aún no se han facturado (por defecto sí).' })
  @IsOptional() @StrictBoolean()
  replacePlanned?: boolean;
}

export class CreateScheduleItemDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(120)
  label: string;

  @ApiPropertyOptional({ enum: ScheduleItemKind })
  @IsOptional() @IsEnum(ScheduleItemKind)
  kind?: ScheduleItemKind;

  @ApiProperty({ example: '2026-05-01' })
  @Matches(YMD, { message: YMD_MSG })
  dueDate: string;

  @ApiProperty() @IsNumber(MONEY)
  amount: number;
}

export class UpdateScheduleItemDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) @MaxLength(120)
  label?: string;

  @ApiPropertyOptional({ enum: ScheduleItemKind }) @IsOptional() @IsEnum(ScheduleItemKind)
  kind?: ScheduleItemKind;

  @ApiPropertyOptional() @IsOptional() @Matches(YMD, { message: YMD_MSG })
  dueDate?: string;

  @ApiPropertyOptional() @IsOptional() @IsNumber(MONEY)
  amount?: number;
}

// ── Facturas ────────────────────────────────────────────────────────────────
export class WithholdingInputDto {
  @ApiProperty({ enum: WithholdingTaxType })
  @IsEnum(WithholdingTaxType)
  taxType: WithholdingTaxType;

  @ApiProperty() @IsNumber(MONEY)
  amount: number;

  @ApiPropertyOptional({ description: 'Número del comprobante de retención, si el cliente ya lo entregó.' })
  @IsOptional() @IsString() @MaxLength(60)
  certificateNumber?: string;
}

export class RegisterInvoiceDto {
  @ApiProperty() @IsString() @MinLength(8) @MaxLength(64)
  engagementId: string;

  @ApiPropertyOptional({ description: 'Cuota del calendario que se factura.' })
  @IsOptional() @IsString() @MinLength(8) @MaxLength(64)
  scheduleItemId?: string;

  @ApiProperty({ example: 'DTE-03-M001P001-000000000000015', description: 'Número de control del DTE.' })
  @IsString() @MinLength(3) @MaxLength(64)
  invoiceNumber: string;

  @ApiPropertyOptional({ description: 'Código de generación del DTE (UUID).' })
  @IsOptional() @IsString() @MaxLength(40)
  generationCode?: string;

  @ApiProperty({ enum: ['03', '01'], description: '03 = Comprobante de crédito fiscal; 01 = Factura.' })
  @IsIn(['03', '01'])
  documentType: '03' | '01';

  @ApiProperty({ example: '2026-03-01' })
  @Matches(YMD, { message: YMD_MSG })
  invoiceDate: string;

  @ApiPropertyOptional({ description: 'Por defecto: fecha de la factura + días de crédito del honorario.' })
  @IsOptional() @Matches(YMD, { message: YMD_MSG })
  dueDate?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500)
  description?: string;

  @ApiProperty({ description: 'Monto neto en USD (sin IVA).' }) @IsNumber(MONEY)
  netAmount: number;

  @ApiPropertyOptional({ description: 'IVA en USD; 0 si es exenta.' }) @IsOptional() @IsNumber({ ...MONEY }) @Min(0)
  taxAmount?: number;

  @ApiPropertyOptional({ type: [WithholdingInputDto], description: 'Retenciones que ya trae el DTE.' })
  @IsOptional() @IsArray() @ArrayMaxSize(5) @ValidateNested({ each: true }) @Type(() => WithholdingInputDto)
  withholdings?: WithholdingInputDto[];
}

export class UpdateInvoiceDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(3) @MaxLength(64)
  invoiceNumber?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40)
  generationCode?: string;

  @ApiPropertyOptional({ enum: ['03', '01'] }) @IsOptional() @IsIn(['03', '01'])
  documentType?: '03' | '01';

  @ApiPropertyOptional() @IsOptional() @Matches(YMD, { message: YMD_MSG })
  invoiceDate?: string;

  @ApiPropertyOptional() @IsOptional() @Matches(YMD, { message: YMD_MSG })
  dueDate?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ description: 'Solo mientras la factura no tenga movimientos.' }) @IsOptional() @IsNumber(MONEY)
  netAmount?: number;

  @ApiPropertyOptional({ description: 'Solo mientras la factura no tenga movimientos.' }) @IsOptional() @IsNumber(MONEY) @Min(0)
  taxAmount?: number;
}

export class ReasonDto {
  @ApiProperty({ example: 'Se emitió con un monto equivocado y se reemplazó por otra factura.' })
  @IsString() @MinLength(10) @MaxLength(500)
  reason: string;
}

export class AddWithholdingDto {
  @ApiProperty({ enum: WithholdingTaxType })
  @IsEnum(WithholdingTaxType)
  taxType: WithholdingTaxType;

  @ApiProperty() @IsNumber(MONEY)
  amount: number;

  @ApiPropertyOptional({ description: 'Fecha de la retención; por defecto hoy.' })
  @IsOptional() @Matches(YMD, { message: YMD_MSG })
  appliedOn?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60)
  certificateNumber?: string;
}

export class ListInvoicesQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() clientId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() engagementId?: string;
  @ApiPropertyOptional({ enum: ClientInvoiceStatus }) @IsOptional() @IsEnum(ClientInvoiceStatus) status?: ClientInvoiceStatus;
  @ApiPropertyOptional({ description: 'Solo facturas con saldo y vencidas.' }) @IsOptional() @IsIn(['true', 'false']) overdue?: string;
  @ApiPropertyOptional({ description: 'Solo facturas con saldo pendiente.' }) @IsOptional() @IsIn(['true', 'false']) open?: string;
  @ApiPropertyOptional({ description: 'Número de control o descripción.' }) @IsOptional() @IsString() @MaxLength(80) search?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(YMD, { message: YMD_MSG }) from?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(YMD, { message: YMD_MSG }) to?: string;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @ApiPropertyOptional({ default: 50 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize?: number;
}

// ── Cobros ──────────────────────────────────────────────────────────────────
export class ApplicationDto {
  @ApiProperty() @IsString() @MinLength(8) @MaxLength(64)
  invoiceId: string;

  @ApiProperty() @IsNumber(MONEY)
  amount: number;
}

export class PaymentWithholdingDto extends WithholdingInputDto {
  @ApiProperty({ description: 'Factura a la que corresponde la retención practicada en este pago.' })
  @IsString() @MinLength(8) @MaxLength(64)
  invoiceId: string;
}

export class RegisterPaymentDto {
  @ApiProperty() @IsString() @MinLength(8) @MaxLength(64)
  clientId: string;

  @ApiProperty({ example: '2026-03-20', description: 'No puede ser futura (hora de El Salvador).' })
  @Matches(YMD, { message: YMD_MSG })
  paymentDate: string;

  @ApiProperty({ description: 'Dinero recibido, en USD.' }) @IsNumber(MONEY)
  amount: number;

  @ApiProperty({ enum: ClientPaymentMethod })
  @IsEnum(ClientPaymentMethod)
  method: ClientPaymentMethod;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120)
  reference?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000)
  notes?: string;

  @ApiPropertyOptional({ description: 'Identificador que genera la pantalla para que un reintento no duplique el cobro.' })
  @IsOptional() @IsString() @MinLength(8) @MaxLength(80)
  clientRequestId?: string;

  @ApiPropertyOptional({ type: [ApplicationDto] })
  @IsOptional() @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => ApplicationDto)
  applications?: ApplicationDto[];

  @ApiPropertyOptional({ description: 'Reparte el cobro entre las facturas pendientes del cliente, la que vence primero primero. Solo si no se indican aplicaciones.' })
  @IsOptional() @StrictBoolean()
  autoAllocate?: boolean;

  @ApiPropertyOptional({ type: [PaymentWithholdingDto], description: 'Retenciones que el cliente practicó en este pago.' })
  @IsOptional() @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => PaymentWithholdingDto)
  withholdings?: PaymentWithholdingDto[];
}

export class ApplyPaymentDto {
  @ApiProperty({ type: [ApplicationDto] })
  @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => ApplicationDto)
  applications: ApplicationDto[];

  @ApiPropertyOptional({ type: [PaymentWithholdingDto] })
  @IsOptional() @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => PaymentWithholdingDto)
  withholdings?: PaymentWithholdingDto[];
}

export class UpdatePaymentDto {
  @ApiPropertyOptional() @IsOptional() @Matches(YMD, { message: YMD_MSG }) paymentDate?: string;
  @ApiPropertyOptional({ enum: ClientPaymentMethod }) @IsOptional() @IsEnum(ClientPaymentMethod) method?: ClientPaymentMethod;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) reference?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @ApiPropertyOptional({ description: 'Solo mientras el cobro no tenga aplicaciones ni retenciones.' })
  @IsOptional() @IsNumber(MONEY)
  amount?: number;
}

export class ListPaymentsQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() clientId?: string;
  @ApiPropertyOptional({ enum: ClientPaymentStatus }) @IsOptional() @IsEnum(ClientPaymentStatus) status?: ClientPaymentStatus;
  @ApiPropertyOptional({ description: 'Solo cobros con saldo a favor sin aplicar.' }) @IsOptional() @IsIn(['true', 'false']) unapplied?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(YMD, { message: YMD_MSG }) from?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(YMD, { message: YMD_MSG }) to?: string;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @ApiPropertyOptional({ default: 50 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize?: number;
}

export class ListWithholdingsQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() clientId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() invoiceId?: string;
  @ApiPropertyOptional({ enum: WithholdingTaxType }) @IsOptional() @IsEnum(WithholdingTaxType) taxType?: WithholdingTaxType;
  @ApiPropertyOptional() @IsOptional() @Matches(YMD, { message: YMD_MSG }) from?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(YMD, { message: YMD_MSG }) to?: string;
  @ApiPropertyOptional({ description: 'Incluir las ya revertidas.' }) @IsOptional() @IsIn(['true', 'false']) includeReversed?: string;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @ApiPropertyOptional({ default: 200 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) pageSize?: number;
}
