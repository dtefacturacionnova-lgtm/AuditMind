import type { WpPaperSection } from '@/hooks/useWorkingPapers';

function sval(sections: WpPaperSection[], key: string): string {
  const s = sections.find(s => s.sectionKey === key);
  if (!s || s.value === null || s.value === undefined) return '';
  return String(s.value).trim();
}

export async function generateCartaEncargo(sections: WpPaperSection[]): Promise<Blob> {
  const {
    Document, Packer, Paragraph, TextRun, AlignmentType,
    Table, TableRow, TableCell, WidthType, BorderStyle,
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

  function section(key: string, label: string, always = false) {
    const text = v(key);
    if (!text && !always) return [];
    return [heading(label), ...textLines(text)];
  }

  const LINE = '_'.repeat(38);

  const children = [
    // ── Título ──────────────────────────────────────────────────────────────
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [new TextRun({ text: 'CARTA DE ENCARGO DE AUDITORÍA', bold: true, size: 28 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 500 },
      children: [new TextRun({ text: '(NIA 210 — Acuerdo de los Términos del Encargo de Auditoría)', size: 20, italics: true })],
    }),

    // ── Lugar y fecha ────────────────────────────────────────────────────────
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 400 },
      children: [new TextRun({ text: v('S1') })],
    }),

    // ── Destinatario ─────────────────────────────────────────────────────────
    ...textLines(v('S2')),
    new Paragraph({
      spacing: { after: 400 },
      children: [new TextRun({ text: v('S3'), bold: true })],
    }),

    // ── Párrafo introductorio ─────────────────────────────────────────────────
    ...textLines(v('S4')),
    new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: ' ' })] }),

    // ── Cuerpo del encargo ────────────────────────────────────────────────────
    ...section('S5', 'OBJETIVO BÁSICO DE LA AUDITORÍA', true),
    ...section('S6', 'ALCANCE DE LA AUDITORÍA', true),
    ...section('S7', 'RESPONSABILIDADES DE LA GERENCIA CON RESPECTO A LOS ESTADOS FINANCIEROS', true),
    ...section('S8', 'RESPONSABILIDAD POR LA PREVENCIÓN Y DETECCIÓN DE FRAUDES Y OTRAS IRREGULARIDADES', true),
    ...section('S9', 'RESPONSABILIDAD POR LA IDENTIFICACIÓN Y EL INFORME DE DEBILIDADES DE CONTROL INTERNO', true),

    // ── Secciones opcionales ──────────────────────────────────────────────────
    ...section('S10', 'RESPONSABILIDAD POR OTROS DOCUMENTOS QUE ACOMPAÑAN LOS ESTADOS FINANCIEROS AUDITADOS'),
    ...section('S11', 'RESPONSABILIDAD RELACIONADA CON LA DISTRIBUCIÓN ELECTRÓNICA DE LA OPINIÓN DE AUDITORÍA'),
    ...section('S12', 'TERCEROS USUARIOS DE LA OPINIÓN DE LOS AUDITORES EXTERNOS'),
    ...section('S13', 'TITULARIDAD Y ACCESO A LOS ARCHIVOS DE AUDITORÍA'),
    ...section('S14', 'LÍMITE DE LA RESPONSABILIDAD DE LOS AUDITORES EXTERNOS FRENTE AL CLIENTE'),
    ...section('S15', 'USO DE SOFTWARE DE LOS AUDITORES EXTERNOS'),
    ...section('S16', 'COMUNICACIONES POR INTERNET'),
    ...section('S17', 'HONORARIOS Y GASTOS', true),
    ...section('S18', 'OTROS SERVICIOS QUE SERÁN OBJETO DE CONTRATOS SEPARADOS'),
    ...section('S19', 'PROCESO PARA EVALUAR LA SATISFACCIÓN DEL CLIENTE CON NUESTROS SERVICIOS DE AUDITORÍA'),
    ...section('S20', 'LEY Y JURISDICCIÓN APLICABLES'),

    // ── Aceptación ────────────────────────────────────────────────────────────
    new Paragraph({
      spacing: { before: 400, after: 200 },
      children: [new TextRun({ text: 'ACEPTACIÓN DEL ENCARGO', bold: true, size: 22 })],
    }),
    ...textLines(v('S21')),
    new Paragraph({ spacing: { after: 500 }, children: [new TextRun({ text: ' ' })] }),

    // ── Firmas ────────────────────────────────────────────────────────────────
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
                new Paragraph({ children: [new TextRun({ text: v('S22'), bold: true })] }),
                new Paragraph({ children: [new TextRun({ text: v('S23') })] }),
                new Paragraph({ children: [new TextRun({ text: 'Representante Legal', italics: true })] }),
              ],
            }),
            new TableCell({
              borders: noBorder,
              width: { size: 50, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({ children: [new TextRun({ text: LINE })] }),
                new Paragraph({ children: [new TextRun({ text: 'Firma del Auditor Independiente', bold: true })] }),
                new Paragraph({ children: [new TextRun({ text: 'Firma de Auditores' })] }),
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
          margin: { top: 1080, right: 1080, bottom: 1080, left: 1440 },
        },
      },
      children,
    }],
  });

  return Packer.toBlob(doc);
}
