import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';

// Fase 2c: extraído de InvestigationReportService (código movido tal cual, sin
// cambios de lógica) — la ronda de CAATs (auto-run, historial) necesita el
// mismo chequeo de acceso, y no tiene sentido triplicarlo en 3 servicios
// nuevos. InvestigationReportService pasa a inyectar esto y delegar.
@Injectable()
export class AuditInvestigationAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async assertAccess(auditId: string, user: AuthUser) {
    const audit = await this.prisma.audit.findFirst({
      where:   { id: auditId, organizationId: user.organizationId },
      include: { team: { select: { userId: true } } },
    });
    if (!audit) throw new NotFoundException('Auditoría no encontrada');
    if (audit.isInvestigationMode) {
      const onTeam     = audit.team.some(m => m.userId === user.id);
      const privileged  = (['CAE', 'ADMIN', 'SUPER_ADMIN'] as string[]).includes(user.role);
      if (!onTeam && !privileged) throw new ForbiddenException('Acceso restringido — modo investigación');
    }
    return audit;
  }
}
