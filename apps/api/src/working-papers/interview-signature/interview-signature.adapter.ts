import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma, SignatureDocumentType, SignatureRequest } from '@prisma/client';
import { createHash } from 'crypto';
import { AuthUser } from '../../auth/jwt.strategy';
import { STORAGE_BUCKET } from '../../common/storage/storage-url.service';
import { escHtml } from '../../email/email.service';
import { AuditInvestigationAccessService } from '../../investigation-report/audit-investigation-access.service';
import { PrismaService } from '../../prisma/prisma.service';
import { FormSpec, PreparedDocument, PrepareContext, SignatureAdapterRegistry, SignatureDocumentAdapter } from '../../signatures/signature-documents';
import { sanitizeFilename } from '../../signatures/signature-attachments.service';
import {
  ActaPayload, ActaResponse, ACTA_LIMITS, isInterviewPaper, MODALITY_LABELS, parseActaPayload, parseActaResponse,
} from './interview-signature.payload';

const longDateUtc = (isoDay: string) =>
  new Intl.DateTimeFormat('es-SV', { timeZone: 'UTC', dateStyle: 'long' }).format(new Date(`${isoDay}T00:00:00Z`));

type StoredPayload = ActaPayload & { intervieweeName: string; intervieweeRole: string | null; paperId: string; paperCode: string | null };
const payloadOf = (p: Record<string, unknown>) => p as unknown as StoredPayload;

/** Sección de los papeles de entrevista (`PT-ENTREV`) donde se registran las sesiones: ahí queda el acta firmada. */
const SESSIONS_SECTION = 'S2';

/**
 * Firma electrónica del ACTA DE ENTREVISTA EXTERNA — docs/firma-externa-por-enlace.md §11.3.
 *
 *  - Origen: un papel de trabajo de entrevista (`PT-ENTREV`, tipo INTERVIEW o `B-INT-*`) del encargo. En modo
 *    investigación solo accede el equipo del encargo (CAE, ADMIN y SUPER_ADMIN incluidos).
 *  - El acta la redacta el auditor al enviarla y VIVE en la solicitud (inmutable): para corregirla se revoca y se crea otra.
 *  - El entrevistado es el firmante: indica si está conforme y, si no, sus observaciones.
 *  - Al sellar, el PDF firmado se agrega como adjunto de la sección S2 del papel (si la tiene).
 * El acta no modifica nada del papel al firmarse ni al rechazarse: su estado vive en el panel de solicitudes.
 */
@Injectable()
export class InterviewSignatureAdapter implements SignatureDocumentAdapter, OnModuleInit {
  private readonly logger = new Logger(InterviewSignatureAdapter.name);
  readonly type = SignatureDocumentType.INTERVIEW_RECORD;
  readonly minRole = 'AUDITOR';
  readonly label = 'Acta de entrevista';
  readonly defaultExpiryDays = 15;
  readonly allowsAttachments = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: SignatureAdapterRegistry,
    private readonly access: AuditInvestigationAccessService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  // ─── Acceso ────────────────────────────────────────────────────────────────
  async assertAccess(user: AuthUser, targetId: string): Promise<void> {
    const paper = await this.prisma.workingPaper.findFirst({
      where: { id: targetId, audit: { organizationId: user.organizationId } }, select: { auditId: true },
    });
    if (!paper) throw new NotFoundException('Papel de trabajo no encontrado');
    await this.access.assertAccess(paper.auditId, user);
  }

