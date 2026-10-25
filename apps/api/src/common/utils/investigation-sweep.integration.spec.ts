/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'crypto';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

process.env.SUPABASE_URL ??= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'clave-de-prueba';

import { AuditFoldersService } from '../../audit-folders/audit-folders.service';
import { FindingsService } from '../../findings/findings.service';
import { ReportsService } from '../../reports/reports.service';

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
      expect(row.previousFindingId).toBe(seeded.nor.finding.id);
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
});
