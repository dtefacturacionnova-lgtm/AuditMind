import { Module } from '@nestjs/common';
import { AuditTemplatesController } from './audit-templates.controller';
import { AuditTemplatesService } from './audit-templates.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditFoldersModule } from '../audit-folders/audit-folders.module';

@Module({
  imports: [PrismaModule, AuditFoldersModule],
  controllers: [AuditTemplatesController],
  providers: [AuditTemplatesService],
  exports: [AuditTemplatesService],
})
export class AuditTemplatesModule {}
