'use client';
import { useState, useRef, useEffect } from 'react';
import { Send, Bot, Sparkles, ChevronDown, Loader2 } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';

// badge tiers: 'Flash' = gemini-2.5-flash standard | 'Flash ✦' = flash con reasoning depth (análisis complejo)
const AGENTS = [
  {
    id: 'MINERVA',
    name: 'MINERVA',
    role: 'Coordinadora de Auditoría IA',
    description: 'Planificación, riesgo, materiality, estrategia de auditoría',
    color: 'bg-indigo-600',
    badge: 'Flash',
  },
  {
    id: 'SCRIPTORIUM',
    name: 'SCRIPTORIUM',
    role: 'Generador de Programas de Trabajo',
    description: 'Crea programas de auditoría personalizados con procedimientos NIA',
    color: 'bg-violet-600',
    badge: 'Flash',
  },
  {
    id: 'ARGUS',
    name: 'ARGUS',
    role: 'Evaluador de Controles Internos',
    description: 'COSO, COBIT, ISO 27001, evaluación de controles',
    color: 'bg-blue-600',
    badge: 'Flash',
  },
  {
    id: 'HERMES',
    name: 'HERMES',
    role: 'Analista Forense Financiero',
    description: 'Detección de fraude, Benford, análisis de transacciones',
    color: 'bg-red-600',
    badge: 'Flash',
  },
  {
    id: 'CICERO',
    name: 'CICERO',
    role: 'Redactor de Informes',
    description: 'Hallazgos, recomendaciones, informes ejecutivos en tono profesional',
    color: 'bg-emerald-600',
    badge: 'Flash ✦',
  },
  {
    id: 'SOCRATES',
    name: 'SOCRATES',
    role: 'Asistente de Entrevistas',
    description: 'Preguntas de entrevista, análisis de respuestas, documentación',
    color: 'bg-amber-600',
    badge: 'Flash',
  },
  {
    id: 'CASSANDRA',
    name: 'CASSANDRA',
    role: 'Analista Predictiva de Riesgos',
    description: 'Modelos predictivos, tendencias de riesgo, alertas tempranas',
    color: 'bg-purple-600',
    badge: 'Flash ✦',
  },
  {
    id: 'VULCANO',
    name: 'VULCANO',
    role: 'Auditor de TI',
    description: 'COBIT, ciberseguridad, riesgo tecnológico, controles de TI',
    color: 'bg-orange-600',
    badge: 'Flash',
  },
  {
    id: 'SENADO',
    name: 'SENADO',
    role: 'Especialista en Compliance',
    description: 'Regulaciones, cumplimiento normativo, Ley Karin, SOX, GDPR',
    color: 'bg-teal-600',
    badge: 'Flash ✦',
  },
  {
    id: 'ATLAS',
    name: 'ATLAS',
    role: 'Auditor de ESG',
    description: 'Sostenibilidad, GRI, TCFD, impacto ambiental y social',
    color: 'bg-green-600',
    badge: 'Flash',
  },
  {
    id: 'FENIX',
    name: 'FENIX',
    role: 'Seguimiento de Recomendaciones',
    description: 'Monitoreo de implementación, avance de planes de acción',
    color: 'bg-cyan-600',
    badge: 'Flash',
  },
  {
    id: 'LEX',
    name: 'LEX',
    role: 'Asesor Legal-Normativo',
    description: 'Normativa chilena, contratos, riesgo legal, compliance regulatorio',
    color: 'bg-slate-600',
    badge: 'Flash',
  },
  {
    id: 'SHERLOCK',
    name: 'SHERLOCK',
    role: 'Investigador de Anomalías',
    description: 'Patrones de fraude, análisis forense, cadena de custodia',
    color: 'bg-rose-600',
    badge: 'Flash ✦',
  },
  {
    id: 'MINERVA_QAIP',
    name: 'MINERVA QAIP',
    role: 'Calidad e Mejora Continua (QAIP)',
    description: 'Evaluaciones IIA, autoevaluaciones, mejoras al departamento',
    color: 'bg-pink-600',
    badge: 'Flash',
  },
] as const;

type AgentId = typeof AGENTS[number]['id'];

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

// Gemini model badge styles
const BADGE_STYLES: Record<string, string> = {
  'Flash':   'bg-sky-100 text-sky-700 border border-sky-200',
  'Flash ✦': 'bg-indigo-100 text-indigo-700 border border-indigo-200',
};

