import { Type } from 'class-transformer';
import {
  IsArray, IsEnum, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { BillingAudience, EnforcementMode } from '@prisma/client';
import { StrictBoolean } from '../../common/validators/strict-boolean.decorator';

export class PlanLimitsDto {
  @IsOptional() @IsInt() @Min(-1) users?: number;
  @IsOptional() @IsInt() @Min(-1) maxUsers?: number;
  @IsOptional() @IsNumber() @Min(0) extraUserPriceUsd?: number;
  @IsOptional() @IsInt() @Min(-1) storageGb?: number;
  @IsOptional() @IsInt() @Min(-1) maxFileMb?: number;
  @IsOptional() @IsInt() @Min(-1) aiRequests?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) fileTypes?: string[];
  @IsOptional() @StrictBoolean() packsAi?: boolean;
  @IsOptional() @StrictBoolean() packsStorage?: boolean;
}

export class PlanPriceDto {
  @IsInt() @IsIn([0, 1, 3, 6, 12]) months!: number;
  @IsNumber() @Min(0) priceUsd!: number;
  @IsOptional() @StrictBoolean() active?: boolean;
}

export class CreatePlanDto {
  @IsString() @MaxLength(40) code!: string;
  @IsString() @MaxLength(120) name!: string;
  @IsEnum(BillingAudience) audience!: BillingAudience;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @StrictBoolean() isPublic?: boolean;
  @IsOptional() @StrictBoolean() featured?: boolean;
  @IsOptional() @StrictBoolean() active?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(1000) sortOrder?: number;
  @IsOptional() @IsInt() @Min(0) @Max(365) trialDays?: number;
  @IsOptional() @ValidateNested() @Type(() => PlanLimitsDto) limits?: PlanLimitsDto;
  @IsOptional() @IsArray() @IsString({ each: true }) modules?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) functions?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) assistants?: string[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PlanPriceDto) prices?: PlanPriceDto[];
}

export class UpdatePlanDto {
  @IsOptional() @IsString() @MaxLength(40) code?: string;
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsEnum(BillingAudience) audience?: BillingAudience;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @StrictBoolean() isPublic?: boolean;
  @IsOptional() @StrictBoolean() featured?: boolean;
  @IsOptional() @StrictBoolean() active?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(1000) sortOrder?: number;
  @IsOptional() @IsInt() @Min(0) @Max(365) trialDays?: number;
  @IsOptional() @ValidateNested() @Type(() => PlanLimitsDto) limits?: PlanLimitsDto;
  @IsOptional() @IsArray() @IsString({ each: true }) modules?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) functions?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) assistants?: string[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PlanPriceDto) prices?: PlanPriceDto[];
}

export class AssignPlanDto {
  @IsString() @MaxLength(40) planCode!: string;
  @IsInt() @IsIn([0, 1, 3, 6, 12]) months!: number;
  @IsOptional() @IsNumber() @Min(0) agreedPriceUsd?: number;
}

export class RenewDto {
  @IsOptional() @IsInt() @IsIn([1, 3, 6, 12]) months?: number;
}

export class ExtendTrialDto {
  @IsInt() @Min(1) @Max(365) days!: number;
}

export class UpdateSubscriptionDto {
  @IsOptional() @IsNumber() @Min(0) agreedPriceUsd?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1000) extraUsers?: number;
  @IsOptional() @StrictBoolean() exempt?: boolean;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsOptional() @IsObject() overrides?: Record<string, unknown>;
  @IsOptional() @IsIn(['ACTIVE', 'SUSPENDED', 'CANCELLED']) status?: 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';
}

export class UpdateBillingSettingsDto {
  @IsOptional() @IsEnum(EnforcementMode) enforcementMode?: EnforcementMode;
  @IsOptional() @IsInt() @Min(0) @Max(90) graceDays?: number;
  @IsOptional() @IsInt() @Min(0) @Max(365) readOnlyDays?: number;
  @IsOptional() @IsArray() @IsInt({ each: true }) @Min(0, { each: true }) reminderDays?: number[];
  @IsOptional() @IsNumber() @Min(0) costPerRequestUsd?: number;
  @IsOptional() @IsNumber() @Min(1) @Max(20) safetyMultiplier?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) ivaPercent?: number;
  @IsOptional() @IsString() @MaxLength(40) defaultPlanCode?: string;
  @IsOptional() @IsObject() paymentInstructions?: Record<string, string>;
}

export class CreatePaymentDto {
  @IsIn(['LICENSE', 'PACK']) kind!: 'LICENSE' | 'PACK';
  @IsOptional() @IsString() @MaxLength(40) planCode?: string;
  @IsOptional() @IsInt() @IsIn([1, 3, 6, 12]) months?: number;
  @IsOptional() @IsString() @MaxLength(40) packCode?: string;
  @IsIn(['TRANSFER', 'QR', 'CASH']) method!: 'TRANSFER' | 'QR' | 'CASH';
}

export class RejectPaymentDto {
  @IsString() @MaxLength(500) reason!: string;
}

export class SavePackDto {
  @IsOptional() @IsString() @MaxLength(40) code?: string;
  @IsOptional() @IsIn(['AI', 'STORAGE']) kind?: 'AI' | 'STORAGE';
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  /** Peticiones (IA) o GB (espacio). El tope evita desbordar la columna entera de la base. */
  @IsOptional() @IsInt() @Min(1) @Max(100_000_000) quantity?: number;
  /** Hasta 7 cifras enteras: la columna admite 8 y así un error de dedo no revienta con un 500. */
  @IsOptional() @IsNumber() @Min(0) @Max(9_999_999) priceUsd?: number;
  @IsOptional() @StrictBoolean() recurring?: boolean;
  @IsOptional() @StrictBoolean() active?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(1000) sortOrder?: number;
}
