
| MÓDULO ESPECIALIZADO — v9.0 AuditMind Auditoría Forense — Metodología Internacional • ACFE Fraud Examiners Manual • NIA 240 (ISA 240) • IIA Global Practice Guide on Fraud • ISAE 3000 • Contexto El Salvador |
| ----- |

| La auditoría forense en El Salvador se rige por las NIA adoptadas por el CVPCPA (Resolución 462/2021), las directrices del ACFE (Association of Certified Fraud Examiners), la NIA 240 revisada sobre responsabilidades del auditor frente al fraude, y el IIA Global Practice Guide: Internal Auditing and Fraud (3.ª ed., 2024). A diferencia de la auditoría financiera ordinaria, la auditoría forense tiene como objeto específico la investigación de fraude, malversación, corrupción y otras conductas ilegales, con producción de evidencia de calidad judicial. Este módulo implementa el ciclo completo de la auditoría forense con papeles de trabajo inteligentes, cadena de custodia digital, análisis de datos CAATs, entrevistas forenses estructuradas, y generación automatizada del Informe Forense. |
| ----- |

---

## PARTE I — MARCO CONCEPTUAL Y NORMATIVO

---

| MARCO NORMATIVO APLICABLE — Estándares Internacionales con contexto El Salvador |
| :---- |

### 1.1 Jerarquía Normativa

| Norma / Estándar | Referencia | Contenido Clave para la Auditoría Forense |
| :---- | :---- | :---- |
| **NIA 240 (ISA 240) — Revisada** | IAASB / CVPCPA Resolución 462/2021 | Responsabilidades del auditor respecto al fraude: identificación y valoración de riesgos de incorrección material por fraude (párr. 16–24); respuestas a los riesgos valorados (párr. 28–33); presunción irrebatible de riesgo de fraude por anulación de controles por la dirección (párr. 31); procedimientos obligatorios: pruebas de asientos de diario, revisión de estimaciones contables por sesgos, evaluación de transacciones inusuales (párr. 32–34); comunicaciones y documentación (párr. 40–47). Revisión en vigor para ejercicios iniciados a partir del 15/12/2026 |
| **ACFE Fraud Examiners Manual — Ed. 2022** | Association of Certified Fraud Examiners | Manual de referencia del CFE (Certified Fraud Examiner). Sección I: esquemas de fraude (Árbol del Fraude ACFE); Sección II: aspectos legales; Sección III: metodología de investigación — planificación, hipótesis, evidencias, entrevistas, análisis digital, rastreo de activos, informe forense |
| **IIA Global Practice Guide: Internal Auditing and Fraud — 3.ª ed.** | The IIA, 2024 | Rol del auditor interno frente al fraude: evaluación del riesgo de fraude, respuesta ante sospecha, coordinación con investigadores forenses, documentación de hallazgos |
| **ISAE 3000 — Trabajos de Aseguramiento Distintos de Auditoría** | IAASB | Marco de aseguramiento para encargos forenses cuando se emite conclusión: relación tripartita, materia objeto, criterios adecuados, evidencia suficiente, informe de conclusión |
| **ISRS 4400 (Rev.) — Procedimientos Acordados** | IAASB | Base para encargos forenses sin conclusión de aseguramiento: el perito reporta hallazgos (findings) sin emitir opinión. Frecuente en investigaciones por encargo de abogados o junta directiva |
| **Ley Penal de El Salvador — Código Penal** | D.L. 1030/1997 y reformas | Arts. 218–245: delitos contra la Hacienda Pública. Art. 218: peculado. Art. 228: malversación. Art. 240: fraude. Art. 244: cohecho. Referencia obligatoria para calificar hallazgos y su trascendencia penal |
| **Ley de Enriquecimiento Ilícito de Funcionarios** | D.L. 1039/2006 | Marco de referencia para investigaciones forenses en el sector público salvadoreño |
| **Ley de Lavado de Dinero y de Activos (LLDDA)** | D.L. 498/1998 y reformas | Obligaciones de reporte, indicadores de operaciones sospechosas — relevantes cuando los hallazgos forenses involucran movimientos financieros anómalos |
| **Normas Técnicas de Control Interno — Corte de Cuentas** | Corte de Cuentas de El Salvador | Para auditoría forense en entidades gubernamentales: marco de control interno y marco sancionatorio |
| **Código de Ética CVPCPA (CIEPC 2018)** | CVPCPA | Independencia, objetividad, confidencialidad y competencia técnica del auditor forense. Secciones 100–500 |

---

### 1.2 Definiciones Operativas

| Término | Definición (contexto ACFE / NIA 240) |
| :---- | :---- |
| **Auditoría Forense** | Aplicación de técnicas de auditoría, contabilidad e investigación para detectar, documentar y reportar fraude u otras conductas ilegales, con el propósito de producir evidencia de calidad suficiente para uso en procedimientos legales, disciplinarios o administrativos |
| **Fraude Ocupacional (ACFE)** | Uso del cargo para enriquecimiento personal mediante el empleo deliberado de los recursos de la organización. Clasificado en: (1) Malversación de activos, (2) Corrupción, (3) Fraude en estados financieros |
| **Hipótesis de Fraude** | Premisa investigativa que describe el esquema de fraude presunto, el posible perpetrador, los activos o valores afectados, el período y el modus operandi. Base del Plan de Investigación (ACFE FEM Sección III, Cap. 2) |
| **Evidencia Forense** | Todo medio de prueba obtenido siguiendo la cadena de custodia, admisible ante tribunales: documental, digital, testimonial o material. Debe ser relevante, fiable, suficiente y obtenida de forma legítima |
| **Cadena de Custodia** | Registro cronológico e ininterrumpido que documenta la incautación, transferencia, análisis y disposición de la evidencia, garantizando su integridad e identificación inequívoca |
| **CAATs** | Computer-Assisted Audit Techniques: técnicas de análisis de datos (ACL/IDEA/Python/SQL) utilizadas para identificar anomalías, duplicados, transacciones fuera de rango, patrones Benford, entre otros |
| **Triángulo del Fraude (Cressey)** | Modelo explicativo del fraude ocupacional: Presión/Incentivo + Oportunidad + Racionalización. Marco conceptual del ACFE y de la NIA 240 para la evaluación de riesgos de fraude (NIA 240, párr. A1–A6) |
| **Árbol del Fraude (ACFE)** | Taxonomía oficial del ACFE con tres ramas principales (malversación, corrupción, fraude en EF) y más de 50 esquemas específicos. Base para la hipótesis de investigación |
| **Perito Forense** | Profesional con formación en contabilidad, auditoría o finanzas y entrenamiento especializado en investigación de fraude (CFE, ACFE) cuyas conclusiones pueden ser presentadas como testimonio pericial |
| **Escepticismo Profesional** | Actitud que implica una mente inquisitiva y una evaluación crítica de la evidencia. NIA 200 párr. 15; NIA 240 párr. 12–14: aplicación reforzada en contexto de fraude |

---

### 1.3 El Árbol del Fraude ACFE — Mapa de Esquemas

| Rama Principal | Sub-categoría | Ejemplos de Esquemas Específicos |
| :---- | :---- | :---- |
| **Malversación de Activos** (89% casos / mediana $120,000) | Efectivo — Skimming | Cobros no registrados, robo en caja, manipulación de inventario de efectivo |
| | Efectivo — Robo Directo | Robo del efectivo ya contabilizado, manipulación de pagos al banco |
| | Efectivo — Nómina | Empleados fantasma, tasas de pago alteradas, vacaciones no autorizadas pagadas |
| | Efectivo — Facturación | Proveedores ficticios, facturas duplicadas, sobre-facturación |
| | Efectivo — Reembolsos de Gastos | Gastos ficticio, sobre-valorados, personales o múltiples |
| | Activos no monetarios | Hurto de inventario, uso no autorizado de activos, manipulación de registros |
| **Corrupción** (38% casos / mediana $200,000) | Conflicto de Interés | Compras a empresas vinculadas al funcionario sin divulgación |
| | Soborno | Pagos para obtener contratos, licencias o aprobaciones regulatorias |
| | Gratificaciones Ilegales | Regalos post-decisión como reconocimiento por favores otorgados |
| | Extorsión Económica | Funcionario exige pago a cambio de decisión favorable |
| **Fraude en EF** (9% casos / mediana $800,000) | Sobrevaluación de activos | Activos ficticios, manipulación de inventarios, capitalización indebida de gastos |
| | Subrevaluación de pasivos | Pasivos no revelados, provisiones insuficientes |
| | Reconocimiento de ingresos | Ingresos anticipados, transacciones ficticias, channel stuffing |
| | Divulgaciones indebidas | Omisión de información significativa en notas a los EF |

---

### 1.4 Tipos de Encargo Forense

| Tipo de Encargo | Marco Aplicable | Producto Final | Uso Principal |
| :---- | :---- | :---- | :---- |
| **Investigación de Fraude** (Fraud Examination) | ACFE FEM / ISRS 4400 | Informe de Hallazgos (sin conclusión de aseguramiento) | Junta directiva, asesoría legal, proceso disciplinario |
| **Encargo de Aseguramiento Forense** | ISAE 3000 / NIA 240 | Informe con conclusión | Reguladores, accionistas, organismos de control |
| **Peritaje Contable** | Código Procesal Penal SV | Dictamen Pericial | Proceso penal, proceso civil, arbitraje |
| **Auditoría de Cumplimiento Anti-fraude** | IIA Practice Guide / NIA 240 | Informe de auditoría interna | Comité de Auditoría, Directorio |
| **Due Diligence Forense** | ACFE / ISRS 4400 | Memorando de riesgos | M&A, inversiones, crédito |

---

## PARTE II — ÍNDICE COMPLETO DEL EXPEDIENTE FORENSE

---

| ESTRUCTURA DEL EXPEDIENTE DE AUDITORÍA FORENSE — AuditMind v9.0 |
| :---- |

