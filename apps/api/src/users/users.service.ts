import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { assertCanGrantRole, assertCanManageUser } from '../common/utils/tenant.util';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto, UpdateUserRoleDto } from './dto/update-user.dto';
import { AuthUser } from '../auth/jwt.strategy';
import { UserRole } from '@prisma/client';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
  ) {}

  async findAll(user: AuthUser, page = 1, limit = 20, search?: string) {
    const skip = (page - 1) * limit;
    const where = {
      ...(user.role !== UserRole.SUPER_ADMIN && { organizationId: user.organizationId }),
      active: true,
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    };
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        select: {
          id: true, name: true, email: true, role: true,
          avatarUrl: true, active: true, createdAt: true,
          organizationId: true, supabaseUserId: true,
          organization: { select: { name: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    // Invitaciones pendientes (nunca confirmaron su correo ni entraron): una sola consulta para toda la página.
    const pending = await this.authService.pendingInvites(users.map((u) => u.supabaseUserId));
    const isSuper = user.role === UserRole.SUPER_ADMIN;
    const data = users.map(({ supabaseUserId, organization, ...rest }) => ({
      ...rest,
      invitePending: pending.has(supabaseUserId),
      // El Super Admin ve usuarios de todas las organizaciones: se le dice a cuál pertenece cada uno.
      ...(isSuper && { organizationName: organization.name }),
    }));
    return {
      data,
      meta: {
        total, page, limit,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  /** Reenvía la invitación a quien nunca la aceptó (ver AuthService.resendInvite). */
  resendInvite(id: string, requester: AuthUser) {
    return this.authService.resendInvite(id, requester);
  }

  async findOne(id: string, requester: AuthUser) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true, name: true, email: true, role: true,
        avatarUrl: true, active: true, createdAt: true,
        organizationId: true, aiAssistantPersonality: true,
        timezone: true, preferredLanguage: true, initials: true,
      },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    if (
      requester.role !== UserRole.SUPER_ADMIN &&
      user.organizationId !== requester.organizationId
    ) {
      throw new ForbiddenException();
    }
    return user;
  }

  async updateMe(id: string, dto: UpdateUserDto) {
    return this.prisma.user.update({
      where: { id },
      data: {
        name: dto.name,
        initials: dto.initials,
        aiAssistantPersonality: dto.aiAssistantPersonality as any,
      },
      select: {
        id: true, name: true, email: true, role: true,
        avatarUrl: true, aiAssistantPersonality: true, initials: true,
      },
    });
  }

  async updateRole(id: string, dto: UpdateUserRoleDto, requester: AuthUser) {
    const target = await this.findOne(id, requester);
    if (target.organizationId !== requester.organizationId) throw new ForbiddenException();
    // Antes un ADMIN podía ascenderse (o ascender a otro) a SUPER_ADMIN, rol de plataforma.
    assertCanManageUser(requester, target);
    assertCanGrantRole(requester, dto.role);
    await this.authService.updateUserRole(target.id, dto.role);
    return this.prisma.user.update({
      where: { id },
      data: { role: dto.role },
      select: { id: true, name: true, email: true, role: true },
    });
  }

  async deactivate(id: string, requester: AuthUser) {
    const target = await this.findOne(id, requester);
    assertCanManageUser(requester, target);
    return this.prisma.user.update({
      where: { id },
      data: { active: false },
      select: { id: true, active: true },
    });
  }
}
