'use client';

import { useEffect, useState } from 'react';
import { Download, ExternalLink, RefreshCw, ShieldCheck } from 'lucide-react';
import { sameHash, sha256Hex } from '@/lib/signature/helpers';
import { Alert, Spinner } from './ui';

export type Integrity = 'checking' | 'ok' | 'mismatch' | 'error';

/**
 * Muestra el PDF a firmar y COMPRUEBA en el navegador que es el que el servidor registró: pide los bytes a la API,
 * calcula su SHA-256 y lo compara con la huella que el servidor guardó al enviar el documento (docs/firma-externa-
 * por-enlace.md §3). Lo que se muestra es exactamente lo que se verificó (el mismo buffer).
 * Si no coinciden, o si no se pudo cargar, no se muestra nada y el padre bloquea la firma: nadie firma lo que no vio.
 */
export function PdfViewer({ load, expectedSha256, onIntegrity }: {
  load: () => Promise<ArrayBuffer>; expectedSha256: string; onIntegrity: (i: Integrity) => void;
}) {
  const [state, setState] = useState<{ phase: Integrity; blobUrl: string | null }>({ phase: 'checking', blobUrl: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;
    setState({ phase: 'checking', blobUrl: null });
    onIntegrity('checking');
    (async () => {
      try {
        const buf = await load();
        const actual = await sha256Hex(buf);
        if (cancelled) return;
        if (!sameHash(actual, expectedSha256)) {
          setState({ phase: 'mismatch', blobUrl: null });
          onIntegrity('mismatch');
          return;
        }
        created = URL.createObjectURL(new Blob([buf], { type: 'application/pdf' }));
        setState({ phase: 'ok', blobUrl: created });
        onIntegrity('ok');
      } catch {
        if (cancelled) return;
        setState({ phase: 'error', blobUrl: null });
        onIntegrity('error');
      }
    })();
    return () => { cancelled = true; if (created) URL.revokeObjectURL(created); };
    // `load` cambia en cada render del padre: el documento se vuelve a pedir solo al reintentar o si cambia la huella.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expectedSha256, attempt]);

  if (state.phase === 'checking') return <Spinner label="Cargando el documento y verificando su huella…" />;

  if (state.phase === 'mismatch') {
    return (
      <Alert tone="red">
        <p className="font-semibold">El documento no coincide con el que se envió.</p>
        <p className="mt-1">Por seguridad no se muestra ni se puede firmar. Avisa a quien te lo envió y pídele un enlace nuevo.</p>
      </Alert>
    );
  }

  if (state.phase === 'error' || !state.blobUrl) {
    return (
      <Alert tone="amber">
        <p className="font-semibold">No pudimos cargar el documento.</p>
        <p className="mt-1">Revisa tu conexión y vuelve a intentarlo. No podrás firmar hasta verlo.</p>
        <button type="button" onClick={() => setAttempt((n) => n + 1)} className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-amber-900 underline underline-offset-2 hover:no-underline">
          <RefreshCw className="h-4 w-4" aria-hidden="true" /> Reintentar
        </button>
      </Alert>
    );
  }

  const src = state.blobUrl;
  return (
    <div>
      <div className="overflow-hidden rounded-xl border border-gray-300 bg-gray-100">
        <iframe src={src} title="Documento a firmar (PDF)" className="block h-[65vh] min-h-[420px] w-full bg-white" />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <a href={src} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-medium text-blue-700 hover:underline">
          <ExternalLink className="h-4 w-4" aria-hidden="true" /> Abrir en una pestaña nueva
        </a>
        <a href={src} download="documento.pdf" className="inline-flex items-center gap-1.5 font-medium text-blue-700 hover:underline">
          <Download className="h-4 w-4" aria-hidden="true" /> Descargar PDF
        </a>
        <span className="text-xs text-gray-500 sm:ml-auto">En el teléfono, si no ves todas las páginas aquí, ábrelo en una pestaña nueva.</span>
      </div>

      <div className="mt-3 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-900">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
        <div className="min-w-0">
          <p className="font-semibold">Huella verificada en tu navegador</p>
          <p className="mt-0.5 break-all font-mono text-[11px] text-emerald-800">SHA-256: {expectedSha256}</p>
        </div>
      </div>
    </div>
  );
}
