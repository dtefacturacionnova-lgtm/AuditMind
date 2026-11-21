import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

/**
 * Cliente de IA compartido por los servicios del API que generan texto (2026-11-21): OpenRouter primero, Gemini de respaldo.
 *
 * Antes cada servicio (papeles, calidad, consolidación, aprendizaje cruzado, propuestas, procedimientos, chat de respaldo) llamaba a Gemini por su cuenta
 * con la clave gratuita de AI Studio: al agotarse la cuota (429) todos fallaban a la vez. Ahora el orden es OpenRouter (con saldo) → Gemini, igual que en
 * el ai-service (apps/ai-service/app/services/llm_router.py). Un proveedor sin clave se salta; si todos fallan se lanza LlmUnavailableError con el motivo
 * de cada uno (sin claves) y cada servicio decide su plan B (plantilla, reglas, etc.).
 */

export interface LlmMessage { role: 'user' | 'assistant'; content: string }

export interface LlmRequest {
  system?: string;
  messages: LlmMessage[];
  temperature: number;
  maxTokens: number;
  /** La respuesta debe ser JSON. Se pide en el prompt y se quitan las vallas ```json que algunos modelos agregan. */
  json?: boolean;
  /** Tiempo máximo por intento (ms). OpenRouter usa como mínimo 60 s: un modelo de Claude con salidas largas tarda más que Gemini Flash. */
  timeoutMs?: number;
}

export class LlmUnavailableError extends Error {
  constructor(message: string) { super(message); this.name = 'LlmUnavailableError'; }
}

type ConfigReader = Pick<ConfigService, 'get'>;

const OPENROUTER_DEFAULT_URL = 'https://openrouter.ai/api/v1';
// Elegido por benchmark real el 2026-11-21 (ver los comentarios de OPENROUTER_MODEL_* en apps/ai-service/app/config.py): el más barato que respondió bien en todo.
const OPENROUTER_DEFAULT_MODEL = 'openai/gpt-6-luna';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const JSON_ONLY = 'Responde ÚNICAMENTE con JSON válido, sin texto adicional ni bloques markdown.';

const logger = new Logger('LlmClient');

const readKey = (config: ConfigReader, name: string): string => (config.get<string>(name, '') ?? '').trim();

/** ¿Hay algún proveedor con clave? Los servicios lo usan para decidir entre llamar a la IA o ir directo a su plan B. */
export function isLlmConfigured(config: ConfigReader): boolean {
  return !!(readKey(config, 'OPENROUTER_API_KEY') || readKey(config, 'GEMINI_API_KEY'));
}

/** Quita la valla ```json … ``` que Claude suele poner aunque se le pida solo JSON. */
export function stripJsonFences(text: string): string {
  const m = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (m ? m[1] : text).trim();
}

const brief = (err: unknown): string => String(err instanceof Error ? err.message : err).replace(/\s+/g, ' ').slice(0, 300);

