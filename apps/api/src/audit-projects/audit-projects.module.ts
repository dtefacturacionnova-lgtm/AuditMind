import { Module } from '@nestjs/common';
import { AuditProjectsService } from './audit-projects.service';
import { AuditProjectsController } from './audit-projects.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AuditProjectsController],
  providers: [AuditProjectsService],
})
export class AuditProjectsModule {}
