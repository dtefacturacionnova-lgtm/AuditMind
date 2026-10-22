# Propuesta: cierre de horas por el gerente, honorarios mixtos y cuadros de gestión

Estado: **propuesta para decisión** (2026-10-22). No hay código cambiado. Parte de la revisión del módulo de horas, costos y rentabilidad (ver la memoria del proyecto, «project_horas_rentabilidad_revision»).

## 0. Qué se decidió con el despacho

| Tema | Respuesta |
|---|---|
| Cómo se cobra | **Mixto.** Auditorías con honorario anual pactado al inicio, que se cobra cada mes o contra entrega de informes o avances; y consultorías que se cobran de inmediato al hacer el trabajo. |
| Cierre de horas | Hoy **no hay cierre**, porque los auditores a veces registran sus horas días después. Se pidió una propuesta en la que **los auditores registran y el gerente cierra**. |
| Moneda | **Todo en dólares.** No hace falta manejar conversión de moneda. |
| Dónde se factura y se cobra | Pendiente. La propuesta funciona en cualquier caso: empieza con un registro manual de lo facturado y cobrado, y deja abierta la integración con Nexus Finance. |

Datos reales al 22-oct-2026: 91 registros de horas de 6 personas (1 jul a 22 ago), 570 horas de cliente, 1 encargo, 2 propuestas con honorario. Con tan poco uso, los cambios de esta propuesta no obligan a corregir historia.

---

## 1. Principios

1. **Registrar tarde es normal y se permite.** El cierre no castiga el retraso: da una fecha clara a partir de la cual los números ya no se mueven.
2. **Nada se pierde ni se cambia sin rastro.** Toda alta, edición y borrado de horas queda en una bitácora.
3. **Lo cerrado no se mueve.** Al cerrar un mes de una persona, sus horas, su costo por hora y su tarifa quedan fijos, así los márgenes históricos no cambian si después se edita un salario.
4. **Nadie cierra sus propias horas.** El que cierra es otro gerente o la dirección.
5. **Lo provisional se ve como provisional.** Los reportes marcan los meses abiertos.

---

## 2. Registro y cierre de horas (Fase 1)

### 2.1 Cómo funciona, de punta a punta

1. **Durante el mes y hasta el cierre**, cada auditor registra, edita y borra sus propias horas de cualquier día de ese mes. Puede entrar a días anteriores sin pedir permiso.
2. **Al terminar el mes** el sistema recuerda por correo a quienes tienen días sin horas.
3. **El gerente revisa a cada persona** en una pantalla de cierre: días hábiles con y sin horas, horas del mes contra las disponibles, avisos de calidad. Si está conforme pulsa **Cerrar**.
4. **Una vez cerrado**, la persona ya no puede crear, editar ni borrar horas fechadas en ese mes.
5. **Si falta algo después del cierre**, hay dos caminos: la persona pide un **ajuste** (con motivo) y el gerente lo aprueba o lo rechaza, o el gerente **reabre** el mes de esa persona con un motivo. Todo queda registrado.

### 2.2 Reglas

- **Unidad de cierre: persona y mes.** Cada persona se cierra por separado: quien entregó a tiempo se cierra sin esperar a los demás, y quien se atrasa no frena al resto. La vista de la firma muestra el mes como «cerrado» cuando todas sus personas lo están.
- **Quién cierra:** gerente de auditoría o un rol superior. **Un gerente no cierra sus propias horas**: las cierra otro gerente o la dirección (CAE, administrador).
- **Plazos sugeridos (se pueden cambiar por organización):** los auditores registran hasta el 5.º día hábil del mes siguiente; el gerente cierra hasta el 10.º. Pasado el plazo del auditor, el sistema no bloquea: solo avisa al gerente quién falta.
- **El cierre nunca bloquea por avisos.** Los avisos se muestran y el gerente decide:
  - días hábiles sin horas (se descuentan fines de semana y feriados del calendario de la firma);
  - horas del mes menores al 80 % o mayores al 120 % de las disponibles;
  - días con más de 12 horas;
  - horas de cliente sin descripción;
  - horas de personas sin perfil de costeo de ese año (quedarían «sin costear»).
