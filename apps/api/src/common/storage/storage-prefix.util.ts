import { Logger } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { STORAGE_BUCKET } from './storage-url.service';

const logger = new Logger('StoragePrefix');
const PAGE = 1000;
const REMOVE_BATCH = 100;
const MAX_DEPTH = 6;

/** Todas las rutas de archivos bajo una carpeta del bucket (recorre las subcarpetas; `item.id` solo viene en los archivos). */
export async function listStorageFiles(client: SupabaseClient, folder: string, depth = 0): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await client.storage.from(STORAGE_BUCKET).list(folder, { limit: PAGE, offset });
    if (error || !data) { if (error) logger.warn(`No se pudo listar '${folder}': ${error.message}`); break; }
    for (const item of data) {
      const full = folder ? `${folder}/${item.name}` : item.name;
      if (item.id) out.push(full);
      else if (depth < MAX_DEPTH) out.push(...await listStorageFiles(client, full, depth + 1)); // «carpeta»
    }
    if (data.length < PAGE) break;
  }
  return out;
}

/**
 * Borra los archivos bajo cada carpeta dada (best-effort: un fallo de Storage nunca debe deshacer el borrado de la fila que ya ocurrió;
 * queda en el log y el barrido de huérfanos lo encuentra). Rechaza carpetas vacías o con `..` y solo borra DENTRO de ellas.
 */
export async function removeStoragePrefixes(client: SupabaseClient, folders: string[]): Promise<{ removed: number; failed: number }> {
  let removed = 0;
  let failed = 0;
  for (const raw of folders) {
    const folder = raw.replace(/\/+$/, '');
    if (!folder || folder.includes('..') || folder.startsWith('/')) continue;
    try {
      const files = await listStorageFiles(client, folder);
      for (let i = 0; i < files.length; i += REMOVE_BATCH) {
        const batch = files.slice(i, i + REMOVE_BATCH);
        const { data, error } = await client.storage.from(STORAGE_BUCKET).remove(batch);
        if (error) { failed += batch.length; logger.warn(`No se pudo borrar un lote de ${batch.length} archivo(s) de '${folder}': ${error.message}`); continue; }
        removed += data?.length ?? 0;
        failed += batch.length - (data?.length ?? 0);
      }
    } catch (e) {
      logger.warn(`No se pudo limpiar '${folder}': ${String(e)}`);
    }
  }
  return { removed, failed };
}
