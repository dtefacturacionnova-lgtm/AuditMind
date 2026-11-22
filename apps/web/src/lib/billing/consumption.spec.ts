import type { ConsumptionOrgRow } from './admin-types';
import {
  ALERT_SHORT, BYTES_PER_GB, LOW_MARGIN_PCT, aiMeter, agentBreakdown, agentTotals, attentionList, barWidth, consumptionTotals, costText, countText, formatBytes,
  gbText, isCurrentPeriod, isPeriodKey, meterLevel, normalizeConsumption, orgView, pctText, periodKeyOf, periodLabel, providerComparison,
  ratioPct, recentPeriods, sortOrgs, storageMeter, typeBreakdown, typeTotals, usageNotices,
} from './consumption';

const GB = BYTES_PER_GB;

describe('formatos', () => {
  it('tamaños legibles', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(18.4 * GB)).toBe('18.4 GB');
    expect(formatBytes(100 * GB)).toBe('100.0 GB');
    expect(formatBytes(1.5 * 1024 * GB)).toBe('1.5 TB');
  });

  it('no escribe «1,024.0 MB»: sube de unidad al redondear', () => {
    expect(formatBytes(1024 * 1024 * 1023.99)).toBe('1.0 GB');
    expect(formatBytes(1023.9)).toBe('1 KB');
  });

  it('cantidades enormes y valores inválidos', () => {
    expect(formatBytes(5000 * 1024 * GB)).toBe('5,000.0 TB');
    expect(formatBytes(Number.MAX_SAFE_INTEGER)).toMatch(/PB|TB/);
    expect(formatBytes(-1)).toBe('—');
    expect(formatBytes(NaN)).toBe('—');
    expect(formatBytes(Infinity)).toBe('—');
    expect(formatBytes(null)).toBe('—');
    expect(formatBytes(undefined)).toBe('—');
  });

  it('GB de un plan', () => {
    expect(gbText(100)).toBe('100 GB');
    expect(gbText(0.5)).toBe('0.5 GB');
    expect(gbText(1500)).toBe('1,500 GB');
    expect(gbText(-1)).toBe('—');
    expect(gbText(null)).toBe('—');
  });

  it('dinero legible, con 4 decimales solo si es menor de un centavo', () => {
    expect(costText(0)).toBe('$0.00');
    expect(costText(8.13)).toBe('$8.13');
    expect(costText(1234.5)).toBe('$1,234.50');
    expect(costText(0.0036)).toBe('$0.0036');
    expect(costText(0.0096)).toBe('$0.0096');
    expect(costText(0.01)).toBe('$0.01');
    expect(costText(-12.5)).toBe('-$12.50');
    expect(costText(-0.0005)).toBe('-$0.0005');
    expect(costText(1e9)).toBe('$1,000,000,000.00');
    expect(costText(NaN)).toBe('—');
    expect(costText(null)).toBe('—');
  });

  it('enteros con separador de miles', () => {
    expect(countText(1950)).toBe('1,950');
    expect(countText(0)).toBe('0');
    expect(countText(1234567.6)).toBe('1,234,568');
    expect(countText(NaN)).toBe('—');
    expect(countText(null)).toBe('—');
  });
});

describe('porcentajes y barras', () => {
  it('proporción normal', () => {
    expect(ratioPct(1950, 5000)).toBeCloseTo(39, 5);
    expect(ratioPct(5000, 5000)).toBe(100);
  });

  it('sin tope (null) no hay porcentaje', () => {
    expect(ratioPct(100, null)).toBeNull();
    expect(ratioPct(100, undefined)).toBeNull();
    expect(ratioPct(100, NaN)).toBeNull();
  });

  it('capacidad 0 no divide entre cero', () => {
    expect(ratioPct(0, 0)).toBe(0);
    expect(ratioPct(5, 0)).toBe(100);
    expect(ratioPct(5, -3)).toBe(100);
  });

  it('uso raro (negativo, NaN) cuenta como 0', () => {
    expect(ratioPct(-5, 100)).toBe(0);
    expect(ratioPct(NaN, 100)).toBe(0);
  });

  it('la barra nunca pasa de 100 ni baja de 0 ni da NaN', () => {
    expect(barWidth(39)).toBe(39);
    expect(barWidth(250)).toBe(100);
    expect(barWidth(-4)).toBe(0);
    expect(barWidth(NaN)).toBe(0);
    expect(barWidth(null)).toBe(0);
    expect(barWidth(undefined)).toBe(0);
    expect(barWidth(Infinity)).toBe(0);
  });

  it('texto del porcentaje', () => {
    expect(pctText(82.4)).toBe('82 %');
    expect(pctText(100)).toBe('100 %');
    expect(pctText(104.6)).toBe('105 %');
    expect(pctText(5000)).toBe('+999 %');
    expect(pctText(null)).toBe('—');
    expect(pctText(NaN)).toBe('—');
  });

  it('niveles: normal, cerca (80 %), lleno (100 %), sin tope', () => {
    expect(meterLevel(0)).toBe('ok');
    expect(meterLevel(79.9)).toBe('ok');
    expect(meterLevel(80)).toBe('warn');
    expect(meterLevel(99.9)).toBe('warn');
    expect(meterLevel(100)).toBe('full');
    expect(meterLevel(250)).toBe('full');
    expect(meterLevel(null)).toBe('none');
    expect(meterLevel(NaN)).toBe('none');
  });
});