- **Reabrir** exige gerente o superior y un motivo, y deja constancia de quién reabrió y cuándo. Mientras un mes esté reabierto, vuelve a ser provisional.
- **Al cerrar se congelan** el costo por hora de la persona (de su perfil de costeo de ese año) y su tarifa pactada por encargo. Los reportes de meses cerrados usan esos valores fijos, no los vigentes.

### 2.3 Cambios en el registro diario

Todo lo siguiente es parte de esta fase, porque el cierre no sirve si el registro es incómodo:

- **Editar horas.** Hoy solo se puede crear y borrar, y guardar dos veces el mismo día duplica el registro.
- **Horas de cliente no facturables.** Hoy la fila de cada encargo es siempre «facturable». Se agrega un interruptor facturable / no facturable, y para lo no facturable un motivo: sobrepresupuesto, retrabajo, cortesía u otro. Sin esto no se puede medir cuánto se trabajó de más ni cuánto se cobró de lo trabajado.
- **Descripción obligatoria en horas de cliente** (mínimo corto). Es el respaldo para facturar y para revisar.
- **Vista semanal**, para llenar la semana de una vez, y copiar la semana anterior.
- **Pasos de 0,25 h** en lugar de 0,5.
- **Aviso de cumplimiento** para cada persona («te faltan 3 días de octubre») y para el gerente («2 personas sin cerrar»).

### 2.4 Qué se guarda (todo aditivo, con reversa, aplicado a mano)

- `time_entries`: columnas nuevas `nonBillableReason` (motivo), `costRateSnapshot` y `billRateSnapshot` (se llenan al cerrar), `closedAt`, `afterClose` (hubo ajuste posterior al cierre).
- `hours_period_closes` (una fila por persona y mes): organización, persona, año, mes, estado (abierto o cerrado), quién cerró y cuándo, nota, y quién reabrió, cuándo y por qué. Es única por persona, año y mes.
- `time_entry_log` (solo se agrega, nunca se edita): registro, acción (alta, edición, borrado, ajuste aprobado), quién, cuándo, valores antes y después.
- `time_adjustment_requests`: persona, mes, datos de las horas que pide agregar o cambiar, motivo, estado, quién decidió y cuándo.
- Parámetros por organización: días de plazo del auditor y del gerente, y el interruptor para activar el cierre (apagado al empezar).

**Dos rutas escriben horas** (`TimesheetService` y `PlansService`). Las dos deben pasar por la misma comprobación de «mes cerrado», o el cierre se puede esquivar. Una prueba lo exige.

### 2.5 Pantallas

- **Captura de horas:** vista semanal editable, descripción, interruptor facturable, estado del mes («abierto», «cerrado el 7-nov por …») y la lista de ajustes pendientes.
- **Cierre de horas** (gerente): una tabla por mes con una fila por persona: días con horas / hábiles, horas / disponibles, avisos, estado y botones **Cerrar**, **Reabrir**, **Ver detalle**. Arriba, el resumen del mes de la firma.
- **Ajustes:** bandeja del gerente con aprobar o rechazar.

### 2.6 Pruebas obligatorias

- Un mes cerrado rechaza altas, ediciones y borrados desde las dos rutas de escritura.
- Solo gerente o superior cierra y reabre; un gerente no cierra sus propias horas.
- Cerrar congela costo y tarifa; editar después el salario no cambia el margen de ese mes.
- Reabrir exige motivo y deja constancia; la bitácora registra cada cambio con antes y después.
- Un ajuste aprobado entra al mes cerrado marcado como posterior al cierre.
- Otra organización nunca ve ni cierra horas ajenas.
- El tope diario de 20 h se mantiene al editar.

---

## 3. Honorarios mixtos (Fase 3)

### 3.1 Dos tipos de trabajo