async function viaOpenRouter(config: ConfigReader, req: LlmRequest): Promise<string> {
  const apiKey = readKey(config, 'OPENROUTER_API_KEY');
  const model = readKey(config, 'OPENROUTER_MODEL_STANDARD') || OPENROUTER_DEFAULT_MODEL;
  const base = (readKey(config, 'OPENROUTER_BASE_URL') || OPENROUTER_DEFAULT_URL).replace(/\/+$/, '');
  const system = [req.system, req.json ? JSON_ONLY : ''].filter(Boolean).join('\n\n');
  // Sonnet 5.5 y Opus 5.5 razonan siempre y ese razonamiento cuenta contra max_tokens: sin un esfuerzo explícito, un límite chico
  // se gasta pensando y la respuesta llega vacía (visto en producción 2026-11-21). «low» lo reduce al mínimo; «off» no envía nada.
  const effort = (readKey(config, 'OPENROUTER_REASONING_EFFORT') || 'low').toLowerCase();
  // Privacidad: solo proveedores que no guardan ni entrenan con los datos (papeles con información de clientes). «allow»/«off» no lo envía.
  const dataCollection = (readKey(config, 'OPENROUTER_DATA_COLLECTION') || 'deny').toLowerCase();
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': readKey(config, 'OPENROUTER_REFERER') || 'https://auditoria.ianovatechsystems.com',
      'X-Title': 'AuditMind',
    },
    body: JSON.stringify({
      model,
      max_tokens: req.maxTokens,
      temperature: req.temperature,
      messages: [...(system ? [{ role: 'system', content: system }] : []), ...req.messages],
      ...(effort === 'off' ? {} : { reasoning: { effort } }),
      ...(dataCollection === 'deny' ? { provider: { data_collection: 'deny' } } : {}),
    }),
    signal: AbortSignal.timeout(Math.max(req.timeoutMs ?? 45_000, 60_000)),
  });
  const data = (await res.json().catch(() => ({}))) as {
    choices?: Array<{ finish_reason?: string; message?: { content?: string | Array<{ text?: string }> } }>;
    error?: { message?: string } | string;
  };
  if (!res.ok || data.error) {
    const detail = typeof data.error === 'string' ? data.error : data.error?.message ?? '';
    throw new Error(`HTTP ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  const content = data.choices?.[0]?.message?.content;
  const text = (Array.isArray(content) ? content.map(p => p.text ?? '').join('') : content ?? '').trim();
  if (!text) throw new Error(`respuesta vacía (finish_reason=${data.choices?.[0]?.finish_reason}; con «length» el razonamiento agotó max_tokens)`);
  return text;
}

async function viaGemini(config: ConfigReader, req: LlmRequest): Promise<string> {
  const apiKey = readKey(config, 'GEMINI_API_KEY');
  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    // La clave va en cabecera, no en la URL: así no aparece en registros ni en mensajes de error.
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      ...(req.system ? { systemInstruction: { parts: [{ text: req.system }] } } : {}),
      contents: req.messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      generationConfig: {
        temperature: req.temperature,
        maxOutputTokens: req.maxTokens,
        ...(req.json ? { responseMimeType: 'application/json' } : {}),
      },
    }),
    signal: AbortSignal.timeout(req.timeoutMs ?? 45_000),
  });
  const data = (await res.json().catch(() => ({}))) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    error?: { message?: string };
  };
  if (!res.ok || data.error) throw new Error(`HTTP ${res.status}${data.error?.message ? `: ${data.error.message}` : ''}`);
  const text = (data.candidates?.[0]?.content?.parts ?? []).map(p => p.text ?? '').join('').trim();
  if (!text) throw new Error('respuesta vacía');
  return text;
}

/**
 * Genera texto con el primer proveedor que responda (OpenRouter → Gemini). Devuelve el texto recortado; con `json: true`, sin vallas markdown.
 * Lanza LlmUnavailableError si ninguno está configurado o todos fallan.
 */
export async function generateText(config: ConfigReader, req: LlmRequest): Promise<string> {
  const attempts: Array<[string, boolean, (c: ConfigReader, r: LlmRequest) => Promise<string>]> = [
    ['openrouter', !!readKey(config, 'OPENROUTER_API_KEY'), viaOpenRouter],
    ['gemini', !!readKey(config, 'GEMINI_API_KEY'), viaGemini],
  ];
  const failures: string[] = [];
  for (const [name, configured, run] of attempts) {
    if (!configured) continue;
    try {
      const text = await run(config, req);
      return req.json ? stripJsonFences(text) : text;
    } catch (err) {
      failures.push(`${name}: ${brief(err)}`);
      logger.warn(`${name} falló (${brief(err)}) — probando el siguiente proveedor`);
    }
  }
  throw new LlmUnavailableError(failures.length ? `Ningún proveedor de IA respondió — ${failures.join(' | ')}` : 'Ningún proveedor de IA está configurado');
}
