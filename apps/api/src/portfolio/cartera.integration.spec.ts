/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'crypto';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

process.env.SUPABASE_URL ??= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'clave-de-prueba';

import { ClientsService } from './clients.service';
import { AcceptanceService } from './acceptance.service';
import { ProposalsService } from './proposals.service';
import { EngagementLettersService } from './engagement-letters.service';
import { EngagementsService } from './engagements.service';
import { auditPeriodStartFor } from './engagement-readiness.util';
import { CreateProposalDto, UpdateProposalDto } from './dto/proposal.dto';
import { DecideAcceptanceDto, ReviewScreeningMatchDto } from './dto/acceptance.dto';

/**
 * Actividades previas y de prospección de la auditoría externa (revisión de Cartera, 2026-10-25) contra un Postgres REAL:
 * prospecto → Radar de aceptación → propuesta → carta de compromiso (NIA 210) → encargo → auditoría.
 *
 *   COLLECTIONS_TEST_DATABASE_URL=postgresql://postgres:test@localhost:54329/cobros_test npx jest cartera.integration
 */
const URL = process.env.COLLECTIONS_TEST_DATABASE_URL;
const suite = URL ? describe : describe.skip;
jest.setTimeout(120_000);

suite('Cartera · de prospecto a auditoría (Postgres real)', () => {
  let prisma: PrismaClient;
  let org: { id: string };
  let manager: any; let cae: any; let auditor: any;
  let clients: ClientsService; let acceptance: AcceptanceService; let proposals: ProposalsService;
  let letters: EngagementLettersService; let engagements: EngagementsService;
  // Lo que devuelve el motor de sanciones (se cambia por prueba); por defecto, sin coincidencias.
  let caatsResult: any = { findings: [], total_screened: 1, matches_found: 0 };
  const year = new Date().getFullYear();

  beforeAll(async () => {
    const sep = (URL as string).includes('?') ? '&' : '?';
    prisma = new PrismaClient({ datasourceUrl: `${URL}${sep}connection_limit=10&pool_timeout=30` });
    await prisma.$connect();
    const tag = `${Date.now().toString(36)}${randomUUID().slice(0, 6)}`;
    org = await prisma.organization.create({ data: { name: `Cartera ${tag}`, slug: `cartera-${tag}` } });
    const mk = async (role: any, name: string) => {
      const u = await prisma.user.create({ data: { organizationId: org.id, supabaseUserId: randomUUID(), email: `${name}-${tag}@t.test`, name, role } });
      return { id: u.id, supabaseUserId: u.supabaseUserId, email: u.email, name: u.name, role: u.role, organizationId: org.id, aiAssistantPersonality: 'ATHENA' };
    };
    manager = await mk('AUDIT_MANAGER', 'gerente'); cae = await mk('CAE', 'cae'); auditor = await mk('AUDITOR', 'auditor');
    // plantilla de sistema SIN `code` (como en las organizaciones sembradas antes de que existiera)
    await prisma.auditTemplate.create({
      data: {
        organizationId: org.id, name: 'Auditoría Financiera Externa v1.0', description: 'p', auditTypes: ['EXTERNAL', 'FINANCIAL'] as any,
        papers: [] as any, sections: [] as any, isDefault: true, isSystem: true, createdById: cae.id,
      },
    });
    clients = new ClientsService(prisma as any);
    acceptance = new AcceptanceService(prisma as any, clients, { runCaats: async () => caatsResult } as any);
    proposals = new ProposalsService(prisma as any, { get: () => '' } as any, clients);
    letters = new EngagementLettersService(prisma as any, { revokeActiveForTarget: async () => undefined } as any);
    engagements = new EngagementsService(prisma as any, clients, { scaffold: async () => undefined } as any, { initializeFromAuditTemplateSections: async () => undefined } as any);
  });
  afterAll(async () => { await prisma?.$disconnect(); });

  // ── utilidades del flujo ──────────────────────────────────────────────────
  const newClient = async (extra: any = {}) => clients.create({ legalName: `Cliente ${randomUUID().slice(0, 6)} SA`, ...extra } as any, manager);
  // Verificaciones previas resueltas (auditor predecesor, conflictos, servicios previos): sin ellas no se acepta ni se continúa.
  const resolvedChecklist = [
    { key: 'PREDECESSOR', item: 'x', status: 'NOT_APPLICABLE', comment: 'Cliente nuevo sin auditor predecesor: lo audita el despacho por primera vez.' },
    { key: 'CONFLICTS', item: 'x', status: 'DONE', comment: 'Se revisaron el socio, el equipo y sus familiares: sin conflictos.' },
    { key: 'PRIOR_SERVICES', item: 'x', status: 'DONE', comment: 'El despacho no presta otros servicios al cliente.' },
  ];
  /** Registro estructurado de la comunicación con el auditor predecesor (NIA 300 / IESBA 320). */
  const predecessorRecord = (y: number, o: any = {}) => ({ predecessorFirm: 'Pérez & Asociados', clientAuthorized: true, outcome: 'NO_MATTERS', responseDate: `${y}-01-12`, ...o });
  const greens = {
    independenceStatus: 'GREEN', competenceStatus: 'GREEN', integrityStatus: 'GREEN', riskStatus: 'GREEN', sanctionsStatus: 'GREEN',
    sanctionsNotes: 'El despacho no es sujeto obligado para este cliente.', checklist: resolvedChecklist,
  } as any;
  const decideGreen = async (clientId: string, extra: any = {}) => {
    const check = await acceptance.startAcceptance(clientId, manager);
    return acceptance.decide(check.id, { ...greens, overallJustification: 'Sin amenazas a la independencia ni a la integridad.', ...extra } as any, manager);
  };
  /** Cliente ya ACTIVO: aceptación decidida + propuesta aceptada + carta emitida y firmada. */
  const activeClient = async (fy = year) => {
    const c = await newClient({ taxId: undefined });
    await decideGreen(c.id);
    const p: any = await proposals.create({ clientId: c.id, feeAmount: 12500.5, fiscalPeriodEnd: `${fy}-12-31` } as any, manager);
    await proposals.send(p.id, manager); await proposals.accept(p.id, manager);
    const l: any = await letters.create({ proposalId: p.id, reportingFramework: 'NIIF_PYMES' } as any, manager);
    await letters.sign(l.id, { signedByClientName: 'Lic. Representante', signedByClientRole: 'Representante legal' } as any, manager);
    return { client: c, proposal: p, letter: l };
  };
  const draftEngagement = (clientId: string, fy = year, extra: any = {}) =>
    engagements.create({ clientId, fiscalYear: fy, fiscalYearEndDate: `${fy}-12-31`, ...extra } as any, manager);

  // ═══ El flujo completo y la plantilla ═══════════════════════════════════════════════════════════════
  it('prospecto → aceptación → propuesta → carta → encargo → auditoría; la plantilla sin `code` se resuelve por nombre y se repara', async () => {
    const { client, letter } = await activeClient();
    expect((await prisma.client.findUniqueOrThrow({ where: { id: client.id } })).status).toBe('ACTIVE');
    const eng = await draftEngagement(client.id);
    expect((await prisma.auditTemplate.findFirstOrThrow({ where: { organizationId: org.id, isSystem: true } })).code).toBeNull();
    const approved: any = await engagements.approve(eng.id, manager);
    expect(approved.status).toBe('APPROVED');
    expect(approved.auditId).toBeTruthy();
    // el encargo quedó respaldado por la carta firmada, y la plantilla recibió su código estable
    expect(approved.engagementLetterId).toBe(letter.id);
    expect((await prisma.auditTemplate.findFirstOrThrow({ where: { organizationId: org.id, isSystem: true } })).code).toBe('AUDIT_EXTERNAL_FINANCIAL_V1');
    const audit = await prisma.audit.findUniqueOrThrow({ where: { id: approved.auditId } });
    expect(audit.type).toBe('EXTERNAL_FINANCIAL');
  });

  // ═══ Aprobar exige carta firmada, continuidad del ejercicio y cliente activo ═════════════════════════
  it('no se aprueba un encargo sin carta firmada, sin aceptación decidida del ejercicio o con el cliente declinado', async () => {
    // cliente ACTIVO a la fuerza, sin carta ni Radar (como si se hubiera saltado el flujo)
    const c = await newClient();
    await prisma.client.update({ where: { id: c.id }, data: { status: 'ACTIVE' } });
    const e1 = await draftEngagement(c.id);
    await expect(engagements.approve(e1.id, manager)).rejects.toThrow(/carta de compromiso firmada/);

    // con carta firmada pero SIN Radar decidido
    const letterOnly = await newClient();
    const prop = await prisma.proposal.create({ data: { organizationId: org.id, clientId: letterOnly.id, year, createdById: manager.id, status: 'ACCEPTED' } });
    await prisma.engagementLetter.create({ data: { organizationId: org.id, clientId: letterOnly.id, proposalId: prop.id, year, content: 'x', status: 'SIGNED', signedAt: new Date(), createdById: manager.id } });
    await prisma.client.update({ where: { id: letterOnly.id }, data: { status: 'ACTIVE' } });
    const e2 = await draftEngagement(letterOnly.id);
    await expect(engagements.approve(e2.id, manager)).rejects.toThrow(/evaluación de aceptación/);

    // la evaluación es de un ejercicio anterior al que se audita → falta la continuidad
    const old = await activeClient(year);
    await prisma.acceptanceCheck.updateMany({ where: { clientId: old.client.id }, data: { year: year - 2 } });
    const e3 = await draftEngagement(old.client.id);
    await expect(engagements.approve(e3.id, manager)).rejects.toThrow(/continuidad/);

    // cliente declinado después de crear el borrador
    const declined = await activeClient();
    const e4 = await draftEngagement(declined.client.id);
    await prisma.client.update({ where: { id: declined.client.id }, data: { status: 'DECLINED' } });
    await expect(engagements.approve(e4.id, manager)).rejects.toThrow(/declinado/);
    expect(await prisma.audit.count({ where: { organizationId: org.id, title: { contains: declined.client.legalName } } })).toBe(0);
  });

  it('el período de la auditoría empieza el día siguiente al cierre del ejercicio anterior (no siempre el 1 de enero)', () => {
    expect(auditPeriodStartFor(new Date('2025-12-31')).toISOString().slice(0, 10)).toBe('2025-01-01');
    expect(auditPeriodStartFor(new Date('2025-06-30')).toISOString().slice(0, 10)).toBe('2024-07-01');
    expect(auditPeriodStartFor(new Date('2024-02-29')).toISOString().slice(0, 10)).toBe('2023-03-01');
  });

  it('un encargo con cierre al 30 de junio queda con período de julio a junio', async () => {
    const { client } = await activeClient(year);
    const eng = await engagements.create({ clientId: client.id, fiscalYear: year, fiscalYearEndDate: `${year}-06-30` } as any, manager);
    const approved: any = await engagements.approve(eng.id, manager);
    const audit = await prisma.audit.findUniqueOrThrow({ where: { id: approved.auditId } });
    expect(audit.auditPeriodStart!.toISOString().slice(0, 10)).toBe(`${year - 1}-07-01`);
    expect(audit.auditPeriodEnd!.toISOString().slice(0, 10)).toBe(`${year}-06-30`);
  });

  it('el cierre del ejercicio debe caer en el ejercicio, y el socio debe ser un usuario activo con rol de gerente o superior', async () => {
    const { client } = await activeClient();
    await expect(engagements.create({ clientId: client.id, fiscalYear: year, fiscalYearEndDate: `${year + 1}-12-31` } as any, manager)).rejects.toThrow(/no corresponde al ejercicio/);
    await expect(engagements.create({ clientId: client.id, fiscalYear: year, fiscalYearEndDate: `${year}-12-31`, leadPartnerId: auditor.id } as any, manager)).rejects.toThrow(/rol de gerente o superior/);
    await expect(engagements.create({ clientId: client.id, fiscalYear: year, fiscalYearEndDate: `${year}-12-31`, leadPartnerId: cae.id } as any, manager)).resolves.toBeDefined();
  });

  // ═══ La decisión del Radar es definitiva ════════════════════════════════════════════════════════
  it('«Decidir» usa lo que el usuario ve en pantalla, no lo último guardado', async () => {
    const c = await newClient();
    const check = await acceptance.startAcceptance(c.id, manager);
    await acceptance.update(check.id, greens, manager);                       // todo en verde guardado...
    const decided = await acceptance.decide(check.id, { ...greens, integrityStatus: 'RED', integrityNotes: 'Antecedentes graves', overallJustification: 'No se acepta el encargo.' } as any, manager); // ...pero en pantalla Integridad está en rojo
    expect(decided.overallResult).toBe('RED');
    expect(decided.integrityNotes).toBe('Antecedentes graves');
    expect((await prisma.client.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('DECLINED');
  });

  it('una decisión tomada no se edita, no se vuelve a decidir ni se vuelve a correr el screening; un CAE puede reabrirla con motivo', async () => {
    const c = await newClient();
    const decided: any = await decideGreen(c.id);
    await expect(acceptance.update(decided.id, { riskStatus: 'RED' } as any, manager)).rejects.toThrow(/definitivo/);
    await expect(acceptance.decide(decided.id, { overallJustification: 'otra vez, otra decisión' } as any, manager)).rejects.toThrow(/definitivo/);
    await expect(acceptance.screenSanctions(decided.id, manager)).rejects.toThrow(/definitivo/);
    const reopened: any = await acceptance.reopen(decided.id, { reason: 'Apareció información nueva sobre el cliente' }, cae);
    expect(reopened.decidedAt).toBeNull();
    expect(reopened.overallResult).toBe('PENDING');
    expect(reopened.overallJustification).toContain('Reabierto por cae');
    expect(reopened.overallJustification).toContain('Decisión anterior: GREEN');
    await expect(acceptance.reopen(decided.id, { reason: 'ya está abierto, no aplica' }, cae)).rejects.toThrow(/todavía no se ha decidido/);
  });

  it('la justificación y la nota de Sanciones/PLD son obligatorias; las coincidencias del screening exigen explicarlas', async () => {
    const c = await newClient();
    const check = await acceptance.startAcceptance(c.id, manager);
    await expect(acceptance.decide(check.id, { ...greens, sanctionsNotes: '   ', overallJustification: 'Justificación suficiente.' } as any, manager)).rejects.toThrow(/sujeto obligado/);
    await prisma.acceptanceCheck.update({ where: { id: check.id }, data: { sanctionsScreeningResult: { findings: [{ risk_level: 'CRITICAL' }], total_screened: 2, matches_found: 1 } } });
    await expect(acceptance.decide(check.id, { ...greens, sanctionsNotes: '', overallJustification: 'Justificación suficiente.' } as any, manager)).rejects.toThrow(/coincidencias/);
    // DTO: la justificación vacía o muy corta no pasa la validación
    for (const bad of ['', '   ', 'corta']) {
      const errs = await validate(plainToInstance(DecideAcceptanceDto, { overallJustification: bad }));
      expect(errs.some((e) => e.property === 'overallJustification')).toBe(true);
    }
  });

  it('el screening deja constancia de quién lo corrió, cuándo y qué nombres revisó', async () => {
    const c = await newClient({ legalRepName: 'Roberto Morales' });
    const check = await acceptance.startAcceptance(c.id, manager);
    const screened: any = await acceptance.screenSanctions(check.id, manager);
    const r = screened.sanctionsScreeningResult;
    expect(r.screenedById).toBe(manager.id);
    expect(r.screenedByName).toBe('gerente');
    expect(new Date(r.screenedAt).getTime()).toBeGreaterThan(Date.now() - 60_000);
    expect(r.namesChecked).toEqual([c.legalName, 'Roberto Morales']);
  });

  it('una decisión Roja cierra las propuestas por responder y las cartas por firmar, y firmar ya no reactiva al cliente declinado', async () => {
    const c = await newClient();
    const check = await acceptance.startAcceptance(c.id, manager);
    await acceptance.update(check.id, greens, manager);
    const p: any = await proposals.create({ clientId: c.id } as any, manager).catch(async () => {
      // el Radar aún no está decidido: se decide verde para poder emitir, y luego se reabre y se declina
      await acceptance.decide(check.id, { ...greens, overallJustification: 'Aceptación inicial del cliente.' } as any, manager);
      return proposals.create({ clientId: c.id } as any, manager);
    });
    await proposals.send(p.id, manager); await proposals.accept(p.id, manager);
    const l: any = await letters.create({ proposalId: p.id } as any, manager);            // carta emitida, sin firmar
    const p2: any = await prisma.proposal.create({ data: { organizationId: org.id, clientId: c.id, year, createdById: manager.id, status: 'SENT' } });
    // el CAE reabre y declina
    await acceptance.reopen(check.id, { reason: 'Se conoció un conflicto de intereses grave' }, cae);
    await acceptance.decide(check.id, { ...greens, independenceStatus: 'RED', overallJustification: 'Amenaza a la independencia sin salvaguardas.' } as any, cae);
    expect((await prisma.client.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('DECLINED');
    expect((await prisma.proposal.findUniqueOrThrow({ where: { id: p2.id } })).status).toBe('REJECTED');
    expect((await prisma.engagementLetter.findUniqueOrThrow({ where: { id: l.id } })).status).toBe('DECLINED');
    await expect(letters.sign(l.id, { signedByClientName: 'Lic. X', signedByClientRole: 'Rep.' } as any, manager)).rejects.toThrow(/rechazada|declinado/);
    expect((await prisma.client.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('DECLINED');
  });

  // ═══ Estado del cliente y datos ═════════════════════════════════════════════════════════════════
  it('un cliente ACTIVO no retrocede al crear o rechazar otra propuesta ni al emitir otra carta', async () => {
    const { client } = await activeClient();
    const p: any = await proposals.create({ clientId: client.id } as any, manager);
    expect((await prisma.client.findUniqueOrThrow({ where: { id: client.id } })).status).toBe('ACTIVE');
    await proposals.send(p.id, manager);
    await proposals.reject(p.id, manager);
    expect((await prisma.client.findUniqueOrThrow({ where: { id: client.id } })).status).toBe('ACTIVE');
    const p2: any = await proposals.create({ clientId: client.id } as any, manager);
    await proposals.send(p2.id, manager); await proposals.accept(p2.id, manager);
    await letters.create({ proposalId: p2.id } as any, manager);
    expect((await prisma.client.findUniqueOrThrow({ where: { id: client.id } })).status).toBe('ACTIVE');
    // y puede registrar su encargo del año
    await expect(draftEngagement(client.id)).resolves.toBeDefined();
  });

  it('«Guardar» una propuesta sin fechas no falla (el formulario manda cadenas vacías)', async () => {
    for (const Dto of [CreateProposalDto, UpdateProposalDto] as const) {
      const body: any = { fiscalPeriodStart: '', fiscalPeriodEnd: '', scope: 'alcance', ...(Dto === CreateProposalDto ? { clientId: 'c1' } : {}) };
      const dto: any = plainToInstance(Dto as any, body);
      expect(dto.fiscalPeriodStart).toBeUndefined();
      expect((await validate(dto)).filter((e) => e.property.startsWith('fiscalPeriod'))).toHaveLength(0);
    }
    const money = plainToInstance(CreateProposalDto, { clientId: 'c1', feeAmount: 100.123 });
    expect((await validate(money)).some((e) => e.property === 'feeAmount')).toBe(true);
  });

  it('la carta nombra el marco de información financiera, el ejercicio auditado y va al representante legal', async () => {
    const c = await newClient({ legalRepName: 'Roberto Morales', contactName: 'Asistente' });
    await decideGreen(c.id);
    const p: any = await proposals.create({ clientId: c.id, fiscalPeriodStart: `${year - 1}-01-01`, fiscalPeriodEnd: `${year - 1}-12-31` } as any, manager);
    await proposals.send(p.id, manager); await proposals.accept(p.id, manager);
    const withFramework: any = await letters.create({ proposalId: p.id, reportingFramework: 'NIIF_COMPLETAS' } as any, manager);
    expect(withFramework.content).toContain('de conformidad con las Normas Internacionales de Información Financiera (NIIF completas)');
    expect(withFramework.content).toContain('Atención: Roberto Morales');
    expect(withFramework.content).toContain(`efectiva para el ejercicio ${year - 1}`);
    expect(withFramework.content).not.toContain('IDENTIFICAR EL MARCO');
    // sin marco indicado, la carta lo deja marcado para completar
    const p3: any = await prisma.proposal.create({ data: { organizationId: org.id, clientId: c.id, year, createdById: manager.id, status: 'ACCEPTED' } });
    const without: any = await letters.create({ proposalId: p3.id } as any, manager);
    expect(without.content).toContain('IDENTIFICAR EL MARCO');
  });

  it('no se registra dos veces el mismo NIT (con o sin guiones), aunque el primero esté declinado', async () => {
    const taxId = `0614-${Math.floor(100000 + Math.random() * 899999)}-101-7`;
    const first = await newClient({ taxId });
    await expect(newClient({ taxId: taxId.replace(/-/g, '') })).rejects.toBeInstanceOf(ConflictException);
    await prisma.client.update({ where: { id: first.id }, data: { status: 'DECLINED' } });
    await expect(newClient({ taxId })).rejects.toThrow(/declinado/);
    // editar a un NIT ya usado también se rechaza; dejar el propio NIT no
    const other = await newClient({ taxId: `9999-${Math.floor(100000 + Math.random() * 899999)}-000-0` });
    await expect(clients.update(other.id, { taxId } as any, manager)).rejects.toBeInstanceOf(ConflictException);
    await expect(clients.update(first.id, { taxId } as any, manager)).resolves.toBeDefined();
    // razón social vacía
    const errs = await validate(plainToInstance((await import('./dto/client.dto')).CreateClientDto, { legalName: '   ' }));
    expect(errs.some((e) => e.property === 'legalName')).toBe(true);
  });

  it('un cliente declinado puede volver a evaluarse en un año nuevo (se reinicia a «En aceptación») pero no en el mismo año', async () => {
    const c = await newClient();
    const check = await acceptance.startAcceptance(c.id, manager);
    await acceptance.decide(check.id, { ...greens, riskStatus: 'RED', overallJustification: 'Riesgo inaceptable del encargo.' } as any, manager);
    expect((await prisma.client.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('DECLINED');
    await acceptance.startAcceptance(c.id, manager); // mismo año: devuelve el Radar ya decidido y NO reactiva al cliente
    expect((await prisma.client.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('DECLINED');
  });

  // ═══ Lote B: verificaciones previas, screening por coincidencia, estados derivados, horas estimadas ═══════════
  it('el Radar nuevo trae las tres verificaciones previas; un cliente de continuidad trae la del auditor predecesor como «No aplica»', async () => {
    const c = await newClient();
    const check: any = await acceptance.startAcceptance(c.id, manager);
    expect(check.checklist.map((i: any) => [i.key, i.status])).toEqual([['PREDECESSOR', 'PENDING'], ['CONFLICTS', 'PENDING'], ['PRIOR_SERVICES', 'PENDING']]);
    expect(check.checklist[0].item).toMatch(/auditor predecesor/);

    const c2 = await newClient();
    await prisma.engagement.create({ data: { organizationId: org.id, clientId: c2.id, fiscalYear: year - 1, fiscalYearEndDate: new Date(`${year - 1}-12-31`), status: 'APPROVED', createdById: manager.id } });
    const check2: any = await acceptance.startAcceptance(c2.id, manager);
    expect(check2.checklist[0]).toMatchObject({ key: 'PREDECESSOR', status: 'NOT_APPLICABLE' });
    expect(check2.checklist[0].comment).toContain(String(year - 1));
    expect(check2.checklist[1].status).toBe('PENDING');
  });

  it('aceptar o continuar exige resolver las tres verificaciones; declinar no; «Hecho» y «No aplica» exigen su constancia', async () => {
    const c = await newClient();
    const check = await acceptance.startAcceptance(c.id, manager);
    const { checklist: _omit, ...base } = greens;
    const just = { overallJustification: 'Sin amenazas a la independencia ni a la integridad.' };
    await expect(acceptance.decide(check.id, { ...base, ...just } as any, manager)).rejects.toThrow(/verificaciones previas[\s\S]*auditor predecesor/);

    const done = 'Se solicitó por correo al Lic. Pérez y respondió que no hay asuntos pendientes.';
    await expect(acceptance.update(check.id, { checklist: [{ key: 'CONFLICTS', item: 'x', status: 'DONE', comment: 'ok' }] } as any, manager)).rejects.toThrow(/describe qué se hizo/);
    await expect(acceptance.update(check.id, { checklist: [{ key: 'PREDECESSOR', item: 'x', status: 'DONE', comment: done }] } as any, manager)).rejects.toThrow(/fecha de la solicitud/);
    await expect(acceptance.update(check.id, { checklist: [{ key: 'PREDECESSOR', item: 'x', status: 'DONE', date: '2999-01-01', comment: done }] } as any, manager)).rejects.toThrow(/futura/);
    await expect(acceptance.update(check.id, { checklist: [{ key: 'CONFLICTS', item: 'x', status: 'NOT_APPLICABLE', comment: 'no' }] } as any, manager)).rejects.toThrow(/por qué no aplica/);

    // se guarda de a poco; el texto de los ítems fijos lo pone el servidor
    const saved: any = await acceptance.update(check.id, { checklist: [{ key: 'PREDECESSOR', item: 'texto del cliente', status: 'DONE', date: `${year}-01-05`, comment: done, ...predecessorRecord(year) }] } as any, manager);
    expect(saved.checklist).toHaveLength(3);
    expect(saved.checklist[0]).toMatchObject({ status: 'DONE', date: `${year}-01-05`, predecessorFirm: 'Pérez & Asociados', clientAuthorized: true, outcome: 'NO_MATTERS', responseDate: `${year}-01-12` });
    expect(saved.checklist[0].item).toMatch(/NIA 300/);
    expect(saved.checklist[1].status).toBe('PENDING');
    await expect(acceptance.decide(check.id, { ...base, ...just } as any, manager)).rejects.toThrow(/Conflictos de interés del socio y el equipo; Servicios previos al cliente/);

    // declinar al cliente no exige completarlas
    const red: any = await acceptance.decide(check.id, { ...base, independenceStatus: 'RED', overallJustification: 'Amenaza a la independencia sin salvaguardas.' } as any, manager);
    expect(red.overallResult).toBe('RED');
    expect(red.checklist[0]).toMatchObject({ status: 'DONE' }); // lo guardado se conserva

    // el DTO rechaza una clave, un estado o una fecha inventados
    const { AcceptanceChecklistItemDto } = await import('./dto/acceptance.dto');
    for (const bad of [{ item: 'x', key: 'OTRA' }, { item: 'x', status: 'QUIZAS' }, { item: 'x', key: 'CONFLICTS', date: '5/1/2026' }]) {
      expect((await validate(plainToInstance(AcceptanceChecklistItemDto, bad))).length).toBeGreaterThan(0);
    }
  });

  it('el auditor predecesor «Hecho» exige su registro: firma, autorización del cliente, resultado y fecha de la respuesta', async () => {
    const c = await newClient();
    const check = await acceptance.startAcceptance(c.id, manager);
    const done = 'Se solicitó por correo al Lic. Pérez y respondió que no hay asuntos pendientes.';
    const put = (extra: any) => acceptance.update(check.id, { checklist: [{ key: 'PREDECESSOR', item: 'x', status: 'DONE', date: `${year}-01-05`, comment: done, ...extra }] } as any, manager) as Promise<any>;

    await expect(put({})).rejects.toThrow(/auditor o la firma predecesora/);
    await expect(put({ predecessorFirm: 'Pérez & Asociados', outcome: 'NO_MATTERS', responseDate: `${year}-01-12` })).rejects.toThrow(/autorizó la comunicación/);
    await expect(put({ predecessorFirm: 'Pérez & Asociados', clientAuthorized: false, outcome: 'NO_MATTERS', responseDate: `${year}-01-12` })).rejects.toThrow(/autorizó la comunicación/);
    await expect(put({ predecessorFirm: 'Pérez & Asociados', clientAuthorized: true })).rejects.toThrow(/indica el resultado/);
    await expect(put({ predecessorFirm: 'Pérez & Asociados', clientAuthorized: true, outcome: 'NO_MATTERS' })).rejects.toThrow(/fecha de la respuesta/);
    await expect(put(predecessorRecord(year, { responseDate: `${year}-01-02` }))).rejects.toThrow(/anterior a la solicitud/);
    await expect(put(predecessorRecord(year, { responseDate: '2999-01-01' }))).rejects.toThrow(/respuesta no puede ser futura/);
    await expect(put(predecessorRecord(year, { predecessorFirm: 'ab' }))).rejects.toThrow(/auditor o la firma predecesora/);

    // sin respuesta no hay fecha de respuesta; si se manda, no se conserva
    const noReply = await put(predecessorRecord(year, { outcome: 'NO_RESPONSE' }));
    expect(noReply.checklist[0]).toMatchObject({ status: 'DONE', outcome: 'NO_RESPONSE', predecessorFirm: 'Pérez & Asociados' });
    expect(noReply.checklist[0].responseDate).toBeUndefined();
    // con asuntos señalados: se guarda tal cual
    const noted = await put(predecessorRecord(year, { outcome: 'MATTERS_NOTED' }));
    expect(noted.checklist[0]).toMatchObject({ outcome: 'MATTERS_NOTED', responseDate: `${year}-01-12`, clientAuthorized: true });

    // pasar a «No aplica» suelta el registro: ya no hay comunicación que documentar
    const na: any = await acceptance.update(check.id, { checklist: [{ key: 'PREDECESSOR', item: 'x', status: 'NOT_APPLICABLE', comment: 'Cliente nuevo sin auditor predecesor.' }] } as any, manager);
    expect(na.checklist[0].status).toBe('NOT_APPLICABLE');
    for (const k of ['predecessorFirm', 'clientAuthorized', 'outcome', 'responseDate']) expect(na.checklist[0][k]).toBeUndefined();
    // los otros ítems no llevan el registro aunque lo manden
    const other: any = await acceptance.update(check.id, { checklist: [{ key: 'CONFLICTS', item: 'x', status: 'DONE', comment: 'Se revisaron el socio y el equipo.', predecessorFirm: 'Intruso', outcome: 'NO_MATTERS' }] } as any, manager);
    expect(other.checklist[1].predecessorFirm).toBeUndefined();
    expect(other.checklist[1].outcome).toBeUndefined();

    // el DTO rechaza un resultado inventado, una autorización que no es booleana y una fecha mal escrita
    const { AcceptanceChecklistItemDto } = await import('./dto/acceptance.dto');
    for (const bad of [{ item: 'x', key: 'PREDECESSOR', outcome: 'TAL_VEZ' }, { item: 'x', key: 'PREDECESSOR', clientAuthorized: 'sí' }, { item: 'x', key: 'PREDECESSOR', responseDate: '12/1/2026' }]) {
      expect((await validate(plainToInstance(AcceptanceChecklistItemDto, bad))).length).toBeGreaterThan(0);
    }
    expect((await validate(plainToInstance(AcceptanceChecklistItemDto, { item: 'x', key: 'PREDECESSOR', clientAuthorized: false, outcome: 'NO_RESPONSE', predecessorFirm: 'Pérez' }))).length).toBe(0);
  });

  it('screening: cada coincidencia se revisa (falso positivo o confirmada, con motivo); una confirmada obliga a Rojo; volver a correrlo conserva lo revisado', async () => {
    const c = await newClient({ legalRepName: 'Roberto Morales' });
    const check = await acceptance.startAcceptance(c.id, manager);
    const record = (u: string, m: string, list = 'OFAC SDN') => ({ uploaded_name: u, matched_watchlist_name: m, match_type: 'fuzzy', score: 91, source_list: list });
    caatsResult = {
      total_screened: 2, matches_found: 2, risk_score: 80, lists_consulted: 'OFAC · ONU',
      findings: [{ test_name: 's', risk_level: 'CRITICAL', record_count: 2, description: 'd',
        sample_records: [record('Roberto Morales', 'ROBERTO MORALES GOMEZ'), record(c.legalName, 'EMPRESA SANCIONADA SA', 'ONU')] }],
    };
    try {
      const screened: any = await acceptance.screenSanctions(check.id, manager);
      const m = screened.sanctionsScreeningResult.matches;
      expect(m).toHaveLength(2);
      expect(m.every((x: any) => x.review === null)).toBe(true);
      const at = screened.sanctionsScreeningResult.screenedAt;
      const justification = { overallJustification: 'Justificación suficiente de la decisión.' };

      await expect(acceptance.decide(check.id, { ...greens, ...justification } as any, manager)).rejects.toThrow(/Faltan por revisar 2 coincidencia/);

      // el motivo es obligatorio (DTO), el screening debe ser el vigente y la coincidencia debe existir
      const errs = await validate(plainToInstance(ReviewScreeningMatchDto, { screenedAt: at, matchKey: m[0].key, decision: 'FALSE_POSITIVE', reason: 'corta' }));
      expect(errs.some((e) => e.property === 'reason')).toBe(true);
      const review = (matchKey: string, decision: string, reason: string, screenedAt = at, who = manager) =>
        acceptance.reviewScreeningMatch(check.id, { screenedAt, matchKey, decision, reason } as any, who);
      await expect(review(m[0].key, 'FALSE_POSITIVE', 'Homónimo: otra fecha de nacimiento.', 'otra-corrida')).rejects.toBeInstanceOf(ConflictException);
      await expect(review('no-existe', 'FALSE_POSITIVE', 'Homónimo: otra fecha de nacimiento.')).rejects.toThrow(/ya no está/);

      await review(m[0].key, 'FALSE_POSITIVE', 'Homónimo: distinta fecha de nacimiento y nacionalidad.');
      const after: any = await review(m[1].key, 'CONFIRMED', 'Es la misma entidad sancionada por la ONU.', at, cae);
      expect(after.sanctionsScreeningResult.matches.map((x: any) => x.review?.decision)).toEqual(['FALSE_POSITIVE', 'CONFIRMED']);
      expect(after.sanctionsScreeningResult.matches[0].review).toMatchObject({ byName: 'gerente', reason: expect.stringContaining('Homónimo') });

      // una coincidencia confirmada obliga a que Sanciones/PLD sea Rojo
      await expect(acceptance.decide(check.id, { ...greens, ...justification } as any, manager)).rejects.toThrow(/Rojo/);

      // volver a correr el screening conserva la revisión de las coincidencias que siguen siendo las mismas
      const again: any = await acceptance.screenSanctions(check.id, manager);
      expect(again.sanctionsScreeningResult.matches.map((x: any) => x.review?.decision)).toEqual(['FALSE_POSITIVE', 'CONFIRMED']);

      // con Sanciones en Rojo se declina sin tener que revisar una por una
      const red: any = await acceptance.decide(check.id, { ...greens, sanctionsStatus: 'RED', ...justification } as any, manager);
      expect(red.overallResult).toBe('RED');
      await expect(review(m[0].key, 'CONFIRMED', 'Cambio de opinión posterior a la decisión.', again.sanctionsScreeningResult.screenedAt)).rejects.toThrow(/definitivo/);
    } finally {
      caatsResult = { findings: [], total_screened: 1, matches_found: 0 };
    }
  });

  it('un cliente ACTIVO sin carta firmada ni encargo reciente se marca inactivo; lo enviado sin respuesta se marca «sin respuesta»; un Radar antiguo muestra los tres ítems', async () => {
    const { client } = await activeClient();
    const dormantClient = await newClient();
    await prisma.client.update({ where: { id: dormantClient.id }, data: { status: 'ACTIVE' } });
    const prospect = await newClient(); // PROSPECT: solo los ACTIVOS se evalúan
    const list: any[] = await clients.findAll(manager);
    expect(list.find((x) => x.id === client.id).dormant).toBe(false);
    expect(list.find((x) => x.id === dormantClient.id).dormant).toBe(true);
    expect(list.find((x) => x.id === prospect.id).dormant).toBe(false);

    const stale = await prisma.proposal.create({ data: { organizationId: org.id, clientId: dormantClient.id, year, createdById: manager.id, status: 'SENT', sentAt: new Date(Date.now() - 90 * 86_400_000) } });
    const recent = await prisma.proposal.create({ data: { organizationId: org.id, clientId: dormantClient.id, year, createdById: manager.id, status: 'SENT', sentAt: new Date(Date.now() - 5 * 86_400_000) } });
    await prisma.acceptanceCheck.create({ data: { organizationId: org.id, clientId: dormantClient.id, year, checklist: [] } });
    const detail: any = await clients.findOne(dormantClient.id, manager);
    expect(detail.dormant).toBe(true);
    expect(detail.proposals.find((p: any) => p.id === stale.id).stale).toBe(true);
    expect(detail.proposals.find((p: any) => p.id === recent.id).stale).toBe(false);
    expect(detail.acceptanceChecks[0].checklist).toHaveLength(3);
  });

  it('al aprobar el encargo, las horas estimadas de la auditoría son las del equipo propuesto', async () => {
    const c = await newClient();
    await decideGreen(c.id);
    const p: any = await proposals.create({
      clientId: c.id, feeAmount: 5000, fiscalPeriodEnd: `${year}-12-31`,
      teamJson: [{ name: 'Ana', role: 'Senior', hours: 120 }, { name: 'Beto', hours: 80.5 }, { name: 'Sin horas' }, { name: 'Negativas', hours: -5 }],
    } as any, manager);
    await proposals.send(p.id, manager); await proposals.accept(p.id, manager);
    const l: any = await letters.create({ proposalId: p.id, reportingFramework: 'NIIF_PYMES' } as any, manager);
    await letters.sign(l.id, { signedByClientName: 'Lic. Representante', signedByClientRole: 'Representante legal' } as any, manager);
    const approved: any = await engagements.approve((await draftEngagement(c.id)).id, manager);
    expect((await prisma.audit.findUniqueOrThrow({ where: { id: approved.auditId } })).estimatedHours).toBe(200.5);
  });
});
