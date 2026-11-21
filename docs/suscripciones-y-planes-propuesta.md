# AuditMind — Propuesta de planes y suscripciones

**Fecha:** 2026-11-21 · **Estado:** PROPUESTA — nada de esto está implementado ni aprobado. Se espera tu decisión antes de construir.
**Versión:** v2 — el §10 (Personas/Empresas, módulos y asistentes seleccionables, pedido del usuario) **reemplaza al catálogo de §4.2** donde difieran.
**Origen:** revisión de código (solo lectura) de `dtes-y-analítica-sv`, `Nexus Finance` y `validador-de-expedientes-inteligente` (AFEXIA) + estado actual de AuditMind.
**Alcance de la verificación:** se leyó código y documentos; **no se consultaron las bases de producción** de las otras apps. Los datos «en vivo» (qué interruptor está encendido, qué precios reales hay cargados) salen de sus documentos y pueden diferir. Los precios de esta propuesta son **hipótesis a validar**, no datos de mercado.

---

## 1. Resumen en una página

**Dónde estás hoy.** AuditMind tiene un campo `Organization.plan` (texto: starter / professional / enterprise) y `trialEndsAt`, y el módulo Organizaciones permite elegirlo… pero **nada lo lee**: no hay límites, no hay cobro, no hay página de precios (`/` redirige a `/login`), y el consumo de IA ni siquiera se mide (las tablas `AIInteraction` y `LLMRouterLog` existen y nadie escribe en ellas). Hoy todo cliente tiene acceso total, y todo se da de alta a mano.

**Qué aprendí de tus otras tres apps.** Las tres resolvieron lo mismo con la misma receta, y las tres dejaron los mismos huecos (sección 2). La buena noticia: **ya tienes diseñado y probado casi todo lo difícil** (planes como datos, instantánea del plan por cliente, pago manual con aprobación, función de activación única, webhook de Wompi con firma, modo solo lectura al vencer). La mala: **las tres tienen el cumplimiento de límites apagado o a medias y ninguna cobra en línea hoy** (Wompi está apagado en dtes-y-analítica-sv, sin aplicar en AFEXIA —le falta la cuenta— y no existe en Nexus).

**Qué propongo.** Vender en **dos etapas**, para empezar a cobrar cuanto antes sin esperar el autoservicio:

| Etapa | Qué incluye | Para qué sirve | Esfuerzo estimado |
|---|---|---|---|
| **A — Venta asistida** | Planes como datos, suscripción por organización, tope de usuarios, **solo lectura al vencer**, pantalla «Mi plan», pago por transferencia/QR con comprobante y aprobación tuya, recordatorios | Cobrar a los primeros clientes (tú los das de alta y apruebas el pago) | ~2 semanas |
| **B — Autoservicio** | Página pública `/precios`, prueba gratuita autoservicio, pago en línea con Wompi, medición de IA/almacenamiento con avisos | Vender sin tu intervención | ~2 semanas más |

**Planes (hipótesis, USD/mes sin IVA):** Independiente **$49** · Despacho **$129** · Firma **$299** · Institucional **a convenir** · más un plan **Piloto** con precio pactado para los clientes que ya usan AuditMind. Anual = 10 meses (dos gratis).

**Lo que necesito que decidas** está en la sección 9 (8 preguntas; las 3 que más bloquean son precios, IVA/factura y cuenta de Wompi).

---

## 2. Qué hacen hoy tus otras tres apps

| | **dtes-y-analítica-sv** | **AFEXIA** (validador de expedientes) | **Nexus Finance** |
|---|---|---|---|
| **Planes** | En BD (`subscription_plans`). 6 borradores «a convenir» (Persona inicial → Corporativo), **sin precio**; los planes antiguos con precios solo viven en la BD | En BD (`plans`, `addon_packs`). Único plan sembrado: «Interno» (precio 0). Hipótesis sin implementar: $29 / $89 / $249 | 6 planes con precio en la migración: $5 / $12 / $22 (personas) y $39 / $89 / $179 (empresas); anual = 10 meses guardado pero **no se cobra** |
| **Qué limita** | Empresas, espacio, consultas IA/mes, asistentes incluidos, licencia | Usuarios, análisis/mes, almacenamiento, **crédito de IA en USD reales** (mostrado como «créditos» ×100), funciones | Usuarios, empresas, espacio, **módulos por plan** (20 módulos) |
| **Prueba** | `trial_days` existe, **nada lo aplica** | No hay | 30 días, configurable; **cada empresa nueva recibe la suya** (se pueden encadenar) |
| **Aplicación** | Trigger en BD (empresas), servidor (402 licencia vencida, 429 IA agotada), política de Storage | Interruptor `enforce_limits` **apagado**; si se enciende: triggers en BD + guardas del servidor (402) | Todo en `off`; guardas + triggers en BD (20 tablas) listos pero apagados; `max_companies` **no se aplica** |
| **Vencido** | **Solo lectura**, nunca borra | **Solo lectura**, sin días de gracia | Estados: activo → cierre 30 días → solo lectura → apagado (diseñado) |
| **Cobro** | Wompi (enlace + webhook HMAC + conciliación c/15 min) **apagado**, más transferencia/QR; activación solo por `approve_payment` | QR 365/transferencia/efectivo con comprobante y aprobación manual; Wompi escrito, **migración sin aplicar** | **Ninguno** (cambio de plan a mano) |
| **Factura al cliente** | DTE emitido fuera; el admin sube el PDF al pago | Igual: DTE fuera, PDF adjunto | No hay |
| **IVA** | No se maneja | No se maneja (pregunta abierta con el contador) | No se maneja (preguntas P17–P19 sin respuesta) |
| **Página de precios** | No (hay un endpoint público de catálogo para el asistente de ventas) | No (vista pública de catálogo) | No (`/` redirige) |

