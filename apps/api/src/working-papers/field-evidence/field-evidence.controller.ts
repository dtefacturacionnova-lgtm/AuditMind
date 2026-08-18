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

class AceptarHallazgoBody {
  @IsOptional()
  @IsString()
  targetSectionKey?: string;
}

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

  @IsOptional()
  @IsString()
  anotaciones?: string; // ANNOTATED_PHOTO — JSON.stringify([{tipo,x,y,...}]), coords 0-1 relativas a la imagen
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

  @Get(':evidenceId/media')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'URL firmada de corta duración para escuchar/ver (mode=view) o descargar (mode=download, restringido) el archivo original' })
  obtenerUrlMedia(
    @Param('paperId') paperId: string,
    @Param('evidenceId') evidenceId: string,
    @Query('mode') mode: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    const modo = mode === 'download' ? 'download' : 'view';
    return this.svc.obtenerUrlMedia(paperId, evidenceId, modo, user);
  }

  @Post(':evidenceId/retry')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Reintentar el análisis de una evidencia en estado FAILED, sin re-subir el archivo original' })
  reintentar(
    @Param('paperId') paperId: string,
    @Param('evidenceId') evidenceId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.reintentar(paperId, evidenceId, user);
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

  @Post('findings/:findingId/accept')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Aceptar un hallazgo sugerido — materializa la fila en la sección destino' })
  aceptarHallazgo(
    @Param('paperId') paperId: string,
    @Param('findingId') findingId: string,
    @Body() body: AceptarHallazgoBody,
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.aceptar(paperId, findingId, body.targetSectionKey, user);
  }

  @Post('findings/:findingId/discard')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Descartar un hallazgo sugerido' })
  descartarHallazgo(
    @Param('paperId') paperId: string,
    @Param('findingId') findingId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.descartar(paperId, findingId, user);
  }

  @Post('findings/:findingId/promote')
  @Roles(UserRole.SENIOR_AUDITOR)
  @ApiOperation({ summary: 'Promover un hallazgo ya aceptado a un Hallazgo formal (PT-HALL)' })
  promoverHallazgo(
    @Param('paperId') paperId: string,
    @Param('findingId') findingId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.promover(paperId, findingId, user);
  }
}
