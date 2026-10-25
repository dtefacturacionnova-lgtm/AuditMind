# Portal PBC — código por correo antes de ver la solicitud

**Estado (2026-10-25):** diseño del 2026-10-19 **implementado y probado en `main`** (servicio, controlador, correos, pantalla `/portal`, 6 pruebas contra Postgres real y mutación del candado de la fila). **Sin desplegar**: falta la aprobación del usuario para aplicar el SQL `2026-10-pbc-portal-otp.sql` a la base compartida. Mientras ese SQL no esté aplicado, cualquier código nuevo que lea `pbc_requests` (por ejemplo el servidor de desarrollo local, que usa la misma base que producción) falla por columnas inexistentes: el SQL va ANTES del código.
**Origen:** pendiente de la revisión de seguridad F5b (`docs/firma-externa-por-enlace.md`, «Aceptado o pendiente»; commit `208c873`).

---

## 1. Problema

El portal PBC público abre con `/portal#<token>`. El token no llega al servidor ni a los logs (va en el fragmento y luego en la cabecera `X-Portal-Token`) y en la BD solo hay su huella sha256 + copia cifrada. Pero el **historial global del navegador** (y su sincronización entre equipos) guarda la URL tal como se abrió, con el fragmento. En un equipo compartido —la computadora de la oficina del cliente, la de un cibercafé— otra persona puede reabrir el portal desde el autocompletado de la barra de direcciones y **leer la conversación, escribir y entregar como el auditado** mientras el enlace esté vigente (hasta 30 días después de la fecha límite).

`/firmar` no tiene ese problema: tener el enlace no basta, hace falta además un código de 6 dígitos que llega al correo del firmante. Este documento lleva **ese mismo segundo paso** al portal PBC.

| Amenaza | Hoy | Con este cambio |
|---|---|---|
| A1 · Otra persona en el mismo equipo reabre el enlace desde el historial | Ve y escribe como el auditado | Ve solo el nombre del despacho y el correo enmascarado; sin el buzón del auditado no entra |
| A2 · Enlace reenviado o filtrado (captura, chat, correo reenviado) | Igual que A1 | Igual que A1 |
| A3 · Fuerza bruta del código | — | 6 dígitos con HMAC, 5 intentos por código, bloqueo de 1 h a los 10 fallos por hora, enlace inservible al 3.er bloqueo, límite por IP |
| A4 · Usar el portal para mandar correos en bucle | — | 60 s entre códigos, 5/hora y 10/día por solicitud, 1000/día por organización, 10/hora por IP |
| A5 · Alguien con la sesión abierta en un equipo compartido que se va sin cerrar | La pestaña sigue abierta sin límite | La sesión vence a los 30 min (sin extensión) y la página vuelve a pedir el código |

Fuera de alcance: quien controla el buzón del auditado (eso es, por definición, el auditado), y un equipo comprometido con malware.

---

## 2. Decisión

**El mismo mecanismo y los mismos parámetros que la firma por enlace** (`docs/firma-externa-por-enlace.md` §5–§7), reutilizando su código donde es genérico:

- Código de 6 dígitos (`crypto.randomInt`) al correo **`requestedToEmail`** de la solicitud, guardado solo como **HMAC-SHA256** ligado al id de la solicitud, con clave derivada de `ENCRYPTION_KEY` por HKDF. Sal **propia** (`auditmind-pbc-portal`): un código de la firma nunca sirve en el portal ni al revés, aunque coincidieran los ids. Una copia de la BD sin la clave no permite probar el millón de códigos fuera de línea.
- Al acertar, una **sesión de 30 min** sin extensión: 32 bytes aleatorios en base64url, que viajan en la cabecera **`X-Portal-Session`** y viven solo en memoria de la página (ni `localStorage` ni cookie). En la BD, solo su sha256.
- **Mismos límites y bloqueos**, con las MISMAS constantes (se movieron a `signatures/otp-limits.ts` y las importan ambos módulos: si se ajustan, cambian en los dos):

