# PT-PROG — Estructura Big 4 del Programa de Auditoría por Área

> Investigación realizada: 2026-08-10  
> Fuente: ISA 230, ISA 315 Rev.2019, ISA 330, PCAOB AS 1215/AS 2301  
> Plataformas analizadas: EY Canvas, KPMG Clara, PwC Aura, Deloitte Omnia, CaseWare  
> Contexto: Propuesta de implementación para AuditMind PT-PROG

---

## 1. Jerarquía universal Big 4 (2 niveles)

Todas las Big 4 usan exactamente **2 niveles** dentro de un paper de área:

| Nivel | Nombre | Qué contiene | ISA base |
|-------|--------|--------------|----------|
| **0 (opcional)** | Audit Objective | Header descriptivo, no testeable. Solo en clientes grandes (PwC). | ISA 330 §3 |
| **1** | Procedure | Agrupador de pasos. Assertion mapping. Conclusión a este nivel. Owned por senior/manager. | ISA 330 §7-18 |
| **2** | Step / Activity | Instrucción ejecutable específica. Datos operativos: performed by, date, W/P ref, conclusión. | ISA 230 §9, ISA 330 §28 |

**Numeración típica**: `A3` (procedimiento), `A3.1 / A3.2 / A3.3` (pasos), o bien `B-AR-01` / `B-AR-01-A` / `B-AR-01-B`.

---

## 2. Plataformas Big 4

| Firma | Plataforma Doc | Analytics | Características |
|-------|---------------|-----------|-----------------|
| EY | EY Canvas | EY Helix | Primera cloud-nativa; control centralizado; dashboards de ejecución |
| KPMG | KPMG Clara | Clara Analytics | IA-agente (2024+): identifica ítems, ingiere docs, genera papeles |
| PwC | Aura | Halo (ERP) | Halo para alto volumen; Aura governa workflow; sign-off por procedimiento |
| Deloitte | Omnia | Omnia AI | Centraliza planificación, evaluación de riesgos, analíticas; Omnia AI para juicio |

---

## 3. Encabezado del papel — campos requeridos

Campos ANTES del grid (header del paper), con base normativa:

| Campo | Req. ISA | Párrafo |
|-------|----------|---------|
| Nombre del cliente | ISA 230 | §9 |
| Número de encargo | ISA 230 | §9 |
| Área / cuenta auditada | ISA 330 | §28 |
| Referencia del papel (paper ref) | ISA 230 | §9 |
| Fecha de cierre del período | ISA 230 | §9 |
| Objetivo del programa | ISA 330 | §3 |
| Aserciones relevantes (multi-select) | ISA 330 | §7 |
| Nivel RMM del área (auto desde PT-A5) | ISA 330 | §7 |
| ¿Riesgo Significativo? (flag binario) | ISA 330 | §18 |
| Materialidad aplicada | ISA 320 | — |
| Descripción de la población / alcance | ISA 330 | — |
| ¿Reliance en controles? (boolean) | ISA 330 | §8 |
| Planificado por / Fecha planificación | ISA 230 | §9 |
| Elaborado por / Fecha | ISA 230 | §9 |
| Revisado por 1er nivel / Fecha | ISA 230 | §9 |
| Revisado por 2do nivel / Fecha | ISA 230 | §9 |
| Conclusión general del papel | ISA 330 | §28(d) |
| Horas totales planificadas / ejecutadas | Interno | — |

---

## 4. Grid de procedimientos — 23 columnas con base ISA

Columnas del grid jerárquico, con distinción PROC (nivel 1) vs ACT (nivel 2):

