import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PaperAiAssistService } from './paper-ai-assist.service';
import { AuthUser } from '../auth/jwt.strategy';

const USER = { id: 'u1', role: 'AUDITOR', organizationId: 'org1' } as AuthUser;

function fila(over: Record<string, unknown> = {}, audit: Record<string, unknown> = {}) {
  return {
    code: 'A-1', paperCode: null, title: 'Conciliación del débito fiscal de IVA', narrative: null,
    content: { procedures: [{ id: 'p1', title: 'Cotejar libro de ventas con la declaración' }] },
    sections: [{ sectionKey: 'S1', label: 'Objetivo', value: 'Conciliar el débito fiscal declarado con el libro de ventas.' }],
    audit: {
      organizationId: 'org1', isInvestigationMode: false, team: [],
      title: 'Auditoría fiscal 2025', type: 'FISCAL', subtype: null, scope: 'Cumplimiento de IVA e ISR del ejercicio 2025.',
      auditPeriodStart: new Date('2025-01-01'), auditPeriodEnd: new Date('2025-12-31'), auditEntity: { name: 'Distribuidora El Sol' },
      ...audit,
    },
    ...over,
  };
}

function armar(row: unknown) {
  const llamadas = { improve: [] as any[], draft: [] as any[], rag: [] as any[] };
  const prisma: any = { workingPaper: { findUnique: jest.fn(async () => row) } };
  const ai: any = {
    improveProcedureText: jest.fn(async (p: any) => { llamadas.improve.push(p); return { improved: 'texto mejorado' }; }),
    draftProcedure: jest.fn(async (p: any) => { llamadas.draft.push(p); return { development: 'desarrollo' }; }),
    searchRag: jest.fn(async (q: string, bases: string[], n: number) => {
      llamadas.rag.push({ q, bases, n });
      return [{ content: 'Art. 65 Ley IVA: el débito fiscal se determina…', sectionTitle: 'Débito fiscal', similarity: 0.8 }];
    }),
  };
  return { svc: new PaperAiAssistService(prisma, ai), prisma, ai, llamadas };
}

describe('PaperAiAssistService — compatibilidad sin paperId', () => {
  it('sin paperId pasa el cuerpo tal cual, sin consultar la base ni el RAG', async () => {
    const { svc, prisma, ai, llamadas } = armar(fila());
    await svc.improveText({ text: 'hola', fieldType: 'title', paperTitle: 'X', paperType: 'OTHER' }, USER);
    await svc.draftProcedure({ title: 't', statement: 's', paperTitle: 'X' }, USER);
    expect(prisma.workingPaper.findUnique).not.toHaveBeenCalled();
    expect(ai.searchRag).not.toHaveBeenCalled();
    expect(llamadas.improve[0]).toEqual({ text: 'hola', fieldType: 'title', paperTitle: 'X', paperType: 'OTHER' });
    expect(llamadas.draft[0]).toEqual({ title: 't', statement: 's', paperTitle: 'X' });
  });
});

describe('PaperAiAssistService.improveText — con el contexto del papel', () => {
  it('manda la ficha ligera armada en el servidor, no lo que diga el navegador', async () => {
    const { svc, llamadas } = armar(fila());
    const r = await svc.improveText({ paperId: 'wp1', text: 'revisar las ventas', fieldType: 'statement', paperTitle: 'TÍTULO FALSO', paperType: 'AML' }, USER);
    expect(r).toEqual({ improved: 'texto mejorado' });
    const p = llamadas.improve[0];
    expect(p.paperTitle).toBe('Conciliación del débito fiscal de IVA');
    expect(p.paperType).toBe('FISCAL');
    expect(p.paperId).toBeUndefined();
    expect(p.text).toBe('revisar las ventas');
    expect(p.fieldType).toBe('statement');
    expect(p.contextBrief).toContain('ALCANCE: Cumplimiento de IVA e ISR');
    expect(p.contextBrief).toContain('PAPEL: A-1 — Conciliación del débito fiscal de IVA');
    expect(p.contextBrief).toContain('Cotejar libro de ventas con la declaración');
    expect(p.contextBrief.length).toBeLessThanOrEqual(1200);
  });

  it('no consulta normativa (la varita solo reescribe) ni exige contexto mínimo', async () => {
    const { svc, ai } = armar(fila({ title: 'Nuevo papel', sections: [], content: {} }, { scope: null }));
    const r = await svc.improveText({ paperId: 'wp1', text: 'texto del auditor' }, USER);
    expect(ai.searchRag).not.toHaveBeenCalled();
    expect(ai.improveProcedureText).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ improved: 'texto mejorado' });
  });
});