```
EXPEDIENTE FORENSE
│
├── CARPETA A — PLANIFICACIÓN E INVESTIGACIÓN PRELIMINAR
│   ├── A-01  Carta de Encargo y Términos del Trabajo Forense
│   ├── A-02  Evaluación de Independencia, Ética y Conflictos de Interés
│   ├── A-03  Notificación de Alerta / Denuncia (Origen del Encargo)
│   ├── A-04  Hipótesis de Fraude y Mapa de Esquemas ACFE
│   ├── A-05  Plan de Investigación Forense
│   ├── A-06  Evaluación de Riesgo Forense — Triángulo del Fraude
│   └── A-07  Memorando de Planificación Forense [MAESTRO]
│
├── CARPETA B — INVESTIGACIÓN Y EVIDENCIA FORENSE
│   │
│   ├── B-EVD  Evidencia Digital y Cadena de Custodia
│   │   ├── B-EVD-01  Registro de Incautación de Evidencia
│   │   ├── B-EVD-02  Formulario de Cadena de Custodia
│   │   ├── B-EVD-03  Protocolo de Imagen Forense Digital
│   │   └── B-EVD-04  Log de Integridad (Hash SHA-256)
│   │
│   ├── B-INT  Entrevistas Forenses
│   │   ├── B-INT-01  Plan y Guía de Entrevistas
│   │   ├── B-INT-02  Actas de Entrevista a Testigos
│   │   ├── B-INT-03  Actas de Entrevista a Sujetos de Interés
│   │   └── B-INT-04  Análisis de Declaraciones y Contradicciones
│   │
│   ├── B-CAA  CAATs y Análisis de Datos
│   │   ├── B-CAA-01  Programa de Análisis de Datos — CAATs
│   │   ├── B-CAA-02  Prueba de Benford — Primer Dígito
│   │   ├── B-CAA-03  Detección de Duplicados y Pagos Múltiples
│   │   └── B-CAA-04  Análisis de Excepciones y Anomalías
│   │
│   └── B-TXN  Análisis de Transacciones
│       ├── B-TXN-01  Mapeo y Rastreo de Flujos de Fondos
│       ├── B-TXN-02  Análisis de Partes Relacionadas y Vinculadas
│       ├── B-TXN-03  Reconstrucción Contable — Cuentas Afectadas
│       └── B-TXN-04  Cuantificación del Perjuicio Económico
│
├── CARPETA D — HALLAZGOS FORENSES
│   ├── D-01  Cédula Maestra de Hallazgos Forenses [MAESTRO]
│   ├── D-02  Evaluación de Controles que Fallaron o Fueron Eludidos
│   └── D-03  Matriz de Responsabilidades y Perpetradores Identificados
│
└── CARPETA E — INFORME FORENSE
    ├── E-01  Borrador del Informe Forense [MAESTRO]
    ├── E-02  Informe Forense Final — Versión Ejecutiva
    └── E-03  Anexos Técnicos al Informe
```

---

## PARTE III — DESCRIPCIÓN DETALLADA DE PAPELES DE TRABAJO

---

| CARPETA A — PLANIFICACIÓN E INVESTIGACIÓN PRELIMINAR |
| :---- |

---

| A-01 Carta de Encargo y Términos del Trabajo Forense — Formalización del encargo antes de iniciar cualquier actividad investigativa | ESTANDAR — NIA 210 / ISRS 4400 Rev. / ISAE 3000 párr. 23–27 |
| ----- | ----- |

**Objetivo:** Establecer y documentar los términos del encargo forense, definiendo claramente el alcance, las responsabilidades, las limitaciones y el uso previsto del informe.

**Secciones:**
- S1. IDENTIFICACIÓN DE LAS PARTES: nombre del cliente (persona natural/jurídica), representante legal, NIT/NRC, domicilio, tipo de entidad; nombre de la firma auditora, número de registro CVPCPA, socio responsable
- S2. NATURALEZA Y TIPO DE ENCARGO: investigación de fraude (ACFE) / aseguramiento forense (ISAE 3000) / peritaje contable / due diligence forense. Distinción entre encargo de aseguramiento (con conclusión) y procedimientos acordados (sin conclusión de aseguramiento)
- S3. ORIGEN DEL ENCARGO: denuncia anónima / alerta del auditor interno / orden judicial / solicitud de junta directiva / regulador (SSF, Corte de Cuentas) / aseguradora
- S4. ALCANCE DE LA INVESTIGACIÓN: período a investigar, entidades o unidades de negocio incluidas, áreas de sospecha específica, limitaciones de acceso aceptadas
- S5. HIPÓTESIS PRELIMINAR DE FRAUDE: descripción del esquema presunto, clasificación ACFE (malversación / corrupción / fraude en EF), monto estimado del perjuicio si se conoce
- S6. OBLIGACIONES DEL CLIENTE: proporcionar acceso irrestricto a registros, sistemas y personal; no destruir ni alterar evidencia; notificar al auditor de cambios materiales en la situación
- S7. RESPONSABILIDADES DEL AUDITOR FORENSE: planificación de la investigación, obtención y preservación de evidencia, mantenimiento de la confidencialidad, producción del informe bajo el estándar acordado
- S8. PRODUCTO FINAL ESPERADO: tipo de informe, destinatarios autorizados, nivel de confidencialidad, uso legal previsto (proceso penal, proceso administrativo, uso interno)
- S9. HONORARIOS Y CRONOGRAMA: honorarios estimados, forma de pago, cronograma de etapas y entregables
- S10. CONFIRMACIÓN Y FIRMAS: representante legal del cliente, socio responsable del encargo, fecha

**Asistencia IA:** El Agente Lex verifica si el encargo requiere comunicación a autoridades (FGR, UFIS, SSF) según la LLDDA y el tipo de presunto delito. El sistema detecta automáticamente si la entidad es de sector regulado (banca, seguros, gobierno) y activa los marcos normativos adicionales aplicables.

**Recibe de:** Solicitud del cliente, denuncia inicial, expediente del auditor interno
**Alimenta a:** A-03 Notificación de alerta, A-04 Hipótesis de fraude, A-05 Plan de investigación

---

| A-02 Evaluación de Independencia, Ética y Conflictos de Interés — Verificación de que el equipo forense cumple los requisitos de independencia objetividad y competencia | ESTANDAR — NIA 240 párr. 9 / CIEPC 2018 Sección 290 / ACFE Code of Professional Ethics |
| ----- | ----- |

**Objetivo:** Documentar que el equipo forense no tiene conflictos de interés que comprometan su objetividad e independencia antes de aceptar el encargo.

**Secciones:**
- S1. AMENAZAS A LA INDEPENDENCIA: autorevisión (¿el auditor auditó previamente los EF del período investigado?); familiaridad (relación personal con personas investigadas); interés propio (participación financiera en la entidad); intimidación (presión para limitar el alcance)
- S2. CONFLICTOS DE INTERÉS ESPECÍFICOS: ¿algún miembro del equipo conoce a las personas investigadas? ¿tiene acciones, créditos o negocios con la entidad? ¿fue empleado de la entidad en los últimos 3 años?
- S3. COMPETENCIA TÉCNICA DEL EQUIPO: credenciales requeridas (CFE, CPA, especialista en informática forense); experiencia en investigaciones similares; dominio de CAATs y herramientas forenses digitales
- S4. DECLARACIÓN DE CONFIDENCIALIDAD: compromiso de no divulgar información del encargo fuera de los destinatarios autorizados. Especialmente crítico cuando la investigación puede afectar procesos penales en curso
- S5. SALVAGUARDAS APLICADAS: revisión independiente por socio no involucrado, asesoría legal externa, comunicación al comité de auditoría
- S6. CONCLUSIÓN DE ACEPTACIÓN: el encargo puede / no puede aceptarse. Justificación documentada
- S7. FIRMAS: cada miembro del equipo forense declara su independencia, objetividad y competencia

**Asistencia IA:** El sistema cruza automáticamente los datos de los investigados (personas, empresas) contra la lista de clientes actuales y anteriores de la firma para detectar conflictos no revelados.

**Recibe de:** A-01 Carta de encargo (lista de investigados)
**Alimenta a:** A-05 Plan de investigación (equipo confirmado)

---

| A-03 Notificación de Alerta / Denuncia — Registro y análisis del origen del encargo | ESTANDAR — ACFE FEM Sección III, Cap. 1 / NIA 240 párr. 40 |
| ----- | ----- |

**Objetivo:** Documentar y analizar el origen del encargo forense para evaluar la credibilidad inicial de la alerta y orientar la hipótesis de investigación.

**Secciones:**
- S1. FUENTE DE LA ALERTA: línea de denuncia anónima / empleado identificado / cliente / proveedor / auditor interno / regulador / autoridad judicial / detección propia del auditor externo
- S2. CONTENIDO DE LA DENUNCIA: transcripción o resumen de la alerta inicial. Personas mencionadas, hechos descritos, período aproximado, monto estimado si se indica
- S3. EVALUACIÓN DE CREDIBILIDAD: ¿la denuncia contiene hechos específicos y verificables? ¿la fuente tiene acceso a la información que reporta? ¿existen denuncias previas similares? Calificación: Alta / Media / Baja credibilidad
- S4. ANÁLISIS DE MOTIVACIONES: ¿la fuente podría tener motivaciones personales que distorsionen la información? (conflicto laboral, despido reciente, litigio con la entidad)
- S5. HECHOS PRELIMINARMENTE VERIFICADOS: información pública o interna ya disponible que corrobora o contradice la denuncia antes de iniciar la investigación formal
- S6. ACCIONES INMEDIATAS TOMADAS: preservación preventiva de evidencia, restricción de accesos, comunicación a junta directiva o comité de auditoría, notificación legal si aplica
- S7. DECISIÓN DE INVESTIGAR: proceder con investigación completa / investigación preliminar / desestimar con documentación de razones

**Asistencia IA:** El Agente Cassandra cruza la alerta con noticias públicas, registros del MH, Registro de Comercio y datos del mercado para identificar información corroborante o contradictoria.

---

| A-04 Hipótesis de Fraude y Mapa de Esquemas ACFE — Marco conceptual de la investigación | SMART — ACFE FEM Sección III, Cap. 2 / Árbol del Fraude ACFE |
| ----- | ----- |

**Objetivo:** Formular la hipótesis de fraude investigable y mapearla en el Árbol del Fraude ACFE para orientar la selección de procedimientos de investigación.

**Secciones:**
- S1. DECLARACIÓN DE LA HIPÓTESIS PRINCIPAL: "Se presume que [persona/unidad], durante [período], ejecutó el esquema de [tipo ACFE], resultando en un perjuicio estimado de [$X], mediante el método de [descripción del modus operandi]". Formulación específica y falsificable
- S2. CLASIFICACIÓN EN EL ÁRBOL DEL FRAUDE ACFE: ubicación precisa del esquema presunto en las tres ramas (malversación / corrupción / fraude en EF) y sub-categoría específica
- S3. HIPÓTESIS ALTERNATIVAS: al menos dos hipótesis alternativas que también explicarían los hechos observados (principio de mente abierta del ACFE). Incluir la hipótesis nula (no hay fraude, solo error)
- S4. INDICADORES QUE SUSTENTAN LA HIPÓTESIS: señales de alerta (red flags) específicas observadas. Clasificación NIA 240: Apéndice 1 — factores de riesgo por tipo de fraude
- S5. SEÑALES DE ALERTA POR CATEGORÍA (NIA 240 Apéndice 1):
  - Incentivos/Presiones: situación financiera personal comprometida, metas de desempeño agresivas, bonos vinculados a resultados
  - Oportunidades: débil segregación de funciones, controles deficientes, acceso irrestricto a activos líquidos, ausencia de supervisión
  - Actitudes/Racionalización: antecedentes de conducta cuestionable, cultura organizacional tolerante al fraude, conflictos con la administración
- S6. PERSONAS O UNIDADES BAJO INVESTIGACIÓN: listado preliminar. Distinción: personas de interés / testigos / perpetradores presuntos
- S7. ACTIVOS O VALORES PRESUNTAMENTE AFECTADOS: tipo (efectivo, activos fijos, información confidencial), monto estimado, período afectado
- S8. REVISIÓN Y ACTUALIZACIÓN: la hipótesis se revisa durante la investigación conforme nueva evidencia es obtenida. Control de versiones

**Asistencia IA:** El Agente Atlas genera automáticamente las señales de alerta relevantes para el tipo de esquema ACFE identificado, con referencias a los indicadores específicos del ACFE Fraud Examiners Manual y la NIA 240 Apéndice 1.

---

