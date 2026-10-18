/**
 * Hoja de evidencia de la firma (docs/firma-externa-por-enlace.md §10). Se agrega al final del PDF original
 * y el conjunto se sella con el certificado de la organización. TODO valor se escapa aquí: el firmante y las
 * observaciones vienen de un tercero.
 */

export interface EvidenceData {
  orgName: string;
  documentLabel: string;
  title: string;
  verificationCode: string;
  verifyUrl: string;
  documentSha256: string;
  expectedSignerName: string;
  signerEmail: string;
  signedName: string;
  signedRole: string | null;
  emailVerifiedAt: Date | null;
  signerIp: string | null;
  signerUserAgent: string | null;
  signedAt: Date;
  consentVersion: string;
  consentText: string;
  responseLines: Array<[string, string]>;
  attachments: Array<{ originalName: string; sizeBytes: number; originalSha256: string; safeSha256: string | null }>;
  events: Array<{ seq: number; type: string; at: Date; ip: string | null }>;
  headHash: string;
}

const esc = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const EVENT_LABEL: Record<string, string> = {
  CREATED: 'Solicitud creada', SENT: 'Correo enviado', RESENT: 'Correo reenviado', REMINDER_SENT: 'Recordatorio enviado',
  OTP_SENT: 'Código de verificación enviado', OTP_FAILED: 'Código incorrecto', OTP_LOCKED: 'Bloqueo por intentos',
  SESSION_STARTED: 'Correo verificado', VIEWED: 'Documento abierto', ATTACHMENT_ACCEPTED: 'Adjunto aceptado',
  ATTACHMENT_REJECTED: 'Adjunto rechazado', SIGNED: 'Firma registrada', DECLINED: 'Firma rechazada', REVOKED: 'Solicitud revocada',
  EXPIRED: 'Solicitud vencida', SEALED: 'Documento sellado', SEAL_FAILED: 'Intento de sellado fallido',
  TARGET_UPDATED: 'Documento de origen modificado', INTEGRITY_FAILED: 'Fallo de integridad',
};

const fmtUtc = (d: Date) => d.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
const fmtSv = (d: Date) =>
  new Intl.DateTimeFormat('es-SV', {
    timeZone: 'America/El_Salvador', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(d) + ' (hora de El Salvador)';

const row = (label: string, value: string) =>
  `<tr><td style="width:34%;padding:1.2mm 2mm;color:#4a5568;vertical-align:top;border-bottom:1px solid #EDF2F7;">${esc(label)}</td>` +
  `<td style="padding:1.2mm 2mm;vertical-align:top;border-bottom:1px solid #EDF2F7;word-break:break-word;">${value}</td></tr>`;

const mono = (v: string) => `<span style="font-family:Consolas,monospace;font-size:7.5pt;">${esc(v)}</span>`;
const h = (t: string) => `<h3 style="margin:5mm 0 1.5mm 0;color:#0F2D4A;font-size:10pt;">${esc(t)}</h3>`;
const table = (rows: string) => `<table style="width:100%;border-collapse:collapse;font-size:8.5pt;">${rows}</table>`;
const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export function renderEvidenceBody(d: EvidenceData): string {
  const parts: string[] = [];

  parts.push(`<p style="margin:0 0 2mm 0;font-size:8.5pt;color:#4a5568;">Constancia generada por AuditMind para <strong>${esc(d.orgName)}</strong>. ` +
    `Acompaña al documento «${esc(d.title)}» (${esc(d.documentLabel)}) y forma parte de un mismo archivo sellado.</p>`);

  parts.push(`<div style="border:1.5px solid #0F2D4A;border-radius:3mm;padding:3mm 4mm;margin:2mm 0 3mm 0;">` +
    `<div style="font-size:7.5pt;text-transform:uppercase;letter-spacing:.5px;color:#718096;">Código de verificación</div>` +
    `<div style="font-size:15pt;font-weight:700;letter-spacing:2px;color:#0F2D4A;">${esc(d.verificationCode)}</div>` +
    `<div style="font-size:8pt;color:#4a5568;margin-top:1mm;">Compruébalo en ${esc(d.verifyUrl)}</div></div>`);

  parts.push(h('Firmante'));
  parts.push(table(
    row('Nombre escrito al firmar', esc(d.signedName)) +
    row('Cargo', esc(d.signedRole ?? '—')) +
    row('Destinatario del envío', `${esc(d.expectedSignerName)} · ${esc(d.signerEmail)}`) +
    row('Correo verificado con código', d.emailVerifiedAt ? esc(fmtUtc(d.emailVerifiedAt)) : 'No registrado') +
    row('Dirección IP', esc(d.signerIp ?? 'No disponible')) +
    row('Navegador', esc(d.signerUserAgent ?? 'No disponible')) +
    row('Fecha y hora de firma', `${esc(fmtUtc(d.signedAt))}<br/>${esc(fmtSv(d.signedAt))}`),
  ));

  if (d.responseLines.length > 0) {
    parts.push(h('Respuesta del firmante'));
    parts.push(table(d.responseLines.map(([k, v]) => row(k, `<span style="white-space:pre-wrap;">${esc(v)}</span>`)).join('')));
  }

  parts.push(h(`Consentimiento (versión ${d.consentVersion})`));
  parts.push(`<p style="margin:0;font-size:8.5pt;white-space:pre-wrap;">${esc(d.consentText)}</p>`);

  parts.push(h('Documento firmado'));
  parts.push(table(row('Huella SHA-256 del documento original', mono(d.documentSha256))));

  if (d.attachments.length > 0) {
    parts.push(h('Adjuntos del firmante'));
    parts.push(table(d.attachments.map((a) =>
      row(`${a.originalName} (${kb(a.sizeBytes)})`,
        `Original: ${mono(a.originalSha256)}<br/>Reconstruido: ${a.safeSha256 ? mono(a.safeSha256) : '—'}<br/>Antivirus: sin amenazas detectadas`)).join('')));
  }

  parts.push(h('Bitácora'));
  parts.push(table(d.events.map((e) =>
    row(`${e.seq}. ${EVENT_LABEL[e.type] ?? e.type}`, `${esc(fmtUtc(e.at))}${e.ip ? ` · ${esc(e.ip)}` : ''}`)).join('')));
  parts.push(table(row('Huella de la bitácora (cabeza de la cadena)', mono(d.headHash))));

  parts.push(`<p style="margin:5mm 0 0 0;font-size:8pt;color:#718096;">Firma electrónica simple registrada por AuditMind y sellada por ${esc(d.orgName)}. ` +
    `La bitácora está encadenada por huellas: cualquier alteración posterior se detecta al verificarla.</p>`);

  return parts.join('\n');
}