describe('peticiones de IA del cliente', () => {
  it('uso normal con el tope del plan', () => {
    const m = aiMeter({ included: 5000, used: 1950, usedFromPlan: 1950, packRemaining: 0, available: 3050, byAgent: [] });
    expect(m).toMatchObject({ unlimited: false, used: 1950, capacity: 5000, available: 3050, level: 'ok', valueText: '1,950 de 5,000' });
    expect(m.pct).toBeCloseTo(39, 5);
    expect(m.note).toBe('Te quedan 3,050 peticiones.');
  });

  it('suma lo comprado en paquetes: lo que queda y lo que ya se gastó de ellos', () => {
    // 5,000 del plan gastadas + 200 de paquete gastadas; quedan 800 en paquetes → capacidad 5,000 + 200 + 800
    const m = aiMeter({ included: 5000, used: 5200, usedFromPlan: 5000, packRemaining: 800, available: 800 });
    expect(m.capacity).toBe(6000);
    expect(m.valueText).toBe('5,200 de 6,000');
    expect(m.level).toBe('warn');
    expect(m.note).toBe('Te quedan 800 peticiones (800 de paquetes comprados, que no vencen por mes).');
  });

  it('agotado: 100 % y nota de límite', () => {
    const m = aiMeter({ included: 5000, used: 5000, usedFromPlan: 5000, packRemaining: 0, available: 0 });
    expect(m.pct).toBe(100);
    expect(m.level).toBe('full');
    expect(m.note).toBe('Llegaste al límite de peticiones de este mes.');
  });

  it('pasarse de lo incluido (modo sin bloqueo) no dibuja más de 100 % pero sí lo dice', () => {
    const m = aiMeter({ included: 5000, used: 5600, usedFromPlan: 5600, packRemaining: 0, available: 0 });
    expect(m.pct).toBeCloseTo(112, 5);
    expect(barWidth(m.pct)).toBe(100);
    expect(m.level).toBe('full');
  });

  it('sin tope: sin barra ni porcentaje', () => {
    const m = aiMeter({ included: null, used: 120, usedFromPlan: 120, packRemaining: 0, available: null });
    expect(m).toMatchObject({ unlimited: true, capacity: null, pct: null, level: 'none', valueText: '120 usadas · sin tope' });
    expect(barWidth(m.pct)).toBe(0);
  });

  it('un plan sin peticiones (0 incluidas) no da NaN', () => {
    const m = aiMeter({ included: 0, used: 0, usedFromPlan: 0, packRemaining: 0, available: 0 });
    expect(m.capacity).toBe(0);
    expect(m.pct).toBe(0);
    expect(Number.isNaN(m.pct)).toBe(false);
    expect(m.level).toBe('ok');
  });

  it('respuesta vacía o con basura no rompe', () => {
    expect(aiMeter(null).unlimited).toBe(true);
    expect(aiMeter(undefined).valueText).toBe('0 usadas · sin tope');
    const m = aiMeter({ included: 'x' as never, used: -4, usedFromPlan: NaN as never, packRemaining: Infinity as never, available: 'a' as never });
    expect(m.used).toBe(0);
    expect(Number.isNaN(m.pct as number)).toBe(false);
  });

  it('cantidades enormes se muestran con separadores', () => {
    const m = aiMeter({ included: 5_000_000_000, used: 1_234_567_890, usedFromPlan: 1_234_567_890, packRemaining: 0, available: 3_765_432_110 });
    expect(m.valueText).toBe('1,234,567,890 de 5,000,000,000');
  });

  it('singular cuando queda una', () => {
    expect(aiMeter({ included: 10, used: 9, usedFromPlan: 9, packRemaining: 0, available: 1 }).note).toBe('Te quedan 1 petición.');
  });
});

