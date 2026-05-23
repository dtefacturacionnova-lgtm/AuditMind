import { Injectable, Logger } from '@nestjs/common';
import { AuditType, WpKind, WorkingPaperType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PAPER_TEMPLATES } from '../working-papers/paper-templates';

// ─── Paper definition within an index ────────────────────────────────────────

interface PaperDef {
  code:         string;           // A-01, B-00, etc.
  indexSection: string;           // A | B | C | D | E
  title:        string;
  type:         WorkingPaperType;
  wpKind:       WpKind;
  paperCode?:   string;           // template key → auto-init sections
}

// ─── Index definitions ────────────────────────────────────────────────────────

/**
 * INDICE-01 — Auditoría Interna Privada (NOGAI / IIA 2025)
 * Applies to: INTERNAL | OPERATIONAL | IT | COMPLIANCE | ESG | BCP_DRP
 */
const INDEX_INTERNAL: PaperDef[] = [
  {
    code: 'A-01', indexSection: 'A',
    title:    'Orden de Trabajo / Notificación de Inicio',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.STANDARD,
  },
  {
    code: 'A-02', indexSection: 'A',
    title:    'Entendimiento del Negocio y Entorno',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.SMART,
    paperCode: 'PT-A1',
  },
  {
    code: 'A-03', indexSection: 'A',
    title:    'Evaluación de Riesgo Inherente (RI) por Área',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.SMART,
    paperCode: 'PT-A2',
  },
  {
    code: 'A-04', indexSection: 'A',
    title:    'Evaluación de Controles y Riesgo de Control (RC)',
    type:     WorkingPaperType.CONTROL_EVALUATION,
    wpKind:   WpKind.SMART,
    paperCode: 'PT-A3',
  },
  {
    code: 'A-05', indexSection: 'A',
    title:    'Cálculo de Materialidad',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.SMART,
    paperCode: 'PT-A4',
  },
  {
    code: 'A-06', indexSection: 'A',
    title:    'Evaluación de Riesgos COSO 2013 — Sistema de Control Interno',
    type:     WorkingPaperType.CONTROL_EVALUATION,
    wpKind:   WpKind.SMART,
    paperCode: 'PT-COSO',
  },
  {
    code: 'A-07', indexSection: 'A',
    title:    'Memorando de Planificación',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.MASTER,
    paperCode: 'PT-MEMO',
  },
  {
    code: 'A-08', indexSection: 'A',
    title:    'Programa de Auditoría',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.MASTER,
    paperCode: 'PT-PROG',
  },
];

/**
 * INDICE-03 — Auditoría Externa de Estados Financieros (NIA / ISA)
 * Applies to: EXTERNAL | FINANCIAL
 */
const INDEX_EXTERNAL: PaperDef[] = [
  {
    code: 'A-01', indexSection: 'A',
    title:    'Carta de Encargo / Términos del Trabajo (NIA 210)',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.STANDARD,
  },
  {
    code: 'A-02', indexSection: 'A',
    title:    'Entendimiento del Negocio y Entorno (NIA 315)',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.SMART,
    paperCode: 'PT-A1',
  },
  {
    code: 'A-03', indexSection: 'A',
    title:    'Identificación y Evaluación de Riesgos de Error Material (NIA 315)',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.SMART,
    paperCode: 'PT-A2',
  },
  {
    code: 'A-04', indexSection: 'A',
    title:    'Evaluación del Control Interno sobre RF (NIA 315.25)',
    type:     WorkingPaperType.CONTROL_EVALUATION,
    wpKind:   WpKind.SMART,
    paperCode: 'PT-A3',
  },
  {
    code: 'A-05', indexSection: 'A',
    title:    'Cálculo de Materialidad (NIA 320)',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.SMART,
    paperCode: 'PT-A4',
  },
  {
    code: 'A-06', indexSection: 'A',
    title:    'Evaluación COSO 2013 — Control Interno sobre Información Financiera',
    type:     WorkingPaperType.CONTROL_EVALUATION,
    wpKind:   WpKind.SMART,
    paperCode: 'PT-COSO',
  },
  {
    code: 'A-07', indexSection: 'A',
    title:    'Memorando de Planificación',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.MASTER,
    paperCode: 'PT-MEMO',
  },
  {
    code: 'A-08', indexSection: 'A',
    title:    'Programa de Auditoría por Sección',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.MASTER,
    paperCode: 'PT-PROG',
  },
  // ─── Sección B — EEFF y Sumarias ─────────────────────────────────────────
  {
    code: 'B-00', indexSection: 'B',
    title:    'Estados Financieros del Cliente — Cédula Madre (EEFF)',
    type:     WorkingPaperType.SUBSTANTIVE_TEST,
    wpKind:   WpKind.SMART,
    paperCode: 'PT-EEFF',
  },
  {
    code: 'B-06', indexSection: 'B',
    title:    'Cédula de Diferencias y Ajustes vs. Materialidad',
    type:     WorkingPaperType.SUBSTANTIVE_TEST,
    wpKind:   WpKind.MASTER,
    paperCode: 'PT-DIFS',
  },
];

