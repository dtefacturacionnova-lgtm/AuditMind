/* eslint-disable @typescript-eslint/no-explicit-any */
process.env.SUPABASE_URL ??= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'clave-de-prueba';

import { buildOrphanReport, groupByOwner, ownerOfStoredPath, quarantinePathOf } from './storage-orphans.util';
import { removeStoragePrefixes, listStorageFiles } from './storage-prefix.util';

const AUDIT = 'cmaudit000000000000000001a';
const AUDIT_GONE = 'cmaudit000000000000000002b';
const PAPER = 'cmpaper000000000000000001a';
const PAPER_GONE = 'cmpaper000000000000000002b';
const STEP_GONE = 'cmstep000000000000000002b';

describe('dueño de cada ruta del bucket', () => {
  it('reconoce todas las familias que sube el código, incluida la firma por enlace', () => {
    expect(ownerOfStoredPath(`${AUDIT}/a.pdf`)).toEqual({ kind: 'audit', id: AUDIT });
    expect(ownerOfStoredPath(`evidence/${AUDIT}/a.pdf`)).toEqual({ kind: 'audit', id: AUDIT });
    expect(ownerOfStoredPath(`sections/${PAPER}/S1/a.pdf`)).toEqual({ kind: 'paper', id: PAPER });
    expect(ownerOfStoredPath(`docevidence/${PAPER}/r1/a.pdf`)).toEqual({ kind: 'paper', id: PAPER });
    expect(ownerOfStoredPath(`acct-schedule/${PAPER}/r1/a.pdf`)).toEqual({ kind: 'paper', id: PAPER });
    expect(ownerOfStoredPath(`procedures/${PAPER}/cmproc000000000000000001a/a.pdf`)).toEqual({ kind: 'paper', id: PAPER });
    expect(ownerOfStoredPath(`procedures/steps/${STEP_GONE}/a.pdf`)).toEqual({ kind: 'step', id: STEP_GONE });
    expect(ownerOfStoredPath(`signature-requests/${AUDIT}/cmreq0000000000000000001a/signed.pdf`)).toEqual({ kind: 'audit', id: AUDIT });
    expect(ownerOfStoredPath('suelto.pdf')).toBeNull();
  });
});

describe('informe de huérfanos', () => {
  const paths = [
    `${AUDIT}/vivo.pdf`, `${AUDIT_GONE}/muerto.pdf`, `${AUDIT_GONE}/otro.pdf`,
    `sections/${PAPER}/S1/vivo.pdf`, `sections/${PAPER_GONE}/S1/muerto.pdf`, `docevidence/${PAPER_GONE}/r1/muerto.pdf`,
    `procedures/steps/${STEP_GONE}/muerto.pdf`,
    `signature-requests/${AUDIT_GONE}/cmreq0000000000000000001a/signed.pdf`,
    // rutas que NO deben tocarse jamás: nombres de carpeta que no son ids de la base y rutas fuera de toda familia
    'quarantine-backup/viejo.zip', 'backups/2026/todo.zip', 'raiz.txt', 'carpeta-con-nombre-largo-que-no-es-id/x.pdf',
  ];

  it('solo es huérfano el archivo cuyo dueño con forma de id de la base ya no existe', () => {
    const r = buildOrphanReport(paths, { audit: new Set([AUDIT]), paper: new Set([PAPER]), step: new Set() });
    expect(r.totalFiles).toBe(paths.length);
    expect(r.orphans.map((o) => `${o.kind}:${o.id}:${o.files.length}`)).toEqual([
      `audit:${AUDIT_GONE}:3`, `paper:${PAPER_GONE}:2`, `step:${STEP_GONE}:1`,
    ]);
    expect(r.keptFiles).toBe(2); // el encargo y el papel vivos
    expect(r.unknown.sort()).toEqual(['backups/2026/todo.zip', 'carpeta-con-nombre-largo-que-no-es-id/x.pdf', 'quarantine-backup/viejo.zip', 'raiz.txt']);
  });

  it('lo que no se pudo comprobar (tipo ausente) se conserva: nunca se declara huérfano lo que no se verificó', () => {
    const r = buildOrphanReport(paths, { audit: new Set([AUDIT]) });
    expect(r.orphans.map((o) => o.kind)).toEqual(['audit']);
    expect(r.keptFiles).toBe(2 + 2 + 1); // vivos + papeles y paso sin verificar
  });

  it('agrupa por dueño y manda a «sin clasificar» lo que no tiene id reconocible', () => {
    const { owned, unknown } = groupByOwner(paths);
    expect(owned.size).toBe(5);
    expect(unknown).toHaveLength(4);
  });

  it('la ruta de cuarentena conserva la original para poder devolverla', () => {
    expect(quarantinePathOf(`sections/${PAPER_GONE}/S1/a.pdf`, '2026-10-25')).toBe(`_orphans-quarantine/2026-10-25/sections/${PAPER_GONE}/S1/a.pdf`);
    // lo que ya está en cuarentena no se vuelve a analizar como dueño: su primer segmento no es un id de la base
    expect(groupByOwner([quarantinePathOf(`${AUDIT_GONE}/a.pdf`, '2026-10-25')]).owned.size).toBe(0);
  });
});

