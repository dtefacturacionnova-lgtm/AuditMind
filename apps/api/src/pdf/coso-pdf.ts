/**
 * Renderizado PDF específico de PT-COSO — evaluación COSO 2013 (5 componentes / 17 principios).
 * Mirrors the scoring math in apps/web/.../CosoScorePanel.tsx (client, screen-only) so the
 * PDF shows the exact same puntaje/bandas/gráficos, computed server-side from the raw
 * MATRIX rows since Puppeteer never runs the React/recharts code.
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

// ─── Score engine (mirrors CosoScorePanel.tsx) ───────────────────────────────

const ACCENT_MAP: Record<string, string> = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ñ: 'n', ü: 'u' };
function normalize(s: string): string {
  return s.toLowerCase().split('').map(ch => ACCENT_MAP[ch] ?? ch).join('');
}
function findKey(row: Record<string, unknown>, patterns: string[]): string | undefined {
  const keys = Object.keys(row);
  for (const p of patterns) {
    const found = keys.find(k => normalize(k).includes(p));
    if (found) return found;
  }
  return undefined;
}
function normAnswer(raw: unknown): 'si' | 'no' | 'na' | null {
  const n = normalize(String(raw ?? '')).replace(/[^a-z]/g, '');
  if (n === 'si') return 'si';
  if (n === 'no') return 'no';
  if (n === 'na') return 'na';
  return null;
}

interface CosoSection { sectionKey: string; value: unknown }

const COMPONENTS: { sectionKey: string; label: string; short: string; weight: number }[] = [
  { sectionKey: 'S1', label: 'Entorno de Control',        short: 'Entorno',   weight: 25 },
  { sectionKey: 'S2', label: 'Evaluación de Riesgos',      short: 'Riesgos',   weight: 25 },
  { sectionKey: 'S3', label: 'Actividades de Control',     short: 'Controles', weight: 20 },
  { sectionKey: 'S4', label: 'Información y Comunicación', short: 'Info/Com.', weight: 15 },
  { sectionKey: 'S5', label: 'Actividades de Monitoreo',   short: 'Monitoreo', weight: 15 },
];

const BANDS = [
  { min: 100, max: 175, confMin: 75, confMax: 100, label: 'Efectivo',      color: '#10b981', bg: '#ecfdf5', border: '#a7f3d0' },
  { min: 176, max: 250, confMin: 50, confMax: 74,  label: 'Confiable',       color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  { min: 251, max: 325, confMin: 25, confMax: 49,  label: 'Poco Confiable',  color: '#ea580c', bg: '#fff7ed', border: '#fed7aa' },
  { min: 326, max: 400, confMin: 0,  confMax: 24,  label: 'No Confiable',    color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
];
function bandFor(score: number) {
  return BANDS.find(b => score >= b.min && score <= b.max) ?? BANDS[BANDS.length - 1];
}
function riskColor(confidencePct: number): string {
  if (confidencePct >= 75) return '#10b981';
  if (confidencePct >= 50) return '#d97706';
  if (confidencePct >= 25) return '#ea580c';
  return '#dc2626';
}

interface PrincipleResult { principio: string; short: string; confidencePct: number | null; risk: number | null; answered: number; total: number }
interface ComponentResult {
  sectionKey: string; label: string; short: string; weight: number;
  principles: PrincipleResult[]; avg: number | null; puntaje: number | null; confidencePct: number | null;
  answeredPrinciples: number; totalPrinciples: number;
}

function computeComponent(section: CosoSection | undefined, meta: { sectionKey: string; label: string; short: string; weight: number }): ComponentResult {
  const rows = Array.isArray(section?.value) ? (section!.value as Record<string, unknown>[]) : [];
  const principioKey = rows.length > 0 ? findKey(rows[0], ['principio']) : undefined;
  const respuestaKey = rows.length > 0 ? findKey(rows[0], ['respuesta']) : undefined;

  const order: string[] = [];
  const byPrincipio = new Map<string, { si: number; no: number; total: number }>();
  for (const r of rows) {
    const principio = principioKey ? String(r[principioKey] ?? '').trim() : '';
    if (!principio) continue;
    if (!byPrincipio.has(principio)) { byPrincipio.set(principio, { si: 0, no: 0, total: 0 }); order.push(principio); }
    const stat = byPrincipio.get(principio)!;
    stat.total += 1;
    const ans = respuestaKey ? normAnswer(r[respuestaKey]) : null;
    if (ans === 'si') stat.si += 1;
    if (ans === 'no') stat.no += 1;
  }

  const principles: PrincipleResult[] = order.map(principio => {
    const stat = byPrincipio.get(principio)!;
    const answered = stat.si + stat.no;
    const confidencePct = answered > 0 ? (stat.si / answered) * 100 : null;
    const risk = confidencePct !== null ? 4 - (confidencePct / 100) * 3 : null;
    const m = principio.match(/^(P\d+)/);
    return { principio, short: m ? m[1] : principio, confidencePct, risk, answered, total: stat.total };
  });

  const scored = principles.filter((p): p is PrincipleResult & { risk: number } => p.risk !== null);
  const avg = scored.length > 0 ? scored.reduce((s, p) => s + p.risk, 0) / scored.length : null;
  const puntaje = avg !== null ? avg * meta.weight : null;
  const confidencePct = avg !== null ? ((4 - avg) / 3) * 100 : null;

  return { ...meta, principles, avg, puntaje, confidencePct, answeredPrinciples: scored.length, totalPrinciples: principles.length };
}

function computeCosoScore(sections: CosoSection[]) {
  const byKey = new Map(sections.map(s => [s.sectionKey, s]));
  const componentData = COMPONENTS.map(c => computeComponent(byKey.get(c.sectionKey), c));
  const totalAnswered = componentData.reduce((s, c) => s + c.answeredPrinciples, 0);
  const totalPrinciples = componentData.reduce((s, c) => s + c.totalPrinciples, 0);
  const allComplete = componentData.every(c => c.totalPrinciples > 0 && c.answeredPrinciples === c.totalPrinciples);
  const anyData = componentData.some(c => c.answeredPrinciples > 0);
  const totalScore = componentData.reduce((s, c) => s + (c.puntaje ?? 0), 0);
  const totalConfidencePct = Math.min(100, Math.max(0, ((400 - totalScore) / 300) * 100));
  return { componentData, totalAnswered, totalPrinciples, allComplete, anyData, totalScore, totalConfidencePct, band: bandFor(totalScore) };
}

// ─── Renderers ────────────────────────────────────────────────────────────────

function renderBandMatrix(): string {
  const implication: Record<string, string> = {
    'Efectivo':       'Enfoque de controles — pruebas sustantivas reducidas',
    'Confiable':        'Enfoque mixto — validar las áreas débiles',
    'Poco Confiable':   'Enfoque sustantivo ampliado',
    'No Confiable':     'Enfoque sustantivo máximo — reportar como debilidad material',
  };
  return `
    <table class="text-small" style="width:100%;">
      <thead><tr><th style="width:14mm;">Semáforo</th><th style="width:26mm;">Puntos (100-400)</th><th style="width:24mm;">Confianza</th><th style="width:32mm;">Resultado</th><th>Implica para el enfoque de auditoría</th></tr></thead>
      <tbody>
        ${BANDS.map(b => `
          <tr>
            <td><span style="display:inline-block;width:3mm;height:3mm;border-radius:50%;background:${b.color};"></span></td>
            <td>${b.min}–${b.max}</td>
            <td>${b.confMin}%–${b.confMax}%</td>
            <td style="font-weight:600;color:${b.color};">${b.label}</td>
            <td class="text-muted">${esc(implication[b.label])}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function renderGuide(): string {
  const steps = [
    ['1. Pregunta',        'Cada Principio se descompone en preguntas objetivas (Points of Focus). Se responde Sí / No / N-A con evidencia.'],
    ['2. Principio',       'El % de "Sí" entre las preguntas respondidas de un Principio determina su nivel de confianza.'],
    ['3. Componente',      'El componente promedia sus Principios y se pondera 25/25/20/15/15 — total 100-400 puntos.'],
    ['4. Juicio del auditor', 'La "Evaluación" de cada componente (EFECTIVO/DEBILIDAD…) es la conclusión final del auditor — el sistema solo aporta el insumo objetivo.'],
  ];
  return `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:3mm;margin:3mm 0;">
      ${steps.map(([t, d]) => `
        <div style="background:#F7FAFC;border-radius:2mm;padding:3mm;">
          <p style="font-size:8pt;font-weight:700;color:#7c3aed;margin:0 0 1mm 0;">${esc(t)}</p>
          <p style="font-size:8pt;color:#4A5568;margin:0;line-height:1.4;">${esc(d)}</p>
        </div>`).join('')}
    </div>`;
}

function renderScoreSummary(score: ReturnType<typeof computeCosoScore>): string {
  const { totalScore, totalConfidencePct, band, allComplete, totalAnswered, totalPrinciples } = score;
  const pct = Math.min(100, Math.max(0, ((totalScore - 100) / 300) * 100));
  return `
    <div class="no-break" style="border:1px solid #E2E8F0;border-radius:3mm;padding:5mm;margin:3mm 0;">
      <div style="display:flex;align-items:baseline;gap:8mm;margin-bottom:3mm;">
        <div><span style="font-size:20pt;font-weight:700;color:${band.color};">${totalScore.toFixed(0)}</span><span style="font-size:8pt;color:#A0AEC0;"> / 400</span></div>
        <div><span style="font-size:20pt;font-weight:700;color:${band.color};">${totalConfidencePct.toFixed(0)}%</span><span style="font-size:8pt;color:#A0AEC0;"> confianza global</span></div>
        <span style="display:inline-block;padding:1.5mm 4mm;border-radius:5mm;font-size:9pt;font-weight:700;color:${band.color};background:${band.bg};border:1px solid ${band.border};">${esc(band.label)}</span>
        ${!allComplete ? `<span style="font-size:7.5pt;color:#B45309;">${totalAnswered}/${totalPrinciples} principios calificados — puntaje parcial</span>` : ''}
      </div>
      <div style="position:relative;height:3mm;border-radius:1.5mm;overflow:hidden;display:flex;">
        ${BANDS.map(b => `<div style="flex:${b.max - b.min + (b.min === 100 ? 1 : 0)};background:${b.color};opacity:0.25;"></div>`).join('')}
        <div style="position:absolute;top:-0.5mm;height:4mm;width:1mm;background:#2D3748;border-radius:1mm;left:calc(${pct}% - 0.5mm);"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:6.5pt;color:#A0AEC0;margin-top:1mm;">
        <span>100 · Efectivo</span><span>175</span><span>250</span><span>325</span><span>400 · No Confiable</span>
      </div>
    </div>`;
}

function renderContributionTable(componentData: ComponentResult[], totalScore: number, band: { color: string }): string {
  return `
    <table class="text-small" style="width:100%;">
      <thead><tr><th>Componente</th><th style="width:22mm;">Confianza</th><th style="width:16mm;">Peso</th><th style="width:20mm;">Puntaje</th></tr></thead>
      <tbody>
        ${componentData.map(c => `
          <tr>
            <td>${esc(c.label)}</td>
            <td>${c.confidencePct !== null ? c.confidencePct.toFixed(0) + '%' : '—'}</td>
            <td class="text-muted">${c.weight}%</td>
            <td style="font-weight:600;">${c.puntaje !== null ? c.puntaje.toFixed(1) : '—'}</td>
          </tr>`).join('')}
        <tr style="font-weight:700;"><td colspan="3">Total</td><td style="color:${band.color};">${totalScore.toFixed(1)}</td></tr>
      </tbody>
    </table>`;
}

/** Pentagon radar chart (5 componentes, dominio de riesgo 0-4) — SVG estático, Chromium lo rasteriza nativo. */
function renderRadarSvg(componentData: ComponentResult[]): string {
  const cx = 100, cy = 100, maxR = 74;
  const angleAt = (i: number) => (-90 + i * 72) * (Math.PI / 180);
  const polar = (angle: number, r: number) => ({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });

  const rings = [0.25, 0.5, 0.75, 1].map(f => {
    const pts = componentData.map((_, i) => polar(angleAt(i), maxR * f));
    return `<polygon points="${pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}" fill="none" stroke="#E2E8F0" stroke-width="0.6" />`;
  }).join('');

  const axes = componentData.map((_, i) => {
    const p = polar(angleAt(i), maxR);
    return `<line x1="${cx}" y1="${cy}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" stroke="#E2E8F0" stroke-width="0.6" />`;
  }).join('');

  const dataPts = componentData.map((c, i) => polar(angleAt(i), ((c.avg ?? 0) / 4) * maxR));
  const dataPolygon = `<polygon points="${dataPts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}" fill="#7c3aed" fill-opacity="0.22" stroke="#7c3aed" stroke-width="1.5" />`;

  const labels = componentData.map((c, i) => {
    const p = polar(angleAt(i), maxR + 14);
    const anchor = Math.abs(p.x - cx) < 4 ? 'middle' : p.x > cx ? 'start' : 'end';
    return `<text x="${p.x.toFixed(1)}" y="${p.y.toFixed(1)}" font-size="8" fill="#4A5568" text-anchor="${anchor}" dominant-baseline="middle">${esc(c.short)}</text>`;
  }).join('');

  return `<svg viewBox="0 0 200 200" width="70mm" height="70mm">${rings}${axes}${dataPolygon}${labels}</svg>`;
}

