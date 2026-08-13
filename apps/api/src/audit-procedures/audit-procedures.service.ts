import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  ProcStatus, StepStatus, StepConclusion, TestType, AuditNature, AuditTiming,
} from '@prisma/client';

export interface CreateProcedureDto {
  refNumber:      string;
  description:    string;
  assertions?:    string[];
  significantRisk?: boolean;
  rmmLevel?:      string;
  rmmRiskRef?:    string[];
  wpRef?:         string;
  sortOrder?:     number;
}

export interface UpdateProcedureDto {
  refNumber?:     string;
  description?:   string;
  assertions?:    string[];
  significantRisk?: boolean;
  rmmLevel?:      string;
  rmmRiskRef?:    string[];
  wpRef?:         string;
  conclusionText?: string;
  status?:        ProcStatus;
  sortOrder?:     number;
}

export interface CreateStepDto {
  refNumber:        string;
  description:      string;
  assertions?:      string[];
  testType?:        TestType;
  nature?:          AuditNature;
  timing?:          AuditTiming;
  extent?:          string;
  population?:      string;
  performedByName?: string;
  performedById?:   string;
  datePerformed?:   string;
  reviewedByName?:  string;
  reviewedById?:    string;
  dateReviewed?:    string;
  wpRef?:           string;
  resultDescription?: string;
  conclusion?:      StepConclusion;
  exceptionText?:   string;
  exceptionAmount?: number;
  difRef?:          string;
  hoursPlanned?:    number;
  hoursActual?:     number;
  status?:          StepStatus;
  sortOrder?:       number;
}

export interface UpdateStepDto extends Partial<CreateStepDto> {}

@Injectable()
export class AuditProceduresService {
  private readonly logger        = new Logger(AuditProceduresService.name);
  private readonly supabase:     SupabaseClient;
  private readonly geminiUrl     = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

  constructor(
    private readonly prisma:  PrismaService,
    private readonly config:  ConfigService,
  ) {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }

  // ─── Access guards ─────────────────────────────────────────────────────────

  private async assertSectionAccess(sectionId: string, user: AuthUser) {
    const section = await this.prisma.paperSection.findUnique({
      where:   { id: sectionId },
      include: { paper: { include: { audit: { select: { organizationId: true } } } } },
    });
    if (!section) throw new NotFoundException('Sección no encontrada');
    if (section.paper.audit.organizationId !== user.organizationId)
      throw new ForbiddenException();
    return section;
  }

  private async assertProcedureAccess(procedureId: string, user: AuthUser) {
    const proc = await this.prisma.auditProcedure.findUnique({
      where:   { id: procedureId },
      include: {
        section: {
          include: { paper: { include: { audit: { select: { organizationId: true } } } } },
        },
      },
    });
    if (!proc) throw new NotFoundException('Procedimiento no encontrado');
    if (proc.section.paper.audit.organizationId !== user.organizationId)
      throw new ForbiddenException();
    return proc;
  }

  private async assertStepAccess(stepId: string, user: AuthUser) {
    const step = await this.prisma.auditStep.findUnique({
      where:   { id: stepId },
      include: {
        procedure: {
          include: {
            section: {
              include: { paper: { include: { audit: { select: { organizationId: true } } } } },
            },
          },
        },
      },
    });
    if (!step) throw new NotFoundException('Actividad no encontrada');
    if (step.procedure.section.paper.audit.organizationId !== user.organizationId)
      throw new ForbiddenException();
    return step;
  }

  // ─── Procedures CRUD ───────────────────────────────────────────────────────

  async getProcedures(sectionId: string, user: AuthUser) {
    await this.assertSectionAccess(sectionId, user);
    return this.prisma.auditProcedure.findMany({
      where:   { sectionId },
      orderBy: { sortOrder: 'asc' },
      include: {
        steps: { orderBy: { sortOrder: 'asc' }, include: { evidences: true } },
      },
    });
  }

  async createProcedure(sectionId: string, dto: CreateProcedureDto, user: AuthUser) {
    await this.assertSectionAccess(sectionId, user);
    const count = await this.prisma.auditProcedure.count({ where: { sectionId } });
    return this.prisma.auditProcedure.create({
      data: {
        sectionId,
        refNumber:      dto.refNumber,
        description:    dto.description,
        assertions:     dto.assertions  ?? [],
        significantRisk: dto.significantRisk ?? false,
        rmmLevel:       dto.rmmLevel    ?? null,
        rmmRiskRef:     dto.rmmRiskRef  ?? [],
        wpRef:          dto.wpRef       ?? null,
        sortOrder:      dto.sortOrder   ?? count,
      },
      include: { steps: true },
    });
  }