/** Cliente de Storage en memoria: carpetas y archivos por ruta, con la misma forma de respuesta que Supabase (los archivos traen `id`). */
function fakeClient(files: string[], opts: { failRemove?: boolean } = {}) {
  const live = new Set(files);
  const removedBatches: string[][] = [];
  const bucket = {
    list: async (folder: string, o: { limit: number; offset: number }) => {
      const prefix = folder ? `${folder}/` : '';
      const names = new Map<string, boolean>(); // nombre → es archivo
      for (const f of live) {
        if (!f.startsWith(prefix)) continue;
        const rest = f.slice(prefix.length);
        const [head, ...tail] = rest.split('/');
        names.set(head, tail.length === 0);
      }
      const data = [...names.entries()].map(([name, isFile]) => ({ name, id: isFile ? `id-${name}` : null }));
      return { data: data.slice(o.offset, o.offset + o.limit), error: null };
    },
    remove: async (batch: string[]) => {
      removedBatches.push(batch);
      if (opts.failRemove) return { data: null, error: { message: 'boom' } };
      batch.forEach((b) => live.delete(b));
      return { data: batch.map((name) => ({ name })), error: null };
    },
  };
  return { client: { storage: { from: () => bucket } } as any, live, removedBatches };
}

describe('limpieza de Storage al borrar un papel, un procedimiento o un paso', () => {
  const files = [
    `sections/${PAPER_GONE}/S1/a.pdf`, `sections/${PAPER_GONE}/S2/b.pdf`, `docevidence/${PAPER_GONE}/r1/c.pdf`,
    `sections/${PAPER}/S1/vivo.pdf`, `procedures/steps/${STEP_GONE}/p.pdf`, `procedures/steps/cmstep000000000000000009z/otro.pdf`,
  ];

  it('lista y borra solo lo que cuelga de las carpetas pedidas, recorriendo las subcarpetas', async () => {
    const { client, live } = fakeClient(files);
    expect(await listStorageFiles(client, `sections/${PAPER_GONE}`)).toEqual([`sections/${PAPER_GONE}/S1/a.pdf`, `sections/${PAPER_GONE}/S2/b.pdf`]);
    const r = await removeStoragePrefixes(client, [`sections/${PAPER_GONE}`, `docevidence/${PAPER_GONE}`, `procedures/${PAPER_GONE}`, `procedures/steps/${STEP_GONE}`]);
    expect(r).toEqual({ removed: 4, failed: 0 });
    expect([...live].sort()).toEqual([`procedures/steps/cmstep000000000000000009z/otro.pdf`, `sections/${PAPER}/S1/vivo.pdf`]);
  });

  it('un fallo de Storage no lanza (la fila ya se borró) y se cuenta', async () => {
    const { client, live } = fakeClient(files, { failRemove: true });
    await expect(removeStoragePrefixes(client, [`sections/${PAPER_GONE}`])).resolves.toEqual({ removed: 0, failed: 2 });
    expect(live.size).toBe(files.length);
  });

  it('rechaza carpetas vacías, absolutas o con «..»: nunca borra fuera de lo pedido', async () => {
    const { client, removedBatches } = fakeClient(files);
    await removeStoragePrefixes(client, ['', '/', '../otra', 'sections/../x', '/sections']);
    expect(removedBatches).toHaveLength(0);
  });
});
