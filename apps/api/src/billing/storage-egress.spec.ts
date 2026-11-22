import { EGRESS_DEDUP_MAX, EGRESS_RATES, EgressAccumulator, egressCosts, egressDayKey, egressMeterEnabled, encodeStoragePath } from './storage-egress';

describe('egressMeterEnabled', () => {
  it('«true» fuerza y «false» apaga, sin importar el entorno', () => {
    expect(egressMeterEnabled('true', 'development')).toBe(true);
    expect(egressMeterEnabled('false', 'production')).toBe(false);
  });
  it('sin valor solo corre en producción (el desarrollo local comparte la base con producción)', () => {
    expect(egressMeterEnabled(undefined, 'production')).toBe(true);
    expect(egressMeterEnabled(undefined, 'development')).toBe(false);
    expect(egressMeterEnabled(undefined, undefined)).toBe(false);
    expect(egressMeterEnabled('', 'production')).toBe(true);
  });
  it('tolera mayúsculas y espacios; un valor raro cae a la regla del entorno', () => {
    expect(egressMeterEnabled(' TRUE ', 'development')).toBe(true);
    expect(egressMeterEnabled(' False', 'production')).toBe(false);
    expect(egressMeterEnabled('si', 'development')).toBe(false);
    expect(egressMeterEnabled('si', 'production')).toBe(true);
  });
});

describe('egressDayKey', () => {
  it('es el día en UTC, AAAA-MM-DD', () => {
    expect(egressDayKey(new Date('2026-11-22T00:00:00.000Z'))).toBe('2026-11-22');
    expect(egressDayKey(new Date('2026-11-22T23:59:59.999Z'))).toBe('2026-11-22');
    expect(egressDayKey(new Date('2026-11-23T00:00:00.000Z'))).toBe('2026-11-23');
  });
  it('fin de mes y de año', () => {
    expect(egressDayKey(new Date('2026-12-31T23:30:00Z'))).toBe('2026-12-31');
    expect(egressDayKey(new Date('2027-01-01T00:00:00Z'))).toBe('2027-01-01');
  });
});

describe('encodeStoragePath', () => {
  it('codifica cada tramo y deja las barras', () => {
    expect(encodeStoragePath('evidence/abc123def/Informe final.pdf')).toBe('evidence/abc123def/Informe%20final.pdf');
    expect(encodeStoragePath('a/ñandú/b#1.pdf')).toBe('a/%C3%B1and%C3%BA/b%231.pdf');
  });
  it('una ruta sencilla no cambia', () => {
    expect(encodeStoragePath('evidence/abc123def/archivo-1_v2.pdf')).toBe('evidence/abc123def/archivo-1_v2.pdf');
  });
});

describe('EgressAccumulator', () => {
  it('suma archivos y bytes por (organización, día, tipo)', () => {
    const a = new EgressAccumulator();
    a.add('o1', '2026-11-22', 'VIDEO', 100);
    a.add('o1', '2026-11-22', 'VIDEO', 50);
    a.add('o1', '2026-11-22', 'PDF', 10);
    a.add('o1', '2026-11-23', 'VIDEO', 7);
    a.add('o2', '2026-11-22', 'VIDEO', 1);
    expect(a.size).toBe(4);
    const rows = a.drain();
    expect(rows).toHaveLength(4);
    expect(rows.find((r) => r.organizationId === 'o1' && r.day === '2026-11-22' && r.fileType === 'VIDEO')).toEqual({ organizationId: 'o1', day: '2026-11-22', fileType: 'VIDEO', files: 2, bytes: 150 });
    expect(rows.find((r) => r.organizationId === 'o1' && r.day === '2026-11-23')).toMatchObject({ files: 1, bytes: 7 });
    expect(rows.find((r) => r.organizationId === 'o2')).toMatchObject({ files: 1, bytes: 1 });
  });
  it('drain entrega todo y deja el acumulador vacío', () => {
    const a = new EgressAccumulator();
    a.add('o1', 'd', 'PDF', 5);
    expect(a.drain()).toHaveLength(1);
    expect(a.size).toBe(0);
    expect(a.drain()).toEqual([]);
  });
  it('un tamaño raro (negativo, NaN, infinito) cuenta el archivo pero suma 0 bytes; los decimales se truncan', () => {
    const a = new EgressAccumulator();
    for (const b of [-5, Number.NaN, Number.POSITIVE_INFINITY, 0]) a.add('o1', 'd', 'PDF', b);
    a.add('o1', 'd', 'FOTO', 10.9);
    const rows = a.drain();
    expect(rows.find((r) => r.fileType === 'PDF')).toMatchObject({ files: 4, bytes: 0 });
    expect(rows.find((r) => r.fileType === 'FOTO')).toMatchObject({ files: 1, bytes: 10 });
  });
});

