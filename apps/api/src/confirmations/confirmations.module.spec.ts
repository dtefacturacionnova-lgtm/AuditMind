import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { EmailService } from '../email/email.service';
import { AuditInvestigationAccessService } from '../investigation-report/audit-investigation-access.service';
import { InvestigationReportModule } from '../investigation-report/investigation-report.module';
import { PdfService } from '../pdf/pdf.service';
import { PrismaService } from '../prisma/prisma.service';
import { SignatureAdapterRegistry } from '../signatures/signature-documents';
import { ConfirmationAuthorizationService } from './confirmation-authorization.service';
import { ConfirmationSignatureAdapter } from './confirmation-signature.adapter';
import { ConfirmationsController } from './confirmations.controller';
import { ConfirmationsModule } from './confirmations.module';
import { ConfirmationsService } from './confirmations.service';

// En la aplicación real estos tres vienen de módulos @Global (PrismaModule, PdfModule, EmailModule).
@Global()
@Module({
  providers: [{ provide: PrismaService, useValue: {} }, { provide: PdfService, useValue: {} }, { provide: EmailService, useValue: {} }],
  exports: [PrismaService, PdfService, EmailService],
})
class FakeGlobalsModule {}

// InvestigationReportModule arrastra IA, evidencia de campo y grafos: aquí solo importa que EXPORTE el servicio de acceso.
@Module({ providers: [{ provide: AuditInvestigationAccessService, useValue: { assertAccess: async () => undefined } }], exports: [AuditInvestigationAccessService] })
class FakeInvestigationModule {}

describe('ConfirmationsModule (inyección de dependencias)', () => {
  it('se arma con la configuración global de AppModule y registra su adaptador de firma: un proveedor faltante tumbaría el arranque', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
        FakeGlobalsModule,
        ConfirmationsModule,
      ],
    }).overrideModule(InvestigationReportModule).useModule(FakeInvestigationModule).compile();

    await moduleRef.init(); // dispara onModuleInit: el adaptador se registra solo
    expect(moduleRef.get(ConfirmationsService)).toBeInstanceOf(ConfirmationsService);
    expect(moduleRef.get(ConfirmationAuthorizationService)).toBeInstanceOf(ConfirmationAuthorizationService);
    expect(moduleRef.get(ConfirmationSignatureAdapter)).toBeInstanceOf(ConfirmationSignatureAdapter);
    expect(moduleRef.get(ConfirmationsController)).toBeInstanceOf(ConfirmationsController);
    const registry = moduleRef.get(SignatureAdapterRegistry, { strict: false });
    expect(registry.find('EXTERNAL_CONFIRMATION')).toBe(moduleRef.get(ConfirmationSignatureAdapter));
    await moduleRef.close();
  });

  it('InvestigationReportModule exporta el servicio de acceso por equipo (lo necesita la firma de confirmaciones)', () => {
    expect(Reflect.getMetadata('exports', InvestigationReportModule)).toContain(AuditInvestigationAccessService);
  });
});
