import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AuditsController } from './audits.controller';
import { AuditsService } from './audits.service';
import { AuditIndexService } from './audit-index.service';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    AiModule,
    MulterModule.register({ storage: memoryStorage() }),
  ],
  controllers: [AuditsController],
  providers: [AuditsService, AuditIndexService],
  exports: [AuditsService],
})
export class AuditsModule {}
