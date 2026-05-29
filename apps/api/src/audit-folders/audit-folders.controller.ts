import {
  Controller, Get, Post, Patch, Delete, Body, Param, HttpCode, HttpStatus,
  UploadedFile, UseInterceptors, Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuditFoldersService } from './audit-folders.service';
import {
  CreatePhaseDto, UpdatePhaseDto,
  CreateFolderDto, UpdateFolderDto, ReorderFoldersDto,
  CreateFilePaperDto,
} from './dto/folder.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthUser } from '../auth/jwt.strategy';
import { UserRole } from '@prisma/client';

@ApiTags('Expediente de Auditoría')
@ApiBearerAuth()
@Controller('audits/:auditId/expediente')
export class AuditFoldersController {
  constructor(private readonly service: AuditFoldersService) {}

  // ─── Expediente completo ─────────��────────────────────────────────────────

  @Get()
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Obtener expediente completo (fases + árbol de carpetas)' })
  getExpediente(@Param('auditId') auditId: string, @CurrentUser() user: AuthUser) {
    return this.service.getExpediente(auditId, user);
  }

  @Post('initialize')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Inicializar expediente (se puede pasar templateId opcional)' })
  @HttpCode(HttpStatus.CREATED)
  initialize(
    @Param('auditId') auditId: string,
    @Body() body: { templateId?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.initializeFromTemplate(auditId, user, body?.templateId);
  }

  @Post('initialize-from-template')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Inicializar expediente desde la estructura de la plantilla de auditoría' })
  @HttpCode(HttpStatus.CREATED)
  initializeFromAuditTemplate(
    @Param('auditId') auditId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.initializeFromAuditTemplateSections(auditId, user);
  }

  // ─── Fases ────────────────────────────────────────────────────────────────

  @Post('phases')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Agregar una fase al expediente' })
  createPhase(
    @Param('auditId') auditId: string,
    @Body() dto: CreatePhaseDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.createPhase(auditId, dto, user);
  }

  @Patch('phases/:phaseId')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Actualizar datos de una fase' })
  updatePhase(
    @Param('phaseId') phaseId: string,
    @Body() dto: UpdatePhaseDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.updatePhase(phaseId, dto, user);
  }

  @Post('phases/:phaseId/sign-off')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Firmar y cerrar una fase (requiere rol Gerente o superior)' })
  signOffPhase(
    @Param('phaseId') phaseId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.signOffPhase(phaseId, user);
  }

  // ─── Carpetas ────────────────────────────────���────────────────────────────

  @Post('folders')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Crear carpeta (o sub-carpeta, máx 3 niveles)' })
  createFolder(
    @Param('auditId') auditId: string,
    @Body() dto: CreateFolderDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.createFolder(auditId, dto, user);
  }

  @Patch('folders/:folderId')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Actualizar carpeta (ref, nombre, posición)' })
  updateFolder(
    @Param('folderId') folderId: string,
    @Body() dto: UpdateFolderDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.updateFolder(folderId, dto, user);
  }

  @Delete('folders/:folderId')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Eliminar carpeta (solo si está vacía)' })
  @HttpCode(HttpStatus.OK)
  deleteFolder(
    @Param('folderId') folderId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.deleteFolder(folderId, user);
  }

  @Patch('folders/reorder')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Reordenar carpetas (drag & drop)' })
  reorderFolders(@Body() dto: ReorderFoldersDto, @CurrentUser() user: AuthUser) {
    return this.service.reorderFolders(dto, user);
  }

  // ─── Upload + registro (backend sube a Storage con service-role, bypasea RLS)

  @Post('folders/:folderId/upload')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Subir archivo al expediente (backend gestiona Storage)' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  @HttpCode(HttpStatus.CREATED)
  uploadFile(
    @Param('auditId') auditId: string,
    @Param('folderId') folderId: string,
    @UploadedFile() file: Express.Multer.File,
    @Query('title') title: string,
    @Query('ref') ref: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.uploadAndRegisterFile(auditId, folderId, file, title, ref, user);
  }

  // ─── Registrar archivo adjunto como papel de trabajo (legacy) ──────────────

  @Post('folders/:folderId/files')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Registrar archivo ya subido a Supabase Storage como papel de trabajo' })
  @HttpCode(HttpStatus.CREATED)
  createFilePaper(
    @Param('auditId') auditId: string,
    @Param('folderId') folderId: string,
    @Body() dto: CreateFilePaperDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.createFilePaper(auditId, folderId, dto, user);
  }

  // ─── Asignar papel a carpeta ──────────────────────────────────────────────

  @Patch('papers/:paperId/assign')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Asignar (o desasignar) un papel de trabajo a una carpeta' })
  assignPaper(
    @Param('paperId') paperId: string,
    @Body() body: { folderId: string | null },
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.assignPaperToFolder(paperId, body.folderId, user);
  }
}
