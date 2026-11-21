/* eslint-disable @typescript-eslint/no-explicit-any */
import { lastValueFrom, of } from 'rxjs';
import { Metered, mediaWeight } from './metered.decorator';
import { monthsUntil, newReference, sniffProof } from './payments.service';
import { addMonths } from './entitlements';
import { classifyFile } from './storage-usage.service';
import { getRequestContext, RequestContextInterceptor, runWithRequestContext } from '../common/request-context';
import { generateText } from '../common/llm/llm-client';

const DAY = 24 * 60 * 60 * 1000;

describe('referencia de pago', () => {
  it('tiene la forma AUD-XXXXXX sin letras ni números que se confundan (I, O, 0, 1)', () => {
    for (let i = 0; i < 500; i++) expect(newReference()).toMatch(/^AUD-[A-HJ-NP-Z2-9]{6}$/);
  });
  it('casi nunca se repite (32^6 combinaciones)', () => {
    const set = new Set(Array.from({ length: 3000 }, () => newReference()));
    expect(set.size).toBeGreaterThan(2990);
  });
});

describe('meses hasta el vencimiento (cobro del espacio extra)', () => {
  const now = new Date('2026-11-21T00:00:00Z');
  it('sin fecha de fin se cobran 12 meses', () => expect(monthsUntil(null, now)).toBe(12));
  it('mínimo 1 mes, aunque falten pocos días o ya haya vencido', () => {
    expect(monthsUntil(new Date(now.getTime() + 3 * DAY), now)).toBe(1);
    expect(monthsUntil(new Date(now.getTime() - 5 * DAY), now)).toBe(1);
  });
  it('cuenta meses de CALENDARIO y redondea hacia arriba', () => {
    expect(monthsUntil(new Date(now.getTime() + 30 * DAY), now)).toBe(1); // 21 nov → 21 dic
    expect(monthsUntil(new Date(now.getTime() + 31 * DAY), now)).toBe(2);
    expect(monthsUntil(new Date(now.getTime() + 90 * DAY), now)).toBe(3);
    expect(monthsUntil(new Date(now.getTime() + 365 * DAY), now)).toBe(12);
    expect(monthsUntil(new Date(now.getTime() + 366 * DAY), now)).toBe(13);
  });
  it('una licencia de N meses suma exactamente N meses aunque tenga 92 días (3 meses) o 28 (febrero)', () => {
    for (const n of [1, 3, 6, 12]) expect(monthsUntil(addMonths(now, n), now)).toBe(n);
    const feb = new Date('2027-01-31T00:00:00Z');
    expect(monthsUntil(addMonths(feb, 1), feb)).toBe(1);
  });
});

