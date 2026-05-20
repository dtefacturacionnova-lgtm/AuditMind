import { Module } from '@nestjs/common';
import { WorkingPapersController } from './working-papers.controller';
import { WorkingPapersService } from './working-papers.service';

@Module({
  controllers: [WorkingPapersController],
  providers: [WorkingPapersService],
  exports: [WorkingPapersService],
})
export class WorkingPapersModule {}
