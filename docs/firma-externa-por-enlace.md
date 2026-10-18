# Firma electrónica simple por enlace externo — especificación completa

**Versión 2 (2026-10-18).** Diseñada con **Opus** para que la implementación con **Sonnet** no tenga que tomar decisiones de diseño ni de seguridad. Si algo de este documento resulta imposible tal como está escrito, se detiene la implementación y se consulta. No se improvisa.

---

## 0. Resumen

Un tercero sin cuenta en AuditMind recibe un correo, verifica su identidad con un código enviado a ese mismo correo, lee el documento y lo firma o lo rechaza.

AuditMind guarda:
- la evidencia de la firma;
- una bitácora encadenada por hash, que deja ver cualquier alteración posterior;
- un PDF final sellado por la organización con sello de tiempo RFC 3161.

Cualquier persona puede verificar el PDF con un código impreso en el propio documento.

| Documento | Firmante | Respuesta que registra |
|---|---|---|
| Carta de compromiso (NIA 210) | Representante del cliente | Aceptación |
| Confirmación externa (NIA 505) | Banco, proveedor, abogado, cliente del cliente | De acuerdo / en desacuerdo, monto que confirma, comentarios, adjuntos |
| Acta de entrevista externa | Persona entrevistada | Conforme / con observaciones |

**Las cuatro decisiones que estaban abiertas, cerradas con el criterio más seguro:**

1. **Texto de consentimiento y aviso de privacidad:** redacción final en §15. Se recomienda una revisión legal, pero no bloquea la implementación; los textos son constantes versionadas y cambiarlos no rompe firmas anteriores.
2. **Código de verificación por correo: SÍ.** Se exige **antes de ver el documento**, no solo al firmar. Un enlace reenviado o filtrado no muestra nada sin acceso al buzón del firmante.
3. **Adjuntos del tercero: SÍ, solo en confirmaciones**, con una cadena de defensa: tipos permitidos por firma de bytes, antivirus ClamAV, reconstrucción del archivo (CDR) y original en cuarentena.
4. **Vencimientos:** carta 30 días, confirmación y acta 15 días. Mínimo 1, máximo 60, elegible al enviar. Un recordatorio automático 3 días antes.

**Alcance:** firma electrónica **simple** con evidencia. La firma **certificada** (certificado de un Prestador de Servicios de Certificación acreditado ante la UFE del MINEC) queda para otra fase; §20 explica cómo encaja sin rediseñar.

**Fuera de alcance:**
- varios firmantes sobre un mismo documento;
- confirmaciones bancarias vía plataformas especializadas (Confirmation.com u otras);
- código de verificación por SMS o WhatsApp;
- confirmaciones negativas (NIA 505 solo las admite en casos limitados).

---

## 1. Estado actual (punto de partida, 2026-10-18)

- **Carta:**
  - `EngagementLetter.content` es texto plano. La "firma" la teclea el auditor (`apps/api/src/portfolio/engagement-letters.service.ts` → `sign()`, que también pasa el `Client` a `ACTIVE`).
  - No hay PDF, envío ni rechazo; los estados `SENT` y `DECLINED` existen en el enum, pero nada los escribe.
  - El contacto del cliente está en `Client.contactName` y `Client.contactEmail`.
- **Confirmación:**
  - `apps/api/src/confirmations/` (todo con rol AUDITOR). `send()` solo cambia el estado; `receiveResponse()` recibe la respuesta tecleada por el auditor y calcula la diferencia.
  - `ExternalConfirmation` no tiene `organizationId`: se llega a la organización por `audit`.
  - Las confirmaciones conciliadas alimentan `PT-FIN-C-SUST` (`paper-sections.service.ts`).
- **Entrevista:** papel `PT-ENTREV` (`paper-catalogue.ts`; secciones S1–S4 en `paper-templates.ts`) y actas forenses `B-INT-*`. El entrevistado es texto libre en la MATRIX de S2.
- **Patrón de referencia:** portal PBC (`apps/api/src/pbc/`, `apps/web/src/app/portal/[token]/`).
- **Infraestructura disponible:**
  - `PdfService.generateBranded()` (Puppeteer, con interceptor SSRF y leyenda legal).
  - `PdfToolsService`: `signPdf` (certificado PEM, firma visible con `name`/`reason`/`location`/`pageNumber`), `timestampPdf(buf, name, tsaUrl?)`, `mergePdfs`, `sanitizePdf`, `compressPdf`.
  - `SigningIdentityService`: certificado autofirmado RSA-2048 por usuario, con la clave cifrada AES-256-GCM usando `ENCRYPTION_KEY`.
  - Bucket `audit-files` privado, con `StorageUrlInterceptor`.
  - `EmailService` (Resend; escapado desde `aca5753`).
- **Faltantes que esta especificación cubre:**
  - la API no tiene `trust proxy`, aunque nginx ya envía `X-Forwarded-For` y `X-Real-IP`;
  - no hay límite de intentos en ningún endpoint;
  - el token del PBC se guarda en claro y viaja en la ruta de la URL, así que queda en los logs de nginx.
- **Recursos del VPS:**
  - 32 GB de RAM (27 GB libres), 8 núcleos y 333 GB de disco libres; Docker activo con Stirling.
  - ClamAV cabe sin problema.

---

## 2. Modelo de amenazas

| # | Actor / situación | Qué intentaría | Defensa principal |
|---|---|---|---|
| A1 | Atacante externo sin enlace | Adivinar o enumerar enlaces | Token de 256 bits, hash en BD, límite de intentos por IP |
| A2 | Quien recibe un correo reenviado, o un enlace filtrado (logs, historial, captura) | Ver o firmar en nombre de otro | Código de verificación al buzón **antes de ver**; token en el fragmento `#`, que no llega al servidor ni a los logs |
| A3 | Escáner de enlaces del correo (Outlook SafeLinks, Gmail) | Prefetch que marca "visto" o consume el enlace | El token va en el fragmento: el escáner solo ve `/firmar` sin token y no cambia ningún estado |
| A4 | Tercero malicioso | Subir malware o un PDF con JavaScript que el auditor luego abre | Tipos permitidos por firma de bytes, ClamAV, CDR (Stirling), original en cuarentena |
| A5 | Tercero malicioso | Inyección de HTML/JS en campos de texto que se muestran a auditores, en PDF o en correo | DTO con límites; todo se escapa al renderizar (React, `esc()` en PDF, `escHtml()` en correo) |
| A6 | Sitio malicioso | Clickjacking de la página de firma | `X-Frame-Options: DENY` y `frame-ancestors 'none'` |
| A7 | Usuario interno malicioso | Usar AuditMind para enviar spam o phishing desde nuestro dominio | Rol mínimo, tope de correos por organización y día, destinatario solo por solicitud real |
| A8 | Usuario interno malicioso | Fabricar o alterar una firma, o editar la evidencia en la BD | La firma solo se crea por el flujo público; bitácora encadenada por hash; PDF sellado con huella publicada; verificación de integridad |
| A9 | Alguien que lee una copia de la BD | Firmar con tokens o códigos robados | Tokens, sesiones y códigos guardados como hash/HMAC; el HMAC usa una clave derivada que no está en la BD |
| A10 | Fallo de Stirling, ClamAV o la autoridad de sello de tiempo | Perder la firma o dejarla a medias | La firma queda en BD de forma atómica; el sellado se reintenta; los adjuntos fallan **cerrados** (sin escaneo no se aceptan) |
| A11 | Documento que cambia tras enviarse | Firmar algo distinto de lo que se ve | PDF congelado con SHA-256, verificado al firmar; revocación automática si cambia el origen |
| A12 | Doble envío o carrera | Dos firmas o firma después del vencimiento | `updateMany` condicional dentro de la transacción |
| A13 | Buzón del firmante comprometido | Firmar suplantando al firmante | **Límite aceptado de la firma simple.** Se mitiga con IP, navegador y nombre escrito; la firma certificada (§20) lo resuelve |

