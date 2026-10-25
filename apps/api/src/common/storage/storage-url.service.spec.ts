import { isPlainStoragePath, ownerOfPath, StorageUrlService } from './storage-url.service';

process.env.SUPABASE_URL ??= 'https://proyecto.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'clave-de-prueba';

const ORG = 'org-a';
const ME = { organizationId: ORG, userId: 'user-1', role: 'AUDITOR' };
// Encargo de la organización que el usuario ve (los ids son los de los segmentos de ruta de las pruebas)
const AUDIT_OK = 'cmaudit0000000000000001';
const REQ = '11111111-2222-3333-4444-555555555555';
const SIGNED = `signature-requests/audit-1/${REQ}/signed.pdf`;
const canonical = (path: string) => `https://proyecto.supabase.co/storage/v1/object/public/audit-files/${path}`;

function build(rows: Array<{ organizationId: string; signedPdfPath: string }>, visible: { audits?: string[]; papers?: string[]; steps?: string[] } = {}) {
  const findMany = jest.fn(async ({ where }: { where: { organizationId: string; signedPdfPath: { in: string[] } } }) =>
    rows.filter((r) => r.organizationId === where.organizationId && where.signedPdfPath.in.includes(r.signedPdfPath)));
  const only = (ok: string[] = []) => jest.fn(async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.filter((id) => ok.includes(id)).map((id) => ({ id })));
  const svc = new StorageUrlService({
    signatureRequest: { findMany },
    audit: { findMany: only(visible.audits ?? [AUDIT_OK]) },
    workingPaper: { findMany: only(visible.papers) },
    auditStep: { findMany: only(visible.steps) },
  } as never);
  // Sin red: "firmar" devuelve una URL marcada.
  jest.spyOn(svc as never as { signPaths: (p: string[]) => Promise<Map<string, string>> }, 'signPaths')
    .mockImplementation(async (paths: string[]) => new Map(paths.map((p) => [p, `FIRMADA:${p}`])));
  return { svc, findMany };
}

describe('isPlainStoragePath', () => {
  it('rechaza recorridos, segmentos vacíos y barras raras', () => {
    expect(isPlainStoragePath('audits/a/b.pdf')).toBe(true);
    for (const bad of ['', '/audits/a.pdf', 'audits/../signature-requests/x', 'a//b', 'a/./b', 'a\\b']) expect(isPlainStoragePath(bad)).toBe(false);
  });
});

