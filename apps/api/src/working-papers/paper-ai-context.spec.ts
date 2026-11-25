import {
  BUDGETS, PaperAiInput, assessPaperContext, buildPaperBrief, buildRagBlock, clip, frameworkFor, insufficientInstruction,
  insufficientMessage, loadPaperAiInput, parseInsufficient, ragBaseFor, ragQueryFor, usesFinancialAssertions, valueSummary,
} from './paper-ai-context';

const AUDIT = {
  title: 'Auditoría fiscal 2025 — Distribuidora El Sol', type: 'FISCAL', subtype: null,
  scope: 'Cumplimiento de IVA e ISR del ejercicio 2025, incluyendo retenciones y pago a cuenta.',
  entityName: 'Distribuidora El Sol, S.A. de C.V.', periodStart: new Date('2025-01-01'), periodEnd: new Date('2025-12-31'),
};

type PapelOver = { paper?: Partial<PaperAiInput['paper']> } & Partial<Omit<PaperAiInput, 'paper'>>;

function papel(over: PapelOver = {}): PaperAiInput {
  return {
    paper: { code: 'PT-IVA-01', title: 'Conciliación del débito fiscal de IVA', narrative: null, ...(over.paper ?? {}) },
    audit: over.audit ?? AUDIT,
    sections: over.sections ?? [
      { key: 'S1', label: 'Objetivo', value: 'Conciliar el débito fiscal declarado con el libro de ventas.' },
      { key: 'S2', label: 'Resultado de la conciliación', value: '' },
    ],
    procedures: over.procedures ?? [],
    hasTemplate: over.hasTemplate ?? false,
  };
}

