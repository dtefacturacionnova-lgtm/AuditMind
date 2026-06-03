# Cómo agregar papeles automáticos a AuditMind

> **Audiencia:** equipo de desarrollo + product owners.
> **Tiempo de lectura:** 15-20 minutos.
> **Última actualización:** Mayo 2026 — incluye PI.2 a PI.7d + grafo en plantillas.

---

## TL;DR

Hay **3 niveles** de "automatización" que puedes aplicar a un papel de trabajo en AuditMind:

| Nivel | Qué hace | Cómo se agrega | Tiempo |
|-------|----------|----------------|--------|
| **A. SMART/MASTER en plantilla** | Secciones tipadas + IA por sección + cascade + grafo visual | Editor UI de plantillas — sin código | 5-10 min |
| **B. Papel automatizado de dominio** | Lógica especializada (CAATs, validación externa, conciliación, etc.) | 4 archivos de código (Python + NestJS + React + opcional orquestador) | 2-4 horas |
| **C. Papel LIVE** | Dashboard tiempo real auto-refresh | Componente React custom + endpoint live | 4-6 horas |

**Regla 80/20:** el 95% de los casos se resuelven con la Vía A. Solo necesitas la Vía B cuando hay matemática estadística, IA con prompt específico, o integración con sistema externo (DGII, SDF, SSF, etc.).

---

## Conceptos clave

Antes de empezar, asegúrate de entender estos 4 conceptos:

### 1. `wpKind` — el tipo estructural del papel

```typescript
enum WpKind {
  STANDARD,  // Papel tradicional: adjuntos + narrativa libre. Sin lógica de propagación.
  SMART,     // Papel con secciones tipadas. Recibe IA por sección (PI.3) y propaga al grafo (PI.2).
  MASTER,    // Consolida varios SMART vía IA. Se marca STALE cuando cambia una fuente.
  LIVE,      // Dashboard en vivo. No tiene contenido editable, lee datos en tiempo real.
  FILE,      // Solo un archivo adjunto, sin contenido propio.
}
```

### 2. `paperCode` — el identificador canónico del papel

Es **distinto** de `code`. El `code` (ej. "A-04") es la posición en el índice; el `paperCode` (ej. "PT-A2") es el identificador semántico canónico. Sirve para:

- **Inicializar secciones desde template predefinido** (ej. `paperCode: "PT-A2"` → secciones S1..S8 de evaluación de riesgo inherente)
- **Que otros features lo encuentren** (ej. el agente COSO busca por `paperCode IN ('PT-A1', 'PT-A2', 'PT-A3')`)
- **Que los `PaperLinks` lo referencien** sin acoplarse al `code` específico

Convención: usa `paperCode` cuando el papel sea reutilizable entre plantillas (PT-A1 vale para NOGAI, NIA y NAIG). Si es específico (ej. `AF-ISR-04` Anexo 3 DGII), no necesita `paperCode`.

### 3. `PaperLink` — el grafo de conocimiento

Es la arista dirigida que conecta una sección de un papel fuente con una sección de un papel destino. Estructura:

```typescript
{
  sourceCode:  "PT-A2",    // o "A-02"
  targetCode:  "PT-MEMO",
  sourceField: "S8",       // sección "Conclusión de RI"
  targetField: "S3",       // sección "Evaluación de Riesgo" del Memo
  mappingType: "AI_GENERATED" | "DIRECT" | "AGGREGATED",
  description: "RI global → Sección RI del Memo",
}
```

Cuando un usuario edita `PT-A2.S8`, el sistema marca `PT-MEMO.S3` como **stale** (PI.2). El usuario puede confirmar vigencia o regenerar con IA (PI.3).

### 4. `WorkingPaperType` — categoría funcional

```typescript
enum WorkingPaperType {
  PLANNING_UNDERSTANDING,  // Planificación
  CONTROL_EVALUATION,      // Evaluación de controles
  SUBSTANTIVE_TEST,        // Pruebas sustantivas
  DATA_ANALYSIS,           // CAATs / análisis de datos
  FINDING,                 // Hallazgo
  CLOSURE_CONCLUSION,      // Cierre / informe
  INTERVIEW,               // Entrevista
  CONFIRMATION,            // Confirmación externa
  NORMATIVE_ANALYSIS,      // Análisis normativo / checklist
}
```

No afecta automatización — solo categoriza visualmente.

---

