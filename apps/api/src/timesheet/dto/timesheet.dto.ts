import {
  IsString, IsOptional, IsEnum, IsNumber, IsDateString, IsArray, ArrayNotEmpty, ValidateNested,
  IsInt, Min, Max, MinLength, MaxLength, ArrayMaxSize, IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NonBillableReason, TimeAdjustmentAction, TimeEntryCategory } from '@prisma/client';
import { StrictBoolean } from '../../common/validators/strict-boolean.decorator';

export class CreateTimesheetEntryDto {
  @ApiProperty({ example: '2026-08-19' })
  @IsDateString()
  workDate: string;

  @ApiProperty({ example: 8 })
  @IsNumber()
  hours: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: TimeEntryCategory, example: TimeEntryCategory.CLIENT_BILLABLE })
  @IsEnum(TimeEntryCategory)
  category: TimeEntryCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  auditId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  planItemId?: string;

  @ApiPropertyOptional({ enum: NonBillableReason, description: 'Obligatorio solo con category = CLIENT_NON_BILLABLE' })
  @IsOptional()
  @IsEnum(NonBillableReason)
  nonBillableReason?: NonBillableReason;
}

/** Edición parcial de una hora propia (mes abierto). `null` en auditId/planItemId/nonBillableReason los quita. */
export class UpdateTimesheetEntryDto {
  @ApiPropertyOptional({ example: '2026-08-19' })
  @IsOptional()
  @IsDateString()
  workDate?: string;

  @ApiPropertyOptional({ example: 8 })
  @IsOptional()
  @IsNumber()
  hours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional({ enum: TimeEntryCategory })
  @IsOptional()
  @IsEnum(TimeEntryCategory)
  category?: TimeEntryCategory;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  auditId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  planItemId?: string | null;

  @ApiPropertyOptional({ enum: NonBillableReason, nullable: true })
  @IsOptional()
  @IsEnum(NonBillableReason)
  nonBillableReason?: NonBillableReason | null;
}

export class BulkCreateTimesheetEntryDto {
  @ApiProperty({ type: [CreateTimesheetEntryDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CreateTimesheetEntryDto)
  entries: CreateTimesheetEntryDto[];
}

export class QueryTimesheetEntriesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ enum: TimeEntryCategory })
  @IsOptional()
  @IsEnum(TimeEntryCategory)
  category?: TimeEntryCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  auditId?: string;
}

export enum TimesheetReportGroupBy {
  USER = 'user',
  AUDIT = 'audit',
  PLAN = 'plan',
  DATE = 'date',
}

export class QueryTimesheetReportDto {
  @ApiProperty({ enum: TimesheetReportGroupBy })
  @IsEnum(TimesheetReportGroupBy)
  groupBy: TimesheetReportGroupBy;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  auditId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  planId?: string;

  @ApiPropertyOptional({ enum: TimeEntryCategory })
  @IsOptional()
  @IsEnum(TimeEntryCategory)
  category?: TimeEntryCategory;
}


// ─── Cierre de horas por persona y mes ───────────────────────────────────────

export class HoursCloseSettingsDto {
  @ApiProperty()
  @StrictBoolean()
  enabled: boolean;

  @ApiProperty({ example: 5, description: 'Día hábil del mes siguiente hasta el que el auditor registra' })
  @IsInt() @Min(1) @Max(28)
  entryDeadlineDay: number;

  @ApiProperty({ example: 10, description: 'Día hábil del mes siguiente hasta el que el gerente cierra' })
  @IsInt() @Min(1) @Max(28)
  closeDeadlineDay: number;
}

export class PeriodQueryDto {
  @ApiProperty({ example: 2026 })
  @Type(() => Number) @IsInt() @Min(2000) @Max(2100)
  year: number;

  @ApiProperty({ example: 10 })
  @Type(() => Number) @IsInt() @Min(1) @Max(12)
  month: number;
}

export class PersonPeriodQueryDto extends PeriodQueryDto {
  @ApiProperty()
  @IsString()
  userId: string;
}

export class MyPeriodsQueryDto {
  @ApiProperty({ example: '2026-10-01' })
  @IsDateString()
  dateFrom: string;

  @ApiProperty({ example: '2026-10-31' })
  @IsDateString()
  dateTo: string;
}

export class ClosePeriodDto extends PeriodQueryDto {
  @ApiProperty({ description: 'Persona cuyas horas se cierran' })
  @IsString()
  userId: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(1000)
  note?: string;
}

export class ReopenPeriodDto extends PeriodQueryDto {
  @ApiProperty()
  @IsString()
  userId: string;

  @ApiProperty({ description: 'Motivo (queda en la bitácora)' })
  @IsString() @MinLength(5) @MaxLength(1000)
  reason: string;
}

export class RemindPeriodDto extends PeriodQueryDto {
  @ApiPropertyOptional({ description: 'Si se omite, a todas las personas con días sin horas' })
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsString({ each: true })
  userIds?: string[];
}

export class CreateAdjustmentDto {
  @ApiProperty({ enum: TimeAdjustmentAction })
  @IsEnum(TimeAdjustmentAction)
  action: TimeAdjustmentAction;

  @ApiPropertyOptional({ description: 'EDIT y DELETE: la hora a cambiar o borrar' })
  @IsOptional() @IsString()
  timeEntryId?: string;

  @ApiPropertyOptional({ type: CreateTimesheetEntryDto, description: 'ADD: la hora completa' })
  @IsOptional() @ValidateNested() @Type(() => CreateTimesheetEntryDto)
  entry?: CreateTimesheetEntryDto;

  @ApiPropertyOptional({ type: UpdateTimesheetEntryDto, description: 'EDIT: los campos a cambiar' })
  @IsOptional() @ValidateNested() @Type(() => UpdateTimesheetEntryDto)
  changes?: UpdateTimesheetEntryDto;

  @ApiProperty()
  @IsString() @MinLength(5) @MaxLength(1000)
  reason: string;
}

export class DecideAdjustmentDto {
  @ApiProperty()
  @StrictBoolean()
  approve: boolean;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(1000)
  note?: string;
}

export class QueryAdjustmentsDto {
  @ApiPropertyOptional({ enum: ['PENDING', 'APPROVED', 'REJECTED'] })
  @IsOptional() @IsIn(['PENDING', 'APPROVED', 'REJECTED'])
  status?: 'PENDING' | 'APPROVED' | 'REJECTED';

  @ApiPropertyOptional({ description: 'true = solo los míos (por defecto para auditores)' })
  @IsOptional() @IsString()
  mine?: string;
}
