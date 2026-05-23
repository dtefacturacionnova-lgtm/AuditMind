'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import {
  Send, ChevronRight, Loader2, RefreshCw, Sparkles,
  ExternalLink, Bot, TrendingUp, AlertTriangle, FileText,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuditSnapshot {
  id:             string;
  title:          string;
  type:           string;
  status:         string;
  riskLevel?:     string;
  scope?:         string;
  objectives?:    string;
  estimatedHours: number;
  actualHours:    number;
  workingPapers:  number;
  findings:       number;
  pbcRequests:    number;
  materialityGlobal?: number;
  riskModel?: {
    inherentRisk:  number;
    controlRisk:   number;
    detectionRisk: number;
    auditRisk:     number;
  };
}

// ─── Context chips ────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  PLANNING: 'Planificación', IN_PROGRESS: 'En Progreso',
  REVIEW: 'En Revisión', CLOSED: 'Cerrada', CANCELLED: 'Cancelada',
};

const RISK_STYLES: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-700',
  HIGH:     'bg-orange-100 text-orange-700',
  MEDIUM:   'bg-yellow-100 text-yellow-800',
  LOW:      'bg-blue-100 text-blue-700',
  MINIMAL:  'bg-green-100 text-green-700',
};

// ─── Suggestion prompts ───────────────────────────────────────────────────────

function buildSuggestions(a: AuditSnapshot) {
  const pct = a.estimatedHours > 0
    ? Math.round((a.actualHours / a.estimatedHours) * 100)
    : 0;

  return [
    {
      icon: TrendingUp,
      label: 'Analizar avance y detectar gaps',
      prompt:
        `Analiza el avance actual de la auditoría "${a.title}" (${pct}% horas consumidas, ` +
        `${a.workingPapers} papeles de trabajo, ${a.findings} hallazgos identificados). ` +
        `Identifica: (1) qué áreas del alcance podrían quedar sin cobertura, ` +
        `(2) si el ritmo de avance es coherente con el tiempo restante, ` +
        `(3) si el número de hallazgos es proporcional al nivel de riesgo ${a.riskLevel ?? 'identificado'}.`,
    },
    {
      icon: ChevronRight,
      label: 'Sugerir próximo procedimiento crítico',
      prompt:
        `La auditoría "${a.title}" está en estado ${STATUS_LABELS[a.status] ?? a.status}. ` +
        `Hay ${a.workingPapers} papeles de trabajo y ${a.findings} hallazgos hasta ahora. ` +
        `¿Cuál es el próximo procedimiento de auditoría más crítico que debería ejecutarse ` +
        `para ${a.riskLevel === 'HIGH' || a.riskLevel === 'CRITICAL' ? 'mitigar el riesgo alto identificado' : 'avanzar eficientemente'}? ` +
        `Sé específico sobre el tipo de prueba y el área de enfoque.`,
    },
    {
      icon: AlertTriangle,
      label: 'Evaluar riesgo residual',
      prompt:
        `Evalúa el riesgo residual de la auditoría "${a.title}" considerando: ` +
        `${a.findings} hallazgos identificados, riesgo inherente ${a.riskLevel ?? 'no definido'}, ` +
        (a.riskModel
          ? `riesgo de auditoría calculado en ${(a.riskModel.auditRisk * 100).toFixed(1)}%, `
          : '') +
        `${a.pbcRequests} solicitudes PBC pendientes. ` +
        `¿Qué áreas presentan mayor riesgo residual sin evidencia suficiente? ` +
        `¿Qué procedimientos adicionales se recomiendan antes del cierre?`,
    },
  ];
}

// ─── Build context payload for API ───────────────────────────────────────────

function buildContext(a: AuditSnapshot) {
  const pct = a.estimatedHours > 0
    ? Math.round((a.actualHours / a.estimatedHours) * 100)
    : 0;
  return {
    auditTitle:     a.title,
    auditType:      a.type,
    auditStatus:    a.status,
    riskLevel:      a.riskLevel ?? '',
    scope:          a.scope ?? '',
    objectives:     a.objectives ?? '',
    workingPapers:  a.workingPapers,
    findings:       a.findings,
    pbcRequests:    a.pbcRequests,
    estimatedHours: a.estimatedHours,
    actualHours:    a.actualHours,
    progressPct:    pct,
    materialityGlobal: a.materialityGlobal ?? null,
    auditRisk:      a.riskModel?.auditRisk ?? null,
  };
}

// ─── Main component ───────────────────────────────────────────────────────────

interface MinervaMessage {
  id:      string;
  role:    'user' | 'assistant';
  content: string;
}

