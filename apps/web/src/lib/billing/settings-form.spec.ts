import type { BillingSettingsRow } from './admin-types';
import {
  MODE_INFO, MODE_ORDER, needsStrongConfirmation, parseDecimal, settingsPatch, settingsToForm, validateSettings,
} from './settings-form';

const current: BillingSettingsRow = {
  enforcementMode: 'OFF', graceDays: 7, readOnlyDays: 60, reminderDays: [7, 1], costPerRequestUsd: 0.0012, safetyMultiplier: 3,
  weights: { light: 1, medium: 5, heavy: 10 }, ivaPercent: null, defaultPlanCode: 'EMPRESA_DESPACHO',
};

describe('formulario de parámetros', () => {
  it('refleja los parámetros actuales y es válido', () => {
    const f = settingsToForm(current);
    expect(f).toEqual({ graceDays: '7', readOnlyDays: '60', costPerRequestUsd: '0.0012', safetyMultiplier: '3', defaultPlanCode: 'EMPRESA_DESPACHO' });
    expect(validateSettings(f)).toEqual({});
  });

  it('rechaza lo que el API rechazaría', () => {
    const f = settingsToForm(current);
    expect(validateSettings({ ...f, graceDays: '91' }).graceDays).toBeDefined();
    expect(validateSettings({ ...f, graceDays: '-1' }).graceDays).toBeDefined();
    expect(validateSettings({ ...f, graceDays: '' }).graceDays).toBeDefined();
    expect(validateSettings({ ...f, readOnlyDays: '366' }).readOnlyDays).toBeDefined();
    expect(validateSettings({ ...f, readOnlyDays: '365' }).readOnlyDays).toBeUndefined();
    expect(validateSettings({ ...f, safetyMultiplier: '0.5' }).safetyMultiplier).toBeDefined();
    expect(validateSettings({ ...f, safetyMultiplier: '21' }).safetyMultiplier).toBeDefined();
    expect(validateSettings({ ...f, safetyMultiplier: '2.5' }).safetyMultiplier).toBeUndefined();
    expect(validateSettings({ ...f, costPerRequestUsd: 'abc' }).costPerRequestUsd).toBeDefined();
    expect(validateSettings({ ...f, costPerRequestUsd: '0.0000001' }).costPerRequestUsd).toBeDefined();
    expect(validateSettings({ ...f, defaultPlanCode: ' ' }).defaultPlanCode).toBeDefined();
  });

  it('decimales positivos con tope de decimales', () => {
    expect(parseDecimal('0.0012', 6)).toBe(0.0012);
    expect(parseDecimal('3', 2)).toBe(3);
    expect(parseDecimal('3.123', 2)).toBeNull();
    expect(parseDecimal('-1', 2)).toBeNull();
    expect(parseDecimal('.5', 2)).toBeNull();
  });

  it('el cuerpo trae solo lo que cambió, con números reales', () => {
    const f = settingsToForm(current);
    expect(settingsPatch(f, current)).toEqual({});
    const patch = settingsPatch({ ...f, graceDays: '10', costPerRequestUsd: '0.002', defaultPlanCode: 'PERSONA_INICIAL' }, current);
    expect(patch).toEqual({ graceDays: 10, costPerRequestUsd: 0.002, defaultPlanCode: 'PERSONA_INICIAL' });
    expect(typeof patch.graceDays).toBe('number');
    expect(settingsPatch({ ...f, safetyMultiplier: '2.5' }, current)).toEqual({ safetyMultiplier: 2.5 });
  });

  it('nunca envía campos que el API no acepta (modo, pesos, IVA, recordatorios)', () => {
    const patch = settingsPatch({ ...settingsToForm(current), graceDays: '1' }, current) as Record<string, unknown>;
    for (const k of ['enforcementMode', 'weights', 'ivaPercent', 'reminderDays']) expect(k in patch).toBe(false);
  });
});

describe('modos del interruptor', () => {
  it('cada modo tiene explicación y el orden es apagado → observar → aplicar', () => {
    expect(MODE_ORDER).toEqual(['OFF', 'OBSERVE', 'ENFORCE']);
    for (const m of MODE_ORDER) {
      expect(MODE_INFO[m].label).toBeTruthy();
      expect(MODE_INFO[m].server.length).toBeGreaterThan(20);
      expect(MODE_INFO[m].clients.length).toBeGreaterThan(20);
    }
    expect(MODE_INFO.ENFORCE.server).toContain('bloquea');
  });

  it('solo pasar a ENFORCE pide la confirmación fuerte', () => {
    expect(needsStrongConfirmation('OFF', 'ENFORCE')).toBe(true);
    expect(needsStrongConfirmation('OBSERVE', 'ENFORCE')).toBe(true);
    expect(needsStrongConfirmation('ENFORCE', 'ENFORCE')).toBe(false);
    expect(needsStrongConfirmation('ENFORCE', 'OFF')).toBe(false);
    expect(needsStrongConfirmation('OFF', 'OBSERVE')).toBe(false);
  });
});
