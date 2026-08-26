'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Bot, Send, X, Sparkles, ChevronRight, Loader2,
  MessageSquare, RefreshCw,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import type { WorkingPaper } from '@/hooks/useWorkingPapers';

// ─── Agent assignment per WP type ────────────────────────────────────────────

interface AgentMeta {
  agentId:    string;
  agentName:  string;
  agentRole:  string;
  agentColor: string;
  badge:      string;
  badgeStyle: string;
}

const PAPER_AGENT_MAP: Record<string, AgentMeta> = {
  PLANNING_UNDERSTANDING: {
    agentId: 'MINERVA', agentName: 'MINERVA', agentRole: 'Coordinadora de Auditoría',
    agentColor: 'bg-indigo-600', badge: 'Flash', badgeStyle: 'bg-sky-100 text-sky-700 border-sky-200',
  },
  CONTROL_EVALUATION: {
    agentId: 'ARGUS', agentName: 'ARGUS', agentRole: 'Evaluador de Controles',
    agentColor: 'bg-blue-600', badge: 'Flash', badgeStyle: 'bg-sky-100 text-sky-700 border-sky-200',
  },
  SUBSTANTIVE_TEST: {
    agentId: 'HERMES', agentName: 'HERMES', agentRole: 'Analista Forense',
    agentColor: 'bg-red-600', badge: 'Flash', badgeStyle: 'bg-sky-100 text-sky-700 border-sky-200',
  },
  DATA_ANALYSIS: {
    agentId: 'HERMES', agentName: 'HERMES', agentRole: 'Analista Forense',
    agentColor: 'bg-red-600', badge: 'Flash', badgeStyle: 'bg-sky-100 text-sky-700 border-sky-200',
  },
  FINDING: {
    agentId: 'CICERO', agentName: 'CICERO', agentRole: 'Redactor de Informes',
    agentColor: 'bg-emerald-600', badge: 'Flash ✦', badgeStyle: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  },
  CLOSURE_CONCLUSION: {
    agentId: 'CICERO', agentName: 'CICERO', agentRole: 'Redactor de Informes',
    agentColor: 'bg-emerald-600', badge: 'Flash ✦', badgeStyle: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  },
  INTERVIEW: {
    agentId: 'SOCRATES', agentName: 'SOCRATES', agentRole: 'Asistente de Entrevistas',
    agentColor: 'bg-amber-600', badge: 'Flash', badgeStyle: 'bg-sky-100 text-sky-700 border-sky-200',
  },
  CONFIRMATION: {
    agentId: 'CICERO', agentName: 'CICERO', agentRole: 'Redactor de Informes',
    agentColor: 'bg-emerald-600', badge: 'Flash ✦', badgeStyle: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  },
  NORMATIVE_ANALYSIS: {
    agentId: 'FISCUS', agentName: 'FISCUS', agentRole: 'Especialista Tributario',
    agentColor: 'bg-slate-600', badge: 'Flash', badgeStyle: 'bg-sky-100 text-sky-700 border-sky-200',
  },
};

const DEFAULT_AGENT: AgentMeta = {
  agentId: 'MINERVA', agentName: 'MINERVA', agentRole: 'Coordinadora',
  agentColor: 'bg-indigo-600', badge: 'Flash', badgeStyle: 'bg-sky-100 text-sky-700 border-sky-200',
};

// ─── Context-aware suggestions per paper type ─────────────────────────────────

