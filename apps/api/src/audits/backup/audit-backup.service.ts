import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthUser } from '../../auth/jwt.strategy';
import { AuditBackupExportService } from './audit-backup-export.service';
import { AuditBackupFilesService } from './audit-backup-files.service';
import { AuditBackupPackageService } from './audit-backup-package.service';
import { construirBackupManifest } from './audit-backup-manifest';
import { AuditBackupAdvertencia } from './audit-backup.types';

/**
 * Orquestador del backup completo de un encargo (BKP-06 lo expone vía
 * endpoint) — junta el recorrido de tablas (BKP-03), la descarga de archivos
 * (BKP-04) y el empaquetado firmado (BKP-05) en una sola operación.
 */
@Injectable()
export class AuditBackupService {
  private readonly logger = new Logger(AuditBackupService.name);
  private readonly manifestSecret: string;

  constructor(
    private readonly exportSvc: AuditBackupExportService,
    private readonly filesSvc: AuditBackupFilesService,
    private readonly packageSvc: AuditBackupPackageService,
    private readonly config: ConfigService,
  ) {
    const dedicado = this.config.get<string>('AUDIT_BACKUP_SECRET');
    if (!dedicado) {
      this.logger.warn(
        'AUDIT_BACKUP_SECRET no está definido — se usa JWT_SECRET como respaldo para firmar '
        + 'los backups de encargos. Defina un secreto dedicado en producción (mismo criterio '
        + 'pendiente que EXCEL_MANIFEST_SECRET — ver fixes_and_lessons.md #17).',
      );
    }
    this.manifestSecret = dedicado || this.config.get<string>('JWT_SECRET', '');
    if (!this.manifestSecret) {
      throw new Error('No hay secreto disponible para firmar el backup del encargo (defina AUDIT_BACKUP_SECRET o JWT_SECRET)');
    }
  }

  async exportar(auditId: string, user: AuthUser): Promise<{ buffer: Buffer; nombreArchivo: string; advertencias: AuditBackupAdvertencia[]; totalFilas: number; totalArchivos: number }> {
    const t0 = Date.now();
    const exportado = await this.exportSvc.exportarEncargo(auditId, user);

    const rutas = this.filesSvc.extraerRutasDeArchivo(exportado.data);
    const { archivos, advertencias: advertenciasArchivos } = await this.filesSvc.descargarArchivos(rutas);

    const manifest = construirBackupManifest(this.manifestSecret, {
      auditId, organizationId: exportado.audit.organizationId,
      auditTitulo: exportado.audit.title,
      generadoEn: new Date().toISOString(), generadoPor: user.id,
      conteoPorModelo: exportado.conteoPorModelo,
      hashDatos: exportado.hashDatos,
    });

    const buffer = await this.packageSvc.empaquetar(manifest, exportado.dataJson, archivos);

    const advertencias = [...exportado.advertencias, ...advertenciasArchivos];
    const ms = Date.now() - t0;
    this.logger.log(`Backup de encargo '${auditId}': ${exportado.totalFilas} filas, ${archivos.size} archivos, ${advertencias.length} advertencia(s), ${ms}ms`);

    const fecha = new Date().toISOString().slice(0, 10);
    const slugTitulo = exportado.audit.title
      .replace(/[áàäâã]/gi, 'a').replace(/[éèëê]/gi, 'e').replace(/[íìïî]/gi, 'i')
      .replace(/[óòöôõ]/gi, 'o').replace(/[úùüû]/gi, 'u').replace(/ñ/gi, 'n')
      .replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
    const nombreArchivo = `AuditMind_Backup_${slugTitulo}_${fecha}.zip`;

    return {
      buffer, nombreArchivo, advertencias,
      totalFilas: exportado.totalFilas, totalArchivos: archivos.size,
    };
  }
}
