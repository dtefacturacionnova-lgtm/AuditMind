import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CrossAuditLearningService } from './cross-audit-learning.service';
import { AuthUser } from '../auth/jwt.strategy';
import { FakeRow, fakeLibraryDb } from './paper-library/org-library.testkit';

jest.mock('../common/llm/llm-client', () => ({
  generateText: jest.fn(),
  isLlmConfigured: jest.fn(() => true),
}));
import { generateText, isLlmConfigured } from '../common/llm/llm-client';

const USER = { id: 'u1', role: 'AUDITOR', organizationId: 'org1' } as AuthUser;
const IA_OK = JSON.stringify([
  { area: 'IVA', procedure: 'Cotejar el libro de ventas con la declaración de IVA del período.', rationale: 'Es el objetivo del papel.', priority: 'HIGH', niaRef: 'Art. 65 Ley IVA' },
  { area: 'IVA', procedure: 'Recalcular el débito fiscal de una muestra de facturas.', rationale: 'Prueba de exactitud.', priority: 'MEDIUM' },
]);

function armar(opts: {
  auditType?: string; org?: string; investigation?: boolean; team?: string[]; paperRow?: Record<string, unknown> | null; paperInAudit?: boolean;
  /** Ajustes de biblioteca de las organizaciones (filas de content_library_items). */
  libRows?: Array<Partial<FakeRow>>;
  /** La lectura de la biblioteca de la organización falla (p. ej. la base aún no tiene el valor de enum). */
  libFails?: boolean;
} = {}) {
  const paperRow = opts.paperRow === undefined
    ? {
        code: 'A-1', paperCode: null, title: 'Conciliación del débito fiscal de IVA', narrative: null, content: { procedures: [{ title: 'Cotejar libro de ventas' }] },
        sections: [{ sectionKey: 'S1', label: 'Objetivo', value: 'Conciliar el débito fiscal declarado con el libro de ventas.' }],
        audit: { title: 'Auditoría fiscal 2025', type: opts.auditType ?? 'FISCAL', subtype: null, scope: 'Cumplimiento de IVA e ISR del ejercicio 2025.', auditPeriodStart: null, auditPeriodEnd: null, auditEntity: { name: 'Distribuidora El Sol' } },
      }
    : opts.paperRow;
  const prisma: any = {
    audit: {
      findUnique: jest.fn(async () => ({
        id: 'a1', title: 'Auditoría fiscal 2025', type: opts.auditType ?? 'FISCAL', organizationId: opts.org ?? 'org1', auditEntityId: 'e1',
        isInvestigationMode: !!opts.investigation, team: (opts.team ?? []).map((userId) => ({ userId })),
        auditEntity: { id: 'e1', name: 'Distribuidora El Sol', sector: 'Comercio', category: null },
      })),
      findMany: jest.fn(async () => [{ id: 'old1', title: 'Auditoría 2024', type: 'FISCAL', createdAt: new Date() }]),
    },
    finding: {
      findMany: jest.fn(async () => [{ id: 'f1', title: 'Diferencias en débito fiscal de IVA', severity: 'HIGH', status: 'OPEN', condition: 'Ventas no declaradas', cause: null, recommendation: null, createdAt: new Date() }]),
    },
    workingPaper: {
      findFirst: jest.fn(async () => (opts.paperInAudit === false ? null : { paperCode: null, title: 'Conciliación del débito fiscal de IVA', type: 'GENERAL' })),
      findUnique: jest.fn(async () => paperRow),
    },
    paperSection: { findMany: jest.fn(async () => [{ sectionKey: 'S1', label: 'Sección de OTRO papel', value: 'contenido ajeno', sortOrder: 1, paper: { paperCode: 'PT-X', title: 'Otro' } }]) },
    contentLibraryItem: opts.libFails
      ? { findMany: jest.fn(async () => { throw new Error('invalid input value for enum "ContentLibraryKind": "PAPER_PROCEDURE"'); }) }
      : fakeLibraryDb(opts.libRows ?? []).contentLibraryItem,
  };
  const ai: any = { searchRag: jest.fn(async () => [{ content: 'Art. 65 Ley IVA: el débito fiscal se determina…', sectionTitle: 'Débito fiscal', similarity: 0.8 }]) };
  const svc = new CrossAuditLearningService(prisma, {} as any, undefined, ai);
  return { svc, prisma, ai };
}

