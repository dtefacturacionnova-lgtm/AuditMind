import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import { NotificationChannel } from '@prisma/client';

export interface CreateNotificationDto {
  organizationId: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
  channel?: NotificationChannel;
}

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  // ─── Crear una notificación ─────────────────────────────────────────────────
  async create(data: CreateNotificationDto) {
    return this.prisma.notification.create({ data });
  }

  // ─── Crear varias a la vez ───────────────────────────────────────────────────
  async createBulk(notifications: CreateNotificationDto[]) {
    if (!notifications.length) return;
    return this.prisma.notification.createMany({ data: notifications });
  }

  // ─── Listar notificaciones del usuario autenticado ──────────────────────────
  async findAll(
    user: AuthUser,
    params: { page?: number; limit?: number; unreadOnly?: boolean } = {},
  ) {
    const { page = 1, limit = 20, unreadOnly = false } = params;

    const where = {
      userId: user.id,
      organizationId: user.organizationId,
      ...(unreadOnly ? { read: false } : {}),
    };

    const [items, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({
        where: { userId: user.id, organizationId: user.organizationId, read: false },
      }),
    ]);

    return { items, total, unreadCount, page, limit, pages: Math.ceil(total / limit) };
  }

  // ─── Conteo de no leídas (para el badge del header) ─────────────────────────
  async getUnreadCount(user: AuthUser) {
    const count = await this.prisma.notification.count({
      where: { userId: user.id, organizationId: user.organizationId, read: false },
    });
    return { count };
  }

  // ─── Marcar una como leída ──────────────────────────────────────────────────
  async markRead(id: string, user: AuthUser) {
    await this.prisma.notification.updateMany({
      where: { id, userId: user.id },
      data: { read: true, readAt: new Date() },
    });
    return { ok: true };
  }

  // ─── Marcar todas como leídas ───────────────────────────────────────────────
  async markAllRead(user: AuthUser) {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId: user.id, read: false },
      data: { read: true, readAt: new Date() },
    });
    return { marked: count };
  }

  // ─── Helper: notificar a todos los usuarios de un rol en la org ─────────────
  async notifyRole(
    organizationId: string,
    roles: string[],
    notification: Omit<CreateNotificationDto, 'organizationId' | 'userId'>,
  ) {
    const users = await this.prisma.user.findMany({
      where: { organizationId, role: { in: roles as any }, active: true },
      select: { id: true },
    });

    if (!users.length) return;

    await this.createBulk(
      users.map(u => ({
        ...notification,
        organizationId,
        userId: u.id,
      })),
    );
  }
}
