import { BadRequestException, Injectable } from '@nestjs/common';
import { EngagementStatus, TimeEntryCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import { hiddenAuditIds } from '../common/utils/investigation-scope.util';
import { ProgramEngagementInput, buildProgram } from './engagement-program.util';
import { proposedTeamHours } from './engagement-readiness.util';

/**
 * Programa anual de encargos: lee los encargos vivos (borrador y aprobados), sus horas comprometidas y la capacidad neta del equipo
 * (perfiles de disponibilidad del año) y lo arma con `buildProgram`. Solo lee: no cambia nada.
 */
@Injectable()
export class EngagementProgramService {
  constructor(private readonly prisma: PrismaService) {}

  async program(year: number | undefined, user: AuthUser) {
    const y = year ?? new Date(Date.now() - 6 * 3_600_000).getUTCFullYear();
    if (!Number.isInteger(y) || y < 2000 || y > 2100) throw new BadRequestException('El año no es válido.');
    const org = user.organizationId;

    const rows = await this.prisma.engagement.findMany({
      where: { organizationId: org, status: { in: [EngagementStatus.DRAFT, EngagementStatus.APPROVED] } },
      select: {
        id: true, kind: true, title: true, fiscalYear: true, status: true, plannedStartDate: true, plannedEndDate: true, leadPartnerId: true, auditId: true,
        client: { select: { legalName: true } },
        engagementLetter: { select: { proposal: { select: { teamJson: true } } } },
        audit: { select: { status: true, estimatedHours: true, team: { select: { userId: true, budgetedHours: true, user: { select: { name: true } } } } } },
      },
    });

    // Una auditoría ya cerrada o cancelada no compromete horas; una investigación ajena al equipo del usuario no se nombra ni se cuenta.
    const hidden = await hiddenAuditIds(this.prisma, rows.map((r) => r.auditId), user);
    const live = rows.filter((r) => !(r.audit && ['CLOSED', 'CANCELLED'].includes(r.audit.status)) && !(r.auditId && hidden.has(r.auditId)));

    const partnerIds = [...new Set(live.map((r) => r.leadPartnerId).filter((v): v is string => !!v))];
    const [partners, profiles] = await Promise.all([
      partnerIds.length ? this.prisma.user.findMany({ where: { id: { in: partnerIds }, organizationId: org }, select: { id: true, name: true } }) : Promise.resolve([]),
      this.prisma.userAvailabilityProfile.findMany({
        where: { organizationId: org, year: y, user: { active: true } },
        select: { userId: true, netAvailableHours: true, user: { select: { name: true } } },
      }),
    ]);
    const partnerName = new Map(partners.map((p) => [p.id, p.name]));

    const inputs: ProgramEngagementInput[] = live.map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      clientName: r.client.legalName,
      fiscalYear: r.fiscalYear,
      status: r.status as 'DRAFT' | 'APPROVED',
      plannedStartDate: r.plannedStartDate,
      plannedEndDate: r.plannedEndDate,
      partnerName: r.leadPartnerId ? partnerName.get(r.leadPartnerId) ?? null : null,
      estimatedHours: r.audit?.estimatedHours ?? null,
      team: (r.audit?.team ?? []).map((t) => ({ userId: t.userId, userName: t.user.name, budgetedHours: t.budgetedHours })),
      proposalHours: proposedTeamHours(r.engagementLetter?.proposal?.teamJson),
    }));

    // Horas de cliente ya trabajadas en el año por persona (referencia junto a lo comprometido).
    const actual = await this.prisma.timeEntry.groupBy({
      by: ['userId'],
      where: {
        organizationId: org, workDate: { gte: new Date(Date.UTC(y, 0, 1)), lt: new Date(Date.UTC(y + 1, 0, 1)) },
        category: { in: [TimeEntryCategory.CLIENT_BILLABLE, TimeEntryCategory.CLIENT_NON_BILLABLE] },
        // (auditId NOT IN deja fuera las horas sin encargo, por eso el OR con null)
        ...(hidden.size ? { OR: [{ auditId: null }, { auditId: { notIn: [...hidden] } }] } : {}),
      },
      _sum: { hours: true },
    });

    return buildProgram(
      y, inputs, profiles.map((p) => ({ userId: p.userId, name: p.user.name, capacity: p.netAvailableHours })),
      new Map(actual.map((a) => [a.userId, a._sum.hours ?? 0])),
    );
  }
}
