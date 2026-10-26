/* eslint-disable @typescript-eslint/no-explicit-any */
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ProfitabilityService } from './profitability.service';

/**
 * Reglas financieras de la rentabilidad de un encargo. Corre contra una base en memoria que además CUENTA las consultas.
 * Reglas bajo prueba:
 *  · costo = horas × costo/hora; una hora de un mes CERRADO usa el costo congelado, una de un mes abierto el perfil vigente
 *    (y es provisional); lo que no se puede costear queda "sin costear", NUNCA $0;
 *  · lo mismo con la tarifa pactada (ingreso por tarifa);
 *  · margen = honorario − costo; sin honorario o con honorario 0 no hay %;
 *  · las consultas son constantes sin importar cuántos encargos haya.
 */
type Row = Record<string, any>;
interface Data {
  engagements?: Row[]; proposals?: Row[]; entries?: Row[]; users?: Row[]; costProfiles?: Row[]; team?: Row[]; fees?: Row[];
  amendments?: Row[]; invoices?: Row[]; creditNotes?: Row[]; scheduleItems?: Row[]; triggers?: Row[];
}

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const inSet = (arr: any[] | undefined, v: any) => !arr || arr.includes(v);

function makeDb(data: Data) {
  const counts: Record<string, number> = {};
  const hit = (name: string) => { counts[name] = (counts[name] ?? 0) + 1; };
  const total = () => Object.values(counts).reduce((a, b) => a + b, 0);
  const prisma: any = {
    engagement: {
      findMany: async ({ where }: any) => {
        hit('engagement');
        return (data.engagements ?? []).filter((e) =>
          e.organizationId === where.organizationId
          && (where.fiscalYear === undefined || e.fiscalYear === where.fiscalYear)
          && (where.status?.not === undefined || e.status !== where.status.not)
          && (where.engagementLetter?.proposalId?.in === undefined || where.engagementLetter.proposalId.in.includes(e.engagementLetter?.proposalId))
          && (where.auditId?.not === null ? e.auditId !== null : true));
      },
      findUnique: async ({ where }: any) => { hit('engagement'); return (data.engagements ?? []).find((e) => e.id === where.id) ?? null; },
      findFirst: async ({ where }: any) => {
        hit('engagement');
        return (data.engagements ?? []).find((e) => e.auditId === where.auditId && e.organizationId === where.organizationId) ?? null;
      },
    },
    engagementFee: {
      findMany: async ({ where }: any) => { hit('engagementFee'); return (data.fees ?? []).filter((f) => inSet(where.engagementId.in, f.engagementId)); },
    },
    // Devengado (fase 3c): estas consultas solo importan en las pruebas de «Devengado»; aquí devuelven lo que `data` traiga (o nada).
    engagementFeeAmendment: { findMany: async () => { hit('engagementFeeAmendment'); return data.amendments ?? []; } },
    clientInvoice: { findMany: async () => { hit('clientInvoice'); return data.invoices ?? []; } },
    clientCreditNote: { findMany: async () => { hit('clientCreditNote'); return data.creditNotes ?? []; } },
    billingScheduleItem: { findMany: async () => { hit('billingScheduleItem'); return data.scheduleItems ?? []; } },
    workingPaper: { findMany: async () => { hit('workingPaper'); return data.triggers ?? []; } },
    proposal: {
      findMany: async ({ where }: any) => { hit('proposal'); return (data.proposals ?? []).filter((p) => inSet(where.id.in, p.id)); },
    },
    timeEntry: {
      groupBy: async ({ where }: any) => {
        hit('timeEntry');
        const rows = (data.entries ?? []).filter((e) => e.organizationId === where.organizationId && inSet(where.auditId.in, e.auditId) && e.category === where.category
          && (!where.workDate?.lte || e.workDate <= where.workDate.lte));
        const by = new Map<string, any>();
        for (const e of rows) {
          const k = `${e.auditId}:${e.userId}`;
          const cur = by.get(k) ?? { auditId: e.auditId, userId: e.userId, _sum: { hours: 0 } };
          cur._sum.hours += e.hours;
          by.set(k, cur);
        }
        return [...by.values()];
      },
      findMany: async ({ where }: any) => {
        hit('timeEntry');
        return (data.entries ?? []).filter((e) =>
          e.organizationId === where.organizationId && inSet(where.auditId.in, e.auditId) && inSet(where.category.in, e.category)
          && (!where.workDate?.lte || e.workDate <= where.workDate.lte));
      },
    },
    user: { findMany: async ({ where }: any) => { hit('user'); return (data.users ?? []).filter((u) => inSet(where.id.in, u.id)); } },
    userCostProfile: {
      findMany: async ({ where }: any) => {
        hit('userCostProfile');
        return (data.costProfiles ?? []).filter((c) => c.organizationId === where.organizationId && inSet(where.userId.in, c.userId) && inSet(where.year.in, c.year));
      },
    },
    auditTeam: {
      findMany: async ({ where }: any) => {
        hit('auditTeam');
        return (data.team ?? []).filter((t) => inSet(where.auditId.in, t.auditId) && inSet(where.userId?.in, t.userId));
      },
    },
  };
  return { prisma, counts, total };
}

