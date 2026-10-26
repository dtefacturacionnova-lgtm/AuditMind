# Diseño: calendario de cobros, facturas y cobros de honorarios (Fase 3)

Estado: **diseño v4 para arrancar** (2026-10-23). Ya con la revisión independiente (sección 10) y con las respuestas del despacho (sección 9). No hay código. Parte de lo que pidió el despacho: facturar dentro de AuditMind **solo registrando** (sin facturación en línea ni con Hacienda), programar los pagos a partir del contrato y registrar cada cobro asociándolo, total o parcialmente, a una o varias facturas, como en el módulo de cuentas por cobrar de Nexus Finance; ahora **incluye** notas de crédito, castigo de incobrables y gestión de cobro. Complementa `docs/horas-cierre-y-honorarios-propuesta.md` (sección 3).

## 0. ¿Se puede adaptar lo de Nexus sin programar de cero?

**En parte, y lo más caro de acertar sí se hereda.** Nexus es Next.js con funciones de Postgres (Supabase); AuditMind es NestJS con Prisma. No se puede copiar y pegar. Lo que sí se hereda:

| Se hereda | Cómo |
|---|---|
| Las **reglas** de aplicar un cobro a facturas, anular y quitar aplicaciones (`ar_apply_payment`, `ar_void_payment`), las de la nota de crédito (`ar_post_credit_note`) y las notas de gestión de cobro (`ar_collection_notes`) | Se reescriben en servicios de NestJS con transacción; los algoritmos y casos de borde ya están definidos |
| `ar-payment-allocation.ts` (154 líneas de TypeScript puro: reparto, validación de la lista, pre-chequeo) | Se copia **con tres cambios obligatorios**: acepta los ids `cuid` de AuditMind (Nexus exige UUID y toda aplicación daría 400), los estados cobrables son OPEN/PARTIAL, y el reparto ordena por vencimiento |
| Las pruebas puras de esa librería (~230 líneas) | Se portan a Jest |
| Pantallas «Registrar cobro» (elegir facturas pendientes con monto «Abonar»), detalle del cobro con anulación, antigüedad por cliente | Se adaptan al estilo de AuditMind |
| Los **defectos** de Nexus identificados | No se repiten (sección 7) |

**No se trae:** facturación electrónica con Hacienda, contabilidad, inventario, comisiones, mandantes, plantillas recurrentes, recibos, anticipos como entidad.

Estimación honesta del código nuevo, con todo lo que ahora incluye: SQL ~500 líneas; backend ~1.400 líneas más ~1.950 de pruebas; web ~2.100 líneas. Es menos que partir de cero, pero **no es poco**: lo que Nexus ahorra es el diseño y los errores ya descubiertos, no escribir el código.

## 1. Qué hay hoy y qué falta (verificado contra el código)

- El honorario vive en `Proposal.feeAmount`: **es neto** (la carta dice «más los impuestos que correspondan») y `feeCurrency` es texto libre de 3 letras, no siempre USD.
- La **forma de pago no está sistematizada**: solo la plantilla de respaldo de la propuesta dice «Forma de pago: [a definir]»; la carta no la menciona. El calendario no se puede leer del contrato: se **genera dentro del sistema** a partir del honorario.
- **El encargo de Cartera (`Engagement`) está hecho solo para auditoría financiera:** `approve()` crea una `Audit` de tipo `EXTERNAL_FINANCIAL` con título «Auditoría EEFF» y objetivo de dictamen, arma el índice de papeles de esa auditoría y exige un cliente ACTIVE. Además es único por cliente y año (`@@unique([clientId, fiscalYear])`). **Una consultoría no cabe**, y tampoco dos trabajos del mismo cliente en el mismo año.
- Una carta puede servir a varios ejercicios y `EngagementsService.create` no impide reutilizarla: copiar el honorario de la propuesta a cada encargo puede duplicarlo.
- Al aprobar un encargo la auditoría se crea con `estimatedHours: 0` y `budgetedHours` por persona es opcional: puede no haber presupuesto de horas.
- No existe nada de facturas ni de cobros. La rentabilidad toma el 100 % del honorario como ingreso desde el primer día.
- **Auditoría interna no se costea ni se factura** (solo hay planilla de pago): todo este módulo —honorarios, facturas, cobros, rentabilidad— es de la modalidad **externa** (Cartera). Las horas de auditoría interna se registran y se cierran igual, pero no tienen costo ni ingreso.

## 2. Conceptos y flujo

```
Contrato (propuesta + carta) ─► Encargo (auditoría o consultoría) ─► Honorario ─► Calendario de cobros
                                          │ horas y costos                          │ "Registrar factura emitida (DTE)"
                                          ▼                                         ▼
                                   Devengado / margen              Factura ◄── Cobro (total o parcial, a 1..n facturas)
                                                                      │ ◄── Nota de crédito / Castigo
                                                                      └── saldo · vencida · antigüedad · gestión de cobro
```

