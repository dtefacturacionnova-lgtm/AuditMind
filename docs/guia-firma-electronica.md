# Guía de uso: firma electrónica por enlace

Para consultar cuando haya que enviar un documento a firmar, seguir una solicitud o ayudar a un firmante. Tiene tres partes:

- **Parte A. Para el equipo del despacho:** cómo enviar, seguir, reenviar, revocar y verificar.
- **Parte B. Para el firmante:** una página corta que se puede copiar y mandar a quien tenga dudas.
- **Parte C. Para quien administra el sistema:** cómo se enciende y se apaga la función y qué revisar.

La especificación técnica completa está en [firma-externa-por-enlace.md](firma-externa-por-enlace.md). Esta guía describe lo que se ve y se hace en pantalla. Si la pantalla cambia, esta guía debe actualizarse con ella.

---

## Parte A. Para el equipo del despacho

### 1. Qué es y qué deja guardado

Una persona que no tiene cuenta en AuditMind recibe un correo, confirma su identidad con un código que llega a ese mismo correo, lee el documento y lo firma o decide no firmarlo.

Al firmar queda guardado:

- el nombre y el cargo que la persona escribió;
- la fecha y la hora, la dirección IP y el navegador;
- la hora en que se verificó el correo;
- el texto exacto de la declaración de consentimiento que aceptó;
- la huella digital (SHA-256) del documento que vio;
- su respuesta y, en confirmaciones, los archivos de soporte que adjuntó;
- una bitácora encadenada, donde cualquier cambio posterior se nota.

AuditMind produce un PDF final con una hoja de evidencia, sellado con el certificado de la organización y con sello de tiempo de un tercero (RFC 3161).

**Es una firma electrónica simple con evidencia. No es una firma certificada** (la que emite un Prestador de Servicios de Certificación acreditado). Si un caso exige firma certificada, esta función no la reemplaza.

### 2. Qué documentos se pueden enviar y quién puede hacerlo

| Documento | Quién firma | Quién puede enviarlo | Plazo recomendado | Dónde está el botón |
|---|---|---|---|---|
| Carta de compromiso (NIA 210) | El representante del cliente | Gerente de auditoría o un rol superior | 30 días | En la ficha del cliente, sección de la carta de compromiso: **Enviar para firma** |
| Confirmación externa (NIA 505) | El confirmante registrado (banco, proveedor, abogado, cliente del cliente) | Auditor o un rol superior | 15 días | En el detalle de la confirmación, panel **Firma electrónica**: **Enviar por correo para firma** |
| Acta de entrevista | La persona entrevistada | Auditor o un rol superior | 15 días | En el papel de entrevista (`PT-ENTREV`, papeles de tipo entrevista y `B-INT-*`), panel **Actas para firma**: **Enviar acta para firma** |

Reglas comunes:

- El plazo se puede cambiar al enviar, entre 1 y 60 días.
- Solo puede haber **una solicitud vigente por documento**. Enviar otra revoca la anterior y su enlace deja de funcionar.
- Si el botón no aparece y el panel dice «La firma electrónica por enlace todavía no está habilitada en este servidor», la función está apagada (ver la Parte C).
- Quien no tiene el rol necesario no ve el botón, y el servidor lo exige igual.

### 3. Enviar un documento a firma, paso a paso

1. Abre el documento y pulsa el botón de envío de la tabla anterior.
2. En la ventana **Enviar «…» a firma** completa:
   - **Nombre de quien firmará** (obligatorio) y **Cargo**.
   - **Correo del firmante** (obligatorio). Le llegará el enlace y, al abrirlo, un código de 6 dígitos para confirmar que es esa persona.
   - Los datos propios del documento (secciones 5, 6 y 7).
   - **Plazo para firmar**. La ventana muestra la fecha de vencimiento.
   - **Enviar un recordatorio 3 días antes de que venza, si todavía no firmó** (viene marcado).