### Lo que se repite y vale copiar
1. **Los planes y paquetes son filas editables por el superadmin**, no código: cambiar un precio no requiere desplegar.
2. **Instantánea del plan en cada suscripción** (`plan_snapshot`) + **precio pactado** por cliente: subir el precio del catálogo no rompe a quien ya contrató.
3. **Vencido = solo lectura, nunca se borra nada** (consultar y exportar siguen funcionando).
4. **Un único camino de activación**: pago aprobado → función idempotente que renueva (no hay forma de activar «a mano» sin dejar rastro).
5. **Pago manual primero** (transferencia/QR con comprobante); la pasarela después.
6. **Interruptor global con modo «observar»** antes de bloquear (Nexus: `off` / `observe` / `enforce`): mide una semana sin molestar a nadie y luego se enciende.
7. **Catálogo público de solo lectura** para que un asistente de ventas lo consulte.

### Los huecos que las tres comparten (hay que evitarlos)
- **Límites definidos pero no aplicados**: `max_companies` (Nexus), `protocolos_propios` (AFEXIA), `trial_days` (dtes).
- **Fallan abiertos sin avisar** si la base no responde (las tres): nadie se entera de que los límites dejaron de funcionar.
- **Reactivar usuarios evita el tope** (Nexus); reescribir un expediente no consume cuota (AFEXIA).
- **Pruebas encadenables** (Nexus): cada empresa nueva trae su prueba.
- **Sin recordatorios** de vencimiento ni de consumo (las tres).
- **IVA y factura de la suscripción sin definir** (las tres): conviene resolverlo **una sola vez** con el contador.
- **Documentos que no coinciden con el código** (precios de ADRs distintos a los sembrados; migraciones descritas que no existen).
- **Un mismo bloqueo externo: la cuenta de Wompi** (AFEXIA la espera explícitamente; en dtes el cobro en línea sigue apagado; Nexus ni lo tiene).

---

## 3. Punto de partida de AuditMind (hechos verificados en el repositorio)

- `Organization.plan` (texto, por defecto `starter`) y `trialEndsAt` — guardados, **sin ningún lector**. `organizations.service.ts` lo asigna al crear y lo cambia solo el SUPER_ADMIN; el DTO acepta `maxUsers` pero no se persiste ni se aplica.
- `auditModality` (INTERNAL / EXTERNAL / BOTH) **sí** filtra módulos: es un eje natural de plan ya existente.
- **Medición de IA: inexistente.** `AIInteraction` y `LLMRouterLog` (con `inputTokens`, `costUsd`…) no tienen escritores; solo `dashboard.service` hace un `count`.
- **Almacenamiento:** el tamaño de cada archivo se guarda en varias tablas (`fileSize`, `sizeBytes`…), pero **no hay total por organización**.
- **Roles de 8 niveles** (SUPER_ADMIN … READ_ONLY) y un guardián de roles ya probado (acabamos de extenderlo para «Solo lectura»). Un `SubscriptionGuard` se monta con el mismo patrón.
- **Alta de clientes:** solo por SUPER_ADMIN o invitación; no hay registro público (correcto para esta etapa).
- **Costo de IA hoy:** tras el cambio a `gpt-6-luna` (benchmark del 2026-11-21) un análisis cuesta ≈ **$0.0004**; un despacho muy activo (3,000 consultas con RAG al mes) ≈ **$4**. **La IA ya no es el costo que condiciona el precio**; se limita por abuso, no por margen.
- **Costos que sí pesan** (confirma tus cifras reales): hosting del VPS, **Supabase** (según la revisión del 17-oct la base está en el plan gratuito: **antes de vender conviene pasar a Pro, ~$25/mes, por respaldos**), correo (Resend), almacenamiento por encima de lo incluido.
- **Clientes reales hoy:** Pérez Cortez, FE & CE, Auditores Invitados (Beta), más Empresa Demo (interna).

---

## 4. Diseño propuesto

### 4.1 Qué se vende y a quién
Dos audiencias con necesidades distintas, que ya separa `auditModality`:
- **Auditoría Externa (despachos/firmas):** cartera, propuestas, cobranza, horas, papeles NIA, confirmaciones, portal PBC.
- **Auditoría Interna (empresas, instituciones):** universo auditable, plan anual, comité, QAIP, riesgos, hallazgos.

Los **15 asistentes de IA y las bases RAG van en todos los planes**; lo que cambia entre planes son los **créditos de IA**, no qué agentes se pueden usar (más simple de explicar y de hacer cumplir).

### 4.2 Catálogo (hipótesis — USD/mes, sin IVA)

