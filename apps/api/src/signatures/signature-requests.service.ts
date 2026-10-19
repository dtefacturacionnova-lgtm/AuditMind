import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { Prisma, SignatureDocumentType, SignatureRequest } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PDFDocument } from 'pdf-lib';
import { AuthUser } from '../auth/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { PdfService } from '../pdf/pdf.service';
import { PdfToolsService } from '../pdf-tools/pdf-tools.service';
import { EmailService } from '../email/email.service';
import { encryptSecret } from '../common/utils/signing-key.util';
import { roleLevel } from '../common/utils/tenant.util';
import { ClientInfo } from './request-info.util';
import { CreateSignatureRequestDto, ResendSignatureRequestDto } from './dto/signature.dto';
import { generateToken, hashToken, sha256Hex } from './signature-crypto.util';
import { verifyChain } from './signature-event-chain.util';
import { SignatureAdapterRegistry, SignatureDocumentAdapter } from './signature-documents';
import { SignatureEventsService, TX_OPTIONS } from './signature-events.service';
import { SignaturePolicyService } from './signature-policy.service';
import { SignatureSealingService } from './signature-sealing.service';
import { SignatureAttachmentsService } from './signature-attachments.service';
import { requestFolder, SignatureStorageService } from './signature-storage.service';
import { internalRequestView } from './signature-views';

const MAX_PAYLOAD_BYTES = 60_000;
const ACTIVE = ['PENDING', 'VIEWED'] as const;
const fmtDeadline = (d: Date) =>
  new Intl.DateTimeFormat('es-SV', { timeZone: 'America/El_Salvador', dateStyle: 'long' }).format(d);

/**
 * Operaciones INTERNAS (con sesión) de la firma por enlace (docs/firma-externa-por-enlace.md §9.2):
 * crear, reenviar, revocar, consultar, entregar archivos y verificar integridad. Todo se filtra por organización.
 */
@Injectable()
export class SignatureRequestsService {
  private readonly logger = new Logger(SignatureRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: SignatureEventsService,
    private readonly storage: SignatureStorageService,
    private readonly attachments: SignatureAttachmentsService,
    private readonly sealing: SignatureSealingService,
    private readonly registry: SignatureAdapterRegistry,
    private readonly policy: SignaturePolicyService,
    private readonly pdf: PdfService,
    private readonly pdfTools: PdfToolsService,
    private readonly email: EmailService,
  ) {}

  // ─── Utilidades ────────────────────────────────────────────────────────────
  private adapterFor(type: SignatureDocumentType): SignatureDocumentAdapter {
    const adapter = this.registry.find(type);
    if (!adapter) throw new BadRequestException('Este tipo de documento todavía no se puede enviar para firma.');
    return adapter;
  }

  private assertRole(user: AuthUser, adapter: SignatureDocumentAdapter) {
    if (roleLevel(user.role) < roleLevel(adapter.minRole)) {
      throw new ForbiddenException(`Para enviar «${adapter.label}» a firma necesitas un rol superior al tuyo.`);
    }
  }

