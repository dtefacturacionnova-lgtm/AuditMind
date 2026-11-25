import { Module } from '@nestjs/common';
import { AuditProceduresController } from './audit-procedures.controller';
import { AuditProceduresService } from './audit-procedures.service';
import { AiModule } from '../ai/ai.module';

@Module({
  imports:     [AiModule], // normativa (RAG) para sugerir procedimientos con el contexto del papel
  controllers: [AuditProceduresController],
  providers:   [AuditProceduresService],
  exports:     [AuditProceduresService],
})
export class AuditProceduresModule {}