| | **Independiente** | **Despacho** | **Firma** | **Institucional** |
|---|---|---|---|---|
| Para | Auditor/CPA independiente | Despacho pequeño–mediano | Firma con varios equipos | Auditoría interna corporativa / gobierno |
| **Precio mensual** | **$49** | **$129** | **$299** | A convenir (precio pactado) |
| **Precio anual** (10 meses) | $490 | $1,290 | $2,990 | A convenir |
| Usuarios incluidos | 2 | 5 | 15 | A convenir |
| Usuario extra | — | $19 (hasta 15) | $15 (hasta 50) | — |
| Almacenamiento | 10 GB | 50 GB | 200 GB | A convenir |
| Créditos de IA/mes (USD de costo real) | $2 | $8 | $25 | A convenir |
| Modalidad | Externa **o** Interna | Externa (Interna opcional) | Ambas | Interna (o Ambas) |
| Cartera, propuestas, cobranza, horas | ✔ | ✔ | ✔ | si es Externa |
| Confirmaciones NIA 505 + portal PBC | ✔ | ✔ | ✔ | ✔ |
| Firma electrónica por enlace | — | ✔ | ✔ | ✔ |
| CAATs avanzados (sanciones OFAC/ONU/UK, suite DTE) | — | — | ✔ | ✔ |
| Investigador forense (SHERLOCK) | — | — | ✔ | ✔ |
| Comité, QAIP | — | — | ✔ | ✔ |
| Marca propia (logo/colores en informes) | — | ✔ | ✔ | ✔ |

**Cómo salen estos números (para que los discutas, no para que los aceptes):**
- Anclas internas: Nexus «Empresa» $39 / $89 / $179; AFEXIA (hipótesis) $29 / $89 / $249. AuditMind es una plataforma profesional de auditoría (más valor y más costo de cambio que un ERP de entrada), por eso el escalón sube.
- Margen: el costo variable por cliente es de centavos a pocos dólares (IA ≈ 2–8 USD **como tope**, normalmente mucho menos). Con costos fijos de ~$60–100/mes (VPS + Supabase Pro + correo; **confírmalos**), **2–3 clientes «Despacho» ya cubren la operación**.
- Anual con 2 meses gratis (como Nexus ya tiene guardado): incentiva el pago adelantado, que además reduce el trabajo manual de cobrar cada mes mientras no haya pasarela.

**Plan Piloto / Fundador (clientes actuales):** misma funcionalidad que el plan que corresponda, `precio_pactado` y vigencia explícita (p. ej. 12 meses). Si no los cobras todavía, quedan en «Piloto» a precio 0 con fecha de fin: así **tampoco quedan sin plan** cuando se encienda el cumplimiento.

**Plan interno (Empresa Demo):** sin límites, marcado como interno (igual que «Interno» en AFEXIA).

**Prueba gratuita:** 14 días con el plan Despacho completo, sin tarjeta, **una por organización y por correo** (evita el encadenamiento de Nexus). Al terminar: 7 días de gracia con avisos → **solo lectura** hasta 60 días → suspendida. Nada se borra.

### 4.3 Qué se mide y cómo se hace cumplir

Un solo servicio **`EntitlementsService`** (con caché de ~60 s por organización) que responde «¿puede esta organización hacer X?». Ningún chequeo suelto: todo pasa por ahí (esto evita los huecos de «reactivar usuarios evita el tope»).

| Límite | Cómo se mide | Dónde se aplica | Al excederse |
|---|---|---|---|
| **Usuarios** | Usuarios activos con rol ADMIN, CAE, AUDIT_MANAGER, SENIOR_AUDITOR, AUDITOR. **No cuentan** AUDITEE ni READ_ONLY (invitados y clientes del portal) ni SUPER_ADMIN | Invitar, **reactivar**, **cambiar de rol** | 402 con mensaje claro; ofrece usuario extra o cambio de plan |
| **Almacenamiento** | Suma de `fileSize/sizeBytes` por organización (vista agregada) | Subidas nuevas | 413/402; bajar de plan no recorta nada, solo bloquea subidas |
| **Créditos de IA** | **Libro de consumo** (`UsageLedger`) con el costo real por llamada: OpenRouter lo devuelve en `usage.cost`; si no, se calcula con tabla de precios | ai-service y API (un solo punto: el router) | Avisos al 80 % y 100 %; al 100 % se detiene la IA (402) hasta renovar/comprar paquete. La consulta que falla por error del modelo **no cobra** |
| **Funciones** | Banderas por plan (`FIRMA`, `FORENSE`, `CAATS_AVANZADOS`, `COMITE_QAIP`, `MARCA`) | Decorador `@RequiresFeature(...)` en el controlador | 403 `FUNCION_NO_INCLUIDA` |
| **Vigencia** | Estado de la suscripción | **Guardián global**: si está en solo lectura, solo pasan GET/HEAD y una lista corta (login, pagar, exportar) | 402 `LICENCIA_VENCIDA` |

**Reglas de diseño para no repetir los huecos:**
- **Modo `observar` primero:** una semana midiendo y registrando «habría bloqueado» sin bloquear; después `enforce`. Interruptor global y por organización.
- **Falla abierta, pero con alarma:** si no se puede leer el estado de la suscripción, se deja trabajar (un auditor en pleno trabajo no debe perder la sesión) **y se registra/avisa**; nunca en silencio.
- **Solo lectura ≠ prisión:** exportar y descargar siempre disponibles.
- **Instantánea por periodo:** el plan se copia a la suscripción al renovar; cambiar el catálogo no altera lo ya contratado.