const user = (organizationId = 'org1') => ({ id: 'cae', role: 'CAE', organizationId } as any);
const entry = (over: Row) => ({ organizationId: 'org1', category: 'CLIENT_BILLABLE', closedAt: null, costRateSnapshot: null, billRateSnapshot: null, ...over });
const engagement = (id: string, auditId: string | null, proposalId: string | null, over: Row = {}) => ({
  id, organizationId: 'org1', clientId: `c-${id}`, fiscalYear: 2026, auditId, createdAt: d('2026-01-01'),
  client: { legalName: `Cliente ${id}` }, engagementLetter: proposalId ? { proposalId } : null, ...over,
});

/** Caso principal, con todo mezclado: años distintos, meses abiertos y cerrados, personas sin perfil o sin tarifa. */
function mezclado(): Data {
  return {
    engagements: [engagement('e1', 'a1', 'p1')],
    proposals: [{ id: 'p1', feeAmount: 1000, feeCurrency: 'USD' }],
    users: [{ id: 'ana', name: 'Ana' }, { id: 'bea', name: 'Bea' }],
    costProfiles: [
      { organizationId: 'org1', userId: 'ana', year: 2026, costRatePerHour: 10 },
      { organizationId: 'org1', userId: 'ana', year: 2025, costRatePerHour: 8 },
    ],
    team: [{ auditId: 'a1', userId: 'ana', billingRateType: 'TIER1', agreedRatePerHour: 40 }],
    entries: [
      entry({ auditId: 'a1', userId: 'ana', workDate: d('2026-01-10'), hours: 10 }), // abierta: 10 × 10 = 100, tarifa 40
      entry({ auditId: 'a1', userId: 'ana', workDate: d('2025-12-30'), hours: 5 }), // abierta de 2025: 5 × 8 = 40
      entry({ auditId: 'a1', userId: 'bea', workDate: d('2026-01-11'), hours: 4 }), // abierta, sin perfil ni tarifa
      entry({ auditId: 'a1', userId: 'ana', workDate: d('2026-02-05'), hours: 6, closedAt: d('2026-03-07'), costRateSnapshot: 9, billRateSnapshot: 35 }),
      entry({ auditId: 'a1', userId: 'ana', workDate: d('2026-02-06'), hours: 2, closedAt: d('2026-03-07'), costRateSnapshot: null, billRateSnapshot: null }),
    ],
  };
}

