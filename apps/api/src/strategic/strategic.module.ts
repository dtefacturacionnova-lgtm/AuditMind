import { Module } from '@nestjs/common';
import { StrategicController } from './strategic.controller';
import { StrategicService } from './strategic.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [StrategicController],
  providers: [StrategicService],
})
export class StrategicModule {}
