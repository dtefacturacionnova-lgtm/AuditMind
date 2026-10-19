import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfirmationStatus, Prisma, SignatureDocumentType, SignatureRequest } from '@prisma/client';
import { createHash } from 'crypto';
import { AuthUser } from '../auth/jwt.strategy';
import { escHtml } from '../email/email.service';
import { AuditInvestigationAccessService } from '../investigation-report/audit-investigation-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { detectFileType } from '../signatures/signature-attachments.service';
import {
  FormSpec, PreparedDocument, PrepareContext, SignatureAdapterRegistry, SignatureDocumentAdapter, SignedContext,
} from '../signatures/signature-documents';
import { SignatureStorageService } from '../signatures/signature-storage.service';
import {
  ConfirmationMode, ConfirmationResponse, isOwnAuthorizationPath, parseResponse, parseSendPayload, responseAmountOf,
} from './confirmation-signature.payload';
import { ConfirmationsService } from './confirmations.service';

const TYPE_LABELS: Record<string, string> = { BANK: 'Banco', CLIENT: 'Cliente', LAWYER: 'Abogado', SUPPLIER: 'Proveedor', OTHER: 'Otro' };
const SENDABLE: ConfirmationStatus[] = [ConfirmationStatus.DRAFT, ConfirmationStatus.SENT];

/** Dinero con su moneda (1,250.50 → «$1,250.50» en USD). Si la moneda no existe en ICU, se escribe el código. */
export function formatMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

const longDateUtc = (isoDay: string) =>
  new Intl.DateTimeFormat('es-SV', { timeZone: 'UTC', dateStyle: 'long' }).format(new Date(`${isoDay}T00:00:00Z`));
const longDateTimeSv = (d: Date) =>
  new Intl.DateTimeFormat('es-SV', { timeZone: 'America/El_Salvador', dateStyle: 'long', timeStyle: 'short' }).format(d);

type StoredPayload = { mode: ConfirmationMode; currency: string; asOfDate: string; amountShown: number | null };
const payloadOf = (p: Record<string, unknown>) => p as unknown as StoredPayload;

/**
 * Firma electrónica de la CONFIRMACIÓN EXTERNA (NIA 505) — docs/firma-externa-por-enlace.md §11.2 y §12.
 *
 *  - Enviar: la confirmación pasa a SENT; el auditor elige si el saldo se muestra o va en blanco, y puede anexar la carta
 *    de autorización del cliente. Exige verificar de forma independiente el correo del confirmante (NIA 505).
 *  - Firmar: misma transición que el registro manual de la respuesta (`applyResponse`): RECEIVED con el texto de la
 *    respuesta, el monto confirmado y la diferencia contra el monto solicitado.
 *  - Rechazar: la confirmación sigue SENT; el motivo queda visible en la solicitud y el auditor decide qué sigue.
 *  - Revocar desde el panel: la confirmación vuelve a borrador.
 * En auditorías en modo investigación solo accede el equipo del encargo (CAE, ADMIN y SUPER_ADMIN incluidos).
 */
@Injectable()
export class ConfirmationSignatureAdapter implements SignatureDocumentAdapter, OnModuleInit {
  readonly type = SignatureDocumentType.EXTERNAL_CONFIRMATION;
  readonly minRole = 'AUDITOR';
  readonly label = 'Confirmación externa (NIA 505)';
  readonly defaultExpiryDays = 15;
  readonly allowsAttachments = true;

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: SignatureAdapterRegistry,
    private readonly confirmations: ConfirmationsService,
    private readonly storage: SignatureStorageService,
    private readonly access: AuditInvestigationAccessService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  // ─── Acceso ────────────────────────────────────────────────────────────────
  async assertAccess(user: AuthUser, targetId: string): Promise<void> {
    const conf = await this.prisma.externalConfirmation.findFirst({
      where: { id: targetId, audit: { organizationId: user.organizationId } }, select: { auditId: true },
    });
    if (!conf) throw new NotFoundException('Confirmación no encontrada');
    await this.access.assertAccess(conf.auditId, user);
  }

