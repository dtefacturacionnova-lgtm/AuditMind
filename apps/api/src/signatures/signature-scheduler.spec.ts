/* eslint-disable @typescript-eslint/no-explicit-any */
import { buildHarness, INFO, makePdf, useClock } from './testing/harness';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe('Tareas programadas · vencimiento', () => {
  let clock: ReturnType<typeof useClock>;
  beforeEach(() => { clock = useClock(); });
  afterEach(() => { clock.restore(); jest.restoreAllMocks(); });

  it('marca como vencidas las activas cuya fecha pasó: sesiones cerradas, evento y adjuntos purgados', async () => {
    const h = buildHarness();
    const { id, token } = await h.create({ expiresInDays: 2 });
    const session = await h.openSession(token);
    await h.public.uploadAttachment(token, session, { originalname: 'a.pdf', buffer: await makePdf(1) }, INFO);

    expect(await h.scheduler.expireDue()).toBe(0); // todavía vigente
    clock.advance(3 * DAY);
    expect(await h.scheduler.expireDue()).toBe(1);
    expect(h.fake.requests.find((r) => r.id === id)!.status).toBe('EXPIRED');
    expect(h.fake.events.at(-1)!.type).toBe('EXPIRED');
    expect(h.fake.tables.signatureSession.every((s) => s.revokedAt)).toBe(true);
    expect(h.fake.tables.signatureAttachment).toHaveLength(0);
    expect(await h.scheduler.expireDue()).toBe(0); // idempotente
  });

  it('no toca lo firmado, rechazado ni revocado', async () => {
    const h = buildHarness();
    const a = await h.create({ targetId: 'a', expiresInDays: 1 });
    const b = await h.create({ targetId: 'b', expiresInDays: 1 });
    const c = await h.create({ targetId: 'c', expiresInDays: 1 });
    h.fake.requests.find((r) => r.id === a.id)!.status = 'SIGNED';
    h.fake.requests.find((r) => r.id === b.id)!.status = 'DECLINED';
    h.fake.requests.find((r) => r.id === c.id)!.status = 'REVOKED';
    clock.advance(5 * DAY);
    expect(await h.scheduler.expireDue()).toBe(0);
    expect(h.fake.requests.map((r) => r.status).sort()).toEqual(['DECLINED', 'REVOKED', 'SIGNED']);
  });
});

describe('Tareas programadas · recordatorios', () => {
  let clock: ReturnType<typeof useClock>;
  beforeEach(() => { clock = useClock(); });
  afterEach(() => { clock.restore(); jest.restoreAllMocks(); });

  it('un solo recordatorio, a 3 días del vencimiento, con el MISMO enlace original', async () => {
    const h = buildHarness();
    const { id, token } = await h.create({ expiresInDays: 10 });
    expect(await h.scheduler.sendReminders()).toBe(0); // faltan 10 días

    clock.advance(8 * DAY); // faltan 2
    expect(await h.scheduler.sendReminders()).toBe(1);
    expect(h.email.sendSignatureReminder).toHaveBeenCalledWith('juan@banco.com', expect.objectContaining({ token, replyTo: 'auditor@despacho.com' }));
    expect(h.fake.requests.find((r) => r.id === id)!.reminderSentAt).toBeInstanceOf(Date);
    expect(h.fake.events.at(-1)!.type).toBe('REMINDER_SENT');
    expect(await h.scheduler.sendReminders()).toBe(0); // ya no se repite
    // y el enlace del recordatorio sigue siendo el que recibió desde el principio
    await expect(h.public.getRequest(token)).resolves.toBeDefined();
  });

  it('no recuerda de inmediato una solicitud corta recién creada; pasadas 24 h sí', async () => {
    const h = buildHarness();
    await h.create({ targetId: 'corta', expiresInDays: 2 });
    expect(await h.scheduler.sendReminders()).toBe(0); // vence en 2 días pero se creó hace 0 h
    clock.advance(25 * HOUR);                          // le queda menos de 1 día y ya pasó 1 día desde que se creó
    expect(await h.scheduler.sendReminders()).toBe(1);
  });

  it('no recuerda si el aviso está desactivado ni si la solicitud ya no está activa', async () => {
    const h = buildHarness();
    await h.create({ targetId: 'sin-aviso', expiresInDays: 10, reminderEnabled: false });
    const firmada = await h.create({ targetId: 'firmada', expiresInDays: 10 });
    const activa = await h.create({ targetId: 'activa', expiresInDays: 10 });
    h.fake.requests.find((r) => r.id === firmada.id)!.status = 'SIGNED';
    clock.advance(8 * DAY);
    expect(await h.scheduler.sendReminders()).toBe(1);
    const titles = h.email.sendSignatureReminder.mock.calls.map((c: any) => c[1].title);
    expect(titles).toEqual(['Confirmación activa']);
    expect(activa.id).toBeDefined();
  });

  it('respeta el tope diario de correos de la organización', async () => {
    const h = buildHarness();
    const first = await h.create({ expiresInDays: 10 });
    clock.advance(8 * DAY);
    for (let i = 0; i < 300; i++) h.fake.tables.signatureEvent.push({ id: `x${i}`, requestId: first.id, seq: 100 + i, type: 'SENT', at: new Date(), ip: null, userAgent: null, actorId: null, detail: null, prevHash: '', hash: '' });
    expect(await h.scheduler.sendReminders()).toBe(0);
    expect(h.email.sendSignatureReminder).not.toHaveBeenCalled();
  });

  it('si el correo falla no marca el recordatorio como enviado (se reintenta en el siguiente ciclo)', async () => {
    const h = buildHarness();
    const { id } = await h.create({ expiresInDays: 10 });
    clock.advance(8 * DAY);
    h.email.sendSignatureReminder.mockResolvedValueOnce({ sent: false, emailId: null, error: 'x' });
    expect(await h.scheduler.sendReminders()).toBe(0);
    expect(h.fake.requests.find((r) => r.id === id)!.reminderSentAt).toBeNull();
    expect(await h.scheduler.sendReminders()).toBe(1);
  });
});

