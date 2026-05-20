import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
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
          organizationId: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      data: users,
      meta: {
        total, page, limit,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  async findOne(id: string, requester: AuthUser) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true, name: true, email: true, role: true,
        avatarUrl: true, active: true, createdAt: true,
        organizationId: true, aiAssistantPersonality: true,
        timezone: true, preferredLanguage: true,
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
        aiAssistantPersonality: dto.aiAssistantPersonality as any,
      },
      select: {
        id: true, name: true, email: true, role: true,
        avatarUrl: true, aiAssistantPersonality: true,
      },
    });
  }

  async updateRole(id: string, dto: UpdateUserRoleDto, requester: AuthUser) {
    const target = await this.findOne(id, requester);
    if (target.organizationId !== requester.organizationId) throw new ForbiddenException();
    await this.authService.updateUserRole(target.id, dto.role);
    return this.prisma.user.update({
      where: { id },
      data: { role: dto.role },
      select: { id: true, name: true, email: true, role: true },
    });
  }

  async deactivate(id: string, requester: AuthUser) {
    await this.findOne(id, requester);
    return this.prisma.user.update({
      where: { id },
      data: { active: false },
      select: { id: true, active: true },
    });
  }
}
