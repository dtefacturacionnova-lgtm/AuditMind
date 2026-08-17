import * as crypto from 'crypto';
import { AuditBackupManifest } from './audit-backup.types';

/**
 * Firma y verificación del manifiesto de backup — mismo patrón y misma
 * política que `excel-manifest.ts` (control de integridad ya probado en
 * producción para el motor de plantillas Excel). FALLA CERRADO: cualquier
 * duda devuelve `{ ok: false }`, nunca lanza.
 */

const MANIFEST_VERSION = 1 as const;

type ManifestSinFirma = Omit<AuditBackupManifest, 'firma'>;

function payload(m: ManifestSinFirma): string {
  return [
    m.v, m.auditId, m.organizationId, m.generadoEn, m.generadoPor, m.hashDatos,
  ].join('|');
}

function firmar(secret: string, m: ManifestSinFirma): string {
  return crypto.createHmac('sha256', secret).update(payload(m)).digest('hex');
}

export function construirBackupManifest(
  secret: string,
  datos: Omit<ManifestSinFirma, 'v'>,
): AuditBackupManifest {
  const base: ManifestSinFirma = { v: MANIFEST_VERSION, ...datos };
  return { ...base, firma: firmar(secret, base) };
}

export interface ContextoEsperadoBackup {
  auditId: string;
  organizationId: string;
}

export type VerificacionBackupManifest =
  | { ok: true; manifest: AuditBackupManifest }
  | { ok: false; razon: string };

export function verificarBackupManifest(
  secret: string,
  crudo: unknown,
  esperado: ContextoEsperadoBackup,
  hashDatosReal: string,
): VerificacionBackupManifest {
  if (!crudo || typeof crudo !== 'object') {
    return { ok: false, razon: 'El manifiesto del backup está ausente o no se pudo leer' };
  }
  const m = crudo as Partial<AuditBackupManifest>;

  if (m.v !== MANIFEST_VERSION) {
    return { ok: false, razon: 'Versión de manifiesto de backup no soportada' };
  }
  if (!m.auditId || !m.organizationId || !m.generadoEn || !m.generadoPor || !m.hashDatos || !m.firma) {
    return { ok: false, razon: 'El manifiesto del backup está incompleto' };
  }

  const completo = m as AuditBackupManifest;
  const firmaEsperada = firmar(secret, {
    v: completo.v, auditId: completo.auditId, organizationId: completo.organizationId,
    generadoEn: completo.generadoEn, generadoPor: completo.generadoPor, hashDatos: completo.hashDatos,
    auditTitulo: completo.auditTitulo, conteoPorModelo: completo.conteoPorModelo,
  });

  const a = Buffer.from(firmaEsperada, 'hex');
  const b = Buffer.from(completo.firma, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, razon: 'La firma del backup no es válida — pudo ser alterado o no fue generado por AuditMind' };
  }

  if (completo.hashDatos !== hashDatosReal) {
    return { ok: false, razon: 'El contenido del backup no coincide con el hash sellado — el archivo pudo ser alterado o corrompido' };
  }
  if (completo.organizationId !== esperado.organizationId) {
    return { ok: false, razon: 'Este backup pertenece a otra organización' };
  }
  // auditId NO se compara contra `esperado.auditId` aquí a propósito: al
  // "restaurar como nuevo encargo" el auditId destino todavía no existe — la
  // comparación de auditId solo aplica al modo destructivo (BKP-12), que la
  // hace explícitamente antes de llamar a esta función.

  return { ok: true, manifest: completo };
}
