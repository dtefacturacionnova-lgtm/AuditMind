'use client';

import { useState } from 'react';
import {
  RefreshCw, HelpCircle, X, AlertTriangle, CheckCircle2, AlertCircle, XCircle, Loader2, TrendingUp,
} from 'lucide-react';
import { useRecalculateSamplingEvaluation } from '@/hooks/useWorkingPaperGraph';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SamplingAccion = 'NINGUNA' | 'CERCA_DEL_LIMITE' | 'AMPLIAR_MUESTRA' | 'PROPONER_AJUSTE' | 'MODIFICAR_OPINION' | 'CONTROL_NO_EFECTIVO';
export type SamplingSemaforo = 'VERDE' | 'AMARILLO' | 'NARANJA' | 'ROJO';

export interface SamplingEvalAreaResult {
  area:                 string;
  tipoMuestreo:         string;
  esMUS:                boolean;
  esAtributos:          boolean;
  itemsExaminados:      number;
  itemsConError:        number;
  erroresEncontrados:   number;
  intervaloMuestreo:    number | null;
  factorK:              number | null;
  nivelConfianzaPct:    number | null;
  precisionBasica:      number | null;
  errorMasProbable:     number | null;
  ampliacionPrecision:  number | null;
  limiteSuperiorError:  number | null;
  valorComparado:       number;
  uae:                  number | null;
  me:                   number | null;
  mg:                   number | null;
  superaUAE:            boolean;
  superaME:             boolean;
  superaMG:             boolean;
  itemsConDesviacion:       number | null;
  tasaDesviacionMuestra:    number | null;
  limiteSuperiorDesviacion: number | null;
  tasaDesviacionTolerable:  number | null;
  universoN:            number | null;
  nivelAlcancePct:      number | null;
  accion:               SamplingAccion;
  semaforo:             SamplingSemaforo;
  ampliacionSugerida:   { itemsAdicionales: number; muestraTotalSugerida: number } | null;
  nota:                 string | null;
}

export interface SamplingEvaluationValue {
  filas:               SamplingEvalAreaResult[];
  calculadoEn:          string;
  totalErrorProyectado: number;
  mg: number | null; me: number | null; uae: number | null;
}

interface Props {
  paperId:  string;
  value:    SamplingEvaluationValue | null;
  readOnly?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtUSD(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}
function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleString('es-SV', { dateStyle: 'medium', timeStyle: 'short' }); }
  catch { return iso; }
}

