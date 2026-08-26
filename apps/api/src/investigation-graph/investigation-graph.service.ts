import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { GraphEntityType, GraphRelationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';

interface EntidadEstructuradaInput {
  nombre: string;
  tipo: string;
  cita_textual: string;
}

interface RelacionEstructuradaInput {
  entidad_origen: string;
  entidad_destino: string;
  tipo: string;
  cita_textual: string;
  confianza: number;
}

// ─── Grafo de Evidencia — Fase 1 (docs/investigador-forense-multimodal-propuesta.md) ─
// Construido SOLO sobre FieldEvidence — CAATs se integra en Fase 2. Ontología fija
// (6 tipos de entidad, 4 de relación), dedup por nombre normalizado exacto (sin
// fuzzy/semántico — limitación conocida y deliberada de esta fase).
@Injectable()
export class InvestigationGraphService {
  private readonly logger = new Logger(InvestigationGraphService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra las entidades/relaciones extraídas de UNA evidencia. Llamado
   * como paso best-effort desde FieldEvidenceService.ejecutarExtraccion() —
   * el llamador envuelve esto en su propio try/catch, un fallo aquí nunca
   * debe bloquear/revertir los hallazgos ya persistidos.
   */
  async recordExtraction(
    auditId: string,
    evidenceId: string,
    fuenteNormalizada: string,
    entidades: EntidadEstructuradaInput[],
    relaciones: RelacionEstructuradaInput[],
  ): Promise<void> {
    if (!entidades?.length && !relaciones?.length) return;
    // El timeout default de Prisma para transacciones interactivas es 5000ms —
    // con documentos que producen muchas entidades/relaciones (cada upsert/create
    // es su propio round-trip al pooler de Supabase) eso se agota rápido y
    // Prisma cierra la transacción a medias (encontrado en verificación real
    // con un PDF de 13 entidades). 30s da margen generoso.
    await this.prisma.$transaction(
      (tx) => this.writeExtraction(tx, auditId, evidenceId, fuenteNormalizada, entidades, relaciones),
      { timeout: 30_000 },
    );
  }

  /**
   * Reprocesa el grafo de UNA evidencia desde datos ya cacheados
   * (FieldEvidence.extraccionRaw.entidades_estructuradas/relaciones), sin
   * volver a llamar al LLM — Fase 2a, cubre el caso "recordExtraction falló
   * después de que los hallazgos ya quedaron READY". Borra menciones/
   * relaciones existentes de esa evidencia antes de reescribir, para no
   * duplicar si ya había datos parciales de un intento anterior.
   */
  async reprocessFromCache(
    auditId: string,
    evidenceId: string,
    fuenteNormalizada: string,
    entidades: EntidadEstructuradaInput[],
    relaciones: RelacionEstructuradaInput[],
  ): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        await tx.graphEntityMention.deleteMany({ where: { evidenceId } });
        await tx.graphRelation.deleteMany({ where: { evidenceId } });
        await this.writeExtraction(tx, auditId, evidenceId, fuenteNormalizada, entidades, relaciones);
      },
      { timeout: 30_000 },
    );
  }

  private async writeExtraction(
    tx: Prisma.TransactionClient,
    auditId: string,
    evidenceId: string,
    fuenteNormalizada: string,
    entidades: EntidadEstructuradaInput[],
    relaciones: RelacionEstructuradaInput[],
  ): Promise<void> {
    const idPorNombre = new Map<string, string>(); // key: nombre normalizado (sin tipo)

    for (const e of entidades ?? []) {
      const nombreNormalizado = this.normalizar(e.nombre);
      if (!nombreNormalizado) continue;
      const tipo = e.tipo.toUpperCase() as GraphEntityType;

      const entity = await tx.graphEntity.upsert({
        where: { auditId_tipo_nombreNormalizado: { auditId, tipo, nombreNormalizado } },
        create: { auditId, tipo, nombre: e.nombre.trim(), nombreNormalizado },
        update: {},
      });
      idPorNombre.set(nombreNormalizado, entity.id);

      const validadaCita = fuenteNormalizada.includes(this.normalizar(e.cita_textual));
      await tx.graphEntityMention.create({
        data: { entityId: entity.id, evidenceId, citaTextual: e.cita_textual, validadaCita },
      });
    }

    for (const r of relaciones ?? []) {
      const sourceId = idPorNombre.get(this.normalizar(r.entidad_origen));
      const targetId = idPorNombre.get(this.normalizar(r.entidad_destino));
      if (!sourceId || !targetId) {
        this.logger.warn(
          `Relación descartada — entidad_origen/destino no declarada en entidades_estructuradas (evidencia ${evidenceId})`,
        );
        continue;
      }
      const validadaCita = fuenteNormalizada.includes(this.normalizar(r.cita_textual));
      await tx.graphRelation.create({
        data: {
          auditId,
          evidenceId,
          sourceEntityId: sourceId,
          targetEntityId: targetId,
          tipo: r.tipo.toUpperCase() as GraphRelationType,
          citaTextual: r.cita_textual,
          validadaCita,
          confianza: r.confianza,
        },
      });
    }
  }

  /**
   * Fusiona dos entidades duplicadas del mismo tipo (Fase 2a) — reasigna
   * menciones/relaciones del "perdedor" al "sobreviviente" y borra al
   * perdedor. Sin patrón existente en el repo para modelar esto: los FKs de
   * GraphEntityMention/GraphRelation hacia GraphEntity son onDelete: Cascade,
   * así que hay que reasignar ANTES de borrar (un delete directo destruiría
   * las menciones/relaciones en vez de conservarlas en el sobreviviente).
   */
  async mergeEntities(auditId: string, loserEntityId: string, survivorEntityId: string, user: AuthUser) {
    const audit = await this.prisma.audit.findUnique({ where: { id: auditId }, select: { organizationId: true } });
    if (!audit) throw new NotFoundException('Auditoría no encontrada');
    if (audit.organizationId !== user.organizationId) throw new ForbiddenException();
    if (loserEntityId === survivorEntityId) throw new BadRequestException('No se puede fusionar una entidad consigo misma.');

    const [loser, survivor] = await Promise.all([
      this.prisma.graphEntity.findUnique({ where: { id: loserEntityId } }),
      this.prisma.graphEntity.findUnique({ where: { id: survivorEntityId } }),
    ]);
    if (!loser || loser.auditId !== auditId) throw new NotFoundException('Entidad a fusionar no encontrada');
    if (!survivor || survivor.auditId !== auditId) throw new NotFoundException('Entidad destino no encontrada');
    if (loser.tipo !== survivor.tipo) throw new BadRequestException('Solo se pueden fusionar entidades del mismo tipo.');

    const resultado = await this.prisma.$transaction(async (tx) => {
      const mentions = await tx.graphEntityMention.updateMany({
        where: { entityId: loserEntityId },
        data: { entityId: survivorEntityId },
      });
      const asSource = await tx.graphRelation.updateMany({
        where: { sourceEntityId: loserEntityId },
        data: { sourceEntityId: survivorEntityId },
      });
      const asTarget = await tx.graphRelation.updateMany({
        where: { targetEntityId: loserEntityId },
        data: { targetEntityId: survivorEntityId },
      });
      // Limpieza de auto-relaciones que la reasignación pudo crear (ej. "J.
      // Pérez MENCIONA Juan Pérez" → tras reasignar, ambos lados apuntan al
      // sobreviviente).
      await tx.graphRelation.deleteMany({
        where: { auditId, sourceEntityId: survivorEntityId, targetEntityId: survivorEntityId },
      });
      // Ya sin FKs entrantes — el onDelete: Cascade no borra nada porque no
      // queda nada que borrar.
      await tx.graphEntity.delete({ where: { id: loserEntityId } });
      return {
        reassignedMentions: mentions.count,
        reassignedRelationsAsSource: asSource.count,
        reassignedRelationsAsTarget: asTarget.count,
      };
    });

    return { merged: true, survivorId: survivorEntityId, ...resultado };
  }

  async getAuditGraph(auditId: string, user: AuthUser) {
    const audit = await this.prisma.audit.findUnique({
      where: { id: auditId },
      select: { id: true, title: true, organizationId: true },
    });
    if (!audit) throw new NotFoundException('Auditoría no encontrada');
    if (audit.organizationId !== user.organizationId) throw new ForbiddenException();

    const entities = await this.prisma.graphEntity.findMany({
      where: { auditId },
      include: {
        mentions: {
          select: {
            id: true, citaTextual: true, validadaCita: true, evidenceId: true, createdAt: true,
            evidence: { select: { kind: true, capturedAt: true, sectionKey: true, paperId: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: [{ tipo: 'asc' }, { nombre: 'asc' }],
    });

    const relations = await this.prisma.graphRelation.findMany({
      where: { auditId },
      select: {
        id: true, sourceEntityId: true, targetEntityId: true, tipo: true,
        citaTextual: true, validadaCita: true, confianza: true, evidenceId: true,
      },
    });

    // Fase 2a — conecta el grafo con el flujo de aceptar/promover ya existente
    // de FieldEvidence. Granularidad por evidencia (no por finding individual
    // — no existe FK finding↔mención hoy; correlacionarlos es trabajo de
    // Fase 2b).
    const evidenciasConfirmadas = await this.prisma.fieldEvidenceFinding.findMany({
      where: { disposition: { in: ['ACCEPTED', 'PROMOTED'] }, evidence: { auditId } },
      select: { evidenceId: true },
      distinct: ['evidenceId'],
    });
    const confirmados = new Set(evidenciasConfirmadas.map((e) => e.evidenceId));

    const nodes = entities.map((e) => ({
      id: e.id,
      tipo: e.tipo,
      nombre: e.nombre,
      mentionCount: e.mentions.length,
      mentions: e.mentions.map((m) => ({
        id: m.id,
        citaTextual: m.citaTextual,
        validadaCita: m.validadaCita,
        evidenceId: m.evidenceId,
        evidenceKind: m.evidence.kind,
        evidenceSectionKey: m.evidence.sectionKey,
        evidencePaperId: m.evidence.paperId,
        capturedAt: m.evidence.capturedAt,
        confirmadoPorAuditor: confirmados.has(m.evidenceId),
      })),
    }));

    const edges = relations.map((r) => ({
      id: r.id,
      sourceId: r.sourceEntityId,
      targetId: r.targetEntityId,
      tipo: r.tipo,
      citaTextual: r.citaTextual,
      validadaCita: r.validadaCita,
      confianza: r.confianza,
      evidenceId: r.evidenceId,
      confirmadoPorAuditor: confirmados.has(r.evidenceId),
    }));

    return {
      auditId,
      auditTitle: audit.title,
      nodes,
      edges,
      stats: {
        totalEntities: nodes.length,
        totalRelations: edges.length,
        unvalidatedMentions: nodes.reduce((acc, n) => acc + n.mentions.filter((m) => !m.validadaCita).length, 0),
        unvalidatedRelations: edges.filter((e) => !e.validadaCita).length,
        byType: entities.reduce<Record<string, number>>((acc, e) => {
          acc[e.tipo] = (acc[e.tipo] ?? 0) + 1;
          return acc;
        }, {}),
      },
    };
  }

  private normalizar(texto: string): string {
    return texto.toLowerCase().replace(/\s+/g, ' ').trim();
  }
}
