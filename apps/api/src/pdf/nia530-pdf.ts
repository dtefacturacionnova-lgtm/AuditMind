/**
 * Renderizado PDF específico de PT-NIA530 — registro de ítems de muestra (S5) y
 * evaluación de resultados del muestreo (S4: MLE/Precisión Básica/UEL + semáforo).
 * Espejo server-side de SampleItemRegisterPanel.tsx / SamplingEvaluationPanel.tsx
 * (pantalla) — Puppeteer nunca ejecuta React, así que estos valores estructurados
 * se renderizan aquí directamente a HTML/CSS, sin librería de gráficos.
 */

function esc(s: unknown): string {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function fmtUSD(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

// ─── S5 — Registro de ítems ───────────────────────────────────────────────────

interface SampleItemRowPdf {
  area?: string; itemRef?: string; descripcion?: string;
  bookValue?: number | null; auditedValue?: number | null;
  cumple?: 'SI' | 'NO' | 'NA' | null;
  fecha?: string; execRef?: string; attachments?: Array<{ filename?: string }>;
}

const CUMPLE_BADGE: Record<'SI' | 'NO' | 'NA', { label: string; text: string; bg: string }> = {
  NO: { label: 'No cumple', text: '#B91C1C', bg: '#FEF2F2' },
  SI: { label: 'Sí cumple', text: '#047857', bg: '#ECFDF5' },
  NA: { label: 'N/A', text: '#718096', bg: '#F7FAFC' },
};

function taintingBadgeColor(pct: number): { text: string; bg: string } {
  const abs = Math.abs(pct);
  if (abs === 0) return { text: '#9CA3AF', bg: '#F9FAFB' };
  if (abs < 5)   return { text: '#B45309', bg: '#FFFBEB' };
  if (abs < 25)  return { text: '#C2410C', bg: '#FFF7ED' };
  return              { text: '#B91C1C', bg: '#FEF2F2' };
}

export function renderSampleItemRegisterTable(value: unknown): string {
  const rows = Array.isArray(value) ? (value as SampleItemRowPdf[]) : [];
  if (rows.length === 0) return '<span class="text-muted text-small">— Sin ítems registrados —</span>';

  return `
    <table style="width:100%;border-collapse:collapse;font-size:8pt;">
      <thead>
        <tr style="background:#F7FAFC;">
          ${['#', 'Área', 'Ítem', 'Descripción', 'Valor en libros', 'Valor auditado', 'Diferencia', 'Tainting', 'Cumple', 'Fecha', 'Ref. ejecución', 'Evidencia']
            .map(h => `<th style="padding:2mm 2.5mm;border:1px solid #E2E8F0;text-align:left;color:#718096;font-size:7pt;text-transform:uppercase;white-space:nowrap;">${esc(h)}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${rows.map((r, i) => {
          const bv = typeof r.bookValue === 'number' ? r.bookValue : null;
          const av = typeof r.auditedValue === 'number' ? r.auditedValue : null;
          const diff = bv !== null && av !== null ? bv - av : null;
          const tainting = diff !== null && bv ? (diff / bv) * 100 : null;
          const col = tainting !== null ? taintingBadgeColor(tainting) : null;
          const cumpleBadge = r.cumple ? CUMPLE_BADGE[r.cumple] : null;
          const atts = Array.isArray(r.attachments) ? r.attachments : [];
          return `
          <tr style="${i % 2 === 1 ? 'background:#F7FAFC;' : ''}">
            <td style="padding:1.5mm 2.5mm;border:1px solid #E2E8F0;color:#718096;font-family:monospace;">${i + 1}</td>
            <td style="padding:1.5mm 2.5mm;border:1px solid #E2E8F0;color:#4A5568;">${esc(r.area)}</td>
            <td style="padding:1.5mm 2.5mm;border:1px solid #E2E8F0;color:#4A5568;font-family:monospace;">${esc(r.itemRef)}</td>
            <td style="padding:1.5mm 2.5mm;border:1px solid #E2E8F0;color:#4A5568;">${esc(r.descripcion)}</td>
            <td style="padding:1.5mm 2.5mm;border:1px solid #E2E8F0;text-align:right;font-family:monospace;color:#2D3748;">${bv !== null ? esc(fmtUSD(bv)) : '—'}</td>
            <td style="padding:1.5mm 2.5mm;border:1px solid #E2E8F0;text-align:right;font-family:monospace;color:#2D3748;">${av !== null ? esc(fmtUSD(av)) : '<span style="color:#CBD5E0;">sin examinar</span>'}</td>
            <td style="padding:1.5mm 2.5mm;border:1px solid #E2E8F0;text-align:right;font-family:monospace;${diff ? 'color:#DC2626;font-weight:700;' : 'color:#CBD5E0;'}">${diff !== null ? esc(fmtUSD(diff)) : '—'}</td>
            <td style="padding:1.5mm 2.5mm;border:1px solid #E2E8F0;text-align:center;">
              ${tainting !== null && col ? `<span style="display:inline-block;padding:0.5mm 2mm;border-radius:3mm;font-family:monospace;font-weight:700;font-size:7pt;color:${col.text};background:${col.bg};">${tainting.toFixed(1)}%</span>` : '<span style="color:#CBD5E0;">—</span>'}
            </td>
            <td style="padding:1.5mm 2.5mm;border:1px solid #E2E8F0;text-align:center;">
              ${cumpleBadge ? `<span style="display:inline-block;padding:0.5mm 2mm;border-radius:3mm;font-weight:700;font-size:7pt;color:${cumpleBadge.text};background:${cumpleBadge.bg};">${esc(cumpleBadge.label)}</span>` : '<span style="color:#CBD5E0;">—</span>'}
            </td>
            <td style="padding:1.5mm 2.5mm;border:1px solid #E2E8F0;color:#718096;font-size:7pt;white-space:nowrap;">${esc(r.fecha)}</td>
            <td style="padding:1.5mm 2.5mm;border:1px solid #E2E8F0;color:#4A5568;font-family:monospace;">${esc(r.execRef)}</td>
            <td style="padding:1.5mm 2.5mm;border:1px solid #E2E8F0;font-size:7pt;">${atts.length > 0 ? atts.map(a => esc(a.filename ?? 'archivo')).join('<br/>') : '<span style="color:#CBD5E0;">—</span>'}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

// ─── S4 — Evaluación de resultados (calculado) ───────────────────────────────

type Accion   = 'NINGUNA' | 'CERCA_DEL_LIMITE' | 'AMPLIAR_MUESTRA' | 'PROPONER_AJUSTE' | 'MODIFICAR_OPINION' | 'CONTROL_NO_EFECTIVO';
type Semaforo = 'VERDE' | 'AMARILLO' | 'NARANJA' | 'ROJO';

interface AreaResultPdf {
  area?: string; tipoMuestreo?: string; esMUS?: boolean; esAtributos?: boolean;
  itemsExaminados?: number; itemsConError?: number; erroresEncontrados?: number;
  nivelConfianzaPct?: number | null;
  precisionBasica?: number | null; errorMasProbable?: number | null;
  ampliacionPrecision?: number | null; limiteSuperiorError?: number | null;
  valorComparado?: number; uae?: number | null; me?: number | null; mg?: number | null;
  itemsConDesviacion?: number | null; tasaDesviacionMuestra?: number | null;
  limiteSuperiorDesviacion?: number | null; tasaDesviacionTolerable?: number | null;
  universoN?: number | null; nivelAlcancePct?: number | null;
  accion?: Accion; semaforo?: Semaforo;
  ampliacionSugerida?: { itemsAdicionales: number; muestraTotalSugerida: number } | null;
  nota?: string | null;
}

const SEMAFORO_COLOR: Record<Semaforo, { text: string; bg: string; border: string; dot: string }> = {
  VERDE:    { text: '#047857', bg: '#ECFDF5', border: '#A7F3D0', dot: '#10B981' },
  AMARILLO: { text: '#B45309', bg: '#FFFBEB', border: '#FDE68A', dot: '#F59E0B' },
  NARANJA:  { text: '#C2410C', bg: '#FFF7ED', border: '#FED7AA', dot: '#F97316' },
  ROJO:     { text: '#B91C1C', bg: '#FEF2F2', border: '#FECACA', dot: '#EF4444' },
};
const ACCION_LABEL_PDF: Record<Accion, string> = {
  NINGUNA:             'Ninguna acción adicional',
  CERCA_DEL_LIMITE:    'Cerca del límite — vigilar',
  AMPLIAR_MUESTRA:     'Ampliar la muestra',
  PROPONER_AJUSTE:     'Proponer ajuste (AJE)',
  MODIFICAR_OPINION:   'Evaluar modificación de opinión',
  CONTROL_NO_EFECTIVO: 'Control no operando efectivamente',
};

function thresholdBarPdf(value: number, uae: number | null | undefined, me: number | null | undefined, mg: number | null | undefined): string {
  const max = Math.max(value, mg ?? 0, me ?? 0, uae ?? 0, 1) * 1.15;
  const pct = (v: number) => Math.min(100, (v / max) * 100);
  const barColor = mg != null && value >= mg ? '#EF4444' : me != null && value >= me ? '#F97316' : uae != null && value >= uae ? '#F59E0B' : '#10B981';
  return `
    <div style="position:relative;height:2.5mm;border-radius:2mm;background:#F1F5F9;overflow:hidden;margin-top:1.5mm;">
      <div style="position:absolute;inset:0 auto 0 0;width:${pct(value)}%;background:${barColor};border-radius:2mm;"></div>
      ${me != null ? `<div style="position:absolute;inset:0 auto 0 ${pct(me)}%;border-left:0.5mm solid #F97316;"></div>` : ''}
      ${mg != null ? `<div style="position:absolute;inset:0 auto 0 ${pct(mg)}%;border-left:0.5mm solid #EF4444;"></div>` : ''}
    </div>
    <div style="display:flex;justify-content:space-between;font-size:6.5pt;color:#94A3B8;margin-top:0.5mm;">
      <span>$0</span>
      <span>${me != null ? `ME ${esc(fmtUSD(me))}` : ''} ${mg != null ? `&nbsp;&nbsp;MG ${esc(fmtUSD(mg))}` : ''}</span>
    </div>`;
}

function deviationBarPdf(value: number, tdt: number | null | undefined): string {
  const max = Math.max(value, tdt ?? 0, 1) * 1.15;
  const pct = (v: number) => Math.min(100, (v / max) * 100);
  const barColor = tdt != null && value >= tdt ? '#EF4444' : '#10B981';
  return `
    <div style="position:relative;height:2.5mm;border-radius:2mm;background:#F1F5F9;overflow:hidden;margin-top:1.5mm;">
      <div style="position:absolute;inset:0 auto 0 0;width:${pct(value)}%;background:${barColor};border-radius:2mm;"></div>
      ${tdt != null ? `<div style="position:absolute;inset:0 auto 0 ${pct(tdt)}%;border-left:0.5mm solid #EF4444;"></div>` : ''}
    </div>
    <div style="display:flex;justify-content:space-between;font-size:6.5pt;color:#94A3B8;margin-top:0.5mm;">
      <span>0%</span>
      <span>${tdt != null ? `TDT ${tdt.toFixed(1)}%` : ''}</span>
    </div>`;
}

function explainPlainPdf(f: AreaResultPdf): string {
  const examinados = f.itemsExaminados ?? 0;
  const conError = f.itemsConError ?? 0;
  if (f.esAtributos) {
    if (examinados === 0) return 'No hay ítems con resultado registrado todavía.';
    const desv = f.itemsConDesviacion ?? 0;
    const base = desv === 0
      ? `Ninguno de los ${examinados} ítems examinados presentó desviación.`
      : `${desv} de ${examinados} ítems examinados presentaron desviación (tasa de ${(f.tasaDesviacionMuestra ?? 0).toFixed(1)}%).`;
    if (f.tasaDesviacionTolerable == null) {
      return `${base} Falta definir la Tasa de Desviación Tolerable (TDT) en S2 para poder concluir si el control es efectivo.`;
    }
    return `${base} El límite superior de desviación llega a ${(f.limiteSuperiorDesviacion ?? 0).toFixed(1)}%, contra una tolerancia de ${f.tasaDesviacionTolerable.toFixed(1)}%.`;
  }
  if (!f.esMUS) {
    if (conError === 0) return `No se encontraron diferencias en los ${examinados} ítems examinados.`;
    return `Se encontraron ${conError} ítem(s) con diferencia de ${examinados} examinados, por un total de ${esc(fmtUSD(f.erroresEncontrados ?? 0))}. Al no proyectarse estadísticamente, ese monto se compara directo contra la materialidad.`;
  }
  if (conError === 0) {
    return `No se encontraron diferencias en los ${examinados} ítems examinados. Aun así se reserva un margen de ${esc(fmtUSD(f.precisionBasica ?? 0))} por si existen errores no detectados — el límite superior de error queda en ${esc(fmtUSD(f.limiteSuperiorError ?? 0))}.`;
  }
  return `De ${examinados} ítems examinados, ${conError} tuvieron diferencia. Proyectado a toda el área, el error más probable es ${esc(fmtUSD(f.errorMasProbable ?? 0))}; considerando el margen por riesgo de muestreo, el límite superior de error llega a ${esc(fmtUSD(f.limiteSuperiorError ?? 0))}.`;
}

function areaCardPdf(f: AreaResultPdf): string {
  const sem = SEMAFORO_COLOR[f.semaforo ?? 'VERDE'];
  const metrics = f.esAtributos
    ? [
        ['Tasa de desviación (muestra)', f.tasaDesviacionMuestra != null ? `${f.tasaDesviacionMuestra.toFixed(1)}%` : '—'],
        ['Límite superior de desviación', f.limiteSuperiorDesviacion != null ? `${f.limiteSuperiorDesviacion.toFixed(1)}%` : '—'],
        ['Tasa de desviación tolerable (TDT)', f.tasaDesviacionTolerable != null ? `${f.tasaDesviacionTolerable.toFixed(1)}%` : '— (definir en S2)'],
        ['Nivel de confianza', f.nivelConfianzaPct != null ? `${f.nivelConfianzaPct}%` : '—'],
      ]
    : f.esMUS
    ? [
        ['Error más probable (MLE)', fmtUSD(f.errorMasProbable ?? 0)],
        ['Precisión básica', fmtUSD(f.precisionBasica ?? 0)],
        ['Ampliación de precisión', fmtUSD(f.ampliacionPrecision ?? 0)],
        ['Límite superior de error (UEL)', fmtUSD(f.limiteSuperiorError ?? 0)],
      ]
    : [
        ['Diferencias encontradas', fmtUSD(f.erroresEncontrados ?? 0)],
        ['Nivel de confianza', f.nivelConfianzaPct != null ? `${f.nivelConfianzaPct}%` : '—'],
      ];

  const alcance = f.nivelAlcancePct != null
    ? `<span style="display:inline-flex;align-items:center;font-size:7pt;font-weight:700;padding:1mm 2.5mm;border-radius:5mm;color:#1D4ED8;background:#EFF6FF;border:0.3mm solid #BFDBFE;white-space:nowrap;">Alcance ${f.nivelAlcancePct.toFixed(1)}%</span>`
    : '';

  return `
    <div class="no-break" style="border:1px solid ${sem.border};border-radius:3mm;padding:3mm;margin-bottom:3mm;background:#FFFFFF;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:2mm;flex-wrap:wrap;">
        <div>
          <p style="font-size:9pt;font-weight:700;color:#2D3748;margin:0;">${esc(f.area)}</p>
          <p style="font-size:7pt;color:#94A3B8;margin:0.5mm 0 0 0;">${esc(f.tipoMuestreo)} · ${f.itemsExaminados ?? 0} examinados · ${f.esAtributos ? `${f.itemsConDesviacion ?? 0} con desviación` : `${f.itemsConError ?? 0} con diferencia`}</p>
        </div>
        <div style="display:flex;align-items:center;gap:1.5mm;flex-wrap:wrap;">
          ${alcance}
          <span style="display:inline-flex;align-items:center;gap:1mm;font-size:7pt;font-weight:700;padding:1mm 2.5mm;border-radius:5mm;color:${sem.text};background:${sem.bg};border:0.3mm solid ${sem.border};white-space:nowrap;">
            <span style="display:inline-block;width:2mm;height:2mm;border-radius:50%;background:${sem.dot};"></span>
            ${esc(ACCION_LABEL_PDF[f.accion ?? 'NINGUNA'])}
          </span>
        </div>
      </div>

      ${f.nota ? `<p style="font-size:7pt;color:#B45309;background:#FFFBEB;border:0.3mm solid #FDE68A;border-radius:2mm;padding:1mm 2mm;margin:2mm 0 0 0;">⚠ ${esc(f.nota)}</p>` : ''}

      <div style="display:flex;gap:2mm;margin-top:2.5mm;flex-wrap:wrap;">
        ${metrics.map(([label, v]) => `
          <div style="background:#F8FAFC;border-radius:2mm;padding:1.5mm 2.5mm;flex:1;min-width:32mm;">
            <p style="font-size:6.5pt;color:#94A3B8;text-transform:uppercase;margin:0 0 0.5mm 0;">${esc(label)}</p>
            <p style="font-size:9pt;font-weight:700;font-family:monospace;color:#2D3748;margin:0;">${esc(v)}</p>
          </div>`).join('')}
      </div>

      ${f.esAtributos ? deviationBarPdf(f.tasaDesviacionMuestra ?? 0, f.tasaDesviacionTolerable) : thresholdBarPdf(f.valorComparado ?? 0, f.uae, f.me, f.mg)}

      <p style="font-size:7.5pt;color:#64748B;font-style:italic;margin:2mm 0 0 0;line-height:1.4;">${explainPlainPdf(f)}</p>

      ${f.ampliacionSugerida ? `
        <div style="margin-top:2mm;font-size:7.5pt;color:#B45309;background:#FFFBEB;border:0.3mm solid #FDE68A;border-radius:2mm;padding:1.5mm 2.5mm;">
          📈 Ampliación sugerida: examinar <strong>${f.ampliacionSugerida.itemsAdicionales}</strong> ítem(s) adicional(es)
          (muestra total ≈ ${f.ampliacionSugerida.muestraTotalSugerida}) para reducir el margen de riesgo por debajo de ${f.esAtributos ? 'la tolerancia' : 'la materialidad'}.
        </div>` : ''}
    </div>`;
}

export function renderSamplingEvaluationBlock(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return '<span class="text-muted text-small">— Sin evaluación calculada. Complete S5 y recalcule desde la pantalla del papel. —</span>';
  }
  const v = value as { filas?: AreaResultPdf[]; calculadoEn?: string; totalErrorProyectado?: number };
  const filas = Array.isArray(v.filas) ? v.filas : [];
  if (filas.length === 0) {
    return '<span class="text-muted text-small">— Sin evaluación calculada. Complete S5 y recalcule desde la pantalla del papel. —</span>';
  }
  const areasEnAccion = filas.filter(f => f.accion === 'PROPONER_AJUSTE' || f.accion === 'MODIFICAR_OPINION').length;
  const calculadoEn = v.calculadoEn ? new Date(v.calculadoEn).toLocaleString('es-SV', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

  return `
    <div style="font-size:8pt;">
      <div style="display:flex;gap:4mm;align-items:center;flex-wrap:wrap;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:2mm;padding:2mm 3mm;margin-bottom:3mm;">
        <span style="color:#718096;">${filas.length} área(s) evaluada(s)</span>
        ${areasEnAccion > 0 ? `<span style="color:#C2410C;font-weight:700;">${areasEnAccion} requiere(n) ajuste o escalamiento</span>` : ''}
        <span style="margin-left:auto;color:#718096;">Total proyectado: <strong style="color:#2D3748;">${esc(fmtUSD(v.totalErrorProyectado ?? 0))}</strong></span>
        <span style="color:#94A3B8;font-size:7pt;">Calculado: ${esc(calculadoEn)}</span>
      </div>
      ${filas.map(areaCardPdf).join('')}
    </div>`;
}
