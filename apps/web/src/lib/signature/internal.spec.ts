import {
  canResend, canReseal, canRevoke, DEFAULT_EXPIRY_DAYS, eventDetail, expiryChoices, eventLabel, EVENT_LABELS, integrityLabel, isActive, MIN_ROLE_BY_TYPE, pollInterval,
  isInPersonRequest, responseEntries, sealLabel, SEAL_POLL_MS, STATUS_META, WAITING_POLL_MS, validateReason, validateSendForm, verifyPath, type SendFormValues, type SignatureStatus,
} from './internal';

const ALL: SignatureStatus[] = ['PENDING', 'VIEWED', 'SIGNED', 'DECLINED', 'REVOKED', 'EXPIRED'];
const ok: SendFormValues = { signerName: 'Juan Pérez', signerEmail: 'juan@banco.com', signerRole: 'Gerente', expiresInDays: 15, reminderEnabled: true };

describe('qué acciones permite cada estado (igual que el servicio)', () => {
  it('reenviar: pendiente, abierta o vencida — nunca firmada, rechazada ni revocada', () => {
    expect(ALL.filter(canResend)).toEqual(['PENDING', 'VIEWED', 'EXPIRED']);
  });
  it('revocar: solo las activas (pendiente o abierta)', () => {
    expect(ALL.filter(canRevoke)).toEqual(['PENDING', 'VIEWED']);
    expect(ALL.filter(isActive)).toEqual(['PENDING', 'VIEWED']);
  });
  it('reintentar el sellado: solo firmada con sellado pendiente o fallido', () => {
    expect(canReseal('SIGNED', 'FAILED')).toBe(true);
    expect(canReseal('SIGNED', 'PENDING')).toBe(true);
    expect(canReseal('SIGNED', 'SEALED')).toBe(false);
    expect(canReseal('PENDING', 'FAILED')).toBe(false);
  });
  it('todo estado tiene etiqueta y color', () => {
    for (const s of ALL) expect(STATUS_META[s].label.length).toBeGreaterThan(2);
  });
  it('plazos por defecto: carta 30 días; confirmación y acta 15; el selector incluye el valor por defecto', () => {
    expect(DEFAULT_EXPIRY_DAYS).toEqual({ ENGAGEMENT_LETTER: 30, EXTERNAL_CONFIRMATION: 15, INTERVIEW_RECORD: 15 });
    expect(expiryChoices(30)).toEqual([7, 15, 30, 60]);
    expect(expiryChoices(10)).toEqual([7, 10, 15, 30, 60]);
  });
  it('la carta exige gerente; confirmaciones y actas, auditor', () => {
    expect(MIN_ROLE_BY_TYPE).toEqual({ ENGAGEMENT_LETTER: 'AUDIT_MANAGER', EXTERNAL_CONFIRMATION: 'AUDITOR', INTERVIEW_RECORD: 'AUDITOR' });
  });
});

