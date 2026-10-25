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
import { assertPublicHttpUrl } from '../common/utils/ssrf.util';
import { assertInOrg } from '../common/utils/tenant.util';
import { assertAuditVisible, hiddenInvestigationIds } from '../common/utils/investigation-scope.util';

/** Campos de `config` que son credenciales: se guardan, pero NUNCA vuelven al
 *  navegador (auditoría de seguridad 2026-10-18). */
const SECRET_KEYS = ['password', 'api_key', 'bearer_token', 'secret', 'client_secret', 'token'];
const MASK = '••••••••';

function maskConfig(config: unknown): unknown {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return config;
  const out: Record<string, unknown> = { ...(config as Record<string, unknown>) };
  for (const k of SECRET_KEYS) if (out[k]) out[k] = MASK;
  return out;
}

function maskSource<T extends { config?: unknown }>(ds: T): T {
  return { ...ds, config: maskConfig(ds.config) };
}

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
    const rows = await this.prisma.dataSource.findMany({
      where: { organizationId: user.organizationId },
      include: {
        createdBy: { select: { id: true, name: true } },
        _count: { select: { imports: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(maskSource);
  }

  async findOne(id: string, user: AuthUser) {
    // Modo investigación (2026-10-25): las importaciones hechas para una investigación ajena (su resumen y errores) no se listan.
    const hidden = await hiddenInvestigationIds(this.prisma, user);
    const ds = await this.prisma.dataSource.findFirst({
      where: { id, organizationId: user.organizationId },
      include: {
        createdBy: { select: { id: true, name: true } },
        imports: {
          ...(hidden.length > 0 && { where: { OR: [{ auditId: null }, { auditId: { notIn: hidden } }] } }),
          orderBy: { startedAt: 'desc' },
          take: 10,
        },
      },
    });
    if (!ds) throw new NotFoundException('Fuente de datos no encontrada');
    return maskSource(ds);
  }

  async create(dto: CreateDataSourceDto, user: AuthUser) {
    await this.assertSafeConfig(dto.type, dto.config);
    const ds = await this.prisma.dataSource.create({
      data: {
        organizationId: user.organizationId,
        name: dto.name,
        type: dto.type,
        config: dto.config as Prisma.InputJsonValue,
        createdById: user.id,
      },
    });
    return maskSource(ds);
  }

  async update(id: string, dto: UpdateDataSourceDto, user: AuthUser) {
    const current = await this.assertOwner(id, user);
    let config: Record<string, unknown> | undefined;
    if (dto.config) {
      // El navegador solo ve las credenciales enmascaradas: si devuelve la
      // máscara (o no manda el campo), se conserva la credencial guardada.
      const stored = (current.config ?? {}) as Record<string, unknown>;
      config = { ...dto.config };
      for (const k of SECRET_KEYS) {
        if (config[k] === MASK || (config[k] === undefined && stored[k] !== undefined)) config[k] = stored[k];
      }
      await this.assertSafeConfig(current.type, config);
    }
    const ds = await this.prisma.dataSource.update({
      where: { id },
      data: {
        ...(dto.name    ? { name: dto.name }                                          : {}),
        ...(config      ? { config: config as Prisma.InputJsonValue }                 : {}),
        ...(dto.status  ? { status: dto.status }                                      : {}),
        updatedAt: new Date(),
      },
    });
    return maskSource(ds);
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
    await assertInOrg(this.prisma.audit, dto.auditId, { organizationId: user.organizationId }, 'La auditoría');
    if (dto.auditId) await assertAuditVisible(this.prisma, dto.auditId, user); // modo investigación (2026-10-25)

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
    if (imp.auditId) await assertAuditVisible(this.prisma, imp.auditId, user);
    return imp;
  }

  // ─── Privados ─────────────────────────────────────────────────────────────

  /** SSRF: las URLs de un conector REST deben apuntar a un host público. El
   *  ai-service lo vuelve a validar en cada petición y redirección. */
  private async assertSafeConfig(type: DataSourceType, config: Record<string, unknown>) {
    if (type !== DataSourceType.REST_API) return;
    const baseUrl = typeof config.base_url === 'string' ? config.base_url : '';
    if (baseUrl) await assertPublicHttpUrl(baseUrl, 'La URL base');
    const health = typeof config.health_endpoint === 'string' ? config.health_endpoint : '';
    if (/^[a-z][a-z0-9+.-]*:/i.test(health)) await assertPublicHttpUrl(health, 'El endpoint de prueba');
  }

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