---

## 3. Arquitectura y flujo

```
AUDITOR (sesión)                      SERVIDOR                                FIRMANTE (sin cuenta)
────────────────                      ────────                                ────────────────────
Enviar para firma ──▶ valida rol/org/documento
                      genera PDF congelado (+SHA-256) → Storage
                      crea SignatureRequest (token: solo el hash)
                      evento CREATED → SENT
                      correo con enlace  ${APP_URL}/firmar#<token> ─────────────▶ abre el enlace
                                                                                 (el token queda en el navegador)
                      GET  /public/signatures/request   [X-Signature-Token] ◀── vista mínima (sin documento)
                      POST /public/signatures/otp/send  ◀───────────────────── "Enviarme el código"
                      correo con código de 6 dígitos ──────────────────────────▶
                      POST /public/signatures/otp/verify ◀──────────────────── escribe el código
                      crea SignatureSession (30 min) ──────────────────────────▶ recibe el token de sesión (en memoria)
                      evento VIEWED; GET documento ─────────────────────────────▶ ve el PDF (enlace de 10 min)
                      [confirmación] POST adjuntos ◀──────────────────────────── sube soportes (opcional)
                         MIME por bytes → ClamAV → CDR → cuarentena
                      POST /public/signatures/sign ◀──────────────────────────── nombre, cargo, respuesta, consentimiento
                      TRANSACCIÓN: SIGNED + efecto en el documento + evento
                      correo de aviso al auditor y copia al firmante
                      cron de sellado: hoja de evidencia → fusionar → sello org → RFC 3161
                      evento SEALED; adjunta el PDF al documento de origen
Cualquiera ───────▶ /verificar → código del PDF → datos de la firma + comparación de SHA-256 en el navegador
```

---

## 4. Modelo de datos

**Aplicar con SQL directo** (`infrastructure/db-migrations/2026-10-firma-externa.sql` y su `.REVERSA.sql`). Después actualizar `schema.prisma` y correr `prisma generate`.

**Nunca `prisma db push`**: intenta borrar `rag_chunks`/`rag_documents`, que Prisma no conoce (ver `fixes_and_lessons.md`). Antes de crear, revisar que los nombres no choquen.

```prisma
enum SignatureDocumentType   { ENGAGEMENT_LETTER EXTERNAL_CONFIRMATION INTERVIEW_RECORD }
enum SignatureRequestStatus  { PENDING VIEWED SIGNED DECLINED REVOKED EXPIRED }
enum SignatureSealStatus     { NOT_APPLICABLE PENDING SEALED FAILED }
enum SignatureEventType {
  CREATED SENT RESENT REMINDER_SENT OTP_SENT OTP_FAILED OTP_LOCKED SESSION_STARTED
  VIEWED ATTACHMENT_ACCEPTED ATTACHMENT_REJECTED SIGNED DECLINED REVOKED EXPIRED
  SEALED SEAL_FAILED TARGET_UPDATED INTEGRITY_FAILED
}
enum SignatureAttachmentScan { CLEAN INFECTED ERROR }

model SignatureRequest {
  id               String                 @id @default(cuid())
  organizationId   String
  auditId          String?                // null en la carta (vive a nivel de cliente)
  documentType     SignatureDocumentType
  targetId         String                 // EngagementLetter.id | ExternalConfirmation.id | WorkingPaper.id
  title            String                 // ≤ 200
  signerName       String                 // destinatario esperado (≤ 120)
  signerEmail      String                 // normalizado a minúsculas
  signerRole       String?                // ≤ 120
  payload          Json      @default("{}") // datos propios del tipo (ver §11)
  // ── enlace ──
  tokenHash        String    @unique      // sha256(token) en hex — para buscar
  tokenEncrypted   String                 // AES-256-GCM con ENCRYPTION_KEY — solo para recordatorios (§13)
  expiresAt        DateTime
  status           SignatureRequestStatus @default(PENDING)
  lockedUntil      DateTime?              // bloqueo temporal por intentos fallidos de código
  // ── código de verificación ──
  otpHash          String?                // HMAC-SHA256(código) con clave derivada (§6)
  otpExpiresAt     DateTime?
  otpAttempts      Int       @default(0)  // fallos con el código vigente
  otpFailuresHour  Int       @default(0)  // fallos en la ventana de 1 h
  otpWindowStart   DateTime?
  otpSentCount     Int       @default(0)  // códigos enviados en la ventana de 1 h
  otpLastSentAt    DateTime?
  otpVerifiedAt    DateTime?
  // ── documento congelado ──
  documentPath     String
  documentSha256   String
  documentPages    Int?
  // ── firma ──
  consentVersion   String?
  consentText      String?
  signedName       String?
  signedRole       String?
  response         Json?
  declineReason    String?
  signedAt         DateTime?
  viewedAt         DateTime?
  signerIp         String?
  signerUserAgent  String?
  // ── sello ──
  verificationCode String?   @unique      // XXXX-XXXX-XXXX-XXXX, se crea al firmar
  sealStatus       SignatureSealStatus    @default(NOT_APPLICABLE)
  sealAttempts     Int       @default(0)
  sealedAt         DateTime?
  tsaUrlUsed       String?
  signedPdfPath    String?
  signedPdfSha256  String?
  eventsHeadHash   String?                // cabeza de la cadena al sellar
  // ── envío ──
  sentAt           DateTime?
  sendCount        Int       @default(0)
  reminderEnabled  Boolean   @default(true)
  reminderSentAt   DateTime?
  createdById      String
  revokedAt        DateTime?
  revokedById      String?
  revokedReason    String?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  organization Organization          @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  audit        Audit?                @relation(fields: [auditId], references: [id], onDelete: Cascade)
  createdBy    User                  @relation("SignatureRequestCreator", fields: [createdById], references: [id])
  events       SignatureEvent[]
  sessions     SignatureSession[]
  attachments  SignatureAttachment[]

  @@index([organizationId])
  @@index([documentType, targetId])
  @@index([status, expiresAt])
  @@index([sealStatus])
  @@map("signature_requests")
}

model SignatureSession {
  id         String   @id @default(cuid())
  requestId  String
  tokenHash  String   @unique            // sha256(token de sesión)
  expiresAt  DateTime                    // creación + 30 min (no se extiende)
  ip         String?
  userAgent  String?
  createdAt  DateTime @default(now())
  revokedAt  DateTime?
  request    SignatureRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)
  @@index([requestId])
  @@map("signature_sessions")
}

model SignatureEvent {
  id        String             @id @default(cuid())
  requestId String
  seq       Int                          // 1, 2, 3… por solicitud (único con requestId)
  type      SignatureEventType
  at        DateTime           @default(now())
  ip        String?
  userAgent String?
  actorId   String?                      // usuario interno; null si fue el firmante o el sistema
  detail    Json?
  prevHash  String
  hash      String                       // ver §8
  request   SignatureRequest   @relation(fields: [requestId], references: [id], onDelete: Cascade)
  @@unique([requestId, seq])
  @@map("signature_events")
}

model SignatureAttachment {
  id             String                  @id @default(cuid())
  requestId      String
  originalName   String                  // ≤ 200, se muestra escapado
  detectedType   String                  // pdf | jpeg | png (por firma de bytes)
  sizeBytes      Int
  originalSha256 String
  quarantinePath String                  // original intacto, nunca se sirve al firmante
  safePath       String?                 // PDF reconstruido (CDR)
  safeSha256     String?
  scanStatus     SignatureAttachmentScan
  scanSignature  String?                 // nombre del malware si INFECTED
  submitted      Boolean  @default(false) // true al firmar; los no enviados se purgan
  createdAt      DateTime @default(now())
  request        SignatureRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)
  @@index([requestId])
  @@map("signature_attachments")
}

// Organization: + sealCertPem String?  + sealKeyEncrypted String?  + sealCreatedAt DateTime?
```

