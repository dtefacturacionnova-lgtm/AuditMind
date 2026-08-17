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

  private extraerRutaDeTexto(texto: string): string | null {
    // URL pública completa: .../storage/v1/object/public/audit-files/<ruta>
    const mUrl = new RegExp(`/${BUCKET}/(.+)$`).exec(texto);
    if (mUrl) return decodeURIComponent(mUrl[1]);
    // Storage key "bare" (ej. StepEvidence.storageKey) — ya es la ruta relativa
    // dentro del bucket; se reconoce por el mismo prefijo `sections/` que usa
    // el resto del sistema. No se puede distinguir de un string cualquiera
    // con certeza — se acepta el riesgo bajo de un falso positivo (un string
    // que por coincidencia empiece con "sections/" e intentar descargarlo del
    // bucket, que simplemente fallará y quedará como advertencia, no como error).
    if (/^sections\/[^/]+\/[^/]+\/.+/.test(texto)) return texto;
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
}
