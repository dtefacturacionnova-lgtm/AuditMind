import { decodeDteBytes, parseDteJson } from './dte-json';

const enc = (s: string) => new TextEncoder().encode(s);

describe('parseDteJson', () => {
  it('un JSON limpio no necesita reparación', () => {
    expect(parseDteJson('{"a":1}')).toEqual({ value: { a: 1 }, repairs: [] });
  });

  it('quita el BOM del inicio', () => {
    const r = parseDteJson('﻿{"a":1}');
    expect(r.value).toEqual({ a: 1 });
    expect(r.repairs).toEqual(['BOM inicial']);
  });

  it('descarta el texto sobrante después del primer documento', () => {
    const r = parseDteJson('{"a":1}\n{"b":2}');
    expect(r.value).toEqual({ a: 1 });
    expect(r.repairs[0]).toMatch(/texto sobrante después del JSON/);
  });

  it('un objeto sin nombre (respuesta del MH pegada en el documento) se guarda como responseMH', () => {
    const r = parseDteJson('{"identificacion":{"tipoDte":"01"},{"estado":"PROCESADO","selloRecibido":"ABC"}}');
    expect((r.value as any).responseMH).toEqual({ estado: 'PROCESADO', selloRecibido: 'ABC' });
    expect(r.repairs[0]).toMatch(/objeto sin nombre/);
  });

  it('un JSON de verdad inválido sigue fallando', () => {
    expect(() => parseDteJson('{"a":')).toThrow();
    expect(() => parseDteJson('no es json')).toThrow();
  });
});

describe('decodeDteBytes', () => {
  it('UTF-8 válido se lee tal cual', () => {
    expect(decodeDteBytes(enc('SALVADOREÑO'))).toEqual({ text: 'SALVADOREÑO', latin1: false });
  });

  it('un archivo Latin-1 (la «Ñ» es el byte 0xD1) se lee como Latin-1 y no se llena de «�»', () => {
    const bytes = new Uint8Array([...enc('SALVADORE'), 0xd1, ...enc('O')]);
    const r = decodeDteBytes(bytes);
    expect(r.latin1).toBe(true);
    expect(r.text).toBe('SALVADOREÑO');
  });

  it('el BOM de UTF-8 no impide leerlo', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...enc('{"a":1}')]);
    const { text } = decodeDteBytes(bytes);
    expect(parseDteJson(text).value).toEqual({ a: 1 });
  });
});