describe('Costo del encargo', () => {
  it('suma horas × costo; lo cerrado vale lo congelado, lo abierto el perfil vigente; lo que no se puede costear queda aparte', async () => {
    const { prisma } = makeDb(mezclado());
    const r: any = await new ProfitabilityService(prisma).getEngagementProfitability('e1', user());
    expect(r.totales).toMatchObject({
      horasTotales: 27,
      costoTotal: 194, // ana: 100 + 40 + 54(6 × 9 congelado) ; bea: nada que costear
      horasSinCostear: 6, // bea 4 h (sin perfil) + 2 h cerradas sin costo congelado
      horasProvisionales: 19, // 10 + 5 + 4: las de meses sin cerrar
    });
    const ana = r.porPersona.find((p: any) => p.userId === 'ana');
    const bea = r.porPersona.find((p: any) => p.userId === 'bea');
    expect(ana).toMatchObject({ horasTotales: 23, costoCalculado: 194, horasSinCostear: 2, horasProvisionales: 15 });
    expect(bea).toMatchObject({ horasTotales: 4, costoCalculado: null, horasSinCostear: 4 }); // "Sin costear", nunca $0
  });

  it('una hora de un mes CERRADO no se mueve cuando cambia el perfil de costeo; las abiertas sí', async () => {
    const data = mezclado();
    const antes: any = await new ProfitabilityService(makeDb(data).prisma).getEngagementProfitability('e1', user());
    data.costProfiles![0].costRatePerHour = 99; // sube el costo 2026 de Ana
    const despues: any = await new ProfitabilityService(makeDb(data).prisma).getEngagementProfitability('e1', user());
    expect(antes.totales.costoTotal).toBe(194);
    expect(despues.totales.costoTotal).toBe(40 + 54 + 990); // las 10 h abiertas pasan a 99; las 6 h cerradas siguen a 9
  });

  it('un mes cerrado sin costo congelado NO se rescata con el perfil de hoy (se reabre y se vuelve a cerrar)', async () => {
    const data = mezclado();
    const base: any = await new ProfitabilityService(makeDb(data).prisma).getEngagementProfitability('e1', user());
    data.costProfiles![0].costRatePerHour = 10; // el perfil de 2026 ya existía; ahora cambia a otro valor
    data.costProfiles![0].costRatePerHour = 50;
    const r: any = await new ProfitabilityService(makeDb(data).prisma).getEngagementProfitability('e1', user());
    expect(r.totales.horasSinCostear).toBe(base.totales.horasSinCostear); // las 2 h cerradas siguen sin costear
  });

  it('el desglose por año mezcla costo efectivo cuando el año tiene meses cerrados y abiertos', async () => {
    const { prisma } = makeDb(mezclado());
    const summary = await (new ProfitabilityService(prisma) as any).computeAuditCostSummaries(['a1'], 'org1');
    const ana = summary.get('a1').byPerson.find((p: any) => p.userId === 'ana');
    expect(ana.hoursByYear.map((y: any) => y.year)).toEqual([2025, 2026]); // ordenado
    expect(ana.hoursByYear[0]).toMatchObject({ hours: 5, costRatePerHour: 8, cost: 40 });
    expect(ana.hoursByYear[1].hours).toBe(18);
    expect(ana.hoursByYear[1].cost).toBe(154); // 10 × 10 + 6 × 9
    expect(ana.hoursByYear[1].costRatePerHour).toBeCloseTo(9.63, 2); // 154 / 16 h costeadas
  });

  it('solo cuentan las horas de cliente, de esa organización y de ese encargo', async () => {
    const data = mezclado();
    data.entries!.push(
      entry({ auditId: 'a1', userId: 'ana', workDate: d('2026-01-12'), hours: 50, category: 'ADMIN' }), // no es de cliente
      entry({ auditId: 'a1', userId: 'ana', workDate: d('2026-01-12'), hours: 70, organizationId: 'org2' }), // otra organización
      entry({ auditId: 'otro', userId: 'ana', workDate: d('2026-01-12'), hours: 90 }), // otro encargo
      entry({ auditId: 'a1', userId: 'ana', workDate: d('2026-01-13'), hours: 3, category: 'CLIENT_NON_BILLABLE' }), // no facturable al cliente: SÍ cuesta
    );
    const r: any = await new ProfitabilityService(makeDb(data).prisma).getEngagementProfitability('e1', user());
    expect(r.totales.horasTotales).toBe(30); // 27 + 3
  });

  it('el corte por fecha (cierre del período del Comité) deja fuera lo posterior', async () => {
    const { prisma } = makeDb(mezclado());
    const s = await new ProfitabilityService(prisma).getAuditFinancialSummary('a1', 'org1', d('2026-01-31'));
    expect(s).toMatchObject({ hoursTotal: 19, cost: 140, uncostedHours: 4, provisionalHours: 19 }); // sin las 8 h cerradas de febrero
  });
});

