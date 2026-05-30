# METODOLOGÍA DE AUDITORÍA ALD/PLD
## AuditMind Intelligence Platform — Guía Maestra v9.0

> **Tipo de Auditoría:** `AML` — Prevención del Lavado de Dinero y Activos  
> **Versión:** 9.0 | **Fecha:** Mayo 2026  
> **Clasificación:** Documento Normativo Interno

---

## 1. VISIÓN GENERAL Y OBJETIVOS

La auditoría de Prevención del Lavado de Dinero y Activos (ALD/PLD) evalúa la efectividad del Programa de Cumplimiento ALD del sujeto obligado, verificando el cumplimiento de la Ley LCDA, la NRP-36, las instrucciones de la UIF/SIRAF y los estándares internacionales GAFI/FATF.

### Objetivos específicos
- OBJ-01: Evaluar la adecuación y efectividad del Programa ALD/PLD
- OBJ-02: Verificar el cumplimiento de la Debida Diligencia del Cliente (DDC/KYC/EDD)
- OBJ-03: Revisar los procedimientos de identificación y monitoreo de PEPs
- OBJ-04: Evaluar el sistema de monitoreo de transacciones inusuales y sospechosas
- OBJ-05: Verificar el proceso de elaboración y envío de ROS a la UIF/SIRAF
- OBJ-06: Evaluar la idoneidad del Oficial de Cumplimiento (LCDA Art. 14)
- OBJ-07: Revisar el programa de capacitación y cultura ALD
- OBJ-08: Identificar brechas respecto a la NRP-36 y GAFI 40 Recomendaciones
- OBJ-09: Evaluar productos y servicios de alto riesgo LA/FT
- OBJ-10: Determinar la exposición al riesgo de criptoactivos (Ley Bitcoin / Chivo Wallet)

---

## 2. MARCO NORMATIVO APLICABLE

### 2.1 Normativa El Salvador
| Norma | Descripción | Artículos clave |
|-------|-------------|-----------------|
| LCDA (D.L. 498/1998 y reformas) | Ley Contra el Lavado de Dinero y Activos | Art. 2 (sujetos), Art. 9 (obligaciones), Art. 14 (Oficial de Cumplimiento), Art. 15 (reserva) |
| NRP-36 (BCR/SSF 2022) | Normas para la Gestión del Riesgo de LA/FT | Arts. 1-80 (estructura completa PLD) |
| Instructivo UIF v3 (BCR 2021) | Instructivo para el reporte de operaciones | Sección III (ROS), Sección IV (ROE) |
| CVPCPA Resolución 129/2022 | Guía para auditoría ALD por contadores públicos | Capítulos I-VII |
| Ley Bitcoin (D.L. 57/2021) | Criptoactivos como moneda de curso legal | Arts. 7, 14-16 (reportes) |
| CT El Salvador | Código Tributario | Art. 147-A (información financiera) |

### 2.2 Estándares Internacionales
| Estándar | Descripción |
|---------|-------------|
| GAFI 40 Recomendaciones (2023) | Marco global de estándares ALD/CFT |
| GAFI Metodología de Evaluación | Efectividad (11 resultados inmediatos) + Cumplimiento técnico |
| Wolfsberg Group AML Principles | Principios para correspondent banking y gestión de riesgos |
| Basle Committee Sound Management | Gestión del riesgo de delitos financieros |
| ACAMS Best Practices | Certificación y mejores prácticas CAMS |
| Grupo Egmont | Cooperación entre Unidades de Inteligencia Financiera |

---

## 3. ESTRUCTURA DEL EXPEDIENTE

