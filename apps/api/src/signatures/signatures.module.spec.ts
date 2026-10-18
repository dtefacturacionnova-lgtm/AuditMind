import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service';
import { ClamAvService } from './clamav.service';
import { OrganizationSealService } from './organization-seal.service';
import { PublicThrottlerGuard } from './public-throttle';
import { SignaturesModule } from './signatures.module';

@Global()
@Module({ providers: [{ provide: PrismaService, useValue: {} }], exports: [PrismaService] })
class FakePrismaModule {}

describe('SignaturesModule (inyección de dependencias)', () => {
  it('se arma con la misma configuración global de AppModule y expone sus servicios', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
        FakePrismaModule,
        SignaturesModule,
      ],
    }).compile();

    expect(moduleRef.get(ClamAvService)).toBeInstanceOf(ClamAvService);
    expect(moduleRef.get(OrganizationSealService)).toBeInstanceOf(OrganizationSealService);
    expect(moduleRef.get(PublicThrottlerGuard)).toBeInstanceOf(PublicThrottlerGuard);
    await moduleRef.close();
  });
});