describe('espacio del cliente', () => {
  it('uso con tope', () => {
    const m = storageMeter({ usedBytes: 18.4 * GB, limitGb: 100, includedGb: 100, extraGb: 0, byType: {}, maxFileMb: 500, fileTypes: [] });
    expect(m.valueText).toBe('18.4 GB de 100 GB');
    expect(m.pct).toBeCloseTo(18.4, 5);
    expect(m.level).toBe('ok');
    expect(m.note).toContain('Archivo máximo: 500 MB.');
  });

  it('el archivo máximo redondo se escribe en GB y el espacio comprado se menciona', () => {
    const m = storageMeter({ usedBytes: 0, limitGb: 150, extraGb: 50, maxFileMb: 2048 });
    expect(m.note).toContain('Archivo máximo: 2 GB.');
    expect(m.note).toContain('Incluye 50 GB comprados.');
  });

  it('lleno y por encima', () => {
    expect(storageMeter({ usedBytes: 100 * GB, limitGb: 100 }).level).toBe('full');
    const over = storageMeter({ usedBytes: 130 * GB, limitGb: 100 });
    expect(over.pct).toBeCloseTo(130, 5);
    expect(barWidth(over.pct)).toBe(100);
  });

  it('sin tope', () => {
    const m = storageMeter({ usedBytes: 3 * GB, limitGb: null });
    expect(m).toMatchObject({ limitBytes: null, pct: null, level: 'none', valueText: '3.0 GB · sin tope' });
  });

  it('tope 0 con archivos no da NaN', () => {
    const m = storageMeter({ usedBytes: GB, limitGb: 0 });
    expect(m.pct).toBe(100);
    expect(storageMeter({ usedBytes: 0, limitGb: 0 }).pct).toBe(0);
  });

  it('respuesta vacía no rompe', () => {
    expect(storageMeter(null).valueText).toBe('0 B · sin tope');
    expect(storageMeter({}).pct).toBeNull();
  });
});

describe('espacio por tipo de archivo', () => {
  it('ordena de mayor a menor, con los siete tipos y su porcentaje', () => {
    const { slices, totalBytes } = typeBreakdown({ VIDEO: 52 * GB, PDF: 17 * GB, AUDIO: 11 * GB, FOTO: 9 * GB, XLS: 7 * GB, PPT: 4 * GB });
    expect(slices.map((s) => s.key)).toEqual(['VIDEO', 'PDF', 'AUDIO', 'FOTO', 'XLS', 'PPT', 'OTROS']);
    expect(totalBytes).toBe(100 * GB);
    expect(slices[0].share).toBeCloseTo(52, 5);
    expect(slices.reduce((t, s) => t + s.share, 0)).toBeCloseTo(100, 5);
    expect(slices[6]).toMatchObject({ key: 'OTROS', bytes: 0, share: 0 });
  });

  it('sin archivos: todo en cero y sin NaN', () => {
    const { slices, totalBytes } = typeBreakdown({});
    expect(totalBytes).toBe(0);
    expect(slices).toHaveLength(7);
    expect(slices.every((s) => s.share === 0 && !Number.isNaN(s.share))).toBe(true);
    expect(typeBreakdown(null).totalBytes).toBe(0);
    expect(typeBreakdown(undefined).slices).toHaveLength(7);
  });

  it('claves desconocidas, negativos y textos no cuentan', () => {
    const { slices, totalBytes } = typeBreakdown({ VIDEO: 10, GIF: 999, PDF: -50, AUDIO: 'x' as never, FOTO: NaN });
    expect(totalBytes).toBe(10);
    expect(slices[0]).toMatchObject({ key: 'VIDEO', share: 100 });
  });

  it('empates se resuelven en el orden del catálogo', () => {
    const { slices } = typeBreakdown({ PDF: 5, FOTO: 5 });
    expect(slices.slice(0, 2).map((s) => s.key)).toEqual(['PDF', 'FOTO']);
  });
});

describe('peticiones por asistente (cliente)', () => {
  it('mayor a menor, con la barra relativa al que más usó', () => {
    const rows = agentBreakdown([{ agent: 'ARGUS', requests: 100 }, { agent: 'MINERVA', requests: 400 }, { agent: 'OTROS', requests: 100 }]);
    expect(rows.map((r) => r.agent)).toEqual(['MINERVA', 'ARGUS', 'OTROS']);
    expect(rows[0].barPct).toBe(100);
    expect(rows[1].barPct).toBe(25);
    expect(rows[0].share).toBeCloseTo(66.67, 1);
    expect(rows[0].info).toBe('Planificación y Riesgos');
    expect(rows[2].info).toBeNull();
  });

  it('sin datos, ceros y basura', () => {
    expect(agentBreakdown([])).toEqual([]);
    expect(agentBreakdown(null)).toEqual([]);
    expect(agentBreakdown(undefined)).toEqual([]);
    expect(agentBreakdown([{ agent: 'ARGUS', requests: 0 }])).toEqual([]);
    expect(agentBreakdown([{ agent: '', requests: 5 }])[0].agent).toBe('OTROS');
    expect(agentBreakdown('x' as never)).toEqual([]);
  });

  it('un nombre con HTML se conserva como texto (React lo escapa)', () => {
    expect(agentBreakdown([{ agent: '<script>x</script>', requests: 3 }])[0].agent).toBe('<script>x</script>');
  });
});