| A-05 Plan de Investigación Forense — Hoja de ruta de la investigación | MAESTRO — ACFE FEM Sección III, Cap. 2 / IIA Practice Guide on Fraud, Cap. 4 |
| ----- | ----- |

**Objetivo:** Definir la estrategia, los procedimientos, el equipo, el cronograma y los recursos necesarios para ejecutar la investigación forense de manera ordenada, eficiente y jurídicamente válida.

**Secciones:**
- S1. RESUMEN EJECUTIVO DEL PLAN: hipótesis de fraude, alcance, enfoque general, destinatarios del informe, fecha estimada de conclusión
- S2. PROCEDIMIENTOS DE INVESTIGACIÓN POR FASE:
  - Fase 1 — Recolección y preservación de evidencia documental y digital
  - Fase 2 — Análisis de datos CAATs sobre sistemas contables y financieros
  - Fase 3 — Análisis de transacciones específicas (rastreo de fondos)
  - Fase 4 — Entrevistas a testigos y personas de interés
  - Fase 5 — Síntesis de hallazgos y cuantificación del perjuicio
  - Fase 6 — Elaboración y presentación del informe forense
- S3. TÉCNICAS ESPECÍFICAS POR HIPÓTESIS: para cada hipótesis del A-04, procedimientos específicos diseñados para confirmarla o refutarla
- S4. FUENTES DE EVIDENCIA IDENTIFICADAS: bases de datos contables (ERP), registros bancarios, correos electrónicos, documentos físicos, registros de acceso a sistemas, declaraciones de empleados, registros públicos (Registro de Comercio, DGIPC, SSF)
- S5. EQUIPO DE INVESTIGACIÓN: socio responsable, gerente de investigación, especialista en CAATs, especialista en informática forense, abogado consultor. Responsabilidades y nivel de acceso por persona
- S6. COORDINACIÓN INTERDISCIPLINARIA: con asesoría legal (si la investigación tiene potencial penal), con el departamento de RRHH (entrevistas), con TI (acceso a sistemas y extracción de datos), con la junta directiva o comité de auditoría
- S7. CONFIDENCIALIDAD Y SEGURIDAD DE LA INVESTIGACIÓN: protocolo de comunicaciones seguras, personas autorizadas a conocer la investigación, medidas para evitar destrucción de evidencia durante la investigación (ACFE: "preserving the scene")
- S8. CRONOGRAMA Y ENTREGABLES: tabla con fases, fechas de inicio y fin, entregables por fase, hitos clave
- S9. PRESUPUESTO DE HORAS: estimado de horas por fase y por miembro del equipo
- S10. APROBACIÓN: firma del socio responsable y del cliente (junta directiva o representante autorizado)

**Asistencia IA:** El Agente Atlas genera el cronograma automáticamente basándose en el tipo de esquema ACFE, el tamaño de la entidad y los recursos disponibles. Sugiere procedimientos específicos desde la base de conocimiento del ACFE FEM Sección III.

---

| A-06 Evaluación de Riesgo Forense — Triángulo del Fraude y Factores de Vulnerabilidad | INTELIGENTE — NIA 240 párr. 16–27 / ACFE FEM / IIA Practice Guide Cap. 2 |
| ----- | ----- |

**Objetivo:** Evaluar los factores de riesgo de fraude presentes en la entidad investigada para priorizar áreas de investigación y calibrar la extensión de los procedimientos.

**Secciones:**
- S1. EVALUACIÓN DEL COMPONENTE "PRESIÓN/INCENTIVO": indicadores financieros de la entidad (pérdidas, deudas, metas incumplidas); situación financiera personal de los investigados; presión de terceros (accionistas, acreedores, reguladores); bonos y compensaciones vinculadas a resultados
- S2. EVALUACIÓN DEL COMPONENTE "OPORTUNIDAD": debilidades en el control interno (NIA 240 párr. 16; NIA 315 parr. 25–40); ausencia de segregación de funciones en áreas críticas; acceso irrestricto a activos líquidos; ausencia o ineficacia del auditor interno; falta de supervisión efectiva; sistemas de información con controles inadecuados
- S3. EVALUACIÓN DEL COMPONENTE "RACIONALIZACIÓN": cultura organizacional (tone at the top); antecedentes de irregularidades no sancionadas; rotación excesiva de personal en cargos clave; quejas o reclamaciones de empleados no atendidas; evidencia de conductas deshonestas menores toleradas
- S4. EVALUACIÓN DE VULNERABILIDADES POR ÁREA: tabla por área de la organización (tesorería, compras, nómina, ventas, contratos) con calificación de vulnerabilidad: Alta / Media / Baja
- S5. ÁREAS DE MAYOR RIESGO FORENSE: consolidación de las áreas con mayor vulnerabilidad — estas recibirán mayor extensión de procedimientos
- S6. TIPOS DE FRAUDE MÁS PROBABLES: basándose en la evaluación anterior, listado de los 3-5 esquemas ACFE con mayor probabilidad en esta entidad específica
- S7. IMPACTO EN EL PLAN DE INVESTIGACIÓN: ajustes al A-05 derivados de esta evaluación

**Asistencia IA:** El Agente Minerva ejecuta automáticamente un análisis cuantitativo de los EF históricos para detectar variaciones atípicas que refuercen los factores de riesgo identificados (Beneish M-Score, ratios financieros de alerta).

---

| A-07 Memorando de Planificación Forense — Documento maestro que consolida toda la planificación | MAESTRO — ACFE FEM Sección III, Cap. 2 / NIA 300 párr. 7–12 |
| ----- | ----- |

**Objetivo:** Consolidar en un único documento la estrategia de la investigación forense, los hallazgos preliminares, las decisiones metodológicas y la asignación de responsabilidades.

**Secciones:**
- S1. ENCABEZADO DEL ENCARGO: cliente, tipo de encargo, período investigado, socio responsable, número de encargo, clasificación de confidencialidad
- S2. RESUMEN DE LA ALERTA Y HECHOS CONOCIDOS (de A-03): síntesis de la denuncia, hechos verificados preliminarmente
- S3. HIPÓTESIS DE INVESTIGACIÓN (de A-04): hipótesis principal y alternativas, clasificación ACFE
- S4. EVALUACIÓN DE RIESGO (de A-06): resumen de factores del triángulo del fraude, áreas de mayor vulnerabilidad
- S5. ESTRATEGIA DE INVESTIGACIÓN (de A-05): enfoque general, fases, técnicas principales
- S6. COORDINACIÓN INSTITUCIONAL: entidades externas a contactar (FGR si hay potencial penal, UFIS/UIF si hay indicios de lavado, reguladores sectoriales), mecanismos de comunicación
- S7. CONSIDERACIONES LEGALES: legislación penal aplicable a los hechos presuntos (Código Penal SV), naturaleza de los hallazgos como evidencia procesal, restricciones sobre divulgación
- S8. CRONOGRAMA CONSOLIDADO: fases, fechas, entregables (de A-05)
- S9. EQUIPO Y RESPONSABILIDADES (de A-02 y A-05): integrantes, roles, accesos autorizados
- S10. APROBACIÓN Y CONTROL: firma del socio, versión del documento, log de modificaciones

**Asistencia IA:** El Agente Cicero Forense genera el borrador completo del memorando en 45 segundos consolidando los datos de A-03 a A-06. Cada sección tiene trazabilidad hacia el PT fuente.

---

| CARPETA B — INVESTIGACIÓN Y EVIDENCIA FORENSE |
| :---- |

---

### SUBCARPETA B-EVD — EVIDENCIA DIGITAL Y CADENA DE CUSTODIA

---

| B-EVD-01 Registro de Incautación de Evidencia — Documentación de la obtención inicial de cada elemento de evidencia | ESTANDAR — ACFE FEM Sección III / ISO/IEC 27037:2012 |
| ----- | ----- |

**Objetivo:** Documentar de forma precisa y cronológicamente exacta cada elemento de evidencia obtenido durante la investigación, estableciendo el punto de inicio de la cadena de custodia.

**Secciones:**
- S1. IDENTIFICACIÓN DEL ELEMENTO: número único de evidencia (Ej: EVD-001), descripción, tipo (documento físico, dispositivo digital, correo electrónico, registro contable, etc.)
- S2. FUENTE Y ORIGEN: de quién se obtuvo, en qué lugar, en qué circunstancias. Nombre del custodio original
- S3. CONDICIÓN AL MOMENTO DE INCAUTACIÓN: descripción del estado físico o digital del elemento, observaciones relevantes
- S4. MÉTODO DE OBTENCIÓN: recuperación voluntaria con consentimiento firmado / orden judicial / copia forense certificada / exportación de sistema
- S5. FECHA, HORA Y UBICACIÓN EXACTAS: registro con precisión de minutos. Crítico para admisibilidad procesal
- S6. PERSONAL PRESENTE: nombres y firmas de todos los presentes en el momento de la incautación (investigadores, representantes de la entidad, testigos)
- S7. FOTOGRAFÍAS O DOCUMENTACIÓN VISUAL: referencia a las fotografías tomadas del elemento en su estado original y su ubicación
- S8. ENTREGA A CADENA DE CUSTODIA: transferencia al formulario B-EVD-02. Firma del que entrega y del que recibe

**Una fila por cada elemento de evidencia. El registro es inmutable una vez completado.**

---

| B-EVD-02 Formulario de Cadena de Custodia — Trazabilidad completa de cada elemento de evidencia desde la incautación hasta la presentación | ESTANDAR — ACFE FEM / Guía OECE sobre Análisis Forense / Jurisprudencia SV |
| ----- | ----- |

**Objetivo:** Mantener un registro ininterrumpido de todos los movimientos, transferencias y accesos a cada elemento de evidencia, garantizando su integridad e impidiendo alegaciones de manipulación.

**Secciones:**
- S1. ENCABEZADO DEL ELEMENTO: número de evidencia (de B-EVD-01), descripción resumida, número de caso
- S2. REGISTRO CRONOLÓGICO DE TRANSFERENCIAS: tabla con columnas — Fecha/Hora | Acción (Recepción/Transferencia/Análisis/Almacenamiento/Presentación) | Razón | De (nombre y firma) | Para (nombre y firma) | Ubicación de almacenamiento | Condición verificada
- S3. ALMACENAMIENTO SEGURO: ubicación física o digital del elemento (caja fuerte, repositorio cifrado), condiciones de acceso controlado
- S4. VERIFICACIONES PERIÓDICAS DE INTEGRIDAD: para evidencia digital, verificación de hash (SHA-256) antes y después de cada acceso para confirmar que no ha sido alterada
- S5. ACCESOS PARA ANÁLISIS: cada vez que el elemento es accedido para análisis, se registra quién, cuándo, con qué propósito y qué herramientas utilizó
- S6. PRESENTACIÓN ANTE AUTORIDADES: si el elemento es presentado ante tribunal, FGR, SSF u otra autoridad, se registra la entidad receptora, número de expediente y nombre del receptor
- S7. DISPOSICIÓN FINAL: instrucciones sobre qué hacer con el elemento al concluir el caso (devolver al cliente, conservar por período definido, destruir bajo protocolo)

**La cadena de custodia es el documento más crítico de la investigación forense. Cualquier ruptura puede hacer inadmisible la evidencia en un proceso judicial.**

---