3. Pulsa **Enviar a firma**. El documento se convierte en PDF en ese momento.

Si ya había una solicitud vigente, la ventana avisa: «Al enviar esta, la anterior se revoca y su enlace deja de funcionar».

#### Qué significa la ventana que aparece al terminar

Tiene tres posibles títulos:

| Título | Qué pasó |
|---|---|
| **Enviada a firma** | El correo salió. Dice a qué dirección. |
| **Solicitud creada, correo no enviado** | La solicitud existe, pero el correo no pudo salir. Copia el enlace y envíalo por otro medio. Revisa también que el correo esté bien escrito, porque el código de verificación llega a esa misma dirección. |
| **Lista para firma presencial** | Se pidió firma presencial: no se envió correo con el enlace (ver la sección 7). |

Dos avisos que conviene entender:

- **«No se volverá a mostrar»**. El enlace de firma aparece completo una sola vez, en esa ventana. AuditMind no lo guarda de forma que el equipo pueda volver a verlo. Si lo pierdes, usa **Reenviar**, que genera uno nuevo. Si cierras sin copiarlo y el correo no salió, la ventana te pide confirmar.
- **«El documento quedó congelado»**. El firmante verá exactamente el PDF que se generó al enviar. Si después cambias el documento en AuditMind, la solicitud se revoca y hay que enviarla otra vez. Así nunca se firma algo distinto de lo que se leyó.

### 4. Qué recibe el firmante

Un correo con el nombre de la organización, el documento, quién lo envía, la fecha límite y el botón **Revisar y firmar**. Al abrirlo, el firmante pide un código a su correo, lo escribe, lee el documento y firma. El detalle está en la Parte B.

El enlace es personal: sin el código que llega al correo del firmante, nadie puede ver el documento.

### 5. Carta de compromiso

- Debe estar en borrador o enviada. Una carta ya firmada o rechazada no se puede enviar.
- El firmante propuesto es el contacto del cliente. Se puede cambiar en la ventana.
- **Si el cliente firma:** la carta pasa a **Firmada** con el nombre y el cargo que escribió, y el cliente pasa a **Activo**. El PDF sellado queda como archivo de la carta.
- **Si el cliente no firma:** la carta pasa a **Rechazada** y se muestra el motivo.
- **Si cambias el texto de la carta** con una solicitud vigente, la solicitud se revoca y la carta vuelve a borrador. La pantalla avisa antes de guardar. Guardar sin cambiar el texto no revoca nada.
- **Registrar firma manual** sigue disponible para cartas firmadas en papel. Si el cliente llega tarde con el enlace después de una firma manual, recibe un enlace revocado.

### 6. Confirmación externa (NIA 505)

En el panel **Firma electrónica** del detalle de la confirmación. La ventana pide, además de los datos del firmante:

- **Tipo de confirmación:**
  - *Con saldo:* el confirmante ve el saldo y dice si está de acuerdo. No está disponible si la confirmación no tiene monto registrado.
  - *Con saldo en blanco:* el confirmante escribe el saldo según sus registros, sin ver el tuyo.
- **Fecha de corte** y **moneda** (código de 3 letras, por ejemplo USD).
- **Carta de autorización** del cliente (PDF, JPG o PNG), si el banco la exige. Se anexa al documento que ve el confirmante.
- La casilla de que **verificaste de forma independiente que el correo del confirmante es correcto**. NIA 505 pide que el auditor controle que la solicitud esté bien dirigida.

Reglas importantes:

