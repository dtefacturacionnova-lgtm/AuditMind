import { Module } from '@nestjs/common';
import { InvestigationReportModule } from '../../investigation-report/investigation-report.module';
import { SignaturesModule } from '../../signatures/signatures.module';
import { InterviewSignatureAdapter } from './interview-signature.adapter';

/**
 * Firma electrónica del acta de entrevista (docs/firma-externa-por-enlace.md §11.3). Módulo aparte, sin importar
 * WorkingPapersModule: el adaptador solo necesita la BD (global), el registro de la firma y el criterio de equipo del modo
 * investigación, y así no se crea un ciclo con InvestigationReportModule → FieldEvidenceModule → papeles.
 */
@Module({
  imports: [SignaturesModule, InvestigationReportModule],
  providers: [InterviewSignatureAdapter],
})
export class InterviewSignatureModule {}
