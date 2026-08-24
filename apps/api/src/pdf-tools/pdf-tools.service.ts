import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// ─── Stirling-PDF — herramientas de PDF self-hosted (OCR, y a futuro fusionar/
// marca de agua/firma/redacción) ────────────────────────────────────────────
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

  // ─── OCR real (self-hosted, sin límite de cuota) ─────────────────────────────
  async ocrPdf(fileBuffer: Buffer, filename: string, languages = 'spa'): Promise<Buffer> {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(fileBuffer)], { type: 'application/pdf' });
    formData.append('fileInput', blob, filename);
    formData.append('languages', languages);
    formData.append('ocrType', 'force-ocr');

    let res: Response;
    try {
      res = await fetch(`${this.stirlingPdfUrl}/api/v1/misc/ocr-pdf`, {
        method: 'POST',
        body: formData,
      });
    } catch (err) {
      this.logger.error(`No se pudo contactar Stirling-PDF en ${this.stirlingPdfUrl}: ${err}`);
      throw new HttpException('Servicio de OCR no disponible', HttpStatus.BAD_GATEWAY);
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new HttpException(`Error de OCR (Stirling-PDF): ${errText}`, HttpStatus.BAD_GATEWAY);
    }

    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