describe('buildPaperBrief — la ficha lleva el contexto del papel', () => {
  it('incluye encargo, alcance, entidad, período, papel y secciones', () => {
    const b = buildPaperBrief(papel());
    expect(b).toContain('FISCAL');
    expect(b).toContain('Distribuidora El Sol');
    expect(b).toContain('ALCANCE: Cumplimiento de IVA e ISR');
    expect(b).toContain('2025-01-01 a 2025-12-31');
    expect(b).toContain('PT-IVA-01 — Conciliación del débito fiscal de IVA');
    expect(b).toContain('[S1] Objetivo: Conciliar el débito fiscal');
  });

  it('dos papeles distintos del mismo encargo producen fichas distintas', () => {
    const iva = buildPaperBrief(papel());
    const nomina = buildPaperBrief(papel({ paper: { code: 'PT-PLA-02', title: 'Planilla y retenciones de renta' }, sections: [{ key: 'S1', label: 'Objetivo', value: 'Verificar retenciones de ISR sobre salarios.' }] }));
    expect(iva).not.toEqual(nomina);
    expect(iva).toContain('débito fiscal');
    expect(iva).not.toContain('Planilla');
    expect(nomina).toContain('Planilla');
    expect(nomina).not.toContain('débito fiscal');
  });

  it('las secciones vacías aportan solo su etiqueta; las llenas, un recorte', () => {
    const b = buildPaperBrief(papel());
    expect(b).toContain('SECCIONES POR LLENAR (de qué trata el papel): Resultado de la conciliación');
    expect(b).not.toContain('[S2]');
    const larga = buildPaperBrief(papel({ sections: [{ key: 'S1', label: 'Objetivo', value: 'x'.repeat(2000) }] }));
    expect(larga.length).toBeLessThan(900);
    expect(larga).toContain('…');
  });

  it('lista los procedimientos ya existentes solo con el título, para no repetirlos', () => {
    const b = buildPaperBrief(papel({ procedures: [{ title: 'Cotejar libro de ventas con declaración', statement: 'texto largo '.repeat(50) }] }));
    expect(b).toContain('PROCEDIMIENTOS YA EN EL PAPEL (no repetirlos): Cotejar libro de ventas con declaración');
    expect(b).not.toContain('texto largo');
  });

  it('respeta el tope de caracteres aunque haya cientos de secciones y procedimientos', () => {
    const sections = Array.from({ length: 200 }, (_, i) => ({ key: `S${i}`, label: `Sección ${i}`, value: i % 2 ? `contenido ${i} `.repeat(40) : '' }));
    const procedures = Array.from({ length: 200 }, (_, i) => ({ title: `Procedimiento número ${i} `.repeat(5) }));
    for (const nombre of ['ligero', 'estandar'] as const) {
      const b = buildPaperBrief(papel({ sections, procedures }), BUDGETS[nombre]);
      expect(b.length).toBeLessThanOrEqual(BUDGETS[nombre].totalChars);
      expect(b).toContain('ENCARGO:');
      expect(b).toContain('PAPEL: PT-IVA-01');
    }
  });

  it('los presupuestos son los acordados: ligero 1 200 y estándar 2 600 caracteres (el consumo de IA depende de esto)', () => {
    expect(BUDGETS.ligero.totalChars).toBe(1200);
    expect(BUDGETS.estandar.totalChars).toBe(2600);
    expect(BUDGETS.ligero.totalChars).toBeLessThan(BUDGETS.estandar.totalChars);
  });

  it('tope duro: aunque el encabezado solo ya exceda el presupuesto, la ficha nunca lo supera', () => {
    const enorme = papel({ paper: { title: 'T'.repeat(500) }, audit: { ...AUDIT, title: 'A'.repeat(500), scope: 'S'.repeat(500), entityName: 'E'.repeat(500) } });
    const b = buildPaperBrief(enorme, { ...BUDGETS.estandar, totalChars: 150 });
    expect(b.length).toBeLessThanOrEqual(150);
    expect(b.endsWith('…')).toBe(true);
  });

  it('recorta primero lo menos valioso: con poco espacio se pierden las etiquetas vacías antes que las secciones llenas', () => {
    const sections = [
      { key: 'S1', label: 'Objetivo', value: 'Conciliar el débito fiscal declarado con el libro de ventas del ejercicio.' },
      ...Array.from({ length: 30 }, (_, i) => ({ key: `V${i}`, label: `Etiqueta vacía larga número ${i}`, value: '' })),
    ];
    const b = buildPaperBrief(papel({ sections }), { ...BUDGETS.estandar, totalChars: 520 });
    expect(b.length).toBeLessThanOrEqual(520);
    expect(b).toContain('[S1] Objetivo');
  });

  it('las matrices y listas se resumen, no se vuelcan', () => {
    const filas = Array.from({ length: 50 }, (_, i) => ({ cuenta: `1101-${i}`, saldo: i * 1000 }));
    expect(valueSummary(filas)).toBe('[50 elementos]');
    expect(valueSummary([{ a: 1 }])).toBe('[1 elemento]');
    expect(valueSummary(['uno', 'dos'])).toBe('uno; dos');
    expect(valueSummary(null)).toBe('');
    expect(valueSummary({ texto: 'hola', n: 3 })).toBe('hola');
    const b = buildPaperBrief(papel({ sections: [{ key: 'S3', label: 'Detalle', value: filas }] }));
    expect(b).toContain('[S3] Detalle: [50 elementos]');
    expect(b).not.toContain('1101-');
  });

  it('el presupuesto ligero es más corto que el estándar con el mismo papel', () => {
    const sections = Array.from({ length: 12 }, (_, i) => ({ key: `S${i}`, label: `Sección ${i}`, value: `texto de la sección ${i} `.repeat(10) }));
    const lig = buildPaperBrief(papel({ sections }), BUDGETS.ligero);
    const est = buildPaperBrief(papel({ sections }), BUDGETS.estandar);
    expect(lig.length).toBeLessThan(est.length);
  });

  it('la narrativa solo entra con presupuesto estándar', () => {
    const p = papel({ paper: { narrative: 'Narrativa específica del papel de IVA.' } });
    expect(buildPaperBrief(p, BUDGETS.estandar)).toContain('NARRATIVA DEL PAPEL: Narrativa específica');
    expect(buildPaperBrief(p, BUDGETS.ligero)).not.toContain('NARRATIVA');
  });

  it('un encargo sin datos no rompe la ficha', () => {
    const b = buildPaperBrief({ paper: { code: null, title: 'Efectivo' }, audit: {}, sections: [], procedures: [], hasTemplate: false });
    expect(b).toBe('PAPEL: Efectivo');
  });
});