describe('avisos de consumo del cliente', () => {
  const full = { included: 5000, used: 5000, usedFromPlan: 5000, packRemaining: 0, available: 0, byAgent: [] };
  const warn = { included: 5000, used: 4100, usedFromPlan: 4100, packRemaining: 0, available: 900, byAgent: [] };
  const okAi = { included: 5000, used: 100, usedFromPlan: 100, packRemaining: 0, available: 4900, byAgent: [] };

  it('IA agotada: con bloqueo real dice que los asistentes están en pausa', () => {
    const [n] = usageNotices({ ai: full }, true);
    expect(n).toMatchObject({ level: 'critical', buy: 'AI' });
    expect(n.text).toMatch(/en pausa/);
  });

  it('IA agotada SIN bloqueo (apagado u observación): no afirma que se pausó nada', () => {
    const [n] = usageNotices({ ai: full }, false);
    expect(n.text).not.toMatch(/en pausa/);
    expect(n.text).toMatch(/no se bloquea nada/);
  });

  it('IA al 80 %', () => {
    const [n] = usageNotices({ ai: warn }, true);
    expect(n).toMatchObject({ level: 'warning', buy: 'AI' });
    expect(n.title).toContain('82 %');
  });

  it('todo normal: sin avisos', () => {
    expect(usageNotices({ ai: okAi, storage: { usedBytes: GB, limitGb: 100 } }, true)).toEqual([]);
  });

  it('espacio lleno y espacio al 80 %', () => {
    expect(usageNotices({ storage: { usedBytes: 100 * GB, limitGb: 100 } }, true)[0]).toMatchObject({ level: 'critical', buy: 'STORAGE' });
    expect(usageNotices({ storage: { usedBytes: 85 * GB, limitGb: 100 } }, true)[0]).toMatchObject({ level: 'warning', buy: 'STORAGE' });
  });

  it('sin tope no avisa', () => {
    expect(usageNotices({ ai: { included: null, used: 9e9, usedFromPlan: 9e9, packRemaining: 0, available: null }, storage: { usedBytes: 9e15, limitGb: null } }, true)).toEqual([]);
  });

  it('puede avisar de las dos cosas a la vez', () => {
    expect(usageNotices({ ai: full, storage: { usedBytes: 100 * GB, limitGb: 100 } }, true).map((n) => n.buy)).toEqual(['AI', 'STORAGE']);
  });

  it('un plan sin peticiones de IA incluidas lo dice en vez de «llegaste al límite»', () => {
    const [n] = usageNotices({ ai: { included: 0, used: 0, usedFromPlan: 0, packRemaining: 0, available: 0 } }, true);
    expect(n.title).toBe('Tu plan no incluye peticiones de IA.');
  });

  it('sin datos no avisa', () => {
    expect(usageNotices(null, true)).toEqual([]);
    expect(usageNotices(undefined, false)).toEqual([]);
    expect(usageNotices({}, true)).toEqual([]);
  });

  it('con paquetes disponibles ya no está agotado', () => {
    const withPack = { included: 5000, used: 5000, usedFromPlan: 5000, packRemaining: 1000, available: 1000 };
    expect(usageNotices({ ai: withPack }, true).find((n) => n.level === 'critical')).toBeUndefined();
  });
});

