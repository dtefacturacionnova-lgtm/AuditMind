import { captureFragmentToken, type FragmentWindow } from './fragment-token';

const TOKEN = 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8s9T0u1V'; // 43 caracteres base64url

function fakeWindow(hash: string, search = '') {
  const calls: Array<{ url?: string | null }> = [];
  const timers: Array<() => void> = [];
  const win: FragmentWindow = {
    location: { hash, pathname: '/portal', search },
    history: { replaceState: (_d, _u, url) => { calls.push({ url }); } },
    setTimeout: (fn) => { timers.push(fn); return 0; },
  };
  return { win, calls, runTimers: () => timers.splice(0).forEach((t) => t()) };
}

describe('token en el fragmento de la URL', () => {
  it('TOKEN de prueba tiene el largo esperado', () => {
    expect(TOKEN).toHaveLength(43);
  });

  it('lo devuelve y borra el fragmento DOS veces: al instante y después del efecto del router de Next', () => {
    const { win, calls, runTimers } = fakeWindow(`#${TOKEN}`);
    expect(captureFragmentToken(win)).toEqual({ kind: 'ok', token: TOKEN });
    expect(calls).toEqual([{ url: '/portal' }]); // inmediato
    runTimers();
    expect(calls).toEqual([{ url: '/portal' }, { url: '/portal' }]); // y otra vez después
  });

  it('conserva la query al limpiar la URL, pero nunca el fragmento', () => {
    const { win, calls, runTimers } = fakeWindow(`#${TOKEN}`, '?idioma=es');
    captureFragmentToken(win);
    runTimers();
    expect(calls.every((c) => c.url === '/portal?idioma=es')).toBe(true);
  });

  it('sin fragmento: "missing" y no toca el historial', () => {
    const { win, calls, runTimers } = fakeWindow('');
    expect(captureFragmentToken(win)).toEqual({ kind: 'missing' });
    expect(captureFragmentToken(fakeWindow('#').win)).toEqual({ kind: 'missing' });
    runTimers();
    expect(calls).toEqual([]);
  });

  it('un fragmento que no es un token (corto, largo o con caracteres raros) es "malformed", y también se borra de la URL', () => {
    for (const bad of ['corto', `${TOKEN}x`, `${TOKEN.slice(0, 42)}!`, `${TOKEN.slice(0, 42)}=`, 'ABC DEF']) {
      const { win, calls } = fakeWindow(`#${bad}`);
      expect(captureFragmentToken(win)).toEqual({ kind: 'malformed' });
      expect(calls).toEqual([{ url: '/portal' }]);
    }
  });
});