### 4.4 Modelo de datos (tablas nuevas, todas con RLS y sin acceso `anon` — regla de la auditoría de seguridad)

- `Plan` — código, nombre, audiencia, precios mensual/anual, días de prueba, `limits` (JSON), `features` (JSON), modalidad, activo, público, orden.
- `Subscription` — organización (única), plan, **instantánea** del plan, estado (`TRIAL | ACTIVE | GRACE | READ_ONLY | SUSPENDED | CANCELLED`), ciclo (mensual/anual), inicio/fin del periodo, fin de prueba, `precioPactado`, sobrescrituras por cliente, fecha de cancelación solicitada.
- `Payment` — organización, suscripción, monto, método (`TRANSFER | QR | CASH | WOMPI`), estado (`PENDING | APPROVED | REJECTED | EXPIRED`), código de referencia `AUD-XXXXXX`, ruta del comprobante, quién aprobó y cuándo, PDF del DTE.
- `UsageLedger` — solo-agregar: organización, tipo, cantidad, costo USD, modelo, referencia, fecha.
- `BillingSettings` — singleton: modo de cumplimiento (`off | observe | enforce`), días de prueba y de gracia, recordatorios, porcentaje de IVA.
- *(Etapa B/C)* `AddonPack` y `AddonPurchase` — paquetes de usuarios, espacio y créditos.

**Migración de lo existente:** cada `Organization` actual recibe una `Subscription` (Piloto para clientes reales, Interno para Empresa Demo); `Organization.plan/trialEndsAt` quedan como espejo hasta retirarlos. **Todo SQL se aplica solo con tu aprobación**, uno por uno (la base de desarrollo y producción es la misma).

### 4.5 Ciclo de vida y cobro

```
PRUEBA (14 d) ──paga──▶ ACTIVA ──vence──▶ GRACIA (7 d, avisos) ──▶ SOLO LECTURA (≤60 d) ──▶ SUSPENDIDA
     │                    ▲                                              │
     └──vence sin pagar───┼──────────────────────────────────────────────┘
                          └──────────── pago aprobado: reactiva ◀─────────┘
```
- **Cambio de plan:** subir = inmediato y se cobra la diferencia por los días restantes; bajar = al renovar, con verificación de que los límites lo permiten (usuarios/espacio).
- **Cancelación:** la pide el cliente; sigue vigente hasta el fin del periodo; luego solo lectura con exportación.
- **Recordatorios (Resend + cron de `@nestjs/schedule`, ya instalado):** 7 y 1 día antes, el día del vencimiento, y al 80 %/100 % de IA y espacio. Las tres apps no los tienen: es el hueco que más tickets de soporte genera.
- **Etapa A — pago manual:** la pantalla muestra los datos de pago (QR 365 / transferencia) con una **referencia única**; el cliente sube el comprobante; **tú apruebas** y una función **idempotente** (`approve_payment`, mismo diseño que AFEXIA/dtes) activa o renueva. Sin comprobante a los 14 días el pago se cierra.
- **Etapa B — Wompi:** enlace de pago + webhook con firma HMAC + confirmación contra la API + conciliación cada 15 min. **Ya está escrito y probado en dtes-y-analítica-sv y AFEXIA**; se porta la lógica (stacks distintos: ellas Express/Supabase, AuditMind NestJS/Prisma). Requiere la cuenta de Wompi (ver §9).
- **Factura:** el DTE se emite fuera (como hacen tus otras apps) y el PDF se adjunta al pago; el cliente lo descarga en «Mis pagos». Automatizarlo con tu emisor de DTE es etapa C.

### 4.6 Pantallas
- **Superadmin:** *Planes* (crear/editar), *Suscripciones* (asignar, renovar, extender prueba, precio pactado, sobrescrituras, historial), *Pagos* (cola de aprobación con comprobante), *Consumo* (IA y almacenamiento por organización).
- **Cliente (rol ADMIN de la organización):** *Mi plan* — plan y vencimiento, barras de usuarios/espacio/IA, botón pagar/renovar, historial de pagos y facturas; **banners** al 80 %, a 7 días del vencimiento y en solo lectura.
- **Público:** `/precios` que lee el catálogo (vista pública de solo lectura, como en tus otras apps; **sin exponer costos internos** — AFEXIA expone `ai_credit_usd` a `anon` y se contradice con su propia revisión de seguridad) + «Solicitar demo / empezar prueba». En la etapa A basta un formulario que te envíe el correo.

---

## 5. Cómo reutilizar lo que ya tienes

| Pieza | Fuente | Qué se porta |
|---|---|---|
| Función de activación idempotente, libro de consumo solo-agregar, cupos | AFEXIA (`approve_payment`, `usage_ledger`) | Lógica SQL → adaptada a Prisma/Postgres |
| Webhook Wompi (firma HMAC en tiempo constante, confirmación al centavo, conciliación 15 min), pruebas | dtes-y-analítica-sv (`billing-routes.ts`) | Lógica y casos de prueba |
| Modos `off / observe / enforce` | Nexus (`lib/modules/decide.ts`) | Concepto |
| Banners de plan, recordatorios 80 %/100 %/7 días | AFEXIA (`PlanBannerHost`), dtes (`LicenciaBanner`) | Diseño de UX |
| Guardián de solo lectura | AuditMind (`roles.guard.ts`, recién probado por HTTP real) | Mismo patrón para `SubscriptionGuard` |