describe('PaperAiAssistService.draftProcedure — con el contexto del papel', () => {
  it('manda ficha estándar y normativa del marco del encargo; el tipo sale del servidor', async () => {
    const { svc, llamadas } = armar(fila());
    await svc.draftProcedure({ paperId: 'wp1', title: 'Cotejo de ventas', statement: 'Cotejar libro con declaración', auditType: 'AML', paperTitle: 'FALSO' }, USER);
    expect(llamadas.rag).toEqual([{ q: expect.stringContaining('Conciliación del débito fiscal de IVA — Cotejo de ventas'), bases: ['FISCAL_SV'], n: 3 }]);
    const p = llamadas.draft[0];
    expect(p.auditType).toBe('FISCAL');
    expect(p.paperTitle).toBe('Conciliación del débito fiscal de IVA');
    expect(p.paperCode).toBe('A-1');
    expect(p.ragBlock).toContain('[Débito fiscal] Art. 65 Ley IVA');
    expect(p.contextBrief).toContain('ENCARGO: FISCAL');
    expect(p.contextBrief.length).toBeLessThanOrEqual(2600);
    expect(p.paperId).toBeUndefined();
    expect(p.title).toBe('Cotejo de ventas');
  });

  it('cada tipo de encargo consulta SU base, y los que no tienen base no consultan nada', async () => {
    const fin = armar(fila({}, { type: 'EXTERNAL_FINANCIAL' }));
    await fin.svc.draftProcedure({ paperId: 'wp1', title: 't' }, USER);
    expect(fin.llamadas.rag[0].bases).toEqual(['CVPCPA_SV']);
    const ti = armar(fila({}, { type: 'IT_SECURITY' }));
    await ti.svc.draftProcedure({ paperId: 'wp1', title: 't' }, USER);
    expect(ti.ai.searchRag).not.toHaveBeenCalled();
    expect(ti.llamadas.draft[0].ragBlock).toBe('');
  });

  it('papel sin contexto suficiente: NO llama a la IA ni al RAG y dice qué falta', async () => {
    const { svc, ai } = armar(fila({ title: 'Nuevo papel', sections: [], content: {} }, { scope: null }));
    const r: any = await svc.draftProcedure({ paperId: 'wp1', title: 'algo', statement: 'algo' }, USER);
    expect(r.insufficientContext).toBe(true);
    expect(r.message).toMatch(/no tiene contexto suficiente/);
    expect(r.missing).toHaveLength(2);
    expect(ai.draftProcedure).not.toHaveBeenCalled();
    expect(ai.searchRag).not.toHaveBeenCalled();
  });

  it('el aviso de contexto insuficiente también cubre la mejora? no: solo el borrador lo exige', async () => {
    const { svc, ai } = armar(fila({ title: 'Papel', sections: [], content: {} }, { scope: null }));
    await svc.improveText({ paperId: 'wp1', text: 'x' }, USER);
    expect(ai.improveProcedureText).toHaveBeenCalledTimes(1);
  });
});

describe('PaperAiAssistService — aislamiento', () => {
  it.each([
    ['improveText', (s: PaperAiAssistService, u: AuthUser) => s.improveText({ paperId: 'wp1', text: 'x' }, u)],
    ['draftProcedure', (s: PaperAiAssistService, u: AuthUser) => s.draftProcedure({ paperId: 'wp1', title: 't' }, u)],
  ])('%s rechaza un papel de otra organización', async (_n, fn) => {
    const { svc, ai } = armar(fila({}, { organizationId: 'otra-org' }));
    await expect(fn(svc, USER)).rejects.toBeInstanceOf(ForbiddenException);
    expect(ai.improveProcedureText).not.toHaveBeenCalled();
    expect(ai.draftProcedure).not.toHaveBeenCalled();
    expect(ai.searchRag).not.toHaveBeenCalled();
  });

  it.each([
    ['improveText', (s: PaperAiAssistService, u: AuthUser) => s.improveText({ paperId: 'wp1', text: 'x' }, u)],
    ['draftProcedure', (s: PaperAiAssistService, u: AuthUser) => s.draftProcedure({ paperId: 'wp1', title: 't' }, u)],
  ])('%s rechaza una investigación ajena al equipo, pero la deja pasar al equipo y al CAE', async (_n, fn) => {
    const row = fila({}, { isInvestigationMode: true, team: [{ userId: 'otro' }] });
    const ajeno = armar(row);
    await expect(fn(ajeno.svc, USER)).rejects.toBeInstanceOf(ForbiddenException);
    expect(ajeno.ai.improveProcedureText).not.toHaveBeenCalled();
    expect(ajeno.ai.draftProcedure).not.toHaveBeenCalled();

    const delEquipo = armar(fila({}, { isInvestigationMode: true, team: [{ userId: 'u1' }] }));
    await expect(fn(delEquipo.svc, USER)).resolves.toBeDefined();

    const cae = armar(row);
    await expect(fn(cae.svc, { ...USER, id: 'u9', role: 'CAE' } as AuthUser)).resolves.toBeDefined();
  });

  it.each(['improveText', 'draftProcedure'] as const)('%s con un papel inexistente → 404', async (m) => {
    const { svc } = armar(null);
    const llamar = m === 'improveText'
      ? svc.improveText({ paperId: 'nope', text: 'x' }, USER)
      : svc.draftProcedure({ paperId: 'nope', title: 't' }, USER);
    await expect(llamar).rejects.toBeInstanceOf(NotFoundException);
  });
});
