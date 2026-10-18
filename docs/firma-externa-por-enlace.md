# Firma electrónica simple por enlace externo

Diseño aprobado para implementar (2026-10-18). Diseñado con **Opus**; cada fase indica con qué modelo ejecutarla.

## Objetivo

Que un tercero sin cuenta en AuditMind lea y firme un documento desde un enlace enviado a su correo. Aplica a tres documentos:

| Documento | Quién firma | Qué se registra al firmar |
|---|---|---|
| Carta de compromiso (NIA 210) | Representante del cliente | Aceptación de la carta |
| Confirmación externa (NIA 505) | Banco, proveedor, abogado, etc. | De acuerdo / en desacuerdo con el saldo, monto que confirma, comentarios |
| Acta de entrevista externa | La persona entrevistada | Conforme / con observaciones |

**Alcance:** firma electrónica *simple* con evidencia. La firma *certificada* (certificado de un Prestador de Servicios de Certificación acreditado ante la UFE del MINEC, Ley de Firma Electrónica) queda para una fase posterior. El mecanismo de sellado de este diseño la admite cambiando solo el origen del certificado.

## Estado actual (2026-10-18)

- **Carta:** `EngagementLetter.content` es texto plano. La "firma" la teclea el auditor (`engagement-letters.service.ts` → `sign()`, que además pasa el `Client` a `ACTIVE`). No hay PDF ni envío. Los estados `SENT` y `DECLINED` existen en el enum pero nunca se escriben.
- **Confirmación:** el auditor teclea la respuesta (`confirmations.service.ts` → `receiveResponse()`). `send()` solo cambia el estado. Hay una plantilla de correo (`EmailService.sendConfirmationRequest`) que nadie usa. El modelo no tiene `organizationId`; se llega a la organización por `audit`.
- **Entrevista:** `PT-ENTREV` (`paper-catalogue.ts`, secciones en `paper-templates.ts`). El entrevistado es texto libre dentro de una MATRIX. No existe la figura de entrevistado externo.
- **Patrón a replicar:** portal PBC. Tiene token, vencimiento, respuesta recortada y página pública `/portal/[token]`.
- **Faltantes transversales:**
  - la API no captura IP ni navegador, porque no tiene `trust proxy`, aunque nginx sí envía `X-Forwarded-For`;
  - no hay ningún límite de intentos en endpoints públicos;
  - el correo saliente se corrigió en `aca5753`: escapado de HTML y `/email/test` solo ADMIN.

## Decisiones de diseño (y por qué)

1. **Un solo modelo genérico `SignatureRequest`** para los tres documentos, no tokens por documento. Una sola superficie pública que endurecer, un solo pipeline de PDF y evidencia, y cada documento aporta su plantilla y su efecto al firmar.
2. **Token de 256 bits, guardado como hash.**
   - En la BD va solo el `SHA-256` del token (`tokenHash`, único). El token en claro viaja únicamente en el correo y en el enlace.
   - Si alguien lee la base, no puede firmar. Esto es más fuerte que el PBC, que guarda el token en claro.
   - "Reenviar" genera un token nuevo y el enlace anterior muere.
3. **Una sola solicitud activa por documento.** Crear una nueva revoca la pendiente (`REVOKED`).
4. **Documento congelado.**
   - Al enviar se genera el PDF, se guarda en Storage y se registra su `SHA-256`. El firmante ve exactamente ese archivo.
   - Al firmar se vuelve a calcular el hash del archivo guardado y debe coincidir.
   - Si el documento de origen cambia después de enviarlo, por ejemplo al editar la carta o el monto de la confirmación, la solicitud pendiente se revoca automáticamente y hay que reenviar.
5. **Evidencia de la firma**, guardada en BD y en una hoja de evidencia anexa al PDF:
   - nombre y cargo escritos por el firmante;
   - correo de destino;
   - texto de consentimiento literal, con su versión;
   - IP y navegador;
   - fecha y hora UTC del servidor;
   - hash del documento.
   - Además una **bitácora de eventos** (`SignatureEvent`): creada, enviada, vista, firmada, rechazada, revocada, reenviada, vencida, sellada.
6. **Sello de la organización, no del firmante ni del auditor.**
   - El PDF final es el documento original más la hoja de evidencia (fusión de Stirling), firmado con un certificado de la **organización** ("<Organización> · Sello de evidencia — AuditMind") y con sello de tiempo RFC 3161 (DigiCert).
   - Así la organización certifica "esto registró mi sistema" sin hacerse pasar por el firmante externo.
   - Se agregan `Organization.sealCertPem` y `sealKeyEncrypted`, generados como hoy hace `SigningIdentityService` con los usuarios.
