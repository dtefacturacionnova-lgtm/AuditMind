import { Module } from '@nestjs/common';
import { AuditsModule } from '../audits/audits.module';
import { AuditFoldersModule } from '../audit-folders/audit-folders.module';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';
import { AcceptanceController } from './acceptance.controller';
import { AcceptanceService } from './acceptance.service';
import { ProposalsController } from './proposals.controller';
import { ProposalsService } from './proposals.service';
import { EngagementLettersController } from './engagement-letters.controller';
import { EngagementLettersService } from './engagement-letters.service';
import { EngagementsController } from './engagements.controller';
import { EngagementsService } from './engagements.service';

/**
 * Cartera — pipeline comercial de Auditoría Externa:
 * Prospecto → Radar de Aceptación (NIA 220 / ISQM 1) → Propuesta →
 * Carta de Compromiso (NIA 210) → Cliente Activo → Encargo → Auditoría real.
 *
 * Importa `AuditsModule` y `AuditFoldersModule` para reutilizar el scaffold del
 * expediente (`AuditIndexService` + `AuditFoldersService`) al aprobar un encargo,
 * en lugar de duplicar la creación de papeles/carpetas. No hay ciclo: ninguno de
 * esos módulos depende de PortfolioModule.
 */
@Module({
  imports: [AuditsModule, AuditFoldersModule],
  controllers: [
    ClientsController,
    AcceptanceController,
    ProposalsController,
    EngagementLettersController,
    EngagementsController,
  ],
  providers: [
    ClientsService,
    AcceptanceService,
    ProposalsService,
    EngagementLettersService,
    EngagementsService,
  ],
  exports: [ClientsService, EngagementsService],
})
export class PortfolioModule {}