const prompt = () => (generateText as jest.Mock).mock.calls[0][1].messages[0].content as string;

beforeEach(() => {
  (generateText as jest.Mock).mockReset();
  (isLlmConfigured as jest.Mock).mockReset().mockReturnValue(true);
});

describe('CrossAuditLearningService — con el papel actual', () => {
  it('usa la ficha del papel, la normativa del marco y NO las secciones de otros papeles', async () => {
    (generateText as jest.Mock).mockResolvedValue(IA_OK);
    const { svc, prisma, ai } = armar();
    const r = await svc.generateSuggestions('a1', USER, 'wp1');
    expect(r.aiGenerated).toBe(true);
    expect(r.suggestions).toHaveLength(2);
    expect(r.suggestions[0].niaRef).toBe('Art. 65 Ley IVA');
    expect(r.suggestions[0].basedOn).toContain('Ficha del papel');
    expect(r.notice).toBeUndefined();
    expect(prisma.paperSection.findMany).not.toHaveBeenCalled();
    expect(ai.searchRag).toHaveBeenCalledWith(expect.stringContaining('Conciliación del débito fiscal de IVA'), ['FISCAL_SV'], 3);
    const p = prompt();
    expect(p).toContain('FICHA DEL PAPEL Y DEL ENCARGO');
    expect(p).toContain('PAPEL: A-1 — Conciliación del débito fiscal de IVA');
    expect(p).toContain('ALCANCE: Cumplimiento de IVA e ISR');
    expect(p).toContain('Cotejar libro de ventas');            // ya existente: no repetir
    expect(p).toContain('Art. 65 Ley IVA');                    // normativa RAG
    expect(p).toContain('tributario');                         // marco del tipo de encargo
    expect(p).toContain('Diferencias en débito fiscal de IVA'); // historial (el «cruce»)
    expect(p).toContain('"sin_contexto"');
    expect(p).not.toContain('OTRO papel');
    expect(p).not.toContain('contenido ajeno');
  });

  it('un tipo de encargo sin base normativa no consulta el RAG', async () => {
    (generateText as jest.Mock).mockResolvedValue(IA_OK);
    const { svc, ai } = armar({ auditType: 'IT_SECURITY' });
    await svc.generateSuggestions('a1', USER, 'wp1');
    expect(ai.searchRag).not.toHaveBeenCalled();
    expect(prompt()).not.toContain('NORMATIVA RECUPERADA');
  });

  it('papel sin contexto suficiente: no llama a la IA y dice qué falta', async () => {
    const { svc } = armar({ paperRow: { code: 'A-9', paperCode: null, title: 'Nuevo papel', narrative: null, content: {}, sections: [], audit: { title: 'x', type: 'FISCAL', subtype: null, scope: null, auditPeriodStart: null, auditPeriodEnd: null, auditEntity: null } } });
    const r = await svc.generateSuggestions('a1', USER, 'wp1');
    expect(generateText).not.toHaveBeenCalled();
    expect(r.suggestions).toEqual([]);
    expect(r.insufficientContext).toBe(true);
    expect(r.notice).toMatch(/no tiene contexto suficiente/);
    expect(r.notice).toMatch(/título descriptivo/);
  });

  it('la IA responde sin_contexto: se muestra el aviso, no sugerencias inventadas', async () => {
    (generateText as jest.Mock).mockResolvedValue('{"sin_contexto": "el papel no dice qué períodos cubre"}');
    const { svc } = armar();
    const r = await svc.generateSuggestions('a1', USER, 'wp1');
    expect(r.suggestions).toEqual([]);
    expect(r.insufficientContext).toBe(true);
    expect(r.notice).toMatch(/el papel no dice qué períodos cubre/);
  });

  it('si la IA falla NO se rellena con las reglas genéricas fijas', async () => {
    (generateText as jest.Mock).mockRejectedValue(new Error('timeout'));
    const { svc } = armar();
    const r = await svc.generateSuggestions('a1', USER, 'wp1');
    expect(r.suggestions).toEqual([]);
    expect(r.aiGenerated).toBe(false);
    expect(r.insufficientContext).toBeUndefined();
    expect(r.notice).toMatch(/La IA no respondió/);
  });

  it('una respuesta sin JSON también cuenta como fallo sin relleno', async () => {
    (generateText as jest.Mock).mockResolvedValue('no puedo ayudar con eso');
    const r = await armar().svc.generateSuggestions('a1', USER, 'wp1');
    expect(r.suggestions).toEqual([]);
    expect(r.notice).toMatch(/La IA no respondió/);
  });

  it('sin IA configurada tampoco hay relleno genérico', async () => {
    (isLlmConfigured as jest.Mock).mockReturnValue(false);
    const r = await armar().svc.generateSuggestions('a1', USER, 'wp1');
    expect(generateText).not.toHaveBeenCalled();
    expect(r.suggestions).toEqual([]);
    expect(r.notice).toMatch(/no está configurada/);
  });

  it('el aviso de contexto insuficiente no necesita IA configurada', async () => {
    (isLlmConfigured as jest.Mock).mockReturnValue(false);
    const { svc } = armar({ paperRow: { code: 'A-9', paperCode: null, title: 'Papel', narrative: null, content: {}, sections: [], audit: { title: 'x', type: 'FISCAL', subtype: null, scope: null, auditPeriodStart: null, auditPeriodEnd: null, auditEntity: null } } });
    const r = await svc.generateSuggestions('a1', USER, 'wp1');
    expect(r.insufficientContext).toBe(true);
  });

  it('un papel que no es de este encargo se ignora (no se filtra su contenido)', async () => {
    (generateText as jest.Mock).mockResolvedValue(IA_OK);
    const { svc, prisma } = armar({ paperInAudit: false });
    await svc.generateSuggestions('a1', USER, 'wp-de-otro-encargo');
    expect(prisma.workingPaper.findUnique).not.toHaveBeenCalled();
    expect(prompt()).not.toContain('FICHA DEL PAPEL');
  });
});