1. **Encargo.** Toda facturación cuelga de un **encargo**, sea auditoría o **consultoría** (las dos llevan horas y costos; la consultoría es menos rigurosa en papeles). Esto reemplaza la idea de «facturas sueltas».
2. **Honorario del encargo.** Total **neto** en USD, copiado una vez de la propuesta (solo si está en USD y no se usó ya en otro encargo) o escrito a mano. Los cambios de alcance son **adendas**.
3. **Calendario de cobros** según contrato: cuotas, hitos y, si el contrato lo prevé, un **anticipo** (es una cuota más; no hay entidad aparte). Se genera con un asistente y se edita mientras no esté facturado. La fecha de cada cuota es la **fecha programada de facturación**.
4. **Factura registrada (DTE).** Se emite en el sistema de DTE del despacho; aquí **solo se registra**. A partir de diciembre de 2026 todo se emite como DTE, así que el **número de control** del DTE es el número de la factura (y se guarda también el código de generación). El **vencimiento es la fecha de factura + 30 días** (el plazo está en el honorario; se puede cambiar en una factura).
5. **Cobro.** Dinero recibido; se **aplica** a una o varias facturas del mismo cliente por el monto que se quiera. Lo no aplicado queda como **saldo a favor**. No se emiten recibos. Las **retenciones** que practica el cliente pueden aparecer **al emitir la factura** (por ejemplo, la retención de IVA que lleva el propio DTE) o **al pagar** (por ejemplo, la de renta): ambas se registran como movimientos que reducen el saldo sin ser dinero recibido.
6. **Nota de crédito** (reduce lo facturado), **castigo** (da por incobrable un saldo) y **gestión de cobro** (llamadas, promesas de pago, seguimientos).
7. **Saldos.** Todo se deriva. Pactado, devengado y facturado van en **neto**; «por cobrar» es la suma de saldos de las facturas, nunca `facturado − cobrado`.

## 3. Modelo de datos

Todo aditivo, SQL aplicado a mano con su reversa, RLS activo y sin permisos para `anon`/`authenticated`. Como la API entra a la base con un rol que se salta RLS, **la separación entre organizaciones y clientes se impone con claves foráneas compuestas en el SQL**. Las tablas de dinero usan `ON DELETE RESTRICT` (un encargo o cliente con dinero registrado no se borra por cascada). Montos `Decimal(12,2)`; los repartos se calculan en centavos enteros. Fechas `@db.Date`, comparadas con «hoy» en la zona de El Salvador (`todayInSalvador()` ya existe).

### 3.0 Cambio previo en `engagements`: consultorías
| Cambio | Detalle |
|---|---|
| Columna `kind` | AUDIT (por defecto, lo existente) o CONSULTING |
| Columna `title` | Nombre visible («Asesoría tributaria 2026»); para las auditorías existentes queda vacío |
| Unicidad | Se **elimina** `UNIQUE(clientId, fiscalYear)` y se reemplaza por un índice único **parcial** `WHERE kind = 'AUDIT'`: sigue habiendo una auditoría por cliente y año, pero cualquier cantidad de consultorías |
| Índices únicos nuevos | `(id, clientId)` y `(organizationId, id)`, para las claves compuestas de abajo |
| `approve()` | Si es CONSULTING crea la `Audit` como tipo `OPERATIONAL`, subtipo `CONSULTORIA`, con el título del encargo, **sin** el índice de papeles de auditoría financiera y con **tres etapas básicas**: Planificación (`PLANNING`), Ejecución (`FIELDWORK`) e Informes y cierre (`REPORTING`). No lleva plantilla de papeles: depende del tipo de consultoría y se define después, a demanda |
| `create()` | La verificación de duplicado solo aplica a AUDIT; el formulario de Cartera pide el tipo y el título |

### 3.1 Tablas de cobros
| Tabla | Para qué | Columnas y reglas clave |
|---|---|---|
| `engagement_fees` | Honorario (1 a 1 con el encargo) | `engagementId` único; `feeType` (FIXED o TIME_BASED) **inmutable desde la primera cuota o factura**; `totalAmount` neto (nulo si y solo si es TIME_BASED); `source` (PROPOSAL o MANUAL); `proposalId` **único cuando no es nulo**; `paymentTermDays` (30 por defecto); `progressMethod` (HOURS, MILESTONES, MANUAL) y `manualProgressPct` (CHECK 0-100, solo MANUAL) |
| `engagement_fee_amendments` | Adendas | `feeId`, `date`, `reason`, `amountDelta` (≠ 0), `createdById` |
| `billing_schedule_items` | Calendario | `engagementId`, `sequence` (único por encargo, **nunca se renumera**), `label`, `kind` (INSTALLMENT, MILESTONE, ADVANCE), `dueDate` (fecha programada de facturación), `amount` (> 0), `status` (PLANNED, INVOICED, CANCELLED), `completedAt`. El vínculo con la factura vive **solo** en la factura |
| `client_invoices` | Facturas registradas (DTE) | `clientId`, **`engagementId` obligatorio**, `scheduleItemId?`, `invoiceNumber` (número de control del DTE), `generationCode?` (código de generación), `documentType` (código del tipo de DTE, p. ej. 03 comprobante de crédito fiscal), `invoiceDate`, `dueDate`, `netAmount`, `taxAmount`, `totalAmount` (CHECK `= neto + IVA`), caches `paidAmount`, `withheldAmount`, `creditedAmount`, `writtenOffAmount`, `status` (OPEN, PARTIAL, SETTLED, VOID), datos de anulación |
| `client_credit_notes` | Notas de crédito (DTE 05) | `clientId`, `engagementId`, `invoiceId` (factura original), `creditNoteNumber` (número de control), `generationCode?`, `issueDate`, `netAmount`, `taxAmount`, `totalAmount`, `reason` (≥ 10 caracteres), `status` (ACTIVE, VOID), datos de anulación |
| `client_payments` | Cobros | `clientId`, `paymentDate`, `amount` (> 0), `appliedAmount`, `method` (TRANSFER, CHECK, CASH, CARD, OTHER), `reference?`, `notes?`, `status` (ACTIVE, VOID), `clientRequestId?` (único por organización), datos de anulación. **Sin número de recibo** |
| `payment_applications` | **Movimientos** de aplicación (solo se agregan) | `organizationId`, `clientId`, `paymentId`, `invoiceId`, `amount` (> 0), `appliedOn`, `reversedAt?`, `reversedById?`, `reverseReason?`. Sin unicidad por par: aplicar dos veces a la misma factura son dos renglones; vigente = `reversedAt` nulo |
| `invoice_withholdings` | **Retenciones** que practica el cliente (movimientos que solo se agregan) | `organizationId`, `clientId`, `invoiceId`, `paymentId?` (si se practicó al pagar), `taxType` (IVA, RENTA, OTHER), `amount` (> 0), `appliedOn`, `certificateNumber?` (comprobante de retención del cliente), `reversedAt?`, `reversedById?`, `reverseReason?`. **No es dinero recibido**: no consume el monto del cobro |
| `client_write_offs` | Castigos de incobrables | `clientId`, `invoiceId`, `amount` (> 0), `writtenOffOn`, `reason` (≥ 10), `status` (ACTIVE, REVERSED), `reversedAt?`, `reversedById?`, `reverseReason?` |
| `collection_notes` | Gestión de cobro | `clientId`, `invoiceId?`, `engagementId?`, `contactedOn`, `method` (CALL, EMAIL, WHATSAPP, VISIT, MEETING, OTHER), `contactName?`, `note`, `promiseDate?`, `promiseAmount?`, `promiseStatus` (PENDING, KEPT, BROKEN, CANCELLED; nulo si no hay promesa), `nextFollowUpOn?`. Solo se agregan |
| `collection_logs` | Bitácora de todo lo anterior | `entityType`, `entityId`, `action`, `actorId`, `before`, `after`, `note`; un disparador rechaza `UPDATE` y `DELETE` |

