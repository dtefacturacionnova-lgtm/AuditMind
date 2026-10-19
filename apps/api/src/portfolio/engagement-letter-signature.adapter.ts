import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { EngagementLetterStatus, Prisma, SignatureDocumentType, SignatureRequest } from '@prisma/client';
import { createHash } from 'crypto';
import { escHtml } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_BUCKET } from '../common/storage/storage-url.service';
import {
  FormSpec, PreparedDocument, PrepareContext, SignatureAdapterRegistry, SignatureDocumentAdapter, SignedContext,
} from '../signatures/signature-documents';
import { EngagementLettersService } from './engagement-letters.service';

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Administrador', ADMIN: 'Administrador', CAE: 'Director de Auditoría', AUDIT_MANAGER: 'Gerente de Auditoría',
  SENIOR_AUDITOR: 'Auditor Senior', AUDITOR: 'Auditor',
};

const ACTIVE_LETTER = [EngagementLetterStatus.DRAFT, EngagementLetterStatus.SENT];

/** Fecha larga en la zona del país, para el bloque «Por el despacho». */
const longDate = (d: Date) => new Intl.DateTimeFormat('es-SV', { timeZone: 'America/El_Salvador', dateStyle: 'long' }).format(d);

/**
 * Firma electrónica de la CARTA DE COMPROMISO (NIA 210) — docs/firma-externa-por-enlace.md §11.1.
 *
 *  - Enviar: la carta pasa a SENT y se congela su texto en un PDF.
 *  - Firmar: la misma transición que la firma manual (`markSigned`): SIGNED, quién firmó y cuándo, y el cliente pasa a ACTIVE.
 *  - Rechazar: DECLINED con el motivo del cliente.
 *  - Revocar desde el panel: la carta vuelve a borrador.
 *  - Sellado terminado: `fileUrl` apunta al PDF firmado.
 * Que cambie el texto de la carta revoca la solicitud vigente: lo hace `EngagementLettersService.update`.
 */
