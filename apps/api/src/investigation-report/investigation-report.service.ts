import {
  Injectable, Logger, NotFoundException, BadRequestException, ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import { AiService } from '../ai/ai.service';
import { FieldEvidenceService } from '../working-papers/field-evidence/field-evidence.service';
import { InvestigationGraphService } from '../investigation-graph/investigation-graph.service';
import { AuditInvestigationAccessService } from './audit-investigation-access.service';
import { CaatsHistoryService } from './caats-history.service';
import { FieldType } from '@prisma/client';

// Investigador Forense — SHERLOCK (Fase 2b, núcleo mínimo).
// docs/investigador-forense-multimodal-propuesta.md — orquestador determinista
// (molde ConnectorImport/ImportStatus): iniciar() valida y dispara ejecutar()
// fire-and-forget, el cliente hace polling a GET .../investigation-report/:id.
@Injectable()
export class InvestigationReportService {
  private readonly logger = new Logger(InvestigationReportService.name);

  // Tope del grafo enviado al LLM (decisión de diseño — el truncamiento vive
  // aquí, no en ai-service, porque NestJS ya tiene el grafo completo en
  // memoria vía getAuditGraph()). Prioriza lo ya confirmado por el auditor y
  // lo más mencionado — nunca silencioso, ver notaTruncamiento en el resultado.
  private static readonly MAX_NODES = 300;
  private static readonly MAX_EDGES = 500;

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly fieldEvidenceService: FieldEvidenceService,
    private readonly investigationGraphService: InvestigationGraphService,
    private readonly access: AuditInvestigationAccessService,
    private readonly caatsHistoryService: CaatsHistoryService,
  ) {}

  async iniciar(auditId: string, objetivo: string, user: AuthUser) {
    const audit = await this.access.assertAccess(auditId, user);
    if (!audit.isInvestigationMode) {
      throw new BadRequestException(
        'Esta auditoría no está en Modo Investigación — actívelo en la configuración del encargo antes de generar un informe de SHERLOCK.',
      );
    }
    if (!objetivo?.trim()) {
      throw new BadRequestException('El objetivo del análisis es obligatorio.');
    }

    const yaCorriendo = await this.prisma.investigationReport.findFirst({
      where: { auditId, status: 'RUNNING' },
    });
    if (yaCorriendo) {
      throw new ConflictException('Ya hay un informe en curso para este encargo — espere a que termine.');
    }

    const graph = await this.investigationGraphService.getAuditGraph(auditId, user);
    const notas = await this.fieldEvidenceService.listarContextoInvestigador(auditId, user);
    if (graph.nodes.length === 0 && notas.length === 0) {
      throw new BadRequestException('No hay evidencia en el grafo ni contexto previo capturado — no hay nada que investigar.');
    }

    const report = await this.prisma.investigationReport.create({
      data: { auditId, objetivo: objetivo.trim(), status: 'RUNNING', requestedById: user.id },
    });

    this.ejecutar(report.id, auditId, audit.title, objetivo.trim(), graph, notas).catch(err =>
      this.logger.error(`Fallo generando informe ${report.id}: ${err.message}`, err.stack),
    );

    return report;
  }

  async listar(auditId: string, user: AuthUser) {
    await this.access.assertAccess(auditId, user);
    return this.prisma.investigationReport.findMany({
      where:   { auditId },
      orderBy: { startedAt: 'desc' },
    });
  }

  async obtenerUno(auditId: string, reportId: string, user: AuthUser) {
    await this.access.assertAccess(auditId, user);
    const report = await this.prisma.investigationReport.findUnique({ where: { id: reportId } });
    if (!report || report.auditId !== auditId) throw new NotFoundException('Informe no encontrado');
    return report;
  }

  // ─── Contexto previo del auditor — delega en FieldEvidenceService ────────

  crearContexto(auditId: string, dto: { kind: 'TEXT_NOTE' | 'AUDIO_NOTE'; capturedAt: string; texto?: string }, file: { buffer: Buffer; originalname: string; mimetype: string; size: number } | undefined, user: AuthUser) {
    return this.fieldEvidenceService.crearContextoInvestigador(auditId, dto as never, file, user);
  }

  listarContexto(auditId: string, user: AuthUser) {
    return this.fieldEvidenceService.listarContextoInvestigador(auditId, user);
  }

  eliminarContexto(auditId: string, evidenceId: string, user: AuthUser) {
    return this.fieldEvidenceService.eliminarContextoInvestigador(auditId, evidenceId, user);
  }

  // ─── Orquestación (fire-and-forget) ───────────────────────────────────────

  private async ejecutar(
    reportId: string,
    auditId: string,
    auditTitle: string,
    objetivo: string,
    graph: Awaited<ReturnType<InvestigationGraphService['getAuditGraph']>>,
    notas: Awaited<ReturnType<FieldEvidenceService['listarContextoInvestigador']>>,
  ) {
    try {
      const { nodes, edges, truncado, totalEntidadesTotales } = this.truncarGrafo(graph);
      const { texto: contextoTexto, usedIds: contextoEvidenceIds, excluidas: fuentesContextoExcluidas } =
        this.construirContextoAuditorTexto(notas);

      // Fase 2c — fuentes suplementarias (nunca sustituyen el razonamiento
      // sobre el grafo, ver REGLA DE FUENTES SUPLEMENTARIAS en investigation.py).
      // Se calculan una sola vez aquí, no se refetchean en ningún otro punto
      // de este flujo.
      const caatsHistoria = await this.caatsHistoryService.getHistoryUnchecked(auditId);
      const caatsResults = this.caatsHistoryService.summarizeForSherlock(caatsHistoria);
      const paperSearchHits = await this.buscarExtractosRelevantes(auditId, objetivo, contextoTexto);

      const resultado = await this.aiService.runInvestigationAnalysis({
        audit_title: auditTitle,
        objetivo,
        nodes,
        edges,
        contexto_auditor_texto: contextoTexto ?? undefined,
        grafo_truncado: truncado,
        total_entidades_totales: totalEntidadesTotales,
        caats_results: caatsResults,
        paper_search_hits: paperSearchHits,
      });

      // Defensa en profundidad — mismo espíritu que validadaCita en
      // field-evidence.service.ts, aplicado aquí a citas ya seleccionadas por
      // el modelo (no extraídas de texto crudo): nunca se descarta un hallazgo
      // por esto, solo se marca para que el auditor lo vea con esa salvedad.
      const citasEnviadas = new Set<string>([
        ...nodes.flatMap(n => n.mentions.map(m => this.normalizar(m.cita_textual))),
        ...edges.map(e => this.normalizar(e.cita_textual)),
      ]);
      const marcarGrupo = (grupos: typeof resultado.hallazgos_objetivo) =>
        grupos.map(g => ({
          ...g,
          hallazgos: g.hallazgos.map(h => ({
            ...h,
            citaVerificada: citasEnviadas.has(this.normalizar(h.cita_textual)),
          })),
        }));
      const verificacionContexto = resultado.verificacion_contexto.map(c => ({
        ...c,
        citasVerificadas: c.citas_relevantes.map(cita => citasEnviadas.has(this.normalizar(cita))),
      }));

      const fuentesNoValidadas = await this.prisma.fieldEvidence.findMany({
        where:  { auditId, calidadBaja: true },
        select: { id: true, filename: true, calidadMotivo: true },
      });

      const result = {
        conclusionGeneral:       resultado.conclusion_general,
        hallazgosObjetivo:       marcarGrupo(resultado.hallazgos_objetivo),
        otrasBanderas:           marcarGrupo(resultado.otras_banderas),
        verificacionContexto,
        fuentesNoValidadas:      fuentesNoValidadas.map(f => ({ evidenceId: f.id, filename: f.filename, motivo: f.calidadMotivo })),
        contextoEvidenceIds,
        fuentesContextoExcluidas,
        claimsExtraidos:         resultado.claims_extraidos,
        grafoTruncado:           truncado,
        notaTruncamiento:        truncado
          ? `Se incluyeron ${nodes.length} de ${totalEntidadesTotales} entidades totales de esta auditoría (y sus relaciones asociadas).`
          : null,
        totalEntidadesIncluidas: nodes.length,
        totalEntidadesTotales,
        modelo:       resultado.modelo,
        inputTokens:  resultado.input_tokens,
        outputTokens: resultado.output_tokens,
      };

      await this.prisma.investigationReport.update({
        where: { id: reportId },
        data:  { status: 'COMPLETED', result: result as unknown as Prisma.InputJsonValue, completedAt: new Date() },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Informe de investigación ${reportId} falló: ${message}`);
      await this.prisma.investigationReport.update({
        where: { id: reportId },
        data:  { status: 'FAILED', errorMsg: message, completedAt: new Date() },
      });
    }
  }

  // Prioriza lo ya confirmado por el auditor (mismo campo que ya distingue
  // "sugerido por IA" de "confirmado" en el tab del grafo), luego lo más
  // mencionado/con más relaciones — nunca descarta silenciosamente: el
  // truncamiento queda explícito en notaTruncamiento del resultado.
  private truncarGrafo(
    graph: Awaited<ReturnType<InvestigationGraphService['getAuditGraph']>>,
  ): {
    nodes: {
      id: string; tipo: string; nombre: string; mention_count: number;
      mentions: { cita_textual: string; validada_cita: boolean; evidence_kind: string; confirmado_por_auditor: boolean }[];
    }[];
    edges: {
      id: string; source_id: string; target_id: string; tipo: string;
      cita_textual: string; validada_cita: boolean; confianza: number; confirmado_por_auditor: boolean;
    }[];
    truncado: boolean;
    totalEntidadesTotales: number;
  } {
    const totalEntidadesTotales = graph.nodes.length;
    const truncadoNodos = graph.nodes.length > InvestigationReportService.MAX_NODES;

    const nodesOrdenados = [...graph.nodes].sort((a, b) => {
      const aConfirmado = a.mentions.some(m => m.confirmadoPorAuditor);
      const bConfirmado = b.mentions.some(m => m.confirmadoPorAuditor);
      if (aConfirmado !== bConfirmado) return aConfirmado ? -1 : 1;
      return b.mentionCount - a.mentionCount;
    });
    const nodesIncluidos = nodesOrdenados.slice(0, InvestigationReportService.MAX_NODES);
    const idsIncluidos = new Set(nodesIncluidos.map(n => n.id));

    // Solo aristas entre nodos que sí quedaron incluidos — no manda aristas
    // "colgantes" que referencien un nodo excluido por el tope.
    const edgesElegibles = graph.edges.filter(e => idsIncluidos.has(e.sourceId) && idsIncluidos.has(e.targetId));
    const truncadoEdges = edgesElegibles.length > InvestigationReportService.MAX_EDGES;
    const edgesOrdenados = [...edgesElegibles].sort((a, b) => {
      if (a.confirmadoPorAuditor !== b.confirmadoPorAuditor) return a.confirmadoPorAuditor ? -1 : 1;
      return b.confianza - a.confianza;
    });
    const edgesIncluidos = edgesOrdenados.slice(0, InvestigationReportService.MAX_EDGES);

    return {
      nodes: nodesIncluidos.map(n => ({
        id: n.id, tipo: n.tipo, nombre: n.nombre, mention_count: n.mentionCount,
        mentions: n.mentions.map(m => ({
          cita_textual: m.citaTextual, validada_cita: m.validadaCita,
          evidence_kind: m.evidenceKind, confirmado_por_auditor: m.confirmadoPorAuditor,
        })),
      })),
      edges: edgesIncluidos.map(e => ({
        id: e.id, source_id: e.sourceId, target_id: e.targetId, tipo: e.tipo,
        cita_textual: e.citaTextual, validada_cita: e.validadaCita, confianza: e.confianza,
        confirmado_por_auditor: e.confirmadoPorAuditor,
      })),
      truncado: truncadoNodos || truncadoEdges,
      totalEntidadesTotales,
    };
  }

  // Concatena las notas de contexto ya READY (texto directo o transcript.texto
  // de una nota de voz) — nunca descarta silenciosamente una nota que no pudo
  // procesarse; queda registrada en `excluidas` para que el resultado final la
  // reporte (mismo principio de "fuentes no validadas" ya establecido en Fase 2a).
  private construirContextoAuditorTexto(
    notas: { id: string; kind: string; status: string; textoOriginal: string | null; transcript: unknown; errorMsg: string | null }[],
  ): { texto: string | null; usedIds: string[]; excluidas: { evidenceId: string; motivo: string }[] } {
    const partes: string[] = [];
    const usedIds: string[] = [];
    const excluidas: { evidenceId: string; motivo: string }[] = [];

    for (const nota of notas) {
      if (nota.status !== 'READY') {
        excluidas.push({
          evidenceId: nota.id,
          motivo: nota.status === 'FAILED'
            ? `No se pudo procesar (${nota.errorMsg ?? 'error desconocido'})`
            : 'Aún transcribiéndose — no se incluyó en este informe',
        });
        continue;
      }
      const texto = nota.kind === 'TEXT_NOTE'
        ? nota.textoOriginal
        : (nota.transcript as { texto?: string } | null)?.texto;
      if (!texto?.trim()) continue;
      partes.push(texto.trim());
      usedIds.push(nota.id);
    }

    return { texto: partes.length ? partes.join('\n\n') : null, usedIds, excluidas };
  }

  // Fase 2c — búsqueda simple entre papeles: sin LLM, sin ranking semántico.
  // Tokeniza objetivo+contexto en palabras de ≥4 letras y puntúa cada sección
  // por cuántos términos contiene, tomando las 10 mejores con score > 0.
  // Excluye CAATS_ANALYSIS (esas ya viajan por separado como caatsResults,
  // vía caatsHistoryService — evita duplicar la misma fuente dos veces en
  // el prompt).
  private async buscarExtractosRelevantes(
    auditId: string,
    objetivo: string,
    contextoTexto: string | null,
  ): Promise<{ paper_code: string | null; paper_title: string; section_label: string; extracto: string }[]> {
    const secciones = await this.prisma.paperSection.findMany({
      where:  { paper: { auditId }, fieldType: { not: FieldType.CAATS_ANALYSIS } },
      select: { label: true, value: true, paper: { select: { paperCode: true, title: true } } },
      take: 500,
    });

    const terminos = new Set(
      `${objetivo} ${contextoTexto ?? ''}`.toLowerCase().match(/[a-záéíóúñ]{4,}/g) ?? [],
    );
    if (terminos.size === 0) return [];

    const puntuadas = secciones
      .map(s => {
        const texto = typeof s.value === 'string' ? s.value : JSON.stringify(s.value ?? '');
        const textoLower = texto.toLowerCase();
        const score = [...terminos].filter(t => textoLower.includes(t)).length;
        return { s, score, texto };
      })
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    return puntuadas.map(({ s, texto }) => ({
      paper_code: s.paper.paperCode ?? null,
      paper_title: s.paper.title,
      section_label: s.label,
      extracto: texto.slice(0, 300),
    }));
  }

  private normalizar(texto: string): string {
    return texto.toLowerCase().replace(/\s+/g, ' ').trim();
  }
}
