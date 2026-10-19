import {
  ConflictException, Injectable, Logger, ServiceUnavailableException, UnauthorizedException, UnprocessableEntityException,
} from '@nestjs/common';
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

/**
 * Tope de megapíxeles de una imagen antes de mandarla a Stirling (que la decodifica entera en memoria): un PNG o JPEG de
 * pocos MB puede declarar decenas de miles de píxeles por lado y pedir varios GB al abrirse (revisión de seguridad F5b,
 * 2026-10-19). 50 MP cubre la foto de cualquier teléfono o un escaneo A4 a 600 ppp.
 */
export const MAX_IMAGE_PIXELS = 50_000_000;

/** Ancho y alto declarados en la cabecera de un PNG o JPEG (sin decodificar la imagen), o null si no se pueden leer. */
export function imageDimensions(buf: Buffer, type: 'png' | 'jpeg'): { width: number; height: number } | null {
  if (type === 'png') {
    // Firma (8) + longitud (4) + "IHDR" (4) + ancho (4) + alto (4).
    if (buf.length < 24 || buf.subarray(12, 16).toString('latin1') !== 'IHDR') return null;
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  // JPEG: se recorren los segmentos hasta el primer SOFn (C0–CF salvo C4 DHT, C8 JPG y CC DAC).
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    if (marker === 0xff) { i++; continue; } // relleno
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; } // sin longitud
    const len = buf.readUInt16BE(i + 2);
    if (len < 2) return null;
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    if (marker === 0xda || marker === 0xd9) return null; // empezó la imagen sin cabecera de tamaño
    i += 2 + len;
  }
  return null;
}