| B-EVD-03 Protocolo de Imagen Forense Digital — Procedimiento técnico para la copia forense de dispositivos y sistemas | ESTANDAR — ISO/IEC 27037:2012 / NIST SP 800-86 / ACFE FEM |
| ----- | ----- |

**Objetivo:** Documentar el proceso técnico de creación de imágenes forenses de dispositivos digitales (computadoras, servidores, dispositivos móviles, medios de almacenamiento) garantizando que el original no es alterado.

**Secciones:**
- S1. DISPOSITIVO OBJETO DE IMAGEN: identificación completa (marca, modelo, serial, capacidad), estado al momento del proceso, fotografías pre-proceso
- S2. HERRAMIENTA FORENSE UTILIZADA: nombre y versión del software (FTK Imager, dd, Cellebrite, EnCase, Autopsy, Magnet AXIOM), validación de la herramienta, número de licencia
- S3. WRITE BLOCKER: uso obligatorio de bloqueador de escritura (hardware o software) para impedir modificación del original. Marca y modelo del dispositivo utilizado
- S4. HASH PRE-IMAGEN: cálculo del hash SHA-256 del dispositivo original antes de iniciar la copia. Valor registrado y firmado por dos técnicos
- S5. PROCESO DE IMAGEN: formato de imagen (E01, RAW/dd, AFF4), fecha/hora de inicio y fin, incidencias durante el proceso
- S6. HASH POST-IMAGEN: cálculo del hash del archivo de imagen creado. Comparación con el hash pre-imagen para verificar integridad. Deben ser idénticos
- S7. ALMACENAMIENTO DE LA IMAGEN: ubicación del archivo de imagen (medio extraíble cifrado, servidor forense seguro), dos copias en medios distintos
- S8. FIRMAS: técnico que ejecutó el proceso, supervisor de calidad forense, representante de la entidad investigada (como testigo, no como participante técnico)

---

| B-EVD-04 Log de Integridad (Hash SHA-256) — Registro continuo de verificaciones de integridad de la evidencia digital | ESTANDAR — ISO/IEC 27037:2012 / ACFE FEM Sección III |
| ----- | ----- |

**Objetivo:** Mantener un registro permanente de los valores hash de todos los elementos de evidencia digital para demostrar que no han sido alterados en ningún momento de la investigación.

**Secciones:**
- S1. TABLA DE HASH POR ELEMENTO: Número EVD | Nombre del archivo/dispositivo | Hash SHA-256 original | Hash SHA-256 verificado (fecha/hora) | Resultado (Coincide / No coincide) | Verificador
- S2. VERIFICACIONES PROGRAMADAS: hash verificado al inicio y al final de cada sesión de análisis, antes de transferencias, antes de presentar ante autoridades
- S3. ALERTAS DE DISCREPANCIA: si el hash no coincide en alguna verificación, el elemento queda en cuarentena y se documenta la incidencia con análisis de causa
- S4. HERRAMIENTA DE VERIFICACIÓN: software utilizado para calcular el hash (sha256sum, HashCalc, FTK, etc.)

---

### SUBCARPETA B-INT — ENTREVISTAS FORENSES

---

| B-INT-01 Plan y Guía de Entrevistas — Estrategia para la conducción de entrevistas forenses | INTELIGENTE — ACFE FEM Sección III, Cap. 4 / IIA Practice Guide on Fraud Cap. 5 |
| ----- | ----- |

**Objetivo:** Planificar la secuencia, el contenido y la metodología de las entrevistas forenses para maximizar la obtención de información relevante y admisible.

**Secciones:**
- S1. CLASIFICACIÓN DE LOS ENTREVISTADOS: tres categorías ACFE —
  - Testigos informativos: conocen los hechos sin ser partícipes (colegas, supervisores, proveedores)
  - Personas de interés: con conocimiento directo o posible participación (no son acusados formalmente)
  - Sujetos de la investigación: presuntos perpetradores
- S2. SECUENCIA ESTRATÉGICA: el ACFE recomienda entrevistar primero a testigos informativos (ampliar contexto), luego a personas de interés, y finalmente a sujetos de investigación. Los sujetos de investigación se entrevistan cuando ya se cuenta con suficiente evidencia documental
- S3. OBJETIVOS POR ENTREVISTA: para cada entrevistado, qué información específica se busca obtener, qué hipótesis se desea confirmar o refutar
- S4. TÉCNICAS DE ENTREVISTA ACFE:
  - Técnica cognitiva: recuperación del recuerdo en orden cronológico y no cronológico
  - Análisis de contenido basado en criterios (CBCA): evaluación de la credibilidad del relato
  - Preguntas abiertas (ACFE): "Cuénteme sobre...", "Descríbame...", "Explíqueme..." antes de preguntas cerradas
  - Detección de contradicciones: formulación de las mismas preguntas en diferentes momentos y orden
- S5. PREGUNTAS GUÍA POR ÁREA DE INVESTIGACIÓN: listado de preguntas abiertas, de sondeo y de cierre para cada área investigada (nómina, compras, efectivo, contratos)
- S6. LOGÍSTICA: lugar de la entrevista (privado, neutral), duración estimada, quién entrevista, quién toma notas, si se graba o no, necesidad de intérprete, asesor legal presente
- S7. DERECHOS DEL ENTREVISTADO: información de los derechos del entrevistado según la legislación salvadoreña (Código Procesal Penal Arts. 86-90), especialmente para sujetos de investigación
- S8. DOCUMENTACIÓN: formulario de consentimiento para grabación (si aplica), acta de entrevista (B-INT-02 o B-INT-03)

---

| B-INT-02 Actas de Entrevista a Testigos — Documentación de entrevistas a personas con conocimiento informativo | ESTANDAR — ACFE FEM Sección III, Cap. 4 |
| ----- | ----- |

**Objetivo:** Documentar de forma precisa el contenido de las entrevistas realizadas a testigos, preservando la información de manera admisible y reproducible.

**Secciones (una acta por entrevista):**
- S1. ENCABEZADO: número de acta, número de caso, fecha, hora de inicio y fin, lugar, nombre y cargo del entrevistado, nombre del entrevistador, nombre del documentador/testigo de la entrevista
- S2. ADVERTENCIAS Y CONSENTIMIENTO: se informó al entrevistado que la entrevista es voluntaria (si no es bajo orden judicial), que la información puede ser usada en procedimientos legales, si la entrevista es grabada y el consentimiento otorgado
- S3. DECLARACIÓN DEL ENTREVISTADO: relato en primera persona, en la medida de lo posible usando las palabras exactas del entrevistado. Evitar parafrasear de forma que cambie el sentido
- S4. PREGUNTAS Y RESPUESTAS RELEVANTES: formato Q&A para las partes más importantes de la entrevista
- S5. DOCUMENTOS MOSTRADOS AL ENTREVISTADO: listado de documentos presentados, reacciones del entrevistado, aclaraciones o reconocimientos hechos
- S6. INCONSISTENCIAS O CONTRADICCIONES OBSERVADAS: notas del entrevistador sobre aspectos que requieren verificación adicional o entrevistas de seguimiento
- S7. CIERRE Y FIRMA: confirmación del entrevistado de que el contenido del acta es preciso, firma del entrevistado (si acepta firmar), firma del entrevistador y del documentador

---

| B-INT-03 Actas de Entrevista a Sujetos de Interés — Documentación de entrevistas a personas directamente involucradas | INTELIGENTE — ACFE FEM Sección III, Cap. 4 / Técnica de Entrevista Cognitiva |
| ----- | ----- |

**Objetivo:** Documentar entrevistas a personas con posible participación directa en los hechos investigados, con mayor rigor metodológico dado el potencial uso en procesos legales.

**Secciones:**
- S1-S7: Igual que B-INT-02, con las siguientes adiciones:
- S8. TÉCNICA DE DETECCIÓN DE ENGAÑO (ACFE FEM): análisis de las respuestas para indicadores conductuales (hesitación excesiva, respuestas evasivas, cambios de tema, micro-expresiones si la entrevista es en persona o grabada en video) — **Nota: estos indicadores son orientativos, no concluyentes por sí solos**
- S9. DERECHOS COMUNICADOS: especialmente si el sujeto podría ser imputado en un proceso penal. En El Salvador, el Art. 87 del Código Procesal Penal establece el derecho a no auto-incriminarse. El auditor forense (no el fiscal) no puede obligar a declarar
- S10. DOCUMENTOS EXHIBIDOS Y REACCIONES: documentación detallada de qué evidencia documental fue mostrada al sujeto y cuál fue su reacción específica (reconocimiento, negación, explicación alternativa)
- S11. ADMISIONES O DECLARACIONES SIGNIFICATIVAS: transcripción literal de cualquier admisión, reconocimiento o declaración significativa

**Advertencia:** En El Salvador, las entrevistas conducidas por el auditor forense en el marco de una investigación privada no tienen el mismo valor probatorio que una declaración ante la FGR. El acta de entrevista es evidencia de contexto, no una confesión judicial. Si se obtiene información que podría constituir evidencia de un delito, coordinar inmediatamente con el asesor legal.

---

| B-INT-04 Análisis de Declaraciones y Contradicciones — Síntesis analítica de las entrevistas para identificar patrones | INTELIGENTE — ACFE FEM Sección III / Análisis de Veracidad de Declaraciones |
| ----- | ----- |

**Objetivo:** Cruzar y analizar las declaraciones de todos los entrevistados para identificar consistencias, contradicciones, patrones y puntos que requieren investigación adicional.

**Secciones:**
- S1. MATRIZ DE CONSISTENCIA: tabla de doble entrada — hechos investigados vs. versión de cada entrevistado. Identificación de puntos de consenso y divergencia
- S2. CONTRADICCIONES SIGNIFICATIVAS: listado de contradicciones materiales entre declaraciones de diferentes personas o entre declaraciones y la evidencia documental. Cada contradicción con su análisis y posibles explicaciones
- S3. INFORMACIÓN NO VERIFICADA: declaraciones que aún no han sido corroboradas por evidencia documental o de otra fuente. Plan para verificarlas
- S4. NUEVAS LÍNEAS DE INVESTIGACIÓN: pistas o información nueva obtenida en las entrevistas que no estaba contemplada en la hipótesis inicial. Actualización del Plan de Investigación (A-05) si es necesario
- S5. EVALUACIÓN DE CREDIBILIDAD: para los testigos y sujetos más relevantes, evaluación de la credibilidad de sus declaraciones basada en coherencia interna, consistencia con la evidencia y consistencia entre entrevistas
- S6. CONCLUSIONES INTERMEDIAS: qué aportan las entrevistas a la confirmación o refutación de la hipótesis principal (A-04)

---

### SUBCARPETA B-CAA — CAATs Y ANÁLISIS DE DATOS

---

| B-CAA-01 Programa de Análisis de Datos — CAATs — Diseño y documentación de los procedimientos de análisis computacional | INTELIGENTE — ACFE FEM Sección III / IIA Practice Guide / AICPA Guide on Data Analytics |
| ----- | ----- |

**Objetivo:** Diseñar y documentar los procedimientos de análisis de datos computacional (CAATs) aplicados a los sistemas contables, de nómina, de compras y otros relevantes para la investigación.

