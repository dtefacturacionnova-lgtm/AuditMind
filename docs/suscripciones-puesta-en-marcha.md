# Planes y suscripciones — puesta en marcha (lista exacta)

**Estado:** todo el código está en `origin/main`; nada está aplicado ni desplegado. Esta lista se **ensayó entera contra la base de pruebas de Docker** (aplicar las dos etapas, verificar, repetir, revertir, revertir en orden equivocado) y los dos compilados de producción (API y web) se probaron localmente.
**Qué hace al terminar el paso 6:** nada visible cambia para tus clientes actuales: el cumplimiento queda **apagado (OFF)** y todas las organizaciones existentes quedan **exentas**. Encenderlo es una decisión posterior (paso 8) que se hace desde la pantalla, sin volver a desplegar.

> **Regla de oro:** primero el SQL, después el despliegue. El SQL solo **agrega** (9 tablas y 8 tipos nuevos, y datos de fábrica): el código viejo lo ignora. El código nuevo, en cambio, sin las tablas no se cae pero llena el registro de alarmas en cada petición.

---

## 0. Qué se despliega

17 commits desde el último despliegue conocido (`b3c6089`); no cambia `ai-service` ni las dependencias.

| Pieza | Qué es |
|---|---|
| Núcleo (etapa 1) | Planes como datos, una suscripción por organización, guardián de módulos, usuarios y vigencia, interruptor OFF / OBSERVE / ENFORCE |
| Medición (etapa 2) | Peticiones de IA medidas (siempre, aun con OFF), espacio por tipo de archivo, paquetes, pagos manuales con referencia y comprobante |
| Pantallas | «Mi plan», «Comprar más», «Mis pagos» (cliente); Planes, Suscripciones, Pagos, Consumo, Paquetes, Parámetros (superadmin) |
| Tareas programadas | Diaria 8:20 (hora de El Salvador): avisos de vencimiento y pagos vencidos. Cada hora (minuto 35): avisos al 80 % y 100 % de IA y espacio |
| `/precios` | Página pública de precios, **apagada** (404) hasta que la actives |

**Con el cumplimiento en OFF:** nada se bloquea, no se escribe a ningún cliente y el menú es el de siempre. Lo único que cambia por dentro es que se **mide** el uso de IA de los usuarios de las organizaciones (los SUPER_ADMIN no se miden).

---

## 1. Antes de empezar (10 min)

**1.1 Lo que se va a desplegar es lo probado**

```powershell
git fetch origin
git status -sb
```
Debe decir `## main...origin/main` sin diferencias. (Si comiteaste esta lista y el verificador, también deben estar subidos; no afectan al servidor.)

**1.2 Estado del servidor**

```powershell
ssh vps-muestreo "su - deploy -c 'cd /home/deploy/auditmind && git log -1 --oneline && git status --short | head -5 && pm2 list'"
```
Espera: el último commit desplegado (hoy `b3c6089`), árbol sin cambios y `auditmind-web`, `auditmind-api` y `auditmind-ai` en `online`.

**1.3 Variables que ya deben existir en el servidor** (solo cuenta, no imprime valores)

```powershell
ssh vps-muestreo "grep -c -E '^(RESEND_API_KEY|EMAIL_FROM|OPENROUTER_API_KEY)=.' /home/deploy/auditmind/.env"
```
Debe responder `3`. Sin `RESEND_API_KEY` los avisos llegan solo dentro de la aplicación, no por correo.

**1.4 Respaldo.** Según la revisión de octubre el proyecto de Supabase es del plan **Free: no hay copias automáticas**. Aun así el SQL **no modifica ni borra nada existente** (solo crea y agrega), y cada etapa se aplica en **una sola transacción** (o entra entera o no entra nada). La red de seguridad son las reversas (sección «Reversa»). Si ya pasaste a Pro, no hace falta nada más.

**1.5 Horario.** Hazlo fuera de horas de uso. El **paso 5** deja la web con errores unos **3 a 6 minutos** (el script borra `.next` y vuelve a compilar; el API sigue) y reinicia los procesos al final.

---

## 2. Pre-chequeo de la base real (solo lee)

Desde la raíz del repositorio:

```powershell
node infrastructure/db-migrations/2026-11-suscripciones-verificar.js antes
```

