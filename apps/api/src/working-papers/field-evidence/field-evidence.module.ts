import { Module } from '@nestjs/common';
import { FieldEvidenceController } from './field-evidence.controller';
import { FieldEvidenceService } from './field-evidence.service';
import { AiModule } from '../../ai/ai.module';
import { WorkingPapersModule } from '../working-papers.module';

@Module({
  // WorkingPapersModule para reutilizar PaperReferencesService (EVD-09 accept
  // crea PaperReference vía createReference() ya existente — cero mecanismo
  // nuevo de acceso a datos, mismo principio de EVD-07).
  imports: [AiModule, WorkingPapersModule],
  controllers: [FieldEvidenceController],
  providers: [FieldEvidenceService],
  exports: [FieldEvidenceService],
})
export class FieldEvidenceModule {}
