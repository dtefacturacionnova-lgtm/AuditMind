/**
 * Backup y restauración de encargos — Contrato de tipos (BKP-01/02).
 * Ver `docs/backup-restauracion-encargos.md` para el diseño y la
 * justificación de las decisiones que se codifican aquí.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DECISIÓN DE DISEÑO (BKP-01): lista EXPLÍCITA de modelos, no introspección
 * automática de Prisma DMMF.
 * ═══════════════════════════════════════════════════════════════════════════
 * Se consideró usar `Prisma.dmmf.datamodel.models` para descubrir en runtime
 * qué modelos tienen `auditId` — más "a prueba de futuro" en teoría. Se
 * descartó por tres razones:
 *   1. El ORDEN DE ESCRITURA (qué modelo debe crearse antes que cuál otro
 *      para no violar una FK) no se puede inferir de forma trivial y segura
 *      solo con el DMMF — hay que decidirlo a mano de todos modos.
 *   2. Un backup de datos financieros/personales de un cliente de auditoría
 *      debe ser auditable en el sentido literal: se debe poder leer esta
 *      lista y saber EXACTAMENTE qué se exporta, sin depender de que la
 *      introspección automática haya capturado todo correctamente.
 *   3. Un modelo nuevo con `auditId` que se agregue en el futuro y se olvide
 *      añadir aquí es un bug DETECTABLE (ver `verificarCompletitudModelos()`
 *      en `audit-backup.service.ts`, BKP-03 — compara esta lista contra el
 *      DMMF real y falla ruidosamente si hay disparidad) — mejor que una
 *      introspección automática que podría fallar en silencio.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * Árbol de dependencia verificado contra `schema.prisma` el 2026-08-16
 * (grep directo de cada modelo, no una suposición) — 32 modelos cuelgan de
 * `Audit`, directa o transitivamente. Dos modelos que a primera vista
 * parecían candidatos NO cuelgan de `Audit` y quedan correctamente FUERA:
 * `QaipEvaluation` y `NormativeException` pertenecen a `Organization`, no a
 * un encargo específico.
 *
 * **Actualizado 2026-08-20** (`verificarCompletitudModelos()` re-ejecutado
 * contra el schema actual, al diseñar el borrado completo de encargos):
 * agregados `fieldEvidence`/`fieldEvidenceFinding` (Evidencia de Campo,
 * construido 2026-08-19 — posterior a la verificación original, quedó fuera
 * por deriva, no por diseño). `engagement` también aparece en la salida de
 * `verificarCompletitudModelos()` (tiene `auditId`) pero se deja FUERA a
 * propósito: es el registro comercial (Cliente→Propuesta→Carta de
 * Compromiso) que ORIGINÓ este `Audit`, no datos que cuelguen de él — borrar
 * un encargo debe desvincularlo (`auditId = null`), nunca borrar el
 * `Engagement`. Ver `apps/api/src/audits/backup/audit-delete.service.ts`.
 */

/** Nivel de dependencia — determina el orden de creación al restaurar. */
export type NivelDependencia = 1 | 2 | 3 | 4 | 5;

export interface AuditScopedModel {
  /** Nombre del modelo de Prisma, tal como se usa en `prisma.<model>`. */
  model: string;
  /** Campo(s) por los que se filtra — 'auditId' directo, o la cadena de FKs a seguir. */
  filtro:
    | { tipo: 'auditId_directo' }
    | { tipo: 'via_paperId'; paperIdField: string }
    | { tipo: 'via_findingId' }
    | { tipo: 'via_pbcId'; pbcIdField: string }
    | { tipo: 'via_trialBalanceId' }
    | { tipo: 'via_jobId' }
    | { tipo: 'via_sectionId' }
    | { tipo: 'via_procedureId' }
    | { tipo: 'via_stepId' }
    | { tipo: 'via_evidenceId' };
  nivel: NivelDependencia;
  /** true si además tiene su propio `auditId` directo (ej. DataFlag) — informativo, no cambia el filtro usado. */
  tieneAuditIdPropio?: boolean;
}

/**
 * Orden de creación al restaurar: dentro de nivel 1, `auditPhase` →
 * `auditFolder` → `workingPaper` en ESE orden exacto —
 * `WorkingPaper.folderId` apunta a `AuditFolder`, que a su vez apunta a
 * `AuditPhase` vía `phaseId` (bug real encontrado en la prueba end-to-end de
 * BKP-10: con `workingPaper` primero, `folderId` nunca se podía remapear
 * porque la carpeta todavía no existía en el `idMap`). El resto del nivel 1
 * no tiene esta restricción entre sí. Luego nivel 2, 3, 4, 5 en ese orden.
 */
