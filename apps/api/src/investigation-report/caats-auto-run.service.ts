import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import { AiService } from '../ai/ai.service';
import { AuditInvestigationAccessService } from './audit-investigation-access.service';

// Espejo a mano de AUTO_RUN_ENGINES en apps/ai-service/app/routers/investigation.py
// y de AUTO_RUN_ELIGIBLE_ENGINES en apps/web/src/lib/caats-fields.ts — mismo
// criterio ya aceptado para el prompt de SHERLOCK entre TS/Python (documentado
// ahí, no sincronizado automáticamente). related_parties/dte_validation quedan
// fuera a propósito: ver el comentario en investigation.py para el porqué.
const AUTO_RUN_ENGINES = [
  'gl', 'ap', 'payroll', 'benford', 'anomaly', 'sod', 'vendor_master', 'expenses',
  'revenue_cutoff', 'bid_rigging', 'ar_aging', 'fixed_assets', 'structuring',
  'missing_trader', 'tax_haven',
] as const;

// Fase 2c — el motor CAATs se sigue ejecutando desde el frontend llamando
// POST /ai/analytics/:engine directo (igual que el panel manual, sin cambios)
// — este servicio solo (a) clasifica qué motor aplica y (b) persiste el
// resultado ya calculado. No reejecuta nada server-side (ver justificación
// en el plan de Fase 2c: evita duplicar el payload-builder de 3 ramas en dos
// lenguajes, y es coherente con el modelo de confianza ya existente —
// PaperSection.value tampoco revalida server-side el resultado calculado
// por un cliente autenticado).
@Injectable()
export class CaatsAutoRunService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly access: AuditInvestigationAccessService,
  ) {}

  async classify(
    auditId: string,
    body: { descripcion: string; columns: string[]; sampleRows: Record<string, unknown>[] },
    user: AuthUser,
  ) {
    await this.access.assertAccess(auditId, user);
    const columns = body.columns.map(name => ({
      name,
      sample_values: body.sampleRows
        .slice(0, 3)
        .map(r => String(r[name] ?? '').trim())
        .filter(Boolean),
    }));
    return this.aiService.classifySpreadsheet({
      descripcion: body.descripcion,
      columns,
      row_count: body.sampleRows.length,
    });
  }

  async persist(
    auditId: string,
    body: {
      engine: string;
      descripcion: string;
      fileName?: string;
      fieldMapping?: Record<string, unknown>;
      result: Record<string, unknown>;
      confianzaDeteccion?: number;
      justificacionDeteccion?: string;
    },
    user: AuthUser,
  ) {
    await this.access.assertAccess(auditId, user);
    if (!(AUTO_RUN_ENGINES as readonly string[]).includes(body.engine)) {
      throw new BadRequestException(`Motor "${body.engine}" no soporta auto-ejecución — use el panel CAATs manual de un papel de trabajo.`);
    }
    if (!body.result || Object.keys(body.result).length === 0) {
      throw new BadRequestException('El resultado del análisis está vacío.');
    }
    return this.prisma.caatsAutoRun.create({
      data: {
        auditId,
        requestedById: user.id,
        engine: body.engine,
        descripcion: body.descripcion,
        fileName: body.fileName,
        fieldMapping: body.fieldMapping as Prisma.InputJsonValue,
        result: body.result as Prisma.InputJsonValue,
        confianzaDeteccion: body.confianzaDeteccion,
        justificacionDeteccion: body.justificacionDeteccion,
      },
    });
  }
}
