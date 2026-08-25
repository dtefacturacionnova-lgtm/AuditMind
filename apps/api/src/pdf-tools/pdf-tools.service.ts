import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// ─── Stirling-PDF — herramientas de PDF self-hosted (OCR, firma digital, y a
// futuro fusionar/marca de agua/redacción) ──────────────────────────────────
// Servicio Docker separado, aislado a 127.0.0.1 (ver infrastructure/stirling-
// pdf/). No trae header tipo x-internal-key propio (no es un servicio interno
// de AuditMind como ai-service) — el aislamiento de red es la única barrera,
// ver el plan de OCR (2026-08-24) para el razonamiento completo.
@Injectable()
export class PdfToolsService {
  private readonly logger = new Logger(PdfToolsService.name);
  private readonly stirlingPdfUrl: string;

  constructor(private config: ConfigService) {
    this.stirlingPdfUrl = this.config.get<string>('STIRLING_PDF_URL', 'http://127.0.0.1:8090');
  }

  private async callStirlingRaw(path: string, formData: FormData): Promise<{ buffer: Buffer; contentType: string }> {
    let res: Response;
    try {
      res = await fetch(`${this.stirlingPdfUrl}${path}`, { method: 'POST', body: formData });
    } catch (err) {
      this.logger.error(`No se pudo contactar Stirling-PDF en ${this.stirlingPdfUrl}: ${err}`);
      throw new HttpException('Servicio de herramientas PDF no disponible', HttpStatus.BAD_GATEWAY);
    }
    if (!res.ok) {
      const errText = await res.text();
      throw new HttpException(`Error de Stirling-PDF (${path}): ${errText}`, HttpStatus.BAD_GATEWAY);
    }
    return {
      buffer: Buffer.from(await res.arrayBuffer()),
      contentType: res.headers.get('content-type') ?? 'application/octet-stream',
    };
  }

  private async callStirling(path: string, formData: FormData): Promise<Buffer> {
    return (await this.callStirlingRaw(path, formData)).buffer;
  }

  // ─── OCR real (self-hosted, sin límite de cuota) ─────────────────────────────
  // ocrType: 'skip-text' (por defecto) — Stirling decide página por página,
  // solo OCRea las que no tienen capa de texto, no toca las que ya la tienen.
  // 'force-ocr' rasteriza todo (usado por la ingesta del RAG, que ya confirmó
  // 0 texto extraíble antes de llamar acá).
  async ocrPdf(
    fileBuffer: Buffer,
    filename: string,
    languages = 'spa',
    ocrType: 'skip-text' | 'force-ocr' | 'Normal' = 'skip-text',
  ): Promise<Buffer> {
    const formData = new FormData();
    formData.append('fileInput', new Blob([new Uint8Array(fileBuffer)], { type: 'application/pdf' }), filename);
    formData.append('languages', languages);
    formData.append('ocrType', ocrType);
    return this.callStirling('/api/v1/misc/ocr-pdf', formData);
  }

  // ─── Firma digital real con certificado (PEM) ────────────────────────────────
  // Verificado en vivo (2026-08-24): funciona sin licencia paga — vive bajo
  // /api/v1/security/, distinto del árbol /api/v1/proprietary/ que sí requiere
  // suscripción. Requiere clave privada en formato PKCS#1 tradicional
  // ("-----BEGIN RSA PRIVATE KEY-----"), no PKCS#8 — Stirling no soporta este
  // último para certType=PEM (probado, lanza ClassCastException).
  //
  // NO decide de dónde sale el certificado (custodia de clave privada es una
  // decisión de seguridad aparte, pendiente de definir con el usuario antes de
  // conectar esto al flujo real de sign-off) — el llamador provee los bytes.
  async signPdf(
    fileBuffer: Buffer,
    filename: string,
    cert: { privateKeyPem: Buffer; certPem: Buffer; password?: string },
    opts: { name: string; reason?: string; location?: string; pageNumber?: number; showSignature?: boolean; showLogo?: boolean },
  ): Promise<Buffer> {
    const formData = new FormData();
    formData.append('fileInput', new Blob([new Uint8Array(fileBuffer)], { type: 'application/pdf' }), filename);
    formData.append('certType', 'PEM');
    formData.append('privateKeyFile', new Blob([new Uint8Array(cert.privateKeyPem)]), 'key.pem');
    formData.append('certFile', new Blob([new Uint8Array(cert.certPem)]), 'cert.pem');
    formData.append('password', cert.password ?? '');
    formData.append('showSignature', String(opts.showSignature ?? true));
    formData.append('showLogo', String(opts.showLogo ?? false));
    formData.append('pageNumber', String(opts.pageNumber ?? 1));
    formData.append('name', opts.name);
    formData.append('reason', opts.reason ?? 'Aprobación de papel de trabajo');
    formData.append('location', opts.location ?? 'AuditMind');
    return this.callStirling('/api/v1/security/cert-sign', formData);
  }