describe('Ingreso por tarifa pactada', () => {
  it('abierta: tarifa vigente; cerrada: tarifa congelada; sin tarifa: aparte, nunca $0', async () => {
    const { prisma } = makeDb(mezclado());
    const r: any = await new ProfitabilityService(prisma).getEngagementProfitability('e1', user());
    // ana: 15 h abiertas × 40 = 600 ; 6 h cerradas × 35 congelado = 210 ; 2 h cerradas sin tarifa congelada → sin tarifa
    expect(r.totales.ingresoPorTarifa).toBe(810);
    expect(r.totales.horasSinTarifa).toBe(6); // 2 de Ana + 4 de Bea
    const ana = r.porPersona.find((p: any) => p.userId === 'ana');
    const bea = r.porPersona.find((p: any) => p.userId === 'bea');
    expect(ana).toMatchObject({ tarifaTipo: 'TIER1', tarifaPorHora: 40, ingresoPorTarifa: 810 });
    expect(bea).toMatchObject({ tarifaTipo: null, tarifaPorHora: null, ingresoPorTarifa: null });
    expect(r.totales.margenPorTarifaAbsoluto).toBe(616); // 810 − 194
    expect(r.totales.margenPorTarifaPct).toBeCloseTo(76.05, 2);
  });

  it('si nadie tiene tarifa, no hay margen por tarifa (no se asume ingreso $0)', async () => {
    const data = mezclado();
    data.team = [];
    data.entries = data.entries!.filter((e) => !e.closedAt);
    const r: any = await new ProfitabilityService(makeDb(data).prisma).getEngagementProfitability('e1', user());
    expect(r.totales).toMatchObject({ ingresoPorTarifa: 0, horasSinTarifa: 19, margenPorTarifaAbsoluto: null, margenPorTarifaPct: null });
  });
});

describe('Margen contra el honorario', () => {
  const con = (fee: number | null) => {
    const data = mezclado();
    data.proposals = fee === null ? [] : [{ id: 'p1', feeAmount: fee, feeCurrency: 'USD' }];
    return data;
  };
  it('honorario − costo, y su porcentaje', async () => {
    const r: any = await new ProfitabilityService(makeDb(con(1000)).prisma).getEngagementProfitability('e1', user());
    expect(r.ingreso).toEqual({ feeAmount: 1000, feeCurrency: 'USD' });
    expect(r.totales).toMatchObject({ margenAbsoluto: 806, margenPct: 80.6 });
  });
  it('margen negativo cuando el costo supera al honorario', async () => {
    const r: any = await new ProfitabilityService(makeDb(con(100)).prisma).getEngagementProfitability('e1', user());
    expect(r.totales).toMatchObject({ margenAbsoluto: -94, margenPct: -94 });
  });
  it('sin honorario: no hay margen (no se asume $0)', async () => {
    const r: any = await new ProfitabilityService(makeDb(con(null)).prisma).getEngagementProfitability('e1', user());
    expect(r.ingreso).toBeNull();
    expect(r.totales).toMatchObject({ margenAbsoluto: null, margenPct: null });
  });
  it('honorario 0: hay margen en dinero pero el porcentaje no se puede expresar', async () => {
    const r: any = await new ProfitabilityService(makeDb(con(0)).prisma).getEngagementProfitability('e1', user());
    expect(r.totales).toMatchObject({ margenAbsoluto: -194, margenPct: null });
  });
});