7. **Sellado de mejor esfuerzo, con reintento.**
   - La firma queda registrada en BD aunque Stirling falle. `sealStatus` vale `PENDING`, `SEALED` o `FAILED`.
   - Un cron cada 15 minutos reintenta los `PENDING`, hasta 5 intentos, y después marca `FAILED`. El panel interno ofrece "Reintentar sellado".
8. **Vencimiento.**
   - Quien envía elige la fecha límite: por defecto 30 días para la carta y 15 para la confirmación y la entrevista; mínimo 1 día, máximo 60.
   - Un enlace vencido responde 410.
   - Un cron diario marca `EXPIRED`, para que los listados sean exactos.
9. **Límite de intentos solo en endpoints públicos.**
   - Se usa `@nestjs/throttler` v6 con guard por controlador: 60 GET y 10 POST por minuto por IP.
   - Se aplica también al portal PBC.
   - Requiere `app.set('trust proxy', 'loopback')` en `main.ts`. Sin eso, todas las peticiones parecen venir de 127.0.0.1 y el límite bloquearía a todos a la vez.
10. **Respuesta pública recortada.**
    - Solo incluye: título, tipo de documento, nombre de la organización, nombre esperado del firmante, estado, vencimiento, datos propios del tipo (p. ej. el monto a confirmar) y un enlace firmado de **10 minutos** al PDF.
    - No incluye IDs internos, correos del equipo, `organizationId` ni token.
    - Cabeceras: `Cache-Control: no-store`; la página pública lleva `Referrer-Policy: no-referrer` y `noindex`.
11. **Responder ≠ rechazar.**
    - Una confirmación "en desacuerdo" y un acta "con observaciones" son **firmas válidas** con respuesta.
    - "Rechazar firmar" es aparte (`DECLINED`, con motivo).

## Modelo de datos

Cambio aditivo. **Aplicar con SQL directo**, no con `prisma db push`: `db push` intenta borrar `rag_chunks`/`rag_documents`, tablas que Prisma no conoce (ver `fixes_and_lessons.md`). Después actualizar `schema.prisma` y correr `prisma generate`.

```prisma
enum SignatureDocumentType { ENGAGEMENT_LETTER EXTERNAL_CONFIRMATION INTERVIEW_RECORD }
enum SignatureRequestStatus { PENDING VIEWED SIGNED DECLINED REVOKED EXPIRED }
enum SignatureSealStatus { NOT_APPLICABLE PENDING SEALED FAILED }
enum SignatureEventType { CREATED SENT VIEWED SIGNED DECLINED REVOKED RESENT EXPIRED SEALED SEAL_FAILED }

model SignatureRequest {
  id              String                 @id @default(cuid())
  organizationId  String
  auditId         String?                // null en la carta (vive a nivel de cliente)
  documentType    SignatureDocumentType
  targetId        String                 // EngagementLetter.id | ExternalConfirmation.id | WorkingPaper.id
  title           String
  signerName      String                 // a quién se envía (esperado)
  signerEmail     String
  signerRole      String?
  payload         Json      @default("{}") // datos propios del tipo (acta, monto, showAmount…)
  tokenHash       String    @unique
  expiresAt       DateTime
  status          SignatureRequestStatus @default(PENDING)
  documentPath    String                 // ruta en el bucket del PDF congelado
  documentSha256  String
  consentVersion  String?
  consentText     String?
  signedName      String?
  signedRole      String?
  response        Json?                  // respuesta del firmante (confirmación / acta)
  declineReason   String?
  signedAt        DateTime?
  viewedAt        DateTime?
  signerIp        String?
  signerUserAgent String?
  sealStatus      SignatureSealStatus    @default(NOT_APPLICABLE)
  sealAttempts    Int       @default(0)
  signedPdfPath   String?
  signedPdfSha256 String?
  sentAt          DateTime?
  sendCount       Int       @default(0)
  createdById     String
  revokedAt       DateTime?
  revokedReason   String?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  organization Organization       @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  audit        Audit?             @relation(fields: [auditId], references: [id], onDelete: Cascade)
  createdBy    User               @relation(fields: [createdById], references: [id])
  events       SignatureEvent[]

  @@index([organizationId])
  @@index([documentType, targetId])
  @@index([status, expiresAt])
  @@index([sealStatus])
  @@map("signature_requests")
}

model SignatureEvent {
  id        String             @id @default(cuid())
  requestId String
  type      SignatureEventType
  at        DateTime           @default(now())
  ip        String?
  userAgent String?
  actorId   String?            // usuario interno; null si fue el firmante externo
  detail    Json?
  request   SignatureRequest   @relation(fields: [requestId], references: [id], onDelete: Cascade)
  @@index([requestId])
  @@map("signature_events")
}

// Organization: + sealCertPem String?  + sealKeyEncrypted String?
```