## VÍA A — Papel SMART/MASTER desde el editor de plantillas

### Cuándo usarla

- Necesitas un papel **inteligente** que pida IA por sección (PI.3)
- Quieres que sea parte del **grafo** del expediente (PI.2/PI.4)
- Su contenido es **narrativa estructurada** (no requiere cómputo especializado)
- Vas a usarlo en **una o varias plantillas** del sistema o custom

### Paso a paso

#### 1. Identifica el lugar en el flujo

Pregúntate:
- ¿En qué fase entra? (PLANNING / FIELDWORK / REPORTING / FOLLOWUP)
- ¿En qué carpeta del expediente vive? (ej. A · B · C · D · E o subcarpeta como B-DDC)
- ¿Qué papeles lo alimentan? (sources)
- ¿A qué papeles alimenta? (targets)

Anota esto en una hoja antes de tocar la UI — te ahorra retrabajo.

#### 2. Abre el editor de la plantilla

`Admin → Plantillas de Auditoría` → click en la plantilla → click en "Editar" (lápiz).

**Si la plantilla es del sistema** (badge "Sistema"), considera **duplicarla primero** y editar la copia, salvo que quieras que el cambio sea para todos los usuarios de esa plantilla. Las plantillas del sistema se restauran con el botón "Restaurar plantillas".

#### 3. Tab "Carpetas" — asegura que la carpeta exista

Si tu papel vive en una subcarpeta nueva, créala primero:

- Ref: `B-NEW` (el código corto que aparecerá en el árbol)
- Nombre: `Nueva sub-área` (display)
- Phase Type: heredada del padre

#### 4. Tab "Papeles" — agrega el papel

Click en `+ Agregar papel` y completa:

| Campo | Valor sugerido | Notas |
|-------|----------------|-------|
| `code` | `B-12` | Identificador corto único en la plantilla |
| `indexSection` | `B-NEW` | El ref de la carpeta donde vive |
| `title` | `Cédula de Validación NRC en DGII` | Texto descriptivo |
| `type` | `DATA_ANALYSIS` | Categoría funcional |
| `wpKind` | **`SMART`** | ⭐ activa IA por sección + cascade |
| `paperCode` | `PT-NRC` *(opcional)* | Solo si reutilizable o tiene template de secciones predefinido |

#### 5. (Opcional) Define el template de secciones

Si tu paperCode no existe en `apps/api/src/working-papers/paper-templates.ts`, agrégalo:

```typescript
// apps/api/src/working-papers/paper-templates.ts
export const PAPER_TEMPLATES: Record<string, PaperSectionTemplate[]> = {
  // ... existentes
  'PT-NRC': [
    { sectionKey: 'S1', label: 'Universo de proveedores', fieldType: 'TEXTAREA',
      description: 'Lista de proveedores con CCF en el período auditado',
      isRequired: true, sortOrder: 1, aiHint: 'Importar libro IVA Compras' },
    { sectionKey: 'S2', label: 'Resultado validación NRC', fieldType: 'TEXTAREA',
      description: 'Lista de proveedores con NRC suspendido o cancelado',
      isRequired: true, sortOrder: 2, aiHint: 'Calcular impacto fiscal' },
    // ...
  ],
};
```

Sin este paso, las secciones nacen vacías y el auditor las crea manualmente.

#### 6. Tab "Vínculos" — conecta al grafo

Click en `+ Agregar vínculo` y crea las flechas:

```
Fuente: PT-IVA02 (S2)   →   Destino: PT-NRC (S1)
   mappingType: DIRECT     description: "Libro IVA → Lista proveedores a validar"

Fuente: PT-NRC (S2)     →   Destino: PT-DIFS (S5)
   mappingType: AGGREGATED   description: "NRC inválidos → Cédula de diferencias"
```

#### 7. Guarda y restaura

- Click "Guardar" en el modal
- Si era plantilla del sistema: click "Restaurar plantillas del sistema" para sincronizar la DB con los cambios

#### 8. Prueba

Crea una auditoría nueva usando esa plantilla y verifica:
- ✅ El papel aparece en el árbol del expediente
- ✅ Al abrirlo, ves los botones "✨ IA" en cada sección TEXT/TEXTAREA
- ✅ El tab "🕸️ Grafo" muestra el nodo y sus aristas
- ✅ Al modificar una sección fuente, el destino se marca como "Desactualizado"

---

## VÍA B — Papel con automatización específica del dominio

