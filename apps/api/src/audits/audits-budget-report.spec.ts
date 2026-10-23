/* eslint-disable @typescript-eslint/no-explicit-any */
import { NotFoundException } from '@nestjs/common';

process.env.SUPABASE_URL ??= 'http://localhost:54321'; // el constructor de AuditsService crea un cliente de Supabase
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'clave-de-prueba';

// eslint-disable-next-line import/first
import { AuditsService } from './audits.service';

/**
 * «Presupuesto vs. Real» de un encargo. El costo real de cada persona sale de su perfil de costeo (su salario): con
 * costoReal ÷ horasReales cualquier compañero despejaba el costo por hora de los demás. Solo lo recibe la dirección (CAE o más);
 * las horas y el presupuesto los ve todo el equipo.
 */
const user = (role: string, organizationId = 'org1') => ({ id: `u-${role}`, role, organizationId } as any);

function setup(entriesOverride?: any[]) {
  const calls = { costProfiles: 0 };
  const prisma: any = {
    audit: { findFirst: async ({ where }: any) => (where.id === 'aud1' && where.organizationId === 'org1' ? { id: 'aud1' } : null) },
    auditTeam: {
      findMany: async () => [
        { id: 'm1', userId: 'ana', role: 'AUDITOR', budgetedHours: 40, user: { id: 'ana', name: 'Ana' } },
        { id: 'm2', userId: 'bea', role: 'LEAD', budgetedHours: null, user: { id: 'bea', name: 'Bea' } },
      ],
    },
    timeEntry: {
      findMany: async () => entriesOverride ?? [
        { userId: 'ana', workDate: new Date('2026-09-10T00:00:00Z'), hours: 10 },
        { userId: 'ana', workDate: new Date('2026-09-11T00:00:00Z'), hours: 10 },
        { userId: 'bea', workDate: new Date('2026-09-10T00:00:00Z'), hours: 5 },
        { userId: 'fuera', workDate: new Date('2026-09-12T00:00:00Z'), hours: 3 }, // ya no está en el equipo
      ],
    },
    user: { findMany: async () => [{ id: 'fuera', name: 'Fabio' }] },
    userCostProfile: {
      findMany: async () => {
        calls.costProfiles++;
        return [
          { userId: 'ana', year: 2026, costRatePerHour: 12.5 },
          { userId: 'bea', year: 2026, costRatePerHour: 30 },
        ];
      },
    },
  };
  const svc = new AuditsService(prisma, {} as any, {} as any, {} as any);
  return { svc, calls };
}

const COST_KEYS = ['costoReal', 'horasSinCostear', 'costoTotal'];
const hasCostKey = (value: unknown): boolean => {
  const text = JSON.stringify(value);
  return COST_KEYS.some((k) => text.includes(`"${k}"`));
};

describe('Presupuesto vs. Real: el costo por persona solo lo ve la dirección', () => {
  it.each(['AUDITOR', 'SENIOR_AUDITOR', 'AUDIT_MANAGER'])('%s recibe las horas pero ningún dato de costo', async (role) => {
    const { svc, calls } = setup();
    const r: any = await svc.getBudgetReport('aud1', user(role));
    expect(hasCostKey(r)).toBe(false);
    expect(JSON.stringify(r)).not.toMatch(/12\.5|:250[,}]|:150[,}]|:400[,}]/); // ni el costo por hora ni lo que permitiría despejarlo
    expect(calls.costProfiles).toBe(0); // ni siquiera se consultan los perfiles de costeo
    expect(r.porPersona.map((p: any) => [p.userName, p.horasReales, p.horasPresupuestadas])).toEqual([
      ['Ana', 20, 40], ['Bea', 5, null], ['Fabio', 3, null],
    ]);
    expect(r).toMatchObject({ totalPresupuestado: 40, totalReal: 28, sinPresupuesto: 2 });
  });

  it.each(['CAE', 'ADMIN', 'SUPER_ADMIN'])('%s sí recibe el costo por persona y el total', async (role) => {
    const { svc, calls } = setup();
    const r: any = await svc.getBudgetReport('aud1', user(role));
    expect(calls.costProfiles).toBe(1);
    expect(r.porPersona.map((p: any) => [p.userName, p.costoReal, p.horasSinCostear])).toEqual([
      ['Ana', 250, 0], // 20 h × 12,50
      ['Bea', 150, 0], // 5 h × 30
      ['Fabio', null, 3], // sin perfil de costeo: nunca se asume $0
    ]);
    expect(r.costoTotal).toBe(400);
  });

  it('un rol desconocido se trata como sin permiso', async () => {
    const { svc } = setup();
    expect(hasCostKey(await svc.getBudgetReport('aud1', user('ROL_RARO')))).toBe(false);
  });

  it('un encargo de otra organización no existe para quien consulta', async () => {
    const { svc } = setup();
    await expect(svc.getBudgetReport('aud1', user('CAE', 'org2'))).rejects.toThrow(NotFoundException);
  });
});

describe('Costo real con horas de meses cerrados', () => {
  const h = (userId: string, hours: number, over: any = {}) => ({
    userId, workDate: new Date('2026-09-10T00:00:00Z'), hours, closedAt: null, costRateSnapshot: null, ...over,
  });
  const cerrada = new Date('2026-10-07T12:00:00Z');

  it('una hora de un mes cerrado vale su costo congelado, no el perfil de hoy', async () => {
    const { svc } = setup([h('ana', 10), h('ana', 6, { closedAt: cerrada, costRateSnapshot: '9' })]);
    const r: any = await svc.getBudgetReport('aud1', user('CAE'));
    // el perfil de hoy de Ana es 12,50: las 10 h abiertas lo usan (125) y las 6 h cerradas usan el 9 congelado (54)
    expect(r.porPersona.find((p: any) => p.userName === 'Ana')).toMatchObject({ horasReales: 16, costoReal: 179, horasSinCostear: 0 });
    expect(r.costoTotal).toBe(179);
  });

  it('un mes cerrado sin costo congelado queda sin costear, aunque hoy exista el perfil', async () => {
    const { svc } = setup([h('ana', 6, { closedAt: cerrada, costRateSnapshot: null })]);
    const r: any = await svc.getBudgetReport('aud1', user('CAE'));
    expect(r.porPersona.find((p: any) => p.userName === 'Ana')).toMatchObject({ costoReal: null, horasSinCostear: 6 });
    expect(r.costoTotal).toBeNull(); // nunca $0
  });

  it('quien no es de la dirección sigue sin ver ningún costo, tenga o no meses cerrados', async () => {
    const { svc } = setup([h('ana', 6, { closedAt: cerrada, costRateSnapshot: '9' })]);
    const r: any = await svc.getBudgetReport('aud1', user('AUDIT_MANAGER'));
    expect(JSON.stringify(r)).not.toMatch(/costo|horasSinCostear/);
  });
});