| Parámetro | Valor | Constante |
|---|---|---|
| Vigencia del código | 10 min | `OTP_TTL_MS` |
| Espera entre códigos | 60 s | `OTP_MIN_GAP_MS` |
| Códigos por solicitud | 5 por hora y 10 por día | `OTP_MAX_SENDS_PER_HOUR`, `OTP_MAX_SENDS_PER_DAY` |
| Fallos con un mismo código | 5 → se invalida | `OTP_MAX_FAILS_PER_CODE` |
| Fallos por hora | 10 → bloqueo de 1 h (423) | `OTP_MAX_FAILS_PER_HOUR`, `OTP_LOCK_MS` |
| Bloqueos acumulados | al 3.º el enlace queda inservible hasta «Regenerar enlace», y se avisa por correo a quien creó la solicitud | `OTP_MAX_LOCKS` |
| Sesión | 30 min, sin extensión | `SESSION_TTL_MS` |
| Códigos por organización | 1000 por día (presupuesto propio del portal, no compite con la firma) | `MAX_PBC_OTP_EMAILS_PER_ORG_PER_DAY` |
| Por IP (throttler, IPv6 por /64) | envío 10/hora, verificación 20/hora, lecturas 30/min, escrituras 10/min | `PUBLIC_LIMITS` |

- Lo que la firma usa para la evidencia y aquí no aplica (cadena de hash, «ya firmada: 3 códigos por día», estado `VIEWED`) no se copia. El portal sí guarda una **bitácora simple** (sin cadena de hash) de envíos, fallos, bloqueos y sesiones con IP y navegador: con ella se cuentan los topes diarios y queda rastro de quién entró.

### Alternativas descartadas
- **Cookie de sesión `HttpOnly`** en vez de cabecera: la API y la web están en orígenes distintos (cookie de terceros, `SameSite=None`) y abriría CSRF; la cabecera es lo que ya usa `/firmar`.
- **Sesión deslizante** (se renueva con cada uso): más cómoda en una conversación larga, pero alarga indefinidamente una sesión olvidada en un equipo compartido, que es justo A5. Se compensa en la página (§6): los borradores no se pierden al volver a verificar.
- **Interruptor para apagar el código** (como `SIGNATURES_PUBLIC_ENABLED`): reabriría la falla con un cambio de `.env`. No se agrega. Consecuencia aceptada: si el proveedor de correo falla, el auditado no puede entrar hasta que se restablezca (igual que `/firmar`).

---

## 3. Compatibilidad: los enlaces vigentes siguen sirviendo

- **El token no cambia.** Los enlaces `/portal#<token>` ya entregados siguen abriendo el portal; la diferencia es que ahora piden el código antes de mostrar la solicitud. No hay que regenerar nada ni avisar al equipo.
- **Cambio visible para el despacho:** el código llega **al correo registrado en la solicitud** (`requestedToEmail`). Si el equipo compartió el enlace con otra persona del cliente (p. ej. el contador en vez del gerente registrado), esa persona necesitará el código del buzón registrado. El texto del panel lo explica («Al abrirlo, pedirá un código que enviaremos a …»).
- **Migración solo «expandir»:** columnas nuevas con valor por defecto y dos tablas nuevas. El código desplegado hoy no las conoce y no se ve afectado (Prisma solo selecciona las columnas que conoce), así que el SQL se aplica ANTES del código sin ventana de error. **No hay paso de «contraer»**: no se elimina ni renombra nada.
- Durante el reinicio de la API y la web (segundos), una página del portal abierta con el código viejo puede mostrar «Enlace inválido»; volver a abrir el enlace lo resuelve.

---

## 4. Modelo de datos (SQL directo, nunca `prisma db push`)

`infrastructure/db-migrations/2026-10-pbc-portal-otp.sql` (con su `.REVERSA.sql`):

**`pbc_requests`** — estado del código, igual que en `signature_requests` pero con prefijo `portal` (la tabla ya tiene `portalToken*`):

| Columna | Tipo | Uso |
|---|---|---|
| `portalOtpHash` | `TEXT NULL` | HMAC del código vigente (nunca sale en una respuesta) |
| `portalOtpExpiresAt` | `TIMESTAMP(3) NULL` | vence a los 10 min |
| `portalOtpAttempts` | `INT NOT NULL DEFAULT 0` | fallos con el código vigente |
| `portalOtpFailuresHour` | `INT NOT NULL DEFAULT 0` | fallos en la ventana de 1 h |
| `portalOtpWindowStart` | `TIMESTAMP(3) NULL` | inicio de esa ventana |
| `portalOtpSentCount` | `INT NOT NULL DEFAULT 0` | códigos enviados en la ventana |
| `portalOtpLastSentAt` | `TIMESTAMP(3) NULL` | para la espera de 60 s |
| `portalLockedUntil` | `TIMESTAMP(3) NULL` | bloqueo de 1 h |
| `portalLockCount` | `INT NOT NULL DEFAULT 0` | bloqueos desde la última vez que se generó el enlace; al llegar a 3 el enlace queda inservible |

