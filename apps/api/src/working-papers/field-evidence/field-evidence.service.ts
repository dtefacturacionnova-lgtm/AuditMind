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
import { InvestigationGraphService } from '../../investigation-graph/investigation-graph.service';

// Kinds que el pipeline sabe procesar hoy — las 4 fases completas (EVD-15 cierra
// Fase 4, video corto) + PDF_DOCUMENT (Fase 2a Investigador Forense).
const KINDS_SOPORTADOS: FieldEvidenceKind[] = [
  FieldEvidenceKind.TEXT_NOTE,
  FieldEvidenceKind.AUDIO_NOTE,
  FieldEvidenceKind.INTERVIEW_AUDIO,
  FieldEvidenceKind.ANNOTATED_PHOTO,
  FieldEvidenceKind.SHORT_VIDEO,
  FieldEvidenceKind.PDF_DOCUMENT,
];

// Kinds que requieren transcripción de audio antes de extraer (todo lo que no es
// texto/foto). SHORT_VIDEO NO está aquí a propósito — usa su propio flujo
// (procesarVideo/aiService.processVideo), que decide internamente si transcribe
// según si el video trae pista de audio.
const KINDS_CON_AUDIO: FieldEvidenceKind[] = [FieldEvidenceKind.AUDIO_NOTE, FieldEvidenceKind.INTERVIEW_AUDIO];

// Video corto (EVD-15, decisión de diseño): tope de 3 minutos — controla costo/latencia
// del muestreo de frames + transcripción. Se valida en dos capas: mejor esfuerzo en la
// subida (parseo MP4/MOV, ver extraerDuracionMp4Seg) y backstop definitivo tras decodificar
// en ai-service (procesarVideo), que sí conoce la duración real de cualquier contenedor.
const MAX_VIDEO_DURATION_SEG = 180;

export interface AnotacionFoto {
  tipo: 'circulo' | 'flecha' | 'texto';
  x: number; y: number;           // 0-1, relativas al tamaño de la imagen
  x2?: number; y2?: number;       // flecha: punto final
  radio?: number;                 // circulo
  nota?: string;                  // lo que el auditor escribió sobre la zona
}

// Reaper perezoso (§6.3.2 del diseño) — sin scheduler; un job que lleva más de
// esto en TRANSCRIBING/EXTRACTING se asume zombi (proceso reiniciado a mitad)
// y se auto-sana a FAILED en la primera consulta que lo toque.
const REAPER_TIMEOUT_MS = 30 * 60 * 1000;

// Fase 2b Investigador Forense — sectionKey sentinel para notas de contexto
// previo del auditor (paperId:null, no pertenecen a ninguna sección real).
export const SHERLOCK_CONTEXT_SECTION_KEY = 'investigador-contexto-previo';
const KINDS_CONTEXTO_INVESTIGADOR: FieldEvidenceKind[] = [
  FieldEvidenceKind.TEXT_NOTE,
  FieldEvidenceKind.AUDIO_NOTE,
];

export interface CrearEvidenciaDto {
  kind: FieldEvidenceKind;
  sectionKey: string;
  capturedAt: string;       // ISO
  consentimiento?: string;  // 'true' | 'false' — llega como string desde multipart
  lugar?: string;
  descripcion?: string;
  texto?: string;           // obligatorio para TEXT_NOTE
  anotaciones?: string;     // ANNOTATED_PHOTO — JSON.stringify(AnotacionFoto[])
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
    private readonly investigationGraphService: InvestigationGraphService,
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

