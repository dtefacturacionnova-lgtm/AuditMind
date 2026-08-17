import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import * as crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/jwt.strategy';
import {
  AUDIT_SCOPED_MODELS, AuditScopedModel, AuditBackupAdvertencia,
  construirWhereParaModelo, nuevasFamiliasDeIds,
} from './audit-backup.types';

/**
 * Recorrido del árbol de tablas de un encargo (BKP-03) — exportación pura de
 * datos, sin archivos (eso es BKP-04) ni empaquetado/firma (BKP-05).
 *
 * Usa `prisma[model.model]` dinámicamente en vez de 32 métodos de servicio
 * escritos a mano — el cast a `any` es deliberado y acotado a este archivo:
 * `AUDIT_SCOPED_MODELS` (audit-backup.types.ts) es la única fuente de verdad
 * de qué modelos/campos existen, y `verificarCompletitudModelos()` la
 * compara contra el DMMF real de Prisma para detectar si el schema
 * evolucionó y esta lista quedó desactualizada.
 */
@Injectable()
export class AuditBackupExportService {
  constructor(private readonly prisma: PrismaService) {}

  async exportarEncargo(auditId: string, user: AuthUser) {
    const audit = await this.prisma.audit.findUnique({
      where: { id: auditId },
      select: { id: true, title: true, organizationId: true },
    });
    if (!audit) throw new NotFoundException('Auditoría no encontrada');
    if (audit.organizationId !== user.organizationId) throw new ForbiddenException();

    // El registro `Audit` completo viaja aparte de AUDIT_SCOPED_MODELS — es la
    // raíz del árbol, no algo que "depende de" un Audit. Se excluyen sus
    // relaciones (team, workingPapers, etc. — ya cubiertas por su propio
    // modelo) quedándose solo con los campos escalares reales.
    const auditCompleto = await this.prisma.audit.findUniqueOrThrow({ where: { id: auditId } });

    const advertencias: AuditBackupAdvertencia[] = [];
    const data: Record<string, Record<string, unknown>[]> = { audit: [auditCompleto as unknown as Record<string, unknown>] };

    // IDs acumulados por "familia" a medida que se recorre el árbol — cada
    // nivel usa los IDs que dejaron los niveles anteriores (mismo orden de
    // AUDIT_SCOPED_MODELS, que es justamente el orden de dependencia).
    const idsPorFamilia = nuevasFamiliasDeIds();

    for (const modelo of AUDIT_SCOPED_MODELS) {
      const filas = await this.consultarModelo(modelo, auditId, idsPorFamilia, advertencias);
      data[modelo.model] = filas;

      // Alimentar las familias de IDs que los niveles siguientes necesitan.
      if (modelo.model === 'workingPaper') idsPorFamilia.workingPaper = filas.map(f => f.id as string);
      if (modelo.model === 'finding') idsPorFamilia.finding = filas.map(f => f.id as string);
      if (modelo.model === 'pbcRequest') idsPorFamilia.pbcRequest = filas.map(f => f.id as string);
      if (modelo.model === 'trialBalance') idsPorFamilia.trialBalance = filas.map(f => f.id as string);
      if (modelo.model === 'dataAnalysisJob') idsPorFamilia.dataAnalysisJob = filas.map(f => f.id as string);
      if (modelo.model === 'paperSection') idsPorFamilia.paperSection = filas.map(f => f.id as string);
      if (modelo.model === 'auditProcedure') idsPorFamilia.auditProcedure = filas.map(f => f.id as string);
      if (modelo.model === 'auditStep') idsPorFamilia.auditStep = filas.map(f => f.id as string);
    }

    // Referencias colgantes: PaperLink/PaperReference cuyo destino es un
    // papel de OTRO encargo (fuera de este backup) — se conservan en el
    // export (no se pierde el dato), pero se advierte, porque al restaurar
    // como nuevo esa fila no podrá remapearse (ver audit-backup.types.ts, punto 5).
    const paperIdsSet = new Set(idsPorFamilia.workingPaper);
    for (const fila of data['paperLink'] ?? []) {
      if (!paperIdsSet.has(fila.targetId as string)) {
        advertencias.push({ modelo: 'paperLink', filaId: fila.id as string, mensaje: `Apunta a un papel (${fila.targetId}) fuera de este encargo — no se podrá remapear al restaurar como nuevo` });
      }
    }
    for (const fila of data['paperReference'] ?? []) {
      if (!paperIdsSet.has(fila.targetPaperId as string)) {
        advertencias.push({ modelo: 'paperReference', filaId: fila.id as string, mensaje: `Apunta a un papel (${fila.targetPaperId}) fuera de este encargo — no se podrá remapear al restaurar como nuevo` });
      }
    }

    const conteoPorModelo: Record<string, number> = {};
    let totalFilas = 0;
    for (const [modelo, filas] of Object.entries(data)) {
      conteoPorModelo[modelo] = filas.length;
      totalFilas += filas.length;
    }

    const dataJson = JSON.stringify(data);
    const hashDatos = crypto.createHash('sha256').update(dataJson).digest('hex');

    return {
      audit, data, dataJson, hashDatos, conteoPorModelo, totalFilas, advertencias,
    };
  }

  private async consultarModelo(
    modelo: AuditScopedModel,
    auditId: string,
    ids: Record<string, string[]>,
    advertencias: AuditBackupAdvertencia[],
  ): Promise<Record<string, unknown>[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const delegate = (this.prisma as any)[modelo.model];
    if (!delegate?.findMany) {
      advertencias.push({ modelo: modelo.model, mensaje: 'Modelo declarado en AUDIT_SCOPED_MODELS no existe en el Prisma Client actual — omitido' });
      return [];
    }

    const where = construirWhereParaModelo(modelo, auditId, ids);
    if (where === null) return []; // familia de IDs vacía — nada que consultar, no es un error

    return delegate.findMany({ where });
  }

  /**
   * Red de seguridad de la decisión de diseño de BKP-01: compara
   * `AUDIT_SCOPED_MODELS` contra el DMMF real de Prisma y reporta cualquier
   * modelo con `auditId` que NO esté en la lista — para detectar deriva si
   * el schema evoluciona y esta lista no se actualiza junto con él. No se
   * ejecuta en cada backup (sería lento); pensado para un test dedicado.
   */
  verificarCompletitudModelos(): string[] {
    const declarados = new Set(AUDIT_SCOPED_MODELS.map(m => m.model));
    const faltantes: string[] = [];
    for (const modelo of Prisma.dmmf.datamodel.models) {
      const nombreCamel = modelo.name.charAt(0).toLowerCase() + modelo.name.slice(1);
      const tieneAuditId = modelo.fields.some(f => f.name === 'auditId');
      if (tieneAuditId && nombreCamel !== 'audit' && !declarados.has(nombreCamel)) {
        faltantes.push(nombreCamel);
      }
    }
    return faltantes;
  }
}