Debes ver, en este orden:
- `Base: <servidor de Supabase>:<puerto>/…` → **confirma que es la base real** (no `127.0.0.1`).
- `[OK] No existe ninguna de las 9 tablas nuevas` y `[OK] No existe ninguno de los 8 tipos nuevos`.
- La lista de tus organizaciones con el plan que recibirá cada una: **Piloto** para todas, **Interno** para la que tenga «demo» en el nombre (Empresa Demo). Todas exentas y sin vencimiento.
- `RESULTADO: TODO EN ORDEN.`

Si dice `[FALLA] Ya existen tablas…`, **no sigas**: el SQL ya se aplicó (o quedó a medias) y hay que revisarlo.

---

## 3. Aplicar el SQL (etapa 1, luego etapa 2)

Desde `apps/api` (lee la base real de `apps/api/.env`):

```powershell
cd apps/api
npx prisma db execute --schema prisma/schema.prisma --file ../../infrastructure/db-migrations/2026-11-suscripciones-1-nucleo.sql
```
Respuesta esperada: `Script executed successfully.`

```powershell
npx prisma db execute --schema prisma/schema.prisma --file ../../infrastructure/db-migrations/2026-11-suscripciones-2-medicion-pagos.sql
```
Respuesta esperada: `Script executed successfully.`

- **No uses `prisma db push`** (intenta borrar `rag_chunks` y `rag_documents`).
- Si falla con `EMAXCONNSESSION` (el pooler de Supabase solo tiene 15 conexiones y la API usa 8): espera un minuto y repite. No se aplicó nada.
- Si falla con otro error, **no se aplicó nada** (transacción): copia el mensaje completo antes de reintentar.
- Si repites una etapa que ya está aplicada falla con `type "BillingAudience" already exists` y no cambia nada (probado).

**Verificar** (desde la raíz):

```powershell
cd ../..
node infrastructure/db-migrations/2026-11-suscripciones-verificar.js despues
```
Debe terminar en `RESULTADO: TODO EN ORDEN.` con: 9 tablas y 8 tipos, RLS activo y `anon`/`authenticated` sin permisos, **8 planes, 22 precios, 7 paquetes**, cumplimiento **OFF**, y **todas** las organizaciones con su suscripción exenta. Si dice `falta la ETAPA 2`, aplica la que falta.

---

## 4. (Opcional) Ensayo del compilado

Ya se hizo localmente con este mismo código: `nest build` (API, 70 s) sin errores y `next build` (web). Si cambias algo antes de desplegar, repítelo:

```powershell
cd apps/api; node ../../node_modules/@nestjs/cli/bin/nest.js build
```
```powershell
cd ../web; node ../../node_modules/next/dist/bin/next build
```

---

## 5. Desplegar

Inmediatamente después del SQL (para que las organizaciones que se creen en el intervalo no queden sin suscripción):

```powershell
ssh vps-muestreo "su - deploy -c 'cd /home/deploy/auditmind && (nohup bash deploy/deploy.sh > /tmp/deploy_suscripciones.log 2>&1 &)'"
```

Sigue el avance cada par de minutos hasta ver `==> Deploy completado exitosamente.`:

```powershell
ssh vps-muestreo "tail -n 25 /tmp/deploy_suscripciones.log"
```

Pasos del script: `[1/7]` baja el código · `[2/7]` npm · `[3/7]` genera el cliente de Prisma · `[4/7]` Python · `[5/7]` compila el API · `[6/7]` compila la web (aquí la web da errores) · `[7/7]` reinicia PM2. Total esperado: **6 a 10 minutos**.

- Si termina con `Build falló`, copia las últimas líneas: el script **no recarga PM2**, el API sigue con el código anterior y la web hay que levantarla de nuevo en cuanto se arregle el compilado.
- No corras el script como root (los archivos de compilado quedarían con dueño root).

---

## 6. Verificación posterior

**6.1 Desde tu equipo**

```powershell
curl.exe -s -o NUL -w "login: %{http_code}`n" https://auditoria.ianovatechsystems.com/login
curl.exe -s -o NUL -w "billing/me sin sesión (espera 401): %{http_code}`n" https://auditoria.ianovatechsystems.com/api/v1/billing/me
curl.exe -s -o NUL -w "public/plans apagado (espera 404): %{http_code}`n" https://auditoria.ianovatechsystems.com/api/v1/public/plans
curl.exe -s -o NUL -w "precios apagado (espera 404): %{http_code}`n" https://auditoria.ianovatechsystems.com/precios
curl.exe -s -I https://auditoria.ianovatechsystems.com/dashboard
```
La última debe dar `307` con `Location: https://auditoria.ianovatechsystems.com/login` (**nunca `localhost`**; un 307 a secas no prueba nada).