describe('sellado', () => {
  it('solo se informa en solicitudes firmadas', () => {
    expect(sealLabel('PENDING', 'PENDING', false)).toBeNull();
    expect(sealLabel('SIGNED', 'NOT_APPLICABLE', false)).toBeNull();
  });
  it('distingue sellando, sellado con y sin sello de tiempo, y fallo', () => {
    expect(sealLabel('SIGNED', 'PENDING', false)?.label).toMatch(/Sellando/);
    expect(sealLabel('SIGNED', 'SEALED', true)).toMatchObject({ tone: 'green' });
    expect(sealLabel('SIGNED', 'SEALED', false)).toMatchObject({ tone: 'amber' });
    expect(sealLabel('SIGNED', 'FAILED', false)).toMatchObject({ tone: 'red' });
  });
  it('la lista se refresca sola: rápido mientras se sella, despacio mientras se espera la firma, nada en lo demás', () => {
    expect(pollInterval(undefined)).toBe(false);
    expect(pollInterval([])).toBe(false);
    expect(pollInterval([{ status: 'SIGNED', sealStatus: 'SEALED' }, { status: 'REVOKED', sealStatus: 'NOT_APPLICABLE' }, { status: 'DECLINED', sealStatus: 'NOT_APPLICABLE' }])).toBe(false);
    expect(pollInterval([{ status: 'SIGNED', sealStatus: 'PENDING' }])).toBe(SEAL_POLL_MS);
    expect(pollInterval([{ status: 'PENDING', sealStatus: 'NOT_APPLICABLE' }])).toBe(WAITING_POLL_MS);
    expect(pollInterval([{ status: 'VIEWED', sealStatus: 'NOT_APPLICABLE' }])).toBe(WAITING_POLL_MS);
    // si hay una vigente y otra sellándose, manda el sellado (más urgente)
    expect(pollInterval([{ status: 'PENDING', sealStatus: 'NOT_APPLICABLE' }, { status: 'SIGNED', sealStatus: 'PENDING' }])).toBe(SEAL_POLL_MS);
  });
});

describe('bitácora', () => {
  it('todo tipo de evento del esquema tiene etiqueta en español', () => {
    const types = ['CREATED', 'SENT', 'RESENT', 'REMINDER_SENT', 'OTP_SENT', 'OTP_FAILED', 'OTP_LOCKED', 'SESSION_STARTED', 'VIEWED', 'ATTACHMENT_ACCEPTED',
      'ATTACHMENT_REJECTED', 'SIGNED', 'DECLINED', 'REVOKED', 'EXPIRED', 'SEALED', 'SEAL_FAILED', 'TARGET_UPDATED', 'INTEGRITY_FAILED'];
    for (const t of types) expect(EVENT_LABELS[t]).toBeTruthy();
  });
  it('un tipo desconocido se muestra tal cual en vez de romper', () => {
    expect(eventLabel({ type: 'NUEVO_TIPO', detail: null })).toBe('NUEVO_TIPO');
  });
  it('el sello de tiempo se distingue del sellado inicial', () => {
    expect(eventLabel({ type: 'SEALED', detail: { phase: 'timestamp' } })).toBe('Sello de tiempo aplicado');
    expect(eventLabel({ type: 'SEALED', detail: { sha256: 'x' } })).toBe('PDF sellado');
  });
  it('los complementos salen de campos conocidos y se acotan', () => {
    expect(eventDetail({ type: 'SIGNED', detail: { signedName: 'Ana Gómez', consentVersion: 'v1' } })).toBe('Ana Gómez');
    expect(eventDetail({ type: 'OTP_FAILED', detail: { attempt: 3 } })).toBe('Intento 3');
    expect(eventDetail({ type: 'SEAL_FAILED', detail: { final: true } })).toMatch(/agotaron/);
    expect(eventDetail({ type: 'INTEGRITY_FAILED', detail: { phase: 'sign' } })).toBe('Al firmar');
    expect(eventDetail({ type: 'DECLINED', detail: { reason: 'x'.repeat(900) } })?.length).toBe(500);
    expect(eventDetail({ type: 'CREATED', detail: null })).toBeNull();
    expect(eventDetail({ type: 'SIGNED', detail: { signedName: 42 } })).toBeNull();
  });
  it('la integridad usa etiquetas legibles y deja pasar nombres nuevos', () => {
    expect(integrityLabel('pdf_sellado')).toMatch(/firmado/);
    expect(integrityLabel('otra_cosa')).toBe('otra_cosa');
  });
});

