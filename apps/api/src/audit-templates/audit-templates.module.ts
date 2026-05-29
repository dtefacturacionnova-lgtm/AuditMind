import { Module } from '@nestjs/common';
import { AuditTemplatesController } from './audit-templates.controller';
import { AuditTemplatesService } from './audit-templates.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AuditTemplatesController],
  providers: [AuditTemplatesService],
  exports: [AuditTemplatesService],
})
export class AuditTemplatesModule {}