describe('periodos', () => {
  it('clave del mes en UTC, igual que el API', () => {
    expect(periodKeyOf(new Date('2026-11-21T12:00:00Z'))).toBe('2026-11');
    expect(periodKeyOf(new Date('2026-12-31T23:59:59Z'))).toBe('2026-12');
    expect(periodKeyOf(new Date('2027-01-01T00:00:00Z'))).toBe('2027-01');
    // a las 23:00 del 30 de noviembre en El Salvador (UTC-6) ya es 1 de diciembre en UTC
    expect(periodKeyOf(new Date('2026-12-01T05:00:00Z'))).toBe('2026-12');
  });

  it('valida la clave', () => {
    expect(isPeriodKey('2026-11')).toBe(true);
    expect(isPeriodKey('2026-13')).toBe(false);
    expect(isPeriodKey('2026-00')).toBe(false);
    expect(isPeriodKey('2026-1')).toBe(false);
    expect(isPeriodKey('26-11')).toBe(false);
    expect(isPeriodKey(' 2026-11')).toBe(false);
    expect(isPeriodKey(null)).toBe(false);
    expect(isPeriodKey(202611)).toBe(false);
  });

  it('etiqueta en español', () => {
    expect(periodLabel('2026-11')).toBe('noviembre 2026');
    expect(periodLabel('2027-01')).toBe('enero 2027');
    expect(periodLabel('basura')).toBe('basura');
  });

  it('los últimos 12 meses, cruzando el año', () => {
    const list = recentPeriods(new Date('2026-02-10T00:00:00Z'));
    expect(list).toHaveLength(12);
    expect(list[0]).toEqual({ key: '2026-02', label: 'febrero 2026' });
    expect(list[1].key).toBe('2026-01');
    expect(list[2].key).toBe('2025-12');
    expect(list[11].key).toBe('2025-03');
    expect(new Set(list.map((p) => p.key)).size).toBe(12);
  });

  it('el 31 no se salta meses', () => {
    const list = recentPeriods(new Date('2026-03-31T00:00:00Z'), 3);
    expect(list.map((p) => p.key)).toEqual(['2026-03', '2026-02', '2026-01']);
  });

  it('la cantidad se acota', () => {
    expect(recentPeriods(new Date('2026-11-01T00:00:00Z'), 0)).toHaveLength(1);
    expect(recentPeriods(new Date('2026-11-01T00:00:00Z'), 9999)).toHaveLength(60);
    expect(recentPeriods(new Date('2026-11-01T00:00:00Z'), NaN)).toHaveLength(1);
  });

  it('¿es el mes que corre?', () => {
    expect(isCurrentPeriod('2026-11', new Date('2026-11-21T12:00:00Z'))).toBe(true);
    expect(isCurrentPeriod('2026-10', new Date('2026-11-21T12:00:00Z'))).toBe(false);
  });
});

function org(patch: Partial<ConsumptionOrgRow> = {}): ConsumptionOrgRow {
  return {
    organizationId: 'o1', organizationName: 'Despacho Rivas & Asociados', planCode: 'EMPRESA_DESPACHO', planName: 'Empresa Despacho', status: 'ACTIVE',
    exempt: false, requests: 1950, requestsIncluded: 5000, packRequests: 0, aiCostUsd: 2.34, storageGb: 18.4, storageLimitGb: 100,
    storageByType: { VIDEO: 10 * GB, PDF: 8.4 * GB }, storageCostSupabaseUsd: 0.39192, storageCostR2Usd: 0.276, monthlyIncomeUsd: 124.17,
    variableCostUsd: 2.73192, marginUsd: 121.43808, ...patch,
  };
}