function renderHorizontalBars(rows: { label: string; pct: number; hasData: boolean }[], referenceLine?: number): string {
  return `
    <div style="position:relative;padding-top:${referenceLine != null ? '4mm' : '0'};">
      ${referenceLine != null ? `
        <div style="position:absolute;top:4mm;bottom:0;left:38mm;right:14mm;">
          <div style="position:absolute;top:-3mm;left:${referenceLine}%;transform:translateX(-50%);font-size:6.5pt;color:#718096;white-space:nowrap;">${referenceLine.toFixed(0)}% global</div>
          <div style="position:absolute;top:0;bottom:0;left:${referenceLine}%;border-left:0.5mm dashed #718096;"></div>
        </div>` : ''}
      ${rows.map(r => `
        <div style="display:flex;align-items:center;gap:2mm;margin:1.2mm 0;">
          <div style="width:36mm;font-size:7.5pt;color:#4A5568;flex-shrink:0;">${esc(r.label)}</div>
          <div style="flex:1;background:#F1F5F9;border-radius:1mm;height:3.5mm;position:relative;">
            <div style="width:${Math.max(1, r.pct)}%;height:100%;border-radius:1mm;background:${r.hasData ? riskColor(r.pct) : '#E2E8F0'};"></div>
          </div>
          <div style="width:12mm;font-size:7.5pt;color:#64748B;text-align:right;flex-shrink:0;">${r.hasData ? r.pct.toFixed(0) + '%' : '—'}</div>
        </div>`).join('')}
    </div>`;
}

