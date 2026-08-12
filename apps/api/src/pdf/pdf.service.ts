/**
 * PdfService — generación de PDF server-side con Puppeteer
 *
 * - Reutiliza una instancia de browser para evitar el overhead de cold start.
 * - Puppeteer es OPCIONAL: si no está instalado o falla el launch (ej. Railway
 *   sin Chromium), el servicio sigue vivo y el endpoint PDF responde 503 claro
 *   sin romper el resto del backend.
 * - Templates HTML se mantienen separados en pdf-templates.ts.
 */
import { Injectable, Logger, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Browser = any;

/** Puppeteer footer templates are raw HTML — escape caller-supplied text before interpolating. */
function escFooter(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface PdfOptions {
  /** "A4" por defecto */
  format?:        'A4' | 'Letter' | 'Legal';
  /** Margenes en mm */
  margin?:        { top: string; right: string; bottom: string; left: string };
  /** Imprimir cabeceras y pies (footer con número de página) */
  printPageNumbers?: boolean;
  /** Modo paisaje */
  landscape?:     boolean;
  /** Línea de contexto en el pie (ej. "PT-FIN-B00 — Auditoria Financiera FE&CE 2025") */
  footerNote?:    string;
}

@Injectable()
export class PdfService implements OnModuleDestroy {
  private readonly logger = new Logger(PdfService.name);
  private browser: Browser | null = null;
  private launchPromise: Promise<Browser> | null = null;

  /** Lazy singleton — el browser se lanza al primer uso. */
  private async getBrowser(): Promise<Browser> {
    if (this.browser && this.browser.connected) return this.browser;

    if (!this.launchPromise) {
      this.launchPromise = (async () => {
        try {
          // puppeteer-core NO trae Chromium — usamos el binario del sistema.
          // Railway: instalado vía Dockerfile (apt chromium) + PUPPETEER_EXECUTABLE_PATH.
          // Local: el dev puede setear PUPPETEER_EXECUTABLE_PATH a su Chrome.
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const puppeteer = require('puppeteer-core');

          // Resolver el ejecutable de Chromium
          const candidates = [
            process.env.PUPPETEER_EXECUTABLE_PATH,
            // Prefer real non-snap Chrome/Chromium (snap builds fail in PM2)
            '/usr/bin/google-chrome-stable',
            '/usr/bin/google-chrome',
            '/opt/google/chrome/google-chrome',
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
            // Windows (dev local)
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
          ].filter(Boolean) as string[];

          let executablePath = candidates[0];
          // En entornos no-Docker, intentar encontrar uno que exista
          try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const fs = require('fs');
            for (const c of candidates) {
              if (c && fs.existsSync(c)) { executablePath = c; break; }
            }
          } catch { /* ignore */ }

          return await puppeteer.launch({
            headless: true,
            executablePath,
            args: [
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-dev-shm-usage',
              '--disable-gpu',
            ],
          });
        } catch (err) {
          this.logger.error(`[PDF] Chromium no disponible. Causa: ${(err as Error).message}`);
          throw new ServiceUnavailableException(
            'El servicio de PDF no está disponible (Chromium no se pudo iniciar).',
          );
        }
      })();
    }

    this.browser = await this.launchPromise;
    this.launchPromise = null;
    return this.browser;
  }

  async onModuleDestroy() {
    if (this.browser) {
      await this.browser.close().catch(() => { /* ignore */ });
    }
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Genera un PDF a partir de HTML completo.
   * @param html  HTML completo (incluye <!DOCTYPE> + <html> + <body>)
   * @param opts  Opciones de página
   * @returns Buffer con el PDF
   */
  async generateFromHtml(html: string, opts: PdfOptions = {}): Promise<Buffer> {
    const start = Date.now();
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      await page.setContent(html, {
        waitUntil: 'load',
        timeout:   30_000,
      });

      const footerTemplate = opts.printPageNumbers
        ? `<div style="width: 100%; padding: 0 15mm; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;">
             <div style="border-top: 1px solid #E2E8F0; padding-top: 2mm; display: flex; justify-content: space-between; align-items: center; font-size: 8px; color: #94a3b8;">
               <span>AuditMind &middot; Plataforma de Auditoría Inteligente${opts.footerNote ? ` &middot; ${escFooter(opts.footerNote)}` : ''}</span>
               <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
             </div>
           </div>`
        : '<div></div>';

      const pdfBuffer = await page.pdf({
        format:           opts.format ?? 'A4',
        landscape:        opts.landscape ?? false,
        printBackground:  true,
        margin:           opts.margin ?? { top: '22mm', right: '15mm', bottom: '20mm', left: '15mm' },
        displayHeaderFooter: opts.printPageNumbers ?? true,
        headerTemplate:   '<div></div>',
        footerTemplate,
      });

      this.logger.log(`[PDF] Generated in ${Date.now() - start}ms (${pdfBuffer.length} bytes)`);
      return Buffer.from(pdfBuffer);
    } catch (err) {
      this.logger.error(`[PDF] Generation failed: ${(err as Error).message}`);
      throw err;
    } finally {
      await page.close().catch(() => { /* ignore */ });
    }
  }

  /**
   * Helper que envuelve el body con el layout base AuditMind.
   * Si pasas HTML completo, usa generateFromHtml directamente.
   */
  async generateBranded(opts: {
    title:    string;
    subtitle?: string;
    body:     string;
    options?: PdfOptions;
  }): Promise<Buffer> {
    const html = this.renderBrandedLayout(opts);
    return this.generateFromHtml(html, opts.options);
  }

  // ─── Layout HTML base ────────────────────────────────────────────────────

  renderBrandedLayout(opts: {
    title:    string;
    subtitle?: string;
    body:     string;
  }): string {
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>${opts.title}</title>
  <style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    body {
      margin: 0; padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      color: #1a202c; font-size: 11pt; line-height: 1.5;
      background: #ffffff;
    }
    .pdf-header {
      background: linear-gradient(135deg, #0F2D4A 0%, #1a4a7a 100%);
      color: #ffffff;
      padding: 18mm 15mm 12mm 15mm;
      page-break-after: avoid;
    }
    .pdf-header .brand {
      font-size: 10pt; font-weight: 700; letter-spacing: 1px;
      color: rgba(255,255,255,0.7); text-transform: uppercase;
    }
    .pdf-header .title {
      font-size: 22pt; font-weight: 700; margin-top: 6mm; line-height: 1.2;
      letter-spacing: -0.5px;
    }
    .pdf-header .subtitle {
      font-size: 11pt; margin-top: 3mm; color: rgba(255,255,255,0.85);
    }
    .pdf-body {
      padding: 8mm 15mm 12mm 15mm;
    }
    h1 { font-size: 16pt; margin: 12mm 0 4mm 0; color: #0F2D4A; page-break-after: avoid; }
    h2 { font-size: 13pt; margin: 10mm 0 3mm 0; color: #0F2D4A; page-break-after: avoid; border-bottom: 1px solid #E2E8F0; padding-bottom: 2mm; }
    h3 { font-size: 11pt; margin: 6mm 0 2mm 0; color: #2D3748; page-break-after: avoid; }
    p { margin: 0 0 3mm 0; }
    table { width: 100%; border-collapse: collapse; margin: 4mm 0; font-size: 9.5pt; page-break-inside: auto; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
    th, td { border: 1px solid #E2E8F0; padding: 2.5mm 3mm; text-align: left; vertical-align: top; }
    th { background-color: #F7FAFC; color: #4A5568; font-weight: 600; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.5px; }
    .badge {
      display: inline-block; padding: 1mm 2.5mm; border-radius: 3mm;
      font-size: 8.5pt; font-weight: 600; line-height: 1;
    }
    .badge-critical { background: #FED7D7; color: #C53030; }
    .badge-high     { background: #FEEBC8; color: #C05621; }
    .badge-medium   { background: #FEF3C7; color: #B45309; }
    .badge-low      { background: #C6F6D5; color: #276749; }
    .badge-info     { background: #BEE3F8; color: #2C5282; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; }
    .kv { font-size: 9.5pt; }
    .kv-label { font-weight: 600; color: #4A5568; }
    .meta-strip {
      background-color: #F7FAFC; border: 1px solid #E2E8F0; border-radius: 3mm;
      padding: 4mm 5mm; margin: 4mm 0; font-size: 10pt;
    }
    .meta-strip dt { font-weight: 600; color: #4A5568; }
    .meta-strip dd { margin: 0 0 2mm 0; }
    .text-muted { color: #718096; }
    .text-small { font-size: 9pt; }
    .pre-wrap { white-space: pre-wrap; }
    .page-break { page-break-after: always; }
    .no-break { page-break-inside: avoid; }
    .signature-block {
      margin-top: 16mm; padding-top: 6mm; border-top: 1px solid #CBD5E0;
      font-size: 10pt;
    }
    .signature-line { display: inline-block; width: 70mm; border-bottom: 1px solid #2D3748; margin-bottom: 1mm; }
    blockquote {
      border-left: 3px solid #0F2D4A;
      padding: 2mm 0 2mm 5mm;
      margin: 4mm 0;
      background-color: #F7FAFC;
      font-style: italic;
      color: #4A5568;
    }
  </style>
</head>
<body>
  <header class="pdf-header">
    <div class="brand">AuditMind · Plataforma de Auditoría Inteligente</div>
    <div class="title">${opts.title}</div>
    ${opts.subtitle ? `<div class="subtitle">${opts.subtitle}</div>` : ''}
  </header>
  <main class="pdf-body">
    ${opts.body}
  </main>
</body>
</html>`;
  }
}