const SEMAFORO_CFG: Record<SamplingSemaforo, { dot: string; bg: string; text: string; border: string; icon: React.ReactNode; label: string }> = {
  VERDE:    { dot: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: <CheckCircle2 className="w-3.5 h-3.5" />, label: 'Sin acción' },
  AMARILLO: { dot: 'bg-amber-400',   bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   icon: <AlertCircle className="w-3.5 h-3.5" />,  label: 'Atención' },
  NARANJA:  { dot: 'bg-orange-500',  bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200',  icon: <AlertTriangle className="w-3.5 h-3.5" />, label: 'Proponer ajuste' },
  ROJO:     { dot: 'bg-red-500',     bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200',     icon: <XCircle className="w-3.5 h-3.5" />,      label: 'Riesgo de opinión' },
};

const ACCION_LABEL: Record<SamplingAccion, string> = {
  NINGUNA:             'Ninguna acción adicional',
  CERCA_DEL_LIMITE:    'Cerca del límite — vigilar',
  AMPLIAR_MUESTRA:     'Ampliar la muestra',
  PROPONER_AJUSTE:     'Proponer ajuste (AJE)',
  MODIFICAR_OPINION:   'Evaluar modificación de opinión',
  CONTROL_NO_EFECTIVO: 'Control no operando efectivamente',
};

/** Frase en lenguaje simple, generada a partir de los números reales del área. */
function explainPlain(f: SamplingEvalAreaResult): string {
  if (f.esAtributos) {
    if (f.itemsExaminados === 0) return `En ${f.area}, no hay ítems con resultado registrado todavía.`;
    const desv = f.itemsConDesviacion ?? 0;
    const base = desv === 0
      ? `En ${f.area}, ninguno de los ${f.itemsExaminados} ítems examinados presentó desviación`
      : `En ${f.area}, ${desv} de ${f.itemsExaminados} ítems examinados presentaron desviación (tasa de ${(f.tasaDesviacionMuestra ?? 0).toFixed(1)}%)`;
    if (f.tasaDesviacionTolerable == null) {
      return `${base}. Falta definir la Tasa de Desviación Tolerable (TDT) en S2 para poder concluir si el control es efectivo.`;
    }
    return `${base}. Considerando el margen por riesgo de muestreo, el límite superior de desviación llega a ${(f.limiteSuperiorDesviacion ?? 0).toFixed(1)}%, contra una tolerancia de ${f.tasaDesviacionTolerable.toFixed(1)}%. ${accionPlain(f)}`;
  }

  const errores = f.itemsConError === 0
    ? `no se encontró ningún error en los ${f.itemsExaminados} ítems examinados`
    : `se encontraron ${f.itemsConError} ítem${f.itemsConError === 1 ? '' : 's'} con diferencia de ${f.itemsExaminados} examinados`;

  if (!f.esMUS) {
    const total = fmtUSD(f.erroresEncontrados);
    if (f.itemsConError === 0) return `En ${f.area}, ${errores}. No hay nada que evaluar contra la materialidad.`;
    return `En ${f.area} (muestreo no estadístico), ${errores}, por un total de ${total}. `
      + `Como esta área no se proyecta estadísticamente, ese monto se compara directo contra la materialidad — `
      + accionPlain(f);
  }

  if (f.itemsConError === 0) {
    return `En ${f.area}, ${errores}. Aun así, se reserva un margen (Precisión Básica de ${fmtUSD(f.precisionBasica ?? 0)}) `
      + `por si hay errores que la muestra no alcanzó a detectar — el límite superior de error queda en `
      + `${fmtUSD(f.limiteSuperiorError ?? 0)}, ${f.limiteSuperiorError != null && f.me != null && f.limiteSuperiorError < f.me ? 'por debajo de' : 'cerca de o sobre'} la materialidad de ejecución.`;
  }

  return `En ${f.area}, ${errores}. Proyectando ese resultado a toda el área (usando el intervalo de muestreo y el nivel de confianza definidos), `
    + `el error más probable es de ${fmtUSD(f.errorMasProbable ?? 0)}, y considerando el margen por riesgo de muestreo, `
    + `el límite superior de error llega a ${fmtUSD(f.limiteSuperiorError ?? 0)}. ${accionPlain(f)}`;
}
function accionPlain(f: SamplingEvalAreaResult): string {
  switch (f.accion) {
    case 'NINGUNA':             return f.esAtributos
      ? 'El límite superior de desviación queda por debajo de la tolerancia — el control parece estar operando efectivamente.'
      : 'Ambos quedan por debajo de lo que preocupa — no se requiere nada adicional.';
    case 'CERCA_DEL_LIMITE':    return f.esAtributos
      ? 'Está cerca de la tolerancia — vale la pena vigilar este control en el cierre.'
      : 'Está cerca del límite de materialidad — vale la pena vigilar esta área en el cierre.';
    case 'AMPLIAR_MUESTRA':     return f.esAtributos
      ? 'El margen de riesgo de muestreo (no la tasa observada en sí) supera la tolerancia — lo más eficiente suele ser examinar algunos ítems adicionales para reducir ese margen.'
      : 'El margen de riesgo (no el error en sí) supera la materialidad — lo más eficiente suele ser examinar algunos ítems adicionales para reducir ese margen.';
    case 'PROPONER_AJUSTE':     return 'El error proyectado en sí ya supera la materialidad de ejecución — corresponde proponer un ajuste a la administración.';
    case 'MODIFICAR_OPINION':   return 'El error supera la materialidad global — debe evaluarse el efecto en la opinión del informe.';
    case 'CONTROL_NO_EFECTIVO': return 'Tanto la tasa observada como el límite superior de desviación superan la tolerancia — el control no parece estar operando efectivamente; considere aumentar el riesgo de control evaluado y ampliar los procedimientos sustantivos de esta área.';
  }
}

// ─── Modal de metodología ─────────────────────────────────────────────────────

function MethodologyModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-gray-700">¿Cómo se calcula la evaluación de resultados del muestreo?</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-4 text-[12px] text-gray-600 leading-relaxed">
          <div className="bg-violet-50 border border-violet-200 rounded-xl p-3">
            <p className="font-semibold text-violet-700 mb-1">En palabras simples</p>
            <p>
              Examinar una muestra en vez de toda la población siempre deja una pregunta abierta: ¿qué tan
              probable es que el resto de la población (lo que NO se examinó) tenga errores parecidos a los
              que sí se encontraron? Este panel responde eso en dos números — cuánto error es más probable que
              exista (proyectando lo encontrado) y, siendo conservadores, cuánto podría llegar a existir si la
              suerte de la muestra no fue representativa. El segundo número (el "límite superior") es el que
              realmente se compara contra la materialidad, porque incluye el margen de duda que trae examinar
              solo una parte.
            </p>
          </div>

          <div>
            <p className="font-semibold text-gray-700 mb-1">1. Error Más Probable (MLE) — proyección por tainting</p>
            <p className="mb-1.5">
              Cada ítem con diferencia aporta su "tainting" (% de error, ver S5) multiplicado por el intervalo
              de muestreo — así un error grande en un ítem pequeño (alto %) pesa más que uno chico en un ítem
              grande, que es como realmente funciona el riesgo en MUS.
            </p>
            <div className="bg-gray-50 rounded-lg p-2.5 font-mono text-[11px] text-gray-700">
              MLE = Σ (tainting del ítem × intervalo de muestreo)
            </div>
          </div>

          <div>
            <p className="font-semibold text-gray-700 mb-1">2. Precisión Básica — margen por si la muestra no encontró nada</p>
            <p className="mb-1.5">
              Aunque la muestra salga limpia, sigue existiendo la posibilidad de que haya errores en la parte
              no examinada. Este margen usa el mismo factor de confianza "k" ya definido en S1/S3 para esa área.
            </p>
            <div className="bg-gray-50 rounded-lg p-2.5 font-mono text-[11px] text-gray-700">
              Precisión Básica = k × intervalo de muestreo
            </div>
          </div>

          <div>
            <p className="font-semibold text-gray-700 mb-1">3. Ampliación de Precisión — margen adicional por cada error encontrado</p>
            <p className="mb-1.5">
              Entre más errores (y más grandes) aparecen en la muestra, menos confianza da esa muestra sobre
              el resto de la población — este término lo captura, sumando un incremento de "factor de
              confiabilidad" por cada ítem con error, de mayor a menor tainting. Los factores de confiabilidad
              se calculan resolviendo la distribución de Poisson (el mismo método detrás de las tablas AICPA
              publicadas), no una tabla copiada a mano.
            </p>
          </div>

          <div>
            <p className="font-semibold text-gray-700 mb-1">4. Límite Superior de Error (UEL) — el número que se compara con la materialidad</p>
            <div className="bg-gray-50 rounded-lg p-2.5 font-mono text-[11px] text-gray-700">
              UEL = Precisión Básica + Error Más Probable + Ampliación de Precisión
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
            <p className="font-semibold text-amber-800 mb-1 flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5" /> ¿Y si hay que ampliar la muestra?</p>
            <p className="text-amber-900">
              Si el UEL supera la materialidad de ejecución pero el Error Más Probable NO (es decir, es el
              margen de riesgo el que empuja el número, no un error real grande), lo más eficiente casi
              siempre es examinar más ítems — cada ítem adicional reduce el intervalo de muestreo y, con él,
              tanto la Precisión Básica como la Ampliación de Precisión. El sistema estima cuántos ítems
              adicionales harían falta asumiendo que esos nuevos ítems no traen errores nuevos (el supuesto
              habitual de planificación):
            </p>
            <div className="bg-white/60 rounded-lg p-2 mt-1.5 font-mono text-[11px] text-amber-900">
              n adicional ≈ n examinado × (UEL / ME − 1)
            </div>
            <p className="text-amber-900 mt-1.5">
              Es una estimación de planificación, no una garantía — si los ítems adicionales sí traen errores,
              habrá que recalcular tras examinarlos.
            </p>
          </div>

          <div>
            <p className="font-semibold text-gray-700 mb-1">Semáforo y acción sugerida</p>
            <table className="w-full text-[11px]">
              <tbody>
                <tr className="border-b border-gray-100"><td className="py-1 pr-2"><span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 mr-1.5" />Verde</td><td className="py-1 text-gray-500">UEL por debajo de ME — sin acción.</td></tr>
                <tr className="border-b border-gray-100"><td className="py-1 pr-2"><span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400 mr-1.5" />Ámbar</td><td className="py-1 text-gray-500">UEL cerca o sobre ME, pero el error más probable sigue bajo — ampliar muestra.</td></tr>
                <tr className="border-b border-gray-100"><td className="py-1 pr-2"><span className="inline-block w-2.5 h-2.5 rounded-full bg-orange-500 mr-1.5" />Naranja</td><td className="py-1 text-gray-500">El error más probable ya supera ME — proponer ajuste.</td></tr>
                <tr><td className="py-1 pr-2"><span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 mr-1.5" />Rojo</td><td className="py-1 text-gray-500">Supera MG — riesgo de modificar la opinión.</td></tr>
              </tbody>
            </table>
          </div>

          <div className="text-[11px] text-gray-400 border-t border-gray-100 pt-2">
            Áreas Dirigidas o de examen 100% no usan esta proyección estadística — su "UEL" es directamente
            la suma de las diferencias encontradas, porque no hay población sin examinar que proyectar.
          </div>

          <div className="bg-violet-50 border border-violet-200 rounded-xl p-3">
            <p className="font-semibold text-violet-700 mb-1">Áreas de Atributos (pruebas de control)</p>
            <p>
              Aquí no hay montos: cada ítem se marca Cumple/No cumple (S5). La tasa de desviación de la
              muestra se proyecta al mismo estilo que MUS — con el mismo método Poisson, pero aplicado a una
              tasa (÷ n) en vez de a un monto (× intervalo) — dando un límite superior de desviación que se
              compara contra la Tasa de Desviación Tolerable (TDT) declarada en S2. Si el límite superior y la
              tasa observada superan la TDT, el control se marca como no efectivo.
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
            <p className="font-semibold text-blue-700 mb-1">Nivel de Alcance</p>
            <p>
              Independiente del tipo de muestreo, cada tarjeta muestra qué % del Universo estimado (N,
              declarado en S2) cubrió realmente la muestra examinada — útil para documentar, por ejemplo, qué
              porcentaje del inventario se llegó a revisar. En MUS/Dirigido/100% se mide en $ (valor examinado
              ÷ valor total de la población) porque unos pocos ítems grandes pueden cubrir la mayoría del
              valor; en Atributos se mide en cantidad de ítems, porque ahí no hay montos que sumar.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Barra comparativa contra materialidad ───────────────────────────────────

function ThresholdBar({ value, uae, me, mg }: { value: number; uae: number | null; me: number | null; mg: number | null }) {
  const max = Math.max(value, mg ?? 0, me ?? 0, uae ?? 0, 1) * 1.15;
  const pct = (v: number) => Math.min(100, (v / max) * 100);
  return (
    <div className="mt-1.5">
      <div className="relative h-2.5 rounded-full bg-gray-100 overflow-hidden">
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${
            mg != null && value >= mg ? 'bg-red-500' : me != null && value >= me ? 'bg-orange-500' : uae != null && value >= uae ? 'bg-amber-400' : 'bg-emerald-500'
          }`}
          style={{ width: `${pct(value)}%` }}
        />
        {uae != null && <div className="absolute inset-y-0 border-l border-gray-400/60" style={{ left: `${pct(uae)}%` }} title={`UAE ${fmtUSD(uae)}`} />}
        {me != null && <div className="absolute inset-y-0 border-l-2 border-orange-500" style={{ left: `${pct(me)}%` }} title={`ME ${fmtUSD(me)}`} />}
        {mg != null && <div className="absolute inset-y-0 border-l-2 border-red-500" style={{ left: `${pct(mg)}%` }} title={`MG ${fmtUSD(mg)}`} />}
      </div>
      <div className="flex justify-between text-[9px] text-gray-400 mt-0.5">
        <span>$0</span>
        <span className="flex gap-2">
          {uae != null && <span>UAE {fmtUSD(uae)}</span>}
          {me != null && <span className="text-orange-500 font-medium">ME {fmtUSD(me)}</span>}
          {mg != null && <span className="text-red-500 font-medium">MG {fmtUSD(mg)}</span>}
        </span>
      </div>
    </div>
  );
}

/** Misma idea que ThresholdBar pero en % (tasa de desviación vs. TDT) en vez de $. */
function DeviationBar({ value, tdt }: { value: number; tdt: number | null }) {
  const max = Math.max(value, tdt ?? 0, 1) * 1.15;
  const pct = (v: number) => Math.min(100, (v / max) * 100);
  return (
    <div className="mt-1.5">
      <div className="relative h-2.5 rounded-full bg-gray-100 overflow-hidden">
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${tdt != null && value >= tdt ? 'bg-red-500' : 'bg-emerald-500'}`}
          style={{ width: `${pct(value)}%` }}
        />
        {tdt != null && <div className="absolute inset-y-0 border-l-2 border-red-500" style={{ left: `${pct(tdt)}%` }} title={`TDT ${tdt.toFixed(1)}%`} />}
      </div>
      <div className="flex justify-between text-[9px] text-gray-400 mt-0.5">
        <span>0%</span>
        {tdt != null && <span className="text-red-500 font-medium">TDT {tdt.toFixed(1)}%</span>}
      </div>
    </div>
  );
}

// ─── Tarjeta por área ─────────────────────────────────────────────────────────

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-lg px-2.5 py-1.5">
      <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-xs font-mono font-semibold text-gray-700">{value}</p>
    </div>
  );
}