**No se copia código tal cual:** las tres apps son otros stacks. Se copia el diseño y los casos de prueba; el código se reescribe sobre los patrones de AuditMind (`assertInOrg`, interceptores, pruebas con Postgres real).

---

## 6. Fases, esfuerzo y modelo de Claude recomendado

*(Esfuerzos estimados; el diseño queda escrito aquí — regla: diseñar con el modelo fuerte, ejecutar con el más barato que garantice calidad.)*

| Fase | Entrega | Esfuerzo | Ejecutar con | Revisar con |
|---|---|---|---|---|
| **F0** | Decisiones de §9 + Supabase Pro + datos de pago | tú + contador | — | — |
| **F1** Núcleo | `Plan`, `Subscription`, `BillingSettings`; `EntitlementsService`; migración de organizaciones; asignación de plan en Organizaciones; tope de usuarios; guardián de solo lectura; «Mi plan» básico | ~5–6 días | **Sonnet** (patrones del repo) | **Opus 5.5**: aislamiento multi-tenant y guardián |
| **F2** Medición | `UsageLedger`; punto único en el router de IA (ai-service) y en el cliente del API; almacenamiento por organización; barras y avisos | ~3–4 días | **Sonnet** | Opus solo el punto de cobro de IA |
| **F3** Pagos manuales | `Payment`, referencia, comprobantes (con ClamAV/validación de tipo ya existente), cola de aprobación, `approve_payment` idempotente, recordatorios por cron + Resend | ~4 días | **Sonnet** | **Opus 5.5**: idempotencia y concurrencia de la activación |
| **F4** Autoservicio | `/precios`, prueba autoservicio con anti-abuso, Wompi + webhook | ~5–7 días | **Sonnet** | **Opus 5.5**: seguridad del webhook y del alta pública |
| **F5** Extras | Anual con descuento, paquetes, prorrateo, DTE automático | a definir | Sonnet / Haiku (documentación, pruebas sobre patrones) | — |

**Vender antes de terminar:** con F0 + cobro 100 % manual (tú asignas el plan en Organizaciones, cobras por transferencia, sin cumplimiento) **puedes cerrar los primeros pilotos desde ya**; F1 + F3 son el mínimo para que el sistema los respalde.

---

## 7. Riesgos

1. **Precio sin validar.** Las cifras son hipótesis: se validan con 3–5 conversaciones con despachos antes de publicar `/precios`. Los planes son datos, así que corregir un precio no requiere desplegar.
2. **Bloquear a un cliente por error** (guardián mal calibrado). Mitigado con modo `observar` y con «falla abierta + alarma».
3. **Supabase gratuito** (pausas y sin respaldos) es incompatible con cobrar por un servicio: resolverlo antes de la primera factura.
4. **IVA y factura de la suscripción.** Sin respuesta del contador no se puede publicar el precio final (¿$129 + IVA o IVA incluido?). Tus tres apps lo dejaron abierto: resuélvelo una vez.
5. **QR de una persona natural** (señalado en AFEXIA): cobrar suscripciones a una cuenta personal tiene implicaciones fiscales; confírmalo con el contador antes de usar QR como método oficial.
6. **Abuso de la prueba** (cuentas desechables): una por correo y por organización, aprobación manual en etapa A.
7. **Costo de IA si cambia el modelo:** los créditos están en USD de costo real, no en número de consultas, así que un cambio de modelo no rompe los topes.

---

## 8. Cosas que NO se proponen (a propósito)
- **No limitar el número de auditorías, papeles o hallazgos:** ninguna de tus tres apps limita volumen de documentos y añade fricción sin proteger margen. (Opcional más adelante: «auditorías activas» solo en Independiente.)
- **No cobrar por agente de IA:** se cobra por créditos; más simple y robusto.
- **No sobrecargos automáticos:** solo bloqueo, aviso o compra de paquete — igual que las tres apps.
- **No cobro recurrente automático al inicio:** hasta tener Wompi, la renovación es manual con recordatorios (anual ayuda mucho).

---

## 9. Lo que necesito que decidas

1. **Precios:** ¿te sirven $49 / $129 / $299 como punto de partida, o tienes un rango en mente según lo que cobran tus clientes potenciales?
2. **Primer público:** ¿despachos de auditoría externa o auditoría interna? (define qué plan se promociona primero).
3. **IVA y factura:** ¿precios con IVA incluido o aparte? ¿Quién emite el DTE de la suscripción y con qué herramienta? *(pregunta para el contador, común a tus tres apps)*.
4. **Wompi:** ¿abrirás la cuenta? Mientras tanto, ¿transferencia y QR (el QR actual es de persona natural)?
5. **Prueba gratuita:** ¿14 días con funcionalidad completa y sin tarjeta, como propongo? ¿o solo con demo asistida?
6. **Clientes actuales** (Pérez Cortez, FE & CE, Auditores Invitados): ¿Piloto sin costo con fecha de fin, o precio pactado desde ahora?
7. **Usuarios invitados** (clientes del portal PBC, AUDITEE y READ_ONLY) **no cuentan como usuarios de pago**: ¿de acuerdo?
8. **Supabase Pro** antes de la primera factura: ¿lo activas tú o lo preparo (requiere tu aprobación de gasto)?