**SQL obligatorio además de las tablas:**
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` en las 4 tablas nuevas.
- Verificar que `anon` y `authenticated` no tengan privilegios. Los permisos por defecto ya los revocan; confirmarlo con `has_table_privilege`.
- La reversa elimina tablas, tipos y columnas en orden inverso.

**Rutas en Storage** (bucket privado `audit-files`). `<scope>` = `auditId` o `org-<organizationId>` en la carta:
- `signature-requests/<scope>/<requestId>/original.pdf`
- `signature-requests/<scope>/<requestId>/signed.pdf`
- `signature-requests/<scope>/<requestId>/attachments/<attId>.pdf` (reconstruido)
- `signature-requests/<scope>/<requestId>/attachments/quarantine/<attId>.<ext>` (original)

**Respaldo y borrado de encargos:**
- En `AUDIT_SCOPED_MODELS` (`apps/api/src/audits/backup/audit-backup.types.ts`) se agregan:
  - `signatureRequest`, con `auditId` propio;
  - `signatureEvent` y `signatureAttachment`, por un filtro nuevo `via_requestId`.
- `signatureSession` no se respalda: es efímera.
- Las rutas llevan el `auditId` como carpeta, así que el filtro de rutas propias del respaldo ya las acepta.
- **Restaurar no reactiva enlaces.** Al restaurar, toda solicitud `PENDING` o `VIEWED` pasa a `REVOKED`, con motivo "restaurada desde respaldo".

---

## 5. Enlaces, tokens y sesiones

| Secreto | Formato | Dónde vive | Se guarda | Vida |
|---|---|---|---|---|
| Token del enlace | 32 bytes aleatorios, base64url (43 caracteres) | Solo en el correo y en el fragmento de la URL | `sha256` hex (búsqueda) y cifrado AES-256-GCM con `ENCRYPTION_KEY` (solo para reenviar el mismo enlace en el recordatorio; una copia de la BD sin la clave no lo revela) | Hasta `expiresAt`; tras firmar, hasta `signedAt` + 30 días solo para descargar la copia. "Reenviar" lo rota |
| Token de sesión | 32 bytes aleatorios, base64url | Memoria de la página (no `localStorage`, no cookie) | `sha256` hex | 30 min desde la verificación, sin extensión |
| Código de verificación | 6 dígitos (`crypto.randomInt`) | Correo del firmante | HMAC-SHA256 con clave derivada (§6) | 10 min |
| Código de verificación del PDF | 10 bytes aleatorios en base32 Crockford, `XXXX-XXXX-XXXX-XXXX` | Impreso en la hoja de evidencia | En claro (es público por diseño) | Permanente |

**Formato del enlace:** `${APP_URL}/firmar#<token>`.
- El fragmento `#` **no se envía al servidor**, así que nunca queda en logs de nginx, de Next ni de la API, ni en la cabecera `Referer`. Los escáneres de enlaces del correo no lo ven.
- La página lo lee de `location.hash` y ejecuta de inmediato `history.replaceState(null, '', '/firmar')`, para que no quede en la barra de direcciones ni en capturas.
- Toda llamada a la API pública envía el token en la cabecera **`X-Signature-Token`**, y la sesión en **`X-Signature-Session`**. Nunca van en la ruta ni en la query.
- Los secretos se comparan siempre por hash con búsqueda indexada; no se usan comparaciones de texto con tiempo variable sobre el secreto en claro.
- **El enlace en claro se muestra una sola vez** al auditor, en la respuesta de crear o reenviar, para copiarlo si el correo falla. La API nunca lo vuelve a entregar al equipo (el cifrado es solo para el recordatorio automático); si se necesita otra vez, se reenvía, lo que rota el token.
- Un enlace reemplazado o inexistente responde 404 con el mensaje "Enlace no válido o reemplazado por uno más reciente. Revisa el último correo que recibiste."
- **Una sola solicitud activa por documento:** crear una nueva revoca la `PENDING`/`VIEWED` anterior y sus sesiones.
- Revocar, reenviar, vencer o firmar invalida todas las sesiones de la solicitud (`revokedAt = now()`).

---

## 6. Código de verificación por correo

- **Clave del HMAC:** `HKDF-SHA256(ikm = ENCRYPTION_KEY, salt = "auditmind-signature", info = "otp-v1", 32 bytes)`.
  - No hace falta un secreto nuevo, y una copia de la BD no basta para probar fuera de línea el millón de códigos posibles.
  - Al arrancar se valida que `ENCRYPTION_KEY` exista. Si falta, el módulo público responde 503 y la API lo registra en el log; el resto de la API sigue funcionando.
- **Envío** (`POST /public/signatures/otp/send`):
  - mínimo 60 s entre códigos de una misma solicitud;
  - máximo 5 códigos por hora por solicitud;
  - máximo 10 por hora por IP (throttler).
  - Un código nuevo invalida el anterior y pone `otpAttempts = 0`.
  - El asunto del correo **no** contiene el código.
