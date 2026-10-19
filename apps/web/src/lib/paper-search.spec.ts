import { normalizeText, paperMatches, searchPapers, searchTokens, NO_FOLDER_LABEL, type SearchablePhase } from './paper-search';

const entrev = { id: 'p1', code: 'B-10', paperCode: 'PT-ENTREV', title: 'Guía y Papel de Entrevista' };
const concil = { id: 'p2', ref: 'C-3', code: 'C-3', paperCode: 'PT-FIN-C-SUST', title: 'Conciliación bancaria' };
const archivo = { id: 'p3', code: 'FILE-1', title: 'Estado de cuenta', originalFilename: 'Estado_Cuenta_Octubre.PDF' };
const suelto = { id: 'p4', code: 'Z-1', title: 'Carta de representación' };

const phases: SearchablePhase[] = [
  {
    name: 'Planificación',
    folders: [
      { id: 'fA', ref: 'A', name: 'Aceptación', papers: [] },
      {
        id: 'fB', ref: 'B', name: 'Estados Financieros', papers: [entrev],
        children: [{ id: 'fBC', ref: 'B-1', name: 'Cédulas', papers: [concil, archivo] }],
      },
    ],
  },
];

describe('normalizeText', () => {
  it('sin mayúsculas, tildes ni espacios de más', () => {
    expect(normalizeText('  Conciliación   BANCARIA ')).toBe('conciliacion bancaria');
    expect(normalizeText('Guía')).toBe('guia');
    expect(normalizeText(null)).toBe('');
  });
});

describe('searchTokens', () => {
  it('con menos de 2 caracteres no se busca', () => {
    expect(searchTokens('')).toEqual([]);
    expect(searchTokens(' a ')).toEqual([]);
    expect(searchTokens('en')).toEqual(['en']);
    expect(searchTokens('  Guía  entrevista ')).toEqual(['guia', 'entrevista']);
  });
});

describe('paperMatches', () => {
  it('encuentra por código de plantilla, código de índice, título y archivo', () => {
    expect(paperMatches(entrev, searchTokens('PT-ENTREV'))).toBe(true);
    expect(paperMatches(entrev, searchTokens('b-10'))).toBe(true);
    expect(paperMatches(entrev, searchTokens('entrevista'))).toBe(true);
    expect(paperMatches(archivo, searchTokens('estado_cuenta'))).toBe(true);
    expect(paperMatches(archivo, searchTokens('.pdf'))).toBe(true);
  });
  it('sin tildes ni mayúsculas, y varias palabras con Y', () => {
    expect(paperMatches(concil, searchTokens('CONCILIACION'))).toBe(true);
    expect(paperMatches(entrev, searchTokens('guia entrevista'))).toBe(true);
    expect(paperMatches(entrev, searchTokens('guia conciliacion'))).toBe(false);
  });
  it('sin palabras válidas no coincide con nada', () => {
    expect(paperMatches(entrev, [])).toBe(false);
  });
});

describe('searchPapers', () => {
  it('devuelve el papel con su ubicación completa, a cualquier profundidad', () => {
    const hits = searchPapers(phases, [], 'entrevista');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ folderId: 'fB', location: 'Planificación › B — Estados Financieros' });
    const nested = searchPapers(phases, [], 'conciliacion');
    expect(nested[0]).toMatchObject({ folderId: 'fBC', location: 'Planificación › B — Estados Financieros › B-1 — Cédulas' });
  });
  it('incluye los papeles sin carpeta, marcados como tales', () => {
    const hits = searchPapers(phases, [suelto], 'representacion');
    expect(hits).toEqual([{ paper: suelto, location: NO_FOLDER_LABEL, folderId: null }]);
  });
  it('una búsqueda corta o sin resultados devuelve lista vacía', () => {
    expect(searchPapers(phases, [suelto], 'x')).toEqual([]);
    expect(searchPapers(phases, [suelto], 'inexistente')).toEqual([]);
  });
  it('varios resultados de carpetas distintas, en el orden del árbol y los sueltos al final', () => {
    const ids = searchPapers(phases, [suelto], 'c').map((h) => h.paper.id); // 'c' (1 letra) no busca
    expect(ids).toEqual([]);
    const two = searchPapers(phases, [suelto], 'ci').map((h) => h.paper.id); // "Conciliación", "Cuenta"→no; "ci": conciliacion, cuenta no, representacion sí
    expect(two).toEqual(['p2', 'p4']);
  });
});
