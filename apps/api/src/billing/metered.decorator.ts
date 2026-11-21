import { MeterOptions, UsageService } from './usage.service';

type Args = unknown[];

export interface MeteredOptions {
  /** Asistente o función que gasta (para el desglose «por asistente»); puede salir de los argumentos. */
  agent: string | ((args: Args) => string);
  /** Peticiones que cuenta la acción (1 = ligera, 5 = documento/informe, 10 = audio/video o forense); puede depender de los argumentos. */
  weight: number | ((args: Args) => number);
  tokens?: MeterOptions<unknown>['tokens'];
}

/**
 * Marca un método de servicio como acción de IA medida: antes verifica que queden peticiones (402 LIMITE_IA en ENFORCE) y después registra el consumo
 * con su peso. La clase debe tener una propiedad `usage?: UsageService` (opcional: sin ella —pruebas que construyen el servicio a mano— el método
 * corre sin medir). Quién consume (organización y usuario) sale del contexto de la petición.
 */
export function Metered(opts: MeteredOptions): MethodDecorator {
  return (_target, _key, descriptor) => {
    const original = descriptor.value as unknown as (...a: Args) => Promise<unknown>;
    (descriptor as { value: unknown }).value = function (this: { usage?: UsageService }, ...args: Args) {
      const usage = this.usage;
      if (!usage) return original.apply(this, args);
      const agent = typeof opts.agent === 'function' ? opts.agent(args) : opts.agent;
      const weight = typeof opts.weight === 'function' ? opts.weight(args) : opts.weight;
      return usage.meter({ agent, weight, tokens: opts.tokens }, () => original.apply(this, args));
    };
    return descriptor;
  };
}

/** Peso de un audio o video: 10 peticiones por cada 10 minutos, estimando los minutos por el tamaño del archivo (MB por minuto típicos). */
export function mediaWeight(bytes: number, mimeType: string, kind: 'audio' | 'video'): number {
  const mbPerMinute = kind === 'video' ? 20 : /wav|aiff|flac/i.test(mimeType) ? 10 : 1;
  const minutes = bytes / (mbPerMinute * 1_000_000);
  return Math.min(200, 10 * Math.max(1, Math.ceil(minutes / 10)));
}
