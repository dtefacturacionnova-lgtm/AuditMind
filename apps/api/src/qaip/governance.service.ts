import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import { UpsertIndependenceDeclarationDto, CreateAuditCharterDto } from './dto/governance.dto';

@Injectable()
export class GovernanceService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Declaración de Independencia (NIGC 1 componente 3 / ética IIA) ────────
  // Una por (organización, año) — el CAE/socio la firma cada año, análoga a la
  // cadencia anual del Radar de Aceptación.

  async listIndependenceDeclarations(user: AuthUser) {
    return this.prisma.independenceDeclaration.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { year: 'desc' },
    });
  }

  async upsertIndependenceDeclaration(dto: UpsertIndependenceDeclarationDto, user: AuthUser) {
    const year = dto.year ?? new Date().getFullYear();
    return this.prisma.independenceDeclaration.upsert({
      where: { organizationId_year: { organizationId: user.organizationId, year } },
      create: {
        organizationId: user.organizationId,
        caeId: user.id,
        year,
        declarationText: dto.declarationText,
        documentUrl: dto.documentUrl,
        signedAt: new Date(),
      },
      update: {
        caeId: user.id,
        declarationText: dto.declarationText,
        documentUrl: dto.documentUrl,
        signedAt: new Date(),
      },
    });
  }

  // ─── Estatuto de Auditoría (Audit Charter) ─────────────────────────────────
  // Versionado: cada nueva aprobación crea una fila nueva (version = max+1),
  // nunca se sobrescribe una versión histórica ya aprobada.

  async listCharters(user: AuthUser) {
    return this.prisma.auditCharter.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { version: 'desc' },
    });
  }

  async createCharter(dto: CreateAuditCharterDto, user: AuthUser) {
    const last = await this.prisma.auditCharter.findFirst({
      where: { organizationId: user.organizationId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    return this.prisma.auditCharter.create({
      data: {
        organizationId: user.organizationId,
        version: (last?.version ?? 0) + 1,
        content: dto.content as unknown as Prisma.InputJsonValue,
        approvedBy: dto.approvedBy,
        approvedAt: new Date(dto.approvedAt),
        effectiveDate: new Date(dto.effectiveDate),
      },
    });
  }
}