```
📁 A — Planificación ALD/PLD
📁 B — Ejecución de Pruebas de Cumplimiento
   └── 📁 B-DDC — Debida Diligencia del Cliente (KYC/CDD/EDD)
   └── 📁 B-PEPS — PEPs y Listas de Sanciones
   └── 📁 B-MON — Monitoreo de Transacciones y Operaciones Inusuales
   └── 📁 B-ROS — Reportes de Operaciones Sospechosas (UIF/SIRAF)
   └── 📁 B-OFC — Oficial de Cumplimiento y Estructura
   └── 📁 B-CAP — Capacitación y Cultura ALD
   └── 📁 B-PROD — Productos, Servicios y Canales de Alto Riesgo
📁 C — Lista de Verificación NRP-36
📁 D — Informe ALD y Plan de Remediación
```

---

## 4. CARPETA A — PLANIFICACIÓN ALD/PLD

### A-01: Designación y Términos del Trabajo (STANDARD)
**Objetivo:** Formalizar el encargo de auditoría ALD con el sujeto obligado.  
**Contenido:** Carta de designación, alcance y limitaciones; credencial CVPCPA o designación interna; declaración de independencia; período auditado.  
**Referencia:** LCDA Art. 14; NRP-36 Art. 5; CVPCPA Res. 129/2022 Cap. I.

### A-02: Entendimiento del Sujeto Obligado y Marco Legal (SMART)
**Objetivo:** Documentar el perfil de negocio, tipologías de riesgo y marco regulatorio aplicable.  
**Contenido:** Naturaleza jurídica y tipo de sujeto obligado (NRP-36 Art. 3); productos y servicios ofrecidos; base de clientes (segmentación); estructura organizacional del área de cumplimiento; historial de inspecciones UIF/SSF/BCR; historial de sanciones LCDA; indicadores económicos sectoriales.  
**SMART:** IA analiza el perfil y genera automáticamente la matriz de riesgo inherente por tipología GAFI.  
**Referencia:** NRP-36 Arts. 3, 6-12; GAFI Rec. 1, 26.

### A-03: Evaluación de Riesgo LA/FT — Metodología NRP-36/GAFI (SMART)
**Objetivo:** Evaluar la metodología de Evaluación de Riesgo Institucional (ERI) del sujeto obligado.  
**Contenido:** Revisión de la Evaluación de Riesgo Institucional (NRP-36 Arts. 13-20); análisis de factores de riesgo (clientes, productos, canales, geografías); comparación con la Evaluación Nacional de Riesgo de El Salvador; scoring de riesgo inherente y residual; segmentación de clientes por nivel de riesgo.  
**SMART:** Motor de scoring automático sobre la ERI del sujeto, con benchmarking sectorial.  
**Referencia:** NRP-36 Arts. 13-20; GAFI Rec. 1 y Nota Interpretativa; FATF Guidance on Risk-Based Approach.

### A-04: Evaluación de Controles PLD — 3 Líneas de Defensa (SMART)
**Objetivo:** Evaluar el diseño y efectividad del Programa ALD.  
**Contenido:** Primera línea (unidades de negocio — KYC, alertas); segunda línea (Cumplimiento — monitoreo, políticas); tercera línea (Auditoría Interna — revisión independiente); evaluación del Comité de Cumplimiento (NRP-36 Art. 21).  
**Referencia:** NRP-36 Arts. 21-30; GAFI Rec. 18; IIA Three Lines Model 2020.

### A-05: Memorando de Planificación ALD/PLD (MASTER)
**Objetivo:** Documentar la estrategia de auditoría y enfoques de riesgo.  
**Contenido:** Resumen del sujeto obligado; enfoque de riesgo priorizado; universo de pruebas; recursos y cronograma; áreas de mayor riesgo identificadas en planificación.  
**Referencia:** NRP-36 Art. 5; CVPCPA Res. 129/2022 Cap. III.

### A-06: Programa de Auditoría ALD — GAFI / NRP-36 (MASTER)
**Objetivo:** Programa de trabajo detallado por cada carpeta del expediente.  
**Contenido:** Objetivos por área; procedimientos específicos referenciados a NRP-36 y GAFI; responsables; horas estimadas; criterios de muestreo.  
**Referencia:** NRP-36 Art. 5; GAFI Metodología de Evaluación Sección II.

