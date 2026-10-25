'use client';

import { useEffect, useState } from 'react';
import { Radar, ShieldCheck, Users, Scale, AlertTriangle, Lock, ShieldAlert, Search, Loader2, GraduationCap, RotateCcw } from 'lucide-react';
import {
  useStartAcceptance, useUpdateAcceptanceCheck, useDecideAcceptance, useScreenSanctions, useReopenAcceptance,
  useCompetenceSummary,
  ACCEPTANCE_RATING_CONFIG, ClientDetail, AcceptanceRating, AcceptanceCheck,
} from '@/hooks/usePortfolio';
import { useUser } from '@/hooks/useUser';
import { formatDate } from '@/lib/utils';

const RATINGS: AcceptanceRating[] = ['PENDING', 'GREEN', 'YELLOW', 'RED'];

interface Dimension {
  key: 'independence' | 'competence' | 'integrity' | 'risk' | 'sanctions';
  label: string;
  description: string;
  icon: React.ElementType;
}

const DIMENSIONS: Dimension[] = [
  { key: 'independence', label: 'Independencia', description: 'NIA 220 / Código IESBA — amenazas a la independencia del equipo y la firma.', icon: ShieldCheck },
  { key: 'competence',   label: 'Competencia y Recursos', description: 'El equipo cuenta con la competencia técnica y los recursos necesarios.', icon: Users },
  { key: 'integrity',    label: 'Integridad de la Administración', description: 'Antecedentes e integridad de los responsables del gobierno de la entidad.', icon: Scale },
  { key: 'risk',         label: 'Riesgo del Encargo', description: 'Nivel de riesgo global que representa aceptar o continuar el encargo.', icon: AlertTriangle },
  { key: 'sanctions',    label: 'Sanciones / PLD', description: 'Ley PLD/FT/FP (Decreto 426/2025), Art. 15 — solo si el despacho es sujeto obligado para este cliente (Art. 7.7).', icon: ShieldAlert },
];

function statusField(key: Dimension['key']): keyof AcceptanceCheck {
  return `${key}Status` as keyof AcceptanceCheck;
}
function notesField(key: Dimension['key']): keyof AcceptanceCheck {
  return `${key}Notes` as keyof AcceptanceCheck;
}

function Semaforo({ result }: { result: AcceptanceRating }) {
  const cfg = ACCEPTANCE_RATING_CONFIG[result];
  return (
    <div className={`flex items-center gap-3 rounded-2xl border-2 ${cfg.border} ${cfg.bg} px-5 py-4`}>
      <span className={`w-4 h-4 rounded-full ${
        result === 'GREEN' ? 'bg-emerald-500' : result === 'YELLOW' ? 'bg-amber-500' : result === 'RED' ? 'bg-red-500' : 'bg-gray-300'
      }`} />
      <div>
        <p className={`text-sm font-bold ${cfg.color}`}>Resultado global: {cfg.label}</p>
        <p className="text-xs text-gray-500">Se calcula automáticamente como la peor de las 5 dimensiones.</p>
      </div>
    </div>
  );
}

