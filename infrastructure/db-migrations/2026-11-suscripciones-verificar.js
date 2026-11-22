#!/usr/bin/env node
/* eslint-disable */
'use strict';

/**
 * Verificación de los SQL de planes y suscripciones (2026-11-suscripciones-1-nucleo.sql y 2026-11-suscripciones-2-medicion-pagos.sql).
 * SOLO LEE: no escribe nada en la base.
 *
 *   node infrastructure/db-migrations/2026-11-suscripciones-verificar.js antes     (antes de aplicar: nada debe existir; lista las organizaciones)
 *   node infrastructure/db-migrations/2026-11-suscripciones-verificar.js despues   (después de aplicar los dos SQL: todo debe estar en orden)
 *
 * Usa DATABASE_URL de la variable de entorno o, si no existe, de apps/api/.env. Imprime a qué base se conectó (servidor y nombre, nunca la
 * contraseña) para que se vea si es la base que se esperaba. Termina con código 0 si todo está en orden y 1 si hay algún problema.
 */

const path = require('path');

const MODE = (process.argv[2] || 'despues').toLowerCase();
if (MODE !== 'antes' && MODE !== 'despues') {
  console.error('Uso: node 2026-11-suscripciones-verificar.js antes|despues');
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

const STAGE1_TABLES = ['billing_plans', 'billing_plan_prices', 'billing_subscriptions', 'billing_settings', 'billing_events'];
const STAGE2_TABLES = ['usage_ledger', 'addon_packs', 'addon_purchases', 'billing_payments'];
const ALL_TABLES = [...STAGE1_TABLES, ...STAGE2_TABLES];
const STAGE1_TYPES = ['BillingAudience', 'SubscriptionStatus', 'EnforcementMode'];
const STAGE2_TYPES = ['AddonKind', 'AddonPurchaseStatus', 'BillingPaymentKind', 'BillingPaymentMethod', 'BillingPaymentStatus'];
const ALL_TYPES = [...STAGE1_TYPES, ...STAGE2_TYPES];

/** Cuántas organizaciones se listan una por una (la base de producción tiene pocas; una base de pruebas puede tener cientos). */
const LIST_MAX = 40;
let problems = 0;
const ok = (msg) => console.log(`  [OK]     ${msg}`);
const fail = (msg) => { problems++; console.log(`  [FALLA]  ${msg}`); };
const info = (msg) => console.log(`           ${msg}`);
const check = (cond, good, bad) => (cond ? ok(good) : fail(bad));
const n = (v) => Number(v);

/**
 * La base real se conecta por el pooler de Supabase, que tiene pocas conexiones (15) compartidas con la API en producción: esta verificación
 * solo necesita UNA, así que se fija explícitamente (igual que hace el PM2 del servidor para la API con `connection_limit`).
 */
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
    console.log(`\nVerificación «${MODE}» de planes y suscripciones`);
    console.log(`Base: ${target(process.env.DATABASE_URL)}`);

    const tables = (await q(`select table_name from information_schema.tables where table_schema = 'public' and table_name = any($1)`, ALL_TABLES)).map((r) => r.table_name);
    const types = (await q(`select typname from pg_type t join pg_namespace s on s.oid = t.typnamespace where s.nspname = 'public' and typname = any($1)`, ALL_TYPES)).map((r) => r.typname);
    const orgs = await q(`select id, name, active from organizations order by "createdAt"`);
    const planFor = (name) => (/demo/i.test(name) ? 'INTERNO' : 'PILOTO');

    if (MODE === 'antes') {
      console.log('\n1) Estado actual (no debe existir nada de planes todavía)');
      check(tables.length === 0, 'No existe ninguna de las 9 tablas nuevas.', `Ya existen tablas: ${tables.join(', ')}. NO apliques el SQL: se aplicó antes (o a medias). Revisa antes de seguir.`);
      check(types.length === 0, 'No existe ninguno de los 8 tipos nuevos.', `Ya existen tipos: ${types.join(', ')}.`);

      console.log(`\n2) Organizaciones que recibirán una suscripción exenta (${orgs.length})`);
      for (const o of orgs.slice(0, LIST_MAX)) info(`${o.active ? 'activa  ' : 'INACTIVA'}  ${o.name}  →  plan ${planFor(o.name)}`);
      if (orgs.length > LIST_MAX) info(`… y ${orgs.length - LIST_MAX} más.`);
      check(orgs.length > 0, 'Hay organizaciones.', 'No hay ninguna organización: ¿es la base correcta?');
      info('Regla del SQL: el nombre que contiene «demo» queda en INTERNO; todas las demás, en PILOTO. Todas exentas y sin vencimiento.');
    } else {
      console.log('\n1) Tablas y tipos');
      const missingTables = ALL_TABLES.filter((t) => !tables.includes(t));
      const missingTypes = ALL_TYPES.filter((t) => !types.includes(t));
      check(missingTables.length === 0, `Existen las 9 tablas nuevas.`, `Faltan tablas: ${missingTables.join(', ')}.`);
      check(missingTypes.length === 0, `Existen los 8 tipos nuevos.`, `Faltan tipos: ${missingTypes.join(', ')}.`);
      if (missingTables.some((t) => STAGE1_TABLES.includes(t))) info('Falta la ETAPA 1: aplica primero 2026-11-suscripciones-1-nucleo.sql.');
      else if (missingTables.some((t) => STAGE2_TABLES.includes(t))) info('La etapa 1 está aplicada, pero falta la ETAPA 2: aplica 2026-11-suscripciones-2-medicion-pagos.sql.');

      if (tables.length > 0) {
        console.log('\n2) Seguridad (las tablas no deben ser accesibles desde internet con la clave pública)');
        const rls = await q(`select c.relname, c.relrowsecurity from pg_class c join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'public' and c.relkind = 'r' and c.relname = any($1)`, tables);
        const noRls = rls.filter((r) => !r.relrowsecurity).map((r) => r.relname);
        check(noRls.length === 0, 'Todas las tablas nuevas tienen RLS activo.', `SIN RLS: ${noRls.join(', ')}.`);
        const grants = await q(`select table_name, grantee, privilege_type from information_schema.role_table_grants where table_schema = 'public' and table_name = any($1) and grantee in ('anon', 'authenticated')`, tables);
        check(grants.length === 0, 'anon y authenticated no tienen ningún permiso sobre ellas.', `PERMISOS ABIERTOS: ${[...new Set(grants.map((g) => `${g.table_name}→${g.grantee}`))].join(', ')}.`);
      }

      if (tables.includes('billing_plans')) {
        console.log('\n3) Datos sembrados');
        const planCount = n((await q(`select count(*) c from billing_plans`))[0].c);
        const publicPlans = (await q(`select code from billing_plans where "isPublic" = true and active = true order by "sortOrder"`)).map((r) => r.code);
        const priceCount = n((await q(`select count(*) c from billing_plan_prices`))[0].c);
        check(planCount === 8, 'Hay 8 planes (5 públicos + Institucional, Piloto e Interno).', `Hay ${planCount} planes (se esperaban 8).`);
        info(`Públicos hoy: ${publicPlans.join(', ') || '(ninguno)'}`);
        check(priceCount === 22, 'Hay 22 precios (4 duraciones × 5 planes públicos + Piloto e Interno sin vencimiento).', `Hay ${priceCount} precios (se esperaban 22).`);
        if (tables.includes('addon_packs')) {
          const packs = n((await q(`select count(*) c from addon_packs`))[0].c);
          check(packs === 7, 'Hay 7 paquetes de fábrica (3 de IA y 4 de espacio).', `Hay ${packs} paquetes (se esperaban 7).`);
        }
        if (tables.includes('billing_settings')) {
          const s = await q(`select "enforcementMode" m, "graceDays" g, "readOnlyDays" r, "reminderDays" d from billing_settings where id = 'default'`);
          check(s.length === 1, 'Existe la fila de parámetros.', 'Falta la fila de parámetros (id = default).');
          if (s.length === 1) {
            check(s[0].m === 'OFF', 'El cumplimiento está APAGADO (OFF): nada se bloquea.', `El cumplimiento NO está en OFF (está en ${s[0].m}).`);
            info(`Gracia ${s[0].g} días · solo lectura ${s[0].r} días · avisos a ${JSON.stringify(s[0].d)} días antes.`);
          }
        }
      }

      if (tables.includes('billing_subscriptions')) {
        console.log(`\n4) Suscripciones de las ${orgs.length} organizaciones`);
        const subs = await q(`select s."organizationId" oid, p.code, s.status, s.exempt, s."currentPeriodEnd" e from billing_subscriptions s join billing_plans p on p.id = s."planId"`);
        const byOrg = new Map(subs.map((s) => [s.oid, s]));
        const without = orgs.filter((o) => !byOrg.has(o.id));
        check(without.length === 0, 'Todas las organizaciones tienen su suscripción.', `Sin suscripción: ${without.map((o) => o.name).join(', ')} (se les asigna un plan desde «Planes y suscripciones»).`);
        for (const o of orgs.slice(0, LIST_MAX)) {
          const s = byOrg.get(o.id);
          info(`${o.name}  →  ${s ? `${s.code}${s.exempt ? ' · exenta' : ' · NO exenta'} · ${s.status}${s.e ? ` · vence ${new Date(s.e).toISOString().slice(0, 10)}` : ' · sin vencimiento'}` : '(sin suscripción)'}`);
        }
        if (orgs.length > LIST_MAX) info(`… y ${orgs.length - LIST_MAX} más.`);
        const notExempt = subs.filter((s) => !s.exempt);
        if (notExempt.length > 0) info(`Aviso: ${notExempt.length} suscripción(es) NO exenta(s): con el cumplimiento en ENFORCE a esas sí se les aplican límites y vencimiento.`);
        const orphan = subs.filter((s) => !orgs.some((o) => o.id === s.oid));
        check(orphan.length === 0, 'No hay suscripciones de organizaciones que no existen.', `${orphan.length} suscripción(es) huérfana(s).`);
      }
    }

    console.log(problems === 0 ? '\nRESULTADO: TODO EN ORDEN.\n' : `\nRESULTADO: HAY ${problems} PROBLEMA(S). Revisa las líneas [FALLA] antes de seguir.\n`);
  } catch (e) {
    problems++;
    console.error(`\nNo se pudo verificar: ${e && e.message ? String(e.message).split('\n').slice(-3).join(' ') : e}\n`);
  } finally {
    await prisma.$disconnect();
  }
  process.exit(problems === 0 ? 0 : 1);
})();