| # | Campo | Tipo | Nivel | NIA base | Req. |
|---|-------|------|-------|----------|------|
| 1 | Ref / Nro. | TEXT | PROC + ACT | ISA 230 §9 | ✱ ISA |
| 2 | Tipo de fila | ENUM | PROC + ACT | — | ✱ ISA |
| 3 | Descripción | TEXTAREA | PROC + ACT | ISA 330 §28(b) | ✱ ISA |
| 4 | Aserciones | MULTI_SELECT | ACT (opt PROC) | ISA 330 §28(c) | ✱ ISA |
| 5 | Tipo de prueba | ENUM | ACT | ISA 330 §4 | ✱ ISA |
| 6 | Naturaleza | ENUM | ACT | ISA 330 §28(b) | ✱ ISA |
| 7 | Timing | ENUM | ACT | ISA 330 §28(b) | ✱ ISA |
| 8 | Extensión / Muestra | TEXT | ACT | ISA 330 §28(b) | ✱ ISA |
| 9 | Población / Fuente | TEXT | ACT | — | opt. |
| 10 | Estado | ENUM | PROC + ACT | — | ✱ ISA |
| 11 | Realizado por | USER | ACT | ISA 230 §9 | ✱ ISA |
| 12 | Fecha realizado | DATE | ACT | ISA 230 §9 | ✱ ISA |
| 13 | Revisado por | USER | ACT | ISA 230 §9 | ✱ ISA |
| 14 | Fecha revisión | DATE | ACT | ISA 230 §9 | ✱ ISA |
| 15 | W/P Reference | LINK | ACT | ISA 230 §10 | ✱ ISA |
| 16 | Descripción del resultado | TEXTAREA | ACT | ISA 330 §28(d) | ✱ ISA |
| 17 | Conclusión | ENUM+TEXT | ACT | ISA 330 §28(d) | ✱ ISA |
| 18 | Descripción de excepción | TEXTAREA | ACT | ISA 330 §28(d) | cond. |
| 19 | Monto observado | CURRENCY | ACT | — | cond. |
| 20 | Disposición / Ref. PT-DIFS | TEXT | ACT | — | cond. |
| 21 | Horas planificadas | DECIMAL | ACT | — | opt. |
| 22 | Horas utilizadas | DECIMAL | ACT | — | opt. |
| 23 | ¿Riesgo Significativo? | BOOLEAN | ACT | ISA 330 §18 | opt. |

**Conjunto mínimo ISA**: columnas 1, 2, 3, 11, 12, 13, 14, 15, 16, 17.  
**Conjunto estándar Big 4**: columnas 1–17 + Estado (10) + Ref RMM (23).

---

## 5. Aserciones según ISA 315 Rev.2019

### Para Clases de Transacciones y Eventos

| Código | Aserción | Definición |
|--------|----------|------------|
| OCC | Ocurrencia | Transacciones registradas ocurrieron y corresponden a la entidad |
| COM | Integridad | Todas las transacciones que debieron registrarse fueron registradas |
| EXA | Exactitud | Montos y datos de transacciones registrados correctamente |
| COR | Corte | Transacciones registradas en el período contable correcto |
| CLA | Clasificación | Transacciones registradas en las cuentas apropiadas |
| PRE | Presentación | Transacciones apropiadamente agregadas/desagregadas y descritas |

### Para Saldos de Cuentas al Cierre

| Código | Aserción | Definición |
|--------|----------|------------|
| EXI | Existencia | Activos, pasivos e instrumentos de patrimonio existen |
| R&O | Derechos y Obligaciones | La entidad tiene derechos sobre activos; pasivos son sus obligaciones |
| COM | Integridad | Todos los saldos que debieron registrarse fueron registrados |
| VAL | Valuación | Saldos por montos apropiados; ajustes de valuación correctamente registrados |
| CLA | Clasificación | Saldos registrados en las cuentas apropiadas |
| PRE | Presentación | Saldos apropiadamente presentados; revelaciones relevantes y comprensibles |

> **Nota ISA 315 Rev.2019**: CLA y PRE son aserciones explícitas en AMBAS categorías (no era así en la versión pre-2019). El CVPCPA adoptó la versión revisada.

---

## 6. Distinción crítica: Riesgo Significativo ≠ RMM Alto

**Riesgo Significativo** (ISA 315 §26):
- Identificado en la evaluación de riesgos como que requiere "consideración especial"
- EXIGE procedimientos sustantivos específicamente responsivos (ISA 330 §18)
- NO puede cubrirse solo con procedimientos analíticos
- Debe probarse en el ejercicio actual — no aplica excepción de años anteriores
- Flag BINARIO (sí/no) en el PT-PROG, separado del nivel de RMM

**RMM Alto** (ISA 330 §7):
- Escala: Bajo / Moderado / Alto / Muy Alto
- Puede reducirse confiando en controles si son efectivos (ISA 330 §8)
- Un RMM=ALTO no es automáticamente un Riesgo Significativo (aunque usualmente coinciden)
- Ejemplos: Management Override (NIA 240.31) = siempre Significativo por presunción NIA 240

---

## 7. Status machine digital (ISA 230 en entorno electrónico)

```
Draft → En proceso → Enviado revisión → Revisado (con notas) → Notas limpias → Aprobado
```

Reglas:
- Una actividad no puede pasar a "Revisado" sin Realizado Por + Fecha
- Notas del revisor se adjuntan a filas específicas, no al papel completo
- Cada transición queda time-stamped + atribuida a un usuario
- El Socio/CAE no puede firmar el informe hasta que todas las actividades estén en "Aprobado"
- Fecha realizado debe ser ≤ fecha del informe del auditor (validación en sistema)

---

## 8. Convención de referencia de evidencias

```
[Área]-[Nro. Papel]-[Exhibit]
Ejemplo: AR-03-01 (Área CxC, Papel 3, Exhibit 1)
         INV-02-04 (Inventarios, Papel 2, Exhibit 4)
```

