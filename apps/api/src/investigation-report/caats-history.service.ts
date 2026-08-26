import { Injectable } from '@nestjs/common';
import { FieldType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import { AuditInvestigationAccessService } from './audit-investigation-access.service';

// Shape ya establecido por el panel CAATs manual — apps/web/src/components/
// working-papers/CaatsAnalysisPanel.tsx (CaatsAnalysisValue), persistido en
// PaperSection.value cuando fieldType='CAATS_ANALYSIS'.
interface CaatsAnalysisValue {
  engine?: string | null;
  fileName?: string;
  fieldMapping?: Record<string, unknown>;
  result?: Record<string, unknown> | null;
  ranAt?: string;
}

export interface CaatsHistoryEntry {
  source: 'manual' | 'auto';
  engine: string | null;
  label: string;
  fileName: string | null;
  ranAt: string | null;
  result: Record<string, unknown> | null;
  confianzaDeteccion: number | null;
  justificacionDeteccion: string | null;
}

// Fase 2c — historial CAATs unificado del encargo, fusionando las dos fuentes
// donde puede vivir un resultado CAATs: PaperSection (motor corrido a mano
// desde un papel de trabajo, PT-B4 y similares) y CaatsAutoRun (auto-detectado
// desde el tab Investigador). Servicio propio (no dentro de
// InvestigationReportService) porque lo consumen 3 llamadores distintos: el
// endpoint informativo del frontend, el contexto del informe SHERLOCK, y
// potencialmente más adelante.
@Injectable()
export class CaatsHistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AuditInvestigationAccessService,
  ) {}

  async getHistory(auditId: string, user: AuthUser): Promise<CaatsHistoryEntry[]> {
    await this.access.assertAccess(auditId, user);
    return this.getHistoryUnchecked(auditId);
  }

  // Variante sin chequeo de acceso propio — para llamadores internos
  // (InvestigationReportService.ejecutar()) que ya validaron acceso al inicio
  // de su propio flujo y no necesitan repetir la consulta.
  async getHistoryUnchecked(auditId: string): Promise<CaatsHistoryEntry[]> {
    const [manual, auto] = await Promise.all([
      this.prisma.paperSection.findMany({
        where:  { paper: { auditId }, fieldType: FieldType.CAATS_ANALYSIS },
        select: { value: true, updatedAt: true, paper: { select: { paperCode: true, title: true } } },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.caatsAutoRun.findMany({
        where:   { auditId },
        orderBy: { ranAt: 'desc' },
      }),
    ]);

    const manualEntries: CaatsHistoryEntry[] = manual
      .map(m => ({ v: m.value as CaatsAnalysisValue | null, paper: m.paper }))
      .filter((x): x is { v: CaatsAnalysisValue; paper: typeof x.paper } => !!x.v?.engine && !!x.v.result)
      .map(({ v, paper }) => ({
        source: 'manual',
        engine: v.engine ?? null,
        label: `${paper.paperCode ?? ''} ${paper.title}`.trim(),
        fileName: v.fileName ?? null,
        ranAt: v.ranAt ?? null,
        result: v.result ?? null,
        confianzaDeteccion: null,
        justificacionDeteccion: null,
      }));

    const autoEntries: CaatsHistoryEntry[] = auto.map(a => ({
      source: 'auto',
      engine: a.engine,
      label: 'Auto-detectado (Investigador)',
      fileName: a.fileName,
      ranAt: a.ranAt.toISOString(),
      result: a.result as Record<string, unknown>,
      confianzaDeteccion: a.confianzaDeteccion,
      justificacionDeteccion: a.justificacionDeteccion,
    }));

    return [...manualEntries, ...autoEntries].sort((a, b) => (b.ranAt ?? '').localeCompare(a.ranAt ?? ''));
  }

  // Resumen size-safe para el prompt de SHERLOCK — nunca el `result` crudo
  // completo (puede ser grande), solo lo suficiente para que el LLM lo use
  // como fuente suplementaria (ver REGLA DE FUENTES SUPLEMENTARIAS en
  // apps/ai-service/app/routers/investigation.py).
  summarizeForSherlock(entries: CaatsHistoryEntry[]): {
    engine: string; source: 'manual' | 'auto'; ran_at: string | null; risk_score: number | null; top_findings: string[];
  }[] {
    return entries
      .filter((e): e is CaatsHistoryEntry & { engine: string; result: Record<string, unknown> } => !!e.engine && !!e.result)
      .map(e => {
        const r = e.result;
        const riskScore = typeof r.risk_score === 'number' ? r.risk_score : null;
        const findings = Array.isArray(r.findings) ? (r.findings as Record<string, unknown>[]) : [];
        const topFindings = findings.slice(0, 3).map(f => {
          const testName = typeof f.test_name === 'string' ? f.test_name : null;
          const description = typeof f.description === 'string' ? f.description : null;
          return [testName, description].filter(Boolean).join(': ') || JSON.stringify(f).slice(0, 120);
        });
        if (topFindings.length === 0 && typeof r.summary === 'string') topFindings.push(r.summary.slice(0, 200));
        return { engine: e.engine, source: e.source, ran_at: e.ranAt, risk_score: riskScore, top_findings: topFindings };
      });
  }
}
