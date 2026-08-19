import { Module } from '@nestjs/common';
import { AdminTasksController } from './admin-tasks.controller';
import { AdminTasksService } from './admin-tasks.service';

@Module({
  controllers: [AdminTasksController],
  providers: [AdminTasksService],
  exports: [AdminTasksService],
})
export class AdminTasksModule {}