| | Honorario anual pactado | Consultoría por trabajo realizado |
|---|---|---|
| Se pacta | Al inicio, un monto anual | Una tarifa por hora (o por entrega) |
| Se cobra | Cada mes, o contra entrega de informes o avances | Al hacer el trabajo |
| Ingreso del reporte | Se devenga según avance | Horas aprobadas × tarifa pactada |

Un encargo tiene **un solo tipo**. Una consultoría que el despacho quiera combinar con una auditoría se registra como otro encargo.

### 3.2 Qué se guarda

- **Honorario del encargo**, en el propio encargo y no solo en la propuesta: tipo (fijo o por trabajo realizado), monto total (en dólares), horas presupuestadas y cómo se mide el avance (por horas contra presupuesto, que es la opción por defecto, o por entregas).
- **Adendas:** cada cambio de alcance queda como un registro con fecha, motivo y monto, en vez de pisar el honorario original. El margen se calcula sobre el honorario vigente y se puede ver el original.
- **Calendario de cobro** (honorario fijo): una lista de eventos de cobro. Cada uno tiene etiqueta, tipo (mensual, contra entrega o contra avance), fecha o condición, monto, y su estado: planeado, facturado o cobrado.
- **Por trabajo realizado:** el sistema muestra las **horas cerradas y aún no facturadas** de cada encargo. El gerente las selecciona y crea el evento de cobro; esas horas quedan marcadas como facturadas.
- **Registro de factura (manual al empezar):** número, fecha de emisión, monto y fecha de cobro. Lo emite el sistema de facturación del despacho (DTE); aquí solo se registra. Si más adelante se integra con Nexus Finance, el registro ya tiene dónde enlazar el código de generación del DTE.

### 3.3 Cómo se lee el ingreso

Para cada encargo, y por mes:

| Columna | Significado |
|---|---|
| Pactado | El honorario vigente |
| Devengado | Lo ganado hasta hoy: honorario × avance (fijo) o horas aprobadas × tarifa (por trabajo) |
| Facturado | Lo ya facturado |
| Cobrado | Lo ya cobrado |
| Por facturar | Devengado − facturado (es el WIP verdadero) |
| Por cobrar | Facturado − cobrado |

Esto corrige el defecto actual: hoy un encargo recién empezado muestra el 100 % del honorario como ingreso desde el primer día.

---

## 4. Cuadros de gestión (Fase 4)

Los dos que pediste. Ambos usan solo horas de meses cerrados como cifra firme y marcan los meses abiertos como provisionales.

### 4.1 Cuadro consolidado de costos y ganancias

Una sola pantalla con un selector de **dimensión**: empleado, cliente (empresa), encargo, tipo de auditoría, socio líder, mes o trimestre. Filtros de año, de rango de meses y de tipo de honorario.

Columnas: horas (facturables y no facturables), costo, ingreso devengado, margen, margen %, y por cobrar.

Reglas de cálculo:

- **Costo** = horas × costo por hora **congelado al cerrar** (o el vigente, marcado provisional, en meses abiertos).
- **Ingreso por encargo**: ver 3.3.
- **Ingreso por empleado** (el honorario no se paga por persona): el devengado del encargo se reparte entre quienes trabajaron en él, en proporción a horas × tarifa pactada (si falta la tarifa, se usa el costo por hora como peso). La regla se muestra en pantalla para que nadie la discuta sin saberla.
- **Costo no absorbido** (en las vistas por empleado y de la firma): nómina del período − costo cargado a encargos. Son las horas administrativas, de capacitación, vacaciones y tiempo sin asignar. Convierte el margen de contribución en una utilidad que se puede comparar con la realidad.
- Totales por grupo y total general; exportación a Excel y a PDF.

### 4.2 Control anual de horas

Tabla por **empleado** (y una vista de la **firma**): para cada rubro, los 12 meses y el total anual.