/** Bloque completo — se inserta al inicio de la pestaña "Resultados y Conclusión", antes de S6. */
export function renderCosoResultsBlock(sections: CosoSection[]): string {
  const score = computeCosoScore(sections);

  if (!score.anyData) {
    return `
      <div class="no-break" style="margin-bottom:4mm;">
        <h3>¿Cómo se evalúa este Sistema de Control Interno?</h3>
        ${renderGuide()}
        <p class="text-muted text-small">Puntaje Ponderado del SCI: se calculará cuando se respondan las preguntas (Sí/No/N-A) de los 5 componentes. Aún no hay respuestas registradas.</p>
        <p class="text-muted text-small" style="margin-top:2mm;">Matriz de bandas de referencia:</p>
        ${renderBandMatrix()}
      </div>`;
  }

  const componentBarRows = score.componentData.map(c => ({ label: `${c.short} (${c.weight}%)`, pct: c.confidencePct ?? 0, hasData: c.confidencePct !== null }));
  const allPrinciplesRows = score.componentData.flatMap(c =>
    c.principles.filter(p => p.confidencePct !== null).map(p => ({ label: `${p.short} — ${c.short}`, pct: p.confidencePct as number, hasData: true })),
  );

  return `
    <div class="no-break" style="margin-bottom:4mm;">
      <h3>¿Cómo se evalúa este Sistema de Control Interno?</h3>
      ${renderGuide()}
      <p class="text-small text-muted" style="margin:2mm 0 1mm 0;">Matriz de bandas</p>
      ${renderBandMatrix()}
    </div>

    <div class="no-break" style="margin-bottom:4mm;">
      <h3>Puntaje Ponderado del SCI</h3>
      ${renderScoreSummary(score)}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6mm;align-items:start;">
        <div style="text-align:center;">${renderRadarSvg(score.componentData)}</div>
        <div>${renderContributionTable(score.componentData, score.totalScore, score.band)}</div>
      </div>
    </div>

    <div class="no-break" style="margin-bottom:4mm;">
      <p style="font-size:8pt;font-weight:700;color:#718096;text-transform:uppercase;margin:0 0 2mm 0;">Nivel componente — confianza (%), línea punteada = resultado global</p>
      ${renderHorizontalBars(componentBarRows, score.totalConfidencePct)}
    </div>

    ${allPrinciplesRows.length > 0 ? `
      <div style="margin-bottom:4mm;">
        <p style="font-size:8pt;font-weight:700;color:#718096;text-transform:uppercase;margin:0 0 2mm 0;">Confianza por principio (%) — verde ≥75% · ámbar ≥50% · naranja ≥25% · rojo &lt;25%</p>
        ${renderHorizontalBars(allPrinciplesRows)}
      </div>` : ''}
  `;
}