describe('Estados y permisos', () => {
  it('un encargo sin auditoría aprobada devuelve ceros, no un error', async () => {
    const data: Data = { engagements: [engagement('e9', null, null)] };
    const r: any = await new ProfitabilityService(makeDb(data).prisma).getEngagementProfitability('e9', user());
    expect(r.auditId).toBeNull();
    expect(r.porPersona).toEqual([]);
    expect(r.totales).toMatchObject({ horasTotales: 0, costoTotal: 0, horasProvisionales: 0, margenAbsoluto: null });
  });
  it('un encargo con auditoría pero sin horas devuelve ceros', async () => {
    const data: Data = { engagements: [engagement('e1', 'a1', null)] };
    const r: any = await new ProfitabilityService(makeDb(data).prisma).getEngagementProfitability('e1', user());
    expect(r.totales).toMatchObject({ horasTotales: 0, costoTotal: 0, horasSinCostear: 0 });
  });
  it('otra organización no ve el encargo', async () => {
    const { prisma } = makeDb(mezclado());
    await expect(new ProfitabilityService(prisma).getEngagementProfitability('e1', user('org2'))).rejects.toThrow(NotFoundException);
    await expect(new ProfitabilityService(prisma).getEngagementProfitability('no-existe', user())).rejects.toThrow(NotFoundException);
  });
  it('la lista pide el año', async () => {
    const { prisma } = makeDb(mezclado());
    await expect(new ProfitabilityService(prisma).listProfitability(undefined, user())).rejects.toThrow(BadRequestException);
  });
});

describe('Lista por año', () => {
  function varios(): Data {
    const data = mezclado();
    data.engagements!.push(
      engagement('e2', 'a2', 'p2'), // margen 50 %
      engagement('e3', 'a3', null), // sin honorario → al final
      engagement('e4', 'a4', 'p4'), // sin horas
      engagement('e5', 'a5', 'p5', { fiscalYear: 2025 }), // otro año
      engagement('e6', 'a6', 'p6', { organizationId: 'org2' }), // otra organización
    );
    data.proposals!.push(
      { id: 'p2', feeAmount: 200, feeCurrency: 'USD' }, { id: 'p4', feeAmount: 300, feeCurrency: 'USD' },
      { id: 'p5', feeAmount: 1, feeCurrency: 'USD' }, { id: 'p6', feeAmount: 1, feeCurrency: 'USD' },
    );
    data.users!.push({ id: 'cris', name: 'Cris' });
    data.costProfiles!.push({ organizationId: 'org1', userId: 'cris', year: 2026, costRatePerHour: 10 });
    data.entries!.push(
      entry({ auditId: 'a2', userId: 'cris', workDate: d('2026-03-01'), hours: 10 }), // costo 100 sobre 200 → 50 %
      entry({ auditId: 'a3', userId: 'cris', workDate: d('2026-03-01'), hours: 1 }),
    );
    return data;
  }

  it('solo el año y la organización pedidos, ordenados por margen % con lo incomparable al final', async () => {
    const rows: any[] = await new ProfitabilityService(makeDb(varios()).prisma).listProfitability(2026, user());
    expect(rows.map((r) => r.engagementId)).toEqual(['e4', 'e2', 'e1', 'e3']);
    // e4: sin horas → margen 100 % (costo 0); e2: 50 %; e1: tiene horas sin costear → se empuja; e3: sin honorario → al final
  });

  it('las consultas no crecen con la cantidad de encargos (antes eran ~5 por encargo)', async () => {
    const uno = makeDb(mezclado());
    await new ProfitabilityService(uno.prisma).listProfitability(2026, user());
    const muchos = makeDb(varios());
    await new ProfitabilityService(muchos.prisma).listProfitability(2026, user());
    expect(muchos.total()).toBe(uno.total());
    expect(muchos.total()).toBeLessThanOrEqual(20);
    expect(muchos.counts.timeEntry).toBe(1);
    expect(muchos.counts.userCostProfile).toBe(1);
    expect(muchos.counts.auditTeam).toBe(1);
  });

  it('cada encargo trae sus propios números, sin mezclarse con los demás', async () => {
    const rows: any[] = await new ProfitabilityService(makeDb(varios()).prisma).listProfitability(2026, user());
    const e2 = rows.find((r) => r.engagementId === 'e2');
    expect(e2.totales).toMatchObject({ horasTotales: 10, costoTotal: 100, margenAbsoluto: 100, margenPct: 50 });
    expect(rows.find((r) => r.engagementId === 'e1').totales.horasTotales).toBe(27);
    expect(rows.find((r) => r.engagementId === 'e3').totales).toMatchObject({ horasTotales: 1, margenAbsoluto: null });
  });
});

