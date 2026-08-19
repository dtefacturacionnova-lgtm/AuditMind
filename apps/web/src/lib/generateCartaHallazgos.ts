import type { WpPaperSection } from '@/hooks/useWorkingPapers';

function sval(sections: WpPaperSection[], key: string): string {
  const s = sections.find(s => s.sectionKey === key);
  if (!s || s.value === null || s.value === undefined) return '';
  return String(s.value).trim();
}

type MatrixRow = Record<string, string>;

/** Mismo parseo que MatrixGridPanel.parseValue — el value de una sección MATRIX
 *  puede llegar ya como array o como string JSON, según el punto del ciclo de
 *  vida del papel. Descarta las claves "_"-prefijadas (id/nota/adjuntos internos
 *  del grid), que no son columnas de datos. */
function matrixRows(sections: WpPaperSection[], key: string): MatrixRow[] {
  const s = sections.find(s => s.sectionKey === key);
  if (!s) return [];
  try {
    const parsed: unknown = Array.isArray(s.value) ? s.value : JSON.parse(String(s.value ?? '[]'));
    if (!Array.isArray(parsed)) return [];
    return (parsed as Record<string, unknown>[])
      .filter(r => r && typeof r === 'object')
      .map(r => Object.fromEntries(
        Object.entries(r)
          .filter(([k]) => !k.startsWith('_'))
          .map(([k, val]) => [k, val == null ? '' : String(val)]),
      ));
  } catch {
    return [];
  }
}

/** PT-HALL-COM no tiene columnas fijas (MATRIX genérico) — se derivan del orden
 *  de aparición real de las filas, igual que MatrixGridPanel.deriveColumns. */
function matrixColumns(rows: MatrixRow[]): string[] {
  const seen = new Set<string>();
  const cols: string[] = [];
  for (const row of rows) {
    for (const k of Object.keys(row)) {
      if (!seen.has(k)) { seen.add(k); cols.push(k); }
    }
  }
  return cols;
}

export async function generateCartaHallazgos(sections: WpPaperSection[]): Promise<Blob> {
  const {
    Document, Packer, Paragraph, TextRun, AlignmentType,
    Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
  } = await import('docx');

  const v = (key: string) => sval(sections, key);

  const noBorder = {
    top:    { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    left:   { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    right:  { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  };

  function textLines(text: string) {
    if (!text) return [new Paragraph({ children: [new TextRun({ text: ' ' })] })];
    return text.split('\n').map(
      line => new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: line || ' ' })] }),
    );
  }

  function heading(label: string) {
    return new Paragraph({
      spacing: { before: 280, after: 100 },
      children: [new TextRun({ text: label, bold: true, size: 22 })],
    });
  }

  function matrixTable(rows: MatrixRow[]) {
    if (rows.length === 0) {
      return [new Paragraph({ children: [new TextRun({ text: 'Sin registros.', italics: true })] })];
    }
    const cols = matrixColumns(rows);
    const totalWidth = 9350; // DXA — ancho útil aprox. de página carta con márgenes de 1080 twips
    const colWidth = Math.floor(totalWidth / cols.length);
    const columnWidths = cols.map(() => colWidth);

    const headerRow = new TableRow({
      tableHeader: true,
      children: cols.map(c => new TableCell({
        width:   { size: colWidth, type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, fill: 'E8EEF5' },
        children: [new Paragraph({ children: [new TextRun({ text: c, bold: true, size: 18 })] })],
      })),
    });

    const dataRows = rows.map(row => new TableRow({
      children: cols.map(c => new TableCell({
        width: { size: colWidth, type: WidthType.DXA },
        children: [new Paragraph({ children: [new TextRun({ text: row[c] ?? '', size: 18 })] })],
      })),
    }));

    return [new Table({ width: { size: totalWidth, type: WidthType.DXA }, columnWidths, rows: [headerRow, ...dataRows] })];
  }

  function section(key: string, label: string, always = false) {
    const text = v(key);
    if (!text && !always) return [];
    return [heading(label), ...textLines(text)];
  }

  function matrixSection(key: string, label: string, always = false) {
    const rows = matrixRows(sections, key);
    if (rows.length === 0 && !always) return [];
    return [heading(label), ...matrixTable(rows), new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: ' ' })] })];
  }

  const LINE = '_'.repeat(38);

  const children = [
    // ── Título ──────────────────────────────────────────────────────────────
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [new TextRun({ text: 'COMUNICACIÓN DE HALLAZGOS DE AUDITORÍA', bold: true, size: 28 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 500 },
      children: [new TextRun({ text: 'Documento de carácter restringido — dirigido a la administración / gobierno corporativo', size: 20, italics: true })],
    }),

    // ── S1 — Datos de la comunicación ──────────────────────────────────────────
    ...textLines(v('S1')),
    new Paragraph({ spacing: { after: 300 }, children: [new TextRun({ text: ' ' })] }),

    // ── S2 — Hallazgos comunicados (tabla, siempre presente) ───────────────────
    ...matrixSection('S2', 'HALLAZGOS COMUNICADOS', true),

    // ── S3 — Plazo para respuesta y plan de acción ──────────────────────────────
    ...section('S3', 'PLAZO PARA RESPUESTA Y PLAN DE ACCIÓN', true),

    // ── S4 — Base normativa (opcional) ──────────────────────────────────────────
    ...section('S4', 'BASE NORMATIVA DE LA COMUNICACIÓN'),

    // ── S5 — Estado de la respuesta (opcional, tabla) ───────────────────────────
    ...matrixSection('S5', 'ESTADO DE LA RESPUESTA'),

    // ── S6 — Evidencia de envío y acuse de recibo ───────────────────────────────
    ...section('S6', 'EVIDENCIA DE ENVÍO Y ACUSE DE RECIBO', true),

    // ── Firmas ────────────────────────────────────────────────────────────────
    new Paragraph({ spacing: { before: 400 }, children: [new TextRun({ text: ' ' })] }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              borders: noBorder,
              width: { size: 50, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({ children: [new TextRun({ text: LINE })] }),
                new Paragraph({ children: [new TextRun({ text: 'Auditor Encargado', bold: true })] }),
              ],
            }),
            new TableCell({
              borders: noBorder,
              width: { size: 50, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({ children: [new TextRun({ text: LINE })] }),
                new Paragraph({ children: [new TextRun({ text: 'Recibí conforme (Cliente / Entidad)', bold: true })] }),
              ],
            }),
          ],
        }),
      ],
    }),
  ];

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
        },
      },
      children,
    }],
  });

  return Packer.toBlob(doc);
}