**Integridad impuesta en la base (no solo en el servicio):**
- `payment_applications`, `invoice_withholdings`, `client_credit_notes`, `client_write_offs` y `collection_notes` llevan `organizationId` y `clientId` con claves foráneas **compuestas** `(organizationId, clientId, id)` hacia facturas y cobros (índices únicos en ambas). Un cobro no puede aplicarse a una factura de otra organización ni de otro cliente, ni por error de código ni por un script.
- `client_invoices`: `(engagementId, clientId)` → `engagements(id, clientId)`; `(scheduleItemId, engagementId)` → `billing_schedule_items(id, engagementId)`. `engagement_fees` y `billing_schedule_items` se atan a `(organizationId, engagementId)`.
- Unicidad **parcial** `WHERE status <> 'VOID'` en `client_invoices(scheduleItemId)`, `(organizationId, invoiceNumber)` y `(organizationId, generationCode)`; igual para las notas de crédito. Una factura anulada libera su cuota y su número.
- **Saldo** = `total − retenido − creditado − pagado − castigado`, y `CHECK saldo ≥ 0`. **Estado** coherente por `CHECK`: `VOID ⇒` todos los acumulados en 0; `OPEN ⇒` todos en 0; `PARTIAL ⇒ saldo > 0` y algún acumulado > 0; `SETTLED ⇒ saldo = 0`. En el cobro: `0 ≤ applied ≤ amount`.
- Los acumulados (`paid`, `withheld`, `credited`, `writtenOff`, `applied`) son una **caché** que solo escriben las transacciones de cada operación. Una **consulta de invariantes** (Σ aplicaciones vigentes = pagado; Σ retenciones vigentes = retenido; Σ notas de crédito activas = creditado; Σ castigos activos = castigado; estados coherentes; cuotas dentro del honorario) corre al final de cada prueba y como chequeo de solo lectura en producción.
- **Antigüedad a una fecha de corte (`asOf`):** `total − Σ aplicaciones, retenciones, notas de crédito y castigos vigentes a esa fecha` (cada uno con su fecha y su fecha de reversa), así una anulación posterior no reescribe el pasado. «Vencida» no es un estado: es saldo > 0 y `dueDate` anterior a hoy.

## 4. Reglas de negocio

### 4.0 Orden único de candados
Toda operación toma los candados en este orden: **1.** encargo (`pg_advisory_xact_lock(hashtext('collections:eng:'||id))::text`, el patrón del cierre de horas) → **2.** cobro (`FOR UPDATE`) → **3.** facturas, por id (`FOR UPDATE`) → **4.** cuota / nota de crédito / castigo. Las escrituras de estado son **condicionales** (`updateMany … where status = … and paidAmount = …` exigiendo `count = 1`), como ya hace `engagement-letters.service.ts`.

