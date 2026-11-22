/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';

/**
 * Medición de descargas contra un Postgres REAL (con 2026-11-suscripciones-3-descargas.sql aplicado):
 *
 *   COLLECTIONS_TEST_DATABASE_URL=postgresql://postgres:test@127.0.0.1:54329/cobros_test node ../../node_modules/jest/bin/jest.js storage-egress.integration
 *
 * Reconstruir la base de pruebas si está vacía: python infrastructure/test-db/rebuild_test_db.py
 */
const URL = process.env.COLLECTIONS_TEST_DATABASE_URL;
const suite = URL ? describe : describe.skip;
jest.setTimeout(120_000);

const MB = 1024 * 1024;
const GB = 1024 ** 3;
const PUBLIC = 'https://proyecto.supabase.co/storage/v1/object/public/audit-files/';
// Días fijos del pasado: no chocan con el mes en curso de otras suites.
const D1 = new Date('2026-03-15T12:00:00Z');
const D2 = new Date('2026-03-16T12:00:00Z');

suite('descargas por organización contra Postgres real', () => {
  let prisma: PrismaClient;
  let StorageEgressService: any;
  const orgs: string[] = [];

  beforeAll(async () => {
    process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
    process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';
    prisma = new PrismaClient({ datasourceUrl: URL });
    await prisma.$connect();
    ({ StorageEgressService } = await import('./storage-egress.service'));
  });

  afterAll(async () => {
    // La evidencia de campo y los documentos de solicitud no caen en cascada con la auditoría: se borran primero.
    await prisma.fieldEvidence.deleteMany({ where: { audit: { organizationId: { in: orgs } } } });
    await prisma.auditRequestDocument.deleteMany({ where: { audit: { organizationId: { in: orgs } } } });
    await prisma.audit.deleteMany({ where: { organizationId: { in: orgs } } }); // papeles, secciones, pasos y su evidencia caen en cascada
    await prisma.organization.deleteMany({ where: { id: { in: orgs } } }); // storage_egress_daily cae en cascada
    await prisma.$disconnect();
  });

  /** El servicio con un «firmador» de mentira que solo guarda al oyente, y la configuración que se pida. */
  const make = (env: Record<string, string> = { EGRESS_METER_ENABLED: 'true' }, db: any = prisma) => {
    const host: any = { listener: null, addIssuedListener(fn: any) { this.listener = fn; } };
    const svc = new StorageEgressService(db, { get: () => host }, { get: (k: string) => env[k] });
    return { svc, host };
  };
  const newOrg = async () => {
    const id = randomUUID();
    const org = await prisma.organization.create({ data: { name: `Prueba descargas ${id}`, slug: `eg-${id}` } });
    orgs.push(org.id);
    return org.id;
  };
  const mkAudit = async (organizationId: string) => {
    const uid = randomUUID();
    const lead = await prisma.user.create({ data: { organizationId, supabaseUserId: uid, email: `${uid}@t.test`, name: 'Líder', role: 'AUDIT_MANAGER' as any } });
    const audit = await prisma.audit.create({ data: { organizationId, title: 'Auditoría de prueba', type: 'OPERATIONAL', leadAuditorId: lead.id } });
    return { audit, lead };
  };
  const evidence = (auditId: string, leadId: string, kind: any, mime: string, name: string, size: number, storageKey = `evidence/${randomUUID()}`) =>
    prisma.fieldEvidence.create({ data: { auditId, sectionKey: 's1', kind, sha256: randomUUID(), capturedById: leadId, capturedByName: 'x', capturedAt: new Date(), storageKey, filename: name, mimeType: mime, size } }).then(() => storageKey);
  const rows = (organizationId: string) => prisma.storageEgressDaily.findMany({ where: { organizationId }, orderBy: [{ day: 'asc' }, { fileType: 'asc' }] });
  const asDay = (r: { day: Date }) => r.day.toISOString().slice(0, 10);

  describe('de dónde sale el tamaño de cada archivo', () => {
    it('evidencia de campo: por la ruta, con su tipo y tamaño', async () => {
      const org = await newOrg(); const { audit, lead } = await mkAudit(org);
      const path = await evidence(audit.id, lead.id, 'SHORT_VIDEO', 'video/mp4', 'visita.mp4', 300 * MB);
      const found = await make().svc.lookupFiles([path, 'evidence/no-existe-1234/x.pdf']);
      expect(found).toEqual([{ path, mime: 'video/mp4', name: 'visita.mp4', bytes: 300 * MB }]);
    });

    it('documentos de solicitud: la ruta sale de la URL pública, también con espacios y tildes codificados', async () => {
      const org = await newOrg(); const { audit, lead } = await mkAudit(org);
      const plain = `request-docs/${audit.id}/mayor.xlsx`;
      const spaced = `request-docs/${audit.id}/Informe final ñandú.pdf`;
      const enc = spaced.split('/').map(encodeURIComponent).join('/');
      await prisma.auditRequestDocument.create({ data: { auditId: audit.id, uploadedById: lead.id, filename: 'mayor.xlsx', originalName: 'Mayor.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', fileSize: 8 * MB, fileUrl: `${PUBLIC}${plain}` } });
      await prisma.auditRequestDocument.create({ data: { auditId: audit.id, uploadedById: lead.id, filename: 'informe.pdf', originalName: 'Informe final.pdf', mimeType: 'application/pdf', fileSize: 3 * MB, fileUrl: `${PUBLIC}${enc}` } });
      const found = await make().svc.lookupFiles([plain, spaced]); // el firmador entrega la ruta ya decodificada
      expect(found.map((f: any) => [f.path, f.bytes]).sort()).toEqual([[plain, 8 * MB], [spaced, 3 * MB]].sort());
    });

    it('papeles de trabajo (por su URL) y evidencia de pasos (por su ruta)', async () => {
      const org = await newOrg(); const { audit } = await mkAudit(org);
      const paperPath = `${audit.id}/papel-1.docx`;
      const wp = await prisma.workingPaper.create({ data: { auditId: audit.id, code: 'A-1', indexSection: 'A', title: 'Papel', type: 'PLANNING_UNDERSTANDING' as any, fileUrl: `${PUBLIC}${paperPath}`, originalFilename: 'papel.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', fileSize: 2 * MB } });
      const section = await prisma.paperSection.create({ data: { paperId: wp.id, sectionKey: 's', label: 'S' } });
      const proc = await prisma.auditProcedure.create({ data: { sectionId: section.id, refNumber: '1', description: 'p' } });
      const step = await prisma.auditStep.create({ data: { procedureId: proc.id, refNumber: '1.1', description: 's' } });
      const stepPath = `procedures/${wp.id}/${proc.id}/foto.jpg`;
      await prisma.stepEvidence.create({ data: { stepId: step.id, fileName: 'foto.jpg', storageKey: stepPath, mimeType: 'image/jpeg', size: 1 * MB } });
      const found = await make().svc.lookupFiles([paperPath, stepPath]);
      expect(found.map((f: any) => [f.path, f.bytes, f.name]).sort()).toEqual([[paperPath, 2 * MB, 'papel.docx'], [stepPath, 1 * MB, 'foto.jpg']].sort());
    });

    it('una ruta sin tamaño conocido no se cuenta, y un papel sin tamaño tampoco', async () => {
      const org = await newOrg(); const { audit } = await mkAudit(org);
      const paperPath = `${audit.id}/sin-tamano.docx`;
      await prisma.workingPaper.create({ data: { auditId: audit.id, code: 'A-2', indexSection: 'A', title: 'Sin tamaño', type: 'PLANNING_UNDERSTANDING' as any, fileUrl: `${PUBLIC}${paperPath}` } });
      expect(await make().svc.lookupFiles([paperPath, 'evidence/inventada-1234/a.pdf'])).toEqual([]);
      expect(await make().svc.lookupFiles([])).toEqual([]);
    });

    it('un archivo que aparece en dos tablas cuenta una sola vez, con el mayor tamaño', async () => {
      const org = await newOrg(); const { audit, lead } = await mkAudit(org);
      const path = await evidence(audit.id, lead.id, 'PDF_DOCUMENT', 'application/pdf', 'doble.pdf', 4 * MB);
      await prisma.auditRequestDocument.create({ data: { auditId: audit.id, uploadedById: lead.id, filename: 'doble.pdf', originalName: 'doble.pdf', mimeType: 'application/pdf', fileSize: 6 * MB, fileUrl: `${PUBLIC}${path}` } });
      const found = await make().svc.lookupFiles([path]);
      expect(found).toHaveLength(1);
      expect(found[0].bytes).toBe(6 * MB);
    });
  });

  describe('anotar y guardar', () => {
    it('suma archivos y bytes por tipo y los guarda con flush', async () => {
      const org = await newOrg(); const { audit, lead } = await mkAudit(org);
      const v = await evidence(audit.id, lead.id, 'SHORT_VIDEO', 'video/mp4', 'visita.mp4', 300 * MB);
      const v2 = await evidence(audit.id, lead.id, 'SHORT_VIDEO', 'video/mp4', 'otra.mp4', 100 * MB);
      const p = await evidence(audit.id, lead.id, 'PDF_DOCUMENT', 'application/pdf', 'contrato.pdf', 5 * MB);
      const { svc } = make();
      expect(await svc.record(org, [v, v2, p], D1)).toBe(3);
      await svc.flush();
      const r = await rows(org);
      expect(r.map((x: any) => [asDay(x), x.fileType, x.files, Number(x.bytes)])).toEqual([
        ['2026-03-15', 'PDF', 1, 5 * MB], ['2026-03-15', 'VIDEO', 2, 400 * MB],
      ]);
    });

    it('un archivo cuenta UNA vez por día aunque se pida muchas veces; al día siguiente vuelve a contar', async () => {
      const org = await newOrg(); const { audit, lead } = await mkAudit(org);
      const path = await evidence(audit.id, lead.id, 'SHORT_VIDEO', 'video/mp4', 'visita.mp4', 50 * MB);
      const { svc } = make();
      expect(await svc.record(org, [path, path], D1)).toBe(1); // repetido dentro de la misma llamada
      expect(await svc.record(org, [path], D1)).toBe(0); // y en otra llamada del mismo día
      expect(await svc.record(org, [path], new Date('2026-03-15T23:59:00Z'))).toBe(0);
      expect(await svc.record(org, [path], D2)).toBe(1); // otro día
      await svc.flush();
      expect((await rows(org)).map((x: any) => [asDay(x), x.files])).toEqual([['2026-03-15', 1], ['2026-03-16', 1]]);
    });

    it('la memoria contra repeticiones es por organización: el mismo archivo anotado para otra organización cuenta aparte', async () => {
      const a = await newOrg(); const b = await newOrg();
      const { audit, lead } = await mkAudit(a);
      const path = await evidence(audit.id, lead.id, 'PDF_DOCUMENT', 'application/pdf', 'x.pdf', MB);
      const { svc } = make();
      expect(await svc.record(a, [path], D1)).toBe(1);
      expect(await svc.record(b, [path], D1)).toBe(1);
    });

    it('lo guardado se SUMA a lo que ya había (varios flush del mismo día)', async () => {
      const org = await newOrg(); const { audit, lead } = await mkAudit(org);
      const p1 = await evidence(audit.id, lead.id, 'PDF_DOCUMENT', 'application/pdf', 'a.pdf', 3 * MB);
      const p2 = await evidence(audit.id, lead.id, 'PDF_DOCUMENT', 'application/pdf', 'b.pdf', 4 * MB);
      const { svc } = make();
      await svc.record(org, [p1], D1); await svc.flush();
      await svc.record(org, [p2], D1); await svc.flush();
      const r = await rows(org);
      expect(r).toHaveLength(1);
      expect([r[0].files, Number(r[0].bytes)]).toEqual([2, 7 * MB]);
    });

    it('un flush sin nada pendiente no hace nada, y el siguiente no repite lo ya escrito', async () => {
      const org = await newOrg(); const { audit, lead } = await mkAudit(org);
      const p = await evidence(audit.id, lead.id, 'PDF_DOCUMENT', 'application/pdf', 'a.pdf', MB);
      const { svc } = make();
      await svc.flush();
      await svc.record(org, [p], D1);
      await svc.flush(); await svc.flush();
      expect((await rows(org))[0].files).toBe(1);
    });

    it('si la memoria contra repeticiones se llena, se vacía (cuenta de más, nunca de menos) y sigue funcionando', async () => {
      const org = await newOrg(); const { audit, lead } = await mkAudit(org);
      const path = await evidence(audit.id, lead.id, 'PDF_DOCUMENT', 'application/pdf', 'a.pdf', MB);
      const { svc } = make();
      expect(await svc.record(org, [path], D1)).toBe(1);
      expect(await svc.record(org, [path], D1)).toBe(0); // ya contado hoy
      const { EGRESS_DEDUP_MAX } = await import('./storage-egress');
      for (let i = 0; i <= EGRESS_DEDUP_MAX; i++) (svc as any).seen.add(`relleno|${i}`); // se pasa del tope
      expect(await svc.record(org, [path], D1)).toBe(1); // la memoria se vació: vuelve a contar
      expect((svc as any).seen.size).toBe(1); // y arrancó de cero con solo esta ruta
    });

    it('un flush sin nada pendiente ni siquiera toca la base', async () => {
      let writes = 0;
      const counting = new Proxy(prisma, { get: (t: any, k: string) => (k === '$executeRaw' ? (...a: any[]) => { writes++; return t.$executeRaw(...a); } : t[k]) });
      const { svc } = make({ EGRESS_METER_ENABLED: 'true' }, counting);
      const warn = jest.spyOn((svc as any).logger, 'warn').mockImplementation(() => undefined);
      await svc.flush();
      await svc.flush();
      expect(writes).toBe(0);
      expect(warn).not.toHaveBeenCalled(); // y tampoco ensucia el registro con un falso error
    });

    it('rutas sin tamaño conocido no escriben nada', async () => {
      const org = await newOrg();
      const { svc } = make();
      expect(await svc.record(org, ['evidence/inventada-abcd/x.mp4'], D1)).toBe(0);
      await svc.flush();
      expect(await rows(org)).toEqual([]);
    });
  });

  describe('nunca rompe una respuesta', () => {
    it('si la búsqueda de tamaños falla, record no lanza, devuelve 0 y el archivo SÍ se cuenta en el siguiente intento', async () => {
      const org = await newOrg(); const { audit, lead } = await mkAudit(org);
      const path = await evidence(audit.id, lead.id, 'PDF_DOCUMENT', 'application/pdf', 'a.pdf', MB);
      let fail = true;
      const flaky = new Proxy(prisma, { get: (t: any, k: string) => (k === '$queryRaw' ? (...a: any[]) => (fail ? Promise.reject(new Error('base caída')) : t.$queryRaw(...a)) : t[k]) });
      const { svc } = make({ EGRESS_METER_ENABLED: 'true' }, flaky);
      expect(await svc.record(org, [path], D1)).toBe(0);
      fail = false;
      expect(await svc.record(org, [path], D1)).toBe(1);
    });

    it('si guardar falla, flush no lanza y descarta lo pendiente (no lo reintenta sin fin)', async () => {
      const org = await newOrg(); const { audit, lead } = await mkAudit(org);
      const path = await evidence(audit.id, lead.id, 'PDF_DOCUMENT', 'application/pdf', 'a.pdf', MB);
      let calls = 0;
      const broken = new Proxy(prisma, { get: (t: any, k: string) => (k === '$executeRaw' ? () => { calls++; return Promise.reject(new Error('relation "storage_egress_daily" does not exist')); } : t[k]) });
      const { svc } = make({ EGRESS_METER_ENABLED: 'true' }, broken);
      await svc.record(org, [path], D1);
      await expect(svc.flush()).resolves.toBeUndefined();
      await svc.flush();
      expect(calls).toBe(1);
    });

    it('si falta la tabla, month() dice «no medido» en vez de 0', async () => {
      const broken = new Proxy(prisma, { get: (t: any, k: string) => (k === '$queryRaw' ? () => Promise.reject(new Error('relation "storage_egress_daily" does not exist')) : t[k]) });
      const r = await make({ EGRESS_METER_ENABLED: 'true' }, broken).svc.month('2026-03');
      expect(r.available).toBe(false);
      expect(r.byOrg.size).toBe(0);
    });
  });

  describe('conexión con el firmador de enlaces', () => {
    it('encendido: se suscribe y cada enlace emitido se anota', async () => {
      const org = await newOrg(); const { audit, lead } = await mkAudit(org);
      const path = await evidence(audit.id, lead.id, 'SHORT_VIDEO', 'video/mp4', 'v.mp4', 20 * MB);
      const { svc, host } = make({ EGRESS_METER_ENABLED: 'true' });
      svc.onModuleInit();
      try {
        expect(typeof host.listener).toBe('function');
        host.listener(org, [path]);
        for (let i = 0; i < 50 && (await rows(org)).length === 0; i++) { await new Promise((r) => setTimeout(r, 100)); await svc.flush(); }
        expect((await rows(org))[0]).toMatchObject({ fileType: 'VIDEO', files: 1 });
      } finally { await svc.onModuleDestroy(); }
    });

    it('apagado (EGRESS_METER_ENABLED=false): no se suscribe', () => {
      const { svc, host } = make({ EGRESS_METER_ENABLED: 'false' });
      svc.onModuleInit();
      expect(host.listener).toBeNull();
      expect(svc.isEnabled()).toBe(false);
    });

    it('al apagar el servidor se escribe lo pendiente', async () => {
      const org = await newOrg(); const { audit, lead } = await mkAudit(org);
      const path = await evidence(audit.id, lead.id, 'PDF_DOCUMENT', 'application/pdf', 'a.pdf', MB);
      const { svc } = make();
      await svc.record(org, [path], D1);
      await svc.onModuleDestroy();
      expect((await rows(org))).toHaveLength(1);
    });
  });

  describe('descargas del mes', () => {
    const put = (organizationId: string, day: string, fileType: string, files: number, bytes: bigint) =>
      prisma.storageEgressDaily.create({ data: { organizationId, day: new Date(`${day}T00:00:00Z`), fileType, files, bytes } });

    it('suma el mes pedido por organización y tipo, sin mezclar meses vecinos ni organizaciones', async () => {
      const a = await newOrg(); const b = await newOrg();
      await put(a, '2026-02-28', 'VIDEO', 9, BigInt(900 * MB)); // mes anterior
      await put(a, '2026-03-01', 'VIDEO', 1, BigInt(10 * MB));
      await put(a, '2026-03-31', 'VIDEO', 2, BigInt(20 * MB));
      await put(a, '2026-03-15', 'PDF', 3, BigInt(3 * MB));
      await put(a, '2026-04-01', 'VIDEO', 9, BigInt(900 * MB)); // mes siguiente
      await put(b, '2026-03-10', 'AUDIO', 4, BigInt(40 * MB));
      const { svc } = make();
      const m = await svc.month('2026-03');
      expect(m.available).toBe(true);
      expect(m.byOrg.get(a)).toMatchObject({ files: 6, bytes: 33 * MB });
      expect(m.byOrg.get(a)!.byType).toMatchObject({ VIDEO: 30 * MB, PDF: 3 * MB, AUDIO: 0 });
      expect(m.byOrg.get(b)).toMatchObject({ files: 4, bytes: 40 * MB });
      expect(m.byOrg.get(b)!.byType.AUDIO).toBe(40 * MB);
    });

    it('un tipo desconocido se suma en «Otros»; un mes sin datos queda vacío pero «medido»', async () => {
      const a = await newOrg();
      await put(a, '2026-05-02', 'RARO', 1, BigInt(MB));
      const { svc } = make();
      expect((await svc.month('2026-05')).byOrg.get(a)!.byType.OTROS).toBe(MB);
      const vacio = await svc.month('2025-01');
      expect(vacio.available).toBe(true);
      expect(vacio.byOrg.get(a)).toBeUndefined();
    });

    it('soporta más de 2 GB por tipo (bytes en 64 bits)', async () => {
      const a = await newOrg();
      await put(a, '2026-06-02', 'VIDEO', 40, BigInt(40 * GB));
      const { svc } = make();
      expect((await svc.month('2026-06')).byOrg.get(a)!.bytes).toBe(40 * GB);
    });
  });

  describe('Consumo del superadmin', () => {
    let consumption: any;
    beforeAll(async () => {
      const { BillingSettingsService } = await import('./billing-settings.service');
      const { EntitlementsService } = await import('./entitlements.service');
      const { UsageService } = await import('./usage.service');
      const { StorageUsageService } = await import('./storage-usage.service');
      const { BillingUsageService } = await import('./billing-usage.service');
      const settings = new BillingSettingsService(prisma as any);
      const entitlements = new EntitlementsService(prisma as any, settings);
      consumption = new BillingUsageService(prisma as any, settings, entitlements, new UsageService(prisma as any, settings, entitlements), new StorageUsageService(prisma as any, settings, entitlements), make().svc);
    });
    const withSub = async (): Promise<string> => {
      const id = await newOrg();
      const plan = await prisma.billingPlan.findUniqueOrThrow({ where: { code: 'PILOTO' } });
      await prisma.billingSubscription.create({ data: { organizationId: id, planId: plan.id, planSnapshot: {}, status: 'ACTIVE', months: 0, exempt: true } });
      return id;
    };
    const put = (organizationId: string, day: string, fileType: string, files: number, bytes: bigint) =>
      prisma.storageEgressDaily.create({ data: { organizationId, day: new Date(`${day}T00:00:00Z`), fileType, files, bytes } });

    it('cada organización trae sus descargas del mes; bajo 250 GB no hay costo', async () => {
      const id = await withSub();
      await put(id, '2026-07-10', 'VIDEO', 2, BigInt(20 * GB));
      await put(id, '2026-07-11', 'PDF', 5, BigInt(1 * GB));
      const c = await consumption.adminConsumption('2026-07');
      const row = c.organizations.find((o: any) => o.organizationId === id);
      expect(row).toMatchObject({ egressFiles: 7, egressBytes: 21 * GB, egressCostSupabaseUsd: 0, egressCostR2Usd: 0 });
      expect(row.egressByType).toMatchObject({ VIDEO: 20 * GB, PDF: 1 * GB });
      expect(c.egress).toMatchObject({ measured: true, includedGb: 250, supabaseUsdPerGb: 0.09, r2UsdPerGb: 0, overageGb: 0, overageCostSupabaseUsd: 0 });
      expect(c.egress.totalGb).toBeCloseTo(21, 9); // 20 GB de video + 1 GB de PDF: GB de verdad (1024³), no de 10⁹
    });

    it('pasando los 250 GB incluidos, el excedente se cobra y entra en el costo variable y el margen', async () => {
      const id = await withSub();
      await put(id, '2026-08-10', 'VIDEO', 100, BigInt(1000 * GB)); // 1000 GB: 750 GB de más = $67.50 si fuera la única
      const c = await consumption.adminConsumption('2026-08');
      const row = c.organizations.find((o: any) => o.organizationId === id);
      expect(c.egress.totalGb).toBeCloseTo(1000, 9);
      expect(c.egress.overageGb).toBeCloseTo(750, 9);
      expect(c.egress.overageCostSupabaseUsd).toBeCloseTo(67.5, 9); // 750 GB × $0.09
      expect(row.egressCostSupabaseUsd).toBeCloseTo(67.5, 9); // es la única con descargas en ese mes: le toca todo
      expect(row.egressCostR2Usd).toBe(0); // Cloudflare R2 no cobra descargas, aunque con Supabase se pase
      expect(row.variableCostUsd).toBeCloseTo(row.aiCostUsd + row.storageCostSupabaseUsd + 67.5, 9);
      expect(row.marginUsd).toBeCloseTo(row.monthlyIncomeUsd - row.aiCostUsd - row.storageCostSupabaseUsd - row.egressCostSupabaseUsd, 6);
    });

    it('un mes sin descargas: ceros, y se sabe que sí se midió', async () => {
      const id = await withSub();
      const c = await consumption.adminConsumption('2024-01');
      const row = c.organizations.find((o: any) => o.organizationId === id);
      expect(row).toMatchObject({ egressFiles: 0, egressBytes: 0, egressByType: null, egressCostSupabaseUsd: 0 });
      expect(c.egress).toMatchObject({ measured: true, totalGb: 0, overageGb: 0, overageCostSupabaseUsd: 0 });
    });

    it('si falta la tabla, Consumo sigue funcionando y dice «no medido»', async () => {
      const { BillingUsageService } = await import('./billing-usage.service');
      const { BillingSettingsService } = await import('./billing-settings.service');
      const { EntitlementsService } = await import('./entitlements.service');
      const { UsageService } = await import('./usage.service');
      const { StorageUsageService } = await import('./storage-usage.service');
      const settings = new BillingSettingsService(prisma as any);
      const entitlements = new EntitlementsService(prisma as any, settings);
      const brokenEgress = { month: async () => ({ available: false, byOrg: new Map() }) };
      const c = await new BillingUsageService(prisma as any, settings, entitlements, new UsageService(prisma as any, settings, entitlements), new StorageUsageService(prisma as any, settings, entitlements), brokenEgress as any).adminConsumption('2026-07');
      expect(c.egress.measured).toBe(false);
      expect(c.organizations.length).toBeGreaterThan(0);
    });
  });
});