- **Verificación** (`POST /public/signatures/otp/verify`):
  - 5 fallos con el mismo código lo invalidan (hay que pedir otro);
  - 10 fallos en una hora ponen `lockedUntil = now + 1 h` y evento `OTP_LOCKED`;
  - durante el bloqueo, envío y verificación responden 423 con "Demasiados intentos. Vuelve a intentarlo en una hora."
  - Si acierta: `otpVerifiedAt`, se crea la `SignatureSession`, eventos `SESSION_STARTED` y, la primera vez, `VIEWED` (`viewedAt`).
- **Respuesta uniforme:** el envío siempre responde `{ sent: true, maskedEmail: "j•••@g•••.com", resendInSeconds }` dentro de los límites, para no revelar nada extra.

---

## 7. Límites de intentos y red

- **`app.set('trust proxy', 'loopback')`** en `apps/api/src/main.ts` (como `NestExpressApplication`).
  - nginx corre en el mismo VPS y agrega la IP real con `$proxy_add_x_forwarded_for`.
  - Express recorre `X-Forwarded-For` de derecha a izquierda y solo confía en 127.0.0.1/::1. Una IP falsa que el cliente meta en la cabecera queda a la izquierda y se ignora.
  - Sin esto, todas las peticiones parecen venir de 127.0.0.1 y el límite bloquearía a todos a la vez.
- **`@nestjs/throttler` v6**, compatible con Nest 10:
  - `ThrottlerModule` con almacenamiento en memoria; la API corre en un solo proceso PM2. **Si algún día se escala a varios procesos, migrar el almacenamiento a Redis.**
  - El guard se aplica **solo a los controladores públicos**, no global.

| Endpoint público | Límite por IP |
|---|---|
| `GET request`, `GET document`, `GET signed` | 30 / min |
| `POST otp/send` | 10 / hora (más los límites por solicitud de §6) |
| `POST otp/verify` | 20 / hora (más los límites por solicitud de §6) |
| `POST attachments` | 10 / min (más los límites de tamaño de §12) |
| `POST sign`, `POST decline` | 10 / min |
| `GET verify/:code` | 20 / min |
| Portal PBC (los 3 endpoints) | 30 / min GET, 10 / min POST |

- Respuesta 429: "Demasiadas solicitudes. Espera un momento e inténtalo de nuevo."
- **Tope de correos por organización:** 300 correos de firma por día (envíos, reenvíos, recordatorios y códigos; se cuentan con `SignatureEvent` de las últimas 24 h). Al superarlo, 429 con "Se alcanzó el límite diario de correos de firma de tu organización." Es la defensa contra A7.

---

## 8. Bitácora encadenada por hash

- Cada evento guarda `seq`, `prevHash` y `hash`.
- `prevHash` del evento 1 = `sha256("signature-request:" + requestId)`.
- `hash = sha256(prevHash + "|" + seq + "|" + type + "|" + at.toISOString() + "|" + (ip ?? "") + "|" + (userAgent ?? "") + "|" + (actorId ?? "") + "|" + canonicalJson(detail))`.
  - `canonicalJson`: claves ordenadas alfabéticamente y sin espacios.
- **Concurrencia:** el evento se escribe dentro de la misma transacción que el cambio que lo origina.
  - `seq` = último `seq` + 1, leído con `SELECT ... FOR UPDATE` sobre la fila de `signature_requests`.
  - `@@unique([requestId, seq])` garantiza que dos escrituras simultáneas no queden con el mismo número.
- **Al sellar**, `eventsHeadHash` = hash del último evento. Se imprime en la hoja de evidencia, así que cualquier edición posterior de un evento rompe la cadena y deja de coincidir con el PDF sellado.
- **Verificación de integridad** (`GET /signature-requests/:id/integrity`), que recomputa y devuelve `{ ok, checks: [...] }`:
  - la cadena completa;
  - `documentSha256` contra el archivo en Storage;
  - `signedPdfSha256` contra `signed.pdf`;
  - `eventsHeadHash` contra la cadena.
- Lo que el sistema no cubre: un actor con acceso total a la BD **y** a Storage **y** a la clave de sello podría rehacer todo. Para eso está el sello de tiempo RFC 3161 de un tercero (§10): fija la fecha del PDF sellado y no se puede rehacer después.

---

## 9. API

### 9.1 Pública

- Todos los endpoints públicos llevan:
  - `@Public()`;
  - `ThrottlerGuard`;
  - `Cache-Control: no-store`;
  - prefijo `/api/v1/public/signatures`.
- **Errores:**
  - token inválido: 404 "Enlace no válido";
  - vencido: 410;
  - revocado: 410 con `reason: "revoked"`;
  - ya firmado o rechazado: 409 con el estado final;
  - bloqueado: 423;
  - sesión ausente o vencida: 401 "Verifica tu correo nuevamente".

| Método | Ruta | Cabeceras | Cuerpo | Respuesta |
|---|---|---|---|---|
| GET | `/request` | token | — | `{ orgName, documentLabel, title, maskedEmail, expiresAt, status, requiresOtp: true }`, **sin contenido del documento** |
| POST | `/otp/send` | token | — | `{ sent, maskedEmail, resendInSeconds }` |
| POST | `/otp/verify` | token | `{ code: /^\d{6}$/ }` | `{ sessionToken, sessionExpiresAt }` |
| GET | `/document` | token + sesión | — | `{ title, documentLabel, orgName, signerName, signerRole, expiresAt, documentSha256, pdfUrl (10 min), consentVersion, consentText, privacyNotice, form }` |
| POST | `/attachments` | token + sesión | multipart `file` | `{ id, originalName, sizeBytes, status: "accepted" }` o 422 con el motivo (§12). **Solo confirmaciones** |
| DELETE | `/attachments/:id` | token + sesión | — | `{ removed: true }` (solo antes de firmar) |
| POST | `/sign` | token + sesión | `{ signedName, signedRole?, consent: true, response? }` | `{ status: "SIGNED", verificationCode, sealing: true }` |
| POST | `/decline` | token + sesión | `{ reason (5–1000) }` | `{ status: "DECLINED" }` |
| GET | `/signed` | token + sesión | — | `{ pdfUrl (10 min) }` si está sellado, o `{ sealing: true }`. Tras firmar, el enlace sigue valiendo **solo para esto** hasta `signedAt` + 30 días, aunque ya haya pasado `expiresAt`, y se vuelve a pedir el código de verificación para descargar |
| GET | `/verify/:code` | — | — | `{ valid, documentLabel, title, orgName, signedAt, signedName, signedPdfSha256, sealedAt, sealFingerprint }`, o 404 si no existe; si la solicitud fue revocada después, `valid: false` |

`form` en `/document` describe los campos que pide cada tipo (§11). Lo construye el servidor: la página no decide reglas.

**Reglas de construcción de respuestas públicas** (en un archivo `public-views.ts`, con prueba que valida las claves exactas):
- Prohibido incluir: `id` interno, `organizationId`, `auditId`, `targetId`, `createdById`, correos o nombres del equipo, `tokenHash`, rutas de Storage y URLs canónicas `.../object/public/...`.
- Los PDF se entregan con `createSignedUrl(path, 600)` (ruta desnuda: el `StorageUrlInterceptor` no la toca).

