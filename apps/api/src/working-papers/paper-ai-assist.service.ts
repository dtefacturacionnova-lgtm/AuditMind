import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { AuthUser } from '../auth/jwt.strategy';
import { INVESTIGATION_SELECT, assertInvestigationAccess } from '../common/utils/investigation-scope.util';
import {
  BUDGETS, assessPaperContext, buildPaperBrief, buildRagBlock, insufficientMessage, loadPaperAiInput, ragBaseFor, ragQueryFor,
} from './paper-ai-context';

export interface ImproveTextInput {
  paperId?: string;
  text: string;
  fieldType?: string;
  paperTitle?: string;
  paperType?: string;
}

export interface DraftProcedureInput {
  paperId?: string;
  title?: string;
  statement?: string;
  paperTitle?: string;
  paperType?: string;
  paperCode?: string;
  auditType?: string;
}

/** Cuando la IA no tiene con qué proponer algo específico del papel, lo dice: la pantalla muestra `message`. */
export interface InsufficientContextReply {
  insufficientContext: true;
  message: string;
  missing: string[];
}

/**
 * Botones de IA de los procedimientos de un papel: «Mejorar redacción» (varita) y «Borrador del desarrollo» (chispa).
 * Antes recibían solo lo que el navegador mandaba (título y tipo del papel). Ahora, con `paperId`, el servidor arma la ficha del papel
 * y del encargo (`paper-ai-context.ts`), valida acceso por organización y modo investigación, y la pasa al servicio de IA.
 * Sin `paperId` (pantallas antiguas durante un despliegue) se comportan como antes.
 */
@Injectable()
export class PaperAiAssistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
  ) {}

  private async assertPaperAccess(paperId: string, user: AuthUser): Promise<void> {
    const wp = await this.prisma.workingPaper.findUnique({
      where: { id: paperId },
      select: { audit: { select: { organizationId: true, ...INVESTIGATION_SELECT } } },
    });
    if (!wp) throw new NotFoundException('Papel de trabajo no encontrado');
    if (wp.audit.organizationId !== user.organizationId) throw new ForbiddenException();
    assertInvestigationAccess(wp.audit, user);
  }

  /** Mejorar redacción: el texto del auditor ya es el contenido, así que NO se exige contexto mínimo; la ficha (ligera) solo fija terminología. */
  async improveText(input: ImproveTextInput, user: AuthUser): Promise<unknown> {
    if (!input.paperId) return this.aiService.improveProcedureText({ ...input });

    await this.assertPaperAccess(input.paperId, user);
    const ctx = await loadPaperAiInput(this.prisma, input.paperId);
    if (!ctx) throw new NotFoundException('Papel de trabajo no encontrado');

    const { paperId: _omit, ...rest } = input;
    return this.aiService.improveProcedureText({
      ...rest,
      paperTitle: ctx.paper.title,
      paperType: ctx.audit.type ?? rest.paperType,
      contextBrief: buildPaperBrief(ctx, BUDGETS.ligero),
    });
  }

  /** Borrador del desarrollo: ficha estándar + normativa del marco del encargo; si el papel no da para algo específico, no llama a la IA. */
  async draftProcedure(input: DraftProcedureInput, user: AuthUser): Promise<unknown | InsufficientContextReply> {
    if (!input.paperId) return this.aiService.draftProcedure({ ...input });

    await this.assertPaperAccess(input.paperId, user);
    const ctx = await loadPaperAiInput(this.prisma, input.paperId);
    if (!ctx) throw new NotFoundException('Papel de trabajo no encontrado');

    const check = assessPaperContext(ctx);
    if (!check.enough) {
      return { insufficientContext: true, message: insufficientMessage(check.missing), missing: check.missing } satisfies InsufficientContextReply;
    }

    let ragBlock = '';
    const base = ragBaseFor(ctx.audit.type);
    if (base) {
      const hits = await this.aiService.searchRag(ragQueryFor([ctx.paper.title, input.title, input.statement]), [base], 3);
      ragBlock = buildRagBlock(hits);
    }

    const { paperId: _omit, ...rest } = input;
    return this.aiService.draftProcedure({
      ...rest,
      paperTitle: ctx.paper.title,
      paperCode: ctx.paper.code ?? rest.paperCode,
      paperType: ctx.audit.type ?? rest.paperType,
      auditType: ctx.audit.type ?? rest.auditType,
      contextBrief: buildPaperBrief(ctx, BUDGETS.estandar),
      ragBlock,
    });
  }
}