### 4.1 Honorario y calendario (quién: dirección)
- **Honorario:** solo la dirección lo define o cambia. `totalAmount` se escribe directo **solo mientras no existan cuotas ni facturas**; después, solo por **adenda**. Importar de la propuesta solo si `feeCurrency = USD`; si no, a mano.
- **Generar** con tres modos: **cuotas iguales** (cantidad, primera fecha, cada 1, 2 o 3 meses; si el día no existe se usa el último del mes: 31-ene → 28-feb), **por hitos** (etiqueta, porcentaje o monto, fecha) o **pago único**. La última cuota absorbe los centavos; la suma se valida en centavos. Un **anticipo** es una cuota de tipo ADVANCE. Base del reparto: `honorario − facturado neto`; las cuotas nuevas continúan la numeración (`max(sequence) + 1`).
- **Facturado neto** = Σ neto de facturas no anuladas − Σ neto de notas de crédito activas. **Invariante único:** `facturado neto + Σ cuotas PLANNED ≤ honorario`; lo no cubierto se muestra como «sin programar». Una nota de crédito libera espacio; anular una nota de crédito se rechaza si rompería el invariante.
- **Adenda:** sube o baja el honorario; si baja, se rechaza cuando rompería el invariante y el mensaje dice cuánto recortar de las cuotas planeadas.
- Editar o cancelar una cuota solo si está PLANNED. Las cuotas de un encargo cancelado se cancelan con él. **Por tiempo (TIME_BASED)** no tiene calendario ni honorario fijo; se factura libremente (consultorías por horas).
- Todo bajo el candado del encargo: una adenda, una regeneración, una nota de crédito y «registrar factura desde cuota» no se pisan.

### 4.2 Facturas (gerente registra; dirección anula)
- **Desde una cuota:** precarga monto y etiqueta; `invoiceDate` por defecto hoy; **`dueDate = invoiceDate + paymentTermDays`** (30). Siempre con encargo. Al registrarla se pueden anotar las **retenciones que trae el DTE** (tipo y monto): quedan como movimientos con la fecha de la factura.
- **Editar:** sin movimientos, todo; con cobros, retenciones, notas de crédito o castigos, solo fechas y descripción, nunca neto ni IVA (las retenciones se corrigen con sus propios movimientos, 4.4). **Anular:** solo sin cobros, retenciones, notas de crédito ni castigos vigentes, bajo `FOR UPDATE` y escritura condicional, motivo ≥ 10; la cuota vuelve a PLANNED y el número queda libre.
- **La cuota al anular:** vuelve a PLANNED solo por lo que cabe (`honorario − facturado vigente − programado`); si la factura era por menos que la cuota y el resto ya se reprogramó, regresa con ese monto menor. Cada cambio de estado de una cuota queda en la bitácora.
- **Al anular** se revierten solas las retenciones que solo viven en la factura (las del DTE y las que llegaron tarde), con la nota «Anulación de la factura»; las retenciones practicadas dentro de un cobro bloquean la anulación hasta quitar o anular ese cobro.
- Una factura VOID nunca recibe cobros, retenciones, notas de crédito ni castigos.

### 4.3 Cobros y aplicación (reglas heredadas de `ar_apply_payment`)
**Registrar un cobro** (una transacción): cliente de la organización, fecha no futura (en El Salvador), monto > 0 y ≤ 2 decimales; cobro; aplicaciones de dinero si las hay y **retenciones practicadas en este pago** si las hay (`[{ invoiceId, taxType, amount, certificateNumber? }]`). **Todo o nada**: una aplicación inválida rechaza el cobro entero. Sin aplicaciones queda como saldo a favor (en la práctica casi no habrá anticipos fuera del calendario). Idempotencia: el mismo `clientRequestId` devuelve el cobro ya creado **solo si la huella del contenido coincide** (cliente, fecha, monto, forma, referencia, notas, reparto automático, aplicaciones Y retenciones; la huella se guarda en la bitácora del cobro); si difiere, 409.

**Aplicar `[{ invoiceId, monto }]`:** valida la lista sin tocar la base (no vacía, ids válidos, monto > 0 y ≤ 1.000.000.000, ≤ 2 decimales, sin facturas repetidas) → cobro `FOR UPDATE` (404 / 409 si VOID / 422 si la suma excede lo no aplicado) → facturas por id `FOR UPDATE`, cada una del mismo cliente (422), OPEN o PARTIAL (409) y monto ≤ saldo (422) → escribe los renglones, `paid`, el estado y `applied`. Si el pago trae retenciones, para cada factura se valida **dinero aplicado + retenciones nuevas ≤ saldo** bajo los mismos candados; las retenciones no consumen el monto del cobro.

**Más antiguas primero:** por **vencimiento**, desempate por número con orden natural.

**Quitar una aplicación** y **anular un cobro** (dirección; motivo ≥ 10): mismo orden de candados, se **leen las aplicaciones vigentes después del candado**, se marcan `reversedAt` (no se borran), se devuelve lo aplicado y se recalcula el estado de cada factura.

### 4.4 Retenciones de impuestos (gerente registra; dirección revierte)
El despacho confirma que las retenciones ocurren **al emitir la factura y también al pagar**, así que se modelan como **movimientos** de la factura (`invoice_withholdings`), no como un monto fijo:
- **Al emitir:** se anotan al registrar la factura (las que ya trae el DTE), con la fecha de la factura.
- **Al pagar:** se anotan en el mismo cobro (sección 4.3), vinculadas a él, con la fecha del pago y el número del comprobante de retención si el cliente ya lo entregó.
- **Después:** si el comprobante llega tarde, se agrega la retención a la factura en cualquier momento (`POST invoices/:id/withholdings`), con su fecha; bajo el candado de la factura, saldo resultante ≥ 0, y en la bitácora.
- **Corregir:** una retención mal anotada se **revierte** (dirección, motivo) y se vuelve a anotar; nunca se edita. Así la antigüedad a una fecha de corte y la bitácora quedan exactas.
- Como el saldo descuenta lo retenido, una factura cobrada neta de retención llega a SETTLED, que es lo que Nexus no hacía. Las tasas (1 % de IVA, 10 % de renta, cuándo aplican) las puede **sugerir** la pantalla, pero no se imponen: están pendientes de validar con el contador (sección 9).
- Un reporte de **retenciones sufridas** (por periodo, tipo de impuesto y cliente) entrega la lista de comprobantes para las declaraciones (fase 3c).

