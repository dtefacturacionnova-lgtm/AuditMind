import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger,
} from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { FieldEvidenceKind, Prisma, RefType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/jwt.strategy';
import { AiService } from '../../ai/ai.service';
import { PaperReferencesService } from '../paper-references.service';

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
    private readonly paperReferencesService: PaperReferencesService,
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
      const contextoExpediente = await this.construirContextoExpediente(evidencia);
      const resultado = await this.aiService.extractFieldEvidence({
        fuente_tipo: evidencia.kind === FieldEvidenceKind.TEXT_NOTE ? 'texto' : 'transcripcion_audio',
        contenido: fuenteTexto,
        segmentos: evidencia.kind === FieldEvidenceKind.AUDIO_NOTE
          ? (transcript?.segmentos as { inicio: number; fin: number; texto: string }[] | undefined)
          : undefined,
        contexto_expediente: contextoExpediente,
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

  // ─── Cruce con el expediente (EVD-07, §6.6/§2.3) ─────────────────────────
  // Reutiliza el mismo dato que ya alimenta el grafo de conocimiento
  // (mention-index) — no hace falta un mecanismo nuevo de acceso a datos.
  // "papeles" es el índice completo (barato); "extractos" es deliberadamente
  // liviano — las secciones del propio papel de la evidencia + PT-A2
  // (riesgos) si existe, tope de 5 secciones combinadas — el objetivo es que
  // el LLM pueda citar codes reales en referencias_expediente, no un RAG
  // completo (eso sería scope creep, ver §6.6).

  private async construirContextoExpediente(evidencia: { auditId: string; paperId: string }) {
    const MAX_EXTRACTOS = 5;
    const MAX_CHARS_POR_EXTRACTO = 8000;

    const audit = await this.prisma.audit.findUnique({
      where:  { id: evidencia.auditId },
      select: { title: true, type: true },
    });

    const papersIndex = await this.prisma.workingPaper.findMany({
      where:   { auditId: evidencia.auditId },
      orderBy: [{ indexSection: 'asc' }, { code: 'asc' }],
      select: {
        code: true, title: true,
        sections: { select: { sectionKey: true, label: true }, orderBy: { sortOrder: 'asc' } },
      },
    });
    const papeles = papersIndex.map(p => ({
      code:  p.code,
      title: p.title,
      sections: p.sections.map(s => ({ key: s.sectionKey, label: s.label })),
    }));

    const papersParaExtracto = await this.prisma.workingPaper.findMany({
      where: { auditId: evidencia.auditId, OR: [{ id: evidencia.paperId }, { paperCode: 'PT-A2' }] },
      select: {
        id: true, code: true,
        sections: { select: { sectionKey: true, value: true }, orderBy: { sortOrder: 'asc' } },
      },
    });
    const propio = papersParaExtracto.find(p => p.id === evidencia.paperId);
    const riesgos = papersParaExtracto.find(p => p.id !== evidencia.paperId);

    const extractos: { code: string; section_key: string; resumen: string }[] = [];
    for (const paper of [propio, riesgos].filter((p): p is NonNullable<typeof p> => !!p)) {
      for (const s of paper.sections) {
        if (extractos.length >= MAX_EXTRACTOS) break;
        const resumen = this.valorAResumen(s.value).trim();
        if (!resumen) continue;
        extractos.push({ code: paper.code, section_key: s.sectionKey, resumen: resumen.slice(0, MAX_CHARS_POR_EXTRACTO) });
      }
      if (extractos.length >= MAX_EXTRACTOS) break;
    }

    return { audit_title: audit?.title, audit_type: audit?.type, papeles, extractos };
  }

  private valorAResumen(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string')  return value;
    if (typeof value === 'number')  return String(value);
    if (typeof value === 'boolean') return value ? 'Sí' : 'No';
    if (Array.isArray(value)) {
      // MATRIX y similares: filas como objetos {campo: valor, ...} — formatea
      // "campo: valor" por fila en vez de un blob JSON ilegible. Ignora
      // claves internas del grid (prefijo "_", ej. _id/_origen — convención
      // de MatrixGridPanel, nunca son columnas de datos reales).
      if (value.length > 0 && value.every(v => v && typeof v === 'object' && !Array.isArray(v))) {
        return value
          .map(row =>
            Object.entries(row as Record<string, unknown>)
              .filter(([k]) => !k.startsWith('_'))
              .map(([k, v]) => `${k}: ${this.valorAResumen(v)}`)
              .join(' | '),
          )
          .join('\n');
      }
      return value.map(v => this.valorAResumen(v)).join(', ');
    }
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
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

  // ─── Revisión humana (EVD-09, §6.10) — "la IA sugiere, el auditor aprueba" ──

  private async obtenerFindingDelPapel(paperId: string, findingId: string, user: AuthUser) {
    await this.assertPaperAccess(paperId, user);
    const finding = await this.prisma.fieldEvidenceFinding.findUnique({
      where: { id: findingId },
      include: { evidence: true },
    });
    if (!finding || finding.evidence.paperId !== paperId) {
      throw new NotFoundException('Hallazgo no encontrado');
    }
    return finding;
  }

  async aceptar(paperId: string, findingId: string, targetSectionKeyOverride: string | undefined, user: AuthUser) {
    const finding = await this.obtenerFindingDelPapel(paperId, findingId, user);
    if (finding.disposition !== 'PENDING') {
      throw new BadRequestException('Este hallazgo ya fue revisado.');
    }
    if (!finding.validadaCita) {
      throw new BadRequestException('No se puede aceptar un hallazgo cuya cita no se pudo verificar contra la fuente.');
    }

    const targetSectionKey = targetSectionKeyOverride ?? finding.evidence.sectionKey;
    const targetSection = await this.prisma.paperSection.findUnique({
      where: { paperId_sectionKey: { paperId, sectionKey: targetSectionKey } },
    });
    if (!targetSection) throw new NotFoundException(`Sección destino "${targetSectionKey}" no encontrada`);

    let materializedSectionKey: string | null = null;
    if (targetSection.fieldType === 'MATRIX') {
      const rows = Array.isArray(targetSection.value) ? [...(targetSection.value as unknown[])] : [];
      rows.push(this.construirFilaDesdeHallazgo(finding, targetSection.aiHint, rows.length));
      await this.prisma.paperSection.update({
        where: { id: targetSection.id },
        data: { value: rows as unknown as Prisma.InputJsonValue },
      });
      materializedSectionKey = targetSectionKey;
    }
    // Sección no-MATRIX (ej. TEXTAREA): se marca ACCEPTED sin materializar fila —
    // el auditor redacta a mano usando la cita (§6.10).

    const referencias = (finding.referenciasExpediente as { code: string; section_key?: string; motivo: string }[] | null) ?? [];
    for (const ref of referencias) {
      const targetPaper = await this.prisma.workingPaper.findFirst({
        where: { auditId: finding.evidence.auditId, code: ref.code },
        select: { id: true },
      });
      if (!targetPaper) continue; // code sugerido por el LLM que no existe en el encargo — se ignora
      await this.paperReferencesService.createReference(paperId, {
        sourceSectionKey: finding.evidence.sectionKey,
        targetPaperId:    targetPaper.id,
        targetSectionKey: ref.section_key,
        refType:          ref.section_key ? RefType.FIELD : RefType.INDEX,
      }, user);
    }

    return this.prisma.fieldEvidenceFinding.update({
      where: { id: findingId },
      data: {
        disposition:      'ACCEPTED',
        reviewedById:      user.id,
        reviewedAt:        new Date(),
        targetSectionKey:  materializedSectionKey,
      },
    });
  }

  async descartar(paperId: string, findingId: string, user: AuthUser) {
    const finding = await this.obtenerFindingDelPapel(paperId, findingId, user);
    if (finding.disposition !== 'PENDING') {
      throw new BadRequestException('Este hallazgo ya fue revisado.');
    }
    return this.prisma.fieldEvidenceFinding.update({
      where: { id: findingId },
      data:  { disposition: 'DISCARDED', reviewedById: user.id, reviewedAt: new Date() },
    });
  }

  // PT-HALL siempre está pre-sembrado por las plantillas de encargo (code fijo,
  // ver audit-templates.service.ts) — no hace falta find-or-create ni tocar
  // generateWpCode (que tiene un bug de colisión conocido, ver EVD-08).
  async promover(paperId: string, findingId: string, user: AuthUser) {
    const finding = await this.obtenerFindingDelPapel(paperId, findingId, user);
    if (finding.disposition !== 'ACCEPTED') {
      throw new BadRequestException('Solo se puede promover un hallazgo ya aceptado.');
    }

    const hallPaper = await this.prisma.workingPaper.findFirst({
      where:  { auditId: finding.evidence.auditId, paperCode: 'PT-HALL' },
      select: { id: true },
    });
    if (!hallPaper) {
      throw new NotFoundException('El encargo no tiene un papel de Hallazgo (PT-HALL) — no se puede promover.');
    }

    const s1 = await this.prisma.paperSection.findUnique({
      where: { paperId_sectionKey: { paperId: hallPaper.id, sectionKey: 'S1' } },
    });
    const rows = Array.isArray(s1?.value) ? [...(s1!.value as unknown[])] : [];
    const nuevaFila = this.construirFilaDeHallazgoPTHall(finding, rows.length, user);
    rows.push(nuevaFila);

    await this.prisma.paperSection.upsert({
      where: { paperId_sectionKey: { paperId: hallPaper.id, sectionKey: 'S1' } },
      create: {
        paperId: hallPaper.id, sectionKey: 'S1', label: 'Registro de Hallazgos',
        fieldType: 'MATRIX', value: rows as unknown as Prisma.InputJsonValue,
        isRequired: true, isAutoFilled: false, sortOrder: 1,
      },
      update: { value: rows as unknown as Prisma.InputJsonValue },
    });

    return this.prisma.fieldEvidenceFinding.update({
      where: { id: findingId },
      data:  { disposition: 'PROMOTED', promotedToPaperId: hallPaper.id },
    });
  }

  // ─── Mapeo genérico hallazgo → fila MATRIX (§6.10) ───────────────────────

  private parseColumnas(aiHint: string | null): string[] {
    if (!aiHint) return [];
    const m = aiHint.match(/^Columnas:\s*([^.]+)\./);
    if (!m) return [];
    return m[1].split('|').map(c => c.trim()).filter(Boolean);
  }

  private construirFilaDesdeHallazgo(
    finding: { tipo: string; descripcion: string; nivelRiesgo: string; fuenteRef: string | null; justificacion: string | null; citaTextual: string; id: string; evidenceId: string },
    aiHint: string | null,
    rowIndex: number,
  ): Record<string, unknown> {
    const row: Record<string, unknown> = {};
    for (const col of this.parseColumnas(aiHint)) {
      const norm = col.toLowerCase();
      if (/^#|^n[°º]|numero/.test(norm))                                    row[col] = rowIndex + 1;
      else if (norm.includes('tipo'))                                       row[col] = finding.tipo;
      else if (norm.includes('descripcion') || norm.includes('descripción')) row[col] = finding.descripcion;
      else if (norm.includes('riesgo'))                                     row[col] = finding.nivelRiesgo;
      else if (norm.includes('fuente'))                                     row[col] = finding.fuenteRef ?? '';
      else if (norm.includes('justificaci'))                                row[col] = finding.justificacion ?? '';
      else                                                                   row[col] = '';
    }
    row['_id']          = `fe_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    row['_origen']       = 'evidencia';
    row['_evidenciaId']  = finding.evidenceId;
    row['_findingId']    = finding.id;
    row['_cita']         = finding.citaTextual;
    return row;
  }

  private construirFilaDeHallazgoPTHall(
    finding: {
      id: string; evidenceId: string; tipo: string; descripcion: string; nivelRiesgo: string;
      citaTextual: string; evidence: { lugar: string | null; sectionKey: string; capturedAt: Date };
    },
    rowIndex: number,
    user: AuthUser,
  ): Record<string, unknown> {
    const nivelMap: Record<string, string> = { bajo: 'Bajo', medio: 'Medio', alto: 'Alto' };
    const tipoMap: Record<string, string> = {
      contradiccion:                  'Deficiencia de CI',
      evasiva:                        'Deficiencia de CI',
      riesgo_mencionado:               'Deficiencia de CI',
      incumplimiento_mencionado:       'Incumplimiento',
      inconsistencia_con_expediente:   'Error',
      anomalia_visual:                 'Deficiencia de CI',
    };
    return {
      'ID Hallazgo (H-001, H-002…)': `H-${String(rowIndex + 1).padStart(3, '0')}`,
      'Área / Ciclo':                 finding.evidence.lugar ?? finding.evidence.sectionKey,
      'Proceso específico':           finding.descripcion.slice(0, 200),
      'Período auditado':             '',
      'Fecha de identificación':      finding.evidence.capturedAt.toISOString().slice(0, 10),
      'Auditor responsable':          user.email,
      'Clasificación de riesgo (Alto / Medio / Bajo)': nivelMap[finding.nivelRiesgo] ?? finding.nivelRiesgo,
      'Tipología (Incumplimiento / Deficiencia de CI / Error / Fraude / Ineficiencia / Cumplimiento normativo)': tipoMap[finding.tipo] ?? 'Deficiencia de CI',
      '_id':          `h_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      '_origen':       'evidencia',
      '_evidenciaId':  finding.evidenceId,
      '_findingId':    finding.id,
      '_cita':         finding.citaTextual,
    };
  }
}
