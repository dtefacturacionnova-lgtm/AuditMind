/* eslint-disable @typescript-eslint/no-explicit-any */
import { buildHarness, INFO, makePdf } from './testing/harness';
import {
  ATTACHMENT_LIMITS, detectFileType, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS, MAX_ATTACHMENTS_TOTAL_BYTES, sanitizeFilename,
} from './signature-attachments.service';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);
const EICAR_LIKE = Buffer.from('%PDF-1.4\n' + 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*');

describe('detectFileType (por los bytes, no por la extensión)', () => {
  it('reconoce PDF, JPEG y PNG', async () => {
    expect(detectFileType(await makePdf(1))).toBe('pdf');
    expect(detectFileType(JPG)).toBe('jpeg');
    expect(detectFileType(PNG)).toBe('png');
  });
  it('rechaza ejecutables, scripts, HTML, SVG, ZIP, vacío y cabeceras incompletas', () => {
    for (const bad of [
      Buffer.from('MZ\x90\x00'), Buffer.from('#!/bin/sh\necho hola'), Buffer.from('<html><script>alert(1)</script>'),
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), Buffer.from('PK\x03\x04docx'), Buffer.alloc(0),
      Buffer.from('%PD'), Buffer.from([0xff, 0xd8]), Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      Buffer.from(' %PDF-1.4'), // el PDF debe empezar en el byte 0
    ]) expect(detectFileType(bad)).toBeNull();
  });
});

describe('sanitizeFilename', () => {
  it('quita rutas, caracteres de control y separadores, y limita el largo', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('C:\\Users\\Ana\\estado.pdf')).toBe('estado.pdf');
    expect(sanitizeFilename('a:b*c?d"e<f>g|h.pdf')).toBe('a_b_c_d_e_f_g_h.pdf');
    expect(sanitizeFilename('x\u0000\u001f.pdf')).toBe('x__.pdf');
    expect(sanitizeFilename('a'.repeat(500))).toHaveLength(200);
    expect(sanitizeFilename('')).toBe('archivo');
    expect(sanitizeFilename('   ')).toBe('archivo');
  });
});

async function open() {
  const h = buildHarness();
  const c = await h.create();
  const session = await h.openSession(c.token);
  const files = () => [...h.storage.files.keys()].filter((k) => k.includes('/attachments/'));
  const upload = (name: string, buffer: Buffer) => h.public.uploadAttachment(c.token, session, { originalname: name, buffer }, INFO);
  return { h, ...c, session, upload, files };
}