**SQL** en `infrastructure/db-migrations/2026-10-firma-externa.sql`, con su `.REVERSA.sql`:
- tipos, tablas, índices y columnas nuevas;
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` en las dos tablas nuevas. Es la regla de `project_security_audit`: toda tabla nueva va con RLS y sin grants a `anon`/`authenticated`. Los permisos por defecto ya los revocan; verificarlo igual.

**Respaldo de encargos:** agregar `signatureRequest` (vía `auditId`) y `signatureEvent` (vía `requestId`) a `AUDIT_SCOPED_MODELS` (`audits/backup/audit-backup.types.ts`). Las rutas de Storage llevan el `auditId`, así que el filtro de rutas propias del respaldo ya las acepta.

**Rutas en Storage** (bucket privado):
- `signature-requests/<auditId | org-<organizationId>>/<requestId>/original.pdf`
- `signature-requests/<auditId | org-<organizationId>>/<requestId>/signed.pdf`

## Flujo y máquina de estados

```
crear+enviar → PENDING ──abrir enlace──▶ VIEWED ──firmar──▶ SIGNED ──sellado──▶ (sealStatus SEALED)
                  │                        │
                  ├──rechazar──────────────┴──▶ DECLINED
                  ├──auditor revoca / documento cambió / nueva solicitud ──▶ REVOKED
                  └──pasa expiresAt ──▶ EXPIRED
