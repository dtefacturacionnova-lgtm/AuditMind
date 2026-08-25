import {
  Controller,
  Post,
  Body,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor, FileFieldsInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';
import { PdfToolsService } from './pdf-tools.service';
import { SigningIdentityService } from './signing-identity.service';

const PDF_TOOLS_MAX_SIZE = 40 * 1024 * 1024; // 40MB — operaciones de un solo archivo
const PDF_TOOLS_MERGE_MAX_SIZE = 20 * 1024 * 1024; // 20MB por archivo — fusionar (hasta 20 archivos en memoria)

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
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: PDF_TOOLS_MAX_SIZE } }))
  async ocrPdf(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { languages?: string },
    @Res() res: Response,
  ) {
    if (!file) throw new BadRequestException('No se subió ningún archivo');
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
  ], { limits: { fileSize: PDF_TOOLS_MAX_SIZE } }))
  async signPdf(
    @UploadedFiles() files: { file?: Express.Multer.File[]; privateKeyFile?: Express.Multer.File[]; certFile?: Express.Multer.File[] },
    @Body() body: { password?: string; name: string; reason?: string; location?: string; pageNumber?: string; showSignature?: string; showLogo?: string },
    @Res() res: Response,
  ) {
    const file = files?.file?.[0];
    const privateKeyFile = files?.privateKeyFile?.[0];
    const certFile = files?.certFile?.[0];
    if (!file || !privateKeyFile || !certFile) {
      throw new BadRequestException('Se requieren file, privateKeyFile y certFile');
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
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: PDF_TOOLS_MAX_SIZE } }))
  async signPdfInternal(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { reason?: string; location?: string; pageNumber?: string },
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    if (!file) throw new BadRequestException('No se subió ningún archivo');
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
  @UseInterceptors(FilesInterceptor('files', 20, { limits: { fileSize: PDF_TOOLS_MERGE_MAX_SIZE } }))
  async mergePdfs(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: { sortType?: 'orderProvided' | 'byFileName' | 'byDateModified' | 'byDateCreated' | 'byPDFTitle'; generateToc?: string },
    @Res() res: Response,
  ) {
    if (!files?.length) throw new BadRequestException('No se subió ningún archivo');
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
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: PDF_TOOLS_MAX_SIZE } }))
  async addWatermark(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { text: string; fontSize?: string; rotation?: string; opacity?: string; color?: string },
    @Res() res: Response,
  ) {
    if (!file) throw new BadRequestException('No se subió ningún archivo');
    if (!body?.text) throw new BadRequestException('Se requiere el texto de la marca de agua');
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
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: PDF_TOOLS_MAX_SIZE } }))
  async redactPdf(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { textToRedact: string; useRegex?: string; wholeWordSearch?: string; color?: string; convertToImage?: string },
    @Res() res: Response,
  ) {
    if (!file) throw new BadRequestException('No se subió ningún archivo');
    if (!body?.textToRedact) throw new BadRequestException('Se requiere el texto a redactar (separado por saltos de línea)');
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

  // ─── Conversión a PDF/A (archivo de largo plazo, ISO 19005) ──────────────────
  @Post('pdfa')
  @ApiOperation({ summary: 'Convertir un PDF a PDF/A para archivo/conservación de largo plazo' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: PDF_TOOLS_MAX_SIZE } }))
  async convertToPdfA(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { outputFormat?: 'pdfa' | 'pdfa-1' | 'pdfa-2' | 'pdfa-2b' | 'pdfa-3' | 'pdfa-3b' | 'pdfx'; strict?: string },
    @Res() res: Response,
  ) {
    if (!file) throw new BadRequestException('No se subió ningún archivo');
    const pdfa = await this.pdfToolsService.convertToPdfA(file.buffer, file.originalname, {
      outputFormat: body?.outputFormat,
      strict: body?.strict === 'true',
    });
    const filename = file.originalname.replace(/\.pdf$/i, '') + '_pdfa.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfa.length);
    res.send(pdfa);
  }

  // ─── Timestamp RFC 3161 (sello de tiempo de autoridad confiable) ─────────────
  @Post('timestamp')
  @ApiOperation({ summary: 'Agregar un sello de tiempo RFC 3161 (autoridad confiable) a un PDF' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: PDF_TOOLS_MAX_SIZE } }))
  async timestampPdf(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { tsaUrl?: string },
    @Res() res: Response,
  ) {
    if (!file) throw new BadRequestException('No se subió ningún archivo');
    const timestamped = await this.pdfToolsService.timestampPdf(file.buffer, file.originalname, body?.tsaUrl);
    const filename = file.originalname.replace(/\.pdf$/i, '') + '_timestamp.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', timestamped.length);
    res.send(timestamped);
  }

  // ─── Dividir un PDF en varios documentos ─────────────────────────────────────
  @Post('split')
  @ApiOperation({ summary: 'Dividir un PDF en varios documentos por número de página' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: PDF_TOOLS_MAX_SIZE } }))
  async splitPdf(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { pageNumbers?: string },
    @Res() res: Response,
  ) {
    if (!file) throw new BadRequestException('No se subió ningún archivo');
    const { buffer, contentType } = await this.pdfToolsService.splitPdf(file.buffer, file.originalname, body?.pageNumbers || 'all');
    const ext = contentType.includes('zip') ? 'zip' : 'pdf';
    const filename = file.originalname.replace(/\.pdf$/i, '') + `_dividido.${ext}`;
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  }

  // ─── Sanitizar (quitar JavaScript/contenido activo) ──────────────────────────
  @Post('sanitize')
  @ApiOperation({ summary: 'Quitar JavaScript/contenido activo de un PDF — defensa contra PDFs maliciosos subidos por terceros' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: PDF_TOOLS_MAX_SIZE } }))
  async sanitizePdf(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: {
      removeJavaScript?: string; removeEmbeddedFiles?: string;
      removeXMPMetadata?: string; removeMetadata?: string;
      removeLinks?: string; removeFonts?: string;
    },
    @Res() res: Response,
  ) {
    if (!file) throw new BadRequestException('No se subió ningún archivo');
    const sanitized = await this.pdfToolsService.sanitizePdf(file.buffer, file.originalname, {
      removeJavaScript: body?.removeJavaScript !== 'false',
      removeEmbeddedFiles: body?.removeEmbeddedFiles !== 'false',
      removeXMPMetadata: body?.removeXMPMetadata === 'true',
      removeMetadata: body?.removeMetadata === 'true',
      removeLinks: body?.removeLinks === 'true',
      removeFonts: body?.removeFonts === 'true',
    });
    const filename = file.originalname.replace(/\.pdf$/i, '') + '_sanitizado.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', sanitized.length);
    res.send(sanitized);
  }

  // ─── Compactar (optimizar tamaño) ─────────────────────────────────────────────
  @Post('compress')
  @ApiOperation({ summary: 'Reducir el tamaño de un PDF (útil para evidencia pesada)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: PDF_TOOLS_MAX_SIZE } }))
  async compressPdf(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { optimizeLevel?: string },
    @Res() res: Response,
  ) {
    if (!file) throw new BadRequestException('No se subió ningún archivo');
    const compressed = await this.pdfToolsService.compressPdf(file.buffer, file.originalname, {
      optimizeLevel: body?.optimizeLevel ? parseInt(body.optimizeLevel, 10) : undefined,
    });
    const filename = file.originalname.replace(/\.pdf$/i, '') + '_comprimido.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', compressed.length);
    res.send(compressed);
  }
}
