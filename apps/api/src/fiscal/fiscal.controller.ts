import { Controller, Post, Get, Body, Param, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, ValidateNested, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';
import { DteValidatorService, DteRecord } from './dte-validator.service';
import { DgiiService } from './dgii.service';
import { Anexo12Service } from './anexo12.service';

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

class DgiiContribuyenteDto {
  @IsString() nit: string;
  @IsOptional() @IsString() nrc?: string;
  @IsString() nombre: string;
  @IsString() estado: string;
  @IsOptional() @IsString() giro?: string;
  @IsOptional() @IsString() categoria?: string;
  @IsOptional() @IsString() fechaInscripcion?: string;
  @IsOptional() @IsString() direccion?: string;
}

class ImportDgiiDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => DgiiContribuyenteDto)
  contribuyentes: DgiiContribuyenteDto[];

  @IsOptional() @IsBoolean() replaceAll?: boolean;
}

class VerifyNrcDto {
  @IsArray() @IsString({ each: true })
  nits: string[];
}

@ApiTags('Fiscal SV')
@ApiBearerAuth()
@Controller('fiscal')
export class FiscalController {
  constructor(
    private readonly dteValidator: DteValidatorService,
    private readonly dgii:         DgiiService,
    private readonly anexo12:      Anexo12Service,
  ) {}

  // ─── DTE ─────────────────────────────────────────────────────────────────
  @Post('validate-dte')
  @ApiOperation({ summary: 'Validar correlativo, fechas, horarios, duplicados y anomalías sobre lista de DTEs (CT SV)' })
  validateDte(@Body() dto: ValidateDteDto, @CurrentUser() _user: AuthUser) {
    return this.dteValidator.validate(dto.records, dto.holidays);
  }

  // ─── Padrón DGII ─────────────────────────────────────────────────────────
  @Post('dgii/import')
  @ApiOperation({ summary: 'Importar padrón de contribuyentes DGII (CSV/JSON parseado en frontend)' })
  importDgii(@Body() dto: ImportDgiiDto, @CurrentUser() user: AuthUser) {
    return this.dgii.import(dto, user);
  }

  @Get('dgii/stats')
  @ApiOperation({ summary: 'Stats del padrón DGII cargado por la organización' })
  getDgiiStats(@CurrentUser() user: AuthUser) {
    return this.dgii.getStats(user);
  }

  @Post('dgii/verify')
  @ApiOperation({ summary: 'Verificar batch de NITs contra el padrón DGII local' })
  verifyDgii(@Body() dto: VerifyNrcDto, @CurrentUser() user: AuthUser) {
    return this.dgii.verifyBatch(dto, user);
  }

  @Get('dgii/contribuyente/:nit')
  @ApiOperation({ summary: 'Consultar un contribuyente específico por NIT' })
  getDgiiOne(@Param('nit') nit: string, @CurrentUser() user: AuthUser) {
    return this.dgii.findOne(nit, user);
  }

  // ─── Anexo 12 SDF ────────────────────────────────────────────────────────
  @Get('anexo12/:auditId')
  @ApiOperation({ summary: 'Generar Anexo 12 SDF (detalle de incumplimientos) desde los hallazgos de la auditoría' })
  getAnexo12(@Param('auditId') auditId: string, @CurrentUser() user: AuthUser) {
    return this.anexo12.generate(auditId, user);
  }

  @Get('anexo12/:auditId/csv')
  @ApiOperation({ summary: 'Descargar Anexo 12 en CSV listo para subir al SDF DGII' })
  async getAnexo12Csv(
    @Param('auditId') auditId: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    const data = await this.anexo12.generate(auditId, user);
    const csv = this.anexo12.generateCsv(data);
    const filename = `anexo12_${auditId.slice(0, 8)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    // BOM para Excel ES
    res.send('﻿' + csv);
  }
}
