import {
  Controller, Get, Post, Param, Res, Body,
  UseInterceptors, UploadedFile, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../auth/jwt.strategy';
import { UserRole } from '@prisma/client';
import { AuditBackupService } from './audit-backup.service';
import { AuditBackupRestoreService } from './audit-backup-restore.service';
import { AuditDeleteService } from './audit-delete.service';

/**
 * Backup y restauración de encargos (BKP-01..13). Ver
 * `docs/backup-restauracion-encargos.md`. Restringido a rol CAE o superior
 * (`RolesGuard` compara jerarquía, no exige exactamente CAE — ver
 * `roles.guard.ts`) — un backup completo de un encargo contiene todos los
 * datos financieros y personales del cliente en un solo archivo portable,
 * no es una acción de cualquier auditor del equipo.
 */
@ApiTags('Backup de Encargos')
@ApiBearerAuth()
@Controller('audits')
export class AuditBackupController {
  constructor(
    private readonly backupSvc: AuditBackupService,
    private readonly restoreSvc: AuditBackupRestoreService,
    private readonly deleteSvc: AuditDeleteService,
  ) {}

  @Get(':id/backup')
  @Roles(UserRole.CAE)
  @ApiOperation({ summary: 'Descargar un backup completo del encargo (datos + archivos), firmado' })
  async descargarBackup(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    const { buffer, nombreArchivo, advertencias } = await this.backupSvc.exportar(id, user);
    if (advertencias.length > 0) {
      res.setHeader('X-AuditMind-Advertencias', encodeURIComponent(JSON.stringify(advertencias.slice(0, 50))));
    }
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  }

  // BKP-08/09 — restaurar SIEMPRE como encargo nuevo (nunca sobrescribe nada
  // existente). No cuelga de `:id` — todavía no existe el encargo destino,
  // se crea en esta misma llamada.
  @Post('restore-backup')
  @Roles(UserRole.CAE)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Restaurar un backup como encargo nuevo — nunca sobrescribe un encargo existente' })
  async restaurarBackup(
    @UploadedFile() file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
    @Body('titulo') titulo: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    if (!file) throw new BadRequestException('No se recibió archivo');
    if (!/\.zip$/i.test(file.originalname)) {
      throw new BadRequestException('Solo se aceptan archivos .zip generados por AuditMind');
    }
    return this.restoreSvc.restaurarComoNuevo(file.buffer, user, titulo);
  }

  // BKP-12 — restauración DESTRUCTIVA: sobrescribe el encargo `:id`. Rol
  // ADMIN o superior (un nivel arriba de CAE, que basta para exportar/
  // restaurar como nuevo) — es la acción de mayor blast-radius del feature,
  // per el diseño en docs/backup-restauracion-encargos.md §4/§5 (BKP-12).
  @Post(':id/backup/restore-preview')
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Previsualizar una restauración destructiva — no modifica nada, solo compara backup vs. estado actual' })
  async previsualizarRestauracionDestructiva(
    @Param('id') id: string,
    @UploadedFile() file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
    @CurrentUser() user: AuthUser,
  ) {
    if (!file) throw new BadRequestException('No se recibió archivo');
    if (!/\.zip$/i.test(file.originalname)) {
      throw new BadRequestException('Solo se aceptan archivos .zip generados por AuditMind');
    }
    return this.restoreSvc.previsualizarRestauracionDestructiva(id, file.buffer, user);
  }

  @Post(':id/backup/restore-destructive')
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Restaurar un backup SOBRE este encargo — sobrescribe todo lo posterior al backup, requiere confirmación escrita del título' })
  async restaurarDestructivo(
    @Param('id') id: string,
    @UploadedFile() file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
    @Body('confirmarTitulo') confirmarTitulo: string,
    @CurrentUser() user: AuthUser,
  ) {
    if (!file) throw new BadRequestException('No se recibió archivo');
    if (!/\.zip$/i.test(file.originalname)) {
      throw new BadRequestException('Solo se aceptan archivos .zip generados por AuditMind');
    }
    return this.restoreSvc.restaurarDestructivo(id, file.buffer, user, confirmarTitulo);
  }

  // ─── Borrado COMPLETO de un encargo (2026-08-20) ─────────────────────────
  // A diferencia de todo lo anterior (que preserva el Audit), esto lo borra
  // por completo — filas y archivos. Mismo rol ADMIN que restore-destructive
  // (mayor blast-radius de este controller) y misma confirmación escrita.
  @Get(':id/delete-preview')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Previsualizar el borrado completo de un encargo — no modifica nada, solo cuenta qué se perdería' })
  async previsualizarBorrado(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.deleteSvc.previsualizarBorrado(id, user);
  }

  @Post(':id/delete')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Borrar un encargo por completo — datos, papeles y archivos. Requiere confirmación escrita del título. No se puede deshacer.' })
  async eliminarEncargoCompleto(
    @Param('id') id: string,
    @Body('confirmarTitulo') confirmarTitulo: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.deleteSvc.eliminarEncargoCompleto(id, confirmarTitulo, user);
  }
}