**Secciones:**
- S1. FUENTES DE DATOS ANALIZADAS: sistemas de origen (ERP, sistema de nómina, sistema bancario, Excel del área investigada), bases de datos extraídas, período cubierto, volumen de registros
- S2. PROCESO DE EXTRACCIÓN DE DATOS: método de extracción (export directo del sistema, SQL query, acceso al servidor), fecha de extracción, responsable, hash SHA-256 del archivo extraído (preservación de evidencia del dataset)
- S3. HERRAMIENTAS UTILIZADAS: ACL Analytics / IDEA / Python (pandas, numpy) / SQL / Power BI / Excel avanzado. Versión de cada herramienta
- S4. PROCEDIMIENTOS DE ANÁLISIS DISEÑADOS: tabla con columnas — Procedimiento | Objetivo | Fuente de Datos | Hipótesis que prueba | Resultados Esperados | Referencia al papel donde se documenta el resultado
- S5. VALIDACIÓN DE LA INTEGRIDAD DE LOS DATOS: verificación de que los datos extraídos son completos y no han sido alterados (totales de control, recuento de registros, comparación con estados financieros auditados)
- S6. DOCUMENTACIÓN DE SCRIPTS Y CONSULTAS: código SQL/Python/ACL utilizado en cada análisis, guardado como anexo del paper. Reproducibilidad como requisito de calidad forense

---

| B-CAA-02 Prueba de Benford — Análisis del Primer Dígito — Detección de manipulación en montos de transacciones | INTELIGENTE — Benford (1938) / Nigrini (1999) / ACFE FEM / NIA 240 |
| ----- | ----- |

**Objetivo:** Aplicar la Ley de Benford al análisis del primer dígito de transacciones financieras para detectar manipulaciones en los montos registrados, un indicador de fraude contable validado internacionalmente.

**Marco teórico:** La Ley de Benford establece que en conjuntos de datos numéricos naturales, los primeros dígitos no se distribuyen uniformemente: el 1 ocurre como primer dígito ~30.1% de las veces, el 2 ~17.6%, el 3 ~12.5%, etc. Desviaciones significativas de esta distribución pueden indicar manipulación de datos (redondeo de montos para evadir umbrales de aprobación, montos fabricados, etc.). Validado para auditoría forense: Nigrini (1999), ACFE FEM Sección III.

**Secciones:**
- S1. CONJUNTO DE DATOS ANALIZADO: transacciones de [área/período], número total de registros, monto total, período
- S2. ANÁLISIS DEL PRIMER DÍGITO: distribución observada vs. distribución esperada de Benford. Tabla y gráfico de barras
- S3. PRUEBA CHI-CUADRADO: estadístico chi-cuadrado calculado, grados de libertad, valor p, umbral de significancia utilizado (p < 0.05). Conclusión: ¿la distribución es consistente con Benford?
- S4. ANÁLISIS DE SEGUNDO DÍGITO (opcional para datasets grandes): mayor sensibilidad para detectar montos "justo debajo" de umbrales de aprobación (Ej: $9,900 si el umbral es $10,000)
- S5. ANÁLISIS DE LOS DOS PRIMEROS DÍGITOS (Nigrini): análisis del número de dos dígitos (10–99) para mayor precisión
- S6. INTERVALOS DE SOSPECHA: rangos de montos con desviaciones estadísticamente significativas que requieren investigación detallada
- S7. TRANSACCIONES IDENTIFICADAS PARA REVISIÓN: listado de transacciones en los rangos sospechosos, referencia a B-TXN para análisis detallado
- S8. LIMITACIONES: la Ley de Benford no aplica a: montos asignados por política (honorarios fijos), cuentas con poco volumen (<100 registros), o conjuntos con rango restringido. Documentación de por qué el conjunto analizado es apropiado para la prueba

---

| B-CAA-03 Detección de Duplicados y Pagos Múltiples — Identificación de facturas, pagos o registros duplicados | INTELIGENTE — ACFE FEM / Datos de Esquemas de Facturación Duplicada |
| ----- | ----- |

**Objetivo:** Detectar pagos duplicados, facturas duplicadas y registros replicados que puedan indicar fraude en el área de cuentas por pagar, nómina o contratos.

**Secciones:**
- S1. FUENTES ANALIZADAS: facturas pagadas, cheques emitidos, transferencias bancarias, registros de nómina — período completo bajo investigación
- S2. CRITERIOS DE DUPLICACIÓN ANALIZADOS:
  - Mismo monto + mismo proveedor + misma fecha = duplicado exacto
  - Mismo monto + mismo proveedor + fechas próximas = posible duplicado temporal
  - Mismo número de factura + diferente proveedor = posible factura falsa reutilizada
  - Mismo beneficiario en nómina + diferente número de cuenta = empleado fantasma con datos alterados
  - Montos levemente distintos + mismo contexto = variación deliberada para evadir detección
- S3. RESULTADOS: tabla de duplicados encontrados — Fecha | Proveedor/Beneficiario | Monto | Número de documento | Registro duplicado
- S4. ANÁLISIS DE CADA GRUPO DE DUPLICADOS: para cada duplicado identificado, verificación documental para determinar si es error legítimo (ej: devolución y re-emisión) o fraude
- S5. DUPLICADOS CONFIRMADOS COMO IRREGULARES: monto total de pagos duplicados sin justificación legítima. Referencia a B-TXN-04 para inclusión en la cuantificación del perjuicio

---

| B-CAA-04 Análisis de Excepciones y Anomalías — Procedimientos analíticos para detectar transacciones fuera de parámetros normales | INTELIGENTE — ACFE FEM / NIA 240 párr. 32–33 (transacciones inusuales) |
| ----- | ----- |

**Objetivo:** Identificar transacciones o patrones que se desvían significativamente de los comportamientos históricos o esperados de la entidad, indicadores de posible fraude u otras irregularidades.

**Secciones:**
- S1. ANÁLISIS DE ESTRATIFICACIÓN: distribución de transacciones por rangos de monto para identificar concentraciones inusuales o ausencias notables
- S2. ANÁLISIS DE TENDENCIAS TEMPORALES: comparación de montos, volúmenes y patrones por período (día de semana, quincena, fin de mes). Detección de picos inusuales en períodos específicos
- S3. TRANSACCIONES FUERA DEL RANGO NORMAL: transacciones con montos estadísticamente atípicos (más de 2 desviaciones estándar de la media histórica)
- S4. TRANSACCIONES EN HORARIOS INUSUALES: para sistemas con timestamp — registros ingresados fuera del horario laboral, en días festivos o fines de semana sin autorización documentada
- S5. TRANSACCIONES SIN FLUJO DE APROBACIÓN COMPLETO: identificación de registros que saltaron pasos obligatorios del proceso (NIA 240 párr. 32: anulación de controles por la dirección)
- S6. ANÁLISIS DE USUARIOS DEL SISTEMA: transacciones registradas por usuarios con cargos inconsistentes con el tipo de operación (segregación de funciones)
- S7. PROVEEDORES Y BENEFICIARIOS DE ALTO RIESGO: montos pagados a proveedores registrados recientemente, domiciliados en paraísos fiscales, con datos incompletos o con direcciones coincidentes con empleados
- S8. RESUMEN DE EXCEPCIONES IDENTIFICADAS: tabla consolidada de excepciones por categoría, monto total, referencia a los papeles donde se analizarán

---

### SUBCARPETA B-TXN — ANÁLISIS DE TRANSACCIONES

---

| B-TXN-01 Mapeo y Rastreo de Flujos de Fondos — Seguimiento del dinero desde el origen hasta el destino final | INTELIGENTE — ACFE FEM Sección III (Asset Tracing) / Técnica "Follow the Money" |
| ----- | ----- |

**Objetivo:** Rastrear el flujo de fondos presuntamente defraudados desde su origen (activos de la entidad) hasta su destino final (beneficiario del fraude), construyendo la cadena probatoria del enriquecimiento.

**Secciones:**
- S1. DIAGRAMA DE FLUJO DE FONDOS: representación visual del flujo de dinero — origen (cuentas de la entidad) → transacciones intermedias → destino final (cuentas de beneficiarios). Herramienta: diagrama de flujo con referencias a documentos de soporte
- S2. IDENTIFICACIÓN DE CUENTAS BANCARIAS RELEVANTES: cuentas de la entidad involucradas, cuentas de terceros receptores de fondos, identificación de titulares de cuentas
- S3. ANÁLISIS DE ESTADOS DE CUENTA BANCARIOS: verificación de todos los movimientos de las cuentas identificadas en el período investigado. Cruce con registros contables para identificar movimientos no contabilizados
- S4. TRANSACCIONES IDENTIFICADAS COMO IRREGULARES: tabla con cada transacción bajo investigación — Fecha | Cuenta origen | Beneficiario | Monto | Concepto declarado | Soporte documental | Calificación (justificada / irregular / por investigar)
- S5. RASTREO DE ACTIVOS NO MONETARIOS: si el fraude involucra activos físicos (inventario, equipos, propiedades), documentación del flujo de dichos activos
- S6. IDENTIFICACIÓN DE BENEFICIARIOS FINALES: personas naturales o jurídicas que recibieron los fondos en última instancia. Cruce con registros del DGIPC, Registro de Comercio, registros de propiedad
- S7. MAPA DE ENTIDADES RELACIONADAS: diagrama de vínculos entre personas investigadas, empresas receptoras y cuentas bancarias. Visualización de la red de fraude

---

| B-TXN-02 Análisis de Partes Relacionadas y Vinculadas — Identificación de relaciones entre investigados y contrapartes que recibieron beneficios | INTELIGENTE — NIA 550 / ACFE FEM (Conflict of Interest / Corruption schemes) |
| ----- | ----- |

**Objetivo:** Identificar y analizar relaciones de vinculación entre personas investigadas y los proveedores, contratistas o beneficiarios que recibieron pagos irregulares, evidenciando el esquema de corrupción o conflicto de interés.

**Secciones:**
- S1. IDENTIFICACIÓN DE PARTES RELACIONADAS: directivos, empleados clave y sus familiares de primer y segundo grado. Empresas donde tienen participación accionaria, administración o representación legal
- S2. FUENTES DE INFORMACIÓN PARA IDENTIFICACIÓN:
  - Registro de Comercio de El Salvador (CNR): búsqueda por nombre de investigados en empresas registradas
  - DGIPC: registro de propietarios beneficiarios finales
  - Registros de IVA del MH: proveedores activos y sus datos de registro
  - Declaraciones patrimoniales (para funcionarios públicos): Corte de Cuentas / TSE
  - LinkedIn, registros públicos, fuentes abiertas (OSINT)
