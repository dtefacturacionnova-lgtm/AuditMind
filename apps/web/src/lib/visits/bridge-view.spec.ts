import {
  BridgeRowView, StepTarget, acceptSummary, acceptableCodes, canAcceptStep, defaultTarget, filterBridgeRows, pruneSelection, toggleCode,
} from './bridge-view';

const r = (code: string, extra: Partial<BridgeRowView> = {}): BridgeRowView => ({
  code, name: `Cuenta ${code}`, nature: 'BALANCE', presence: 'AMBAS', interimBalance: 0, finalBalance: 0, movement: 0,
  expectedFinal: null, deviation: null, deviationPct: null, alert: false, reason: null, suggestedStep: null, stepId: null, ...extra,
});
const alerta = (code: string, extra: Partial<BridgeRowView> = {}) =>
  r(code, { alert: true, reason: 'MOVIMIENTO_SOBRE_ME', suggestedStep: `Paso ${code}`, ...extra });

const rows = [
  r('1101'), alerta('1201'), alerta('1301', { stepId: 's1' }), alerta('1401', { presence: 'SOLO_INTERINA' }),
  r('1501', { presence: 'SOLO_FINAL' }), alerta('4101', { nature: 'RESULTADOS', presence: 'SOLO_FINAL' }),
];

describe('filterBridgeRows', () => {
  it('cada filtro deja las filas que dice', () => {
    expect(filterBridgeRows(rows, 'TODAS').map((x) => x.code)).toEqual(['1101', '1201', '1301', '1401', '1501', '4101']);
    expect(filterBridgeRows(rows, 'ALERTAS').map((x) => x.code)).toEqual(['1201', '1301', '1401', '4101']);
    expect(filterBridgeRows(rows, 'PENDIENTES').map((x) => x.code)).toEqual(['1201', '1401', '4101']);
    expect(filterBridgeRows(rows, 'SOLO_INTERINA').map((x) => x.code)).toEqual(['1401']);
    expect(filterBridgeRows(rows, 'SOLO_FINAL').map((x) => x.code)).toEqual(['1501', '4101']);
  });

  it('no modifica lo recibido', () => {
    const copia = JSON.stringify(rows);
    filterBridgeRows(rows, 'ALERTAS');
    expect(JSON.stringify(rows)).toBe(copia);
  });
});

describe('aceptar pasos', () => {
  it('solo se acepta una cuenta con alerta, paso sugerido y sin paso creado', () => {
    expect(canAcceptStep(alerta('1'))).toBe(true);
    expect(canAcceptStep(r('1'))).toBe(false);
    expect(canAcceptStep(alerta('1', { stepId: 'x' }))).toBe(false);
    expect(canAcceptStep(alerta('1', { suggestedStep: null }))).toBe(false);
    expect(acceptableCodes(rows)).toEqual(['1201', '1401', '4101']);
  });

  it('la selección pierde lo que ya no se puede aceptar y alterna códigos', () => {
    expect(pruneSelection(['1201', '1301', '9999', '4101'], rows)).toEqual(['1201', '4101']);
    expect(toggleCode(['1201'], '4101')).toEqual(['1201', '4101']);
    expect(toggleCode(['1201', '4101'], '1201')).toEqual(['4101']);
  });

  it('resume lo creado y lo omitido con su motivo', () => {
    expect(acceptSummary({ created: 0, skipped: [] })).toEqual(['No se creó ningún paso nuevo.']);
    expect(acceptSummary({ created: 1, skipped: [] })).toEqual(['1 paso de período restante creado.']);
    expect(acceptSummary({ created: 2, skipped: [{ code: '1101', reason: 'Ya tiene un paso.' }] })).toEqual([
      '2 pasos de período restante creados.', '1101: Ya tiene un paso.',
    ]);
  });
});

describe('defaultTarget', () => {
  const t = (paperCode: string | null, sectionId = paperCode ?? 'x'): StepTarget => ({ sectionId, paperCode, paperTitle: null, sectionLabel: 'Procedimientos', procedureCount: 0 });

  it('prefiere la primera cuadrícula de pruebas sustantivas (C-…)', () => {
    expect(defaultTarget([t('B-01'), t('C-02'), t('C-01')])?.paperCode).toBe('C-02');
    expect(defaultTarget([t('c-05')])?.paperCode).toBe('c-05');
  });

  it('si no hay C-… usa la primera; sin cuadrículas, nada', () => {
    expect(defaultTarget([t('B-01'), t('D-01')])?.paperCode).toBe('B-01');
    expect(defaultTarget([t(null)])?.sectionId).toBe('x');
    expect(defaultTarget([])).toBeNull();
  });
});
