import { Injectable, Logger } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AuditBackupAdvertencia } from './audit-backup.types';

const BUCKET = 'audit-files';

/**
 * Enumeración y descarga de archivos adjuntos (BKP-04). Los adjuntos NO
 * viven en una tabla propia con FK a `Audit` — están embebidos como texto
 * (URL o key de Storage) dentro de columnas `Json` (`PaperSection.attachments`,
 * filas de MATRIX/ACCOUNT_SCHEDULE/SAMPLE_ITEM_REGISTER/etc. que cargan su
 * propio `attachments: [...]`) o en columnas de texto dedicadas
 * (`AuditRequestDocument.fileUrl`, `StepEvidence.storageKey`).
 *
 * En vez de enumerar a mano cada una de esas formas por modelo, se recorre
 * TODO el `data` ya exportado (BKP-03) buscando cualquier string que
 * contenga el nombre del bucket `audit-files` — es más robusto que mantener
 * una lista de "qué campo de qué modelo tiene adjuntos", porque cualquier
 * panel nuevo que agregue adjuntos embebidos en una fila queda cubierto
 * automáticamente, sin tocar este archivo.
 */
@Injectable()
export class AuditBackupFilesService {
  private readonly logger = new Logger(AuditBackupFilesService.name);
  private readonly supabaseAdmin: SupabaseClient;

  constructor() {
    this.supabaseAdmin = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }

  /** Recorre `data` completo y extrae toda ruta de Storage referenciada (sin duplicados). */
  extraerRutasDeArchivo(data: Record<string, unknown>): string[] {
    const rutas = new Set<string>();
    const visto = new WeakSet<object>();

    const visitar = (valor: unknown) => {
      if (valor === null || valor === undefined) return;
      if (typeof valor === 'string') {
        const ruta = this.extraerRutaDeTexto(valor);
        if (ruta) rutas.add(ruta);
        return;
      }
      if (typeof valor !== 'object') return;
      if (visto.has(valor)) return; // evita ciclos — no debería haberlos en JSON puro, pero defensivo
      visto.add(valor);
      if (Array.isArray(valor)) { valor.forEach(visitar); return; }
      Object.values(valor as Record<string, unknown>).forEach(visitar);
    };

    visitar(data);
    return Array.from(rutas);
  }

  /**
   * Prefijos "bare key" reales que este código genera al subir un archivo —
   * ver cada `.storage.from('audit-files').upload(...)`/`getPublicUrl(...)`
   * en `working-papers.service.ts` (sections/, procedures/, docevidence/,
   * acct-schedule/), `field-evidence.service.ts` (evidence/), y
   * `audit-procedures.service.ts` (procedures/steps/ — nota: coincide con el
   * mismo prefijo `procedures/` de arriba, listado aparte solo por claridad).
   * **2026-08-20**: antes solo reconocía `sections/`, así que `StepEvidence.
   * storageKey` (procedures/steps/…) y `FieldEvidence.storageKey`
   * (evidence/…) — ambos bare keys reales, no URLs — nunca se detectaban;
   * quedaban huérfanos en Storage tanto al hacer backup como al borrar un
   * encargo completo. Encontrado al diseñar el borrado completo de encargos.
   */
  private static readonly PREFIJOS_BARE = ['sections/', 'procedures/', 'docevidence/', 'acct-schedule/', 'evidence/'];

  private extraerRutaDeTexto(texto: string): string | null {
    // URL pública completa: .../storage/v1/object/public/audit-files/<ruta>
    const mUrl = new RegExp(`/${BUCKET}/(.+)$`).exec(texto);
    if (mUrl) return decodeURIComponent(mUrl[1]);
    // Storage key "bare" — ya es la ruta relativa dentro del bucket. No se
    // puede distinguir de un string cualquiera con certeza — se acepta el
    // riesgo bajo de un falso positivo (un string que por coincidencia
    // empiece con uno de estos prefijos e intente descargarlo/borrarlo del
    // bucket, que simplemente fallará y quedará como advertencia, no error).
    if (AuditBackupFilesService.PREFIJOS_BARE.some(p => texto.startsWith(p)) && /^[^/]+\/[^/]+\/.+/.test(texto)) {
      return texto;
    }
    return null;
  }

