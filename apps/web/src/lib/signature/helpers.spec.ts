import {
  buildResponse, fileProblem, formatBytes, formatDateTimeSv, formatVerificationInput, isCompleteVerificationCode,
  MAX_FILE_BYTES, MAX_FILES, parseAmount, sameHash, sha256Hex, validateSigner,
} from './helpers';
import type { FormField } from './types';

describe('parseAmount', () => {
  it.each([
    ['1250', 1250], ['1250.5', 1250.5], ['1250.50', 1250.5], ['1,250.50', 1250.5], ['1.250,50', 1250.5], ['1 250,5', 1250.5],
    ['$1,250.00', 1250], ['USD 12,5', 12.5], ['1,234', 1234], ['1.234.567', 1234567], ['1,234,567', 1234567], ['1.234.567,89', 1234567.89],
    ['0.5', 0.5], ['0', 0], ['12,50', 12.5], ['  300  ', 300], ['1,000,000.00', 1000000],
  ])('entiende %p como %p', (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it.each([
    [''], ['abc'], ['-5'], ['1.234'], ['10.999'], ['1234.567'], ['12,34,5'], ['1,2,3'], ['1.2.3'], ['1,234.567'], ['1..5'], [',5.'], ['12.345,678'], ['99999999999999'],
  ])('rechaza %p (ambiguo o mal escrito: mejor pedir que lo corrijan)', (input) => {
    expect(parseAmount(input)).toBeNull();
  });

  it('el punto es el decimal: con 3 dígitos detrás es ambiguo y se rechaza; la coma con 3 dígitos son miles', () => {
    expect(parseAmount('10.99')).toBe(10.99);
    expect(parseAmount('10.999')).toBeNull();
    expect(parseAmount('10,999')).toBe(10999);
  });
});

describe('formatVerificationInput', () => {
  it('pone mayúsculas, quita lo que no sirve y agrupa de a 4', () => {
    expect(formatVerificationInput('abcd')).toBe('ABCD');
    expect(formatVerificationInput('abcd-efgh ijkl_mnop')).toBe('ABCD-EFGH-IJKL-MNOP');
    expect(formatVerificationInput('abcdefghijklmnopqrstuvwxyz')).toBe('ABCD-EFGH-IJKL-MNOP');
    expect(formatVerificationInput('')).toBe('');
  });
  it('sabe cuándo el código está completo', () => {
    expect(isCompleteVerificationCode('ABCD-EFGH-JKMN-PQRS')).toBe(true);
    expect(isCompleteVerificationCode('ABCD-EFGH-JKMN')).toBe(false);
    expect(isCompleteVerificationCode('abcd-efgh-jkmn-pqrs')).toBe(false);
  });
});

const FIELDS: FormField[] = [
  { key: 'agrees', label: '¿De acuerdo?', type: 'boolean', required: true },
  { key: 'confirmedAmount', label: 'Monto', type: 'amount', required: false },
  { key: 'comments', label: 'Comentarios', type: 'textarea', required: false, maxLength: 20 },
  { key: 'ref', label: 'Referencia', type: 'text', required: true },
];

describe('buildResponse', () => {
  it('arma la respuesta con los tipos correctos', () => {
    const r = buildResponse(FIELDS, { agrees: false, confirmedAmount: '1,250.50', comments: '  no coincide  ', ref: ' REF-1 ' });
    expect(r.ok).toBe(true);
    expect(r.response).toEqual({ agrees: false, confirmedAmount: 1250.5, comments: 'no coincide', ref: 'REF-1' });
  });
  it('un booleano exige una elección explícita (false ≠ sin elegir)', () => {
    expect(buildResponse(FIELDS, { ref: 'x' }).errors.agrees).toBe('Elige una opción.');
    expect(buildResponse(FIELDS, { agrees: false, ref: 'x' }).ok).toBe(true);
  });
  it('omite los opcionales vacíos y marca los obligatorios', () => {
    const r = buildResponse(FIELDS, { agrees: true, confirmedAmount: '  ', comments: '', ref: '   ' });
    expect(r.response).toEqual({ agrees: true });
    expect(r.errors).toEqual({ ref: 'Este campo es obligatorio.' });
  });
  it('montos inválidos y textos demasiado largos', () => {
    const r = buildResponse(FIELDS, { agrees: true, confirmedAmount: '12,34,5', comments: 'x'.repeat(21), ref: 'a' });
    expect(r.ok).toBe(false);
    expect(r.errors.confirmedAmount).toMatch(/Monto no válido/);
    expect(r.errors.comments).toBe('Máximo 20 caracteres.');
  });
  it('un monto obligatorio vacío pide el monto', () => {
    const r = buildResponse([{ key: 'm', label: 'Monto', type: 'amount', required: true }], {});
    expect(r.errors.m).toBe('Escribe el monto.');
  });
});

describe('validateSigner', () => {
  it('nombre de 2 a 120 caracteres; cargo según el documento', () => {
    expect(validateSigner({ name: 'A', role: '', roleRequired: false })).toEqual({ signedName: 'Escribe tu nombre completo.' });
    expect(validateSigner({ name: 'Ana Pérez', role: '', roleRequired: true })).toEqual({ signedRole: 'Escribe tu cargo.' });
    expect(validateSigner({ name: 'Ana Pérez', role: '', roleRequired: false })).toEqual({});
    expect(validateSigner({ name: 'x'.repeat(121), role: 'y'.repeat(121), roleRequired: false })).toEqual({
      signedName: 'Máximo 120 caracteres.', signedRole: 'Máximo 120 caracteres.',
    });
    expect(validateSigner({ name: '  Ana  ', role: ' Gerente ', roleRequired: true })).toEqual({});
  });
});

describe('fileProblem', () => {
  const none = { count: 0, bytes: 0 };
  it('solo PDF, JPG y PNG (la extensión es solo ayuda de UX: la API decide por los bytes)', () => {
    expect(fileProblem({ name: 'estado.PDF', size: 100 }, none)).toBeNull();
    expect(fileProblem({ name: 'foto.jpeg', size: 100 }, none)).toBeNull();
    expect(fileProblem({ name: 'foto.png', size: 100 }, none)).toBeNull();
    expect(fileProblem({ name: 'programa.exe', size: 100 }, none)).toMatch(/PDF, JPG o PNG/);
    expect(fileProblem({ name: 'hoja.xlsx', size: 100 }, none)).toMatch(/PDF, JPG o PNG/);
  });
  it('aplica los límites de tamaño y cantidad', () => {
    expect(fileProblem({ name: 'a.pdf', size: 0 }, none)).toBe('El archivo está vacío.');
    expect(fileProblem({ name: 'a.pdf', size: MAX_FILE_BYTES + 1 }, none)).toMatch(/10 MB/);
    expect(fileProblem({ name: 'a.pdf', size: 1 }, { count: MAX_FILES, bytes: 5 })).toMatch(/Máximo 5/);
    expect(fileProblem({ name: 'a.pdf', size: 5 * 1024 * 1024 }, { count: 3, bytes: 28 * 1024 * 1024 })).toMatch(/30 MB/);
  });
  it('formatBytes', () => {
    expect(formatBytes(500)).toBe('1 KB');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});

describe('huella SHA-256', () => {
  it('calcula la huella estándar (vector de prueba conocido)', async () => {
    const buf = new TextEncoder().encode('abc').buffer as ArrayBuffer;
    expect(await sha256Hex(buf)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('compara sin importar mayúsculas ni espacios', () => {
    expect(sameHash(' ABC123 ', 'abc123')).toBe(true);
    expect(sameHash('abc123', 'abc124')).toBe(false);
  });
});

describe('fechas en hora de El Salvador', () => {
  it('convierte de UTC a UTC−6', () => {
    expect(formatDateTimeSv('2026-10-19T03:30:00.000Z')).toMatch(/18 de octubre de 2026/); // 21:30 del día 18 en El Salvador
    expect(formatDateTimeSv(null)).toBe('—');
  });
});