  // ─── Origen y documento ────────────────────────────────────────────────────
  async prepare(ctx: PrepareContext): Promise<PreparedDocument> {
    const paper = await this.prisma.workingPaper.findFirst({
      where: { id: ctx.targetId, audit: { organizationId: ctx.user.organizationId } },
      include: { audit: { select: { id: true, title: true } } },
    });
    if (!paper) throw new NotFoundException('Papel de trabajo no encontrado');
    await this.access.assertAccess(paper.auditId, ctx.user);
    if (!isInterviewPaper(paper)) {
      throw new BadRequestException('Las actas para firma se envían desde un papel de entrevista (PT-ENTREV, de tipo entrevista o B-INT-*).');
    }

    const p = parseActaPayload(ctx.payload);
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: ctx.user.organizationId }, select: { name: true } });
    const paperRef = paper.paperCode ?? paper.code;

    // Todo texto de usuario va escapado; el acta conserva sus saltos de línea (`pre-wrap`).
    const bodyHtml = `
<div class="meta-strip"><dl>
  <dt>Entrevistado(a)</dt><dd>${escHtml(ctx.signer.name)}${ctx.signer.role ? ` — ${escHtml(ctx.signer.role)}` : ''}</dd>
  <dt>Fecha de la entrevista</dt><dd>${escHtml(longDateUtc(p.interviewDate))}</dd>
  <dt>Modalidad</dt><dd>${escHtml(MODALITY_LABELS[p.modality])}${p.location ? ` — ${escHtml(p.location)}` : ''}</dd>
  <dt>Entrevistadores</dt><dd>${escHtml(p.interviewers)}</dd>
  <dt>Papel de trabajo</dt><dd>${escHtml(paperRef)} — ${escHtml(paper.title)}</dd>
</dl></div>
${p.confidentialityNote ? `<blockquote>${escHtml(p.confidentialityNote)}</blockquote>` : ''}
<h2>Acta</h2>
<div class="pre-wrap">${escHtml(p.content)}</div>
<div class="signature-block no-break">
  <h3>Conformidad del entrevistado</h3>
  <p>Quien firma declara que ha leído esta acta y que indica en la firma si está conforme con su contenido o, si no lo está, sus observaciones.
  Los datos de la firma electrónica (nombre, cargo, correo verificado, fecha y hora, dirección IP y huella del documento) constan en la hoja de evidencia
  que se agrega al final de este documento.</p>
</div>`;

    return {
      auditId: paper.auditId,
      title: `Acta de entrevista — ${ctx.signer.name}`,
      subtitle: `${org.name} · ${paper.audit.title}`,
      bodyHtml,
      payload: {
        ...p,
        intervieweeName: ctx.signer.name, intervieweeRole: ctx.signer.role ?? null,
        paperId: paper.id, paperCode: paperRef,
        contentSha256: createHash('sha256').update(p.content).digest('hex'),
      },
    };
  }

  // ─── Formulario del firmante ───────────────────────────────────────────────
  buildForm(): FormSpec {
    return {
      fields: [
        { key: 'conforme', type: 'boolean', required: true, label: 'Estoy conforme con el contenido de esta acta' },
        {
          key: 'observations', type: 'textarea', label: 'Observaciones', maxLength: ACTA_LIMITS.observationsMax,
          requiredIf: { field: 'conforme', equals: false },
          help: 'Obligatorias si no estás conforme: indica qué no es correcto o qué falta.',
        },
      ],
      allowAttachments: false,
      signedRoleRequired: false, // el entrevistado puede no tener un cargo que declarar
    };
  }

  validateResponse(_payload: Record<string, unknown>, response: unknown): Record<string, unknown> {
    return { ...parseActaResponse(response) };
  }

  summarizeResponse(_payload: Record<string, unknown>, response: Record<string, unknown>): Array<[string, string]> {
    const r = response as unknown as ActaResponse;
    const rows: Array<[string, string]> = [['Respuesta', r.conforme ? 'Conforme con el contenido del acta' : 'No conforme']];
    if (r.observations) rows.push(['Observaciones', r.observations]);
    return rows;
  }

  // ─── Tras sellar: el PDF firmado pasa a la sección S2 del papel ────────────
  /**
   * Agrega `signed.pdf` a los adjuntos de la sección S2 (`PaperSection.attachments`). Si el papel no tiene S2, se omite
   * (el acta queda igual en el panel de solicitudes). Es idempotente: si el sellado se repite (p. ej. al aplicar el sello de
   * tiempo después) se actualiza el mismo adjunto en vez de duplicarlo.
   */
  async afterSealed(request: SignatureRequest, signedPdfPath: string, signedPdf: Buffer): Promise<void> {
    const base = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
    if (!base) return;
    const section = await this.prisma.paperSection.findFirst({ where: { paperId: request.targetId, sectionKey: SESSIONS_SECTION } });
    if (!section) {
      this.logger.log(`El papel ${request.targetId} no tiene la sección ${SESSIONS_SECTION}: el acta firmada queda solo en el panel de firma.`);
      return;
    }
    const who = payloadOf((request.payload ?? {}) as Record<string, unknown>).intervieweeName ?? request.signedName ?? request.signerName;
    const encodedPath = signedPdfPath.split('/').map(encodeURIComponent).join('/');
    const attachment = {
      id: `sig_${request.id}`,
      filename: sanitizeFilename(`Acta firmada - ${who}.pdf`),
      url: `${base}/storage/v1/object/public/${STORAGE_BUCKET}/${encodedPath}`,
      mimeType: 'application/pdf',
      size: signedPdf.length,
      uploadedAt: new Date().toISOString(),
      source: 'firma-externa',
      signatureRequestId: request.id,
    };
    const list = (Array.isArray(section.attachments) ? [...(section.attachments as unknown[])] : []) as Array<Record<string, unknown>>;
    const i = list.findIndex((a) => a?.signatureRequestId === request.id);
    if (i >= 0) list[i] = { ...list[i], ...attachment, uploadedAt: list[i].uploadedAt ?? attachment.uploadedAt };
    else list.push(attachment);
    await this.prisma.paperSection.update({ where: { id: section.id }, data: { attachments: list as Prisma.InputJsonValue } });
  }
}
