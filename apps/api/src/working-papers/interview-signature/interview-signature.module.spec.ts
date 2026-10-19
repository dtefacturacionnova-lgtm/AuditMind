import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { EmailService } from '../../email/email.service';
import { AuditInvestigationAccessService } from '../../investigation-report/audit-investigation-access.service';
import { InvestigationReportModule } from '../../investigation-report/investigation-report.module';
import { PdfService } from '../../pdf/pdf.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SignatureAdapterRegistry } from '../../signatures/signature-documents';
import { InterviewSignatureAdapter } from './interview-signature.adapter';
import { InterviewSignatureModule } from './interview-signature.module';

// En la aplicación real estos tres vienen de módulos @Global (PrismaModule, PdfModule, EmailModule).
@Global()
@Module({
  providers: [{ provide: PrismaService, useValue: {} }, { provide: PdfService, useValue: {} }, { provide: EmailService, useValue: {} }],
  exports: [PrismaService, PdfService, EmailService],
})
class FakeGlobalsModule {}

@Module({ providers: [{ provide: AuditInvestigationAccessService, useValue: { assertAccess: async () => undefined } }], exports: [AuditInvestigationAccessService] })
class FakeInvestigationModule {}

describe('InterviewSignatureModule (inyección de dependencias)', () => {
  it('se arma con la configuración global de AppModule y registra su adaptador: un proveedor faltante tumbaría el arranque', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
        FakeGlobalsModule,
        InterviewSignatureModule,
      ],
    }).overrideModule(InvestigationReportModule).useModule(FakeInvestigationModule).compile();

    await moduleRef.init(); // dispara onModuleInit: el adaptador se registra solo
    const adapter = moduleRef.get(InterviewSignatureAdapter);
    expect(adapter).toBeInstanceOf(InterviewSignatureAdapter);
    expect(moduleRef.get(SignatureAdapterRegistry, { strict: false }).find('INTERVIEW_RECORD')).toBe(adapter);
    await moduleRef.close();
  });
});