describe('CrossAuditLearningService — sin papel (vista del encargo): comportamiento anterior', () => {
  it('sigue usando las secciones del encargo y, si la IA falla, las reglas de respaldo', async () => {
    (generateText as jest.Mock).mockRejectedValue(new Error('timeout'));
    const { svc, prisma } = armar();
    const r = await svc.generateSuggestions('a1', USER);
    expect(prisma.paperSection.findMany).toHaveBeenCalled();
    expect(r.suggestions.length).toBeGreaterThan(0);
    expect(r.suggestions[0].id).toMatch(/^rb-/);
    expect(r.aiGenerated).toBe(false);
    expect(r.notice).toBeUndefined();
  });

  it('con IA devuelve sus sugerencias y arma el prompt con el contexto del encargo', async () => {
    (generateText as jest.Mock).mockResolvedValue(IA_OK);
    const r = await armar().svc.generateSuggestions('a1', USER);
    expect(r.aiGenerated).toBe(true);
    expect(prompt()).toContain('CONTEXTO DE PAPELES ACTUALES');
    expect(prompt()).toContain('Sección de OTRO papel');
  });
});

describe('CrossAuditLearningService — aislamiento', () => {
  it('rechaza un encargo de otra organización', async () => {
    const { svc } = armar({ org: 'otra' });
    await expect(svc.generateSuggestions('a1', USER, 'wp1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(generateText).not.toHaveBeenCalled();
  });

  it('rechaza una investigación ajena al equipo', async () => {
    const { svc } = armar({ investigation: true, team: ['otro'] });
    await expect(svc.generateSuggestions('a1', USER, 'wp1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(generateText).not.toHaveBeenCalled();
  });

  it('encargo inexistente → 404', async () => {
    const { svc, prisma } = armar();
    prisma.audit.findUnique.mockResolvedValue(null);
    await expect(svc.generateSuggestions('nope', USER, 'wp1')).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ─── Biblioteca por papel: primero lo curado (0 tokens), la IA solo para ampliar ─────────────────────────────────────────────
import { PAPER_LIBRARY } from './paper-library';

function papelConBiblioteca(over: { content?: unknown; title?: string; sections?: unknown[]; scope?: string | null } = {}) {
  return {
    code: 'A-1', paperCode: 'PT-NIA550', title: over.title ?? 'Partes relacionadas — identificación y revelación (NIA 550)', narrative: null,
    content: over.content ?? { procedures: [] },
    sections: over.sections ?? [],
    audit: { title: 'Auditoría financiera 2025', type: 'EXTERNAL_FINANCIAL', subtype: null, scope: over.scope === undefined ? null : over.scope, auditPeriodStart: null, auditPeriodEnd: null, auditEntity: { name: 'Cliente S.A.' } },
  };
}
const LIB = PAPER_LIBRARY['PT-NIA550'].procedures;

describe('CrossAuditLearningService — biblioteca por papel', () => {
  it('con biblioteca NO llama a la IA: devuelve los procedimientos curados, listos para aplicar', async () => {
    const { svc, ai } = armar({ auditType: 'EXTERNAL_FINANCIAL', paperRow: papelConBiblioteca() });
    const r = await svc.generateSuggestions('a1', USER, 'wp1');
    expect(generateText).not.toHaveBeenCalled();
    expect(ai.searchRag).not.toHaveBeenCalled();
    expect(r.aiGenerated).toBe(false);
    expect(r.libraryCount).toBe(LIB.length);
    expect(r.canExpand).toBe(true);
    expect(r.suggestions).toHaveLength(LIB.length);
    expect(r.suggestions.every((s) => s.source === 'LIBRARY')).toBe(true);
    const s = r.suggestions[0];
    expect(s.title).toBeTruthy();
    expect(s.statement).toBe(s.procedure);
    expect(s.development).toMatch(/\[completar/);
    expect(s.basedOn).toMatch(/^Biblioteca del papel \(revisada \d{4}-\d{2}\)$/);
    expect(r.notice).toBeUndefined();
  });

  it('las sugerencias de biblioteca no exigen contexto mínimo (el contenido ya está curado para ese papel)', async () => {
    const { svc } = armar({ auditType: 'EXTERNAL_FINANCIAL', paperRow: papelConBiblioteca({ title: 'Nuevo papel' }) });
    const r = await svc.generateSuggestions('a1', USER, 'wp1');
    expect(r.suggestions).toHaveLength(LIB.length);
    expect(r.insufficientContext).toBeUndefined();
  });

  it('no repite lo que el papel ya tiene aplicado', async () => {
    const aplicado = { procedures: [{ id: 'p1', title: LIB[0].title }, { id: 'p2', statement: LIB[1].statement }] };
    const { svc } = armar({ auditType: 'EXTERNAL_FINANCIAL', paperRow: papelConBiblioteca({ content: aplicado }) });
    const r = await svc.generateSuggestions('a1', USER, 'wp1');
    expect(r.suggestions).toHaveLength(LIB.length - 2);
    expect(r.suggestions.map((s) => s.title)).not.toContain(LIB[0].title);
    expect(r.suggestions.map((s) => s.title)).not.toContain(LIB[1].title);
  });

  it('si ya se aplicó todo, lo dice y ofrece ampliar con IA', async () => {
    const todo = { procedures: LIB.map((p, i) => ({ id: `p${i}`, title: p.title })) };
    const { svc } = armar({ auditType: 'EXTERNAL_FINANCIAL', paperRow: papelConBiblioteca({ content: todo }) });
    const r = await svc.generateSuggestions('a1', USER, 'wp1');
    expect(generateText).not.toHaveBeenCalled();
    expect(r.suggestions).toEqual([]);
    expect(r.canExpand).toBe(true);
    expect(r.notice).toMatch(/Ya aplicaste todos los procedimientos de la biblioteca/);
  });

  it('sin IA configurada la biblioteca sigue funcionando, sin opción de ampliar', async () => {
    (isLlmConfigured as jest.Mock).mockReturnValue(false);
    const { svc } = armar({ auditType: 'EXTERNAL_FINANCIAL', paperRow: papelConBiblioteca() });
    const r = await svc.generateSuggestions('a1', USER, 'wp1');
    expect(r.suggestions).toHaveLength(LIB.length);
    expect(r.canExpand).toBe(false);
  });

  it('ampliar con IA: la IA recibe lo ya sugerido para no repetirlo y el resultado suma biblioteca + IA', async () => {
    (generateText as jest.Mock).mockResolvedValue(IA_OK);
    const { svc, ai } = armar({ auditType: 'EXTERNAL_FINANCIAL', paperRow: papelConBiblioteca({ scope: 'Auditoría de estados financieros del ejercicio 2025 de la entidad.' }) });
    const r = await svc.generateSuggestions('a1', USER, 'wp1', true);
    expect(generateText).toHaveBeenCalledTimes(1);
    const p = prompt();
    expect(p).toContain('YA SUGERIDOS O APLICADOS EN ESTE PAPEL');
    expect(p).toContain(LIB[0].title.slice(0, 40));
    expect(ai.searchRag).toHaveBeenCalled();
    expect(r.suggestions.filter((s) => s.source === 'LIBRARY')).toHaveLength(LIB.length);
    expect(r.suggestions.filter((s) => s.source === 'AI')).toHaveLength(2);
    expect(r.suggestions.slice(0, LIB.length).every((s) => s.source === 'LIBRARY')).toBe(true);
    expect(r.libraryCount).toBe(LIB.length);
    expect(r.canExpand).toBe(true);
    expect(r.aiGenerated).toBe(true);
  });

  it('ampliar con IA que falla: se conservan las sugerencias de la biblioteca y se avisa', async () => {
    (generateText as jest.Mock).mockRejectedValue(new Error('timeout'));
    const { svc } = armar({ auditType: 'EXTERNAL_FINANCIAL', paperRow: papelConBiblioteca({ scope: 'Auditoría de estados financieros del ejercicio 2025 de la entidad.' }) });
    const r = await svc.generateSuggestions('a1', USER, 'wp1', true);
    expect(r.suggestions).toHaveLength(LIB.length);
    expect(r.suggestions.every((s) => s.source === 'LIBRARY')).toBe(true);
    expect(r.notice).toMatch(/La IA no respondió/);
    expect(r.canExpand).toBe(true);
  });

  it('un papel SIN biblioteca sigue como antes: va a la IA, sin banderas de biblioteca', async () => {
    (generateText as jest.Mock).mockResolvedValue(IA_OK);
    const { svc } = armar();
    const r = await svc.generateSuggestions('a1', USER, 'wp1');
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(r.suggestions.every((s) => s.source === 'AI')).toBe(true);
    expect(r.libraryCount).toBe(0);
    expect(r.canExpand).toBe(false);
  });

  it('sin papel (vista del encargo) la biblioteca no interviene', async () => {
    (generateText as jest.Mock).mockResolvedValue(IA_OK);
    const { svc } = armar({ auditType: 'EXTERNAL_FINANCIAL', paperRow: papelConBiblioteca() });
    const r = await svc.generateSuggestions('a1', USER);
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(r.libraryCount).toBeUndefined();
  });
});

describe('CrossAuditLearningService — la biblioteca respeta el tipo de encargo', () => {
  afterEach(() => { delete PAPER_LIBRARY['PT-NIA550'].procedures[0].auditTypes; });

  it('un procedimiento restringido a otro tipo de encargo no se sugiere; uno restringido a este sí', async () => {
    // El encargo de la prueba es EXTERNAL_FINANCIAL.
    PAPER_LIBRARY['PT-NIA550'].procedures[0].auditTypes = ['FISCAL'];
    const otro = armar({ auditType: 'EXTERNAL_FINANCIAL', paperRow: papelConBiblioteca() });
    const r1 = await otro.svc.generateSuggestions('a1', USER, 'wp1');
    expect(r1.suggestions).toHaveLength(LIB.length - 1);
    expect(r1.suggestions.map((s) => s.title)).not.toContain(LIB[0].title);

    PAPER_LIBRARY['PT-NIA550'].procedures[0].auditTypes = ['EXTERNAL_FINANCIAL'];
    const propio = armar({ auditType: 'EXTERNAL_FINANCIAL', paperRow: papelConBiblioteca() });
    const r2 = await propio.svc.generateSuggestions('a1', USER, 'wp1');
    expect(r2.suggestions).toHaveLength(LIB.length);
    expect(r2.suggestions.map((s) => s.title)).toContain(LIB[0].title);
  });
});

// ─── Biblioteca de la ORGANIZACIÓN: ediciones, ocultos y procedimientos propios encima del catálogo del sistema ────────────────
const fila = (over: Partial<FakeRow> & { details: Record<string, unknown> }): Partial<FakeRow> => {
  const { details, ...resto } = over;
  return { groupKey: 'PT-NIA550', itemLabel: 'Procedimiento', itemSubtitle: 'Inspección', itemDetails: { v: 1, ...details }, ...resto };
};
const PROPIO = fila({
  id: 'propio1', itemLabel: 'Revisar acuerdos verbales con la administración', itemSubtitle: 'Indagación',
  details: {
    statement: 'Indagar con la gerencia si existen operaciones con partes vinculadas pactadas sin contrato escrito.',
    development: 'Se indagó con [completar: nombre] sobre acuerdos verbales. La respuesta fue [completar: respuesta]. Se contrastó con [completar: evidencia].',
    priority: 'HIGH',
  },
});
const OCULTO = fila({ id: 'oculto1', itemLabel: LIB[0].title, details: { baseId: LIB[0].id, hidden: true } });
const EDITADO = fila({
  id: 'editado1', itemLabel: 'Título que la organización le puso a este procedimiento', itemSubtitle: 'Reejecución',
  details: { baseId: LIB[1].id, statement: 'Enunciado ajustado por la organización para su metodología de trabajo con partes vinculadas.', development: 'Desarrollo ajustado [completar: lo que hizo el auditor] con el método de la firma y su conclusión [completar: conclusión].', priority: 'LOW' },
});
const ALCANCE = 'Auditoría de estados financieros del ejercicio 2025 de la entidad.';

describe('CrossAuditLearningService — biblioteca de la organización', () => {
  it('sugiere lo ajustado por la organización: sin los ocultos, con las ediciones y con los propios, rotulados por origen', async () => {
    const { svc } = armar({ auditType: 'EXTERNAL_FINANCIAL', paperRow: papelConBiblioteca(), libRows: [OCULTO, EDITADO, PROPIO] });
    const r = await svc.generateSuggestions('a1', USER, 'wp1');
    expect(generateText).not.toHaveBeenCalled();
    const titulos = r.suggestions.map((s) => s.title);
    expect(titulos).not.toContain(LIB[0].title);
    expect(r.suggestions).toHaveLength(LIB.length - 1 + 1);

    const editado = r.suggestions.find((s) => s.title === 'Título que la organización le puso a este procedimiento')!;
    expect(editado).toMatchObject({ origin: 'EDITED', priority: 'LOW', source: 'LIBRARY' });
    expect(editado.basedOn).toMatch(/^Biblioteca del papel, ajustada por tu organización/);
    expect(editado.development).toMatch(/Desarrollo ajustado/);
    expect(titulos).not.toContain(LIB[1].title); // el texto del sistema fue reemplazado

    const propio = r.suggestions.find((s) => s.title === 'Revisar acuerdos verbales con la administración')!;
    expect(propio).toMatchObject({ origin: 'OWN', source: 'LIBRARY', basedOn: 'Biblioteca de tu organización' });
    expect(propio.id).toBe('lib-org-propio1');

    expect(r.suggestions.filter((s) => s.origin === 'BASE')).toHaveLength(LIB.length - 2);
    expect(r.libraryCount).toBe(LIB.length);
  });

  it('las sugerencias salen ordenadas por prioridad, también las propias', async () => {
    const { svc } = armar({ auditType: 'EXTERNAL_FINANCIAL', paperRow: papelConBiblioteca(), libRows: [PROPIO] });
    const r = await svc.generateSuggestions('a1', USER, 'wp1');
    const orden = r.suggestions.map((s) => ['HIGH', 'MEDIUM', 'LOW'].indexOf(s.priority));
    expect(orden).toEqual([...orden].sort((a, b) => a - b));
  });

  it('no repite lo propio que el papel ya tiene aplicado', async () => {
    const aplicado = { procedures: [{ id: 'p1', title: 'Revisar acuerdos verbales con la administración' }] };
    const { svc } = armar({ auditType: 'EXTERNAL_FINANCIAL', paperRow: papelConBiblioteca({ content: aplicado }), libRows: [PROPIO] });
    const r = await svc.generateSuggestions('a1', USER, 'wp1');
    expect(r.suggestions.map((s) => s.title)).not.toContain('Revisar acuerdos verbales con la administración');
    expect(r.suggestions).toHaveLength(LIB.length);
  });

  it('los ajustes de OTRA organización no se usan', async () => {
    const { svc } = armar({ auditType: 'EXTERNAL_FINANCIAL', paperRow: papelConBiblioteca(), libRows: [{ ...OCULTO, organizationId: 'org2' }, { ...PROPIO, organizationId: 'org2' }] });
    const r = await svc.generateSuggestions('a1', USER, 'wp1');
    expect(r.suggestions).toHaveLength(LIB.length);
    expect(r.suggestions.every((s) => s.origin === 'BASE')).toBe(true);
  });

  it('un propio puede restringirse a un tipo de encargo', async () => {
    const soloFiscal = { ...PROPIO, itemDetails: { ...(PROPIO.itemDetails as object), auditTypes: ['FISCAL'] } };
    const { svc } = armar({ auditType: 'EXTERNAL_FINANCIAL', paperRow: papelConBiblioteca(), libRows: [soloFiscal] });
    const r = await svc.generateSuggestions('a1', USER, 'wp1');
    expect(r.suggestions).toHaveLength(LIB.length);
    expect(r.suggestions.some((s) => s.origin === 'OWN')).toBe(false);
  });

  it('un papel sin catálogo del sistema pero con procedimientos propios usa la biblioteca de la organización (sin IA)', async () => {
    const papel = { ...papelConBiblioteca(), paperCode: 'PT-PROPIO-1' };
    const { svc } = armar({ auditType: 'EXTERNAL_FINANCIAL', paperRow: papel, libRows: [{ ...PROPIO, groupKey: 'PT-PROPIO-1' }] });
    const r = await svc.generateSuggestions('a1', USER, 'wp1');
    expect(generateText).not.toHaveBeenCalled();
    expect(r.suggestions).toHaveLength(1);
    expect(r.suggestions[0]).toMatchObject({ origin: 'OWN', source: 'LIBRARY', basedOn: 'Biblioteca de tu organización' });
  });

  it('si la organización ocultó TODO el catálogo, el papel se trata como sin biblioteca y va a la IA, sin repetir lo oculto', async () => {
    (generateText as jest.Mock).mockResolvedValue(IA_OK);
    const ocultos = LIB.map((p, i) => fila({ id: `o${i}`, itemLabel: p.title, details: { baseId: p.id, hidden: true } }));
    const { svc } = armar({ auditType: 'EXTERNAL_FINANCIAL', paperRow: papelConBiblioteca({ scope: ALCANCE }), libRows: ocultos });
    const r = await svc.generateSuggestions('a1', USER, 'wp1');
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(r.libraryCount).toBe(0);
    expect(r.suggestions.every((s) => s.source === 'AI')).toBe(true);
    expect(prompt()).toContain(LIB[0].title.slice(0, 40));
  });

  it('al ampliar con IA, lo oculto también va en la lista de exclusión', async () => {
    (generateText as jest.Mock).mockResolvedValue(IA_OK);
    const { svc } = armar({ auditType: 'EXTERNAL_FINANCIAL', paperRow: papelConBiblioteca({ scope: ALCANCE }), libRows: [OCULTO] });
    const r = await svc.generateSuggestions('a1', USER, 'wp1', true);
    expect(prompt()).toContain(LIB[0].title.slice(0, 40));
    expect(r.suggestions.filter((s) => s.source === 'LIBRARY')).toHaveLength(LIB.length - 1);
  });

  it('si la biblioteca de la organización no se puede leer, usa el catálogo del sistema y no falla', async () => {
    const { svc } = armar({ auditType: 'EXTERNAL_FINANCIAL', paperRow: papelConBiblioteca(), libFails: true });
    const r = await svc.generateSuggestions('a1', USER, 'wp1');
    expect(r.suggestions).toHaveLength(LIB.length);
    expect(r.suggestions.every((s) => s.origin === 'BASE')).toBe(true);
    expect(r.insufficientContext).toBeUndefined();
  });
});
