'use client';

import { useEffect, useState } from 'react';
import { Download, ExternalLink, ShieldAlert, ShieldCheck } from 'lucide-react';
import { sameHash, sha256Hex } from '@/lib/signature/helpers';
import { Alert, Spinner } from './ui';

export type Integrity = 'checking' | 'ok' | 'mismatch' | 'unverified';

/**
 * Muestra el PDF a firmar y COMPRUEBA en el navegador que es el que el servidor registró: baja el archivo,
 * calcula su SHA-256 y lo compara con la huella que el servidor guardó al enviar el documento (docs/firma-externa-
 * por-enlace.md §3). Si no coinciden, el padre bloquea la firma. Si el navegador no puede bajarlo (red, CORS),
 * se muestra directo desde Storage con un aviso: el servidor repite la verificación al firmar.
 */
export function PdfViewer({ pdfUrl, expectedSha256, onIntegrity }: {
  pdfUrl: string; expectedSha256: string; onIntegrity: (i: Integrity) => void;
}) {
  const [state, setState] = useState<{ phase: Integrity; blobUrl: string | null; actual: string | null }>({ phase: 'checking', blobUrl: null, actual: null });

  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;
    (async () => {
      try {
        const res = await fetch(pdfUrl, { credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        const actual = await sha256Hex(buf);
        if (cancelled) return;
        if (!sameHash(actual, expectedSha256)) {
          setState({ phase: 'mismatch', blobUrl: null, actual });
          onIntegrity('mismatch');
          return;
        }
        created = URL.createObjectURL(new Blob([buf], { type: 'application/pdf' }));
        setState({ phase: 'ok', blobUrl: created, actual });
        onIntegrity('ok');
      } catch {
        if (cancelled) return;
        setState({ phase: 'unverified', blobUrl: null, actual: null });
        onIntegrity('unverified');
      }
    })();
    return () => { cancelled = true; if (created) URL.revokeObjectURL(created); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfUrl, expectedSha256]);

  if (state.phase === 'checking') return <Spinner label="Cargando el documento y verificando su huella…" />;

  if (state.phase === 'mismatch') {
    return (
      <Alert tone="red">
        <p className="font-semibold">El documento no coincide con el que se envió.</p>
        <p className="mt-1">Por seguridad no se muestra ni se puede firmar. Avisa a quien te lo envió y pídele un enlace nuevo.</p>
      </Alert>
    );
  }

  const src = state.blobUrl ?? pdfUrl;
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

      {state.phase === 'ok' ? (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-900">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-semibold">Huella verificada en tu navegador</p>
            <p className="mt-0.5 break-all font-mono text-[11px] text-emerald-800">SHA-256: {expectedSha256}</p>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <Alert tone="amber">
            <span className="flex items-start gap-2"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>No pudimos verificar la huella desde tu navegador. Puedes continuar: el servidor la comprueba otra vez antes de registrar tu firma.</span></span>
            <span className="mt-1 block break-all font-mono text-[11px]">SHA-256 registrada: {expectedSha256}</span>
          </Alert>
        </div>
      )}
    </div>
  );
}