---

## 5. CARPETA B — EJECUCIÓN DE PRUEBAS

### B-DDC: Debida Diligencia del Cliente

#### B-DDC-01: Muestra de KYC — DDC Estándar y Simplificada (SMART)
**Objetivo:** Verificar la aplicación de los procedimientos de identificación y verificación (CDD/KYC) en clientes de bajo y medio riesgo.  
**Contenido:** Muestra estadística de clientes (mínimo 30-50 expedientes); verificación de documentos de identificación; actualización del perfil financiero; vigencia de la información; coincidencia nombre/actividad/transacciones; DDC simplificada para entidades públicas (NRP-36 Art. 16).  
**Criterios de hallazgo:** Expedientes incompletos; documentos vencidos; perfil no coincide con actividad transaccional.  
**Referencia:** NRP-36 Arts. 15-19; GAFI Rec. 10.

#### B-DDC-02: Muestra de EDD — Debida Diligencia Reforzada (SMART)
**Objetivo:** Verificar los procedimientos de EDD para clientes de alto riesgo, no residentes y relaciones de corresponsalía.  
**Contenido:** Revisión de expedientes de clientes high-risk; verificación de fuente de fondos y riqueza; aprobación por nivel superior (senior management sign-off); frecuencia de actualización; corresponsalía bancaria (NRP-36 Art. 17); clientes no residentes; transacciones con jurisdicciones de alto riesgo (listas GAFI).  
**Referencia:** NRP-36 Arts. 17-18; GAFI Recs. 12-13, 17-18.

#### B-DDC-03: Revisión de Proceso de Apertura y Cierre de Cuentas (STANDARD)
**Objetivo:** Verificar que el proceso de on-boarding aplica controles KYC/ALD antes de establecer la relación.  
**Contenido:** Flujograma del proceso de apertura; controles automatizados previos a la apertura; casos de rechazo de clientes (declination log); proceso de cierre de cuentas sospechosas.  
**Referencia:** NRP-36 Arts. 15, 40-42; GAFI Rec. 10.

---

### B-PEPS: PEPs y Listas de Sanciones

#### B-PEPS-01: Identificación y Gestión de PEPs (SMART)
**Objetivo:** Verificar los procedimientos de identificación y monitoreo de Personas Expuestas Políticamente.  
**Contenido:** Definición interna de PEP vs. NRP-36 Art. 22; herramientas de screening (bases de datos utilizadas); PEPs identificados en la base de clientes; aprobación de alta dirección para relaciones con PEPs; monitoreo reforzado y frecuencia de revisión.  
**SMART:** IA cruza la base de clientes con fuentes de datos públicas de PEPs salvadoreños (SNET, TS, CSJ).  
**Referencia:** NRP-36 Art. 22; GAFI Rec. 12; Wolfsberg PEP Statement 2017.

#### B-PEPS-02: Verificación de Listas de Sanciones (OFAC/ONU/UE/SIRAF) (STANDARD)
**Objetivo:** Verificar que el sujeto obligado realiza screening efectivo contra listas de sanciones.  
**Contenido:** Listas utilizadas: OFAC SDN, ONU Resolución 1267, UE, SIRAF; frecuencia de actualización; casos de coincidencias (true matches); proceso de desbloqueo/reporte; evidencia de screening en apertura y transaccional.  
**Referencia:** NRP-36 Art. 23; GAFI Recs. 6-7; LCDA Art. 9 inciso final.

---

### B-MON: Monitoreo de Transacciones