export const AUDIT_SCOPED_MODELS: AuditScopedModel[] = [
  // ─── Nivel 1 — auditId directo ─────────────────────────────────────────
  { model: 'auditPhase',            filtro: { tipo: 'auditId_directo' }, nivel: 1 }, // PRIMERO — auditFolder depende de él (phaseId)
  { model: 'auditFolder',           filtro: { tipo: 'auditId_directo' }, nivel: 1 }, // SEGUNDO — workingPaper depende de él (folderId)
  { model: 'workingPaper',          filtro: { tipo: 'auditId_directo' }, nivel: 1 }, // TERCERO — nivel 2 depende de él
  { model: 'auditPlanItem',         filtro: { tipo: 'auditId_directo' }, nivel: 1 },
  { model: 'timeEntry',             filtro: { tipo: 'auditId_directo' }, nivel: 1 },
  { model: 'auditTeam',             filtro: { tipo: 'auditId_directo' }, nivel: 1 },
  { model: 'auditRequestDocument',  filtro: { tipo: 'auditId_directo' }, nivel: 1 },
  { model: 'auditProgram',          filtro: { tipo: 'auditId_directo' }, nivel: 1 },
  { model: 'externalConfirmation',  filtro: { tipo: 'auditId_directo' }, nivel: 1 },
  { model: 'pbcRequest',            filtro: { tipo: 'auditId_directo' }, nivel: 1 },
  { model: 'trialBalance',          filtro: { tipo: 'auditId_directo' }, nivel: 1 },
  { model: 'finding',               filtro: { tipo: 'auditId_directo' }, nivel: 1 },
  { model: 'dataAnalysisJob',       filtro: { tipo: 'auditId_directo' }, nivel: 1 },
  { model: 'auditReport',           filtro: { tipo: 'auditId_directo' }, nivel: 1 },
  { model: 'complianceAssessment',  filtro: { tipo: 'auditId_directo' }, nivel: 1 },
  { model: 'bcpAudit',              filtro: { tipo: 'auditId_directo' }, nivel: 1 },
  { model: 'connectorImport',       filtro: { tipo: 'auditId_directo' }, nivel: 1 },
  { model: 'auditRestoreLog',       filtro: { tipo: 'auditId_directo' }, nivel: 1 }, // bitácora de restauraciones (BKP-12) — metadata, no daña llevarla en el backup
  { model: 'fieldEvidence',         filtro: { tipo: 'auditId_directo' }, nivel: 1 }, // Evidencia de Campo (EVD-01..18) — agregado 2026-08-20, ver nota arriba

  // ─── Nivel 2 — dependen de un modelo de nivel 1 ────────────────────────
  { model: 'paperSection',          filtro: { tipo: 'via_paperId', paperIdField: 'paperId' },       nivel: 2 },
  { model: 'paperLink',             filtro: { tipo: 'via_paperId', paperIdField: 'sourceId' },       nivel: 2 }, // + targetId, ver nota cross-audit
  { model: 'paperReference',        filtro: { tipo: 'via_paperId', paperIdField: 'sourcePaperId' },  nivel: 2 }, // + targetPaperId, ver nota cross-audit
  { model: 'workingPaperVersion',   filtro: { tipo: 'via_paperId', paperIdField: 'paperId' },        nivel: 2 },
  { model: 'workingPaperComment',   filtro: { tipo: 'via_paperId', paperIdField: 'paperId' },        nivel: 2 },
  { model: 'tickMarkEntry',         filtro: { tipo: 'via_paperId', paperIdField: 'paperId' },        nivel: 2 },
  { model: 'pbcPaperLink',          filtro: { tipo: 'via_pbcId', pbcIdField: 'pbcId' },              nivel: 2 }, // también referencia paperId — ambos deben existir ya
  { model: 'trialBalancePaperLink', filtro: { tipo: 'via_trialBalanceId' },                          nivel: 2 }, // también referencia paperId
  // PbcMessage.requestId (NO 'pbcId' — nombre de campo distinto al resto de
  // modelos "via_pbcId") — bug real encontrado 2026-08-20: el `where` que se
  // armaba con 'pbcId' hardcoded le pegaba a un campo inexistente en este
  // modelo específico y tiraba PrismaClientValidationError en cualquier
  // encargo con PbcRequest+PbcMessage reales (backup Y borrado completo).
  { model: 'pbcMessage',            filtro: { tipo: 'via_pbcId', pbcIdField: 'requestId' },          nivel: 2 },
  { model: 'dataFlag',              filtro: { tipo: 'via_jobId' }, nivel: 2, tieneAuditIdPropio: true },
  { model: 'fieldEvidenceFinding',  filtro: { tipo: 'via_evidenceId' }, nivel: 2 }, // evidenceId → FieldEvidence

  // ─── Nivel 3 ────────────────────────────────────────────────────────────
  { model: 'findingAction',         filtro: { tipo: 'via_findingId' }, nivel: 3 },
  { model: 'findingComment',        filtro: { tipo: 'via_findingId' }, nivel: 3 },
  { model: 'auditProcedure',        filtro: { tipo: 'via_sectionId' }, nivel: 3 }, // sectionId → PaperSection → WorkingPaper

  // ─── Nivel 4 ────────────────────────────────────────────────────────────
  { model: 'auditStep',             filtro: { tipo: 'via_procedureId' }, nivel: 4 },

  // ─── Nivel 5 ────────────────────────────────────────────────────────────
  { model: 'stepEvidence',          filtro: { tipo: 'via_stepId' }, nivel: 5 },
];

