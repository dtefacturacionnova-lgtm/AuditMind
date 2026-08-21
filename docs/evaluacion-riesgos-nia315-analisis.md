# Evaluación de Riesgos NIA 315/330 — Análisis de Brechas AuditMind

> Análisis realizado: 2026-08-10  
> NIAs referenciadas: 220 · 240 · 300 · 315 Rev.2019 · 320 · 330 · 530  
> Contexto: Auditoría Financiera Externa — Plantilla estándar AuditMind

---

## 1. Flujo completo del proceso (9 pasos)

| Paso | NIA | Papel AuditMind | Estado |
|------|-----|-----------------|--------|
| 1. Aceptación y Continuidad | NIA 220 | PT-FIN-ENCARGO | ✅ (sin sección de evaluación de continuidad) |
| 2. Entendimiento de la Entidad | NIA 315.11-24 | PT-A1 + PT-FIN-A3-KC | ✅ (leve solapamiento entre ambos) |
| 3. Evaluación del RI | NIA 315.25 | PT-A2 | ✅ (sin riesgos pervasivos a nivel EEFF) |
| 4. Evaluación del Control Interno | NIA 315.14-24 | PT-A3 + PT-COSO | ✅ |
| 5. **MATRIZ RMM** | **NIA 315.32** | **PT-A5 (NUEVO)** | ✅ Implementado 2026-08-10 |
| 6. Materialidad | NIA 320 | PT-A4 | ✅ |
| 7. Respuesta General EEFF + Sig. Risks | NIA 330.5-21 | PT-A5 S2+S3 (NUEVO) | ✅ Implementado 2026-08-10 |
| 8. Programa + Muestreo | NIA 300 · 530 | PT-PROG + PT-A4 S_EJE | ✅ |
| 9. Memorando de Planificación | NIA 300 | PT-MEMO | ✅ (ampliado con S3b + S5b) |

---

## 2. Brechas identificadas y estado

### Brecha 1 — CRÍTICO: PT-A5 Matriz RMM (NIA 315.32)
- **Descripción**: No existía papel que consolidara RI (PT-A2) + RC (PT-A3) → RMM por área/aserción
- **Equivalentes Big 4**: Deloitte "Risk Assessment Summary", PwC "ABRA", EY "Risk Summary", KPMG "Scoping Matrix"
- **Impacto**: PT-PROG se generaba solo desde RI, sin considerar RC. PT-MEMO S5 sin base formal.
- **Solución implementada**: Nuevo papel PT-A5 con 5 secciones (Matriz RMM, Riesgos Pervasivos, Riesgos Significativos + NIA 240, Estrategia por Área, Conclusión Socio)
- **Estado**: ✅ Implementado en paper-templates.ts

### Brecha 2 — CRÍTICO: Riesgos pervasivos a nivel de EEFF (NIA 330.5)
- **Descripción**: Ningún papel documentaba riesgos que afectan los EEFF como un todo
- **Solución implementada**: PT-A5 S2 + PT-MEMO S5b (REFERENCE a PT-A5 S2)
- **Estado**: ✅ Implementado

### Brecha 3 — ALTO: Presunciones NIA 240 sin respuesta documentada
- **NIA 240.26**: Fraude en reconocimiento de ingresos (presunción SIEMPRE aplicable)
- **NIA 240.31-33**: Management override (3 procedimientos obligatorios)
- **Solución implementada**: PT-A2 S7 ampliado con estructura ACFE + Presunciones NIA 240. PT-A5 S3 incluye filas pre-cargadas obligatorias para NIA240-A y NIA240-B.
- **Estado**: ✅ Implementado

### Brecha 4 — ALTO: PT-A3 sin evaluación global de 5 componentes COSO
- **Descripción**: NIA 315 Rev.2019 requiere evaluación a nivel entidad de 5 componentes COSO
- **Nota**: PT-COSO ya existía como papel separado. La brecha era la falta de vinculación.
- **Solución implementada**: PT-A3 S0 = REFERENCE a PT-COSO::S6 y S7 (evaluación global + implicación en enfoque)
- **Estado**: ✅ Implementado

### Brecha 5 — MEDIO: PT-MEMO sin secciones RMM y Respuesta General
- **Descripción**: PT-MEMO S3 solo referenciaba PT-A2 (RI), sin RC ni RMM combinada
- **Solución implementada**: 
  - PT-MEMO S3b: REFERENCE a PT-A5::S4 (Estrategia consolidada por área)
  - PT-MEMO S5b: REFERENCE a PT-A5::S2 (Respuesta general a riesgos pervasivos)
  - PT-MEMO S5: aiHint ampliado para basar enfoque en RMM
- **Estado**: ✅ Implementado

---

## 3. Flujo de datos implementado

```
PT-A2 (RI: S4) ──┐
                  ├──→ PT-A5 S1 (Matriz RMM) ──→ PT-A5 S4 (Estrategia) ──→ PT-MEMO S3b
PT-A3 (RC: S5) ──┘                                                       ──→ PT-PROG S1
                                                                          ──→ PT-MEMO S5
PT-COSO (S6,S7) ──→ PT-A3 S0 (Base evaluación global)

PT-A5 S2 (Riesgos Pervasivos) ──→ PT-MEMO S5b
PT-A5 S3 (Significativos + NIA240) ──→ PT-PROG S1 (procedimientos obligatorios)
```

---

## 4. Marco de Aserciones NIA 315

### Para Transacciones y Eventos
- **OCC** Ocurrencia · **COM** Completitud · **EXA** Exactitud · **COR** Corte · **CLA** Clasificación

### Para Saldos de Cuentas
- **EXI** Existencia · **DER** Derechos y Obligaciones · **COM** Completitud · **VAL** Valuación

### Para Presentación y Revelación
- **OCC** Ocurrencia y Derechos · **COM** Completitud · **CLA** Clasificación · **EXA** Exactitud

---

## 5. Fórmula RMM implementada en PT-A5

| RI ↓ \ RC → | BAJO | MODERADO | ALTO | MUY_ALTO |
|------------|------|----------|------|----------|
| **BAJO**       | BAJO | BAJO | MODERADO | ALTO |
| **MODERADO**   | BAJO | MODERADO | ALTO | MUY_ALTO |
| **ALTO**       | MODERADO | ALTO | MUY_ALTO | MUY_ALTO |
| **MUY_ALTO**   | ALTO | MUY_ALTO | MUY_ALTO | MUY_ALTO |

---

## 6. Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `apps/api/src/working-papers/paper-templates.ts` | PT-A5 (nuevo), PT-A2 S7, PT-A3 S0, PT-MEMO S3b+S5b+S5, PT-PROG S1 |
| `apps/api/src/working-papers/paper-consolidation.service.ts` | Prompts PT-PROG y PT-MEMO ahora usan PT-A5 |
| `apps/api/src/working-papers/paper-sections.service.ts` | Peers ahora incluye PT-A4, PT-A5, PT-COSO |

---

## 7. Trabajo pendiente

- [x] PT-PROG: Grid jerárquico 2 niveles (Procedimiento → Actividad) implementado — NIA 230/330 Big 4, 23 columnas ISA. Commit 03d1997 (2026-08-10)
- [ ] PT-FIN-ENCARGO: Agregar sección de evaluación de continuidad del encargo (NIA 220)
- [ ] PT-FIN-A3-KC: Evaluar consolidación con PT-A1 para eliminar solapamiento
- [ ] PT-A5 S1: Considerar auto-carga desde PT-A2 S4 y PT-A3 S5 (requiere frontend custom)