function buildSuggestions(type: string, wp: WorkingPaper): string[] {
  const audit = wp.audit?.title ?? 'la auditoría';
  const code  = wp.paperCode ?? wp.code;

  const map: Record<string, string[]> = {
    PLANNING_UNDERSTANDING: [
      `Ayúdame a redactar el objetivo del papel ${code} para ${audit}`,
      `Identifica los riesgos inherentes más relevantes para ${audit} según NIA 315`,
      'Sugiere qué procedimientos de comprensión del negocio debo documentar primero',
    ],
    CONTROL_EVALUATION: [
      `Evalúa los controles clave del proceso auditado en ${audit} usando COSO 2013`,
      'Diseña pruebas de controles para los ciclos de mayor riesgo',
      'Lista las deficiencias de control típicas y su impacto en el riesgo de detección',
    ],
    SUBSTANTIVE_TEST: [
      `Diseña procedimientos sustantivos para las cuentas clave de ${audit}`,
      'Determina el tamaño muestral óptimo usando muestreo estadístico NIA 530',
      `Documenta los procedimientos analíticos sustantivos para ${audit}`,
    ],
    DATA_ANALYSIS: [
      `Interpreta los resultados del análisis CAAT de ${audit}`,
      'Identifica anomalías significativas y sugiere procedimientos adicionales',
      'Redacta las conclusiones del análisis de datos para este papel de trabajo',
    ],
    FINDING: [
      `Redacta un hallazgo en formato C-C-C-E-R-R para ${audit}`,
      'Mejora la redacción del hallazgo para mayor claridad ejecutiva',
      'Sugiere recomendaciones específicas con criterios de cierre medibles',
    ],
    CLOSURE_CONCLUSION: [
      `Redacta la conclusión general de ${audit} según los hallazgos identificados`,
      'Sugiere la opinión de auditoría según NIA 700 basada en los resultados',
      'Documenta las limitaciones del alcance y sus implicaciones en la opinión',
    ],
    INTERVIEW: [
      `Prepara un guion de entrevista para el área auditada en ${audit}`,
      'Diseña preguntas abiertas para evaluar la cultura de control',
      'Sugiere cómo documentar respuestas evasivas o inconsistentes',
    ],
    CONFIRMATION: [
      `Redacta la carta de solicitud de confirmación para ${audit} según NIA 505`,
      'Diseña el procedimiento de seguimiento para confirmaciones no recibidas',
      'Documenta los resultados y las diferencias identificadas',
    ],
    NORMATIVE_ANALYSIS: [
      `Analiza el marco normativo aplicable a ${audit}`,
      'Lista los requisitos regulatorios que deben verificarse en esta auditoría',
      'Identifica incumplimientos normativos y sus implicaciones',
    ],
  };

  return map[type] ?? [
    `Ayúdame con el papel ${code} de ${audit}`,
    'Sugiere los procedimientos más relevantes para este tipo de papel',
    'Revisa el contenido y propón mejoras de redacción',
  ];
}

// ─── Main panel ───────────────────────────────────────────────────────────────

interface PanelMessage {
  id:      string;
  role:    'user' | 'assistant';
  content: string;
}

export interface PaperAgentPanelProps {
  wp:           WorkingPaper;
  onClose:      () => void;
  /** If provided, this message is auto-sent to the agent when the panel opens. */
  autoMessage?: string;
}

