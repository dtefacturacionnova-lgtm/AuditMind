import { Module } from '@nestjs/common';
import { AuditUniverseController } from './audit-universe.controller';
import { AuditUniverseService } from './audit-universe.service';

@Module({
  controllers: [AuditUniverseController],
  providers: [AuditUniverseService],
  exports: [AuditUniverseService],
})
export class AuditUniverseModule {}
