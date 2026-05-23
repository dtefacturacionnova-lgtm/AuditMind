import { Module } from '@nestjs/common';
import { AuditsController } from './audits.controller';
import { AuditsService } from './audits.service';
import { AuditIndexService } from './audit-index.service';

@Module({
  controllers: [AuditsController],
  providers: [AuditsService, AuditIndexService],
  exports: [AuditsService],
})
export class AuditsModule {}
