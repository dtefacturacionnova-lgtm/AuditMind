import { Module } from '@nestjs/common';
import { ContentLibraryController } from './content-library.controller';
import { ContentLibraryService } from './content-library.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ContentLibraryController],
  providers: [ContentLibraryService],
  exports: [ContentLibraryService],
})
export class ContentLibraryModule {}
