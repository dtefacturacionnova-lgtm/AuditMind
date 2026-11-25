import { METHODOLOGY } from './caats-methodology';
import { FIELD_DEFS, JSON_UPLOAD_ENGINES } from './caats-fields';

// Los 18 motores que ofrece el selector del papel (CaatsAnalysisPanel) y Analytics.
const ENGINE_IDS = ['gl','ap','payroll','benford','anomaly','sod','vendor_master','related_parties','expenses','revenue_cutoff','bid_rigging','ar_aging','fixed_assets','structuring','missing_trader','tax_haven','dte_validation','sanctions_screening'];

describe('metodología de los motores CAATs (modal explicativo)', () => {
  it.each(ENGINE_IDS)('%s tiene objetivo, metodología, límites y al menos una prueba descrita', (id) => {
    const m = METHODOLOGY[id];
    expect(m).toBeDefined();
    expect(m.objetivo.length).toBeGreaterThan(40);
    expect(m.metodologia.length).toBeGreaterThan(40);
    expect(m.limitaciones.length).toBeGreaterThan(40);
    expect(m.pruebas.length).toBeGreaterThan(0);
    for (const p of m.pruebas) { expect(p.nombre.trim()).not.toBe(''); expect(p.descripcion.trim()).not.toBe(''); }
  });

  it('no hay metodología huérfana ni motor con mapeo sin metodología', () => {
    expect(Object.keys(METHODOLOGY).sort()).toEqual([...ENGINE_IDS].sort());
    for (const id of [...Object.keys(FIELD_DEFS), ...JSON_UPLOAD_ENGINES]) expect(METHODOLOGY[id]).toBeDefined();
  });
});
