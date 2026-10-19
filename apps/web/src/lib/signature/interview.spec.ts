import {
  actaResponseRows, initialActaPayload, isInterviewPaper, isValidInterviewDate, localIsoDate, validateActaPayload, type ActaDraft,
} from './interview';

const NOW = new Date('2026-10-19T12:00:00Z');
const CONTENT = 'El entrevistado explicó el proceso de aprobación de pagos y confirmó que existe segregación de funciones.';
const ok: ActaDraft = { interviewDate: '2026-10-15', modality: 'VIRTUAL', interviewers: 'Ana Auditora', content: CONTENT };
const check = (over: Partial<ActaDraft> = {}) => validateActaPayload({ ...ok, ...over }, NOW);

describe('valores iniciales', () => {
  it('hoy, presencial y el nombre de quien envía como entrevistador', () => {
    const p = initialActaPayload('Ana Auditora', new Date(2026, 9, 19, 23, 30)); // 19-oct-2026 23:30 hora local
    expect(p).toMatchObject({ interviewDate: '2026-10-19', modality: 'PRESENCIAL', interviewers: 'Ana Auditora', content: '' });
  });
  it('la fecha es la del calendario LOCAL (no la de UTC, que a esa hora ya sería el día siguiente)', () => {
    expect(localIsoDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(localIsoDate(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
});

describe('validación previa (igual que el servidor)', () => {
  it('listo para enviar', () => {
    expect(check()).toBeNull();
    expect(check({ location: 'Teams', confidentialityNote: 'Reservado' })).toBeNull();
  });
  it('fecha, modalidad, entrevistadores y texto del acta', () => {
    for (const bad of ['', undefined, '15/10/2026', '2026-02-31', '2026-10-21', '2016-10-18']) expect(check({ interviewDate: bad })).toMatch(/fecha de la entrevista/);
    expect(check({ modality: undefined })).toMatch(/modalidad/);
    expect(check({ interviewers: ' ' })).toMatch(/quién o quiénes/);
    expect(check({ interviewers: 'x'.repeat(501) })).toMatch(/entrevistadores son demasiado largos/);
    expect(check({ content: 'corto' })).toMatch(/muy corto/);
    expect(check({ content: 'x'.repeat(50_001) })).toMatch(/demasiado largo/);
    expect(check({ location: 'x'.repeat(201) })).toMatch(/lugar/);
    expect(check({ confidentialityNote: 'x'.repeat(1001) })).toMatch(/nota de confidencialidad/);
  });
  it('fechas: hoy y mañana valen, pasado mañana no', () => {
    expect(isValidInterviewDate('2026-10-19', NOW)).toBe(true);
    expect(isValidInterviewDate('2026-10-20', NOW)).toBe(true);
    expect(isValidInterviewDate('2026-10-21', NOW)).toBe(false);
  });
});

describe('qué papeles admiten acta', () => {
  it('PT-ENTREV, tipo entrevista y B-INT-*; nada más', () => {
    expect(isInterviewPaper({ paperCode: 'PT-ENTREV' })).toBe(true);
    expect(isInterviewPaper({ type: 'INTERVIEW' })).toBe(true);
    expect(isInterviewPaper({ code: 'B-INT-03' })).toBe(true);
    expect(isInterviewPaper({ paperCode: 'PT-FIN-C-SUST', type: 'SUBSTANTIVE_TEST', code: 'C-1' })).toBe(false);
    expect(isInterviewPaper({})).toBe(false);
  });
});

describe('respuesta del entrevistado en el panel', () => {
  it('conforme y no conforme con observaciones', () => {
    expect(actaResponseRows({ conforme: true, observations: '' })).toEqual([['Respuesta', 'Conforme con el contenido del acta']]);
    expect(actaResponseRows({ conforme: false, observations: ' Falta la reunión del lunes. ' })).toEqual([['Respuesta', 'No conforme'], ['Observaciones', 'Falta la reunión del lunes.']]);
  });
  it('formas raras no rompen', () => {
    expect(actaResponseRows(null)).toEqual([]);
    expect(actaResponseRows('x')).toEqual([]);
    expect(actaResponseRows({})).toEqual([]);
  });
});
