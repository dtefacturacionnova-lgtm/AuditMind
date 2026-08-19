import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AcceptanceRating, Client, ClientStatus, Prisma, Proposal, ProposalStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import { ClientsService } from './clients.service';
import { CreateProposalDto, UpdateProposalDto } from './dto/proposal.dto';

const PROPOSAL_INCLUDE = {
  client:          { select: { id: true, legalName: true, tradeName: true, status: true } },
  acceptanceCheck: { select: { id: true, year: true, overallResult: true } },
  createdBy:       { select: { id: true, name: true } },
  engagementLetter: { select: { id: true, status: true } },
} satisfies Prisma.ProposalInclude;

/** Ratings del Radar que habilitan emitir propuesta. */
const ACCEPTABLE_RATINGS: AcceptanceRating[] = [AcceptanceRating.GREEN, AcceptanceRating.YELLOW];

@Injectable()
export class ProposalsService {
  private readonly logger = new Logger(ProposalsService.name);

  // Mismo endpoint que usa PaperSectionsService para las sugerencias de secciones.
  private readonly geminiEndpoint =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

  constructor(
    private readonly prisma:  PrismaService,
    private readonly config:  ConfigService,
    private readonly clients: ClientsService,
  ) {}

  private async getProposalOrThrow(id: string, user: AuthUser): Promise<Proposal> {
    const proposal = await this.prisma.proposal.findUnique({ where: { id } });
    if (!proposal) throw new NotFoundException('Propuesta no encontrada');
    if (proposal.organizationId !== user.organizationId) throw new ForbiddenException();
    return proposal;
  }

  // ── Crear propuesta ───────────────────────────────────────────────────────
  /**
   * Puerta NIA 220: no se emite propuesta sin Radar de Aceptación del año en
   * curso decidido en GREEN o YELLOW.
   */
  async create(dto: CreateProposalDto, user: AuthUser) {
    await this.clients.getClientOrThrow(dto.clientId, user);
    const year = new Date().getFullYear();

    const check = await this.prisma.acceptanceCheck.findUnique({
      where: { clientId_year: { clientId: dto.clientId, year } },
    });

    if (!check) {
      throw new BadRequestException(
        `No existe Radar de Aceptación ${year} para este cliente. ` +
        'Ejecute POST /portfolio/clients/:id/start-acceptance y decida el radar antes de emitir la propuesta.',
      );
    }
    if (!ACCEPTABLE_RATINGS.includes(check.overallResult)) {
      throw new BadRequestException(
        `El Radar de Aceptación ${year} no habilita emitir propuesta (resultado: ${check.overallResult}). ` +
        'Se requiere una decisión GREEN o YELLOW.',
      );
    }

    const proposal = await this.prisma.proposal.create({
      data: {
        organizationId:    user.organizationId,
        clientId:          dto.clientId,
        acceptanceCheckId: check.id,
        year,
        createdById:       user.id,
        scope:             dto.scope ?? null,
        fiscalPeriodStart: dto.fiscalPeriodStart ? new Date(dto.fiscalPeriodStart) : null,
        fiscalPeriodEnd:   dto.fiscalPeriodEnd   ? new Date(dto.fiscalPeriodEnd)   : null,
        feeAmount:         dto.feeAmount ?? null,
        ...(dto.feeCurrency && { feeCurrency: dto.feeCurrency }),
        teamJson:          (dto.teamJson ?? undefined) as unknown as Prisma.InputJsonValue | undefined,
        status:            ProposalStatus.DRAFT,
      },
      include: PROPOSAL_INCLUDE,
    });

    await this.prisma.client.update({
      where: { id: dto.clientId },
      data:  { status: ClientStatus.PROPOSAL_IN_PROGRESS },
    });

    return proposal;
  }

  // ── Editar ────────────────────────────────────────────────────────────────
  async update(id: string, dto: UpdateProposalDto, user: AuthUser) {
    const proposal = await this.getProposalOrThrow(id, user);
    if (proposal.status === ProposalStatus.ACCEPTED || proposal.status === ProposalStatus.REJECTED) {
      throw new BadRequestException(
        `No se puede editar una propuesta en estado ${proposal.status}.`,
      );
    }

    return this.prisma.proposal.update({
      where: { id },
      data: {
        ...(dto.scope          != null && { scope:          dto.scope }),
        ...(dto.feeAmount      != null && { feeAmount:      dto.feeAmount }),
        ...(dto.feeCurrency    != null && { feeCurrency:    dto.feeCurrency }),
        ...(dto.finalContent   != null && { finalContent:   dto.finalContent }),
        ...(dto.aiDraftContent != null && { aiDraftContent: dto.aiDraftContent }),
        ...(dto.fiscalPeriodStart != null && { fiscalPeriodStart: new Date(dto.fiscalPeriodStart) }),
        ...(dto.fiscalPeriodEnd   != null && { fiscalPeriodEnd:   new Date(dto.fiscalPeriodEnd) }),
        ...(dto.teamJson != null && { teamJson: dto.teamJson as unknown as Prisma.InputJsonValue }),
      },
      include: PROPOSAL_INCLUDE,
    });
  }

