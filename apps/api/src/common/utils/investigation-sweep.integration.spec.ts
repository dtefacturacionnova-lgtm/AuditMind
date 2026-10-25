/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'crypto';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

process.env.SUPABASE_URL ??= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'clave-de-prueba';

import { AuditFoldersService } from '../../audit-folders/audit-folders.service';
import { FindingsService } from '../../findings/findings.service';
import { ReportsService } from '../../reports/reports.service';
import { PaperVersionsService } from '../../working-papers/paper-versions.service';
import { PaperLiveService } from '../../working-papers/paper-live.service';
import { PaperQualityService } from '../../working-papers/paper-quality.service';
import { PaperGraphService } from '../../working-papers/paper-graph.service';
import { PaperReferencesService } from '../../working-papers/paper-references.service';
import { RiskTraceService } from '../../working-papers/risk-trace.service';
import { PaperSectionsService } from '../../working-papers/paper-sections.service';
import { WorkingPapersService } from '../../working-papers/working-papers.service';
import { FieldEvidenceService } from '../../working-papers/field-evidence/field-evidence.service';
import { ExcelTemplateEngineService } from '../../working-papers/excel-templates/excel-template-engine.service';
import { CrossAuditLearningService } from '../../working-papers/cross-audit-learning.service';
import { AuditProceduresService } from '../../audit-procedures/audit-procedures.service';
import { TimesheetService } from '../../timesheet/timesheet.service';
import { HoursCloseService } from '../../timesheet/hours-close.service';
import { PlansService } from '../../plans/plans.service';
import { AuditUniverseService } from '../../audit-universe/audit-universe.service';
import { AuditProjectsService } from '../../audit-projects/audit-projects.service';
import { DashboardService } from '../../dashboard/dashboard.service';
import { CommitteeService } from '../../committee/committee.service';
import { EqrService } from '../../qaip/eqr.service';
import { FindingsService as QaipFindingsService } from '../../qaip/findings.service';
import { AiController } from '../../ai/ai.controller';
import { Anexo12Service } from '../../fiscal/anexo12.service';
import { DataSourcesService } from '../../data-sources/data-sources.service';
import { EngagementsService } from '../../portfolio/engagements.service';
import { ClientsService } from '../../portfolio/clients.service';
import { AuditsService } from '../../audits/audits.service';
import { of, lastValueFrom } from 'rxjs';
import { Reflector } from '@nestjs/core';
import { StorageUrlService } from '../storage/storage-url.service';
import { StorageUrlInterceptor } from '../storage/storage-url.interceptor';
import { PerformanceService } from '../../qaip/performance.service';
import { PbcService } from '../../pbc/pbc.service';

/**
 * Modo investigación · barrido de módulos contra un Postgres REAL (docs/seguridad: revisión del 2026-10-25).
 * REGLA: una auditoría en modo investigación solo la ve su equipo, más CAE, ADMIN y SUPER_ADMIN. Todo lo que cuelga de
 * ella hereda la restricción: ni por id directo, ni en listados, ni por rutas indirectas.
 *
 * Cada caso se prueba con cuatro personas de la MISMA organización:
 *   · ajenos al equipo (AUDITOR y AUDIT_MANAGER) → deben ser rechazados (403) o no ver nada;
 *   · integrante del equipo y CAE → la guarda no debe estorbar (si falla por otra razón, que no sea «modo investigación»).
 * Y un control: la misma operación sobre una auditoría NORMAL no se bloquea a nadie.
 *
 * Se omite sola si no hay base de pruebas (misma que la de cobranza):
 *   COLLECTIONS_TEST_DATABASE_URL=postgresql://postgres:test@localhost:54329/cobros_test npx jest investigation-sweep
 */
const URL = process.env.COLLECTIONS_TEST_DATABASE_URL;
const suite = URL ? describe : describe.skip;
jest.setTimeout(120_000);

