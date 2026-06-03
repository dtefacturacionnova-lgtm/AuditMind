import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';
import { DteValidatorService, DteRecord } from './dte-validator.service';

class DteRecordDto implements DteRecord {
  @IsString() fecha: string;
  @IsOptional() @IsString() hora?: string;
  @IsString() numeroCorrelativo: string;
  @IsOptional() @IsString() tipo?: string;
  @IsOptional() @IsString() codigoGeneracion?: string;
  @IsOptional() @IsString() estado?: 'PROCESADO' | 'ANULADO' | 'RECHAZADO' | string;
  @IsOptional() monto?: number | string;
  @IsOptional() @IsString() receptorNit?: string;
  @IsOptional() @IsString() receptorNombre?: string;
}

class ValidateDteDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => DteRecordDto)
  records: DteRecordDto[];

  @IsOptional() @IsArray() @IsString({ each: true })
  holidays?: string[];
}

@ApiTags('Fiscal SV')
@ApiBearerAuth()
@Controller('fiscal')
export class FiscalController {
  constructor(private readonly dteValidator: DteValidatorService) {}

  @Post('validate-dte')
  @ApiOperation({ summary: 'Validar correlativo, fechas, horarios, duplicados y anomalías sobre lista de DTEs (Código Tributario SV)' })
  validateDte(@Body() dto: ValidateDteDto, @CurrentUser() _user: AuthUser) {
    return this.dteValidator.validate(dto.records, dto.holidays);
  }
}
