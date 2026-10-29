import { Injectable, NotFoundException, ForbiddenException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { AuthUser } from '../auth/jwt.strategy';
import { UserRole } from '@prisma/client';

export interface AdminInviteResult {
  email: string;
  status: 'sent' | 'failed';
  error?: string;
}

@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
  ) {}

  /** "FE & CE" → "fe-ce". Si queda vacío (nombre solo con símbolos) usa "org". */
  private slugify(name: string): string {
    const slug = name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return slug || 'org';
  }

  /** Slug único: "fe-ce", y si ya existe "fe-ce-2", "fe-ce-3"... */
  private async uniqueSlug(name: string): Promise<string> {
    const base = this.slugify(name);
    let candidate = base;
    for (let i = 2; i < 100; i++) {
      const taken = await this.prisma.organization.findUnique({ where: { slug: candidate }, select: { id: true } });
      if (!taken) return candidate;
      candidate = `${base}-${i}`;
    }
    return `${base}-${Date.now()}`;
  }

  async create(dto: CreateOrganizationDto) {
    const name = dto.name.trim();

    // Evita duplicados por descuido (mismo nombre, sin distinguir mayúsculas) —
    // dos organizaciones con el mismo nombre confundirían al SUPER_ADMIN en la lista.
    const duplicate = await this.prisma.organization.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException(`Ya existe una organización llamada "${name}"`);
    }

    const org = await this.prisma.organization.create({
      data: {
        name,
        slug: await this.uniqueSlug(name),
        plan: dto.subscriptionTier?.toLowerCase() ?? 'starter',
        primaryColor: dto.primaryColor ?? '#0F2D4A',
        settings: {},
        ...(dto.auditModality !== undefined && { auditModality: dto.auditModality }),
      },
    });

    // La organización ya quedó creada: si la invitación del primer administrador
    // falla (correo inválido, ya registrado...) NO se revierte ni se lanza error —
    // se reporta en `adminInvite` y se puede reintentar con POST :id/invite-admin.
    let adminInvite: AdminInviteResult | undefined;
    if (dto.adminEmail) {
      adminInvite = await this.inviteAdminSafe(org.id, dto.adminEmail, dto.adminName ?? name);
    }

    return { ...org, adminInvite };
  }

  private async inviteAdminSafe(organizationId: string, email: string, name: string): Promise<AdminInviteResult> {
    try {
      await this.authService.inviteUser({ email: email.trim(), name: name.trim(), role: 'ADMIN', organizationId }, { role: 'SUPER_ADMIN' });
      return { email, status: 'sent' };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Invitación de admin a ${email} (org ${organizationId}) falló: ${message}`);
      return { email, status: 'failed', error: message };
    }
  }

  /** Invita a una persona como ADMIN de una organización existente (solo SUPER_ADMIN). */
  async inviteAdmin(organizationId: string, dto: { email: string; name: string }) {
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true, name: true } });
    if (!org) throw new NotFoundException('Organización no encontrada');
    // A diferencia de create(), aquí SÍ se propaga el error: es la única acción del request.
    await this.authService.inviteUser({
      email: dto.email.trim(),
      name: dto.name.trim(),
      role: 'ADMIN',
      organizationId,
    }, { role: 'SUPER_ADMIN' });
    return { organizationId, organizationName: org.name, email: dto.email.trim(), status: 'sent' as const };
  }

  async findAll() {
    return this.prisma.organization.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { users: true, audits: true } },
        users: {
          where: { role: UserRole.ADMIN, active: true },
          select: { name: true, email: true },
          take: 3,
        },
      },
    });
  }

  async findOne(id: string, user: AuthUser) {
    if (user.role !== UserRole.SUPER_ADMIN && user.organizationId !== id) {
      throw new ForbiddenException('No autorizado para ver esta organización');
    }
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: {
        _count: { select: { users: true, audits: true } },
      },
    });
    if (!org) throw new NotFoundException('Organización no encontrada');
    return org;
  }

  async update(id: string, dto: UpdateOrganizationDto, user: AuthUser) {
    if (user.role !== UserRole.SUPER_ADMIN && user.organizationId !== id) {
      throw new ForbiddenException('No autorizado para modificar esta organización');
    }
    await this.findOne(id, user);
    return this.prisma.organization.update({
      where: { id },
      data: {
        name: dto.name,
        primaryColor: dto.primaryColor,
        // El plan comercial lo define la plataforma, no la propia organización.
        ...(dto.subscriptionTier !== undefined && user.role === UserRole.SUPER_ADMIN && {
          plan: dto.subscriptionTier.toLowerCase(),
        }),
        // Antes cada edición forzaba `active: true` (reactivaba en silencio una
        // organización desactivada). Ahora solo el SUPER_ADMIN cambia `active`, y solo si lo envía.
        ...(dto.active !== undefined && user.role === UserRole.SUPER_ADMIN && { active: dto.active }),
        ...(dto.auditModality !== undefined && { auditModality: dto.auditModality }),
      },
    });
  }

  async findMine(organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        auditModality: true,
        logoUrl: true,
        primaryColor: true,
      },
    });
    if (!org) throw new NotFoundException('Organización no encontrada');
    return org;
  }

  async getStats(id: string, user: AuthUser) {
    await this.findOne(id, user);
    const [totalAudits, activeAudits, totalFindings, openFindings, totalUsers, totalWorkingPapers] =
      await Promise.all([
        this.prisma.audit.count({ where: { organizationId: id } }),
        this.prisma.audit.count({
          where: { organizationId: id, status: { in: ['PLANNING', 'IN_PROGRESS', 'REVIEW'] } },
        }),
        this.prisma.finding.count({ where: { organizationId: id } }),
        this.prisma.finding.count({
          where: { organizationId: id, status: { notIn: ['CLOSED'] } },
        }),
        this.prisma.user.count({ where: { organizationId: id, active: true } }),
        this.prisma.workingPaper.count({ where: { audit: { organizationId: id } } }),
      ]);
    return { totalAudits, activeAudits, totalFindings, openFindings, totalUsers, totalWorkingPapers };
  }
}
