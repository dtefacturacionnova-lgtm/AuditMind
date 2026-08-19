import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import {
  Client, ClientStatus, EngagementLetter, EngagementLetterStatus, Prisma, Proposal, ProposalStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import {
  CreateEngagementLetterDto, UpdateEngagementLetterDto, SignEngagementLetterDto,
} from './dto/engagement-letter.dto';

const LETTER_INCLUDE = {
  client:   { select: { id: true, legalName: true, status: true } },
  proposal: { select: { id: true, year: true, status: true, feeAmount: true, feeCurrency: true } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.EngagementLetterInclude;

@Injectable()
export class EngagementLettersService {
  constructor(private readonly prisma: PrismaService) {}

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

    const letter = await this.prisma.engagementLetter.create({
      data: {
        organizationId: user.organizationId,
        clientId:       proposal.clientId,
        proposalId:     proposal.id,
        year:           proposal.year,
        content:        this.buildNia210Content(proposal, proposal.client),
        status:         EngagementLetterStatus.DRAFT,
        createdById:    user.id,
      },
      include: LETTER_INCLUDE,
    });

    // El cliente queda a la espera de la firma. Es el único punto del pipeline
    // que produce ClientStatus.PENDING_SIGNATURE.
    await this.prisma.client.update({
      where: { id: proposal.clientId },
      data:  { status: ClientStatus.PENDING_SIGNATURE },
    });

    return letter;
  }

  // ── Editar contenido antes de firmar ──────────────────────────────────────
  async update(id: string, dto: UpdateEngagementLetterDto, user: AuthUser) {
    const letter = await this.getLetterOrThrow(id, user);
    if (letter.status === EngagementLetterStatus.SIGNED) {
      throw new BadRequestException('No se puede editar una carta ya firmada.');
    }

    return this.prisma.engagementLetter.update({
      where: { id },
      data:  { ...(dto.content != null && { content: dto.content }) },
      include: LETTER_INCLUDE,
    });
  }

  // ── Firmar ────────────────────────────────────────────────────────────────
  async sign(id: string, dto: SignEngagementLetterDto, user: AuthUser) {
    const letter = await this.getLetterOrThrow(id, user);
    if (letter.status === EngagementLetterStatus.SIGNED) {
      throw new BadRequestException('La carta de compromiso ya está firmada.');
    }
    if (letter.status === EngagementLetterStatus.DECLINED) {
      throw new BadRequestException('La carta de compromiso fue rechazada por el cliente; no puede firmarse.');
    }

    const updated = await this.prisma.engagementLetter.update({
      where: { id },
      data: {
        status:             EngagementLetterStatus.SIGNED,
        signedAt:           new Date(),
        signedByClientName: dto.signedByClientName,
        signedByClientRole: dto.signedByClientRole,
        ...(dto.fileUrl != null && { fileUrl: dto.fileUrl }),
      },
      include: LETTER_INCLUDE,
    });

    // Carta firmada ⇒ el prospecto se convierte en cliente activo y ya puede
    // registrar encargos.
    await this.prisma.client.update({
      where: { id: letter.clientId },
      data:  { status: ClientStatus.ACTIVE },
    });

    return updated;
  }

  // ── Texto base NIA 210 ────────────────────────────────────────────────────
  /**
   * Redacta el contenido inicial de la carta a partir de la propuesta aceptada.
   * Es editable después vía PATCH — aquí solo se deja un texto de arranque
   * conforme a NIA 210 (Acuerdo de los términos del encargo de auditoría).
   */
  private buildNia210Content(proposal: Proposal, client: Client): string {
    const fee = proposal.feeAmount == null
      ? '[honorarios a definir]'
      : `${proposal.feeCurrency} ${Number(proposal.feeAmount).toLocaleString('es-SV', {
          minimumFractionDigits: 2, maximumFractionDigits: 2,
        })}`;

    const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
    const start = iso(proposal.fiscalPeriodStart);
    const end   = iso(proposal.fiscalPeriodEnd);
    const periodo = start && end
      ? `el período comprendido del ${start} al ${end}`
      : end
        ? `el ejercicio terminado el ${end}`
        : `el ejercicio ${proposal.year}`;

    const alcance = proposal.scope
      ?? 'la auditoría de los estados financieros de propósito general (Balance General, Estado de Resultados, '
       + 'Estado de Cambios en el Patrimonio y Estado de Flujos de Efectivo) junto con sus notas explicativas';

    return `CARTA DE COMPROMISO DE AUDITORÍA
(NIA 210 — Acuerdo de los términos del encargo de auditoría)

Señores
${client.legalName}
${client.address ?? '[dirección]'}
Atención: ${client.contactName ?? '[representante legal]'}

Estimados señores:

La presente carta confirma nuestro entendimiento y acuerdo sobre los términos del encargo de auditoría de los estados financieros de ${client.legalName} correspondientes a ${periodo}, y tiene su origen en la propuesta de servicios profesionales aceptada por ustedes.

1. OBJETIVO Y ALCANCE DE LA AUDITORÍA
Hemos sido contratados para realizar ${alcance}. El objetivo de la auditoría es expresar una opinión independiente sobre si dichos estados financieros presentan razonablemente, en todos los aspectos materiales, la situación financiera, el rendimiento financiero y los flujos de efectivo de la entidad, de conformidad con el marco de información financiera aplicable.

2. RESPONSABILIDADES DEL AUDITOR
Realizaremos la auditoría de conformidad con las Normas Internacionales de Auditoría (NIA) adoptadas por el Consejo de Vigilancia de la Profesión de Contaduría Pública y Auditoría. Dichas normas exigen que cumplamos los requerimientos de ética aplicables y que planifiquemos y ejecutemos la auditoría con el fin de obtener una seguridad razonable de que los estados financieros están libres de incorrección material.

Debido a las limitaciones inherentes a la auditoría, junto con las limitaciones inherentes al control interno, existe un riesgo inevitable de que puedan no detectarse algunas incorrecciones materiales, aun cuando la auditoría se planifique y ejecute adecuadamente conforme a las NIA.

3. RESPONSABILIDADES DE LA ADMINISTRACIÓN
La administración es responsable de:
a) La preparación y presentación razonable de los estados financieros conforme al marco de información financiera aplicable.
b) El control interno que la administración considere necesario para permitir la preparación de estados financieros libres de incorrección material, debida a fraude o error.
c) Proporcionarnos acceso irrestricto a toda la información relevante (registros, documentación y demás material), la información adicional que solicitemos y el acceso sin restricción a las personas de la entidad de las cuales consideremos necesario obtener evidencia de auditoría.
d) Confirmar por escrito, mediante carta de representación al cierre del encargo, las manifestaciones efectuadas durante la auditoría.

4. INFORMES A EMITIR
Como resultado del encargo emitiremos: (i) el dictamen del auditor independiente sobre los estados financieros; (ii) la carta a la gerencia con las deficiencias de control interno identificadas (NIA 265); y (iii) las comunicaciones con los encargados del gobierno de la entidad que resulten aplicables (NIA 260). La forma y el contenido de nuestro informe podrán requerir modificación en función de los hallazgos del trabajo.

5. HONORARIOS
Nuestros honorarios profesionales ascienden a ${fee}, más los impuestos que correspondan. Los honorarios se han determinado con base en el tiempo estimado del equipo asignado y en el alcance descrito en el numeral 1; cambios materiales en el alcance, en el volumen de operaciones o en la disponibilidad de la información podrán dar lugar a una revisión de los mismos, la cual se comunicará y acordará previamente.

6. VIGENCIA
Esta carta será efectiva para el ejercicio ${proposal.year} y para ejercicios sucesivos, salvo que sea sustituida, modificada o terminada por acuerdo de las partes.

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
