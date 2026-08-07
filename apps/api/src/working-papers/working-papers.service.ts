import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateWorkingPaperDto, AddCommentDto, AddTickMarkEntryDto,
} from './dto/create-working-paper.dto';
import { UpdateWorkingPaperDto, UpdateWorkingPaperStatusDto } from './dto/update-working-paper.dto';
import { AuthUser } from '../auth/jwt.strategy';
import { WorkingPaperStatus, UserRole, TickMark, WpKind, SyncStatus, Prisma } from '@prisma/client';
import { PaperGraphService } from './paper-graph.service';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

async function generateWpCode(
  prisma: PrismaService,
  auditId: string,
  indexSection: string,
): Promise<string> {
  const count = await prisma.workingPaper.count({
    where: { auditId, indexSection },
  });
  return `${indexSection}-${String(count + 1).padStart(2, '0')}`;
}

const INCLUDE_FULL = {
  preparedBy:  { select: { id: true, name: true, avatarUrl: true } },
  reviewedBy:  { select: { id: true, name: true, avatarUrl: true } },
  findings:    { select: { id: true, title: true, severity: true, status: true } },
  tickEntries: { orderBy: { createdAt: 'asc' as const } },
  comments:    { orderBy: { createdAt: 'asc' as const } },
  // ─── Intelligent Papers ─────────────────────────────────────────────────
  sections:     { orderBy: { sortOrder: 'asc' as const } },
  sourceLinks:  {
    include: {
      target: {
        select: { id: true, code: true, title: true, wpKind: true, syncStatus: true },
      },
    },
  },
  targetLinks:  {
    include: {
      source: {
        select: { id: true, code: true, title: true, wpKind: true, syncStatus: true },
      },
    },
  },
} as const;

@Injectable()
export class WorkingPapersService {
  private readonly supabaseAdmin: SupabaseClient;

  constructor(
    private readonly prisma:        PrismaService,
    private readonly paperGraph:    PaperGraphService,
    private readonly eventEmitter:  EventEmitter2,
  ) {
    this.supabaseAdmin = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }

  private async assertAuditAccess(auditId: string, user: AuthUser) {
    const audit = await this.prisma.audit.findFirst({
      where: { id: auditId, organizationId: user.organizationId },
      include: { team: { select: { userId: true } } },
    });
    if (!audit) throw new NotFoundException('Auditoría no encontrada');

    if (audit.isInvestigationMode) {
      const onTeam      = audit.team.some((m) => m.userId === user.id);
      const privileged  = ([UserRole.CAE, UserRole.ADMIN, UserRole.SUPER_ADMIN] as string[]).includes(user.role);
      if (!onTeam && !privileged) throw new ForbiddenException('Acceso restringido — modo investigación');
    }

    return audit;
  }

  // ─── CRUD ────────────────────────────────────────────────────────────────────

  async create(dto: CreateWorkingPaperDto, user: AuthUser) {
    await this.assertAuditAccess(dto.auditId, user);

    // Resolve indexSection from folderId if not provided explicitly
    let indexSection = dto.indexSection;
    if (dto.folderId && !indexSection) {
      const folder = await this.prisma.auditFolder.findUnique({
        where:  { id: dto.folderId },
        select: { ref: true },
      });
      if (folder) indexSection = folder.ref;
    }
    if (!indexSection) indexSection = 'A';

    const code = dto.code ?? await generateWpCode(this.prisma, dto.auditId, indexSection);

    return this.prisma.workingPaper.create({
      data: {
        code,
        title:          dto.title,
        type:           dto.type,
        indexSection,
        auditId:        dto.auditId,
        folderId:       dto.folderId ?? null,
        wpKind:         dto.wpKind   ?? undefined,
        paperCode:      dto.paperCode ?? null,
        preparedById:   user.id,
        reviewedById:   dto.reviewerId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        content:        (dto.content ?? {}) as any,
        conclusion:     dto.conclusion,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tickMarks:      (dto.tickMarks ?? []) as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        crossReferences:(dto.crossReferences ?? []) as any,
        aiAssisted:     dto.aiAssisted ?? false,
        status:         WorkingPaperStatus.DRAFT,
        version:        1,
      },
      include: INCLUDE_FULL,
    });
  }

  async findAllForAudit(auditId: string, user: AuthUser) {
    await this.assertAuditAccess(auditId, user);
    return this.prisma.workingPaper.findMany({
      where:   { auditId },
      orderBy: [{ indexSection: 'asc' }, { code: 'asc' }],
      include: {
        preparedBy: { select: { id: true, name: true, avatarUrl: true } },
        reviewedBy: { select: { id: true, name: true, avatarUrl: true } },
        _count:     { select: { findings: true, comments: true, tickEntries: true } },
      },
    });
  }

