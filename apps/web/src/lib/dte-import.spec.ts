import { parseDteFile, summarizeImport } from './dte-import';

const bytes = (s: string) => new TextEncoder().encode(s);
const dte = (tipoDte: string, version: number, extra: Record<string, unknown> = {}) => ({ identificacion: { tipoDte, version, codigoGeneracion: `${tipoDte}-${version}` }, ...extra });

describe('parseDteFile', () => {
  it('un DTE V2.0 suelto', () => {
    const r = parseDteFile('a.json', bytes(JSON.stringify(dte('03', 4))));
    expect(r).toMatchObject({ name: 'a.json', v1: 0, v2: 1, repairs: [], omittedItems: 0 });
    expect(r.records).toHaveLength(1);
    expect(r.skipped).toBeUndefined();
  });

  it('un DTE V1 suelto, con la respuesta del portal (responseMH) en la raíz', () => {
    const r = parseDteFile('b.json', bytes(JSON.stringify(dte('03', 3, { responseMH: { estado: 'PROCESADO', selloRecibido: 'S' } }))));
    expect(r).toMatchObject({ v1: 1, v2: 0 });
    expect((r.records[0] as any).responseMH.selloRecibido).toBe('S');   // el documento llega intacto, el sobre lo trata el motor
  });

  it('un arreglo con documentos de las dos versiones los cuenta por separado', () => {
    const r = parseDteFile('lote.json', bytes(JSON.stringify([dte('01', 1), dte('01', 2), dte('03', 3), dte('03', 4)])));
    expect(r).toMatchObject({ v1: 2, v2: 2 });
    expect(r.records).toHaveLength(4);
  });

  it('un documento sin la versión de ninguna normativa se valida como V2.0, igual que en el motor', () => {
    expect(parseDteFile('c.json', bytes(JSON.stringify(dte('01', 9))))).toMatchObject({ v1: 0, v2: 1 });
  });

  it('un archivo con BOM se lee sin más (el decodificador UTF-8 lo descarta) y no cuenta como reparado', () => {
    const conBom = parseDteFile('d.json', bytes(`﻿${JSON.stringify(dte('01', 2))}`));
    expect(conBom.repairs).toEqual([]);
    expect(conBom.records).toHaveLength(1);
  });

  it('informa lo que reparó: texto sobrante, objeto sin nombre y Latin-1', () => {
    const sinNombre = parseDteFile('g.json', bytes('{"identificacion":{"tipoDte":"01","version":2},{"estado":"PROCESADO","selloRecibido":"S"}}'));
    expect(sinNombre.repairs[0]).toMatch(/objeto sin nombre/);
    expect((sinNombre.records[0] as any).responseMH.selloRecibido).toBe('S');

    const sobrante = parseDteFile('e.json', bytes(`${JSON.stringify(dte('01', 2))}\n{"otro":1}`));
    expect(sobrante.repairs[0]).toMatch(/texto sobrante/);
    expect(sobrante.records).toHaveLength(1);

    const latin1 = new Uint8Array([...bytes('{"identificacion":{"tipoDte":"01","version":2},"emisor":{"nombre":"SALVADORE'), 0xd1, ...bytes('O"}}')]);
    const l = parseDteFile('f.json', latin1);
    expect(l.repairs[0]).toMatch(/Latin-1/);
    expect((l.records[0] as any).emisor.nombre).toBe('SALVADOREÑO');
  });

  it('un JSON inválido se omite con el motivo, sin romper la carga de los demás', () => {
    const r = parseDteFile('roto.json', bytes('{"identificacion":'));
    expect(r.skipped).toBe('no es un JSON válido');
    expect(r.records).toEqual([]);
  });

  it('un JSON que no es un DTE se omite; en un arreglo mixto solo se descartan los que no lo son', () => {
    expect(parseDteFile('catalogo.json', bytes('{"codigo":"01"}')).skipped).toMatch(/ningún DTE/);
    expect(parseDteFile('lista.json', bytes('[1,2,3]')).skipped).toMatch(/ningún DTE/);
    const mixto = parseDteFile('mixto.json', bytes(JSON.stringify([dte('01', 2), { x: 1 }, 'texto'])));
    expect(mixto.records).toHaveLength(1);
    expect(mixto.omittedItems).toBe(2);
    expect(mixto.skipped).toBeUndefined();
  });
});

describe('summarizeImport', () => {
  it('suma documentos y versiones de todos los archivos y deja aparte los omitidos y los reparados', () => {
    const resultados = [
      parseDteFile('v1.json', bytes(JSON.stringify(dte('01', 1)))),
      parseDteFile('v2a.json', bytes(JSON.stringify(dte('03', 4)))),
      parseDteFile('v2b.json', bytes(`${JSON.stringify([dte('01', 2), dte('01', 2)])}
{"sobrante":1}`)),
      parseDteFile('basura.json', bytes('no es json')),
    ];
    const s = summarizeImport(resultados);
    expect(s.totals).toEqual({ documents: 4, v1: 1, v2: 3, omittedItems: 0 });
    expect(s.records).toHaveLength(4);
    expect(s.files.map((f) => f.name)).toEqual(['v1.json', 'v2a.json', 'v2b.json']);
    expect(s.skipped.map((f) => f.name)).toEqual(['basura.json']);
    expect(s.repaired.map((f) => f.name)).toEqual(['v2b.json']);
  });

  it('sin archivos no hay documentos', () => {
    expect(summarizeImport([]).totals).toEqual({ documents: 0, v1: 0, v2: 0, omittedItems: 0 });
  });
});