#### B-MON-01: Evaluación del Sistema de Monitoreo Transaccional (SMART)
**Objetivo:** Evaluar la efectividad del sistema automatizado de monitoreo de transacciones.  
**Contenido:** Descripción del sistema (proveedor, versión, cobertura); reglas/alertas configuradas y su justificación de riesgo; tasa de alertas (alert rate), falsos positivos (false positive rate) y tiempo de resolución; backtesting de reglas contra tipologías GAFI.  
**SMART:** Análisis estadístico de patrones de alertas; identificación de brechas en cobertura de tipologías.  
**Referencia:** NRP-36 Arts. 31-38; GAFI Rec. 10; Wolfsberg FAQs on Transaction Monitoring.

#### B-MON-02: Muestra de Transacciones Inusuales y su Tratamiento (SMART)
**Objetivo:** Verificar el proceso de análisis, escalamiento y resolución de transacciones inusuales.  
**Contenido:** Muestra de alertas generadas en el período; revisión del proceso de investigación interna; documentación de análisis del oficial de cumplimiento; decisiones (cierre/reporte); tiempos de respuesta; casos de "no acción" justificados.  
**Referencia:** NRP-36 Arts. 31-38; GAFI Rec. 20.

#### B-MON-03: Análisis de Transacciones en Efectivo (Reportes ROE) (STANDARD)
**Objetivo:** Verificar el control y reporte de operaciones en efectivo superiores a los umbrales normativos.  
**Contenido:** Revisión de ROE generados y enviados a UIF (umbral NRP-36 Art. 43); efectividad de la detección automática; operaciones fraccionadas (structuring/smurfing); controles en ventanillas.  
**Referencia:** NRP-36 Art. 43; LCDA Art. 9 lit. d); GAFI Rec. 29.

---

### B-ROS: Reportes de Operaciones Sospechosas

#### B-ROS-01: Revisión del Proceso de ROS — UIF/SIRAF (SMART)
**Objetivo:** Verificar la calidad, oportunidad y completitud de los Reportes de Operaciones Sospechosas.  
**Contenido:** Número de ROS presentados en el período vs. promedio sectorial; oportunidad (plazos NRP-36 Art. 44); calidad narrativa de los ROS (elementos GAFI: quién, qué, cuándo, cuánto, cómo, por qué); ROS rechazados por UIF; tasa de ROS vs. base de clientes.  
**SMART:** IA evalúa la calidad narrativa de los ROS y sugiere mejoras según formato SIRAF.  
**Referencia:** NRP-36 Art. 44; LCDA Art. 9 lit. c); GAFI Rec. 20; Instructivo UIF v3.

#### B-ROS-02: Revisión de Casos sin ROS — Non-Filing Analysis (STANDARD)
**Objetivo:** Verificar que el sujeto obligado no omite reportar transacciones que deberían ser reportadas.  
**Contenido:** Análisis de cuentas con actividad inusual no reportada; casos cerrados sin ROS; revisión de "tipping-off" (alertas inadvertidas al cliente); documentación de decisiones de no reportar.  
**Referencia:** NRP-36 Arts. 44-45; LCDA Art. 15 (reserva); GAFI Rec. 21.

---

### B-OFC: Oficial de Cumplimiento

#### B-OFC-01: Evaluación del Oficial de Cumplimiento (STANDARD)
**Objetivo:** Verificar que el Oficial de Cumplimiento cumple con los requisitos de la LCDA y NRP-36.  
**Contenido:** Credenciales y nombramiento formal (LCDA Art. 14); independencia y reporte a alta dirección; recursos asignados (personal, presupuesto, tecnología); acceso a información de clientes y transacciones; participación en Junta Directiva; registro en UIF/SSF/BCR.  
**Referencia:** LCDA Art. 14; NRP-36 Arts. 21-25; GAFI Rec. 18.

#### B-OFC-02: Revisión del Comité de Cumplimiento y Gobierno ALD (STANDARD)
**Objetivo:** Evaluar la estructura de gobierno del programa ALD.  
**Contenido:** Composición y funciones del Comité de Cumplimiento (NRP-36 Art. 21); actas de reuniones periódicas; reporte de KPIs ALD a Junta Directiva; cultura del "tone from the top"; responsabilidades documentadas por área.  
**Referencia:** NRP-36 Arts. 21-26; GAFI Rec. 18; Wolfsberg AML Principles Art. 8.