  // ── Transiciones ──────────────────────────────────────────────────────────
  async send(id: string, user: AuthUser) {
    const proposal = await this.getProposalOrThrow(id, user);
    if (proposal.status !== ProposalStatus.DRAFT) {
      throw new BadRequestException(`Solo se puede enviar una propuesta en DRAFT (actual: ${proposal.status}).`);
    }

    return this.prisma.proposal.update({
      where: { id },
      data:  { status: ProposalStatus.SENT, sentAt: new Date() },
      include: PROPOSAL_INCLUDE,
    });
  }

  async accept(id: string, user: AuthUser) {
    const proposal = await this.getProposalOrThrow(id, user);
    if (proposal.status !== ProposalStatus.SENT) {
      throw new BadRequestException(`Solo se puede aceptar una propuesta en SENT (actual: ${proposal.status}).`);
    }

    return this.prisma.proposal.update({
      where: { id },
      data:  { status: ProposalStatus.ACCEPTED, respondedAt: new Date() },
      include: PROPOSAL_INCLUDE,
    });
  }

  async reject(id: string, user: AuthUser) {
    const proposal = await this.getProposalOrThrow(id, user);
    if (proposal.status !== ProposalStatus.SENT) {
      throw new BadRequestException(`Solo se puede rechazar una propuesta en SENT (actual: ${proposal.status}).`);
    }

    const updated = await this.prisma.proposal.update({
      where: { id },
      data:  { status: ProposalStatus.REJECTED, respondedAt: new Date() },
      include: PROPOSAL_INCLUDE,
    });

    // El cliente vuelve a IN_ACCEPTANCE (no a PROSPECT): el Radar del año sigue
    // vigente, así que se puede emitir una propuesta nueva sin repetirlo.
    await this.prisma.client.update({
      where: { id: proposal.clientId },
      data:  { status: ClientStatus.IN_ACCEPTANCE },
    });

    return updated;
  }

  // ── Borrador IA ───────────────────────────────────────────────────────────
  /**
   * Genera `aiDraftContent` con Gemini. NUNCA lanza error por fallo de IA:
   * si no hay GEMINI_API_KEY o la llamada falla, cae a una plantilla de texto
   * razonable — mismo contrato que PaperSectionsService.assistSection().
   */
  async generateDraft(id: string, user: AuthUser) {
    const proposal = await this.getProposalOrThrow(id, user);
    const client = await this.prisma.client.findUnique({ where: { id: proposal.clientId } });
    if (!client) throw new NotFoundException('Cliente de la propuesta no encontrado');

    const { content, usedAI } = await this.generateProposalDraft(proposal, client);

    const updated = await this.prisma.proposal.update({
      where: { id },
      data:  { aiDraftContent: content },
      include: PROPOSAL_INCLUDE,
    });

    return { ...updated, usedAI };
  }

  private async generateProposalDraft(
    proposal: Proposal,
    client: Client,
  ): Promise<{ content: string; usedAI: boolean }> {
    const apiKey = this.config.get<string>('GEMINI_API_KEY', '');

    if (!apiKey) {
      this.logger.warn('[ProposalDraft] GEMINI_API_KEY not set — returning template fallback');
      return { content: this.fallbackDraft(proposal, client), usedAI: false };
    }

    try {
      const text = await this.callGeminiText(apiKey, this.buildDraftPrompt(proposal, client));
      return { content: text, usedAI: true };
    } catch (err) {
      this.logger.error('[ProposalDraft] Gemini failed, using fallback', String(err));
      return { content: this.fallbackDraft(proposal, client), usedAI: false };
    }
  }

  private formatFee(proposal: Proposal): string {
    if (proposal.feeAmount == null) return 'por definir';
    return `${proposal.feeCurrency} ${Number(proposal.feeAmount).toLocaleString('es-SV', {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    })}`;
  }

  private formatPeriod(proposal: Proposal): string {
    const fmt = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
    const start = fmt(proposal.fiscalPeriodStart);
    const end   = fmt(proposal.fiscalPeriodEnd);
    if (start && end) return `del ${start} al ${end}`;
    if (end)   return `ejercicio terminado el ${end}`;
    if (start) return `a partir del ${start}`;
    return `ejercicio ${proposal.year}`;
  }