reenviar (solo PENDING/VIEWED/EXPIRED): token nuevo, expiresAt nuevo, vuelve a PENDING, sendCount+1
```

- **Firmar es atómico e idempotente.** Dentro de una transacción:
  1. `updateMany({ where: { id, status: { in: [PENDING, VIEWED] }, expiresAt: { gt: now } }, data: { status: SIGNED, … } })`. Si actualiza 0 filas: 409 "ya fue firmada o venció".
  2. Efecto en el documento de origen, en la misma transacción.
  3. Evento `SIGNED`.
  4. `sealStatus = PENDING`.
- El sellado corre **después** de la transacción, sin bloquear la respuesta al firmante.

## Efecto de firmar en cada documento

| Documento | Al enviar | Al firmar | Al rechazar | Si el documento cambia |
|---|---|---|---|---|
| Carta | PDF desde `content` (`PdfService.generateBranded`); carta → `SENT` | carta → `SIGNED`; `signedAt`, `signedByClientName/Role` = lo que escribió el firmante; `Client` → `ACTIVE` (extraer de `sign()` un `markSigned()` compartido con la firma manual); `fileUrl` = URL canónica del `signed.pdf` cuando se selle | carta → `DECLINED` con motivo en el evento | `PATCH` del contenido con solicitud pendiente → revocar y volver la carta a `DRAFT` |
| Confirmación | PDF de solicitud NIA 505 (plantilla nueva: tipo, cuenta, saldo a la fecha; opción `showAmount=false` = confirmación "en blanco"); `sentAt/sentBy`, estado `SENT` | misma lógica de `receiveResponse()` (extraer a un método compartido): `responseContent`, `responseAmount`, diferencia, `RECEIVED`, `responseReceivedAt` | la confirmación queda `SENT`; el auditor decide si pasa a `NO_RESPONSE`/`ALT_PROCEDURE` | editar monto/cuenta/correo con solicitud pendiente → revocar |
| Acta de entrevista | el auditor redacta el acta en el modal (entrevistado, cargo, correo, fecha/hora, modalidad, lugar, texto); se guarda en `payload` y se genera el PDF | sin cambio en el papel durante la transacción; al **sellar**, el `signed.pdf` se agrega como adjunto de la sección `S2` del papel (`PaperSection.attachments`, con `signatureRequestId`) | queda registrado en el panel del papel | el acta vive en la solicitud: para cambiarla se revoca y se crea otra |

**Respuesta del firmante** (DTO validado con `class-validator`, límites de largo):
- Confirmación: `{ agrees: boolean, confirmedAmount?: number, comments?: string(≤4000) }`. Si `!agrees` o `showAmount=false`, `confirmedAmount` es obligatorio.
- Acta: `{ conforme: boolean, observations?: string(≤4000) }`. Si `!conforme`, `observations` es obligatorio.
- Todas: `signedName (2–120)`, `signedRole (≤120, obligatorio en carta y confirmación)` y `consent: true`. Si falta `consent`, 400.

**Texto de consentimiento** (`CONSENT_TEXT_V1`, constante versionada; el texto exacto se guarda en cada firma). Borrador para revisión legal:

> Declaro que soy la persona indicada, que leí el documento adjunto y que lo firmo electrónicamente. Acepto que esta firma electrónica simple, junto con el registro de fecha, hora, dirección IP y huella del documento, sirva como constancia de mi aceptación.

## API

**Interna** (con sesión, todo filtrado por `organizationId`; el documento de origen se valida con `assertInOrg`):

| Método | Ruta | Rol | Qué hace |
|---|---|---|---|
| POST | `/signature-requests` | carta: AUDIT_MANAGER · confirmación y acta: AUDITOR | `{ documentType, targetId, signerName, signerEmail, signerRole?, expiresInDays?, payload? }`: valida, genera y congela el PDF, crea la solicitud, envía el correo y revoca la anterior pendiente |
| GET | `/signature-requests?documentType&targetId` | AUDITOR | Lista con eventos |
| POST | `/signature-requests/:id/resend` | igual que crear | Token nuevo, vencimiento nuevo, correo |
| POST | `/signature-requests/:id/revoke` | igual que crear | `{ reason }` |
| POST | `/signature-requests/:id/reseal` | AUDITOR | Reintenta el sellado (`FAILED`/`PENDING`) |
| GET | `/signature-requests/:id/file/:kind` | AUDITOR | `kind = original \| signed`; enlace firmado de 10 min |

- En auditorías en **modo investigación**, crear/ver actas exige ser del equipo (mismo criterio que `AuditInvestigationAccessService`).
- Confirmación: antes de enviar, el modal exige marcar "Verifiqué que el correo del confirmante es correcto". NIA 505.7 pide que el auditor controle que la solicitud esté bien dirigida.

**Pública** (`@Public()`, `ThrottlerGuard`, `Cache-Control: no-store`; se busca por `tokenHash = sha256(token)`; vencido → 410; ya cerrado → 409):

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/public/signatures/:token` | Vista recortada y enlace del PDF de 10 min. Primera vez: `VIEWED` y evento con IP/UA |
| POST | `/public/signatures/:token/sign` | `{ signedName, signedRole?, consent, response? }` → firma atómica |
| POST | `/public/signatures/:token/decline` | `{ reason (5–1000) }` |
| GET | `/public/signatures/:token/signed` | Tras firmar: enlace de 10 min al `signed.pdf` cuando ya esté sellado (si no, `{ sealing: true }`) |

**IP:** `req.ip` con `trust proxy = 'loopback'` (nginx está en el mismo VPS). **Navegador:** `user-agent` truncado a 500 caracteres.

## Correo

- Nueva plantilla `EmailService.sendSignatureRequest(to, { orgName, documentLabel, title, senderName, deadline, signUrl })` con todo escapado. Se reutiliza `sendConfirmationRequest` para la confirmación.
- `replyTo` = correo del auditor que envía, para que las dudas no lleguen a una casilla sin dueño.
- Enlace: `${APP_URL}/firmar/<token>`.
- Si Resend falla, la solicitud se crea igual y la API devuelve `{ emailSent: false }`; el panel muestra "Copiar enlace" como respaldo.
- El enlace en claro solo se devuelve en esa respuesta de crear o reenviar, nunca después.

## Web

- **Pública** `apps/web/src/app/firmar/[token]/` (`layout.tsx` + `page.tsx`, mismo patrón que `/portal/[token]`; el middleware ya deja pasar todo lo que no es `/dashboard`):
  - encabezado con la organización, título y fecha límite;
  - visor del PDF (`<iframe>`, con botón "Descargar" de respaldo en móvil);
  - formulario según el tipo, campos de nombre y cargo, casilla de consentimiento con el texto literal, "Firmar" y "No firmar" (pide el motivo);
  - estados finales: firmado (con descarga cuando esté sellado), rechazado, vencido o revocado.
  - Metadata `robots: noindex`; cabecera `Referrer-Policy: no-referrer` (en `next.config` para `/firmar/:path*`).
