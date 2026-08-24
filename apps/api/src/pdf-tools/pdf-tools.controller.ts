import {
  Controller,
  Post,
  Body,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PdfToolsService } from './pdf-tools.service';

@ApiTags('PDF Tools')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('pdf-tools')
export class PdfToolsController {
  constructor(private readonly pdfToolsService: PdfToolsService) {}

  // ─── OCR real de un PDF escaneado (Stirling-PDF, self-hosted) ────────────────
  @Post('ocr')
  @ApiOperation({ summary: 'OCR real de un PDF escaneado — devuelve el mismo PDF con capa de texto buscable' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async ocrPdf(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { languages?: string },
    @Res() res: Response,
  ) {
    if (!file) throw new Error('No se subió ningún archivo');
    const ocredPdf = await this.pdfToolsService.ocrPdf(file.buffer, file.originalname, body?.languages || 'spa');
    const filename = file.originalname.replace(/\.pdf$/i, '') + '_ocr.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', ocredPdf.length);
    res.send(ocredPdf);
  }
}
