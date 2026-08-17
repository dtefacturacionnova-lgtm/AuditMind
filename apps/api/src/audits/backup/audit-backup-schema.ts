import { Prisma } from '@prisma/client';

/**
 * Deriva las FKs reales de un modelo directamente del DMMF de Prisma — mismo
 * principio que `verificarCompletitudModelos()` (BKP-03): en vez de mantener
 * a mano, por cada uno de los 32 modelos de `AUDIT_SCOPED_MODELS`, una lista
 * de "qué campo es FK a qué", se deriva del schema real. Si un modelo nuevo
 * agrega una FK, el remapeo de IDs al restaurar (BKP-07) la descubre sola —
 * no hay una lista separada que se pueda desincronizar del schema.
 */
export interface FkInfo {
  /** Nombre del campo escalar en la fila (ej. 'paperId'). */
  campo: string;
  /** Modelo de Prisma al que apunta (ej. 'WorkingPaper', 'User'). */
  modeloDestino: string;
  /** Si es `false` (campo opcional en el schema), una FK sin resolver se deja en `null`
   *  en vez de descartar toda la fila. */
  requerido: boolean;
}

const cache = new Map<string, FkInfo[]>();

export function obtenerFksDeModelo(nombreModeloCamel: string): FkInfo[] {
  if (cache.has(nombreModeloCamel)) return cache.get(nombreModeloCamel)!;

  const nombrePascal = nombreModeloCamel.charAt(0).toUpperCase() + nombreModeloCamel.slice(1);
  const def = Prisma.dmmf.datamodel.models.find(m => m.name === nombrePascal);
  const fks: FkInfo[] = def
    ? def.fields
        .filter(f => f.kind === 'object' && f.relationFromFields && f.relationFromFields.length > 0)
        .map(f => ({ campo: f.relationFromFields![0], modeloDestino: f.type, requerido: f.isRequired }))
    : [];

  cache.set(nombreModeloCamel, fks);
  return fks;
}
