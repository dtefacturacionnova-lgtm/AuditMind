import { Module } from '@nestjs/common';
import { PdfToolsController } from './pdf-tools.controller';
import { PdfToolsService } from './pdf-tools.service';
import { SigningIdentityService } from './signing-identity.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PdfToolsController],
  providers: [PdfToolsService, SigningIdentityService],
  exports: [PdfToolsService, SigningIdentityService],
})
export class PdfToolsModule {}