  async descargarArchivos(
    rutas: string[],
  ): Promise<{ archivos: Map<string, Buffer>; advertencias: AuditBackupAdvertencia[] }> {
    const archivos = new Map<string, Buffer>();
    const advertencias: AuditBackupAdvertencia[] = [];

    for (const ruta of rutas) {
      try {
        const { data, error } = await this.supabaseAdmin.storage.from(BUCKET).download(ruta);
        if (error || !data) {
          advertencias.push({ modelo: 'archivo', filaId: ruta, mensaje: `No se pudo descargar de Storage: ${error?.message ?? 'sin datos'} — se omite del backup` });
          continue;
        }
        archivos.set(ruta, Buffer.from(await data.arrayBuffer()));
      } catch (e) {
        advertencias.push({ modelo: 'archivo', filaId: ruta, mensaje: `Error inesperado al descargar: ${(e as Error).message}` });
      }
    }

    this.logger.log(`Backup: ${archivos.size}/${rutas.length} archivos descargados de Storage`);
    return { archivos, advertencias };
  }

  /**
   * Sube de vuelta un archivo restaurado, bajo una ruta remapeada (BKP-08).
   * Reintenta en fallos de transporte ("fetch failed" — sin respuesta
   * estructurada de Supabase, es un error de red/socket de Node, no un
   * rechazo de la API): confirmado en pruebas reales que un adjunto de
   * ~4MB puede fallar así de forma intermitente en esta red. Un error CON
   * respuesta de Supabase (ej. conflicto de ruta) no es transitorio — no
   * tiene sentido reintentarlo, así que no baja por este camino.
   */
  async subirArchivo(ruta: string, buffer: Buffer, mimeType: string, intentos = 3): Promise<void> {
    let ultimoError: string | undefined;
    for (let intento = 1; intento <= intentos; intento++) {
      const { error } = await this.supabaseAdmin.storage.from(BUCKET).upload(ruta, buffer, {
        contentType: mimeType || 'application/octet-stream',
        cacheControl: '3600',
        upsert: false,
      });
      if (!error) return;
      ultimoError = error.message;
      if (intento < intentos) {
        this.logger.warn(`Reintentando subida de '${ruta}' (intento ${intento}/${intentos}): ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, 500 * intento));
      }
    }
    throw new Error(`Error al restaurar archivo '${ruta}': ${ultimoError}`);
  }

  urlPublica(ruta: string): string {
    return this.supabaseAdmin.storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl;
  }

  /**
   * Borra un lote de rutas de Storage (borrado completo de encargos,
   * 2026-08-20) — en lotes de 100 porque la API de Supabase Storage no
   * garantiza soportar arrays arbitrariamente grandes en `.remove()`. Un
   * lote que falla se cuenta como error y se sigue con el resto — la fila de
   * base de datos que lo referenciaba ya fue borrada en este punto del
   * flujo, así que no tiene sentido abortar todo por un archivo huérfano que
   * no se pudo limpiar (mismo criterio de `removeRequestDocument` en
   * `audits.service.ts`: la limpieza de Storage es best-effort, nunca
   * bloquea la operación principal).
   */
  async borrarArchivos(rutas: string[]): Promise<{ ok: number; error: number }> {
    if (rutas.length === 0) return { ok: 0, error: 0 };
    let ok = 0;
    let error = 0;
    const LOTE = 100;
    for (let i = 0; i < rutas.length; i += LOTE) {
      const lote = rutas.slice(i, i + LOTE);
      const { data, error: err } = await this.supabaseAdmin.storage.from(BUCKET).remove(lote);
      if (err) {
        this.logger.warn(`Error al borrar lote de ${lote.length} archivo(s) de Storage: ${err.message}`);
        error += lote.length;
        continue;
      }
      ok += data?.length ?? 0;
      error += lote.length - (data?.length ?? 0);
    }
    this.logger.log(`Borrado de Storage: ${ok}/${rutas.length} archivo(s) eliminados`);
    return { ok, error };
  }
}
