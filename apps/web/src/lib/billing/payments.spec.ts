import type { AdminPaymentRow } from './admin-types';
import type { PaymentRow } from './client-types';
import {
  DEFAULT_PAYMENT_FILTERS, INSTRUCTIONS_MAX, MAX_PENDING_PAYMENTS, MAX_PROOF_BYTES, approvalEffect, buildInstructionsBody, buildPaymentBody, buildRejectBody,
  canManageBilling, deadlineText, errorText, filterPayments, instructionsChanged, instructionsToForm, isAlreadyProcessed, isPaymentStatus, kindLabel, methodLabel, paymentActions, paymentCounts, paymentStatusView,
  pendingLimitReached, proofErrorText, safeProofUrl, sniffProofBytes, sortMine, sortQueue, validateProofFile, validateProofMeta, validateRejectReason,
} from './payments';

const NOW = new Date('2026-11-21T12:00:00.000Z');
const iso = (days: number) => new Date(NOW.getTime() + days * 86400000).toISOString();

function pay(patch: Partial<AdminPaymentRow> = {}): AdminPaymentRow {
  return {
    id: 'p1', kind: 'PACK', planCode: null, months: null, packCode: 'IA_5000', concept: '+5,000 peticiones de IA', amountUsd: 20, method: 'QR',
    status: 'PENDING', reference: 'AUD-8M1QRZ', hasProof: true, proofName: 'comprobante.pdf', rejectedReason: null, approvedAt: null,
    expiresAt: iso(14), createdAt: iso(0), instructions: null, organizationId: 'o1', organizationName: 'Despacho Rivas & Asociados', ...patch,
  };
}

describe('estado de un pago', () => {
  it('pendiente con comprobante = «En revisión»; sin comprobante = «Falta el comprobante»', () => {
    expect(paymentStatusView(pay())).toMatchObject({ label: 'En revisión', tone: 'blue' });
    expect(paymentStatusView(pay({ hasProof: false }))).toMatchObject({ label: 'Falta el comprobante', tone: 'amber' });
  });

  it('cada estado tiene etiqueta en español y su color', () => {
    expect(paymentStatusView(pay({ status: 'APPROVED' }))).toMatchObject({ label: 'Aprobado', tone: 'green' });
    expect(paymentStatusView(pay({ status: 'CANCELLED' }))).toMatchObject({ label: 'Cancelado', tone: 'gray' });
    expect(paymentStatusView(pay({ status: 'EXPIRED' }))).toMatchObject({ label: 'Vencido', tone: 'gray' });
    expect(paymentStatusView(pay({ status: 'REJECTED' }))).toMatchObject({ label: 'Rechazado', tone: 'red' });
  });

  it('el rechazo muestra el motivo (como texto) o una frase de respaldo', () => {
    expect(paymentStatusView(pay({ status: 'REJECTED', rejectedReason: '  Comprobante ilegible ' })).hint).toBe('Motivo: Comprobante ilegible');
    expect(paymentStatusView(pay({ status: 'REJECTED', rejectedReason: null })).hint).toMatch(/rechazó/);
    expect(paymentStatusView(pay({ status: 'REJECTED', rejectedReason: '<img src=x onerror=alert(1)>' })).hint).toBe('Motivo: <img src=x onerror=alert(1)>');
  });

  it('un estado que el servidor agregue después no rompe nada', () => {
    const v = paymentStatusView({ status: 'REFUNDED' as never, hasProof: false, rejectedReason: null });
    expect(v.label).toBe('Estado desconocido');
    expect(isPaymentStatus('REFUNDED')).toBe(false);
    expect(isPaymentStatus('PENDING')).toBe(true);
    expect(isPaymentStatus(undefined)).toBe(false);
  });

  it('método y tipo en español; lo desconocido no se muestra crudo', () => {
    expect(methodLabel('QR')).toBe('QR 365');
    expect(methodLabel('TRANSFER')).toBe('Transferencia bancaria');
    expect(methodLabel('CASH')).toBe('Efectivo');
    expect(methodLabel('WOMPI')).toBe('Pago en línea');
    expect(methodLabel('BITCOIN')).toBe('Otro método');
    expect(methodLabel(null)).toBe('Otro método');
    expect(methodLabel('toString')).toBe('Otro método');
    expect(kindLabel('LICENSE')).toBe('Licencia');
    expect(kindLabel('PACK')).toBe('Paquete');
    expect(kindLabel('x')).toBe('Pago');
  });
});