- **Firma el confirmante registrado.** El correo del firmante debe ser el del confirmante de la confirmación. Para cambiar al destinatario, edita la confirmación mientras esté en borrador.
- **La respuesta del confirmante** incluye si está de acuerdo, el saldo según sus registros (obligatorio si no está de acuerdo o si el saldo iba en blanco), comentarios y archivos de soporte opcionales (hasta 5 archivos, 10 MB cada uno y 30 MB en total; PDF, JPG o PNG). Cada archivo pasa por un antivirus y se reconstruye antes de guardarse. «De acuerdo» con un saldo distinto del mostrado se rechaza.
- **Si firma:** la confirmación pasa a **Recibida** y la diferencia se calcula como siempre.
- **Si el confirmante decide no firmar:** la confirmación **sigue enviada**. El motivo queda visible y tú decides si pasa a «sin respuesta» o a procedimiento alternativo.
- **Revocar** desde el panel devuelve la confirmación a borrador.
- **Marcar como enviada** y el registro manual de la respuesta siguen disponibles para lo que llegue por otros medios.
- No se puede eliminar una confirmación que tenga solicitudes de firma, en ningún estado.

### 7. Acta de entrevista, firma presencial y modo investigación

En el papel de entrevista, panel **Actas para firma**. La ventana pide:

- **Fecha de la entrevista**, **Modalidad** (presencial, virtual o telefónica) y **Entrevistadores**.
- **Lugar o plataforma** (opcional).
- **Texto del acta** (entre 50 y 50 000 caracteres; se respetan los saltos de línea).
- **Nota de confidencialidad** (opcional; aparece resaltada antes del acta).

La persona entrevistada es quien firma, así que su nombre y cargo se piden una sola vez, arriba. Responde si está **conforme** con el acta o escribe **observaciones**, que son obligatorias si no está conforme.

- **El acta no se edita después de enviada.** Para corregirla, revoca la solicitud y envía otra.
- **Al sellar,** el PDF firmado se agrega como adjunto a la sección S2 del papel.
- **Si la persona no está conforme** o rechaza, el papel no cambia: el estado vive en el panel.

#### Firma presencial

Úsala cuando la persona está contigo y no conviene un correo con el enlace. En la ventana de envío marca **Firma presencial: no enviar el correo con el enlace**. El botón pasa a **Preparar firma presencial**.

- No sale correo con el enlace ni recordatorios.
- La ventana final dice **Lista para firma presencial** y muestra el enlace una sola vez.
- Lo mejor es que la persona abra el enlace **en su propio teléfono** (envíaselo por el medio que tengan a mano) o en una ventana privada. El enlace no se abre solo en el navegador de AuditMind para que la persona no vea tu sesión.
- **El código de verificación sí llega al correo de la persona entrevistada.** Así se confirma quién es. Lo lee en su teléfono.
- Para una solicitud ya enviada por correo, el botón **Firma presencial** de la solicitud renueva el enlace sin enviar nada.

#### Modo investigación

Si el encargo está en modo investigación, la ventana muestra: «Enviar el acta por correo puede alertar a la persona investigada. Considera la firma presencial». En ese modo solo accede el equipo del encargo (además de CAE, ADMIN y SUPER_ADMIN), tanto al enviar como al consultar o actuar sobre la solicitud.

### 8. Seguir una solicitud

El panel muestra cada solicitud con un estado. Se actualiza solo (cada 30 segundos mientras se espera al firmante y cada 8 mientras se sella el PDF).

| Estado | Significa | Se puede |
|---|---|---|
| **Pendiente** | Enviada; el firmante todavía no la abre. | Reenviar, revocar |
| **Abierta** | El firmante verificó su correo y ya vio el documento. | Reenviar, revocar |
| **Firmada** | El firmante la firmó. | Ver el PDF firmado, verificar integridad |
| **Rechazada** | El firmante decidió no firmar. El motivo se muestra. | Enviar una solicitud nueva |
| **Revocada** | Se canceló desde el despacho. El motivo se muestra. | Enviar una solicitud nueva |
| **Vencida** | Pasó la fecha límite sin firmarse. | Reenviar (da un plazo nuevo) |

Al abrir una solicitud se ve el correo, cuándo se envió (y cuántos envíos lleva), cuándo vence, cuándo la abrió el firmante, su respuesta y sus adjuntos.

