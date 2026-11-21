import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FILE_TYPE_KEYS, FileTypeKey } from './billing.constants';
import { BillingSettingsService } from './billing-settings.service';
import { EntitlementsService } from './entitlements.service';
import { totalStorageGb } from './entitlements';

export const BYTES_PER_GB = 1024 ** 3;
const MB = 1024 ** 2;

export type StorageByType = Record<FileTypeKey, number>;
export interface StorageUsage {
  totalBytes: number;
  byType: StorageByType;
}

const emptyByType = (): StorageByType => Object.fromEntries(FILE_TYPE_KEYS.map((k) => [k, 0])) as StorageByType;

/** Tipo de archivo para las cuotas (misma regla que el CASE del SQL de abajo). */
export function classifyFile(mimeType?: string | null, filename?: string | null): FileTypeKey {
  const mime = (mimeType ?? '').toLowerCase();
  const name = (filename ?? '').toLowerCase();
  if (mime.startsWith('video/') || /\.(mp4|mov|avi|mkv|webm|m4v)$/.test(name)) return 'VIDEO';
  if (mime.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|aac|flac)$/.test(name)) return 'AUDIO';
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'PDF';
  if (mime.startsWith('image/') || /\.(jpe?g|png|gif|webp|heic|bmp|tiff?)$/.test(name)) return 'FOTO';
  if (mime.includes('presentation') || mime.includes('powerpoint') || /\.(pptx?|odp|key)$/.test(name)) return 'PPT';
  if (mime.includes('spreadsheet') || mime.includes('excel') || mime.includes('csv') || /\.(xlsx?|xlsm|csv|ods)$/.test(name)) return 'XLS';
  return 'OTROS';
}

// CASE por tipo, sobre el MIME (los archivos de evidencia además traen nombre; el resto se clasifica solo por MIME).
const TYPE_CASE = Prisma.sql`CASE
  WHEN lower(coalesce(f.mime, '')) LIKE 'video/%' OR lower(coalesce(f.name, '')) ~ '\\.(mp4|mov|avi|mkv|webm|m4v)$' THEN 'VIDEO'
  WHEN lower(coalesce(f.mime, '')) LIKE 'audio/%' OR lower(coalesce(f.name, '')) ~ '\\.(mp3|wav|m4a|ogg|aac|flac)$' THEN 'AUDIO'
  WHEN lower(coalesce(f.mime, '')) = 'application/pdf' OR lower(coalesce(f.name, '')) LIKE '%.pdf' THEN 'PDF'
  WHEN lower(coalesce(f.mime, '')) LIKE 'image/%' OR lower(coalesce(f.name, '')) ~ '\\.(jpe?g|png|gif|webp|heic|bmp|tiff?)$' THEN 'FOTO'
  WHEN lower(coalesce(f.mime, '')) LIKE '%presentation%' OR lower(coalesce(f.mime, '')) LIKE '%powerpoint%' OR lower(coalesce(f.name, '')) ~ '\\.(pptx?|odp|key)$' THEN 'PPT'
  WHEN lower(coalesce(f.mime, '')) LIKE '%spreadsheet%' OR lower(coalesce(f.mime, '')) LIKE '%excel%' OR lower(coalesce(f.mime, '')) LIKE '%csv%' OR lower(coalesce(f.name, '')) ~ '\\.(xlsx?|xlsm|csv|ods)$' THEN 'XLS'
  ELSE 'OTROS' END`;

// Todas las tablas que guardan un archivo con su tamaño, unidas a la organización dueña.
const FILES = Prisma.sql`
  SELECT a."organizationId" AS org, fe."mimeType" AS mime, fe."filename" AS name, fe."size"::bigint AS bytes
    FROM "field_evidences" fe JOIN "audits" a ON a."id" = fe."auditId" WHERE fe."storageKey" IS NOT NULL
  UNION ALL
  SELECT a."organizationId", ard."mimeType", ard."filename", ard."fileSize"::bigint
    FROM "audit_request_documents" ard JOIN "audits" a ON a."id" = ard."auditId"
  UNION ALL
  SELECT a."organizationId", wp."mimeType", NULL, wp."fileSize"::bigint
    FROM "working_papers" wp JOIN "audits" a ON a."id" = wp."auditId" WHERE wp."fileSize" IS NOT NULL
  UNION ALL
  SELECT a."organizationId", se."mimeType", NULL, se."size"::bigint
    FROM "step_evidences" se
    JOIN "audit_steps" st ON st."id" = se."stepId" JOIN "audit_procedures" ap ON ap."id" = st."procedureId"
    JOIN "paper_sections" ps ON ps."id" = ap."sectionId" JOIN "working_papers" wp ON wp."id" = ps."paperId" JOIN "audits" a ON a."id" = wp."auditId"
  UNION ALL
  SELECT sr."organizationId", sa."detectedType", NULL, sa."sizeBytes"::bigint
    FROM "signature_attachments" sa JOIN "signature_requests" sr ON sr."id" = sa."requestId"`;

