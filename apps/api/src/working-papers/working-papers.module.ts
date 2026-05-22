import { Module } from '@nestjs/common';
import { WorkingPapersController } from './working-papers.controller';
import { WorkingPapersService } from './working-papers.service';
import { PaperGraphService } from './paper-graph.service';
import { PaperSectionsService } from './paper-sections.service';

@Module({
  controllers: [WorkingPapersController],
  providers: [
    WorkingPapersService,
    PaperGraphService,
    PaperSectionsService,
  ],
  exports: [
    WorkingPapersService,
    PaperGraphService,
    PaperSectionsService,
  ],
})
export class WorkingPapersModule {}