/**
 * INDICE-04 — Examen Especial / Auditoría Forense (ACFE + NIA 240)
 * Applies to: FORENSIC
 */
const INDEX_FORENSIC: PaperDef[] = [
  {
    code: 'A-01', indexSection: 'A',
    title:    'Instrucción / Orden de Investigación Especial',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.STANDARD,
  },
  {
    code: 'A-02', indexSection: 'A',
    title:    'Entendimiento del Negocio y Contexto Forense',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.SMART,
    paperCode: 'PT-A1',
  },
  {
    code: 'A-03', indexSection: 'A',
    title:    'Evaluación de Riesgo de Fraude — Triángulo ACFE (NIA 240)',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.SMART,
    paperCode: 'PT-A2',
  },
  {
    code: 'A-04', indexSection: 'A',
    title:    'Cadena de Custodia y Registro de Evidencia Digital',
    type:     WorkingPaperType.CONTROL_EVALUATION,
    wpKind:   WpKind.STANDARD,
  },
  {
    code: 'A-05', indexSection: 'A',
    title:    'Programa de Investigación Especial',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.MASTER,
    paperCode: 'PT-PROG',
  },
];

// ─── Mapping AuditType → Index ────────────────────────────────────────────────

const AUDIT_TYPE_INDEX: Partial<Record<AuditType, PaperDef[]>> = {
  [AuditType.INTERNAL]:   INDEX_INTERNAL,
  [AuditType.OPERATIONAL]:INDEX_INTERNAL,
  [AuditType.IT]:         INDEX_INTERNAL,
  [AuditType.COMPLIANCE]: INDEX_INTERNAL,
  [AuditType.ESG]:        INDEX_INTERNAL,
  [AuditType.BCP_DRP]:    INDEX_INTERNAL,
  [AuditType.EXTERNAL]:   INDEX_EXTERNAL,
  [AuditType.FINANCIAL]:  INDEX_EXTERNAL,
  [AuditType.FORENSIC]:   INDEX_FORENSIC,
};

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class AuditIndexService {
  private readonly logger = new Logger(AuditIndexService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Auto-scaffold working papers for a newly created audit.
   * Creates PT records + initializes PaperSections from templates.
   * Fire-and-forget safe — errors are logged but don't abort the audit creation.
   */
  async scaffold(
    auditId:      string,
    auditType:    AuditType,
    preparedById: string,
  ): Promise<void> {
    const index = AUDIT_TYPE_INDEX[auditType] ?? INDEX_INTERNAL;

    this.logger.log(
      `[AuditIndex] Scaffolding ${index.length} papers for audit ${auditId} (${auditType})`,
    );

    for (const def of index) {
      try {
        const wp = await this.prisma.workingPaper.create({
          data: {
            auditId,
            code:         def.code,
            indexSection: def.indexSection,
            title:        def.title,
            type:         def.type,
            wpKind:       def.wpKind,
            paperCode:    def.paperCode ?? null,
            preparedById,
          },
        });

        // Auto-initialize sections for SMART and MASTER papers
        if (def.paperCode && (def.wpKind === WpKind.SMART || def.wpKind === WpKind.MASTER)) {
          const template = PAPER_TEMPLATES[def.paperCode];
          if (template?.length) {
            await this.prisma.paperSection.createMany({
              data: template.map((t) => ({
                paperId:      wp.id,
                sectionKey:   t.sectionKey,
                label:        t.label,
                description:  t.description   ?? null,
                fieldType:    t.fieldType,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                value:        (t.defaultValue ?? null) as any,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                options:      (t.options       ?? [])  as any,
                isRequired:   t.isRequired,
                isAutoFilled: t.isAutoFilled,
                sourceRef:    t.sourceRef      ?? null,
                sortOrder:    t.sortOrder,
                aiHint:       t.aiHint         ?? null,
              })),
              skipDuplicates: true,
            });
            this.logger.debug(
              `[AuditIndex]   ✓ ${def.code} (${def.paperCode}) — ${template.length} sections`,
            );
          }
        } else {
          this.logger.debug(`[AuditIndex]   ✓ ${def.code} — STANDARD`);
        }
      } catch (err) {
        // Don't abort scaffold if one paper fails
        this.logger.error(
          `[AuditIndex]   ✗ ${def.code} failed: ${String(err)}`,
        );
      }
    }

    this.logger.log(`[AuditIndex] Scaffold complete for audit ${auditId}`);
  }
}