«Regenerar enlace» pone todo lo anterior en su valor inicial y revoca las sesiones (en una transacción, junto con la rotación del token).

**`pbc_portal_sessions`** — `id`, `requestId` (FK → `pbc_requests` `ON DELETE CASCADE`), `tokenHash` (único), `expiresAt`, `ip`, `userAgent`, `createdAt`, `revokedAt`.

**`pbc_portal_events`** (enum `PbcPortalEventType`: `OTP_SENT`, `OTP_FAILED`, `OTP_LOCKED`, `SESSION_STARTED`) — `id`, `requestId` (FK cascade), `type`, `at`, `ip`, `userAgent`, `detail` (JSONB). Índices `(requestId, type, at)` y `(type, at)`. Nunca contiene el código ni la sesión.

Las dos tablas nacen con **RLS activo y `REVOKE ALL` de `anon`/`authenticated`** (regla del 2026-10-18: la clave `anon` es pública). La API conecta como `postgres` (BYPASSRLS).

---

## 5. API pública (`/api/v1/pbc-portal`, `@Public`, `PublicThrottlerGuard`, `Cache-Control: no-store`, fuera de Swagger)

| Ruta | Cabeceras | Límite IP | Respuesta |
|---|---|---|---|
| `GET /pbc-portal` | token | 30/min | Portada sin datos de la solicitud: `{ orgName, maskedEmail, expiresAt }` |
| `POST /pbc-portal/otp/send` | token | 10/h | `{ sent: true, maskedEmail, resendInSeconds: 60 }` (uniforme) |
| `POST /pbc-portal/otp/verify` `{ code }` | token | 20/h | `{ sessionToken, sessionExpiresAt }` |
| `GET /pbc-portal/request` | token + sesión | 30/min | La solicitud (lo mismo que antes devolvía `GET /pbc-portal`) |
| `POST /pbc-portal/message` | token + sesión | 10/min | Igual que antes |
| `POST /pbc-portal/submit` | token + sesión | 10/min | Igual que antes |

- **`GET /pbc-portal` deja de devolver la solicitud.** Es el cambio que cierra la falla: sin sesión, la API no entrega nada de la conversación aunque se la llame directamente.
- Errores: token ausente/mal formado/desconocido → 404 (sin tocar la BD si está mal formado); enlace vencido → 410; sin sesión o sesión vencida/revocada/de otra solicitud → 401 «Verifica tu correo nuevamente.»; bloqueado → 423; demasiados códigos o espera → 429; correo no enviado o sin `ENCRYPTION_KEY` → 503.
- Los contadores de fallos se guardan aunque la respuesta sea un error (el resultado se calcula dentro de la transacción y la excepción se lanza después), y todo el cálculo va bajo `SELECT … FOR UPDATE` de la fila de la solicitud: dos verificaciones simultáneas no esquivan el contador.
- Servicio nuevo `PbcPortalService` (`apps/api/src/pbc/pbc-portal.service.ts`); `PbcService` queda solo con el lado del equipo auditor.

**Lado del equipo:** el detalle de la solicitud (`GET /pbc/:id`) agrega `portalLock: null | { permanent: boolean; until: string | null }` para mostrar «el portal se bloqueó por códigos incorrectos»; ningún listado ni detalle devuelve los campos `portalOtp*`/`portalLock*` crudos.

**Correos nuevos** (`EmailService`): `sendPbcPortalOtp` (el asunto NO lleva el código) y `sendPbcPortalLockedAlert` a quien creó la solicitud, al tercer bloqueo.

---

## 6. Página `/portal`

Máquina de estados PURA en `apps/web/src/lib/portal/flow.ts` (con pruebas), como `lib/signature/flow.ts`:

