import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import {
  Client, ClientStatus, EngagementLetter, EngagementLetterStatus, Prisma, Proposal, ProposalStatus, SignatureDocumentType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import { SignatureRequestsService } from '../signatures/signature-requests.service';
import {
  CreateEngagementLetterDto, UpdateEngagementLetterDto, SignEngagementLetterDto, ReportingFramework,
} from './dto/engagement-letter.dto';

const FRAMEWORK_TEXT: Record<ReportingFramework, string> = {
  NIIF_COMPLETAS: 'las Normas Internacionales de Información Financiera (NIIF completas)',
  NIIF_PYMES: 'la Norma Internacional de Información Financiera para Pequeñas y Medianas Entidades (NIIF para las PYMES)',
  OTRO: '',
};

const LETTER_INCLUDE = {
  client:   { select: { id: true, legalName: true, status: true } },
  proposal: { select: { id: true, year: true, status: true, feeAmount: true, feeCurrency: true } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.EngagementLetterInclude;

/** Las transacciones que cierran solicitudes de firma escriben su bitácora: mismo margen que la firma (lección #32). */
const TX_OPTIONS = { timeout: 30_000 } as const;

@Injectable()
export class EngagementLettersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly signatures: SignatureRequestsService,
  ) {}

  private async getLetterOrThrow(id: string, user: AuthUser): Promise<EngagementLetter> {
    const letter = await this.prisma.engagementLetter.findUnique({ where: { id } });
    if (!letter) throw new NotFoundException('Carta de compromiso no encontrada');
    if (letter.organizationId !== user.organizationId) throw new ForbiddenException();
    return letter;
  }

  // ── Crear desde una propuesta aceptada ────────────────────────────────────
  async create(dto: CreateEngagementLetterDto, user: AuthUser) {
    const proposal = await this.prisma.proposal.findUnique({
      where:   { id: dto.proposalId },
      include: { client: true, engagementLetter: { select: { id: true } } },
    });
    if (!proposal) throw new NotFoundException('Propuesta no encontrada');
    if (proposal.organizationId !== user.organizationId) throw new ForbiddenException();

    if (proposal.status !== ProposalStatus.ACCEPTED) {
      throw new BadRequestException(
        `Solo se puede emitir carta de compromiso desde una propuesta ACCEPTED (actual: ${proposal.status}).`,
      );
    }
    if (proposal.engagementLetter) {
      throw new BadRequestException(
        `La propuesta ya tiene una carta de compromiso vinculada (${proposal.engagementLetter.id}).`,
      );
    }
    if (proposal.client.status === ClientStatus.DECLINED) {
      throw new BadRequestException('El cliente fue declinado en la evaluación de aceptación: no se emite carta de compromiso.');
    }

    const framework = dto.reportingFramework === 'OTRO'
      ? (dto.reportingFrameworkOther?.trim() || null)
      : dto.reportingFramework ? FRAMEWORK_TEXT[dto.reportingFramework] : null;

    let letter;
    try {
      letter = await this.prisma.engagementLetter.create({
        data: {
          organizationId: user.organizationId,
          clientId:       proposal.clientId,
          proposalId:     proposal.id,
          year:           proposal.year,
          content:        this.buildNia210Content(proposal, proposal.client, framework),
          status:         EngagementLetterStatus.DRAFT,
          createdById:    user.id,
        },
        include: LETTER_INCLUDE,
      });
    } catch (e) {
      // Dos «Emitir carta» a la vez para la misma propuesta: la segunda choca con la unicidad de la base.
      if ((e as { code?: string })?.code === 'P2002') throw new BadRequestException('La propuesta ya tiene una carta de compromiso vinculada.');
      throw e;
    }

    // El cliente queda a la espera de la firma (único punto del pipeline que produce PENDING_SIGNATURE). Un cliente ya ACTIVO
    // (carta de otro ejercicio) no retrocede: dejaría de poder registrar encargos hasta que se firme.
    await this.prisma.client.updateMany({
      where: { id: proposal.clientId, status: { not: ClientStatus.ACTIVE } },
      data:  { status: ClientStatus.PENDING_SIGNATURE },
    });

    return letter;
  }

  // ── Editar contenido antes de firmar ──────────────────────────────────────
  /**
   * Si el texto cambia, nadie debe firmar algo distinto de lo que se envió (docs/firma-externa-por-enlace.md §11.1):
   * se revoca la solicitud de firma activa ("el documento cambió"), la carta vuelve a BORRADOR y queda el evento
   * TARGET_UPDATED en la bitácora. Una carta rechazada por el cliente también vuelve a borrador al editarla.
   */
  async update(id: string, dto: UpdateEngagementLetterDto, user: AuthUser) {
    const letter = await this.getLetterOrThrow(id, user);
    if (letter.status === EngagementLetterStatus.SIGNED) {
      throw new BadRequestException('No se puede editar una carta ya firmada.');
    }
    const changed = dto.content != null && dto.content !== letter.content;
    if (!changed) {
      return this.prisma.engagementLetter.findUniqueOrThrow({ where: { id }, include: LETTER_INCLUDE });
    }

    return this.prisma.$transaction(async (tx) => {
      await this.signatures.revokeActiveForTarget(tx, {
        organizationId: user.organizationId, documentType: SignatureDocumentType.ENGAGEMENT_LETTER, targetId: id,
        reason: 'El texto de la carta cambió después de enviarla', actorId: user.id,
      });
      // Condicional (revisión F5b, 2026-10-19): si el cliente firmó justo mientras se guardaba, la carta firmada no se pisa.
      const res = await tx.engagementLetter.updateMany({
        where: { id, organizationId: user.organizationId, status: { not: EngagementLetterStatus.SIGNED } },
        data: { content: dto.content, status: EngagementLetterStatus.DRAFT, declineReason: null },
      });
      if (res.count === 0) throw new BadRequestException('No se puede editar una carta ya firmada.');
      return tx.engagementLetter.findUniqueOrThrow({ where: { id }, include: LETTER_INCLUDE });
    }, TX_OPTIONS);
  }

  // ── Firmar ────────────────────────────────────────────────────────────────
  /**
   * Registra la carta como firmada y activa al cliente. Es la ÚNICA transición a SIGNED: la usan la firma manual
   * (carta firmada en papel) y la firma electrónica por enlace (adaptador de la firma), cada una dentro de su transacción.
   */
  async markSigned(
    tx: Prisma.TransactionClient,
    letterId: string,
    organizationId: string,
    by: { name: string; role: string; at: Date; fileUrl?: string },
  ) {
    const letter = await tx.engagementLetter.findFirst({ where: { id: letterId, organizationId } });
    if (!letter) throw new NotFoundException('Carta de compromiso no encontrada');
    if (letter.status === EngagementLetterStatus.SIGNED) {
      throw new BadRequestException('La carta de compromiso ya está firmada.');
    }
    if (letter.status === EngagementLetterStatus.DECLINED) {
      throw new BadRequestException('La carta de compromiso fue rechazada por el cliente; no puede firmarse.');
    }

    const updated = await tx.engagementLetter.update({
      where: { id: letterId },
      data: {
        status:             EngagementLetterStatus.SIGNED,
        signedAt:           by.at,
        signedByClientName: by.name,
        signedByClientRole: by.role,
        ...(by.fileUrl != null && { fileUrl: by.fileUrl }),
      },
      include: LETTER_INCLUDE,
    });

    // Carta firmada ⇒ el prospecto se convierte en cliente activo y ya puede registrar encargos. Un cliente declinado en la evaluación
    // de aceptación NO se reactiva firmando (la decisión del Radar manda); la carta en curso ya se rechazó al decidir en Rojo.
    const reactivated = await tx.client.updateMany({
      where: { id: letter.clientId, status: { not: ClientStatus.DECLINED } },
      data:  { status: ClientStatus.ACTIVE },
    });
    if (reactivated.count === 0) {
      throw new BadRequestException('El cliente fue declinado en la evaluación de aceptación: la carta no puede firmarse.');
    }
    return updated;
  }

  /** Firma MANUAL (respaldo: la carta se firmó en papel). Cierra cualquier solicitud de firma electrónica vigente. */
  async sign(id: string, dto: SignEngagementLetterDto, user: AuthUser) {
    const letter = await this.getLetterOrThrow(id, user);
    if (letter.status === EngagementLetterStatus.SIGNED) {
      throw new BadRequestException('La carta de compromiso ya está firmada.');
    }
    if (letter.status === EngagementLetterStatus.DECLINED) {
      throw new BadRequestException('La carta de compromiso fue rechazada por el cliente; no puede firmarse.');
    }

    return this.prisma.$transaction(async (tx) => {
      // Si había una solicitud por enlace en curso, el cliente ya no debe poder firmar la misma carta otra vez.
      await this.signatures.revokeActiveForTarget(tx, {
        organizationId: user.organizationId, documentType: SignatureDocumentType.ENGAGEMENT_LETTER, targetId: id,
        reason: 'La carta se registró como firmada de forma manual', actorId: user.id,
      });
      return this.markSigned(tx, id, user.organizationId, {
        name: dto.signedByClientName, role: dto.signedByClientRole, at: new Date(), fileUrl: dto.fileUrl,
      });
    }, TX_OPTIONS);
  }

  // ── Texto base NIA 210 ────────────────────────────────────────────────────
  /**
   * Redacta el contenido inicial de la carta a partir de la propuesta aceptada.
   * Es editable después vía PATCH — aquí solo se deja un texto de arranque
   * conforme a NIA 210 (Acuerdo de los términos del encargo de auditoría).
   */
  private buildNia210Content(proposal: Proposal, client: Client, framework: string | null): string {
    const fee = proposal.feeAmount == null
      ? '[honorarios a definir]'
      : `${proposal.feeCurrency} ${Number(proposal.feeAmount).toLocaleString('es-SV', {
          minimumFractionDigits: 2, maximumFractionDigits: 2,
        })}`;

    const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
    // El ejercicio es el que se audita (el año en que cierra el período), no el año en que se emite la carta.
    const fiscalYear = proposal.fiscalPeriodEnd?.getUTCFullYear() ?? proposal.year;
    const marco = framework
      ? `de conformidad con ${framework}`
      : 'de conformidad con el marco de información financiera aplicable [IDENTIFICAR EL MARCO: NIIF completas / NIIF para las PYMES / otro — NIA 210.6(a)]';
    const start = iso(proposal.fiscalPeriodStart);
    const end   = iso(proposal.fiscalPeriodEnd);
    const periodo = start && end
      ? `el período comprendido del ${start} al ${end}`
      : end
        ? `el ejercicio terminado el ${end}`
        : `el ejercicio ${fiscalYear}`;

    const alcance = proposal.scope
      ?? 'la auditoría de los estados financieros de propósito general (Balance General, Estado de Resultados, '
       + 'Estado de Cambios en el Patrimonio y Estado de Flujos de Efectivo) junto con sus notas explicativas';

    return `CARTA DE COMPROMISO DE AUDITORÍA
(NIA 210 — Acuerdo de los términos del encargo de auditoría)

Señores
${client.legalName}
${client.address ?? '[dirección]'}
Atención: ${client.legalRepName ?? client.contactName ?? '[representante legal]'}

Estimados señores:

La presente carta confirma nuestro entendimiento y acuerdo sobre los términos del encargo de auditoría de los estados financieros de ${client.legalName} correspondientes a ${periodo}, y tiene su origen en la propuesta de servicios profesionales aceptada por ustedes.

1. OBJETIVO Y ALCANCE DE LA AUDITORÍA
Hemos sido contratados para realizar ${alcance}. El objetivo de la auditoría es expresar una opinión independiente sobre si dichos estados financieros presentan razonablemente, en todos los aspectos materiales, la situación financiera, el rendimiento financiero y los flujos de efectivo de la entidad, ${marco}.

2. RESPONSABILIDADES DEL AUDITOR
Realizaremos la auditoría de conformidad con las Normas Internacionales de Auditoría (NIA) adoptadas por el Consejo de Vigilancia de la Profesión de Contaduría Pública y Auditoría. Dichas normas exigen que cumplamos los requerimientos de ética aplicables y que planifiquemos y ejecutemos la auditoría con el fin de obtener una seguridad razonable de que los estados financieros están libres de incorrección material.

Debido a las limitaciones inherentes a la auditoría, junto con las limitaciones inherentes al control interno, existe un riesgo inevitable de que puedan no detectarse algunas incorrecciones materiales, aun cuando la auditoría se planifique y ejecute adecuadamente conforme a las NIA.

3. RESPONSABILIDADES DE LA ADMINISTRACIÓN
La administración es responsable de:
a) La preparación y presentación razonable de los estados financieros ${marco.replace('de conformidad con', 'conforme a')}.
b) El control interno que la administración considere necesario para permitir la preparación de estados financieros libres de incorrección material, debida a fraude o error.
c) Proporcionarnos acceso irrestricto a toda la información relevante (registros, documentación y demás material), la información adicional que solicitemos y el acceso sin restricción a las personas de la entidad de las cuales consideremos necesario obtener evidencia de auditoría.
d) Confirmar por escrito, mediante carta de representación al cierre del encargo, las manifestaciones efectuadas durante la auditoría.

4. INFORMES A EMITIR
Como resultado del encargo emitiremos: (i) el dictamen del auditor independiente sobre los estados financieros; (ii) la carta a la gerencia con las deficiencias de control interno identificadas (NIA 265); y (iii) las comunicaciones con los encargados del gobierno de la entidad que resulten aplicables (NIA 260). La forma y el contenido de nuestro informe podrán requerir modificación en función de los hallazgos del trabajo.

5. HONORARIOS
Nuestros honorarios profesionales ascienden a ${fee}, más los impuestos que correspondan. Los honorarios se han determinado con base en el tiempo estimado del equipo asignado y en el alcance descrito en el numeral 1; cambios materiales en el alcance, en el volumen de operaciones o en la disponibilidad de la información podrán dar lugar a una revisión de los mismos, la cual se comunicará y acordará previamente.

6. VIGENCIA
Esta carta será efectiva para el ejercicio ${fiscalYear} y para ejercicios sucesivos, salvo que sea sustituida, modificada o terminada por acuerdo de las partes.

Agradecemos firmar y devolver la copia adjunta de esta carta como constancia de su conformidad con los términos del encargo.

Atentamente,

_______________________________
Socio de Encargo

Aceptado en nombre de ${client.legalName}:

Nombre: _______________________________
Cargo:  _______________________________
Fecha:  _______________________________`;
  }
}