/**
 * Construye el `where` de Prisma para consultar las filas de un modelo que
 * pertenecen a un encargo — compartido entre la exportación (BKP-03) y el
 * borrado previo a una restauración destructiva (BKP-12), que necesitan
 * exactamente el mismo criterio de "qué filas son de este encargo". `ids`
 * trae las familias de IDs ya recolectadas de los niveles anteriores (mismo
 * orden que `AUDIT_SCOPED_MODELS`). Devuelve `null` cuando la familia de IDs
 * de la que depende está vacía — no es un error, simplemente no hay nada que
 * consultar todavía (ej. un encargo sin `WorkingPaper` no puede tener
 * `PaperSection`).
 */
export function construirWhereParaModelo(
  modelo: AuditScopedModel, auditId: string, ids: Record<string, string[]>,
): Record<string, unknown> | null {
  switch (modelo.filtro.tipo) {
    case 'auditId_directo':
      return { auditId };
    case 'via_paperId':
      return ids.workingPaper.length === 0 ? null : { [modelo.filtro.paperIdField]: { in: ids.workingPaper } };
    case 'via_findingId':
      return ids.finding.length === 0 ? null : { findingId: { in: ids.finding } };
    case 'via_pbcId':
      return ids.pbcRequest.length === 0 ? null : { [modelo.filtro.pbcIdField]: { in: ids.pbcRequest } };
    case 'via_trialBalanceId':
      return ids.trialBalance.length === 0 ? null : { trialBalanceId: { in: ids.trialBalance } };
    case 'via_jobId':
      return ids.dataAnalysisJob.length === 0 ? null : { jobId: { in: ids.dataAnalysisJob } };
    case 'via_sectionId':
      return ids.paperSection.length === 0 ? null : { sectionId: { in: ids.paperSection } };
    case 'via_procedureId':
      return ids.auditProcedure.length === 0 ? null : { procedureId: { in: ids.auditProcedure } };
    case 'via_stepId':
      return ids.auditStep.length === 0 ? null : { stepId: { in: ids.auditStep } };
    case 'via_evidenceId':
      return ids.fieldEvidence.length === 0 ? null : { evidenceId: { in: ids.fieldEvidence } };
  }
}

/** Familias de IDs vacías, listas para llenarse nivel a nivel — mismo shape en export y en borrado previo a restauración destructiva. */
export function nuevasFamiliasDeIds(): Record<string, string[]> {
  return {
    workingPaper: [], finding: [], pbcRequest: [], trialBalance: [],
    dataAnalysisJob: [], paperSection: [], auditProcedure: [], auditStep: [],
    fieldEvidence: [],
  };
}

/** Nombres de las familias cuyo ID hay que recolectar al recorrer `AUDIT_SCOPED_MODELS` (mismo orden). */
export const MODELOS_QUE_ALIMENTAN_FAMILIA = [
  'workingPaper', 'finding', 'pbcRequest', 'trialBalance',
  'dataAnalysisJob', 'paperSection', 'auditProcedure', 'auditStep',
  'fieldEvidence',
] as const;

/**
 * Nota de alcance conocida — referencias cross-audit: `PaperLink.targetId` y
 * `PaperReference.targetPaperId` técnicamente pueden apuntar a un
 * `WorkingPaper` de OTRO encargo de la misma organización (la única
 * validación real hoy, en `paper-references.service.ts`, es "misma
 * organización", no "mismo encargo"). Si eso ocurre, el papel destino NO
 * estará incluido en este backup. Política (BKP-03): esas filas se exportan
 * igual (no se pierden), pero se marcan en `advertencias` — al restaurar
 * como encargo nuevo, esa referencia queda "colgando" (apunta a un ID que
 * puede no existir en el entorno destino) y se documenta así, en vez de
 * fallar silenciosamente o bloquear todo el backup por esta causa.
 */

