import { Module } from '@nestjs/common';
import { InvestigationReportController } from './investigation-report.controller';
import { InvestigationReportService } from './investigation-report.service';
import { CaatsAutoRunController } from './caats-auto-run.controller';
import { CaatsAutoRunService } from './caats-auto-run.service';
import { CaatsHistoryService } from './caats-history.service';
import { AuditInvestigationAccessService } from './audit-investigation-access.service';
import { AiModule } from '../ai/ai.module';
import { FieldEvidenceModule } from '../working-papers/field-evidence/field-evidence.module';
import { InvestigationGraphModule } from '../investigation-graph/investigation-graph.module';

// PrismaModule es @Global() — no hace falta importarlo aquí (mismo criterio
// que InvestigationGraphModule para su propio servicio interno).
@Module({
  imports: [AiModule, FieldEvidenceModule, InvestigationGraphModule],
  controllers: [InvestigationReportController, CaatsAutoRunController],
  providers: [
    InvestigationReportService, CaatsAutoRunService, CaatsHistoryService, AuditInvestigationAccessService,
  ],
})
export class InvestigationReportModule {}