```
cargando ─► código (sin enviar) ─[Enviar código]─► código (enviado) ─[verificar]─► portal
   │             ▲                                                                   │
   │             └──────────── sesión vencida (30 min o 401) ◄────────────────────────┘
   └─► inválido (404) · vencido (410) · no disponible (red/5xx/429 al abrir)
```

- **El código NO se envía solo al abrir**: la portada muestra «Enviaremos un código a j•••@g•••.com» y un botón. Así, el equipo auditor que abre el enlace para revisarlo («Abrir portal») no le manda correos al auditado.
- Campo con `autoComplete="one-time-code"`, `inputMode="numeric"`; reenvío con cuenta regresiva (`hooks/useCountdown.ts`, extraído de `CodeStep` de la firma); la espera que indica un 429 («Espera 30 segundos…») ajusta la cuenta.
- La sesión vive en memoria. **Al vencer** (temporizador a `sessionExpiresAt`, o cualquier 401) la página vuelve al paso del código con el aviso «Tu sesión segura venció…», borra la solicitud de la caché de React Query y **conserva los borradores** (mensaje, adjuntos y notas de envío viven por encima de la parte protegida).
- Un 404/410 durante la conversación (el equipo regeneró el enlace o venció) lleva a la pantalla terminal correspondiente.

---

## 7. Pruebas

- **API (jest):** `pbc-portal.service.spec.ts` — HMAC y nada en claro (fila, eventos), código correcto abre sesión y se consume, 60 s, 5/hora, 10/día, código nuevo invalida el anterior, 5 fallos por código, bloqueo de 1 h a los 10 fallos y su fin, 3.er bloqueo inservible + aviso al creador, regenerar lo restablece y revoca sesiones, tope por organización, sesión: ausente/vencida/revocada/de otra solicitud → 401, enlace vencido → 410, la portada no trae datos de la solicitud, sal propia (un HMAC de la firma no sirve), correo que falla → 503. `pbc-portal.controller.spec.ts` — cabeceras (nunca ruta ni query), `GET /pbc-portal` ya no devuelve la solicitud, validación del código, límites por IP de envío y verificación. `pbc.service.spec.ts` — campos nuevos fuera de las respuestas, `portalLock` en el detalle.
- **Web (jest, lógica pura):** `lib/portal/flow.spec.ts` (transiciones, clasificación de errores, espera del 429) y `lib/portal-api.spec.ts` (token y sesión solo en cabeceras, sin credenciales ni Referer).
- **No se crean datos en la base real** (es la misma que producción): todas las pruebas usan BD falsa en memoria.

---

## 8. Despliegue (requiere aprobación del usuario)

1. SQL `infrastructure/db-migrations/2026-10-pbc-portal-otp.sql` en Supabase (aditivo; el código actual sigue funcionando).
2. `git pull`, `prisma generate`, build de api y web, `pm2 startOrReload ecosystem` (o como el resto de F5b, que tampoco está desplegada aún: se pueden desplegar juntos).
3. Verificar con curl: `GET /pbc-portal` con un token inexistente → 404; `GET /pbc-portal/request` sin sesión → 404/401; cabeceras `no-store`.
4. Prueba punta a punta con el correo del usuario (como F5 de la firma): crear una solicitud PBC de prueba **en una organización de prueba que el usuario indique**, abrir el enlace, recibir el código, entrar, escribir, dejar vencer la sesión.

Reversa: `2026-10-pbc-portal-otp.REVERSA.sql` **después** de volver al código anterior.

---

## 9. Plan de trabajo y modelo recomendado

| Tarea | Modelo |
|---|---|
| Diseño (este documento), modelo de amenazas y transacciones de los contadores | **Opus** (hecho) |
| SQL expandir + reversa, esquema Prisma | **Sonnet** |
| `PbcPortalService` y controlador siguiendo `SignaturePublicService` | **Sonnet** sobre este diseño (implementado el 2026-10-25 sobre este diseño) |
| Página `/portal`, máquina de estados y cliente HTTP | **Sonnet** |
| Pruebas sobre los patrones de `signature-public.otp.spec.ts` | **Haiku/Sonnet** |
| Despliegue y verificación con curl | **Sonnet** |
| Prueba punta a punta con correo real | **Haiku** (guiada por el usuario) |
