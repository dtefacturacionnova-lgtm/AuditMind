import { Module } from '@nestjs/common';
import { ClamAvService } from './clamav.service';
import { OrganizationSealService } from './organization-seal.service';
import { PublicThrottlerGuard } from './public-throttle';

/**
 * Firma electrónica simple por enlace externo (docs/firma-externa-por-enlace.md).
 * F1a: infraestructura y bases (antivirus, sello de organización, límite de intentos,
 * utilidades de token/código/bitácora, textos legales, plantillas de correo).
 * F1b agrega el servicio de solicitudes y los controladores público e interno.
 *
 * PrismaService, ConfigService y EmailService son globales.
 */
@Module({
  providers: [ClamAvService, OrganizationSealService, PublicThrottlerGuard],
  exports: [ClamAvService, OrganizationSealService, PublicThrottlerGuard],
})
export class SignaturesModule {}
