'use client';

import { useMemo } from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
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

const glowVariants: Variants = {
  deleting: { scale: [1, 1.18, 1], opacity: [0.5, 0.9, 0.5], transition: { duration: 1.8, repeat: Infinity, ease: 'easeInOut' } },
  success: { scale: 1.1, opacity: 0.8, transition: { duration: 0.4, ease: 'easeOut' } },
  error: { scale: 1.1, opacity: 0.8, transition: { duration: 0.4, ease: 'easeOut' } },
};

/**
 * Loader para el borrado de un encargo — un `FileText` que se "desintegra"
 * en tiras (efecto shredder) mientras `state === 'deleting'`, y transiciona
 * a un check/alerta al resolver. Reemplaza el spinner circular genérico por
 * algo con relación temática real: lo que se borra son papeles de trabajo.
 *
 * Ver ejemplo de uso al final de este archivo (`DocumentDeleteLoaderDemo`).
 */
export function DocumentDeleteLoader({ state, message, size = 64, className = '' }: DocumentDeleteLoaderProps) {
  const tone = TONE[state];
  const sliceWidth = size / SHRED_SLICES;

  const slices = useMemo(() => Array.from({ length: SHRED_SLICES }, (_, i) => i), []);

  return (
    <div className={`flex flex-col items-center justify-center gap-3 ${className}`} role="status" aria-live="polite">
      <div className="relative flex items-center justify-center" style={{ width: size * 1.8, height: size * 1.8 }}>
        {/* Resplandor ambiental — sustituye el anillo giratorio genérico por un pulso suave de profundidad */}
        <motion.div
          className="absolute rounded-full blur-xl"
          style={{ width: size * 1.6, height: size * 1.6, background: `radial-gradient(circle, ${tone.ring} 0%, transparent 70%)` }}
          animate={state}
          variants={glowVariants}
        />

        <AnimatePresence mode="wait" initial={false}>
          {state === 'deleting' && (
            <motion.div
              key="shredding"
              className="relative"
              style={{ width: size, height: size }}
              exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.2 } }}
            >
              {slices.map(i => (
                <div
                  key={i}
                  className="absolute top-0 overflow-hidden"
                  style={{ left: i * sliceWidth, width: sliceWidth + 0.5, height: size }}
                >
                  <motion.div
                    style={{ position: 'absolute', left: -i * sliceWidth, top: 0 }}
                    animate={{
                      y: [0, 0, size * 0.22, 0],
                      opacity: [1, 1, 0, 1],
                    }}
                    transition={{
                      duration: 1.3,
                      repeat: Infinity,
                      ease: 'easeInOut',
                      delay: i * 0.055,
                      times: [0, 0.35, 0.8, 1],
                    }}
                  >
                    <FileText className={tone.icon} width={size} height={size} strokeWidth={1.75} />
                  </motion.div>
                </div>
              ))}
            </motion.div>
          )}

          {state === 'success' && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 18 }}
            >
              <CheckCircle2 className={tone.icon} width={size} height={size} strokeWidth={1.75} />
            </motion.div>
          )}

          {state === 'error' && (
            <motion.div
              key="error"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1, x: [0, -6, 6, -4, 4, 0] }}
              transition={{ opacity: { duration: 0.25 }, scale: { type: 'spring', stiffness: 300, damping: 18 }, x: { duration: 0.4, delay: 0.1 } }}
            >
              <AlertTriangle className={tone.icon} width={size} height={size} strokeWidth={1.75} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {message && (
        <motion.p
          key={message}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className={`text-sm font-medium ${tone.text}`}
        >
          {message}
        </motion.p>
      )}
    </div>
  );
}