function SanctionsScreeningBlock({
  check, decided, onScreen, isScreening, error,
}: {
  check: AcceptanceCheck;
  decided: boolean;
  onScreen: () => void;
  isScreening: boolean;
  error: string | null;
}) {
  const result = check.sanctionsScreeningResult;

  return (
    <div className="border-t border-gray-100 pt-3 space-y-2">
      <button
        type="button"
        disabled={decided || isScreening}
        onClick={onScreen}
        className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isScreening ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
        {isScreening ? 'Verificando…' : 'Verificar en Listas de Sanciones (OFAC/ONU/UK)'}
      </button>
      {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      {result && (
        <div className={`text-xs rounded-lg px-3 py-2 ${result.matches_found > 0 ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
          <p className="font-medium">
            {result.matches_found > 0
              ? `${result.matches_found} de ${result.total_screened} nombre(s) con coincidencia — revisar antes de decidir`
              : `Sin coincidencias en ${result.total_screened} nombre(s) verificado(s)`}
          </p>
          <p className="text-[11px] mt-1 opacity-80">{result.lists_consulted}</p>
          {result.screenedAt && (
            <p className="text-[11px] mt-1 opacity-80">
              Verificado por {result.screenedByName ?? '—'} el {formatDate(result.screenedAt)}
              {result.namesChecked && result.namesChecked.length > 0 && <> · Nombres revisados: {result.namesChecked.join(', ')}</>}
            </p>
          )}
          {result.findings[0]?.sample_records?.map((r, i) => (
            <p key={i} className="mt-1">
              &bull; &ldquo;{r.uploaded_name}&rdquo; ≈ &ldquo;{r.matched_watchlist_name}&rdquo; ({r.score.toFixed(0)}%, {r.source_list})
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function CompetenceSummaryBlock() {
  const { hasRole } = useUser();
  const isManager = hasRole(['AUDIT_MANAGER']);
  const { data: summary, isLoading } = useCompetenceSummary(isManager);

  if (!isManager) return null;
  if (isLoading || !summary) {
    return <p className="text-xs text-gray-400 border-t border-gray-100 pt-3">Cargando competencia/CPE de la firma…</p>;
  }

  return (
    <div className="border-t border-gray-100 pt-3 space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
        <GraduationCap className="w-3.5 h-3.5" /> Competencia/CPE real de la firma (referencia, {summary.year})
      </div>
      <div className={`text-xs rounded-lg px-3 py-2 ${
        summary.cpeCompliancePct != null && summary.cpeCompliancePct < 50 ? 'bg-amber-50 text-amber-700' : 'bg-gray-50 text-gray-700'
      }`}>
        <p className="font-medium">
          {summary.staffCompliant} de {summary.staffTotal} personas activas cumplen {summary.minRequiredHours}h/año de CPE
          {summary.cpeCompliancePct != null && ` (${summary.cpeCompliancePct}%)`}
        </p>
        {summary.certifications.length > 0 && (
          <p className="mt-1 opacity-80">
            Certificaciones: {summary.certifications.map(c => `${c.type} (${c.count})`).join(' · ')}
          </p>
        )}
        {summary.competencyAreas.length > 0 && (
          <p className="mt-1 opacity-80">
            Áreas de competencia (nivel 3+): {summary.competencyAreas.map(a => `${a.area} (${a.count})`).join(' · ')}
          </p>
        )}
        {summary.certifications.length === 0 && summary.competencyAreas.length === 0 && (
          <p className="mt-1 opacity-80">Sin certificaciones ni áreas de competencia registradas todavía — ver &ldquo;Competencias y CPE&rdquo; en QAIP.</p>
        )}
      </div>
    </div>
  );
}

export function AcceptanceRadarTab({ client }: { client: ClientDetail }) {
  const currentYear = new Date().getFullYear();
  const currentCheck = client.acceptanceChecks.find(c => c.year === currentYear);
  const check = currentCheck ?? client.acceptanceChecks[0];
  // Cliente recurrente: el Radar más reciente es de un año anterior. Hay que iniciar el del año en curso (continuidad, NIA 220 / ISQM 1)
  // antes de proponer o aprobar el encargo de este ejercicio.
  const needsNewYear = !currentCheck && client.acceptanceChecks.length > 0;

  const { hasRole } = useUser();
  const isCae = hasRole(['CAE']);
  const startAcceptance = useStartAcceptance();
  const updateCheck = useUpdateAcceptanceCheck();
  const decide = useDecideAcceptance();
  const reopen = useReopenAcceptance();
  const screenSanctions = useScreenSanctions();
  const [showReopen, setShowReopen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');

  const [form, setForm] = useState<Record<string, string>>({});
  const [justification, setJustification] = useState('');
  const [showDecide, setShowDecide] = useState(false);

  useEffect(() => {
    if (!check) return;
    setForm({
      independenceStatus: check.independenceStatus, independenceNotes: check.independenceNotes ?? '',
      competenceStatus:   check.competenceStatus,   competenceNotes:   check.competenceNotes ?? '',
      integrityStatus:    check.integrityStatus,    integrityNotes:    check.integrityNotes ?? '',
      riskStatus:         check.riskStatus,         riskNotes:         check.riskNotes ?? '',
      sanctionsStatus:    check.sanctionsStatus,    sanctionsNotes:    check.sanctionsNotes ?? '',
    });
  }, [check?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!check) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400 max-w-xl mx-auto text-center">
        <Radar className="w-12 h-12 mb-3 opacity-30" />
        <p className="text-sm font-medium text-gray-600">Aún no se ha iniciado el Radar de Aceptación {currentYear}</p>
        <p className="text-xs mt-1">Evalúe independencia, competencia, integridad y riesgo antes de emitir una propuesta.</p>
        <button
          onClick={() => startAcceptance.mutate(client.id)}
          disabled={startAcceptance.isPending}
          className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm rounded-xl hover:bg-blue-700 disabled:opacity-60"
        >
          {startAcceptance.isPending ? 'Iniciando…' : `Iniciar Radar ${currentYear}`}
        </button>
      </div>
    );
  }

  const decided = check.overallResult !== 'PENDING';
  const allEvaluated = DIMENSIONS.every(d => form[statusField(d.key)] && form[statusField(d.key)] !== 'PENDING');

  const handleSave = async () => {
    try {
      await updateCheck.mutateAsync({
        id: check.id,
        data: {
          independenceStatus: form.independenceStatus as AcceptanceRating, independenceNotes: form.independenceNotes,
          competenceStatus:   form.competenceStatus as AcceptanceRating,   competenceNotes:   form.competenceNotes,
          integrityStatus:    form.integrityStatus as AcceptanceRating,    integrityNotes:    form.integrityNotes,
          riskStatus:         form.riskStatus as AcceptanceRating,         riskNotes:         form.riskNotes,
          sanctionsStatus:    form.sanctionsStatus as AcceptanceRating,    sanctionsNotes:    form.sanctionsNotes,
        },
      });
    } catch { /* shown below */ }
  };

  // Se decide con lo que se ve en pantalla (calificaciones y notas), no solo con lo último guardado.
  const handleDecide = async () => {
    try {
      await decide.mutateAsync({
        id: check.id,
        independenceStatus: form.independenceStatus as AcceptanceRating, independenceNotes: form.independenceNotes,
        competenceStatus:   form.competenceStatus as AcceptanceRating,   competenceNotes:   form.competenceNotes,
        integrityStatus:    form.integrityStatus as AcceptanceRating,    integrityNotes:    form.integrityNotes,
        riskStatus:         form.riskStatus as AcceptanceRating,         riskNotes:         form.riskNotes,
        sanctionsStatus:    form.sanctionsStatus as AcceptanceRating,    sanctionsNotes:    form.sanctionsNotes,
        overallJustification: justification,
      });
      setShowDecide(false);
      setJustification('');
    } catch { /* shown below */ }
  };

  const handleReopen = async () => {
    try {
      await reopen.mutateAsync({ id: check.id, reason: reopenReason });
      setShowReopen(false);
      setReopenReason('');
    } catch { /* shown below */ }
  };

  const sanctionsNotesMissing = !(form.sanctionsNotes ?? '').trim();

  const cls = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400';

  return (
    <div className="space-y-6 max-w-4xl">
      {needsNewYear && (
        <div className="flex items-center justify-between gap-4 bg-blue-50 border border-blue-200 rounded-2xl px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-blue-800">Continuidad del cliente — ejercicio {currentYear}</p>
            <p className="text-xs text-blue-700 mt-0.5">
              Abajo está el Radar {check.year}. Para seguir con este cliente este año hay que evaluar de nuevo su continuidad
              (independencia, integridad, recursos, riesgo y sanciones) antes de la propuesta y del encargo.
            </p>
            {startAcceptance.isError && <p className="text-xs text-red-600 mt-1">{(startAcceptance.error as Error)?.message ?? 'No se pudo iniciar'}</p>}
          </div>
          <button
            onClick={() => startAcceptance.mutate(client.id)}
            disabled={startAcceptance.isPending}
            className="shrink-0 px-4 py-2 bg-blue-600 text-white text-sm rounded-xl hover:bg-blue-700 disabled:opacity-60"
          >
            {startAcceptance.isPending ? 'Iniciando…' : `Iniciar Radar ${currentYear}`}
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">Radar de Aceptación {check.year}</h3>
          <p className="text-xs text-gray-400 mt-0.5">NIA 220 / ISQM 1 — evaluación de aceptación y continuidad del encargo</p>
        </div>
        {decided && (
          <span className="flex items-center gap-3 text-xs text-gray-400">
            <span className="flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> Decidido — definitivo</span>
            {isCae && (
              <button onClick={() => setShowReopen(true)}
                className="flex items-center gap-1 px-2.5 py-1 border border-amber-200 text-amber-700 rounded-lg hover:bg-amber-50">
                <RotateCcw className="w-3 h-3" /> Reabrir
              </button>
            )}
          </span>
        )}
      </div>

      <Semaforo result={check.overallResult} />

      {decided && check.overallJustification && (
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400">Justificación de la decisión</p>
          <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{check.overallJustification}</p>
          <p className="text-xs text-gray-400 mt-2">
            Decidido por {check.decidedBy?.name ?? '—'} el {check.decidedAt ? formatDate(check.decidedAt) : '—'}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {DIMENSIONS.map(dim => {
          const Icon = dim.icon;
          const sKey = statusField(dim.key) as string;
          const nKey = notesField(dim.key) as string;
          const currentRating = (form[sKey] ?? 'PENDING') as AcceptanceRating;
          const rcfg = ACCEPTANCE_RATING_CONFIG[currentRating];
          return (
            <div key={dim.key} className={`bg-white rounded-2xl border p-4 space-y-3 ${rcfg.border}`}>
              <div className="flex items-start gap-2">
                <Icon className="w-4 h-4 text-gray-500 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-gray-800">{dim.label}</p>
                  <p className="text-xs text-gray-400">{dim.description}</p>
                </div>
              </div>
              <div className="flex gap-1.5">
                {RATINGS.map(r => {
                  const rc = ACCEPTANCE_RATING_CONFIG[r];
                  const active = currentRating === r;
                  return (
                    <button
                      key={r}
                      type="button"
                      disabled={decided}
                      onClick={() => setForm(p => ({ ...p, [sKey]: r }))}
                      className={`flex-1 text-xs font-medium py-1.5 rounded-lg border transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                        active ? `${rc.bg} ${rc.color} ${rc.border}` : 'border-gray-200 text-gray-400 hover:bg-gray-50'
                      }`}
                    >
                      {rc.label}
                    </button>
                  );
                })}
              </div>
              <textarea
                rows={2}
                disabled={decided}
                placeholder={dim.key === 'sanctions'
                  ? '¿El despacho es sujeto obligado para este cliente (Art. 7.7)? Documente la conclusión y, si aplica, la revisión del screening.'
                  : 'Notas / evidencia de la evaluación'}
                value={form[nKey] ?? ''}
                onChange={e => setForm(p => ({ ...p, [nKey]: e.target.value }))}
                className={cls}
              />
              {dim.key === 'sanctions' && (
                <SanctionsScreeningBlock
                  check={check}
                  decided={decided}
                  onScreen={() => screenSanctions.mutate(check.id)}
                  isScreening={screenSanctions.isPending}
                  error={screenSanctions.isError ? ((screenSanctions.error as Error)?.message ?? 'Error al verificar') : null}
                />
              )}
              {dim.key === 'competence' && <CompetenceSummaryBlock />}
            </div>
          );
        })}
      </div>

      {updateCheck.isError && (
        <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
          {(updateCheck.error as Error)?.message ?? 'Error al guardar'}
        </p>
      )}

      {!decided && (
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={updateCheck.isPending}
            className="px-4 py-2 border border-gray-200 text-sm font-medium rounded-xl text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            {updateCheck.isPending ? 'Guardando…' : 'Guardar evaluación'}
          </button>
          <button
            onClick={() => setShowDecide(true)}
            disabled={!allEvaluated}
            title={!allEvaluated ? 'Evalúe las 5 dimensiones antes de decidir' : undefined}
            className="px-4 py-2 bg-[#0F2D4A] text-white text-sm font-medium rounded-xl hover:bg-[#1a3f5f] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Decidir aceptación
          </button>
        </div>
      )}

      {showDecide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-6">
            <h2 className="text-base font-semibold text-gray-800 mb-1">Decidir Aceptación / Continuidad</h2>
            <p className="text-xs text-gray-400 mb-4">
              El resultado global se calculará automáticamente como la peor calificación de las 5 dimensiones.
              Si es Rojo, el cliente quedará marcado como Declinado.
            </p>
            <textarea
              rows={4}
              required
              placeholder="Justificación profesional de la decisión (mínimo 10 caracteres)…"
              value={justification}
              onChange={e => setJustification(e.target.value)}
              className={cls}
            />
            {sanctionsNotesMissing && (
              <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-2">
                Falta la nota de <strong>Sanciones / PLD</strong>: documenta si el despacho es sujeto obligado para este cliente (Art. 7.7) y,
                si hubo coincidencias en el screening, por qué se descartan. Ciérralo y escríbela en esa tarjeta.
              </p>
            )}
            {decide.isError && (
              <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mt-2">
                {(decide.error as Error)?.message ?? 'Error al decidir'}
              </p>
            )}
            <div className="flex gap-2 pt-4">
              <button onClick={() => setShowDecide(false)}
                className="flex-1 py-2 border border-gray-200 text-sm font-medium rounded-xl text-gray-600 hover:bg-gray-50">
                Cancelar
              </button>
              <button
                onClick={handleDecide}
                disabled={decide.isPending || justification.trim().length < 10 || sanctionsNotesMissing}
                className="flex-1 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-60"
              >
                {decide.isPending ? 'Decidiendo…' : 'Confirmar decisión'}
              </button>
            </div>
          </div>
        </div>
      )}
      {showReopen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-6">
            <h2 className="text-base font-semibold text-gray-800 mb-1">Reabrir la decisión</h2>
            <p className="text-xs text-gray-400 mb-4">
              La decisión actual queda copiada en la justificación junto con el motivo, quién y cuándo. Si el cliente había quedado
              Declinado por este Radar, vuelve a «En aceptación». Las propuestas y cartas que se cerraron al declinarlo no se reabren.
            </p>
            <textarea rows={3} placeholder="Motivo (mínimo 10 caracteres)…" value={reopenReason}
              onChange={e => setReopenReason(e.target.value)} className={cls} />
            {reopen.isError && (
              <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mt-2">{(reopen.error as Error)?.message ?? 'No se pudo reabrir'}</p>
            )}
            <div className="flex gap-2 pt-4">
              <button onClick={() => setShowReopen(false)}
                className="flex-1 py-2 border border-gray-200 text-sm font-medium rounded-xl text-gray-600 hover:bg-gray-50">Cancelar</button>
              <button onClick={handleReopen} disabled={reopen.isPending || reopenReason.trim().length < 10}
                className="flex-1 py-2 bg-amber-600 text-white text-sm font-medium rounded-xl hover:bg-amber-700 disabled:opacity-60">
                {reopen.isPending ? 'Reabriendo…' : 'Reabrir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