/** Tabla de preguntas de un componente (S1-S5) — agrupa por Principio con tally Sí/No/N-A, como en la grilla en pantalla. */
export function renderCosoQuestionTable(rows: unknown[]): string {
  const objRows = rows.filter(r => r && typeof r === 'object' && !Array.isArray(r)) as Array<Record<string, unknown>>;
  if (objRows.length === 0) return '<span class="text-muted text-small">— Sin preguntas cargadas —</span>';

  const principioKey  = findKey(objRows[0], ['principio']) ?? 'Principio';
  const preguntaKey   = findKey(objRows[0], ['pregunta']) ?? 'Pregunta';
  const respuestaKey  = findKey(objRows[0], ['respuesta']);
  const evidenciaKey  = findKey(objRows[0], ['evidencia']);

  const ANSWER_COLOR: Record<string, string> = { si: '#059669', no: '#DC2626', na: '#718096' };
  const ANSWER_BG: Record<string, string>    = { si: '#ECFDF5', no: '#FEF2F2', na: '#F7FAFC' };

  let html = `<table class="text-small" style="width:100%;">
    <thead><tr><th>Pregunta</th><th style="width:22mm;">Respuesta</th><th style="width:40mm;">Evidencia y Observaciones</th></tr></thead>
    <tbody>`;

  let lastPrincipio = '';
  for (const r of objRows) {
    const principio = String(r[principioKey] ?? '');
    if (principio !== lastPrincipio) {
      const groupRows = objRows.filter(x => String(x[principioKey] ?? '') === principio);
      const answered = respuestaKey ? groupRows.map(x => normAnswer(x[respuestaKey])) : [];
      const si = answered.filter(a => a === 'si').length;
      const total = answered.filter(a => a === 'si' || a === 'no').length;
      html += `<tr style="background:#F7FAFC;"><td colspan="3" style="font-weight:700;color:#4A5568;">
        ${esc(principio)}
        ${total > 0 ? `<span style="margin-left:2mm;font-size:7pt;font-weight:600;padding:0.5mm 2mm;border-radius:3mm;background:${si === total ? '#ECFDF5' : si === 0 ? '#FEF2F2' : '#FFFBEB'};color:${si === total ? '#059669' : si === 0 ? '#DC2626' : '#B45309'};">${si}/${total} Sí</span>` : ''}
      </td></tr>`;
      lastPrincipio = principio;
    }
    const ans = respuestaKey ? normAnswer(r[respuestaKey]) : null;
    const ansLabel = respuestaKey ? String(r[respuestaKey] ?? '').trim() : '';
    html += `<tr>
      <td>${esc(r[preguntaKey] ?? '—')}</td>
      <td>${ansLabel ? `<span style="display:inline-block;padding:0.5mm 2mm;border-radius:3mm;font-size:7.5pt;font-weight:600;color:${ANSWER_COLOR[ans ?? ''] ?? '#4A5568'};background:${ANSWER_BG[ans ?? ''] ?? '#F7FAFC'};">${esc(ansLabel)}</span>` : '<span class="text-muted">—</span>'}</td>
      <td class="text-small">${evidenciaKey && r[evidenciaKey] ? esc(r[evidenciaKey]) : '<span class="text-muted">—</span>'}</td>
    </tr>`;
  }
  html += '</tbody></table>';
  return html;
}
