'use client';

import { AlertTriangle } from 'lucide-react';

/**
 * Pantalla de error de las páginas públicas (`error.tsx` de /firmar, /verificar y /portal): un fallo inesperado del
 * navegador no debe dejar al tercero ante «Application error». No muestra el detalle del error ni ningún dato del enlace.
 */
export function PublicError({ reset }: { reset: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50 px-4 text-center" role="alert">
      <AlertTriangle className="h-12 w-12 text-amber-300" aria-hidden="true" />
      <h1 className="text-lg font-semibold text-gray-700">Algo salió mal al mostrar esta página</h1>
      <p className="max-w-sm text-sm text-gray-500">
        Vuelve a intentarlo. Si el problema sigue, abre de nuevo el enlace completo que te enviaron.
      </p>
      <button type="button" onClick={reset} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
        Reintentar
      </button>
    </div>
  );
}