  async findAllForOrg(
    user: AuthUser,
    page     = 1,
    limit    = 30,
    status?: WorkingPaperStatus,
    auditId?: string,
  ) {
    const where = {
      audit: { organizationId: user.organizationId },
      ...(status  && { status }),
      ...(auditId && { auditId }),
    };

    const [data, total] = await Promise.all([
      this.prisma.workingPaper.findMany({
        where,
        skip:    (page - 1) * limit,
        take:    limit,
        orderBy: [{ auditId: 'asc' }, { indexSection: 'asc' }, { code: 'asc' }],
        include: {
          audit:      { select: { id: true, title: true } },
          preparedBy: { select: { id: true, name: true } },
          reviewedBy: { select: { id: true, name: true } },
          _count:     { select: { findings: true, tickEntries: true } },
        },
      }),
      this.prisma.workingPaper.count({ where }),
    ]);

    return { data, meta: { total, page, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string, user: AuthUser) {
    const wp = await this.prisma.workingPaper.findUnique({
      where:   { id },
      include: {
        ...INCLUDE_FULL,
        audit: {
          select: {
            id: true, title: true, organizationId: true,
            isInvestigationMode: true,
            team: { select: { userId: true } },
          },
        },
      },
    });
    if (!wp) throw new NotFoundException('Papel de trabajo no encontrado');
    if (wp.audit.organizationId !== user.organizationId) throw new ForbiddenException();
    return wp;
  }

  // ─── Procedimientos enriquecidos del papel ─────────────────────────────────
  /**
   * Estructura de un procedimiento (content.procedures[]):
   *   { id, title, statement, development, area, niaRef, addedAt }
   * - title: título corto (negrita)
   * - statement: enunciado del procedimiento (qué se hace)
   * - development: desarrollo / ejecución (lo que el auditor documenta)
   */
  async appendProcedure(
    id: string,
    dto: { procedure?: string; title?: string; statement?: string; development?: string; area?: string; niaRef?: string },
    user: AuthUser,
  ) {
    const wp = await this.findOne(id, user);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const content = (wp.content ?? {}) as Record<string, any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const procedures: any[] = Array.isArray(content.procedures) ? content.procedures : [];

    // Compatibilidad: si llega 'procedure' (legacy de sugerencias), lo mapeamos a statement
    const statement = dto.statement ?? dto.procedure ?? '';
    const title = dto.title ?? (dto.area ? `${dto.area}` : 'Procedimiento');

    // Evitar duplicados exactos por statement
    const exists = procedures.some(p => (p.statement ?? p.procedure) === statement);
    if (!exists && statement.trim()) {
      procedures.push({
        id:          `proc_${procedures.length + 1}_${Date.now().toString(36)}`,
        title,
        statement,
        development: dto.development ?? '',
        area:        dto.area ?? 'General',
        niaRef:      dto.niaRef,
        addedAt:     new Date().toISOString(),
      });
    }

    await this.prisma.workingPaper.update({
      where: { id },
      data:  { content: { ...content, procedures } as Prisma.InputJsonValue },
    });

    return { added: !exists, total: procedures.length, procedures };
  }

  /** Actualizar campos de un procedimiento existente (title/statement/development). */
  async updateProcedure(
    id: string,
    procedureId: string,
    dto: { title?: string; statement?: string; development?: string; area?: string; niaRef?: string },
    user: AuthUser,
  ) {
    const wp = await this.findOne(id, user);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const content = (wp.content ?? {}) as Record<string, any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const procedures: any[] = Array.isArray(content.procedures) ? content.procedures : [];

    const idx = procedures.findIndex(p => p.id === procedureId);
    if (idx === -1) throw new NotFoundException('Procedimiento no encontrado');

    procedures[idx] = {
      ...procedures[idx],
      ...(dto.title       !== undefined && { title:       dto.title }),
      ...(dto.statement   !== undefined && { statement:   dto.statement }),
      ...(dto.development !== undefined && { development: dto.development }),
      ...(dto.area        !== undefined && { area:        dto.area }),
      ...(dto.niaRef      !== undefined && { niaRef:      dto.niaRef }),
      updatedAt: new Date().toISOString(),
    };

    await this.prisma.workingPaper.update({
      where: { id },
      data:  { content: { ...content, procedures } as Prisma.InputJsonValue },
    });

    return procedures[idx];
  }

  async removeProcedure(id: string, procedureId: string, user: AuthUser) {
    const wp = await this.findOne(id, user);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const content = (wp.content ?? {}) as Record<string, any>;
    const procedures: Array<{ id: string }> = Array.isArray(content.procedures) ? content.procedures : [];
    const filtered = procedures.filter(p => p.id !== procedureId);

    await this.prisma.workingPaper.update({
      where: { id },
      data:  { content: { ...content, procedures: filtered } as Prisma.InputJsonValue },
    });

    return { removed: filtered.length < procedures.length, total: filtered.length };
  }

  // ─── Helpers para el PDF (revisión) ────────────────────────────────────────
  async getUserName(userId: string): Promise<string | null> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId }, select: { name: true },
    });
    return u?.name ?? null;
  }

  async getPbcLinksForPdf(paperId: string): Promise<Array<{ code: string; title: string; status: string }>> {
    const links = await this.prisma.pbcPaperLink.findMany({
      where:   { paperId },
      include: { pbc: { select: { id: true, title: true, status: true } } },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return links.map((l: any) => ({
      code:   l.pbc?.id?.slice(0, 8) ?? '',
      title:  l.pbc?.title ?? '',
      status: l.pbc?.status ?? '',
    }));
  }

  // ─── Adjuntar archivo de soporte a una SECCIÓN ─────────────────────────────
  async attachToSection(
    paperId: string,
    sectionKey: string,
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
    user: AuthUser,
  ) {
    await this.findOne(paperId, user); // access guard

    const section = await this.prisma.paperSection.findFirst({
      where: { paperId, sectionKey },
    });
    if (!section) throw new NotFoundException('Sección no encontrada');

    const safeName = file.originalname.replace(/[^\w.\-]/g, '_');
    const path = `sections/${paperId}/${sectionKey}/${Date.now()}_${safeName}`;
    const { error: upErr } = await this.supabaseAdmin.storage
      .from('audit-files')
      .upload(path, file.buffer, {
        contentType: file.mimetype || 'application/octet-stream',
        cacheControl: '3600',
        upsert: false,
      });
    if (upErr) throw new BadRequestException(`Error al subir archivo: ${upErr.message}`);

    const { data: urlData } = this.supabaseAdmin.storage.from('audit-files').getPublicUrl(path);

    const attachment = {
      id:        `att_${Date.now().toString(36)}`,
      filename:  file.originalname,
      url:       urlData.publicUrl,
      mimeType:  file.mimetype,
      size:      file.size,
      uploadedAt: new Date().toISOString(),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const attachments = Array.isArray(section.attachments) ? (section.attachments as any[]) : [];
    attachments.push(attachment);

    await this.prisma.paperSection.update({
      where: { id: section.id },
      data:  { attachments: attachments as Prisma.InputJsonValue },
    });
    return attachment;
  }

  async removeSectionAttachment(paperId: string, sectionKey: string, attachmentId: string, user: AuthUser) {
    await this.findOne(paperId, user);
    const section = await this.prisma.paperSection.findFirst({ where: { paperId, sectionKey } });
    if (!section) throw new NotFoundException('Sección no encontrada');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const attachments = (Array.isArray(section.attachments) ? (section.attachments as any[]) : [])
      .filter(a => a.id !== attachmentId);

    await this.prisma.paperSection.update({
      where: { id: section.id },
      data:  { attachments: attachments as Prisma.InputJsonValue },
    });
    return { removed: true };
  }

  // ─── F3: Adjuntar archivo de soporte a un procedimiento ────────────────────
  async attachToProcedure(
    id: string,
    procedureId: string,
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
    user: AuthUser,
  ) {
    const wp = await this.findOne(id, user);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const content = (wp.content ?? {}) as Record<string, any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const procedures: any[] = Array.isArray(content.procedures) ? content.procedures : [];
    const idx = procedures.findIndex(p => p.id === procedureId);
    if (idx === -1) throw new NotFoundException('Procedimiento no encontrado');

    // Upload to Supabase Storage
    const safeName = file.originalname.replace(/[^\w.\-]/g, '_');
    const path = `procedures/${id}/${procedureId}/${Date.now()}_${safeName}`;
    const { error: upErr } = await this.supabaseAdmin.storage
      .from('audit-files')
      .upload(path, file.buffer, {
        contentType: file.mimetype || 'application/octet-stream',
        cacheControl: '3600',
        upsert: false,
      });
    if (upErr) throw new BadRequestException(`Error al subir archivo: ${upErr.message}`);

    const { data: urlData } = this.supabaseAdmin.storage.from('audit-files').getPublicUrl(path);

    const attachment = {
      id:        `att_${Date.now().toString(36)}`,
      filename:  file.originalname,
      url:       urlData.publicUrl,
      mimeType:  file.mimetype,
      size:      file.size,
      uploadedAt: new Date().toISOString(),
    };
    procedures[idx].attachments = [...(procedures[idx].attachments ?? []), attachment];

    await this.prisma.workingPaper.update({
      where: { id },
      data:  { content: { ...content, procedures } as Prisma.InputJsonValue },
    });

    return attachment;
  }

  async removeAttachment(id: string, procedureId: string, attachmentId: string, user: AuthUser) {
    const wp = await this.findOne(id, user);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const content = (wp.content ?? {}) as Record<string, any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const procedures: any[] = Array.isArray(content.procedures) ? content.procedures : [];
    const idx = procedures.findIndex(p => p.id === procedureId);
    if (idx === -1) throw new NotFoundException('Procedimiento no encontrado');

    procedures[idx].attachments = (procedures[idx].attachments ?? []).filter(
      (a: { id: string }) => a.id !== attachmentId,
    );

    await this.prisma.workingPaper.update({
      where: { id },
      data:  { content: { ...content, procedures } as Prisma.InputJsonValue },
    });
    return { removed: true };
  }

  // ─── F4: Evidencia documental (STANDARD papers) ────────────────────────────
  async attachToDocumentEvidence(
    paperId: string,
    rowId: string,
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
    user: AuthUser,
  ) {
    const wp = await this.findOne(paperId, user);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const content = (wp.content ?? {}) as Record<string, any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: any[] = Array.isArray(content.documentEvidence) ? content.documentEvidence : [];
    let rowIndex = rows.findIndex((r: { id: string }) => r.id === rowId);
    if (rowIndex === -1) {
      rows.push({ id: rowId, name: '', description: '', reviewedBy: '', attachments: [] });
      rowIndex = rows.length - 1;
    }

    const safeName = file.originalname.replace(/[^\w.\-]/g, '_');
    const path     = `docevidence/${paperId}/${rowId}/${Date.now()}_${safeName}`;
    const { error: upErr } = await this.supabaseAdmin.storage
      .from('audit-files')
      .upload(path, file.buffer, {
        contentType: file.mimetype || 'application/octet-stream',
        cacheControl: '3600',
        upsert: false,
      });
    if (upErr) throw new BadRequestException(`Error al subir archivo: ${upErr.message}`);

    const { data: urlData } = this.supabaseAdmin.storage.from('audit-files').getPublicUrl(path);

    const attachment = {
      id:         `att_${Date.now().toString(36)}`,
      filename:   file.originalname,
      url:        urlData.publicUrl,
      mimeType:   file.mimetype,
      size:       file.size,
      uploadedAt: new Date().toISOString(),
    };
    rows[rowIndex].attachments = [...(rows[rowIndex].attachments ?? []), attachment];

    await this.prisma.workingPaper.update({
      where: { id: paperId },
      data:  { content: { ...content, documentEvidence: rows } as Prisma.InputJsonValue },
    });
    return attachment;
  }

  async removeDocumentEvidenceAttachment(
    paperId: string,
    rowId: string,
    attachmentId: string,
    user: AuthUser,
  ) {
    const wp = await this.findOne(paperId, user);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const content = (wp.content ?? {}) as Record<string, any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: any[] = Array.isArray(content.documentEvidence) ? content.documentEvidence : [];
    const rowIndex = rows.findIndex((r: { id: string }) => r.id === rowId);
    if (rowIndex === -1) throw new NotFoundException('Fila de evidencia no encontrada');

    rows[rowIndex].attachments = (rows[rowIndex].attachments ?? []).filter(
      (a: { id: string }) => a.id !== attachmentId,
    );

    await this.prisma.workingPaper.update({
      where: { id: paperId },
      data:  { content: { ...content, documentEvidence: rows } as Prisma.InputJsonValue },
    });
    return { removed: true };
  }

  // ─── F5: Analítica de cuentas (ACCOUNT_SCHEDULE) — adjuntos por fila ────────
  async attachToAccountSchedule(
    paperId: string,
    rowId: string,
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
    user: AuthUser,
  ) {
    const wp = await this.findOne(paperId, user);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const content = (wp.content ?? {}) as Record<string, any>;

    const safeName = file.originalname.replace(/[^\w.\-]/g, '_');
    const path     = `acct-schedule/${paperId}/${rowId}/${Date.now()}_${safeName}`;
    const { error: upErr } = await this.supabaseAdmin.storage
      .from('audit-files')
      .upload(path, file.buffer, {
        contentType:  file.mimetype || 'application/octet-stream',
        cacheControl: '3600',
        upsert:       false,
      });
    if (upErr) throw new BadRequestException(`Error al subir archivo: ${upErr.message}`);

    const { data: urlData } = this.supabaseAdmin.storage.from('audit-files').getPublicUrl(path);

    const attachment = {
      id:         `att_${Date.now().toString(36)}`,
      filename:   file.originalname,
      url:        urlData.publicUrl,
      mimeType:   file.mimetype,
      size:       file.size,
      uploadedAt: new Date().toISOString(),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const acctEvidence: Record<string, any> = content.accountScheduleEvidence ?? {};
    const rowEvidence = acctEvidence[rowId] ?? { attachments: [] };
    rowEvidence.attachments = [...(rowEvidence.attachments ?? []), attachment];
    acctEvidence[rowId] = rowEvidence;

    await this.prisma.workingPaper.update({
      where: { id: paperId },
      data:  { content: { ...content, accountScheduleEvidence: acctEvidence } as Prisma.InputJsonValue },
    });
    return attachment;
  }

  async removeAccountScheduleAttachment(
    paperId: string,
    rowId: string,
    attachmentId: string,
    user: AuthUser,
  ) {
    const wp = await this.findOne(paperId, user);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const content = (wp.content ?? {}) as Record<string, any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const acctEvidence: Record<string, any> = content.accountScheduleEvidence ?? {};
    const rowEvidence = acctEvidence[rowId];
    if (!rowEvidence) throw new NotFoundException('Fila de cédula analítica no encontrada');

    rowEvidence.attachments = (rowEvidence.attachments ?? []).filter(
      (a: { id: string }) => a.id !== attachmentId,
    );
    acctEvidence[rowId] = rowEvidence;

    await this.prisma.workingPaper.update({
      where: { id: paperId },
      data:  { content: { ...content, accountScheduleEvidence: acctEvidence } as Prisma.InputJsonValue },
    });
    return { removed: true };
  }

  // ─── TB Accounts: Devuelve cuentas clasificadas del B-00 para importar ──────

  async getTbAccountsForPaper(paperId: string, user: AuthUser) {
    const paper = await this.prisma.workingPaper.findUnique({
      where:   { id: paperId },
      include: { audit: { select: { id: true, organizationId: true } } },
    });
    if (!paper) throw new NotFoundException('Papel no encontrado');
    if (paper.audit.organizationId !== user.organizationId) throw new ForbiddenException();

    const b00 = await this.prisma.workingPaper.findFirst({
      where:  { auditId: paper.audit.id, paperCode: 'PT-FIN-B00' },
      select: { id: true },
    });
    if (!b00) return { accounts: [], message: 'No hay Balance de Comprobación en B-00' };

    const s2 = await this.prisma.paperSection.findUnique({
      where:  { paperId_sectionKey: { paperId: b00.id, sectionKey: 'S2' } },
      select: { value: true },
    });
    if (!s2?.value) return { accounts: [], message: 'B-00 aún no tiene clasificación guardada' };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: any[] = Array.isArray(s2.value) ? s2.value : [];
    return {
      accounts: rows.map((r) => ({
        cuenta:         String(r.cuenta ?? ''),
        descripcion:    String(r.descripcion ?? ''),
        saldo_actual:   Number(r.saldo_actual ?? 0),
        saldo_anterior: Number(r.saldo_anterior ?? 0),
        sub_sumaria:    String(r.sub_sumaria ?? ''),
        grupo:          String(r.grupo ?? ''),
      })),
      message: `${rows.length} cuentas disponibles desde B-00`,
    };
  }

  // ─── F3: Referencias cruzadas — vincular procedimiento con otro papel ──────
  async addCrossRefToProcedure(
    id: string,
    procedureId: string,
    targetPaperId: string,
    user: AuthUser,
  ) {
    const wp = await this.findOne(id, user);

    const target = await this.prisma.workingPaper.findFirst({
      where:   { id: targetPaperId, auditId: wp.auditId },
      select:  { id: true, code: true, paperCode: true, title: true },
    });
    if (!target) throw new NotFoundException('Papel destino no encontrado en esta auditoría');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const content = (wp.content ?? {}) as Record<string, any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const procedures: any[] = Array.isArray(content.procedures) ? content.procedures : [];
    const idx = procedures.findIndex(p => p.id === procedureId);
    if (idx === -1) throw new NotFoundException('Procedimiento no encontrado');

    const crossRefs = procedures[idx].crossRefs ?? [];
    if (!crossRefs.some((r: { paperId: string }) => r.paperId === target.id)) {
      crossRefs.push({
        paperId: target.id,
        code:    target.paperCode ?? target.code,
        title:   target.title,
      });
    }
    procedures[idx].crossRefs = crossRefs;

    await this.prisma.workingPaper.update({
      where: { id },
      data:  { content: { ...content, procedures } as Prisma.InputJsonValue },
    });
    return procedures[idx].crossRefs;
  }

  async removeCrossRefFromProcedure(id: string, procedureId: string, targetPaperId: string, user: AuthUser) {
    const wp = await this.findOne(id, user);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const content = (wp.content ?? {}) as Record<string, any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const procedures: any[] = Array.isArray(content.procedures) ? content.procedures : [];
    const idx = procedures.findIndex(p => p.id === procedureId);
    if (idx === -1) throw new NotFoundException('Procedimiento no encontrado');

    procedures[idx].crossRefs = (procedures[idx].crossRefs ?? []).filter(
      (r: { paperId: string }) => r.paperId !== targetPaperId,
    );

    await this.prisma.workingPaper.update({
      where: { id },
      data:  { content: { ...content, procedures } as Prisma.InputJsonValue },
    });
    return { removed: true };
  }

  private LOCKED_STATUSES: WorkingPaperStatus[] = [
    WorkingPaperStatus.SIGNED_OFF,
    WorkingPaperStatus.CLOSED,
    WorkingPaperStatus.ARCHIVED,
  ];

  async update(id: string, dto: UpdateWorkingPaperDto, user: AuthUser) {
    const wp = await this.findOne(id, user);
    // F6.4 Lockdown: block edits on SIGNED_OFF, CLOSED, ARCHIVED papers
    if (this.LOCKED_STATUSES.includes(wp.status as WorkingPaperStatus)) {
      throw new BadRequestException(
        `El papel "${wp.title}" está bloqueado (estado: ${wp.status}). No se permiten modificaciones.`,
      );
    }

    // Snapshot version before updating
    await this.prisma.workingPaperVersion.create({
      data: {
        paperId:   id,
        version:   wp.version,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        content:   wp.content as any,
        changedBy: user.id,
        diff:      {},
      },
    });

    const updated = await this.prisma.workingPaper.update({
      where: { id },
      data:  {
        ...(dto.title      !== undefined && { title: dto.title }),
        ...(dto.ref        !== undefined && { ref: dto.ref }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(dto.content    !== undefined && { content: dto.content as any }),
        ...(dto.conclusion !== undefined && { conclusion: dto.conclusion }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(dto.tickMarks  !== undefined && { tickMarks: dto.tickMarks as any }),
        ...(dto.crossReferences !== undefined && {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          crossReferences: dto.crossReferences as any,
        }),
        ...(dto.reviewerId  !== undefined && { reviewedById: dto.reviewerId }),
        ...(dto.aiAssisted  !== undefined && { aiAssisted: dto.aiAssisted }),
        version: { increment: 1 },
      },
      include: INCLUDE_FULL,
    });

    // Propagate content changes to downstream graph dependents
    if (dto.content !== undefined) {
      await this.paperGraph.onSectionUpdated(id, 'content', dto.content);
    }

    return updated;
  }

  async updateStatus(id: string, dto: UpdateWorkingPaperStatusDto, user: AuthUser) {
    const wp = await this.findOne(id, user);

    if (dto.status === WorkingPaperStatus.APPROVED) {
      const approverRoles: string[] = [UserRole.AUDIT_MANAGER, UserRole.CAE, UserRole.SENIOR_AUDITOR];
      const canApprove = wp.reviewedById === user.id || approverRoles.includes(user.role);
      if (!canApprove) throw new ForbiddenException('Solo el revisor asignado o un gerente puede aprobar este papel');
    }

    if (dto.reviewNotes) {
      await this.prisma.workingPaperComment.create({
        data: { paperId: id, authorId: user.id, content: dto.reviewNotes },
      });
    }

    // F6.4 Set retention date when paper is closed (7 years default)
    const retentionData = dto.status === WorkingPaperStatus.CLOSED
      ? { retentionUntil: new Date(Date.now() + 7 * 365.25 * 24 * 3600 * 1000) }
      : {};

    return this.prisma.workingPaper.update({
      where:   { id },
      data:    { status: dto.status, ...retentionData },
      include: INCLUDE_FULL,
    });
  }

  async remove(id: string, user: AuthUser): Promise<{ deleted: boolean }> {
    const wp = await this.prisma.workingPaper.findFirst({
      where: { id, audit: { organizationId: user.organizationId } },
      select: { id: true },
    });
    if (!wp) throw new NotFoundException('Papel de trabajo no encontrado');

    // All child records (PaperSection, WorkingPaperVersion, WorkingPaperComment,
    // TickMarkEntry, PaperLink) have onDelete: Cascade — one delete suffices.
    await this.prisma.workingPaper.delete({ where: { id } });
    return { deleted: true };
  }

  async getIndex(auditId: string, user: AuthUser) {
    await this.assertAuditAccess(auditId, user);
    const papers = await this.prisma.workingPaper.findMany({
      where:   { auditId },
      orderBy: [{ indexSection: 'asc' }, { code: 'asc' }],
      select:  {
        id: true, code: true, title: true, type: true,
        indexSection: true, status: true, aiAssisted: true, version: true,
        preparedBy: { select: { id: true, name: true } },
        reviewedBy: { select: { id: true, name: true } },
        _count: { select: { findings: true, tickEntries: true, comments: true } },
      },
    });

    return papers.reduce<Record<string, typeof papers>>((acc, wp) => {
      acc[wp.indexSection] = acc[wp.indexSection] ?? [];
      acc[wp.indexSection].push(wp);
      return acc;
    }, {});
  }

  // ─── Tick mark entries ────────────────────────────────────────────────────────

  async addTickMarkEntry(
    id: string,
    dto: AddTickMarkEntryDto,
    user: AuthUser,
  ) {
    await this.findOne(id, user); // access check

    return this.prisma.tickMarkEntry.create({
      data: {
        paperId:   id,
        fieldPath: dto.fieldPath,
        tickMark:  dto.tickMark,
        note:      dto.note,
        createdBy: user.id,
      },
    });
  }

  async removeTickMarkEntry(entryId: string, user: AuthUser) {
    const entry = await this.prisma.tickMarkEntry.findUnique({
      where:   { id: entryId },
      include: { paper: { include: { audit: { select: { organizationId: true } } } } },
    });
    if (!entry) throw new NotFoundException('Marca de auditoría no encontrada');
    if (entry.paper.audit.organizationId !== user.organizationId) throw new ForbiddenException();

    await this.prisma.tickMarkEntry.delete({ where: { id: entryId } });
    return { deleted: true };
  }

  // ─── Comments ────────────────────────────────────────────────────────────────

  async addComment(id: string, dto: AddCommentDto, user: AuthUser) {
    await this.findOne(id, user); // access check

    return this.prisma.workingPaperComment.create({
      data: { paperId: id, authorId: user.id, content: dto.content },
    });
  }

  async resolveComment(commentId: string, user: AuthUser) {
    const comment = await this.prisma.workingPaperComment.findUnique({
      where:   { id: commentId },
      include: { paper: { include: { audit: { select: { organizationId: true } } } } },
    });
    if (!comment) throw new NotFoundException('Comentario no encontrado');
    if (comment.paper.audit.organizationId !== user.organizationId) throw new ForbiddenException();

    return this.prisma.workingPaperComment.update({
      where: { id: commentId },
      data:  { resolved: true, resolvedBy: user.id },
    });
  }

  // ─── Version history ──────────────────────────────────────────────────────────

  async getVersionHistory(id: string, user: AuthUser) {
    await this.findOne(id, user); // access check

    return this.prisma.workingPaperVersion.findMany({
      where:   { paperId: id },
      orderBy: { version: 'desc' },
      select:  {
        id: true, version: true, changedAt: true, changedBy: true,
      },
    });
  }

  // ─── F6.6 Checkout / collaborative lock ──────────────────────────────────────

  private readonly CHECKOUT_TTL_MS = 30 * 60 * 1000; // 30 minutes

  async checkout(id: string, user: AuthUser) {
    const wp = await this.findOne(id, user);

    if (this.LOCKED_STATUSES.includes(wp.status as WorkingPaperStatus)) {
      throw new BadRequestException('El papel está bloqueado y no puede ser editado');
    }

    const now = new Date();

    // Check if someone else has it checked out and the lock hasn't expired
    if (
      wp.checkedOutById &&
      wp.checkedOutById !== user.id &&
      wp.checkedOutAt &&
      now.getTime() - new Date(wp.checkedOutAt).getTime() < this.CHECKOUT_TTL_MS
    ) {
      return {
        success:     false,
        lockedBy:    wp.checkedOutById,
        lockedAt:    wp.checkedOutAt,
        expiresAt:   new Date(new Date(wp.checkedOutAt).getTime() + this.CHECKOUT_TTL_MS),
      };
    }

    await this.prisma.workingPaper.update({
      where: { id },
      data:  { checkedOutById: user.id, checkedOutAt: now },
    });

    return { success: true, checkedOutById: user.id, checkedOutAt: now };
  }

  async checkin(id: string, user: AuthUser) {
    const wp = await this.findOne(id, user);

    // Only the current holder or a manager can release the lock
    const canRelease =
      wp.checkedOutById === user.id ||
      ([UserRole.CAE, UserRole.AUDIT_MANAGER, UserRole.ADMIN, UserRole.SUPER_ADMIN] as string[]).includes(user.role);

    if (!canRelease) {
      throw new ForbiddenException('Solo el usuario que abrió el papel puede liberarlo');
    }

    await this.prisma.workingPaper.update({
      where: { id },
      data:  { checkedOutById: null, checkedOutAt: null },
    });

    return { success: true };
  }

  // ─── F6.2 Sign-off matrix ─────────────────────────────────────────────────────

  async signOff(
    id: string,
    level: 'prepare' | 'review' | 'signoff',
    user: AuthUser,
  ) {
    const wp = await this.findOne(id, user);

    if (level === 'review' || level === 'signoff') {
      const managerRoles: string[] = [
        UserRole.AUDIT_MANAGER, UserRole.CAE, UserRole.SENIOR_AUDITOR,
        UserRole.ADMIN, UserRole.SUPER_ADMIN,
      ];
      if (!managerRoles.includes(user.role)) {
        throw new ForbiddenException('Solo gerentes o revisores pueden firmar en este nivel');
      }
    }

    if (level === 'signoff') {
      const signOffRoles: string[] = [UserRole.CAE, UserRole.AUDIT_MANAGER, UserRole.ADMIN, UserRole.SUPER_ADMIN];
      if (!signOffRoles.includes(user.role)) {
        throw new ForbiddenException('Solo el CAE o Gerente de Auditoría pueden realizar la firma final');
      }
    }

    const data: Record<string, unknown> =
      level === 'prepare'  ? { preparedById:  user.id, preparedAt:  new Date() } :
      level === 'review'   ? { reviewedById:  user.id, reviewedAt:  new Date() } :
                             { signedOffById: user.id, signedOffAt: new Date() };

    return this.prisma.workingPaper.update({
      where:   { id },
      data:    data as any,
      include: INCLUDE_FULL,
    });
  }

  async getSignOffMatrix(auditId: string, user: AuthUser) {
    await this.assertAuditAccess(auditId, user);
    return this.prisma.workingPaper.findMany({
      where:   { auditId },
      orderBy: [{ indexSection: 'asc' }, { code: 'asc' }],
      select: {
        id: true, code: true, indexSection: true, title: true, status: true, type: true,
        preparedById: true, preparedAt:  true,
        reviewedById: true, reviewedAt:  true,
        signedOffById: true, signedOffAt: true,
        preparedBy:   { select: { id: true, name: true } },
        reviewedBy:   { select: { id: true, name: true } },
        signedOffBy:  { select: { id: true, name: true } },
        qualityScore: true,
        _count: { select: { comments: true } },
      },
    });
  }

  // ─── F6.3 PBC ↔ Workpaper links ──────────────────────────────────────────────

  async getPbcLinks(paperId: string, user: AuthUser) {
    const wp = await this.findOne(paperId, user);
    // Return all PBC requests for the same audit, marking which are linked
    const [linked, allPbc] = await Promise.all([
      this.prisma.pbcPaperLink.findMany({
        where:   { paperId },
        include: {
          pbc: {
            select: {
              id: true, title: true, description: true,
              requestedToEmail: true, status: true, fileUrls: true, submittedAt: true,
            },
          },
        },
      }),
      this.prisma.pbcRequest.findMany({
        where: { auditId: wp.auditId },
        select: {
          id: true, title: true, description: true,
          requestedToEmail: true, status: true, fileUrls: true, submittedAt: true,
        },
      }),
    ]);

    const linkedIds = new Set(linked.map(l => l.pbcId));
    return {
      linkedItems: linked,
      availableItems: allPbc.filter(p => !linkedIds.has(p.id)),
    };
  }

  async linkPbc(paperId: string, pbcId: string, user: AuthUser) {
    await this.findOne(paperId, user);
    // Validate pbc belongs to same org
    const pbc = await this.prisma.pbcRequest.findFirst({
      where: { id: pbcId, audit: { organizationId: user.organizationId } },
    });
    if (!pbc) throw new NotFoundException('Solicitud PBC no encontrada');

    return this.prisma.pbcPaperLink.upsert({
      where:  { pbcId_paperId: { pbcId, paperId } },
      create: { pbcId, paperId, createdById: user.id },
      update: {},
    });
  }

  async unlinkPbc(linkId: string, user: AuthUser) {
    const link = await this.prisma.pbcPaperLink.findUnique({
      where:   { id: linkId },
      include: { paper: { include: { audit: { select: { organizationId: true } } } } },
    });
    if (!link) throw new NotFoundException('Vínculo no encontrado');
    if (link.paper.audit.organizationId !== user.organizationId) throw new ForbiddenException();

    await this.prisma.pbcPaperLink.delete({ where: { id: linkId } });
    return { deleted: true };
  }

  // ─── Master paper consolidation ───────────────────────────────────────────

  /**
   * Trigger AI consolidation of a MASTER paper.
   *
   * 1. Validates wpKind === MASTER.
   * 2. Sets syncStatus = REGENERATING (returned immediately to caller).
   * 3. Discovers source papers:
   *      a) Via explicit PaperLinks (targetId = this paper, isActive = true)
   *      b) Fallback: finds PT-A1, PT-A2, PT-A4 by paperCode in the same audit
   * 4. Emits `paper.consolidate` event — PaperConsolidationService handles it
   *    asynchronously: calls Gemini, updates sections, marks SYNCED.
   */
  async consolidateMasterPaper(id: string, user: AuthUser) {
    const wp = await this.findOne(id, user);

    if (wp.wpKind !== WpKind.MASTER) {
      throw new BadRequestException(
        'Solo los papeles MASTER pueden ser consolidados mediante este endpoint',
      );
    }

    // 1. Set REGENERATING immediately so the UI reacts
    await this.prisma.workingPaper.update({
      where: { id },
      data:  { syncStatus: SyncStatus.REGENERATING },
    });

    // 2a. Collect upstream papers via explicit PaperLinks
    const links = await this.prisma.paperLink.findMany({
      where:   { targetId: id, isActive: true },
      include: {
        source: {
          select: {
            id: true, code: true, title: true, paperCode: true,
            sections: { orderBy: { sortOrder: 'asc' } },
          },
        },
      },
    });

    let sourcePapers = links.map(l => ({
      paperId:   l.source.id,
      paperCode: l.source.paperCode,
      title:     l.source.title,
      sections:  l.source.sections as Array<{
        sectionKey: string; label: string; value: unknown;
        aiHint: string | null; isAutoFilled: boolean; sortOrder: number;
      }>,
    }));

    // 2b. Fallback: auto-discover PT-A1, PT-A2, PT-A4 in the same audit
    if (sourcePapers.length === 0) {
      const discovered = await this.prisma.workingPaper.findMany({
        where: {
          auditId:   wp.auditId,
          paperCode: { in: ['PT-A1', 'PT-A2', 'PT-A4'] },
        },
        include: { sections: { orderBy: { sortOrder: 'asc' } } },
      });
      sourcePapers = discovered.map(p => ({
        paperId:   p.id,
        paperCode: p.paperCode,
        title:     p.title,
        sections:  p.sections as Array<{
          sectionKey: string; label: string; value: unknown;
          aiHint: string | null; isAutoFilled: boolean; sortOrder: number;
        }>,
      }));
    }

    // 3. Emit event — fire-and-forget; PaperConsolidationService handles the AI work
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const auditTitle = String((wp as any).audit?.title ?? 'Sin título');
    this.eventEmitter.emit('paper.consolidate', {
      paperId:    id,
      paperCode:  wp.paperCode,
      auditId:    wp.auditId,
      auditTitle,
      sourceData: sourcePapers,
      // PI.5 — track who triggered the consolidation for version history
      userId:     user.id,
      reason:     wp.syncStatus === 'STALE' ? 'Re-consolidación tras cambios en fuentes' : 'Consolidación inicial',
    });

    return {
      paperId:           id,
      paperCode:         wp.paperCode,
      syncStatus:        SyncStatus.REGENERATING,
      sourcePapersFound: sourcePapers.length,
      message:           sourcePapers.length > 0
        ? `Consolidación IA iniciada con ${sourcePapers.length} fuente(s). El estado cambiará a "Al día" en segundos.`
        : 'Consolidación iniciada sin fuentes vinculadas — se generará contenido base. Vincule PT-A1, PT-A2 y PT-A4 para una consolidación completa.',
    };
  }
}
