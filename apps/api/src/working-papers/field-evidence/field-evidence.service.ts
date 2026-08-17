import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger,
} from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { FieldEvidenceKind, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/jwt.strategy';
import { AiService } from '../../ai/ai.service';

// Fase 1 (EVD-03..11): solo texto y nota de voz. El resto del enum ya existe en el
// schema (evita migración cuando lleguen las fases siguientes) pero el pipeline
// todavía no sabe procesarlas — se rechazan explícitamente en vez de crear filas
// que quedarían atascadas para siempre.
const FASE_1_KINDS: FieldEvidenceKind[] = [FieldEvidenceKind.TEXT_NOTE, FieldEvidenceKind.AUDIO_NOTE];

// Reaper perezoso (§6.3.2 del diseño) — sin scheduler; un job que lleva más de
// esto en TRANSCRIBING/EXTRACTING se asume zombi (proceso reiniciado a mitad)
// y se auto-sana a FAILED en la primera consulta que lo toque.
const REAPER_TIMEOUT_MS = 30 * 60 * 1000;

export interface CrearEvidenciaDto {
  kind: FieldEvidenceKind;
  sectionKey: string;
  capturedAt: string;       // ISO
  consentimiento?: string;  // 'true' | 'false' — llega como string desde multipart
  lugar?: string;
  descripcion?: string;
  texto?: string;           // obligatorio para TEXT_NOTE
}

type UploadedFileLike = { buffer: Buffer; originalname: string; mimetype: string; size: number };

@Injectable()
export class FieldEvidenceService {
  private readonly logger = new Logger(FieldEvidenceService.name);
  private readonly supabase: SupabaseClient;

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
  ) {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }

  // ─── Access guard ────────────────────────────────────────────────────────

  private async assertPaperAccess(paperId: string, user: AuthUser) {
    const wp = await this.prisma.workingPaper.findUnique({
      where: { id: paperId },
      include: { audit: { select: { organizationId: true } } },
    });
    if (!wp) throw new NotFoundException('Papel de trabajo no encontrado');
    if (wp.audit.organizationId !== user.organizationId) throw new ForbiddenException();
    return wp;
  }

  // ─── Ingesta (EVD-04) ────────────────────────────────────────────────────

  async crear(
    paperId: string,
    dto: CrearEvidenciaDto,
    file: UploadedFileLike | undefined,
    user: AuthUser,
  ) {
    const wp = await this.assertPaperAccess(paperId, user);

    if (!dto.kind || !FASE_1_KINDS.includes(dto.kind)) {
      throw new BadRequestException(
        `Tipo de evidencia "${dto.kind}" aún no soportado — Fase 1 solo procesa TEXT_NOTE y AUDIO_NOTE.`,
      );
    }
    if (!dto.sectionKey?.trim()) throw new BadRequestException('sectionKey es obligatorio');
    if (!dto.capturedAt || Number.isNaN(Date.parse(dto.capturedAt))) {
      throw new BadRequestException('capturedAt debe ser una fecha ISO válida.');
    }
    if (dto.kind === FieldEvidenceKind.TEXT_NOTE && !dto.texto?.trim()) {
      throw new BadRequestException('El texto es obligatorio para una nota de texto.');
    }
    if (dto.kind !== FieldEvidenceKind.TEXT_NOTE && !file) {
      throw new BadRequestException(`Se requiere un archivo para el tipo "${dto.kind}".`);
    }

    const sha256 = file
      ? createHash('sha256').update(file.buffer).digest('hex')
      : createHash('sha256').update(Buffer.from(dto.texto!, 'utf-8')).digest('hex');

    const evidencia = await this.prisma.fieldEvidence.create({
      data: {
        auditId:        wp.auditId,
        paperId,
        sectionKey:      dto.sectionKey,
        kind:            dto.kind,
        status:          'UPLOADED',
        filename:        file?.originalname,
        mimeType:        file?.mimetype,
        size:            file?.size ?? Buffer.byteLength(dto.texto ?? '', 'utf-8'),
        sha256,
        textoOriginal:   dto.kind === FieldEvidenceKind.TEXT_NOTE ? dto.texto : null,
        capturedById:    user.id,
        capturedByName:  user.email,
        capturedAt:      new Date(dto.capturedAt),
        consentimiento:  dto.consentimiento === 'true',
        lugar:           dto.lugar,
        descripcion:     dto.descripcion,
      },
    });

    if (file) {
      const safeName = file.originalname.replace(/[^\w.\-]/g, '_');
      const path      = `evidence/${wp.auditId}/${paperId}/${evidencia.id}_${safeName}`;

      const { error: upErr } = await this.supabase.storage
        .from('audit-files')
        .upload(path, file.buffer, {
          contentType:  file.mimetype || 'application/octet-stream',
          cacheControl: '3600',
          upsert:       false,
        });
      if (upErr) {
        // Custodia inconsistente sin el archivo — no dejar la fila huérfana.
        await this.prisma.fieldEvidence.delete({ where: { id: evidencia.id } });
        throw new BadRequestException(`Error al subir archivo: ${upErr.message}`);
      }
      await this.prisma.fieldEvidence.update({
        where: { id: evidencia.id },
        data:  { storageKey: path },
      });
    }

    // Fire-and-forget (molde ConnectorImport, §6.3.1) — el cliente hace polling
    // a GET .../evidence/:id. No se espera aquí: crear() ya devolvió custodia sellada.
    this.procesarEvidenciaBackground(evidencia.id, file?.buffer).catch(err =>
      this.logger.error(`Fallo procesando evidencia ${evidencia.id}: ${err.message}`, err.stack),
    );

    return this.prisma.fieldEvidence.findUniqueOrThrow({ where: { id: evidencia.id } });
  }

  private async procesarEvidenciaBackground(evidenceId: string, fileBuffer?: Buffer) {
    const evidencia = await this.prisma.fieldEvidence.findUnique({ where: { id: evidenceId } });
    if (!evidencia) return;

    if (evidencia.kind === FieldEvidenceKind.TEXT_NOTE) {
      // Sin normalización a texto que hacer — pasa directo a extraer de textoOriginal.
      await this.prisma.fieldEvidence.update({
        where: { id: evidenceId },
        data:  { status: 'EXTRACTING', procesamientoIniciado: new Date() },
      });
      await this.ejecutarExtraccion(evidenceId);
      return;
    }

    // AUDIO_NOTE — único otro kind de Fase 1.
    await this.prisma.fieldEvidence.update({
      where: { id: evidenceId },
      data:  { status: 'TRANSCRIBING', procesamientoIniciado: new Date() },
    });

    try {
      const buffer = fileBuffer ?? await this.descargarOriginal(evidencia.storageKey);
      const inicio = Date.now();
      const resultado = await this.aiService.transcribeAudio(
        buffer,
        evidencia.filename ?? 'audio',
        evidencia.mimeType ?? 'audio/mpeg',
      );

      await this.prisma.fieldEvidence.update({
        where: { id: evidenceId },
        data: {
          status:              'EXTRACTING',
          transcript:          resultado,
          modeloTranscripcion: resultado.modelo,
          processingMs:        Date.now() - inicio,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Transcripción falló para ${evidenceId}: ${message}`);
      await this.prisma.fieldEvidence.update({
        where: { id: evidenceId },
        data:  { status: 'FAILED', errorMsg: message },
      });
      return; // no seguir a extracción si la transcripción falló
    }

    await this.ejecutarExtraccion(evidenceId);
  }

  private async descargarOriginal(storageKey: string | null): Promise<Buffer> {
    if (!storageKey) throw new Error('La evidencia no tiene archivo original en Storage');
    const { data, error } = await this.supabase.storage.from('audit-files').download(storageKey);
    if (error || !data) throw new Error(error?.message ?? 'No se pudo descargar el archivo original');
    return Buffer.from(await data.arrayBuffer());
  }

  // ─── Extracción estructurada + validación anti-alucinación (EVD-05/EVD-06) ──

  private async ejecutarExtraccion(evidenceId: string) {
    const evidencia = await this.prisma.fieldEvidence.findUnique({ where: { id: evidenceId } });
    if (!evidencia) return;

    const transcript = evidencia.transcript as { texto?: string; segmentos?: unknown[] } | null;
    const fuenteTexto = evidencia.kind === FieldEvidenceKind.TEXT_NOTE
      ? (evidencia.textoOriginal ?? '')
      : (transcript?.texto ?? '');

    if (!fuenteTexto.trim()) {
      await this.prisma.fieldEvidence.update({
        where: { id: evidenceId },
        data:  { status: 'FAILED', errorMsg: 'No hay texto fuente para extraer (transcripción vacía).' },
      });
      return;
    }

    try {
      const inicio = Date.now();
      const resultado = await this.aiService.extractFieldEvidence({
        fuente_tipo: evidencia.kind === FieldEvidenceKind.TEXT_NOTE ? 'texto' : 'transcripcion_audio',
        contenido: fuenteTexto,
        segmentos: evidencia.kind === FieldEvidenceKind.AUDIO_NOTE
          ? (transcript?.segmentos as { inicio: number; fin: number; texto: string }[] | undefined)
          : undefined,
        instrucciones_extra: [evidencia.descripcion, evidencia.lugar ? `Lugar: ${evidencia.lugar}` : null]
          .filter(Boolean).join('\n') || undefined,
      });

      // Anti-alucinación (§6.9): la cita debe existir literal (normalizada por
      // minúsculas + colapso de espacios, sin tocar tildes/puntuación) en la
      // fuente. No se descarta el hallazgo — se persiste con validadaCita:false
      // para trazabilidad, y queda excluido de aceptar/promover.
      const fuenteNormalizada = this.normalizarParaComparar(fuenteTexto);
      const hallazgosData = resultado.hallazgos.map(h => ({
        evidenceId,
        tipo:                   h.tipo,
        descripcion:            h.descripcion,
        citaTextual:            h.cita_textual,
        fuenteRef:              h.fuente_ref,
        nivelRiesgo:            h.nivel_riesgo,
        justificacion:          h.justificacion,
        validadaCita:           fuenteNormalizada.includes(this.normalizarParaComparar(h.cita_textual)),
        referenciasExpediente:  h.referencias_expediente as unknown as Prisma.InputJsonValue,
      }));

      await this.prisma.$transaction([
        ...(hallazgosData.length > 0
          ? [this.prisma.fieldEvidenceFinding.createMany({ data: hallazgosData })]
          : []),
        this.prisma.fieldEvidence.update({
          where: { id: evidenceId },
          data: {
            status: 'READY',
            extraccionRaw: {
              resumen_ejecutivo:     resultado.resumen_ejecutivo,
              temas:                 resultado.temas,
              entidades_mencionadas: resultado.entidades_mencionadas,
            } as unknown as Prisma.InputJsonValue,
            modeloLlm:    resultado.modelo,
            processingMs: Date.now() - inicio,
          },
        }),
      ]);

      const descartadas = hallazgosData.filter(h => !h.validadaCita).length;
      if (descartadas > 0) {
        this.logger.warn(
          `Evidencia ${evidenceId}: ${descartadas} hallazgo(s) con cita no verificable — excluidos de sugerencias por defecto.`,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Extracción falló para ${evidenceId}: ${message}`);
      await this.prisma.fieldEvidence.update({
        where: { id: evidenceId },
        data:  { status: 'FAILED', errorMsg: message },
      });
    }
  }

  private normalizarParaComparar(texto: string): string {
    return texto.toLowerCase().replace(/\s+/g, ' ').trim();
  }

  // ─── Reaper perezoso (§6.3.2) ────────────────────────────────────────────

  private async aplicarReaper(candidatos: { id: string; procesamientoIniciado: Date | null }[]) {
    const ahora = Date.now();
    const zombies = candidatos.filter(
      e => e.procesamientoIniciado && ahora - e.procesamientoIniciado.getTime() > REAPER_TIMEOUT_MS,
    );
    if (zombies.length === 0) return;
    await this.prisma.fieldEvidence.updateMany({
      where: { id: { in: zombies.map(z => z.id) } },
      data: {
        status:   'FAILED',
        errorMsg: 'timeout — el proceso pudo reiniciarse a mitad del procesamiento',
      },
    });
  }

  // ─── Lectura ─────────────────────────────────────────────────────────────

  async listar(paperId: string, user: AuthUser, incluirTodo: boolean) {
    await this.assertPaperAccess(paperId, user);

    const enProceso = await this.prisma.fieldEvidence.findMany({
      where:  { paperId, status: { in: ['TRANSCRIBING', 'EXTRACTING'] } },
      select: { id: true, procesamientoIniciado: true },
    });
    await this.aplicarReaper(enProceso);

    return this.prisma.fieldEvidence.findMany({
      where:   { paperId },
      include: { findings: incluirTodo ? true : { where: { disposition: { not: 'DISCARDED' } } } },
      orderBy: { capturedAt: 'desc' },
    });
  }

  async obtenerUno(paperId: string, evidenceId: string, user: AuthUser) {
    await this.assertPaperAccess(paperId, user);

    const evidencia = await this.prisma.fieldEvidence.findUnique({
      where:  { id: evidenceId },
      select: { id: true, paperId: true, status: true, procesamientoIniciado: true },
    });
    if (!evidencia || evidencia.paperId !== paperId) throw new NotFoundException('Evidencia no encontrada');

    if (evidencia.status === 'TRANSCRIBING' || evidencia.status === 'EXTRACTING') {
      await this.aplicarReaper([evidencia]);
    }

    return this.prisma.fieldEvidence.findUniqueOrThrow({
      where:   { id: evidenceId },
      include: { findings: true },
    });
  }

  // ─── Eliminar (SENIOR_AUDITOR — acto de custodia, no de edición) ─────────

  async eliminar(paperId: string, evidenceId: string, user: AuthUser) {
    await this.assertPaperAccess(paperId, user);

    const evidencia = await this.prisma.fieldEvidence.findUnique({ where: { id: evidenceId } });
    if (!evidencia || evidencia.paperId !== paperId) throw new NotFoundException('Evidencia no encontrada');

    if (evidencia.storageKey) {
      await this.supabase.storage.from('audit-files').remove([evidencia.storageKey]);
    }
    await this.prisma.fieldEvidence.delete({ where: { id: evidenceId } });
    return { deleted: true };
  }
}