  async updateProcedure(id: string, dto: UpdateProcedureDto, user: AuthUser) {
    await this.assertProcedureAccess(id, user);
    return this.prisma.auditProcedure.update({
      where: { id },
      data:  {
        ...(dto.refNumber      !== undefined && { refNumber:      dto.refNumber }),
        ...(dto.description    !== undefined && { description:    dto.description }),
        ...(dto.assertions     !== undefined && { assertions:     dto.assertions }),
        ...(dto.significantRisk !== undefined && { significantRisk: dto.significantRisk }),
        ...(dto.rmmLevel       !== undefined && { rmmLevel:       dto.rmmLevel }),
        ...(dto.rmmRiskRef     !== undefined && { rmmRiskRef:     dto.rmmRiskRef }),
        ...(dto.wpRef          !== undefined && { wpRef:          dto.wpRef }),
        ...(dto.conclusionText !== undefined && { conclusionText: dto.conclusionText }),
        ...(dto.status         !== undefined && { status:         dto.status }),
        ...(dto.sortOrder      !== undefined && { sortOrder:      dto.sortOrder }),
      },
      include: { steps: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async deleteProcedure(id: string, user: AuthUser) {
    await this.assertProcedureAccess(id, user);
    return this.prisma.auditProcedure.delete({ where: { id } });
  }

  // ─── Cross-reference pickers (wpRef / rmmRiskRef) ─────────────────────────

  /** List the other working papers of this section's audit, for the "referenciar papel" picker. */
  async getAuditPapersForSection(sectionId: string, user: AuthUser) {
    const section = await this.assertSectionAccess(sectionId, user);
    const paper = await this.prisma.workingPaper.findUnique({
      where:  { id: section.paperId },
      select: { auditId: true },
    });
    if (!paper) throw new NotFoundException('Papel no encontrado');

    const papers = await this.prisma.workingPaper.findMany({
      where:   { auditId: paper.auditId },
      select:  { id: true, code: true, paperCode: true, title: true },
      orderBy: { code: 'asc' },
    });
    return papers.map(p => ({ id: p.id, code: p.code, paperCode: p.paperCode, title: p.title }));
  }

  /**
   * List risk rows registered in the audit's risk-assessment paper (PT-A2 S5 —
   * "Riesgos Específicos Identificados"), for the "vincular riesgo" picker.
   * Each returned item carries a stable `ref` (paperCode::sectionKey::rowIndex) to
   * store on the procedure — never the risk's own description, which can be edited
   * later without silently breaking the link.
   */
  async getAuditRisksForSection(sectionId: string, user: AuthUser) {
    const section = await this.assertSectionAccess(sectionId, user);
    const paper = await this.prisma.workingPaper.findUnique({
      where:  { id: section.paperId },
      select: { auditId: true },
    });
    if (!paper) throw new NotFoundException('Papel no encontrado');

    const riskPaper = await this.prisma.workingPaper.findFirst({
      where:   { auditId: paper.auditId, paperCode: 'PT-A2' },
      include: { sections: { where: { sectionKey: 'S5' } } },
    });
    const rows = riskPaper?.sections[0]?.value;
    if (!Array.isArray(rows)) return [];

    return (rows as Array<Record<string, unknown>>).map((row, idx) => {
      const entries = Object.entries(row);
      const descEntry = entries.find(([k]) => /descrip|riesgo/i.test(k)) ?? entries[0];
      const areaEntry = entries.find(([k]) => /ciclo|área|area/i.test(k));
      const label = [descEntry?.[1], areaEntry?.[1]].filter(Boolean).join(' — ') || `Fila ${idx + 1}`;
      return { ref: `PT-A2::S5::${idx}`, label: String(label).slice(0, 200) };
    });
  }

  // ─── Steps CRUD ────────────────────────────────────────────────────────────

  async createStep(procedureId: string, dto: CreateStepDto, user: AuthUser) {
    await this.assertProcedureAccess(procedureId, user);
    const count = await this.prisma.auditStep.count({ where: { procedureId } });
    return this.prisma.auditStep.create({
      data: {
        procedureId,
        refNumber:        dto.refNumber,
        description:      dto.description,
        assertions:       dto.assertions     ?? [],
        testType:         dto.testType       ?? TestType.DETAIL,
        nature:           dto.nature         ?? AuditNature.INSPECTION,
        timing:           dto.timing         ?? AuditTiming.YEAR_END,
        extent:           dto.extent         ?? null,
        population:       dto.population     ?? null,
        performedByName:  dto.performedByName ?? null,
        performedById:    dto.performedById   ?? null,
        datePerformed:    dto.datePerformed   ? new Date(dto.datePerformed) : null,
        reviewedByName:   dto.reviewedByName  ?? null,
        reviewedById:     dto.reviewedById    ?? null,
        dateReviewed:     dto.dateReviewed    ? new Date(dto.dateReviewed) : null,
        wpRef:            dto.wpRef           ?? null,
        resultDescription: dto.resultDescription ?? null,
        conclusion:       dto.conclusion      ?? StepConclusion.PENDING,
        exceptionText:    dto.exceptionText   ?? null,
        exceptionAmount:  dto.exceptionAmount ?? null,
        difRef:           dto.difRef          ?? null,
        hoursPlanned:     dto.hoursPlanned    ?? null,
        hoursActual:      dto.hoursActual     ?? null,
        status:           dto.status          ?? StepStatus.DRAFT,
        sortOrder:        dto.sortOrder       ?? count,
      },
      include: { evidences: true },
    });
  }

  async updateStep(id: string, dto: UpdateStepDto, user: AuthUser) {
    const existing = await this.assertStepAccess(id, user);

    // Status machine validation: SUBMITTED requires executor + date
    if (dto.status === StepStatus.SUBMITTED) {
      const name = dto.performedByName ?? existing.performedByName;
      const date = dto.datePerformed   ?? (existing.datePerformed ? existing.datePerformed.toISOString() : null);
      if (!name || !date) {
        throw new BadRequestException(
          'Para marcar como "En revisión" se requiere el nombre del auditor ejecutor y la fecha de ejecución.',
        );
      }
    }

    const updated = await this.prisma.auditStep.update({
      where: { id },
      data:  {
        ...(dto.refNumber        !== undefined && { refNumber:        dto.refNumber }),
        ...(dto.description      !== undefined && { description:      dto.description }),
        ...(dto.assertions       !== undefined && { assertions:       dto.assertions }),
        ...(dto.testType         !== undefined && { testType:         dto.testType }),
        ...(dto.nature           !== undefined && { nature:           dto.nature }),
        ...(dto.timing           !== undefined && { timing:           dto.timing }),
        ...(dto.extent           !== undefined && { extent:           dto.extent }),
        ...(dto.population       !== undefined && { population:       dto.population }),
        ...(dto.performedByName  !== undefined && { performedByName:  dto.performedByName }),
        ...(dto.performedById    !== undefined && { performedById:    dto.performedById }),
        ...(dto.datePerformed    !== undefined && { datePerformed:    dto.datePerformed ? new Date(dto.datePerformed) : null }),
        ...(dto.reviewedByName   !== undefined && { reviewedByName:   dto.reviewedByName }),
        ...(dto.reviewedById     !== undefined && { reviewedById:     dto.reviewedById }),
        ...(dto.dateReviewed     !== undefined && { dateReviewed:     dto.dateReviewed ? new Date(dto.dateReviewed) : null }),
        ...(dto.wpRef            !== undefined && { wpRef:            dto.wpRef }),
        ...(dto.resultDescription !== undefined && { resultDescription: dto.resultDescription }),
        ...(dto.conclusion       !== undefined && { conclusion:       dto.conclusion }),
        ...(dto.exceptionText    !== undefined && { exceptionText:    dto.exceptionText }),
        ...(dto.exceptionAmount  !== undefined && { exceptionAmount:  dto.exceptionAmount }),
        ...(dto.difRef           !== undefined && { difRef:           dto.difRef }),
        ...(dto.hoursPlanned     !== undefined && { hoursPlanned:     dto.hoursPlanned }),
        ...(dto.hoursActual      !== undefined && { hoursActual:      dto.hoursActual }),
        ...(dto.status           !== undefined && { status:           dto.status }),
        ...(dto.sortOrder        !== undefined && { sortOrder:        dto.sortOrder }),
      },
      include: { evidences: true },
    });

    // Auto-update parent ProcStatus based on all sibling steps
    await this.syncProcStatus(existing.procedureId);

    return updated;
  }

  async deleteStep(id: string, user: AuthUser) {
    const step = await this.assertStepAccess(id, user);
    await this.prisma.auditStep.delete({ where: { id } });
    await this.syncProcStatus(step.procedureId);
  }

  // ─── Evidence ──────────────────────────────────────────────────────────────

  async createEvidence(
    stepId: string,
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
    user: AuthUser,
  ) {
    await this.assertStepAccess(stepId, user);

    const safeName   = file.originalname.replace(/[^\w.\-]/g, '_');
    const path       = `procedures/steps/${stepId}/${Date.now()}_${safeName}`;

    const { error: upErr } = await this.supabase.storage
      .from('audit-files')
      .upload(path, file.buffer, {
        contentType: file.mimetype || 'application/octet-stream',
        cacheControl: '3600',
        upsert: false,
      });
    if (upErr) throw new BadRequestException(`Error al subir archivo: ${upErr.message}`);

    return this.prisma.stepEvidence.create({
      data: {
        stepId,
        fileName:      file.originalname,
        storageKey:    path,
        mimeType:      file.mimetype,
        size:          file.size,
        uploadedByName: user.email,
        uploadedById:  user.id,
      },
    });
  }

  async deleteEvidence(evidenceId: string, stepId: string, user: AuthUser) {
    await this.assertStepAccess(stepId, user);

    const evidence = await this.prisma.stepEvidence.findUnique({ where: { id: evidenceId } });
    if (!evidence || evidence.stepId !== stepId) throw new NotFoundException('Evidencia no encontrada');

    await this.supabase.storage.from('audit-files').remove([evidence.storageKey]);
    await this.prisma.stepEvidence.delete({ where: { id: evidenceId } });
    return { deleted: true };
  }

  // ─── AI auto-suggest ───────────────────────────────────────────────────────

  async suggestAndCreateProcedures(sectionId: string, user: AuthUser) {
    const section = await this.assertSectionAccess(sectionId, user);
    const apiKey  = this.config.get<string>('GEMINI_API_KEY', '');

    if (!apiKey) {
      throw new BadRequestException('GEMINI_API_KEY no configurado. Configure la clave en las variables de entorno.');
    }

    // Load context: paper info + sibling papers of the same audit
    const paper = await this.prisma.workingPaper.findUnique({
      where: { id: section.paperId },
      select: { auditId: true },
    });
    if (!paper) throw new NotFoundException('Papel no encontrado');

    const audit = await this.prisma.audit.findUnique({
      where:   { id: paper.auditId },
      select:  { title: true, auditPeriodEnd: true },
    });

    // "Auditoría Financiera Externa v1.0" no tiene un papel PT-A5 dedicado — la
    // evaluación de riesgos vive en PT-A2 (score RMM por área en S4, riesgos
    // significativos NIA 315 en S6) y el enfoque por área en PT-STRAT S5.
    const siblingPapers = await this.prisma.workingPaper.findMany({
      where:   { auditId: paper.auditId, paperCode: { in: ['PT-A2', 'PT-STRAT'] } },
      include: { sections: { orderBy: { sortOrder: 'asc' } } },
    });

    // Extract relevant sections from sibling papers
    const a2Paper  = siblingPapers.find(p => p.paperCode === 'PT-A2');
    const areas    = a2Paper?.sections.find(s => s.sectionKey === 'S1')?.value ?? '';
    const rmmText  = a2Paper?.sections.find(s => s.sectionKey === 'S4')?.value ?? '';
    const sigRisks = a2Paper?.sections.find(s => s.sectionKey === 'S6')?.value ?? '';

    const stratPaper = siblingPapers.find(p => p.paperCode === 'PT-STRAT');
    const strategy    = stratPaper?.sections.find(s => s.sectionKey === 'S5')?.value ?? '';

    const auditName = audit?.title ?? 'Auditoría';
    const year      = audit?.auditPeriodEnd?.getFullYear() ?? new Date().getFullYear();
    const paperLabel = section.label ?? 'Programa de Auditoría';

    const prompt = `
Eres un auditor de Big 4 experto en NIAs (normas IAASB). Genera un programa de auditoría estructurado para el papel "${paperLabel}" del encargo "${auditName}" (año ${year}).

## Contexto de riesgo disponible:

### Áreas auditadas (PT-A2 S1):
${areas || '(No disponible)'}

### Score de Riesgo Inherente por área (PT-A2 S4):
${rmmText || '(No disponible)'}

### Riesgos Significativos NIA 315 (PT-A2 S6):
${sigRisks || '(No disponible)'}

### Enfoque de auditoría por área (PT-STRAT S5):
${strategy || '(No disponible)'}

## Instrucciones:
Genera entre 3 y 8 procedimientos de auditoría (nivel 1) con sus actividades ejecutables (nivel 2).
Cada procedimiento debe tener entre 2 y 5 actividades.
Usa aserciones NIA 315 (EXI, VAL, COM, OCC, EXA, COR, CLA).
RMM levels: BAJO, MODERADO, ALTO, MUY_ALTO.
Responde ÚNICAMENTE con JSON válido, sin texto adicional ni markdown.

JSON schema:
{
  "procedures": [
    {
      "refNumber": "P-01",
      "description": "Descripción del procedimiento (1 oración)",
      "assertions": ["EXI", "VAL"],
      "significantRisk": false,
      "rmmLevel": "MODERADO",
      "steps": [
        {
          "refNumber": "P-01.1",
          "description": "Descripción de la actividad ejecutable",
          "assertions": ["EXI"],
          "testType": "DETAIL",
          "nature": "INSPECTION",
          "timing": "YEAR_END",
          "extent": "100% de los items > $10,000",
          "population": "Saldos al 31/12"
        }
      ]
    }
  ]
}

testType values: DETAIL, ANALYTICAL, CONTROL
nature values: INSPECTION, OBSERVATION, INQUIRY, CONFIRMATION, RECALCULATION, REPERFORMANCE, ANALYTICAL
timing values: INTERIM, YEAR_END, ROLLFORWARD
`;

    let parsed: { procedures: Array<{
      refNumber: string; description: string; assertions?: string[];
      significantRisk?: boolean; rmmLevel?: string;
      steps: Array<{
        refNumber: string; description: string; assertions?: string[];
        testType?: string; nature?: string; timing?: string;
        extent?: string; population?: string;
      }>;
    }> };

    try {
      const raw = await this.callGeminiText(apiKey, prompt);
      const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (e) {
      this.logger.error('AI suggest parse error', e);
      throw new BadRequestException('La IA no pudo generar procedimientos válidos. Intente de nuevo.');
    }

    const baseCount = await this.prisma.auditProcedure.count({ where: { sectionId } });

    const created = [];
    for (let pi = 0; pi < parsed.procedures.length; pi++) {
      const p = parsed.procedures[pi];
      const proc = await this.prisma.auditProcedure.create({
        data: {
          sectionId,
          refNumber:       p.refNumber,
          description:     p.description,
          assertions:      p.assertions   ?? [],
          significantRisk: p.significantRisk ?? false,
          rmmLevel:        p.rmmLevel     ?? null,
          sortOrder:       baseCount + pi,
        },
      });

      const steps = [];
      for (let si = 0; si < (p.steps ?? []).length; si++) {
        const s = p.steps[si];
        const step = await this.prisma.auditStep.create({
          data: {
            procedureId:  proc.id,
            refNumber:    s.refNumber,
            description:  s.description,
            assertions:   s.assertions  ?? [],
            testType:     (s.testType   as TestType)     ?? TestType.DETAIL,
            nature:       (s.nature     as AuditNature)  ?? AuditNature.INSPECTION,
            timing:       (s.timing     as AuditTiming)  ?? AuditTiming.YEAR_END,
            extent:       s.extent      ?? null,
            population:   s.population  ?? null,
            sortOrder:    si,
          },
          include: { evidences: true },
        });
        steps.push(step);
      }
      created.push({ ...proc, steps });
    }

    return created;
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async syncProcStatus(procedureId: string) {
    const steps = await this.prisma.auditStep.findMany({
      where:  { procedureId },
      select: { status: true },
    });

    if (steps.length === 0) return;

    const terminal = [StepStatus.CLEARED, StepStatus.APPROVED] as StepStatus[];
    const active   = [StepStatus.IN_PROGRESS, StepStatus.SUBMITTED, StepStatus.REVIEWED] as StepStatus[];

    let newStatus: ProcStatus;
    if (steps.every(s => terminal.includes(s.status))) {
      newStatus = ProcStatus.COMPLETED;
    } else if (steps.some(s => active.includes(s.status) || terminal.includes(s.status))) {
      newStatus = ProcStatus.IN_PROGRESS;
    } else {
      newStatus = ProcStatus.PENDING;
    }

    await this.prisma.auditProcedure.update({
      where: { id: procedureId },
      data:  { status: newStatus },
    });
  }

  private async callGeminiText(apiKey: string, prompt: string): Promise<string> {
    const res = await fetch(`${this.geminiUrl}?key=${apiKey}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Gemini HTTP ${res.status}: ${errBody.slice(0, 200)}`);
    }

    const data = await res.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      error?: { message: string };
    };

    if (data.error) throw new Error(`Gemini error: ${data.error.message}`);
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    if (!text.trim()) throw new Error('Gemini returned empty text');
    return text.trim();
  }
}
