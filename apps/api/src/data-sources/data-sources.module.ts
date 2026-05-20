import { Module } from '@nestjs/common';
import { DataSourcesService } from './data-sources.service';
import { DataSourcesController } from './data-sources.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [DataSourcesController],
  providers: [DataSourcesService],
  exports: [DataSourcesService],
})
export class DataSourcesModule {}
