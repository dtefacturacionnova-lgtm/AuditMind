'use client';

import { useEffect, useRef, useState } from 'react';
import { Spinner } from './ui';

/**
 * Lector de PDF propio para teléfonos y tabletas, donde el navegador no incrusta PDF en la página (ver
 * `shouldUseCanvasViewer`). Dibuja cada página en un <canvas> con pdf.js (Mozilla, empaquetado con la aplicación: no se
 * carga nada de terceros en una página de firma).
 *
 *  - Carga perezosa: pdf.js solo se descarga cuando hace falta (import dinámico), nunca en escritorio ni en el servidor.
 *  - Cada página se dibuja al acercarse a la pantalla y se libera al alejarse (un teléfono no aguanta 40 lienzos grandes).
 *  - Recibe una COPIA de los bytes: pdf.js los transfiere a su worker y los deja inservibles; el original sigue sirviendo
 *    para el enlace de descarga.
 *  - Sin JavaScript ni formularios del PDF (`isEvalSupported: false`, `enableXfa: false`): es solo para leer.
 */
const MAX_CANVAS_PX = 1400;   // ancho máximo del lienzo (nitidez razonable sin comer memoria)
const PREFETCH_MARGIN = '120% 0px'; // dibuja las páginas hasta ~1 pantalla antes de verlas

interface PageBox { width: number; height: number }

export function PdfPages({ data, onFailed }: { data: ArrayBuffer; onFailed: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [boxes, setBoxes] = useState<PageBox[] | null>(null);
  const docRef = useRef<import('pdfjs-dist').PDFDocumentProxy | null>(null);
  const canvases = useRef<Array<HTMLCanvasElement | null>>([]);
  const failed = useRef(onFailed);
  failed.current = onFailed;

  // 1) Abrir el documento y medir cada página (para reservar su espacio y que no salte el desplazamiento).
  useEffect(() => {
    let cancelled = false;
    let doc: import('pdfjs-dist').PDFDocumentProxy | null = null;
    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();
        const task = pdfjs.getDocument({ data: new Uint8Array(data.slice(0)), isEvalSupported: false, enableXfa: false });
        doc = await task.promise;
        if (cancelled) { void doc.destroy(); return; }
        const sizes: PageBox[] = [];
        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n);
          const v = page.getViewport({ scale: 1 });
          sizes.push({ width: v.width, height: v.height });
        }
        if (cancelled) { void doc.destroy(); return; }
        docRef.current = doc;
        setBoxes(sizes);
      } catch {
        if (!cancelled) failed.current();
      }
    })();
    return () => {
      cancelled = true;
      docRef.current = null;
      if (doc) void doc.destroy();
    };
  }, [data]);

  // 2) Dibujar/liberar cada página según esté cerca de la pantalla.
  useEffect(() => {
    if (!boxes || !hostRef.current) return;
    const doc = docRef.current;
    if (!doc) return;
    const rendering = new Map<number, { cancel: () => void }>();
    const drawn = new Set<number>();

    const release = (index: number) => {
      rendering.get(index)?.cancel();
      rendering.delete(index);
      const canvas = canvases.current[index];
      if (canvas) { canvas.width = 0; canvas.height = 0; } // libera la memoria del lienzo
      drawn.delete(index);
    };

    const draw = async (index: number) => {
      const canvas = canvases.current[index];
      if (!canvas || drawn.has(index) || rendering.has(index)) return;
      try {
        const page = await doc.getPage(index + 1);
        const base = page.getViewport({ scale: 1 });
        const cssWidth = canvas.parentElement?.clientWidth || base.width;
        const target = Math.min(Math.max(cssWidth * Math.min(window.devicePixelRatio || 1, 2), 600), MAX_CANVAS_PX);
        const viewport = page.getViewport({ scale: target / base.width });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const task = page.render({ canvasContext: ctx, viewport });
        rendering.set(index, { cancel: () => task.cancel() });
        await task.promise;
        rendering.delete(index);
        drawn.add(index);
      } catch (e) {
        rendering.delete(index);
        if ((e as { name?: string }).name !== 'RenderingCancelledException') failed.current();
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const index = Number((entry.target as HTMLElement).dataset.page);
          if (entry.isIntersecting) void draw(index); else release(index);
        }
      },
      { rootMargin: PREFETCH_MARGIN },
    );
    hostRef.current.querySelectorAll<HTMLElement>('[data-page]').forEach((el) => observer.observe(el));

    return () => {
      observer.disconnect();
      rendering.forEach((r) => r.cancel());
    };
  }, [boxes]);

  if (!boxes) return <Spinner label="Preparando el documento para leerlo…" />;

  return (
    <div
      ref={hostRef}
      className="max-h-[70vh] min-h-[320px] space-y-3 overflow-y-auto rounded-xl border border-gray-300 bg-gray-100 p-2.5"
      role="document"
      aria-label={`Documento a firmar, ${boxes.length} ${boxes.length === 1 ? 'página' : 'páginas'}`}
      tabIndex={0}
    >
      {boxes.map((box, i) => (
        <div key={i} data-page={i} className="mx-auto w-full max-w-3xl bg-white shadow-sm" style={{ aspectRatio: `${box.width} / ${box.height}` }}>
          <canvas ref={(el) => { canvases.current[i] = el; }} className="block h-full w-full" aria-label={`Página ${i + 1} de ${boxes.length}`} />
        </div>
      ))}
    </div>
  );
}
