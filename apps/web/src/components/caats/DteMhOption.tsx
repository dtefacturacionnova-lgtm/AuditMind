'use client';

// ─── Opción «Confirmar también con Hacienda» del motor Validación DTE. Se muestra debajo de la subida
// de documentos, cuando ya hay documentos cargados; el que ejecuta el análisis (página de analítica o
// papel de trabajo) lee `checked` y llama a `ejecutarValidacionDte` (lib/dte-mh.ts).

import { ShieldCheck } from 'lucide-react';
import { estimarConsulta, MAX_DOCS_MH } from '@/lib/dte-mh';

interface Props {
  records: Record<string, unknown>[];
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function DteMhOption({ records, checked, onChange, disabled }: Props) {
  const { documentos, minutos, excedeTope } = estimarConsulta(records);
  const bloqueada = excedeTope || documentos === 0;

  return (
    <label className={`flex items-start gap-3 border rounded-xl px-3 py-2.5 ${bloqueada ? 'border-gray-200 bg-gray-50 opacity-70' : 'border-gray-200 hover:border-[#0F2D4A]/40 cursor-pointer'}`}>
      <input
        type="checkbox"
        className="mt-0.5"
        checked={checked && !bloqueada}
        disabled={disabled || bloqueada}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="space-y-0.5">
        <span className="flex items-center gap-1.5 text-xs font-medium text-gray-700">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          Confirmar también con Hacienda
        </span>
        <span className="block text-[11px] text-gray-500">
          Consulta cada documento en el servicio público del Ministerio de Hacienda para verificar que exista y que su estado, sello y monto
          coincidan con el archivo. Solo se envía el código de generación, la fecha y el ambiente de cada documento.
        </span>
        <span className="block text-[11px] text-gray-400">
          {documentos === 0
            ? 'Los documentos cargados no traen código de generación.'
            : excedeTope
              ? `Admite hasta ${MAX_DOCS_MH} documentos por corrida; este lote tiene ${documentos}. Divídelo para consultarlo.`
              : `${documentos} documento(s) por consultar — tarda ${minutos <= 1 ? 'menos de 1 min' : `cerca de ${minutos} min`}.`}
        </span>
      </span>
    </label>
  );
}