### 9.2 Interna

Con sesión; todo filtrado por `organizationId`. El documento de origen se valida con `assertInOrg`. En auditorías en modo investigación aplica el criterio de equipo de `AuditInvestigationAccessService`.

| Método | Ruta | Rol | Qué hace |
|---|---|---|---|
| POST | `/signature-requests` | carta: AUDIT_MANAGER · confirmación y acta: AUDITOR | Crea, congela el PDF, envía el correo y revoca la anterior. Responde `{ request, signUrl (una sola vez), emailSent }` |
| GET | `/signature-requests?documentType&targetId` | AUDITOR | Lista con eventos y adjuntos (metadatos) |
| GET | `/signature-requests/:id` | AUDITOR | Detalle |
| POST | `/signature-requests/:id/resend` | igual que crear | Rota el token, nuevo vencimiento opcional, correo. Responde `signUrl` una vez |
| POST | `/signature-requests/:id/revoke` | igual que crear | `{ reason (5–500) }` |
| POST | `/signature-requests/:id/reseal` | AUDITOR | Reintenta el sellado (`PENDING`/`FAILED`) |
| GET | `/signature-requests/:id/file/:kind` | AUDITOR (`quarantine`: AUDIT_MANAGER) | `kind = original \| signed \| attachment:<attId> \| quarantine:<attId>`. Enlace de 10 min. La cuarentena devuelve además `warning` |
| GET | `/signature-requests/:id/integrity` | AUDIT_MANAGER | §8 |

**DTO de creación:** `{ documentType, targetId, signerName (2–120), signerEmail (@IsEmail, ≤ 254), signerRole? (≤ 120), expiresInDays? (1–60), reminderEnabled?, payload? }`. Lo que va en `payload` está en §11.

**Reenviar** solo está permitido en `PENDING`, `VIEWED` o `EXPIRED`. Reenviar algo `EXPIRED` vuelve a `PENDING` con un vencimiento nuevo.

---

## 10. Documento, evidencia y sello

1. **Congelar al enviar:**
   - render con `PdfService.generateBranded` y la plantilla del tipo (§11), con todo texto escapado;
   - `sanitizePdf` sobre el resultado (defensa en profundidad);
   - SHA-256 y número de páginas;
   - subir `original.pdf` con `upsert: false`.
   - Si algo falla, **no se crea la solicitud**: 503 "No se pudo preparar el documento. Inténtalo de nuevo."
