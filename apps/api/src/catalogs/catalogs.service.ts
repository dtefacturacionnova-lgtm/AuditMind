import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import {
  CreateEntityTypeDto, UpdateEntityTypeDto,
  CreateProcessCategoryDto, UpdateProcessCategoryDto,
} from './dto/catalogs.dto';

const DEFAULT_ENTITY_TYPES = [
  { value: 'CORPORATE',  label: 'Corporativo / Holding',        icon: '🏛️', color: 'bg-slate-200 text-slate-800',   sortOrder: 0 },
  { value: 'COMPANY',    label: 'Empresa / Razón Social',        icon: '🏢', color: 'bg-blue-100 text-blue-800',     sortOrder: 1 },
  { value: 'DIVISION',   label: 'División / Vicepresidencia',    icon: '🗂️', color: 'bg-indigo-100 text-indigo-700', sortOrder: 2 },
  { value: 'DEPARTMENT', label: 'Departamento / Dirección',      icon: '📁', color: 'bg-sky-100 text-sky-700',       sortOrder: 3 },
  { value: 'AREA',       label: 'Área / Gerencia',               icon: '👥', color: 'bg-teal-100 text-teal-700',     sortOrder: 4 },
  { value: 'TEAM',       label: 'Equipo / Unidad operativa',     icon: '🔹', color: 'bg-green-100 text-green-700',   sortOrder: 5 },
  { value: 'BRANCH',     label: 'Sucursal / Sede / Planta',      icon: '📍', color: 'bg-amber-100 text-amber-700',   sortOrder: 6 },
  { value: 'SUBSIDIARY', label: 'Subsidiaria / Filial',          icon: '⚖️', color: 'bg-purple-100 text-purple-700', sortOrder: 7 },
];

const DEFAULT_PROCESS_CATEGORIES = [
  { code: '1.0',  name: 'Desarrollar Visión y Estrategia',        type: 'OPERATING', sortOrder: 0  },
  { code: '2.0',  name: 'Desarrollar y Gestionar Productos',      type: 'OPERATING', sortOrder: 1  },
  { code: '3.0',  name: 'Comercializar y Vender',                 type: 'OPERATING', sortOrder: 2  },
  { code: '4.0',  name: 'Entregar Productos y Servicios',         type: 'OPERATING', sortOrder: 3  },
  { code: '5.0',  name: 'Gestionar Servicio al Cliente',          type: 'OPERATING', sortOrder: 4  },
  { code: '6.0',  name: 'Gestionar Inteligencia de Negocio',      type: 'OPERATING', sortOrder: 5  },
  { code: '7.0',  name: 'Gestionar Recursos Humanos',             type: 'SUPPORT',   sortOrder: 6  },
  { code: '8.0',  name: 'Gestionar Tecnología de Información',    type: 'SUPPORT',   sortOrder: 7  },
  { code: '9.0',  name: 'Gestionar Recursos Financieros',         type: 'SUPPORT',   sortOrder: 8  },
  { code: '10.0', name: 'Adquirir, Construir y Gestionar Activos',type: 'SUPPORT',   sortOrder: 9  },
  { code: '11.0', name: 'Gestionar Riesgo, Cumplimiento y Res.',  type: 'SUPPORT',   sortOrder: 10 },
  { code: '12.0', name: 'Gestionar Relaciones Externas',          type: 'SUPPORT',   sortOrder: 11 },
  { code: '13.0', name: 'Desarrollar y Gestionar Capacidades',    type: 'SUPPORT',   sortOrder: 12 },
];

@Injectable()
export class CatalogsService {
  constructor(private prisma: PrismaService) {}

  // ─── Entity Types ──────────────────────────────────────────────────────────

  async getEntityTypes(user: AuthUser) {
    const count = await this.prisma.entityTypeConfig.count({
      where: { organizationId: user.organizationId },
    });
    if (count === 0) await this.seedEntityTypes(user.organizationId);
    return this.prisma.entityTypeConfig.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async createEntityType(dto: CreateEntityTypeDto, user: AuthUser) {
    return this.prisma.entityTypeConfig.create({
      data: { ...dto, organizationId: user.organizationId },
    });
  }

  async updateEntityType(id: string, dto: UpdateEntityTypeDto, user: AuthUser) {
    return this.prisma.entityTypeConfig.update({
      where: { id },
      data: dto,
    });
  }

  async deleteEntityType(id: string, user: AuthUser) {
    return this.prisma.entityTypeConfig.update({
      where: { id },
      data: { active: false },
    });
  }

  // ─── Process Categories ────────────────────────────────────────────────────

  async getProcessCategories(user: AuthUser) {
    const count = await this.prisma.processCategoryConfig.count({
      where: { organizationId: user.organizationId },
    });
    if (count === 0) await this.seedProcessCategories(user.organizationId);
    return this.prisma.processCategoryConfig.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async createProcessCategory(dto: CreateProcessCategoryDto, user: AuthUser) {
    return this.prisma.processCategoryConfig.create({
      data: { ...dto, organizationId: user.organizationId },
    });
  }

  async updateProcessCategory(id: string, dto: UpdateProcessCategoryDto, user: AuthUser) {
    return this.prisma.processCategoryConfig.update({
      where: { id },
      data: dto,
    });
  }

  async deleteProcessCategory(id: string, user: AuthUser) {
    return this.prisma.processCategoryConfig.update({
      where: { id },
      data: { active: false },
    });
  }

  // ─── Seeds ─────────────────────────────────────────────────────────────────

  private async seedEntityTypes(organizationId: string) {
    await this.prisma.entityTypeConfig.createMany({
      data: DEFAULT_ENTITY_TYPES.map((t) => ({ ...t, organizationId })),
      skipDuplicates: true,
    });
  }

  private async seedProcessCategories(organizationId: string) {
    await this.prisma.processCategoryConfig.createMany({
      data: DEFAULT_PROCESS_CATEGORIES.map((c) => ({ ...c, organizationId })),
      skipDuplicates: true,
    });
  }
}
