import { Module } from '@nestjs/common';
import { PublicThrottlerGuard } from '../signatures/public-throttle';
import { PbcController } from './pbc.controller';
import { PbcPortalController } from './pbc-portal.controller';
import { PbcService } from './pbc.service';
import { PbcPortalService } from './pbc-portal.service';

// ConfigService, PrismaService y EmailService son globales; ThrottlerModule también (app.module.ts).
@Module({
  controllers: [PbcController, PbcPortalController],
  providers: [PbcService, PbcPortalService, PublicThrottlerGuard],
  exports: [PbcService],
})
export class PbcModule {}