### 4.5 Nota de crédito (dirección registra)
- Ligada a **una** factura OPEN o PARTIAL del mismo cliente y encargo, con su propio número de control DTE (único), fecha, neto, IVA y motivo ≥ 10. Una nota de crédito de **total** ≤ **saldo** de la factura: si el cliente ya pagó, primero se **quita la aplicación** (queda saldo a favor, que se puede aplicar a otra factura o devolver fuera del sistema) y luego se registra la nota.
- Efectos: `creditedAmount` de la factura sube y el estado se recalcula (SETTLED si el saldo llega a 0); lo **facturado neto** del encargo baja; no reabre la cuota. Las retenciones no se ajustan solas: si hace falta se revierten y se vuelven a anotar (4.4), y el saldo nunca puede quedar negativo.
- **Anular una nota de crédito** (dirección, motivo): devuelve el saldo y se rechaza si rompe el invariante del calendario (4.1).
- Una factura con notas de crédito vigentes no se anula (se anulan primero las notas).

### 4.6 Castigo de incobrables (dirección)
- Sobre una factura OPEN o PARTIAL, por un monto **> 0 y ≤ saldo** (castigo **parcial real**: el resto sigue vivo en la antigüedad y en los saldos), con fecha y motivo ≥ 10.
- Efectos: `writtenOffAmount` sube, el saldo baja, el estado se recalcula. La antigüedad **excluye** lo castigado; el resumen del encargo lo muestra aparte como «castigado».
- **Reversar** un castigo (dirección, motivo): restaura el saldo, salvo que la factura esté VOID. Nada de esto toca lo cobrado.

### 4.7 Gestión de cobro (gerente o superior)
- Notas de contacto que solo se agregan, por cliente y, si aplica, por factura o encargo: medio, persona contactada, qué se habló, **promesa de pago** (fecha y monto, con estado PENDING / KEPT / BROKEN / CANCELLED) y próxima fecha de seguimiento.
- El estado de la promesa lo cambia el gerente; el sistema solo **sugiere** «posible cumplida» cuando los cobros posteriores a la nota cubren el monto prometido. Una promesa pendiente con fecha pasada se marca como vencida.
- **Alertas** (derivadas, sin tareas programadas): promesas vencidas, seguimientos de hoy o atrasados, y facturas vencidas sin gestión registrada en los últimos 15 días (configurable).

### 4.8 Devengado y rentabilidad (el cambio de cálculo; fase 3c)
- **Fuente única del honorario:** desde 3a la rentabilidad y «Cobros» leen el honorario de `engagement_fees` (si no hay fila, el de la propuesta, como hoy).
- **Avance por horas** = horas **facturables** (`CLIENT_BILLABLE`) ÷ horas presupuestadas del encargo. **Sin presupuesto completo** (alguien con horas sin presupuesto, o presupuesto 0) el avance es **nulo**: la rentabilidad devengada muestra «sin presupuesto de horas». Tope 100 %, que se alcanza al emitirse el informe final (papel disparador firmado). Por hitos: Σ de cuotas con `completedAt` ÷ honorario. Manual: solo la dirección.
- **Es recalculable** (cambia con el presupuesto o con una adenda) y se calcula con corte (`asOf`) para el Comité.
- **Por facturar** = devengado − facturado neto, sin negativos. El margen devengado se agrega **junto** al margen sobre el honorario total. Los castigos se muestran aparte.
- **Consultorías por horas (TIME_BASED):** el ingreso es lo facturado; la selección de horas cerradas para facturar es de la Fase 4.

## 5. Interfaz del servidor y permisos

Controlador `collections` (NestJS), `@Roles` como primera barrera y el servicio vuelve a comprobar.

| Acción | Quién |
|---|---|
| Ver calendario, facturas, cobros, saldos, antigüedad, estado de cuenta, alertas | Gerente de auditoría o superior |
| Registrar factura, registrar cobro, aplicar cobro, anotar retenciones, registrar notas de gestión de cobro | Gerente o superior |
| Definir o cambiar el honorario, adendas, generar o editar el calendario, anular factura, anular cobro, quitar una aplicación, **revertir retenciones, registrar o anular notas de crédito, castigar y reversar castigos**, avance manual | Dirección (CAE o superior) |

Rutas principales: `GET/PUT engagements/:id/fee`, `POST engagements/:id/fee/amendments`, `POST engagements/:id/schedule/generate`, `PATCH/DELETE schedule/:itemId`, `POST schedule/:itemId/invoice`, `POST/GET invoices`, `PATCH invoices/:id`, `POST invoices/:id/void`, `POST invoices/:id/withholdings`, `POST withholdings/:id/reverse`, `POST invoices/:id/credit-notes`, `POST credit-notes/:id/void`, `POST invoices/:id/write-offs`, `POST write-offs/:id/reverse`, `POST/GET payments`, `POST payments/:id/apply`, `POST payments/:id/applications/:applicationId/remove`, `POST payments/:id/void`, `POST/GET collection-notes`, `PATCH collection-notes/:id/promise`, `GET alerts`, `GET reports/aging?asOf=`, `GET reports/withholdings?from=&to=`, `GET clients/:id/statement`, `GET engagements/:id/collections-summary`.

## 6. Pantallas