function AlcanceBadge({ f }: { f: SamplingEvalAreaResult }) {
  if (f.nivelAlcancePct == null) return null;
  const title = f.universoN == null ? undefined
    : f.esAtributos
      ? `${f.itemsExaminados} de ${f.universoN} ítems del universo estimado (N)`
      : `% del valor ($) del universo estimado (N = ${fmtUSD(f.universoN)}) que cubrió la muestra examinada`;
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold text-blue-600 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5"
      title={title}
    >
      Alcance {f.nivelAlcancePct.toFixed(1)}%
    </span>
  );
}

function AreaCard({ f }: { f: SamplingEvalAreaResult }) {
  const sem = SEMAFORO_CFG[f.semaforo];
  return (
    <div className={`border rounded-xl p-3 ${sem.border} ${sem.bg}/30 bg-white`}>
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-gray-800">{f.area}</p>
          <p className="text-[10px] text-gray-400">
            {f.tipoMuestreo} · {f.itemsExaminados} examinados · {f.esAtributos ? `${f.itemsConDesviacion ?? 0} con desviación` : `${f.itemsConError} con diferencia`}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          <AlcanceBadge f={f} />
          <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${sem.text} ${sem.bg} ${sem.border}`}>
            {sem.icon} {ACCION_LABEL[f.accion]}
          </span>
        </div>
      </div>

      {f.nota && (
        <p className="mt-1.5 text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
          ⚠ {f.nota}
        </p>
      )}

      {f.esAtributos ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mt-2.5">
          <MetricTile label="Tasa de desviación (muestra)" value={f.tasaDesviacionMuestra != null ? `${f.tasaDesviacionMuestra.toFixed(1)}%` : '—'} />
          <MetricTile label="Límite superior de desviación" value={f.limiteSuperiorDesviacion != null ? `${f.limiteSuperiorDesviacion.toFixed(1)}%` : '—'} />
          <MetricTile label="Tasa de desviación tolerable (TDT)" value={f.tasaDesviacionTolerable != null ? `${f.tasaDesviacionTolerable.toFixed(1)}%` : '— (definir en S2)'} />
          <MetricTile label="Nivel de confianza" value={f.nivelConfianzaPct != null ? `${f.nivelConfianzaPct}%` : '—'} />
        </div>
      ) : f.esMUS ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mt-2.5">
          <MetricTile label="Error más probable (MLE)" value={fmtUSD(f.errorMasProbable ?? 0)} />
          <MetricTile label="Precisión básica" value={fmtUSD(f.precisionBasica ?? 0)} />
          <MetricTile label="Ampliación de precisión" value={fmtUSD(f.ampliacionPrecision ?? 0)} />
          <MetricTile label="Límite superior de error (UEL)" value={fmtUSD(f.limiteSuperiorError ?? 0)} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-1.5 mt-2.5">
          <MetricTile label="Diferencias encontradas" value={fmtUSD(f.erroresEncontrados)} />
          <MetricTile label="Nivel de confianza" value={f.nivelConfianzaPct != null ? `${f.nivelConfianzaPct}%` : '—'} />
        </div>
      )}

      {f.esAtributos
        ? <DeviationBar value={f.tasaDesviacionMuestra ?? 0} tdt={f.tasaDesviacionTolerable} />
        : <ThresholdBar value={f.valorComparado} uae={f.uae} me={f.me} mg={f.mg} />}

      <p className="mt-2 text-[11px] text-gray-500 italic leading-relaxed">{explainPlain(f)}</p>

      {f.ampliacionSugerida && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
          <TrendingUp className="w-3.5 h-3.5 shrink-0" />
          <span>
            Ampliación sugerida: examinar <strong>{f.ampliacionSugerida.itemsAdicionales} ítem{f.ampliacionSugerida.itemsAdicionales === 1 ? '' : 's'} adicional{f.ampliacionSugerida.itemsAdicionales === 1 ? '' : 'es'}</strong> (muestra total ≈ {f.ampliacionSugerida.muestraTotalSugerida}) para reducir el margen de riesgo por debajo de {f.esAtributos ? 'la tolerancia' : 'la materialidad'}.
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Panel principal ──────────────────────────────────────────────────────────

export function SamplingEvaluationPanel({ paperId, value, readOnly = false }: Props) {
  const [showHelp, setShowHelp] = useState(false);
  const recalc = useRecalculateSamplingEvaluation();

  const filas = value?.filas ?? [];
  const areasEnAccion = filas.filter(f => f.accion === 'PROPONER_AJUSTE' || f.accion === 'MODIFICAR_OPINION').length;

  return (
    <div className="mt-1 space-y-3">
      {showHelp && <MethodologyModal onClose={() => setShowHelp(false)} />}

      <div className="flex items-center gap-2 flex-wrap">
        {!readOnly && (
          <button
            onClick={() => recalc.mutate(paperId)}
            disabled={recalc.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
          >
            {recalc.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {recalc.isPending ? 'Calculando…' : 'Recalcular Evaluación'}
          </button>
        )}
        <button
          onClick={() => setShowHelp(true)}
          className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-violet-600 transition-colors"
        >
          <HelpCircle className="w-3.5 h-3.5" /> ¿Cómo se calcula esto?
        </button>
        {recalc.data?.message && (
          <span className="text-[11px] text-gray-500">{recalc.data.message}</span>
        )}
        {recalc.isError && (
          <span className="text-[11px] text-red-600">Error al recalcular: {(recalc.error as Error).message}</span>
        )}
      </div>

      {filas.length === 0 ? (
        <div className="py-8 text-center border border-dashed border-gray-200 rounded-xl">
          <p className="text-xs text-gray-400">
            Sin evaluación calculada todavía. Complete al menos un ítem examinado en S5 (Registro de Selección)
            y presione &quot;Recalcular Evaluación&quot;.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-4 px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl flex-wrap text-[11px] text-gray-500">
            <span>{filas.length} área{filas.length === 1 ? '' : 's'} evaluada{filas.length === 1 ? '' : 's'}</span>
            {areasEnAccion > 0 && (
              <span className="font-semibold text-orange-600">{areasEnAccion} requiere{areasEnAccion === 1 ? '' : 'n'} ajuste o escalamiento</span>
            )}
            <span className="ml-auto">Total proyectado: <strong className="text-gray-700">{fmtUSD(value?.totalErrorProyectado ?? 0)}</strong></span>
            {value?.calculadoEn && <span>Calculado: {fmtDate(value.calculadoEn)}</span>}
          </div>

          <div className="space-y-2">
            {filas.map(f => <AreaCard key={f.area} f={f} />)}
          </div>
        </>
      )}
    </div>
  );
}
