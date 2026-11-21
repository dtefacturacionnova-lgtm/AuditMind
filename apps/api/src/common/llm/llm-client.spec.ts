/* eslint-disable @typescript-eslint/no-explicit-any */
import { LlmUnavailableError, generateText, isLlmConfigured, stripJsonFences } from './llm-client';

const CLAVE_OR = 'sk-or-v1-CLAVE-DE-PRUEBA-no-es-real';
const CLAVE_GEM = 'AIza-CLAVE-DE-PRUEBA-no-es-real';

const cfg = (env: Record<string, string> = {}) => ({ get: (k: string, d?: unknown) => (env[k] !== undefined ? env[k] : d) }) as any;
const json = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
const orOk = (text: string) => json(200, { choices: [{ message: { content: text } }] });
const gemOk = (text: string) => json(200, { candidates: [{ content: { parts: [{ text }] } }] });
const REQ = { messages: [{ role: 'user' as const, content: 'hola' }], temperature: 0.3, maxTokens: 500 };

let fetchMock: jest.SpyInstance;
beforeEach(() => { fetchMock = jest.spyOn(global, 'fetch'); });
afterEach(() => { fetchMock.mockRestore(); });

const llamada = (i: number) => {
  const [url, init] = fetchMock.mock.calls[i] as [string, RequestInit];
  return { url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) };
};

describe('isLlmConfigured', () => {
  it('es verdadero con la clave de cualquiera de los dos proveedores y falso sin ninguna', () => {
    expect(isLlmConfigured(cfg({ OPENROUTER_API_KEY: CLAVE_OR }))).toBe(true);
    expect(isLlmConfigured(cfg({ GEMINI_API_KEY: CLAVE_GEM }))).toBe(true);
    expect(isLlmConfigured(cfg({ OPENROUTER_API_KEY: '  ', GEMINI_API_KEY: '' }))).toBe(false);
    expect(isLlmConfigured(cfg())).toBe(false);
  });
});

