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
import { FileInterceptor, FileFieldsInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';
import { PdfToolsService } from './pdf-tools.service';
import { SigningIdentityService } from './signing-identity.service';

@ApiTags('PDF Tools')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('pdf-tools')
export class PdfToolsController {
  constructor(
    private readonly pdfToolsService: PdfToolsService,
    private readonly signingIdentityService: SigningIdentityService,
  ) {}

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

  // ─── Firma digital real con certificado propio (genérico) ────────────────────
  // El llamador aporta su propio certificado (PEM: clave privada PKCS#1 +
  // certificado) — para cuando se quiera firmar con un certificado externo
  // (ej. de un Prestador de Servicios de Certificación acreditado, a futuro).
  // Para el uso normal dentro de AuditMind ver POST sign-internal, que usa el
  // certificado autofirmado propio del usuario logueado.
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

  // ─── Firma digital con el certificado interno del usuario logueado ───────────
  // Custodia de certificados (2026-08-24): AuditMind emite y guarda (cifrado)
  // un certificado autofirmado por usuario, generado automáticamente en el
  // primer uso — sello de integridad interno, NO firma con validez legal
  // externa (ver memoria de sesión "project_pdf_tools_stirling" para el
  // camino a futuro vía la Unidad de Firma Electrónica / Ministerio de
  // Economía). Este es el endpoint que debe usar el resto de AuditMind.
  @Post('sign-internal')
  @ApiOperation({ summary: 'Firmar un PDF con el certificado interno del usuario logueado (se genera automáticamente si no existe)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async signPdfInternal(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { reason?: string; location?: string; pageNumber?: string },
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    if (!file) throw new Error('No se subió ningún archivo');
    const identity = await this.signingIdentityService.getOrCreateIdentity(user.id);
    const signedPdf = await this.pdfToolsService.signPdf(
      file.buffer,
      file.originalname,
      { privateKeyPem: Buffer.from(identity.privateKeyPem), certPem: Buffer.from(identity.certPem), password: '' },
      {
        name: user.name,
        reason: body?.reason || 'Aprobación en AuditMind',
        location: body?.location || 'AuditMind',
        pageNumber: body?.pageNumber ? parseInt(body.pageNumber, 10) : undefined,
        showSignature: true,
        showLogo: false,
      },
    );
    const filename = file.originalname.replace(/\.pdf$/i, '') + '_firmado.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', signedPdf.length);
    res.send(signedPdf);
  }

  // ─── Fusionar varios PDFs en uno solo ─────────────────────────────────────────
  @Post('merge')
  @ApiOperation({ summary: 'Fusionar varios PDFs (ej. adjuntos de evidencia de campo) en un solo archivo' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('files', 20))
  async mergePdfs(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: { sortType?: 'orderProvided' | 'byFileName' | 'byDateModified' | 'byDateCreated' | 'byPDFTitle'; generateToc?: string },
    @Res() res: Response,
  ) {
    if (!files?.length) throw new Error('No se subió ningún archivo');
    const mergedPdf = await this.pdfToolsService.mergePdfs(
      files.map(f => ({ buffer: f.buffer, filename: f.originalname })),
      { sortType: body?.sortType, generateToc: body?.generateToc === 'true' },
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="auditmind_fusionado.pdf"');
    res.setHeader('Content-Length', mergedPdf.length);
    res.send(mergedPdf);
  }

  // ─── Marca de agua (branding/confidencialidad en exportaciones) ──────────────
  @Post('watermark')
  @ApiOperation({ summary: 'Agregar marca de agua de texto a un PDF (branding/confidencialidad)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async addWatermark(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { text: string; fontSize?: string; rotation?: string; opacity?: string; color?: string },
    @Res() res: Response,
  ) {
    if (!file) throw new Error('No se subió ningún archivo');
    if (!body?.text) throw new Error('Se requiere el texto de la marca de agua');
    const watermarked = await this.pdfToolsService.addWatermark(file.buffer, file.originalname, {
      text: body.text,
      fontSize: body?.fontSize ? parseFloat(body.fontSize) : undefined,
      rotation: body?.rotation ? parseFloat(body.rotation) : undefined,
      opacity: body?.opacity ? parseFloat(body.opacity) : undefined,
      color: body?.color,
    });
    const filename = file.originalname.replace(/\.pdf$/i, '') + '_marcado.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', watermarked.length);
    res.send(watermarked);
  }

  // ─── Redacción automática por texto (antes de compartir externamente) ────────
  @Post('redact')
  @ApiOperation({ summary: 'Redactar (censurar) texto específico de un PDF antes de compartirlo externamente' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async redactPdf(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { textToRedact: string; useRegex?: string; wholeWordSearch?: string; color?: string; convertToImage?: string },
    @Res() res: Response,
  ) {
    if (!file) throw new Error('No se subió ningún archivo');
    if (!body?.textToRedact) throw new Error('Se requiere el texto a redactar (separado por saltos de línea)');
    const redacted = await this.pdfToolsService.autoRedact(file.buffer, file.originalname, {
      textToRedact: body.textToRedact.split('\n').map(t => t.trim()).filter(Boolean),
      useRegex: body?.useRegex === 'true',
      wholeWordSearch: body?.wholeWordSearch === 'true',
      color: body?.color,
      convertToImage: body?.convertToImage !== 'false',
    });
    const filename = file.originalname.replace(/\.pdf$/i, '') + '_redactado.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', redacted.length);
    res.send(redacted);
  }
}