// ═══════════════════════════════════════════════════════════════════════════
// Manifiesto — mismo patrón de firma HMAC que el motor de plantillas Excel
// (`excel-manifest.ts`), pero para un backup de encargo completo.
// ═══════════════════════════════════════════════════════════════════════════

export interface AuditBackupManifest {
  v: 1;
  auditId: string;
  organizationId: string;
  /** Título del encargo al momento del backup — solo informativo, no se usa para verificar. */
  auditTitulo: string;
  generadoEn: string; // ISO-8601
  generadoPor: string; // AuthUser.id
  /** Cantidad de filas por modelo — permite detectar un archivo truncado/alterado antes de restaurar. */
  conteoPorModelo: Record<string, number>;
  /** SHA-256 de `data.json` tal como se empaquetó — detecta corrupción/alteración del contenido. */
  hashDatos: string;
  /** HMAC-SHA256 en hexadecimal, sobre v|auditId|organizationId|generadoEn|generadoPor|hashDatos. */
  firma: string;
}

export interface AuditBackupAdvertencia {
  modelo: string;
  filaId?: string;
  mensaje: string;
}

/** Resultado de armar el backup — el buffer del ZIP va aparte. */
export interface AuditBackupResultado {
  manifest: AuditBackupManifest;
  advertencias: AuditBackupAdvertencia[];
  totalFilas: number;
  totalArchivos: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// BKP-02 — Estrategia de remapeo de IDs para "restaurar como nuevo encargo"
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Decisiones de diseño (documentadas aquí porque determinan cómo se lee el
 * código de `audit-backup-restore.service.ts`, BKP-07):
 *
 * 1. ALCANCE: portabilidad entre ENTORNOS de la MISMA organización (ej.
 *    disaster recovery, mover de un ambiente a otro) — NO entre
 *    organizaciones distintas. `verificarBackupManifest` ya rechaza un
 *    backup cuyo `organizationId` no coincide con el de quien lo sube — es
 *    una frontera de seguridad real (evita restaurar los datos de un cliente
 *    de OTRA organización), no solo una validación de conveniencia.
 *
 * 2. IDs propios: CADA fila de CADA modelo recibe un `id` nuevo (cuid) al
 *    restaurar — nunca se reutilizan los IDs originales, ni siquiera
 *    restaurando en el mismo entorno (evita colisión con el encargo
 *    original, que sigue existiendo).
 *
 * 3. FKs DENTRO del backup (auditId, paperId, sectionKey+paperId, findingId,
 *    pbcId, trialBalanceId, jobId, procedureId, stepId, sourceId/targetId,
 *    sourcePaperId/targetPaperId): se remapean usando un
 *    `Map<idViejo, idNuevo>` construido incrementalmente a medida que se
 *    crea cada fila, EN EL ORDEN de `AUDIT_SCOPED_MODELS` (nivel 1 → 5) —
 *    por eso el orden importa: una FK nunca puede remapearse antes de que
 *    la fila que apunta exista en el mapa.
 *
 * 4. FKs a `User` (preparedById, reviewedById, authorId, uploadedById,
 *    createdById, responsableId, performedById, consolidatedById,
 *    signedOffById, etc.): NO se remapean (los usuarios no son parte del
 *    backup, pertenecen a la organización) — se CONSERVAN tal cual si el
 *    usuario todavía existe en la organización actual; si no (ej. la cuenta
 *    fue eliminada entre el backup y la restauración), el campo se deja en
 *    `null` y se registra en `advertencias` con el ID original — nunca se
 *    inventa ni se remapea a otro usuario. Verificación en una sola consulta
 *    batched (todos los `User.id` de la organización) antes de insertar
 *    nada, no una consulta por fila.
 *
 * 5. Referencias colgantes (`PaperLink`/`PaperReference` hacia un papel de
 *    OTRO encargo — ver nota de alcance en `AUDIT_SCOPED_MODELS`): si el
 *    `targetId`/`targetPaperId` no aparece en el mapa de remapeo (porque
 *    pertenecía a otro encargo, fuera de este backup), esa fila se OMITE
 *    con advertencia — no se inventa un destino ni se deja apuntando al ID
 *    viejo (que en el entorno destino podría no existir, o peor, podría
 *    existir y pertenecer a datos de otro encargo sin relación).
 */
export interface RemapeoContexto {
  /** idViejo → idNuevo, para cualquier fila ya creada de cualquier modelo del backup. */
  idMap: Map<string, string>;
  /** IDs de usuario válidos en la organización actual — una sola consulta batched. */
  usuariosValidos: Set<string>;
}
