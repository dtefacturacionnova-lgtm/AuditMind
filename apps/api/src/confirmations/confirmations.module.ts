import { Module } from '@nestjs/common';
import { InvestigationReportModule } from '../investigation-report/investigation-report.module';
import { SignaturesModule } from '../signatures/signatures.module';
import { ConfirmationAuthorizationService } from './confirmation-authorization.service';
import { ConfirmationSignatureAdapter } from './confirmation-signature.adapter';
import { ConfirmationsController } from './confirmations.controller';
import { ConfirmationsService } from './confirmations.service';

/**
 * Importa `SignaturesModule` para la firma electrónica por enlace de las confirmaciones: el adaptador se registra solo en
 * `SignatureAdapterRegistry` (docs/firma-externa-por-enlace.md §11.2). SignaturesModule no depende de este módulo.
 */
@Module({
  imports: [SignaturesModule, InvestigationReportModule],
  controllers: [ConfirmationsController],
  providers: [ConfirmationsService, ConfirmationSignatureAdapter, ConfirmationAuthorizationService],
  exports: [ConfirmationsService],
})
export class ConfirmationsModule {}
