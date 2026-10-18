/* eslint-disable @typescript-eslint/no-explicit-any */
import { AuditBackupFilesService } from './audit-backup-files.service';

/** Storage falso con carpetas: un objeto con `id` es archivo; sin `id`, carpeta. */
function fakeSupabase(tree: Record<string, Array<{ name: string; id?: string }>>) {
  const removed: string[] = [];
  const listed: string[] = [];
  return {
    removed, listed,
    storage: {
      from: () => ({
        list: async (dir: string) => { listed.push(dir); return { data: tree[dir] ?? [], error: null }; },
        remove: async (paths: string[]) => { removed.push(...paths); return { data: paths.map((p) => ({ name: p })), error: null }; },
      }),
    },
  };
}

function service(tree: Record<string, Array<{ name: string; id?: string }>>) {
  process.env.SUPABASE_URL ||= 'http://localhost'; process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'x';
  const svc = new AuditBackupFilesService();
  const fake = fakeSupabase(tree);
  (svc as any).supabaseAdmin = fake;
  return { svc, fake };
}

describe('AuditBackupFilesService.borrarPrefijo (archivos de firma al borrar un encargo)', () => {
  it('recorre las subcarpetas y borra solo lo que cuelga del prefijo', async () => {
    const { svc, fake } = service({
      'signature-requests/aud1': [{ name: 'req1' }, { name: 'req2' }],
      'signature-requests/aud1/req1': [{ name: 'original.pdf', id: 'a' }, { name: 'signed.pdf', id: 'b' }, { name: 'attachments' }],
      'signature-requests/aud1/req1/attachments': [{ name: 'x.pdf', id: 'c' }, { name: 'quarantine' }],
      'signature-requests/aud1/req1/attachments/quarantine': [{ name: 'x.pdf', id: 'd' }],
      'signature-requests/aud1/req2': [{ name: 'original.pdf', id: 'e' }],
      'signature-requests/aud2': [{ name: 'reqX' }], // OTRO encargo: no se toca
    });
    const res = await svc.borrarPrefijo('signature-requests/aud1/');
    expect(res).toEqual({ ok: 5, error: 0 });
    expect(fake.removed.sort()).toEqual([
      'signature-requests/aud1/req1/attachments/quarantine/x.pdf',
      'signature-requests/aud1/req1/attachments/x.pdf',
      'signature-requests/aud1/req1/original.pdf',
      'signature-requests/aud1/req1/signed.pdf',
      'signature-requests/aud1/req2/original.pdf',
    ]);
    expect(fake.listed.some((d) => d.startsWith('signature-requests/aud2'))).toBe(false);
  });

  it('una carpeta vacía o inexistente no borra nada', async () => {
    const { svc, fake } = service({});
    expect(await svc.borrarPrefijo('signature-requests/aud1')).toEqual({ ok: 0, error: 0 });
    expect(fake.removed).toEqual([]);
  });

  it('rechaza prefijos vacíos o con ".." (nunca recorre fuera de lo pedido)', async () => {
    const { svc, fake } = service({ '': [{ name: 'todo', id: 'z' }] });
    expect(await svc.borrarPrefijo('')).toEqual({ ok: 0, error: 0 });
    expect(await svc.borrarPrefijo('/')).toEqual({ ok: 0, error: 0 });
    expect(await svc.borrarPrefijo('signature-requests/../sections')).toEqual({ ok: 0, error: 0 });
    expect(fake.removed).toEqual([]);
    expect(fake.listed).toEqual([]);
  });
});