**6.2 Servidor**

```powershell
ssh vps-muestreo "su - deploy -c 'pm2 list'"
ssh vps-muestreo "su - deploy -c 'pm2 logs auditmind-api --lines 80 --nostream'"
```
Los tres procesos `online` y sin reinicios nuevos. En el registro **no** debe aparecer `No se pudo leer la suscripción` (significaría que falta el SQL). No uses `pm2 env`: imprime los secretos.

**6.3 En la aplicación, como SUPER_ADMIN**

| Pantalla | Debe verse |
|---|---|
| Administración › Planes y suscripciones › **Suscripciones** | todas las organizaciones, exentas (Piloto; Empresa Demo = Interno) |
| **Planes** | 8 planes |
| **Paquetes** | 7 paquetes |
| **Parámetros** | cumplimiento **OFF** |
| **Pagos** / **Consumo** | cargan (pagos vacío) |

**6.4 Como usuario normal de una organización** (no SUPER_ADMIN): el menú es el de siempre (sin «Mi plan» ni candados). Usa un asistente una vez y, como superadmin, mira **Consumo**: debe aparecer la petición (la medición funciona aun con OFF).

---

## 7. Antes de encender el cumplimiento

Nada de esto afecta a los clientes actuales:

1. **Datos de pago:** pestaña **Pagos** › «Datos de pago» (QR 365, transferencia, efectivo). Sin esto el cliente que pida un pago no verá a dónde pagar.
2. **Revisar precios y planes** en la pestaña **Planes** (los de fábrica son hipótesis).
3. **Correo:** confirma que `RESEND_API_KEY` está bien (paso 1.3) y prueba un aviso.
4. **Al crear una organización eliges su plan de verdad.** «Organizaciones › Nueva organización» ofrece los planes del catálogo (los que empiezan con prueba y, aparte, Piloto/Interno, que son exentos), con el plan por defecto de la plataforma preseleccionado; la tabla muestra el plan real de cada organización (nombre, estado y vencimiento, o «Exenta»). **Para un cliente que ya paga o que es de confianza, elige Piloto**; si dejas un plan con prueba, la organización empieza con esos días y, con el cumplimiento en ENFORCE, pasa a gracia y solo lectura al vencer. Si no se pueden leer los planes, la pantalla lo dice y crea la organización con el plan por defecto.
5. **Organización de prueba no exenta** para ensayar: créala y déjala en prueba.

---

## 8. Encender el cumplimiento (Parámetros)

Por pasos, **sin volver a desplegar**; volver atrás es instantáneo (≈ 30 s por la caché):

1. **OBSERVE** — no bloquea nada; solo registra lo que *habría* bloqueado. Déjalo al menos una semana con la organización de prueba y al menos un cliente real **no exento**:
   ```powershell
   ssh vps-muestreo "su - deploy -c 'pm2 logs auditmind-api --lines 300 --nostream'" | Select-String "observar|OBSERVE"
   ```
   Líneas `[observar] … habría bloqueado con …` te dicen qué se bloquearía; `[OBSERVE] se enviaría «…»` qué avisos saldrían.
2. **ENFORCE** — bloquea de verdad y empiezan a salir los avisos. **Solo afecta a organizaciones no exentas**: hoy ninguna de las existentes (todas Piloto/Interno). Para pasar un cliente a pago: **Suscripciones › Asignar plan**.
3. Marcha atrás: **Parámetros › OFF**.

Las tareas programadas solo escriben a clientes con **ENFORCE**.

---

## 9. Publicar `/precios` (cuando hayas validado los precios)

En el servidor, edita `/home/deploy/auditmind/.env` y agrega:

```
PUBLIC_PRICING_ENABLED=true
SALES_CONTACT_EMAIL=tu-correo-de-ventas@…        # y/o
SALES_CONTACT_WHATSAPP=50370000000               # país + número, solo dígitos
```
```powershell
ssh vps-muestreo "su - deploy -c 'cd /home/deploy/auditmind && pm2 reload ecosystem.config.cjs --only auditmind-api --update-env'"
curl.exe -s -o NUL -w "public/plans (espera 200): %{http_code}`n" https://auditoria.ianovatechsystems.com/api/v1/public/plans
```
Abre `https://auditoria.ianovatechsystems.com/precios`. Sin correo ni WhatsApp la página se ve, pero sin botones de contacto. Para despublicar: `PUBLIC_PRICING_ENABLED=false` y recargar el API (la web guarda la respuesta 60 s).

