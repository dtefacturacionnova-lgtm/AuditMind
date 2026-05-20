import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import { DataSourceType, ConnectorStatus, ImportStatus, Prisma } from '@prisma/client';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreateDataSourceDto {
  name: string;
  type: DataSourceType;
  config: Record<string, unknown>;
}

export interface UpdateDataSourceDto {
  name?: string;
  config?: Record<string, unknown>;
  status?: ConnectorStatus;
}

export interface RunImportDto {
  auditId?: string;
  /** Opciones extra para el conector (campos a importar, filtros, etc.) */
  options?: Record<string, unknown>;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class DataSourcesService {
  private readonly logger = new Logger(DataSourcesService.name);
  private readonly aiServiceUrl: string;
  private readonly internalKey: string;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    this.aiServiceUrl = this.config.get<string>('AI_SERVICE_URL', 'http://localhost:3003');
    this.internalKey  = this.config.get<string>('AI_SERVICE_INTERNAL_KEY', 'auditmind-internal-2026-xK9mP3qR');
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  async findAll(user: AuthUser) {
    return this.prisma.dataSource.findMany({
      where: { organizationId: user.organizationId },
      include: {
        createdBy: { select: { id: true, name: true } },
        _count: { select: { imports: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, user: AuthUser) {
    const ds = await this.prisma.dataSource.findFirst({
      where: { id, organizationId: user.organizationId },
      include: {
        createdBy: { select: { id: true, name: true } },
        imports: {
          orderBy: { startedAt: 'desc' },
          take: 10,
        },
      },
    });
    if (!ds) throw new NotFoundException('Fuente de datos no encontrada');
    return ds;
  }

  async create(dto: CreateDataSourceDto, user: AuthUser) {
    return this.prisma.dataSource.create({
      data: {
        organizationId: user.organizationId,
        name: dto.name,
        type: dto.type,
        config: dto.config as Prisma.InputJsonValue,
        createdById: user.id,
      },
    });
  }

  async update(id: string, dto: UpdateDataSourceDto, user: AuthUser) {
    await this.assertOwner(id, user);
    return this.prisma.dataSource.update({
      where: { id },
      data: {
        ...(dto.name    ? { name: dto.name }                                          : {}),
        ...(dto.config  ? { config: dto.config as Prisma.InputJsonValue }             : {}),
        ...(dto.status  ? { status: dto.status }                                      : {}),
        updatedAt: new Date(),
      },
    });
  }

  async remove(id: string, user: AuthUser) {
    await this.assertOwner(id, user);
    await this.prisma.dataSource.delete({ where: { id } });
    return { ok: true };
  }

  // ─── Test de conectividad ──────────────────────────────────────────────────

  async testConnection(id: string, user: AuthUser) {
    const ds = await this.assertOwner(id, user);

    try {
      const res = await fetch(`${this.aiServiceUrl}/connectors/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-key': this.internalKey,
        },
        body: JSON.stringify({
          type: ds.type,
          config: ds.config,
        }),
      });

      const data = (await res.json()) as { ok: boolean; message?: string };

      await this.prisma.dataSource.update({
        where: { id },
        data: {
          lastTestedAt: new Date(),
          lastTestStatus: res.ok ? 'ok' : 'error',
          lastTestError: res.ok ? null : (data.message ?? 'Error desconocido'),
          status: res.ok ? ConnectorStatus.ACTIVE : ConnectorStatus.ERROR,
          updatedAt: new Date(),
        },
      });

      return { ok: res.ok, message: data.message ?? (res.ok ? 'Conexión exitosa' : 'Error de conexión') };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'AI service no disponible';
      await this.prisma.dataSource.update({
        where: { id },
        data: {
          lastTestedAt: new Date(),
          lastTestStatus: 'error',
          lastTestError: msg,
          status: ConnectorStatus.ERROR,
          updatedAt: new Date(),
        },
      });
      return { ok: false, message: msg };
    }
  }

  // ─── Ejecución de importación ──────────────────────────────────────────────

  async runImport(id: string, dto: RunImportDto, user: AuthUser) {
    const ds = await this.assertOwner(id, user);

    if (ds.status === ConnectorStatus.INACTIVE) {
      throw new BadRequestException('Activa y prueba la conexión antes de importar');
    }

    // Registrar el import en DB como PENDING → RUNNING
    const importRecord = await this.prisma.connectorImport.create({
      data: {
        sourceId: id,
        auditId: dto.auditId ?? null,
        status: ImportStatus.RUNNING,
      },
    });

    // Llamar al AI Service de forma asíncrona (fire-and-forget en background)
    this.executeImportBackground(importRecord.id, ds, dto);

    return {
      importId: importRecord.id,
      status: 'RUNNING',
      message: 'Importación iniciada. Consulta el estado con GET /data-sources/:id/imports/:importId',
    };
  }

  async getImportStatus(sourceId: string, importId: string, user: AuthUser) {
    await this.assertOwner(sourceId, user);
    const imp = await this.prisma.connectorImport.findFirst({
      where: { id: importId, sourceId },
    });
    if (!imp) throw new NotFoundException('Import no encontrado');
    return imp;
  }

  // ─── Privados ─────────────────────────────────────────────────────────────

  private async assertOwner(id: string, user: AuthUser) {
    const ds = await this.prisma.dataSource.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!ds) throw new NotFoundException('Fuente de datos no encontrada');
    return ds;
  }

  private async executeImportBackground(
    importId: string,
    ds: { type: DataSourceType; config: unknown; id: string },
    dto: RunImportDto,
  ) {
    try {
      const res = await fetch(`${this.aiServiceUrl}/connectors/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-key': this.internalKey,
        },
        body: JSON.stringify({
          type: ds.type,
          config: ds.config,
          options: dto.options ?? {},
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        await this.prisma.connectorImport.update({
          where: { id: importId },
          data: { status: ImportStatus.FAILED, errorMsg: err, completedAt: new Date() },
        });
        return;
      }

      const result = (await res.json()) as { records: unknown[]; summary: unknown };

      await this.prisma.connectorImport.update({
        where: { id: importId },
        data: {
          status: ImportStatus.COMPLETED,
          recordCount: result.records?.length ?? 0,
          result: result.summary as any,
          completedAt: new Date(),
        },
      });

      // Actualizar estadísticas del DataSource
      await this.prisma.dataSource.update({
        where: { id: ds.id },
        data: {
          lastImportAt: new Date(),
          totalImports: { increment: 1 },
          updatedAt: new Date(),
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      this.logger.error(`Import ${importId} failed: ${msg}`);
      await this.prisma.connectorImport.update({
        where: { id: importId },
        data: { status: ImportStatus.FAILED, errorMsg: msg, completedAt: new Date() },
      });
    }
  }
}
