# AuditMind — Análisis de Cumplimiento NIA  
## Plantilla: Auditoría Externa Financiera (NIA/ISA)  
**Versión:** 1.0 · **Fecha:** 2026-08-07 · **Ejecutado:** Claude Sonnet 4.6

---

## 1. Resumen Ejecutivo

La plantilla "Auditoría Externa (NIA/ISA)" cuenta con 37 papeles de trabajo distribuidos en 5 secciones (A–E). Se analizaron las NIAs 200–720 del IAASB, las normas ISQM 1/2, ISA 220 Revisada y los requerimientos específicos del CVPCPA El Salvador.

| Estado | NIAs |
|--------|------|
| ✅ Cubierta completamente | 13 |
| ⚠️ Cubierta parcialmente | 11 |
| ❌ Sin implementar | 10 |
| 🐛 Bug técnico crítico | 2 |

---

## 2. Bugs Técnicos Críticos (ejecutar antes de cualquier otra mejora)

### Bug #1 — PT-CIRC no existe
- **Archivo:** `apps/api/src/audit-templates/audit-templates.service.ts:631`
- **Problema:** C-02 declara `paperCode: 'PT-CIRC'` pero la plantilla no existe en `paper-templates.ts`. El papel de circularización carga vacío.
- **Fix:** Crear plantilla `PT-CIRC` en `paper-templates.ts` con 6 secciones (universo CxC, muestra, control de cartas, respuestas/alternativos, antigüedad, conclusión).
- **Estado:** ✅ IMPLEMENTADO en esta sesión

### Bug #2 — E-01 usa PT-MEMO en lugar de PT-FIN-DICT
- **Archivo:** `apps/api/src/audit-templates/audit-templates.service.ts:689`
- **Problema:** El papel E-01 (Informe del Auditor) usa `paperCode: 'PT-MEMO'`, mostrando secciones del Memorando de Planificación. `PT-FIN-DICT` ya existe en `paper-templates.ts` con las secciones correctas del Dictamen (NIA 700/705/706/701).
- **Fix:** Cambiar línea 689: `paperCode: 'PT-MEMO'` → `paperCode: 'PT-FIN-DICT'`.
- **Estado:** ✅ IMPLEMENTADO en esta sesión

---

## 3. Actividades de Mejora — Plan de Ejecución

### FASE 1: Crítica (esta sesión — todas completadas)

#### 1.1 Actualizar B-00 al importador de TB con propagación automática
- Cambiar `B-00.paperCode` de `'PT-EEFF'` a `'PT-FIN-B00'`
- B-00 obtiene AccountClassifier + usePropagateTrialBalance → activos, pasivos, patrimonio, ingresos
- Actualizar graph links de B-00 → B-01/02/03/04: `S1 → S1` cambia a `S4 → S1`
- **Impacto:** Automatiza el flujo de saldos del TB a las cédulas sumarias