*Con tus respuestas ajusto el catálogo y arranco F1. Hasta entonces no se construye nada.*

---

## 10. Ajuste v2 (2026-11-21): planes de Personas y de Empresas, módulos y asistentes seleccionables

*Pedido del usuario tras leer la v1: planes para **Personas** y para **Empresas**; límites de IA, espacio y usuarios; **tiempo de licencia** (mensual/trimestral/semestral/anual/sin vencimiento); **días de prueba**; **módulos seleccionables** por plan (Plan Anual de Auditoría Interna, Cartera de Auditoría Externa, Riesgos y Controles, Gobierno Corporativo…); y **qué asistentes** puede usar cada plan. **Este apartado reemplaza al catálogo de §4.2 donde difieran**; el resto (medición, cumplimiento, ciclo de vida, cobro, fases) se mantiene.*

### 10.1 ¿Se puede? Sí. Qué existe ya y qué falta

| Pieza | Hoy en AuditMind | Qué falta |
|---|---|---|
| **Módulos por plan** | El menú (`Sidebar.tsx`) ya etiqueta cada grupo con `module` y filtra según `auditModality` (INTERNAL / EXTERNAL / BOTH). | Hoy **solo oculta cosas en pantalla** y solo distingue 2 valores. Hay que (a) generalizar a una **lista de módulos por plan**, y (b) **proteger el API y las rutas**: quien escriba la URL a mano o llame al API hoy entra igual. Es la parte importante (seguridad), no la cosmética. |
| **Asistentes por plan** | 15 agentes; el chat pasa por `AiService.chat` y el servicio de IA recibe `agent_type`. | Una lista `asistentes` por plan y una verificación en `AiService.chat` y en los endpoints de Scriptorium (que usan agentes por dentro). |
| **Límites de IA / espacio / usuarios** | No se miden ni se aplican (ver §3). | Lo de las etapas F1–F2. |
| **Licencia por duración** | No existe. | Tabla de precios por duración (ver 10.3): permite ofrecer el mismo plan a 1, 3, 6 o 12 meses o «sin vencimiento». |
| **Días de prueba** | `trialEndsAt` existe y nadie lo usa. | Aplicarlo al alta: la suscripción nace en `TRIAL` con los `diasPrueba` del plan. (En dtes-y-analítica-sv `trial_days` existe y **nada lo aplica**: aquí sí se aplica y se prueba.) |
| **Personas vs Empresas** | No existe. | Campo `audiencia` del plan (`PERSONA` / `EMPRESA`). |

**Una advertencia de diseño:** «módulos seleccionables» puede significar (a) **paquetes prearmados** (cada plan trae su combinación) o (b) **armar el plan a la carta**. Recomiendo **(a) como base + (b) solo como ajuste por cliente** (sobrescrituras y paquetes adicionales): vender a la carta multiplica las combinaciones, el soporte y los errores de cobro; los paquetes prearmados se explican en una frase. El superadmin sí marca los módulos con casillas al **crear/editar el plan** (tu idea), y puede darle a un cliente un módulo extra sin cambiar de plan.

### 10.2 Catálogo de módulos (granularidad = grupo del menú, no página por página)

Páginas sueltas como «módulo» serían ~60 interruptores inmanejables. El grupo del menú es la unidad natural; las funciones caras o delicadas (firma, forense, CAATs, sanciones) van como **funciones** aparte.

| Clave | Módulo (grupo del menú) | Qué incluye | Se aplica en el API sobre | Depende de |
|---|---|---|---|---|
| `NUCLEO` | Dashboard · Ejecución · Seguimiento básico · Administración | Proyectos de auditoría, papeles de trabajo, hallazgos, usuarios, catálogos, configuración | siempre activo | — |
| `PLAN_ANUAL` | **Planificación Anual (Interna)** | Plan estratégico, universo de auditoría, banco de proyectos, plan anual | `strategic`, `audit-universe`, `plans`, `audit-projects` | NUCLEO |
| `CARTERA` | **Cartera de Auditoría Externa** | Cartera de clientes, aceptación, propuestas, cartas de compromiso, encargos, cobranza | `portfolio`, `collections` | NUCLEO |
| `HORAS` | Horas y Rentabilidad | Captura y cierre de horas, utilización, rentabilidad, capacidad, costeo | `timesheet`, `capacity`, tarifas | NUCLEO (más útil con CARTERA) |
| `RIESGOS` | **Riesgos y Controles** | Evaluación de riesgos y controles | `risks` | NUCLEO |
| `GOBIERNO` | **Gobierno Corporativo** | Comité de Auditoría, QAIP y Calidad, ESG, BCP/DRP | `committee`, `qaip`, `bcp-drp` | NUCLEO |
| `SEGUIMIENTO_EXT` | Portal PBC y Confirmaciones | Portal del auditado (PBC), confirmaciones externas NIA 505 | `pbc`, `confirmations` | NUCLEO |
| `REPORTES_IA` | Reportería e IA | Reportes, analytics, Notario PDF, página de asistentes | `reports`, `pdf-tools`, `ai` | NUCLEO |
| **Funciones** (casillas aparte) | | | | |
| `FIRMA` | Firma electrónica por enlace | Cartas, confirmaciones, actas | `signatures` | NUCLEO |
| `FORENSE` | Investigador forense | SHERLOCK, grafo e informe de investigación | `investigation-graph`, `investigation-report` | NUCLEO |
| `CAATS_AVANZADOS` | CAATs avanzados y sanciones | Suite DTE, prueba GL horaria, screening OFAC/ONU/UK | `analytics`, `watchlists` | NUCLEO |
| `MARCA` | Marca propia | Logo y colores en informes y portal | `organizations` | NUCLEO |