describe('formulario de envío', () => {
  it('datos correctos → sin errores', () => {
    expect(validateSendForm(ok)).toEqual({});
  });
  it('exige nombre y correo válidos, igual que el servidor', () => {
    expect(validateSendForm({ ...ok, signerName: ' J ' }).signerName).toBeTruthy();
    expect(validateSendForm({ ...ok, signerName: 'x'.repeat(121) }).signerName).toBeTruthy();
    expect(validateSendForm({ ...ok, signerEmail: '' }).signerEmail).toMatch(/Escribe el correo/);
    for (const bad of ['sin-arroba', 'a@b', 'a b@c.com', 'a@b.c']) expect(validateSendForm({ ...ok, signerEmail: bad }).signerEmail).toMatch(/válido/);
    expect(validateSendForm({ ...ok, signerEmail: ` ${'a'.repeat(250)}@x.com ` }).signerEmail).toBeTruthy();
  });
  it('acota cargo y plazo (1 a 60 días enteros)', () => {
    expect(validateSendForm({ ...ok, signerRole: 'x'.repeat(121) }).signerRole).toBeTruthy();
    expect(validateSendForm({ ...ok, signerRole: '' })).toEqual({});
    for (const d of [0, 61, 1.5, NaN]) expect(validateSendForm({ ...ok, expiresInDays: d }).expiresInDays).toBeTruthy();
    for (const d of [1, 60]) expect(validateSendForm({ ...ok, expiresInDays: d })).toEqual({});
  });
  it('el motivo de revocación va de 5 a 500 caracteres', () => {
    expect(validateReason('   ')).toMatch(/Escribe el motivo/);
    expect(validateReason('ab')).toBeTruthy();
    expect(validateReason('Error en el monto')).toBeNull();
    expect(validateReason('x'.repeat(501))).toMatch(/largo/);
  });
});

describe('respuesta del firmante', () => {
  it('formatea booleanos, números y textos, y humaniza las claves', () => {
    expect(responseEntries({ agrees: true, balance: 12.5, notes_extra: 'ok', differenceAmount: 0 })).toEqual([
      ['Agrees', 'Sí'], ['Balance', '12.5'], ['Notes extra', 'ok'], ['Difference Amount', '0'],
    ]);
  });
  it('usa las etiquetas del tipo de documento cuando las hay', () => {
    expect(responseEntries({ agrees: false }, { agrees: 'Está de acuerdo con el saldo' })).toEqual([['Está de acuerdo con el saldo', 'No']]);
  });
  it('vacíos y formas raras no rompen', () => {
    expect(responseEntries(null)).toEqual([]);
    expect(responseEntries([1, 2])).toEqual([]);
    expect(responseEntries({ a: '', b: null })).toEqual([['A', '—'], ['B', '—']]);
  });
});

describe('firma presencial', () => {
  it('las etiquetas de la bitácora distinguen la creación y la renovación sin correo', () => {
    expect(eventLabel({ type: 'CREATED', detail: { inPerson: true } })).toMatch(/presencial/);
    expect(eventLabel({ type: 'CREATED', detail: { documentType: 'X' } })).toBe('Solicitud creada');
    expect(eventLabel({ type: 'RESENT', detail: { inPerson: true } })).toMatch(/presencial/);
    expect(eventLabel({ type: 'RESENT', detail: null })).toBe('Enlace reenviado');
  });
  it('el enlace vigente es presencial según la última creación o renovación', () => {
    const e = (type: string, inPerson?: boolean) => ({ type, detail: inPerson === undefined ? null : { inPerson } });
    expect(isInPersonRequest([])).toBe(false);
    expect(isInPersonRequest([e('CREATED', true)])).toBe(true);
    expect(isInPersonRequest([e('CREATED', true), e('OTP_SENT'), e('RESENT', false)])).toBe(false); // luego se reenvió por correo
    expect(isInPersonRequest([e('CREATED'), e('SENT'), e('RESENT', true), e('VIEWED')])).toBe(true);
  });
});

it('la ruta de verificación lleva el código en el fragmento', () => {
  expect(verifyPath('ABCD-EFGH-JKMN-PQRS')).toBe('/verificar#ABCD-EFGH-JKMN-PQRS');
});
