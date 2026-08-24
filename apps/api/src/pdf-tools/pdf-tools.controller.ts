import {
  Controller,
  Post,
  Body,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
} from '@nestjs/common';
import { FileInterceptor, FileFieldsInterceptor } from '@nestjs/platform-express';
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

  // ─── Firma digital real con certificado (Stirling-PDF cert-sign) ─────────────
  // Herramienta genérica — el llamador aporta su propio certificado (PEM: clave
  // privada PKCS#1 + certificado). NO asume de dónde sale el certificado ni
  // cómo se custodia — esa es una decisión de seguridad aparte, pendiente,
  // antes de conectar esto al flujo automático de sign-off de papeles de
  // trabajo. Ver nota en pdf-tools.service.ts.
  @Post('sign')
  @ApiOperation({ summary: 'Firmar un PDF con un certificado digital (PEM) — herramienta genérica' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileFieldsInterceptor([
    { name: 'file', maxCount: 1 },
    { name: 'privateKeyFile', maxCount: 1 },
    { name: 'certFile', maxCount: 1 },
  ]))
  async signPdf(
    @UploadedFiles() files: { file?: Express.Multer.File[]; privateKeyFile?: Express.Multer.File[]; certFile?: Express.Multer.File[] },
    @Body() body: { password?: string; name: string; reason?: string; location?: string; pageNumber?: string; showSignature?: string; showLogo?: string },
    @Res() res: Response,
  ) {
    const file = files?.file?.[0];
    const privateKeyFile = files?.privateKeyFile?.[0];
    const certFile = files?.certFile?.[0];
    if (!file || !privateKeyFile || !certFile) {
      throw new Error('Se requieren file, privateKeyFile y certFile');
    }
    const signedPdf = await this.pdfToolsService.signPdf(
      file.buffer,
      file.originalname,
      { privateKeyPem: privateKeyFile.buffer, certPem: certFile.buffer, password: body?.password },
      {
        name: body.name,
        reason: body?.reason,
        location: body?.location,
        pageNumber: body?.pageNumber ? parseInt(body.pageNumber, 10) : undefined,
        showSignature: body?.showSignature !== 'false',
        showLogo: body?.showLogo === 'true',
      },
    );
    const filename = file.originalname.replace(/\.pdf$/i, '') + '_firmado.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', signedPdf.length);
    res.send(signedPdf);
  }
}