---

### B-CAP: Capacitación y Cultura ALD

#### B-CAP-01: Revisión del Programa de Capacitación ALD (STANDARD)
**Objetivo:** Verificar la efectividad del programa de capacitación en materia ALD/PLD.  
**Contenido:** Plan anual de capacitación (NRP-36 Art. 27); cobertura por área/cargo; métodos (presencial, e-learning, talleres); evaluaciones y calificaciones; capacitación específica para personal de alto riesgo (ventanilla, negocios internacionales); registro de asistencias.  
**Referencia:** NRP-36 Art. 27; GAFI Rec. 18; ACAMS Best Practices Sec. 7.

---

### B-PROD: Productos, Servicios y Canales de Alto Riesgo

#### B-PROD-01: Evaluación de Productos y Servicios de Alto Riesgo (SMART)
**Objetivo:** Identificar y evaluar los controles sobre productos y canales con mayor exposición al riesgo LA/FT.  
**Contenido:** Inventario de productos/servicios clasificados por riesgo inherente; corresponsalía bancaria y relaciones de pago (NRP-36 Art. 17); banca privada y gestión patrimonial; operaciones transfronterizas; criptoactivos/billetera Chivo (Ley Bitcoin Art. 7); fideicomisos y estructuras complejas; seguros de vida con valor en efectivo.  
**SMART:** Mapa de calor de riesgo por producto/servicio con benchmarking NRP-36.  
**Referencia:** NRP-36 Arts. 6-12, 17; GAFI Recs. 13, 16; Ley Bitcoin 2021.

---

## 6. CARPETA C — LISTA DE VERIFICACIÓN NRP-36

### C-01: Checklist NRP-36 / Instructivo UIF v3 (SMART)
**Objetivo:** Verificación sistemática del cumplimiento de todos los artículos aplicables de la NRP-36.  
**Contenido:** Tabla de cumplimiento artículo por artículo (NRP-36 Arts. 1-80); calificación C/NC/N/A con evidencia; brechas identificadas; plan de subsanación recomendado; comparación con inspecciones anteriores de la SSF/BCR.  
**SMART:** Generación automática del checklist con referencia cruzada a los papeles de trabajo de soportan cada artículo.  
**Referencia:** NRP-36 completa; GAFI 40 Recomendaciones; Instructivo UIF v3.

---

## 7. CARPETA D — INFORME ALD Y PLAN DE REMEDIACIÓN

### D-01: Hallazgo ALD — Formato GAFI/NRP-36 (SMART)
**Objetivo:** Documentar cada deficiencia identificada con la estructura estándar ALD.  
**Contenido:** Condición (qué se encontró); Criterio (NRP-36/LCDA/GAFI que se incumple); Causa (raíz del problema); Efecto (exposición al riesgo LA/FT cuantificada); Recomendación (acciones concretas); clasificación de severidad: Crítica / Alta / Media / Baja.  
**SMART:** IA redacta automáticamente el hallazgo a partir de las evidencias documentadas, con referencias normativas precisas.  
**Referencia:** CVPCPA Res. 129/2022; NRP-36 Art. 5; GAFI Metodología OI.1-OI.11.

### D-02: Resumen de Incumplimientos y Brechas ALD (MASTER)
**Objetivo:** Consolidar todos los hallazgos en un cuadro ejecutivo para la Junta Directiva.  
**Contenido:** Tabla de incumplimientos por carpeta/artículo NRP-36; mapa de calor de riesgo residual; comparación con evaluación anterior; indicadores de efectividad (KPIs ALD); recomendaciones priorizadas.  
**Referencia:** CVPCPA Res. 129/2022 Cap. VI; NRP-36 Art. 5.

