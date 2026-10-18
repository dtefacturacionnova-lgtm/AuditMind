import { Module } from '@nestjs/common';
import { PdfToolsModule } from '../pdf-tools/pdf-tools.module';
import { ClamAvService } from './clamav.service';
import { OrganizationSealService } from './organization-seal.service';
import { PublicThrottlerGuard } from './public-throttle';
import { SignatureAdapterRegistry } from './signature-documents';
import { SignatureAttachmentsService } from './signature-attachments.service';
import { SignatureEventsService } from './signature-events.service';
import { SignaturePolicyService } from './signature-policy.service';
import { SignaturePublicController } from './signature-public.controller';
import { SignaturePublicService } from './signature-public.service';
import { SignatureRequestsController } from './signature-requests.controller';
import { SignatureRequestsService } from './signature-requests.service';
import { SignatureScheduler } from './signature-scheduler';
import { SignatureSealingService } from './signature-sealing.service';
import { SignatureStorageService } from './signature-storage.service';

/**
 * Firma electrónica simple por enlace externo (docs/firma-externa-por-enlace.md).
 *
 * Los módulos de cada documento (carta, confirmación, acta; fases F2–F4) importan este módulo y registran su
 * adaptador en `SignatureAdapterRegistry` desde `onModuleInit`; así no hay dependencias circulares.
 * PrismaService, ConfigService, EmailService y PdfService son globales.
 */
@Module({
  imports: [PdfToolsModule],
  controllers: [SignaturePublicController, SignatureRequestsController],
  providers: [
    ClamAvService, OrganizationSealService, PublicThrottlerGuard,
    SignatureAdapterRegistry, SignatureStorageService, SignatureEventsService, SignaturePolicyService,
    SignatureAttachmentsService, SignatureSealingService, SignatureRequestsService, SignaturePublicService, SignatureScheduler,
  ],
  exports: [SignatureAdapterRegistry, SignatureRequestsService, OrganizationSealService, ClamAvService, PublicThrottlerGuard],
})
export class SignaturesModule {}
