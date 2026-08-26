import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import {
  IsArray, IsIn, IsNumber, IsObject, IsOptional, IsString, Max, MaxLength, Min,
} from 'class-validator';
import { CaatsAutoRunService } from './caats-auto-run.service';
import { CaatsHistoryService } from './caats-history.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';

class ClassifySpreadsheetBody {
  @IsString()
  @MaxLength(2000)
  descripcion: string;

  @IsArray()
  @IsString({ each: true })
  columns: string[];

  @IsArray()
  sampleRows: Record<string, unknown>[];
}

const AUTO_RUN_ENGINE_IDS = [
  'gl', 'ap', 'payroll', 'benford', 'anomaly', 'sod', 'vendor_master', 'expenses',
  'revenue_cutoff', 'bid_rigging', 'ar_aging', 'fixed_assets', 'structuring',
  'missing_trader', 'tax_haven', 'sanctions_screening',
] as const;

class CreateCaatsAutoRunBody {
  @IsIn(AUTO_RUN_ENGINE_IDS)
  engine: string;

  @IsString()
  @MaxLength(2000)
  descripcion: string;

  @IsOptional()
  @IsString()
  fileName?: string;

  @IsOptional()
  @IsObject()
  fieldMapping?: Record<string, unknown>;

  @IsObject()
  result: Record<string, unknown>;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confianzaDeteccion?: number;

  @IsOptional()
  @IsString()
  justificacionDeteccion?: string;
}

// Fase 2c — auto-detección + persistencia de resultados CAATs desde el tab
// Investigador. Controlador propio (no rutas dentro de
// InvestigationReportController) porque es conceptualmente CAATs, no el
// informe SHERLOCK, aunque comparta el mismo prefijo de auditoría.
@ApiTags('Investigador Forense — CAATs auto-detectado (Fase 2c)')
@ApiBearerAuth()
@Controller('audits/:auditId/investigation-report/caats')
export class CaatsAutoRunController {
  constructor(
    private readonly svc: CaatsAutoRunService,
    private readonly history: CaatsHistoryService,
  ) {}

  @Get('history')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Historial CAATs unificado del encargo (manual + auto-detectado)' })
  getHistory(@Param('auditId') auditId: string, @CurrentUser() user: AuthUser) {
    return this.history.getHistory(auditId, user);
  }

  @Post('classify')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Clasificar una hoja de cálculo subida en 1 de los 15 motores CAATs auto-ejecutables (o "ninguno")' })
  classify(
    @Param('auditId') auditId: string,
    @Body() body: ClassifySpreadsheetBody,
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.classify(auditId, body, user);
  }

  @Post()
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Persistir un análisis CAATs ya ejecutado desde el Investigador (el motor se corre en el frontend, esto solo guarda el resultado)' })
  persist(
    @Param('auditId') auditId: string,
    @Body() body: CreateCaatsAutoRunBody,
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.persist(auditId, body, user);
  }
}
