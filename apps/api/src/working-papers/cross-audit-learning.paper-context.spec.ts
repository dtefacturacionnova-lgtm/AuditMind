import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CrossAuditLearningService } from './cross-audit-learning.service';
import { AuthUser } from '../auth/jwt.strategy';

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

function armar(opts: { auditType?: string; org?: string; investigation?: boolean; team?: string[]; paperRow?: Record<string, unknown> | null; paperInAudit?: boolean } = {}) {
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