/** Lanza 422 si una imagen no declara su tamaño o supera el tope de megapíxeles. Los PDF pasan. */
export function assertImageSize(buf: Buffer, type: DetectedType): void {
  if (type === 'pdf') return;
  const d = imageDimensions(buf, type);
  if (!d || d.width === 0 || d.height === 0) throw new UnprocessableEntityException('No se pudo leer la imagen. Verifica que no esté dañada.');
  if (d.width * d.height > MAX_IMAGE_PIXELS) {
    throw new UnprocessableEntityException('La imagen es demasiado grande (más de 50 megapíxeles). Redúcela o envíala como PDF.');
  }
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

  /**
   * La misma cadena (§12) para un archivo que NO pertenece a una solicitud todavía: la carta de autorización que sube el
   * auditor antes de enviar una confirmación. Devuelve el PDF reconstruido ya guardado en `${folder}/<id>.pdf`; el original
   * queda en `${folder}/quarantine/`. Mismos límites de tamaño y de tipo; falla cerrado.
   */
  async acceptStandalone(file: { originalname: string; buffer: Buffer }, folder: string): Promise<{
    id: string; name: string; sizeBytes: number; originalSha256: string; safePath: string; safeSha256: string;
  }> {
    const size = file.buffer.length;
    if (size === 0) throw new UnprocessableEntityException('El archivo está vacío.');
    if (size > ATTACHMENT_LIMITS.maxBytes) throw new UnprocessableEntityException('El archivo supera el límite de 10 MB.');
    const type = detectFileType(file.buffer);
    if (!type) throw new UnprocessableEntityException('Tipo de archivo no permitido. Sube PDF, JPG o PNG.');
    assertImageSize(file.buffer, type);

    const id = randomUUID();
    const quarantinePath = `${folder}/quarantine/${id}.${EXT[type]}`;
    const safePath = `${folder}/${id}.pdf`;
    const name = sanitizeFilename(file.originalname);
    const originalSha256 = sha256Hex(file.buffer);

    await this.storage.upload(quarantinePath, file.buffer, MIME[type], false);
    const scan = await this.clam.scan(file.buffer);
    if (scan.status === 'INFECTED') {
      await this.storage.remove([quarantinePath]);
      throw new UnprocessableEntityException('El archivo fue rechazado por el antivirus.');
    }
    if (scan.status === 'ERROR') {
      await this.storage.remove([quarantinePath]);
      throw new ServiceUnavailableException('No se pudo verificar el archivo. Inténtalo más tarde.');
    }

    let safe: Buffer;
    try {
      safe = await this.rebuild(file.buffer, type, id);
    } catch (err) {
      this.logger.warn(`Reconstrucción de archivo suelto falló: ${(err as Error).message?.slice(0, 120)}`);
      await this.storage.remove([quarantinePath]);
      throw new UnprocessableEntityException('No se pudo procesar el archivo. Verifica que no esté dañado.');
    }
    await this.storage.upload(safePath, safe, 'application/pdf', false);
    return { id, name, sizeBytes: size, originalSha256, safePath, safeSha256: sha256Hex(safe) };
  }

  /** CDR: PDF nuevo y limpio; una imagen se convierte primero a PDF. */
  private async rebuild(buf: Buffer, type: DetectedType, id: string): Promise<Buffer> {
    const asPdf = type === 'pdf' ? buf : await this.pdfTools.imageToPdf(buf, `${id}.${EXT[type]}`, MIME[type] as 'image/png' | 'image/jpeg');
    const safe = await this.pdfTools.sanitizePdf(asPdf, `${id}.pdf`, {
      removeJavaScript: true, removeEmbeddedFiles: true, removeXMPMetadata: true, removeMetadata: true, removeLinks: true, removeFonts: false,
    });
    if (detectFileType(safe) !== 'pdf') throw new Error('el resultado no es un PDF');
    return safe;
  }

  /** Límites de cantidad y tamaño total contra los adjuntos ya registrados de la solicitud. */
  private static assertWithinLimits(existing: Array<{ sizeBytes: number }>, size: number): void {
    if (existing.length >= ATTACHMENT_LIMITS.maxFiles) throw new UnprocessableEntityException(`Máximo ${ATTACHMENT_LIMITS.maxFiles} archivos por solicitud.`);
    if (existing.reduce((s, a) => s + a.sizeBytes, 0) + size > ATTACHMENT_LIMITS.maxTotalBytes) {
      throw new UnprocessableEntityException('Los archivos superan el límite total de 30 MB.');
    }
  }

  /**
   * Cadena de defensa completa. Cualquier fallo descarta el archivo: sin escaneo no se acepta nada.
   * `sessionId`: la sesión con la que se subió; al registrar el adjunto se vuelve a comprobar, BAJO EL BLOQUEO de la
   * solicitud, que la sesión sigue vigente, que la solicitud sigue abierta y que caben (revisión F5b, 2026-10-19: antes
   * varias subidas en paralelo pasaban los límites y una subida lenta podía registrarse después de firmar o revocar).
   */
  async accept(
    req: SignatureRequest,
    file: { originalname: string; buffer: Buffer },
    info: ClientInfo,
    sessionId?: string,
  ): Promise<SignatureAttachment> {
    const size = file.buffer.length;
    if (size === 0) throw new UnprocessableEntityException('El archivo está vacío.');
    if (size > ATTACHMENT_LIMITS.maxBytes) throw new UnprocessableEntityException('El archivo supera el límite de 10 MB.');

    // Primera revisión (barata, sin bloqueo) para no escanear lo que de todas formas no cabe.
    SignatureAttachmentsService.assertWithinLimits(await this.list(req.id), size);

    const type = detectFileType(file.buffer);
    if (!type) throw new UnprocessableEntityException('Tipo de archivo no permitido. Sube PDF, JPG o PNG.');
    assertImageSize(file.buffer, type);

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
      safe = await this.rebuild(file.buffer, type, id);
    } catch (err) {
      this.logger.warn(`Reconstrucción de adjunto falló (${req.id}): ${(err as Error).message?.slice(0, 120)}`);
      await reject({ reason: 'cdr_failed' }, [quarantinePath]);
      throw new UnprocessableEntityException('No se pudo procesar el archivo. Verifica que no esté dañado.');
    }
    await this.storage.upload(safePath, safe, 'application/pdf', false);

    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.events.lock(tx, req.id);
        const now = new Date();
        const cur = await tx.signatureRequest.findUniqueOrThrow({ where: { id: req.id } });
        if (!['PENDING', 'VIEWED'].includes(cur.status) || cur.expiresAt <= now) {
          throw new ConflictException('La solicitud ya no admite archivos (se firmó, se rechazó, venció o fue cancelada).');
        }
        if (sessionId) {
          const s = await tx.signatureSession.findUnique({ where: { id: sessionId } });
          if (!s || s.revokedAt || s.expiresAt <= now) throw new UnauthorizedException('Verifica tu correo nuevamente.');
        }
        SignatureAttachmentsService.assertWithinLimits(
          await tx.signatureAttachment.findMany({ where: { requestId: req.id }, select: { sizeBytes: true } }), size,
        );
        const row = await tx.signatureAttachment.create({
          data: {
            id, requestId: req.id, originalName: name, detectedType: type, sizeBytes: size, originalSha256,
            quarantinePath, safePath, safeSha256: sha256Hex(safe), scanStatus: 'CLEAN', submitted: false,
          },
        });
        await this.events.append(tx, req.id, { type: 'ATTACHMENT_ACCEPTED', ip: info.ip, userAgent: info.userAgent, detail: { name, sha256: originalSha256, safeSha256: row.safeSha256 } });
        return row;
      }, TX_OPTIONS);
    } catch (err) {
      await this.storage.remove([quarantinePath, safePath]); // no se registró: no dejar archivos huérfanos
      throw err;
    }
  }

  /** Quita un adjunto (solo antes de firmar), bajo el bloqueo de la solicitud: nunca uno que la firma ya contó. */
  async remove(req: SignatureRequest, attachmentId: string): Promise<boolean> {
    const att = await this.prisma.$transaction(async (tx) => {
      await this.events.lock(tx, req.id);
      const cur = await tx.signatureRequest.findUniqueOrThrow({ where: { id: req.id } });
      if (!['PENDING', 'VIEWED'].includes(cur.status)) return null;
      const row = await tx.signatureAttachment.findFirst({ where: { id: attachmentId, requestId: req.id, submitted: false } });
      if (!row) return null;
      const res = await tx.signatureAttachment.deleteMany({ where: { id: row.id, requestId: req.id, submitted: false } });
      return res.count === 1 ? row : null;
    }, TX_OPTIONS);
    if (!att) return false;
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