Reglas: las **dependencias** se marcan solas en el editor (al activar `HORAS` sugiere `CARTERA`); **desactivar un módulo no borra datos**: se oculta y se bloquea, y reactivarlo lo restaura. Cada módulo se aplica con un decorador `@RequiresModule('CARTERA')` en el controlador (el menú se alimenta de la misma lista, así que **pantalla y API nunca discrepan**) y las rutas de la web muestran una pantalla «Este módulo no está en tu plan» con el botón de ampliar, en vez de un error.

### 10.3 Cómo se configura un plan (editor del superadmin)

Cada plan es una fila editable con:
- **Identidad:** nombre, **audiencia (Persona / Empresa)**, descripción, visible al público, destacado, orden.
- **Licencia y precio:** una tabla `PlanPrecio` (plan, **meses de licencia ∈ {1, 3, 6, 12, 0 = sin vencimiento}**, precio USD, activo). Es tu pantalla de «Cuánto dura cada licencia» llevada un paso más allá: el **mismo plan** se ofrece a varias duraciones, cada una con su precio (p. ej. anual = 10 meses), y «sin vencimiento» queda para el plan Interno y los pilotos. Al vencer: gracia → **solo lectura** (nunca se borra nada).
- **Prueba:** `diasPrueba` (0–365).
- **Límites:** usuarios incluidos (y máximo con extras), espacio (MB), **créditos de IA/mes**.
- **Módulos y funciones:** casillas del catálogo de 10.2.
- **Asistentes permitidos:** casillas de los 15 (ver 10.4).
- **Aplicar a N clientes:** al cambiar un plan, botón para propagarlo a los suscriptores actuales (patrón de dtes-y-analítica-sv); por defecto **no** los toca (instantánea por cliente).

### 10.4 Asistentes por plan

Los 15 agentes agrupados por afinidad con los módulos (así la casilla del plan se entiende sin explicar nada):

| Grupo | Asistentes | Natural en |
|---|---|---|
| Planificación y riesgos | MINERVA, CASSANDRA | `PLAN_ANUAL`, `RIESGOS` |
| Ejecución y controles | ARGUS, SCRIPTORIUM, SOCRATES, VULCANO | `NUCLEO`, `RIESGOS` |
| Reportería | CICERO | `REPORTES_IA` |
| Cumplimiento, fiscal y PLD (bases FISCAL_SV, AML_SV…) | SENADO, FISCUS, THEMIS | `CARTERA` (externa), `GOBIERNO` |
| Forense | HERMES, SHERLOCK | `FORENSE` |
| Gobierno y calidad | ATLAS (ESG), FENIX (BCP/DRP), MINERVA_QAIP | `GOBIERNO` |

Regla simple propuesta: **un asistente queda habilitado si el plan lo marca** (casilla propia), y el editor **pre-marca** los afines a los módulos elegidos. Así un plan sin `GOBIERNO` no ve ATLAS/FENIX/MINERVA_QAIP por defecto, pero el superadmin puede darle uno suelto a un cliente.

### 10.5 Ejemplo de catálogo con Personas y Empresas (hipótesis de precio, USD/mes sin IVA)

| | **Persona Inicial** | **Persona Profesional** | **Empresa Despacho** | **Empresa Auditoría Interna** | **Empresa Plus** |
|---|---|---|---|---|---|
| Audiencia | PERSONA | PERSONA | EMPRESA | EMPRESA | EMPRESA |
| Para | CPA / auditor independiente que empieza | Independiente o consultor con cartera | Despacho pequeño–mediano | Departamento de auditoría interna | Firma con varios equipos / grupo |
| **Mensual** | **$29** | **$59** | **$149** | **$149** | **$299** |
| Usuarios (extra) | 1 | 2 | 5 (+$19, hasta 15) | 5 (+$19, hasta 15) | 15 (+$15, hasta 50) |
| Espacio | 5 GB | 15 GB | 50 GB | 50 GB | 200 GB |
| Créditos de IA/mes | $1 | $3 | $8 | $8 | $25 |
| Prueba | 14 d | 14 d | 14 d | 14 d | 14 d |
| `PLAN_ANUAL` | elegir **uno** de los dos | ✔ | — | ✔ | ✔ |
| `CARTERA` | (Plan Anual **o** Cartera) | ✔ | ✔ | — | ✔ |
| `HORAS` | — | ✔ | ✔ | ✔ | ✔ |
| `RIESGOS` | ✔ | ✔ | ✔ | ✔ | ✔ |
| `GOBIERNO` | — | — | — | ✔ | ✔ |
| `SEGUIMIENTO_EXT` (PBC, confirmaciones) | — | ✔ | ✔ | ✔ | ✔ |
| `REPORTES_IA` | ✔ | ✔ | ✔ | ✔ | ✔ |
| Firma · Marca propia | — | Marca | Firma + Marca | Firma + Marca | ambas |
| Forense · CAATs avanzados | — | — | — | — | ✔ |
| Asistentes | 6 básicos | 10 | 12 | 12 | los 15 |