1. **Cartera › Nuevo encargo:** selector de tipo (Auditoría o Consultoría) y título. El menú «Cobranza» y todo lo de honorarios aparece **solo en organizaciones con modalidad externa** (o ambas).
2. **Cartera › Encargos › «Cobros»** (junto al panel de rentabilidad): honorario y adendas, calendario con chips de estado (programada, facturada, parcial, pagada, vencida) y «Registrar factura», asistente de «Generar calendario», resumen pactado / devengado / facturado / cobrado / castigado / por cobrar.
3. **«Cobranza»** (menú nuevo): por cobrar (facturas con filtros y semáforo), cobros, **Registrar cobro** con las retenciones practicadas en ese pago (adaptado de `payments/new` de Nexus), alertas y gestión de cobro (línea de tiempo de contactos y promesas por cliente o factura).
4. **Detalle de la factura:** movimientos (cobros aplicados, notas de crédito, castigos), «Registrar nota de crédito» y «Castigar» (dirección), notas de gestión.
5. **Detalle del cobro:** aplicaciones, aplicar el saldo a favor, quitar una aplicación, anular con motivo. Sin recibo.
6. **Antigüedad por cliente** (corriente, 1-30, 31-60, 61-90, más de 90 **días vencidos**, con fecha de corte) y **estado de cuenta** en PDF.

### 6.1 CRUD en las pantallas (pedido del despacho, 2026-10-23) — construido en 3b
Implementado: `apps/web/src/components/collections/` (panel «Cobros» del encargo, ventanas de honorario, adenda, calendario, factura, retención y cobro) y la página `/dashboard/collections` (Por cobrar · Cobros · Retenciones).
Cada pantalla de la fase 3b ofrece **crear, ver (lista y detalle), editar y eliminar** lo que le corresponde. En lo que es dinero, «eliminar» no es borrar la fila: es **anular o revertir con motivo**, porque la base lo impide a propósito (`ON DELETE RESTRICT`) y porque un auditor debe poder reconstruir cualquier saldo a cualquier fecha. Solo lo que no mueve dinero se borra de verdad.

| Entidad | Crear | Ver | Editar | Eliminar |
|---|---|---|---|---|
| Honorario | Definir (dirección) | Detalle con adendas | Monto solo sin cuotas ni facturas; después, adenda | Borrar solo si no tiene adendas, cuotas ni facturas |
| Adenda | Agregar | En el honorario | — (se corrige con otra adenda en sentido contrario) | — |
| Cuota del calendario | Generar o agregar a mano | Calendario del encargo | Etiqueta, fecha y monto mientras esté PLANNED | Cancelar (PLANNED); borrar solo si nunca tuvo factura |
| Factura | Desde cuota o libre | Lista con filtros, detalle con movimientos | Fechas y descripción; todo si no tiene movimientos | **Anular** con motivo (sin movimientos vigentes) |
| Cobro | Registrar (con aplicaciones y retenciones) | Lista y detalle | Fecha, forma, referencia y notas; el monto solo si no tiene aplicaciones ni retenciones | **Anular** con motivo (revierte sus aplicaciones) |
| Aplicación | Aplicar | En el cobro y en la factura | — | **Quitar** con motivo |
| Retención | Anotar (al emitir, al pagar o después) | En la factura | — (se revierte y se vuelve a anotar) | **Revertir** con motivo |
| Nota de crédito, castigo (3d) | Registrar | En la factura | — | Anular o reversar con motivo |
| Nota de gestión de cobro (3d) | Agregar | Línea de tiempo | El texto, por su autor o la dirección, dejando la versión anterior en la bitácora | Borrar por su autor o la dirección, con rastro en la bitácora |
| Encargo / consultoría | Nuevo encargo (tipo y título) | Cartera | Título y datos del encargo | Cancelar (como hoy) |

Rutas que esto agrega a las de la sección 5: `GET engagements/:id/fee/amendments`, `DELETE engagements/:id/fee`, `POST schedule` (cuota a mano), `GET schedule/:itemId`, `GET invoices/:id`, `GET payments/:id`, `PATCH payments/:id`, `GET withholdings`, `PATCH collection-notes/:id`, `DELETE collection-notes/:id`. Cada formulario de edición muestra por qué un campo está bloqueado (por ejemplo «tiene cobros aplicados») en vez de ocultarlo.

## 7. Defectos de Nexus que no se copian

| Defecto en Nexus | Cómo se evita |
|---|---|
| El saldo pagado se puede descuadrar de la suma de aplicaciones; sin CHECK | CHECK de estado y rangos + transacciones únicas + consulta de invariantes |
| `balance_due` no resta las retenciones: una factura cobrada neta de retención nunca llega a pagada | Las retenciones son movimientos que descuentan el saldo; con fecha, reversibles y auditadas |
| Anticipos con lógica vieja, sin bloqueo ni validación de cliente | No hay entidad: el anticipo es una cuota del calendario |
| `auto-apply-payment` que solo suma montos | No existe |
| **Castigo parcial deja la factura como «castigada»** (el saldo desaparece del aging) y no se puede deshacer | Castigo parcial real, con estado por saldo, y reversible |
| Anular un cobro deja `unapplied = total` en una fila VOID | Las sumas filtran `status = ACTIVE` |
| Recibo con `MAX()+1`, sin índice único, asignado en un GET | No hay recibos |
| «Cobrado del mes» usa la fecha de aplicar | Usa `paymentDate` |
| Vencimiento en hora local; plazos decorativos | `dueDate` explícito (fecha de factura + plazo), zona de El Salvador |
| Cobro registrado pero sin aplicar si falla la aplicación | Todo o nada |
| Sin idempotencia en crear cobro | `clientRequestId` con comparación del contenido |
| Aging con columna `days_over_90` que guarda dólares; solo a «hoy» | Nombres claros y fecha de corte reconstruible |
| Alerta de promesas con el nombre de columna equivocado y `promise_kept` nulo contra falso | Estado explícito de la promesa (enum) |
| Sin pruebas de concurrencia; RLS que no separa organizaciones | Claves compuestas en la base y pruebas con un Postgres real |

