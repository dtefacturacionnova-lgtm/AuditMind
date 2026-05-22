import { Module } from '@nestjs/common';
import { WorkingPapersController } from './working-papers.controller';
import { WorkingPapersService } from './working-papers.service';
import { PaperGraphService } from './paper-graph.service';
import { PaperSectionsService } from './paper-sections.service';
import { PaperConsolidationService } from './paper-consolidation.service';

@Module({
  controllers: [WorkingPapersController],
  providers: [
    WorkingPapersService,
    PaperGraphService,
    PaperSectionsService,
    PaperConsolidationService,   // ← Sprint 2: AI consolidation engine
  ],
  exports: [
    WorkingPapersService,
    PaperGraphService,
    PaperSectionsService,
    PaperConsolidationService,
  ],
})
export class WorkingPapersModule {}