```
Empleado: A. Pérez — 2026            Ene  Feb  Mar  ...  Dic   Total
Cliente facturable                   120  135  128  ...        ...
Cliente no facturable                 10    8   12  ...        ...
Administrativo                        20   18   22  ...        ...
Capacitación                           8    0    4  ...        ...
Desarrollo de negocio                  4    6    2  ...        ...
Vacaciones                             0    0   16  ...        ...
Incapacidad                            0    8    0  ...        ...
Permiso personal                       0    0    0  ...        ...
Otros                                  2    0    0  ...        ...
Total registrado                     164  175  184  ...        ...
Horas disponibles (calendario)       168  160  176  ...        ...
Utilización facturable (%)            71   84   73  ...   (meta: la del perfil)
Estado del mes                    cerrado cerrado abierto ...
```

- Se puede ver por mes o acumulado, y filtrar por tipo de cliente o encargo.
- La **utilización facturable** (solo horas facturables ÷ disponibles) se compara con la meta de utilización de cada perfil de costeo, que hoy se calcula pero nunca se usa.
- La vista de la **firma** suma todos los empleados, con una fila por empleado y los totales por rubro.
- Exportación a Excel y a PDF.

### 4.3 Vista «mi encargo» para gerentes

Cada gerente ve la rentabilidad de sus encargos sin ver el costo por hora ni el salario de cada persona: costo en conjunto, horas y avance contra presupuesto. La rentabilidad completa sigue siendo de la dirección y administradores.

---

## 5. Fases, orden y modelo recomendado

| Fase | Entrega | Tamaño | Quién diseña / quién construye |
|---|---|---|---|
| **1. Control de horas** | Cierre por persona y mes, ajustes, reabrir, bitácora, edición, no facturable con motivo, descripción, vista semanal, recordatorios | Grande | Diseño en este documento (revisarlo con Opus antes de construir); construye Sonnet |
| **2. Integridad** | Costo y tarifa congelados al cerrar, consulta agrupada de rentabilidad (adiós a las ~7 consultas por encargo), pruebas de las reglas financieras | Mediano | Opus revisa el diseño; construye Sonnet; Haiku escribe pruebas sobre patrones existentes |
| **3. Honorarios mixtos** | Honorario en el encargo, adendas, calendario de cobro, horas por facturar, registro de facturas, devengado, por facturar y por cobrar | Grande | Fable u Opus diseña el modelo de ingreso; construye Sonnet |
| **4. Cuadros de gestión** | Cuadro consolidado, control anual de horas, vista «mi encargo», exportaciones | Mediano | Sonnet; Haiku para la documentación y las ayudas |
| **5. Facturación integrada** | Emitir o enlazar con Nexus Finance | Por definir | Se decide después de operar la Fase 3 con registro manual |

**Orden recomendado: 1 y 2 juntas, luego 3, luego 4.** Las fases 1 y 2 hacen confiables las cifras; sin ellas los cuadros de la Fase 4 muestran números que cambian.

### Despliegue

- Con el interruptor de cierre apagado por organización, nada cambia para nadie hasta que se active.
- Los registros existentes quedan como abiertos; no se cierra ningún mes del pasado a menos que el gerente lo haga.
- Los SQL se aplican a mano, con reversa, y no se usa `prisma db push` (la base compartida es producción).

---

## 6. Decisiones que quedan abiertas

1. **¿Cierre por persona y mes (recomendado) o un cierre único de toda la firma?** El primero respeta que cada quien registre a su ritmo; el segundo es más simple pero obliga a esperar al más lento.
2. **Plazos:** ¿5.º día hábil para registrar y 10.º para cerrar? Son valores iniciales y se pueden cambiar.
3. **¿Un gerente puede cerrar horas de otro gerente?** La propuesta dice que sí, y que nadie cierra las propias; la dirección cierra las de los gerentes. Confirmar quién es «la dirección» en el despacho.
4. **¿Quién crea el evento de cobro?** El gerente del encargo, o solo la dirección.
5. **Facturación:** empezar con el registro manual de facturas (recomendado) o integrar con Nexus Finance desde el principio.
