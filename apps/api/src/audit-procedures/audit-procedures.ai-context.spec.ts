import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AuditProceduresService } from './audit-procedures.service';
import { AuthUser } from '../auth/jwt.strategy';

jest.mock('../common/llm/llm-client', () => ({
  generateText: jest.fn(),
  isLlmConfigured: jest.fn(() => true),
}));
import { generateText, isLlmConfigured } from '../common/llm/llm-client';

const USER = { id: 'u1', role: 'AUDITOR', organizationId: 'org1' } as AuthUser;

const PROGRAMA = JSON.stringify({
  procedures: [{
    refNumber: 'P-01', description: 'Cotejar el libro de ventas con la declaración de IVA.', assertions: [], significantRisk: false, rmmLevel: 'MODERADO',
    steps: [{ refNumber: 'P-01.1', description: 'Recalcular el débito fiscal del mes.', assertions: [], testType: 'DETAIL', nature: 'RECALCULATION', timing: 'YEAR_END', extent: '100%', population: 'Facturas del período' }],
  }],
});

interface Opts { auditType?: string; org?: string; investigation?: boolean; team?: string[]; vacio?: boolean; sinPT?: boolean; yaTiene?: string[] }

function armar(o: Opts = {}) {
  const audit = (extra: Record<string, unknown> = {}) => ({
    organizationId: o.org ?? 'org1', isInvestigationMode: !!o.investigation, team: (o.team ?? []).map((userId) => ({ userId })),
    title: 'Auditoría 2025', type: o.auditType ?? 'FISCAL', subtype: null, scope: o.vacio ? null : 'Cumplimiento de IVA e ISR del ejercicio 2025.',
    auditPeriodStart: null, auditPeriodEnd: null, auditEntity: { name: 'Distribuidora El Sol' }, ...extra,
  });
  const paperRow = {
    auditId: 'a1', code: 'A-1', paperCode: null, title: o.vacio ? 'Nuevo papel' : 'Programa de pruebas de IVA', narrative: null, content: {},
    sections: o.vacio ? [] : [{ sectionKey: 'S1', label: 'Objetivo', value: 'Verificar la correcta determinación del débito fiscal.' }],
    audit: audit(),
  };
  const creados = { procs: [] as any[], steps: [] as any[] };
  const prisma: any = {
    paperSection: {
      findUnique: jest.fn(async () => ({ id: 'sec1', label: 'Programa de IVA', description: null, paperId: 'wp1', paper: { audit: audit() } })),
    },
    workingPaper: {
      findUnique: jest.fn(async () => paperRow),
      findMany: jest.fn(async () => (o.sinPT ? [] : [
        { paperCode: 'PT-A2', sections: [{ sectionKey: 'S1', value: 'Ventas, Compras' }, { sectionKey: 'S4', value: { Ventas: 'ALTO' } }, { sectionKey: 'S6', value: '' }] },
      ])),
    },
    auditProcedure: {
      findMany: jest.fn(async () => (o.yaTiene ?? []).map((description) => ({ description }))),
      count: jest.fn(async () => 0),
      create: jest.fn(async ({ data }: any) => { const r = { id: `pr${creados.procs.length + 1}`, ...data }; creados.procs.push(r); return r; }),
    },
    auditStep: {
      create: jest.fn(async ({ data }: any) => { const r = { id: `st${creados.steps.length + 1}`, ...data, evidences: [] }; creados.steps.push(r); return r; }),
    },
  };
  const ai: any = { searchRag: jest.fn(async () => [{ content: 'Art. 65 Ley IVA: el débito fiscal se determina…', sectionTitle: 'Débito fiscal', similarity: 0.8 }]) };
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';
  const svc = new AuditProceduresService(prisma, {} as any, undefined, undefined, ai);
  return { svc, prisma, ai, creados };
}

const prompt = () => (generateText as jest.Mock).mock.calls[0][1].messages[0].content as string;

beforeEach(() => {
  (generateText as jest.Mock).mockReset();
  (isLlmConfigured as jest.Mock).mockReset().mockReturnValue(true);
});

