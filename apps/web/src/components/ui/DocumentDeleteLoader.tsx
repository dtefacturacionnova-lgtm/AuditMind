'use client';

import { useMemo } from 'react';
import { FileText, CheckCircle2, AlertTriangle } from 'lucide-react';

export type DocumentDeleteLoaderState = 'deleting' | 'success' | 'error';

export interface DocumentDeleteLoaderProps {
  /** Estado actual del proceso — controla qué icono/animación se muestra. */
  state: DocumentDeleteLoaderState;
  /** Mensaje breve opcional bajo el icono (ej. "Eliminando registros…"). */
  message?: string;
  /** Tamaño del icono en px — el contenedor total es ~1.8× esto. Default 64. */
  size?: number;
  className?: string;
}

const SHRED_SLICES = 7;

const TONE = {
  deleting: { ring: 'rgba(220,38,38,0.16)', icon: 'text-red-600', text: 'text-red-700' },
  success: { ring: 'rgba(5,150,105,0.16)', icon: 'text-emerald-600', text: 'text-emerald-700' },
  error: { ring: 'rgba(220,38,38,0.16)', icon: 'text-red-600', text: 'text-red-700' },
} as const;

/**
 * Loader para el borrado de un encargo — un `FileText` que se "desintegra"
 * en tiras (efecto shredder) mientras `state === 'deleting'`, y transiciona
 * a un check/alerta al resolver. Reemplaza el spinner circular genérico por
 * algo con relación temática real: lo que se borra son papeles de trabajo.
 *
 * Implementado en CSS puro (`@keyframes`/`transition`), sin librería de
 * animación — el cambio de `state` es una actualización de React normal
 * (montaje/desmontaje síncrono), nunca condicionada a que una animación
 * termine. Deliberado: una librería que gatea el desmontaje a la conclusión
 * de una animación (ej. `AnimatePresence`) depende de que el compositor del
 * navegador esté realmente pintando frames — si algo alguna vez interrumpe
 * eso (pestaña en background largo tiempo, entorno headless, etc.), el
 * estado visual del modal podría quedarse pegado aunque el borrado en sí ya
 * haya terminado. Con CSS puro, la corrección funcional (mostrar el
 * resultado) nunca depende de que la animación decorativa llegue a pintarse.
 */
export function DocumentDeleteLoader({ state, message, size = 64, className = '' }: DocumentDeleteLoaderProps) {
  const tone = TONE[state];
  const sliceWidth = size / SHRED_SLICES;
  const fallDistance = Math.round(size * 0.22);

  const slices = useMemo(() => Array.from({ length: SHRED_SLICES }, (_, i) => i), []);

  return (
    <div className={`flex flex-col items-center justify-center gap-3 ${className}`} role="status" aria-live="polite">
      <style>{`
        @keyframes dm-glow-pulse {
          0%, 100% { transform: scale(1); opacity: .5; }
          50% { transform: scale(1.18); opacity: .9; }
        }
        @keyframes dm-shred-fall {
          0%, 35% { transform: translateY(0); opacity: 1; }
          80% { transform: translateY(${fallDistance}px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        @keyframes dm-pop-in {
          0% { opacity: 0; transform: scale(.6); }
          70% { opacity: 1; transform: scale(1.08); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes dm-shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
      `}</style>

      <div className="relative flex items-center justify-center" style={{ width: size * 1.8, height: size * 1.8 }}>
        {/* Resplandor ambiental — sustituye el anillo giratorio genérico por un pulso suave de profundidad */}
        <div
          className="absolute rounded-full blur-xl transition-transform transition-opacity duration-500"
          style={{
            width: size * 1.6,
            height: size * 1.6,
            background: `radial-gradient(circle, ${tone.ring} 0%, transparent 70%)`,
            animation: state === 'deleting' ? 'dm-glow-pulse 1.8s ease-in-out infinite' : undefined,
            transform: state === 'deleting' ? undefined : 'scale(1.1)',
            opacity: state === 'deleting' ? undefined : 0.8,
          }}
        />

        {state === 'deleting' && (
          <div className="relative" style={{ width: size, height: size }}>
            {slices.map(i => (
              <div
                key={i}
                className="absolute top-0 overflow-hidden"
                style={{ left: i * sliceWidth, width: sliceWidth + 0.5, height: size }}
              >
                <div
                  style={{
                    position: 'absolute',
                    left: -i * sliceWidth,
                    top: 0,
                    animation: `dm-shred-fall 1.3s ease-in-out ${i * 0.055}s infinite`,
                  }}
                >
                  <FileText className={tone.icon} width={size} height={size} strokeWidth={1.75} />
                </div>
              </div>
            ))}
          </div>
        )}

        {state === 'success' && (
          <div style={{ animation: 'dm-pop-in 0.4s ease-out' }}>
            <CheckCircle2 className={tone.icon} width={size} height={size} strokeWidth={1.75} />
          </div>
        )}

        {state === 'error' && (
          <div style={{ animation: 'dm-pop-in 0.4s ease-out, dm-shake 0.4s ease-in-out 0.35s' }}>
            <AlertTriangle className={tone.icon} width={size} height={size} strokeWidth={1.75} />
          </div>
        )}
      </div>

      {message && <p className={`text-sm font-medium ${tone.text}`}>{message}</p>}
    </div>
  );
}