Los botones **Documento enviado** y **PDF firmado** abren el archivo en otra pestaña. **Los enlaces a archivos duran 10 minutos**; se piden de nuevo al abrirlos.

### 9. Reenviar y revocar

**Reenviar** (solicitudes pendientes, abiertas o vencidas):

- Genera un enlace **nuevo**. El anterior deja de funcionar y el firmante tendrá que pedir otro código.
- Permite elegir un plazo nuevo.
- No funciona si el documento cambió desde el envío original, o si hay otra solicitud vigente del mismo documento. En ese caso envía una solicitud nueva.
- Es la salida cuando perdiste el enlace o el correo no llegó.

**Revocar** (solicitudes pendientes o abiertas):

- El enlace deja de funcionar al instante. Si el firmante lo abre, verá que fue cancelado.
- Pide un **motivo**, que queda en la bitácora.
- **No se puede deshacer.** Para volver a pedir la firma hay que enviar una solicitud nueva.

### 10. Después de la firma: sellado, bitácora e integridad

Cuando el firmante firma, el panel muestra el nombre, la fecha y el código de verificación, y empieza el sellado del PDF:

| Mensaje | Significa |
|---|---|
| **Sellando el PDF…** | Se está generando la hoja de evidencia y el sello. Suele tardar segundos o pocos minutos. |
| **Sellado, con sello de tiempo** | Terminado. |
| **Sellado (sello de tiempo pendiente)** | El PDF quedó sellado por la organización, pero las autoridades de sello de tiempo no respondieron. Se reintenta solo. |
| **Falló el sellado** | Se agotaron los reintentos automáticos. Pulsa **Reintentar sellado** (espera 1 minuto entre intentos). Se avisa por correo a quien envió la solicitud. |

El **PDF firmado** trae el documento original y una hoja de evidencia con el código de verificación, la huella, los datos del firmante, la hora en UTC y en hora de El Salvador, el consentimiento, la respuesta, los adjuntos y la bitácora.

**Bitácora.** El botón **Bitácora** lista cada evento con fecha e IP: envío, código enviado o fallido, verificación del correo, apertura, firma o rechazo, sellado, cambios del documento. Está encadenada por hash: si alguien alterara un evento, la verificación lo detecta.

**Verificar integridad** (gerente de auditoría o superior) comprueba que el documento, la bitácora y el PDF sellado siguen siendo los mismos. Si dice «Integridad verificada: nada fue alterado desde que se firmó», todo está bien. Si muestra una inconsistencia, queda registrada: conserva el expediente tal como está y avisa a quien administra el sistema.

Los adjuntos de un confirmante se abren como **copia reconstruida**. El **Original** sin reconstruir solo lo abre un gerente o superior, con una advertencia: ábrelo solo si lo necesitas como evidencia.

### 11. Verificar un documento firmado (para cualquiera)

Cada PDF sellado trae un código de verificación con la forma `XXXX-XXXX-XXXX-XXXX`. En **/verificar** (por ejemplo `https://auditoria.ianovatechsystems.com/verificar`) se escribe el código y la página muestra si la firma está registrada y vigente, el estado del sellado y el sello de tiempo.

También se puede arrastrar el PDF a la página para comprobar que es el mismo archivo. La huella se calcula en el navegador y **el archivo no se sube a ningún servidor**.

`/verificar` muestra el nombre de quien firmó y el título del documento a quien tenga el código. El código solo está impreso en el PDF sellado, que ya trae esos datos.

### 12. Límites y plazos que conviene recordar

| Qué | Valor |
|---|---|
| Código de verificación | 6 dígitos, vence a los 10 minutos |
| Entre un código y el siguiente | 60 segundos |
| Sesión del firmante, ya verificado el código | 30 minutos |
| Descargar la copia firmada | 30 días desde la firma, con el mismo enlace del correo |
| Recordatorio | Un correo, 3 días antes de vencer, solo si sigue sin firmar |
| Correos de firma por organización | 300 por día (envíos, reenvíos, recordatorios y códigos) |
| Adjuntos del confirmante | 5 archivos, 10 MB cada uno, 30 MB en total |

