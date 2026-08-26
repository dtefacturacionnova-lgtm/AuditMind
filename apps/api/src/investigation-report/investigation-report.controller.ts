import {
  Controller, Get, Post, Delete, Param, Body, UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { IsString, IsOptional, IsIn, IsISO8601, MaxLength } from 'class-validator';
import { UserRole } from '@prisma/client';
import { InvestigationReportService } from './investigation-report.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';

class IniciarInformeBody {
  @IsString()
  @MaxLength(4000)
  objetivo: string;
}

class CrearContextoBody {
  @IsIn(['TEXT_NOTE', 'AUDIO_NOTE'])
  kind: 'TEXT_NOTE' | 'AUDIO_NOTE';

  @IsISO8601()
  capturedAt: string;

  @IsOptional()
  @IsString()
  texto?: string;
}

@ApiTags('Investigador Forense — SHERLOCK')
@ApiBearerAuth()
@Controller('audits/:auditId/investigation-report')
export class InvestigationReportController {
  constructor(private readonly svc: InvestigationReportService) {}

  @Post()
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Fase 2b — Generar un informe de SHERLOCK (fire-and-forget, cliente hace polling)' })
  iniciar(
    @Param('auditId') auditId: string,
    @Body() body: IniciarInformeBody,
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.iniciar(auditId, body.objetivo, user);
  }

  @Get()
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Historial de informes de SHERLOCK del encargo' })
  listar(@Param('auditId') auditId: string, @CurrentUser() user: AuthUser) {
    return this.svc.listar(auditId, user);
  }

  @Get('context')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Listar el contexto previo del auditor capturado para este encargo' })
  listarContexto(@Param('auditId') auditId: string, @CurrentUser() user: AuthUser) {
    return this.svc.listarContexto(auditId, user);
  }

  @Post('context')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Capturar una nota de contexto previo (texto o voz) para que SHERLOCK la verifique contra el grafo' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }))
  crearContexto(
    @Param('auditId') auditId: string,
    @Body() body: CrearContextoBody,
    @UploadedFile() file: { buffer: Buffer; originalname: string; mimetype: string; size: number } | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.crearContexto(auditId, body, file, user);
  }

  @Delete('context/:evidenceId')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Eliminar una nota de contexto previo capturada por error' })
  eliminarContexto(
    @Param('auditId') auditId: string,
    @Param('evidenceId') evidenceId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.eliminarContexto(auditId, evidenceId, user);
  }

  @Get(':reportId')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Estado/detalle de un informe de SHERLOCK (polling)' })
  obtenerUno(
    @Param('auditId') auditId: string,
    @Param('reportId') reportId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.obtenerUno(auditId, reportId, user);
  }
}
