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

  private async callStirling(path: string, formData: FormData): Promise<Buffer> {
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
    return Buffer.from(await res.arrayBuffer());
  }

  // ─── OCR real (self-hosted, sin límite de cuota) ─────────────────────────────
  async ocrPdf(fileBuffer: Buffer, filename: string, languages = 'spa'): Promise<Buffer> {
    const formData = new FormData();
    formData.append('fileInput', new Blob([new Uint8Array(fileBuffer)], { type: 'application/pdf' }), filename);
    formData.append('languages', languages);
    formData.append('ocrType', 'force-ocr');
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
}