describe('una organización en la pantalla de consumo', () => {
  it('peticiones, espacio, costos y margen', () => {
    const v = orgView(org(), 'SUPABASE');
    expect(v.requestsPct).toBeCloseTo(39, 5);
    expect(v.storagePct).toBeCloseTo(18.4, 5);
    expect(v.totalCost).toBeCloseTo(2.73192, 5);
    expect(v.margin).toBeCloseTo(121.43808, 5);
    expect(v.marginPct).toBeCloseTo(97.8, 1);
    expect(v.planLabel).toBe('Empresa Despacho');
    expect(v.statusLabel).toBe('Activa');
    expect(v.alerts).toEqual([]);
  });

  it('con Supabase coincide con el costo variable que calcula el API', () => {
    const r = org();
    const v = orgView(r, 'SUPABASE');
    expect(v.totalCost).toBeCloseTo(r.variableCostUsd, 5);
    expect(v.margin).toBeCloseTo(r.marginUsd, 5);
  });

  it('con R2 usa el costo de R2 y recalcula el margen', () => {
    const v = orgView(org(), 'R2');
    expect(v.storageCost).toBeCloseTo(0.276, 5);
    expect(v.totalCost).toBeCloseTo(2.34 + 0.276, 5);
    expect(v.margin).toBeCloseTo(124.17 - 2.34 - 0.276, 5);
  });

  it('lo que salió de paquetes no cuenta contra lo incluido', () => {
    const v = orgView(org({ requests: 5200, packRequests: 200, requestsIncluded: 5000 }), 'SUPABASE');
    expect(v.planRequests).toBe(5000);
    expect(v.requestsPct).toBe(100);
    expect(v.requestsLevel).toBe('full');
    expect(v.requests).toBe(5200);
  });

  it('sin tope de peticiones: sin porcentaje ni alerta', () => {
    const v = orgView(org({ requestsIncluded: null, requests: 800 }), 'SUPABASE');
    expect(v.requestsPct).toBeNull();
    expect(v.requestsLevel).toBe('none');
    expect(v.alerts.find((a) => a.code.startsWith('IA'))).toBeUndefined();
  });

  it('alertas de IA: cerca (80 %) y agotada (100 %)', () => {
    expect(orgView(org({ requests: 4100 }), 'SUPABASE').alerts[0]).toMatchObject({ code: 'IA_CERCA', level: 'warning' });
    expect(orgView(org({ requests: 5000 }), 'SUPABASE').alerts[0]).toMatchObject({ code: 'IA_AGOTADA', level: 'critical' });
  });

  it('alertas de espacio', () => {
    expect(orgView(org({ storageGb: 85 }), 'SUPABASE').alerts.map((a) => a.code)).toContain('ESPACIO_CERCA');
    expect(orgView(org({ storageGb: 100 }), 'SUPABASE').alerts.map((a) => a.code)).toContain('ESPACIO_LLENO');
  });

  it('sin ingreso: margen nulo y alerta informativa si consume; las exentas no alertan', () => {
    const v = orgView(org({ monthlyIncomeUsd: 0 }), 'SUPABASE');
    expect(v.marginPct).toBeNull();
    expect(v.alerts.map((a) => a.code)).toContain('SIN_INGRESO');
    const exempt = orgView(org({ monthlyIncomeUsd: 0, exempt: true, planName: 'Interno' }), 'SUPABASE');
    expect(exempt.alerts.map((a) => a.code)).not.toContain('SIN_INGRESO');
    // sin consumo tampoco
    expect(orgView(org({ monthlyIncomeUsd: 0, aiCostUsd: 0, storageGb: 0, storageCostSupabaseUsd: 0 }), 'SUPABASE').alerts.map((a) => a.code)).not.toContain('SIN_INGRESO');
  });

  it('margen bajo y pérdida', () => {
    const low = orgView(org({ monthlyIncomeUsd: 10, aiCostUsd: 6, storageCostSupabaseUsd: 0 }), 'SUPABASE');
    expect(low.marginPct).toBeCloseTo(40, 5);
    expect(low.alerts.map((a) => a.code)).toContain('MARGEN_BAJO');
    expect(LOW_MARGIN_PCT).toBe(50);
    const loss = orgView(org({ monthlyIncomeUsd: 10, aiCostUsd: 15, storageCostSupabaseUsd: 0 }), 'SUPABASE');
    expect(loss.margin).toBeCloseTo(-5, 5);
    expect(loss.alerts.map((a) => a.code)).toContain('PIERDE_DINERO');
    expect(loss.alerts.map((a) => a.code)).not.toContain('MARGEN_BAJO');
  });

  it('exactamente 50 % de margen no alerta', () => {
    expect(orgView(org({ monthlyIncomeUsd: 10, aiCostUsd: 5, storageCostSupabaseUsd: 0 }), 'SUPABASE').alerts.map((a) => a.code)).not.toContain('MARGEN_BAJO');
  });

  it('sin plan', () => {
    const v = orgView(org({ planCode: null, planName: null, status: null }), 'SUPABASE');
    expect(v.planLabel).toBe('Sin plan');
    expect(v.statusLabel).toBeNull();
  });

  it('espacio con tope 0 o sin tope no da NaN', () => {
    expect(orgView(org({ storageLimitGb: 0, storageGb: 2 }), 'SUPABASE').storagePct).toBe(100);
    const none = orgView(org({ storageLimitGb: null }), 'SUPABASE');
    expect(none.storagePct).toBeNull();
    expect(none.storageLevel).toBe('none');
  });

  it('datos incompletos o raros no rompen', () => {
    const v = orgView({ organizationId: 'x' } as ConsumptionOrgRow, 'SUPABASE');
    expect(v.name).toBe('—');
    for (const n of [v.requests, v.aiCost, v.storageBytes, v.storageCost, v.totalCost, v.income, v.margin]) expect(Number.isNaN(n)).toBe(false);
    expect(v.marginPct).toBeNull();
  });

  it('nombres con HTML se conservan como texto', () => {
    expect(orgView(org({ organizationName: '<img src=x onerror=alert(1)>' }), 'SUPABASE').name).toBe('<img src=x onerror=alert(1)>');
  });

  it('un estado desconocido no se muestra crudo', () => {
    expect(orgView(org({ status: 'RARO' }), 'SUPABASE').statusLabel).toBeNull();
  });

  it('cantidades enormes', () => {
    const v = orgView(org({ requests: 9e12, aiCostUsd: 1e10, requestsIncluded: 1 }), 'SUPABASE');
    expect(Number.isFinite(v.requestsPct as number)).toBe(true);
    expect(pctText(v.requestsPct)).toBe('+999 %');
    expect(barWidth(v.requestsPct)).toBe(100);
  });
});