describe('stripJsonFences', () => {
  it('quita la valla ```json y deja el JSON limpio; sin valla no toca nada', () => {
    expect(stripJsonFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(stripJsonFences('```\n[1,2]\n```')).toBe('[1,2]');
    expect(stripJsonFences('  {"a":1}  ')).toBe('{"a":1}');
  });
});

describe('generateText — OpenRouter primero', () => {
  it('responde con OpenRouter, con la clave en Authorization, el modelo por defecto y el system antes de la conversación', async () => {
    fetchMock.mockImplementation(() => orOk('  Respuesta de OpenRouter  '));
    const out = await generateText(cfg({ OPENROUTER_API_KEY: CLAVE_OR, GEMINI_API_KEY: CLAVE_GEM }), { ...REQ, system: 'SISTEMA', messages: [
      { role: 'user', content: 'uno' }, { role: 'assistant', content: 'dos' }, { role: 'user', content: 'tres' }] });
    expect(out).toBe('Respuesta de OpenRouter');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const c = llamada(0);
    expect(c.url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(c.headers.Authorization).toBe(`Bearer ${CLAVE_OR}`);
    expect(c.body.model).toBe('openai/gpt-6-luna'); // el modelo barato elegido por benchmark
    expect(c.body.max_tokens).toBe(500);
    expect(c.body.temperature).toBe(0.3);
    expect(c.body.messages.map((m: any) => [m.role, m.content])).toEqual([['system', 'SISTEMA'], ['user', 'uno'], ['assistant', 'dos'], ['user', 'tres']]);
  });

  it('pide solo proveedores que no guardan ni entrenan con los datos; «allow» u «off» no envían la preferencia', async () => {
    fetchMock.mockImplementation(() => orOk('ok'));
    await generateText(cfg({ OPENROUTER_API_KEY: CLAVE_OR }), REQ);
    expect(llamada(0).body.provider).toEqual({ data_collection: 'deny' });
    await generateText(cfg({ OPENROUTER_API_KEY: CLAVE_OR, OPENROUTER_DATA_COLLECTION: 'DENY' }), REQ);
    expect(llamada(1).body.provider).toEqual({ data_collection: 'deny' });
    for (const valor of ['allow', 'off']) {
      fetchMock.mockClear();
      await generateText(cfg({ OPENROUTER_API_KEY: CLAVE_OR, OPENROUTER_DATA_COLLECTION: valor }), REQ);
      expect(llamada(0).body).not.toHaveProperty('provider');
    }
  });

  it('el modelo se cambia con OPENROUTER_MODEL_STANDARD', async () => {
    fetchMock.mockImplementation(() => orOk('ok'));
    await generateText(cfg({ OPENROUTER_API_KEY: CLAVE_OR, OPENROUTER_MODEL_STANDARD: 'google/gemini-2.5-flash' }), REQ);
    expect(llamada(0).body.model).toBe('google/gemini-2.5-flash');
  });

  it('pide razonamiento mínimo (Sonnet/Opus razonan siempre y se comen max_tokens); se cambia con OPENROUTER_REASONING_EFFORT y «off» lo omite', async () => {
    fetchMock.mockImplementation(() => orOk('ok'));
    await generateText(cfg({ OPENROUTER_API_KEY: CLAVE_OR }), REQ);
    expect(llamada(0).body.reasoning).toEqual({ effort: 'low' });
    await generateText(cfg({ OPENROUTER_API_KEY: CLAVE_OR, OPENROUTER_REASONING_EFFORT: 'High' }), REQ);
    expect(llamada(1).body.reasoning).toEqual({ effort: 'high' });
    await generateText(cfg({ OPENROUTER_API_KEY: CLAVE_OR, OPENROUTER_REASONING_EFFORT: 'off' }), REQ);
    expect(llamada(2).body).not.toHaveProperty('reasoning');
  });

  it('contenido nulo porque el razonamiento agotó max_tokens (caso real de producción) → pasa a Gemini y el motivo queda claro', async () => {
    const vacio = () => json(200, { choices: [{ message: { content: null, reasoning: 'pensando...' }, finish_reason: 'length' }] });
    fetchMock.mockImplementationOnce(vacio).mockImplementationOnce(() => gemOk('desde Gemini'));
    expect(await generateText(cfg({ OPENROUTER_API_KEY: CLAVE_OR, GEMINI_API_KEY: CLAVE_GEM }), REQ)).toBe('desde Gemini');
    fetchMock.mockReset();
    fetchMock.mockImplementationOnce(vacio).mockImplementationOnce(() => json(429, {}));
    const err: any = await generateText(cfg({ OPENROUTER_API_KEY: CLAVE_OR, GEMINI_API_KEY: CLAVE_GEM }), REQ).catch(e => e);
    expect(err.message).toContain('respuesta vacía (finish_reason=length');
  });

  it('con json pide solo JSON en el system y entrega el texto sin vallas', async () => {
    fetchMock.mockImplementation(() => orOk('```json\n[{"a":1}]\n```'));
    const out = await generateText(cfg({ OPENROUTER_API_KEY: CLAVE_OR }), { ...REQ, json: true });
    expect(out).toBe('[{"a":1}]');
    expect(llamada(0).body.messages[0]).toEqual({ role: 'system', content: expect.stringContaining('JSON válido') });
    expect(llamada(0).body).not.toHaveProperty('response_format'); // un array no es un «json_object»: se pide por prompt
  });

  it('sin saldo (402), límite (429), error 5xx, error dentro de un 200 o respuesta vacía → pasa a Gemini', async () => {
    const fallos = [() => json(402, { error: { message: 'Insufficient credits' } }), () => json(429, {}), () => json(503, {}),
      () => json(200, { error: { message: 'Provider returned error' } }), () => orOk('   '), () => json(200, { choices: [] })];
    for (const fallo of fallos) {
      fetchMock.mockReset();
      fetchMock.mockImplementationOnce(fallo).mockImplementationOnce(() => gemOk('desde Gemini'));
      expect(await generateText(cfg({ OPENROUTER_API_KEY: CLAVE_OR, GEMINI_API_KEY: CLAVE_GEM }), REQ)).toBe('desde Gemini');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    }
  });

  it('un error de red de OpenRouter también pasa a Gemini', async () => {
    fetchMock.mockImplementationOnce(() => Promise.reject(new TypeError('fetch failed'))).mockImplementationOnce(() => gemOk('desde Gemini'));
    expect(await generateText(cfg({ OPENROUTER_API_KEY: CLAVE_OR, GEMINI_API_KEY: CLAVE_GEM }), REQ)).toBe('desde Gemini');
  });
});

describe('generateText — Gemini de respaldo', () => {
  it('sin clave de OpenRouter va directo a Gemini, con la clave en cabecera (nunca en la URL) y el formato propio de Gemini', async () => {
    fetchMock.mockImplementation(() => gemOk('Hola desde Gemini'));
    const out = await generateText(cfg({ GEMINI_API_KEY: CLAVE_GEM }), { ...REQ, system: 'SISTEMA', json: true, messages: [
      { role: 'user', content: 'uno' }, { role: 'assistant', content: 'dos' }] });
    expect(out).toBe('Hola desde Gemini');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const c = llamada(0);
    expect(c.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
    expect(c.url).not.toContain(CLAVE_GEM);
    expect(c.headers['x-goog-api-key']).toBe(CLAVE_GEM);
    expect(c.body.systemInstruction).toEqual({ parts: [{ text: 'SISTEMA' }] });
    expect(c.body.contents).toEqual([{ role: 'user', parts: [{ text: 'uno' }] }, { role: 'model', parts: [{ text: 'dos' }] }]);
    expect(c.body.generationConfig).toEqual({ temperature: 0.3, maxOutputTokens: 500, responseMimeType: 'application/json' });
  });

  it('une las partes de la respuesta y quita las vallas en modo JSON', async () => {
    fetchMock.mockImplementation(() => json(200, { candidates: [{ content: { parts: [{ text: '```json\n{"a"' }, { text: ':1}\n```' }] } }] }));
    expect(await generateText(cfg({ GEMINI_API_KEY: CLAVE_GEM }), { ...REQ, json: true })).toBe('{"a":1}');
  });
});

describe('generateText — todos fallan', () => {
  it('lanza LlmUnavailableError con el motivo de cada proveedor y sin exponer ninguna clave', async () => {
    fetchMock.mockImplementationOnce(() => json(402, { error: { message: 'Insufficient credits' } }))
      .mockImplementationOnce(() => json(429, { error: { message: 'RESOURCE_EXHAUSTED' } }));
    const err: any = await generateText(cfg({ OPENROUTER_API_KEY: CLAVE_OR, GEMINI_API_KEY: CLAVE_GEM }), REQ).catch(e => e);
    expect(err).toBeInstanceOf(LlmUnavailableError);
    expect(err.message).toContain('openrouter: HTTP 402: Insufficient credits');
    expect(err.message).toContain('gemini: HTTP 429: RESOURCE_EXHAUSTED');
    expect(err.message).not.toContain(CLAVE_OR);
    expect(err.message).not.toContain(CLAVE_GEM);
  });

  it('sin ningún proveedor configurado lanza un error claro y no hace ninguna petición', async () => {
    const err: any = await generateText(cfg(), REQ).catch(e => e);
    expect(err).toBeInstanceOf(LlmUnavailableError);
    expect(err.message).toContain('configurado');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