describe('Ingreso del encargo: el honorario de Cobranza manda y una propuesta compartida no se cuenta dos veces', () => {
  const con = (over: (d: Data) => void) => { const data = mezclado(); over(data); return data; };
  const ingreso = async (data: Data, id = 'e1') => {
    const r: any = await new ProfitabilityService(makeDb(data).prisma).getEngagementProfitability(id, user());
    return r;
  };

  it('el honorario registrado en Cobranza (con sus adendas) manda sobre el de la propuesta', async () => {
    const r = await ingreso(con((d) => { d.fees = [{ engagementId: 'e1', feeType: 'FIXED', totalAmount: 1300 }]; }));
    expect(r.ingreso).toEqual({ feeAmount: 1300, feeCurrency: 'USD' });
    expect(r.ingresoOrigen).toBe('FEE');
    expect(r.totales).toMatchObject({ margenAbsoluto: 1106, margenPct: 85.08 }); // 1300 − 194
  });

  it('un honorario por tiempo no tiene monto fijo: sin ingreso y con aviso, nunca $0 ni el de la propuesta', async () => {
    const r = await ingreso(con((d) => { d.fees = [{ engagementId: 'e1', feeType: 'TIME_BASED', totalAmount: null }]; }));
    expect(r.ingreso).toBeNull();
    expect(r.ingresoAviso).toMatch(/por tiempo/);
    expect(r.totales).toMatchObject({ margenAbsoluto: null, margenPct: null });
  });

  it('una consultoría sin carta toma su ingreso de Cobranza', async () => {
    const r = await ingreso(con((d) => {
      d.engagements!.push(engagement('e9', 'a9', null, { kind: 'CONSULTING' }));
      d.fees = [{ engagementId: 'e9', feeType: 'FIXED', totalAmount: 600 }];
    }), 'e9');
    expect(r.ingreso).toEqual({ feeAmount: 600, feeCurrency: 'USD' });
  });

  it('la propuesta de una carta que respalda dos encargos vigentes no se cuenta completa en cada uno', async () => {
    const data = con((d) => { d.engagements!.push(engagement('e2', 'a2', 'p1', { fiscalYear: 2027 })); });
    const e1 = await ingreso(data, 'e1');
    const e2 = await ingreso(data, 'e2');
    for (const r of [e1, e2]) {
      expect(r.ingreso).toBeNull();
      expect(r.ingresoOrigen).toBe('PROPOSAL');
      expect(r.ingresoAviso).toMatch(/varios encargos vigentes/);
    }
    // y en el consolidado de la organización el honorario no se suma dos veces
    const org = await new ProfitabilityService(makeDb(data).prisma).getOrgWideProfitability('org1');
    expect(org.totalIncome).toBe(0);
    // registrar el honorario de cada uno en Cobranza lo resuelve
    data.fees = [{ engagementId: 'e1', feeType: 'FIXED', totalAmount: 1000 }, { engagementId: 'e2', feeType: 'FIXED', totalAmount: 500 }];
    expect((await new ProfitabilityService(makeDb(data).prisma).getOrgWideProfitability('org1')).totalIncome).toBe(1500);
  });

  it('si el otro encargo de la carta está cancelado, la propuesta vuelve a valer para el vigente', async () => {
    const r = await ingreso(con((d) => { d.engagements!.push(engagement('e2', null, 'p1', { fiscalYear: 2027, status: 'CANCELLED' })); }));
    expect(r.ingreso).toEqual({ feeAmount: 1000, feeCurrency: 'USD' });
    expect(r.ingresoOrigen).toBe('PROPOSAL');
  });
});

