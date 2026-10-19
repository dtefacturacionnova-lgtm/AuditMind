/**
 * Carpeta del expediente donde debe vivir un papel según su sección de índice (`WorkingPaper.indexSection`).
 *
 *  1. Una carpeta cuyo `ref` coincide exactamente con la sección (p. ej. «B» → carpeta B).
 *  2. Si no hay, la carpeta raíz de la sección (p. ej. «B-DDC» → carpeta B).
 *  3. Si tampoco, null: el papel queda sin carpeta y la interfaz lo muestra en «Sin carpeta».
 *
 * Lógica pura: la usan `AuditFoldersService` (enganchar papeles huérfanos) y `AuditIndexService` (agregar un papel de la
 * plantilla). Antes «Agregar papel» lo creaba SIN carpeta y el árbol del Expediente, que solo muestra papeles dentro de una
 * carpeta, no lo mostraba (reportado por el usuario, 2026-10-19).
 */
export function resolveFolderId(indexSection: string | null | undefined, byRef: ReadonlyMap<string, string>): string | null {
  const section = (indexSection ?? '').trim();
  if (!section) return null;
  const exact = byRef.get(section);
  if (exact) return exact;
  const root = section.split('-')[0];
  return root && root !== section ? (byRef.get(root) ?? null) : null;
}
