import { BadRequestException } from '@nestjs/common';
import { ACTA_LIMITS, isInterviewPaper, parseActaPayload, parseActaResponse } from './interview-signature.payload';

const NOW = new Date('2026-10-19T12:00:00Z');
const CONTENT = 'El entrevistado explicó el proceso de aprobación de pagos y confirmó que existe segregación de funciones entre quien registra y quien autoriza.';
const ok = { interviewDate: '2026-10-15', modality: 'PRESENCIAL', interviewers: 'Ana Auditora; Luis Revisor', content: CONTENT };
const acta = (over: Record<string, unknown> = {}) => parseActaPayload({ ...ok, ...over }, NOW);
const msg = (fn: () => unknown) => { try { fn(); } catch (e) { expect(e).toBeInstanceOf(BadRequestException); return (e as BadRequestException).message; } throw new Error('no lanzó'); };

describe('Acta · datos que redacta el auditor', () => {
  it('datos correctos: se normalizan (sin espacios sobrantes; opcionales como null)', () => {
    expect(acta({ interviewers: '  Ana Auditora  ', content: `  ${CONTENT}  ` })).toEqual({
      interviewDate: '2026-10-15', modality: 'PRESENCIAL', location: null, interviewers: 'Ana Auditora', content: CONTENT, confidentialityNote: null,
    });
    expect(acta({ location: ' Sala 3 ', confidentialityNote: ' Confidencial ' })).toMatchObject({ location: 'Sala 3', confidentialityNote: 'Confidencial' });
  });

  it('la fecha debe ser real, no futura y de los últimos 10 años (hoy y mañana valen)', () => {
    for (const bad of ['', undefined, '15/10/2026', '2026-02-31', '2026-13-01', '2026-10-21', '2016-10-18', '2026-1-5', 20261015]) {
      expect(msg(() => acta({ interviewDate: bad }))).toMatch(/fecha de la entrevista/);
    }
    expect(acta({ interviewDate: '2026-10-19' }).interviewDate).toBe('2026-10-19');
    expect(acta({ interviewDate: '2026-10-20' }).interviewDate).toBe('2026-10-20'); // zona horaria
    expect(acta({ interviewDate: '2016-10-20' }).interviewDate).toBe('2016-10-20');
  });

  it('modalidad: una de las tres', () => {
    for (const m of ['PRESENCIAL', 'VIRTUAL', 'TELEFONICA']) expect(acta({ modality: m }).modality).toBe(m);
    for (const bad of ['presencial', 'CARA_A_CARA', '', undefined, 1]) expect(msg(() => acta({ modality: bad }))).toMatch(/modalidad/);
  });

  it('entrevistadores: obligatorios, hasta 500; lugar hasta 200; nota hasta 1000', () => {
    expect(msg(() => acta({ interviewers: '' }))).toMatch(/Escribe quién/);
    expect(msg(() => acta({ interviewers: 'A' }))).toMatch(/Escribe quién/);
    expect(msg(() => acta({ interviewers: 'x'.repeat(501) }))).toMatch(/entrevistadores son demasiado largos/);
    expect(acta({ interviewers: 'x'.repeat(500) }).interviewers).toHaveLength(500);
    expect(msg(() => acta({ location: 'x'.repeat(201) }))).toMatch(/lugar es demasiado largo/);
    expect(msg(() => acta({ confidentialityNote: 'x'.repeat(1001) }))).toMatch(/nota de confidencialidad/);
  });

  it('el texto del acta va de 50 a 50 000 caracteres', () => {
    expect(msg(() => acta({ content: 'muy corto' }))).toMatch(/muy corto/);
    expect(msg(() => acta({ content: ' '.repeat(100) }))).toMatch(/muy corto/); // solo espacios
    expect(acta({ content: 'x'.repeat(ACTA_LIMITS.contentMin) }).content).toHaveLength(50);
    expect(acta({ content: 'x'.repeat(ACTA_LIMITS.contentMax) }).content).toHaveLength(50_000);
    expect(msg(() => acta({ content: 'x'.repeat(50_001) }))).toMatch(/demasiado largo/);
    expect(msg(() => acta({ content: 12345 }))).toMatch(/muy corto/);
  });
});

describe('Acta · respuesta del entrevistado', () => {
  it('conforme: basta con indicarlo; las observaciones son opcionales', () => {
    expect(parseActaResponse({ conforme: true })).toEqual({ conforme: true, observations: '' });
    expect(parseActaResponse({ conforme: true, observations: '  sin observaciones  ' })).toEqual({ conforme: true, observations: 'sin observaciones' });
  });
  it('no conforme: las observaciones son obligatorias', () => {
    expect(msg(() => parseActaResponse({ conforme: false }))).toMatch(/escribe tus observaciones/);
    expect(msg(() => parseActaResponse({ conforme: false, observations: '   ' }))).toMatch(/escribe tus observaciones/);
    expect(parseActaResponse({ conforme: false, observations: 'Falta mencionar la reunión del lunes.' }).conforme).toBe(false);
  });
  it('«conforme» debe ser un booleano de verdad, sin campos de más y con observaciones de hasta 4000', () => {
    for (const bad of [undefined, null, 'true', 'sí', 1]) expect(msg(() => parseActaResponse({ conforme: bad }))).toMatch(/Indica si estás conforme/);
    expect(msg(() => parseActaResponse(null))).toMatch(/Indica si estás conforme/);
    expect(msg(() => parseActaResponse({ conforme: true, estado: 'FIRMADO' }))).toMatch(/no corresponden/);
    expect(msg(() => parseActaResponse({ conforme: true, observations: 42 }))).toMatch(/deben ser texto/);
    expect(msg(() => parseActaResponse({ conforme: false, observations: 'x'.repeat(4001) }))).toMatch(/demasiado largas/);
  });
});

describe('Qué papeles admiten acta firmada', () => {
  it('PT-ENTREV, los de tipo entrevista y los B-INT-*', () => {
    expect(isInterviewPaper({ paperCode: 'PT-ENTREV' })).toBe(true);
    expect(isInterviewPaper({ type: 'INTERVIEW' })).toBe(true);
    expect(isInterviewPaper({ paperCode: 'B-INT-02' })).toBe(true);
    expect(isInterviewPaper({ code: 'B-INT-04', paperCode: null })).toBe(true);
  });
  it('cualquier otro no', () => {
    for (const p of [{ paperCode: 'PT-FIN-C-SUST', type: 'SUBSTANTIVE_TEST', code: 'C-1' }, { code: 'B-1' }, { paperCode: 'PT-ENTREVISTA-X' }, {}]) {
      expect(isInterviewPaper(p)).toBe(false);
    }
  });
});
