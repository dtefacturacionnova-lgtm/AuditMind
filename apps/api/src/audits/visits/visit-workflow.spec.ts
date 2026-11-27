import { AuditBackupExportService } from '../backup/audit-backup-export.service';
import { AUDIT_SCOPED_MODELS } from '../backup/audit-backup.types';
import {
  VISIT_AUDIT_TYPES, balanceWarnings, canChangeVisitStatus, defaultPeriodLabel, isVisitKind, parseDateOnly,
} from './visit-workflow';

describe('canChangeVisitStatus', () => {
  const ok: Array<[string, string]> = [
    ['PLANNED', 'IN_PROGRESS'], ['PLANNED', 'CLOSED'], ['IN_PROGRESS', 'PLANNED'], ['IN_PROGRESS', 'CLOSED'], ['CLOSED', 'IN_PROGRESS'],
    ['PLANNED', 'PLANNED'], ['IN_PROGRESS', 'IN_PROGRESS'], ['CLOSED', 'CLOSED'],
  ];
  it.each(ok)('%s → %s se permite', (from, to) => expect(canChangeVisitStatus(from as any, to as any)).toBe(true));
  it('una visita cerrada no vuelve a «planificada»', () => expect(canChangeVisitStatus('CLOSED', 'PLANNED')).toBe(false));
  it('un estado desconocido nunca se permite', () => {
    expect(canChangeVisitStatus('OTRO' as any, 'CLOSED')).toBe(false);
    expect(canChangeVisitStatus('PLANNED', 'OTRO' as any)).toBe(false);
  });
});

describe('parseDateOnly', () => {
  it('acepta una fecha real y la deja a medianoche UTC', () => expect(parseDateOnly('2026-12-31')?.toISOString()).toBe('2026-12-31T00:00:00.000Z'));
  it('acepta el 29 de febrero solo en año bisiesto', () => {
    expect(parseDateOnly('2028-02-29')).not.toBeNull();
    expect(parseDateOnly('2026-02-29')).toBeNull();
  });
  it.each(['2026-02-30', '2026-13-01', '2026-00-10', '26-01-01', '2026/01/01', '2026-1-1', '2026-01-01T00:00:00Z', '', ' 2026-01-01'])('rechaza «%s»', (s) => expect(parseDateOnly(s)).toBeNull());
  it.each([null, undefined, 20260101, {}, []])('rechaza un valor que no es texto (%p)', (v) => expect(parseDateOnly(v)).toBeNull());
});

describe('isVisitKind / defaultPeriodLabel / tipos de encargo', () => {
  it('reconoce solo los tres tipos', () => {
    for (const k of ['PLANNING', 'INTERIM', 'FINAL']) expect(isVisitKind(k)).toBe(true);
    for (const k of ['planning', 'FOLLOW_UP', '', null, undefined, 3]) expect(isVisitKind(k)).toBe(false);
  });
  it('la etiqueta por defecto usa el tipo y la fecha de corte en día/mes/año', () => {
    expect(defaultPeriodLabel('PLANNING', new Date('2026-03-05T00:00:00Z'))).toBe('Visita de planificación al 05/03/2026');
    expect(defaultPeriodLabel('INTERIM', new Date('2026-09-30T00:00:00Z'))).toBe('Visita interina al 30/09/2026');
    expect(defaultPeriodLabel('FINAL', new Date('2026-12-31T00:00:00Z'))).toBe('Visita final al 31/12/2026');
  });
  it('las visitas solo aplican a los tipos de auditoría financiera', () => {
    expect([...VISIT_AUDIT_TYPES].sort()).toEqual(['EXTERNAL', 'EXTERNAL_FINANCIAL', 'FINANCIAL']);
  });
});

describe('balanceWarnings', () => {
  const base = { accounts: [{ code: '1' }, { code: '2' }], totalDebit: 100, totalCredit: 100 };
  it('un balance que cuadra y sin repetidos no avisa nada', () => expect(balanceWarnings(base)).toEqual([]));
  it('avisa la diferencia cuando no cuadra', () => {
    const w = balanceWarnings({ ...base, totalDebit: 100.5, totalCredit: 100 });
    expect(w).toHaveLength(1);
    expect(w[0]).toMatch(/no cuadra.*0\.50/);
  });
  it('una diferencia menor a un centavo cuenta como cuadrado', () => expect(balanceWarnings({ ...base, totalDebit: 100.004 })).toEqual([]));
  it('avisa los códigos repetidos (con espacios ignorados) y corta la lista a cinco', () => {
    const accounts = ['A', ' A ', 'B', 'B', 'C', 'C', 'D', 'D', 'E', 'E', 'F', 'F'].map((code) => ({ code }));
    const w = balanceWarnings({ accounts, totalDebit: 0, totalCredit: 0 });
    expect(w).toHaveLength(1);
    expect(w[0]).toMatch(/6 código\(s\) de cuenta repetido\(s\) \(A, B, C, D, E…\)/);
  });
});

describe('respaldo de auditorías', () => {
  it('las visitas no figuran entre los modelos con auditId que quedan fuera del respaldo', () => {
    // La lista trae otros modelos que se excluyen a propósito (documentado en audit-backup.types.ts); aquí solo importa que las visitas entren.
    expect(AuditBackupExportService.prototype.verificarCompletitudModelos.call({})).not.toContain('auditVisit');
  });
  it('las visitas se respaldan ANTES que los balances que apuntan a ellas', () => {
    const orden = AUDIT_SCOPED_MODELS.map((m) => m.model);
    expect(orden.indexOf('auditVisit')).toBeGreaterThanOrEqual(0);
    expect(orden.indexOf('auditVisit')).toBeLessThan(orden.indexOf('trialBalance'));
  });
});
