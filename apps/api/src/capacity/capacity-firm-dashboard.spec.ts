/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException } from '@nestjs/common';
import { CapacityService } from './capacity.service';

/**
 * Dashboard de la Firma: utilización por persona y "WIP aproximado" (horas × tarifa pactada).
 * Desde la Fase 2 del cierre de horas, una hora de un mes CERRADO vale su tarifa congelada; una abierta, la tarifa vigente.
 */
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const user = { id: 'cae', role: 'CAE', organizationId: 'org1' } as any;

function setup(entries: any[], teamRates: any[]) {
  const prisma: any = {
    userAvailabilityProfile: {
      findMany: async () => [
        { userId: 'ana', netAvailableHours: 1000, user: { name: 'Ana' } },
        { userId: 'bea', netAvailableHours: 0, user: { name: 'Bea' } },
      ],
    },
    timeEntry: { findMany: async () => entries, groupBy: async () => [] },
    auditTeam: { findMany: async () => teamRates, groupBy: async () => [] },
    audit: { findMany: async () => [] },
  };
  return new CapacityService(prisma);
}

const rate = (auditId: string, userId: string, agreedRatePerHour: number) => ({ auditId, userId, agreedRatePerHour });
const hora = (over: any) => ({ userId: 'ana', auditId: 'a1', hours: 10, closedAt: null, billRateSnapshot: null, ...over });

describe('WIP aproximado del dashboard de la firma', () => {
  it('horas abiertas × tarifa vigente; cerradas × tarifa congelada', async () => {
    const svc = setup(
      [hora({ hours: 10 }), hora({ hours: 6, closedAt: d('2026-03-07'), billRateSnapshot: 35 })],
      [rate('a1', 'ana', 40)],
    );
    const r = await svc.getFirmDashboard(2026, user);
    expect(r.wipAproximado).toBe(10 * 40 + 6 * 35);
    expect(r.horasConTarifa).toBe(16);
  });

  it('subir la tarifa pactada después NO mueve el WIP de un mes cerrado; el de un mes abierto sí', async () => {
    const entries = [hora({ hours: 10 }), hora({ hours: 6, closedAt: d('2026-03-07'), billRateSnapshot: 35 })];
    const antes = await setup(entries, [rate('a1', 'ana', 40)]).getFirmDashboard(2026, user);
    const despues = await setup(entries, [rate('a1', 'ana', 90)]).getFirmDashboard(2026, user);
    expect(antes.wipAproximado).toBe(610);
    expect(despues.wipAproximado).toBe(10 * 90 + 6 * 35);
  });

  it('un mes cerrado sin tarifa congelada no se valora con la tarifa de hoy: queda fuera del WIP', async () => {
    const svc = setup([hora({ hours: 6, closedAt: d('2026-03-07'), billRateSnapshot: null })], [rate('a1', 'ana', 40)]);
    const r = await svc.getFirmDashboard(2026, user);
    expect(r).toMatchObject({ wipAproximado: 0, horasConTarifa: 0 });
  });

  it('sin tarifa en ningún lado no se inventa ingreso; las horas sin encargo no entran', async () => {
    const svc = setup([hora({ hours: 8 }), hora({ hours: 5, auditId: null })], []);
    expect(await svc.getFirmDashboard(2026, user)).toMatchObject({ wipAproximado: 0, horasConTarifa: 0 });
  });
});

describe('Utilización por persona', () => {
  it('horas de cliente ÷ horas netas disponibles; sin horas disponibles no hay porcentaje; ordenado de mayor a menor', async () => {
    const svc = setup([hora({ hours: 250 }), hora({ userId: 'bea', hours: 5 })], []);
    const r = await svc.getFirmDashboard(2026, user);
    expect(r.utilizacionPorPersona.map((p) => [p.userName, p.horasReales, p.utilizacionPct])).toEqual([
      ['Ana', 250, 25],
      ['Bea', 5, null],
    ]);
    expect(r.utilizacionPromedio).toBe(25);
  });
  it('exige el año', async () => {
    await expect(setup([], []).getFirmDashboard(undefined, user)).rejects.toThrow(BadRequestException);
  });
});
