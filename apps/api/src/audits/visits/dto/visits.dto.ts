import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { StrictBoolean } from '../../../common/validators/strict-boolean.decorator';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MSG = 'La fecha debe tener el formato AAAA-MM-DD.';

/** Fechas de corte de las tres visitas (planificación < interina < final). */
export class EnableVisitsDto {
  @IsString() @Matches(DATE_ONLY, { message: DATE_MSG }) planning!: string;
  @IsString() @Matches(DATE_ONLY, { message: DATE_MSG }) interim!: string;
  @IsString() @Matches(DATE_ONLY, { message: DATE_MSG }) final!: string;
}

export class UpdateVisitDto {
  @IsOptional() @IsString() @Matches(DATE_ONLY, { message: DATE_MSG }) cutoffDate?: string;
  @IsOptional() @IsIn(['PLANNED', 'IN_PROGRESS', 'CLOSED']) status?: 'PLANNED' | 'IN_PROGRESS' | 'CLOSED';
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  /** true = esta visita alimenta los análisis de B-00; false = deja de hacerlo. */
  @IsOptional() @StrictBoolean() isAnalysisBase?: boolean;
}

export class VisitAccountDto {
  @IsString() @MaxLength(60) code!: string;
  @IsString() @MaxLength(300) name!: string;
  @IsNumber() @Min(0) @Max(1e15) debit!: number;
  @IsNumber() @Min(0) @Max(1e15) credit!: number;
  @IsNumber() @Min(-1e15) @Max(1e15) balance!: number;
}

export class ImportVisitBalanceDto {
  @IsString() @MaxLength(250) filename!: string;
  @IsOptional() @IsString() @MaxLength(120) periodLabel?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20000) @ValidateNested({ each: true }) @Type(() => VisitAccountDto) accounts!: VisitAccountDto[];
}
