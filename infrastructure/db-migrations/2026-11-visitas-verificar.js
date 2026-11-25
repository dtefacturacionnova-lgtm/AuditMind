#!/usr/bin/env node
/* eslint-disable */
'use strict';

/**
 * Verificación del SQL de visitas (2026-11-visitas-1-saldos.sql). SOLO LEE: no escribe nada en la base.
 *
 *   node infrastructure/db-migrations/2026-11-visitas-verificar.js antes     (antes de aplicar: nada debe existir; cuenta los balances actuales)
 *   node infrastructure/db-migrations/2026-11-visitas-verificar.js despues   (después de aplicar: todo en orden y los balances intactos)
 *
 * Usa DATABASE_URL de la variable de entorno o, si no existe, de apps/api/.env. Imprime a qué base se conectó (servidor y nombre, nunca la
 * contraseña). Termina con código 0 si todo está en orden y 1 si hay algún problema.
 */

const path = require('path');

const MODE = (process.argv[2] || 'despues').toLowerCase();
if (MODE !== 'antes' && MODE !== 'despues') {
  console.error('Uso: node 2026-11-visitas-verificar.js antes|despues');
  process.exit(2);
}
if (!process.env.DATABASE_URL) {
  try { require('dotenv').config({ path: path.join(__dirname, '..', '..', 'apps', 'api', '.env') }); } catch (e) { /* sin dotenv */ }
}
if (!process.env.DATABASE_URL) {
  console.error('No hay DATABASE_URL (ni en el entorno ni en apps/api/.env).');
  process.exit(2);
}

const { PrismaClient } = require('@prisma/client');

let problems = 0;
const ok = (msg) => console.log(`  [OK]     ${msg}`);
const fail = (msg) => { problems++; console.log(`  [FALLA]  ${msg}`); };
const info = (msg) => console.log(`           ${msg}`);
const check = (cond, good, bad) => (cond ? ok(good) : fail(bad));
const n = (v) => Number(v);

/** El pooler de Supabase tiene pocas conexiones compartidas con la API: esta verificación solo necesita UNA. */
function withOneConnection(url) {
  if (/[?&]connection_limit=/.test(url)) return url;
  return url + (url.includes('?') ? '&' : '?') + 'connection_limit=1';
}
function target(url) {
  try { const u = new URL(url); return `${u.hostname}:${u.port || '5432'}${u.pathname}`; } catch (e) { return '(dirección ilegible)'; }
}