describe('comprobante: el tipo real por los primeros bytes', () => {
  it('reconoce PDF, JPG y PNG', () => {
    expect(sniffProof(Buffer.from('%PDF-1.7\n...'))).toEqual({ ext: 'pdf', mime: 'application/pdf' });
    expect(sniffProof(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toEqual({ ext: 'jpg', mime: 'image/jpeg' });
    expect(sniffProof(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toEqual({ ext: 'png', mime: 'image/png' });
  });
  it('rechaza lo demás aunque se llame .pdf: ejecutables, HTML, GIF, SVG, vacío', () => {
    for (const b of [Buffer.from('MZ\x90\x00'), Buffer.from('<html><script>'), Buffer.from('GIF89a'), Buffer.from('<svg xmlns='), Buffer.alloc(0), Buffer.from('%PD')]) {
      expect(sniffProof(b)).toBeNull();
    }
  });
});

describe('tipo de archivo para las cuotas', () => {
  const casos: Array<[string | null, string | null, string]> = [
    ['video/mp4', 'visita.mp4', 'VIDEO'], [null, 'grabacion.MOV', 'VIDEO'], ['audio/mpeg', 'entrevista.mp3', 'AUDIO'], [null, 'nota.m4a', 'AUDIO'],
    ['application/pdf', 'contrato.pdf', 'PDF'], [null, 'contrato.PDF', 'PDF'], ['image/jpeg', 'foto.jpg', 'FOTO'], [null, 'foto.heic', 'FOTO'],
    ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'a.pptx', 'PPT'], ['application/vnd.ms-powerpoint', null, 'PPT'],
    ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'libro.xlsx', 'XLS'], ['text/csv', 'datos.csv', 'XLS'], [null, 'mayor.xlsm', 'XLS'],
    ['application/zip', 'todo.zip', 'OTROS'], [null, null, 'OTROS'], ['application/octet-stream', 'x.bin', 'OTROS'],
  ];
  it.each(casos)('%s / %s → %s', (mime, name, esperado) => expect(classifyFile(mime, name)).toBe(esperado));
});

describe('peso de un audio o video: 10 peticiones por cada 10 minutos', () => {
  const MB = 1_000_000;
  it('audio comprimido (≈ 1 MB por minuto)', () => {
    expect(mediaWeight(5 * MB, 'audio/mpeg', 'audio')).toBe(10);
    expect(mediaWeight(10 * MB, 'audio/mpeg', 'audio')).toBe(10);
    expect(mediaWeight(11 * MB, 'audio/mpeg', 'audio')).toBe(20);
    expect(mediaWeight(150 * MB, 'audio/mpeg', 'audio')).toBe(150);
  });
  it('audio sin comprimir (WAV ≈ 10 MB por minuto) pesa lo mismo por minuto que el comprimido', () => {
    expect(mediaWeight(100 * MB, 'audio/wav', 'audio')).toBe(10);
    expect(mediaWeight(110 * MB, 'audio/wav', 'audio')).toBe(20);
  });
  it('video (≈ 20 MB por minuto)', () => {
    expect(mediaWeight(100 * MB, 'video/mp4', 'video')).toBe(10);
    expect(mediaWeight(600 * MB, 'video/mp4', 'video')).toBe(30);
  });
  it('nunca menos de 10 ni más de 200', () => {
    expect(mediaWeight(1, 'audio/mpeg', 'audio')).toBe(10);
    expect(mediaWeight(50_000 * MB, 'video/mp4', 'video')).toBe(200);
  });
});

describe('@Metered', () => {
  class Servicio {
    constructor(public usage?: any) {}
    @Metered({ agent: (a) => String(a[0]).toUpperCase(), weight: 3 }) async accion(agente: string) { return `hecho:${agente}`; }
    @Metered({ agent: 'EVIDENCIA', weight: (a) => (a[0] as Buffer).length }) async pesada(b: Buffer) { return b.length; }
  }

  it('con medidor: delega en usage.meter con el asistente y el peso, y devuelve el resultado', async () => {
    const meter = jest.fn(async (_opts: any, fn: () => Promise<unknown>) => fn());
    const r = await new Servicio({ meter }).accion('minerva');
    expect(r).toBe('hecho:minerva');
    expect(meter).toHaveBeenCalledWith(expect.objectContaining({ agent: 'MINERVA', weight: 3 }), expect.any(Function));
  });

  it('el peso puede depender de los argumentos', async () => {
    const meter = jest.fn(async (_o: any, fn: () => Promise<unknown>) => fn());
    await new Servicio({ meter }).pesada(Buffer.alloc(7));
    expect(meter).toHaveBeenCalledWith(expect.objectContaining({ agent: 'EVIDENCIA', weight: 7 }), expect.any(Function));
  });

  it('sin medidor (pruebas que construyen el servicio a mano) la acción corre normal', async () => {
    expect(await new Servicio().accion('x')).toBe('hecho:x');
  });

  it('si el límite bloquea, la acción NO se ejecuta y el error sube', async () => {
    const original = jest.fn();
    class S2 { usage = { meter: async () => { throw new Error('LIMITE_IA'); } }; @Metered({ agent: 'X', weight: 1 }) async a() { original(); return 1; } }
    await expect(new S2().a()).rejects.toThrow('LIMITE_IA');
    expect(original).not.toHaveBeenCalled();
  });
});

describe('contexto de la petición (quién consume)', () => {
  it('dentro del manejador la organización y el usuario están disponibles; fuera no, y no se filtran al terminar', async () => {
    const interceptor = new RequestContextInterceptor();
    const ctx: any = { getType: () => 'http', switchToHttp: () => ({ getRequest: () => ({ user: { id: 'u1', organizationId: 'org1', role: 'AUDITOR' } }) }) };
    let dentro: unknown;
    const handler: any = { handle: () => { dentro = getRequestContext(); return of('ok'); } };
    expect(await lastValueFrom(interceptor.intercept(ctx, handler))).toBe('ok');
    expect(dentro).toEqual({ organizationId: 'org1', userId: 'u1', role: 'AUDITOR' });
    expect(getRequestContext()).toBeUndefined();
  });
  it('sin usuario (ruta pública) no crea contexto', async () => {
    const interceptor = new RequestContextInterceptor();
    const ctx: any = { getType: () => 'http', switchToHttp: () => ({ getRequest: () => ({}) }) };
    let dentro: unknown = 'sin-llamar';
    await lastValueFrom(interceptor.intercept(ctx, { handle: () => { dentro = getRequestContext(); return of(1); } } as any));
    expect(dentro).toBeUndefined();
  });
  it('runWithRequestContext lo fija para código asíncrono posterior', async () => {
    const v = await runWithRequestContext({ organizationId: 'o', userId: 'u', role: 'ADMIN' }, async () => { await Promise.resolve(); return getRequestContext(); });
    expect(v).toEqual({ organizationId: 'o', userId: 'u', role: 'ADMIN' });
  });
});

describe('generateText con medición', () => {
  const cfg = { get: (k: string, d?: unknown) => ({ GEMINI_API_KEY: 'x' } as Record<string, unknown>)[k] ?? d } as any;
  let fetchMock: jest.SpyInstance;
  beforeEach(() => { fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'hola' }] } }] }), { status: 200 })); });
  afterEach(() => fetchMock.mockRestore());

  it('con medidor: cuenta las peticiones del asistente y devuelve el texto', async () => {
    const meter = jest.fn(async (_o: any, fn: () => Promise<unknown>) => fn());
    const out = await generateText(cfg, { messages: [{ role: 'user', content: 'x' }], temperature: 0, maxTokens: 10, meter: { usage: { meter } as any, agent: 'SCRIPTORIUM', weight: 5 } });
    expect(out).toBe('hola');
    expect(meter).toHaveBeenCalledWith({ agent: 'SCRIPTORIUM', weight: 5 }, expect.any(Function));
  });
  it('si el medidor bloquea por límite, no se llama al proveedor de IA', async () => {
    const meter = jest.fn(async () => { throw new Error('LIMITE_IA'); });
    await expect(generateText(cfg, { messages: [{ role: 'user', content: 'x' }], temperature: 0, maxTokens: 10, meter: { usage: { meter } as any, agent: 'X', weight: 1 } })).rejects.toThrow('LIMITE_IA');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('sin medidor funciona igual que antes', async () => {
    expect(await generateText(cfg, { messages: [{ role: 'user', content: 'x' }], temperature: 0, maxTokens: 10 })).toBe('hola');
  });
});