## 8. Pruebas obligatorias

La base en memoria del cierre de horas serializa las transacciones, devuelve vacío en `$queryRaw`, no aplica CHECK ni claves foráneas, genera `randomUUID` y guarda números de JavaScript, mientras que Prisma devuelve `Decimal`. Por eso:

1. **Unitarias puras** (copiadas de Nexus y ampliadas): reparto, validación con ids `cuid`, calendario en centavos (incluido el 31 de enero), antigüedad con corte.
2. **Servicio con una base en memoria mejorada:** `Prisma.Decimal`, ids `cuid`, unicidades y CHECK de las tablas nuevas.
3. **Concurrencia real** contra un **Postgres desechable** (Docker en local, o una rama de Supabase; **Docker está instalado pero apagado**: hay que encender Docker Desktop) con el SQL aplicado y **dos clientes Prisma**: dos aplicaciones a la misma factura, anular un cobro mientras se aplica otro, quitar una aplicación mientras se anula la factura, adenda contra facturar una cuota, **nota de crédito contra cobro sobre la misma factura**, **castigo contra cobro**, **retención contra cobro**, mismo `clientRequestId` dos veces.
4. **Invariantes** al final de cada prueba y como chequeo de solo lectura en producción.
5. **Contra la base compartida** solo lecturas (comparar cálculos); nunca concurrencia.
6. **Mutaciones** a propósito sobre cada regla de dinero, como en las fases anteriores.

## 9. Decisiones del despacho (2026-10-23) y lo que sigue abierto

**Decididas:**
- Facturación dentro de AuditMind solo como **registro**; todo se emite como **DTE** (obligatorio para todos desde diciembre de 2026, según indica el despacho): el número de factura es el número de control del DTE. El despacho confirmó **03 (comprobante de crédito fiscal) y 01 (factura)**: son los únicos que el sistema acepta hoy (exportación, sujeto excluido u otros se agregan cuando el contador defina su tratamiento). El número de control se guarda en mayúsculas y sin espacios para que el mismo DTE no entre dos veces.
- Quién hace qué: como en la sección 5.
- **Consultorías llevan encargo, horas y costos como las auditorías** (menos rigurosas): toda factura cuelga de un encargo; tipo de encargo en 3.0. **No tienen plantilla de papeles** (depende del tipo de consultoría) pero sí las **tres etapas básicas: Planificación, Ejecución e Informes y cierre**.
- Avance del devengado: **horas facturables ÷ presupuesto** (nulo si no hay presupuesto completo).
- **Anticipos:** dentro de la programación de pagos del contrato (cuota ADVANCE); sin entidad aparte.
- **Plazo de pago:** la programación fija cuándo se factura y, registrada la factura, tiene **30 días** (editable por factura). *Supuesto: contado desde la fecha de la factura.*
- **No se emiten recibos.**
- **Se incluyen** notas de crédito, castigo de incobrables y gestión de cobro (4.5 a 4.7).
- **Retenciones al emitir y al pagar** (4.4): movimientos de la factura; saldo = `total − retenido − notas de crédito − cobros − castigos`.
- **Auditoría interna no se costea ni se factura** (solo planilla de pago): este módulo es solo de la modalidad externa.

**Siguen abiertas (no bloquean el arranque):**
1. **Dudas fiscales para un contador** (no afirmadas): sobre qué base se calcula cada retención (neto o total), si tiene monto mínimo, a qué tipo de cliente aplica cada una, factura a consumidor final (el precio incluye IVA: neto = total ÷ 1,13), exportación de servicios con IVA 0 %. El diseño **no impone tasas**: solo registra montos.
2. **Plantilla de papeles de una consultoría:** se define más adelante, por tipo de consultoría.

## 10. Revisión independiente (2026-10-23)

Un segundo modelo revisó la versión 1 contra el código de AuditMind y de Nexus. Encontró 13 fallas de diseño reales y varias afirmaciones mías incorrectas; **todas están corregidas** (separación por claves compuestas, orden único de candados, honorario solo para la dirección, todo en neto, retención corregible, devengado nulo sin presupuesto, movimientos con fecha, únicos parciales, ids `cuid`, pruebas con Postgres real). Esta versión 3 añade partes nuevas (consultorías, notas de crédito, castigo, gestión de cobro) que **se revisarán con el código** de cada fase, con Opus.

## 11. Fases, tamaño y modelo recomendado

