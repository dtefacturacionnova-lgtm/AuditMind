import { Module } from '@nestjs/common';
import { AuditsModule } from '../audits/audits.module';
import { AuditFoldersModule } from '../audit-folders/audit-folders.module';
import { AiModule } from '../ai/ai.module';
import { SignaturesModule } from '../signatures/signatures.module';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';
import { AcceptanceController } from './acceptance.controller';
import { AcceptanceService } from './acceptance.service';
import { ProposalsController } from './proposals.controller';
import { ProposalsService } from './proposals.service';
import { EngagementLettersController } from './engagement-letters.controller';
import { EngagementLetterSignatureAdapter } from './engagement-letter-signature.adapter';
import { EngagementLettersService } from './engagement-letters.service';
import { EngagementsController } from './engagements.controller';
import { EngagementsService } from './engagements.service';
import { EngagementProgramService } from './engagement-program.service';
import { ProfitabilityController } from './profitability.controller';
import { ProfitabilityService } from './profitability.service';

/**
 * Cartera — pipeline comercial de Auditoría Externa:
 * Prospecto → Radar de Aceptación (NIA 220 / ISQM 1) → Propuesta →
 * Carta de Compromiso (NIA 210) → Cliente Activo → Encargo → Auditoría real.
 *
 * Importa `AuditsModule` y `AuditFoldersModule` para reutilizar el scaffold del
 * expediente (`AuditIndexService` + `AuditFoldersService`) al aprobar un encargo,
 * en lugar de duplicar la creación de papeles/carpetas. No hay ciclo: ninguno de
 * esos módulos depende de PortfolioModule.
 *
 * Importa `SignaturesModule` para la firma electrónica por enlace de la carta de compromiso: el adaptador de la carta se
 * registra solo en `SignatureAdapterRegistry` (docs/firma-externa-por-enlace.md §11.1). SignaturesModule no depende de Portfolio.
 */
@Module({
  imports: [AuditsModule, AuditFoldersModule, AiModule, SignaturesModule],
  controllers: [
    ClientsController,
    AcceptanceController,
    ProposalsController,
    EngagementLettersController,
    EngagementsController,
    ProfitabilityController,
  ],
  providers: [
    ClientsService,
    AcceptanceService,
    ProposalsService,
    EngagementLettersService,
    EngagementLetterSignatureAdapter,
    EngagementsService,
    EngagementProgramService,
    ProfitabilityService,
  ],
  exports: [ClientsService, EngagementsService, ProfitabilityService],
})
export class PortfolioModule {}
