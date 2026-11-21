import { Injectable } from '@nestjs/common';
import { EnforcementMode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface BillingSettingsValue {
  enforcementMode: EnforcementMode;
  graceDays: number;
  readOnlyDays: number;
  reminderDays: number[];
  costPerRequestUsd: number;
  safetyMultiplier: number;
  weights: { light: number; medium: number; heavy: number };
  ivaPercent: number | null;
  defaultPlanCode: string;
}

/** Valores si la tabla aún no existe o no tiene fila: el sistema se comporta como antes (nada se bloquea). */
export const DEFAULT_SETTINGS: BillingSettingsValue = {
  enforcementMode: 'OFF', graceDays: 7, readOnlyDays: 60, reminderDays: [7, 1], costPerRequestUsd: 0.0012, safetyMultiplier: 3,
  weights: { light: 1, medium: 5, heavy: 10 }, ivaPercent: null, defaultPlanCode: 'EMPRESA_DESPACHO',
};

const TTL_MS = 30_000;

/** Parámetros de la plataforma (una sola fila `default`), con caché corta: el guardián los lee en cada petición. */
@Injectable()
export class BillingSettingsService {
  private cache: { value: BillingSettingsValue; at: number } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  invalidate(): void {
    this.cache = null;
  }

  async get(): Promise<BillingSettingsValue> {
    if (this.cache && Date.now() - this.cache.at < TTL_MS) return this.cache.value;
    let value = DEFAULT_SETTINGS;
    try {
      const row = await this.prisma.billingSettings.findUnique({ where: { id: 'default' } });
      if (row) {
        const w = (row.weights ?? {}) as Partial<BillingSettingsValue['weights']>;
        value = {
          enforcementMode: row.enforcementMode, graceDays: row.graceDays, readOnlyDays: row.readOnlyDays, reminderDays: row.reminderDays,
          costPerRequestUsd: Number(row.costPerRequestUsd), safetyMultiplier: Number(row.safetyMultiplier),
          weights: { light: w.light ?? 1, medium: w.medium ?? 5, heavy: w.heavy ?? 10 },
          ivaPercent: row.ivaPercent === null ? null : Number(row.ivaPercent), defaultPlanCode: row.defaultPlanCode,
        };
      }
    } catch {
      // Tabla inexistente (SQL aún sin aplicar) o base caída: se asume OFF. Nunca bloquear por no poder leer los parámetros.
      value = DEFAULT_SETTINGS;
    }
    this.cache = { value, at: Date.now() };
    return value;
  }

  async update(patch: Partial<BillingSettingsValue>, actorId: string): Promise<BillingSettingsValue> {
    const data: Record<string, unknown> = { updatedById: actorId };
    if (patch.enforcementMode !== undefined) data.enforcementMode = patch.enforcementMode;
    if (patch.graceDays !== undefined) data.graceDays = patch.graceDays;
    if (patch.readOnlyDays !== undefined) data.readOnlyDays = patch.readOnlyDays;
    if (patch.reminderDays !== undefined) data.reminderDays = patch.reminderDays;
    if (patch.costPerRequestUsd !== undefined) data.costPerRequestUsd = patch.costPerRequestUsd;
    if (patch.safetyMultiplier !== undefined) data.safetyMultiplier = patch.safetyMultiplier;
    if (patch.weights !== undefined) data.weights = patch.weights;
    if (patch.ivaPercent !== undefined) data.ivaPercent = patch.ivaPercent;
    if (patch.defaultPlanCode !== undefined) data.defaultPlanCode = patch.defaultPlanCode;
    await this.prisma.billingSettings.upsert({ where: { id: 'default' }, update: data, create: { id: 'default', ...data } });
    this.invalidate();
    return this.get();
  }
}
