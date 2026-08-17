import { Module } from '@nestjs/common';
import { FieldEvidenceController } from './field-evidence.controller';
import { FieldEvidenceService } from './field-evidence.service';
import { AiModule } from '../../ai/ai.module';

@Module({
  imports: [AiModule],
  controllers: [FieldEvidenceController],
  providers: [FieldEvidenceService],
  exports: [FieldEvidenceService],
})
export class FieldEvidenceModule {}