export function PaperAgentPanel({ wp, onClose, autoMessage }: PaperAgentPanelProps) {
  const agent       = PAPER_AGENT_MAP[wp.type] ?? DEFAULT_AGENT;
  const suggestions = buildSuggestions(wp.type, wp);

  const [messages, setMessages] = useState<PanelMessage[]>([]);
  const [input,    setInput]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const endRef   = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);
  const didAutoSend = useRef(false);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-send pre-loaded message on mount (e.g. after status transition)
  useEffect(() => {
    if (autoMessage && !didAutoSend.current) {
      didAutoSend.current = true;
      sendMessage(autoMessage);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Build context object injected into every agent call */
  function buildContext() {
    const contentEntries = Object.entries((wp.content ?? {}) as Record<string, string>)
      .filter(([, v]) => v?.trim())
      .map(([k, v]) => `${k}: ${v.substring(0, 300)}`);

    return {
      auditTitle:     wp.audit?.title   ?? '',
      auditType:      wp.audit?.type    ?? '',
      auditScope:     wp.audit?.scope   ?? '',
      riskLevel:      (wp.audit as any)?.riskLevel ?? '',
      paperCode:      wp.paperCode ?? wp.code,
      paperTitle:     wp.title,
      paperType:      wp.type,
      currentContent: contentEntries.join('\n'),
    };
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: PanelMessage = { id: crypto.randomUUID(), role: 'user', content: trimmed };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      const res = await apiClient.post<{ response: string }>('/ai/chat', {
        agentType: agent.agentId,
        message:   trimmed,
        context:   buildContext(),
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
        content: 'Error al conectar con el agente. Intenta de nuevo.',
      }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  return (
    <div className="flex flex-col h-full w-[320px] bg-white border-l border-gray-200 shadow-xl flex-shrink-0">

      {/* ── Header ── */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-[#0F2D4A]/5 to-white flex-shrink-0">
        <div className={cn(
          'w-8 h-8 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0',
          agent.agentColor,
        )}>
          {agent.agentName.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-gray-900">{agent.agentName}</span>
            <span className={cn(
              'text-[10px] font-medium px-1.5 py-0.5 rounded border',
              agent.badgeStyle,
            )}>
              {agent.badge}
            </span>
          </div>
          <p className="text-[10px] text-gray-400 truncate">
            {agent.agentRole} · {wp.paperCode ?? wp.code}
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-gray-100 text-gray-400 flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* ── Messages or Welcome ── */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="p-4 space-y-3">
            {/* Context chip */}
            <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5">
              <Bot className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-blue-700 leading-snug">
                Contexto cargado:{' '}
                <strong>{wp.audit?.title ?? 'Auditoría'}</strong>
                {(wp.audit as any)?.riskLevel
                  ? ` · Riesgo ${(wp.audit as any).riskLevel}`
                  : ''}
              </p>
            </div>

            {/* Suggestions */}
            <p className="text-[11px] text-gray-400 font-medium flex items-center gap-1 pt-1">
              <Sparkles className="w-3 h-3 text-amber-400" />
              Sugerencias para {wp.paperCode ?? wp.code}
            </p>
            <div className="space-y-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className={cn(
                    'w-full text-left text-[11px] text-gray-600 leading-snug',
                    'bg-gray-50 hover:bg-blue-50 border border-gray-200 hover:border-blue-300',
                    'rounded-xl px-3 py-2.5 transition-colors flex items-start gap-2',
                  )}
                >
                  <ChevronRight className="w-3 h-3 text-blue-400 flex-shrink-0 mt-0.5" />
                  {s}
                </button>
              ))}
            </div>

            {/* Divider with agent description */}
            <div className="pt-2 border-t border-gray-100">
              <p className="text-[10px] text-gray-400 leading-relaxed">
                <span className="font-medium text-gray-500">{agent.agentName}</span>
                {' '}tiene acceso al contexto completo de este papel y la auditoría.
                Tus preguntas se responden con ese contexto inyectado automáticamente.
              </p>
            </div>
          </div>
        ) : (
          <div className="px-3 py-3 space-y-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start gap-2')}
              >
                {msg.role === 'assistant' && (
                  <div className={cn(
                    'w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 mt-0.5',
                    agent.agentColor,
                  )}>
                    {agent.agentName.charAt(0)}
                  </div>
                )}
                <div className={cn(
                  'max-w-[88%] rounded-xl px-3 py-2 text-[12px] leading-relaxed',
                  msg.role === 'user'
                    ? 'bg-[#0F2D4A] text-white rounded-tr-sm'
                    : 'bg-gray-50 border border-gray-200 text-gray-700 rounded-tl-sm',
                )}>
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start gap-2">
                <div className={cn(
                  'w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0',
                  agent.agentColor,
                )}>
                  {agent.agentName.charAt(0)}
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-xl rounded-tl-sm px-3 py-2">
                  <div className="flex gap-1 items-center">
                    <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin" />
                    <span className="text-[11px] text-gray-400">Procesando…</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* ── Input ── */}
      <div className="px-3 py-3 border-t border-gray-100 flex-shrink-0 space-y-1.5">
        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            className="text-[10px] text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors"
          >
            <RefreshCw className="w-3 h-3" /> Nueva consulta
          </button>
        )}
        <div className={cn(
          'flex items-end gap-1.5 bg-gray-50 rounded-xl border px-3 py-2 transition-all',
          'focus-within:border-[#0F2D4A] focus-within:ring-1 focus-within:ring-[#0F2D4A]/20',
          'border-gray-200',
        )}>
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
            placeholder={`Consultar a ${agent.agentName}…`}
            rows={1}
            className="flex-1 bg-transparent text-[12px] text-gray-800 resize-none focus:outline-none max-h-24 py-0.5"
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
            className="p-1.5 rounded-lg bg-[#0F2D4A] text-white hover:bg-[#1a3f5f] disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className="text-[10px] text-gray-400 text-center">
          Contexto del papel inyectado automáticamente
        </p>
      </div>
    </div>
  );
}

// ─── Shared exports ───────────────────────────────────────────────────────────
export { PAPER_AGENT_MAP, DEFAULT_AGENT };
export type { AgentMeta };

// ─── Toggle button shown in the WP header ────────────────────────────────────

export function PaperAgentButton({
  type,
  onClick,
  active,
}: {
  type:    string;
  onClick: () => void;
  active:  boolean;
}) {
  const agent = PAPER_AGENT_MAP[type] ?? DEFAULT_AGENT;

  return (
    <button
      onClick={onClick}
      title={active ? 'Cerrar asistente IA' : `Abrir ${agent.agentName} para este papel`}
      className={cn(
        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
        active
          ? 'bg-[#0F2D4A] text-white border-[#0F2D4A]'
          : 'bg-white text-gray-600 border-gray-200 hover:border-[#0F2D4A] hover:text-[#0F2D4A]',
      )}
    >
      {/* Agent avatar dot */}
      <span className={cn(
        'w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0',
        active ? 'bg-white/25 text-white' : `${agent.agentColor} text-white`,
      )}>
        {agent.agentName.charAt(0)}
      </span>
      {agent.agentName}
      {active
        ? <X className="w-3 h-3" />
        : <MessageSquare className="w-3 h-3" />
      }
    </button>
  );
}
