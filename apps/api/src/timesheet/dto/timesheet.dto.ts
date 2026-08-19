import {
  IsString, IsOptional, IsEnum, IsNumber, IsDateString, IsArray, ArrayNotEmpty, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TimeEntryCategory } from '@prisma/client';

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
