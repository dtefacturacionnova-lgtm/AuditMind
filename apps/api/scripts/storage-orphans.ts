/* eslint-disable no-console */
/**
 * Barrido de archivos huérfanos del bucket `audit-files` (lote C de la revisión de 2026-10-25).
 *
 * Una fila borrada (papel, procedimiento, paso, encargo) no borraba sus archivos de Storage; quedaban carpetas cuyo dueño ya no existe.
 * Este script los encuentra, y solo con una orden explícita los mueve a una cuarentena (no los borra), y solo con otra los borra de la
 * cuarentena cuando ya pasó el plazo. Por defecto NO MODIFICA NADA.
 *
 *   npx ts-node --transpile-only -P tsconfig.json scripts/storage-orphans.ts                      informe (solo lectura)
 *   npx ts-node --transpile-only -P tsconfig.json scripts/storage-orphans.ts --out informe.json   además guarda el detalle
 *   ... --quarantine                 simula mover los huérfanos a _orphans-quarantine/<fecha>/ (añade --apply para hacerlo)
 *   ... --restore <fecha>            simula devolver a su ruta original lo puesto en cuarentena ese día (añade --apply)
 *   ... --purge-older-than <días>    simula borrar de la cuarentena lo de hace más de N días (añade --apply)
 *
 * Es prudente a propósito: solo es huérfano un archivo cuya ruta nombra a un dueño con forma de id de la base que ya no existe.
 * Cualquier otra ruta se lista como «sin clasificar» y no se toca. Lee DATABASE_URL, SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY de
 * apps/api/.env (nunca los imprime).
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import { buildOrphanReport, groupByOwner, OwnerKind, QUARANTINE_ROOT, quarantinePathOf } from '../src/common/storage/storage-orphans.util';
import { listStorageFiles } from '../src/common/storage/storage-prefix.util';
import { STORAGE_BUCKET } from '../src/common/storage/storage-url.service';

function loadEnv() {
  const file = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
  }
}

const arg = (name: string) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const flag = (name: string) => process.argv.includes(name);
const today = () => new Date().toISOString().slice(0, 10);
const chunk = <T>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, (i + 1) * n));

async function main() {
  loadEnv();
  for (const k of ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) if (!process.env[k]) throw new Error(`Falta ${k} en apps/api/.env`);
  const apply = flag('--apply');
  const url = process.env.DATABASE_URL as string;
  const prisma = new PrismaClient({ datasourceUrl: `${url}${url.includes('?') ? '&' : '?'}connection_limit=2` });
  const client = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);
  const storage = client.storage.from(STORAGE_BUCKET);

  try {
    // ── Devolver una cuarentena a su lugar ────────────────────────────────────
    const restoreDay = arg('--restore');
    if (restoreDay) {
      const files = await listStorageFiles(client, `${QUARANTINE_ROOT}/${restoreDay}`);
      console.log(`Cuarentena del ${restoreDay}: ${files.length} archivo(s).`);
      if (!apply) return console.log('Simulación. Agrega --apply para devolverlos a su ruta original.');
      let ok = 0; let bad = 0;
      for (const f of files) {
        const original = f.slice(`${QUARANTINE_ROOT}/${restoreDay}/`.length);
        const { error } = await storage.move(f, original);
        if (error) { bad++; console.warn(`  no se pudo devolver ${original}: ${error.message}`); } else ok++;
      }
      return console.log(`Devueltos: ${ok}; con error: ${bad}.`);
    }

    // ── Borrar de la cuarentena lo viejo ──────────────────────────────────────
    const purgeDays = arg('--purge-older-than');
    if (purgeDays) {
      const limit = Date.now() - Number(purgeDays) * 86_400_000;
      const { data } = await storage.list(QUARANTINE_ROOT, { limit: 1000 });
      const old = (data ?? []).map((d) => d.name).filter((n) => /^\d{4}-\d{2}-\d{2}$/.test(n) && Date.parse(n) < limit);
      const files = (await Promise.all(old.map((d) => listStorageFiles(client, `${QUARANTINE_ROOT}/${d}`)))).flat();
      console.log(`Cuarentena con más de ${purgeDays} días: ${old.length} carpeta(s) de fecha, ${files.length} archivo(s).`);
      if (!apply) return console.log('Simulación. Agrega --apply para BORRARLOS definitivamente.');
      let removed = 0;
      for (const b of chunk(files, 100)) { const { data: r } = await storage.remove(b); removed += r?.length ?? 0; }
      return console.log(`Borrados definitivamente: ${removed}.`);
    }

    // ── Informe (y, si se pide, cuarentena) ───────────────────────────────────
    const all = (await listStorageFiles(client, '')).filter((p) => !p.startsWith(`${QUARANTINE_ROOT}/`));
    console.log(`Archivos en el bucket '${STORAGE_BUCKET}' (sin la cuarentena): ${all.length}`);

    // Dueños que aparecen en las rutas, para preguntar a la base si existen (una consulta por tipo y lote).
    const ids: Record<OwnerKind, string[]> = { audit: [], paper: [], step: [] };
    for (const o of groupByOwner(all).owned.values()) ids[o.kind].push(o.id);
    const alive: Record<OwnerKind, Set<string>> = { audit: new Set(), paper: new Set(), step: new Set() };
    for (const b of chunk(ids.audit, 500)) (await prisma.audit.findMany({ where: { id: { in: b } }, select: { id: true } })).forEach((r) => alive.audit.add(r.id));
    for (const b of chunk(ids.paper, 500)) (await prisma.workingPaper.findMany({ where: { id: { in: b } }, select: { id: true } })).forEach((r) => alive.paper.add(r.id));
    for (const b of chunk(ids.step, 500)) (await prisma.auditStep.findMany({ where: { id: { in: b } }, select: { id: true } })).forEach((r) => alive.step.add(r.id));

    const report = buildOrphanReport(all, alive);
    const orphanFiles = report.orphans.flatMap((o) => o.files);
    console.log(`Con dueño vigente: ${report.keptFiles}`);
    console.log(`HUÉRFANOS: ${orphanFiles.length} archivo(s) de ${report.orphans.length} dueño(s) inexistente(s)`);
    for (const kind of ['audit', 'paper', 'step'] as OwnerKind[]) {
      const rows = report.orphans.filter((o) => o.kind === kind);
      if (rows.length) console.log(`  ${kind}: ${rows.length} dueño(s), ${rows.reduce((s, r) => s + r.files.length, 0)} archivo(s)`);
    }
    const byFamily: Record<string, number> = {};
    for (const f of orphanFiles) {
      const first = f.split('/')[0];
      const fam = first.length > 20 ? '<carpeta con id de encargo>' : first; // las carpetas por encargo se llaman como su id
      byFamily[fam] = (byFamily[fam] ?? 0) + 1;
    }
    console.log('  por carpeta de primer nivel:', byFamily);
    console.log(`Sin clasificar (no se tocan): ${report.unknown.length}`);
    for (const u of report.unknown.slice(0, 25)) console.log(`  · ${u}`);
    if (report.unknown.length > 25) console.log(`  … y ${report.unknown.length - 25} más (están en el detalle con --out)`);

    const out = arg('--out');
    if (out) {
      fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), ...report, orphans: report.orphans }, null, 2), 'utf8');
      console.log(`Detalle guardado en ${out}`);
    }

    if (flag('--quarantine')) {
      const day = today();
      console.log(`\nCuarentena: ${orphanFiles.length} archivo(s) → ${QUARANTINE_ROOT}/${day}/…`);
      if (!apply) return console.log('Simulación: no se movió nada. Agrega --apply para moverlos (se pueden devolver con --restore).');
      let ok = 0; let bad = 0;
      for (const f of orphanFiles) {
        const { error } = await storage.move(f, quarantinePathOf(f, day));
        if (error) { bad++; console.warn(`  no se pudo mover ${f}: ${error.message}`); } else ok++;
      }
      console.log(`Movidos a cuarentena: ${ok}; con error: ${bad}.`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