describe('StorageUrlService: qué rutas firma el interceptor', () => {
  it('rutas normales del bucket se firman como antes', async () => {
    const { svc } = build([]);
    const out = await svc.signResponse({ url: canonical(`${AUDIT_OK}/evidencia.pdf`) }, ME);
    expect(out.url).toBe(`FIRMADA:${AUDIT_OK}/evidencia.pdf`);
  });

  it('original, adjuntos y cuarentena de la firma NUNCA se firman aquí (solo por /signature-requests/:id/file)', async () => {
    const { svc } = build([{ organizationId: ORG, signedPdfPath: SIGNED }]);
    const paths = [
      `signature-requests/audit-1/${REQ}/original.pdf`,
      `signature-requests/audit-1/${REQ}/attachments/att-1.pdf`,
      `signature-requests/audit-1/${REQ}/attachments/quarantine/att-1.png`,
      `signature-requests/audit-1/authorizations/conf-1/${REQ}.pdf`,
    ];
    const out = await svc.signResponse({ accountRef: paths.map(canonical) }, ME);
    expect(out.accountRef).toEqual(paths.map(canonical)); // intactas: el navegador no obtiene enlace
  });

  it('el PDF sellado solo si la solicitud es de la organización de quien consulta', async () => {
    const { svc, findMany } = build([{ organizationId: ORG, signedPdfPath: SIGNED }]);
    expect((await svc.signResponse({ fileUrl: canonical(SIGNED) }, ME)).fileUrl).toBe(`FIRMADA:${SIGNED}`);
    expect((await svc.signResponse({ fileUrl: canonical(SIGNED) }, { ...ME, organizationId: 'org-b' })).fileUrl).toBe(canonical(SIGNED));
    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it('sin sesión (organización desconocida) no se firma ningún archivo de firma', async () => {
    const { svc, findMany } = build([{ organizationId: ORG, signedPdfPath: SIGNED }]);
    expect((await svc.signResponse({ fileUrl: canonical(SIGNED) }, {})).fileUrl).toBe(canonical(SIGNED));
    expect(findMany).not.toHaveBeenCalled();
  });

  it('un recorrido con `..` no se firma aunque empiece por otra carpeta', async () => {
    const { svc } = build([]);
    const sneaky = canonical(`${AUDIT_OK}/../signature-requests/audit-1/${REQ}/attachments/quarantine/att-1.png`);
    expect((await svc.signResponse({ x: sneaky }, ME)).x).toBe(sneaky);
  });

  it('cualquier host en la URL: lo que cuenta es la ruta', async () => {
    const { svc } = build([]);
    const evil = `https://evil.example/storage/v1/object/public/audit-files/signature-requests/audit-1/${REQ}/original.pdf`;
    expect((await svc.signResponse({ x: evil }, ME)).x).toBe(evil);
  });
});

describe('ownerOfPath: de quién es cada familia de rutas del bucket', () => {
  const ID = 'cmaudit0000000000000001';
  it.each([
    [`${ID}/1700_acta.pdf`, { kind: 'audit', id: ID }],
    [`evidence/${ID}/cmpaper00000000000000001/e1_foto.jpg`, { kind: 'audit', id: ID }],
    [`evidence/${ID}/_investigacion/e1_nota.m4a`, { kind: 'audit', id: ID }],
    [`request-docs/${ID}/1700_oficio.pdf`, { kind: 'audit', id: ID }],
    [`signed-papers/${ID}/cmpaper00000000000000001/review_1700.pdf`, { kind: 'audit', id: ID }],
    [`restored/${ID}/sections/cmpaper00000000000000001/S1/1700_a.pdf`, { kind: 'audit', id: ID }],
    ['sections/cmpaper00000000000000001/S1/1700_a.pdf', { kind: 'paper', id: 'cmpaper00000000000000001' }],
    ['docevidence/cmpaper00000000000000001/row1/1700_a.pdf', { kind: 'paper', id: 'cmpaper00000000000000001' }],
    ['acct-schedule/cmpaper00000000000000001/row1/1700_a.pdf', { kind: 'paper', id: 'cmpaper00000000000000001' }],
    ['procedures/cmpaper00000000000000001/cmproc00000000000000001/1700_a.pdf', { kind: 'paper', id: 'cmpaper00000000000000001' }],
    ['procedures/steps/cmstep00000000000000001/1700_a.pdf', { kind: 'step', id: 'cmstep00000000000000001' }],
  ])('%s', (path, owner) => expect(ownerOfPath(path)).toEqual(owner));

  it('una carpeta desconocida, una ruta corta o la de firma no tienen dueño (no se firman)', () => {
    for (const p of ['docs/otra-cosa.pdf', 'evidence/solo', 'sections/cmpaper00000000000000001', 'a.pdf', 'signature-requests/x/y/signed.pdf', 'procedures/steps']) {
      expect(ownerOfPath(p)).toBeNull();
    }
  });
});

describe('StorageUrlService: solo firma lo que es del usuario (dueño de la ruta)', () => {
  const OTHER = 'cmaudit0000000000000099';
  it('un archivo de un encargo que no es suyo (otra organización o investigación ajena) no se firma aunque aparezca en la respuesta', async () => {
    const { svc } = build([], { audits: [AUDIT_OK] });
    const mine = canonical(`${AUDIT_OK}/a.pdf`); const foreign = canonical(`${OTHER}/a.pdf`);
    const out = await svc.signResponse({ items: [mine, foreign, canonical(`evidence/${OTHER}/p/e.jpg`)] }, ME);
    expect(out.items).toEqual([`FIRMADA:${AUDIT_OK}/a.pdf`, foreign, canonical(`evidence/${OTHER}/p/e.jpg`)]);
  });

  it('papeles y pasos: se firma solo el de un papel o paso visible', async () => {
    const { svc } = build([], { papers: ['cmpaper00000000000000001'], steps: ['cmstep00000000000000001'] });
    const urls = [
      canonical('sections/cmpaper00000000000000001/S1/a.pdf'), canonical('sections/cmpaper00000000000000002/S1/a.pdf'),
      canonical('procedures/steps/cmstep00000000000000001/a.pdf'), canonical('procedures/steps/cmstep00000000000000002/a.pdf'),
    ];
    const out = await svc.signResponse({ urls }, ME);
    expect(out.urls).toEqual(['FIRMADA:sections/cmpaper00000000000000001/S1/a.pdf', urls[1], 'FIRMADA:procedures/steps/cmstep00000000000000001/a.pdf', urls[3]]);
  });

  it('sin saber quién es (usuario o rol ausentes) no se firma ningún archivo de un encargo', async () => {
    const { svc } = build([]);
    const url = canonical(`${AUDIT_OK}/a.pdf`);
    for (const scope of [{ organizationId: ORG }, { organizationId: ORG, userId: 'u' }, { userId: 'u', role: 'CAE' }, {}]) {
      expect((await svc.signResponse({ url }, scope)).url).toBe(url);
    }
  });

  it('una carpeta que no es de ninguna familia conocida no se firma', async () => {
    const { svc } = build([]);
    const url = canonical('docs/cualquier-cosa.pdf');
    expect((await svc.signResponse({ url }, ME)).url).toBe(url);
  });
});
