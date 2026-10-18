import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service';
import { PdfService } from '../pdf/pdf.service';
import { EmailService } from '../email/email.service';
import { ClamAvService } from './clamav.service';
import { OrganizationSealService } from './organization-seal.service';
import { PublicThrottlerGuard } from './public-throttle';
import { SignaturesModule } from './signatures.module';
import { SignatureAdapterRegistry } from './signature-documents';
import { SignaturePublicController } from './signature-public.controller';
import { SignaturePublicService } from './signature-public.service';
import { SignatureRequestsController } from './signature-requests.controller';
import { SignatureRequestsService } from './signature-requests.service';
import { SignatureScheduler } from './signature-scheduler';

// En la aplicación real estos tres vienen de módulos @Global (PrismaModule, PdfModule, EmailModule).
@Global()
@Module({
  providers: [{ provide: PrismaService, useValue: {} }, { provide: PdfService, useValue: {} }, { provide: EmailService, useValue: {} }],
  exports: [PrismaService, PdfService, EmailService],
})
class FakeGlobalsModule {}

describe('SignaturesModule (inyección de dependencias)', () => {
  it('se arma con la misma configuración global de AppModule y expone sus servicios', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
        FakeGlobalsModule,
        SignaturesModule,
      ],
    }).compile();

    expect(moduleRef.get(ClamAvService)).toBeInstanceOf(ClamAvService);
    expect(moduleRef.get(OrganizationSealService)).toBeInstanceOf(OrganizationSealService);
    expect(moduleRef.get(PublicThrottlerGuard)).toBeInstanceOf(PublicThrottlerGuard);
    expect(moduleRef.get(SignatureAdapterRegistry)).toBeInstanceOf(SignatureAdapterRegistry);
    expect(moduleRef.get(SignatureRequestsService)).toBeInstanceOf(SignatureRequestsService);
    expect(moduleRef.get(SignaturePublicService)).toBeInstanceOf(SignaturePublicService);
    expect(moduleRef.get(SignatureScheduler)).toBeInstanceOf(SignatureScheduler);
    expect(moduleRef.get(SignaturePublicController)).toBeInstanceOf(SignaturePublicController);
    expect(moduleRef.get(SignatureRequestsController)).toBeInstanceOf(SignatureRequestsController);
    await moduleRef.close();
  });
});