@Injectable()
export class EngagementLetterSignatureAdapter implements SignatureDocumentAdapter, OnModuleInit {
  readonly type = SignatureDocumentType.ENGAGEMENT_LETTER;
  readonly minRole = 'AUDIT_MANAGER';
  readonly label = 'Carta de compromiso';
  readonly defaultExpiryDays = 30;
  readonly allowsAttachments = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: SignatureAdapterRegistry,
    private readonly letters: EngagementLettersService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  // ─── Origen y documento ────────────────────────────────────────────────────
  async prepare(ctx: PrepareContext): Promise<PreparedDocument> {
    const letter = await this.prisma.engagementLetter.findFirst({
      where: { id: ctx.targetId, organizationId: ctx.user.organizationId },
    });
    if (!letter) throw new NotFoundException('Carta de compromiso no encontrada');
    if (letter.status === EngagementLetterStatus.SIGNED) throw new ConflictException('La carta de compromiso ya está firmada.');
    if (letter.status === EngagementLetterStatus.DECLINED) {
      throw new ConflictException('El cliente rechazó esta carta. Edita el texto para devolverla a borrador y vuelve a enviarla.');
    }
    if (!letter.content.trim()) throw new BadRequestException('La carta no tiene texto: escribe el contenido antes de enviarla.');

    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: ctx.user.organizationId }, select: { name: true } });
    const client = await this.prisma.client.findFirst({ where: { id: letter.clientId, organizationId: letter.organizationId }, select: { legalName: true } });
    if (!client) throw new NotFoundException('El cliente de la carta no existe.');
    const clientName = client.legalName;
    const senderRole = ROLE_LABELS[ctx.user.role] ?? ctx.user.role;
    const sentOn = longDate(new Date());

    // Todo texto de usuario va escapado; el texto de la carta conserva sus saltos de línea (`pre-wrap`).
    const bodyHtml = `
<div class="pre-wrap">${escHtml(letter.content)}</div>
<div class="signature-block no-break">
  <h3>Por el despacho</h3>
  <p><strong>${escHtml(org.name)}</strong><br>${escHtml(ctx.user.name)} · ${escHtml(senderRole)}<br>Enviada el ${escHtml(sentOn)}</p>
</div>
<div class="signature-block no-break">
  <h3>Aceptación del cliente</h3>
  <p><strong>${escHtml(clientName)}</strong></p>
  <p class="text-muted text-small">Quien firma escribe su nombre y cargo al firmar. Los datos de la firma electrónica (nombre, cargo, correo verificado,
  fecha y hora, dirección IP y huella del documento) constan en la hoja de evidencia que se agrega al final de este documento.</p>
</div>`;

    return {
      auditId: null, // la carta vive a nivel de cliente
      title: `Carta de compromiso ${letter.year} — ${clientName}`,
      subtitle: `Carta de compromiso de auditoría (NIA 210) · ${org.name}`,
      bodyHtml,
      payload: {
        letterId: letter.id, year: letter.year, clientName,
        contentSha256: createHash('sha256').update(letter.content).digest('hex'),
        sentBy: ctx.user.name, sentByRole: senderRole,
      },
    };
  }

  // ─── Formulario del firmante: la carta no pide datos, solo nombre, cargo y consentimiento ─────
  buildForm(): FormSpec {
    return { fields: [], allowAttachments: false, signedRoleRequired: true };
  }

  validateResponse(_payload: Record<string, unknown>, response: unknown): Record<string, unknown> {
    if (response && typeof response === 'object' && !Array.isArray(response) && Object.keys(response).length === 0) return {};
    if (response === undefined || response === null) return {};
    throw new BadRequestException('Esta carta no lleva respuesta: solo se firma.');
  }

  summarizeResponse(): Array<[string, string]> {
    return [];
  }

  // ─── Efectos sobre la carta (dentro de la transacción de la firma) ─────────
  async onCreated(tx: Prisma.TransactionClient, request: SignatureRequest): Promise<void> {
    const res = await tx.engagementLetter.updateMany({
      where: { id: request.targetId, organizationId: request.organizationId, status: { in: ACTIVE_LETTER } },
      data: { status: EngagementLetterStatus.SENT, declineReason: null },
    });
    if (res.count === 0) throw new ConflictException('La carta cambió de estado mientras se enviaba. Inténtalo de nuevo.');
  }

  async onSigned(tx: Prisma.TransactionClient, ctx: SignedContext): Promise<void> {
    await this.letters.markSigned(tx, ctx.request.targetId, ctx.request.organizationId, {
      name: ctx.signedName, role: ctx.signedRole ?? ctx.request.signerRole ?? '', at: ctx.at,
    });
  }

  async onDeclined(tx: Prisma.TransactionClient, request: SignatureRequest, reason: string): Promise<void> {
    await tx.engagementLetter.updateMany({
      where: { id: request.targetId, organizationId: request.organizationId, status: { in: ACTIVE_LETTER } },
      data: { status: EngagementLetterStatus.DECLINED, declineReason: reason },
    });
  }

  /** Revocada desde el panel (no por reemplazo ni por cambio del texto): la carta ya no está «enviada». */
  async onRevoked(tx: Prisma.TransactionClient, request: SignatureRequest): Promise<void> {
    await tx.engagementLetter.updateMany({
      where: { id: request.targetId, organizationId: request.organizationId, status: EngagementLetterStatus.SENT },
      data: { status: EngagementLetterStatus.DRAFT },
    });
  }

  /** Tras sellar: el PDF firmado queda como el archivo de la carta (la API lo firma al responder, bucket privado). */
  async afterSealed(request: SignatureRequest, signedPdfPath: string): Promise<void> {
    const base = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
    if (!base) return;
    const encodedPath = signedPdfPath.split('/').map(encodeURIComponent).join('/');
    await this.prisma.engagementLetter.updateMany({
      where: { id: request.targetId, organizationId: request.organizationId, status: EngagementLetterStatus.SIGNED },
      data: { fileUrl: `${base}/storage/v1/object/public/${STORAGE_BUCKET}/${encodedPath}` },
    });
  }
}