El campo W/P Ref en el grid es un **hipervínculo navegable** al archivo de evidencia (estándar en EY Canvas, KPMG Clara, CaseWare). Click abre el archivo adjunto directamente.

---

## 9. Modelo de datos propuesto (Prisma)

### 3 entidades nuevas

```typescript
// Nivel 1 — Procedimiento
model AuditProcedure {
  id               String   @id @default(uuid())
  paperSectionId   String   // FK → PaperSection
  rmmRiskId        String?  // FK → PT-A5 risk row (ISA 330 §28(c) linkage)
  refNumber        String   // B-AR-01
  description      String
  assertions       String[] // EXI/VAL/COM...
  significantRisk  Boolean  @default(false)  // ISA 330 §18
  conclusion       ProcConclusion
  status           StepStatus
  sortOrder        Int
  steps            AuditStep[]
}

// Nivel 2 — Actividad
model AuditStep {
  id                String    @id @default(uuid())
  procedureId       String    // FK → AuditProcedure
  refNumber         String    // B-AR-01-A
  description       String
  assertions        String[]  // puede diferir del padre
  testType          TestType  // DETAIL / ANALYTIC / CONTROL
  nature            AuditNature // INSPECTION / CONFIRMATION / ...
  timing            AuditTiming // INTERIM / YEAR_END
  extent            String?   // "45 ítems MUS"
  population        String?   // fuente de datos
  performedById     String?   // FK → User (ISA 230 §9)
  datePerformed     DateTime? // ≤ fecha informe
  reviewedById      String?   // FK → User
  dateReviewed      DateTime?
  wpRef             String?   // AR-03-01 (navegable)
  resultDescription String?   // ISA 330 §28(d)
  conclusion        StepConclusion
  exceptionText     String?   // condicional
  exceptionAmount   Decimal?  // condicional
  difRef            String?   // → PT-DIFS si hay excepción
  hoursPlanned      Float?
  hoursActual       Float?
  status            StepStatus
  sortOrder         Int
  evidences         StepEvidence[]
}

// Adjuntos por actividad
model StepEvidence {
  id          String   @id @default(uuid())
  stepId      String   // FK → AuditStep
  fileName    String
  storageKey  String   // Supabase Storage key
  wpRef       String   // AR-03-01
  mimeType    String
  uploadedById String  // FK → User
  uploadedAt  DateTime @default(now())
}
```

---

## 10. Flujo completo en AuditMind

```
PT-A5 S1 (RMM) → PT-PROG (NTE) → Cédulas B-01… (evidencia) → PT-DIFS (excepciones) → Opinión NIA 700
```

- `rmmRiskId` en AuditProcedure satisface ISA 330 §28(c) (linkage con risk assessed)
- W/P Reference como link navegable (clic abre el archivo adjunto)
- Status machine con audit trail completo (ISA 230 en entorno electrónico)
- Flag `significantRisk` en AuditProcedure → validación: procedimientos bajo PROC-SIG deben incluir al menos una ACT con `testType=DETAIL`

---

## 11. Tipos de procedimientos sustantivos (NIA 330)

| Tipo | Naturaleza | Cuándo usar | Evidencia generada |
|------|-----------|-------------|-------------------|
| Prueba de detalle — inspección | Inspección | RMM Alto/Significativo; evidencia directa EXI/VAL | Cédulas B-01…B-06 |
| Confirmación externa (ISA 505) | Confirmación | CxC, bancos — entidad no puede proveer evidencia | Respuestas firmadas terceros |
| Recálculo (NIA 330 §20) | Recálculo | Provisiones, depreciaciones, estimaciones | Cédula de cálculo con fórmulas |
| Analítico sustantivo (ISA 520) | Analítico | RMM Bajo/Mod; expectativas precisas. NO para riesgos significativos como único proc. | Comparativo + explicación de variaciones |
| Rejecución (NIA 330 §20) | Rejecución | Cálculos ERP, nómina, costo de ventas | Output sistema vs. recálculo auditor |
| Observación (NIA 330 §20) | Observación | Conteo físico inventario | Cédula de observación + fotos |
| Indagación (NIA 330 §20) | Indagación | NUNCA como único procedimiento | Memorándum + confirmación escrita |

---

## Fuentes

- ISA 330 Full Standard (IAASB/PASAI)
- ISA 315 Revised 2019 (IAASB)
- ISA 230 Documentation
- PCAOB AS 1215 + AS 2301
- CaseWare Work Programs documentation
- EY Canvas, KPMG Clara, PwC Aura (product documentation)
- ACCA — ISA 330 and Responses to Assessed Risks
- Thomson Reuters — Guide to Substantive Audit Procedures