describe('suggestAndCreateProcedures — con el contexto del papel', () => {
  it('encargo fiscal: ficha del papel, normativa, marco tributario y SIN aserciones de estados financieros', async () => {
    (generateText as jest.Mock).mockResolvedValue(PROGRAMA);
    const { svc, ai, creados } = armar();
    const r = await svc.suggestAndCreateProcedures('sec1', USER);
    expect(r).toHaveLength(1);
    expect(creados.procs).toHaveLength(1);
    expect(creados.steps).toHaveLength(1);
    const p = prompt();
    expect(p).toContain('Ficha del papel y del encargo');
    expect(p).toContain('PAPEL: A-1 — Programa de pruebas de IVA');
    expect(p).toContain('ALCANCE: Cumplimiento de IVA e ISR');
    expect(p).toContain('tributario');
    expect(p).toContain('Art. 65 Ley IVA');
    expect(p).toContain('NO es de estados financieros');
    expect(p).not.toContain('Big 4');
    expect(p).not.toContain('(No disponible)');
    expect(p).not.toContain('Saldos al 31/12');
    expect(p).toContain('"sin_contexto"');
    expect(ai.searchRag).toHaveBeenCalledWith(expect.stringContaining('Programa de pruebas de IVA'), ['FISCAL_SV'], 3);
  });

  it('encargo financiero: aserciones NIA 315, marco NIA/CVPCPA y base CVPCPA', async () => {
    (generateText as jest.Mock).mockResolvedValue(PROGRAMA);
    const { svc, ai } = armar({ auditType: 'EXTERNAL_FINANCIAL' });
    await svc.suggestAndCreateProcedures('sec1', USER);
    const p = prompt();
    expect(p).toContain('Usa aserciones NIA 315');
    expect(p).not.toContain('NO es de estados financieros');
    expect(p).toContain('CVPCPA');
    expect(ai.searchRag).toHaveBeenCalledWith(expect.any(String), ['CVPCPA_SV'], 3);
  });

  it('el bloque de riesgo solo trae lo que existe (PT-A2), no «(No disponible)» repetido', async () => {
    (generateText as jest.Mock).mockResolvedValue(PROGRAMA);
    await armar().svc.suggestAndCreateProcedures('sec1', USER);
    const p = prompt();
    expect(p).toContain('Áreas auditadas (PT-A2 S1)');
    expect(p).toContain('Ventas, Compras');
    expect(p).not.toContain('Riesgos Significativos NIA 315 (PT-A2 S6)'); // S6 vacío
    expect(p).not.toContain('[object Object]');

    (generateText as jest.Mock).mockClear();
    await armar({ sinPT: true }).svc.suggestAndCreateProcedures('sec1', USER);
    expect(prompt()).not.toContain('Contexto de riesgo disponible');
  });

  it('lista los procedimientos que la sección ya tiene para no repetirlos', async () => {
    (generateText as jest.Mock).mockResolvedValue(PROGRAMA);
    await armar({ yaTiene: ['Conciliar ventas con declaración de IVA'] }).svc.suggestAndCreateProcedures('sec1', USER);
    expect(prompt()).toContain('Procedimientos que la sección ya tiene (no los repitas)');
    expect(prompt()).toContain('Conciliar ventas con declaración de IVA');
  });

  it('un tipo de encargo sin base normativa no consulta el RAG', async () => {
    (generateText as jest.Mock).mockResolvedValue(PROGRAMA);
    const { svc, ai } = armar({ auditType: 'IT_SECURITY' });
    await svc.suggestAndCreateProcedures('sec1', USER);
    expect(ai.searchRag).not.toHaveBeenCalled();
    expect(prompt()).not.toContain('Normativa recuperada');
  });
});

describe('suggestAndCreateProcedures — cuando falta contexto, lo dice y no crea nada', () => {
  it('papel sin contexto suficiente: error legible, sin llamar a la IA ni crear registros', async () => {
    const { svc, creados, ai } = armar({ vacio: true });
    await expect(svc.suggestAndCreateProcedures('sec1', USER)).rejects.toThrow(/no tiene contexto suficiente/);
    expect(generateText).not.toHaveBeenCalled();
    expect(ai.searchRag).not.toHaveBeenCalled();
    expect(creados.procs).toHaveLength(0);
  });

  it('la IA responde sin_contexto: error con el motivo y nada se crea', async () => {
    (generateText as jest.Mock).mockResolvedValue('{"sin_contexto": "el papel no dice qué cuentas cubre"}');
    const { svc, creados } = armar();
    await expect(svc.suggestAndCreateProcedures('sec1', USER)).rejects.toThrow(/el papel no dice qué cuentas cubre/);
    expect(creados.procs).toHaveLength(0);
    expect(creados.steps).toHaveLength(0);
  });

  it('el aviso funciona aunque venga envuelto en un bloque ```json', async () => {
    (generateText as jest.Mock).mockResolvedValue('```json\n{"sin_contexto": "falta el alcance"}\n```');
    const { svc, creados } = armar();
    await expect(svc.suggestAndCreateProcedures('sec1', USER)).rejects.toThrow(/falta el alcance/);
    expect(creados.procs).toHaveLength(0);
  });

  it('respuesta que no es JSON válido: mismo error de siempre', async () => {
    (generateText as jest.Mock).mockResolvedValue('esto no es json');
    const { svc, creados } = armar();
    await expect(svc.suggestAndCreateProcedures('sec1', USER)).rejects.toThrow(/no pudo generar procedimientos válidos/);
    expect(creados.procs).toHaveLength(0);
  });

  it('sin IA configurada: mismo error de siempre', async () => {
    (isLlmConfigured as jest.Mock).mockReturnValue(false);
    await expect(armar().svc.suggestAndCreateProcedures('sec1', USER)).rejects.toThrow(/IA no configurada/);
  });

  it('todos los rechazos son BadRequest (el front muestra el mensaje)', async () => {
    const { svc } = armar({ vacio: true });
    await expect(svc.suggestAndCreateProcedures('sec1', USER)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('suggestAndCreateProcedures — aislamiento', () => {
  it('rechaza una sección de otra organización', async () => {
    const { svc } = armar({ org: 'otra' });
    await expect(svc.suggestAndCreateProcedures('sec1', USER)).rejects.toBeInstanceOf(ForbiddenException);
    expect(generateText).not.toHaveBeenCalled();
  });

  it('rechaza una investigación ajena al equipo', async () => {
    const { svc } = armar({ investigation: true, team: ['otro'] });
    await expect(svc.suggestAndCreateProcedures('sec1', USER)).rejects.toBeInstanceOf(ForbiddenException);
    expect(generateText).not.toHaveBeenCalled();
  });
});
