import { Injectable, Logger } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Acceso al bucket privado `audit-files` para los archivos de firma
 * (docs/firma-externa-por-enlace.md §4). Las rutas son SIEMPRE "desnudas" (sin URL): los enlaces
 * se generan firmados y de vida corta (10 min) al entregarlos, nunca se guardan.
 *
 *   signature-requests/<auditId | org-<organizationId>>/<requestId>/original.pdf
 *   signature-requests/<scope>/<requestId>/signed.pdf
 *   signature-requests/<scope>/<requestId>/attachments/<attId>.pdf            (reconstruido)
 *   signature-requests/<scope>/<requestId>/attachments/quarantine/<attId>.<ext> (original)
 */
export const SIGNATURE_BUCKET = 'audit-files';
export const SIGNED_URL_SECONDS = 600; // 10 min

export function requestFolder(requestId: string, organizationId: string, auditId: string | null): string {
  return `signature-requests/${auditId ?? `org-${organizationId}`}/${requestId}`;
}

@Injectable()
export class SignatureStorageService {
  private readonly logger = new Logger(SignatureStorageService.name);
  private readonly client: SupabaseClient;

  constructor() {
    this.client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  async upload(path: string, data: Buffer, contentType: string, upsert = false): Promise<void> {
    const { error } = await this.client.storage.from(SIGNATURE_BUCKET).upload(path, data, { contentType, upsert, cacheControl: '3600' });
    if (error) throw new Error(`No se pudo guardar el archivo en Storage: ${error.message}`);
  }

  async download(path: string): Promise<Buffer> {
    const { data, error } = await this.client.storage.from(SIGNATURE_BUCKET).download(path);
    if (error || !data) throw new Error(`No se pudo leer el archivo de Storage: ${error?.message ?? 'vacío'}`);
    return Buffer.from(await data.arrayBuffer());
  }

  /** Borrado de mejor esfuerzo: nunca lanza (un archivo huérfano es preferible a abortar un flujo). */
  async remove(paths: string[]): Promise<void> {
    const real = paths.filter(Boolean);
    if (real.length === 0) return;
    const { error } = await this.client.storage.from(SIGNATURE_BUCKET).remove(real);
    if (error) this.logger.warn(`No se pudieron borrar ${real.length} archivo(s) de Storage: ${error.message}`);
  }

  async signedUrl(path: string, seconds = SIGNED_URL_SECONDS): Promise<string> {
    const { data, error } = await this.client.storage.from(SIGNATURE_BUCKET).createSignedUrl(path, seconds);
    if (error || !data?.signedUrl) throw new Error(`No se pudo generar el enlace del archivo: ${error?.message ?? 'sin datos'}`);
    return data.signedUrl;
  }

  /** Lista (recursiva, un nivel de carpetas por llamada) las rutas bajo un prefijo. */
  async listAll(prefix: string): Promise<string[]> {
    const out: string[] = [];
    const walk = async (folder: string, depth: number): Promise<void> => {
      const { data, error } = await this.client.storage.from(SIGNATURE_BUCKET).list(folder, { limit: 1000 });
      if (error || !data) return;
      for (const item of data) {
        const full = `${folder}/${item.name}`;
        if (item.id) out.push(full);
        else if (depth < 4) await walk(full, depth + 1); // "carpeta"
      }
    };
    await walk(prefix.replace(/\/+$/, ''), 0);
    return out;
  }
}