export function MinervaAuditPanel({ audit }: { audit: AuditSnapshot }) {
  const suggestions = buildSuggestions(audit);

  const [messages, setMessages] = useState<MinervaMessage[]>([]);
  const [input,    setInput]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const endRef   = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const progressPct = audit.estimatedHours > 0
    ? Math.min(100, Math.round((audit.actualHours / audit.estimatedHours) * 100))
    : 0;

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: MinervaMessage = {
      id:      crypto.randomUUID(),
      role:    'user',
      content: trimmed,
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      const res = await apiClient.post<{ response: string }>('/ai/chat', {
        agentType: 'MINERVA',
        message:   trimmed,
        context:   buildContext(audit),
        history,
      });
      setMessages(prev => [...prev, {
        id:      crypto.randomUUID(),
        role:    'assistant',
        content: res.response,
      }]);
    } catch {
      setMessages(prev => [...prev, {
        id:      crypto.randomUUID(),
        role:    'assistant',
        content: 'Error al conectar con MINERVA. Intenta de nuevo.',
      }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  return (
    <div className="rounded-2xl border border-indigo-200 bg-gradient-to-b from-indigo-50/60 to-white overflow-hidden shadow-sm">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-indigo-100 bg-white/80">
        <div className="flex items-center gap-3">
          {/* MINERVA avatar */}
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-sm">
            M
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-gray-900">MINERVA</span>
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border bg-sky-100 text-sky-700 border-sky-200">
                Flash
              </span>
              <span className="text-[10px] text-gray-400">·</span>
              <span className="text-[11px] text-gray-500">Coordinadora de Auditoría</span>
            </div>
            {/* Context chips */}
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <span className="text-[10px] bg-white border border-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">
                {STATUS_LABELS[audit.status] ?? audit.status}
              </span>
              {audit.riskLevel && (
                <span className={cn(
                  'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                  RISK_STYLES[audit.riskLevel] ?? 'bg-gray-100 text-gray-600',
                )}>
                  Riesgo {audit.riskLevel}
                </span>
              )}
              <span className="text-[10px] bg-white border border-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                <FileText className="w-2.5 h-2.5" />
                {audit.workingPapers} PT
              </span>
              <span className="text-[10px] bg-white border border-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                <AlertTriangle className="w-2.5 h-2.5" />
                {audit.findings} hallazgos
              </span>
              <span className="text-[10px] bg-white border border-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">
                {progressPct}% horas
              </span>
            </div>
          </div>
        </div>
        <Link
          href={`/dashboard/ai?agent=MINERVA`}
          className="flex items-center gap-1 text-[11px] text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
        >
          Motor IA
          <ExternalLink className="w-3 h-3" />
        </Link>
      </div>

      {/* ── Content ── */}
      <div className="px-5 py-4 space-y-4">

        {/* Welcome / suggestions */}
        {messages.length === 0 && !loading && (
          <div className="space-y-2.5">
            <p className="text-xs text-gray-500 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              MINERVA tiene acceso al contexto completo de esta auditoría. Pregunta o elige:
            </p>
            {suggestions.map((s) => (
              <button
                key={s.label}
                onClick={() => sendMessage(s.prompt)}
                className="w-full flex items-start gap-2.5 text-left bg-white border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/40 rounded-xl px-4 py-3 transition-colors group"
              >
                <s.icon className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5 group-hover:text-indigo-600" />
                <span className="text-sm text-gray-700 group-hover:text-gray-900">{s.label}</span>
                <ChevronRight className="w-3.5 h-3.5 text-gray-300 ml-auto flex-shrink-0 mt-0.5 group-hover:text-indigo-400" />
              </button>
            ))}
          </div>
        )}

        {/* Loading */}
        {loading && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
          <div className="flex justify-start gap-2">
            <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 mt-0.5">
              M
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
              <div className="flex gap-1.5 items-center">
                <div className="flex gap-1">
                  {[0,1,2].map(i => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce"
                      style={{ animationDelay: `${i * 120}ms` }} />
                  ))}
                </div>
                <span className="text-xs text-indigo-500 ml-1">MINERVA está analizando…</span>
              </div>
            </div>
          </div>
        )}

        {/* Messages */}
        {messages.length > 0 && (
          <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start gap-2')}
              >
                {msg.role === 'assistant' && (
                  <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 mt-0.5">
                    M
                  </div>
                )}
                <div className={cn(
                  'max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
                  msg.role === 'user'
                    ? 'bg-[#0F2D4A] text-white rounded-tr-sm'
                    : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm shadow-sm',
                )}>
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>
        )}

        {/* New question button after response */}
        {messages.length > 0 && !loading && (
          <div className="flex items-center gap-2 pt-1 border-t border-indigo-100">
            <button
              onClick={() => setMessages([])}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-indigo-600 transition-colors"
            >
              <RefreshCw className="w-3 h-3" /> Nueva pregunta
            </button>
          </div>
        )}

        {/* Input */}
        <div className={cn(
          'flex items-end gap-2 bg-white rounded-xl border px-3 py-2 transition-all',
          'focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-400/20',
          'border-gray-200',
        )}>
          <Bot className="w-4 h-4 text-indigo-400 flex-shrink-0 mb-0.5" />
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage(input);
              }
            }}
            placeholder="Pregunta a MINERVA sobre esta auditoría…"
            rows={1}
            className="flex-1 bg-transparent text-sm text-gray-800 resize-none focus:outline-none max-h-24 py-0.5"
            style={{ height: 'auto' }}
            onInput={e => {
              const t = e.target as HTMLTextAreaElement;
              t.style.height = 'auto';
              t.style.height = `${Math.min(t.scrollHeight, 96)}px`;
            }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            className="p-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
          >
            {loading
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Send className="w-3.5 h-3.5" />
            }
          </button>
        </div>
      </div>
    </div>
  );
}