/**
 * Espacio que ocupa cada organización, por tipo de archivo, y verificación de cuotas al subir (espacio total, tamaño máximo y tipos permitidos).
 * Se mide sumando los tamaños guardados en las tablas de archivos; con el interruptor en OFF solo se mide, no se bloquea.
 */
@Injectable()
export class StorageUsageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: BillingSettingsService,
    private readonly entitlements: EntitlementsService,
  ) {}

  private fold(rows: Array<{ org: string; type: string; bytes: bigint | number | null }>): Map<string, StorageUsage> {
    const out = new Map<string, StorageUsage>();
    for (const r of rows) {
      const u = out.get(r.org) ?? { totalBytes: 0, byType: emptyByType() };
      const n = Number(r.bytes ?? 0);
      u.byType[(r.type as FileTypeKey) in u.byType ? (r.type as FileTypeKey) : 'OTROS'] += n;
      u.totalBytes += n;
      out.set(r.org, u);
    }
    return out;
  }

  /** Uso de UNA organización. */
  async usage(organizationId: string): Promise<StorageUsage> {
    const rows = await this.prisma.$queryRaw<Array<{ org: string; type: string; bytes: bigint | null }>>(Prisma.sql`
      SELECT f.org, ${TYPE_CASE} AS type, SUM(f.bytes) AS bytes
      FROM (${FILES}) f WHERE f.org = ${organizationId} GROUP BY f.org, 2`);
    return this.fold(rows).get(organizationId) ?? { totalBytes: 0, byType: emptyByType() };
  }

  /** Uso de TODAS las organizaciones (pantalla de consumo del superadmin). */
  async usageAll(): Promise<Map<string, StorageUsage>> {
    const rows = await this.prisma.$queryRaw<Array<{ org: string; type: string; bytes: bigint | null }>>(Prisma.sql`
      SELECT f.org, ${TYPE_CASE} AS type, SUM(f.bytes) AS bytes FROM (${FILES}) f GROUP BY f.org, 2`);
    return this.fold(rows);
  }

  /**
   * Antes de guardar un archivo: ¿su tipo está permitido, no pasa el tamaño máximo y cabe en el espacio? Con el interruptor en OFF no hace
   * nada. Códigos: 415 TIPO_NO_PERMITIDO, 413 ARCHIVO_MUY_GRANDE, 402 ESPACIO_AGOTADO.
   */
  async assertCanUpload(organizationId: string, file: { sizeBytes: number; mimeType?: string | null; filename?: string | null }): Promise<void> {
    const { enforcementMode } = await this.settings.get();
    if (enforcementMode === 'OFF') return;
    const ent = await this.entitlements.get(organizationId);
    if (!ent || ent.exempt) return;

    const type = classifyFile(file.mimeType, file.filename);
    const allowed = ent.limits.fileTypes;
    if (Array.isArray(allowed) && allowed.length > 0 && !allowed.includes(type)) {
      this.entitlements.violate(enforcementMode, organizationId, 415, 'TIPO_NO_PERMITIDO', `Tu plan ${ent.planName} no admite archivos de tipo ${type}.`, { fileType: type });
    }
    const maxMb = ent.limits.maxFileMb;
    if (maxMb >= 0 && file.sizeBytes > maxMb * MB) {
      this.entitlements.violate(enforcementMode, organizationId, 413, 'ARCHIVO_MUY_GRANDE', `El archivo pesa más del máximo de tu plan (${maxMb} MB).`, { maxFileMb: maxMb });
    }
    const totalGb = totalStorageGb(ent);
    if (totalGb !== null) {
      const used = (await this.usage(organizationId)).totalBytes;
      if (used + file.sizeBytes > totalGb * BYTES_PER_GB) {
        this.entitlements.violate(
          enforcementMode, organizationId, 402, 'ESPACIO_AGOTADO',
          `Tu espacio está lleno (${(used / BYTES_PER_GB).toFixed(1)} de ${totalGb} GB). Libera espacio o compra más.`, { usedBytes: used, limitGb: totalGb },
        );
      }
    }
  }
}
