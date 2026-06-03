/**
 * Anexo 12 SDF — Generador automático del detalle de incumplimientos
 *
 * El Anexo 12 es parte obligatoria del Dictamen e Informe Fiscal (CT SV Art. 134-135)
 * cuando se identifican incumplimientos. El Ministerio de Hacienda publica un formato
 * específico que debe presentarse en el Sistema del Dictamen Fiscal (SDF).
 *
 * Estructura del Anexo 12 (formato SDF DGII):
 *   - Sección A: Incumplimientos Formales (sin impacto monetario directo)
 *   - Sección B: Incumplimientos Sustantivos (con impacto fiscal)
 *
 * Para cada uno:
 *   - Nº | Concepto | Norma infringida | Período | Descripción | Monto | Impacto Fiscal
 */
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';

export interface Anexo12Row {
  numero:      number;
  tipo:        'FORMAL' | 'SUSTANTIVO';
  concepto:    string;
  norma:       string;
  articulo:    string;
  descripcion: string;
  monto:       number;       // monto base del incumplimiento
  impactoFiscal: number;     // impuesto adicional estimado
  severidad:   string;
}

export interface Anexo12Result {
  auditId:        string;
  auditTitle:     string;
  contribuyente:  string;
  periodo:        string;
  generatedAt:    string;
  formales:       Anexo12Row[];
  sustantivos:    Anexo12Row[];
  totales: {
    countFormales:    number;
    countSustantivos: number;
    montoTotal:       number;
    impactoTotal:     number;
  };
}

@Injectable()
export class Anexo12Service {
  constructor(private prisma: PrismaService) {}

  async generate(auditId: string, user: AuthUser): Promise<Anexo12Result> {
    const audit = await this.prisma.audit.findUnique({
      where:   { id: auditId },
      include: {
        auditEntity: { select: { name: true } },
        organization: { select: { name: true } },
        findings: {
          where:   { status: { in: ['APPROVED', 'IN_REVIEW', 'CLOSED', 'REOPENED', 'DRAFT'] } },
          orderBy: [{ severity: 'asc' }, { createdAt: 'asc' }],
          select:  {
            id: true, title: true, severity: true,
            condition: true, criteria: true, recommendation: true,
            normativeReference: true, normativeArticle: true,
            effectAmount: true, isMaterial: true,
          },
        },
      },
    });

    if (!audit) throw new NotFoundException('Auditoría no encontrada');
    if (audit.organizationId !== user.organizationId) throw new ForbiddenException();

    const formales:    Anexo12Row[] = [];
    const sustantivos: Anexo12Row[] = [];

    let nFormal     = 0;
    let nSustantivo = 0;
    let montoTotal    = 0;
    let impactoTotal  = 0;

    for (const f of audit.findings) {
      const effectAmount = f.effectAmount ? Number(f.effectAmount) : 0;
      const isSustantivo = effectAmount > 0 || f.isMaterial === true;

      // Estimar impacto fiscal: 30% del monto (tasa ISR) si no se proporciona explícito
      // En la práctica el auditor ajustará desde la UI antes de exportar.
      const impactoFiscal = isSustantivo ? Math.round(effectAmount * 0.30 * 100) / 100 : 0;

      const row: Anexo12Row = {
        numero:        isSustantivo ? ++nSustantivo : ++nFormal,
        tipo:          isSustantivo ? 'SUSTANTIVO' : 'FORMAL',
        concepto:      f.title,
        norma:         f.normativeReference ?? 'Código Tributario SV',
        articulo:      f.normativeArticle ?? '—',
        descripcion:   this.summarizeCondition(f.condition),
        monto:         effectAmount,
        impactoFiscal,
        severidad:     f.severity,
      };

      if (isSustantivo) {
        sustantivos.push(row);
        montoTotal   += effectAmount;
        impactoTotal += impactoFiscal;
      } else {
        formales.push(row);
      }
    }

    const periodo = audit.startDate && audit.endDate
      ? `${audit.startDate.toISOString().slice(0, 10)} al ${audit.endDate.toISOString().slice(0, 10)}`
      : (audit.startDate?.toISOString().slice(0, 10) ?? 'No especificado');

    return {
      auditId,
      auditTitle:    audit.title,
      contribuyente: audit.auditEntity?.name ?? audit.organization?.name ?? '—',
      periodo,
      generatedAt:   new Date().toISOString(),
      formales,
      sustantivos,
      totales: {
        countFormales:    formales.length,
        countSustantivos: sustantivos.length,
        montoTotal:       Math.round(montoTotal * 100) / 100,
        impactoTotal:     Math.round(impactoTotal * 100) / 100,
      },
    };
  }

  /** Generates CSV in the format expected by SDF DGII. */
  generateCsv(data: Anexo12Result): string {
    const escape = (s: string) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const header = ['Nº', 'Tipo', 'Concepto', 'Norma', 'Artículo', 'Descripción', 'Monto', 'Impacto Fiscal', 'Severidad'];

    const lines: string[] = [];
    lines.push(`ANEXO 12 — DETALLE DE INCUMPLIMIENTOS`);
    lines.push(`Contribuyente,${escape(data.contribuyente)}`);
    lines.push(`Período,${escape(data.periodo)}`);
    lines.push(`Generado,${escape(new Date(data.generatedAt).toLocaleString('es-CL'))}`);
    lines.push('');
    lines.push(header.join(','));

    if (data.formales.length > 0) {
      lines.push(`,SECCIÓN A — INCUMPLIMIENTOS FORMALES,,,,,,,`);
      for (const r of data.formales) {
        lines.push([
          r.numero, escape(r.tipo), escape(r.concepto), escape(r.norma),
          escape(r.articulo), escape(r.descripcion),
          r.monto.toFixed(2), r.impactoFiscal.toFixed(2),
          escape(r.severidad),
        ].join(','));
      }
    }

    if (data.sustantivos.length > 0) {
      lines.push(`,SECCIÓN B — INCUMPLIMIENTOS SUSTANTIVOS,,,,,,,`);
      for (const r of data.sustantivos) {
        lines.push([
          r.numero, escape(r.tipo), escape(r.concepto), escape(r.norma),
          escape(r.articulo), escape(r.descripcion),
          r.monto.toFixed(2), r.impactoFiscal.toFixed(2),
          escape(r.severidad),
        ].join(','));
      }

      lines.push('');
      lines.push(`,,,,,TOTAL,${data.totales.montoTotal.toFixed(2)},${data.totales.impactoTotal.toFixed(2)},`);
    }

    return lines.join('\n');
  }

  private summarizeCondition(condition: string): string {
    // Toma las primeras 300 chars del condition. El SDF tiene límite por celda.
    if (condition.length <= 300) return condition;
    return condition.slice(0, 297).replace(/\n+/g, ' ') + '…';
  }
}
