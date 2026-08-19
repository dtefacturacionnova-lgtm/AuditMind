'use client';

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

interface ContextualHelpContextValue {
  activePaperCode: string | null;
  setActivePaperCode: (code: string | null) => void;
}

const ContextualHelpContext = createContext<ContextualHelpContextValue | undefined>(undefined);

export function ContextualHelpProvider({ children }: { children: ReactNode }) {
  const [activePaperCode, setActivePaperCode] = useState<string | null>(null);
  return (
    <ContextualHelpContext.Provider value={{ activePaperCode, setActivePaperCode }}>
      {children}
    </ContextualHelpContext.Provider>
  );
}

function useContextualHelpContext(): ContextualHelpContextValue {
  const ctx = useContext(ContextualHelpContext);
  if (!ctx) {
    throw new Error('useContextualHelpContext debe usarse dentro de un <ContextualHelpProvider>');
  }
  return ctx;
}

/** Lee el paperCode activo para el widget flotante de ayuda. */
export function useActivePaperCode(): string | null {
  return useContextualHelpContext().activePaperCode;
}

/** Registra el paperCode de la pantalla actual como contexto para el widget
 *  de ayuda flotante (le da prioridad sobre la ayuda genérica por ruta, ya
 *  que todos los papeles de trabajo comparten la misma ruta dinámica).
 *  Se limpia automáticamente al desmontar o cuando el código cambia. */
export function useSetPaperHelpContext(paperCode: string | null | undefined) {
  const { setActivePaperCode } = useContextualHelpContext();
  useEffect(() => {
    setActivePaperCode(paperCode ?? null);
    return () => setActivePaperCode(null);
  }, [paperCode, setActivePaperCode]);
}
