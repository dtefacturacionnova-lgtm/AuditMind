import { Injectable, Logger, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SignatureAttachment, SignatureRequest } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PdfToolsService } from '../pdf-tools/pdf-tools.service';
import { ClamAvService } from './clamav.service';
import { SignatureEventsService, TX_OPTIONS } from './signature-events.service';
import { requestFolder, SignatureStorageService } from './signature-storage.service';
import { sha256Hex } from './signature-crypto.util';
import { ClientInfo } from './request-info.util';

/** Límites de §12. Un solo objeto para que las pruebas puedan reducirlos sin crear archivos de 10 MB. */
export const ATTACHMENT_LIMITS = {
  maxFiles: 5,
  maxBytes: 10 * 1024 * 1024,
  maxTotalBytes: 30 * 1024 * 1024,
};
export const MAX_ATTACHMENTS = ATTACHMENT_LIMITS.maxFiles;
export const MAX_ATTACHMENT_BYTES = ATTACHMENT_LIMITS.maxBytes; // lo usa también Multer (límite duro de la petición)
export const MAX_ATTACHMENTS_TOTAL_BYTES = ATTACHMENT_LIMITS.maxTotalBytes;

export type DetectedType = 'pdf' | 'jpeg' | 'png';

/** Tipo REAL del archivo por sus primeros bytes. La extensión y el Content-Type que manda el cliente se ignoran. */
export function detectFileType(buf: Buffer): DetectedType | null {
  if (buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  return null;
}

const EXT: Record<DetectedType, string> = { pdf: 'pdf', jpeg: 'jpg', png: 'png' };
const MIME: Record<DetectedType, string> = { pdf: 'application/pdf', jpeg: 'image/jpeg', png: 'image/png' };

/** Nombre mostrable: sin rutas, sin caracteres de control ni de separador, máx. 200. Se escapa al renderizar. */
export function sanitizeFilename(name: string): string {
  const base = (name || 'archivo').normalize('NFC').split(/[\\/]/).pop() || 'archivo';
  // eslint-disable-next-line no-control-regex
  return base.replace(/[\u0000-\u001f\u007f:*?"<>|]/g, '_').trim().slice(0, 200) || 'archivo';
}

@Injectable()
export class SignatureAttachmentsService {
  private readonly logger = new Logger(SignatureAttachmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: SignatureStorageService,
    private readonly events: SignatureEventsService,
    private readonly clam: ClamAvService,
    private readonly pdfTools: PdfToolsService,
  ) {}

  list(requestId: string): Promise<SignatureAttachment[]> {
    return this.prisma.signatureAttachment.findMany({ where: { requestId }, orderBy: { createdAt: 'asc' } });
  }

  /** Cadena de defensa completa. Cualquier fallo descarta el archivo: sin escaneo no se acepta nada. */
  async accept(
    req: SignatureRequest,
    file: { originalname: string; buffer: Buffer },
    info: ClientInfo,
  ): Promise<SignatureAttachment> {
    const size = file.buffer.length;
    if (size === 0) throw new UnprocessableEntityException('El archivo está vacío.');
    if (size > ATTACHMENT_LIMITS.maxBytes) throw new UnprocessableEntityException('El archivo supera el límite de 10 MB.');

    const existing = await this.list(req.id);
    if (existing.length >= ATTACHMENT_LIMITS.maxFiles) throw new UnprocessableEntityException(`Máximo ${ATTACHMENT_LIMITS.maxFiles} archivos por solicitud.`);
    if (existing.reduce((s, a) => s + a.sizeBytes, 0) + size > ATTACHMENT_LIMITS.maxTotalBytes) {
      throw new UnprocessableEntityException('Los archivos superan el límite total de 30 MB.');
    }

    const type = detectFileType(file.buffer);
    if (!type) throw new UnprocessableEntityException('Tipo de archivo no permitido. Sube PDF, JPG o PNG.');

    const id = randomUUID();
    const folder = `${requestFolder(req.id, req.organizationId, req.auditId)}/attachments`;
    const quarantinePath = `${folder}/quarantine/${id}.${EXT[type]}`;
    const safePath = `${folder}/${id}.pdf`;
    const originalSha256 = sha256Hex(file.buffer);
    const name = sanitizeFilename(file.originalname);

    const reject = async (detail: Record<string, unknown>, remove: string[]) => {
      await this.storage.remove(remove);
      await this.events.appendStandalone(req.id, { type: 'ATTACHMENT_REJECTED', ip: info.ip, userAgent: info.userAgent, detail: { name, ...detail } });
    };

    // 1. Cuarentena: el original queda intacto y NUNCA se sirve al firmante.
    await this.storage.upload(quarantinePath, file.buffer, MIME[type], false);

    // 2. Antivirus. Falla cerrado.
    const scan = await this.clam.scan(file.buffer);
    if (scan.status === 'INFECTED') {
      await reject({ reason: 'infected', signature: scan.signature }, [quarantinePath]);
      throw new UnprocessableEntityException('El archivo fue rechazado por el antivirus.');
    }
    if (scan.status === 'ERROR') {
      await reject({ reason: 'scan_error' }, [quarantinePath]);
      throw new ServiceUnavailableException('No se pudo verificar el archivo. Inténtalo más tarde.');
    }

    // 3. Reconstrucción (CDR): PDF nuevo y limpio; una imagen se convierte primero a PDF.
    let safe: Buffer;
    try {
      const asPdf = type === 'pdf' ? file.buffer : await this.pdfTools.imageToPdf(file.buffer, `${id}.${EXT[type]}`, MIME[type] as 'image/png' | 'image/jpeg');
      safe = await this.pdfTools.sanitizePdf(asPdf, `${id}.pdf`, {
        removeJavaScript: true, removeEmbeddedFiles: true, removeXMPMetadata: true, removeMetadata: true, removeLinks: true, removeFonts: false,
      });
      if (detectFileType(safe) !== 'pdf') throw new Error('el resultado no es un PDF');
    } catch (err) {
      this.logger.warn(`Reconstrucción de adjunto falló (${req.id}): ${(err as Error).message?.slice(0, 120)}`);
      await reject({ reason: 'cdr_failed' }, [quarantinePath]);
      throw new UnprocessableEntityException('No se pudo procesar el archivo. Verifica que no esté dañado.');
    }
    await this.storage.upload(safePath, safe, 'application/pdf', false);

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.signatureAttachment.create({
        data: {
          id, requestId: req.id, originalName: name, detectedType: type, sizeBytes: size, originalSha256,
          quarantinePath, safePath, safeSha256: sha256Hex(safe), scanStatus: 'CLEAN', submitted: false,
        },
      });
      await this.events.append(tx, req.id, { type: 'ATTACHMENT_ACCEPTED', ip: info.ip, userAgent: info.userAgent, detail: { name, sha256: originalSha256, safeSha256: row.safeSha256 } });
      return row;
    }, TX_OPTIONS);
  }

  /** Quita un adjunto (solo antes de firmar). */
  async remove(req: SignatureRequest, attachmentId: string): Promise<boolean> {
    const att = await this.prisma.signatureAttachment.findFirst({ where: { id: attachmentId, requestId: req.id, submitted: false } });
    if (!att) return false;
    await this.prisma.signatureAttachment.delete({ where: { id: att.id } });
    await this.storage.remove([att.quarantinePath, att.safePath ?? '']);
    return true;
  }

  /** Borra los adjuntos que nunca se enviaron (solicitud cerrada, vencida o limpieza diaria). */
  async purgeUnsubmitted(requestId: string): Promise<number> {
    const rows = await this.prisma.signatureAttachment.findMany({ where: { requestId, submitted: false } });
    if (rows.length === 0) return 0;
    await this.prisma.signatureAttachment.deleteMany({ where: { requestId, submitted: false } });
    await this.storage.remove(rows.flatMap((a) => [a.quarantinePath, a.safePath ?? '']));
    return rows.length;
  }

  /** Dentro de la transacción de firma: los adjuntos limpios pasan a formar parte de la firma. */
  async markSubmitted(tx: Pick<PrismaService, 'signatureAttachment'>, requestId: string): Promise<number> {
    const r = await tx.signatureAttachment.updateMany({ where: { requestId, scanStatus: 'CLEAN', submitted: false }, data: { submitted: true } });
    return r.count;
  }
}