### Cuándo usarla

- El papel necesita **ejecutar matemática estadística** (Benford, Muestreo MUS, anomaly detection)
- El papel debe **integrarse con sistema externo** (DGII, SDF, SSF, OFAC, etc.)
- Tiene **prompt IA especializado** (no solo asistencia genérica por sección)
- Debe **generar Findings automáticos** según el resultado
- Va a ser parte del **orquestador "Pruebas IA"** (PI.7d)

### Patrón canónico — usando Benford como ejemplo de referencia

Mira los 4 archivos que tocamos para Benford y replícalo:

#### Capa 1: Endpoint Python en ai-service

`apps/ai-service/app/routers/<tu-feature>.py`

```python
"""
<Tu feature> — descripción breve.
Referencias normativas: NIA xxx, ...
"""
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel, Field
from app.routers.analytics import verify_internal_key  # reutilizar guard

router = APIRouter(prefix="/<tu-feature>", tags=["<Tu feature>"])


class FeatureRequest(BaseModel):
    auditTitle: str
    # ... parámetros que necesitas


class FeatureResponse(BaseModel):
    result: dict
    methodology_note: str


def calculate_something(req: FeatureRequest) -> FeatureResponse:
    # Tu lógica aquí. Pura. Sin efectos colaterales.
    return FeatureResponse(
        result={...},
        methodology_note="...",
    )


@router.post("/run", response_model=FeatureResponse)
def post_run(req: FeatureRequest, x_internal_key: str | None = Header(default=None)) -> FeatureResponse:
    verify_internal_key(x_internal_key)
    return calculate_something(req)
```

Registra el router en `apps/ai-service/main.py`:

```python
from app.routers import <tu_feature>
# ...
app.include_router(<tu_feature>.router)
```

#### Capa 2: Proxy NestJS

**Opción 2a** — En `apps/api/src/ai/ai.service.ts` agrega el método proxy:

```typescript
async runTuFeature(payload: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${this.aiServiceUrl}/<tu-feature>/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-key': this.internalKey,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new HttpException(`<Tu feature> error: ${err}`, HttpStatus.BAD_GATEWAY);
  }
  return res.json();
}
```

**Opción 2b** — En el servicio que tiene el contexto del papel (ej. `audits.service.ts`):

```typescript
async runTuFeatureOnAudit(auditId: string, user: AuthUser) {
  const audit = await this.findOne(auditId, user);

  // Reunir contexto desde la DB
  const data = await this.prisma.algunaTabla.findMany({ where: { auditId } });

  // Llamar a ai-service vía AiService
  const result = await this.aiService.runTuFeature({
    auditTitle: audit.title,
    data,
  }) as { ... };

  // Persistir resultado (en JSON del audit, o tabla dedicada)
  await this.prisma.audit.update({
    where: { id: auditId },
    data: { lastTuFeatureResult: result as unknown as Prisma.InputJsonValue },
  });

  // Opcional: crear Finding DRAFT si el resultado lo amerita
  if (result.riesgoAlto) {
    await this.prisma.finding.create({ data: { ... } });
  }

  return result;
}
```

Agrega el endpoint al controller:

```typescript
@Post(':id/run-tu-feature')
@Roles(UserRole.AUDITOR)
@ApiOperation({ summary: 'Ejecutar <tu feature>' })
runTuFeature(@Param('id') id: string, @CurrentUser() user: AuthUser) {
  return this.service.runTuFeatureOnAudit(id, user);
}
```

#### Capa 3: Frontend

**Hook** — `apps/web/src/hooks/useTuFeature.ts`:

```typescript
'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export function useRunTuFeature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (auditId: string) =>
      apiClient.post(`/audits/${auditId}/run-tu-feature`, {}),
    onSuccess: (_res, auditId) => {
      qc.invalidateQueries({ queryKey: ['audit', auditId] });
    },
  });
}
```

**Componente** — `apps/web/src/components/audits/TuFeaturePanel.tsx`:

```tsx
'use client';

import { Sparkles, Loader2 } from 'lucide-react';
import { useRunTuFeature } from '@/hooks/useTuFeature';

export function TuFeaturePanel({ auditId }: { auditId: string }) {
  const run = useRunTuFeature();
  return (
    <div className="bg-white rounded-2xl border p-5">
      <button
        onClick={() => run.mutate(auditId)}
        disabled={run.isPending}
        className="px-4 py-2 bg-violet-600 text-white rounded-xl"
      >
        {run.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
        Ejecutar <tu feature>
      </button>
      {/* Visualización del resultado */}
    </div>
  );
}
```

