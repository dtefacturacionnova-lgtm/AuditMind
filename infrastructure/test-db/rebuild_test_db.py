# -*- coding: utf-8 -*-
"""Reconstruye la base de pruebas de Docker cuando está vacía.

El contenedor `auditmind-cobros-test` (postgres:17-alpine, puerto 54329, base cobros_test, usuario postgres / clave test) NO tiene volumen:
si Docker se reinicia, la base queda vacía. Uso (con Docker Desktop encendido):

    docker start auditmind-cobros-test
    python infrastructure/test-db/rebuild_test_db.py

Las pruebas de integración se corren con
    COLLECTIONS_TEST_DATABASE_URL=postgresql://postgres:test@localhost:54329/cobros_test npx jest   (desde apps/api)

Arma el esquema de Prisma SIN los modelos que crean las migraciones SQL de cobranza (para que esas migraciones, con sus claves compuestas,
CHECK, índices parciales y RLS, se apliquen tal cual), y después aplica esas migraciones en orden.
"""
import os
import re
import subprocess
import sys
import io
import tempfile

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
API = os.path.join(ROOT, "apps", "api")
MIG = os.path.join(ROOT, "infrastructure", "db-migrations")
TMP = tempfile.gettempdir()

MODELS = ["EngagementFee", "EngagementFeeAmendment", "BillingScheduleItem", "ClientInvoice", "ClientPayment", "PaymentApplication",
          "InvoiceWithholding", "CollectionLog", "ClientCreditNote", "ClientWriteOff", "CollectionNote", "ClientInvoiceHour"]
ENUMS = ["FeeType", "FeeSource", "FeeProgressMethod", "ScheduleItemKind", "ScheduleItemStatus", "ClientInvoiceStatus", "ClientPaymentStatus",
         "ClientPaymentMethod", "WithholdingTaxType", "CollectionLogAction", "CreditNoteStatus", "WriteOffStatus", "CollectionContactMethod", "PromiseStatus"]
MIGRATIONS = ["2026-10-cobros-3a.sql", "2026-10-cobros-3a-fix1.sql", "2026-10-cobros-3d.sql", "2026-10-cobros-3d-fix1.sql",
              "2026-10-cobros-4.sql", "2026-10-pbc-portal-otp.sql"]

src = open(os.path.join(API, "prisma", "schema.prisma"), encoding="utf-8").read().replace("\r\n", "\n")
for name in MODELS:
    src, n = re.subn(r"(?:///[^\n]*\n)*model " + name + r" \{.*?\n\}\n", "", src, flags=re.S)
    assert n == 1, ("modelo", name, n)
for name in ENUMS:
    src, n = re.subn(r"(?://[^\n]*\n)*enum " + name + r" \{.*?\n\}\n", "", src, flags=re.S)
    assert n == 1, ("enum", name, n)
trimmed = os.path.join(TMP, "auditmind_schema_trimmed.prisma")
open(trimmed, "w", encoding="utf-8").write(src)

r = subprocess.run(f'npx prisma migrate diff --from-empty --to-schema-datamodel "{trimmed}" --script', cwd=API, shell=True,
                   capture_output=True, encoding="utf-8", errors="replace")
assert r.returncode == 0, r.stderr[-1500:]
base = r.stdout
print("esquema base generado:", base.count("CREATE TABLE"), "tablas")


def psql(sql_text, label):
    p = subprocess.run("docker exec -i auditmind-cobros-test psql -U postgres -d cobros_test -v ON_ERROR_STOP=1 -q", shell=True, input=sql_text,
                       capture_output=True, encoding="utf-8", errors="replace")
    ok = p.returncode == 0
    print(("ok    " if ok else "FALLO "), label, "" if ok else "\n" + (p.stderr or "")[-900:])
    return ok


assert psql("DROP SCHEMA public CASCADE; CREATE SCHEMA public; "
            "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF; "
            "IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; END $$;",
            "esquema vacío y roles anon/authenticated")
assert psql(base, "esquema base de Prisma")

# cobros-0 y encargo-cancelado-ejercicio: solo los índices (las columnas y el tipo del encargo ya vienen en el esquema de Prisma)
assert psql("""
DROP INDEX IF EXISTS "engagements_clientId_fiscalYear_key";
CREATE UNIQUE INDEX "engagements_audit_client_year_key" ON "engagements"("clientId", "fiscalYear") WHERE "kind" = 'AUDIT' AND "status" <> 'CANCELLED';
CREATE INDEX IF NOT EXISTS "engagements_clientId_fiscalYear_idx" ON "engagements"("clientId", "fiscalYear");
CREATE UNIQUE INDEX IF NOT EXISTS "engagements_id_clientId_key" ON "engagements"("id", "clientId");
CREATE UNIQUE INDEX IF NOT EXISTS "engagements_organizationId_id_key" ON "engagements"("organizationId", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "clients_organizationId_id_key" ON "clients"("organizationId", "id");
""", "índices de cobros-0 y de encargos cancelados")

for f in MIGRATIONS:
    assert psql(open(os.path.join(MIG, f), encoding="utf-8").read(), f)

p = subprocess.run("docker exec -i auditmind-cobros-test psql -U postgres -d cobros_test -t -c "
                   "\"select count(*) from information_schema.tables where table_schema='public'\"",
                   shell=True, capture_output=True, encoding="utf-8", errors="replace")
print("tablas en la base de pruebas:", p.stdout.strip())