describe('orden de las organizaciones', () => {
  const views = [
    orgView(org({ organizationId: 'a', organizationName: 'Beta', requests: 100, aiCostUsd: 1, monthlyIncomeUsd: 100 }), 'SUPABASE'),
    orgView(org({ organizationId: 'b', organizationName: 'Álamo', requests: 900, aiCostUsd: 9, monthlyIncomeUsd: 50 }), 'SUPABASE'),
    orgView(org({ organizationId: 'c', organizationName: 'Zeta', requests: 500, aiCostUsd: 5, monthlyIncomeUsd: 0 }), 'SUPABASE'),
    orgView(org({ organizationId: 'd', organizationName: 'Cima', requests: 500, aiCostUsd: 5, monthlyIncomeUsd: 0 }), 'SUPABASE'),
  ];

  it('por costo: el más caro primero', () => {
    expect(sortOrgs(views, 'COST').map((v) => v.id)).toEqual(['b', 'd', 'c', 'a']);
  });

  it('por peticiones: las más usadas primero, empates por nombre', () => {
    expect(sortOrgs(views, 'REQUESTS').map((v) => v.id)).toEqual(['b', 'd', 'c', 'a']);
  });

  it('por margen: el más bajo primero y las que no tienen ingreso al final', () => {
    const ids = sortOrgs(views, 'MARGIN').map((v) => v.id);
    expect(ids.slice(0, 2)).toEqual(['b', 'a']);
    expect(ids.slice(2)).toEqual(['d', 'c']);
  });

  it('por nombre con acentos en español', () => {
    expect(sortOrgs(views, 'NAME').map((v) => v.name)).toEqual(['Álamo', 'Beta', 'Cima', 'Zeta']);
  });

  it('no modifica la lista original ni falla con la lista vacía', () => {
    const before = views.map((v) => v.id);
    sortOrgs(views, 'MARGIN');
    expect(views.map((v) => v.id)).toEqual(before);
    expect(sortOrgs([], 'COST')).toEqual([]);
  });
});

describe('totales del mes', () => {
  it('suma peticiones, dinero, espacio e ingreso', () => {
    const t = consumptionTotals([
      orgView(org({ requests: 1000, aiCostUsd: 1.2, storageGb: 10, storageCostSupabaseUsd: 0.213, monthlyIncomeUsd: 100 }), 'SUPABASE'),
      orgView(org({ organizationId: 'o2', requests: 2000, aiCostUsd: 2.4, storageGb: 30, storageCostSupabaseUsd: 0.639, monthlyIncomeUsd: 0 }), 'SUPABASE'),
    ]);
    expect(t.orgs).toBe(2);
    expect(t.requests).toBe(3000);
    expect(t.aiCost).toBeCloseTo(3.6, 5);
    expect(t.storageBytes).toBeCloseTo(40 * GB, 0);
    expect(t.variableCost).toBeCloseTo(3.6 + 0.852, 5);
    expect(t.income).toBe(100);
    expect(t.margin).toBeCloseTo(100 - 4.452, 5);
    expect(t.marginPct).toBeCloseTo(95.548, 3);
  });

  it('sin organizaciones o sin ingreso: ceros y margen nulo, nunca NaN', () => {
    const empty = consumptionTotals([]);
    expect(empty).toMatchObject({ orgs: 0, requests: 0, income: 0, marginPct: null, variableCost: 0 });
    const noIncome = consumptionTotals([orgView(org({ monthlyIncomeUsd: 0 }), 'SUPABASE')]);
    expect(noIncome.marginPct).toBeNull();
    expect(Number.isNaN(noIncome.margin)).toBe(false);
  });
});

describe('espacio por tipo en toda la plataforma', () => {
  const rates = { supabase: 0.0213, cloudflareR2: 0.015 };
  const rows = [
    { storageByType: { VIDEO: 40 * GB, PDF: 10 * GB } },
    { storageByType: { VIDEO: 10 * GB, AUDIO: 20 * GB } },
    { storageByType: null },
  ];

  it('suma las organizaciones y ordena', () => {
    const t = typeTotals(rows, 'SUPABASE', rates);
    expect(t.types.map((x) => x.key).slice(0, 3)).toEqual(['VIDEO', 'AUDIO', 'PDF']);
    expect(t.totalBytes).toBe(80 * GB);
    expect(t.types[0].bytes).toBe(50 * GB);
    expect(t.types[0].share).toBeCloseTo(62.5, 5);
    expect(t.types[0].barPct).toBe(100);
    expect(t.measured).toBe(2);
  });

  it('costo estimado = GB × tarifa del proveedor', () => {
    expect(typeTotals(rows, 'SUPABASE', rates).types[0].estCost).toBeCloseTo(50 * 0.0213, 6);
    expect(typeTotals(rows, 'R2', rates).types[0].estCost).toBeCloseTo(50 * 0.015, 6);
  });

  it('sin datos no da NaN', () => {
    const t = typeTotals([], 'SUPABASE', rates);
    expect(t.totalBytes).toBe(0);
    expect(t.types.every((x) => x.share === 0 && x.barPct === 0 && x.estCost === 0)).toBe(true);
    const noRates = typeTotals(rows, 'R2', undefined as never);
    expect(noRates.types[0].estCost).toBe(0);
  });
});

