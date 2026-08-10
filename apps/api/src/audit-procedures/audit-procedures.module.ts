import { Module } from '@nestjs/common';
import { AuditProceduresController } from './audit-procedures.controller';
import { AuditProceduresService } from './audit-procedures.service';

@Module({
  controllers: [AuditProceduresController],
  providers:   [AuditProceduresService],
  exports:     [AuditProceduresService],
})
export class AuditProceduresModule {}