describe('Tareas programadas · limpieza y guardias', () => {
  let clock: ReturnType<typeof useClock>;
  beforeEach(() => { clock = useClock(); });
  afterEach(() => { clock.restore(); jest.restoreAllMocks(); });

  it('purga sesiones vencidas hace más de un día y adjuntos sin enviar solo de solicitudes ya cerradas', async () => {
    const h = buildHarness();
    const open = await h.create({ targetId: 'abierta' });
    const closed = await h.create({ targetId: 'cerrada' });
    const s1 = await h.openSession(open.token);
    const s2 = await h.openSession(closed.token);
    await h.public.uploadAttachment(open.token, s1, { originalname: 'a.pdf', buffer: await makePdf(1) }, INFO);
    await h.public.uploadAttachment(closed.token, s2, { originalname: 'b.pdf', buffer: await makePdf(1) }, INFO);
    h.fake.requests.find((r) => r.id === closed.id)!.status = 'EXPIRED'; // cerrada por otra vía, con su adjunto olvidado

    clock.advance(2 * DAY);
    const res = await h.scheduler.purgeStale();
    expect(res.sessions).toBe(2);
    expect(res.attachments).toBe(1);
    expect(h.fake.tables.signatureAttachment.map((a) => a.requestId)).toEqual([open.id]); // el de la solicitud ACTIVA se conserva
  });

  it('con la firma apagada ninguna tarea hace nada; y una tarea en curso no se ejecuta dos veces a la vez', async () => {
    const off = buildHarness({ SIGNATURES_PUBLIC_ENABLED: 'false' });
    const spy = jest.spyOn(off.sealing, 'runPending');
    await off.scheduler.sealPending();
    expect(spy).not.toHaveBeenCalled();

    const h = buildHarness();
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const run = jest.spyOn(h.sealing, 'runPending').mockImplementation(async () => { await gate; return 0; });
    const first = h.scheduler.sealPending();
    await h.scheduler.sealPending(); // segunda disparada mientras la primera sigue: se omite
    expect(run).toHaveBeenCalledTimes(1);
    release();
    await first;
    await h.scheduler.sealPending();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('un error dentro de una tarea no la mata: queda registrada y la siguiente corrida funciona', async () => {
    const h = buildHarness();
    jest.spyOn(h.sealing, 'runPending').mockRejectedValueOnce(new Error('BD caída'));
    await expect(h.scheduler.sealPending()).resolves.toBeUndefined();
    jest.spyOn(h.sealing, 'runPending').mockResolvedValueOnce(0);
    await expect(h.scheduler.sealPending()).resolves.toBeUndefined();
  });
});