2. **Al firmar:**
   - **antes** de abrir la transacción, para no retener la BD durante una descarga, se descarga `original.pdf` y su SHA-256 debe ser igual a `documentSha256`. Si no coincide: 409 "El documento no pudo verificarse; el equipo auditor fue notificado", evento `INTEGRITY_FAILED` y correo al creador. El archivo es inmutable (`upsert: false`), así que la ventana entre verificar y firmar no cambia nada;
   - dentro de la transacción interactiva (`timeout: 30000`, lección #32 de `fixes_and_lessons.md`): estado `SIGNED`, efecto en el documento de origen (§11), evento `SIGNED` con IP y navegador;
   - `verificationCode` nuevo, `sealStatus = PENDING`.
3. **Sellar** (cron cada 10 min y justo después de firmar, sin bloquear la respuesta):
   - **Hoja de evidencia** (Puppeteer, 1–2 páginas, todo escapado):
     - título, organización y tipo de documento;
     - código de verificación y URL `/verificar`;
     - SHA-256 del original;
     - firmante: nombre y cargo escritos, correo verificado con la hora del código;
     - IP, navegador, fecha y hora de firma en UTC y en hora de El Salvador (UTC−6);
     - versión y texto literal del consentimiento;
     - respuesta (§11);
     - adjuntos con nombre, tamaño, SHA-256 original y reconstruido, y resultado del antivirus;
     - bitácora (tipo, fecha, IP);
     - cabeza de la cadena (`eventsHeadHash`);
     - leyenda: "Firma electrónica simple registrada por AuditMind y sellada por {Organización}."
   - `mergePdfs([original, evidencia])`.
   - `signPdf` con el **sello de la organización**: `name = "{Organización} · Sello de evidencia"`, `reason = "Constancia de firma electrónica simple"`, `location = "AuditMind"`, firma visible en la **última página** (la hoja de evidencia).
   - `timestampPdf` probando en orden las autoridades de `SIGNATURE_TSA_URLS` (por defecto `http://timestamp.digicert.com,http://timestamp.sectigo.com`); se guarda `tsaUrlUsed`.
   - Subir `signed.pdf` y calcular `signedPdfSha256`; `eventsHeadHash`, `sealedAt`, `sealStatus = SEALED`, evento `SEALED`.
   - Efecto posterior al sellado en el documento de origen (§11).
   - **Fallos:** `sealAttempts + 1` y evento `SEAL_FAILED` con el motivo. Con 5 intentos pasa a `FAILED`, se avisa por correo al creador y el panel ofrece "Reintentar sellado".
   - **Si ambas autoridades fallan:** se guarda el PDF sellado sin sello de tiempo, `tsaUrlUsed = null`, y se reintenta solo el sello de tiempo en el siguiente ciclo, hasta 5 intentos. La hoja de evidencia ya trae la hora del servidor.
4. **Sello de la organización:**
   - generalizar `SigningIdentityService.generateSelfSignedIdentity` para crear la identidad de la organización la primera vez: `CN = "{Organización} — Sello de evidencia (AuditMind)"`, `O = {Organización}`, RSA-2048, 10 años, `keyUsage: digitalSignature, nonRepudiation`;
   - se guarda en `Organization.sealCertPem` y `sealKeyEncrypted` (AES-256-GCM con `ENCRYPTION_KEY`, igual que los usuarios);
   - su huella SHA-256 se muestra en `/verificar` y en "Mi organización".
5. **Verificación pública** (`/verificar`):
   - el visitante escribe el código y ve los datos de §9.1;
   - puede arrastrar el PDF para que **el navegador** calcule su SHA-256 (Web Crypto) y lo compare con `signedPdfSha256`. **El archivo nunca se sube.**

---

## 11. Cada documento

### 11.1 Carta de compromiso

- **Origen:** `EngagementLetter`. Rol para enviar: AUDIT_MANAGER o superior.
- **Firmante por defecto:** `Client.contactName` / `Client.contactEmail`, editables en el modal.
- **Requisito:** la carta debe estar en `DRAFT` o `SENT` y no estar `SIGNED` ni `DECLINED`.
- **PDF:**
  - texto de `content` con saltos de línea respetados y escapado;
  - bloque "Por el despacho": nombre y cargo de quien envía, con la fecha;
  - bloque "Aceptación del cliente", que se llena con lo firmado en la hoja de evidencia.
- **Al enviar:** carta → `SENT` y evento `CREATED` con el remitente como "aprobado por el despacho".
- **Al firmar:** la misma transición que la firma manual.
  - Extraer de `sign()` un `markSigned(letterId, { name, role, at }, tx)` compartido.
  - `SIGNED`, `signedAt`, `signedByClientName` y `signedByClientRole` = lo que escribió el firmante; `Client` → `ACTIVE`.
- **Al sellar:** `fileUrl` = URL canónica de `signed.pdf` (el interceptor la firma al mostrarla).
- **Al rechazar:** carta → `DECLINED`. Se le agrega a la carta el campo `declineReason String?` (SQL aditivo).
- **Si cambia el origen:** `PATCH` del contenido con una solicitud activa revoca la solicitud ("el documento cambió"), devuelve la carta a `DRAFT` y registra el evento `TARGET_UPDATED`. La UI avisa antes de guardar.
- **La firma manual se conserva** como respaldo para cartas firmadas en papel.

### 11.2 Confirmación externa (NIA 505)

- **Origen:** `ExternalConfirmation` (la organización se valida vía `audit`). Rol: AUDITOR.
- **Firmante:** `respondentName` / `respondentEmail`.
- **`payload`:**
  - `mode`: `POSITIVE_WITH_AMOUNT` (muestra el saldo) o `POSITIVE_BLANK` (el tercero escribe el saldo);
  - `asOfDate`: fecha de corte;
  - `currency`;
  - `authorizationPath?`: carta de autorización del cliente subida por el auditor. Pasa por la misma cadena de §12 y se **une** al PDF congelado; los bancos suelen exigirla;
  - `recipientVerified: true`: obligatorio. Casilla "Verifiqué de forma independiente que el correo del confirmante es correcto", porque NIA 505 pide que el auditor controle que la solicitud esté bien dirigida.
- **PDF:**
  - membrete de la organización;
  - entidad auditada, tipo de confirmación, cuenta o referencia, fecha de corte, saldo (solo en `POSITIVE_WITH_AMOUNT`);
  - instrucción de responder **directamente al auditor**;
  - la carta de autorización anexa.
- **Formulario del firmante:**
  - `agrees: boolean`;
  - `confirmedAmount: number ≥ 0` (obligatorio si `!agrees` o `POSITIVE_BLANK`);
  - `comments ≤ 4000`;
  - adjuntos opcionales (§12);
  - `signedRole` obligatorio.
- **Al enviar:** `SENT`, `sentAt`, `sentBy`.
- **Al firmar:** extraer de `receiveResponse()` un `applyResponse(confirmationId, { responseContent, responseAmount }, tx)` compartido.
  - `responseContent` = "Respuesta electrónica firmada por {nombre} ({cargo}) el {fecha}: {De acuerdo | En desacuerdo}. Comentarios: …";
  - `responseAmount` = el saldo enviado si está de acuerdo en `POSITIVE_WITH_AMOUNT`; en los demás casos, `confirmedAmount`;
  - `difference` y `RECEIVED` como hoy.
- **Al rechazar:** la confirmación queda `SENT`, con evento y motivo visibles. El auditor decide si pasa a `NO_RESPONSE` o `ALT_PROCEDURE`.
- **Si cambia el origen:** editar el monto, la cuenta, el tipo o el correo/nombre del confirmante con una solicitud activa revoca la solicitud.
- **Recordatorio:** 3 días antes del vencimiento, una sola vez, si sigue sin respuesta.
- **El registro manual de la respuesta se conserva** para confirmaciones que llegan por otros medios.

### 11.3 Acta de entrevista externa

- **Origen:** `WorkingPaper` del encargo. Rol: AUDITOR. El botón aparece en `PT-ENTREV`, en los papeles de tipo `INTERVIEW` y en los `B-INT-*`.
- **Modo investigación:** solo el equipo del encargo, CAE, ADMIN o SUPER_ADMIN, con el mismo criterio que `AuditInvestigationAccessService`.
- **`payload`**, redactado por el auditor en el modal e inmutable una vez enviado:
  - `intervieweeName`, `intervieweeRole`;
  - `interviewDate`;
  - `modality`: `PRESENCIAL`, `VIRTUAL` o `TELEFONICA`;
  - `location?`;
  - `interviewers` (≤ 500);
  - `content` (texto del acta, 50–50 000);
  - `confidentialityNote?`.
- **PDF:** acta con encabezado, datos de la sesión, texto y espacio de conformidad.
- **Formulario del firmante:** `conforme: boolean`; `observations ≤ 4000`, obligatorio si `!conforme`.
- **Al sellar:** `signed.pdf` se agrega como adjunto de la sección `S2` del papel. Se hace un `push` al JSON `PaperSection.attachments` con `{ id, filename, url canónica, mimeType: "application/pdf", size, uploadedAt, source: "firma-externa", signatureRequestId }`. Si el papel no tiene `S2`, se omite; el acta queda igual en el panel del papel.
- **Firma presencial:**
  - el botón "Abrir para firma presencial" **rota el token** y abre `/firmar#<token>` en una pestaña nueva del dispositivo del auditor;
  - el código de verificación igual va al correo de la persona entrevistada, que lo lee en su teléfono.
- **Aviso en modo investigación:** "Enviar el acta por correo puede alertar a la persona investigada. Considera la firma presencial."
- **Si cambia el origen:** el acta vive en la solicitud. Para corregirla se revoca y se crea otra.

---

## 12. Adjuntos del tercero (solo confirmaciones)

**Límites:**
- 5 archivos por solicitud, 10 MB cada uno, 30 MB en total;
- tipos permitidos **solo por firma de bytes**, ignorando la extensión y el `Content-Type`:
  - PDF: `%PDF-`;
  - JPEG: `FF D8 FF`;
  - PNG: `89 50 4E 47 0D 0A 1A 0A`.

**Cadena** (todo antes de responder; si algún paso falla, el archivo se descarta):

1. Multer en memoria con `limits.fileSize = 10 MB` y `files = 1` por petición.
2. Detección por bytes. Si no coincide: 422 "Tipo de archivo no permitido. Sube PDF, JPG o PNG."
3. SHA-256 del original y subida a `.../quarantine/<attId>.<ext>` (nunca se sirve al firmante).
4. **ClamAV** por `INSTREAM` (TCP `127.0.0.1:3310`, tiempo límite 30 s):
   - `FOUND`: `INFECTED`, el archivo se borra de cuarentena, evento `ATTACHMENT_REJECTED` con la firma del malware y 422 "El archivo fue rechazado por el antivirus.";
   - si ClamAV no responde: `ERROR` y 503 "No se pudo verificar el archivo. Inténtalo más tarde." **Falla cerrado.**
5. **CDR (reconstrucción):**
   - PDF: `sanitizePdf` con quitar JavaScript, archivos incrustados, metadatos XMP y enlaces;
   - JPG/PNG: conversión imagen→PDF de Stirling (`/api/v1/convert/img/pdf`). **Antes de escribir el método, probarlo con curl contra Stirling en el VPS con los valores exactos** (lección del NPE de `watermark`: mandar siempre todos los campos).
6. Se guarda el reconstruido en `.../attachments/<attId>.pdf` con su SHA-256: `CLEAN`, evento `ATTACHMENT_ACCEPTED`.
7. Al firmar, los adjuntos pasan a `submitted = true` y quedan listados en la hoja de evidencia. Al vencer, revocar o rechazar, los no enviados se purgan de Storage.

**Lo que ve el equipo:**
- el reconstruido, por defecto;
- el original en cuarentena solo lo descarga AUDIT_MANAGER o superior, con la advertencia "Archivo original sin reconstruir: ábrelo solo si lo necesitas como evidencia."

**Infraestructura nueva:** `infrastructure/clamav/docker-compose.yml`:
- imagen oficial `clamav/clamav:stable`;
- puerto **solo** `127.0.0.1:3310:3310`;
- volumen para las firmas de virus; `freshclam` actualiza solo;
- se gestiona aparte de `deploy.sh`, igual que Stirling.

Prueba obligatoria al instalarlo: la cadena de prueba EICAR debe salir `FOUND`.

---

## 13. Correos

Todas las plantillas van con `escHtml`. `replyTo` = correo del creador de la solicitud. El remitente sigue siendo `notificaciones@auditoria.ianovatechsystems.com`.

| Plantilla | Para | Cuándo | Contenido clave |
|---|---|---|---|
| `sendSignatureRequest` | firmante | crear y reenviar | Organización, documento, título, quién lo envía, fecha límite, botón "Revisar y firmar" (`/firmar#token`), aviso de que se pedirá un código |
| `sendSignatureOtp` | firmante | `otp/send` | Código grande en el cuerpo (nunca en el asunto), vigencia de 10 min, "si no lo pediste, ignora este correo" |
| `sendSignatureReminder` | firmante | 3 días antes del vencimiento, una sola vez, si sigue `PENDING`/`VIEWED` y `reminderEnabled` | Igual que la solicitud, con **el mismo enlace** (se descifra `tokenEncrypted`; no se rota, así el correo original sigue sirviendo) |
| `sendSignatureCompleted` | firmante | al sellar | "Tu firma quedó registrada", código de verificación, y que puede descargar la copia en el mismo enlace durante 30 días |
| `sendSignatureOutcome` | creador | al firmar o rechazar | Resultado y enlace al documento en AuditMind |
| `sendSealFailed` | creador | `sealStatus = FAILED` | Aviso con enlace al panel |

**Recomendación de DNS (la hace el usuario, no bloquea):**
- hoy `_dmarc.ianovatechsystems.com` tiene `p=none` (solo monitoreo);
- agregar un buzón de reportes (`rua=mailto:...`) y, tras 1–2 semanas sin problemas, pasar a `p=quarantine`;
- así nadie puede suplantar nuestro dominio para enviar solicitudes de firma falsas.

---

## 14. Páginas web

**Pública `/firmar`** (`apps/web/src/app/firmar/layout.tsx` y `page.tsx`, sin sidebar, como `/portal`):

- **Pasos:**
  1. Encabezado con la organización y el documento.
  2. "Te enviaremos un código a j•••@g•••.com", con el botón "Enviar código".
  3. Campo del código, con reenvío y contador.
  4. Visor del PDF (`<iframe>` del enlace de 10 min, con botón "Descargar" para móviles), más la huella SHA-256 visible.
  5. Formulario según `form` del servidor: nombre, cargo, respuesta y adjuntos en confirmaciones.
  6. Consentimiento con el texto literal y una casilla obligatoria, y el aviso de privacidad.
  7. "Firmar" y "No firmar" (pide el motivo).
- **Estados finales:**
  - firmado: código de verificación y "Descargar copia firmada" cuando esté sellada;
  - rechazado, vencido, revocado o bloqueado.
- **Reglas de la página:**
  - token solo del fragmento, `history.replaceState` inmediato, tokens solo en memoria;
  - si la sesión vence (401), se vuelve al paso 2 sin perder lo escrito en el formulario;
  - legible en móvil, accesible por teclado, con estados de carga y error claros.
- **Cabeceras** (`next.config` → `headers()` para `/firmar/:path*` y `/verificar/:path*`):
  - `X-Frame-Options: DENY`;
  - `Content-Security-Policy: frame-ancestors 'none'; frame-src 'self' https://<proyecto>.supabase.co; object-src 'none'; base-uri 'self'; form-action 'self'`;
  - `Referrer-Policy: no-referrer`;
  - `X-Robots-Tag: noindex, nofollow`;
  - `Cache-Control: no-store`.
  - Metadata `robots: { index: false }`.

**Pública `/verificar`:** campo del código, resultado y comparación del PDF en el navegador (Web Crypto), con las mismas cabeceras.

**Interna** (`apps/web/src/components/signatures/`, hook `useSignatureRequests`):
- **`SendForSignatureModal`:**
  - firmante, correo, cargo, fecha límite y recordatorio;
  - campos del tipo: acta completa, modo de la confirmación, carta de autorización y casilla de verificación del destinatario;
  - al terminar muestra **una sola vez** el enlace con "Copiar" y el aviso "No se volverá a mostrar."
- **`SignatureRequestsPanel`:**
  - estado con chip de color;
  - acciones: reenviar, revocar (pide motivo), firma presencial (actas), reintentar sellado;
  - documento original y firmado, adjuntos (reconstruido y, para gerentes, original);
  - bitácora y botón "Verificar integridad" (gerentes).
- **Integraciones:**
  - `components/portfolio/EngagementLetterTab.tsx`: "Enviar para firma", más "Registrar firma manual" como respaldo;
  - `app/dashboard/confirmations/[id]/page.tsx`: "Enviar por correo para firma", más el registro manual como respaldo;
  - papel `PT-ENTREV` / `INTERVIEW` / `B-INT-*`: panel "Actas para firma".
- **Ayuda contextual** (`contextualHelpContent.ts`): qué es la firma simple, qué evidencia guarda, cómo se verifica y en qué se diferencia de la certificada.

---

## 15. Textos legales (constantes versionadas)

Están en `apps/api/src/signatures/legal-texts.ts`. Cada firma guarda la versión **y** el texto literal mostrado. Revisión legal recomendada, no bloqueante.

**`CONSENT_TEXT` v1:**

> Declaro que los datos de identificación que ingresé son verdaderos, que leí el documento «{título}» y que lo firmo electrónicamente por mi propia voluntad. Acepto que esta firma electrónica simple, junto con el registro de la fecha y hora, la dirección IP, el navegador utilizado, la verificación de mi correo electrónico y la huella digital (SHA-256) del documento, sirva como constancia de mi firma.

**`PRIVACY_NOTICE` v1:**

> {Organización} utiliza AuditMind para gestionar esta firma. Para dejar constancia se registran tu nombre, cargo, correo electrónico, dirección IP, navegador, fecha y hora, y los archivos que adjuntes. Estos datos se conservan junto con el documento como evidencia del trabajo de auditoría, durante el plazo de conservación de {Organización}, y solo los consulta su equipo, conforme a la legislación aplicable de protección de datos personales.

**`DECLINE_NOTICE` v1:**

> Al no firmar, se informará a {Organización} tu decisión y el motivo que escribas.

---

## 16. Registro, privacidad y retención

- **Nunca se registran** tokens, códigos ni sesiones en logs:
  - el fragmento ya evita nginx;
  - en la API, ningún `logger` imprime cabeceras ni cuerpos de los endpoints públicos;
  - el `ExceptionsHandler` no imprime cabeceras.
- **IP y navegador** se guardan en la solicitud, en el evento y en la hoja de evidencia. El navegador se trunca a 500 caracteres.
- **Retención:** las solicitudes firmadas o rechazadas se conservan con el encargo (mismo ciclo que el papel de trabajo y su `retentionUntil`). Lo vencido o revocado se conserva como bitácora. Purgas:
  - las sesiones vencidas, cada día;
  - los adjuntos no enviados, al cerrarse la solicitud;
  - los códigos (`otpHash`) se borran al verificarse o vencer.

---

## 17. Configuración y despliegue

**Variables nuevas** (en `ecosystem.config.cjs` → `auditmind-api`), todas con valor por defecto y sin secretos nuevos:
- `SIGNATURE_TSA_URLS` = `http://timestamp.digicert.com,http://timestamp.sectigo.com`
- `CLAMAV_HOST` = `127.0.0.1`, `CLAMAV_PORT` = `3310`
- `APP_URL`, que ya existe y se usa para los enlaces.
- `ENCRYPTION_KEY` ya existe (sello de organización y HMAC de los códigos). **Verificar en F1 que esté definida en producción; si falta, detener y consultar.**

**Orden de puesta en producción** (cada fase con la aprobación del usuario):
1. SQL de la migración (aditivo) y su verificación.
2. Contenedor ClamAV con la prueba EICAR.
3. Despliegue del código.
4. Prueba de punta a punta.

**Interruptor:** `SIGNATURES_PUBLIC_ENABLED` (`true` por defecto tras F5). Con `false`, los endpoints públicos responden 503 "Firma por enlace en mantenimiento"; sirve para apagar la superficie pública sin desplegar.

---

## 18. Pruebas

**Unitarias (Jest, en `apps/api`; hoy no hay ninguna, así que se configura el runner en F5):**
- token: generación de 43 caracteres base64url, hash y búsqueda;
- fragmento: la página nunca envía el token en la ruta;
- código de verificación: HMAC, 5 fallos invalidan el código, 10 fallos bloquean una hora, 60 s entre envíos, 5 por hora;
- máquina de estados: todas las transiciones válidas e inválidas;
- **carrera:** dos firmas simultáneas (`Promise.all`), una sola gana y la otra recibe 409;
- vencimiento: 410; revocación al cambiar el documento de origen (los tres tipos);
- bitácora: construcción y verificación de la cadena; un evento alterado rompe la verificación;
- respuestas públicas: claves exactas permitidas (prueba de "no contiene `id`, `organizationId`, rutas ni URLs canónicas");
- detección de tipo por bytes, incluido un PDF renombrado `.png` y un ejecutable renombrado `.pdf`;
- cliente ClamAV con un servidor falso (OK, FOUND, sin respuesta);
- textos: el consentimiento guardado es el literal mostrado.

**De punta a punta en producción**, con aprobación del usuario: él recibe los correos en su propia cuenta y se conservan como datos de prueba. Un documento de cada tipo:
- enlace con fragmento, código, visor, firma y sellado;
- `/verificar` con el código y comparación del PDF;
- integridad `ok`;
- adjunto limpio aceptado, EICAR rechazado y PDF con JavaScript reconstruido sin él;
- 429 al superar límites;
- enlace reenviado inválido tras reenviar;
- sesión vencida que pide código otra vez.

**Revisión de seguridad final** (Opus, una pasada sobre el diff completo) antes de activar el interruptor público.

---

## 19. Fases de implementación

| Fase | Contenido | Modelo |
|---|---|---|
| F1a · Infraestructura y bases | SQL + `schema.prisma`; `trust proxy`; throttler; ClamAV (contenedor, cliente `INSTREAM`, EICAR); método imagen→PDF de Stirling (probado antes con curl); sello de organización; utilidades de token, sesión, código HMAC y bitácora encadenada; `legal-texts.ts`; plantillas de correo | **Sonnet** |
| F1b · Servicio y API | `SignatureRequestsService` (crear, reenviar, revocar, código, sesión, firmar, rechazar, adjuntos), controlador público y controlador interno, `public-views.ts`, pipeline de congelado, evidencia, fusión, sello y sello de tiempo con respaldo, crons (sellado cada 10 min, vencimiento cada hora, recordatorio cada hora, purgas diarias), tope de correos, interruptor, respaldo de encargos | **Sonnet** |
| F1c · Páginas públicas | `/firmar` y `/verificar`, cabeceras de seguridad | **Sonnet** |
| F1d · UI interna genérica | Modal, panel, enlace de una vez, integridad, hook | **Sonnet** |
| F1e · Endurecer el portal PBC | Token con hash, enlace con fragmento + cabecera, throttler. Hoy hay 0 solicitudes PBC: la migración no afecta a nadie | **Sonnet** |
| F2 · Carta de compromiso | §11.1 | **Sonnet** |
| F3 · Confirmaciones | §11.2 y §12 (adjuntos y carta de autorización) | **Sonnet** |
| F4 · Actas de entrevista | §11.3 | **Sonnet** |
| F5 · Pruebas | §18 (runner de Jest, unitarias, punta a punta) | **Sonnet** |
| F5b · Revisión de seguridad | Pasada completa sobre el diff antes de activar el interruptor | **Opus** |
| F6 · Ayuda y documentación | Ayuda contextual, notas en memoria del proyecto | **Haiku** |

Cada fase se compila (`tsc` de API y web) antes de commitear y se despliega aparte, con aprobación del usuario.

---

## 20. Camino a la firma certificada (fase futura)

- El firmante (o la organización) usaría un certificado emitido por un Prestador de Servicios de Certificación acreditado ante la Unidad de Firma Electrónica del MINEC (https://firmaelectronica.economia.gob.sv/).
- Técnicamente cambia solo el paso de `signPdf`, porque Stirling acepta PEM y PKCS#12. La bitácora, la evidencia, el sello de tiempo y la verificación de este diseño se reutilizan sin cambios.
- Requiere un acuerdo con el prestador; es una gestión aparte del código.

---

## 21. Acciones del usuario

**No bloquean la implementación:**
- **DMARC** (§13): agregar `rua` y luego `p=quarantine`.
- **Revisión legal** de §15 (opcional).
- **Aprobar cada despliegue** y la prueba de punta a punta con su correo.
