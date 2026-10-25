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
});