  private buildDraftPrompt(proposal: Proposal, client: Client): string {
    const team = Array.isArray(proposal.teamJson)
      ? (proposal.teamJson as Array<{ name?: string; role?: string; hours?: number }>)
          .map(m => `  - ${m.name ?? 'Sin nombre'}${m.role ? ` (${m.role})` : ''}${m.hours ? ` — ${m.hours} h` : ''}`)
          .join('\n')
      : '';

    return `Eres un socio de auditoría de una firma de contadores públicos autorizados en El Salvador.
Redacta una PROPUESTA DE SERVICIOS PROFESIONALES de auditoría externa de estados financieros, en español, formal, lista para enviar al cliente.

DATOS DEL ENCARGO
- Cliente (razón social): ${client.legalName}
- Nombre comercial: ${client.tradeName ?? 'N/A'}
- NIT / Tax ID: ${client.taxId ?? 'N/A'}
- Sector / industria: ${client.industry ?? 'No especificado'}
- Contacto: ${client.contactName ?? 'N/A'}${client.contactEmail ? ` <${client.contactEmail}>` : ''}
- Año de la propuesta: ${proposal.year}
- Período a auditar: ${this.formatPeriod(proposal)}
- Alcance indicado por el socio: ${proposal.scope ?? 'Auditoría de estados financieros de propósito general'}
- Honorarios: ${this.formatFee(proposal)}
${team ? `- Equipo propuesto:\n${team}` : ''}

ESTRUCTURA REQUERIDA (usa estos encabezados, en este orden)
1. Antecedentes y entendimiento de la entidad
2. Objetivo del encargo
3. Alcance de los servicios
4. Marco normativo aplicable (NIA e IFRS/NIIF para PYMES adoptadas por el CVPCPA)
5. Responsabilidades de la administración y del auditor (NIA 200 / NIA 210)
6. Equipo asignado
7. Cronograma tentativo
8. Honorarios y forma de pago
9. Entregables (dictamen, carta a la gerencia, informes complementarios)
10. Vigencia de la propuesta

REGLAS
- Escribe en español profesional de auditoría, sin markdown de encabezados con almohadillas: usa numeración y texto plano con saltos de línea.
- NO inventes datos que no estén arriba (montos, nombres, fechas específicas, número de empleados). Si falta un dato, escribe "[a definir]".
- Máximo 900 palabras.
- No incluyas comentarios sobre este prompt ni notas del asistente: devuelve únicamente el texto de la propuesta.`;
  }

  private async callGeminiText(apiKey: string, prompt: string): Promise<string> {
    const res = await fetch(`${this.geminiEndpoint}?key=${apiKey}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.35, maxOutputTokens: 2400 },
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Gemini HTTP ${res.status}: ${errBody.slice(0, 200)}`);
    }

    const data = await res.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      error?: { message: string };
    };

    if (data.error) throw new Error(`Gemini error: ${data.error.message}`);
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    if (!text.trim()) throw new Error('Gemini returned empty text');
    return text.trim();
  }

  private fallbackDraft(proposal: Proposal, client: Client): string {
    return `PROPUESTA DE SERVICIOS PROFESIONALES DE AUDITORÍA EXTERNA
Cliente: ${client.legalName}${client.tradeName ? ` (${client.tradeName})` : ''}
NIT / Tax ID: ${client.taxId ?? '[a definir]'}
Ejercicio: ${proposal.year} — período ${this.formatPeriod(proposal)}

1. ANTECEDENTES
${client.legalName} opera en el sector ${client.industry ?? '[a definir]'}. La presente propuesta responde a la solicitud de servicios de auditoría externa de sus estados financieros.

2. OBJETIVO
Expresar una opinión independiente sobre si los estados financieros presentan razonablemente, en todos los aspectos materiales, la situación financiera, el rendimiento financiero y los flujos de efectivo de la entidad, de conformidad con el marco de información financiera aplicable.

3. ALCANCE
${proposal.scope ?? 'Auditoría de los estados financieros de propósito general (Balance General, Estado de Resultados, Estado de Cambios en el Patrimonio y Estado de Flujos de Efectivo) con sus notas explicativas.'}

4. MARCO NORMATIVO
El encargo se ejecutará conforme a las Normas Internacionales de Auditoría (NIA) adoptadas por el Consejo de Vigilancia de la Profesión de Contaduría Pública y Auditoría (CVPCPA), y las NIIF / NIIF para las PYMES según corresponda.

5. RESPONSABILIDADES (NIA 200 / NIA 210)
La administración es responsable de la preparación y presentación razonable de los estados financieros y del control interno necesario para que estén libres de incorrección material. El auditor es responsable de obtener seguridad razonable y emitir un informe con su opinión.

6. EQUIPO ASIGNADO
[a definir — socio de encargo, gerente, auditor senior y asistentes]

7. CRONOGRAMA TENTATIVO
[a definir — planificación, ejecución de campo, revisión y emisión del dictamen]

8. HONORARIOS
Honorarios profesionales: ${this.formatFee(proposal)}. Forma de pago: [a definir].

9. ENTREGABLES
Dictamen del auditor independiente, carta a la gerencia sobre control interno y comunicaciones a los encargados del gobierno de la entidad (NIA 260 / NIA 265).

10. VIGENCIA
La presente propuesta tiene vigencia de 30 días calendario a partir de su fecha de emisión.

—
[Borrador de plantilla — asistente IA no disponible. Configure GEMINI_API_KEY para generar el borrador contextual, o edite este texto y guárdelo en finalContent.]`;
  }
}