---

## Etapa 3 — medición de descargas (se aplica DESPUÉS de las etapas 1 y 2)

La pantalla **Consumo** tenía el aviso «las descargas no se miden». La etapa 3 las mide: cada vez que el API entrega a una persona el enlace de un archivo, anota qué archivo era, de qué organización y de qué tipo, **una vez por archivo y día**. Lo que se ve es una **guía**, no la factura de Supabase: el navegador baja el archivo directo de Supabase y el API no ve los bytes (abrir cinco veces el mismo video en un día cuenta una; un enlace entregado que nadie abrió también cuenta). La cifra real está en el panel de Supabase.

**Orden: SQL primero, luego desplegar.** El SQL solo **agrega** una tabla (`storage_egress_daily`), sin datos de fábrica. Si despliegas sin aplicarlo no se rompe nada: el API avisa en el registro (como máximo cada 10 minutos) y Consumo dice **«No medido»** en vez de 0.

```powershell
cd apps/api
npx prisma db execute --schema prisma/schema.prisma --file ../../infrastructure/db-migrations/2026-11-suscripciones-3-descargas.sql
```
Respuesta esperada: `Script executed successfully.` Si lo repites falla con `relation "storage_egress_daily" already exists` y no cambia nada.

```powershell
cd ../..
node infrastructure/db-migrations/2026-11-suscripciones-verificar.js despues
```
Debe terminar en `TODO EN ORDEN` con **10 tablas** (la nueva con RLS y sin permisos para `anon`/`authenticated`).

**Cómo se ve:** tarjeta «Descargas del mes» (archivos, GB y cuánto va de los 250 GB que incluye Supabase Pro; con Cloudflare R2 no cuestan), columna «Descargas del mes» por organización y tarjeta «Descargas por tipo de archivo». Si el total pasa de 250 GB, el excedente se cobra a $0.09/GB y se reparte entre las organizaciones según lo que descargó cada una; ese costo entra en el costo variable y el margen.

**Qué no cuenta:** los PDF sellados de los papeles y los archivos de la firma por enlace (no tienen tamaño guardado o salen por su propia ruta), y las descargas del portal de auditados. Mejor medir de menos que inventar un tamaño.

**Apagar:** `EGRESS_METER_ENABLED=false` en `/home/deploy/auditmind/.env` y `pm2 reload ecosystem.config.cjs --only auditmind-api --update-env`. Corre sola en producción; en desarrollo local no corre (comparte base con producción) salvo `=true`.

**Reversa:** `…3-descargas.REVERSA.sql` borra solo la tabla de mediciones (no toca cobros, planes ni archivos).

---

## Reversa

| Qué | Cómo |
|---|---|
| **Funcional (lo habitual)** | Parámetros › OFF; `PUBLIC_PRICING_ENABLED=false`; `BILLING_REMINDERS_ENABLED=false` apaga las tareas programadas |
| **SQL** | Primero la etapa 2 y **después** la 1, con el mismo comando: `…2-medicion-pagos.REVERSA.sql` y luego `…1-nucleo.REVERSA.sql`. **Borran** planes, precios, suscripciones, pagos, paquetes comprados y consumo medido (úsalas solo antes de cobrar a alguien). No tocan datos de organizaciones. Revertir en orden equivocado no da error pero deja la etapa 2 huérfana: el verificador lo detecta |
| **Código** | `deploy.sh` siempre baja `origin/main`: para volver atrás hay que revertir los commits en `main` y desplegar de nuevo. Casi nunca hace falta: con el cumplimiento OFF el sistema se comporta como antes |

## Trampas conocidas

- **La base local y la de producción son la misma.** `apps/api/.env` apunta a la real: nunca corras pruebas ni scripts de escritura con esa URL. Las pruebas usan la base de Docker (`127.0.0.1:54329`).
- `prisma db push` está prohibido en esta base (ver arriba).
- El SQL no se puede repetir; el verificador te dice en qué estado está.
- Si al probar localmente las pruebas de integración dicen `Can't reach database server`, es el reenvío de puerto de Docker Desktop: reinicia el contenedor y reconstruye la base de pruebas con `python infrastructure/test-db/rebuild_test_db.py` (reiniciar vacía la base).