describe('egressCosts: el excedente sobre lo incluido se reparte según lo que descargó cada organización', () => {
  const gb = (o: Record<string, number>) => new Map(Object.entries(o));

  it('mientras el total no pase lo incluido el costo es 0 para todos', () => {
    const r = egressCosts(gb({ a: 100, b: 149 }), 250, 0.09);
    expect(r.totalGb).toBe(249);
    expect(r.overageGb).toBe(0);
    expect(r.overageCostUsd).toBe(0);
    expect([...r.byOrg.values()]).toEqual([0, 0]);
  });
  it('justo en el límite tampoco cobra', () => {
    expect(egressCosts(gb({ a: 250 }), 250, 0.09).overageCostUsd).toBe(0);
  });
  it('si pasa, cobra solo el excedente y lo reparte en proporción', () => {
    const r = egressCosts(gb({ a: 300, b: 100 }), 250, 0.09); // total 400, excedente 150 GB = $13.50
    expect(r.overageGb).toBe(150);
    expect(r.overageCostUsd).toBeCloseTo(13.5, 10);
    expect(r.byOrg.get('a')).toBeCloseTo(10.125, 10); // 75 %
    expect(r.byOrg.get('b')).toBeCloseTo(3.375, 10); // 25 %
    expect((r.byOrg.get('a') ?? 0) + (r.byOrg.get('b') ?? 0)).toBeCloseTo(r.overageCostUsd, 10);
  });
  it('con tarifa 0 (Cloudflare R2) el costo es 0 aunque pase', () => {
    expect(egressCosts(gb({ a: 900 }), 250, 0).overageCostUsd).toBe(0);
  });
  it('sin descargas: todo en 0 y sin dividir entre cero', () => {
    const r = egressCosts(gb({}), 250, 0.09);
    expect(r).toMatchObject({ totalGb: 0, overageGb: 0, overageCostUsd: 0 });
    expect(r.byOrg.size).toBe(0);
    expect(egressCosts(gb({ a: 0 }), 250, 0.09).byOrg.get('a')).toBe(0);
  });
  it('valores raros (negativos, NaN) se toman como 0', () => {
    const r = egressCosts(gb({ a: -50, b: Number.NaN, c: 300 }), 250, 0.09);
    expect(r.totalGb).toBe(300);
    expect(r.byOrg.get('a')).toBe(0);
    expect(r.byOrg.get('b')).toBe(0);
    expect(r.byOrg.get('c')).toBeCloseTo(4.5, 10);
    expect(egressCosts(gb({ a: 300 }), Number.NaN, 0.09).overageGb).toBe(300);
  });
});

describe('constantes', () => {
  it('Supabase Pro incluye 250 GB y cobra $0.09 por GB de más; R2 no cobra descargas', () => {
    expect(EGRESS_RATES).toEqual({ supabaseIncludedGb: 250, supabaseUsdPerGb: 0.09, r2UsdPerGb: 0 });
  });
  it('la memoria contra repeticiones tiene un tope razonable', () => {
    expect(EGRESS_DEDUP_MAX).toBeGreaterThanOrEqual(10_000);
  });
});
