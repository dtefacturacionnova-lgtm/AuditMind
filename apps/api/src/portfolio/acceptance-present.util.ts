import type { AcceptanceCheck, Prisma } from '@prisma/client';
import { mergeChecklist } from './acceptance-checklist.util';
import { screeningMatches } from './screening-review.util';

/**
 * Lo que ve la pantalla de un Radar de Aceptación: sin decidir siempre trae los tres ítems fijos del checklist (los Radar anteriores
 * a esa regla los traían vacíos) y el screening trae sus coincidencias con la revisión de cada una. Un Radar ya decidido se muestra
 * tal como quedó.
 */
export function presentAcceptanceCheck<T extends AcceptanceCheck>(check: T) {
  const result = check.sanctionsScreeningResult as Record<string, unknown> | null;
  return {
    ...check,
    checklist: check.decidedAt ? check.checklist : (mergeChecklist(check.checklist) as unknown as Prisma.JsonValue),
    sanctionsScreeningResult: result ? { ...result, matches: screeningMatches(result as never) } : result,
  };
}
