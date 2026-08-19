import {
  Injectable, NotFoundException, ForbiddenException,
} from '@nestjs/common';
import { AdminTaskStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import {
  CreateAdminTaskDto, UpdateAdminTaskDto, ListAdminTasksQueryDto,
} from './dto/admin-task.dto';

// Mismo criterio de jerarquía que RolesGuard — replicado aquí porque el guard
// no lo exporta (mismo patrón ya usado en timesheet.service.ts).
const ROLE_HIERARCHY: Record<string, number> = {
  SUPER_ADMIN: 100, ADMIN: 90, CAE: 80, AUDIT_MANAGER: 70,
  SENIOR_AUDITOR: 60, AUDITOR: 50, AUDITEE: 20, READ_ONLY: 10,
};

const INCLUDE = {
  assignedTo: { select: { id: true, name: true, avatarUrl: true } },
  createdBy:  { select: { id: true, name: true } },
} satisfies Prisma.AdminTaskInclude;

@Injectable()
export class AdminTasksService {
  constructor(private readonly prisma: PrismaService) {}

  private isManagerOrAbove(user: AuthUser): boolean {
    return (ROLE_HIERARCHY[user.role] ?? 0) >= ROLE_HIERARCHY.AUDIT_MANAGER;
  }

  private async getTaskOrThrow(id: string, user: AuthUser) {
    const task = await this.prisma.adminTask.findUnique({ where: { id }, include: INCLUDE });
    if (!task || task.organizationId !== user.organizationId) {
      throw new NotFoundException('Tarea no encontrada');
    }
    return task;
  }

  /** Editar/eliminar: el responsable, quien la creó, o AUDIT_MANAGER+ — nunca un tercero ajeno a la tarea. */
  private canModify(task: { assignedToId: string | null; createdById: string }, user: AuthUser): boolean {
    return this.isManagerOrAbove(user) || task.assignedToId === user.id || task.createdById === user.id;
  }

  async create(dto: CreateAdminTaskDto, user: AuthUser) {
    if (dto.assignedToId && dto.assignedToId !== user.id) {
      const assignee = await this.prisma.user.findFirst({
        where:  { id: dto.assignedToId, organizationId: user.organizationId },
        select: { id: true },
      });
      if (!assignee) throw new NotFoundException('Usuario asignado no encontrado en la organización');
    }

    return this.prisma.adminTask.create({
      data: {
        organizationId: user.organizationId,
        title:          dto.title,
        description:    dto.description ?? null,
        assignedToId:   dto.assignedToId ?? user.id,
        dueDate:        dto.dueDate ? new Date(dto.dueDate) : null,
        createdById:    user.id,
      },
      include: INCLUDE,
    });
  }

  /**
   * Quien no es AUDIT_MANAGER+ solo ve lo suyo (asignado a él o creado por él),
   * sin importar qué assignedToId haya pedido por query — mismo criterio de
   * ownership que TimesheetService.getReport().
   */
  async findAll(query: ListAdminTasksQueryDto, user: AuthUser) {
    const isManager = this.isManagerOrAbove(user);

    const where: Prisma.AdminTaskWhereInput = {
      organizationId: user.organizationId,
      ...(query.status && { status: query.status }),
    };

    if (isManager) {
      if (query.assignedToId) where.assignedToId = query.assignedToId;
    } else {
      where.OR = [{ assignedToId: user.id }, { createdById: user.id }];
    }

    return this.prisma.adminTask.findMany({
      where,
      include: INCLUDE,
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async update(id: string, dto: UpdateAdminTaskDto, user: AuthUser) {
    const task = await this.getTaskOrThrow(id, user);
    if (!this.canModify(task, user)) {
      throw new ForbiddenException('No tienes permiso para editar esta tarea');
    }

    if (dto.assignedToId && dto.assignedToId !== task.assignedToId) {
      const assignee = await this.prisma.user.findFirst({
        where:  { id: dto.assignedToId, organizationId: user.organizationId },
        select: { id: true },
      });
      if (!assignee) throw new NotFoundException('Usuario asignado no encontrado en la organización');
    }

    return this.prisma.adminTask.update({
      where: { id },
      data: {
        ...(dto.title       !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.assignedToId !== undefined && { assignedToId: dto.assignedToId }),
        ...(dto.dueDate      !== undefined && { dueDate: dto.dueDate ? new Date(dto.dueDate) : null }),
      },
      include: INCLUDE,
    });
  }

  /** completedAt se sincroniza con el estado — nunca queda una tarea DONE sin
   *  fecha de cierre, ni una tarea reabierta con una fecha de cierre vieja. */
  async updateStatus(id: string, status: AdminTaskStatus, user: AuthUser) {
    const task = await this.getTaskOrThrow(id, user);
    if (!this.canModify(task, user)) {
      throw new ForbiddenException('No tienes permiso para cambiar el estado de esta tarea');
    }

    return this.prisma.adminTask.update({
      where: { id },
      data: {
        status,
        completedAt: status === AdminTaskStatus.DONE ? new Date() : null,
      },
      include: INCLUDE,
    });
  }

  async remove(id: string, user: AuthUser) {
    const task = await this.getTaskOrThrow(id, user);
    if (!this.canModify(task, user)) {
      throw new ForbiddenException('No tienes permiso para eliminar esta tarea');
    }
    await this.prisma.adminTask.delete({ where: { id } });
    return { success: true };
  }
}
