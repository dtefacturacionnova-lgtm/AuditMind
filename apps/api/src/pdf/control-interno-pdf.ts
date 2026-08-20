/**
 * Renderizado PDF del Reporte Integrado de Control Interno — Fase 7 del plan
 * (docs/modelo-integrado-control-interno-analisis.md §8.9). Ensambla en una
 * sola página: flujograma (con carriles y marcadores de la Fase 2, vía
 * renderFlowchartDiagramSvg) + tabla de controles Inherente/Residual + mapa
 * de calor Área×Nivel (alternativa de menor esfuerzo del §8.9 — reutiliza
 * PT-MRCI S3 tal cual, sin separar PT-A2 en Probabilidad×Impacto) + resumen
 * numérico + conclusión + recomendaciones.
 *
 * Mismo patrón que coso-pdf.ts/nia530-pdf.ts: funciones puras que devuelven
 * HTML, ensambladas por el caller dentro de PdfService.generateBranded().
 */
import { renderFlowchartDiagramSvg } from './pdf-templates';
import type { IntegratedReportData, IntegratedReportControlRow } from '../working-papers/risk-trace.service';

function esc(s: unknown): string {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const RESIDUAL_BADGE: Record<string, string> = {
  bajo: 'badge-low', moderado: 'badge-medium', alto: 'badge-high', 'muy alto': 'badge-critical',
};
function residualBadgeClass(level: string): string {
  return RESIDUAL_BADGE[level.toLowerCase().trim()] ?? 'badge-info';
}

function renderControlTable(rows: IntegratedReportControlRow[]): string {
  if (rows.length === 0) {
    return '<p class="text-muted text-small">PT-MRCI todavía no tiene filas — la tabla de controles aparecerá aquí una vez documentado.</p>';
  }
  return `
    <table class="text-small">
      <thead><tr>
        <th style="width:32%">Riesgo</th>
        <th style="width:28%">Control Mitigante</th>
        <th style="width:13%">R. Inherente</th>
        <th style="width:13%">R. Residual</th>
        <th style="width:14%">Ref.</th>
      </tr></thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td>${esc(r.riesgo) || '<span class="text-muted">—</span>'}</td>
            <td>${esc(r.controlMitigante) || '<span class="text-muted">Sin control identificado</span>'}</td>
            <td>${r.riesgoInherente !== '—' ? `<span class="badge ${residualBadgeClass(r.riesgoInherente)}">${esc(r.riesgoInherente)}</span>` : '<span class="text-muted">—</span>'}</td>
            <td><span class="badge ${residualBadgeClass(r.riesgoResidual)}">${esc(r.riesgoResidual)}</span></td>
            <td class="text-small text-muted">${esc(r.refRiesgo)}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function renderHeatMap(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) {
    return '<p class="text-muted text-small">PT-MRCI S3 (Mapa de Calor por Área) todavía no tiene filas.</p>';
  }
  const cols = Object.keys(rows[0]).filter(k => !k.startsWith('_'));
  const concentracionCol = cols.find(c => /concentraci[oó]n/i.test(c));
  return `
    <table class="text-small">
      <thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            ${cols.map(c => {
              const val = String(r[c] ?? '');
              const isConc = c === concentracionCol;
              const cls = isConc && /alta/i.test(val) ? 'badge-critical' : isConc && /media/i.test(val) ? 'badge-medium' : isConc && /baja/i.test(val) ? 'badge-low' : '';
              return `<td>${cls ? `<span class="badge ${cls}">${esc(val)}</span>` : esc(val)}</td>`;
            }).join('')}
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function renderSummaryStrip(summary: IntegratedReportData['summary']): string {
  const { totalRiesgos, porNivel, pctReduccion } = summary;
  const chip = (label: string, n: number, cls: string) => `
    <div style="flex:1;text-align:center;padding:3mm 2mm;">
      <div style="font-size:20pt;font-weight:700;" class="${cls}">${n}</div>
      <div style="font-size:8pt;color:#718096;text-transform:uppercase;letter-spacing:0.5px;">${esc(label)}</div>
    </div>`;
  return `
    <div class="meta-strip" style="display:flex;align-items:center;">
      ${chip('Total Riesgos', totalRiesgos, '')}
      ${chip('Bajo', porNivel['Bajo'] ?? 0, 'text-muted')}
      ${chip('Moderado', porNivel['Moderado'] ?? 0, '')}
      ${chip('Alto', porNivel['Alto'] ?? 0, '')}
      ${chip('Muy Alto', porNivel['Muy Alto'] ?? 0, '')}
      ${pctReduccion !== null ? chip('% Reducción Inherente→Residual', pctReduccion, '') : ''}
    </div>`;
}

export function renderIntegratedReportBody(data: IntegratedReportData): string {
  const parts: string[] = [];

  parts.push(`<h1>Resumen Numérico</h1>`);
  parts.push(renderSummaryStrip(data.summary));

  parts.push(`<h1>Flujograma del Proceso</h1>`);
  if (data.flowchart) {
    parts.push(`<p class="text-small text-muted">Fuente: ${esc(data.flowchartPaperTitle ?? '')}</p>`);
    parts.push(`<div class="no-break">${renderFlowchartDiagramSvg(data.flowchart as unknown as Record<string, unknown>)}</div>`);
  } else {
    parts.push('<p class="text-muted text-small">Este encargo no tiene un flujograma documentado todavía.</p>');
  }

  parts.push(`<div class="page-break"></div>`);
  parts.push(`<h1>Controles — Riesgo Inherente vs. Residual</h1>`);
  parts.push(renderControlTable(data.controlRows));

  parts.push(`<h1>Mapa de Calor — Riesgo Residual por Área</h1>`);
  parts.push(renderHeatMap(data.heatMap));

  parts.push(`<h1>Conclusión</h1>`);
  parts.push(data.conclusion
    ? `<blockquote class="pre-wrap">${esc(data.conclusion)}</blockquote>`
    : '<p class="text-muted text-small">PT-MRCI S4 (Conclusión) todavía no está redactada.</p>');

  parts.push(`<h1>Recomendaciones</h1>`);
  if (data.recommendations.length > 0) {
    parts.push(`
      <table class="text-small">
        <thead><tr><th style="width:80%">Recomendación</th><th>Fuente</th></tr></thead>
        <tbody>
          ${data.recommendations.map(r => `<tr><td>${esc(r.descripcion)}</td><td class="text-muted">${esc(r.fuente)}</td></tr>`).join('')}
        </tbody>
      </table>`);
  } else {
    parts.push('<p class="text-muted text-small">Sin recomendaciones registradas en PT-NIA265 o PT-COSO S8.</p>');
  }

  parts.push(`
    <div class="signature-block">
      <div class="signature-line"></div>
      <p>Firma del Socio / CAE — Aprobación de la Evaluación de Control Interno</p>
    </div>`);

  return parts.join('\n');
}
