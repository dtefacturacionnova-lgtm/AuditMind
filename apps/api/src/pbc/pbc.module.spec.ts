import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { PublicThrottlerGuard } from '../signatures/public-throttle';
import { PbcController } from './pbc.controller';
import { PbcModule } from './pbc.module';
import { PbcPortalController } from './pbc-portal.controller';
import { PbcService } from './pbc.service';

// En la aplicación real estos dos vienen de módulos @Global (PrismaModule y EmailModule), igual que ConfigModule y ThrottlerModule.
@Global()
@Module({
  providers: [{ provide: PrismaService, useValue: {} }, { provide: EmailService, useValue: {} }],
  exports: [PrismaService, EmailService],
})
class FakeGlobalsModule {}

describe('PbcModule (inyección de dependencias)', () => {
  it('se arma con la misma configuración global de AppModule: un proveedor faltante tumbaría el arranque de la API', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
        FakeGlobalsModule,
        PbcModule,
      ],
    }).compile();

    expect(moduleRef.get(PbcService)).toBeInstanceOf(PbcService);
    expect(moduleRef.get(PublicThrottlerGuard)).toBeInstanceOf(PublicThrottlerGuard);
    expect(moduleRef.get(PbcController)).toBeInstanceOf(PbcController);
    expect(moduleRef.get(PbcPortalController)).toBeInstanceOf(PbcPortalController);
    await moduleRef.close();
  });
});