### 13. Si algo sale mal

| Qué pasa | Qué hacer |
|---|---|
| Aparece «Solicitud creada, correo no enviado» | Copia el enlace de la ventana y envíalo por otro medio. Revisa que el correo esté bien escrito. Si cerraste sin copiarlo, usa **Reenviar**. |
| El firmante dice que no le llega el correo o el código | Que revise correo no deseado. Verifica la dirección. El código vence a los 10 minutos y se puede pedir otro cada 60 segundos. |
| El firmante ve «Enlace no válido o reemplazado por uno más reciente» | Se reenvió o se envió otra solicitud. Que use el último correo que recibió. |
| Se bloqueó la verificación | Demasiados intentos con el código. Espera 1 hora o usa **Reenviar**. Al tercer bloqueo el enlace queda inservible hasta que el equipo lo reenvíe, y se avisa por correo a quien lo envió. |
| El firmante no puede leer el documento en el teléfono | La página lo dibuja dentro de la página. Si no carga, ofrece **Abrir en una pestaña nueva** y **Descargar PDF**. |
| La sesión del firmante venció a mitad | Vuelve al paso del código sin perder lo que escribió. |
| La solicitud venció | Pulsa **Reenviar** para dar un plazo nuevo. |
| El sellado dice **Falló el sellado** | Pulsa **Reintentar sellado**. Si vuelve a fallar tras un error de integridad, solo un gerente puede reintentarlo. Si persiste, avisa a quien administra el sistema. |
| «Verificar integridad» muestra una inconsistencia | Conserva el expediente, no lo edites, y avisa a quien administra el sistema. |

---

## Parte B. Para el firmante

Esta parte se puede copiar y enviar tal cual a quien tenga dudas.

### Le enviaron un documento para firmar

La organización que se lo envió usa AuditMind para recoger firmas electrónicas. No necesita crear una cuenta ni instalar nada. Le toma unos minutos y puede hacerlo desde el teléfono.

**Si no esperaba este documento, puede ignorar el correo.** Nadie puede ver el documento ni firmarlo sin el código que llega a su correo.

### Pasos

1. **Abra el correo y pulse «Revisar y firmar».** Use el botón del correo, no copie solo una parte de la dirección. Si recarga la página y dice que falta el enlace completo, vuelva a abrir el correo original.
2. **Pida el código.** La página le dice a qué correo se lo enviará (con parte de la dirección oculta). Pulse el botón para enviarlo.
3. **Escriba el código de 6 dígitos.** Vence en 10 minutos. Si no lo ve, revise la carpeta de correo no deseado. Puede pedir otro pasados 60 segundos.
4. **Lea el documento.** En el teléfono se muestra dentro de la misma página. Si no carga, use **Abrir en una pestaña nueva** o **Descargar PDF**.
5. **Complete «Tu respuesta».** Escriba su nombre y su cargo. Según el documento:
   - *Carta de compromiso:* acepta la carta.
   - *Confirmación:* indica si está de acuerdo con el saldo, o escribe el saldo según sus registros, y puede agregar comentarios y archivos de soporte (PDF, JPG o PNG).
   - *Acta de entrevista:* indica si está conforme con el acta. Si no lo está, escriba sus observaciones.
6. **Lea la declaración de consentimiento y marque la casilla.** Es obligatoria para firmar.
7. **Pulse «Firmar».** Si prefiere no firmar, use **No firmar** y escriba el motivo (mínimo 5 caracteres). Se le avisa a quien le envió el documento.

### Después de firmar

