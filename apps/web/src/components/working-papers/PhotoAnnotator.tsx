'use client';

import { useRef, useState } from 'react';
import { Circle, ArrowUpRight, Type, Trash2 } from 'lucide-react';

/**
 * Capa de marcado sobre una foto (EVD-14, Fase 3) — el auditor dibuja círculo/
 * flecha/nota de texto sobre la imagen para señalar una zona relevante. Las
 * marcas viajan como metadata (coordenadas 0-1 relativas a la imagen) — la
 * imagen original NUNCA se modifica, se sube tal cual (custodia). El LLM recibe
 * la imagen completa MÁS esta lista para poder describir qué hay en cada zona.
 */

export interface AnotacionFoto {
  tipo: 'circulo' | 'flecha' | 'texto';
  x: number; y: number;       // 0-1
  x2?: number; y2?: number;   // flecha
  radio?: number;             // circulo, 0-1
  nota?: string;
}

type Herramienta = 'circulo' | 'flecha' | 'texto';

interface Props {
  imageUrl: string;
  anotaciones: AnotacionFoto[];
  onChange: (anotaciones: AnotacionFoto[]) => void;
}

export function PhotoAnnotator({ imageUrl, anotaciones, onChange }: Props) {
  const [herramienta, setHerramienta] = useState<Herramienta>('circulo');
  const [dibujando, setDibujando] = useState<{ x: number; y: number; x2: number; y2: number } | null>(null);
  const [editandoIdx, setEditandoIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  function coordsDesdeEvento(e: React.MouseEvent): { x: number; y: number } {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  }

  function handleMouseDown(e: React.MouseEvent) {
    const { x, y } = coordsDesdeEvento(e);
    if (herramienta === 'texto') {
      const nueva: AnotacionFoto = { tipo: 'texto', x, y, nota: '' };
      onChange([...anotaciones, nueva]);
      setEditandoIdx(anotaciones.length);
      return;
    }
    setDibujando({ x, y, x2: x, y2: y });
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!dibujando) return;
    const { x, y } = coordsDesdeEvento(e);
    setDibujando(d => (d ? { ...d, x2: x, y2: y } : d));
  }

  function handleMouseUp() {
    if (!dibujando) return;
    const { x, y, x2, y2 } = dibujando;
    let nueva: AnotacionFoto;
    if (herramienta === 'circulo') {
      const radio = Math.max(0.02, Math.hypot(x2 - x, y2 - y));
      nueva = { tipo: 'circulo', x, y, radio, nota: '' };
    } else {
      // flecha — ignora arrastres casi nulos (click accidental)
      if (Math.hypot(x2 - x, y2 - y) < 0.01) { setDibujando(null); return; }
      nueva = { tipo: 'flecha', x, y, x2, y2, nota: '' };
    }
    const nuevas = [...anotaciones, nueva];
    onChange(nuevas);
    setDibujando(null);
    setEditandoIdx(nuevas.length - 1);
  }

  function actualizarNota(idx: number, nota: string) {
    onChange(anotaciones.map((a, i) => (i === idx ? { ...a, nota } : a)));
  }

  function eliminar(idx: number) {
    onChange(anotaciones.filter((_, i) => i !== idx));
    if (editandoIdx === idx) setEditandoIdx(null);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setHerramienta('circulo')}
          className={`flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 py-1.5 ${herramienta === 'circulo' ? 'bg-gray-900 text-white' : 'text-gray-500 border border-gray-200'}`}
        >
          <Circle className="w-3.5 h-3.5" /> Círculo
        </button>
        <button
          type="button"
          onClick={() => setHerramienta('flecha')}
          className={`flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 py-1.5 ${herramienta === 'flecha' ? 'bg-gray-900 text-white' : 'text-gray-500 border border-gray-200'}`}
        >
          <ArrowUpRight className="w-3.5 h-3.5" /> Flecha
        </button>
        <button
          type="button"
          onClick={() => setHerramienta('texto')}
          className={`flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 py-1.5 ${herramienta === 'texto' ? 'bg-gray-900 text-white' : 'text-gray-500 border border-gray-200'}`}
        >
          <Type className="w-3.5 h-3.5" /> Nota de punto
        </button>
      </div>

      <div className="relative rounded-lg overflow-hidden border border-gray-200 select-none" style={{ touchAction: 'none' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="Foto capturada" className="w-full h-auto block pointer-events-none" draggable={false} />
        <svg
          ref={svgRef}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full cursor-crosshair"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => setDibujando(null)}
        >
          <defs>
            <marker id="flecha-punta" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill="#dc2626" />
            </marker>
          </defs>
          {anotaciones.map((a, i) => (
            <g key={i}>
              {a.tipo === 'circulo' && (
                <circle cx={a.x * 100} cy={a.y * 100} r={(a.radio ?? 0.05) * 100} fill="none" stroke="#dc2626" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
              )}
              {a.tipo === 'flecha' && (
                <line x1={a.x * 100} y1={a.y * 100} x2={(a.x2 ?? a.x) * 100} y2={(a.y2 ?? a.y) * 100} stroke="#dc2626" strokeWidth={1.2} vectorEffect="non-scaling-stroke" markerEnd="url(#flecha-punta)" />
              )}
              {a.tipo === 'texto' && (
                <circle cx={a.x * 100} cy={a.y * 100} r={1.6} fill="#dc2626" />
              )}
              <text x={a.x * 100 + 2} y={a.y * 100 - 2} fontSize={4} fill="#dc2626" fontWeight="bold" stroke="white" strokeWidth={0.6} paintOrder="stroke">{i + 1}</text>
            </g>
          ))}
          {dibujando && herramienta === 'circulo' && (
            <circle cx={dibujando.x * 100} cy={dibujando.y * 100} r={Math.hypot(dibujando.x2 - dibujando.x, dibujando.y2 - dibujando.y) * 100} fill="none" stroke="#dc2626" strokeWidth={1} strokeDasharray="2,2" vectorEffect="non-scaling-stroke" />
          )}
          {dibujando && herramienta === 'flecha' && (
            <line x1={dibujando.x * 100} y1={dibujando.y * 100} x2={dibujando.x2 * 100} y2={dibujando.y2 * 100} stroke="#dc2626" strokeWidth={1} strokeDasharray="2,2" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
      </div>

      {anotaciones.length > 0 && (
        <div className="space-y-1.5">
          {anotaciones.map((a, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="shrink-0 w-5 h-5 flex items-center justify-center rounded-full bg-red-50 text-red-600 font-semibold border border-red-200">{i + 1}</span>
              <input
                value={a.nota ?? ''}
                onChange={e => actualizarNota(i, e.target.value)}
                onFocus={() => setEditandoIdx(i)}
                autoFocus={editandoIdx === i}
                placeholder="¿Qué hay en esta zona? (recomendado — sin nota, la IA no puede citarla)"
                className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-gray-400"
              />
              <button type="button" onClick={() => eliminar(i)} className="shrink-0 text-gray-300 hover:text-red-600">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