describe('Adjuntos del tercero · cadena de defensa', () => {
  afterEach(() => jest.restoreAllMocks());

  it('un PDF limpio: cuarentena + copia reconstruida + antivirus + evento, con huellas', async () => {
    const { h, id, upload, files } = await open();
    const res = await upload('Estado de cuenta.pdf', await makePdf(2));
    expect(res).toMatchObject({ originalName: 'Estado de cuenta.pdf', status: 'accepted' });
    expect(h.clam.scans).toBe(1);

    const att = h.fake.tables.signatureAttachment[0];
    expect(att).toMatchObject({ requestId: id, detectedType: 'pdf', scanStatus: 'CLEAN', submitted: false });
    expect(att.quarantinePath).toContain('/attachments/quarantine/');
    expect(att.safePath).toMatch(/\/attachments\/[0-9a-f-]+\.pdf$/);
    expect(files()).toHaveLength(2); // original en cuarentena + reconstruido
    expect(att.safeSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(h.fake.events.at(-1)).toMatchObject({ type: 'ATTACHMENT_ACCEPTED', detail: { name: 'Estado de cuenta.pdf' } });
  });

  it('una imagen se convierte primero a PDF (reconstrucción)', async () => {
    const { h, upload } = await open();
    const spy = jest.spyOn(h.pdfTools, 'imageToPdf');
    await upload('foto.png', PNG);
    await upload('foto2.jpg', JPG);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(h.fake.tables.signatureAttachment.map((a) => a.detectedType)).toEqual(['png', 'jpeg']);
  });

  it('el tipo se decide por los bytes: un ejecutable renombrado .pdf se rechaza SIN llegar al antivirus ni a Storage', async () => {
    const { h, upload, files } = await open();
    await expect(upload('factura.pdf', Buffer.from('MZ\x90\x00 programa'))).rejects.toThrow(/Tipo de archivo no permitido/);
    await expect(upload('foto.jpg', Buffer.from('<?php system($_GET[1]); ?>'))).rejects.toThrow(/Tipo de archivo no permitido/);
    expect(h.clam.scans).toBe(0);
    expect(files()).toHaveLength(0);
    expect(h.fake.tables.signatureAttachment).toHaveLength(0);
  });

  it('con un virus: 422, se borra de cuarentena, no queda fila y se deja constancia con el nombre de la amenaza', async () => {
    const { h, upload, files } = await open();
    h.clam.result = { status: 'INFECTED', signature: 'Win.Test.EICAR_HDB-1' };
    await expect(upload('x.pdf', EICAR_LIKE)).rejects.toMatchObject({ status: 422 });
    expect(files()).toHaveLength(0);
    expect(h.fake.tables.signatureAttachment).toHaveLength(0);
    expect(h.fake.events.at(-1)).toMatchObject({ type: 'ATTACHMENT_REJECTED', detail: { reason: 'infected', signature: 'Win.Test.EICAR_HDB-1' } });
  });

  it('FALLA CERRADO: si el antivirus no responde, el archivo NO se acepta (503) y se limpia', async () => {
    const { h, upload, files } = await open();
    h.clam.result = { status: 'ERROR', error: 'ECONNREFUSED' };
    await expect(upload('x.pdf', await makePdf(1))).rejects.toMatchObject({ status: 503 });
    expect(files()).toHaveLength(0);
    expect(h.fake.tables.signatureAttachment).toHaveLength(0);
    expect(h.fake.events.at(-1)!.detail).toMatchObject({ reason: 'scan_error' });
  });

  it('si la reconstrucción falla o no produce un PDF, se rechaza y se limpia', async () => {
    const { h, upload, files } = await open();
    jest.spyOn(h.pdfTools, 'sanitizePdf').mockRejectedValueOnce(new Error('stirling caído'));
    await expect(upload('x.pdf', await makePdf(1))).rejects.toThrow(/No se pudo procesar el archivo/);
    jest.spyOn(h.pdfTools, 'sanitizePdf').mockResolvedValueOnce(Buffer.from('no soy un pdf'));
    await expect(upload('y.pdf', await makePdf(1))).rejects.toThrow(/No se pudo procesar el archivo/);
    expect(files()).toHaveLength(0);
    expect(h.fake.tables.signatureAttachment).toHaveLength(0);
  });

  it('los límites reales son 5 archivos, 10 MB cada uno y 30 MB en total', () => {
    expect(ATTACHMENT_LIMITS).toEqual({ maxFiles: 5, maxBytes: 10 * 1024 * 1024, maxTotalBytes: 30 * 1024 * 1024 });
    expect(MAX_ATTACHMENTS).toBe(5);
    expect(MAX_ATTACHMENT_BYTES).toBe(10 * 1024 * 1024);
    expect(MAX_ATTACHMENTS_TOTAL_BYTES).toBe(30 * 1024 * 1024);
  });

  it('se aplican: vacío, demasiado grande, demasiados archivos y total excedido (con límites reducidos para no gastar memoria)', async () => {
    const saved = { ...ATTACHMENT_LIMITS };
    try {
      const { h, upload } = await open();
      const sized = (n: number) => Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(n)]);
      Object.assign(ATTACHMENT_LIMITS, { maxFiles: 3, maxBytes: 2_000, maxTotalBytes: 3_500 });

      await expect(upload('v.pdf', Buffer.alloc(0))).rejects.toThrow(/vacío/);
      await expect(upload('g.pdf', sized(2_001))).rejects.toThrow(/10 MB/);          // pasa de maxBytes
      await upload('a.pdf', sized(1_500));
      await upload('b.pdf', sized(1_500));
      await expect(upload('c.pdf', sized(1_000))).rejects.toThrow(/30 MB/);          // 1500+1500+1000 > total
      await upload('c.pdf', sized(400));
      await expect(upload('d.pdf', sized(10))).rejects.toThrow(/Máximo 3 archivos/); // ya hay 3
      expect(h.fake.tables.signatureAttachment).toHaveLength(3);
      // lo rechazado por tamaño ni siquiera llegó al antivirus
      expect(h.clam.scans).toBe(3);
    } finally {
      Object.assign(ATTACHMENT_LIMITS, saved);
    }
  });

  it('el nombre se sanea al guardarlo', async () => {
    const { h, upload } = await open();
    // la "/" de "</b>" cuenta como separador de ruta: solo queda el último tramo, ya sin caracteres peligrosos
    await upload('../../<b>mal</b>.pdf', await makePdf(1));
    expect(h.fake.tables.signatureAttachment[0].originalName).toBe('b_.pdf');
  });

  it('solo se admiten adjuntos en documentos que los permiten (403) y exige sesión (401)', async () => {
    const { h, token, session } = await open();
    await expect(h.public.uploadAttachment(token, undefined, { originalname: 'a.pdf', buffer: await makePdf(1) }, INFO)).rejects.toMatchObject({ status: 401 });
    (h.adapter as any).allowsAttachments = false;
    await expect(h.public.uploadAttachment(token, session, { originalname: 'a.pdf', buffer: await makePdf(1) }, INFO)).rejects.toMatchObject({ status: 403 });
    await expect(h.public.uploadAttachment(token, session, undefined, INFO)).rejects.toMatchObject({ status: 403 });
  });

  it('quitar un adjunto (antes de firmar) borra fila y archivos; uno ya enviado no se puede quitar', async () => {
    const { h, token, session, upload, files } = await open();
    const a = await upload('a.pdf', await makePdf(1));
    await expect(h.public.removeAttachment(token, session, a.id)).resolves.toEqual({ removed: true });
    expect(files()).toHaveLength(0);
    expect(h.fake.tables.signatureAttachment).toHaveLength(0);
    await expect(h.public.removeAttachment(token, session, a.id)).rejects.toMatchObject({ status: 404 });

    const b = await upload('b.pdf', await makePdf(1));
    h.fake.tables.signatureAttachment.find((x) => x.id === b.id)!.submitted = true;
    await expect(h.public.removeAttachment(token, session, b.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe('Archivo suelto (carta de autorización del auditor) · misma cadena de defensa', () => {
  afterEach(() => jest.restoreAllMocks());
  const FOLDER = 'signature-requests/aud1/authorizations/conf1';
  const files = (h: ReturnType<typeof buildHarness>) => [...h.storage.files.keys()].filter((k) => k.startsWith(FOLDER));

  it('un PDF limpio queda reconstruido en la carpeta, con el original en cuarentena y sus huellas', async () => {
    const h = buildHarness();
    const r = await h.attachments.acceptStandalone({ originalname: '../Carta de autorización.pdf', buffer: await makePdf(1) }, FOLDER);
    expect(r).toMatchObject({ name: 'Carta de autorización.pdf', safePath: `${FOLDER}/${r.id}.pdf` });
    expect(r.safeSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(h.clam.scans).toBe(1);
    expect(files(h).sort()).toEqual([`${FOLDER}/${r.id}.pdf`, `${FOLDER}/quarantine/${r.id}.pdf`].sort());
    expect(h.fake.tables.signatureAttachment).toHaveLength(0); // no es un adjunto de ninguna solicitud
  });

  it('una imagen se convierte a PDF', async () => {
    const h = buildHarness();
    const spy = jest.spyOn(h.pdfTools, 'imageToPdf');
    await h.attachments.acceptStandalone({ originalname: 'carta.png', buffer: PNG }, FOLDER);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('rechaza por los bytes (sin antivirus ni Storage), por virus y cuando el antivirus no responde (falla cerrado)', async () => {
    const h = buildHarness();
    await expect(h.attachments.acceptStandalone({ originalname: 'x.pdf', buffer: Buffer.from('MZ\x90\x00 programa') }, FOLDER)).rejects.toThrow(/Tipo de archivo no permitido/);
    expect(h.clam.scans).toBe(0);
    expect(files(h)).toHaveLength(0);

    h.clam.result = { status: 'INFECTED', signature: 'Win.Test.EICAR_HDB-1' };
    await expect(h.attachments.acceptStandalone({ originalname: 'x.pdf', buffer: EICAR_LIKE }, FOLDER)).rejects.toMatchObject({ status: 422 });
    h.clam.result = { status: 'ERROR', error: 'ECONNREFUSED' };
    await expect(h.attachments.acceptStandalone({ originalname: 'x.pdf', buffer: await makePdf(1) }, FOLDER)).rejects.toMatchObject({ status: 503 });
    expect(files(h)).toHaveLength(0); // nada queda en cuarentena
  });

  it('si la reconstrucción falla se limpia todo; vacío y demasiado grande se rechazan', async () => {
    const h = buildHarness();
    jest.spyOn(h.pdfTools, 'sanitizePdf').mockRejectedValueOnce(new Error('stirling caído'));
    await expect(h.attachments.acceptStandalone({ originalname: 'x.pdf', buffer: await makePdf(1) }, FOLDER)).rejects.toThrow(/No se pudo procesar el archivo/);
    expect(files(h)).toHaveLength(0);
    await expect(h.attachments.acceptStandalone({ originalname: 'x.pdf', buffer: Buffer.alloc(0) }, FOLDER)).rejects.toThrow(/vacío/);
    const prev = ATTACHMENT_LIMITS.maxBytes;
    ATTACHMENT_LIMITS.maxBytes = 100;
    try {
      await expect(h.attachments.acceptStandalone({ originalname: 'x.pdf', buffer: Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(200)]) }, FOLDER)).rejects.toThrow(/10 MB/);
    } finally {
      ATTACHMENT_LIMITS.maxBytes = prev;
    }
  });
});