- La página muestra **«Tu firma quedó registrada»** y un **código de verificación** con la forma `XXXX-XXXX-XXXX-XXXX`. Guárdelo.
- Le llega un correo de confirmación con ese código.
- Puede **descargar su copia firmada** con el botón de la misma página, apenas termine el sellado (suele tardar unos minutos y la página se actualiza sola). Si firmó hace un momento, no le pedirá otro código.
- Si quiere descargarla otro día, abra el mismo enlace de su correo y pida un código nuevo. **La copia queda disponible 30 días.**
- Para comprobar un documento firmado, vaya a **/verificar** y escriba el código. También puede arrastrar su PDF para confirmar que es el mismo archivo: el archivo no se sube a ningún servidor.

### Si algo no funciona

- **No llega el código:** revise correo no deseado y pida otro pasados 60 segundos.
- **«Se bloqueó la verificación»:** espere una hora o pida un enlace nuevo a quien le envió el documento.
- **«Enlace no válido o reemplazado»:** le enviaron uno más reciente. Use el último correo.
- **La sesión venció:** vuelva a pedir el código. Lo que escribió se conserva.
- **El plazo venció:** pida a quien le envió el documento que se lo reenvíe.

### Qué se guarda

Para dejar constancia se registran su nombre, cargo, correo, dirección IP, navegador, fecha y hora, y los archivos que adjunte. Se conservan junto con el documento como evidencia del trabajo de auditoría y solo los consulta el equipo de la organización que se lo envió.

---

## Parte C. Para quien administra el sistema

### Interruptor de la función

La firma por enlace se enciende con la variable `SIGNATURES_PUBLIC_ENABLED` en `/home/deploy/auditmind/.env` del servidor. Con `false` (el estado actual), el panel de cada documento muestra el aviso de que la firma no está habilitada y no ofrece el botón; las rutas públicas responden 503.

Para **encenderla**, pide aprobación al responsable del despacho. Mientras esté encendida, los gerentes y auditores de las organizaciones reales ven el botón de envío. Como usuario `deploy`:

1. Poner `SIGNATURES_PUBLIC_ENABLED=true` en el `.env`.
2. Recargar la API con las variables nuevas: `pm2 startOrReload ecosystem.config.cjs --only auditmind-api --update-env`.
3. Comprobar con una petición de prueba a `/api/v1/public/signatures/request` con un token falso: **503** si está apagada, **404** si está encendida.

Para **apagarla**, el mismo procedimiento con `false`. La copia del `.env` anterior a encenderla por primera vez está en `/home/deploy/.env.bak-antes-firma` (modo 600, fuera del repositorio).

### Servicios de los que depende

- **Correo (Resend):** el remitente es `notificaciones@auditoria.ianovatechsystems.com`. Responder al correo escribe a quien envió la solicitud.
- **ClamAV** (`127.0.0.1:3310`): revisa los adjuntos de las confirmaciones. Si no responde, el adjunto se rechaza con «No se pudo verificar el archivo» (falla cerrado).
- **Stirling-PDF:** reconstruye los adjuntos y sella el PDF. Hay que recrear su contenedor al desplegar cambios de sus límites.
- **Sellos de tiempo:** DigiCert y Sectigo, en ese orden. Si ambas fallan, el PDF queda sellado por la organización y el sello de tiempo se reintenta solo.

### Pruebas pendientes

Con el interruptor encendido y con aprobación:

- firmar desde el teléfono con la versión corregida (lector de PDF propio y descarga sin segundo código);
- enviar una confirmación externa (NIA 505) de punta a punta con el correo del confirmante registrado.

### Recomendación de correo (DNS)

El dominio tiene `p=none` en `_dmarc`. Conviene agregar un buzón de reportes (`rua=mailto:…`) y, tras una o dos semanas sin problemas, pasar a `p=quarantine`, para que nadie suplante el dominio con solicitudes de firma falsas.

### Pendiente de revisión legal

Los textos de consentimiento, privacidad y aviso de rechazo son constantes versionadas (`apps/api/src/signatures/legal-texts.ts`). Se recomienda una revisión legal. Cambiarlos no rompe las firmas anteriores, porque cada firma guarda la versión y el texto literal que se mostró.
