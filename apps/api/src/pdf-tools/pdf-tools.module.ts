import { Module } from '@nestjs/common';
import { PdfToolsController } from './pdf-tools.controller';
import { PdfToolsService } from './pdf-tools.service';

@Module({
  controllers: [PdfToolsController],
  providers: [PdfToolsService],
  exports: [PdfToolsService],
})
export class PdfToolsModule {}