- S3. CRUCE DE PROVEEDORES PAGADOS VS. PARTES RELACIONADAS: tabla — Proveedor | NIT/NRC | Titular(es) | ¿Vinculado a investigados? | Monto total pagado | Período
- S4. ANÁLISIS DE CONDICIONES DE LAS TRANSACCIONES: ¿las transacciones con partes relacionadas se realizaron en condiciones de mercado (arm's length)? ¿Se obtuvieron comparativos de precios? ¿Se siguió el proceso normal de aprobación?
- S5. CONFLICTOS DE INTERÉS NO DECLARADOS: comparación entre las declaraciones de conflicto de interés firmadas por los investigados y las vinculaciones identificadas
- S6. INDICADORES DE CORRUPCIÓN: pagos a proveedores sin historial de trabajo real, concentración de contratos en un solo proveedor vinculado, incremento de precios por encima del mercado

---

| B-TXN-03 Reconstrucción Contable — Cuentas Afectadas — Reconstrucción de los asientos contables vinculados al fraude | ESTANDAR — ACFE FEM / Técnica de Análisis Net Worth / Técnica de Depósitos Bancarios |
| ----- | ----- |

**Objetivo:** Reconstruir los asientos contables vinculados a las transacciones fraudulentas para determinar su impacto en los estados financieros e identificar mecanismos de ocultamiento contable.

**Secciones:**
- S1. IDENTIFICACIÓN DE LAS CUENTAS CONTABLES AFECTADAS: por cada transacción bajo investigación, identificar las cuentas de débito y crédito utilizadas en los registros contables
- S2. ASIENTOS REGISTRADOS VS. ASIENTOS CORRECTOS: comparación entre el asiento contable efectivamente realizado y el que debería haberse realizado conforme a la norma contable. Diferencia = distorsión contable
- S3. ANÁLISIS DE ASIENTOS INUSUALES (NIA 240 párr. 32): enfoque específico en asientos de diario: ingresados por personas no autorizadas, ingresados en fechas/horas inusuales, sin referencia a transacciones de soporte, que revierten asientos anteriores sin justificación, ingresados directamente al mayor sin origen en subsistemas
- S4. CUENTAS UTILIZADAS PARA OCULTAR EL FRAUDE: identificación de cuentas que fueron utilizadas como "cuentas puente" o de tránsito para ocultar las transacciones fraudulentas (cuentas de proveedores, cuentas de gastos diferidos, cuentas de activos ficticios)
- S5. IMPACTO EN LOS ESTADOS FINANCIEROS: cuantificación del efecto del fraude en: Activos (sobre/sub-valuados), Pasivos (sobre/sub-valorados), Ingresos (inflados/desinflados), Gastos (inflados/desinflados), Patrimonio
- S6. TÉCNICA NETA PATRIMONIAL (si aplica): si se investiga enriquecimiento ilícito, cálculo del incremento patrimonial del investigado en el período comparado con sus ingresos declarados. Diferencia no justificada = posible enriquecimiento ilícito

---

| B-TXN-04 Cuantificación del Perjuicio Económico — Cálculo del monto total del daño causado | MAESTRO — ACFE FEM / Peritaje Contable (Código Procesal Penal SV) |
| ----- | ----- |

**Objetivo:** Calcular de forma documentada y defendible el monto total del perjuicio económico causado a la entidad por el fraude investigado, desglosado por período, tipo de fraude y persona responsable.

**Secciones:**
- S1. METODOLOGÍA DE CUANTIFICACIÓN: descripción del método utilizado — análisis directo de transacciones / análisis de diferencias contables / reconstrucción del flujo de caja / método neto patrimonial. Justificación de por qué este método es el más apropiado
- S2. CUANTIFICACIÓN POR COMPONENTE DEL FRAUDE: tabla — Componente/Esquema | Período | Monto Bruto | Menos: Recuperaciones o reversiones | Monto Neto | Fuente de datos | Referencia al PT
- S3. ESTIMACIONES Y SUPUESTOS: cuando el monto exacto no puede determinarse, documentación de los supuestos utilizados para la estimación y el rango de incertidumbre (monto mínimo, más probable, máximo)
- S4. PERJUICIO TOTAL CONSOLIDADO: suma de todos los componentes. Desglose por año/período para efectos de prescripción
- S5. IMPACTO EN LOS ESTADOS FINANCIEROS: efecto del perjuicio cuantificado en los EF del período investigado
- S6. COSTOS ASOCIADOS NO CUANTIFICADOS: daño reputacional, costos de investigación, pérdida de oportunidades de negocio — mencionados cualitativamente dado que no son cuantificables con precisión
- S7. LIMITACIONES DE LA CUANTIFICACIÓN: restricciones de acceso a información, períodos de prescripción que limitan el análisis, calidad de los registros contables disponibles
- S8. BASES PARA EL PERITAJE: si el informe va a ser utilizado en proceso penal, esta sección sirve de base para el dictamen pericial del perito contador

---

| CARPETA D — HALLAZGOS FORENSES |
| :---- |

---

| D-01 Cédula Maestra de Hallazgos Forenses — Consolidación de todos los hallazgos de la investigación | MAESTRO — ACFE FEM Sección III, Cap. 5 / IIA Practice Guide Cap. 6 |
| ----- | ----- |

**Objetivo:** Consolidar en un único documento todos los hallazgos de la investigación forense, clasificados por gravedad, tipo de fraude y persona responsable, como base para el Informe Forense.

**Estructura por hallazgo:**
- HF-XXX (número secuencial de hallazgo)
- Tipo de fraude (clasificación ACFE)
- Descripción del hallazgo: qué se descubrió, cómo se ejecutó el esquema, quién lo ejecutó, durante qué período
- Monto del perjuicio: referencia a B-TXN-04
- Evidencia que lo sustenta: listado de elementos de evidencia (EVD-XXX, actas de entrevista, CAATs, documentos)
- Calificación de la gravedad: Crítica / Alta / Media / Baja
- Posible tipificación penal (Código Penal SV): artículo aplicable
- Control interno que falló o fue eludido: referencia a D-02
- Recomendación de acción: acción disciplinaria / notificación a autoridades / recuperación de activos / fortalecimiento de controles

**Secciones adicionales de la cédula maestra:**
- S1. RESUMEN CUANTITATIVO: total de hallazgos por tipo, monto total del perjuicio consolidado
- S2. CRONOLOGÍA DEL FRAUDE: línea de tiempo de los hechos investigados desde el inicio del esquema hasta su descubrimiento
- S3. EVALUACIÓN DE LA SUFICIENCIA DE LA EVIDENCIA: para cada hallazgo, evaluación de si la evidencia es suficiente para soportar la conclusión (NIA 500: evidencia suficiente y apropiada)
- S4. HALLAZGOS PENDIENTES DE CONFIRMACIÓN: hallazgos con evidencia parcial que requieren investigación adicional

**Asistencia IA:** El Agente Cicero Forense genera automáticamente el borrador de cada hallazgo basándose en los resultados documentados en las subcarpetas B-EVD, B-INT, B-CAA y B-TXN, con referencias cruzadas a cada elemento de evidencia.

---

| D-02 Evaluación de Controles que Fallaron o Fueron Eludidos — Análisis de las debilidades de control interno que permitieron el fraude | INTELIGENTE — NIA 240 párr. 28–33 / IIA Practice Guide Cap. 3 / COSO Internal Control Framework |
| ----- | ----- |

**Objetivo:** Identificar y documentar los controles internos que fallaron, que estuvieron ausentes o que fueron deliberadamente eludidos, permitiendo la ocurrencia y continuación del fraude.

**Secciones:**
- S1. EVALUACIÓN POR COMPONENTE COSO:
  - Entorno de Control: ¿el "tone at the top" promovió el fraude o fue indiferente a él?
  - Evaluación de Riesgos: ¿la entidad tenía un proceso de evaluación de riesgo de fraude?
  - Actividades de Control: ¿cuáles actividades de control específicas fallaron o fueron eludidas?
  - Información y Comunicación: ¿existían mecanismos para reportar fraude (línea de denuncia)?
  - Monitoreo: ¿existía supervisión suficiente para detectar el fraude oportunamente?
- S2. CONTROLES ESPECÍFICOS QUE FALLARON: tabla — Control | Área | Por qué falló (diseño / operación / elusión deliberada) | Período de falla | Hallazgos habilitados por esta falla
- S3. CONTROLES ELUDIDOS POR LA DIRECCIÓN (NIA 240 párr. 31–33): identificación específica de casos donde la dirección anuló controles para facilitar el fraude (anulación de aprobaciones, acceso directo al sistema saltando controles de aplicación, modificación de parámetros del sistema)
- S4. RECOMENDACIONES DE MEJORA: por cada control que falló, recomendación específica de mejora. Priorización por riesgo residual
- S5. INDICADORES DE DETECCIÓN TEMPRANA: señales que habrían podido detectar el fraude antes si los controles hubieran funcionado. Base para el diseño de controles preventivos y detectivos

---

| D-03 Matriz de Responsabilidades y Perpetradores Identificados — Vinculación de personas con hallazgos específicos | MAESTRO — ACFE FEM Sección III / Principios de Responsabilidad Penal SV |
| ----- | ----- |

**Objetivo:** Documentar la vinculación entre cada hallazgo y las personas identificadas como responsables, con el nivel de evidencia disponible para cada imputación.

**Estructura:**
- Para cada persona vinculada:
  - Nombre y cargo
  - Hallazgos en los que participa (referencia a D-01)
  - Rol: perpetrador principal / cómplice / facilitador / persona que no actuó debiendo hacerlo
  - Evidencia directa que vincula a la persona con cada hallazgo
  - Nivel de certeza de la vinculación: Alto (evidencia directa múltiple) / Medio (evidencia circunstancial consistente) / Bajo (indicios a investigar)
  - Posible tipificación penal (Código Penal SV)

**Nota de cautela:** Esta matriz es un documento de trabajo de auditoría forense. Las conclusiones sobre responsabilidad penal son prerrogativa exclusiva del sistema judicial. El auditor forense determina hechos e indicios; la calificación penal corresponde al fiscal y al juez.

---

| CARPETA E — INFORME FORENSE |
| :---- |

---

| E-01 Borrador del Informe Forense — Documento integrador de todos los hallazgos de la investigación | MAESTRO — ACFE FEM Sección III, Cap. 5 / ISAE 3000 párr. 69–79 / IIA Practice Guide Cap. 6 |
| ----- | ----- |

**Objetivo:** Producir el informe forense completo que presente los hallazgos de la investigación de manera clara, objetiva, fundamentada y útil para los destinatarios, cumpliendo con los estándares profesionales aplicables.

**Estructura del Informe Forense:**

**I. ENCABEZADO Y CONFIDENCIALIDAD**
- Título: "Informe de Investigación Forense" / "Informe de Hallazgos Forenses" (según el tipo de encargo)
- Clasificación: ESTRICTAMENTE CONFIDENCIAL
- Destinatarios autorizados: listado específico. Ninguna otra persona está autorizada a recibirlo
- Número de copias emitidas, formato (impreso/digital cifrado)

**II. SÍNTESIS EJECUTIVA**
- Resumen en una página para la junta directiva o comité de auditoría: qué se investigó, qué se encontró, monto del perjuicio, acciones recomendadas urgentes

**III. ENCARGO Y ALCANCE**
- Quién encargó la investigación, cuándo, motivación del encargo
- Alcance definido: período, entidades, áreas, limitaciones de alcance encontradas durante la investigación
- Estándares aplicados: ACFE FEM, NIA 240, ISAE 3000 o ISRS 4400 según corresponda
- Composición del equipo y credenciales relevantes

**IV. METODOLOGÍA UTILIZADA**
- Descripción de los procedimientos ejecutados: recolección de evidencia, CAATs aplicados, entrevistas realizadas, análisis de transacciones. Referencias a los papeles de trabajo del expediente
- Criterios de suficiencia de evidencia aplicados

**V. HALLAZGOS**
- Un capítulo por cada hallazgo material (de D-01):
  - Descripción detallada del hallazgo
  - Evidencia que lo sustenta (sin revelar técnicas de investigación que pudieran comprometer procesos legales futuros)
  - Monto del perjuicio cuantificado
  - Personas vinculadas (con los cuidados legales apropiados)
  - Control interno que falló

**VI. CUANTIFICACIÓN TOTAL DEL PERJUICIO** (de B-TXN-04)
- Tabla consolidada por hallazgo, período y monto
- Limitaciones y supuestos de la cuantificación

**VII. CONCLUSIONES**
- Confirmación o refutación de la hipótesis inicial (A-04)
- Evaluación del sistema de control interno de la entidad
- Evaluación de la cultura organizacional y el tone at the top

**VIII. RECOMENDACIONES**
- Acciones correctivas por prioridad (inmediata / corto plazo / largo plazo):
  - Disciplinarias y legales: notificación a autoridades, proceso disciplinario
  - Recuperación de activos: demanda civil, reclamación a aseguradora
  - Mejoras de control interno: por cada control que falló (de D-02)
  - Mejoras en la cultura organizacional y el gobierno corporativo

**IX. DECLARACIONES FORMALES**
- Declaración de independencia y objetividad del equipo forense
- Declaración de que el trabajo fue realizado conforme a los estándares aplicables
- Limitaciones: el informe no constituye una opinión legal; las conclusiones sobre responsabilidad penal corresponden a las autoridades judiciales competentes

**X. FIRMAS**
- Socio responsable del encargo, número de registro CVPCPA, firma y sello
- Fecha del informe
- Lista de anexos técnicos (E-03)

**Asistencia IA:** El Agente Cicero Forense genera el borrador del informe completo basándose en la cédula maestra de hallazgos (D-01), la cuantificación del perjuicio (B-TXN-04), la evaluación de controles (D-02) y el plan de investigación (A-05). El lenguaje sigue los estándares del ACFE y las NIA adoptadas por el CVPCPA.

---

| E-02 Informe Forense Final — Versión Ejecutiva — Versión resumida del informe para destinatarios de alto nivel | MAESTRO — ACFE FEM Sección III, Cap. 5 |
| ----- | ----- |

**Objetivo:** Producir una versión ejecutiva del informe forense orientada a la junta directiva, accionistas, comité de auditoría o reguladores que requieren una síntesis ejecutiva sin los detalles técnicos completos.

**Secciones:**
- S1. SÍNTESIS DEL ENCARGO: en no más de dos párrafos, quién encargó, qué se investigó, cuándo
- S2. HALLAZGOS PRINCIPALES: listado de hallazgos con descripción en lenguaje no técnico, monto del perjuicio y nivel de certeza
- S3. MONTO TOTAL DEL PERJUICIO CONFIRMADO Y ESTIMADO
- S4. PERSONAS INVOLUCRADAS: con las cautelas legales apropiadas según el nivel de certeza de la vinculación
- S5. DEBILIDADES DE CONTROL INTERNO: principales controles que fallaron, en lenguaje ejecutivo
- S6. ACCIONES URGENTES RECOMENDADAS: lista priorizada de las 5-10 acciones más importantes que la organización debe tomar de forma inmediata
- S7. REFERENCIA AL INFORME COMPLETO Y AL EXPEDIENTE TÉCNICO

---

| E-03 Anexos Técnicos al Informe — Documentación de soporte del informe forense | ESTANDAR |
| ----- | ----- |

**Objetivo:** Compilar los anexos técnicos que soportan el informe forense, organizados de forma que sean accesibles a abogados, autoridades judiciales o peritos que necesiten verificar los hallazgos.

**Contenido de los Anexos:**
- Anexo A: Términos del encargo (copia de A-01)
- Anexo B: Lista de documentos revisados y personas entrevistadas
- Anexo C: Resultados de CAATs (tablas y gráficos seleccionados de B-CAA)
- Anexo D: Mapas de flujo de fondos (de B-TXN-01)
- Anexo E: Detalle de la cuantificación del perjuicio (de B-TXN-04)
- Anexo F: Registro de cadena de custodia (resumen de B-EVD-02)
- Anexo G: Diagrama de relaciones entre investigados (de B-TXN-02)
- Anexo H: Glosario de términos técnicos

---

## PARTE IV — CLASIFICACIÓN Y RESUMEN DE PAPELES DE TRABAJO

---

### 4.1 Catálogo Completo de Papeles con Clasificación

| Código | Nombre del Papel de Trabajo | Clasificación | Norma Principal | Fase |
| :---- | :---- | :---- | :---- | :---- |
| **A-01** | Carta de Encargo y Términos del Trabajo Forense | ESTANDAR | NIA 210 / ISRS 4400 | Planificación |
| **A-02** | Evaluación de Independencia, Ética y Conflictos de Interés | ESTANDAR | NIA 200 / CIEPC 2018 | Planificación |
| **A-03** | Notificación de Alerta / Denuncia | ESTANDAR | ACFE FEM Sección III | Planificación |
| **A-04** | Hipótesis de Fraude y Mapa de Esquemas ACFE | SMART | ACFE FEM / NIA 240 párr. A1–A6 | Planificación |
| **A-05** | Plan de Investigación Forense | MAESTRO | ACFE FEM Sección III, Cap. 2 | Planificación |
| **A-06** | Evaluación de Riesgo Forense — Triángulo del Fraude | INTELIGENTE | NIA 240 párr. 16–27 | Planificación |
| **A-07** | Memorando de Planificación Forense | MAESTRO | NIA 300 / ACFE FEM | Planificación |
| **B-EVD-01** | Registro de Incautación de Evidencia | ESTANDAR | ISO/IEC 27037 / ACFE FEM | Investigación |
| **B-EVD-02** | Formulario de Cadena de Custodia | ESTANDAR | ISO/IEC 27037 / ACFE FEM | Investigación |
| **B-EVD-03** | Protocolo de Imagen Forense Digital | ESTANDAR | ISO/IEC 27037 / NIST SP 800-86 | Investigación |
| **B-EVD-04** | Log de Integridad (Hash SHA-256) | ESTANDAR | ISO/IEC 27037 | Investigación |
| **B-INT-01** | Plan y Guía de Entrevistas | INTELIGENTE | ACFE FEM Sección III, Cap. 4 | Investigación |
| **B-INT-02** | Actas de Entrevista a Testigos | ESTANDAR | ACFE FEM Sección III, Cap. 4 | Investigación |
| **B-INT-03** | Actas de Entrevista a Sujetos de Interés | INTELIGENTE | ACFE FEM Sección III, Cap. 4 | Investigación |
| **B-INT-04** | Análisis de Declaraciones y Contradicciones | INTELIGENTE | ACFE FEM / Análisis de Veracidad | Investigación |
| **B-CAA-01** | Programa de Análisis de Datos — CAATs | INTELIGENTE | ACFE FEM / AICPA Data Analytics | Investigación |
| **B-CAA-02** | Prueba de Benford — Primer Dígito | SMART | Nigrini (1999) / ACFE FEM | Investigación |
| **B-CAA-03** | Detección de Duplicados y Pagos Múltiples | SMART | ACFE FEM / Esquemas de Facturación | Investigación |
| **B-CAA-04** | Análisis de Excepciones y Anomalías | SMART | ACFE FEM / NIA 240 párr. 32–33 | Investigación |
| **B-TXN-01** | Mapeo y Rastreo de Flujos de Fondos | INTELIGENTE | ACFE FEM (Asset Tracing) | Investigación |
| **B-TXN-02** | Análisis de Partes Relacionadas y Vinculadas | INTELIGENTE | NIA 550 / ACFE FEM | Investigación |
| **B-TXN-03** | Reconstrucción Contable — Cuentas Afectadas | ESTANDAR | ACFE FEM / NIA 240 párr. 32 | Investigación |
| **B-TXN-04** | Cuantificación del Perjuicio Económico | MAESTRO | ACFE FEM / CPP El Salvador | Investigación |
| **D-01** | Cédula Maestra de Hallazgos Forenses | MAESTRO | ACFE FEM Sección III, Cap. 5 | Hallazgos |
| **D-02** | Evaluación de Controles que Fallaron o Fueron Eludidos | INTELIGENTE | NIA 240 párr. 28–33 / COSO | Hallazgos |
| **D-03** | Matriz de Responsabilidades y Perpetradores | MAESTRO | ACFE FEM / CPP El Salvador | Hallazgos |
| **E-01** | Borrador del Informe Forense | MAESTRO | ACFE FEM / ISAE 3000 párr. 69–79 | Informe |
| **E-02** | Informe Forense Final — Versión Ejecutiva | MAESTRO | ACFE FEM Sección III, Cap. 5 | Informe |
| **E-03** | Anexos Técnicos al Informe | ESTANDAR | ACFE FEM | Informe |

**Total: 29 papeles de trabajo**

---

### 4.2 Leyenda de Clasificaciones

| Clasificación | Descripción | Características en AuditMind |
| :---- | :---- | :---- |
| **SMART** | Papel analítico con lógica automática de detección | Ejecuta análisis de datos automáticamente, produce alertas, genera hallazgos preliminares sin intervención manual |
| **MAESTRO** | Papel consolidador que agrega información de otros papeles | Se genera automáticamente consolidando datos de los papeles fuente. El agente IA redacta el borrador completo |
| **INTELIGENTE** | Papel que guía al investigador con preguntas dinámicas y referencias normativas | Adapta su contenido según las respuestas previas, activa referencias de normas relevantes, sugiere procedimientos adicionales según el contexto |
| **ESTANDAR** | Papel con estructura fija y campos obligatorios | Formulario estructurado con validaciones. El sistema verifica que todos los campos requeridos estén completos antes de cerrar el papel |

---

### 4.3 Flujo de Información entre Papeles

```
A-03 (Alerta)
    ↓
A-04 (Hipótesis) ←→ A-06 (Riesgo)
    ↓                    ↓
A-05 (Plan) ←——————————→ A-07 (Memorando) [MAESTRO: consolida A-03 a A-06]
    ↓
    ├── B-EVD-01/02/03/04 (Evidencia y Custodia)
    ├── B-INT-01/02/03/04 (Entrevistas)
    ├── B-CAA-01/02/03/04 (CAATs y Análisis)
    └── B-TXN-01/02/03/04 (Transacciones)
              ↓
    D-01 (Hallazgos) [MAESTRO: consolida toda la Carpeta B]
    ↓
    ├── D-02 (Controles Fallidos)
    └── D-03 (Responsabilidades)
              ↓
    E-01 (Informe) [MAESTRO: consolida Carpeta D]
    ↓
    ├── E-02 (Versión Ejecutiva)
    └── E-03 (Anexos Técnicos)
```

---

## PARTE V — AGENTES IA Y BASE DE CONOCIMIENTO FORENSE

---

### 5.1 RAG-13 — Base de Conocimiento Auditoría Forense

| Base de conocimiento especializada que alimenta todos los agentes del módulo forense |
| :---- |

- ACFE Fraud Examiners Manual 2022 — Sección III completa (Investigación): planificación, evidencia, entrevistas, análisis digital, rastreo de activos, informe forense
- ACFE Árbol del Fraude (Fraud Tree) — taxonomía completa de esquemas de fraude ocupacional con indicadores específicos por rama
- ACFE Report to the Nations 2024 — estadísticas globales de fraude: frecuencia, duración, detección, pérdidas por industria
- NIA 240 (ISA 240) — texto completo con todos los párrafos y apéndices. Párrafos 1–47 + Apéndice 1 (Indicadores de fraude) + Apéndice 2 (Ejemplos de manipulación)
- NIA 240 Revisada (efectiva 15/12/2026) — cambios propuestos por el IAASB (ED-240): nuevos requisitos de evaluación de riesgo, documentación expandida
- IIA Global Practice Guide: Internal Auditing and Fraud, 3.ª ed. (2024) — metodología, evaluación de riesgo, roles del auditor interno
- ISAE 3000 — marco de aseguramiento para encargos forenses con conclusión
- ISRS 4400 Revisado — procedimientos acordados para investigaciones sin conclusión
- ISO/IEC 27037:2012 — guía para identificación, recolección, adquisición y preservación de evidencia digital
- NIST SP 800-86 — integración de técnicas forenses en respuesta a incidentes
- Código Penal de El Salvador — Arts. 218–245 (delitos patrimoniales de empleados públicos y privados)
- Código Procesal Penal de El Salvador — Arts. 86–90 (derechos del imputado), Arts. 180–210 (peritaje)
- Ley de Enriquecimiento Ilícito de Funcionarios Públicos (D.L. 1039/2006)
- Ley de Lavado de Dinero y de Activos (LLDDA, D.L. 498/1998 y reformas)
- Ley de Acceso a la Información Pública (LAIP) — para investigaciones en sector público
- Benford's Law — Nigrini (1999) "Digital Analysis Using Benford's Law" — metodología estadística completa
- Lógica especializada: cuando el investigador indica el tipo de esquema ACFE, el RAG retorna los indicadores específicos del ACFE FEM + la NIA 240 Apéndice 1 correspondiente + procedimientos de investigación recomendados + señales de alerta específicas + jurisprudencia salvadoreña relevante si está disponible

---

### 5.2 El Agente Cicero Forense — El Redactor del Informe Forense

| Especialización de Cicero para auditoría forense |
| :---- |

- Genera el borrador del Memorando de Planificación (A-07) consolidando los datos de A-03 a A-06 en 45 segundos
- Redacta hallazgos individuales en el formato ACFE: Condición / Criterio / Causa / Efecto / Recomendación
- Genera la Cédula Maestra de Hallazgos (D-01) con referencias cruzadas a cada elemento de evidencia del expediente
- Produce el borrador del Informe Forense completo (E-01) siguiendo la estructura del ACFE FEM Sección III, Cap. 5
- Adapta el lenguaje del informe al destinatario: técnico-forense para fiscales/peritos, ejecutivo para la junta directiva
- Verifica que cada hallazgo del informe esté soportado por evidencia registrada en el expediente (trazabilidad completa)
- Genera la versión ejecutiva (E-02) automáticamente desde el informe completo
- Alerta cuando un hallazgo tiene umbral de posible delito penal y sugiere consultar con asesor legal

---

### 5.3 El Agente Atlas Forense — El Planificador de la Investigación

| Especialización de Atlas para planificación de investigaciones forenses |
| :---- |

- Dado el tipo de esquema ACFE seleccionado en A-04, genera automáticamente los procedimientos de investigación recomendados en A-05
- Produce el Programa de CAATs (B-CAA-01) con las pruebas analíticas más relevantes para el tipo de fraude identificado
- Genera la evaluación inicial del triángulo del fraude (A-06) con las preguntas de diagnóstico específicas
- Sugiere la secuencia óptima de entrevistas (B-INT-01) basándose en la hipótesis de investigación
- Estima el cronograma de la investigación considerando el tamaño de la entidad, complejidad del esquema y recursos disponibles

---

### 5.4 El Agente Minerva Forense — El Analista de Datos CAATs

| Especialización de Minerva para análisis de datos en investigaciones forenses |
| :---- |

- Ejecuta automáticamente la prueba de Benford (B-CAA-02) sobre los datasets cargados y genera el análisis estadístico completo con gráficos
- Realiza el análisis de duplicados (B-CAA-03) con múltiples criterios de coincidencia configurables
- Ejecuta los análisis de excepciones (B-CAA-04): estratificación, tendencias, horarios inusuales, montos atípicos
- Genera el diagrama de flujo de fondos (B-TXN-01) automáticamente desde los datos de transacciones analizadas
- Calcula el Beneish M-Score y otros modelos estadísticos de detección de fraude en estados financieros
- Produce el resumen de hallazgos de CAATs para incorporar en D-01

---

## PARTE VI — CONSIDERACIONES ESPECIALES PARA EL SALVADOR

---

### 6.1 Marco Legal de la Investigación Forense en El Salvador

| Aspecto | Marco Legal Salvadoreño | Implicación para el Auditor Forense |
| :---- | :---- | :---- |
| **Obligación de denunciar** | Art. 261 CPP: obligación de denunciar delitos de acción pública para quienes los conocen en el ejercicio de sus funciones | El auditor forense que descubra indicios de delito de acción pública (peculado, malversación, fraude) puede tener obligación legal de denunciar a la FGR. Consultar con asesor legal |
| **Reporte de operaciones sospechosas** | LLDDA Art. 9: sujetos obligados (incluyendo auditores en algunos casos) deben reportar operaciones sospechosas a la Unidad de Investigación Financiera (UIF) | Si los hallazgos forenses revelan movimientos que podrían constituir lavado de activos, evaluar obligación de reporte a la UIF del BCR |
| **Valor probatorio del dictamen pericial** | CPP Arts. 180–210: el perito contador puede presentar dictamen ante tribunales. El dictamen debe seguir requisitos formales del CPP | Si el informe forense va a ser utilizado como dictamen pericial en proceso penal, debe cumplir la forma del CPP: juramento, firma, presentación ante el juez |
| **Confidencialidad vs. denuncia** | Tensión entre el deber de confidencialidad (CIEPC 2018 Sección 140) y el deber de denunciar delitos (CPP Art. 261) | Resolver esta tensión con asesoría legal antes de presentar el informe. El CIEPC 2018 permite romper la confidencialidad cuando hay obligación legal |
| **Prescripción de delitos** | CP: los delitos de peculado prescriben en 10 años; malversación en 8 años; fraude en 5 años | El período bajo investigación debe considerar los plazos de prescripción para determinar qué hechos pueden aún ser objeto de acción penal |
| **Auditor interno en el sector público** | Ley de la Corte de Cuentas: los auditores internos gubernamentales están obligados a reportar hallazgos de fraude a la Corte de Cuentas | Para investigaciones en entidades del Estado, coordinar con la Corte de Cuentas desde el inicio |
| **Registro CVPCPA** | LREC Art. 4: los auditores que presten servicios de peritaje contable deben estar inscritos en el CVPCPA | Verificar que el socio responsable y los miembros del equipo que firmarán el informe están inscritos en el Registro de Contadores Públicos del CVPCPA |

---

### 6.2 Comunicaciones durante la Investigación Forense

| Momento | Comunicar a | Contenido | Base Normativa |
| :---- | :---- | :---- | :---- |
| Al inicio | Junta directiva / Comité de Auditoría | Inicio de la investigación, alcance, confidencialidad requerida | ACFE FEM / IIA Practice Guide |
| Si se confirman indicios de fraude material | Junta directiva (por encima del nivel del investigado) | Naturaleza de los indicios, necesidad de medidas cautelares inmediatas | NIA 240 párr. 40 |
| Si la dirección está involucrada | Junta directiva directamente | Conflicto de interés de la dirección, necesidad de consejo legal independiente | NIA 240 párr. 41 |
| Si hay indicios de delito de acción pública | Asesor legal / FGR | Consulta sobre obligación de denunciar | CPP Art. 261 / CIEPC 2018 Secc. 140 |
| Si hay indicios de lavado de activos | UIF / BCR | Reporte de operación sospechosa (si la firma es sujeto obligado bajo la LLDDA) | LLDDA Art. 9 |
| Si la entidad es regulada (banco, aseguradora) | SSF | Informar al regulador sobre la investigación en curso, según obligaciones contractuales con el regulador | RCTG-8/2008 / regulación SSF |
| Al concluir | Todos los destinatarios autorizados del A-01 | Informe forense final | ISRS 4400 / ISAE 3000 |

---

### 6.3 Diferencias entre Auditoría Financiera y Auditoría Forense

| Dimensión | Auditoría Financiera (NIA 200–720) | Auditoría Forense (ACFE / NIA 240) |
| :---- | :---- | :---- |
| **Objetivo principal** | Opinión sobre razonabilidad de los EF | Detectar, documentar y cuantificar fraude específico |
| **Alcance** | Transacciones materiales que afectan los EF | Transacciones específicas bajo sospecha, independientemente de su materialidad en EF |
| **Escepticismo** | Profesional (NIA 200) | Aumentado / Forense (ACFE): presunción de que el fraude puede existir y está oculto |
| **Evidencia** | Suficiente y apropiada para la opinión | De calidad judicial: admisible ante tribunales, con cadena de custodia |
| **Producto final** | Informe del auditor con opinión (NIA 700) | Informe de hallazgos / dictamen pericial |
| **Entrevistas** | Indagaciones a la administración (NIA 315) | Entrevistas forenses estructuradas: testigos, personas de interés, sujetos investigados |
| **Análisis de datos** | Procedimientos analíticos (NIA 520) | CAATs exhaustivos: Benford, duplicados, anomalías, rastreo de fondos |
| **Marco de referencia** | NIA 200–720, NIIF, NIIF-PYMES | ACFE FEM, NIA 240, ISAE 3000, ISRS 4400, legislación penal |
| **Comunicaciones** | Con administración y TCWG (NIA 260) | Con junta directiva, FGR, SSF, UIF según los hallazgos |
| **Confidencialidad** | Alta | Extrema: el conocimiento de la investigación puede provocar destrucción de evidencia |

---

| El módulo de Auditoría Forense más completo para El Salvador — AuditMind v9.0 implementa la metodología ACFE completa integrada con la NIA 240 revisada y el IIA Global Practice Guide on Fraud. Los 29 papeles de trabajo abarcan todo el ciclo forense: desde la formalización del encargo y la formulación de la hipótesis de fraude hasta la cadena de custodia digital, los CAATs con Ley de Benford, el rastreo de flujos de fondos, las entrevistas forenses estructuradas y el informe forense final. El Agente Cicero Forense genera el informe completo con hallazgos en formato ACFE (Condición / Criterio / Causa / Efecto / Recomendación); el Agente Minerva Forense ejecuta automáticamente la prueba de Benford, el análisis de duplicados y el análisis de excepciones; el Agente Atlas Forense genera el plan de investigación adaptado a cada tipo de esquema del Árbol del Fraude ACFE. Integración completa con el marco legal salvadoreño: Código Penal, Código Procesal Penal, LLDDA, Ley de Enriquecimiento Ilícito, y regulaciones de la SSF y la Corte de Cuentas. La combinación elimina el 65% del tiempo de documentación mientras garantiza que cada hallazgo sea trazable a su evidencia de soporte y defendible ante cualquier foro legal, disciplinario o regulatorio. |
| ----- |