describe('consumo por asistente (superadmin)', () => {
  it('peticiones y dinero, de mayor a menor', () => {
    const rows = agentTotals([
      { agent: 'ARGUS', requests: 90, costUsd: 0.108 }, { agent: 'MINERVA', requests: 240, costUsd: 0.288 }, { agent: 'OTROS', requests: 0, costUsd: 0 },
    ]);
    expect(rows.map((r) => r.agent)).toEqual(['MINERVA', 'ARGUS']);
    expect(rows[0]).toMatchObject({ barPct: 100, info: 'Planificación y Riesgos' });
    expect(rows[0].share).toBeCloseTo(72.7, 1);
    expect(rows[1].barPct).toBeCloseTo(37.5, 5);
  });

  it('sin datos', () => {
    expect(agentTotals([])).toEqual([]);
    expect(agentTotals(null)).toEqual([]);
    expect(agentTotals(undefined)).toEqual([]);
  });

  it('un asistente con costo pero sin peticiones sigue apareciendo', () => {
    expect(agentTotals([{ agent: 'X', requests: 0, costUsd: 0.5 }])).toHaveLength(1);
  });
});

describe('lista de vigilancia y comparación de proveedores', () => {
  it('pone primero lo crítico y deja fuera lo meramente informativo', () => {
    const views = [
      orgView(org({ organizationId: 'a', organizationName: 'Beta', requests: 4100 }), 'SUPABASE'), // IA_CERCA warning
      orgView(org({ organizationId: 'b', organizationName: 'Álamo', requests: 5000 }), 'SUPABASE'), // IA_AGOTADA critical
      orgView(org({ organizationId: 'c', organizationName: 'Cima', monthlyIncomeUsd: 0 }), 'SUPABASE'), // solo info
      orgView(org({ organizationId: 'd', organizationName: 'Dos' }), 'SUPABASE'), // nada
    ];
    const list = attentionList(views);
    expect(list.map((x) => x.id)).toEqual(['b', 'a']);
    expect(list[0].alert.code).toBe('IA_AGOTADA');
  });

  it('compara el costo del espacio entre proveedores', () => {
    expect(providerComparison([{ storageCostSupabaseUsd: 1, storageCostR2Usd: 0.7 }, { storageCostSupabaseUsd: 2, storageCostR2Usd: 1.4 }])).toEqual({ supabase: 3, r2: expect.closeTo(2.1, 6) });
    expect(providerComparison([])).toEqual({ supabase: 0, r2: 0 });
  });
});

describe('respuesta del API', () => {
  it('normaliza listas y números faltantes', () => {
    const n = normalizeConsumption({ periodKey: '2026-11', costPerRequestUsd: 0.0012, safetyMultiplier: 3, rates: { supabase: 0.0213, cloudflareR2: 0.015 }, organizations: [org()], agents: [] });
    expect(n.periodKey).toBe('2026-11');
    expect(n.organizations).toHaveLength(1);
    const empty = normalizeConsumption(null);
    expect(empty).toEqual({ periodKey: '', costPerRequestUsd: 0, safetyMultiplier: 0, rates: { supabase: 0, cloudflareR2: 0 }, organizations: [], agents: [] });
    const weird = normalizeConsumption({ organizations: 'x' as never, agents: {} as never, periodKey: 'abc' });
    expect(weird.organizations).toEqual([]);
    expect(weird.agents).toEqual([]);
    expect(weird.periodKey).toBe('');
  });
});

describe('etiquetas de las alertas', () => {
  it('cada alerta que puede producir una organización tiene etiqueta corta', () => {
    const codes = new Set<string>();
    for (const patch of [
      { requests: 5000 }, { requests: 4100 }, { storageGb: 100 }, { storageGb: 85 }, { monthlyIncomeUsd: 10, aiCostUsd: 15, storageCostSupabaseUsd: 0 },
      { monthlyIncomeUsd: 10, aiCostUsd: 6, storageCostSupabaseUsd: 0 }, { monthlyIncomeUsd: 0 },
    ]) for (const a of orgView(org(patch), 'SUPABASE').alerts) codes.add(a.code);
    expect([...codes].sort()).toEqual(Object.keys(ALERT_SHORT).sort());
    for (const k of Object.keys(ALERT_SHORT)) expect(ALERT_SHORT[k as keyof typeof ALERT_SHORT].label.length).toBeGreaterThan(3);
  });
});