Se mantienen **Institucional** (a convenir), **Piloto/Fundador** (clientes actuales) e **Interno** (Empresa Demo, sin límites, sin vencimiento) de §4.2. **Todo precio es hipótesis a validar** con 3–5 despachos/auditores reales antes de publicarlo; al ser datos del editor, ajustarlos no requiere desplegar.

### 10.6 Qué más agregaría (ordenado por valor / esfuerzo)

**Alto valor, bajo esfuerzo (incluir desde el inicio):**
1. **Bases de conocimiento (RAG) por plan** — FISCAL_SV, AML_SV (PLD), IIA, NAIG, CVPCPA: es lo que más se percibe como valor local y casi no cuesta; se puede vender como **paquete «Fiscal y PLD»**.
2. **Paquetes adicionales** (+usuarios, +espacio, +créditos de IA, **+un módulo suelto**) para personalizar sin crear planes nuevos.
3. **Sobrescrituras y precio pactado por cliente** (negociar sin tocar el catálogo) + «aplicar a N clientes».
4. **Plan público / privado:** planes ocultos al catálogo para ofertas a medida.
5. **Descuentos por duración** (trimestral −5 %, semestral −10 %, anual = 2 meses gratis) en la tabla de precios, y **cupones** simples.
6. **Usuarios invitados gratis** (clientes del portal PBC, AUDITEE, READ_ONLY) — ya propuesto; es un argumento comercial: «invita a tus clientes sin costo».

**Valor medio (etapa B/C):**
7. **Cuotas de recursos caros:** minutos de **transcripción** de audio/video (evidencia de campo, corre en tu CPU), páginas de **OCR**, **firmas electrónicas enviadas/mes** (correo + sellado de tiempo), **correos salientes**, tamaño máximo por archivo.
8. **Límites de volumen operativo** *(opcionales, para crear escalón)*: **clientes en cartera** (Externa), **auditorías activas**, entidades auditables. Ninguna de tus 3 apps los usa; solo si ves que un plan barato se queda con demasiado.
9. **Nivel de soporte** por plan (correo / prioritario / con onboarding y capacitación incluidos) — para empresas e institucionales es parte de lo que compran.
10. **Plan educativo / ONG / gobierno** con descuento (universidades y entes públicos compran distinto).
11. **Datos de demostración** al iniciar la prueba (clon liviano de Empresa Demo) para que el cliente vea valor el primer día.

**Para después:** retención/exportación de datos como diferenciador, API e integraciones (conectores de datos ya existen), dominio propio para el portal PBC, facturación consolidada para grupos de empresas.

### 10.7 Lo que cambia en el diseño técnico (respecto a §4)
- **Tablas:** `Plan` gana `audiencia`, `modulos[]`, `funciones[]`, `asistentes[]`, `diasPrueba`; nueva `PlanPrecio` (plan × meses de licencia); `Subscription` guarda los **meses de licencia elegidos** y la instantánea de módulos/asistentes. (Sigue siendo SQL aprobado uno por uno.)
- **API:** `@RequiresModule()` y `@RequiresFeature()` leen de `EntitlementsService` (misma caché y mismo modo `observar` → `enforce`); el chat de IA verifica `asistentes`.
- **Web:** el `Sidebar` deja de leer `auditModality` y lee la lista de módulos del plan (**un solo origen de verdad**); `auditModality` queda derivado para no romper lo existente.
- **Esfuerzo:** F1 sube de ~5–6 a **~7–8 días** (el decorador por módulo toca ~20 controladores y la pantalla de «no está en tu plan»); sin cambio en F2–F4. **Ejecutar con Sonnet; revisar con Opus 5.5** el cierre de acceso por API (es seguridad multi-tenant: un módulo mal protegido regala funciones de pago).
- **Riesgo nuevo y real:** el hueco clásico «el menú lo oculta pero el API sigue abierto». Se cubre con una **prueba automática que recorre todos los controladores** y falla si alguno no declara su módulo (o `NUCLEO`/público).

**Maqueta navegable (2026-11-21):** catálogo público, editor de plan, «Mi plan», módulo fuera del plan y suscripciones/pagos del superadmin, en un lienzo de Claude (artefacto privado del usuario). Los precios y datos son de ejemplo.

### 10.8 Preguntas nuevas (se suman a las de §9)
9. ~~¿Paquetes prearmados o a la carta?~~ **DECIDIDO (2026-11-21): paquetes prearmados** + ajuste por cliente (sobrescrituras y paquetes adicionales).
10. ~~¿Qué va siempre en el núcleo?~~ **DECIDIDO (2026-11-21): el núcleo propuesto** — Dashboard, Proyectos de auditoría, Papeles, Hallazgos y Administración básica.
11. ¿**Persona** limita a una sola organización y a 1–2 usuarios? ¿Pueden pasar a Empresa sin perder datos? (propongo que sí: cambiar de plan conserva todo).
12. ¿Las **bases RAG** (Fiscal, PLD…) como paquete aparte, o incluidas según el plan?
13. ¿Quieres **limitar clientes en cartera / auditorías activas** en los planes baratos, o solo usuarios, espacio e IA?