describe('Rentabilidad de toda la organización', () => {
  it('suma ingresos, costos y márgenes solo de los encargos con dato, con consultas constantes', async () => {
    const data = mezclado();
    data.engagements!.push(engagement('e2', 'a2', 'p2'), engagement('e3', 'a3', null));
    data.proposals!.push({ id: 'p2', feeAmount: 200, feeCurrency: 'USD' });
    data.users!.push({ id: 'cris', name: 'Cris' });
    data.costProfiles!.push({ organizationId: 'org1', userId: 'cris', year: 2026, costRatePerHour: 10 });
    data.entries!.push(entry({ auditId: 'a2', userId: 'cris', workDate: d('2026-03-01'), hours: 10 }), entry({ auditId: 'a3', userId: 'cris', workDate: d('2026-03-01'), hours: 2 }));
    const db = makeDb(data);
    const r = await new ProfitabilityService(db.prisma).getOrgWideProfitability('org1');
    expect(r).toMatchObject({
      engagementsTotal: 3, engagementsWithRevenue: 2, engagementsWithMargin: 2,
      totalIncome: 1200, totalCost: 314, // 194 + 100 + 20
      totalMargin: 906, // (1000 − 194) + (200 − 100)
      provisionalHours: 19 + 10 + 2,
    });
    expect(r.totalMarginPct).toBeCloseTo(75.5, 1);
    expect(db.total()).toBeLessThanOrEqual(20); // + las consultas del devengado (adendas, facturas, notas de crédito, hitos, horas, equipo, papel disparador)
  });
  it('sin ingresos no hay porcentaje', async () => {
    const data: Data = { engagements: [engagement('e1', 'a1', null)] };
    const r = await new ProfitabilityService(makeDb(data).prisma).getOrgWideProfitability('org1');
    expect(r).toMatchObject({ engagementsTotal: 1, totalIncome: 0, totalMarginPct: null });
  });
});

// ── Equivalencia con el cálculo anterior ─────────────────────────────────────
/** El algoritmo de antes de la Fase 2, copiado tal cual como referencia: con todas las horas abiertas debe dar lo mismo. */
function costoAnterior(entries: Row[], costMap: Map<string, number>, rateMap: Map<string, number | null>) {
  const byUser = new Map<string, Map<number, number>>();
  for (const e of entries) {
    const year = e.workDate.getUTCFullYear();
    if (!byUser.has(e.userId)) byUser.set(e.userId, new Map());
    const ym = byUser.get(e.userId)!;
    ym.set(year, (ym.get(year) ?? 0) + e.hours);
  }
  const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  let totalHours = 0, totalCost = 0, uncosted = 0, revenue = 0, unrated = 0;
  const personas: Record<string, { horas: number; costo: number; sinCostear: number; ingreso: number | null }> = {};
  for (const [userId, ym] of byUser) {
    let h = 0, c = 0, u = 0;
    for (const [year, hours] of ym) {
      const rate = costMap.get(`${userId}:${year}`);
      h += hours;
      if (rate !== undefined) c += r2(hours * rate); else u += hours;
    }
    totalHours += h; totalCost += c; uncosted += u;
    const agreed = rateMap.get(userId) ?? null;
    const ing = agreed !== null ? r2(h * agreed) : null;
    if (ing !== null) revenue += ing; else unrated += h;
    personas[userId] = { horas: r2(h), costo: r2(c), sinCostear: r2(u), ingreso: ing };
  }
  return { totalHours: r2(totalHours), totalCost: r2(totalCost), uncosted: r2(uncosted), revenue: r2(revenue), unrated: r2(unrated), personas };
}