describe('assessPaperContext — suficiencia', () => {
  it('papel de plantilla conocida con título claro: suficiente', () => {
    expect(assessPaperContext(papel({ hasTemplate: true, sections: [] , audit: {} })).enough).toBe(true);
  });

  it('título claro + alcance del encargo: suficiente aunque el papel esté vacío', () => {
    expect(assessPaperContext(papel({ sections: [] })).enough).toBe(true);
  });

  it('título genérico y nada más: insuficiente, con los motivos', () => {
    const r = assessPaperContext(papel({ paper: { title: 'Nuevo papel' }, sections: [], audit: {} }));
    expect(r.enough).toBe(false);
    expect(r.missing).toHaveLength(2);
    expect(r.missing[0]).toMatch(/título descriptivo/);
    expect(r.missing[1]).toMatch(/algo de contenido/);
  });

  it.each(['Papel', 'Documento 2', 'Sin título', 'sin titulo', 'Prueba', 'Nuevo papel 3', 'New paper', '   ', 'ab'])(
    'el título «%s» no basta', (titulo) => {
      expect(assessPaperContext(papel({ paper: { title: titulo }, hasTemplate: true })).enough).toBe(false);
    });

  it('título de una palabra: solo vale si el papel viene de una plantilla', () => {
    expect(assessPaperContext(papel({ paper: { title: 'Efectivo' }, hasTemplate: false })).enough).toBe(false);
    expect(assessPaperContext(papel({ paper: { title: 'Efectivo' }, hasTemplate: true })).enough).toBe(true);
  });

  it('título claro pero sin ninguna señal: insuficiente, pide contenido', () => {
    const r = assessPaperContext(papel({ sections: [{ key: 'S1', label: 'Objetivo', value: '' }], audit: { scope: 'corto' } }));
    expect(r.enough).toBe(false);
    expect(r.missing).toEqual([expect.stringMatching(/algo de contenido/)]);
  });

  it('cada señal por sí sola alcanza: sección llena, procedimiento, narrativa larga, alcance largo', () => {
    const base = { sections: [{ key: 'S1', label: 'Objetivo', value: '' }], audit: {} };
    expect(assessPaperContext(papel({ ...base, sections: [{ key: 'S1', label: 'Objetivo', value: 'algo' }] })).enough).toBe(true);
    expect(assessPaperContext(papel({ ...base, procedures: [{ title: 'Cotejar' }] })).enough).toBe(true);
    expect(assessPaperContext(papel({ ...base, paper: { narrative: 'n'.repeat(40) } })).enough).toBe(true);
    expect(assessPaperContext(papel({ ...base, paper: { narrative: 'n'.repeat(39) } })).enough).toBe(false);
    expect(assessPaperContext(papel({ ...base, audit: { scope: 's'.repeat(20) } })).enough).toBe(true);
    expect(assessPaperContext(papel({ ...base, audit: { scope: 's'.repeat(19) } })).enough).toBe(false);
  });

  it('el mensaje al usuario dice qué falta', () => {
    const m = insufficientMessage(['un título descriptivo del papel']);
    expect(m).toMatch(/no tiene contexto suficiente/);
    expect(m).toMatch(/Falta: un título descriptivo del papel\./);
    expect(insufficientMessage([])).not.toMatch(/Falta/);
  });
});

describe('parseInsufficient — el aviso de la propia IA', () => {
  it.each([
    ['SIN_CONTEXTO: no sé de qué trata el papel', 'no sé de qué trata el papel'],
    ['  sin_contexto : falta el alcance', 'falta el alcance'],
    ['"SIN_CONTEXTO: falta el objetivo"', 'falta el objetivo'],
    ['SIN CONTEXTO: falta algo', 'falta algo'],
    ['{"sin_contexto": "el papel no tiene secciones"}', 'el papel no tiene secciones'],
    ['```json\n{"sin_contexto": "falta el alcance"}\n```', 'falta el alcance'],
  ])('detecta %j', (raw, motivo) => {
    expect(parseInsufficient(raw)).toBe(motivo);
  });

  it('SIN_CONTEXTO sin motivo devuelve un motivo por defecto', () => {
    expect(parseInsufficient('SIN_CONTEXTO')).toMatch(/falta contexto/);
  });

  it.each([
    'Se verificó la conciliación del débito fiscal contra el libro de ventas.',
    '[{"area":"IVA","procedure":"Cotejar libro de ventas"}]',
    '{"procedures": []}',
    'El auditor indicó que hay un tema sin contexto previo.',
    'Sin contexto adicional, se revisó el libro de ventas contra la declaración de IVA.',
    'Sin contexto previo del cliente, se indagó con la gerencia.',
    '', null, undefined,
  ])('una respuesta normal no se confunde: %j', (raw) => {
    expect(parseInsufficient(raw as string)).toBeNull();
  });

  it('las instrucciones al modelo nombran el formato correcto', () => {
    expect(insufficientInstruction(false)).toContain('SIN_CONTEXTO:');
    expect(insufficientInstruction(true)).toContain('"sin_contexto"');
  });
});

