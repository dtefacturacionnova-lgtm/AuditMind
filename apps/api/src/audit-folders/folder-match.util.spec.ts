import { resolveFolderId } from './folder-match.util';

const byRef = new Map([['A', 'fA'], ['B', 'fB'], ['B-DDC', 'fBDDC']]);

describe('resolveFolderId', () => {
  it('coincidencia exacta con el ref de una carpeta', () => {
    expect(resolveFolderId('B', byRef)).toBe('fB');
    expect(resolveFolderId('B-DDC', byRef)).toBe('fBDDC'); // la subcarpeta exacta gana a la raíz
  });
  it('sin carpeta exacta, la raíz de la sección', () => {
    expect(resolveFolderId('B-OTRA', byRef)).toBe('fB');
    expect(resolveFolderId('A-1-2', byRef)).toBe('fA');
  });
  it('sin coincidencia o sin sección: null (queda en «Sin carpeta»)', () => {
    expect(resolveFolderId('Z', byRef)).toBeNull();
    expect(resolveFolderId('Z-9', byRef)).toBeNull();
    for (const empty of ['', '  ', null, undefined]) expect(resolveFolderId(empty, byRef)).toBeNull();
  });
  it('no confunde un prefijo parcial con la raíz', () => {
    expect(resolveFolderId('BB', byRef)).toBeNull();
  });
});