suite('modo investigación · barrido por módulo (Postgres real)', () => {
  let prisma: PrismaClient;
  let w: World;

  interface World {
    org: { id: string };
    users: Record<'cae' | 'lead' | 'member' | 'outsider' | 'manager', any>;
    inv: { id: string };
    nor: { id: string };
  }

  beforeAll(async () => {
    const sep = (URL as string).includes('?') ? '&' : '?';
    prisma = new PrismaClient({ datasourceUrl: `${URL}${sep}connection_limit=10&pool_timeout=30` });
    await prisma.$connect();
    w = await seedWorld();
  });
  afterAll(async () => { await prisma?.$disconnect(); });

  async function seedWorld(): Promise<World> {
    const tag = `${Date.now().toString(36)}${randomUUID().slice(0, 6)}`;
    const org = await prisma.organization.create({ data: { name: `Org ${tag}`, slug: `org-${tag}` } });
    const mk = async (role: any, name: string) => {
      const u = await prisma.user.create({ data: { organizationId: org.id, supabaseUserId: randomUUID(), email: `${name}-${tag}@t.test`, name, role } });
      return { id: u.id, supabaseUserId: u.supabaseUserId, email: u.email, name: u.name, role: u.role, organizationId: org.id, aiAssistantPersonality: 'ATHENA' };
    };
    const users = {
      cae: await mk('CAE', 'cae'), lead: await mk('AUDITOR', 'lead'), member: await mk('SENIOR_AUDITOR', 'member'),
      outsider: await mk('AUDITOR', 'outsider'), manager: await mk('AUDIT_MANAGER', 'manager'),
    };
    const audit = (title: string, inv: boolean) => prisma.audit.create({
      data: { organizationId: org.id, title, type: 'EXTERNAL', isInvestigationMode: inv, leadAuditorId: users.lead.id },
    });
    const inv = await audit('Investigación reservada', true);
    const nor = await audit('Auditoría normal', false);
    for (const a of [inv, nor]) {
      await prisma.auditTeam.create({ data: { auditId: a.id, userId: users.lead.id, role: 'LEAD' } });
      await prisma.auditTeam.create({ data: { auditId: a.id, userId: users.member.id, role: 'MEMBER' } });
    }
    return { org, users, inv, nor };
  }

  // ── utilidades de afirmación ──────────────────────────────────────────────
  type Call = (u: any) => Promise<unknown>;
  /**
   * «Bloqueado» = 403 de modo investigación, o la respuesta de «no existe en tu organización» (400/404) cuando el dato
   * simplemente no aparece para quien no puede verlo (no revela que existe).
   */
  const isInvestigationDenial = (e: any) =>
    (e instanceof ForbiddenException && /modo investigación/i.test(String(e.message)))
    || ((e instanceof BadRequestException || e instanceof NotFoundException) && /no existe|no encontrad/i.test(String(e.message)));
  const attempt = async (call: Call, u: any) => { try { return { ok: true as const, value: await call(u) }; } catch (e) { return { ok: false as const, error: e as any }; } };

  /** Ajenos al equipo: 403 «modo investigación». */
  async function expectBlocked(label: string, call: Call) {
    for (const who of ['outsider', 'manager'] as const) {
      const r = await attempt(call, w.users[who]);
      if (r.ok) throw new Error(`${label}: ${who} NO fue bloqueado y la operación respondió`);
      if (!isInvestigationDenial(r.error)) throw new Error(`${label}: ${who} falló, pero no por modo investigación → ${r.error?.constructor?.name}: ${r.error?.message}`);
    }
  }
  /** Equipo y CAE: la guarda de investigación no debe estorbar (otro error es tolerable: datos de prueba incompletos). */
  async function expectAllowed(label: string, call: Call) {
    for (const who of ['member', 'lead', 'cae'] as const) {
      const r = await attempt(call, w.users[who]);
      if (!r.ok && isInvestigationDenial(r.error)) throw new Error(`${label}: ${who} fue bloqueado por modo investigación`);
    }
  }
  /** Control: sobre una auditoría normal nadie es bloqueado por modo investigación. */
  async function expectOpenOnNormal(label: string, call: Call) {
    for (const who of ['outsider', 'manager'] as const) {
      const r = await attempt(call, w.users[who]);
      if (!r.ok && isInvestigationDenial(r.error)) throw new Error(`${label} (auditoría normal): ${who} fue bloqueado por modo investigación`);
    }
  }
  async function check(label: string, onInv: Call, onNormal?: Call) {
    await expectBlocked(label, onInv);
    await expectAllowed(label, onInv);
    if (onNormal) await expectOpenOnNormal(label, onNormal);
  }

  /** Listados: quien no ve la investigación no debe encontrar su registro; equipo y CAE sí; en la auditoría normal, todos. */
  async function checkListing(label: string, call: Call, idsOf: (res: any) => string[], invId: string, norId: string) {
    for (const who of ['outsider', 'manager'] as const) {
      const r = await attempt(call, w.users[who]);
      if (r.ok && idsOf(r.value).includes(invId)) throw new Error(`${label}: ${who} ve el registro de la investigación en el listado`);
      if (r.ok && norId && !idsOf(r.value).includes(norId)) throw new Error(`${label}: ${who} NO ve el registro de la auditoría normal (el filtro es demasiado estricto)`);
    }
    for (const who of ['member', 'lead', 'cae'] as const) {
      const r = await attempt(call, w.users[who]);
      if (!r.ok) throw new Error(`${label}: ${who} recibió un error (${r.error?.message})`);
      if (!idsOf(r.value).includes(invId)) throw new Error(`${label}: ${who} NO ve el registro de la investigación en el listado`);
    }
  }

  // ═══ Lote 1 · Expediente (audit-folders) ══════════════════════════════════
  describe('lote 1 · expediente', () => {
    let svc: AuditFoldersService;
    const seeded: Record<string, any> = {};
    beforeAll(async () => {
      svc = new AuditFoldersService(prisma as any, {} as any);
      for (const [k, a] of [['inv', w.inv], ['nor', w.nor]] as const) {
        const phase = await prisma.auditPhase.create({ data: { auditId: a.id, phaseType: 'PLANNING', name: 'Planificación', order: 0 } });
        const folder = await prisma.auditFolder.create({ data: { auditId: a.id, ref: 'A-1', name: 'Carpeta', phaseId: phase.id } });
        const folder2 = await prisma.auditFolder.create({ data: { auditId: a.id, ref: 'A-2', name: 'Carpeta 2', phaseId: phase.id } });
        const paper = await prisma.workingPaper.create({ data: { auditId: a.id, code: 'PT-01', indexSection: 'A', title: 'Papel', type: 'PLANNING_UNDERSTANDING' as any, content: { secreto: 'contenido reservado' } as any } });
        seeded[k] = { phase, folder, folder2, paper };
      }
    });

    it('lee el expediente y las rutas por auditoría: ajenos 403; equipo y CAE sí', async () => {
      const s = seeded.inv; const n = seeded.nor;
      await check('getExpediente', (u) => svc.getExpediente(w.inv.id, u), (u) => svc.getExpediente(w.nor.id, u));
      await check('getOrphanPapers', (u) => svc.getOrphanPapers(w.inv.id, u), (u) => svc.getOrphanPapers(w.nor.id, u));
      await check('createPhase', (u) => svc.createPhase(w.inv.id, { phaseType: 'FIELDWORK' as any, name: 'x' } as any, u), (u) => svc.createPhase(w.nor.id, { phaseType: 'FIELDWORK' as any, name: 'x' } as any, u));
      await check('createFolder', (u) => svc.createFolder(w.inv.id, { ref: 'Z-1', name: 'x', phaseId: s.phase.id } as any, u), (u) => svc.createFolder(w.nor.id, { ref: 'Z-1', name: 'x', phaseId: n.phase.id } as any, u));
      await check('initializeFromTemplate', (u) => svc.initializeFromTemplate(w.inv.id, u), (u) => svc.initializeFromTemplate(w.nor.id, u));
      await check('createFilePaper', (u) => svc.createFilePaper(w.inv.id, s.folder.id, { title: 't', fileUrl: 'u', originalFilename: 'f.pdf', mimeType: 'application/pdf' } as any, u), (u) => svc.createFilePaper(w.nor.id, n.folder.id, { title: 't', fileUrl: 'u', originalFilename: 'f.pdf', mimeType: 'application/pdf' } as any, u));
      await check('uploadAndRegisterFile', (u) => svc.uploadAndRegisterFile(w.inv.id, s.folder.id, { originalname: 'f.pdf', buffer: Buffer.from('x'), mimetype: 'application/pdf', size: 1 } as any, 't', undefined, u), (u) => svc.uploadAndRegisterFile(w.nor.id, n.folder.id, { originalname: 'f.pdf', buffer: Buffer.from('x'), mimetype: 'application/pdf', size: 1 } as any, 't', undefined, u));
    });

    it('rutas por id de fase, carpeta o papel (el :auditId de la ruta se ignora): ajenos 403; equipo y CAE sí', async () => {
      const s = seeded.inv; const n = seeded.nor;
      await check('updatePhase', (u) => svc.updatePhase(s.phase.id, { name: 'otro' } as any, u), (u) => svc.updatePhase(n.phase.id, { name: 'otro' } as any, u));
      await check('signOffPhase', (u) => svc.signOffPhase(s.phase.id, u), (u) => svc.signOffPhase(n.phase.id, u));
      await check('updateFolder', (u) => svc.updateFolder(s.folder.id, { name: 'otro' } as any, u), (u) => svc.updateFolder(n.folder.id, { name: 'otro' } as any, u));
      await check('reorderFolders', (u) => svc.reorderFolders({ items: [{ id: s.folder.id, sortOrder: 1 }, { id: s.folder2.id, sortOrder: 2 }] } as any, u), (u) => svc.reorderFolders({ items: [{ id: n.folder.id, sortOrder: 1 }] } as any, u));
      await check('assignPaperToFolder', (u) => svc.assignPaperToFolder(s.paper.id, s.folder.id, u), (u) => svc.assignPaperToFolder(n.paper.id, n.folder.id, u));
      // operación destructiva: cada intento borra su propia carpeta nueva
      const fresh = (auditId: string) => prisma.auditFolder.create({ data: { auditId, ref: `D-${randomUUID().slice(0, 6)}`, name: 'Para borrar' } });
      await check('deleteFolder', async (u) => svc.deleteFolder((await fresh(w.inv.id)).id, u), async (u) => svc.deleteFolder((await fresh(w.nor.id)).id, u));
    });

    it('asignar un papel ya no devuelve su contenido (antes devolvía la fila completa)', async () => {
      const r: any = await svc.assignPaperToFolder(seeded.nor.paper.id, seeded.nor.folder.id, w.users.member);
      expect(Object.keys(r).sort()).toEqual(['auditId', 'code', 'folderId', 'id', 'status', 'title']);
      expect(JSON.stringify(r)).not.toContain('contenido reservado');
    });
  });

  // ═══ Lote 2 · Hallazgos ═══════════════════════════════════════════════════
  describe('lote 2 · hallazgos', () => {
    let svc: FindingsService;
    const seeded: Record<string, any> = {};
    const base = (auditId: string) => ({
      auditId, organizationId: w.org.id, title: 'Falta de conciliaciones bancarias', condition: 'c', criteria: 'k', cause: 'z', effect: 'e', risk: 'r',
      recommendation: 'rec', severity: 'HIGH' as const, isRecurring: true, status: 'IN_PROGRESS' as const, dueDate: new Date('2020-01-01'),
    });
    beforeAll(async () => {
      svc = new FindingsService(prisma as any);
      for (const [k, a] of [['inv', w.inv], ['nor', w.nor]] as const) {
        const finding = await prisma.finding.create({ data: base(a.id) });
        const action = await prisma.findingAction.create({ data: { findingId: finding.id, organizationId: w.org.id, description: 'plan', dueDate: new Date('2026-12-01') } });
        seeded[k] = { finding, action };
      }
    });
    const fresh = (auditId: string, status: any = 'DRAFT') => prisma.finding.create({ data: { ...base(auditId), status, isRecurring: false } });

    it('por id: leer, editar, enviar, aprobar, rechazar, cerrar, comentar y abrir acciones', async () => {
      const s = seeded.inv.finding; const n = seeded.nor.finding;
      await check('findOne', (u) => svc.findOne(s.id, u), (u) => svc.findOne(n.id, u));
      await check('update', (u) => svc.update(s.id, { title: 'otro' } as any, u), (u) => svc.update(n.id, { title: 'otro' } as any, u));
      await check('submitForReview', (u) => svc.submitForReview(s.id, u), (u) => svc.submitForReview(n.id, u));
      await check('approve', (u) => svc.approve(s.id, u), (u) => svc.approve(n.id, u));
      await check('reject', (u) => svc.reject(s.id, { reason: 'no' } as any, u), (u) => svc.reject(n.id, { reason: 'no' } as any, u));
      await check('assignResponsible', (u) => svc.assignResponsible(s.id, { responsibleId: w.users.lead.id, dueDate: '2026-12-01' } as any, u), (u) => svc.assignResponsible(n.id, { responsibleId: w.users.lead.id, dueDate: '2026-12-01' } as any, u));
      await check('createAction', (u) => svc.createAction(s.id, { description: 'x', dueDate: '2026-12-01' } as any, u), (u) => svc.createAction(n.id, { description: 'x', dueDate: '2026-12-01' } as any, u));
      await check('addComment', (u) => svc.addComment(s.id, 'texto', false, u), (u) => svc.addComment(n.id, 'texto', false, u));
      await check('close', async (u) => svc.close((await fresh(w.inv.id)).id, u), async (u) => svc.close((await fresh(w.nor.id)).id, u));
    });

    it('acción de seguimiento por su propio id', async () => {
      await check('updateAction', (u) => svc.updateAction(seeded.inv.action.id, { progressPct: 10 } as any, u), (u) => svc.updateAction(seeded.nor.action.id, { progressPct: 10 } as any, u));
    });

    it('por auditoría: listar, resumir y crear', async () => {
      const dto = (auditId: string) => ({ auditId, title: 'Nuevo', condition: 'c', criteria: 'k', cause: 'z', effect: 'e', severity: 'LOW' }) as any;
      await check('findAllForAudit', (u) => svc.findAllForAudit(w.inv.id, u), (u) => svc.findAllForAudit(w.nor.id, u));
      await check('getSummaryByAudit', (u) => svc.getSummaryByAudit(w.inv.id, u), (u) => svc.getSummaryByAudit(w.nor.id, u));
      await check('create', (u) => svc.create(dto(w.inv.id), u), (u) => svc.create(dto(w.nor.id), u));
    });

    it('listados de la organización: una investigación ajena no aparece (ni en pendientes ni en recurrentes)', async () => {
      const ids = (rows: any[]) => rows.map((r) => r.id);
      const inv = seeded.inv.finding.id; const nor = seeded.nor.finding.id;
      await checkListing('findAllForOrg', (u) => svc.findAllForOrg(u, { limit: 100 }), (r) => ids(r.data), inv, nor);
      await checkListing('getOverdueByOrg', (u) => svc.getOverdueByOrg(u), ids, inv, nor);
      await checkListing('getRecurringFindings', (u) => svc.getRecurringFindings(u), ids, inv, nor);
    });

    it('la recurrencia no busca entre investigaciones ajenas (no es un oráculo de títulos)', async () => {
      // el hallazgo de la investigación se llama «Falta de conciliaciones bancarias»: la palabra clave es «conciliaciones»
      const dto = (auditId: string) => ({ auditId, title: 'Sin conciliaciones mensuales', condition: 'c', criteria: 'k', cause: 'z', effect: 'e', severity: 'LOW' }) as any;
      // el de la investigación es el MÁS RECIENTE con esa palabra: sin el filtro, sería el elegido
      const newestInInvestigation = await prisma.finding.create({ data: { ...base(w.inv.id), title: 'Conciliaciones sin revisar', isRecurring: false } });
      const leak: any = await svc.create(dto(w.nor.id), w.users.outsider);
      const row = await prisma.finding.findUniqueOrThrow({ where: { id: leak.id } });
      // coincide con el de la auditoría normal (visible), nunca con el de la investigación
      expect(row.previousFindingId).not.toBe(newestInInvestigation.id);
      expect(row.previousFindingId).not.toBe(seeded.inv.finding.id);
      // ...y sí enlaza con un hallazgo de la auditoría normal (otras pruebas de este bloque crean más con el mismo título)
      expect(row.previousFindingId).toBeTruthy();
      const prev = await prisma.finding.findUniqueOrThrow({ where: { id: row.previousFindingId as string } });
      expect(prev.auditId).toBe(w.nor.id);
    });

    it('el responsable de una investigación debe ser alguien que ya la ve', async () => {
      const approved = await fresh(w.inv.id, 'APPROVED');
      await expect(svc.assignResponsible(approved.id, { responsibleId: w.users.outsider.id, dueDate: '2026-12-01' } as any, w.users.lead))
        .rejects.toThrow(/solo puede ser responsable alguien del equipo/);
      await expect(svc.createAction(seeded.inv.finding.id, { description: 'x', dueDate: '2026-12-01', responsibleId: w.users.outsider.id } as any, w.users.lead))
        .rejects.toThrow(/solo puede ser responsable alguien del equipo/);
      // un integrante del equipo y un CAE sí pueden serlo
      await expect(svc.createAction(seeded.inv.finding.id, { description: 'x', dueDate: '2026-12-01', responsibleId: w.users.member.id } as any, w.users.lead)).resolves.toBeDefined();
      await expect(svc.createAction(seeded.inv.finding.id, { description: 'x', dueDate: '2026-12-01', responsibleId: w.users.cae.id } as any, w.users.lead)).resolves.toBeDefined();
    });
  });

  // ═══ Lote 3 · Informes ════════════════════════════════════════════════════
  describe('lote 3 · informes', () => {
    let svc: ReportsService;
    const seeded: Record<string, any> = {};
    beforeAll(async () => {
      svc = new ReportsService(prisma as any, { generateBranded: async () => Buffer.from('pdf') } as any);
      for (const [k, a] of [['inv', w.inv], ['nor', w.nor]] as const) {
        await prisma.audit.update({ where: { id: a.id }, data: { status: 'IN_PROGRESS' } });
        const finding = await prisma.finding.create({ data: { auditId: a.id, organizationId: w.org.id, title: 'Hallazgo del informe', condition: 'c', criteria: 'k', cause: 'z', effect: 'e', risk: 'r', recommendation: 'rec', severity: 'HIGH' } });
        seeded[k] = { finding };
      }
    });

    it('informe completo de la auditoría, en JSON y en PDF', async () => {
      await check('getAuditReport', (u) => svc.getAuditReport(w.inv.id, u), (u) => svc.getAuditReport(w.nor.id, u));
      await check('generateAuditPdf', (u) => svc.generateAuditPdf(w.inv.id, u), (u) => svc.generateAuditPdf(w.nor.id, u));
    });

    it('PDF de un hallazgo por su id', async () => {
      await check('generateFindingPdf', (u) => svc.generateFindingPdf(seeded.inv.finding.id, u), (u) => svc.generateFindingPdf(seeded.nor.finding.id, u));
    });

    it('la lista de informes disponibles no incluye investigaciones ajenas', async () => {
      await checkListing('listAvailableReports', (u) => svc.listAvailableReports(u), (r) => r.items.map((i: any) => i.id), w.inv.id, w.nor.id);
    });
  });

  // ═══ Lotes 4 y 5 · Papeles de trabajo: lo que cuelga de un papel (por su id) ═══════════════════════════════
  describe('lotes 4 y 5 · papeles de trabajo', () => {
    const emitted: any[] = [];
    let versions: PaperVersionsService; let live: PaperLiveService; let quality: PaperQualityService;
    let graph: PaperGraphService; let refs: PaperReferencesService; let papers: WorkingPapersService;
    let evidence: FieldEvidenceService; let excel: ExcelTemplateEngineService;
    const seeded: Record<string, any> = {};
    const noKeys = { get: (_k: string, d?: unknown) => d ?? '' } as any;

    beforeAll(async () => {
      versions = new PaperVersionsService(prisma as any);
      live = new PaperLiveService(prisma as any);
      quality = new PaperQualityService(prisma as any, noKeys);
      graph = new PaperGraphService(prisma as any, { emit: (...a: any[]) => emitted.push(a), emitAsync: async () => [] } as any);
      refs = new PaperReferencesService(prisma as any);
      papers = new WorkingPapersService(prisma as any, graph as any, { emit: (...a: any[]) => emitted.push(a) } as any, versions as any, {} as any, {} as any, {} as any);
      evidence = new FieldEvidenceService(prisma as any, {} as any, refs as any, {} as any);
      const sections = new PaperSectionsService(prisma as any, graph as any, noKeys, {} as any, {} as any);
      excel = new ExcelTemplateEngineService(prisma as any, sections as any, { get: (k: string, d?: unknown) => (k === 'EXCEL_MANIFEST_SECRET' ? 'secreto-de-prueba' : d ?? '') } as any);

      for (const [k, a] of [['inv', w.inv], ['nor', w.nor]] as const) {
        const mk = (code: string, paperCode?: string) => prisma.workingPaper.create({
          data: { auditId: a.id, code, indexSection: 'A', title: `Papel ${code}`, type: 'PLANNING_UNDERSTANDING' as any, paperCode, content: { secreto: 'reservado' } as any },
        });
        const paper = await mk(`L4-${k}-1`);
        const paper2 = await mk(`L4-${k}-2`);
        const master = await prisma.workingPaper.create({
          data: { auditId: a.id, code: `L4-${k}-M`, indexSection: 'A', title: 'Maestro', type: 'PLANNING_UNDERSTANDING' as any, wpKind: 'MASTER' as any, paperCode: 'PT-A9' },
        });
        const version = await prisma.workingPaperVersion.create({ data: { paperId: paper.id, version: 1, content: { secreto: 'reservado' } as any, changedBy: w.users.lead.id } });
        const tick = await prisma.tickMarkEntry.create({ data: { paperId: paper.id, fieldPath: 'f', tickMark: 'VERIFIED', createdBy: w.users.lead.id } });
        const comment = await prisma.workingPaperComment.create({ data: { paperId: paper.id, authorId: w.users.lead.id, content: 'texto reservado' } });
        const pbc = await prisma.pbcRequest.create({
          data: { auditId: a.id, organizationId: w.org.id, title: `Solicitud ${k}`, description: 'd', requestedToEmail: `pbc-${k}@t.test`, createdById: w.users.lead.id, dueDate: new Date('2030-01-01') },
        });
        const pbcLink = await prisma.pbcPaperLink.create({ data: { pbcId: pbc.id, paperId: paper.id, createdById: w.users.lead.id } });
        seeded[k] = { paper, paper2, master, version, tick, comment, pbc, pbcLink };
      }
    });

    it('lote 4 · versiones del papel: listar, leer, comparar y restaurar', async () => {
      const s = seeded.inv; const n = seeded.nor;
      await check('listVersions', (u) => versions.listVersions(s.paper.id, u), (u) => versions.listVersions(n.paper.id, u));
      await check('getVersion', (u) => versions.getVersion(s.paper.id, s.version.id, u), (u) => versions.getVersion(n.paper.id, n.version.id, u));
      await check('compareVersions', (u) => versions.compareVersions(s.paper.id, 1, 0, u), (u) => versions.compareVersions(n.paper.id, 1, 0, u));
      await check('restoreVersion', (u) => versions.restoreVersion(s.paper.id, s.version.id, 'prueba', u), (u) => versions.restoreVersion(n.paper.id, n.version.id, 'prueba', u));
    });

    it('lote 4 · evidencia de campo del papel (transcripciones, citas, audio y video)', async () => {
      const s = seeded.inv; const n = seeded.nor;
      await check('evidencia.listar', (u) => evidence.listar(s.paper.id, u, true), (u) => evidence.listar(n.paper.id, u, true));
      const freshEv = (auditId: string, paperId: string) => prisma.fieldEvidence.create({
        data: { auditId, paperId, sectionKey: 'S1', kind: 'TEXT_NOTE' as any, sha256: randomUUID().replace(/-/g, ''), textoOriginal: 'transcripción reservada', capturedById: w.users.lead.id, capturedByName: 'lead', capturedAt: new Date() },
      });
      await check('evidencia.obtenerUno', async (u) => evidence.obtenerUno(s.paper.id, (await freshEv(w.inv.id, s.paper.id)).id, u), async (u) => evidence.obtenerUno(n.paper.id, (await freshEv(w.nor.id, n.paper.id)).id, u));
      await check('evidencia.eliminar', async (u) => evidence.eliminar(s.paper.id, (await freshEv(w.inv.id, s.paper.id)).id, u), async (u) => evidence.eliminar(n.paper.id, (await freshEv(w.nor.id, n.paper.id)).id, u));
    });

    it('lote 4 · plantillas Excel (generar y leer la hoja genérica)', async () => {
      const s = seeded.inv; const n = seeded.nor;
      await check('excel.generarGenerica', (u) => excel.generarGenerica(s.paper.id, ['S1'], u), (u) => excel.generarGenerica(n.paper.id, ['S1'], u));
      await check('excel.leerGenerica', (u) => excel.leerGenerica(s.paper.id, u, Buffer.from('x')), (u) => excel.leerGenerica(n.paper.id, u, Buffer.from('x')));
    });

    it('lote 4 · estadísticas en vivo y calidad del papel', async () => {
      const s = seeded.inv; const n = seeded.nor;
      await check('getLiveStats', (u) => live.getLiveStats(s.paper.id, u), (u) => live.getLiveStats(n.paper.id, u));
      await check('getLiveStatsByAuditId', (u) => live.getLiveStatsByAuditId(w.inv.id, u), (u) => live.getLiveStatsByAuditId(w.nor.id, u));
      await check('runQualityCheck', (u) => quality.runQualityCheck(s.paper.id, u), (u) => quality.runQualityCheck(n.paper.id, u));
    });

    it('lote 4 · cuentas del balance de comprobación', async () => {
      await check('getTbAccountsForPaper', (u) => papers.getTbAccountsForPaper(seeded.inv.paper.id, u), (u) => papers.getTbAccountsForPaper(seeded.nor.paper.id, u));
    });

    it('lote 5 · marcas, comentarios y vínculos PBC por su propio id (antes solo se miraba la organización)', async () => {
      const s = seeded.inv; const n = seeded.nor;
      await check('getPbcLinks', (u) => papers.getPbcLinks(s.paper.id, u), (u) => papers.getPbcLinks(n.paper.id, u));
      // destructivas: cada intento crea y borra lo suyo
      const freshTick = (paperId: string) => prisma.tickMarkEntry.create({ data: { paperId, fieldPath: 'f2', tickMark: 'FOOTED', createdBy: w.users.lead.id } });
      const freshComment = (paperId: string) => prisma.workingPaperComment.create({ data: { paperId, authorId: w.users.lead.id, content: 'otro' } });
      const freshLink = async (auditId: string, paperId: string) => {
        const pbc = await prisma.pbcRequest.create({ data: { auditId, organizationId: w.org.id, title: 'x', description: 'd', requestedToEmail: 'x@t.test', createdById: w.users.lead.id, dueDate: new Date('2030-01-01') } });
        return prisma.pbcPaperLink.create({ data: { pbcId: pbc.id, paperId, createdById: w.users.lead.id } });
      };
      await check('removeTickMarkEntry', async (u) => papers.removeTickMarkEntry((await freshTick(s.paper.id)).id, u), async (u) => papers.removeTickMarkEntry((await freshTick(n.paper.id)).id, u));
      await check('resolveComment', async (u) => papers.resolveComment((await freshComment(s.paper.id)).id, u), async (u) => papers.resolveComment((await freshComment(n.paper.id)).id, u));
      await check('unlinkPbc', async (u) => papers.unlinkPbc((await freshLink(w.inv.id, s.paper.id)).id, u), async (u) => papers.unlinkPbc((await freshLink(w.nor.id, n.paper.id)).id, u));
    });

    it('lote 5 · una solicitud PBC solo se vincula a un papel de SU auditoría (nadie, ni el CAE, la lleva a otra)', async () => {
      const s = seeded.inv; const n = seeded.nor;
      for (const who of ['outsider', 'manager', 'member', 'lead', 'cae'] as const) {
        await expect(papers.linkPbc(n.paper.id, s.pbc.id, w.users[who])).rejects.toThrow(/no encontrada/i);
        await expect(papers.linkPbcToRow(n.paper.id, 'S1', 'r1', s.pbc.id, w.users[who])).rejects.toThrow(/no encontrada/i);
      }
      // el vínculo indebido no quedó creado, y el listado del papel normal no devuelve datos de la investigación
      expect(await prisma.pbcPaperLink.count({ where: { paperId: n.paper.id, pbcId: s.pbc.id } })).toBe(0);
      const listing: any = await papers.getPbcLinks(n.paper.id, w.users.outsider);
      expect(JSON.stringify(listing)).not.toContain(s.pbc.requestedToEmail);
      // el vínculo legítimo (misma auditoría) sí funciona
      await expect(papers.linkPbc(n.paper.id, n.pbc.id, w.users.outsider)).resolves.toBeDefined();
      await expect(papers.linkPbc(s.paper.id, s.pbc.id, w.users.member)).resolves.toBeDefined();
    });

    it('lote 5 · grafo de papeles: leer, vincular y que el vínculo sea de la misma auditoría', async () => {
      const s = seeded.inv; const n = seeded.nor;
      await check('getAuditGraph', (u) => graph.getAuditGraph(w.inv.id, u), (u) => graph.getAuditGraph(w.nor.id, u));
      await check('getGraphForPaper', (u) => graph.getGraphForPaper(s.paper.id, u), (u) => graph.getGraphForPaper(n.paper.id, u));
      const dto = (sourceId: string) => ({ sourceId, sourceField: 'S1.a', targetField: 'S1.b' }) as any;
      await check('createLink', (u) => graph.createLink(s.paper2.id, dto(s.paper.id), u), (u) => graph.createLink(n.paper2.id, dto(n.paper.id), u));
      // entre auditorías distintas: ni siquiera un CAE (que ve ambas) puede unirlas
      for (const who of ['member', 'lead', 'cae'] as const) {
        await expect(graph.createLink(n.paper2.id, dto(s.paper.id), w.users[who])).rejects.toThrow(/misma auditoría/);
        await expect(graph.createLink(s.paper2.id, dto(n.paper.id), w.users[who])).rejects.toThrow(/misma auditoría/);
      }
    });

    it('lote 5 · referencias @mención: índice, crear, leer y que sean de la misma auditoría', async () => {
      const s = seeded.inv; const n = seeded.nor;
      await check('getMentionIndex', (u) => refs.getMentionIndex(w.inv.id, u), (u) => refs.getMentionIndex(w.nor.id, u));
      await check('getReferencesForPaper', (u) => refs.getReferencesForPaper(s.paper.id, u), (u) => refs.getReferencesForPaper(n.paper.id, u));
      const dto = (targetPaperId: string) => ({ sourceSectionKey: 'S1', targetPaperId }) as any;
      await check('createReference', (u) => refs.createReference(s.paper.id, dto(s.paper2.id), u), (u) => refs.createReference(n.paper.id, dto(n.paper2.id), u));
      for (const who of ['member', 'lead', 'cae'] as const) {
        await expect(refs.createReference(n.paper.id, dto(s.paper.id), w.users[who])).rejects.toThrow(/misma auditoría/);
        await expect(refs.createReference(s.paper.id, dto(n.paper.id), w.users[who])).rejects.toThrow(/misma auditoría/);
      }
    });

    it('lote 5 · consolidar un papel maestro no copia el contenido de papeles de otra auditoría', async () => {
      const s = seeded.inv; const n = seeded.nor;
      // vínculo preexistente (anterior a la regla) desde un papel de la investigación hacia el maestro de la auditoría normal
      await prisma.paperLink.create({ data: { sourceId: s.paper.id, targetId: n.master.id, sourceField: 'S1.a', targetField: 'S1.b' } });
      await prisma.paperLink.create({ data: { sourceId: n.paper.id, targetId: n.master.id, sourceField: 'S1.a', targetField: 'S1.c' } });
      emitted.length = 0;
      const r: any = await papers.consolidateMasterPaper(n.master.id, w.users.outsider);
      const ev = emitted.find((e) => e[0] === 'paper.consolidate');
      const sourceIds = (ev?.[1]?.sourceData ?? []).map((x: any) => x.paperId);
      expect(sourceIds).toContain(n.paper.id);
      expect(sourceIds).not.toContain(s.paper.id);
      expect(r.sourcePapersFound).toBe(sourceIds.length);
    });
  });

  // ═══ Lote 6 · Trazabilidad de riesgos, materialidad/muestreo por auditoría y aprendizaje entre auditorías ═══
  describe('lote 6 · trazabilidad, materialidad y aprendizaje entre auditorías', () => {
    let trace: RiskTraceService; let sections: PaperSectionsService; let learning: CrossAuditLearningService;
    const noKeys = { get: (_k: string, d?: unknown) => d ?? '' } as any;
    beforeAll(() => {
      trace = new RiskTraceService(prisma as any);
      sections = new PaperSectionsService(prisma as any, {} as any, noKeys, {} as any, {} as any);
      learning = new CrossAuditLearningService(prisma as any, noKeys);
    });

    it('trazabilidad de riesgos: cadena, resumen de control interno y datos del informe integrado', async () => {
      await check('getTrace', (u) => trace.getTrace(w.inv.id, u, {}), (u) => trace.getTrace(w.nor.id, u, {}));
      await check('getSummary', (u) => trace.getSummary(w.inv.id, u), (u) => trace.getSummary(w.nor.id, u));
      await check('getIntegratedReportData', (u) => trace.getIntegratedReportData(w.inv.id, u), (u) => trace.getIntegratedReportData(w.nor.id, u));
    });

    it('materialidad y ejecución de muestreo por id de auditoría (antes bastaba con que la auditoría tuviera algún papel)', async () => {
      await check('getMaterialidadByAudit', (u) => sections.getMaterialidadByAudit(w.inv.id, u), (u) => sections.getMaterialidadByAudit(w.nor.id, u));
      await check('getSamplingExecutionByAudit', (u) => sections.getSamplingExecutionByAudit(w.inv.id, u), (u) => sections.getSamplingExecutionByAudit(w.nor.id, u));
    });

    it('sugerencias entre auditorías: el destino debe ser visible y el historial no incluye investigaciones ajenas', async () => {
      await check('generateSuggestions', (u) => learning.generateSuggestions(w.inv.id, u), (u) => learning.generateSuggestions(w.nor.id, u));
      // la auditoría normal toma como historial las demás del mismo tipo: la investigación solo cuenta para quien la ve
      for (const who of ['outsider', 'manager'] as const) {
        const r = await learning.generateSuggestions(w.nor.id, w.users[who]);
        expect(r.basedOnAudits).toBe(0);
        expect(r.totalFindings).toBe(0);
      }
      for (const who of ['member', 'lead', 'cae'] as const) {
        const r = await learning.generateSuggestions(w.nor.id, w.users[who]);
        expect(r.basedOnAudits).toBe(1);
        expect(r.totalFindings).toBeGreaterThan(0);
      }
    });
  });

  // ═══ Lote 7 · Procedimientos de auditoría (sección → procedimiento → actividad) ═══════════════════════════
  describe('lote 7 · procedimientos de auditoría', () => {
    let svc: AuditProceduresService;
    const seeded: Record<string, any> = {};
    beforeAll(async () => {
      svc = new AuditProceduresService(prisma as any, { get: (_k: string, d?: unknown) => d ?? '' } as any);
      for (const [k, a] of [['inv', w.inv], ['nor', w.nor]] as const) {
        const paper = await prisma.workingPaper.create({ data: { auditId: a.id, code: `L7-${k}`, indexSection: 'A', title: 'Papel', type: 'PLANNING_UNDERSTANDING' as any } });
        const section = await prisma.paperSection.create({ data: { paperId: paper.id, sectionKey: 'S1', label: 'Procedimientos' } });
        const procedure = await prisma.auditProcedure.create({ data: { sectionId: section.id, refNumber: 'P-1', description: 'Procedimiento reservado' } });
        const step = await prisma.auditStep.create({ data: { procedureId: procedure.id, refNumber: 'P-1-A', description: 'Actividad reservada' } });
        seeded[k] = { section, procedure, step };
      }
    });
    const freshProc = (sectionId: string) => prisma.auditProcedure.create({ data: { sectionId, refNumber: `P-${randomUUID().slice(0, 4)}`, description: 'para borrar' } });
    const freshStep = (procedureId: string) => prisma.auditStep.create({ data: { procedureId, refNumber: `A-${randomUUID().slice(0, 4)}`, description: 'para borrar' } });

    it('por sección: leer, crear, listar papeles y riesgos, y sugerir', async () => {
      const s = seeded.inv; const n = seeded.nor;
      await check('getProcedures', (u) => svc.getProcedures(s.section.id, u), (u) => svc.getProcedures(n.section.id, u));
      await check('createProcedure', (u) => svc.createProcedure(s.section.id, { refNumber: 'N-1', description: 'nuevo' }, u), (u) => svc.createProcedure(n.section.id, { refNumber: 'N-1', description: 'nuevo' }, u));
      await check('getAuditPapersForSection', (u) => svc.getAuditPapersForSection(s.section.id, u), (u) => svc.getAuditPapersForSection(n.section.id, u));
      await check('getAuditRisksForSection', (u) => svc.getAuditRisksForSection(s.section.id, u), (u) => svc.getAuditRisksForSection(n.section.id, u));
      await check('suggestAndCreateProcedures', (u) => svc.suggestAndCreateProcedures(s.section.id, u), (u) => svc.suggestAndCreateProcedures(n.section.id, u));
    });

    it('por procedimiento: editar, borrar y crear actividades', async () => {
      const s = seeded.inv; const n = seeded.nor;
      await check('updateProcedure', (u) => svc.updateProcedure(s.procedure.id, { description: 'otro' }, u), (u) => svc.updateProcedure(n.procedure.id, { description: 'otro' }, u));
      await check('createStep', (u) => svc.createStep(s.procedure.id, { refNumber: 'N-A', description: 'nueva' }, u), (u) => svc.createStep(n.procedure.id, { refNumber: 'N-A', description: 'nueva' }, u));
      await check('deleteProcedure', async (u) => svc.deleteProcedure((await freshProc(s.section.id)).id, u), async (u) => svc.deleteProcedure((await freshProc(n.section.id)).id, u));
    });

    it('por actividad: editar, borrar y evidencia', async () => {
      const s = seeded.inv; const n = seeded.nor;
      await check('updateStep', (u) => svc.updateStep(s.step.id, { description: 'otra' }, u), (u) => svc.updateStep(n.step.id, { description: 'otra' }, u));
      await check('deleteStep', async (u) => svc.deleteStep((await freshStep(s.procedure.id)).id, u), async (u) => svc.deleteStep((await freshStep(n.procedure.id)).id, u));
      const freshEvidence = (stepId: string) => prisma.stepEvidence.create({ data: { stepId, fileName: 'x.pdf', storageKey: `procedures/steps/${stepId}/x.pdf`, mimeType: 'application/pdf', size: 1, uploadedByName: 'lead', uploadedById: w.users.lead.id } });
      await expectBlocked('deleteEvidence', async (u) => svc.deleteEvidence((await freshEvidence(s.step.id)).id, s.step.id, u));
    });
  });

  // ═══ Lote 8 · Horas (captura, reporte, cierre y ajustes) ═══════════════════════════════════════════════
  describe('lote 8 · horas', () => {
    let ts: TimesheetService; let hc: HoursCloseService;
    const seeded: Record<string, any> = {};
    let day = 0;
    const nextDay = () => `2030-03-${String(1 + (day++ % 27)).padStart(2, '0')}`;
    const entryDto = (auditId: string) => ({ workDate: nextDay(), hours: 1, description: 'revisión de saldos', category: 'CLIENT_BILLABLE' as any, auditId });
    const mkOwn = (userId: string, auditId: string, extra: any = {}) => prisma.timeEntry.create({
      data: { organizationId: w.org.id, userId, auditId, workDate: new Date('2028-05-10'), hours: 2, category: 'CLIENT_BILLABLE' as any, description: 'entrevista con el gerente de compras', ...extra },
    });

    beforeAll(async () => {
      ts = new TimesheetService(prisma as any);
      hc = new HoursCloseService(prisma as any, {} as any);
      for (const [k, a] of [['inv', w.inv], ['nor', w.nor]] as const) seeded[k] = { entry: await mkOwn(w.users.lead.id, a.id) };
    });

    it('registrar horas en un encargo: solo quien lo ve (antes bastaba con que fuera de la organización)', async () => {
      await check('createEntry', (u) => ts.createEntry(entryDto(w.inv.id), u), (u) => ts.createEntry(entryDto(w.nor.id), u));
      await check('createEntriesBulk', (u) => ts.createEntriesBulk({ entries: [entryDto(w.inv.id)] } as any, u), (u) => ts.createEntriesBulk({ entries: [entryDto(w.nor.id)] } as any, u));
      // mover una hora propia a la investigación
      await check('updateEntry', async (u) => ts.updateEntry((await mkOwn(u.id, w.nor.id)).id, { auditId: w.inv.id } as any, u), async (u) => ts.updateEntry((await mkOwn(u.id, w.nor.id)).id, { description: 'otra descripción' } as any, u));
    });

    it('reporte de horas: el gerente ve la investigación ajena sin título, y no puede filtrar por ella', async () => {
      const titleOf = (r: any, auditId: string) => r.breakdown.find((b: any) => b.auditId === auditId)?.auditTitle;
      const asManager: any = await ts.getReport({ groupBy: 'audit' } as any, w.users.manager);
      expect(titleOf(asManager, w.inv.id)).toBe('Encargo restringido');
      expect(titleOf(asManager, w.nor.id)).toBe('Auditoría normal');
      const asCae: any = await ts.getReport({ groupBy: 'audit' } as any, w.users.cae);
      expect(titleOf(asCae, w.inv.id)).toBe('Investigación reservada');
      // el líder (del equipo) ve sus propias horas con el título
      const asLead: any = await ts.getReport({ groupBy: 'audit' } as any, w.users.lead);
      expect(titleOf(asLead, w.inv.id)).toBe('Investigación reservada');
      // filtrar por la investigación: el gerente ajeno no (entregaba quién trabajó y cuánto); el CAE sí
      await expect(ts.getReport({ groupBy: 'user', auditId: w.inv.id } as any, w.users.manager)).rejects.toThrow(/modo investigación/);
      await expect(ts.getReport({ groupBy: 'user', auditId: w.inv.id } as any, w.users.cae)).resolves.toBeDefined();
      await expect(ts.getReport({ groupBy: 'user', auditId: w.nor.id } as any, w.users.manager)).resolves.toBeDefined();
    });

    it('horas de una persona en el mes (gerente): sin título ni descripción si la investigación es ajena', async () => {
      const find = (r: any, id: string) => r.entries.find((e: any) => e.id === id);
      const asManager: any = await hc.personEntries(w.users.lead.id, 2028, 5, w.users.manager);
      expect(find(asManager, seeded.inv.entry.id)).toMatchObject({ description: null, auditTitle: 'Encargo restringido' });
      expect(find(asManager, seeded.nor.entry.id)).toMatchObject({ description: 'entrevista con el gerente de compras', auditTitle: 'Auditoría normal' });
      const asCae: any = await hc.personEntries(w.users.lead.id, 2028, 5, w.users.cae);
      expect(find(asCae, seeded.inv.entry.id)).toMatchObject({ description: 'entrevista con el gerente de compras', auditTitle: 'Investigación reservada' });
    });

    it('pedidos de ajuste: el gerente que no ve la investigación no lee la descripción; el pedido propio sí se ve completo', async () => {
      const mkReq = (userId: string, entryId: string, payload: any) => prisma.timeAdjustmentRequest.create({
        data: { organizationId: w.org.id, userId, year: 2028, month: 5, action: 'EDIT' as any, timeEntryId: entryId, payload, reason: 'corrección' },
      });
      const reqInv = await mkReq(w.users.lead.id, seeded.inv.entry.id, { description: 'texto reservado nuevo' });
      const reqNor = await mkReq(w.users.lead.id, seeded.nor.entry.id, { description: 'texto normal nuevo' });
      const pick = (rows: any[], id: string) => rows.find((r) => r.id === id);
      const asManager: any[] = await hc.listAdjustments({} as any, w.users.manager);
      expect(pick(asManager, reqInv.id).entry.description).toBeNull();
      expect(pick(asManager, reqInv.id).payload.description).toBeNull();
      expect(pick(asManager, reqNor.id).entry.description).toBe('entrevista con el gerente de compras');
      expect(pick(asManager, reqNor.id).payload.description).toBe('texto normal nuevo');
      const asCae: any[] = await hc.listAdjustments({} as any, w.users.cae);
      expect(pick(asCae, reqInv.id).payload.description).toBe('texto reservado nuevo');
      const asLead: any[] = await hc.listAdjustments({ mine: 'true' } as any, w.users.lead);
      expect(pick(asLead, reqInv.id).entry.description).toBe('entrevista con el gerente de compras');
    });

    it('al aprobar un ajuste se revalida que QUIEN LO PIDIÓ todavía vea el encargo', async () => {
      await prisma.hoursCloseSettings.upsert({ where: { organizationId: w.org.id }, create: { organizationId: w.org.id, enabled: true }, update: { enabled: true } });
      const mkClosed = (userId: string) => prisma.hoursPeriodClose.create({
        data: { organizationId: w.org.id, userId, year: 2029, month: 3, status: 'CLOSED' as any, closedById: w.users.manager.id, closedAt: new Date(), entryCount: 0, totalHours: 0 },
      });
      const mkAdd = async (userId: string, auditId: string) => {
        await mkClosed(userId).catch(() => undefined); // un solo cierre por persona y mes
        return prisma.timeAdjustmentRequest.create({
          data: {
            organizationId: w.org.id, userId, year: 2029, month: 3, action: 'ADD' as any, reason: 'olvidé registrarlas',
            payload: { workDate: '2029-03-10', hours: 2, category: 'CLIENT_BILLABLE', description: 'trabajo en el encargo', auditId },
          },
        });
      };
      const decide = (id: string) => hc.decideAdjustment(id, { approve: true } as any, w.users.cae);
      // quien pidió las horas NO es del equipo de la investigación: no se aprueban, el pedido sigue pendiente y no hay hora creada
      const bad = await mkAdd(w.users.outsider.id, w.inv.id);
      await expect(decide(bad.id)).rejects.toThrow(/no existe/);
      expect((await prisma.timeAdjustmentRequest.findUniqueOrThrow({ where: { id: bad.id } })).status).toBe('PENDING');
      expect(await prisma.timeEntry.count({ where: { userId: w.users.outsider.id, auditId: w.inv.id, workDate: new Date('2029-03-10') } })).toBe(0);
      // integrante del equipo sobre la investigación, y cualquiera sobre una auditoría normal: se aprueba
      const countOf = (userId: string, auditId: string) => prisma.timeEntry.count({ where: { userId, auditId, workDate: new Date('2029-03-10') } });
      const okTeam = await mkAdd(w.users.member.id, w.inv.id);
      await expect(decide(okTeam.id)).resolves.toBeDefined();
      expect(await countOf(w.users.member.id, w.inv.id)).toBe(1);
      const okNormal = await mkAdd(w.users.outsider.id, w.nor.id);
      await expect(decide(okNormal.id)).resolves.toBeDefined();
      expect(await countOf(w.users.outsider.id, w.nor.id)).toBe(1);
    });
  });

  // ═══ Lote 9 · Planes, universo auditable y banco de proyectos ═══════════════════════════════════════════
  describe('lote 9 · planes, universo y proyectos', () => {
    let plans: PlansService; let universe: AuditUniverseService; let projects: AuditProjectsService;
    const seeded: Record<string, any> = {};
    let day = 0;
    const nextDay = () => `2031-04-${String(1 + (day++ % 27)).padStart(2, '0')}`;

    beforeAll(async () => {
      plans = new PlansService(prisma as any);
      universe = new AuditUniverseService(prisma as any);
      projects = new AuditProjectsService(prisma as any);

      const plan = await prisma.auditPlan.create({ data: { organizationId: w.org.id, year: 2031, name: 'Plan 2031', totalHours: 1000 } });
      const project = await prisma.auditProject.create({ data: { organizationId: w.org.id, correlative: 'BAP-T01', name: 'Proyecto', planYear: 2031 } });
      const item = (extra: any) => prisma.auditPlanItem.create({ data: { planId: plan.id, estimatedHours: 40, ...extra } });
      const itemInv = await item({ auditId: w.inv.id, auditProjectId: project.id });
      const itemNor = await item({ auditId: w.nor.id, auditProjectId: project.id });
      // auditorías sin ítem de plan (para vincular) y sus ítems libres
      const mkAudit = async (title: string, inv: boolean) => {
        const a = await prisma.audit.create({ data: { organizationId: w.org.id, title, type: 'EXTERNAL', isInvestigationMode: inv, leadAuditorId: w.users.lead.id } });
        await prisma.auditTeam.create({ data: { auditId: a.id, userId: w.users.lead.id, role: 'LEAD' } });
        await prisma.auditTeam.create({ data: { auditId: a.id, userId: w.users.member.id, role: 'MEMBER' } });
        return a;
      };
      const freeInv = await mkAudit('Investigación sin plan', true);
      const freeNor = await mkAudit('Auditoría normal sin plan', false);
      Object.assign(seeded, { plan, project, itemInv, itemNor, freeInv, freeNor, itemFreeInv: await item({}), itemFreeNor: await item({}) });
    });

    it('el plan muestra el ítem de una investigación ajena como «Encargo restringido» (sin estado ni horas) y nunca el equipo', async () => {
      const itemOf = (plan: any, id: string) => plan.items.find((i: any) => i.id === id);
      for (const who of ['outsider', 'manager'] as const) {
        const one: any = await plans.findOne(seeded.plan.id, w.users[who]);
        expect(itemOf(one, seeded.itemInv.id).audit).toEqual({ id: w.inv.id, title: 'Encargo restringido', restricted: true });
        expect(itemOf(one, seeded.itemNor.id).audit).toMatchObject({ id: w.nor.id, title: 'Auditoría normal' });
        const all: any[] = await plans.findAll(w.users[who]);
        expect(itemOf(all.find((p) => p.id === seeded.plan.id), seeded.itemInv.id).audit.restricted).toBe(true);
      }
      for (const who of ['member', 'lead', 'cae'] as const) {
        const one: any = await plans.findOne(seeded.plan.id, w.users[who]);
        expect(itemOf(one, seeded.itemInv.id).audit).toMatchObject({ id: w.inv.id, title: 'Investigación reservada' });
        expect(itemOf(one, seeded.itemInv.id).audit).not.toHaveProperty('team');
      }
      // el total de horas reales del plan no cambia con quien lo mira
      const a: any = await plans.findOne(seeded.plan.id, w.users.outsider); const b: any = await plans.findOne(seeded.plan.id, w.users.cae);
      expect(a.realHours).toBe(b.realHours);
    });

    it('encargos que se pueden vincular: la investigación ajena no aparece', async () => {
      await checkListing('getLinkableAudits', (u) => plans.getLinkableAudits(seeded.plan.id, u), (r) => r.map((a: any) => a.id), seeded.freeInv.id, seeded.freeNor.id);
    });

    it('vincular y desvincular un encargo del ítem del plan', async () => {
      await check('linkAudit', (u) => plans.linkAudit(seeded.plan.id, seeded.itemFreeInv.id, { auditId: seeded.freeInv.id }, u), (u) => plans.linkAudit(seeded.plan.id, seeded.itemFreeNor.id, { auditId: seeded.freeNor.id }, u));
      // desvincular una investigación ajena (el ítem de la investigación sembrada)
      await expectBlocked('unlinkAudit', (u) => plans.unlinkAudit(seeded.plan.id, seeded.itemInv.id, u));
      await expect(plans.unlinkAudit(seeded.plan.id, seeded.itemFreeInv.id, w.users.member)).resolves.toBeDefined();
    });

    it('horas de un encargo y de un ítem del plan, y registrar horas desde el plan', async () => {
      await check('getTimeEntries', (u) => plans.getTimeEntries(w.inv.id, u), (u) => plans.getTimeEntries(w.nor.id, u));
      await check('getPlanItemTimeEntries', (u) => plans.getPlanItemTimeEntries(seeded.itemInv.id, u), (u) => plans.getPlanItemTimeEntries(seeded.itemNor.id, u));
      await check('createTimeEntry', (u) => plans.createTimeEntry({ auditId: w.inv.id, workDate: nextDay(), hours: 1, description: 'trabajo de campo' } as any, u), (u) => plans.createTimeEntry({ auditId: w.nor.id, workDate: nextDay(), hours: 1, description: 'trabajo de campo' } as any, u));
      // un ítem de plan ya vinculado a una investigación ajena tampoco admite horas
      await expectBlocked('createTimeEntry(planItem)', (u) => plans.createTimeEntry({ planItemId: seeded.itemInv.id, workDate: nextDay(), hours: 1, description: 'trabajo de campo' } as any, u));
    });

    it('hallazgos de un proyecto del banco: no se listan los de una investigación ajena', async () => {
      const mkFinding = (auditId: string) => prisma.finding.create({ data: { auditId, organizationId: w.org.id, title: 'Hallazgo del proyecto', condition: 'c', criteria: 'k', cause: 'z', effect: 'e', risk: 'r', recommendation: 'rec', severity: 'HIGH' } });
      const invFinding = await mkFinding(w.inv.id);
      const norFinding = await mkFinding(w.nor.id);
      await checkListing('getProjectFindings', (u) => plans.getProjectFindings(seeded.project.id, u), (r) => r.map((f: any) => f.id), invFinding.id, norFinding.id);
    });

    describe('universo auditable y banco de proyectos', () => {
      const e: Record<string, any> = {};
      beforeAll(async () => {
        e.entity = await prisma.auditEntity.create({ data: { organizationId: w.org.id, name: 'Gerencia de Compras' } });
        const mk = async (title: string, inv: boolean, endDate: Date) => {
          const a = await prisma.audit.create({ data: { organizationId: w.org.id, title, type: 'EXTERNAL', status: 'CLOSED' as any, isInvestigationMode: inv, auditEntityId: e.entity.id, endDate, leadAuditorId: w.users.lead.id } });
          await prisma.auditTeam.create({ data: { auditId: a.id, userId: w.users.lead.id, role: 'LEAD' } });
          await prisma.auditTeam.create({ data: { auditId: a.id, userId: w.users.member.id, role: 'MEMBER' } });
          return a;
        };
        e.inv = await mk('Investigación en compras', true, new Date('2025-12-31'));
        e.nor = await mk('Auditoría de compras', false, new Date('2024-06-30'));
        e.project = await prisma.auditProject.create({ data: { organizationId: w.org.id, correlative: 'BAP-T02', name: 'Compras', planYear: 2031, responsibleEntityId: e.entity.id } });
      });

      it('la ficha, el listado y el árbol de la entidad no cuentan ni muestran la investigación ajena', async () => {
        for (const who of ['outsider', 'manager'] as const) {
          const one: any = await universe.findOne(e.entity.id, w.users[who]);
          expect(one.audits.map((a: any) => a.id)).toEqual([e.nor.id]);
          const list: any = await universe.findAll(w.users[who], 1, 100);
          expect(list.data.find((x: any) => x.id === e.entity.id)._count.audits).toBe(1);
          const tree: any[] = await universe.getEntityTree(w.users[who]);
          expect(tree.find((x) => x.id === e.entity.id)._count.audits).toBe(1);
        }
        for (const who of ['member', 'lead', 'cae'] as const) {
          const one: any = await universe.findOne(e.entity.id, w.users[who]);
          expect(one.audits.map((a: any) => a.id).sort()).toEqual([e.inv.id, e.nor.id].sort());
          const list: any = await universe.findAll(w.users[who], 1, 100);
          expect(list.data.find((x: any) => x.id === e.entity.id)._count.audits).toBe(2);
        }
      });

      it('la cobertura del banco de proyectos no revela la fecha de una investigación ajena', async () => {
        const last = async (u: any) => ((await projects.findAll(u)) as any[]).find((p) => p.id === e.project.id).lastAuditDate;
        for (const who of ['outsider', 'manager'] as const) expect(new Date(await last(w.users[who])).toISOString().slice(0, 10)).toBe('2024-06-30');
        for (const who of ['member', 'lead', 'cae'] as const) expect(new Date(await last(w.users[who])).toISOString().slice(0, 10)).toBe('2025-12-31');
      });
    });
  });

  // ═══ Lote 10 · Panel de control y comité ═══════════════════════════════════════════════════════════
  describe('lote 10 · panel y comité', () => {
    let dash: DashboardService; let committee: CommitteeService;
    const d: Record<string, any> = {};
    const tomorrow = new Date(Date.now() + 86_400_000);
    const yesterday = new Date(Date.now() - 86_400_000);
    const mkFinding = (auditId: string, extra: any = {}) => prisma.finding.create({
      data: { auditId, organizationId: w.org.id, title: `Hallazgo del panel ${randomUUID().slice(0, 6)}`, condition: 'c', criteria: 'k', cause: 'z', effect: 'e', risk: 'r', recommendation: 'rec', severity: 'CRITICAL', status: 'DRAFT', ...extra },
    });

    beforeAll(async () => {
      dash = new DashboardService(prisma as any);
      const profitability = { getOrgWideProfitability: async () => ({}), getAuditFinancialSummary: async () => null } as any;
      const capacity = { getFirmDashboard: async () => ({}) } as any;
      committee = new CommitteeService(prisma as any, profitability, capacity);
      for (const a of [w.inv, w.nor]) await prisma.audit.update({ where: { id: a.id }, data: { status: 'IN_PROGRESS', startDate: yesterday, endDate: tomorrow } });
      for (const [k, a] of [['inv', w.inv], ['nor', w.nor]] as const) {
        const finding = await mkFinding(a.id, { status: 'IN_REVIEW', escalationLevel: 'CAE', isMaterial: true });
        const action = await prisma.findingAction.create({ data: { findingId: finding.id, organizationId: w.org.id, description: 'plan', dueDate: yesterday } });
        const pbc = await prisma.pbcRequest.create({ data: { auditId: a.id, organizationId: w.org.id, title: `Entrega ${k}`, description: 'd', requestedToEmail: `${k}@t.test`, createdById: w.users.lead.id, dueDate: tomorrow } });
        d[k] = { finding, action, pbc };
      }
    });

    it('KPIs: las investigaciones ajenas no suman (el CAE y el equipo sí las cuentan)', async () => {
      const outsider: any = await dash.getKpis(w.users.outsider);
      for (const who of ['member', 'lead', 'cae'] as const) {
        const full: any = await dash.getKpis(w.users[who]);
        expect(full.auditsInProgress).toBe(outsider.auditsInProgress + 1);
        expect(full.openFindings).toBeGreaterThan(outsider.openFindings);
        expect(full.criticalFindings).toBeGreaterThan(outsider.criticalFindings);
        expect(full.overduePbcRequests).toBeGreaterThanOrEqual(outsider.overduePbcRequests);
      }
      const manager: any = await dash.getKpis(w.users.manager);
      expect(manager.auditsInProgress).toBe(outsider.auditsInProgress);
    });

    it('línea de tiempo, hallazgos recientes y vencimientos: la investigación ajena no aparece', async () => {
      await checkListing('getAuditTimeline', (u) => dash.getAuditTimeline(u), (r) => r.map((a: any) => a.id), w.inv.id, w.nor.id);
      await checkListing('getRecentFindings', (u) => dash.getRecentFindings(u, 500), (r) => r.map((f: any) => f.id), d.inv.finding.id, d.nor.finding.id);
      await checkListing('pbcDue', async (u) => (await dash.getUpcomingDeadlines(u)).pbcDue, (r) => r.map((x: any) => x.id), d.inv.pbc.id, d.nor.pbc.id);
      await checkListing('auditsEnding', async (u) => (await dash.getUpcomingDeadlines(u)).auditsEnding, (r) => r.map((x: any) => x.id), w.inv.id, w.nor.id);
    });

    it('vista del gerente: pendientes de aprobación, escalados, tendencia y cifras del año', async () => {
      await checkListing('pendingApproval', async (u) => (await dash.getManagerDashboard(u)).pendingApproval, (r) => r.map((f: any) => f.id), d.inv.finding.id, d.nor.finding.id);
      await checkListing('escalated', async (u) => (await dash.getManagerDashboard(u)).escalated, (r) => r.map((f: any) => f.id), d.inv.finding.id, d.nor.finding.id);
      const asManager: any = await dash.getManagerDashboard(w.users.manager);
      const asCae: any = await dash.getManagerDashboard(w.users.cae);
      expect(asCae.kpis.findingsThisYear).toBeGreaterThan(asManager.kpis.findingsThisYear);
      const sum = (r: any) => r.findingsTrend.reduce((n: number, m: any) => n + m.total, 0);
      expect(sum(asCae)).toBeGreaterThan(sum(asManager));
    });

    it('vista del comité del panel: hallazgos abiertos, escalados y acciones vencidas', async () => {
      await checkListing('committee.escalatedFindings', async (u) => (await dash.getCommitteeDashboard(u)).escalatedFindings, (r) => r.map((f: any) => f.id), d.inv.finding.id, d.nor.finding.id);
      await checkListing('committee.overdueActions', async (u) => (await dash.getCommitteeDashboard(u)).overdueActions, (r) => r.map((a: any) => a.id), d.inv.action.id, d.nor.action.id);
      const asManager: any = await dash.getCommitteeDashboard(w.users.manager);
      const asCae: any = await dash.getCommitteeDashboard(w.users.cae);
      expect(asCae.kpis.openFindings).toBeGreaterThan(asManager.kpis.openFindings);
      expect(asCae.kpis.materialOpen).toBeGreaterThan(asManager.kpis.materialOpen);
    });

    it('«mis pendientes»: si lo sacaron del equipo de una investigación deja de ver su hallazgo', async () => {
      const mine = async (auditId: string) => (await mkFinding(auditId, { responsibleId: w.users.outsider.id })).id;
      const invMine = await mine(w.inv.id); const norMine = await mine(w.nor.id);
      const r: any = await dash.getMyWorkload(w.users.outsider);
      const ids = r.myFindings.map((f: any) => f.id);
      expect(ids).toContain(norMine);
      expect(ids).not.toContain(invMine);
    });

    it('el acta del comité nunca lleva investigaciones, ni siquiera cuando la publica el CAE', async () => {
      const year = new Date().getFullYear();
      const mkAudit = async (title: string, inv: boolean) => {
        const a = await prisma.audit.create({ data: { organizationId: w.org.id, title, type: 'EXTERNAL', isInvestigationMode: inv, leadAuditorId: w.users.lead.id } });
        await prisma.auditTeam.create({ data: { auditId: a.id, userId: w.users.lead.id, role: 'LEAD' } });
        await prisma.auditTeam.create({ data: { auditId: a.id, userId: w.users.member.id, role: 'MEMBER' } });
        return a;
      };
      const cInv = await mkAudit('Investigación del acta', true);
      const cNor = await mkAudit('Auditoría del acta', false);
      const cFinding = await mkFinding(cInv.id, { title: 'Hallazgo reservado del acta' });
      const plan = await prisma.auditPlan.create({ data: { organizationId: w.org.id, year, name: `Plan ${year}`, totalHours: 500, status: 'ACTIVE' } });
      const end = new Date(year, new Date().getMonth(), 28);
      const mkItem = (auditId: string) => prisma.auditPlanItem.create({ data: { planId: plan.id, estimatedHours: 40, tentativeStartDate: new Date(year, 0, 5), tentativeEndDate: end, auditId } });
      await mkItem(cInv.id); await mkItem(cNor.id);
      const periodKey = String(year); // corte anual: el rango abarca los ítems
      const auditIdsOf = (r: any) => r.planExecution.map((i: any) => i.auditId);

      // en vivo, cada quien ve lo suyo
      const liveManager: any = await committee.getDashboard(w.users.manager, 'ANNUAL', periodKey);
      expect(auditIdsOf(liveManager)).toContain(cNor.id);
      expect(auditIdsOf(liveManager)).not.toContain(cInv.id);
      const liveCae: any = await committee.getDashboard(w.users.cae, 'ANNUAL', periodKey);
      expect(auditIdsOf(liveCae)).toEqual(expect.arrayContaining([cNor.id, cInv.id]));
      expect(liveCae.summary.universeTotal).toBe(liveManager.summary.universeTotal + 1);

      // el CAE publica la foto y luego la lee un gerente: sin la investigación
      await committee.publishSnapshot(w.users.cae, 'ANNUAL', periodKey);
      for (const who of ['manager', 'cae'] as const) {
        const frozen: any = await committee.getDashboard(w.users[who], 'ANNUAL', periodKey);
        expect(frozen.meta.frozen).toBe(true);
        expect(auditIdsOf(frozen)).toContain(cNor.id);
        expect(auditIdsOf(frozen)).not.toContain(cInv.id);
        expect(JSON.stringify(frozen)).not.toContain('Investigación del acta');
        expect(JSON.stringify(frozen)).not.toContain(cFinding.id);
      }
    });
  });

  // ═══ Lote 11 · QAIP y revisión de calidad del encargo (EQR) ════════════════════════════════════════
  describe('lote 11 · QAIP y EQR', () => {
    let eqr: EqrService; let qaipFindings: QaipFindingsService;
    let auditEqr: { id: string };
    beforeAll(async () => {
      eqr = new EqrService(prisma as any);
      qaipFindings = new QaipFindingsService(prisma as any);
      auditEqr = await prisma.audit.create({ data: { organizationId: w.org.id, title: 'Investigación con EQR', type: 'EXTERNAL', isInvestigationMode: true, leadAuditorId: w.users.lead.id } });
      await prisma.auditTeam.create({ data: { auditId: auditEqr.id, userId: w.users.lead.id, role: 'LEAD' } });
      await prisma.auditTeam.create({ data: { auditId: auditEqr.id, userId: w.users.member.id, role: 'MEMBER' } });
    });

    it('la EQR de una investigación: ajenos bloqueados; equipo y CAE sí', async () => {
      await check('eqr.get', (u) => eqr.get(w.inv.id, u), (u) => eqr.get(w.nor.id, u));
      await check('eqr.require', (u) => eqr.require(w.inv.id, u), (u) => eqr.require(w.nor.id, u));
      // el revisor asignado puede actuar sobre su EQR, así que aquí se designa al CAE (que ve todo) para no mezclar las dos reglas
      await check('eqr.assignReviewer', (u) => eqr.assignReviewer(w.inv.id, { reviewerId: w.users.cae.id } as any, u), (u) => eqr.assignReviewer(w.nor.id, { reviewerId: w.users.cae.id } as any, u));
      await check('eqr.updateChecklist', (u) => eqr.updateChecklist(w.inv.id, { notes: 'n' } as any, u), (u) => eqr.updateChecklist(w.nor.id, { notes: 'n' } as any, u));
    });

    it('el revisor asignado (independiente del equipo) sí puede leerla, llenarla y completarla; los demás no', async () => {
      await eqr.require(auditEqr.id, w.users.cae);
      // antes de asignar revisor, el gerente ajeno no entra
      await expect(eqr.get(auditEqr.id, w.users.manager)).rejects.toThrow(/modo investigación/);
      await eqr.assignReviewer(auditEqr.id, { reviewerId: w.users.manager.id } as any, w.users.cae);
      // el revisor (manager, ajeno al equipo)
      const seen: any = await eqr.get(auditEqr.id, w.users.manager);
      expect(seen.reviewerId).toBe(w.users.manager.id);
      expect(seen.audit.team).toEqual([]); // no recibe la lista del equipo
      await expect(eqr.updateChecklist(auditEqr.id, { notes: 'revisado' } as any, w.users.manager)).resolves.toBeDefined();
      // pedir la EQR o cambiar el revisor sigue siendo solo de quien ve la investigación
      await expect(eqr.assignReviewer(auditEqr.id, { reviewerId: w.users.outsider.id } as any, w.users.manager)).rejects.toThrow(/modo investigación/);
      await expect(eqr.require(auditEqr.id, w.users.manager)).rejects.toThrow(/modo investigación/);
      // otra persona ajena que no es el revisor
      await expect(eqr.get(auditEqr.id, w.users.outsider)).rejects.toThrow(/modo investigación/);
      await expect(eqr.complete(auditEqr.id, { result: 'APPROVED' } as any, w.users.outsider)).rejects.toThrow(/modo investigación/);
      // el equipo ve la lista completa
      const teamView: any = await eqr.get(auditEqr.id, w.users.member);
      expect(teamView.audit.team.length).toBeGreaterThan(0);
    });

    it('un hallazgo de calidad solo se vincula a un encargo que el usuario ve', async () => {
      const dto = (engagementId: string) => ({ track: 'NIGC_EXTERNAL', source: 'EQR', severity: 'LOW', description: 'observación', engagementId }) as any;
      await check('qaip.createFinding', (u) => qaipFindings.create(dto(w.inv.id), u), (u) => qaipFindings.create(dto(w.nor.id), u));
    });
  });

  // ═══ Lote 12 · IA (análisis multi-año), Anexo 12 y conectores de datos ═════════════════════════════
  describe('lote 12 · IA, Anexo 12 y conectores', () => {
    let ai: AiController; let anexo: Anexo12Service; let sources: DataSourcesService;
    const sent: any[] = [];
    beforeAll(() => {
      ai = new AiController({ multiYearAnalysis: async (payload: any) => { sent.push(payload); return payload; } } as any, prisma as any, {} as any);
      anexo = new Anexo12Service(prisma as any);
      sources = new DataSourcesService(prisma as any, { get: (_k: string, d?: unknown) => d ?? '' } as any);
    });

    it('análisis multi-año: una investigación ajena no se manda a la IA (mismo mensaje que una de otra organización)', async () => {
      for (const who of ['outsider', 'manager'] as const) {
        sent.length = 0;
        await expect(ai.multiYearAnalysis({ auditIds: [w.inv.id, w.nor.id] }, w.users[who])).rejects.toThrow(/no pertenecen a su organización/);
        expect(sent).toHaveLength(0);
      }
      for (const who of ['member', 'lead', 'cae'] as const) {
        sent.length = 0;
        await expect(ai.multiYearAnalysis({ auditIds: [w.inv.id, w.nor.id] }, w.users[who])).resolves.toBeDefined();
        expect(sent[0].audits.map((a: any) => a.id).sort()).toEqual([w.inv.id, w.nor.id].sort());
      }
    });

    it('Anexo 12 (hallazgos, montos y referencias normativas)', async () => {
      await check('anexo12.generate', (u) => anexo.generate(w.inv.id, u), (u) => anexo.generate(w.nor.id, u));
    });

    it('importar a una auditoría desde un conector: solo a una que el usuario ve', async () => {
      const ds = await prisma.dataSource.create({ data: { organizationId: w.org.id, name: 'Excel', type: 'EXCEL_UPLOAD' as any, status: 'ACTIVE' as any, createdById: w.users.cae.id } });
      await expectBlocked('runImport', (u) => sources.runImport(ds.id, { auditId: w.inv.id } as any, u));
    });
  });

  // ═══ Lote 13 · Cartera ═════════════════════════════════════════════════════════════════════════
  describe('lote 13 · cartera', () => {
    let engagements: EngagementsService; let clients: ClientsService;
    const c: Record<string, any> = {};
    beforeAll(async () => {
      clients = new ClientsService(prisma as any);
      engagements = new EngagementsService(prisma as any, clients, {} as any, {} as any);
      c.client = await prisma.client.create({ data: { organizationId: w.org.id, legalName: 'Cliente de la investigación', createdById: w.users.cae.id } });
      const mk = (auditId: string, fiscalYear: number) => prisma.engagement.create({
        data: { organizationId: w.org.id, clientId: c.client.id, fiscalYear, fiscalYearEndDate: new Date(`${fiscalYear}-12-31`), status: 'APPROVED' as any, auditId, createdById: w.users.cae.id, kind: 'AUDIT' as any },
      });
      c.inv = await mk(w.inv.id, 2040); c.nor = await mk(w.nor.id, 2041);
    });

    it('el listado y la ficha del cliente muestran el encargo de una investigación ajena sin título ni estado', async () => {
      for (const who of ['outsider', 'manager'] as const) {
        const list: any[] = await engagements.findAll(w.users[who], c.client.id);
        expect(list.find((e) => e.id === c.inv.id).audit).toEqual({ id: w.inv.id, title: 'Encargo restringido', restricted: true });
        expect(list.find((e) => e.id === c.nor.id).audit).toMatchObject({ id: w.nor.id, title: 'Auditoría normal' });
        const detail: any = await clients.findOne(c.client.id, w.users[who]);
        expect(detail.engagements.find((e: any) => e.id === c.inv.id).audit.restricted).toBe(true);
        expect(detail.engagements.find((e: any) => e.id === c.nor.id).audit.title).toBe('Auditoría normal');
      }
      for (const who of ['member', 'lead', 'cae'] as const) {
        const list: any[] = await engagements.findAll(w.users[who], c.client.id);
        expect(list.find((e) => e.id === c.inv.id).audit).toMatchObject({ id: w.inv.id, title: 'Investigación reservada' });
        const detail: any = await clients.findOne(c.client.id, w.users[who]);
        expect(detail.engagements.find((e: any) => e.id === c.inv.id).audit.title).toBe('Investigación reservada');
      }
    });
  });

  // ═══ Lote 14 · Gobierno del modo investigación ═════════════════════════════════════════════════════
  describe('lote 14 · gobierno del modo', () => {
    let audits: AuditsService;
    beforeAll(() => {
      audits = Object.create(AuditsService.prototype);
      (audits as any).prisma = prisma;
    });

    it('activar o apagar el modo en una auditoría existente es solo de CAE, ADMIN o SUPER_ADMIN', async () => {
      // el líder (del equipo, rol AUDITOR) no puede apagarlo ni encenderlo; reenviar el mismo valor no cuenta como cambio
      await expect(audits.update(w.inv.id, { isInvestigationMode: false } as any, w.users.lead)).rejects.toThrow(/Solo CAE, ADMIN o SUPER_ADMIN/);
      await expect(audits.update(w.nor.id, { isInvestigationMode: true } as any, w.users.lead)).rejects.toThrow(/Solo CAE, ADMIN o SUPER_ADMIN/);
      await expect(audits.update(w.inv.id, { isInvestigationMode: true, scope: 'alcance' } as any, w.users.lead)).resolves.toBeDefined();
      expect((await prisma.audit.findUniqueOrThrow({ where: { id: w.inv.id } })).isInvestigationMode).toBe(true);
      expect((await prisma.audit.findUniqueOrThrow({ where: { id: w.nor.id } })).isInvestigationMode).toBe(false);
      // el CAE sí; se deja como estaba
      const spare = await prisma.audit.create({ data: { organizationId: w.org.id, title: 'Para alternar el modo', type: 'EXTERNAL', leadAuditorId: w.users.lead.id } });
      await expect(audits.update(spare.id, { isInvestigationMode: true } as any, w.users.cae)).resolves.toMatchObject({ isInvestigationMode: true });
      await expect(audits.update(spare.id, { isInvestigationMode: false } as any, w.users.cae)).resolves.toMatchObject({ isInvestigationMode: false });
    });

    it('el roll-forward de una investigación sigue siendo investigación y conserva el mismo equipo', async () => {
      const next: any = await audits.rollForward(w.inv.id, { title: 'Investigación del año siguiente', carryOpenFindings: true }, w.users.cae);
      expect(next.isInvestigationMode).toBe(true);
      const team = await prisma.auditTeam.findMany({ where: { auditId: next.id }, select: { userId: true } });
      expect(team.map((t) => t.userId).sort()).toEqual([w.users.cae.id, w.users.lead.id, w.users.member.id].sort());
      // los hallazgos traspasados no quedan a la vista de la organización
      await expect(audits.findOne(next.id, w.users.outsider)).rejects.toThrow(/modo investigación/);
      await expect(audits.findOne(next.id, w.users.manager)).rejects.toThrow(/modo investigación/);
      await expect(audits.findOne(next.id, w.users.member)).resolves.toBeDefined();
      // una auditoría normal sigue dando una normal
      const nextNormal: any = await audits.rollForward(w.nor.id, { title: 'Auditoría normal del año siguiente' }, w.users.cae);
      expect(nextNormal.isInvestigationMode).toBe(false);
    });
  });

  // ═══ Lote 15 · Firma de URLs de Storage: solo archivos de encargos que el usuario ve ═════════════════════════
  describe('lote 15 · firma de URLs de Storage', () => {
    let storage: StorageUrlService;
    const f: Record<string, string> = {};
    const url = (path: string) => `https://proyecto.supabase.co/storage/v1/object/public/audit-files/${path}`;

    beforeAll(async () => {
      storage = new StorageUrlService(prisma as any);
      // sin red: «firmar» devuelve la ruta marcada
      jest.spyOn(storage as any, 'signPaths').mockImplementation((async (paths: string[]) => new Map(paths.map((x) => [x, `FIRMADA:${x}`]))) as any);
      const mkPaper = async (auditId: string, code: string) => {
        const paper = await prisma.workingPaper.create({ data: { auditId, code, indexSection: 'A', title: 'Papel', type: 'PLANNING_UNDERSTANDING' as any } });
        const section = await prisma.paperSection.create({ data: { paperId: paper.id, sectionKey: 'S1', label: 'Procedimientos' } });
        const procedure = await prisma.auditProcedure.create({ data: { sectionId: section.id, refNumber: 'P-1', description: 'p' } });
        const step = await prisma.auditStep.create({ data: { procedureId: procedure.id, refNumber: 'P-1-A', description: 'a' } });
        return { paper, step };
      };
      const inv = await mkPaper(w.inv.id, 'L15-inv'); const nor = await mkPaper(w.nor.id, 'L15-nor');
      // otra organización con su propio encargo
      const tag = randomUUID().slice(0, 8);
      const otherOrg = await prisma.organization.create({ data: { name: `Otra ${tag}`, slug: `otra-${tag}` } });
      const otherUser = await prisma.user.create({ data: { organizationId: otherOrg.id, supabaseUserId: randomUUID(), email: `x-${tag}@t.test`, name: 'x', role: 'CAE' } });
      const otherAudit = await prisma.audit.create({ data: { organizationId: otherOrg.id, title: 'Ajena', type: 'EXTERNAL', leadAuditorId: otherUser.id } });
      const other = await mkPaper(otherAudit.id, 'L15-otra');
      Object.assign(f, {
        invAudit: w.inv.id, norAudit: w.nor.id, invPaper: inv.paper.id, norPaper: nor.paper.id, invStep: inv.step.id, norStep: nor.step.id,
        otherAudit: otherAudit.id, otherPaper: other.paper.id, otherStep: other.step.id,
      });
    });

    const paths = () => ({
      nor: [`${f.norAudit}/a.pdf`, `evidence/${f.norAudit}/p/e.jpg`, `sections/${f.norPaper}/S1/a.pdf`, `procedures/steps/${f.norStep}/a.pdf`, `signed-papers/${f.norAudit}/p/prepare_1.pdf`],
      inv: [`${f.invAudit}/a.pdf`, `evidence/${f.invAudit}/p/e.jpg`, `sections/${f.invPaper}/S1/a.pdf`, `procedures/steps/${f.invStep}/a.pdf`, `request-docs/${f.invAudit}/o.pdf`],
      other: [`${f.otherAudit}/a.pdf`, `sections/${f.otherPaper}/S1/a.pdf`, `procedures/steps/${f.otherStep}/a.pdf`, `evidence/${f.otherAudit}/p/e.jpg`],
    });
    const signedSet = async (user: any, all: string[]) => {
      const out: any = await storage.signResponse({ urls: all.map(url) }, { organizationId: user.organizationId, userId: user.id, role: user.role });
      return new Set<string>(out.urls.filter((u: string) => u.startsWith('FIRMADA:')).map((u: string) => u.slice('FIRMADA:'.length)));
    };

    it('ajenos al equipo: firman los archivos de la auditoría normal, no los de la investigación ni los de otra organización', async () => {
      const { nor, inv, other } = paths();
      for (const who of ['outsider', 'manager'] as const) {
        const ok = await signedSet(w.users[who], [...nor, ...inv, ...other]);
        expect([...ok].sort()).toEqual([...nor].sort());
      }
    });

    it('equipo y CAE: firman también los de la investigación, nunca los de otra organización', async () => {
      const { nor, inv, other } = paths();
      for (const who of ['member', 'lead', 'cae'] as const) {
        const ok = await signedSet(w.users[who], [...nor, ...inv, ...other]);
        expect([...ok].sort()).toEqual([...nor, ...inv].sort());
      }
    });

    it('el CAE de OTRA organización no obtiene nada de esta (aunque sea CAE)', async () => {
      const { nor, inv } = paths();
      const otherCae = await prisma.user.findFirstOrThrow({ where: { organizationId: (await prisma.audit.findUniqueOrThrow({ where: { id: f.otherAudit } })).organizationId } });
      const ok = await signedSet({ id: otherCae.id, role: otherCae.role, organizationId: otherCae.organizationId }, [...nor, ...inv]);
      expect(ok.size).toBe(0);
    });

    it('el interceptor entrega al servicio quién es el usuario (id, rol y organización) y firma lo que le corresponde', async () => {
      const interceptor = new StorageUrlInterceptor(storage, new Reflector());
      const { nor, inv } = paths();
      const run = async (user: any) => {
        const ctx: any = { getType: () => 'http', getHandler: () => () => undefined, getClass: () => class {}, switchToHttp: () => ({ getRequest: () => ({ body: undefined, user }) }) };
        return lastValueFrom(interceptor.intercept(ctx, { handle: () => of({ urls: [...nor, ...inv].map(url) }) } as any) as any) as Promise<any>;
      };
      const asOutsider = await run(w.users.outsider);
      expect(asOutsider.urls.filter((u: string) => u.startsWith('FIRMADA:'))).toHaveLength(nor.length);
      const asCae = await run(w.users.cae);
      expect(asCae.urls.filter((u: string) => u.startsWith('FIRMADA:'))).toHaveLength(nor.length + inv.length);
    });
  });

  // ═══ Lote 16 · Huecos que halló la revisión independiente (2026-10-25) ══════════════════════════════
  describe('lote 16 · revisión independiente', () => {
    const mkAudit = async (title: string, inv: boolean, extra: any = {}) => {
      const a = await prisma.audit.create({ data: { organizationId: w.org.id, title, type: 'EXTERNAL', isInvestigationMode: inv, leadAuditorId: w.users.lead.id, ...extra } });
      await prisma.auditTeam.create({ data: { auditId: a.id, userId: w.users.lead.id, role: 'LEAD' } });
      await prisma.auditTeam.create({ data: { auditId: a.id, userId: w.users.member.id, role: 'MEMBER' } });
      return a;
    };
    const finding = (auditId: string, extra: any = {}) => prisma.finding.create({
      data: { auditId, organizationId: w.org.id, title: `Hallazgo ${randomUUID().slice(0, 6)}`, condition: 'c', criteria: 'k', cause: 'z', effect: 'e', risk: 'r', recommendation: 'rec', severity: 'HIGH', ...extra },
    });

    it('QAIP: los hallazgos de calidad ligados a una investigación ajena no se listan ni se tocan, y no suman en el tablero', async () => {
      const qaip = new QaipFindingsService(prisma as any);
      const mk = (engagementId: string | null) => prisma.qaipFinding.create({ data: { organizationId: w.org.id, track: 'NIGC_EXTERNAL', source: 'EQR', severity: 'LOW', description: 'observación', createdById: w.users.cae.id, engagementId } });
      const fInv = await mk(w.inv.id); const fNor = await mk(w.nor.id); const fFree = await mk(null);
      const action = await prisma.qaipRemediationAction.create({ data: { findingId: fInv.id, description: 'plan', ownerId: w.users.cae.id, dueDate: new Date('2020-01-01') } });
      const ids = (rows: any[]) => rows.map((r) => r.id);
      for (const who of ['outsider', 'manager'] as const) {
        const rows = ids(await qaip.list(w.users[who]));
        expect(rows).not.toContain(fInv.id);
        expect(rows).toEqual(expect.arrayContaining([fNor.id, fFree.id]));
      }
      for (const who of ['member', 'lead', 'cae'] as const) expect(ids(await qaip.list(w.users[who]))).toContain(fInv.id);
      await check('qaip.updateStatus', (u) => qaip.updateStatus(fInv.id, { status: 'OPEN' } as any, u), (u) => qaip.updateStatus(fNor.id, { status: 'OPEN' } as any, u));
      await check('qaip.addRootCause', (u) => qaip.addRootCause(fInv.id, { category: 'PROCESS', analysis: 'a' } as any, u), (u) => qaip.addRootCause(fNor.id, { category: 'PROCESS', analysis: 'a' } as any, u));
      await expectBlocked('qaip.updateRemediationAction', (u) => qaip.updateRemediationAction(action.id, { status: 'DONE' } as any, u));
      // tablero: las cifras del gerente ajeno no incluyen el hallazgo ni la acción vencida de la investigación
      const perf = new PerformanceService(prisma as any, { getOrgWideProfitability: async () => ({}), getAuditFinancialSummary: async () => null } as any);
      const asManager: any = await perf.getDashboard(w.users.manager, new Date().getFullYear());
      const asCae: any = await perf.getDashboard(w.users.cae, new Date().getFullYear());
      // (otras pruebas de este archivo también crean hallazgos de calidad en la investigación: aquí basta con que el CAE vea más)
      expect(asCae.qualityFindings.open).toBeGreaterThan(asManager.qualityFindings.open);
      expect(asCae.qualityFindings.overdueRemediationActions).toBe(asManager.qualityFindings.overdueRemediationActions + 1);
    });

    it('planes: reemplazar el vínculo o borrar el ítem de una investigación ajena tampoco está permitido', async () => {
      const plans = new PlansService(prisma as any);
      const invX = await mkAudit('Investigación del plan 16', true); const norX = await mkAudit('Auditoría para reemplazar', false);
      const plan = await prisma.auditPlan.create({ data: { organizationId: w.org.id, year: 2033, name: 'Plan 2033', totalHours: 100 } });
      const itemInv = await prisma.auditPlanItem.create({ data: { planId: plan.id, estimatedHours: 10, auditId: invX.id } });
      await expectBlocked('linkAudit (reemplazo)', (u) => plans.linkAudit(plan.id, itemInv.id, { auditId: norX.id }, u));
      await expectBlocked('removeItem', (u) => plans.removeItem(plan.id, itemInv.id, u));
      // tras los intentos bloqueados el ítem sigue vinculado a la investigación
      expect((await prisma.auditPlanItem.findUniqueOrThrow({ where: { id: itemInv.id } })).auditId).toBe(invX.id);
      // quien ve la investigación sí puede reemplazar el vínculo o borrar el ítem
      await expect(plans.linkAudit(plan.id, itemInv.id, { auditId: norX.id }, w.users.member)).resolves.toBeDefined();
      await expect(plans.removeItem(plan.id, itemInv.id, w.users.member)).resolves.toBeDefined();
    });

    it('PBC: marcar vencidas solo toca las solicitudes de auditorías que el usuario ve', async () => {
      const pbc: any = Object.create(PbcService.prototype);
      pbc.prisma = prisma;
      const invA = await mkAudit('Investigación PBC 16', true); const norA = await mkAudit('Normal PBC 16', false);
      const mk = (auditId: string) => prisma.pbcRequest.create({ data: { auditId, organizationId: w.org.id, title: 'Vencida', description: 'd', requestedToEmail: 'v@t.test', createdById: w.users.lead.id, dueDate: new Date('2020-01-01') } });
      const rInv = await mk(invA.id); const rNor = await mk(norA.id);
      await pbc.markOverdue(w.users.manager);
      expect((await prisma.pbcRequest.findUniqueOrThrow({ where: { id: rNor.id } })).status).toBe('OVERDUE');
      expect((await prisma.pbcRequest.findUniqueOrThrow({ where: { id: rInv.id } })).status).toBe('PENDING');
      await pbc.markOverdue(w.users.cae);
      expect((await prisma.pbcRequest.findUniqueOrThrow({ where: { id: rInv.id } })).status).toBe('OVERDUE');
    });

    it('conectores: las importaciones hechas para una investigación ajena no se listan ni se consultan', async () => {
      const sources = new DataSourcesService(prisma as any, { get: (_k: string, d?: unknown) => d ?? '' } as any);
      const ds = await prisma.dataSource.create({ data: { organizationId: w.org.id, name: 'Excel 16', type: 'EXCEL_UPLOAD' as any, status: 'ACTIVE' as any, createdById: w.users.cae.id } });
      const impInv = await prisma.connectorImport.create({ data: { sourceId: ds.id, auditId: w.inv.id, status: 'COMPLETED' as any, result: { resumen: 'reservado' } } });
      const impNor = await prisma.connectorImport.create({ data: { sourceId: ds.id, auditId: w.nor.id, status: 'COMPLETED' as any } });
      const impFree = await prisma.connectorImport.create({ data: { sourceId: ds.id, status: 'COMPLETED' as any } });
      const importIds = async (u: any) => ((await sources.findOne(ds.id, u)) as any).imports.map((i: any) => i.id);
      for (const who of ['outsider', 'manager'] as const) {
        const got = await importIds(w.users[who]);
        expect(got).not.toContain(impInv.id);
        expect(got).toEqual(expect.arrayContaining([impNor.id, impFree.id]));
      }
      for (const who of ['member', 'lead', 'cae'] as const) expect(await importIds(w.users[who])).toContain(impInv.id);
      await check('getImportStatus', (u) => sources.getImportStatus(ds.id, impInv.id, u), (u) => sources.getImportStatus(ds.id, impNor.id, u));
    });

    it('panel del comité: el avance del plan no delata si una investigación ajena está cerrada', async () => {
      const dash = new DashboardService(prisma as any);
      const invClosed = await mkAudit('Investigación cerrada 16', true, { status: 'CLOSED' });
      const norClosed = await mkAudit('Normal cerrada 16', false, { status: 'CLOSED' });
      const plan = await prisma.auditPlan.create({ data: { organizationId: w.org.id, year: 2034, name: 'Plan 2034', totalHours: 100, status: 'ACTIVE' } });
      await prisma.auditPlanItem.create({ data: { planId: plan.id, estimatedHours: 10, auditId: invClosed.id } });
      await prisma.auditPlanItem.create({ data: { planId: plan.id, estimatedHours: 10, auditId: norClosed.id } });
      const summary = async (u: any) => ((await dash.getCommitteeDashboard(u)) as any).planSummary;
      for (const who of ['outsider', 'manager'] as const) expect(await summary(w.users[who])).toMatchObject({ totalItems: 1, completedItems: 1 });
      for (const who of ['member', 'lead', 'cae'] as const) expect(await summary(w.users[who])).toMatchObject({ totalItems: 2, completedItems: 2 });
    });

    it('horas ancladas solo a un ítem de plan de una investigación ajena también salen sin descripción', async () => {
      const hc = new HoursCloseService(prisma as any, {} as any);
      const invH = await mkAudit('Investigación horas 16', true);
      const plan = await prisma.auditPlan.create({ data: { organizationId: w.org.id, year: 2035, name: 'Plan 2035', totalHours: 100 } });
      const item = await prisma.auditPlanItem.create({ data: { planId: plan.id, estimatedHours: 10, auditId: invH.id } });
      const entry = await prisma.timeEntry.create({ data: { organizationId: w.org.id, userId: w.users.member.id, planItemId: item.id, workDate: new Date('2027-06-10'), hours: 2, category: 'CLIENT_BILLABLE' as any, description: 'entrevista reservada' } });
      const asManager: any = await hc.personEntries(w.users.member.id, 2027, 6, w.users.manager);
      expect(asManager.entries.find((e: any) => e.id === entry.id)).toMatchObject({ description: null, auditTitle: 'Encargo restringido' });
      const asCae: any = await hc.personEntries(w.users.member.id, 2027, 6, w.users.cae);
      expect(asCae.entries.find((e: any) => e.id === entry.id).description).toBe('entrevista reservada');
      const req = await prisma.timeAdjustmentRequest.create({ data: { organizationId: w.org.id, userId: w.users.member.id, year: 2027, month: 6, action: 'EDIT' as any, timeEntryId: entry.id, payload: { description: 'texto reservado nuevo' }, reason: 'corrección' } });
      const listed: any[] = await hc.listAdjustments({} as any, w.users.manager);
      const row = listed.find((r) => r.id === req.id);
      expect(row.entry.description).toBeNull();
      expect(row.payload.description).toBeNull();
    });

    it('recurrencia: una auditoría normal no queda enlazada a un hallazgo de una investigación (ni siquiera si la crea el CAE)', async () => {
      const svc = new FindingsService(prisma as any);
      const word = `xilofonia${randomUUID().slice(0, 5)}`;
      const secret = await finding(w.inv.id, { title: `${word} irregular detectada` });
      const created: any = await svc.create({ auditId: w.nor.id, title: `${word} contable`, condition: 'c', criteria: 'k', cause: 'z', effect: 'e', severity: 'LOW' } as any, w.users.cae);
      const row = await prisma.finding.findUniqueOrThrow({ where: { id: created.id } });
      expect(row.previousFindingId).not.toBe(secret.id);
      expect(row.isRecurring).toBe(false);
    });

    it('vínculos anteriores a la regla «misma auditoría»: las lecturas ya no cruzan a otra auditoría', async () => {
      const wps = new WorkingPapersService(prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
      const graph = new PaperGraphService(prisma as any, { emit: () => undefined } as any);
      const refs = new PaperReferencesService(prisma as any);
      const mkPaper = (auditId: string, code: string) => prisma.workingPaper.create({ data: { auditId, code, indexSection: 'A', title: `Papel ${code}`, type: 'PLANNING_UNDERSTANDING' as any } });
      const pNor = await mkPaper(w.nor.id, 'L16-n'); const pInv = await mkPaper(w.inv.id, 'L16-i');
      // vínculos «viejos» creados directamente en la base, de la auditoría normal hacia la investigación
      await prisma.paperLink.create({ data: { sourceId: pInv.id, targetId: pNor.id, sourceField: 'S1.a', targetField: 'S1.b' } });
      await prisma.paperLink.create({ data: { sourceId: pNor.id, targetId: pInv.id, sourceField: 'S1.c', targetField: 'S1.d' } });
      await prisma.paperReference.create({ data: { sourcePaperId: pNor.id, sourceSectionKey: 'S1', targetPaperId: pInv.id, refType: 'INDEX' as any } });
      const pbcInv = await prisma.pbcRequest.create({ data: { auditId: w.inv.id, organizationId: w.org.id, title: 'Solicitud reservada', description: 'd', requestedToEmail: 'reservado@t.test', createdById: w.users.lead.id, dueDate: new Date('2030-01-01') } });
      await prisma.pbcPaperLink.create({ data: { pbcId: pbcInv.id, paperId: pNor.id, createdById: w.users.lead.id } });

      for (const who of ['outsider', 'manager', 'member', 'cae'] as const) {
        const u = w.users[who];
        const one: any = await wps.findOne(pNor.id, u);
        // el papel completo solo lista vínculos hacia auditorías que el usuario ve; el grafo, las referencias y las solicitudes PBC,
        // solo las del mismo encargo
        const canSeeInv = who === 'member' || who === 'cae';
        expect(one.sourceLinks).toHaveLength(canSeeInv ? 1 : 0); expect(one.targetLinks).toHaveLength(canSeeInv ? 1 : 0);
        const g: any = await graph.getGraphForPaper(pNor.id, u);
        expect(g.sources).toHaveLength(0); expect(g.targets).toHaveLength(0);
        expect(await refs.getReferencesForPaper(pNor.id, u)).toHaveLength(0);
        const pbcs: any = await wps.getPbcLinks(pNor.id, u);
        expect(JSON.stringify(pbcs)).not.toContain('reservado@t.test');
        expect(pbcs.linkedItems).toHaveLength(0);
        expect(await wps.getPbcLinksForPdf(pNor.id)).toHaveLength(0);
      }
    });
  });
});
