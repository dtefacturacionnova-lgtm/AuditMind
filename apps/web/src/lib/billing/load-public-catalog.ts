import { parsePublicCatalog, type PublicCatalog } from './public-catalog';

/**
 * Lectura del catálogo público desde el servidor de la web (página /precios).
 *  · 'DISABLED' → el API respondió 404: la página de precios no está publicada (se muestra un 404 normal).
 *  · null       → no se pudo leer (el API caído, lento o con una respuesta rara): la página dice «no disponible» y no revienta.
 * No manda cookies ni credenciales: es una lectura pública. La respuesta se guarda 60 segundos en el servidor de la web, así el API recibe
 * ~1 consulta por minuto aunque la página tenga muchas visitas.
 */

export type CatalogResult = PublicCatalog | 'DISABLED' | null;

export const CATALOG_TIMEOUT_MS = 5000;
export const CATALOG_REVALIDATE_SECONDS = 60;

export async function loadPublicCatalog(
  apiBase: string, fetchImpl: typeof fetch = fetch,
): Promise<CatalogResult> {
  try {
    const res = await fetchImpl(`${apiBase.replace(/\/+$/, '')}/public/plans`, {
      headers: { Accept: 'application/json' },
      credentials: 'omit',
      signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS),
      next: { revalidate: CATALOG_REVALIDATE_SECONDS },
    } as RequestInit);
    if (res.status === 404) return 'DISABLED';
    if (!res.ok) return null;
    return parsePublicCatalog(await res.json());
  } catch {
    return null;
  }
}