  // ─── Fusionar varios PDFs en uno solo ─────────────────────────────────────────
  async mergePdfs(
    files: { buffer: Buffer; filename: string }[],
    opts: { sortType?: 'orderProvided' | 'byFileName' | 'byDateModified' | 'byDateCreated' | 'byPDFTitle'; generateToc?: boolean } = {},
  ): Promise<Buffer> {
    if (files.length < 2) {
      throw new HttpException('Se necesitan al menos 2 archivos para fusionar', HttpStatus.BAD_REQUEST);
    }
    const formData = new FormData();
    for (const f of files) {
      formData.append('fileInput', new Blob([new Uint8Array(f.buffer)], { type: 'application/pdf' }), f.filename);
    }
    formData.append('sortType', opts.sortType ?? 'orderProvided');
    formData.append('removeCertSign', 'false'); // conservar firmas digitales existentes de cada PDF de origen
    formData.append('generateToc', String(opts.generateToc ?? false));
    return this.callStirling('/api/v1/general/merge-pdfs', formData);
  }

  // ─── Marca de agua (branding/confidencialidad) ────────────────────────────────
  async addWatermark(
    fileBuffer: Buffer,
    filename: string,
    opts: { text: string; fontSize?: number; rotation?: number; opacity?: number; color?: string },
  ): Promise<Buffer> {
    const formData = new FormData();
    formData.append('fileInput', new Blob([new Uint8Array(fileBuffer)], { type: 'application/pdf' }), filename);
    formData.append('watermarkType', 'text');
    formData.append('watermarkText', opts.text);
    formData.append('alphabet', 'roman');
    formData.append('fontSize', String(opts.fontSize ?? 30));
    formData.append('rotation', String(opts.rotation ?? 45));
    formData.append('opacity', String(opts.opacity ?? 0.3));
    formData.append('widthSpacer', '50');
    formData.append('heightSpacer', '50');
    formData.append('customColor', opts.color ?? '#d3d3d3');
    formData.append('convertPDFToImage', 'false'); // mantener el PDF con texto seleccionable/buscable
    return this.callStirling('/api/v1/security/add-watermark', formData);
  }

  // ─── Redacción automática por texto (antes de compartir externamente) ────────
  // Redacción real (elimina el contenido, no solo lo tapa visualmente) cuando
  // convertPDFToImage=true — con false, cubre con un rectángulo de color pero
  // el texto original podría seguir siendo recuperable del PDF subyacente.
  async autoRedact(
    fileBuffer: Buffer,
    filename: string,
    opts: { textToRedact: string[]; useRegex?: boolean; wholeWordSearch?: boolean; color?: string; convertToImage?: boolean },
  ): Promise<Buffer> {
    const formData = new FormData();
    formData.append('fileInput', new Blob([new Uint8Array(fileBuffer)], { type: 'application/pdf' }), filename);
    formData.append('listOfText', opts.textToRedact.join('\n'));
    formData.append('useRegex', String(opts.useRegex ?? false));
    formData.append('wholeWordSearch', String(opts.wholeWordSearch ?? false));
    formData.append('redactColor', opts.color ?? '#000000');
    formData.append('customPadding', '2');
    formData.append('convertPDFToImage', String(opts.convertToImage ?? true));
    return this.callStirling('/api/v1/security/auto-redact', formData);
  }

  // ─── Conversión a PDF/A (archivo de largo plazo, ISO 19005) ──────────────────
  // Fuentes embebidas, sin dependencias externas — el formato pensado para
  // conservación a largo plazo. Relevante para WorkingPaper.retentionUntil
  // (campo ya existente, "F6.4 Retención y bloqueo", sin lógica real detrás
  // todavía) — este es el paso técnico que ese campo está pidiendo.
  async convertToPdfA(
    fileBuffer: Buffer,
    filename: string,
    opts: { outputFormat?: 'pdfa' | 'pdfa-1' | 'pdfa-2' | 'pdfa-2b' | 'pdfa-3' | 'pdfa-3b' | 'pdfx'; strict?: boolean } = {},
  ): Promise<Buffer> {
    const formData = new FormData();
    formData.append('fileInput', new Blob([new Uint8Array(fileBuffer)], { type: 'application/pdf' }), filename);
    formData.append('outputFormat', opts.outputFormat ?? 'pdfa-2b');
    formData.append('strict', String(opts.strict ?? false));
    return this.callStirling('/api/v1/convert/pdf/pdfa', formData);
  }