Integra el panel donde corresponda — un nuevo tab, un modal, o directamente en `TrialBalanceTab.tsx` siguiendo el patrón de `BenfordPanel`.

#### Capa 4 (opcional): Orquestador PI.7d

Si quieres que el botón "Pruebas IA" del header de la auditoría también dispare tu feature, agrégalo en `audits.service.ts → runAiTests`:

```typescript
// Dentro del método runAiTests, después de Benford y COSO:

try {
  const res = await this.runTuFeatureOnAudit(auditId, user);
  tests.push({
    kind: 'TU_FEATURE' as any,  // (extiende el tipo AiTestKind)
    target: auditId,
    label: 'Tu feature',
    status: 'SUCCESS',
    message: `Score ${res.score}/100`,
    findingId: res.findingId,
  });
  if (res.findingId) findingIds.push(res.findingId);
} catch (e) {
  tests.push({
    kind: 'TU_FEATURE' as any,
    target: auditId,
    label: 'Tu feature',
    status: 'FAILED',
    message: (e as Error).message,
  });
}
```

Y agrega el `kind` al tipo en `apps/web/src/hooks/useAiTests.ts`:

```typescript
export type AiTestKind = 'BENFORD' | 'COSO' | 'TU_FEATURE';
```

Más el visual mapping en `AiTestsOrchestratorModal.tsx → KIND_META`.

### Checklist de migración a producción

- [ ] Endpoint Python tiene `verify_internal_key`
- [ ] Endpoint NestJS valida `user.organizationId` (multi-tenant)
- [ ] Resultado se persiste idempotentemente (si re-ejecutas, actualiza en vez de duplicar)
- [ ] Si crea Finding DRAFT, valida que no se duplique en re-ejecuciones
- [ ] Hay manejo de error gracioso (HTTP 502 si ai-service cae, fallback claro)
- [ ] El componente frontend tiene estado de carga, vacío y error
- [ ] El componente no asume que el resultado existe (`if (!result) return EmptyState`)
- [ ] (Si aplica) Agregado al orquestador PI.7d
- [ ] Smoke test en una auditoría real

---

## Patrones por tipo de auditoría — candidatos de Vía B

Casos donde la Vía B tendría más valor por tipo de plantilla:

### Fiscal SV — CT/DGII
- **Verificación NRC/NIT en vivo** contra base DGII (anti-facturas de favor)
- **Validador de correlativo DTE** (sábados, domingos, feriados, saltos)
- **Cuadre triple automático** Libro IVA ↔ F07 ↔ EEFF
- **Generador Anexo 12 SDF** desde la Cédula de Diferencias (D-03)
- **Importador F11/F07/F14 XML** desde el portal SDF

### AML/PLD — LCDA + NRP-36
- **Cruce automático contra OFAC/ONU/UE** lista de sanciones (API)
- **Detector de patrones de smurfing** (depósitos fraccionados < umbral CT)
- **Score automático de PEPs** desde fuentes públicas
- **Generador ROS** en formato UIF/SIRAF

### Forense — ACFE
- **Detector Benford forense por entidad** (no solo global)
- **Generador cadena de custodia** con hash SHA-256 automático al subir evidencia
- **Análisis de red de partes vinculadas** (graph analytics sobre el ERP)

### IT Security — ISO 27001
- **Importador de Nessus/Qualys** scan reports
- **Validador de cumplimiento NRP-23/32** contra evidencia técnica
- **Tracker de tiempo MTTR** de incidentes

### NIA/ISA — Externa Financiera
- **Circularización electrónica** (envío automático de cartas a clientes/bancos)
- **Cuadre EEFF ↔ Mayor General** desde ERP
- **Detector de partes relacionadas** desde Registro de Comercio

### NAIG — Gubernamental
- **Validador LACAP automático** (límites, modalidad, publicación)
- **Verificador SAFI** vs ejecución presupuestaria
- **Detector de fraccionamiento** de compras

### NOGAI/IIA — Interna
- **COSO 17 principios auto-assess** (ya existe — PI.7c)
- **Madurez de procesos APQC** scoring automático
- **3 Líneas de Defensa** auto-mapeo

---

## Convenciones y mejores prácticas

