import { ERROR_CONEXION_MH, MAX_DOCS_MH, MAX_LOTE_MH, ejecutarValidacionDte, estimarConsulta, lotesParaMh, reducirParaMh } from './dte-mh';

const dte = (codigo: string, extra: Record<string, unknown> = {}) => ({
  identificacion: { codigoGeneracion: codigo, fecEmi: '2026-10-07', ambiente: '01', numeroControl: 'DTE-03-X', tipoDte: '03' },
  emisor: { nombre: 'Dato que no debe viajar' },
  ...extra,
});
const docs = (n: number) => Array.from({ length: n }, (_, i) => dte(`COD-${i}`));

describe('reducirParaMh', () => {
  it('solo viaja el código, la fecha y el ambiente', () => {
    expect(reducirParaMh(dte(' ABC '))).toEqual({ identificacion: { codigoGeneracion: 'ABC', fecEmi: '2026-10-07', ambiente: '01' } });
  });
  it('sin código de generación no hay nada que consultar', () => {
    expect(reducirParaMh({})).toBeNull();
    expect(reducirParaMh(dte(''))).toBeNull();
    expect(reducirParaMh(null as any)).toBeNull();
  });
});

describe('lotesParaMh', () => {
  it('reparte en tandas del tamaño que admite el servicio', () => {
    const { total, lotes } = lotesParaMh(docs(60));
    expect(total).toBe(60);
    expect(lotes.map((l) => l.length)).toEqual([MAX_LOTE_MH, MAX_LOTE_MH, 10]);
  });
  it('no consulta dos veces el mismo código ni los documentos sin código', () => {
    const { total, lotes } = lotesParaMh([dte('A'), dte('a'), dte('B'), dte(''), { x: 1 }]);
    expect(total).toBe(2);
    expect(lotes).toHaveLength(1);
  });
  it('un lote vacío no genera tandas', () => {
    expect(lotesParaMh([])).toEqual({ total: 0, lotes: [] });
  });
});

describe('estimarConsulta', () => {
  it('calcula documentos, minutos y si excede el tope', () => {
    expect(estimarConsulta(docs(10))).toEqual({ documentos: 10, minutos: 1, excedeTope: false });
    expect(estimarConsulta(docs(150))).toEqual({ documentos: 150, minutos: 3, excedeTope: false });
    expect(estimarConsulta(docs(MAX_DOCS_MH + 1)).excedeTope).toBe(true);
  });
});

describe('ejecutarValidacionDte', () => {
  const informe = { total_dtes: 1, findings: [] };

  it('sin consulta es la llamada de siempre, una sola', async () => {
    const llamadas: [string, any][] = [];
    const post = async (path: string, body: unknown) => { llamadas.push([path, body]); return informe; };
    const r = await ejecutarValidacionDte(docs(3), { consultarMh: false, post });
    expect(r).toBe(informe);
    expect(llamadas).toEqual([['/ai/analytics/dte_validation', { records: docs(3) }]]);
  });

  it('con consulta: tanda por tanda y luego el informe con todas las respuestas', async () => {
    const llamadas: [string, any][] = [];
    const post = async (path: string, body: any) => {
      llamadas.push([path, body]);
      if (path.endsWith('dte_mh')) return { consultas: body.records.map((d: any) => ({ codigo_generacion: d.identificacion.codigoGeneracion, estado: 'Procesado' })) };
      return informe;
    };
    const progreso: [number, number][] = [];
    const r = await ejecutarValidacionDte(docs(30), { consultarMh: true, post, onProgreso: (h, t) => progreso.push([h, t]) });
    expect(r).toBe(informe);
    expect(llamadas.map(([p]) => p)).toEqual(['/ai/analytics/dte_mh', '/ai/analytics/dte_mh', '/ai/analytics/dte_validation']);
    expect(llamadas[0][1].records).toHaveLength(MAX_LOTE_MH);
    expect(llamadas[0][1].records[0]).toEqual({ identificacion: { codigoGeneracion: 'COD-0', fecEmi: '2026-10-07', ambiente: '01' } });   // sin datos de más
    const final = llamadas[2][1];
    expect(final.records).toHaveLength(30);                    // el lote completo, con todos sus datos
    expect(final.mh_consultas).toHaveLength(30);
    expect(progreso).toEqual([[0, 30], [25, 30], [30, 30]]);
  });

  it('una tanda que falla deja a sus documentos como no confirmados y el análisis sigue', async () => {
    let n = 0;
    const post = async (path: string, body: any) => {
      if (path.endsWith('dte_mh')) {
        if (++n === 1) throw new Error('timeout');
        return { consultas: body.records.map((d: any) => ({ codigo_generacion: d.identificacion.codigoGeneracion, estado: 'Procesado' })) };
      }
      return body;
    };
    const r = (await ejecutarValidacionDte(docs(30), { consultarMh: true, post })) as any;
    const estados = r.mh_consultas.map((c: any) => c.estado);
    expect(estados.slice(0, MAX_LOTE_MH).every((e: string) => e === ERROR_CONEXION_MH)).toBe(true);
    expect(estados.slice(MAX_LOTE_MH).every((e: string) => e === 'Procesado')).toBe(true);
  });

  it('si fallan todas las tandas se detiene con el error (no es problema de los documentos)', async () => {
    const post = async (path: string) => { if (path.endsWith('dte_mh')) throw new Error('Sesión vencida'); return {}; };
    await expect(ejecutarValidacionDte(docs(5), { consultarMh: true, post })).rejects.toThrow('No se pudo consultar a Hacienda: Sesión vencida');
  });

  it('una respuesta sin el formato esperado cuenta como tanda fallida', async () => {
    const post = async (path: string) => (path.endsWith('dte_mh') ? { algo: 1 } : {});
    await expect(ejecutarValidacionDte(docs(2), { consultarMh: true, post })).rejects.toThrow('Respuesta inesperada');
  });

  it('rechaza un lote que pasa el tope antes de consultar nada', async () => {
    const post = jest.fn();
    await expect(ejecutarValidacionDte(docs(MAX_DOCS_MH + 1), { consultarMh: true, post })).rejects.toThrow(/hasta 300 documentos/);
    expect(post).not.toHaveBeenCalled();
  });

  it('con documentos sin código ninguno se consulta, pero el informe sale igual', async () => {
    const llamadas: string[] = [];
    const post = async (path: string, body: any) => { llamadas.push(path); return body; };
    const r = (await ejecutarValidacionDte([dte('')], { consultarMh: true, post })) as any;
    expect(llamadas).toEqual(['/ai/analytics/dte_validation']);
    expect(r.mh_consultas).toEqual([]);
  });
});
