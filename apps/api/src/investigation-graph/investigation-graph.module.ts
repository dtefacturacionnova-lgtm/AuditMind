import { Module } from '@nestjs/common';
import { InvestigationGraphController } from './investigation-graph.controller';
import { InvestigationGraphService } from './investigation-graph.service';

// PrismaModule es @Global() — no hace falta importarlo aquí (mismo criterio
// que AiModule/PdfToolsModule para sus propios servicios internos).
@Module({
  controllers: [InvestigationGraphController],
  providers: [InvestigationGraphService],
  exports: [InvestigationGraphService], // FieldEvidenceModule lo importa para el paso de escritura
})
export class InvestigationGraphModule {}