| Fase | Entrega | Modelo | Tamaño |
|---|---|---|---|
| **3-0 Encargos de consultoría** | Tipo y título del encargo, unicidad parcial, `approve()` de consultoría con sus tres etapas, formulario de Cartera. Incluye un ajuste menor del cierre de horas: no avisar «sin perfil de costeo» en organizaciones que no costean (auditoría interna) | Sonnet | Pequeña-mediana (~350 líneas con pruebas) |
| **3a Núcleo** | SQL; honorario, adendas, calendario; facturas; cobros, aplicación, quitar y anular; bitácora; pruebas con Postgres real | Diseño: este documento; construye Sonnet; **Opus revisa el código del dinero** | Grande (backend ~800 líneas + ~1.100 de pruebas) |
| **3b Pantallas** | Panel «Cobros» del encargo, asistente de calendario, «Cobranza», registrar cobro, detalle | Sonnet (adaptando Nexus) | Mediano (~1.200 líneas) |
| **3c Reportes y devengado** | Antigüedad con corte, estado de cuenta, resumen pactado / devengado / facturado / cobrado, rentabilidad devengada | Sonnet construye; **Opus revisa el cambio de cálculo** | Mediano |
| **3d Notas de crédito, castigo y gestión de cobro** | Servicios, reglas, pantallas y alertas de 4.5 a 4.7 | Sonnet; **Opus revisa** | Mediano (~500 líneas backend + ~700 de pruebas + ~700 web) |
| Después | Facturar horas de consultoría (Fase 4), cuadros de gestión | A pedido | |


## 12. Correcciones de la revisión independiente (2026-10-23)
Un revisor independiente (Opus) encontró 13 defectos, todos reproducidos y corregidos con una prueba que falla con el código anterior: (1) anular una factura devolvía la cuota entera aunque eso comprometiera más que el honorario; (2) editar el honorario sin cambiar el monto soltaba el vínculo con la propuesta y otro encargo la podía importar de nuevo; (3) la idempotencia ignoraba las retenciones; (4) cancelar el encargo no tomaba el candado del encargo; (5) un cobro anulado mostraba saldo a favor; (6) el número de control distinguía mayúsculas; (7) las claves compuestas tenían `ON UPDATE CASCADE` (ahora `RESTRICT`, ver `2026-10-cobros-3a-fix1.sql`); (8) aprobar dos veces a la vez creaba dos auditorías (ahora se reclama el paso DRAFT → APPROVED con una escritura condicional y se serializa por la fila del cliente); (9) posible interbloqueo del reparto automático (ahora un solo bloqueo ordenado); (10) el reparto automático no descontaba las retenciones del mismo pago; (11) bitácora incompleta (estados de cuota, movimientos en los detalles, adendas); (12) listas truncadas en silencio (retenciones y saldo a favor, ahora paginadas con total exacto); (13) hitos con `null`, nombre de solo espacios.

## 13. Construcción de 3c y 3d (2026-10-25)
**Hecho** (SQL `infrastructure/db-migrations/2026-10-cobros-3d.sql` + REVERSA; el SQL se aplica a mano con aprobación del despacho):
- **3d.** Tablas `client_credit_notes`, `client_write_offs` y `collection_notes` con claves foráneas compuestas (organización + cliente + factura; la nota de crédito también ata factura y encargo), CHECK de montos y estados, RLS y sin permisos para `anon`/`authenticated`. Servicios `CreditNotesService`, `WriteOffsService` y `CollectionNotesService`; rutas de §5 (`POST invoices/:id/credit-notes`, `POST credit-notes/:id/void`, `POST invoices/:id/write-offs`, `POST write-offs/:id/reverse`, `POST/GET/PATCH/DELETE collection-notes`, `PATCH collection-notes/:id/promise`, `GET alerts`). Notas de crédito y castigos solo la dirección; gestión de cobro, cualquier gerente (editar y borrar: su autor o la dirección, con la versión anterior en la bitácora). `computeCommitments` resta ahora el neto de las notas de crédito vigentes de lo facturado, y la consulta de invariantes cubre acreditado, castigado y el neto de las notas.
- **3c.** `GET reports/aging` (antigüedad por cliente, con detalle por factura) y `GET clients/:id/statement` (estado de cuenta con saldo corrido y saldo de apertura), ambos **reconstruidos a una fecha de corte** con las fechas de cada movimiento y de su reversa (`cutoff.util.ts`, zona de El Salvador); el estado de cuenta trae `reconciles` (el saldo corrido debe coincidir con la suma de saldos). `GET engagements/:id/accrual?asOf=` y el campo `accrual` del honorario: avance por horas (nulo sin presupuesto completo; 100 % con el papel disparador firmado), por hitos, manual, o lo facturado si es por tiempo (`accrual.util.ts`, `accrual.service.ts`). La rentabilidad (`ProfitabilityService`) agrega `devengado` y el margen devengado junto al margen sobre el honorario total, y el resumen de toda la organización suma lo devengado de los encargos con avance calculable.
- **Hitos cumplidos.** Ningún camino llenaba `completedAt` de las cuotas, así que el avance por hitos nunca habría devengado nada: se agregó `POST schedule/:itemId/completion` (marcar o desmarcar; un gerente; queda en la bitácora) y el botón «Marcar cumplido» del calendario.
- **Pantallas.** `/dashboard/collections` suma las pestañas «Antigüedad» (con estado de cuenta imprimible a PDF desde el navegador) y «Gestión de cobro» (alertas y línea de tiempo); el detalle de la factura muestra notas de crédito, castigos y gestión; el panel «Cobros» del encargo muestra avance y devengado.

**Alertas (4.7).** Promesas pendientes con fecha pasada; seguimientos de hoy o atrasados solo si la nota es la más reciente del cliente; facturas vencidas con saldo sin ninguna nota (de la factura o del cliente en general) en los últimos 15 días (configurable).

**Sigue abierto:** el PDF del estado de cuenta se genera con la impresión del navegador (no hay servicio de PDF en el servidor); las dudas fiscales de la sección 9; facturar horas de consultoría (Fase 4).