(async () => {
  const prisma = new PrismaClient({ datasourceUrl: withOneConnection(process.env.DATABASE_URL) });
  const q = (sql, ...params) => prisma.$queryRawUnsafe(sql, ...params);
  try {
    console.log(`\nVerificación «${MODE}» de visitas (saldos por visita)`);
    console.log(`Base: ${target(process.env.DATABASE_URL)}`);

    const hasTable = n((await q(`select count(*)::int c from information_schema.tables where table_schema='public' and table_name='audit_visits'`))[0].c) === 1;
    const types = (await q(`select typname from pg_type t join pg_namespace s on s.oid=t.typnamespace where s.nspname='public' and typname = any($1)`, ['AuditVisitKind', 'AuditVisitStatus'])).map((r) => r.typname);
    const cols = (await q(`select column_name from information_schema.columns where table_schema='public' and table_name='trial_balances' and column_name = any($1)`, ['visitId', 'asOfDate'])).map((r) => r.column_name);
    const tb = (await q(`select count(*)::int total from trial_balances`))[0];

    if (MODE === 'antes') {
      console.log('\n1) Estado actual (no debe existir nada de visitas todavía)');
      check(!hasTable, 'No existe la tabla audit_visits.', 'La tabla audit_visits YA existe. NO apliques el SQL: se aplicó antes (o a medias).');
      check(types.length === 0, 'No existen los tipos AuditVisitKind / AuditVisitStatus.', `Ya existen tipos: ${types.join(', ')}.`);
      check(cols.length === 0, 'trial_balances todavía no tiene visitId ni asOfDate.', `trial_balances ya tiene columnas: ${cols.join(', ')}.`);
      console.log('\n2) Lo que hay hoy y que NO debe cambiar');
      info(`Balances de comprobación cargados: ${n(tb.total)}`);
      const audits = n((await q(`select count(*)::int c from audits`))[0].c);
      info(`Auditorías: ${audits}`);
    } else {
      console.log('\n1) Estructura');
      check(hasTable, 'Existe la tabla audit_visits.', 'Falta la tabla audit_visits: el SQL no se aplicó.');
      check(types.length === 2, 'Existen los tipos AuditVisitKind y AuditVisitStatus.', `Faltan tipos (hay: ${types.join(', ') || 'ninguno'}).`);
      check(cols.length === 2, 'trial_balances tiene visitId y asOfDate.', `Faltan columnas en trial_balances (hay: ${cols.join(', ') || 'ninguna'}).`);
      if (hasTable) {
        const idx = (await q(`select indexname, indexdef from pg_indexes where schemaname='public' and tablename='audit_visits'`));
        const byName = Object.fromEntries(idx.map((r) => [r.indexname, r.indexdef]));
        check(/UNIQUE/i.test(byName['audit_visits_auditId_kind_key'] || ''), 'Único por encargo y tipo de visita.', 'Falta el índice único (auditId, kind).');
        check(/UNIQUE/i.test(byName['audit_visits_one_base_key'] || '') && /WHERE/i.test(byName['audit_visits_one_base_key'] || ''), 'Una sola base de análisis por encargo (índice parcial).', 'Falta el índice parcial de base única.');
        const chk = await q(`select conname from pg_constraint where conrelid='audit_visits'::regclass and contype='c'`);
        check(chk.some((c) => c.conname === 'audit_visits_closed_chk'), 'Regla de cierre (CLOSED ⇔ closedAt).', 'Falta la regla de cierre.');
        const fks = (await q(`select conname, confdeltype from pg_constraint where contype='f' and conname in ('audit_visits_auditId_fkey','audit_visits_organizationId_fkey','trial_balances_visitId_fkey')`));
        const fk = Object.fromEntries(fks.map((r) => [r.conname, r.confdeltype]));
        check(fk['audit_visits_auditId_fkey'] === 'c', 'Visita cae con su auditoría (CASCADE).', 'Falta o no es CASCADE la clave a audits.');
        check(fk['audit_visits_organizationId_fkey'] === 'c', 'Visita cae con su organización (CASCADE).', 'Falta o no es CASCADE la clave a organizations.');
        check(fk['trial_balances_visitId_fkey'] === 'n', 'Al borrar una visita sus balances se conservan (SET NULL).', 'Falta o no es SET NULL la clave de trial_balances a la visita.');
      }
      console.log('\n2) Seguridad');
      if (hasTable) {
        const rls = (await q(`select relrowsecurity r from pg_class where oid='audit_visits'::regclass`))[0].r;
        check(rls === true, 'RLS activo en audit_visits.', 'RLS NO está activo en audit_visits.');
        const grants = n((await q(`select count(*)::int c from information_schema.role_table_grants where table_schema='public' and table_name='audit_visits' and grantee in ('anon','authenticated')`))[0].c);
        check(grants === 0, 'anon y authenticated no tienen ningún permiso sobre audit_visits.', `anon/authenticated tienen ${grants} permiso(s) sobre audit_visits.`);
      }
      console.log('\n3) Datos existentes intactos');
      info(`Balances de comprobación: ${n(tb.total)} (compara con el número de «antes»)`);
      if (cols.length === 2) {
        const withVisit = n((await q(`select count(*)::int c from trial_balances where "visitId" is not null or "asOfDate" is not null`))[0].c);
        check(withVisit === 0, 'Ningún balance existente quedó asignado a una visita.', `${withVisit} balance(s) ya tienen visita o fecha: revisar.`);
      }
      if (hasTable) {
        const visits = n((await q(`select count(*)::int c from audit_visits`))[0].c);
        info(`Visitas creadas hasta ahora: ${visits}`);
      }
    }
    console.log(problems === 0 ? '\nTODO EN ORDEN\n' : `\n${problems} PROBLEMA(S): revisa las líneas [FALLA]\n`);
    process.exitCode = problems === 0 ? 0 : 1;
  } catch (e) {
    console.error('Error al verificar:', e && e.message ? e.message.split('\n').slice(-1)[0] : e);
    process.exitCode = 2;
  } finally {
    await prisma.$disconnect();
  }
})();