describe('plazo del pago', () => {
  it('con días por delante', () => {
    expect(deadlineText(iso(14), NOW)).toMatch(/^Vence el \d{2}[-/]\d{2}[-/]\d{4} · quedan 14 días$/);
    expect(deadlineText(iso(2), NOW)).toMatch(/quedan 2 días$/);
  });

  it('en menos de 24 horas', () => {
    expect(deadlineText(new Date(NOW.getTime() + 3 * 3600000).toISOString(), NOW)).toMatch(/^Vence en menos de 24 horas \(/);
  });

  it('ya pasó (también por unos minutos)', () => {
    expect(deadlineText(iso(-3), NOW)).toMatch(/^El plazo terminó el /);
    expect(deadlineText(new Date(NOW.getTime() - 60000).toISOString(), NOW)).toMatch(/^El plazo terminó el /);
    expect(deadlineText(NOW.toISOString(), NOW)).toMatch(/^El plazo terminó el /);
  });

  it('sin fecha válida no escribe nada', () => {
    expect(deadlineText(null, NOW)).toBe('');
    expect(deadlineText(undefined, NOW)).toBe('');
    expect(deadlineText('no es fecha', NOW)).toBe('');
  });
});

describe('qué acción habilita cada estado', () => {
  it('solo lo pendiente se puede aprobar, rechazar, cancelar o pedir comprobante', () => {
    expect(paymentActions(pay())).toEqual({ canUploadProof: true, canCancel: true, canViewProof: true, canApprove: true, canReject: true, approveWithoutProof: false });
    for (const status of ['APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED'] as const) {
      const a = paymentActions(pay({ status }));
      expect([a.canUploadProof, a.canCancel, a.canApprove, a.canReject, a.approveWithoutProof]).toEqual([false, false, false, false, false]);
    }
  });

  it('el comprobante se puede ver en cualquier estado si existe', () => {
    expect(paymentActions(pay({ status: 'APPROVED' })).canViewProof).toBe(true);
    expect(paymentActions(pay({ status: 'APPROVED', hasProof: false })).canViewProof).toBe(false);
  });

  it('aprobar sin comprobante se permite pero se advierte', () => {
    expect(paymentActions(pay({ hasProof: false }))).toMatchObject({ canApprove: true, approveWithoutProof: true, canViewProof: false });
  });

  it('el tope de pagos pendientes es el del API (5)', () => {
    expect(MAX_PENDING_PAYMENTS).toBe(5);
    const four = Array.from({ length: 4 }, () => ({ status: 'PENDING' as const }));
    expect(pendingLimitReached(four)).toBe(false);
    expect(pendingLimitReached([...four, { status: 'PENDING' }])).toBe(true);
    // los resueltos no cuentan
    expect(pendingLimitReached([...four, { status: 'APPROVED' }, { status: 'CANCELLED' }])).toBe(false);
    expect(pendingLimitReached(null)).toBe(false);
    expect(pendingLimitReached([])).toBe(false);
  });
});

describe('cola de aprobación: contadores, filtros y orden', () => {
  const rows = [
    pay({ id: 'a', status: 'PENDING', hasProof: true, organizationName: 'Despacho Rivas', reference: 'AUD-8M1QRZ', createdAt: iso(-2) }),
    pay({ id: 'b', status: 'PENDING', hasProof: false, organizationName: 'Corporación Ejemplo', reference: 'AUD-6D4NXE', createdAt: iso(-5) }),
    pay({ id: 'c', status: 'APPROVED', organizationName: 'Firma Delta & Co', reference: 'AUD-ZZ9999', createdAt: iso(-1) }),
    pay({ id: 'd', status: 'REJECTED', organizationName: 'Auditores Peña', reference: 'AUD-PP1111', createdAt: iso(-9) }),
    pay({ id: 'e', status: 'EXPIRED', organizationName: 'Auditores Peña', reference: 'AUD-EE2222', createdAt: iso(-30) }),
    pay({ id: 'f', status: 'PENDING', hasProof: true, organizationName: 'Consultora Pérez', reference: 'AUD-CC3333', createdAt: iso(-7) }),
  ];

  it('cuenta por estado y los pendientes con comprobante', () => {
    expect(paymentCounts(rows)).toEqual({ ALL: 6, PENDING: 3, APPROVED: 1, REJECTED: 1, CANCELLED: 0, EXPIRED: 1, pendingWithProof: 2 });
  });

  it('sin datos todo es cero (sin NaN)', () => {
    expect(paymentCounts([])).toEqual({ ALL: 0, PENDING: 0, APPROVED: 0, REJECTED: 0, CANCELLED: 0, EXPIRED: 0, pendingWithProof: 0 });
  });

  it('un estado desconocido cuenta en el total pero en ningún estado', () => {
    const c = paymentCounts([{ status: 'REFUNDED' as never, hasProof: false }]);
    expect(c.ALL).toBe(1);
    expect(c.PENDING + c.APPROVED + c.REJECTED + c.CANCELLED + c.EXPIRED).toBe(0);
  });

  it('por defecto la cola muestra los pendientes', () => {
    expect(DEFAULT_PAYMENT_FILTERS).toEqual({ status: 'PENDING', q: '' });
    expect(filterPayments(rows, DEFAULT_PAYMENT_FILTERS).map((r) => r.id)).toEqual(['a', 'b', 'f']);
  });

  it('«Todos» no filtra por estado', () => {
    expect(filterPayments(rows, { status: 'ALL', q: '' })).toHaveLength(6);
  });

  it('busca por organización sin importar mayúsculas ni acentos', () => {
    expect(filterPayments(rows, { status: 'ALL', q: 'perez' }).map((r) => r.id)).toEqual(['f']);
    expect(filterPayments(rows, { status: 'ALL', q: 'PEÑA' }).map((r) => r.id)).toEqual(['d', 'e']);
    expect(filterPayments(rows, { status: 'ALL', q: 'corporacion' }).map((r) => r.id)).toEqual(['b']);
    expect(filterPayments(rows, { status: 'ALL', q: 'delta & co' }).map((r) => r.id)).toEqual(['c']);
  });

  it('busca por referencia con o sin guion y en minúsculas', () => {
    expect(filterPayments(rows, { status: 'ALL', q: 'AUD-8M1QRZ' }).map((r) => r.id)).toEqual(['a']);
    expect(filterPayments(rows, { status: 'ALL', q: 'aud 8m1' }).map((r) => r.id)).toEqual(['a']);
    expect(filterPayments(rows, { status: 'ALL', q: '6d4' }).map((r) => r.id)).toEqual(['b']);
  });

  it('el texto se combina con el estado', () => {
    expect(filterPayments(rows, { status: 'PENDING', q: 'peña' })).toEqual([]);
    expect(filterPayments(rows, { status: 'EXPIRED', q: 'peña' }).map((r) => r.id)).toEqual(['e']);
  });

  it('un texto de solo signos no filtra por referencia ni explota', () => {
    expect(filterPayments(rows, { status: 'ALL', q: '---' })).toEqual([]);
    expect(filterPayments(rows, { status: 'ALL', q: '   ' })).toHaveLength(6);
  });

  it('caracteres de expresión regular se buscan como texto', () => {
    expect(filterPayments(rows, { status: 'ALL', q: '.*' })).toEqual([]);
    expect(filterPayments(rows, { status: 'ALL', q: '(' })).toEqual([]);
  });

  it('organización o referencia ausentes no rompen', () => {
    const odd = [{ ...pay(), organizationName: undefined as never, reference: undefined as never }];
    expect(filterPayments(odd, { status: 'ALL', q: 'x' })).toEqual([]);
    expect(filterPayments(odd, { status: 'ALL', q: '' })).toHaveLength(1);
  });

  it('ordena: pendientes con comprobante (los más antiguos primero), pendientes sin comprobante, y luego lo resuelto (lo más reciente primero)', () => {
    expect(sortQueue(rows).map((r) => r.id)).toEqual(['f', 'a', 'b', 'c', 'd', 'e']);
  });

  it('ordenar no modifica la lista original', () => {
    const copy = rows.map((r) => r.id);
    sortQueue(rows);
    expect(rows.map((r) => r.id)).toEqual(copy);
  });

  it('con fechas inválidas no truena', () => {
    expect(sortQueue([pay({ id: 'x', createdAt: 'nada' }), pay({ id: 'y' })])).toHaveLength(2);
  });
});

describe('«Mis pagos»: orden', () => {
  it('lo pendiente primero y todo del más reciente al más antiguo', () => {
    const list = [
      pay({ id: 'old-ok', status: 'APPROVED', createdAt: iso(-20) }), pay({ id: 'pend-old', status: 'PENDING', createdAt: iso(-3) }),
      pay({ id: 'new-ok', status: 'REJECTED', createdAt: iso(-1) }), pay({ id: 'pend-new', status: 'PENDING', hasProof: false, createdAt: iso(-1) }),
    ];
    expect(sortMine(list).map((r) => r.id)).toEqual(['pend-new', 'pend-old', 'new-ok', 'old-ok']);
    expect(list.map((r) => r.id)[0]).toBe('old-ok');
    expect(sortMine([])).toEqual([]);
  });
});

describe('qué hará aprobar', () => {
  const lic = pay({ kind: 'LICENSE', planCode: 'EMPRESA_DESPACHO', months: 12, packCode: null, concept: 'Licencia Empresa Despacho · 12 meses' });

  it('mismo plan: renueva', () => {
    const lines = approvalEffect(lic, { currentPlanCode: 'EMPRESA_DESPACHO' });
    expect(lines[0]).toBe('Renovará la licencia de Despacho Rivas & Asociados (plan EMPRESA_DESPACHO) por 12 meses.');
    expect(lines.length).toBe(2);
  });

  it('otro plan: asigna y avisa que reemplaza el actual', () => {
    expect(approvalEffect(lic, { currentPlanCode: 'PERSONA_INICIAL' })[0]).toMatch(/^Asignará el plan EMPRESA_DESPACHO .* por 12 meses, desde hoy\. Reemplaza su plan actual \(PERSONA_INICIAL\)\.$/);
  });

  it('sin suscripción: asigna', () => {
    expect(approvalEffect(lic, { currentPlanCode: null })[0]).toMatch(/todavía no tiene suscripción/);
  });

  it('si no se pudo saber el plan actual, lo dice sin afirmar de más', () => {
    expect(approvalEffect(lic, {})[0]).toMatch(/^Renovará o asignará la licencia EMPRESA_DESPACHO por 12 meses/);
  });

  it('un mes se escribe en singular', () => {
    expect(approvalEffect({ ...lic, months: 1 }, { currentPlanCode: 'EMPRESA_DESPACHO' })[0]).toContain('por 1 mes.');
  });

  it('paquete de IA: peticiones que valen 12 meses', () => {
    const lines = approvalEffect(pay(), { pack: { kind: 'AI', quantity: 5000 } });
    expect(lines[0]).toBe('Acreditará el paquete «+5,000 peticiones de IA» a Despacho Rivas & Asociados.');
    expect(lines[1]).toMatch(/5,000 peticiones.*12 meses/);
  });

  it('paquete de espacio: GB mientras dure la licencia', () => {
    expect(approvalEffect(pay({ packCode: 'ESP_50' }), { pack: { kind: 'STORAGE', quantity: 50 } })[1]).toMatch(/50 GB de espacio mientras dure la licencia/);
  });

  it('paquete sin datos del catálogo: solo la primera frase', () => {
    expect(approvalEffect(pay(), {})).toHaveLength(1);
    expect(approvalEffect(pay({ concept: '' , packCode: 'X1'}), {})[0]).toContain('«X1»');
  });
});

describe('cuerpo de POST /billing/payments (solo los campos del DTO)', () => {
  it('licencia: kind, planCode, months y method — nada más', () => {
    const b = buildPaymentBody({ kind: 'LICENSE', planCode: ' EMPRESA_DESPACHO ', months: 12, method: 'QR' });
    expect(b).toEqual({ kind: 'LICENSE', planCode: 'EMPRESA_DESPACHO', months: 12, method: 'QR' });
    expect(Object.keys(b!).sort()).toEqual(['kind', 'method', 'months', 'planCode']);
  });

  it('paquete: kind, packCode y method — sin months ni planCode', () => {
    const b = buildPaymentBody({ kind: 'PACK', packCode: 'IA_5000', method: 'TRANSFER' });
    expect(b).toEqual({ kind: 'PACK', packCode: 'IA_5000', method: 'TRANSFER' });
    expect(Object.keys(b!).sort()).toEqual(['kind', 'method', 'packCode']);
  });

  it('descarta campos de más aunque el objeto de entrada los traiga', () => {
    const b = buildPaymentBody({ kind: 'PACK', packCode: 'IA_5000', method: 'CASH', amountUsd: 0, months: 3, planCode: 'X' } as never);
    expect(Object.keys(b!).sort()).toEqual(['kind', 'method', 'packCode']);
  });

  it('las duraciones válidas son 1, 3, 6 y 12 (0 y otras no se pagan)', () => {
    for (const months of [1, 3, 6, 12]) expect(buildPaymentBody({ kind: 'LICENSE', planCode: 'P', months, method: 'QR' })).not.toBeNull();
    for (const months of [0, 2, 24, -1, 1.5, NaN, Infinity]) expect(buildPaymentBody({ kind: 'LICENSE', planCode: 'P', months, method: 'QR' })).toBeNull();
    expect(buildPaymentBody({ kind: 'LICENSE', planCode: 'P', months: '12' as never, method: 'QR' })).toBeNull();
  });

  it('el método debe ser uno de los tres (WOMPI aún no se ofrece)', () => {
    expect(buildPaymentBody({ kind: 'PACK', packCode: 'A1', method: 'WOMPI' })).toBeNull();
    expect(buildPaymentBody({ kind: 'PACK', packCode: 'A1', method: '' })).toBeNull();
    expect(buildPaymentBody({ kind: 'PACK', packCode: 'A1', method: undefined as never })).toBeNull();
  });

  it('códigos vacíos, con espacios en medio, símbolos o demasiado largos no se envían', () => {
    expect(buildPaymentBody({ kind: 'PACK', packCode: '', method: 'QR' })).toBeNull();
    expect(buildPaymentBody({ kind: 'PACK', packCode: '   ', method: 'QR' })).toBeNull();
    expect(buildPaymentBody({ kind: 'PACK', packCode: 'A B', method: 'QR' })).toBeNull();
    expect(buildPaymentBody({ kind: 'PACK', packCode: 'A;DROP', method: 'QR' })).toBeNull();
    expect(buildPaymentBody({ kind: 'PACK', packCode: 'A'.repeat(41), method: 'QR' })).toBeNull();
    expect(buildPaymentBody({ kind: 'PACK', packCode: 'A'.repeat(40), method: 'QR' })).not.toBeNull();
    expect(buildPaymentBody({ kind: 'LICENSE', planCode: '', months: 12, method: 'QR' })).toBeNull();
    expect(buildPaymentBody({ kind: 'PACK', packCode: null as never, method: 'QR' })).toBeNull();
  });

  it('un tipo desconocido no genera cuerpo', () => {
    expect(buildPaymentBody({ kind: 'OTRO', packCode: 'A1', method: 'QR' } as never)).toBeNull();
  });
});

describe('motivo del rechazo', () => {
  it('mínimo 3 caracteres, máximo 500, sin contar espacios de los extremos', () => {
    expect(validateRejectReason('')).toMatchObject({ ok: false });
    expect(validateRejectReason('  ab  ')).toMatchObject({ ok: false });
    expect(validateRejectReason('abc')).toEqual({ ok: true, reason: 'abc' });
    expect(validateRejectReason('  Monto incorrecto  ')).toEqual({ ok: true, reason: 'Monto incorrecto' });
    expect(validateRejectReason('x'.repeat(500)).ok).toBe(true);
    const long = validateRejectReason('x'.repeat(501));
    expect(long).toMatchObject({ ok: false });
    expect((long as { message: string }).message).toContain('501');
  });

  it('el cuerpo lleva solo «reason», limpio', () => {
    expect(buildRejectBody('  Referencia equivocada ')).toEqual({ reason: 'Referencia equivocada' });
    expect(buildRejectBody('ab')).toBeNull();
    expect(buildRejectBody(undefined as never)).toBeNull();
  });

  it('texto raro (HTML, emojis, saltos de línea) se conserva tal cual: se muestra como texto', () => {
    expect(buildRejectBody('<b>no</b>\nsegunda línea 🙂')).toEqual({ reason: '<b>no</b>\nsegunda línea 🙂' });
  });
});

describe('validación del comprobante en el navegador', () => {
  const file = (name: string, size: number, type = '') => ({ name, size, type });

  it('acepta PDF, JPG, JPEG y PNG hasta 5 MB', () => {
    expect(validateProofMeta(file('recibo.pdf', 1000, 'application/pdf'))).toEqual({ ok: true });
    expect(validateProofMeta(file('foto.JPG', 1000, 'image/jpeg'))).toEqual({ ok: true });
    expect(validateProofMeta(file('foto.jpeg', 1000, 'image/jpeg'))).toEqual({ ok: true });
    expect(validateProofMeta(file('captura.png', MAX_PROOF_BYTES, 'image/png'))).toEqual({ ok: true });
  });

  it('el límite es exactamente 5 MB', () => {
    expect(MAX_PROOF_BYTES).toBe(5 * 1024 * 1024);
    const over = validateProofMeta(file('recibo.pdf', MAX_PROOF_BYTES + 1, 'application/pdf'));
    expect(over).toMatchObject({ ok: false });
    expect((over as { message: string }).message).toBe('El comprobante pesa un poco más del máximo permitido (5.0 MB).');
    expect((validateProofMeta(file('recibo.pdf', 12 * 1024 * 1024, 'application/pdf')) as { message: string }).message).toBe('El comprobante pesa 12.0 MB y el máximo es 5.0 MB.');
  });

  it('rechaza archivos vacíos', () => {
    expect(validateProofMeta(file('recibo.pdf', 0, 'application/pdf'))).toMatchObject({ ok: false, message: 'El archivo está vacío.' });
    expect(validateProofMeta(file('recibo.pdf', -5))).toMatchObject({ ok: false });
    expect(validateProofMeta(file('recibo.pdf', NaN))).toMatchObject({ ok: false });
  });

  it('rechaza otros tipos y extensiones raras', () => {
    for (const name of ['video.mp4', 'doc.docx', 'hoja.xlsx', 'script.exe', 'sin_extension', 'recibo.pdf.exe', 'recibo.', '.pdf2', 'imagen.gif', 'imagen.webp']) {
      expect(validateProofMeta(file(name, 1000))).toMatchObject({ ok: false, message: 'El comprobante debe ser un PDF, JPG o PNG.' });
    }
  });

  it('el tipo que declara el navegador también cuenta (una extensión buena con un tipo malo se rechaza)', () => {
    expect(validateProofMeta(file('recibo.pdf', 1000, 'application/zip'))).toMatchObject({ ok: false });
    expect(validateProofMeta(file('recibo.png', 1000, 'text/html'))).toMatchObject({ ok: false });
    // el navegador a veces no informa el tipo: se confía en la extensión (y luego en los bytes)
    expect(validateProofMeta(file('recibo.pdf', 1000, ''))).toEqual({ ok: true });
  });

  it('sin archivo o con nombre vacío pide elegir uno', () => {
    expect(validateProofMeta(null)).toMatchObject({ ok: false });
    expect(validateProofMeta(undefined)).toMatchObject({ ok: false });
    expect(validateProofMeta(file('', 100))).toMatchObject({ ok: false });
  });

  it('detecta el tipo real por los primeros bytes (igual que el servidor)', () => {
    expect(sniffProofBytes(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]))).toBe('pdf');
    expect(sniffProofBytes(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpg');
    expect(sniffProofBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]))).toBe('png');
    expect(sniffProofBytes(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBeNull(); // zip / docx
    expect(sniffProofBytes(new Uint8Array([]))).toBeNull();
    expect(sniffProofBytes(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBeNull(); // «%PDF» sin guion: incompleto
    expect(sniffProofBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull(); // PNG truncado
  });

  const withBytes = (name: string, bytes: number[], type = '') => ({
    name, size: bytes.length || 1, type, slice: () => ({ arrayBuffer: async () => new Uint8Array(bytes).buffer }),
  });

  it('un archivo con extensión .pdf pero contenido de otro tipo se rechaza antes de enviar', async () => {
    expect(await validateProofFile(withBytes('falso.pdf', [0x50, 0x4b, 0x03, 0x04]))).toMatchObject({ ok: false, message: 'El archivo no parece un PDF, JPG o PNG válido.' });
  });

  it('un PDF verdadero pasa', async () => {
    expect(await validateProofFile(withBytes('recibo.pdf', [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34], 'application/pdf'))).toEqual({ ok: true });
  });

  it('si no se puede leer el archivo lo dice sin romper', async () => {
    const broken = { name: 'a.pdf', size: 10, type: '', slice: () => ({ arrayBuffer: async () => { throw new Error('boom'); } }) };
    expect(await validateProofFile(broken)).toMatchObject({ ok: false, message: 'No se pudo leer el archivo. Elígelo de nuevo.' });
  });

  it('si ya falla por tipo o tamaño, ni lee el archivo', async () => {
    const slice = jest.fn();
    expect(await validateProofFile({ name: 'a.exe', size: 10, type: '', slice })).toMatchObject({ ok: false });
    expect(slice).not.toHaveBeenCalled();
    expect(await validateProofFile(null)).toMatchObject({ ok: false });
  });
});

describe('enlace del comprobante', () => {
  it('solo acepta http y https', () => {
    expect(safeProofUrl('https://x.supabase.co/storage/v1/object/sign/audit-files/a.pdf?token=abc')).toContain('https://x.supabase.co/');
    expect(safeProofUrl('http://localhost:54321/file')).toBe('http://localhost:54321/file');
  });

  it('rechaza esquemas peligrosos y basura', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,<script>1</script>', 'file:///etc/passwd', 'ftp://x/y', 'vbscript:x', '//evil.com/x', '', 'no es url', null, undefined, 42, {}]) {
      expect(safeProofUrl(bad)).toBeNull();
    }
    expect(safeProofUrl('https://x.co/' + 'a'.repeat(5000))).toBeNull();
  });
});

describe('errores', () => {
  it('409 «ya fue procesado» = ya lo procesó otra persona', () => {
    expect(isAlreadyProcessed({ status: 409 })).toBe(true);
    expect(isAlreadyProcessed(Object.assign(new Error('Este pago ya fue procesado (aprobado, rechazado, cancelado o vencido).'), { status: 409 }))).toBe(true);
    expect(isAlreadyProcessed(Object.assign(new Error('Este pago ya fue procesado.'), { status: 409 }))).toBe(true);
  });

  it('otro 409 (por ejemplo, una licencia que no vence) NO se confunde con «ya procesado»', () => {
    expect(isAlreadyProcessed(Object.assign(new Error('Esta licencia no vence o no tiene duración: indica 1, 3, 6 o 12 meses para renovar.'), { status: 409 }))).toBe(false);
    expect(isAlreadyProcessed(Object.assign(new Error('Tienes demasiados pagos pendientes.'), { status: 409 }))).toBe(false);
  });

  it('otros estados y valores raros', () => {
    expect(isAlreadyProcessed({ status: 500 })).toBe(false);
    expect(isAlreadyProcessed(new Error('x'))).toBe(false);
    expect(isAlreadyProcessed(null)).toBe(false);
    expect(isAlreadyProcessed('409')).toBe(false);
  });

  it('el mensaje del servidor se usa tal cual; si no hay, el de respaldo', () => {
    expect(errorText(new Error('Tienes demasiados pagos pendientes.'), 'x')).toBe('Tienes demasiados pagos pendientes.');
    expect(errorText(new Error('   '), 'Respaldo')).toBe('Respaldo');
    expect(errorText('texto', 'Respaldo')).toBe('Respaldo');
    expect(errorText(undefined, 'Respaldo')).toBe('Respaldo');
  });
});

describe('datos de pago que ve el cliente', () => {
  it('lee el texto guardado de cada método y no se inventa nada', () => {
    expect(instructionsToForm({ QR: 'Banco X', TRANSFER: 'Cuenta 1', CASH: 'Oficina' })).toEqual({ QR: 'Banco X', TRANSFER: 'Cuenta 1', CASH: 'Oficina' });
    expect(instructionsToForm({ QR: 5, TRANSFER: null })).toEqual({ QR: '', TRANSFER: '', CASH: '' });
    for (const bad of [null, undefined, 'texto', 42, [], ['QR']]) expect(instructionsToForm(bad)).toEqual({ QR: '', TRANSFER: '', CASH: '' });
  });

  it('el cuerpo lleva solo «paymentInstructions» con los métodos que tienen texto, recortados', () => {
    const r = buildInstructionsBody({ QR: '  Banco X  ', TRANSFER: '', CASH: '   ' });
    expect(r).toEqual({ ok: true, body: { paymentInstructions: { QR: 'Banco X' } } });
    expect(Object.keys((r as { body: object }).body)).toEqual(['paymentInstructions']);
  });

  it('todo vacío borra las instrucciones (objeto vacío)', () => {
    expect(buildInstructionsBody({ QR: '', TRANSFER: '', CASH: '' })).toEqual({ ok: true, body: { paymentInstructions: {} } });
  });

  it('conserva las claves que no se editan aquí (el API reemplaza el objeto entero)', () => {
    const r = buildInstructionsBody({ QR: 'Nuevo', TRANSFER: '', CASH: '' }, { QR: 'Viejo', TRANSFER: 'Viejo 2', WOMPI: 'Enlace', RARA: 5 });
    expect(r).toEqual({ ok: true, body: { paymentInstructions: { WOMPI: 'Enlace', QR: 'Nuevo' } } });
  });

  it('máximo 2,000 caracteres por método', () => {
    expect(buildInstructionsBody({ QR: 'x'.repeat(INSTRUCTIONS_MAX), TRANSFER: '', CASH: '' }).ok).toBe(true);
    const r = buildInstructionsBody({ QR: '', TRANSFER: 'x'.repeat(INSTRUCTIONS_MAX + 1), CASH: '' });
    expect(r.ok).toBe(false);
    expect((r as { errors: Record<string, string> }).errors.TRANSFER).toContain('2001');
  });

  it('saltos de línea, HTML y emojis se guardan como texto', () => {
    const text = 'Línea 1\n<b>Línea 2</b> 🙂';
    expect(buildInstructionsBody({ QR: text, TRANSFER: '', CASH: '' })).toEqual({ ok: true, body: { paymentInstructions: { QR: text } } });
  });

  it('detecta si hubo cambios sin contar los espacios de los extremos', () => {
    const saved = { QR: 'A', TRANSFER: 'B', CASH: '' };
    expect(instructionsChanged({ ...saved }, saved)).toBe(false);
    expect(instructionsChanged({ QR: ' A ', TRANSFER: 'B', CASH: '  ' }, saved)).toBe(false);
    expect(instructionsChanged({ QR: 'A', TRANSFER: 'B2', CASH: '' }, saved)).toBe(true);
  });
});

describe('quién puede comprar', () => {
  it('ADMIN de la organización o superior', () => {
    expect(canManageBilling('ADMIN')).toBe(true);
    expect(canManageBilling('SUPER_ADMIN')).toBe(true);
  });

  it('los demás roles no (así se evitan los 403)', () => {
    for (const r of ['CAE', 'AUDIT_MANAGER', 'SENIOR_AUDITOR', 'AUDITOR', 'AUDITEE', 'READ_ONLY']) expect(canManageBilling(r)).toBe(false);
  });

  it('roles desconocidos, vacíos o con trucos no pasan', () => {
    for (const r of ['', 'admin', 'OWNER', 'constructor', '__proto__', null, undefined]) expect(canManageBilling(r as never)).toBe(false);
  });
});

describe('error al subir el comprobante', () => {
  it('413 se explica en español; los mensajes del servidor se respetan', () => {
    expect(proofErrorText(Object.assign(new Error('File too large'), { status: 413 }))).toBe('El comprobante pesa más de 5 MB.');
    expect(proofErrorText(Object.assign(new Error('El comprobante debe ser un PDF, JPG o PNG válido.'), { status: 400 }))).toBe('El comprobante debe ser un PDF, JPG o PNG válido.');
    expect(proofErrorText(null)).toBe('No se pudo subir el comprobante. Intenta de nuevo.');
  });
});

// El tipo `PaymentRow` del cliente no incluye organización: es el mismo `present` del API.
const _typecheck: PaymentRow = pay();
void _typecheck;
