import * as crypto from 'crypto';
import { ExcelTemplateManifest } from './excel-template.types';

/**
 * Firma y verificación del manifiesto sellado (§3.1.3 del documento de diseño,
 * control #6). Aislado en su propio archivo porque es la pieza de integridad
 * más sensible del motor: cualquier cambio aquí debe poder revisarse sin leer
 * el resto de `excel-template-engine.service.ts`.
 *
 * Política: FALLA CERRADO. `verificarManifest` nunca lanza — siempre devuelve
 * `{ ok: false, razon }` ante cualquier duda, para que el llamador decida cómo
 * comunicarlo (nunca escribe nada si `ok` es `false`).
 */

const MANIFEST_VERSION = 1 as const;

type ManifestSinFirma = Omit<ExcelTemplateManifest, 'firma'>;

function payload(m: ManifestSinFirma): string {
  return [
    m.v, m.templateKey, m.templateVersion, m.paperId,
    m.auditId, m.organizationId, m.generadoEn, m.generadoPor,
  ].join('|');
}

function firmar(secret: string, m: ManifestSinFirma): string {
  return crypto.createHmac('sha256', secret).update(payload(m)).digest('hex');
}

export function construirManifest(
  secret: string,
  datos: Omit<ManifestSinFirma, 'v'>,
): ExcelTemplateManifest {
  const base: ManifestSinFirma = { v: MANIFEST_VERSION, ...datos };
  return { ...base, firma: firmar(secret, base) };
}

export interface ContextoEsperado {
  templateKey: string;
  templateVersion: number;
  paperId: string;
  auditId: string;
  organizationId: string;
}

export type VerificacionManifest =
  | { ok: true; manifest: ExcelTemplateManifest }
  | { ok: false; razon: string };

export function verificarManifest(
  secret: string,
  crudo: unknown,
  esperado: ContextoEsperado,
): VerificacionManifest {
  if (!crudo || typeof crudo !== 'object') {
    return { ok: false, razon: 'El manifiesto de integridad está ausente o no se pudo leer' };
  }
  const m = crudo as Partial<ExcelTemplateManifest>;

  if (m.v !== MANIFEST_VERSION) {
    return { ok: false, razon: 'Versión de manifiesto no soportada' };
  }
  if (
    !m.templateKey || !m.templateVersion || !m.paperId || !m.auditId ||
    !m.organizationId || !m.generadoEn || !m.generadoPor || !m.firma
  ) {
    return { ok: false, razon: 'El manifiesto de integridad está incompleto' };
  }

  const completo = m as ExcelTemplateManifest;
  const firmaEsperada = firmar(secret, {
    v: completo.v, templateKey: completo.templateKey, templateVersion: completo.templateVersion,
    paperId: completo.paperId, auditId: completo.auditId, organizationId: completo.organizationId,
    generadoEn: completo.generadoEn, generadoPor: completo.generadoPor,
  });

  const a = Buffer.from(firmaEsperada, 'hex');
  const b = Buffer.from(completo.firma, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return {
      ok: false,
      razon: 'La firma del archivo no es válida — pudo ser alterado o no fue generado por AuditMind',
    };
  }

  if (completo.templateKey !== esperado.templateKey) {
    return {
      ok: false,
      razon: `El archivo corresponde a la plantilla '${completo.templateKey}', se esperaba '${esperado.templateKey}'`,
    };
  }
  if (completo.templateVersion !== esperado.templateVersion) {
    return {
      ok: false,
      razon: `El archivo es de una versión de plantilla anterior (v${completo.templateVersion}); `
        + `descargue la plantilla nuevamente (versión vigente: v${esperado.templateVersion})`,
    };
  }
  if (completo.paperId !== esperado.paperId) {
    return { ok: false, razon: 'El archivo fue generado para otro papel de trabajo' };
  }
  if (completo.auditId !== esperado.auditId) {
    return { ok: false, razon: 'El archivo fue generado para otra auditoría' };
  }
  if (completo.organizationId !== esperado.organizationId) {
    return { ok: false, razon: 'El archivo fue generado para otra organización' };
  }

  return { ok: true, manifest: completo };
}