  private async load(user: AuthUser, id: string): Promise<SignatureRequest> {
    const r = await this.prisma.signatureRequest.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!r) throw new NotFoundException('Solicitud de firma no encontrada');
    // Además de la organización, el documento de origen puede restringir el acceso (modo investigación).
    await this.registry.find(r.documentType)?.assertAccess?.(user, r.targetId);
    return r;
  }

  private async orgName(organizationId: string): Promise<string> {
    return (await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true } })).name;
  }

  /** Cierra las solicitudes activas que cumplan `where`: estado, sesiones, bitácora y gancho del documento. */
  private async revokeActive(
    tx: Prisma.TransactionClient,
    where: Prisma.SignatureRequestWhereInput,
    reason: string,
    actorId: string,
    info: Partial<ClientInfo>,
    opts: { adapterHook: boolean; targetUpdated: boolean },
  ): Promise<SignatureRequest[]> {
    const active = await tx.signatureRequest.findMany({ where: { ...where, status: { in: [...ACTIVE] } } });
    const closed: SignatureRequest[] = [];
    for (const r of active) {
      await this.events.lock(tx, r.id);
      const now = new Date();
      const res = await tx.signatureRequest.updateMany({
        where: { id: r.id, status: { in: [...ACTIVE] } },
        data: { status: 'REVOKED', revokedAt: now, revokedById: actorId, revokedReason: reason },
      });
      if (res.count === 0) continue;
      await tx.signatureSession.updateMany({ where: { requestId: r.id, revokedAt: null }, data: { revokedAt: now } });
      if (opts.targetUpdated) await this.events.append(tx, r.id, { type: 'TARGET_UPDATED', actorId, detail: { reason } });
      await this.events.append(tx, r.id, { type: 'REVOKED', ip: info.ip ?? null, userAgent: info.userAgent ?? null, actorId, detail: { reason } });
      if (opts.adapterHook) await this.registry.find(r.documentType)?.onRevoked?.(tx, r, reason);
      closed.push(r);
    }
    return closed;
  }

  private async purgeAttachments(requests: SignatureRequest[]) {
    for (const r of requests) await this.attachments.purgeUnsubmitted(r.id).catch((e) => this.logger.warn(`purga de adjuntos ${r.id}: ${e.message}`));
  }

  // ─── Crear ─────────────────────────────────────────────────────────────────
  async create(user: AuthUser, dto: CreateSignatureRequestDto, info: ClientInfo) {
    this.policy.assertEnabled();
    const encKey = this.policy.encryptionKey();
    const adapter = this.adapterFor(dto.documentType);
    this.assertRole(user, adapter);
    if (Buffer.byteLength(JSON.stringify(dto.payload ?? {})) > MAX_PAYLOAD_BYTES) {
      throw new BadRequestException('Los datos adicionales de la solicitud son demasiado grandes.');
    }
    await this.policy.assertDailyEmailCap(user.organizationId);

    // El adaptador valida el origen (existe, es de la organización, estado permitido) y arma el documento.
    const prepared = await adapter.prepare({
      user, targetId: dto.targetId,
      signer: { name: dto.signerName, email: dto.signerEmail, role: dto.signerRole ?? null },
      payload: dto.payload ?? {},
    });

    // Congelar el documento: PDF + limpieza + huella. A partir de aquí el firmante ve EXACTAMENTE este archivo.
    let frozen: Buffer;
    let pages: number;
    try {
      let raw = await this.pdf.generateBranded({
        title: prepared.title, subtitle: prepared.subtitle, body: prepared.bodyHtml,
        options: { printPageNumbers: true, format: 'A4' },
      });
      if (prepared.appendPdfs?.length) {
        raw = await this.pdfTools.mergePdfs([
          { buffer: raw, filename: 'documento.pdf' },
          ...prepared.appendPdfs.map((buffer, i) => ({ buffer, filename: `anexo-${i + 1}.pdf` })),
        ]);
      }
      frozen = await this.pdfTools.sanitizePdf(raw, 'documento.pdf', { removeJavaScript: true, removeEmbeddedFiles: true });
      pages = (await PDFDocument.load(frozen, { ignoreEncryption: true })).getPageCount();
    } catch (err) {
      this.logger.error(`No se pudo preparar el PDF de la solicitud de firma: ${(err as Error).message}`);
      throw new BadRequestException('No se pudo preparar el documento. Inténtalo de nuevo.');
    }
    const documentSha256 = sha256Hex(frozen);

    const id = randomUUID();
    const documentPath = `${requestFolder(id, user.organizationId, prepared.auditId)}/original.pdf`;
    await this.storage.upload(documentPath, frozen, 'application/pdf', false);

    const token = generateToken();
    const days = dto.expiresInDays ?? adapter.defaultExpiryDays;
    const expiresAt = new Date(Date.now() + days * 24 * 3600 * 1000);

    let created: SignatureRequest;
    let replaced: SignatureRequest[] = [];
    try {
      ({ created, replaced } = await this.prisma.$transaction(async (tx) => {
        // Una sola solicitud activa por documento: la nueva reemplaza a la anterior.
        const replaced = await this.revokeActive(
          tx, { organizationId: user.organizationId, documentType: dto.documentType, targetId: dto.targetId },
          'Reemplazada por una solicitud nueva', user.id, info, { adapterHook: false, targetUpdated: false },
        );
        const created = await tx.signatureRequest.create({
          data: {
            id, organizationId: user.organizationId, auditId: prepared.auditId, documentType: dto.documentType, targetId: dto.targetId,
            title: prepared.title.slice(0, 200), signerName: dto.signerName, signerEmail: dto.signerEmail, signerRole: dto.signerRole ?? null,
            payload: prepared.payload as Prisma.InputJsonValue,
            tokenHash: hashToken(token), tokenEncrypted: encryptSecret(token, encKey), expiresAt, status: 'PENDING',
            documentPath, documentSha256, documentPages: pages,
            reminderEnabled: dto.reminderEnabled ?? true, createdById: user.id,
          },
        });
        await this.events.append(tx, id, {
          type: 'CREATED', ip: info.ip, userAgent: info.userAgent, actorId: user.id,
          detail: { documentType: dto.documentType, expiresInDays: days, replaced: replaced.length },
        });
        await adapter.onCreated?.(tx, created);
        return { created, replaced };
      }, TX_OPTIONS));
    } catch (err) {
      await this.storage.remove([documentPath]); // la transacción falló: no dejar el PDF huérfano
      throw err;
    }
    await this.purgeAttachments(replaced);

    const emailSent = await this.sendInvitation(created, token, adapter, user, false);
    const fresh = await this.prisma.signatureRequest.findUniqueOrThrow({ where: { id } });
    return {
      request: internalRequestView(fresh, { documentLabel: adapter.label }),
      signUrl: this.email.signUrl(token), // la ÚNICA vez que se entrega el enlace en claro
      emailSent,
    };
  }

  /** Envía el correo y registra el envío. Si el correo falla, la solicitud sigue vigente (queda "Copiar enlace"). */
  private async sendInvitation(r: SignatureRequest, token: string, adapter: SignatureDocumentAdapter, user: AuthUser, resend: boolean): Promise<boolean> {
    const orgName = await this.orgName(r.organizationId);
    const result = await this.email.sendSignatureRequest(r.signerEmail, {
      orgName, documentLabel: adapter.label, title: r.title, senderName: user.name,
      deadline: fmtDeadline(r.expiresAt), token, replyTo: user.email,
    });
    if (result.sent) {
      await this.prisma.$transaction(async (tx) => {
        await tx.signatureRequest.update({ where: { id: r.id }, data: { sentAt: new Date(), ...(resend ? {} : { sendCount: { increment: 1 } }) } });
        if (!resend) await this.events.append(tx, r.id, { type: 'SENT', actorId: user.id, detail: { to: r.signerEmail } });
      }, TX_OPTIONS);
    } else {
      this.logger.warn(`Correo de firma no enviado (${r.id}): ${result.error ?? 'sin detalle'}`);
    }
    return result.sent;
  }

  // ─── Consultar ─────────────────────────────────────────────────────────────
  /** ¿Está encendida la firma por enlace? La interfaz oculta el botón de envío mientras el interruptor esté apagado. */
  availability() {
    return { enabled: this.policy.isEnabled() };
  }

  async list(user: AuthUser, documentType: SignatureDocumentType, targetId: string) {
    await this.registry.find(documentType)?.assertAccess?.(user, targetId);
    const rows = await this.prisma.signatureRequest.findMany({
      where: { organizationId: user.organizationId, documentType, targetId }, orderBy: { createdAt: 'desc' }, take: 50,
    });
    const label = this.registry.find(documentType)?.label ?? documentType;
    return Promise.all(rows.map(async (r) => internalRequestView(r, {
      documentLabel: label,
      events: await this.prisma.signatureEvent.findMany({ where: { requestId: r.id }, orderBy: { seq: 'asc' } }),
      attachments: await this.attachments.list(r.id),
    })));
  }

  async get(user: AuthUser, id: string) {
    const r = await this.load(user, id);
    return internalRequestView(r, {
      documentLabel: this.registry.find(r.documentType)?.label ?? r.documentType,
      events: await this.prisma.signatureEvent.findMany({ where: { requestId: r.id }, orderBy: { seq: 'asc' } }),
      attachments: await this.attachments.list(r.id),
    });
  }

  // ─── Reenviar ──────────────────────────────────────────────────────────────
  /** Rota el token (el enlace anterior muere), reinicia el código de verificación y vuelve a enviar el correo. */
  async resend(user: AuthUser, id: string, dto: ResendSignatureRequestDto, info: ClientInfo) {
    this.policy.assertEnabled();
    const encKey = this.policy.encryptionKey();
    const r0 = await this.load(user, id);
    const adapter = this.adapterFor(r0.documentType);
    this.assertRole(user, adapter);
    await this.policy.assertDailyEmailCap(user.organizationId);

    const token = generateToken();
    const now = new Date();
    const expiresAt = dto.expiresInDays
      ? new Date(now.getTime() + dto.expiresInDays * 864e5)
      : r0.expiresAt > now ? r0.expiresAt : new Date(now.getTime() + adapter.defaultExpiryDays * 864e5);

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.events.lock(tx, id);
      const res = await tx.signatureRequest.updateMany({
        where: { id, organizationId: user.organizationId, status: { in: ['PENDING', 'VIEWED', 'EXPIRED'] } },
        data: {
          tokenHash: hashToken(token), tokenEncrypted: encryptSecret(token, encKey), expiresAt, status: 'PENDING',
          lockedUntil: null, otpHash: null, otpExpiresAt: null, otpAttempts: 0, otpFailuresHour: 0, otpWindowStart: null,
          otpSentCount: 0, otpLastSentAt: null, otpVerifiedAt: null, reminderSentAt: null, sendCount: { increment: 1 },
        },
      });
      if (res.count === 0) throw new ConflictException('Solo se puede reenviar una solicitud pendiente o vencida.');
      await tx.signatureSession.updateMany({ where: { requestId: id, revokedAt: null }, data: { revokedAt: now } });
      await this.events.append(tx, id, { type: 'RESENT', ip: info.ip, userAgent: info.userAgent, actorId: user.id, detail: { expiresAt: expiresAt.toISOString() } });
      return tx.signatureRequest.findUniqueOrThrow({ where: { id } });
    }, TX_OPTIONS);

    const emailSent = await this.sendInvitation(updated, token, adapter, user, true);
    return { request: await this.get(user, id), signUrl: this.email.signUrl(token), emailSent };
  }

  // ─── Revocar ───────────────────────────────────────────────────────────────
  async revoke(user: AuthUser, id: string, reason: string, info: ClientInfo) {
    const r = await this.load(user, id);
    const adapter = this.adapterFor(r.documentType);
    this.assertRole(user, adapter);
    const closed = await this.prisma.$transaction(
      (tx) => this.revokeActive(tx, { id, organizationId: user.organizationId }, reason, user.id, info, { adapterHook: true, targetUpdated: false }),
      TX_OPTIONS,
    );
    if (closed.length === 0) throw new ConflictException('Solo se puede revocar una solicitud pendiente.');
    await this.purgeAttachments(closed);
    return this.get(user, id);
  }

  /**
   * Para los módulos de cada documento (F2–F4): cuando el documento de origen CAMBIA (se edita la carta, el monto de
   * una confirmación…), las solicitudes activas deben cerrarse para que nadie firme algo distinto de lo que se envió.
   * Se llama dentro de la transacción del cambio.
   */
  async revokeActiveForTarget(
    tx: Prisma.TransactionClient,
    p: { organizationId: string; documentType: SignatureDocumentType; targetId: string; reason: string; actorId: string },
  ): Promise<SignatureRequest[]> {
    return this.revokeActive(
      tx, { organizationId: p.organizationId, documentType: p.documentType, targetId: p.targetId },
      p.reason, p.actorId, {}, { adapterHook: false, targetUpdated: true },
    );
  }

  // ─── Archivos ──────────────────────────────────────────────────────────────
  /** kind: original | signed | attachment:<id> | quarantine:<id> (solo gerente o superior) */
  async getFile(user: AuthUser, id: string, kind: string) {
    const r = await this.load(user, id);
    let path: string | null = null;
    let warning: string | undefined;
    if (kind === 'original') path = r.documentPath;
    else if (kind === 'signed') path = r.signedPdfPath;
    else if (kind.startsWith('attachment:') || kind.startsWith('quarantine:')) {
      const [type, attId] = kind.split(':');
      const att = await this.prisma.signatureAttachment.findFirst({ where: { id: attId, requestId: id } });
      if (att) {
        if (type === 'quarantine') {
          if (roleLevel(user.role) < roleLevel('AUDIT_MANAGER')) throw new ForbiddenException('El archivo original sin reconstruir solo lo descarga un gerente o superior.');
          path = att.quarantinePath;
          warning = 'Archivo original sin reconstruir: ábrelo solo si lo necesitas como evidencia.';
        } else path = att.safePath;
      }
    } else throw new BadRequestException('Tipo de archivo no válido.');
    if (!path) throw new NotFoundException('Archivo no disponible');
    return { url: await this.storage.signedUrl(path), expiresInSeconds: 600, ...(warning ? { warning } : {}) };
  }

  // ─── Integridad ────────────────────────────────────────────────────────────
  async integrity(user: AuthUser, id: string) {
    const r = await this.load(user, id);
    const chain = await this.events.listChain(id);
    const v = verifyChain(id, chain);
    const checks: Array<{ name: string; ok: boolean; detail?: string }> = [
      { name: 'bitacora_encadenada', ok: v.ok, detail: v.ok ? undefined : `${v.reason} (evento ${v.brokenAtSeq})` },
    ];
    try {
      const original = await this.storage.download(r.documentPath);
      checks.push({ name: 'documento_original', ok: sha256Hex(original) === r.documentSha256 });
    } catch { checks.push({ name: 'documento_original', ok: false, detail: 'No se pudo leer el archivo' }); }
    if (r.signedPdfPath && r.signedPdfSha256) {
      try {
        const signed = await this.storage.download(r.signedPdfPath);
        checks.push({ name: 'pdf_sellado', ok: sha256Hex(signed) === r.signedPdfSha256 });
      } catch { checks.push({ name: 'pdf_sellado', ok: false, detail: 'No se pudo leer el archivo' }); }
    }
    if (r.eventsHeadHash) checks.push({ name: 'cabeza_de_cadena_impresa_en_el_pdf', ok: chain.some((e) => e.hash === r.eventsHeadHash) });
    const ok = checks.every((c) => c.ok);
    if (!ok) {
      await this.events.appendStandalone(id, { type: 'INTEGRITY_FAILED', actorId: user.id, detail: { phase: 'check', failed: checks.filter((c) => !c.ok).map((c) => c.name) } });
    }
    return { ok, checks };
  }

  // ─── Sellado manual ────────────────────────────────────────────────────────
  async reseal(user: AuthUser, id: string) {
    const r = await this.load(user, id);
    if (!(await this.sealing.requeue(r.id, user.organizationId))) throw new ConflictException('Solo se puede reintentar el sellado de una solicitud firmada con sellado pendiente o fallido.');
    void this.sealing.sealRequest(r.id); // en segundo plano; el panel consulta el estado
    return this.get(user, id);
  }
}