describe('Equivalencia con el cálculo anterior (todas las horas abiertas = con el cierre apagado)', () => {
  // Generador pseudoaleatorio con semilla fija: la prueba es reproducible.
  const lcg = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

  it.each([1, 2, 3, 7, 11, 42])('conjunto de datos %i: mismos totales y mismo desglose por persona', async (seed) => {
    const rnd = lcg(seed);
    const personas = ['u1', 'u2', 'u3', 'u4'];
    const costProfiles: Row[] = [];
    const costMap = new Map<string, number>();
    const rateMap = new Map<string, number | null>();
    const team: Row[] = [];
    for (const u of personas) {
      for (const year of [2024, 2025, 2026]) {
        if (rnd() < 0.7) {
          const rate = Math.round(rnd() * 5000) / 100;
          costProfiles.push({ organizationId: 'org1', userId: u, year, costRatePerHour: rate });
          costMap.set(`${u}:${year}`, rate);
        }
      }
      const agreed = rnd() < 0.6 ? Math.round(rnd() * 9000) / 100 : null;
      rateMap.set(u, agreed);
      if (agreed !== null) team.push({ auditId: 'a1', userId: u, billingRateType: 'COST', agreedRatePerHour: agreed });
    }
    const entries: Row[] = [];
    for (let i = 0; i < 60; i++) {
      const year = [2024, 2025, 2026][Math.floor(rnd() * 3)];
      const day = 1 + Math.floor(rnd() * 27);
      const month = 1 + Math.floor(rnd() * 12);
      entries.push(entry({
        auditId: 'a1', userId: personas[Math.floor(rnd() * personas.length)],
        workDate: d(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`),
        hours: Math.round(rnd() * 16 * 4) / 4 + 0.25,
        category: rnd() < 0.2 ? 'CLIENT_NON_BILLABLE' : 'CLIENT_BILLABLE',
      }));
    }
    const esperado = costoAnterior(entries, costMap, rateMap);
    const data: Data = {
      engagements: [engagement('e1', 'a1', null)],
      users: personas.map((id) => ({ id, name: id })), costProfiles, team, entries,
    };
    const summary = (await (new ProfitabilityService(makeDb(data).prisma) as any).computeAuditCostSummaries(['a1'], 'org1')).get('a1');
    expect(summary.totalHours).toBeCloseTo(esperado.totalHours, 2);
    expect(summary.totalCost).toBeCloseTo(esperado.totalCost, 1);
    expect(summary.uncostedHours).toBeCloseTo(esperado.uncosted, 2);
    expect(summary.totalRevenueByRate).toBeCloseTo(esperado.revenue, 1);
    expect(summary.unratedHours).toBeCloseTo(esperado.unrated, 2);
    expect(summary.provisionalHours).toBeCloseTo(esperado.totalHours, 2); // todo está abierto
    for (const p of summary.byPerson) {
      const e = esperado.personas[p.userId];
      expect(p.totalHours).toBeCloseTo(e.horas, 2);
      expect(p.totalCost).toBeCloseTo(e.costo, 1);
      expect(p.uncostedHours).toBeCloseTo(e.sinCostear, 2);
      if (e.ingreso === null) expect(p.revenueByRate).toBeNull(); else expect(p.revenueByRate).toBeCloseTo(e.ingreso, 1);
    }
  });
});