- **Interna, genérica** (`apps/web/src/components/signatures/`):
  - `SendForSignatureModal`: firmante, correo, cargo, fecha límite y campos propios del tipo;
  - `SignatureRequestsPanel`: estado, reenviar, revocar, copiar enlace, original/firmado, bitácora y reintentar sellado;
  - hook `useSignatureRequests`.
- **Integraciones:**
  - `components/portfolio/EngagementLetterTab.tsx`: "Enviar para firma", con "Registrar firma manual" como respaldo para firmas en papel.
  - `app/dashboard/confirmations/[id]/page.tsx`: "Enviar por correo", con el registro manual de la respuesta como respaldo.
  - Papel `PT-ENTREV` y actas forenses B-INT: panel "Actas para firma".
- **Ayuda contextual** (`contextualHelpContent.ts`): qué es la firma simple, qué evidencia guarda y su límite frente a la firma certificada.

## Riesgos y cómo se cubren

| Riesgo | Mitigación |
|---|---|
| Alguien adivina o enumera enlaces | 256 bits, hash en BD, límite de intentos por IP |
| Alguien reenvía el correo y otra persona firma | Límite conocido de la firma simple: se registran IP, navegador y nombre escrito. Mejora posterior: código de un solo uso enviado al correo al momento de firmar |
| El documento se altera después de enviarlo | PDF congelado con hash, verificado al firmar; revocación automática si cambia el origen |
| Doble firma o firma tras vencimiento | `updateMany` condicional dentro de la transacción |
| Fuga de datos por la respuesta pública | Respuesta recortada, enlace al PDF de 10 min, `no-store`, `no-referrer` |
| Inyección en correos o PDF | Escapado (`escHtml` en correo, `esc` en plantillas PDF), DTO con límites |
| Stirling caído | La firma se registra igual; el sellado se reintenta con un cron |
| Interrupción del pipeline a mitad de camino | El PDF original queda guardado antes de crear la solicitud; si falla el correo, sigue disponible "Copiar enlace" |

## Fases de implementación

| Fase | Contenido | Modelo |
|---|---|---|
| F1 · Base común | SQL + `schema.prisma`, `SignatureRequestsService` (crear/reenviar/revocar/listar/firmar/rechazar), token con hash, controlador público con throttler, `trust proxy`, sello de la organización, pipeline PDF (congelar → hoja de evidencia → fusionar → sellar → sello de tiempo → guardar), crons (sellado y vencimiento), plantilla de correo, página `/firmar/[token]`, modal y panel genéricos, límite de intentos también en el portal PBC | **Sonnet** |
| F2 · Carta de compromiso | Plantilla PDF desde `content`, `markSigned()` compartido, estados `SENT`/`DECLINED`, revocación al editar, integración en `EngagementLetterTab` | **Sonnet** |
| F3 · Confirmaciones | Plantilla PDF NIA 505 (con y sin monto), respuesta del firmante → lógica compartida de `receiveResponse`, casilla de verificación de destinatario, integración en la página de confirmación | **Sonnet** |
| F4 · Acta de entrevista | Modal de redacción del acta, plantilla PDF, adjunto a `S2` al sellar, panel en `PT-ENTREV`/B-INT, regla de modo investigación | **Sonnet** |
| F5 · Pruebas | Pruebas unitarias: token y hash, máquina de estados, firma concurrente (dos firmas a la vez → una sola gana), vencimiento, revocación al cambiar el documento, respuesta pública sin campos internos. Prueba de punta a punta en producción enviándose a sí mismo un documento de cada tipo | **Sonnet** |
| F6 · Ayuda y documentación | Textos de ayuda contextual y nota en `project_pdf_tools_stirling.md` | **Haiku** |

Orden: F1 → F2 → F3 → F4 → F5 → F6. Cada fase se despliega aparte, con la aprobación del usuario.

## Decisiones que quedan para el usuario

1. Texto de consentimiento: aprobar el borrador o pasarlo por su abogado.
2. Código de un solo uso por correo al firmar: propuesto para después, no en esta versión.
3. Que el tercero pueda **adjuntar archivos** (p. ej. un estado de cuenta en la confirmación): fuera de esta versión, porque es una superficie de subida pública nueva. Puede responder por texto y el auditor adjunta el soporte.
4. Vencimientos por defecto: 30 días la carta, 15 la confirmación y la entrevista (máximo 60).

## Fuera de alcance

- Firma electrónica certificada (PSC acreditado ante la UFE): fase posterior.
- Firma de varios firmantes sobre el mismo documento.
- Confirmaciones bancarias vía plataformas especializadas (Confirmation.com u otras).
