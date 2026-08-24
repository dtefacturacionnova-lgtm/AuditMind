import { Module } from '@nestjs/common';
import { WorkingPapersController } from './working-papers.controller';
import { WorkingPapersService } from './working-papers.service';
import { PaperGraphService } from './paper-graph.service';
import { PaperSectionsService } from './paper-sections.service';
import { PaperConsolidationService } from './paper-consolidation.service';
import { PaperQualityService } from './paper-quality.service';
import { PaperLiveService } from './paper-live.service';
import { CrossAuditLearningService } from './cross-audit-learning.service';
import { PaperReferencesService } from './paper-references.service';
import { PaperVersionsService } from './paper-versions.service';
import { RiskTraceService } from './risk-trace.service';
import { ExcelTemplateEngineService } from './excel-templates/excel-template-engine.service';
import { AiModule } from '../ai/ai.module';
import { ContentLibraryModule } from '../content-library/content-library.module';
import { PdfToolsModule } from '../pdf-tools/pdf-tools.module';

@Module({
  imports: [AiModule, ContentLibraryModule, PdfToolsModule],
  controllers: [WorkingPapersController],
  providers: [
    WorkingPapersService,
    PaperGraphService,
    PaperSectionsService,
    PaperConsolidationService,     // Sprint 2: AI consolidation engine
    PaperQualityService,           // Sprint 3: Semantic quality gate
    PaperLiveService,              // Sprint 3: LIVE paper dashboard
    CrossAuditLearningService,     // Sprint 3: Cross-audit learning
    PaperReferencesService,        // Gap 3: @mention references
    PaperVersionsService,          // PI.5: Version history + diff + restore
    RiskTraceService,              // Fase 6a Control Interno: Ficha de Riesgo (trace read-only)
    ExcelTemplateEngineService,    // EXC-02: motor genérico de plantillas Excel
  ],
  exports: [
    WorkingPapersService,
    PaperGraphService,
    PaperSectionsService,
    PaperConsolidationService,
    PaperQualityService,
    PaperLiveService,
    CrossAuditLearningService,
    PaperReferencesService,
    PaperVersionsService,
    ExcelTemplateEngineService,
  ],
})
export class WorkingPapersModule {}