  // ─── Timestamp RFC 3161 (sello de tiempo de una autoridad confiable) ─────────
  // Complementa cert-sign: certifica criptográficamente CUÁNDO existió el
  // documento, no solo quién lo firmó — mucho más difícil de falsificar que
  // un campo de fecha en la base de datos. TSA por defecto: DigiCert (gratis,
  // preset ya soportado por Stirling, no requiere cuenta).
  async timestampPdf(fileBuffer: Buffer, filename: string, tsaUrl?: string): Promise<Buffer> {
    const formData = new FormData();
    formData.append('fileInput', new Blob([new Uint8Array(fileBuffer)], { type: 'application/pdf' }), filename);
    formData.append('tsaUrl', tsaUrl ?? 'http://timestamp.digicert.com');
    return this.callStirling('/api/v1/security/timestamp-pdf', formData);
  }

  // ─── Dividir un PDF en varios documentos ─────────────────────────────────────
  // La respuesta puede ser un PDF (si el resultado es un solo documento) o un
  // ZIP (si son varios). Verificado empíricamente (2026-08-25): Stirling SIEMPRE
  // devuelve el ZIP con `Content-Type: application/octet-stream` — nunca incluye
  // "zip" en el header — así que no se puede confiar en el content-type que manda
  // Stirling para distinguir los dos casos. Se detecta por los bytes mágicos del
  // propio buffer en su lugar (PK.. = ZIP) y se corrige el content-type devuelto.
  async splitPdf(fileBuffer: Buffer, filename: string, pageNumbers: string): Promise<{ buffer: Buffer; contentType: string }> {
    const formData = new FormData();
    formData.append('fileInput', new Blob([new Uint8Array(fileBuffer)], { type: 'application/pdf' }), filename);
    formData.append('pageNumbers', pageNumbers);
    const { buffer } = await this.callStirlingRaw('/api/v1/general/split-pages', formData);
    const isZip = buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b; // 'PK'
    return { buffer, contentType: isZip ? 'application/zip' : 'application/pdf' };
  }

  // ─── Sanitizar (quitar JavaScript/contenido activo) ──────────────────────────
  // Defensa contra PDFs maliciosos subidos por terceros (evidencia de campo,
  // adjuntos de clientes) — quita JS embebido y archivos adjuntos ocultos por
  // defecto; metadata/links/fuentes se conservan salvo que se pida lo contrario.
  async sanitizePdf(
    fileBuffer: Buffer,
    filename: string,
    opts: {
      removeJavaScript?: boolean; removeEmbeddedFiles?: boolean;
      removeXMPMetadata?: boolean; removeMetadata?: boolean;
      removeLinks?: boolean; removeFonts?: boolean;
    } = {},
  ): Promise<Buffer> {
    const formData = new FormData();
    formData.append('fileInput', new Blob([new Uint8Array(fileBuffer)], { type: 'application/pdf' }), filename);
    formData.append('removeJavaScript', String(opts.removeJavaScript ?? true));
    formData.append('removeEmbeddedFiles', String(opts.removeEmbeddedFiles ?? true));
    formData.append('removeXMPMetadata', String(opts.removeXMPMetadata ?? false));
    formData.append('removeMetadata', String(opts.removeMetadata ?? false));
    formData.append('removeLinks', String(opts.removeLinks ?? false));
    formData.append('removeFonts', String(opts.removeFonts ?? false));
    return this.callStirling('/api/v1/security/sanitize-pdf', formData);
  }

  // ─── Compactar (optimizar tamaño) ─────────────────────────────────────────────
  // expectedOutputSize es un campo requerido por Stirling pero NO se usa como
  // meta estricta acá — su default real (25KB) destruiría la calidad de
  // cualquier documento real. Se manda generoso; optimizeLevel (1-9) es el
  // control real de cuánto comprimir.
  async compressPdf(
    fileBuffer: Buffer,
    filename: string,
    opts: { optimizeLevel?: number } = {},
  ): Promise<Buffer> {
    const formData = new FormData();
    formData.append('fileInput', new Blob([new Uint8Array(fileBuffer)], { type: 'application/pdf' }), filename);
    formData.append('optimizeLevel', String(opts.optimizeLevel ?? 4));
    formData.append('expectedOutputSize', '50MB');
    formData.append('linearize', 'true');
    formData.append('normalize', 'false');
    formData.append('grayscale', 'false');
    return this.callStirling('/api/v1/misc/compress-pdf', formData);
  }
}