describe('marco normativo y normativa RAG', () => {
  it('cada tipo de encargo usa su propia base y no se mezclan', () => {
    expect(ragBaseFor('FISCAL')).toBe('FISCAL_SV');
    expect(ragBaseFor('AML')).toBe('AML_SV');
    expect(ragBaseFor('INTERNAL')).toBe('IIA_STANDARDS_2024');
    expect(ragBaseFor('INTERNAL_GOVERNMENTAL')).toBe('NAIG_CCR_SV');
    expect(ragBaseFor('EXTERNAL_FINANCIAL')).toBe('CVPCPA_SV');
    expect(ragBaseFor('IT_SECURITY')).toBeUndefined();
    expect(ragBaseFor(null)).toBeUndefined();
  });

  it('el marco corresponde al tipo; el desconocido cae a NIA/COSO', () => {
    expect(frameworkFor('FISCAL')).toMatch(/tributario/);
    expect(frameworkFor('AML')).toMatch(/lavado/);
    expect(frameworkFor('INTERNAL_GOVERNMENTAL')).toMatch(/NAIG/);
    expect(frameworkFor('OPERATIONAL')).toMatch(/NIA\/IAASB, COSO/);
  });

  it('las aserciones NIA 315 aplican solo a estados financieros', () => {
    expect(usesFinancialAssertions('EXTERNAL_FINANCIAL')).toBe(true);
    expect(usesFinancialAssertions('FINANCIAL')).toBe(true);
    expect(usesFinancialAssertions('FISCAL')).toBe(false);
    expect(usesFinancialAssertions('AML')).toBe(false);
    expect(usesFinancialAssertions(undefined)).toBe(false);
  });

  it('el bloque normativo se limita a 3 fragmentos de 350 caracteres', () => {
    const hits = Array.from({ length: 6 }, (_, i) => ({ content: `artículo ${i} `.repeat(100), sectionTitle: `Sección ${i}` }));
    const b = buildRagBlock(hits);
    expect(b.split('\n---\n')).toHaveLength(3);
    expect(b).toContain('[Sección 0]');
    expect(b).not.toContain('Sección 3');
    for (const frag of b.split('\n---\n')) expect(frag.length).toBeLessThanOrEqual(350 + 70);
    expect(buildRagBlock([])).toBe('');
  });

  it('la consulta RAG une las partes útiles y se acota', () => {
    expect(ragQueryFor(['Conciliación de IVA', null, '', 'débito fiscal'])).toBe('Conciliación de IVA — débito fiscal');
    expect(ragQueryFor(['x'.repeat(500)]).length).toBeLessThanOrEqual(300);
  });

  it('clip respeta el máximo y no corta en blanco', () => {
    expect(clip('hola   mundo', 50)).toBe('hola mundo');
    expect(clip('abcdefghij', 5)).toBe('abcd…');
    expect(clip('abc', 0)).toBe('');
  });
});

describe('loadPaperAiInput — lee del servidor, no del navegador', () => {
  const fila = {
    code: 'A-1', paperCode: 'PT-A1', title: 'Entendimiento del negocio', narrative: 'n',
    content: { procedures: [{ id: 'p1', title: 'Indagar con la gerencia' }] },
    audit: { title: 'Auditoría X', type: 'EXTERNAL_FINANCIAL', subtype: 'EEFF_COMPLETO', scope: 'EEFF 2025', auditPeriodStart: new Date('2025-01-01'), auditPeriodEnd: new Date('2025-12-31'), auditEntity: { name: 'Cliente S.A.' } },
    sections: [{ sectionKey: 'S1', label: 'Objetivo', value: 'texto' }],
  };

  it('arma la entrada con encargo, entidad, secciones, procedimientos y plantilla', async () => {
    let args: any;
    const prisma = { workingPaper: { findUnique: async (a: unknown) => { args = a; return fila; } } };
    const r = await loadPaperAiInput(prisma, 'wp1');
    expect(args.where).toEqual({ id: 'wp1' });
    expect(r!.paper).toEqual({ code: 'PT-A1', title: 'Entendimiento del negocio', narrative: 'n' });
    expect(r!.audit.entityName).toBe('Cliente S.A.');
    expect(r!.audit.type).toBe('EXTERNAL_FINANCIAL');
    expect(r!.sections).toEqual([{ key: 'S1', label: 'Objetivo', value: 'texto' }]);
    expect(r!.procedures).toEqual([{ id: 'p1', title: 'Indagar con la gerencia' }]);
    expect(r!.hasTemplate).toBe(true); // PT-A1 es una plantilla real
  });

  it('un papel libre (sin paperCode de plantilla) no tiene plantilla; usa el code legacy', async () => {
    const prisma = { workingPaper: { findUnique: async () => ({ ...fila, paperCode: null, content: {}, audit: { ...fila.audit, auditEntity: null } }) } };
    const r = await loadPaperAiInput(prisma, 'wp2');
    expect(r!.hasTemplate).toBe(false);
    expect(r!.paper.code).toBe('A-1');
    expect(r!.procedures).toEqual([]);
    expect(r!.audit.entityName).toBeNull();
  });

  it('papel inexistente → null', async () => {
    const prisma = { workingPaper: { findUnique: async () => null } };
    expect(await loadPaperAiInput(prisma, 'nope')).toBeNull();
  });

  it('content que no es objeto no rompe', async () => {
    const prisma = { workingPaper: { findUnique: async () => ({ ...fila, content: 'texto' }) } };
    expect((await loadPaperAiInput(prisma, 'wp3'))!.procedures).toEqual([]);
  });
});