### D-03: Informe ALD — Formato CVPCPA Resolución 129/2022 (MASTER)
**Objetivo:** Emitir el informe formal de auditoría ALD según el formato regulatorio del CVPCPA.  
**Contenido:** Informe de cumplimiento: párrafos de alcance, base normativa, trabajos realizados, hallazgos, conclusión y dictamen; formato según CVPCPA Res. 129/2022; firmado por Contador Público Autorizado registrado en CVPCPA.  
**Referencia:** CVPCPA Res. 129/2022; LCDA Art. 14 párrafo final; NRP-36 Art. 5.

### D-04: Plan de Subsanación de Incumplimientos (STANDARD)
**Objetivo:** Documentar los compromisos de remediación acordados con el sujeto obligado.  
**Contenido:** Hallazgo vinculado; acción correctiva específica; responsable; fecha compromiso; recursos requeridos; criterio de cierre; seguimiento trimestral.  
**Referencia:** NRP-36 Arts. 5, 70-80; GAFI Rec. 26.

---

## 8. CLASIFICACIÓN DE PAPELES DE TRABAJO

| Código | Papel | Clasificación |
|--------|-------|---------------|
| A-01 | Designación y Términos | STANDARD |
| A-02 | Entendimiento del Sujeto | SMART |
| A-03 | Evaluación de Riesgo LA/FT | SMART |
| A-04 | Evaluación de Controles PLD | SMART |
| A-05 | Memorando de Planificación | MASTER |
| A-06 | Programa de Auditoría ALD | MASTER |
| B-DDC-01 | Muestra KYC — DDC Estándar | SMART |
| B-DDC-02 | Muestra EDD — Alto Riesgo | SMART |
| B-DDC-03 | Proceso de Apertura/Cierre | STANDARD |
| B-PEPS-01 | Identificación y Gestión PEPs | SMART |
| B-PEPS-02 | Verificación Listas Sanciones | STANDARD |
| B-MON-01 | Sistema de Monitoreo | SMART |
| B-MON-02 | Muestra Transacciones Inusuales | SMART |
| B-MON-03 | Análisis ROE — Efectivo | STANDARD |
| B-ROS-01 | Revisión Proceso ROS | SMART |
| B-ROS-02 | Non-Filing Analysis | STANDARD |
| B-OFC-01 | Oficial de Cumplimiento | STANDARD |
| B-OFC-02 | Comité de Cumplimiento | STANDARD |
| B-CAP-01 | Programa de Capacitación | STANDARD |
| B-PROD-01 | Productos de Alto Riesgo | SMART |
| C-01 | Checklist NRP-36 | SMART |
| D-01 | Hallazgo ALD | SMART |
| D-02 | Resumen de Incumplimientos | MASTER |
| D-03 | Informe ALD CVPCPA | MASTER |
| D-04 | Plan de Subsanación | STANDARD |

**Total: 25 papeles de trabajo**

---

## 9. AGENTES IA ESPECIALIZADOS

### Agente "Cumplimiento" (Planificación)
- Analiza el perfil del sujeto obligado y genera automáticamente la ERI preliminar
- Clasifica el nivel de riesgo global: BAJO / MEDIO / ALTO / MUY ALTO
- Sugiere enfoque de muestreo basado en el riesgo identificado

### Agente "Inspector" (Ejecución)
- Genera automáticamente el checklist NRP-36 (C-01) cruzado con los papeles de trabajo
- Analiza la calidad narrativa de los ROS y sugiere mejoras
- Detecta patrones de riesgo en transacciones de muestra usando reglas GAFI

### Agente "Dictamen" (Informe)
- Redacta automáticamente el Informe ALD según formato CVPCPA Res. 129/2022
- Clasifica hallazgos por severidad con referencias normativas precisas
- Genera el plan de subsanación con plazos razonables por tipo de incumplimiento
