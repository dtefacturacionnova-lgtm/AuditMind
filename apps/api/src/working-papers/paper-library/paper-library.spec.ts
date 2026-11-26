import { PAPER_TEMPLATES } from '../paper-templates';
import { PAPER_CATALOGUE } from '../paper-catalogue';
import {
  PAPER_LIBRARY, librarySuggestionsFor, entry, libraryProceduresFor, libraryToSuggestions, normalizeTitle, validateLibrary,
  type PaperLibrary, type PaperLibraryProcedure,
} from './index';

const CODES = new Set(Object.keys(PAPER_TEMPLATES));

const BASE: Omit<PaperLibraryProcedure, 'id'> = {
  title: 'Contrastar la lista de partes relacionadas',
  statement: 'Contrastar la lista de partes relacionadas de la administración con registros independientes de la entidad.',
  development: 'Se comparó la lista proporcionada por la administración con [completar: fuentes revisadas] y se identificaron [completar: cantidad] diferencias, documentadas en [completar: referencia].',
  technique: 'Inspección', priority: 'HIGH', ref: 'NIA 550',
};
const item = (over: Partial<PaperLibraryProcedure> = {}, i = 0) => ({ ...BASE, title: `${BASE.title} número ${i}`, ...over });
function lib(items: Array<Partial<PaperLibraryProcedure>>, code = 'PT-NIA550', reviewedAt = '2026-11'): PaperLibrary {
  const [k, v] = entry(code, reviewedAt, items.map((o, i) => item(o, i)));
  return { [k]: v };
}
const sano = () => lib([{}, {}, {}]);