#### 1.2 Diseñar y asignar B-05: Cédula de Ajustes y Reclasificaciones
- Crear plantilla `PT-ADJ-RECLASIF` con 5 secciones:
  - S1: Libro de AJEs (MATRIX: #AJE, Tipo, Descripción, Área, Monto, Cuenta, Referencia PT, Estado)
  - S2: Resumen por Sumaria — **fuente del "Saldo Ajustado"** en B-01/02/03/04 (Saldo TB + Ajustes + Reclasif = Saldo Ajustado)
  - S3: AJEs rechazados → alimenta D-02 (NIA 450)
  - S4: Evaluación vs. Materialidad (ENUM)
  - S5: Conclusión del socio / estrategia de opinión
- Asignar `B-05.paperCode = 'PT-ADJ-RECLASIF'`
- Agregar graph links: B-05 S2 → B-01/02/03/04 S1 (AGGREGATED, ajustes → sumarias)
- **Impacto:** Cada cédula sumaria mostrará: Saldo al Corte | Ajustes | Reclasificaciones | Saldo Ajustado

#### 1.3 Asignar paperCode a todos los papeles C-xx
- C-01, C-03 a C-12, C-14 → `PT-FIN-C-SUST`
- C-13 (Partes Relacionadas), C-15 (Continuidad) → `PT-FIN-C-NORM`
- **Impacto:** Todos los papeles sustantivos tienen estructura consistente

#### 1.4 Nuevo papel A-09: Evaluación de Leyes y Regulaciones (NIA 250)
- Crear plantilla `PT-NIA250` (5 secciones)
- Sección A, después de A-08
- Graph links: A-09 → A-07 (leyes → Memo), A-09 → A-08 (leyes → Programa)

#### 1.5 Nuevo papel D-05: Comunicación con Encargados del Gobierno (NIA 260)
- Crear plantilla `PT-NIA260` (8 secciones)
- Sección D, después de D-04
- Graph links: D-05 S3 → E-01 (hallazgos significativos → informe)

#### 1.6 Convertir D-01 a SMART con representaciones NIA 580
- D-01 ya es SMART pero sin paperCode — agregar `paperCode: 'PT-REP580'`
- Crear plantilla `PT-REP580` (7 secciones con representaciones predefinidas)

#### 1.7 Mejoras a plantillas existentes
- **PT-A1 S4:** `isRequired: false` → `true` + expandir TI/ERP (NIA 315 Rev. 2019)
- **PT-A2 S9 (nuevo):** Reunión de equipo — Discusión de Fraude (NIA 240.16)
- **PT-A4 S8 (nuevo):** Importancias relativas específicas por área (NIA 320.10)
- **PT-FIN-C-SUST S7 (nuevo):** Analítica de Cuentas tipo `ACCOUNT_SCHEDULE`

#### 1.8 Nuevo tipo de campo: ACCOUNT_SCHEDULE (multi-nivel)
- Agregar `ACCOUNT_SCHEDULE` al enum `FieldType` en schema.prisma
- Ejecutar `prisma db push --accept-data-loss`
- Crear componente `AccountScheduleSection.tsx`
- Actualizar `SectionField.tsx` para renderizar el nuevo tipo
- **Propósito:** Desagregación multi-nivel de cuentas (H1 → H2 → Analítica → Detalle)

---

### FASE 2: Importante (próximas sesiones)

#### 2.1 PT-A3 — ITGC (NIA 315 Rev. 2019)
- Agregar S9 "Evaluación de Controles Generales de TI (ITGC)" a `PT-A3`
- Campos: acceso lógico, gestión de cambios, operaciones TI, desarrollo de programas

#### 2.2 Nuevo papel A-10: Plan Maestro de Muestreo (NIA 530)
- Plantilla con: tipo de muestreo, universo, tamaño, error tolerable, evaluación resultados

#### 2.3 C-14 — NIA 540 Revisada 2019
- Incorporar: espectro de resultados, rango auditor vs. gerencia, indicadores de sesgo

#### 2.4 B-00 condicional NIA 510 (saldos de apertura)
- Sección activable en B-00 cuando es primer año del encargo

#### 2.5 ISA 220 Revisada en A-02
- Agregar sección para EQR (Engagement Quality Reviewer) para entidades listadas

---

### FASE 3: Enriquecimiento (sesiones futuras)

- **C-16 (condicional):** NIA 402 — Organizaciones de servicio (SOC 1 / ERP tercerizado)
- **A-11 (condicional):** NIA 600 — Auditorías de grupo (componentes)
- **A-12 (condicional):** NIA 610 — Función de auditoría interna del cliente
- **D-06 (condicional):** NIA 620 — Uso del trabajo de un experto
- **D-03 mejora:** Separar formalmente Tipo I/II de hechos posteriores
- **D-04 mejora:** Vincular deficiencias a componente COSO de origen

---

## 4. Diseño de Desagregación Multi-Nivel de Cuentas

### Marco conceptual en la práctica auditora

| Nivel | Nombre | Qué muestra | En AuditMind |
|-------|--------|-------------|--------------|
| H1 | Cédula Sumaria | Total por categoría EEFF (Activo Corriente, etc.) | B-01 a B-04 (ya implementado) |
| H2 | Sub-cédula | Total por grupo de cuentas (Caja y Bancos, CxC) | Papeles C-01 a C-15 (cabecera) |
| Analítica | Cédula Analítica | Una fila por cuenta del mayor del cliente | **S7 ACCOUNT_SCHEDULE en C-xx** (esta sesión) |
| Detalle | Cédula de Detalle | Una fila por transacción/operación | DocumentEvidencePanel (ya implementado) |

### Columnas de la Analítica (ACCOUNT_SCHEDULE)

| Columna | Tipo | Fuente |
|---------|------|--------|
| Código de cuenta | Texto editable | Manual / import TB |
| Nombre de cuenta | Texto editable | Manual / import TB |
| Saldo al Cierre (TB) | Número | B-00 o entrada manual |
| Ajustes (Dr/Cr) | Número | B-05 o entrada manual |
| Reclasificaciones | Número | B-05 o entrada manual |
| Saldo Ajustado | **Calculado** | Cierre + Ajustes + Reclasif |
| Notas / Marcas | Texto libre por fila | Auditor (escritura libre) |
| Evidencias | Adjuntos | Por fila — API backend |

### Flujo de saldos ajustados

```
B-00 (TB Import)
    ↓ S4 (totales por sub-sumaria)
B-01/B-02/B-03/B-04 (Cédulas Sumarias H1)
    ↓ referencia visual
C-xx S7 ACCOUNT_SCHEDULE (Analítica H2/Analítica)
    ↑ Ajustes desde B-05 S1 (AJEs)
    → Saldo Ajustado = Cierre + B05.Ajustes + B05.Reclasif
    → DocumentEvidencePanel (respaldo por transacción)
B-05 S2 (Resumen por sumaria)
    ↓ AGGREGATED link
B-01/B-02/B-03/B-04 S1 (columna "Ajustes" en sumaria)
    ↓
D-02 (NIA 450 — Cédula Final de Diferencias)
    ↓
E-01 (NIA 700 — Dictamen: tipo de opinión)
```

---

## 5. Requerimientos CVPCPA El Salvador (pendientes Fase 3)

1. **Ficha Técnica de Auditoría** — registro obligatorio ante CVPCPA al inicio del encargo
2. **Declaración Jurada de Independencia** — formato oficial CVPCPA, además del checklist NIA
3. **Modelo de Dictamen CVPCPA-SV** — redacción específica en PT-FIN-DICT con referencias al Código de Comercio SV
4. **Rotación de firma** — campo en A-02 para alertar cuando se aproxima el límite regulatorio CVPCPA
5. **Referencia cruzada NACOT** — cuando el mismo equipo ejecuta también el dictamen fiscal

---

## 6. Archivos Modificados en Esta Sesión

| Archivo | Tipo de cambio |
|---------|---------------|
| `apps/api/prisma/schema.prisma` | + enum `ACCOUNT_SCHEDULE` en `FieldType` |
| `apps/api/src/working-papers/paper-templates.ts` | + PT-CIRC, PT-NIA250, PT-NIA260, PT-REP580, PT-ADJ-RECLASIF; ± PT-A1.S4, PT-A2.S9, PT-A4.S8, PT-FIN-C-SUST.S7 |
| `apps/api/src/audit-templates/audit-templates.service.ts` | Bugs E-01, B-00, B-05; nuevos A-09, D-05; paperCodes C-xx; graph links |
| `apps/api/src/working-papers/working-papers.service.ts` | + `attachToAccountSchedule`, `removeAccountScheduleAttachment` |
| `apps/api/src/working-papers/working-papers.controller.ts` | + 2 rutas account-schedule |
| `apps/web/src/hooks/useWorkingPaperGraph.ts` | + `ACCOUNT_SCHEDULE` en `SectionFieldType`; + 2 hooks |
| `apps/web/src/components/working-papers/AccountScheduleSection.tsx` | NUEVO — componente analítica multi-nivel |
| `apps/web/src/components/working-papers/SectionField.tsx` | + caso `ACCOUNT_SCHEDULE` |

---

## 7. Referencia de NIAs Aplicadas

- IFAC IAASB: NIAs 200–720, ISQM 1/2, ISA 220 Revisada (2022)
- COSO 2013: Marco de Control Interno
- IESBA: Código de Ética para Profesionales de la Contabilidad
- CVPCPA El Salvador: Resoluciones de independencia y rotación
- NIA 315 Rev. 2019: Factores de riesgo inherente + ambiente TI
- NIA 540 Rev. 2019: Estimaciones — espectro, rango auditor, sesgo
- NIA 240.16: Reunión obligatoria de equipo sobre fraude
