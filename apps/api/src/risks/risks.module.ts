import { Module } from '@nestjs/common';
import { RisksController } from './risks.controller';
import { RisksService } from './risks.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [RisksController],
  providers: [RisksService],
  exports: [RisksService],
})
export class RisksModule {}
