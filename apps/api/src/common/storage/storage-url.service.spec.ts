import { isPlainStoragePath, StorageUrlService } from './storage-url.service';

process.env.SUPABASE_URL ??= 'https://proyecto.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'clave-de-prueba';

const ORG = 'org-a';
const REQ = '11111111-2222-3333-4444-555555555555';
const SIGNED = `signature-requests/audit-1/${REQ}/signed.pdf`;
const canonical = (path: string) => `https://proyecto.supabase.co/storage/v1/object/public/audit-files/${path}`;

function build(rows: Array<{ organizationId: string; signedPdfPath: string }>) {
  const findMany = jest.fn(async ({ where }: { where: { organizationId: string; signedPdfPath: { in: string[] } } }) =>
    rows.filter((r) => r.organizationId === where.organizationId && where.signedPdfPath.in.includes(r.signedPdfPath)));
  const svc = new StorageUrlService({ signatureRequest: { findMany } } as never);
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
    const out = await svc.signResponse({ url: canonical('audits/a/evidencia.pdf') }, { organizationId: ORG });
    expect(out.url).toBe('FIRMADA:audits/a/evidencia.pdf');
  });

  it('original, adjuntos y cuarentena de la firma NUNCA se firman aquí (solo por /signature-requests/:id/file)', async () => {
    const { svc } = build([{ organizationId: ORG, signedPdfPath: SIGNED }]);
    const paths = [
      `signature-requests/audit-1/${REQ}/original.pdf`,
      `signature-requests/audit-1/${REQ}/attachments/att-1.pdf`,
      `signature-requests/audit-1/${REQ}/attachments/quarantine/att-1.png`,
      `signature-requests/audit-1/authorizations/conf-1/${REQ}.pdf`,
    ];
    const out = await svc.signResponse({ accountRef: paths.map(canonical) }, { organizationId: ORG });
    expect(out.accountRef).toEqual(paths.map(canonical)); // intactas: el navegador no obtiene enlace
  });

  it('el PDF sellado solo si la solicitud es de la organización de quien consulta', async () => {
    const { svc, findMany } = build([{ organizationId: ORG, signedPdfPath: SIGNED }]);
    expect((await svc.signResponse({ fileUrl: canonical(SIGNED) }, { organizationId: ORG })).fileUrl).toBe(`FIRMADA:${SIGNED}`);
    expect((await svc.signResponse({ fileUrl: canonical(SIGNED) }, { organizationId: 'org-b' })).fileUrl).toBe(canonical(SIGNED));
    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it('sin sesión (organización desconocida) no se firma ningún archivo de firma', async () => {
    const { svc, findMany } = build([{ organizationId: ORG, signedPdfPath: SIGNED }]);
    expect((await svc.signResponse({ fileUrl: canonical(SIGNED) }, {})).fileUrl).toBe(canonical(SIGNED));
    expect(findMany).not.toHaveBeenCalled();
  });

  it('un recorrido con `..` no se firma aunque empiece por otra carpeta', async () => {
    const { svc } = build([]);
    const sneaky = canonical(`audits/../signature-requests/audit-1/${REQ}/attachments/quarantine/att-1.png`);
    expect((await svc.signResponse({ x: sneaky }, { organizationId: ORG })).x).toBe(sneaky);
  });

  it('cualquier host en la URL: lo que cuenta es la ruta', async () => {
    const { svc } = build([]);
    const evil = `https://evil.example/storage/v1/object/public/audit-files/signature-requests/audit-1/${REQ}/original.pdf`;
    expect((await svc.signResponse({ x: evil }, { organizationId: ORG })).x).toBe(evil);
  });
});
