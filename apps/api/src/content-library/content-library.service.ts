import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { ContentLibraryKind, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import { CreateContentLibraryItemDto, UpdateContentLibraryItemDto } from './dto/content-library-item.dto';
import { SUBSTANTIVE_PROCEDURE_SEED, COSO_QUESTION_SEED, SeedItem } from './content-library-seed';

@Injectable()
export class ContentLibraryService {
  private readonly logger = new Logger(ContentLibraryService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Read ──────────────────────────────────────────────────────────────────

  /** Lista de la organización, opcionalmente filtrada por kind/groupKey. Siembra la biblioteca de sistema en el primer acceso. */
  async list(user: AuthUser, kind?: ContentLibraryKind, groupKey?: string) {
    await this.ensureSystemLibrary(user.organizationId, user.id);
    return this.prisma.contentLibraryItem.findMany({
      where: {
        organizationId: user.organizationId,
        ...(kind && { kind }),
        ...(groupKey && { groupKey }),
      },
      orderBy: [{ groupKey: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async findOne(id: string, user: AuthUser) {
    const item = await this.prisma.contentLibraryItem.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!item) throw new NotFoundException('Ítem de biblioteca no encontrado');
    return item;
  }

  // ─── Write ─────────────────────────────────────────────────────────────────

  async create(dto: CreateContentLibraryItemDto, user: AuthUser) {
    return this.prisma.contentLibraryItem.create({
      data: {
        organizationId: user.organizationId,
        kind:           dto.kind,
        groupKey:       dto.groupKey,
        groupLabel:     dto.groupLabel ?? null,
        itemLabel:      dto.itemLabel,
        itemSubtitle:   dto.itemSubtitle ?? null,
        itemDetails:    (dto.itemDetails ?? undefined) as Prisma.InputJsonValue,
        sortOrder:      dto.sortOrder ?? 0,
        isSystem:       false,
        createdById:    user.id,
      },
    });
  }

  async update(id: string, dto: UpdateContentLibraryItemDto, user: AuthUser) {
    await this.findOne(id, user);
    return this.prisma.contentLibraryItem.update({
      where: { id },
      data: {
        ...(dto.groupKey     !== undefined && { groupKey:     dto.groupKey }),
        ...(dto.groupLabel   !== undefined && { groupLabel:   dto.groupLabel }),
        ...(dto.itemLabel    !== undefined && { itemLabel:    dto.itemLabel }),
        ...(dto.itemSubtitle !== undefined && { itemSubtitle: dto.itemSubtitle }),
        ...(dto.itemDetails  !== undefined && { itemDetails:  dto.itemDetails as Prisma.InputJsonValue }),
        ...(dto.sortOrder    !== undefined && { sortOrder:    dto.sortOrder }),
      },
    });
  }

  async remove(id: string, user: AuthUser) {
    const item = await this.findOne(id, user);
    if (item.isSystem) {
      throw new ForbiddenException('Los ítems de la biblioteca de sistema no pueden eliminarse — puede editarlos, o restaurar la biblioteca para revertir cambios.');
    }
    await this.prisma.contentLibraryItem.delete({ where: { id } });
    return { deleted: true };
  }

  // ─── Seeding ───────────────────────────────────────────────────────────────

  /** Siembra perezosa — solo crea la biblioteca de sistema si esta organización aún no tiene ninguna. */
  async ensureSystemLibrary(organizationId: string, userId: string): Promise<void> {
    const existing = await this.prisma.contentLibraryItem.count({ where: { organizationId, isSystem: true } });
    if (existing > 0) return;
    await this.insertSeed(organizationId, userId, [...SUBSTANTIVE_PROCEDURE_SEED, ...COSO_QUESTION_SEED]);
  }

  /**
   * Restaura/actualiza la biblioteca de sistema de la organización del usuario.
   * Empareja por (kind, groupKey, itemLabel): actualiza contenido si ya existe,
   * crea si es nuevo. Nunca toca ítems con isSystem=false (los que el auditor
   * agregó por su cuenta).
   */
  async reseedSystemLibrary(user: AuthUser): Promise<{ updated: number; created: number }> {
    const seeds = [...SUBSTANTIVE_PROCEDURE_SEED, ...COSO_QUESTION_SEED];
    const existing = await this.prisma.contentLibraryItem.findMany({
      where: { organizationId: user.organizationId, isSystem: true },
      select: { id: true, kind: true, groupKey: true, itemLabel: true },
    });
    const key = (k: string, g: string, l: string) => `${k}::${g}::${l}`;
    const existingByKey = new Map(existing.map(e => [key(e.kind, e.groupKey, e.itemLabel), e.id]));

    let updated = 0;
    let created = 0;
    for (const seed of seeds) {
      const matchId = existingByKey.get(key(seed.kind, seed.groupKey, seed.itemLabel));
      if (matchId) {
        await this.prisma.contentLibraryItem.update({
          where: { id: matchId },
          data: {
            groupLabel:   seed.groupLabel ?? null,
            itemSubtitle: seed.itemSubtitle ?? null,
            itemDetails:  (seed.itemDetails ?? undefined) as Prisma.InputJsonValue,
            sortOrder:    seed.sortOrder,
          },
        });
        updated++;
      } else {
        await this.prisma.contentLibraryItem.create({
          data: {
            organizationId: user.organizationId,
            kind:           seed.kind,
            groupKey:       seed.groupKey,
            groupLabel:     seed.groupLabel ?? null,
            itemLabel:      seed.itemLabel,
            itemSubtitle:   seed.itemSubtitle ?? null,
            itemDetails:    (seed.itemDetails ?? undefined) as Prisma.InputJsonValue,
            sortOrder:      seed.sortOrder,
            isSystem:       true,
            createdById:    user.id,
          },
        });
        created++;
      }
    }
    this.logger.log(`[ContentLibrary] Reseed org=${user.organizationId}: ${updated} actualizados, ${created} creados`);
    return { updated, created };
  }

  private async insertSeed(organizationId: string, userId: string, seeds: SeedItem[]): Promise<void> {
    await this.prisma.contentLibraryItem.createMany({
      data: seeds.map(seed => ({
        organizationId,
        kind:         seed.kind,
        groupKey:     seed.groupKey,
        groupLabel:   seed.groupLabel ?? null,
        itemLabel:    seed.itemLabel,
        itemSubtitle: seed.itemSubtitle ?? null,
        itemDetails:  (seed.itemDetails ?? null) as Prisma.InputJsonValue,
        sortOrder:    seed.sortOrder,
        isSystem:     true,
        createdById:  userId,
      })),
    });
  }
}