describe('el catálogo real cumple sus propias reglas de calidad', () => {
  it('no tiene ningún problema', () => {
    expect(validateLibrary(PAPER_LIBRARY, CODES)).toEqual([]);
  });

  it('cada papel con biblioteca existe en las plantillas y es un papel real (catálogo, o CAAT fiscal que nace de las plantillas de auditoría)', () => {
    const catalogo = new Set(PAPER_CATALOGUE.map((p) => p.code));
    for (const code of Object.keys(PAPER_LIBRARY)) {
      expect(CODES.has(code)).toBe(true);
      // Los PT-FISC-CAAT-* los crea audit-templates.service.ts (no figuran en el selector de «nuevo papel»), pero tienen plantilla.
      expect(catalogo.has(code) || code.startsWith('PT-FISC-CAAT-')).toBe(true);
    }
  });

  it('lote 1: cubre los 13 papeles previstos con al menos 4 procedimientos cada uno', () => {
    const esperados = ['PT-NIA550', 'PT-NIA570', 'PT-NIA560', 'PT-CIRC', 'PT-FIN-C-ESTIM', 'PT-NIA250', 'PT-ITGC',
      'PT-FISC-CAAT-LIBROSIVA', 'PT-FISC-CAAT-PAC', 'PT-FISC-CAAT-PLAZOS', 'PT-FISC-CAAT-DTE', 'PT-FISC-PT', 'PT-AML-RISK'];
    for (const code of esperados) expect(PAPER_LIBRARY[code]?.procedures.length).toBeGreaterThanOrEqual(4);
  });

  it('los ids son únicos en todo el catálogo y siguen el formato PT-XXX.NN', () => {
    const ids = Object.values(PAPER_LIBRARY).flatMap((e) => e.procedures.map((p) => p.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^PT-[A-Z0-9-]+\.\d{2}$/);
  });

  it('solo se citan las referencias verificadas: Art. 151 CT y Art. 119-E CT son las únicas con numeración local', () => {
    const textos = Object.values(PAPER_LIBRARY).flatMap((e) => e.procedures.map((p) => `${p.statement} ${p.development} ${p.ref ?? ''}`));
    const arts = new Set(textos.flatMap((t) => t.match(/Art\. ?\d+[-\w]*/g) ?? []).map((a) => a.replace(/\s/g, '')));
    expect([...arts].sort()).toEqual(['Art.119-E', 'Art.151']);
  });
});

describe('validateLibrary — atrapa los defectos de contenido', () => {
  it('un catálogo sano pasa', () => expect(validateLibrary(sano(), CODES)).toEqual([]));

  it.each<[string, PaperLibrary, RegExp]>([
    ['papel inexistente', lib([{}, {}, {}], 'PT-NO-EXISTE'), /no existe en las plantillas/],
    ['menos de 3 procedimientos', lib([{}, {}]), /mínimo 3/],
    ['reviewedAt inválido', lib([{}, {}, {}], 'PT-NIA550', '2026-13'), /reviewedAt inválido/],
    ['título corto', lib([{ title: 'Corto' }, {}, {}]), /título debe tener entre 8 y 90/],
    ['título largo', lib([{ title: 'T'.repeat(91) }, {}, {}]), /título debe tener entre 8 y 90/],
    ['enunciado corto', lib([{ statement: 'Muy corto.' }, {}, {}]), /enunciado debe tener entre 30 y 400/],
    ['enunciado largo', lib([{ statement: 'E'.repeat(401) }, {}, {}]), /enunciado debe tener entre 30 y 400/],
    ['desarrollo corto', lib([{ development: 'Corto [completar: x]' }, {}, {}]), /desarrollo debe tener entre 80 y 700/],
    ['desarrollo largo', lib([{ development: `[completar: x] ${'d'.repeat(700)}` }, {}, {}]), /desarrollo debe tener entre 80 y 700/],
    ['sin marcadores', lib([{ development: 'Se comparó la lista proporcionada por la administración con los registros y se documentaron las diferencias encontradas.' }, {}, {}]), /marcadores \[completar/],
    ['monto inventado', lib([{ development: 'Se encontró una diferencia de $1500 en la cuenta, documentada en [completar: referencia] del papel.' }, {}, {}]), /no debe traer montos/],
    ['texto provisional TODO', lib([{ development: 'TODO redactar mejor. Se comparó con [completar: fuentes] y se documentó el resultado de la prueba.' }, {}, {}]), /texto provisional/],
    ['técnica desconocida', lib([{ technique: 'Adivinación' as never }, {}, {}]), /técnica desconocida/],
    ['prioridad desconocida', lib([{ priority: 'URGENTE' as never }, {}, {}]), /prioridad desconocida/],
    ['referencia no verificada', lib([{ ref: 'Art. 999 CT' }, {}, {}]), /no es una NIA\/NIC\/NIIF\/NIGC ni un artículo verificado/],
    ['referencia inventada', lib([{ ref: 'Ley de Cosas' }, {}, {}]), /no es una NIA/],
    ['artículo no verificado en el texto', lib([{ statement: 'Verificar el cumplimiento del Art. 77 de la ley aplicable a la entidad en el ejercicio.' }, {}, {}]), /artículo no verificado/],
  ])('%s', (_n, l, esperado) => {
    expect(validateLibrary(l, CODES).join('\n')).toMatch(esperado);
  });

  it('título repetido dentro del papel', () => {
    const l = lib([{}, {}, {}]);
    l['PT-NIA550'].procedures[1].title = l['PT-NIA550'].procedures[0].title;
    expect(validateLibrary(l, CODES).join('\n')).toMatch(/título repetido/);
  });

  it('id que no sigue el orden o repetido', () => {
    const l = lib([{}, {}, {}]);
    l['PT-NIA550'].procedures[2].id = 'PT-NIA550.01';
    const p = validateLibrary(l, CODES).join('\n');
    expect(p).toMatch(/el id debería ser PT-NIA550\.03/);
    expect(p).toMatch(/id repetido/);
  });

  it('acepta las referencias verificadas y las normas por número', () => {
    for (const ref of ['NIA 550', 'NIA 550 / NIC 24', 'NIA 250 / NIA 501', 'NIC 1', 'NIIF 9', 'NIGC 1', 'Art. 151 CT', 'Art. 119-E CT']) {
      expect(validateLibrary(lib([{ ref }, {}, {}]), CODES)).toEqual([]);
    }
  });

  it('un procedimiento sin ref es válido', () => {
    expect(validateLibrary(lib([{ ref: undefined }, {}, {}]), CODES)).toEqual([]);
  });
});

describe('selección y sugerencias', () => {
  const l = lib([{ priority: 'MEDIUM' }, { priority: 'HIGH' }, { priority: 'LOW' }, { priority: 'HIGH', auditTypes: ['FISCAL'] }]);

  it('entry numera los ids en el orden dado', () => {
    expect(l['PT-NIA550'].procedures.map((p) => p.id)).toEqual(['PT-NIA550.01', 'PT-NIA550.02', 'PT-NIA550.03', 'PT-NIA550.04']);
  });

  it('un papel sin biblioteca, o sin código, no devuelve nada', () => {
    expect(libraryProceduresFor('PT-OTRO', 'FISCAL', l)).toEqual([]);
    expect(libraryProceduresFor(null, 'FISCAL', l)).toEqual([]);
    expect(libraryProceduresFor(undefined, null, l)).toEqual([]);
  });

  it('auditTypes restringe por tipo de encargo; sin restricción aplica a todos', () => {
    expect(libraryProceduresFor('PT-NIA550', 'FISCAL', l)).toHaveLength(4);
    expect(libraryProceduresFor('PT-NIA550', 'AML', l)).toHaveLength(3);
    expect(libraryProceduresFor('PT-NIA550', null, l)).toHaveLength(3);
  });

  it('las sugerencias salen ordenadas por prioridad (estable) y con todo lo necesario para aplicarlas', () => {
    const s = libraryToSuggestions(libraryProceduresFor('PT-NIA550', 'FISCAL', l), '2026-11');
    expect(s.map((x) => x.priority)).toEqual(['HIGH', 'HIGH', 'MEDIUM', 'LOW']);
    expect(s.map((x) => x.id)).toEqual(['lib-PT-NIA550.02', 'lib-PT-NIA550.04', 'lib-PT-NIA550.01', 'lib-PT-NIA550.03']);
    const a = s[0];
    expect(a.source).toBe('LIBRARY');
    expect(a.area).toBe(a.title);
    expect(a.procedure).toBe(a.statement);
    expect(a.development).toMatch(/\[completar/);
    expect(a.basedOn).toBe('Biblioteca del papel (revisada 2026-11)');
    expect(a.niaRef).toBe('NIA 550');
    expect(a.rationale).toMatch(/no se gastó IA/);
  });

  it('omite lo que el papel ya tiene aplicado (por título o por enunciado, sin importar acentos ni mayúsculas)', () => {
    const items = libraryProceduresFor('PT-NIA550', null, l);
    const porTitulo = libraryToSuggestions(items, '2026-11', ['  CONTRASTAR la lista de partes relacionadas NÚMERO 0 ']);
    expect(porTitulo.map((x) => x.id)).not.toContain('lib-PT-NIA550.01');
    expect(porTitulo).toHaveLength(2);
    const porEnunciado = libraryToSuggestions(items, '2026-11', [items[1].statement.toUpperCase()]);
    expect(porEnunciado.map((x) => x.id)).toEqual([]); // todos comparten enunciado en este catálogo de prueba
  });

  it('normalizeTitle ignora acentos, mayúsculas y signos', () => {
    expect(normalizeTitle('  Evaluación — Revelación (NIC 24)! ')).toBe('evaluacion revelacion nic 24');
    expect(normalizeTitle(null)).toBe('');
  });

  it('librarySuggestionsFor da total, títulos y sugerencias sin lo aplicado', () => {
    const r = librarySuggestionsFor('PT-NIA550', 'FISCAL', [PAPER_LIBRARY['PT-NIA550'].procedures[0].title]);
    expect(r.total).toBe(5);
    expect(r.allTitles).toHaveLength(5);
    expect(r.suggestions).toHaveLength(4);
    expect(librarySuggestionsFor('PT-NO-TIENE', 'FISCAL')).toEqual({ suggestions: [], total: 0, allTitles: [] });
    expect(librarySuggestionsFor(null, null)).toEqual({ suggestions: [], total: 0, allTitles: [] });
  });
});