### Naming

- **`code`**: usa el patrón de la plantilla. NOGAI usa `A-01..E-04`. NAIG usa `ACA-01..SEG-01`. Fiscal SV usa `APF-01..D-06` con prefijos por fase (ISR-, IVA-, OF-, AF-).
- **`paperCode`**: solo para papeles **reutilizables** entre plantillas. Convenio: `PT-XXX` (PT por "Papel de Trabajo") o `PT-FAMILIA-N` (`PT-AML-RISK`, `PT-SEC-RISK`).
- **`sectionKey`**: siempre `S1`, `S2`, ... `S10`. Si necesitas sub-campos: `S3.field1`, `S3.field2`. Nunca uses nombres descriptivos como `inherentRisk` — rompe la trazabilidad de los `PaperLinks`.

### Granularidad del grafo

- Define vínculos **a nivel de sección** (`S3`), no de papel completo. Granularidad fina = cascade precisa.
- Si una sección destino se alimenta de **múltiples fuentes** (típico de MASTER), declara N links — uno por fuente.
- **AI_GENERATED** se usa cuando el target requiere síntesis IA del source (animado en el grafo). **DIRECT** cuando es copia textual. **AGGREGATED** cuando es suma/cálculo.

### wpKind

| Si tu papel... | Usa wpKind |
|----------------|------------|
| Solo carga un archivo adjunto | `FILE` |
| Tiene narrativa libre + adjuntos | `STANDARD` |
| Tiene secciones tipadas + el auditor llena | `SMART` |
| Lo llena la IA consolidando otros papeles | `MASTER` |
| Es un dashboard auto-refresh | `LIVE` |

### Cuándo NO usar SMART

- Cuando el papel es **pura evidencia binaria** (un PDF firmado escaneado). Usa `STANDARD` o `FILE`.
- Cuando el contenido es **muy variable** entre auditorías y no aporta declarar secciones. Usa `STANDARD`.

### Cuándo NO usar MASTER

- Si el papel se llena 100% a mano. Usa `SMART`.
- Si no consolida nada — solo es un papel grande. Usa `SMART`.

---

## FAQs

**¿Puedo agregar un papel automático a una auditoría YA creada?**
- Vía A: Sí, vía `addPaperFromTemplate` o creando manualmente desde el editor de papeles. Los PaperLinks NO se inicializan retroactivamente.
- Vía B: Sí, el endpoint backend funciona contra cualquier auditoría existente.

**¿Cómo pruebo localmente?**
```bash
# Terminal 1 — ai-service
cd apps/ai-service && py -3.14 -m uvicorn main:app --port 3003 --reload

# Terminal 2 — api
cd apps/api && npx nest start --watch

# Terminal 3 — web
cd apps/web && npx next dev
```

**¿Cómo migro las plantillas del sistema en producción?**
1. Push del commit a `main`
2. Railway redeploya la API
3. Ir a Admin → Plantillas → "Restaurar plantillas del sistema"
4. Las plantillas existentes se actualizan por match de nombre (preserva ID, no rompe auditorías ya creadas)

**¿Las auditorías existentes verán los nuevos PaperLinks?**
No automáticamente. La instanciación de PaperLinks ocurre durante el scaffold inicial de la auditoría. Para auditorías viejas: o agregas un script de backfill, o el auditor los crea manualmente vía `POST /working-papers/:id/links`.

**¿Cómo agrego un agente IA nuevo?**
Edita `apps/ai-service/app/services/agent_prompts.py` agregando el prompt + en `llm_router.py` agregando el `agent_type` al mapa de complejidad. Luego puedes invocarlo con `chat_with_agent(agent_type="MI_AGENTE", ...)`.

**¿Cómo se factura el costo de tokens?**
Por ahora todo va a la cuenta del workspace de Gemini AI Studio (free tier). En el futuro habrá tracking por organización vía la columna `tokensUsed` que ya devolvemos en cada respuesta IA.

---

## Mantenimiento de este documento

Este documento debe actualizarse cuando:
- Se agregue un nuevo `wpKind` o `mappingType`
- Se agregue una capa nueva a la arquitectura (ej. WebSockets para LIVE en tiempo real)
- Se cambie la convención de `paperCode` o `sectionKey`
- Se agregue una nueva plantilla del sistema

Owner: el equipo que mantiene `apps/api/src/working-papers/` y `apps/api/src/audit-templates/`.