  // ─── Origen y documento ────────────────────────────────────────────────────
  async prepare(ctx: PrepareContext): Promise<PreparedDocument> {
    const conf = await this.prisma.externalConfirmation.findFirst({
      where: { id: ctx.targetId, audit: { organizationId: ctx.user.organizationId } },
      include: { audit: { select: { id: true, title: true } } },
    });
    if (!conf) throw new NotFoundException('Confirmación no encontrada');
    await this.access.assertAccess(conf.auditId, ctx.user);
    if (!SENDABLE.includes(conf.status)) {
      throw new ConflictException('Solo se envía a firma una confirmación en borrador o ya enviada que todavía no tiene respuesta.');
    }

    const amount = conf.amount != null ? Number(conf.amount) : null;
    const p = parseSendPayload(ctx.payload, { hasAmount: amount !== null });

    // Carta de autorización: solo una que ESTA confirmación subió (la ruta la arma el servidor), PDF verdadero.
    let appendPdfs: Buffer[] | undefined;
    let authorizationSha256: string | null = null;
    if (p.authorizationPath) {
      if (!isOwnAuthorizationPath(p.authorizationPath, conf.auditId, conf.id)) throw new BadRequestException('La carta de autorización no es válida.');
      let buf: Buffer;
      try {
        buf = await this.storage.download(p.authorizationPath);
      } catch {
        throw new BadRequestException('No se encontró la carta de autorización: súbela de nuevo.');
      }
      if (detectFileType(buf) !== 'pdf') throw new BadRequestException('La carta de autorización no es válida: súbela de nuevo.');
      appendPdfs = [buf];
      authorizationSha256 = createHash('sha256').update(buf).digest('hex');
    }

    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: ctx.user.organizationId }, select: { name: true } });
    const typeLabel = TYPE_LABELS[conf.type] ?? conf.type;
    const shown = p.mode === 'POSITIVE_WITH_AMOUNT' && amount !== null ? amount : null;

    // Todo texto de usuario va escapado.
    const bodyHtml = `
<p>Estimado(a) <strong>${escHtml(conf.respondentName)}</strong>:</p>
<p>En el marco de la auditoría «${escHtml(conf.audit.title)}», <strong>${escHtml(org.name)}</strong> le solicita confirmar
<strong>directamente a nuestro equipo</strong> la información siguiente, al <strong>${escHtml(longDateUtc(p.asOfDate))}</strong>:</p>
<div class="meta-strip"><dl>
  <dt>Tipo de confirmación</dt><dd>${escHtml(typeLabel)}</dd>
  <dt>Cuenta o referencia</dt><dd>${escHtml(conf.accountRef ?? '—')}</dd>
  <dt>Fecha de corte</dt><dd>${escHtml(longDateUtc(p.asOfDate))}</dd>
  ${shown !== null
    ? `<dt>Saldo según los registros de la entidad auditada</dt><dd><strong>${escHtml(formatMoney(shown, p.currency))}</strong></dd>`
    : `<dt>Saldo</dt><dd>Indique el saldo según sus registros (${escHtml(p.currency)}).</dd>`}
</dl></div>
<h3>Cómo responder</h3>
<p>${shown !== null
    ? 'Indique si está de acuerdo con el saldo anterior. Si no lo está, escriba el saldo que figura en sus registros y, si lo desea, un comentario.'
    : 'Escriba el saldo que figura en sus registros y, si lo desea, un comentario.'}
Responda <strong>directamente a ${escHtml(org.name)}</strong>, no a la entidad auditada. Recibirá un enlace seguro y un código de verificación en este mismo correo; al final escribirá su nombre y cargo y firmará.</p>
<p class="text-muted text-small">Solicitud de confirmación externa conforme a la NIA 505.${p.authorizationPath ? ' En las páginas siguientes se anexa la carta de autorización del cliente.' : ''}</p>`;

    return {
      auditId: conf.auditId,
      title: `Confirmación externa — ${typeLabel} — ${conf.respondentName}`,
      subtitle: `${org.name} · ${conf.audit.title}`,
      bodyHtml,
      payload: {
        mode: p.mode, asOfDate: p.asOfDate, currency: p.currency, amountShown: shown, accountRef: conf.accountRef,
        confirmationType: conf.type, recipientVerified: true, authorizationPath: p.authorizationPath, authorizationSha256,
      },
      appendPdfs,
    };
  }

  // ─── Formulario del firmante ───────────────────────────────────────────────
  buildForm(payload: Record<string, unknown>): FormSpec {
    const { mode, currency } = payloadOf(payload);
    const blank = mode === 'POSITIVE_BLANK';
    return {
      fields: [
        {
          key: 'agrees', type: 'boolean', required: true,
          label: blank ? 'Los datos de esta solicitud (cuenta o referencia y fecha de corte) corresponden a mis registros' : 'Estoy de acuerdo con el saldo indicado en el documento',
        },
        {
          key: 'confirmedAmount', type: 'amount', label: `Saldo según mis registros (${currency})`,
          ...(blank ? { required: true } : { requiredIf: { field: 'agrees', equals: false } }),
          help: blank ? 'Escribe el saldo tal como figura en tus registros.' : 'Obligatorio solo si no estás de acuerdo con el saldo del documento.',
        },
        { key: 'comments', type: 'textarea', label: 'Comentarios', maxLength: 4000 },
      ],
      allowAttachments: true, // soportes opcionales (§12)
      signedRoleRequired: true,
    };
  }

  validateResponse(payload: Record<string, unknown>, response: unknown): Record<string, unknown> {
    return { ...parseResponse(response, payloadOf(payload).mode) };
  }

  summarizeResponse(payload: Record<string, unknown>, response: Record<string, unknown>): Array<[string, string]> {
    const { mode, currency } = payloadOf(payload);
    const r = response as unknown as ConfirmationResponse;
    const rows: Array<[string, string]> = [
      ['Respuesta', r.agrees ? (mode === 'POSITIVE_BLANK' ? 'Los datos corresponden a sus registros' : 'De acuerdo con el saldo') : 'En desacuerdo'],
    ];
    if (r.confirmedAmount !== null) rows.push(['Saldo según el confirmante', formatMoney(r.confirmedAmount, currency)]);
    if (r.comments) rows.push(['Comentarios', r.comments]);
    return rows;
  }

  // ─── Efectos sobre la confirmación (dentro de la transacción de la firma) ──
  async onCreated(tx: Prisma.TransactionClient, request: SignatureRequest): Promise<void> {
    const sender = await tx.user.findUnique({ where: { id: request.createdById }, select: { name: true, email: true } });
    const res = await tx.externalConfirmation.updateMany({
      where: { id: request.targetId, audit: { organizationId: request.organizationId }, status: { in: SENDABLE } },
      data: { status: ConfirmationStatus.SENT, sentAt: new Date(), sentBy: sender?.name ?? sender?.email ?? 'AuditMind' },
    });
    if (res.count === 0) throw new ConflictException('La confirmación cambió de estado mientras se enviaba. Inténtalo de nuevo.');
  }

  async onSigned(tx: Prisma.TransactionClient, ctx: SignedContext): Promise<void> {
    const { mode, amountShown } = payloadOf(ctx.request.payload as Record<string, unknown>);
    const r = ctx.response as unknown as ConfirmationResponse;
    const who = `${ctx.signedName}${ctx.signedRole ? ` (${ctx.signedRole})` : ''}`;
    const responseContent =
      `Respuesta electrónica firmada por ${who} el ${longDateTimeSv(ctx.at)}: ${r.agrees ? 'De acuerdo' : 'En desacuerdo'}. ` +
      `Comentarios: ${r.comments || 'ninguno'}`;
    await this.confirmations.applyResponse(tx, ctx.request.targetId, ctx.request.organizationId, {
      responseContent, responseAmount: responseAmountOf(mode, amountShown, r), at: ctx.at,
    });
  }

  // El rechazo no cambia el estado: la confirmación sigue SENT y el motivo queda en la solicitud (el auditor decide si pasa
  // a NO_RESPONSE o a procedimiento alternativo), así que no hay `onDeclined`.

  /** Revocada desde el panel (no por reemplazo ni por cambio de datos): la confirmación ya no está «enviada». */
  async onRevoked(tx: Prisma.TransactionClient, request: SignatureRequest): Promise<void> {
    await tx.externalConfirmation.updateMany({
      where: { id: request.targetId, audit: { organizationId: request.organizationId }, status: ConfirmationStatus.SENT },
      data: { status: ConfirmationStatus.DRAFT, sentAt: null, sentBy: null },
    });
  }
}
