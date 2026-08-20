import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/jwt.strategy';
import { AuditBackupExportService } from './audit-backup-export.service';
import { AuditBackupFilesService } from './audit-backup-files.service';
import { AuditBackupRestoreService } from './audit-backup-restore.service';
import { AuditBackupAdvertencia } from './audit-backup.types';

/**
 * Borrado COMPLETO de un encargo (2026-08-20) — a diferencia de BKP-12
 * (restauración destructiva, que sobrescribe un encargo pero lo conserva),
 * aquí el `Audit` desaparece por completo: todas sus filas y sus archivos.
 *
 * No existía ningún endpoint para esto — un `prisma.audit.delete()` directo
 * habría fallado con violación de FK en `AuditPlanItem`/`TimeEntry`/
 * `Engagement`/`ConnectorImport` (las 4 relaciones hacia `Audit` que NO
 * tienen `onDelete: Cascade`, ver análisis previo), y aunque no hubiera
 * fallado, un cascade de base de datos solo borra FILAS — nunca los archivos
 * en Supabase Storage, que habrían quedado huérfanos.
 *
 * En vez de escribir esta lógica desde cero, se reutiliza el mecanismo ya
 * construido y probado en producción para BKP-12: `AUDIT_SCOPED_MODELS`
 * (la lista explícita y verificada de todo lo que cuelga de un encargo) +
 * `AuditBackupRestoreService.eliminarDatosExistentes()` (borrado explícito
 * en orden inverso de dependencia, sin asumir cascade) +
 * `AuditBackupFilesService.extraerRutasDeArchivo()` (detección de archivos
 * embebidos en el JSON, el mismo motor usado para armar un backup). Es
 * literalmente el mismo primer paso de una restauración destructiva — aquí
 * simplemente nunca se llega al segundo paso de recrear filas nuevas.
 */
@Injectable()
export class AuditDeleteService {
  private readonly logger = new Logger(AuditDeleteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly exportSvc: AuditBackupExportService,
    private readonly filesSvc: AuditBackupFilesService,
    private readonly restoreSvc: AuditBackupRestoreService,
  ) {}

  /** Sin efectos secundarios — mismo patrón que `restore-preview` (BKP-12): permite mostrar "qué se va a perder" antes de pedir la confirmación escrita. */
  async previsualizarBorrado(auditId: string, user: AuthUser) {
    const audit = await this.prisma.audit.findFirst({
      where: { id: auditId, organizationId: user.organizationId },
      select: { id: true, title: true },
    });
    if (!audit) throw new NotFoundException('Auditoría no encontrada');

    const { data, conteoPorModelo, totalFilas } = await this.exportSvc.exportarEncargo(auditId, user);
    const engagementVinculado = await this.prisma.engagement.count({ where: { auditId } });

    // Nombres reales de los papeles del encargo — el frontend los usa para
    // mostrar "Borrando: {título}" rotando durante la animación de borrado
    // (puramente cosmético, no hay progreso real por papel que reportar
    // desde el backend — el borrado ocurre por modelo completo, no fila a
    // fila — pero el nombre real da más realismo que un mensaje genérico).
    const paperTitles = ((data.workingPaper ?? []) as Array<{ code?: string; title?: string }>)
      .map(wp => [wp.code, wp.title].filter(Boolean).join(' — '))
      .filter(Boolean);

    return {
      auditId, auditTitulo: audit.title, totalFilas, conteoPorModelo, engagementVinculado, paperTitles,
    };
  }

  async eliminarEncargoCompleto(auditId: string, confirmarTitulo: string, user: AuthUser) {
    const audit = await this.prisma.audit.findFirst({
      where: { id: auditId, organizationId: user.organizationId },
      select: { id: true, title: true },
    });
    if (!audit) throw new NotFoundException('Auditoría no encontrada');
    if (!confirmarTitulo || confirmarTitulo.trim() !== audit.title) {
      throw new BadRequestException('El título no coincide — escribe el título exacto del encargo para confirmar.');
    }

    // 1. Recolectar TODO el árbol de datos (mismo recorrido que un backup,
    //    BKP-03) ANTES de borrar nada — es la única forma de enumerar los
    //    archivos de Storage referenciados mientras las filas que los
    //    contienen todavía existen.
    const { data, conteoPorModelo, totalFilas, advertencias: advertenciasExport } =
      await this.exportSvc.exportarEncargo(auditId, user);
    const rutas = this.filesSvc.extraerRutasDeArchivo(data);

    // 2. Desvincular (NUNCA borrar) cualquier Engagement de Cartera que
    //    apunte a este encargo — el registro comercial (Cliente → Radar de
    //    Aceptación → Propuesta → Carta de Compromiso) es historia real del
    //    cliente y sobrevive al encargo técnico que originó; solo pierde el
    //    vínculo. `Engagement.auditId` es opcional, así que nulificar es
    //    seguro y no dispara ninguna otra cascada.
    const engagementDesvinculado = await this.prisma.engagement.updateMany({
      where: { auditId }, data: { auditId: null },
    });

    // 3. Borrar TODAS las filas de AUDIT_SCOPED_MODELS — mismo método ya
    //    probado en producción para BKP-12 (orden inverso de dependencia,
    //    aborta ruidosamente si algo falla en vez de dejar datos a medias).
    const advertenciasBorrado: AuditBackupAdvertencia[] = [];
    await this.restoreSvc.eliminarDatosExistentes(auditId, advertenciasBorrado);

    // 4. Borrar el Audit mismo — ya sin hijos (RESTRICT) ni vínculo de Engagement.
    await this.prisma.audit.delete({ where: { id: auditId } });

    // 5. Borrar los archivos de Storage — best-effort, después de que la BD
    //    ya está limpia (mismo criterio que `removeRequestDocument`: la
    //    limpieza de Storage nunca bloquea la operación principal).
    const resultadoArchivos = await this.filesSvc.borrarArchivos(rutas);

    this.logger.log(
      `Encargo '${auditId}' ("${audit.title}") borrado COMPLETO por ${user.id}: ` +
      `${totalFilas} filas, ${resultadoArchivos.ok}/${rutas.length} archivos, ` +
      `${engagementDesvinculado.count} Engagement(s) desvinculado(s).`,
    );

    return {
      auditId,
      auditTitulo: audit.title,
      totalFilasBorradas: totalFilas,
      conteoPorModelo,
      archivosBorrados: resultadoArchivos.ok,
      archivosConError: resultadoArchivos.error,
      engagementesDesvinculados: engagementDesvinculado.count,
      advertencias: [...advertenciasExport, ...advertenciasBorrado],
    };
  }
}
