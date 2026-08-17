import {
  Controller, Get, Post, Delete, Param, Body, Query,
  UseInterceptors, UploadedFile, HttpCode, HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsISO8601 } from 'class-validator';
import { FieldEvidenceKind, UserRole } from '@prisma/client';
import { FieldEvidenceService } from './field-evidence.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../auth/jwt.strategy';

class CrearEvidenciaBody {
  @IsEnum(FieldEvidenceKind)
  kind: FieldEvidenceKind;

  @IsString()
  sectionKey: string;

  @IsISO8601()
  capturedAt: string;

  @IsOptional()
  @IsString()
  consentimiento?: string; // 'true' | 'false' — string crudo de multipart

  @IsOptional()
  @IsString()
  lugar?: string;

  @IsOptional()
  @IsString()
  descripcion?: string;

  @IsOptional()
  @IsString()
  texto?: string;
}

@ApiTags('Evidencia de Campo')
@ApiBearerAuth()
@Controller('working-papers/:paperId/evidence')
export class FieldEvidenceController {
  constructor(private readonly svc: FieldEvidenceService) {}

  @Post()
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Ingesta de evidencia de campo (texto o nota de voz) con custodia sellada' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }))
  crear(
    @Param('paperId') paperId: string,
    @Body() body: CrearEvidenciaBody,
    @UploadedFile() file: { buffer: Buffer; originalname: string; mimetype: string; size: number } | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.crear(paperId, body, file, user);
  }

  @Get()
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Listar evidencia de campo del papel' })
  listar(
    @Param('paperId') paperId: string,
    @Query('all') all: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.listar(paperId, user, all === 'true');
  }

  @Get(':evidenceId')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Estado/detalle de una evidencia (polling)' })
  obtenerUno(
    @Param('paperId') paperId: string,
    @Param('evidenceId') evidenceId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.obtenerUno(paperId, evidenceId, user);
  }

  @Delete(':evidenceId')
  @Roles(UserRole.SENIOR_AUDITOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Eliminar evidencia de campo (acto de custodia)' })
  eliminar(
    @Param('paperId') paperId: string,
    @Param('evidenceId') evidenceId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.eliminar(paperId, evidenceId, user);
  }
}