export default function AIPage() {
  const [selectedAgentId, setSelectedAgentId] = useState<AgentId>('MINERVA');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const selectedAgent = AGENTS.find((a) => a.id === selectedAgentId)!;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function handleAgentChange(agentId: AgentId) {
    setSelectedAgentId(agentId);
    setMessages([]);
    setInput('');
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const res = await apiClient.post<{ response: string }>('/ai/chat', {
        agentType: selectedAgentId,
        message: text,
        history,
      });

      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: res.response,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      const errMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Error: ${err.message ?? 'No se pudo conectar con el agente'}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div className="flex flex-col h-screen bg-[#F0F4F8]">
      <Header />

      <div className="flex flex-1 overflow-hidden">
        {/* Agent sidebar */}
        <aside className={cn(
          'bg-white border-r border-gray-200 flex-shrink-0 transition-all overflow-hidden',
          sidebarOpen ? 'w-64' : 'w-0',
        )}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
              <Bot className="h-4 w-4 text-[#0F2D4A]" />
              Agentes IA
            </h2>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1 rounded hover:bg-gray-100 text-gray-400"
            >
              <ChevronDown className="h-4 w-4 rotate-90" />
            </button>
          </div>
          <div className="overflow-y-auto h-[calc(100%-49px)]">
            {AGENTS.map((agent) => (
              <button
                key={agent.id}
                onClick={() => handleAgentChange(agent.id)}
                className={cn(
                  'w-full text-left px-4 py-3 border-b border-gray-50 transition-colors',
                  selectedAgentId === agent.id
                    ? 'bg-[#0F2D4A]/5 border-l-2 border-l-[#0F2D4A]'
                    : 'hover:bg-gray-50',
                )}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${agent.color}`}>
                    {agent.name.charAt(0)}
                  </div>
                  <span className="font-medium text-sm text-gray-800 truncate">{agent.name}</span>
                  <span className={`ml-auto px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0 ${BADGE_STYLES[agent.badge]}`}>
                    {agent.badge}
                  </span>
                </div>
                <p className="text-xs text-gray-400 pl-7 leading-tight">{agent.role}</p>
              </button>
            ))}
          </div>
        </aside>

        {/* Chat area */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Chat header */}
          <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
              >
                <Bot className="h-4 w-4" />
              </button>
            )}
            <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold flex-shrink-0', selectedAgent.color)}>
              {selectedAgent.name.charAt(0)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="font-semibold text-gray-800">{selectedAgent.name}</h1>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${BADGE_STYLES[selectedAgent.badge]}`}>
                  Gemini {selectedAgent.badge}
                </span>
              </div>
              <p className="text-xs text-gray-400 truncate">{selectedAgent.role}</p>
            </div>
            {messages.length > 0 && (
              <button
                onClick={() => setMessages([])}
                className="ml-auto text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-100"
              >
                Limpiar
              </button>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
            {messages.length === 0 && (
              <WelcomeScreen agent={selectedAgent} onSuggestion={(s) => setInput(s)} />
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}
              >
                {msg.role === 'assistant' && (
                  <div className={cn('w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mr-2 mt-0.5', selectedAgent.color)}>
                    {selectedAgent.name.charAt(0)}
                  </div>
                )}
                <div className={cn(
                  'max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
                  msg.role === 'user'
                    ? 'bg-[#0F2D4A] text-white rounded-tr-sm'
                    : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm shadow-sm',
                )}>
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  <p className={cn('text-xs mt-1', msg.role === 'user' ? 'text-white/50' : 'text-gray-400')}>
                    {msg.timestamp.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className={cn('w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mr-2 mt-0.5', selectedAgent.color)}>
                  {selectedAgent.name.charAt(0)}
                </div>
                <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                  <div className="flex gap-1 items-center">
                    <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                    <span className="text-sm text-gray-400">Procesando...</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="bg-white border-t border-gray-200 px-4 py-3">
            <div className="flex items-end gap-2 bg-gray-50 rounded-2xl border border-gray-200 px-4 py-2 focus-within:border-[#0F2D4A] focus-within:ring-2 focus-within:ring-[#0F2D4A]/20 transition-all">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Escribe a ${selectedAgent.name}... (Enter para enviar, Shift+Enter para nueva línea)`}
                rows={1}
                className="flex-1 bg-transparent text-sm text-gray-800 resize-none focus:outline-none max-h-32 py-1"
                style={{ height: 'auto' }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = 'auto';
                  target.style.height = `${Math.min(target.scrollHeight, 128)}px`;
                }}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || loading}
                className="p-2 rounded-xl bg-[#0F2D4A] text-white hover:bg-[#1a3f5f] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-gray-400 text-center mt-2">
              Las respuestas de IA son orientativas. Verifica siempre con las NIAs y normativa aplicable.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function WelcomeScreen({ agent, onSuggestion }: {
  agent: typeof AGENTS[number];
  onSuggestion: (s: string) => void;
}) {
  const suggestions: Record<string, string[]> = {
    MINERVA: [
      'Diseña el plan de auditoría para una auditoría financiera de una empresa manufacturera con $50M en activos',
      'Explica cómo determinar la materialidad según NIA 320 para auditorías de cumplimiento',
      'Ayúdame a identificar los principales riesgos para una auditoría operacional de cadena de suministro',
    ],
    SCRIPTORIUM: [
      'Crea un programa de trabajo para auditar el proceso de cuentas por pagar',
      'Genera procedimientos de auditoría para evaluar el control de inventarios',
      'Diseña un programa de auditoría de nóminas y remuneraciones',
    ],
    ARGUS: [
      'Evalúa la efectividad de controles internos sobre el proceso de ventas usando COSO',
      'Identifica debilidades de control en un ambiente de TI con acceso remoto',
      'Lista los controles clave para el proceso de cierre contable mensual',
    ],
    HERMES: [
      'Analiza estos datos de transacciones para detectar patrones de fraude',
      'Explica la Ley de Benford y cómo aplicarla en auditoría forense',
      'Identifica señales de alerta (red flags) de malversación de fondos',
    ],
    CICERO: [
      'Redacta el hallazgo: controles de acceso lógico insuficientes en sistema ERP',
      'Escribe una recomendación para mejorar el proceso de conciliación bancaria',
      'Ayúdame a redactar el resumen ejecutivo del informe de auditoría de TI',
    ],
    SOCRATES: [
      'Prepara preguntas de entrevista para el gerente de tesorería sobre segregación de funciones',
      'Diseña una guía de entrevista para auditoría del proceso de compras',
      'Sugiere preguntas para evaluar el conocimiento de controles en el área de nóminas',
    ],
    CASSANDRA: [
      'Proyecta el perfil de riesgo del sector financiero para los próximos 12 meses',
      'Identifica tendencias de riesgo emergentes en auditoría de TI para 2026',
      'Analiza cómo el riesgo macroeconómico afecta los riesgos de auditoría',
    ],
    VULCANO: [
      'Evalúa los controles de ciberseguridad según el framework NIST',
      'Diseña procedimientos de auditoría para sistemas en la nube (AWS/Azure)',
      'Identifica riesgos de TI en la implementación de un nuevo ERP',
    ],
    SENADO: [
      'Explica los requisitos de cumplimiento de la Ley 21.643 (Ley Karin) para el área de RRHH',
      'Lista los controles de cumplimiento necesarios para empresas reguladas por la CMF',
      'Verifica los requisitos de protección de datos personales según Ley 19.628',
    ],
    ATLAS: [
      'Diseña indicadores KPI para auditoría de sostenibilidad según GRI Standards',
      'Evalúa los controles de reporte de emisiones de carbono según TCFD',
      'Identifica riesgos ESG materiales para una empresa minera',
    ],
    FENIX: [
      'Diseña un plan de seguimiento para 15 recomendaciones de auditoría pendientes',
      'Crea criterios de evaluación del avance en planes de acción correctiva',
      'Sugiere una metodología para priorizar recomendaciones críticas',
    ],
    LEX: [
      'Analiza el riesgo legal de una cláusula de garantía en contratos de servicio',
      'Explica las obligaciones de una empresa bajo la Ley de Delitos Económicos',
      'Identifica exposiciones legales en el proceso de licitación pública',
    ],
    SHERLOCK: [
      'Analiza esta secuencia de transacciones en busca de patrones irregulares',
      'Define los procedimientos de cadena de custodia para evidencia digital',
      'Identifica señales de manipulación contable en estados financieros',
    ],
    MINERVA_QAIP: [
      'Diseña un programa de evaluación de calidad interna (QAIP) para el departamento de auditoría',
      'Prepara la autoevaluación anual del departamento de auditoría interna según IIA',
      'Sugiere métricas KPI para medir la efectividad del departamento de auditoría',
    ],
  };

  const agentSuggestions = suggestions[agent.id] ?? suggestions['MINERVA'];

  return (
    <div className="flex flex-col items-center justify-center h-full text-center py-12 px-4 max-w-2xl mx-auto">
      <div className={cn('w-16 h-16 rounded-2xl flex items-center justify-center text-white text-2xl font-bold mb-4 shadow-lg', agent.color)}>
        {agent.name.charAt(0)}
      </div>
      <h2 className="text-xl font-bold text-gray-900 mb-1">{agent.name}</h2>
      <p className="text-gray-500 mb-1 font-medium">{agent.role}</p>
      <p className="text-sm text-gray-400 mb-8 max-w-md">{agent.description}</p>

      <div className="flex items-center gap-1.5 mb-4">
        <Sparkles className="h-4 w-4 text-amber-500" />
        <span className="text-sm font-medium text-gray-600">Sugerencias para empezar</span>
      </div>

      <div className="w-full space-y-2">
        {agentSuggestions.map((s) => (
          <button
            key={s}
            onClick={() => onSuggestion(s)}
            className="w-full text-left px-4 py-3 bg-white border border-gray-200 rounded-xl hover:border-[#0F2D4A] hover:bg-blue-50/30 transition-colors text-sm text-gray-700"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
