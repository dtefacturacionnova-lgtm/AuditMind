import {
  Injectable, NotFoundException, ForbiddenException, ConflictException,
} from '@nestjs/common';
import { Client, ClientStatus, EngagementLetterStatus, EngagementStatus, Prisma, ProposalStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import { CreateClientDto, UpdateClientDto } from './dto/client.dto';
import { maskHiddenAudits } from '../common/utils/investigation-scope.util';
import { presentAcceptanceCheck } from './acceptance-present.util';

/** Una propuesta enviada o una carta por firmar sin respuesta desde hace más de esto se marca «sin respuesta» (aviso, no cambia su estado). */
export const STALE_AFTER_DAYS = 60;

/**
 * Detalle del cliente para la pantalla con tabs: cada etapa del pipeline
 * comercial (Radar → Propuesta → Carta → Encargo) viene incluida.
 */
const CLIENT_DETAIL_INCLUDE = {
  createdBy: { select: { id: true, name: true, avatarUrl: true } },
  auditEntity: { select: { id: true, name: true } },
  acceptanceChecks: {
    orderBy: { year: 'desc' as const },
    include: { decidedBy: { select: { id: true, name: true } } },
  },
  proposals: {
    orderBy: { createdAt: 'desc' as const },
    include: { createdBy: { select: { id: true, name: true } } },
  },
  engagementLetters: {
    orderBy: { createdAt: 'desc' as const },
    include: {
      proposal: { select: { id: true, year: true, status: true, feeAmount: true, feeCurrency: true } },
    },
  },
  engagements: {
    orderBy: { fiscalYear: 'desc' as const },
    include: {
      audit: { select: { id: true, title: true, status: true, type: true } },
      template: { select: { id: true, name: true, code: true } },
    },
  },
} satisfies Prisma.ClientInclude;

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Guard de tenant compartido por todo el módulo Cartera: cualquier servicio
   * que arranque desde un clientId lo resuelve por aquí para no repetir el
   * chequeo de organizationId en cinco lugares distintos.
   */
  async getClientOrThrow(id: string, user: AuthUser): Promise<Client> {
    const client = await this.prisma.client.findUnique({ where: { id } });
    if (!client) throw new NotFoundException('Cliente no encontrado');
    if (client.organizationId !== user.organizationId) throw new ForbiddenException();
    return client;
  }

  // ── Crear prospecto ────────────────────────────────────────────────────────
  /** Otro cliente de la organización con el mismo NIT (sin guiones ni espacios): evita registrar dos veces al mismo sujeto. */
  private async assertTaxIdFree(taxId: string | null | undefined, organizationId: string, exceptId?: string) {
    const normalized = (taxId ?? '').replace(/[\s-]/g, '').toLowerCase();
    if (!normalized) return;
    const others = await this.prisma.client.findMany({
      where: { organizationId, taxId: { not: null }, ...(exceptId && { id: { not: exceptId } }) },
      select: { id: true, legalName: true, taxId: true, status: true },
    });
    const dup = others.find((o) => (o.taxId ?? '').replace(/[\s-]/g, '').toLowerCase() === normalized);
    if (dup) {
      throw new ConflictException(
        `Ya existe un cliente con ese NIT: «${dup.legalName}»${dup.status === ClientStatus.DECLINED ? ' (declinado en la evaluación de aceptación)' : ''}.`,
      );
    }
  }

  async create(dto: CreateClientDto, user: AuthUser) {
    await this.assertTaxIdFree(dto.taxId, user.organizationId);
    return this.prisma.client.create({
      data: {
        organizationId:     user.organizationId,
        createdById:        user.id,
        legalName:          dto.legalName,
        tradeName:          dto.tradeName ?? null,
        taxId:              dto.taxId ?? null,
        industry:           dto.industry ?? null,
        contactName:        dto.contactName ?? null,
        contactEmail:       dto.contactEmail ?? null,
        contactPhone:       dto.contactPhone ?? null,
        address:            dto.address ?? null,
        notes:              dto.notes ?? null,
        legalRepName:       dto.legalRepName ?? null,
        ...(dto.beneficialOwners != null && { beneficialOwners: dto.beneficialOwners as unknown as Prisma.InputJsonValue }),
        ...(dto.fiscalYearEndMonth != null && { fiscalYearEndMonth: dto.fiscalYearEndMonth }),
        ...(dto.fiscalYearEndDay   != null && { fiscalYearEndDay:   dto.fiscalYearEndDay }),
        status: ClientStatus.PROSPECT,
      },
    });
  }

  /**
   * Clientes ACTIVOS sin actividad reciente: ni una carta de compromiso firmada ni un encargo vigente en el ejercicio anterior o el
   * actual. El estado «Inactivo» no se asignaba nunca; se calcula al leer (un aviso, no cambia el estado guardado), así que si el
   * cliente vuelve a contratar deja de aparecer solo.
   */
  private async dormantClientIds(organizationId: string, clients: Array<{ id: string; status: ClientStatus }>): Promise<Set<string>> {
    const ids = clients.filter((c) => c.status === ClientStatus.ACTIVE).map((c) => c.id);
    if (ids.length === 0) return new Set();
    const since = new Date().getFullYear() - 1;
    const [letters, engagements] = await Promise.all([
      this.prisma.engagementLetter.findMany({
        where: { organizationId, clientId: { in: ids }, status: EngagementLetterStatus.SIGNED, year: { gte: since } },
        select: { clientId: true }, distinct: ['clientId'],
      }),
      this.prisma.engagement.findMany({
        where: { organizationId, clientId: { in: ids }, status: { not: EngagementStatus.CANCELLED }, fiscalYear: { gte: since } },
        select: { clientId: true }, distinct: ['clientId'],
      }),
    ]);
    const active = new Set([...letters, ...engagements].map((r) => r.clientId));
    return new Set(ids.filter((id) => !active.has(id)));
  }

  // ── Listar ─────────────────────────────────────────────────────────────────
  async findAll(user: AuthUser, status?: ClientStatus) {
    const clients = await this.prisma.client.findMany({
      where: {
        organizationId: user.organizationId,
        ...(status && { status }),
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: {
          select: { acceptanceChecks: true, proposals: true, engagementLetters: true, engagements: true },
        },
      },
    });
    const dormant = await this.dormantClientIds(user.organizationId, clients);
    return clients.map((c) => ({ ...c, dormant: dormant.has(c.id) }));
  }

  // ── Detalle ────────────────────────────────────────────────────────────────
  async findOne(id: string, user: AuthUser) {
    await this.getClientOrThrow(id, user);
    // findUnique + include: el guard de arriba ya validó tenant.
    const client = await this.prisma.client.findUnique({
      where:   { id },
      include: CLIENT_DETAIL_INCLUDE,
    });
    if (!client) return client;
    const staleBefore = new Date(Date.now() - STALE_AFTER_DAYS * 24 * 3600 * 1000);
    const dormant = await this.dormantClientIds(user.organizationId, [client]);
    // Modo investigación (2026-10-25): los encargos cuya auditoría es una investigación ajena van sin título ni estado.
    return {
      ...client,
      dormant: dormant.has(client.id),
      acceptanceChecks: client.acceptanceChecks.map((c) => presentAcceptanceCheck(c)),
      proposals: client.proposals.map((p) => ({ ...p, stale: p.status === ProposalStatus.SENT && !!p.sentAt && p.sentAt < staleBefore })),
      engagementLetters: client.engagementLetters.map((l) => ({
        ...l, stale: l.status === EngagementLetterStatus.SENT && l.updatedAt < staleBefore,
      })),
      engagements: await maskHiddenAudits(this.prisma, client.engagements, user),
    };
  }

  // ── Editar datos generales (nunca el status) ──────────────────────────────
  async update(id: string, dto: UpdateClientDto, user: AuthUser) {
    await this.getClientOrThrow(id, user);
    if (dto.taxId != null) await this.assertTaxIdFree(dto.taxId, user.organizationId, id);

    return this.prisma.client.update({
      where: { id },
      data: {
        ...(dto.legalName          != null && { legalName:          dto.legalName }),
        ...(dto.tradeName          != null && { tradeName:          dto.tradeName }),
        ...(dto.taxId              != null && { taxId:              dto.taxId }),
        ...(dto.industry           != null && { industry:           dto.industry }),
        ...(dto.contactName        != null && { contactName:        dto.contactName }),
        ...(dto.contactEmail       != null && { contactEmail:       dto.contactEmail }),
        ...(dto.contactPhone       != null && { contactPhone:       dto.contactPhone }),
        ...(dto.address            != null && { address:            dto.address }),
        ...(dto.notes              != null && { notes:              dto.notes }),
        ...(dto.legalRepName       != null && { legalRepName:       dto.legalRepName }),
        ...(dto.beneficialOwners   != null && { beneficialOwners: dto.beneficialOwners as unknown as Prisma.InputJsonValue }),
        ...(dto.fiscalYearEndMonth != null && { fiscalYearEndMonth: dto.fiscalYearEndMonth }),
        ...(dto.fiscalYearEndDay   != null && { fiscalYearEndDay:   dto.fiscalYearEndDay }),
      },
    });
  }
}