    if (!dto.kind || !KINDS_SOPORTADOS.includes(dto.kind)) {
      throw new BadRequestException(
        `Tipo de evidencia "${dto.kind}" aún no soportado por el pipeline.`,
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
    // Entrevista formal — el consentimiento explícito del entrevistado es obligatorio
    // antes de aceptar la grabación (§6.5 del diseño; no es opcional, no hay bypass).
    if (dto.kind === FieldEvidenceKind.INTERVIEW_AUDIO && dto.consentimiento !== 'true') {
      throw new BadRequestException(
        'Una entrevista formal requiere confirmar el consentimiento explícito del entrevistado antes de subir la grabación.',
      );
    }
    // Video corto — tope de 3 minutos, mismo lugar donde se valida el límite de
    // tamaño (100MB, ver @UseInterceptors del controller). Mejor esfuerzo: solo
    // sabemos parsear MP4/MOV/M4V (caja mvhd) sin ffmpeg/librería de video en
    // Node; si el contenedor no es reconocible esta función devuelve null y no
    // bloquea la subida — el backstop definitivo corre en ai-service, que sí
    // decodifica cualquier contenedor y puede marcar la evidencia FAILED si
    // resulta ser más larga de lo permitido (ver procesarVideo).
    if (dto.kind === FieldEvidenceKind.SHORT_VIDEO && file) {
      const duracionSeg = this.extraerDuracionMp4Seg(file.buffer);
      if (duracionSeg !== null && duracionSeg > MAX_VIDEO_DURATION_SEG) {
        throw new BadRequestException(
          `El video dura ${Math.round(duracionSeg)}s y supera el máximo permitido de ${MAX_VIDEO_DURATION_SEG}s (3 minutos). Sube un recorte más corto.`,
        );
      }
    }

    // PDF (Fase 2a Investigador Forense) — validación barata antes de gastar la
    // cascada de OCR en un archivo mal etiquetado.
    if (dto.kind === FieldEvidenceKind.PDF_DOCUMENT && file && file.mimetype !== 'application/pdf') {
      throw new BadRequestException('El archivo debe ser un PDF (mimetype application/pdf).');
    }

    let anotaciones: AnotacionFoto[] | undefined;
    if (dto.kind === FieldEvidenceKind.ANNOTATED_PHOTO && dto.anotaciones) {
      try {
        anotaciones = JSON.parse(dto.anotaciones);
        if (!Array.isArray(anotaciones)) throw new Error('no es un arreglo');
      } catch {
        throw new BadRequestException('anotaciones debe ser un JSON válido de la forma [{tipo,x,y,...}].');
      }
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
        anotaciones:     anotaciones as unknown as Prisma.InputJsonValue ?? undefined,
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

    if (evidencia.kind === FieldEvidenceKind.SHORT_VIDEO) {
      await this.procesarVideo(evidencia, fileBuffer);
      return;
    }

    if (evidencia.kind === FieldEvidenceKind.PDF_DOCUMENT) {
      await this.procesarPdf(evidencia, fileBuffer);
      return;
    }

    if (!KINDS_CON_AUDIO.includes(evidencia.kind)) {
      // TEXT_NOTE (el texto ES la evidencia) y ANNOTATED_PHOTO (la imagen ES la
      // evidencia, sin transcripción posible) — pasan directo a extraer.
      await this.prisma.fieldEvidence.update({
        where: { id: evidenceId },
        data:  { status: 'EXTRACTING', procesamientoIniciado: new Date() },
      });
      await this.ejecutarExtraccion(evidenceId);
      return;
    }

    // AUDIO_NOTE / INTERVIEW_AUDIO — ambos requieren transcripción; INTERVIEW_AUDIO
    // además pide diarización (separar hablantes) a faster-whisper+pyannote (§6.7/EVD-12).
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
        undefined,
        evidencia.kind === FieldEvidenceKind.INTERVIEW_AUDIO,
      );

      const { calidadBaja, motivo } = this.evaluarCalidadTranscripcion(resultado.segmentos);
      await this.prisma.fieldEvidence.update({
        where: { id: evidenceId },
        data: {
          status:              'EXTRACTING',
          transcript:          resultado,
          modeloTranscripcion: resultado.modelo,
          processingMs:        Date.now() - inicio,
          calidadBaja,
          calidadMotivo:       motivo,
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

  // Video corto (EVD-15, Fase 4): una sola llamada a ai-service que decodifica el
  // contenedor, muestrea frames y transcribe la pista de audio si existe. Dos
  // reglas post-hoc que no se pueden validar antes de decodificar (§decisión
  // EVD-15): (a) backstop de duración — si el parseo MP4 de la subida no pudo
  // determinarla o fue optimista, aquí ya se conoce la duración real; (b) regla
  // de citabilidad — video sin pista de audio necesita descripcion no vacía como
  // texto fuente citable, y eso tampoco se sabe hasta decodificar.
  private async procesarVideo(
    evidencia: { id: string; storageKey: string | null; filename: string | null; mimeType: string | null; descripcion: string | null },
    fileBuffer?: Buffer,
  ) {
    const evidenceId = evidencia.id;
    await this.prisma.fieldEvidence.update({
      where: { id: evidenceId },
      data:  { status: 'TRANSCRIBING', procesamientoIniciado: new Date() },
    });

    let frames: { tsSeg: number; base64: string; mimeType: string }[] = [];
    try {
      const buffer = fileBuffer ?? await this.descargarOriginal(evidencia.storageKey);
      const inicio = Date.now();
      const resultado = await this.aiService.processVideo(
        buffer,
        evidencia.filename ?? 'video.mp4',
        evidencia.mimeType ?? 'video/mp4',
      );

      if (resultado.duracion_seg > MAX_VIDEO_DURATION_SEG) {
        await this.prisma.fieldEvidence.update({
          where: { id: evidenceId },
          data: {
            status: 'FAILED',
            errorMsg: `El video dura ${Math.round(resultado.duracion_seg)}s y supera el máximo permitido de ${MAX_VIDEO_DURATION_SEG}s (3 minutos). Vuelve a subir un recorte más corto.`,
          },
        });
        return;
      }
      if (!resultado.tiene_audio && !evidencia.descripcion?.trim()) {
        await this.prisma.fieldEvidence.update({
          where: { id: evidenceId },
          data: {
            status: 'FAILED',
            errorMsg: 'El video no tiene pista de audio y no se aportó una descripción — vuelve a subir la evidencia con una descripción de lo observado (el texto fuente citable no puede quedar vacío).',
          },
        });
        return;
      }

      frames = resultado.frames.map(f => ({ tsSeg: f.ts_seg, base64: f.base64, mimeType: f.mime_type }));

      const { calidadBaja, motivo } = resultado.transcript
        ? this.evaluarCalidadTranscripcion(resultado.transcript.segmentos)
        : { calidadBaja: false, motivo: null as string | null };
      await this.prisma.fieldEvidence.update({
        where: { id: evidenceId },
        data: {
          status:              'EXTRACTING',
          transcript:          resultado.transcript ?? Prisma.DbNull,
          modeloTranscripcion: resultado.transcript?.modelo,
          processingMs:        Date.now() - inicio,
          calidadBaja,
          calidadMotivo:       motivo,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Procesamiento de video falló para ${evidenceId}: ${message}`);
      await this.prisma.fieldEvidence.update({
        where: { id: evidenceId },
        data:  { status: 'FAILED', errorMsg: message },
      });
      return;
    }

    await this.ejecutarExtraccion(evidenceId, frames);
  }

  // PDF (Fase 2a Investigador Forense): mismo esquema que procesarVideo — una
  // llamada a ai-service que aplica la cascada de OCR (pdfplumber → Stirling →
  // Gemini vision) ya construida para el RAG. Si el texto sale completamente
  // vacío se marca FAILED (nada citable); si sale degradado pero no vacío, se
  // guarda igual con calidadBaja=true para que el auditor sepa que esa fuente
  // es menos confiable, sin bloquear la extracción.
  private async procesarPdf(
    evidencia: { id: string; storageKey: string | null; filename: string | null },
    fileBuffer?: Buffer,
  ) {
    const evidenceId = evidencia.id;
    await this.prisma.fieldEvidence.update({
      where: { id: evidenceId },
      data:  { status: 'TRANSCRIBING', procesamientoIniciado: new Date() },
    });

    try {
      const buffer = fileBuffer ?? await this.descargarOriginal(evidencia.storageKey);
      const inicio = Date.now();
      const resultado = await this.aiService.processPdf(buffer, evidencia.filename ?? 'documento.pdf');

      if (!resultado.texto.trim()) {
        await this.prisma.fieldEvidence.update({
          where: { id: evidenceId },
          data: {
            status: 'FAILED',
            errorMsg: 'No se pudo extraer texto del PDF, ni siquiera después de aplicar OCR — puede ser un escaneo demasiado oscuro/ilegible o un archivo dañado.',
          },
        });
        return;
      }

      const modelo = resultado.ocr_aplicado ? `ocr:${resultado.proveedor_ocr}` : 'pdfplumber';
      await this.prisma.fieldEvidence.update({
        where: { id: evidenceId },
        data: {
          status: 'EXTRACTING',
          // Reutiliza el campo `transcript` (Json?, ya genérico) — PDF no tiene
          // segmentos con hablante, segmentos=[] es correcto aquí.
          transcript: { texto: resultado.texto, segmentos: [], idioma: 'n/a', duracion_seg: 0, modelo, processing_ms: resultado.processing_ms },
          modeloTranscripcion: modelo,
          calidadBaja: resultado.calidad_baja,
          calidadMotivo: resultado.motivo_calidad_baja,
          processingMs: Date.now() - inicio,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Procesamiento de PDF falló para ${evidenceId}: ${message}`);
      await this.prisma.fieldEvidence.update({
        where: { id: evidenceId },
        data:  { status: 'FAILED', errorMsg: message },
      });
      return;
    }

    await this.ejecutarExtraccion(evidenceId);
  }

  // Fase 2a Investigador Forense — heurística de agregación sobre las señales de
  // confianza que faster-whisper ya calcula por segmento (no_speech_prob). Se
  // corre con vad_filter=True (whisper_service.ts), así que Whisper ya descarta
  // silencio puro antes de emitir segmentos — un segmento que sí llegó a texto
  // pero con no_speech_prob alto es señal fuerte de "probablemente no era voz
  // clara" (ruido, volumen bajo, habla superpuesta). Umbrales de partida,
  // ajustables con datos reales; marca a nivel de evidencia completa, no por
  // segmento (marcado por segmento en la UI queda deliberadamente diferido).
  private evaluarCalidadTranscripcion(
    segmentos: { no_speech_prob?: number; avg_logprob?: number }[] | undefined,
  ): { calidadBaja: boolean; motivo: string | null } {
    if (!segmentos?.length) return { calidadBaja: false, motivo: null };
    const conProb = segmentos.filter(s => typeof s.no_speech_prob === 'number');
    if (!conProb.length) return { calidadBaja: false, motivo: null };

    const promedioNoSpeech = conProb.reduce((acc, s) => acc + (s.no_speech_prob ?? 0), 0) / conProb.length;
    const fraccionSospechosos = conProb.filter(s => (s.no_speech_prob ?? 0) > 0.6).length / conProb.length;

    if (promedioNoSpeech > 0.4) {
      return {
        calidadBaja: true,
        motivo: `Probabilidad promedio de "sin voz" de ${(promedioNoSpeech * 100).toFixed(0)}% en los segmentos — posible audio con ruido, volumen bajo o tramos mal transcritos.`,
      };
    }
    if (fraccionSospechosos > 0.3) {
      return {
        calidadBaja: true,
        motivo: `${(fraccionSospechosos * 100).toFixed(0)}% de los segmentos con alta probabilidad de "sin voz" — posible tramo con múltiples hablantes, acento marcado o audio muy comprimido.`,
      };
    }
    return { calidadBaja: false, motivo: null };
  }

  private async descargarOriginal(storageKey: string | null): Promise<Buffer> {
    if (!storageKey) throw new Error('La evidencia no tiene archivo original en Storage');
    const { data, error } = await this.supabase.storage.from('audit-files').download(storageKey);
    if (error || !data) throw new Error(error?.message ?? 'No se pudo descargar el archivo original');
    return Buffer.from(await data.arrayBuffer());
  }

  // ─── Duración de video, mejor esfuerzo (EVD-15) ──────────────────────────
  // Parseo directo de cajas ISO-BMFF (ISO/IEC 14496-12) dentro de `moov` de un
  // contenedor MP4/MOV/M4V — cubre el caso común (cámara de teléfono, la mayoría
  // de grabadores web). Sin librería de video en Node en este repo y no se
  // instala ffmpeg solo para esto; contenedores no reconocibles (ej. WebM)
  // devuelven null sin bloquear la subida — la validación definitiva ocurre
  // igual en ai-service tras decodificar (ver procesarVideo), que si el video
  // resulta más largo marca la evidencia FAILED en vez de dejarla atascada.
  //
  // Preferimos la duración de la PISTA DE VIDEO (mdia→mdhd de la pista cuyo
  // hdlr dice 'vide') sobre `mvhd` de nivel película: `mvhd` reporta el máximo
  // entre TODAS las pistas, así que si la pista de audio dura más que la de
  // video (caso real: video de ~6s con una cola de audio de ~11-12s) `mvhd`
  // sobreestima y el pre-check de 180s podría rechazar por error un video
  // legítimamente corto. Si no se puede identificar la pista de video
  // (contenedor atípico, estructura no reconocida), cae a `mvhd` como
  // fallback — mismo principio de "nunca bloquear la subida por no poder
  // parsear" que ya seguía el código original.
  private extraerDuracionMp4Seg(buffer: Buffer): number | null {
    try {
      let offset = 0;
      while (offset + 8 <= buffer.length) {
        const size = buffer.readUInt32BE(offset);
        const type = buffer.toString('ascii', offset + 4, offset + 8);
        if (size < 8) break;
        if (type === 'moov') {
          const moovStart = offset + 8;
          const moovEnd = Math.min(offset + size, buffer.length);
          const duracionVideo = this.buscarDuracionPistaVideo(buffer, moovStart, moovEnd);
          if (duracionVideo !== null) return duracionVideo;
          return this.buscarMvhd(buffer, moovStart, moovEnd);
        }
        offset += size;
      }
    } catch {
      // formato inesperado o buffer truncado — no rompe la subida.
    }
    return null;
  }

  // Recorre moov → trak (una por pista — puede haber varias: video, audio, a
  // veces subtítulos/metadata) → mdia → hdlr para identificar cuál trak es de
  // video (Handler Reference Box, ISO/IEC 14496-12 §8.4.3: el handler type es
  // un FourCC de 4 bytes en el offset 16 desde el inicio de la caja hdlr —
  // 8 bytes de cabecera de caja + 4 bytes version/flags + 4 bytes pre_defined
  // reservado), y una vez identificada, lee su duración real en la misma
  // mdia → mdhd (Media Header Box — mismo layout version 0/1 que mvhd,
  // ver leerDuracionCajaHeader). Esa duración está en el timescale propio de
  // la pista, no el de la película, pero el cálculo duration/timescale es
  // el mismo. null si ningún trak resulta identificable como video.
  private buscarDuracionPistaVideo(buffer: Buffer, moovStart: number, moovEnd: number): number | null {
    for (const trakOffset of this.todasLasCajasHijas(buffer, moovStart, moovEnd, 'trak')) {
      const trakSize = buffer.readUInt32BE(trakOffset);
      const trakEnd = Math.min(trakOffset + trakSize, moovEnd);

      const mdiaOffset = this.primeraCajaHija(buffer, trakOffset + 8, trakEnd, 'mdia');
      if (mdiaOffset === null) continue;
      const mdiaSize = buffer.readUInt32BE(mdiaOffset);
      const mdiaEnd = Math.min(mdiaOffset + mdiaSize, trakEnd);

      const hdlrOffset = this.primeraCajaHija(buffer, mdiaOffset + 8, mdiaEnd, 'hdlr');
      if (hdlrOffset === null) continue;
      const handlerType = buffer.toString('ascii', hdlrOffset + 16, hdlrOffset + 20);
      if (handlerType !== 'vide') continue;

      const mdhdOffset = this.primeraCajaHija(buffer, mdiaOffset + 8, mdiaEnd, 'mdhd');
      if (mdhdOffset === null) continue;
      const duracion = this.leerDuracionCajaHeader(buffer, mdhdOffset);
      if (duracion !== null) return duracion;
    }
    return null;
  }

  private buscarMvhd(buffer: Buffer, start: number, end: number): number | null {
    const mvhdOffset = this.primeraCajaHija(buffer, start, end, 'mvhd');
    return mvhdOffset === null ? null : this.leerDuracionCajaHeader(buffer, mvhdOffset);
  }

  // ─── Utilidades genéricas de recorrido ISO-BMFF ──────────────────────────
  // Convención compartida por todo este archivo: un "offset de caja" apunta al
  // campo `size` (4 bytes) de esa caja — su contenido empieza en offset+8.

  // Primera caja hija de tipo `tipo` dentro de [start, end). null si no aparece
  // o el rango es inconsistente (buffer truncado, size < 8).
  private primeraCajaHija(buffer: Buffer, start: number, end: number, tipo: string): number | null {
    let offset = start;
    while (offset + 8 <= end) {
      const size = buffer.readUInt32BE(offset);
      const type = buffer.toString('ascii', offset + 4, offset + 8);
      if (size < 8) break;
      if (type === tipo) return offset;
      offset += size;
    }
    return null;
  }

  // Como primeraCajaHija pero devuelve TODAS las cajas hijas de ese tipo —
  // usado para 'trak', que se repite una vez por pista.
  private todasLasCajasHijas(buffer: Buffer, start: number, end: number, tipo: string): number[] {
    const resultado: number[] = [];
    let offset = start;
    while (offset + 8 <= end) {
      const size = buffer.readUInt32BE(offset);
      const type = buffer.toString('ascii', offset + 4, offset + 8);
      if (size < 8) break;
      if (type === tipo) resultado.push(offset);
      offset += size;
    }
    return resultado;
  }

  // Lee duration/timescale de una caja de header tipo mvhd/mdhd — mismo layout
  // en ambas (ISO/IEC 14496-12 §8.2.2 Movie Header Box / §8.4.2 Media Header
  // Box): version(1 byte) determina si creation_time/modification_time/duration
  // son de 32 o 64 bits. `offset` es el offset de caja (posición del campo size).
  private leerDuracionCajaHeader(buffer: Buffer, offset: number): number | null {
    const version = buffer.readUInt8(offset + 8);
    if (version === 1) {
      const timescale = buffer.readUInt32BE(offset + 8 + 4 + 8 + 8);
      const duration = buffer.readBigUInt64BE(offset + 8 + 4 + 8 + 8 + 4);
      return timescale > 0 ? Number(duration) / timescale : null;
    }
    const timescale = buffer.readUInt32BE(offset + 8 + 4 + 4 + 4);
    const duration = buffer.readUInt32BE(offset + 8 + 4 + 4 + 4 + 4);
    return timescale > 0 ? duration / timescale : null;
  }

  // ─── Extracción estructurada + validación anti-alucinación (EVD-05/EVD-06) ──

  private async ejecutarExtraccion(
    evidenceId: string,
    framesVideo?: { tsSeg: number; base64: string; mimeType: string }[],
  ) {
    const evidencia = await this.prisma.fieldEvidence.findUnique({ where: { id: evidenceId } });
    if (!evidencia) return;

    const transcript = evidencia.transcript as {
      texto?: string;
      segmentos?: { inicio: number; fin: number; texto: string; hablante?: string | null; no_speech_prob?: number; avg_logprob?: number }[];
    } | null;
    const esFoto = evidencia.kind === FieldEvidenceKind.ANNOTATED_PHOTO;
    const esVideo = evidencia.kind === FieldEvidenceKind.SHORT_VIDEO;
    const esPdf = evidencia.kind === FieldEvidenceKind.PDF_DOCUMENT;
    const anotaciones = esFoto ? (evidencia.anotaciones as unknown as AnotacionFoto[] | null) ?? [] : [];
    // Video (§decisión EVD-15): si `transcript` está poblado, el video tenía
    // pista de audio (procesarVideo solo lo guarda cuando aiService.processVideo
    // reportó tiene_audio=true) y ESA es la fuente citable — nunca se mezcla con
    // descripcion aunque ambas existan. Solo cuando no hay transcript (video
    // silencioso, ya validado con descripcion no vacía en procesarVideo) se usa
    // la descripción del auditor como texto fuente.
    const usaDescripcionComoFuenteVideo = esVideo && !transcript;
    const fuenteTexto = this.derivarFuenteTexto(evidencia, transcript, anotaciones, esFoto, esPdf, usaDescripcionComoFuenteVideo);

    // Una foto ES la evidencia aunque el auditor no haya escrito ninguna nota en
    // las zonas marcadas — a diferencia de texto/audio/video, "sin texto fuente"
    // no significa "no hay nada que analizar" (§6.9 se relaja solo para este
    // kind; los hallazgos sin nota literal que citar simplemente no se generan,
    // ver el prompt de extracción en evidence.py).
    if (!fuenteTexto.trim() && !esFoto) {
      await this.prisma.fieldEvidence.update({
        where: { id: evidenceId },
        data:  { status: 'FAILED', errorMsg: 'No hay texto fuente para extraer (transcripción vacía).' },
      });
      return;
    }

    try {
      const inicio = Date.now();
      // paperId nunca es null aquí — solo las notas de contexto del investigador
      // (Fase 2b) tienen paperId:null, y esas nunca llegan a ejecutarExtraccion()
      // (procesarContextoBackground() no la invoca, ver esa sección más abajo).
      const contextoExpediente = await this.construirContextoExpediente(evidencia as typeof evidencia & { paperId: string });
      let imagenes: { base64: string; mimeType: string; tsSeg?: number }[] | undefined;
      if (esFoto) {
        const buffer = await this.descargarOriginal(evidencia.storageKey);
        imagenes = [{ base64: buffer.toString('base64'), mimeType: evidencia.mimeType ?? 'image/jpeg' }];
      } else if (esVideo && framesVideo?.length) {
        imagenes = framesVideo.map(f => ({ base64: f.base64, mimeType: f.mimeType, tsSeg: f.tsSeg }));
      }
      const resultado = await this.aiService.extractFieldEvidence({
        fuente_tipo: evidencia.kind === FieldEvidenceKind.TEXT_NOTE
          ? 'texto' : esFoto ? 'foto_anotada' : esPdf ? 'pdf_documento' : esVideo ? 'video_corto' : 'transcripcion_audio',
        contenido: fuenteTexto,
        segmentos: transcript?.segmentos?.length ? transcript.segmentos : undefined,
        contexto_expediente: contextoExpediente,
        // Si la descripción ya se usó como fuenteTexto (video silencioso), no la
        // repite aquí — evita mandarle al LLM el mismo texto dos veces.
        instrucciones_extra: [
          usaDescripcionComoFuenteVideo ? null : evidencia.descripcion,
          evidencia.lugar ? `Lugar: ${evidencia.lugar}` : null,
          evidencia.calidadBaja
            ? 'Nota: esta fuente fue marcada de calidad baja (OCR degradado o transcripción difícil) — sé tolerante con errores obvios, pero cita_textual sigue debiendo ser subcadena literal del texto entregado.'
            : null,
        ].filter(Boolean).join('\n') || undefined,
        imagenes: imagenes?.map(i => ({ base64: i.base64, mime_type: i.mimeType, ts_seg: i.tsSeg })),
        anotaciones: esFoto ? anotaciones : undefined,
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
              resumen_ejecutivo:       resultado.resumen_ejecutivo,
              temas:                   resultado.temas,
              entidades_mencionadas:   resultado.entidades_mencionadas,
              // Fase 2a: antes se descartaban — necesarios para "reprocesar
              // grafo desde caché" (reprocesarGrafo()) sin volver a llamar al LLM.
              entidades_estructuradas: resultado.entidades_estructuradas,
              relaciones:              resultado.relaciones,
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

      // Grafo de Evidencia (Fase 1) — best-effort, mismo criterio que otros
      // pasos auxiliares del pipeline: NUNCA bloquea/revierte el resultado
      // principal de hallazgos, que ya se persistió arriba.
      try {
        await this.investigationGraphService.recordExtraction(
          evidencia.auditId,
          evidenceId,
          fuenteNormalizada,
          resultado.entidades_estructuradas,
          resultado.relaciones,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`Grafo de evidencia: fallo registrando entidades/relaciones para ${evidenceId}: ${message}`);
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

  // Deriva el texto fuente citable según el kind — extraído de ejecutarExtraccion()
  // (Fase 2a) para que reprocesarGrafo() lo reutilice sin duplicar la lógica.
  private derivarFuenteTexto(
    evidencia: { kind: FieldEvidenceKind; textoOriginal: string | null; descripcion: string | null },
    transcript: { texto?: string; segmentos?: { texto: string; hablante?: string | null }[] } | null,
    anotaciones: AnotacionFoto[],
    esFoto: boolean,
    esPdf: boolean,
    usaDescripcionComoFuenteVideo: boolean,
  ): string {
    if (evidencia.kind === FieldEvidenceKind.TEXT_NOTE) return evidencia.textoOriginal ?? '';
    if (esFoto) return this.construirTextoDesdeAnotaciones(anotaciones);
    if (esPdf) return transcript?.texto ?? '';
    if (usaDescripcionComoFuenteVideo) return evidencia.descripcion ?? '';
    return this.construirTextoConHablantes(transcript);
  }

  // Entrevista diarizada (EVD-12): si los segmentos traen `hablante`, la fuente para
  // extracción/anti-alucinación se reconstruye con etiqueta de hablante por segmento
  // en vez del `texto` plano de Whisper — así el LLM puede atribuir citas a quien las
  // dijo. `cita_textual` sigue siendo un substring literal de este texto (la etiqueta
  // no es parte de la cita en sí, el LLM cita solo las palabras).
  // Foto anotada (EVD-14): la "fuente" citable para anti-alucinación es lo que el
  // AUDITOR escribió sobre cada zona marcada — no una descripción visual inventada
  // por el LLM. Zonas sin nota simplemente no aportan texto citable (el prompt de
  // extracción ya le dice al LLM que no genere hallazgo para esas). Numeración
  // 1-based consistente con "zona #N" que el LLM usa en fuente_ref.
  private construirTextoDesdeAnotaciones(anotaciones: AnotacionFoto[]): string {
    return anotaciones
      .map((a, i) => (a.nota?.trim() ? `[zona #${i + 1}] ${a.nota.trim()}` : null))
      .filter((s): s is string => !!s)
      .join('\n');
  }

  private construirTextoConHablantes(
    transcript: { texto?: string; segmentos?: { texto: string; hablante?: string | null }[] } | null,
  ): string {
    const segmentos = transcript?.segmentos;
    if (!segmentos?.length || !segmentos.some(s => s.hablante)) {
      return transcript?.texto ?? '';
    }
    return segmentos.map(s => `[${s.hablante ?? '¿?'}] ${s.texto}`).join(' ');
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

  // ─── Reproducción/descarga del archivo original (validez evidenciaria) ─────
  // "view": URL firmada de corta duración para escuchar/ver en pantalla — misma
  // población que ya puede leer el transcript y la cita literal completos en la
  // UI (KINDS_SOPORTADOS + @Roles(AUDITOR) del controller), así que reproducir
  // el original no expone más de lo que el hallazgo ya muestra en texto.
  // "download": copia local permanente — a diferencia de "view", rompe la
  // trazabilidad de acceso (una vez descargado, ya no hay registro de quién lo
  // reenvía). Se reserva a quien capturó la evidencia o a roles de supervisión.
  private static readonly ROLES_DESCARGA = new Set([
    'SENIOR_AUDITOR', 'AUDIT_MANAGER', 'CAE', 'ADMIN', 'SUPER_ADMIN',
  ]);

  async obtenerUrlMedia(
    paperId: string,
    evidenceId: string,
    modo: 'view' | 'download',
    user: AuthUser,
  ): Promise<{ url: string; expiresIn: number }> {
    await this.assertPaperAccess(paperId, user);

    const evidencia = await this.prisma.fieldEvidence.findUnique({ where: { id: evidenceId } });
    if (!evidencia || evidencia.paperId !== paperId) throw new NotFoundException('Evidencia no encontrada');
    if (!evidencia.storageKey) {
      throw new BadRequestException('Esta evidencia no tiene archivo original (nota de texto — el texto ES la evidencia).');
    }

    if (modo === 'download') {
      const puedeDescargar = evidencia.capturedById === user.id
        || FieldEvidenceService.ROLES_DESCARGA.has(user.role);
      if (!puedeDescargar) {
        throw new ForbiddenException(
          'Solo quien capturó esta evidencia o un rol de supervisión (Senior/Gerente/CAE) puede descargarla. ' +
          'El resto del equipo con acceso al encargo puede escucharla/verla, pero no llevarse una copia.',
        );
      }
    }

    const EXPIRES_IN = 300; // 5 min — se regenera en cada solicitud, nunca se persiste
    const { data, error } = await this.supabase.storage
      .from('audit-files')
      .createSignedUrl(
        evidencia.storageKey,
        EXPIRES_IN,
        modo === 'download' ? { download: evidencia.filename ?? true } : undefined,
      );
    if (error || !data) throw new Error(error?.message ?? 'No se pudo generar la URL del archivo original');

    return { url: data.signedUrl, expiresIn: EXPIRES_IN };
  }

  // ─── Reintentar análisis (evidencia FAILED, ej. por créditos de LLM agotados) ─
  // El archivo original ya está en Storage — no hace falta re-subir nada, solo
  // volver a disparar el pipeline. procesarEvidenciaBackground ya sabe descargar
  // el original de Storage cuando no recibe un buffer en memoria (línea ~204).
  async reintentar(paperId: string, evidenceId: string, user: AuthUser) {
    await this.assertPaperAccess(paperId, user);

    const evidencia = await this.prisma.fieldEvidence.findUnique({ where: { id: evidenceId } });
    if (!evidencia || evidencia.paperId !== paperId) throw new NotFoundException('Evidencia no encontrada');
    if (evidencia.status !== 'FAILED') {
      throw new BadRequestException('Solo se puede reintentar una evidencia en estado "Falló".');
    }

    await this.prisma.fieldEvidence.update({
      where: { id: evidenceId },
      data:  { status: 'UPLOADED', errorMsg: null },
    });

    this.procesarEvidenciaBackground(evidenceId).catch(err =>
      this.logger.error(`Fallo reintentando evidencia ${evidenceId}: ${err.message}`, err.stack),
    );

    return this.prisma.fieldEvidence.findUniqueOrThrow({ where: { id: evidenceId } });
  }

  // ─── Reprocesar grafo desde caché (Fase 2a Investigador Forense) ────────
  // Distinto de reintentar(): no vuelve a llamar al LLM, solo re-registra en el
  // grafo lo que la extracción YA produjo (extraccionRaw.entidades_estructuradas/
  // relaciones, agregado como campo persistido en esta misma fase). Cubre el caso
  // "los hallazgos quedaron READY pero investigationGraphService.recordExtraction
  // falló después" — antes no había forma de recuperar solo esa parte sin repetir
  // toda la extracción (y duplicar FieldEvidenceFinding). A diferencia del
  // best-effort dentro de ejecutarExtraccion(), esto NO traga errores — es una
  // acción iniciada por el usuario, el fallo debe llegar al frontend.
  async reprocesarGrafo(paperId: string, evidenceId: string, user: AuthUser) {
    await this.assertPaperAccess(paperId, user);

    const evidencia = await this.prisma.fieldEvidence.findUnique({ where: { id: evidenceId } });
    if (!evidencia || evidencia.paperId !== paperId) throw new NotFoundException('Evidencia no encontrada');
    if (evidencia.status !== 'READY') {
      throw new BadRequestException('Solo se puede reprocesar el grafo de una evidencia en estado "Listo".');
    }

    const raw = evidencia.extraccionRaw as {
      entidades_estructuradas?: { nombre: string; tipo: string; cita_textual: string }[];
      relaciones?: { entidad_origen: string; entidad_destino: string; tipo: string; cita_textual: string; confianza: number }[];
    } | null;
    if (raw?.entidades_estructuradas === undefined && raw?.relaciones === undefined) {
      throw new BadRequestException(
        'Esta evidencia no tiene datos de extracción cacheados para el grafo (se procesó antes de que este reproceso existiera) — no se puede reprocesar sin volver a llamar a la IA.',
      );
    }

    const anotaciones = (evidencia.anotaciones as unknown as AnotacionFoto[] | null) ?? [];
    const transcript = evidencia.transcript as { texto?: string; segmentos?: { texto: string; hablante?: string | null }[] } | null;
    const esFoto = evidencia.kind === FieldEvidenceKind.ANNOTATED_PHOTO;
    const esVideo = evidencia.kind === FieldEvidenceKind.SHORT_VIDEO;
    const esPdf = evidencia.kind === FieldEvidenceKind.PDF_DOCUMENT;
    const usaDescripcionComoFuenteVideo = esVideo && !transcript;
    const fuenteTexto = this.derivarFuenteTexto(evidencia, transcript, anotaciones, esFoto, esPdf, usaDescripcionComoFuenteVideo);
    const fuenteNormalizada = this.normalizarParaComparar(fuenteTexto);

    await this.investigationGraphService.reprocessFromCache(
      evidencia.auditId, evidenceId, fuenteNormalizada,
      raw?.entidades_estructuradas ?? [], raw?.relaciones ?? [],
    );
    return { ok: true, auditId: evidencia.auditId };
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

  // ─── Contexto previo del auditor — Investigador Forense SHERLOCK (Fase 2b) ──
  // Notas de texto/voz que el auditor captura ANTES de pedir un informe de
  // SHERLOCK — background/hipótesis que ya cree conocer, para que el informe
  // las verifique contra el grafo real. Reutilizan el pipeline de FieldEvidence
  // (TEXT_NOTE/AUDIO_NOTE: transcripción ya construida) con paperId:null y
  // proposito:CONTEXTO_INVESTIGADOR — así (a) nunca aparecen en ningún grid
  // normal de evidencia (listar() filtra por paperId, las notas de contexto no
  // matchean nunca) y (b) procesarContextoBackground() NUNCA llama a
  // ejecutarExtraccion(), así que estructuralmente jamás entran al grafo
  // compartido — es la garantía real de la salvaguarda anti-sesgo de
  // confirmación (docs/investigador-forense-multimodal-propuesta.md), no solo
  // una instrucción de prompt.

  async crearContextoInvestigador(
    auditId: string,
    dto: { kind: FieldEvidenceKind; capturedAt: string; texto?: string },
    file: UploadedFileLike | undefined,
    user: AuthUser,
  ) {
    await this.assertAuditAccessInvestigacion(auditId, user);

    if (!dto.kind || !KINDS_CONTEXTO_INVESTIGADOR.includes(dto.kind)) {
      throw new BadRequestException('El contexto previo solo admite nota de texto o nota de voz.');
    }
    if (!dto.capturedAt || Number.isNaN(Date.parse(dto.capturedAt))) {
      throw new BadRequestException('capturedAt debe ser una fecha ISO válida.');
    }
    if (dto.kind === FieldEvidenceKind.TEXT_NOTE && !dto.texto?.trim()) {
      throw new BadRequestException('El texto es obligatorio para una nota de texto.');
    }
    if (dto.kind === FieldEvidenceKind.AUDIO_NOTE && !file) {
      throw new BadRequestException('Se requiere un archivo de audio.');
    }

    const sha256 = file
      ? createHash('sha256').update(file.buffer).digest('hex')
      : createHash('sha256').update(Buffer.from(dto.texto!, 'utf-8')).digest('hex');

    const evidencia = await this.prisma.fieldEvidence.create({
      data: {
        auditId,
        paperId:        null,
        sectionKey:      SHERLOCK_CONTEXT_SECTION_KEY,
        kind:            dto.kind,
        status:          'UPLOADED',
        proposito:       'CONTEXTO_INVESTIGADOR',
        filename:        file?.originalname,
        mimeType:        file?.mimetype,
        size:            file?.size ?? Buffer.byteLength(dto.texto ?? '', 'utf-8'),
        sha256,
        textoOriginal:   dto.kind === FieldEvidenceKind.TEXT_NOTE ? dto.texto : null,
        capturedById:    user.id,
        capturedByName:  user.email,
        capturedAt:      new Date(dto.capturedAt),
      },
    });

    if (file) {
      const safeName = file.originalname.replace(/[^\w.\-]/g, '_');
      const path = `evidence/${auditId}/_investigacion/${evidencia.id}_${safeName}`;

      const { error: upErr } = await this.supabase.storage
        .from('audit-files')
        .upload(path, file.buffer, {
          contentType:  file.mimetype || 'application/octet-stream',
          cacheControl: '3600',
          upsert:       false,
        });
      if (upErr) {
        await this.prisma.fieldEvidence.delete({ where: { id: evidencia.id } });
        throw new BadRequestException(`Error al subir archivo: ${upErr.message}`);
      }
      await this.prisma.fieldEvidence.update({ where: { id: evidencia.id }, data: { storageKey: path } });
    }

    this.procesarContextoBackground(evidencia.id, file?.buffer).catch(err =>
      this.logger.error(`Fallo procesando contexto de investigador ${evidencia.id}: ${err.message}`, err.stack),
    );

    return this.prisma.fieldEvidence.findUniqueOrThrow({ where: { id: evidencia.id } });
  }

  private async procesarContextoBackground(evidenceId: string, fileBuffer?: Buffer) {
    const evidencia = await this.prisma.fieldEvidence.findUnique({ where: { id: evidenceId } });
    if (!evidencia) return;

    if (evidencia.kind === FieldEvidenceKind.TEXT_NOTE) {
      // El texto YA es la evidencia — nada que transcribir.
      await this.prisma.fieldEvidence.update({ where: { id: evidenceId }, data: { status: 'READY' } });
      return;
    }

    // AUDIO_NOTE — diarizar=false siempre (nunca es una entrevista formal).
    await this.prisma.fieldEvidence.update({
      where: { id: evidenceId },
      data:  { status: 'TRANSCRIBING', procesamientoIniciado: new Date() },
    });
    try {
      const buffer = fileBuffer ?? await this.descargarOriginal(evidencia.storageKey);
      const inicio = Date.now();
      const resultado = await this.aiService.transcribeAudio(
        buffer, evidencia.filename ?? 'audio', evidencia.mimeType ?? 'audio/mpeg', undefined, false,
      );
      const { calidadBaja, motivo } = this.evaluarCalidadTranscripcion(resultado.segmentos);
      await this.prisma.fieldEvidence.update({
        where: { id: evidenceId },
        data: {
          status:              'READY',
          transcript:          resultado,
          modeloTranscripcion: resultado.modelo,
          processingMs:        Date.now() - inicio,
          calidadBaja,
          calidadMotivo:       motivo,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Transcripción de contexto de investigador falló para ${evidenceId}: ${message}`);
      await this.prisma.fieldEvidence.update({
        where: { id: evidenceId },
        data:  { status: 'FAILED', errorMsg: message },
      });
    }
  }

  async listarContextoInvestigador(auditId: string, user: AuthUser) {
    await this.assertAuditAccessInvestigacion(auditId, user);
    return this.prisma.fieldEvidence.findMany({
      where:   { auditId, proposito: 'CONTEXTO_INVESTIGADOR' },
      orderBy: { capturedAt: 'desc' },
    });
  }

  async eliminarContextoInvestigador(auditId: string, evidenceId: string, user: AuthUser) {
    await this.assertAuditAccessInvestigacion(auditId, user);
    const evidencia = await this.prisma.fieldEvidence.findUnique({ where: { id: evidenceId } });
    if (!evidencia || evidencia.auditId !== auditId || evidencia.proposito !== 'CONTEXTO_INVESTIGADOR') {
      throw new NotFoundException('Nota de contexto no encontrada');
    }
    if (evidencia.storageKey) {
      await this.supabase.storage.from('audit-files').remove([evidencia.storageKey]);
    }
    await this.prisma.fieldEvidence.delete({ where: { id: evidenceId } });
    return { deleted: true };
  }

  // Mismo criterio de acceso que working-papers.service.ts:assertAuditAccess —
  // duplicado deliberado y pequeño (igual que ya hace investigation-graph.service.ts
  // con su propia variante), no vale la pena un guard cross-módulo para 12 líneas.
  private async assertAuditAccessInvestigacion(auditId: string, user: AuthUser) {
    const audit = await this.prisma.audit.findFirst({
      where:   { id: auditId, organizationId: user.organizationId },
      include: { team: { select: { userId: true } } },
    });
    if (!audit) throw new NotFoundException('Auditoría no encontrada');
    if (audit.isInvestigationMode) {
      const onTeam     = audit.team.some(m => m.userId === user.id);
      const privileged  = (['CAE', 'ADMIN', 'SUPER_ADMIN'] as string[]).includes(user.role);
      if (!onTeam && !privileged) throw new ForbiddenException('Acceso restringido — modo investigación');
    }
    return audit;
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
