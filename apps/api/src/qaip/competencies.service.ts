import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import {
  CreateCertificationDto, CreateCompetencyDto, UpdateCompetencyDto, CreateCpeRecordDto,
} from './dto/competency.dto';

// NIGC 1 Art. 32(b) / A88-A94 exige que la firma defina y monitoree la
// competencia y la educación profesional continua de su personal, pero el
// estándar no fija un número de horas — cada firma define su propia política.
// 40h/año es el mínimo de referencia por defecto (alineado al esquema CPE del
// IIA para certificación CIA), no un mandato legal de esta jurisdicción.
export const DEFAULT_MIN_CPE_HOURS_YEAR = 40;

const MANAGER_ROLES = new Set(['AUDIT_MANAGER', 'CAE', 'ADMIN', 'SUPER_ADMIN']);

/**
 * Competencias/CPE — dato a nivel de PERSONA (administración del despacho),
 * no de encargo. Mismo patrón que UserAvailabilityProfile/UserCostProfile de
 * Capacidad. Consumido por: (1) asignación de equipo en Cartera, (2) la
 * dimensión "Competencia y Recursos" del Radar de Aceptación, (3) el tablero
 * de desempeño de QAIP (cumplimiento de horas CPE).
 */
@Injectable()
export class CompetenciesService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertAccess(targetUserId: string, user: AuthUser) {
    if (targetUserId === user.id) return;
    if (!MANAGER_ROLES.has(user.role)) {
      throw new ForbiddenException('Solo puedes gestionar tu propio perfil de competencias.');
    }
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { organizationId: true },
    });
    if (!target || target.organizationId !== user.organizationId) {
      throw new NotFoundException('Usuario no encontrado en tu organización.');
    }
  }

  async getRoster(user: AuthUser) {
    if (!MANAGER_ROLES.has(user.role)) {
      throw new ForbiddenException('Se requiere rol AUDIT_MANAGER o superior para ver el roster de competencias de la firma.');
    }
    const year = new Date().getFullYear();
    const users = await this.prisma.user.findMany({
      where: { organizationId: user.organizationId, active: true },
      select: {
        id: true, name: true, email: true, role: true,
        certifications: { where: { isActive: true }, orderBy: { issuedAt: 'desc' } },
        competencies: { orderBy: { area: 'asc' } },
        cpeRecords: { where: { year } },
      },
      orderBy: { name: 'asc' },
    });

    return users.map((u) => {
      const cpeHours = u.cpeRecords.reduce((s, r) => s + r.hours, 0);
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        certifications: u.certifications,
        competencies: u.competencies,
        cpe: {
          year,
          hours: Math.round(cpeHours * 10) / 10,
          minRequired: DEFAULT_MIN_CPE_HOURS_YEAR,
          compliant: cpeHours >= DEFAULT_MIN_CPE_HOURS_YEAR,
        },
      };
    });
  }

  async getProfile(targetUserId: string, user: AuthUser) {
    await this.assertAccess(targetUserId, user);
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true, name: true, email: true, role: true,
        certifications: { orderBy: { issuedAt: 'desc' } },
        competencies: { orderBy: { area: 'asc' } },
        cpeRecords: { orderBy: [{ year: 'desc' }, { completedAt: 'desc' }] },
      },
    });
    if (!target) throw new NotFoundException('Usuario no encontrado.');

    const year = new Date().getFullYear();
    const cpeThisYear = target.cpeRecords
      .filter((r) => r.year === year)
      .reduce((s, r) => s + r.hours, 0);

    return {
      ...target,
      cpeSummary: {
        year,
        hours: Math.round(cpeThisYear * 10) / 10,
        minRequired: DEFAULT_MIN_CPE_HOURS_YEAR,
        compliant: cpeThisYear >= DEFAULT_MIN_CPE_HOURS_YEAR,
      },
    };
  }

  async addCertification(targetUserId: string, dto: CreateCertificationDto, user: AuthUser) {
    await this.assertAccess(targetUserId, user);
    return this.prisma.userCertification.create({
      data: {
        userId: targetUserId,
        type: dto.type,
        certNumber: dto.certNumber,
        issuedAt: new Date(dto.issuedAt),
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        verificationUrl: dto.verificationUrl,
      },
    });
  }

  async removeCertification(id: string, user: AuthUser) {
    const cert = await this.prisma.userCertification.findUnique({ where: { id }, select: { userId: true } });
    if (!cert) throw new NotFoundException('Certificación no encontrada.');
    await this.assertAccess(cert.userId, user);
    return this.prisma.userCertification.delete({ where: { id } });
  }

  async addCompetency(targetUserId: string, dto: CreateCompetencyDto, user: AuthUser) {
    await this.assertAccess(targetUserId, user);
    return this.prisma.userCompetency.create({
      data: {
        userId: targetUserId,
        area: dto.area,
        expertiseLevel: dto.expertiseLevel,
        yearsExperience: dto.yearsExperience ?? 0,
      },
    });
  }

  async updateCompetency(id: string, dto: UpdateCompetencyDto, user: AuthUser) {
    const comp = await this.prisma.userCompetency.findUnique({ where: { id }, select: { userId: true } });
    if (!comp) throw new NotFoundException('Competencia no encontrada.');
    await this.assertAccess(comp.userId, user);
    return this.prisma.userCompetency.update({ where: { id }, data: dto });
  }

  async removeCompetency(id: string, user: AuthUser) {
    const comp = await this.prisma.userCompetency.findUnique({ where: { id }, select: { userId: true } });
    if (!comp) throw new NotFoundException('Competencia no encontrada.');
    await this.assertAccess(comp.userId, user);
    return this.prisma.userCompetency.delete({ where: { id } });
  }

  async addCpeRecord(targetUserId: string, dto: CreateCpeRecordDto, user: AuthUser) {
    await this.assertAccess(targetUserId, user);
    return this.prisma.cpeRecord.create({
      data: {
        userId: targetUserId,
        year: dto.year,
        category: dto.category,
        hours: dto.hours,
        description: dto.description,
        completedAt: new Date(dto.completedAt),
      },
    });
  }

  async removeCpeRecord(id: string, user: AuthUser) {
    const rec = await this.prisma.cpeRecord.findUnique({ where: { id }, select: { userId: true } });
    if (!rec) throw new NotFoundException('Registro CPE no encontrado.');
    await this.assertAccess(rec.userId, user);
    return this.prisma.cpeRecord.delete({ where: { id } });
  }
}
