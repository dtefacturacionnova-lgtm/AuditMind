import * as React from 'react';

type RiskLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'MINIMAL';

const STYLES: Record<RiskLevel, { bg: string; label: string }> = {
  CRITICAL: { bg: 'bg-red-600 text-white',          label: 'Crítico' },
  HIGH:     { bg: 'bg-orange-500 text-white',        label: 'Alto' },
  MEDIUM:   { bg: 'bg-yellow-400 text-yellow-900',   label: 'Medio' },
  LOW:      { bg: 'bg-blue-400 text-white',          label: 'Bajo' },
  MINIMAL:  { bg: 'bg-green-400 text-white',         label: 'Mínimo' },
};

interface RiskBadgeProps {
  level: RiskLevel | string;
  showDot?: boolean;
}

export function RiskBadge({ level, showDot = false }: RiskBadgeProps) {
  const style = STYLES[level as RiskLevel] ?? { bg: 'bg-gray-300 text-gray-800', label: level };
  return (
    <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${style.bg}`}>
      {showDot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />}
      {style.label}
    </span>
  );
}
