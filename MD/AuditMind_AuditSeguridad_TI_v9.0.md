# METODOLOGÍA DE AUDITORÍA DE SEGURIDAD DE TECNOLOGÍAS DE LA INFORMACIÓN
## AuditMind Intelligence Platform — Módulo de Seguridad TI
### Versión 9.0 | Base Normativa: ISO 27001:2022 · COBIT 2019 · NIST CSF 2.0 · NRP-23 BCR · NRP-32 SSF · Ley de Ciberseguridad D.L. 143/2024

---

> **Clasificación:** Documento Metodológico Interno — AuditMind  
> **Idioma:** Español profesional  
> **Aplicabilidad:** Entidades del sistema financiero, sector público y privado en El Salvador  
> **Última actualización:** Mayo 2026  
> **Elaborado por:** Equipo de Metodología — AuditMind Intelligence Platform

---

## TABLA DE CONTENIDO

- [Sección 1 — Objetivos y Alcance de la Auditoría de Seguridad TI](#sección-1)
- [Sección 2 — Marco Normativo Aplicable](#sección-2)
- [Sección 3 — Estructura Completa del Índice de Trabajo](#sección-3)
  - [Carpeta A — Planificación del SGSI](#carpeta-a)
  - [Carpeta B — Evaluación de Controles Técnicos](#carpeta-b)
  - [Carpeta C — Cumplimiento Normativo](#carpeta-c)
  - [Carpeta D — Hallazgos e Informe de Seguridad](#carpeta-d)
- [Sección 4 — Descripción Detallada de Papeles de Trabajo](#sección-4)
- [Sección 5 — Clasificación de Papeles: SMART / MASTER / STANDARD](#sección-5)
- [Sección 6 — Matriz de Cruce Normativo](#sección-6)
- [Sección 7 — Glosario Técnico](#sección-7)

---

## SECCIÓN 1 — OBJETIVOS Y ALCANCE DE LA AUDITORÍA DE SEGURIDAD TI {#sección-1}

### 1.1 Propósito de la Auditoría

La auditoría de seguridad de Tecnologías de la Información (TI) tiene como propósito evaluar de manera sistemática, independiente y documentada el grado de madurez, efectividad y cumplimiento del Sistema de Gestión de Seguridad de la Información (SGSI) de la organización auditada, verificando que los controles implementados sean adecuados para proteger la confidencialidad, integridad y disponibilidad (CIA) de los activos de información críticos.

En el contexto de AuditMind, este módulo permite a los equipos de auditoría interna, auditoría externa y organismos supervisores ejecutar una revisión estructurada con trazabilidad normativa completa hacia los estándares internacionales y la regulación salvadoreña vigente.

### 1.2 Objetivos Específicos

| N° | Objetivo | Estándar de Referencia |
|----|----------|----------------------|
| OBJ-01 | Verificar la existencia, aprobación formal y difusión del marco de políticas de seguridad de la información | ISO 27001:2022 Cláusula 5.2; A.5.1; NRP-23 Art. 4-6 |
| OBJ-02 | Evaluar el proceso de gestión de riesgos de seguridad de la información | ISO 27001:2022 Cláusula 6.1; COBIT APO12; NIST CSF GV.RM |
| OBJ-03 | Comprobar la efectividad de los controles de identidad y gestión de accesos | ISO A.8.2–A.8.5; NRP-32 Art. 7-10; NIST CSF PR.AA |
| OBJ-04 | Revisar el programa de gestión de vulnerabilidades y parches | ISO A.8.8; NRP-32 Art. 14; COBIT DSS05 |
| OBJ-05 | Evaluar los controles criptográficos y de PKI implementados | ISO A.8.24; NIST CSF PR.DS; NRP-23 Art. 20 |
| OBJ-06 | Verificar la capacidad de detección y respuesta ante incidentes de seguridad | ISO A.5.24–A.5.27; A.8.16; NIST CSF DE/RS; D.L. 143 Art. 28 |
| OBJ-07 | Evaluar la integridad del programa de pruebas de penetración | ISO A.8.29; NRP-32 Art. 14; NIST CSF ID.RA |
| OBJ-08 | Comprobar el estado de los planes de continuidad del negocio y recuperación ante desastres | ISO A.5.29–A.5.30; COBIT DSS04; NRP-23 Art. 35-38 |
| OBJ-09 | Verificar el cumplimiento con la normativa NRP-23 BCR y NRP-32 SSF | NRP-23 completa; NRP-32 completa |
| OBJ-10 | Evaluar el cumplimiento con la Ley de Ciberseguridad D.L. 143/2024 | D.L. 143 Art. 1-55 |
| OBJ-11 | Revisar la alineación del gobierno de TI con COBIT 2019 y NIST CSF 2.0 | COBIT EDM01–MEA03; NIST CSF GV; ISO 27001 Cláusula 9 |

### 1.3 Alcance de la Auditoría

El alcance de la auditoría de seguridad TI comprende los siguientes dominios:

**Organizacional:**
- Estructura de gobierno de seguridad de la información (CISO, Comité de Seguridad, Directorio)
- Marco normativo interno: políticas, procedimientos, estándares y guías de seguridad
- Programa de concientización y capacitación en seguridad
- Gestión de proveedores y terceros con acceso a activos críticos

**Tecnológico:**
- Infraestructura de red: firewalls, IDS/IPS, segmentación, DMZ
- Servidores, sistemas operativos y middleware en el alcance definido
- Aplicaciones críticas del negocio (core bancario, sistemas ERP, portales de clientes)
- Plataformas en la nube (IaaS/PaaS/SaaS) utilizadas por la entidad
- Canales digitales: banca en línea, banca móvil, APIs
- Centros de datos propios y coubicados

**Procesos:**
- Gestión de identidades y control de accesos (IAM/PAM)
- Gestión de vulnerabilidades, parches y configuración segura
- Gestión de incidentes de seguridad
- Respaldo y recuperación de información
- Desarrollo seguro de software (SDLC)
- Continuidad del negocio y DRP

### 1.4 Criterios de Auditoría

Los criterios utilizados para evaluar la evidencia recopilada incluyen:

1. **ISO/IEC 27001:2022** — Sistema de Gestión de Seguridad de la Información: cláusulas 4–10 y Anexo A (93 controles)
2. **ISO/IEC 27002:2022** — Guía de implementación de controles de seguridad
3. **COBIT 2019** — Marco de Gobierno y Gestión de TI (ISACA): 40 objetivos en 5 dominios
4. **NIST CSF 2.0** (febrero 2024) — 6 funciones, 22 categorías, 106 subcategorías
5. **NRP-23 BCR El Salvador** — Normas Técnicas para la Gestión de la Seguridad de la Información (vigente desde 01/07/2020)
6. **NRP-32 SSF El Salvador** — Normas Técnicas sobre Medidas de Ciberseguridad en Canales Digitales (vigente desde 08/03/2022)
7. **Ley de Ciberseguridad y Seguridad de la Información D.L. 143/2024** — Vigente desde 23/11/2024
8. **Políticas internas** de seguridad de la información de la organización auditada

### 1.5 Metodología General de Trabajo

La auditoría se desarrolla mediante las siguientes fases:

```
FASE 1: Planificación (Semanas 1-2)
  ├─ Reunión de apertura
  ├─ Análisis de contexto organizacional
  ├─ Evaluación de riesgo de auditoría
  └─ Plan de auditoría detallado

FASE 2: Ejecución (Semanas 3-8)
  ├─ Recopilación de evidencia (entrevistas, inspección, pruebas)
  ├─ Aplicación de papeles de trabajo (Carpetas A, B, C)
  ├─ Análisis de brechas (gap analysis)
  └─ Pruebas sustantivas y de cumplimiento

FASE 3: Comunicación (Semanas 9-10)
  ├─ Borrador de hallazgos
  ├─ Reunión de cierre con la gerencia
  └─ Informe final de auditoría (Carpeta D)

FASE 4: Seguimiento
  └─ Monitoreo de planes de acción correctiva
```

---

## SECCIÓN 2 — MARCO NORMATIVO APLICABLE {#sección-2}

### 2.1 ISO/IEC 27001:2022 — Sistema de Gestión de Seguridad de la Información

**Organismo emisor:** ISO/IEC (International Organization for Standardization / International Electrotechnical Commission)  
**Edición vigente:** ISO/IEC 27001:2022 (publicada octubre 2022, reemplaza la versión 2013)

#### Estructura Principal

La norma consta de **10 cláusulas** de requisitos más un **Anexo A** con 93 controles organizados en 4 temas:

| Cláusula | Título | Naturaleza |
|----------|--------|------------|
| 4 | Contexto de la organización | Requisito |
| 5 | Liderazgo | Requisito |
| 6 | Planificación | Requisito |
| 7 | Soporte | Requisito |
| 8 | Operación | Requisito |
| 9 | Evaluación del desempeño | Requisito |
| 10 | Mejora | Requisito |

#### Anexo A — 93 Controles en 4 Temas

**Tema A.5 — Controles Organizacionales (37 controles):**

| Control | Nombre |
|---------|--------|
| A.5.1 | Políticas para la seguridad de la información |
| A.5.2 | Roles y responsabilidades de seguridad de la información |
| A.5.3 | Segregación de funciones |
| A.5.4 | Responsabilidades de la dirección |
| A.5.5 | Contacto con autoridades |
| A.5.6 | Contacto con grupos de interés especiales |
| A.5.7 | Inteligencia de amenazas (NUEVO 2022) |
| A.5.8 | Seguridad de la información en la gestión de proyectos |
| A.5.9 | Inventario de activos de información |
| A.5.10 | Uso aceptable de activos |
| A.5.11 | Devolución de activos |
| A.5.12 | Clasificación de la información |
| A.5.13 | Etiquetado de la información |
| A.5.14 | Transferencia de información |
| A.5.15 | Control de acceso |
| A.5.16 | Gestión de identidades |
| A.5.17 | Información de autenticación |
| A.5.18 | Derechos de acceso |
| A.5.19 | Seguridad de la información en relaciones con proveedores |
| A.5.20 | Seguridad de la información en acuerdos con proveedores |
| A.5.21 | Gestión de la cadena de suministro TIC |
| A.5.22 | Monitoreo, revisión y gestión de cambios de servicios de proveedores |
| A.5.23 | Seguridad de la información para uso de servicios en la nube (NUEVO 2022) |
| A.5.24 | Planificación y preparación para gestión de incidentes |
| A.5.25 | Evaluación y decisión sobre eventos de seguridad |
| A.5.26 | Respuesta a incidentes de seguridad |
| A.5.27 | Aprendizaje de incidentes de seguridad |
| A.5.28 | Recolección de evidencia |
| A.5.29 | Seguridad de la información durante la interrupción |
| A.5.30 | Preparación de las TIC para la continuidad del negocio (NUEVO 2022) |
| A.5.31 | Requisitos legales, estatutarios, regulatorios y contractuales |
| A.5.32 | Derechos de propiedad intelectual |
| A.5.33 | Protección de registros |
| A.5.34 | Privacidad y protección de PII |
| A.5.35 | Revisión independiente de la seguridad de la información |
| A.5.36 | Cumplimiento de políticas y estándares de seguridad |
| A.5.37 | Procedimientos operativos documentados |

**Tema A.6 — Controles para Personas (8 controles):**

| Control | Nombre |
|---------|--------|
| A.6.1 | Selección de personal (screening) |
| A.6.2 | Términos y condiciones de empleo |
| A.6.3 | Concientización, educación y capacitación en seguridad |
| A.6.4 | Proceso disciplinario |
| A.6.5 | Responsabilidades tras la terminación o cambio de empleo |
| A.6.6 | Acuerdos de confidencialidad y no divulgación |
| A.6.7 | Trabajo remoto |
| A.6.8 | Reporte de eventos de seguridad de la información |

**Tema A.7 — Controles Físicos (14 controles):**

| Control | Nombre |
|---------|--------|
| A.7.1 | Perímetro de seguridad física |
| A.7.2 | Controles de entrada física |
| A.7.3 | Seguridad de oficinas, salas e instalaciones |
| A.7.4 | Monitoreo de seguridad física (NUEVO 2022) |
| A.7.5 | Protección contra amenazas físicas y ambientales |
| A.7.6 | Trabajo en áreas seguras |
| A.7.7 | Escritorio y pantalla limpios |
| A.7.8 | Ubicación y protección del equipo |
| A.7.9 | Seguridad de activos fuera de las instalaciones |
| A.7.10 | Medios de almacenamiento |
| A.7.11 | Servicios de suministro de apoyo |
| A.7.12 | Seguridad del cableado |
| A.7.13 | Mantenimiento de equipos |
| A.7.14 | Disposición o reutilización segura de equipos |

**Tema A.8 — Controles Tecnológicos (34 controles):**

| Control | Nombre | Relevancia para Auditoría |
|---------|--------|--------------------------|
| A.8.1 | Dispositivos endpoint de usuario | Alta |
| A.8.2 | Derechos de acceso privilegiado | Crítica |
| A.8.3 | Restricción de acceso a la información | Alta |
| A.8.4 | Acceso al código fuente | Media |
| A.8.5 | Autenticación segura | Crítica |
| A.8.6 | Gestión de capacidad | Media |
| A.8.7 | Protección contra malware | Crítica |
| A.8.8 | Gestión de vulnerabilidades técnicas | Crítica |
| A.8.9 | Gestión de configuración | Alta |
| A.8.10 | Eliminación de información | Alta |
| A.8.11 | Enmascaramiento de datos | Alta |
| A.8.12 | Prevención de fuga de datos (DLP) | Alta |
| A.8.13 | Respaldo de información | Crítica |
| A.8.14 | Redundancia de instalaciones de procesamiento | Alta |
| A.8.15 | Registro (logging) | Crítica |
| A.8.16 | Actividades de monitoreo | Crítica |
| A.8.17 | Sincronización de relojes | Media |
| A.8.18 | Uso de programas de utilidad privilegiados | Alta |
| A.8.19 | Instalación de software en sistemas operacionales | Alta |
| A.8.20 | Seguridad de redes | Crítica |
| A.8.21 | Seguridad de servicios de red | Alta |
| A.8.22 | Segregación de redes | Alta |
| A.8.23 | Filtrado web | Media |
| A.8.24 | Uso de criptografía | Crítica |
| A.8.25 | Ciclo de vida de desarrollo seguro (SSDLC) | Alta |
| A.8.26 | Requisitos de seguridad de aplicaciones | Alta |
| A.8.27 | Arquitectura y principios de ingeniería de sistemas seguros | Alta |
| A.8.28 | Codificación segura | Alta |
| A.8.29 | Pruebas de seguridad en desarrollo y aceptación | Alta |
| A.8.30 | Desarrollo externalizado | Media |
| A.8.31 | Separación de entornos de desarrollo, prueba y producción | Alta |
| A.8.32 | Gestión del cambio | Alta |
| A.8.33 | Información de prueba | Media |
| A.8.34 | Protección de sistemas de información durante pruebas de auditoría | Alta |

---

### 2.2 COBIT 2019 — Marco de Gobierno y Gestión de TI

**Organismo emisor:** ISACA  
**Versión:** COBIT 2019

COBIT 2019 define **40 objetivos de gobierno y gestión** agrupados en **5 dominios**:

#### Dominio EDM — Evaluar, Dirigir y Monitorear (5 objetivos de Gobierno)

| Código | Objetivo | Enfoque de Seguridad |
|--------|----------|---------------------|
| EDM01 | Establecimiento y mantenimiento del marco de gobierno | Gobierno de seguridad de la información |
| EDM02 | Asegurar la entrega de beneficios | Valor de las inversiones en seguridad |
| EDM03 | Asegurar la optimización del riesgo | Apetito de riesgo de ciberseguridad |
| EDM04 | Asegurar la optimización de recursos | Recursos humanos y tecnológicos de seguridad |
| EDM05 | Asegurar la participación de las partes interesadas | Comunicación de riesgos de seguridad |

#### Dominio APO — Alinear, Planificar y Organizar (14 objetivos)

| Código | Objetivo | Relevancia Seguridad TI |
|--------|----------|------------------------|
| APO01 | Gestionar el marco de gestión de TI | Alta |
| APO02 | Gestionar la estrategia | Media |
| APO03 | Gestionar la arquitectura empresarial | Alta |
| APO04 | Gestionar la innovación | Media |
| APO05 | Gestionar el portafolio | Media |
| APO06 | Gestionar el presupuesto y costos | Media |
| APO07 | Gestionar los recursos humanos | Alta |
| APO08 | Gestionar las relaciones | Media |
| APO09 | Gestionar los acuerdos de servicio | Alta |
| APO10 | Gestionar los proveedores | Alta |
| APO11 | Gestionar la calidad | Media |
| APO12 | Gestionar el riesgo | **Crítica** |
| APO13 | Gestionar la seguridad | **Crítica** |
| APO14 | Gestionar los datos | **Crítica** |

#### Dominio BAI — Construir, Adquirir e Implementar (10 objetivos)

| Código | Objetivo | Relevancia Seguridad TI |
|--------|----------|------------------------|
| BAI01 | Gestionar programas y proyectos | Media |
| BAI02 | Gestionar la definición de requisitos | Alta |
| BAI03 | Gestionar la identificación y construcción de soluciones | Alta |
| BAI04 | Gestionar la disponibilidad y capacidad | Alta |
| BAI05 | Gestionar la habilitación del cambio organizacional | Media |
| BAI06 | Gestionar los cambios | **Crítica** |
| BAI07 | Gestionar la aceptación y transición del cambio | Alta |
| BAI08 | Gestionar el conocimiento | Media |
| BAI09 | Gestionar los activos | Alta |
| BAI10 | Gestionar la configuración | **Crítica** |

#### Dominio DSS — Entregar, Dar Servicio y Soporte (6 objetivos)

| Código | Objetivo | Relevancia Seguridad TI |
|--------|----------|------------------------|
| DSS01 | Gestionar las operaciones | Alta |
| DSS02 | Gestionar las solicitudes e incidentes de servicio | Alta |
| DSS03 | Gestionar los problemas | Alta |
| DSS04 | Gestionar la continuidad | **Crítica** |
| DSS05 | Gestionar los servicios de seguridad | **Crítica** |
| DSS06 | Gestionar los controles de los procesos de negocio | Alta |

#### Dominio MEA — Monitorear, Evaluar y Valorar (3 objetivos)

| Código | Objetivo | Relevancia Seguridad TI |
|--------|----------|------------------------|
| MEA01 | Gestionar el desempeño y la conformidad | Alta |
| MEA02 | Gestionar el sistema de control interno | **Crítica** |
| MEA03 | Gestionar el cumplimiento con los requisitos externos | **Crítica** |

---

### 2.3 NIST CSF 2.0 — Marco de Ciberseguridad

**Organismo emisor:** NIST (National Institute of Standards and Technology)  
**Versión:** CSF 2.0 (publicado febrero 26, 2024)

El CSF 2.0 introduce **6 funciones** con **22 categorías** y **106 subcategorías**:

#### GV — GOBERNAR (Nuevo en CSF 2.0)

| Categoría | Código | Descripción |
|-----------|--------|-------------|
| Contexto Organizacional | GV.OC | Entender misión, partes interesadas, dependencias |
| Estrategia de Gestión del Riesgo | GV.RM | Prioridades, restricciones y tolerancia al riesgo |
| Roles y Responsabilidades | GV.RR | Gobierno, roles y accountability en ciberseguridad |
| Política | GV.PO | Políticas de ciberseguridad establecidas y comunicadas |
| Supervisión | GV.OV | Resultados de ciberseguridad supervisados por la gerencia |
| Cadena de Suministro | GV.SC | Riesgos de seguridad de la cadena de suministro |

#### ID — IDENTIFICAR

| Categoría | Código | Descripción |
|-----------|--------|-------------|
| Gestión de Activos | ID.AM | Activos físicos, de software y datos inventariados |
| Evaluación de Riesgos | ID.RA | Riesgos de ciberseguridad identificados y priorizados |
| Mejora | ID.IM | Mejoras en la postura de ciberseguridad identificadas |

#### PR — PROTEGER

| Categoría | Código | Descripción |
|-----------|--------|-------------|
| Gestión de Identidad, Autenticación y Control de Acceso | PR.AA | Identidades y credenciales gestionadas |
| Concientización y Capacitación | PR.AT | Personal con conocimientos y habilidades de ciberseguridad |
| Seguridad de Datos | PR.DS | Datos gestionados consistentemente con la estrategia de riesgos |
| Seguridad de la Plataforma | PR.PS | Hardware y software protegidos |
| Resiliencia de Infraestructura | PR.IR | Arquitecturas de seguridad gestionadas |

#### DE — DETECTAR

| Categoría | Código | Descripción |
|-----------|--------|-------------|
| Monitoreo Continuo | DE.CM | Activos monitoreados para encontrar anomalías |
| Análisis de Eventos Adversos | DE.AE | Eventos analizados para determinar si son adversos |

#### RS — RESPONDER

| Categoría | Código | Descripción |
|-----------|--------|-------------|
| Gestión de Incidentes | RS.MA | Respuestas a incidentes detectados gestionadas |
| Análisis de Incidentes | RS.AN | Investigación para asegurar respuesta efectiva |
| Reporte y Comunicación | RS.CO | Actividades de respuesta coordinadas con partes internas/externas |
| Mitigación de Incidentes | RS.MI | Actividades para prevenir la expansión y erradicar incidentes |

#### RC — RECUPERAR

| Categoría | Código | Descripción |
|-----------|--------|-------------|
| Ejecución del Plan de Recuperación | RC.RP | Planes ejecutados durante o después de un incidente |
| Comunicaciones de Recuperación | RC.CO | Actividades de restauración comunicadas |

---

### 2.4 NRP-23 BCR El Salvador — Normas Técnicas para la Gestión de la Seguridad de la Información

**Organismo emisor:** Banco Central de Reserva (BCR) de El Salvador  
**Vigencia:** 01 de julio de 2020 (aprobadas el 14 de abril de 2020)  
**Entidades obligadas:** Bancos, sociedades de ahorro y crédito, bancos cooperativos, federaciones y entidades supervisadas por la SSF

#### Áreas de Cobertura NRP-23

| Área | Requisitos Clave |
|------|-----------------|
| **SGSI — Sistema de Gestión** | Establecer, mantener y documentar un SGSI consistente con el sistema de gestión de continuidad del negocio y la gestión de riesgo operacional |
| **Gobierno de Seguridad** | Comité de Riesgos responsable de proponer al Directorio la estructura del SGSI; unidad especializada de seguridad de la información |
| **Política de Seguridad** | Adopción de políticas, procedimientos, mecanismos y herramientas para la protección de la información |
| **Evaluación de Riesgos** | Identificar, analizar, evaluar y mitigar riesgos asociados a activos, procesos, personas, proyectos y servicios tecnológicos; metodología aprobada por Directorio |
| **Control de Accesos** | Controles de acceso lógico, físico y procedimental; gestión de identidades; inventario de cuentas y perfiles de usuario |
| **Respaldo de Información** | Procedimientos periódicos de respaldo validados; medidas de recuperación oportuna ante fallas o desastres; notificación a la Superintendencia de ubicación de almacenamiento |
| **Auditoría e Inspección** | Evaluaciones de riesgo periódicas; auditorías de seguridad de la información; cumplimiento de políticas internas |
| **Gestión de Incidentes** | Proceso documentado de gestión de incidentes de seguridad; etapa de prevención con controles apropiados; etapa de respuesta y recuperación |
| **Continuidad** | Proceso continuo documentado de gestión de riesgos de ciberseguridad revisado periódicamente |
| **Terceros y Proveedores** | Controles de seguridad aplicables a terceros con acceso a activos críticos |

---

### 2.5 NRP-32 SSF El Salvador — Normas Técnicas sobre Medidas de Ciberseguridad en Canales Digitales

**Organismo emisor:** Superintendencia del Sistema Financiero (SSF) de El Salvador  
**Vigencia:** 08 de marzo de 2022; modificaciones el 30 de diciembre de 2022 (artículos 3, 21 y 22)  
**Entidades obligadas:** Bancos, sucursales de bancos extranjeros, sociedades de ahorro y crédito, bancos cooperativos y federaciones en El Salvador

#### Estructura y Requisitos Clave NRP-32

| Área | Requisitos Específicos |
|------|----------------------|
| **Infraestructura Tecnológica** | Infraestructura con protocolos de autenticación de usuarios, autorización y uso de recursos/servicios, y registro de actividad para monitoreo |
| **Gestión de Activos Críticos** | Inventario actualizado de activos críticos de información; identificación de datos y tecnología asociada para priorizar acciones |
| **Autenticación Multifactor** | Tres factores de autenticación por categorías: Categoría 1 (información de contrato/producto), Categoría 2 (contraseñas), Categoría 3 (claves dinámicas de un solo uso); banca telefónica mínimo Cat. 2; canales digitales Cat. 2 o 3 |
| **Gestión de Contraseñas** | Requisitos de complejidad de contraseñas; vigencia máxima de 180 días |
| **Canales Digitales — Transacciones** | Confirmación inmediata al cliente vía mensaje de texto u otro medio electrónico; tratamiento bajo la Ley de Protección al Consumidor |
| **Monitoreo y Detección de Fraude** | Sistemas de monitoreo para detectar operaciones posiblemente fraudulentas o irregulares; registro, liquidación, verificación y seguimiento de transacciones |
| **Gestión de Vulnerabilidades** | Procesos de identificación, evaluación, tratamiento y comunicación de medidas de seguridad; pruebas de penetración e intrusión; escaneos periódicos |
| **Controles Preventivos** | Monitoreo de redes e infraestructura; gestión de parches; autenticación multifactor; herramientas anti-suplantación de identidad; antimalware; gestión de dispositivos móviles; DLP; cifrado |
| **Campañas de Educación Financiera** | Campañas de educación a clientes sobre ciberseguridad |
| **Planes de Contingencia** | Planes de emergencia y respuesta ante fallas probados periódicamente para verificar capacidad de respuesta y asegurar ausencia de brechas en procesos |
| **Sanciones** | Incumplimiento sujeto a sanciones bajo la Ley de Supervisión y Regulación del Sistema Financiero |

---

### 2.6 Ley de Ciberseguridad y Seguridad de la Información — D.L. 143/2024

**Fuente formal:** Decreto Legislativo N° 143, Asamblea Legislativa de El Salvador  
**Publicación:** Diario Oficial, 15 de noviembre de 2024  
**Vigencia:** 23 de noviembre de 2024  
**Nota:** El Salvador fue el primer país de Centroamérica en promulgar una ley integral de ciberseguridad

#### Objeto y Ámbito de Aplicación

La Ley establece los **principios, marco normativo, institucionalidad, lineamientos y políticas de protección** para estructurar, regular, vigilar y fiscalizar las medidas de ciberseguridad y la seguridad de la información.

**Sujetos obligados:** Organismos del Estado y sus dependencias, instituciones oficiales autónomas, municipalidades, y toda entidad a través de la cual se administren recursos públicos, se gestionen activos estatales, se ejecuten actos de administración pública, o que afecten infraestructuras críticas nacionales.

#### Institucionalidad

| Entidad | Rol |
|---------|-----|
| **ACE — Agencia de Ciberseguridad del Estado** | Ente autónomo rector; desarrolla la Política Nacional de Ciberseguridad; crea el registro nacional de amenazas e incidentes; emite lineamientos y supervisión |
| **CSIRT Nacional** | Equipo de Respuesta a Incidentes de Seguridad Informática; coordinación de respuesta a incidentes a nivel nacional |
| **Entes Supervisores Sectoriales** | Coordinación con ACE para supervisión en sectores específicos (financiero: BCR/SSF) |

#### Obligaciones Principales para las Instituciones

| Obligación | Descripción |
|------------|-------------|
| **Sistema de Gestión de Ciberseguridad** | Implementar un sistema para identificar y mitigar riesgos de ciberseguridad |
| **Seguridad por Diseño** | Aplicar enfoque de seguridad por diseño en el desarrollo, adquisición, implementación y gestión de sistemas de información y equipos tecnológicos |
| **Estrategia de Seguridad** | Elaborar estrategia de seguridad informática alineada a estándares o marcos de referencia nacionales e internacionales (ISO 27001, NIST) |
| **Notificación de Incidentes** | Reportar incidentes de ciberseguridad a las autoridades competentes dentro de plazos determinados |
| **Capacitación del Personal** | Programas continuos y obligatorios de educación y concientización en ciberseguridad |
| **Gestión de Riesgos** | Identificación, evaluación y mitigación de riesgos de seguridad de la información usando estándares internacionales |
| **Protección de Infraestructura Crítica** | Medidas especiales para proteger infraestructuras críticas nacionales |

#### Régimen Sancionador

| Tipo de Infracción | Consecuencias |
|-------------------|---------------|
| Incumplimiento de obligaciones | Destituciones/despidos y multas |
| Magnitud de sanciones | Proporcional a la gravedad de la infracción |
| Autoridad sancionadora | ACE y/o entes supervisores sectoriales |

---

## SECCIÓN 3 — ESTRUCTURA COMPLETA DEL ÍNDICE DE TRABAJO {#sección-3}

### CARPETA A — PLANIFICACIÓN DEL SGSI {#carpeta-a}

```
A — PLANIFICACIÓN DEL SISTEMA DE GESTIÓN DE SEGURIDAD DE LA INFORMACIÓN
│
├── A-01  Memorándum de Planificación de la Auditoría de Seguridad TI
├── A-02  Evaluación del Contexto Organizacional y Partes Interesadas
├── A-03  Análisis de Riesgo de Auditoría — Seguridad TI
├── A-04  Revisión del Marco Normativo Interno del SGSI
├── A-05  Evaluación del Gobierno de Seguridad de la Información
└── A-06  Plan de Muestreo y Procedimientos de Auditoría
```

---

### CARPETA B — EVALUACIÓN DE CONTROLES TÉCNICOS {#carpeta-b}

```
B — EVALUACIÓN DE CONTROLES TÉCNICOS DE SEGURIDAD
│
├── B-IAM — Gestión de Identidad y Control de Accesos
│   ├── B-IAM-01  Evaluación del Marco de Control de Accesos
│   ├── B-IAM-02  Revisión de Cuentas Privilegiadas y PAM
│   ├── B-IAM-03  Pruebas de Autenticación Multifactor (MFA/3FA)
│   └── B-IAM-04  Revisión del Ciclo de Vida de Cuentas (Onboarding/Offboarding)
│
├── B-VULN — Gestión de Vulnerabilidades y Parches
│   ├── B-VULN-01  Evaluación del Programa de Gestión de Vulnerabilidades
│   └── B-VULN-02  Pruebas de Gestión de Parches y Configuración Segura
│
├── B-CRYPT — Controles Criptográficos y PKI
│   └── B-CRYPT-01  Revisión de Controles Criptográficos y Gestión de Certificados
│
├── B-INC — Gestión de Incidentes de Seguridad
│   ├── B-INC-01  Evaluación del Proceso de Gestión de Incidentes
│   └── B-INC-02  Pruebas de Capacidad de Detección y Respuesta (SOC/SIEM)
│
├── B-PENTEST — Pruebas de Penetración
│   └── B-PENTEST-01  Revisión del Programa de Pruebas de Penetración
│
└── B-BCP — Continuidad del Negocio y DRP
    ├── B-BCP-01  Evaluación del Plan de Continuidad del Negocio (BCP/PCN)
    └── B-BCP-02  Prueba del Plan de Recuperación ante Desastres (DRP/PRD)
```

---

### CARPETA C — CUMPLIMIENTO NORMATIVO {#carpeta-c}

```
C — CUMPLIMIENTO NORMATIVO
│
├── C-NRP — Cumplimiento NRP-23 BCR / NRP-32 SSF El Salvador
│   ├── C-NRP-01  Cuestionario de Cumplimiento NRP-23 BCR
│   └── C-NRP-02  Cuestionario de Cumplimiento NRP-32 SSF
│
├── C-CIBER — Ley de Ciberseguridad D.L. 143/2024
│   └── C-CIBER-01  Evaluación de Cumplimiento Ley de Ciberseguridad D.L. 143/2024
│
└── C-COBIT — Dominios COBIT 2019
    └── C-COBIT-01  Evaluación de Madurez COBIT 2019 — Seguridad TI
```

---

### CARPETA D — HALLAZGOS E INFORME DE SEGURIDAD {#carpeta-d}

```
D — HALLAZGOS E INFORME DE SEGURIDAD DE LA INFORMACIÓN
│
├── D-01  Cédula Consolidada de Hallazgos de Seguridad TI
├── D-02  Matriz de Riesgo Residual — Seguridad TI
├── D-03  Informe de Auditoría de Seguridad TI
└── D-04  Plan de Acción Correctiva y Seguimiento
```

---

## SECCIÓN 4 — DESCRIPCIÓN DETALLADA DE PAPELES DE TRABAJO {#sección-4}

---

### A-01 — MEMORÁNDUM DE PLANIFICACIÓN DE LA AUDITORÍA DE SEGURIDAD TI

**Carpeta:** A — Planificación del SGSI  
**Clasificación:** MASTER  
**Referencias normativas:** ISO 27001:2022 Cláusula 9.2; IIA IPPF 2200; NRP-23 Art. 40

**Objetivo:** Documentar formalmente el alcance, objetivos, equipo, cronograma, enfoque y presupuesto de la auditoría de seguridad TI, constituyendo la autorización formal para iniciar el trabajo de campo.

**Contenido mínimo:**

| Elemento | Descripción |
|----------|-------------|
| Antecedentes de la entidad auditada | Descripción, tamaño, clasificación regulatoria, historial de auditorías previas |
| Objetivos de la auditoría | Vinculados a OBJ-01 a OBJ-11 de esta metodología |
| Alcance definido | Sistemas, procesos, entidades organizacionales y período auditado |
| Marco normativo aplicable | ISO 27001:2022, COBIT 2019, NIST CSF 2.0, NRP-23, NRP-32, D.L. 143/2024 |
| Equipo auditor | Roles: Gerente de Auditoría, Auditor Líder TI, Especialista en Seguridad, Especialista en Pruebas de Penetración |
| Cronograma detallado | Fases y tareas por semana; hitos de entrega |
| Recursos y presupuesto | Horas estimadas por área, herramientas tecnológicas de auditoría |
| Criterios de materialidad | Umbrales de riesgo para priorización de hallazgos: Crítico/Alto/Medio/Bajo |
| Enfoque de auditoría | Basado en riesgo; áreas de mayor exposición identificadas en evaluación preliminar |
| Aprobaciones | Firma del Director de Auditoría y del Oficial de Enlace de la entidad auditada |

**Procedimientos de obtención de evidencia:**
- Entrevista con el CISO/Director de Tecnología
- Revisión de la última auditoría de seguridad (interna/externa)
- Análisis de incidentes de seguridad del período
- Revisión de resultados de evaluaciones de riesgo previas

---

### A-02 — EVALUACIÓN DEL CONTEXTO ORGANIZACIONAL Y PARTES INTERESADAS

**Carpeta:** A — Planificación del SGSI  
**Clasificación:** STANDARD  
**Referencias normativas:** ISO 27001:2022 Cláusulas 4.1, 4.2, 4.3; COBIT EDM01; NIST CSF GV.OC

**Objetivo:** Comprender el contexto interno y externo de la organización, las partes interesadas con requerimientos de seguridad, y determinar el alcance apropiado del SGSI.

**Contenido y procedimientos:**

| Procedimiento | Evidencia a Obtener |
|---------------|---------------------|
| Análisis del entorno regulatorio | Licencias, autorizaciones regulatorias, sanciones previas BCR/SSF |
| Mapeo de partes interesadas | Clientes, reguladores (BCR, SSF, ACE), accionistas, proveedores críticos |
| Revisión del alcance del SGSI documentado | Declaración de alcance firmada y aprobada; exclusiones justificadas |
| Análisis de activos de información críticos | Inventario de activos: sistemas core, bases de datos, infraestructura |
| Revisión de estructura organizacional de seguridad | Organigrama de seguridad; existencia de CISO, Comité de Seguridad, Oficial de Privacidad |
| Evaluación de la madurez del SGSI | Nivel de madurez en escala 1-5 según ISO 15504/CMMI |

**Preguntas de auditoría clave:**
1. ¿Existe un SGSI formalmente establecido, documentado y aprobado por la junta directiva?
2. ¿El alcance del SGSI cubre todos los activos de información críticos de la organización?
3. ¿Se han identificado todos los requisitos legales, regulatorios y contractuales de seguridad aplicables?
4. ¿Existe una unidad especializada de seguridad de la información (conforme NRP-23)?

---

### A-03 — ANÁLISIS DE RIESGO DE AUDITORÍA — SEGURIDAD TI

**Carpeta:** A — Planificación del SGSI  
**Clasificación:** SMART  
**Referencias normativas:** ISO 27001:2022 Cláusula 6.1.2; COBIT APO12; NIST CSF ID.RA; NRP-23 Art. 12-18

**Objetivo:** Evaluar el proceso formal de gestión de riesgos de seguridad de la información, verificando que la organización identifica, analiza, evalúa y trata los riesgos de manera sistemática y documentada conforme a metodología aprobada.

**Contenido y procedimientos:**

| Procedimiento | Criterio de Evaluación |
|---------------|----------------------|
| Revisión de la metodología de evaluación de riesgos | Debe estar aprobada por el Directorio (NRP-23); alineada a ISO 27005 o equivalente |
| Verificación del inventario de activos de información | Completitud: ¿incluye sistemas TI, datos, procesos, personas? |
| Revisión de la matriz de riesgos de seguridad | Actualización reciente (máximo 12 meses); criterios de probabilidad e impacto definidos |
| Evaluación del proceso de identificación de amenazas/vulnerabilidades | Fuentes de inteligencia de amenazas utilizadas (ISO A.5.7) |
| Revisión del plan de tratamiento de riesgos | Controles seleccionados vinculados a ISO 27001 Anexo A; responsables y plazos definidos |
| Revisión de la Declaración de Aplicabilidad (SoA) | Todos los controles del Anexo A justificados como aplicables o no aplicables |

**Escala de madurez para riesgos (COBIT 2019):**

| Nivel | Descripción | Calificación |
|-------|-------------|--------------|
| 0 — Inexistente | No hay proceso de gestión de riesgos | Crítico |
| 1 — Inicial/Ad hoc | Proceso informal, no documentado | Alto |
| 2 — Reproducible | Proceso básico documentado, no estandarizado | Moderado |
| 3 — Definido | Proceso estandarizado, aprobado y comunicado | Satisfactorio |
| 4 — Gestionado | Proceso medido con KPIs; mejora continua | Bueno |
| 5 — Optimizado | Mejora continua basada en datos y benchmarks | Excelente |

---

### A-04 — REVISIÓN DEL MARCO NORMATIVO INTERNO DEL SGSI

**Carpeta:** A — Planificación del SGSI  
**Clasificación:** STANDARD  
**Referencias normativas:** ISO 27001:2022 Cláusulas 5.2, 7.5; ISO A.5.1, A.5.36, A.5.37; NRP-23 Art. 4-8; COBIT APO01

**Objetivo:** Verificar la existencia, actualidad, aprobación y difusión de las políticas, procedimientos, estándares y guías que conforman el marco normativo interno de seguridad de la información.

**Documentos a revisar:**

| Documento | Criterios de Evaluación |
|-----------|------------------------|
| Política de Seguridad de la Información | Aprobada por Directorio; vigente (<2 años); disponible para todo el personal |
| Política de Control de Accesos | Alineada a A.5.15; incluye acceso privilegiado y gestión de cuentas |
| Política de Criptografía | Alineada a A.8.24; define algoritmos, longitudes de clave, gestión de certificados |
| Política de Gestión de Incidentes | Alineada a A.5.24-A.5.27; incluye criterios de notificación a reguladores |
| Política de Desarrollo Seguro | Alineada a A.8.25-A.8.28; ciclo de vida seguro de aplicaciones |
| Política de Teletrabajo/Trabajo Remoto | Alineada a A.6.7; controles para acceso remoto seguro |
| Política de Continuidad del Negocio | Alineada a A.5.29-A.5.30; vinculada al plan BCP/DRP |
| Procedimientos operativos de TI | Documentados para operaciones críticas (A.5.37) |

**Criterio de hallazgo:** Políticas con más de 2 años sin revisión, no aprobadas por autoridad competente, o no comunicadas al personal constituyen deficiencias de control.

---

### A-05 — EVALUACIÓN DEL GOBIERNO DE SEGURIDAD DE LA INFORMACIÓN

**Carpeta:** A — Planificación del SGSI  
**Clasificación:** SMART  
**Referencias normativas:** ISO 27001:2022 Cláusulas 5.1, 5.3; COBIT EDM01, EDM03, APO13; NIST CSF GV.RR; NRP-23 Art. 3-5; D.L. 143 Art. 15-25

**Objetivo:** Evaluar si la estructura de gobierno de seguridad de la información es adecuada, con roles y responsabilidades claramente definidos, y si la alta dirección demuestra compromiso activo con el SGSI.

**Evaluación de componentes de gobierno:**

| Componente | Criterio de Evaluación | Referencia |
|------------|----------------------|------------|
| Compromiso de la Junta Directiva/Directorio | Actas de aprobación del SGSI y política de seguridad; asignación de recursos | ISO 5.1; NRP-23 Art. 3 |
| Comité de Seguridad/Riesgos | Existencia, composición, frecuencia de reuniones, minutos de reuniones | NRP-23 Art. 4 |
| CISO/Oficial de Seguridad | Nombramiento formal; independencia; línea de reporte; perfil profesional | ISO 5.3; COBIT APO13 |
| Unidad Especializada de Seguridad | Estructura, dotación, competencias y recursos | NRP-23 Art. 5 |
| Responsable de Protección de Datos | Nombramiento si aplica D.L. 144/2024 | D.L. 144 |
| Alineación con ACE | Mecanismos de coordinación con Agencia de Ciberseguridad del Estado | D.L. 143 Art. 20 |

---

### A-06 — PLAN DE MUESTREO Y PROCEDIMIENTOS DE AUDITORÍA

**Carpeta:** A — Planificación del SGSI  
**Clasificación:** MASTER  
**Referencias normativas:** IIA IPPF 2240; ISACA IS Audit Standards; ISO 19011:2018

**Objetivo:** Definir la estrategia de muestreo estadístico y no estadístico, los procedimientos específicos de prueba para cada área de auditoría, y las fuentes de evidencia a recopilar.

**Tipos de pruebas de auditoría de seguridad TI:**

| Tipo de Prueba | Descripción | Aplicación |
|----------------|-------------|------------|
| Indagación | Entrevistas estructuradas con personal de TI y seguridad | Todas las áreas |
| Inspección documental | Revisión de políticas, procedimientos, registros, logs | Todas las áreas |
| Observación | Verificación directa de controles en operación | IAM, física, operaciones |
| Re-ejecución | Repetición de controles para verificar efectividad | IAM, configuración |
| Análisis técnico | Revisión de configuraciones, logs, resultados de herramientas | VULN, CRYPT, INC |
| Pruebas de penetración (revisión) | Evaluación de metodología y resultados de pentests | B-PENTEST |
| Pruebas de continuidad (simulacro) | Revisión de tabletop exercises y pruebas de DRP | B-BCP |

---

### B-IAM-01 — EVALUACIÓN DEL MARCO DE CONTROL DE ACCESOS

**Carpeta:** B-IAM — Gestión de Identidad y Control de Accesos  
**Clasificación:** SMART  
**Referencias normativas:** ISO A.5.15, A.5.16, A.5.17, A.5.18, A.8.1, A.8.2, A.8.3, A.8.5; COBIT APO13, DSS05; NIST CSF PR.AA; NRP-23 Art. 19-22; NRP-32 Art. 7-10

**Objetivo:** Evaluar la efectividad del sistema de gestión de identidades y control de accesos (IAM), verificando que solo usuarios autorizados acceden a los sistemas y datos críticos con los privilegios mínimos necesarios.

**Procedimientos de prueba:**

| Prueba | Procedimiento | Evidencia Esperada |
|--------|--------------|-------------------|
| IAM-01.1 | Obtener y revisar el inventario completo de cuentas de usuario activas en sistemas críticos | Inventario actualizado (<30 días); coincidencia con directorio de personal activo |
| IAM-01.2 | Seleccionar muestra de usuarios (n≥30 o 10% del total) y verificar que cuentas inactivas >60 días hayan sido deshabilitadas | Logs de Active Directory / LDAP; política de gestión de cuentas |
| IAM-01.3 | Verificar proceso formal de aprobación para asignación y modificación de accesos | Formularios/tickets de solicitud con doble aprobación; evidencia en ITSM |
| IAM-01.4 | Revisar revisiones periódicas de acceso (Access Reviews/Recertificaciones) | Última recertificación <6 meses; firmada por propietarios de sistema |
| IAM-01.5 | Evaluar segregación de funciones en sistemas críticos | Matriz SoD (Segregación de Funciones); ausencia de usuarios con roles conflictivos |
| IAM-01.6 | Verificar existencia y funcionamiento de Single Sign-On (SSO) y/o MFA | Configuración técnica de MFA; registros de autenticación |
| IAM-01.7 | Revisar gestión de accesos de terceros/proveedores | Contratos con cláusulas de seguridad; accesos temporales; monitoreo de sesiones |

**Criterios de hallazgo críticos:**
- Cuentas de exempleados activas en sistemas de producción
- Ausencia de MFA en accesos a sistemas críticos (incumple NRP-32 Art. 7)
- Sin revisiones periódicas de acceso documentadas (incumple ISO A.5.18)

---

### B-IAM-02 — REVISIÓN DE CUENTAS PRIVILEGIADAS Y PAM

**Carpeta:** B-IAM  
**Clasificación:** SMART  
**Referencias normativas:** ISO A.8.2, A.8.18; COBIT DSS05; NIST CSF PR.AA-05; NRP-23 Art. 22

**Objetivo:** Evaluar el control sobre cuentas privilegiadas (administradores de sistemas, DBA, cuentas de servicio) verificando que se gestionan mediante una solución PAM (Privileged Access Management) con monitoreo y grabación de sesiones.

**Procedimientos específicos:**

| Prueba | Criterio de Cumplimiento |
|--------|--------------------------|
| Inventario de cuentas privilegiadas | Lista completa y actualizada; propietario asignado a cada cuenta privilegiada |
| Solución PAM implementada | Vault de contraseñas; rotación automática periódica; grabación de sesiones |
| Uso de cuentas genéricas privilegiadas | Prohibición o trazabilidad individual (quién usó la cuenta compartida) |
| Contraseñas de cuentas privilegiadas | Complejidad ≥12 caracteres; caducidad ≤90 días; historial de contraseñas |
| Acceso privilegiado de emergencia (break-glass) | Procedimiento documentado; notificación automática; revisión post-uso |
| Cuentas de servicio | Principio de mínimo privilegio; contraseñas no gestionadas manualmente |

---

### B-IAM-03 — PRUEBAS DE AUTENTICACIÓN MULTIFACTOR (MFA/3FA)

**Carpeta:** B-IAM  
**Clasificación:** STANDARD  
**Referencias normativas:** ISO A.8.5; NRP-32 Art. 7-9; D.L. 143 Art. 30; NIST CSF PR.AA-02

**Objetivo:** Verificar la implementación y efectividad de la autenticación multifactor en sistemas críticos y canales digitales, conforme a los requisitos de tres factores de autenticación establecidos por NRP-32.

**Alcance de pruebas MFA:**

| Sistema/Canal | Factor Requerido (NRP-32) | Estado Esperado |
|---------------|--------------------------|-----------------|
| Banca en línea (clientes) | Categorías 2 + 3 (contraseña + clave dinámica) | Implementado y activo |
| Banca móvil | Categorías 2 + 3 | Implementado y activo |
| Banca telefónica | Mínimo Categoría 2 | Implementado y activo |
| Acceso VPN corporativo | MFA (ISO A.8.5) | Implementado y activo |
| Portales de administración de sistemas | MFA obligatorio | Implementado y activo |
| Acceso a aplicaciones en la nube | MFA via SSO/SAML | Implementado y activo |

**Prueba técnica adicional:** Intentar acceder a sistemas críticos con credenciales válidas pero sin segundo factor — verificar que el acceso es denegado.

---

### B-IAM-04 — REVISIÓN DEL CICLO DE VIDA DE CUENTAS (ONBOARDING/OFFBOARDING)

**Carpeta:** B-IAM  
**Clasificación:** STANDARD  
**Referencias normativas:** ISO A.6.1, A.6.2, A.6.5, A.5.18; COBIT APO07; NRP-23 Art. 21

**Objetivo:** Evaluar los procesos de provisión y desprovisionamiento de accesos durante el ciclo de vida del empleado/contratista, asegurando que los accesos se otorgan oportunamente al ingreso y se revocan inmediatamente al cese.

**Muestra de prueba:** Seleccionar 25 casos de bajas de personal en los últimos 12 meses y verificar:
1. Fecha de cese del empleado
2. Fecha de deshabilitación de cuenta en Active Directory / IdP
3. Tiempo transcurrido entre ambas fechas (meta: ≤1 día hábil)
4. Revocación de todos los accesos privilegiados
5. Recuperación de equipos y activos asignados

**Criterio de hallazgo:** Brecha >1 día hábil entre cese y revocación de accesos constituye deficiencia de control moderada; >5 días hábiles, hallazgo alto.

---

### B-VULN-01 — EVALUACIÓN DEL PROGRAMA DE GESTIÓN DE VULNERABILIDADES

**Carpeta:** B-VULN  
**Clasificación:** SMART  
**Referencias normativas:** ISO A.8.8, A.8.7, A.8.9; COBIT BAI10, DSS05; NIST CSF ID.RA, PR.PS; NRP-32 Art. 14; D.L. 143 Art. 32

**Objetivo:** Evaluar la completitud, efectividad y rigurosidad del programa de gestión de vulnerabilidades técnicas, desde la identificación hasta el cierre verificado de vulnerabilidades en el plazo definido según criticidad.

**Componentes del programa a evaluar:**

| Componente | Criterio de Evaluación | Hallazgo Potencial |
|------------|----------------------|-------------------|
| Herramientas de escaneo | Solución automatizada (Nessus, Qualys, Rapid7 o equivalente); licencias vigentes | Sin herramienta formal: Crítico |
| Cobertura del escaneo | ¿Se escanea el 100% de activos en alcance? Frecuencia: mínimo mensual para activos críticos | Cobertura <80%: Alto |
| Proceso de clasificación | Uso de CVSS (Common Vulnerability Scoring System) para priorización | Sin CVSS: Moderado |
| SLA de remediación | Crítica: ≤15 días; Alta: ≤30 días; Media: ≤90 días; Baja: ≤180 días | SLA no definido: Alto |
| Seguimiento y cierre | Ticketing system con evidencia de remediación verificada | Sin evidencia de cierre: Alto |
| Gestión de excepciones | Proceso formal de excepción con aprobación de riesgo y fecha de revisión | Sin proceso: Moderado |
| Métricas e informes | KPIs: tasa de remediación, tiempo medio de remediación (MTTR), vulnerabilidades críticas pendientes | Sin KPIs: Bajo |

---

### B-VULN-02 — PRUEBAS DE GESTIÓN DE PARCHES Y CONFIGURACIÓN SEGURA

**Carpeta:** B-VULN  
**Clasificación:** STANDARD  
**Referencias normativas:** ISO A.8.8, A.8.9, A.8.19; COBIT BAI06, BAI10; NIST CSF PR.PS-01, PR.PS-02; NRP-32 Art. 14

**Objetivo:** Verificar que el proceso de gestión de parches de seguridad es efectivo y oportuno, y que las líneas base de configuración segura (hardening) se mantienen en todos los sistemas en alcance.

**Pruebas de gestión de parches:**

| Prueba | Procedimiento |
|--------|--------------|
| VULN-02.1 | Obtener reporte de parches pendientes de los últimos 90 días; verificar que no existen parches críticos con >30 días sin aplicar |
| VULN-02.2 | Seleccionar muestra de 10 servidores críticos; verificar nivel de parche actual vs. últimos boletines de seguridad del fabricante |
| VULN-02.3 | Revisar proceso de prueba de parches en entorno no productivo antes de aplicación en producción |
| VULN-02.4 | Verificar que sistemas operativos y aplicaciones sin soporte del fabricante (EOL/EOS) están documentados y tienen plan de migración |

**Pruebas de configuración segura (hardening):**
- Verificar existencia de líneas base de configuración por tipo de sistema (Windows Server, Linux, bases de datos, dispositivos de red)
- Comparar configuración actual de muestra de sistemas vs. CIS Benchmarks o STIG equivalente
- Verificar deshabilitación de servicios innecesarios, puertos cerrados, y contraseñas por defecto cambiadas

---

### B-CRYPT-01 — REVISIÓN DE CONTROLES CRIPTOGRÁFICOS Y GESTIÓN DE CERTIFICADOS

**Carpeta:** B-CRYPT  
**Clasificación:** SMART  
**Referencias normativas:** ISO A.8.24; COBIT APO13, DSS05; NIST CSF PR.DS-01, PR.DS-02; NRP-32 Art. 16; NRP-23 Art. 20

**Objetivo:** Evaluar la efectividad de los controles criptográficos implementados para proteger la confidencialidad e integridad de la información en tránsito y en reposo, y la correcta gestión del ciclo de vida de certificados digitales.

**Controles criptográficos a evaluar:**

| Control | Criterio de Cumplimiento | Estándar Mínimo |
|---------|--------------------------|-----------------|
| Cifrado de datos en tránsito | TLS 1.2 mínimo; preferible TLS 1.3; certificados válidos y vigentes | ISO A.8.24; NRP-32 Art. 16 |
| Cifrado de datos en reposo | AES-256 para bases de datos y almacenamiento de información sensible | ISO A.8.24 |
| Cifrado de dispositivos móviles y laptops | BitLocker/FileVault habilitado en dispositivos corporativos | ISO A.8.1, A.8.24 |
| Gestión de certificados digitales | Inventario de certificados; alertas de vencimiento ≥30 días antes; proceso de renovación | ISO A.8.24 |
| Gestión de claves criptográficas | HSM (Hardware Security Module) para claves críticas; procedimiento de ciclo de vida de claves | ISO A.8.24 |
| Algoritmos obsoletos | Verificar ausencia de SSL 3.0, TLS 1.0/1.1, MD5, SHA-1, DES, 3DES en sistemas críticos | NIST SP 800-52r2 |
| Autenticación de mensajes | HMAC o firmas digitales para integridad de transacciones financieras críticas | NRP-32 Art. 16 |

**Prueba técnica:** Usar herramientas como SSLLabs/testssl.sh para verificar configuración TLS de aplicaciones expuestas al público. Verificar que el resultado sea mínimo calificación A-.

---

### B-INC-01 — EVALUACIÓN DEL PROCESO DE GESTIÓN DE INCIDENTES

**Carpeta:** B-INC  
**Clasificación:** SMART  
**Referencias normativas:** ISO A.5.24, A.5.25, A.5.26, A.5.27, A.5.28; COBIT DSS02; NIST CSF RS.MA, RS.AN, RS.MI; NRP-23 Art. 28-32; D.L. 143 Art. 28

**Objetivo:** Evaluar que el proceso de gestión de incidentes de seguridad de la información está formalmente establecido, es efectivo para detectar, contener, erradicar y recuperarse de incidentes, y cumple con los plazos de notificación regulatoria.

**Evaluación del proceso:**

| Fase del Proceso | Criterio de Evaluación |
|-----------------|----------------------|
| **Detección** | Fuentes de detección definidas (SIEM, IDS/IPS, EDR, reportes de usuarios); umbral de escalación documentado |
| **Clasificación y Priorización** | Criterios de severidad documentados; roles y responsables por nivel de severidad |
| **Contención** | Procedimientos de contención inmediata (aislamiento de sistemas); runbooks actualizados |
| **Erradicación** | Procedimiento de eliminación de la causa raíz; verificación post-erradicación |
| **Recuperación** | Restauración de servicios; pruebas de funcionamiento; comunicación a usuarios |
| **Lecciones Aprendidas** | Reunión de post-mortem documentada; mejoras incorporadas al proceso |
| **Notificación Regulatoria** | Protocolo de notificación a SSF/BCR y ACE dentro de plazos establecidos (D.L. 143) |

**Revisión de registro histórico de incidentes (últimos 12 meses):**
- Número total de incidentes registrados
- Distribución por severidad
- Tiempo medio de detección (MTTD)
- Tiempo medio de respuesta (MTTR)
- Incidentes que generaron notificación regulatoria: ¿fue oportuna?

---

### B-INC-02 — PRUEBAS DE CAPACIDAD DE DETECCIÓN Y RESPUESTA (SOC/SIEM)

**Carpeta:** B-INC  
**Clasificación:** STANDARD  
**Referencias normativas:** ISO A.8.15, A.8.16, A.8.17; COBIT DSS05; NIST CSF DE.CM; NRP-32 Art. 12

**Objetivo:** Evaluar la efectividad del Centro de Operaciones de Seguridad (SOC) y la plataforma SIEM para la detección oportuna de eventos de seguridad y su correlación para identificar incidentes reales.

**Componentes SOC/SIEM a evaluar:**

| Componente | Criterio |
|------------|---------|
| Cobertura de fuentes de log | ¿Los sistemas críticos envían logs al SIEM? Mínimo: firewalls, servidores AD, aplicaciones críticas, bases de datos |
| Integridad de logs | Logs protegidos contra modificación; retención mínima 12 meses activa + 24 meses archivo (conforme NRP-23) |
| Reglas de correlación activas | Reglas para: accesos fallidos, privilegios elevados, accesos fuera de horario, malware detectado, exfiltración de datos |
| Alertas y tiempos de respuesta | SLA de atención de alertas críticas: ≤15 minutos; altas: ≤1 hora |
| Sincronización de relojes (NTP) | Todos los sistemas sincronizados a servidor NTP confiable (ISO A.8.17) |
| Simulacro de detección | Inyectar evento de prueba y verificar que el SOC lo detecta y responde en el tiempo establecido |

---

### B-PENTEST-01 — REVISIÓN DEL PROGRAMA DE PRUEBAS DE PENETRACIÓN

**Carpeta:** B-PENTEST  
**Clasificación:** SMART  
**Referencias normativas:** ISO A.8.29, A.8.34; COBIT DSS05; NIST CSF ID.RA-05; NRP-32 Art. 14; NRP-23 Art. 33

**Objetivo:** Evaluar que la organización ejecuta pruebas de penetración periódicas realizadas por personal calificado e independiente, que los resultados son gestionados apropiadamente y que las remediaciones se verifican.

**Evaluación del programa de pruebas de penetración:**

| Criterio | Estándar | Hallazgo si no cumple |
|----------|----------|----------------------|
| Frecuencia mínima | Anual para infraestructura interna y externa; semestral para aplicaciones web críticas y canales digitales (NRP-32) | Alto |
| Independencia del ejecutor | Empresa especializada externa o equipo red team interno sin conflicto de interés | Moderado |
| Credenciales del ejecutor | Certificaciones reconocidas: OSCP, CEH, GPEN o equivalente | Bajo |
| Metodología utilizada | PTES, OWASP WSTG, NIST SP 800-115, OSSTMM | Moderado |
| Alcance documentado y aprobado | Reglas de participación (RoE) firmadas antes de iniciar | Moderado |
| Informe formal de resultados | Informe técnico + ejecutivo con CVSS; evidencia de hallazgos | Alto |
| Plan de remediación | Hallazgos críticos/altos con responsable y plazo ≤30 días | Alto |
| Prueba de verificación (re-test) | Re-prueba de hallazgos críticos remediados | Moderado |
| Incluye canales digitales | Pruebas de banca en línea, APIs, banca móvil (NRP-32 Art. 14) | Alto (por NRP-32) |

---

### B-BCP-01 — EVALUACIÓN DEL PLAN DE CONTINUIDAD DEL NEGOCIO (BCP/PCN)

**Carpeta:** B-BCP  
**Clasificación:** SMART  
**Referencias normativas:** ISO A.5.29, A.5.30; COBIT DSS04, BAI04; NIST CSF RC.RP; NRP-23 Art. 35-38; NRP-32 Art. 18-20

**Objetivo:** Evaluar que la organización cuenta con un Plan de Continuidad del Negocio (BCP) formalmente documentado, probado y actualizado, que garantiza la continuidad de servicios críticos ante interrupciones graves.

**Contenido mínimo del BCP a verificar:**

| Elemento del BCP | Criterio | Referencia |
|-----------------|---------|------------|
| Análisis de Impacto al Negocio (BIA) | Actualizado (<12 meses); procesos críticos con RTO/RPO definidos | ISO A.5.30; NRP-23 |
| Estrategias de continuidad | Sitio alterno; redundancia de sistemas; acuerdos con proveedores alternativos | COBIT DSS04 |
| Procedimientos de activación del BCP | Umbral de activación claro; árbol de llamadas; roles de crisis | ISO A.5.29 |
| Comunicación de crisis | Plan de comunicación interna y externa durante un incidente de continuidad | NIST CSF RC.CO |
| Pruebas del BCP | Ejercicio de tabletop y/o simulacro completo documentado (<12 meses) | ISO A.5.29; NRP-23 |
| Integración con el SGSI | BCP cubre amenazas de ciberseguridad (ransomware, DDoS, breach masivo) | ISO A.5.30; NIST RC |
| Aprobación del Directorio | BCP aprobado formalmente; revisado anualmente | NRP-23 Art. 37 |

---

### B-BCP-02 — PRUEBA DEL PLAN DE RECUPERACIÓN ANTE DESASTRES (DRP/PRD)

**Carpeta:** B-BCP  
**Clasificación:** STANDARD  
**Referencias normativas:** ISO A.5.30, A.8.13, A.8.14; COBIT DSS04, BAI04; NIST CSF RC.RP; NRP-23 Art. 38-40; NRP-32 Art. 20

**Objetivo:** Evaluar que el Plan de Recuperación ante Desastres (DRP) de TI incluye procedimientos específicos y validados para la recuperación de sistemas críticos, y que los RTO/RPO definidos son alcanzables y han sido probados.

**Evaluación técnica del DRP:**

| Área | Procedimiento de Auditoría |
|------|--------------------------|
| Inventario de sistemas críticos con RTO/RPO | Verificar que todos los sistemas Tier 1 tienen RTO ≤4 horas y RPO ≤1 hora definidos |
| Respaldos (backups) | Verificar regla 3-2-1: 3 copias, 2 medios distintos, 1 fuera del sitio; prueba de restauración documentada <6 meses |
| Sitio de recuperación alterno | Verificar existencia: sitio caliente (hot), tibio (warm) o frío (cold); capacidad suficiente para sistemas críticos |
| Pruebas de failover | Último ejercicio de failover documentado; resultados vs. RTO/RPO objetivos |
| Procedimientos de activación del DRP | Árbol de decisión para activar DRP; comunicación con BCR/SSF si aplica (NRP-23) |
| Prueba de recuperación de datos | Restauración de respaldo más reciente verificada en entorno de prueba |

---

### C-NRP-01 — CUESTIONARIO DE CUMPLIMIENTO NRP-23 BCR

**Carpeta:** C-NRP  
**Clasificación:** MASTER  
**Referencias normativas:** NRP-23 BCR El Salvador — Completa; ISO 27001:2022 Anexo A

**Objetivo:** Evaluar el nivel de cumplimiento de la entidad con los requisitos establecidos en las Normas Técnicas para la Gestión de la Seguridad de la Información (NRP-23) del Banco Central de Reserva de El Salvador.

**Cuestionario de cumplimiento NRP-23:**

| N° | Requisito NRP-23 | C | P/C | N/C | Observaciones |
|----|-----------------|---|-----|-----|---------------|
| 1 | ¿La entidad ha establecido, mantiene y documenta un SGSI? | | | | |
| 2 | ¿El SGSI es consistente con el sistema de gestión de continuidad del negocio y la gestión de riesgo operacional? | | | | |
| 3 | ¿El Comité de Riesgos revisa y propone para aprobación del Directorio la estructura del SGSI? | | | | |
| 4 | ¿Existe una unidad especializada de seguridad de la información formalmente constituida? | | | | |
| 5 | ¿Se han adoptado políticas, procedimientos, mecanismos y herramientas para la protección de la información? | | | | |
| 6 | ¿La política de seguridad está aprobada por el Directorio y difundida a todo el personal? | | | | |
| 7 | ¿Existe un proceso de identificación, análisis, evaluación y mitigación de riesgos de seguridad con metodología aprobada? | | | | |
| 8 | ¿La metodología de evaluación de riesgos contempla activos, procesos, personas, proyectos y servicios tecnológicos? | | | | |
| 9 | ¿Existen controles de acceso lógico, físico y procedimental documentados? | | | | |
| 10 | ¿Se mantiene un inventario actualizado de cuentas y perfiles de usuario para control de acceso? | | | | |
| 11 | ¿Existen procedimientos de respaldo periódico validados regularmente? | | | | |
| 12 | ¿La ubicación del almacenamiento de información de clientes fue notificada a la Superintendencia en los plazos requeridos? | | | | |
| 13 | ¿Se ejecutan auditorías periódicas de seguridad de la información? | | | | |
| 14 | ¿Existe un proceso documentado de gestión de incidentes de seguridad? | | | | |
| 15 | ¿Los controles preventivos de ciberseguridad contemplan al menos la etapa de prevención con controles apropiados? | | | | |
| 16 | ¿El BCP/SGCN está integrado con el SGSI y cubre amenazas de ciberseguridad? | | | | |
| 17 | ¿Se aplican controles de seguridad a terceros con acceso a activos críticos de información? | | | | |
| 18 | ¿Los controles criptográficos definidos en la política de seguridad están implementados para información sensible? | | | | |

**Leyenda:** C = Cumple | P/C = Cumple Parcialmente | N/C = No Cumple

**Calificación de cumplimiento:**

| Rango de Cumplimiento | Calificación | Acción Requerida |
|----------------------|--------------|-----------------|
| 90-100% | Satisfactorio | Mantenimiento preventivo |
| 75-89% | Aceptable con mejoras | Plan de acción en 90 días |
| 60-74% | Con deficiencias | Plan de acción en 45 días; informar al regulador |
| <60% | Deficiente | Plan de acción urgente; posible hallazgo regulatorio |

---

### C-NRP-02 — CUESTIONARIO DE CUMPLIMIENTO NRP-32 SSF

**Carpeta:** C-NRP  
**Clasificación:** MASTER  
**Referencias normativas:** NRP-32 SSF El Salvador — Completa; ISO A.8.5, A.8.8, A.8.20, A.8.24

**Objetivo:** Evaluar el nivel de cumplimiento de la entidad con las Normas Técnicas sobre Medidas de Ciberseguridad en Canales Digitales (NRP-32) de la Superintendencia del Sistema Financiero.

**Cuestionario de cumplimiento NRP-32:**

| N° | Requisito NRP-32 | C | P/C | N/C | Observaciones |
|----|-----------------|---|-----|-----|---------------|
| 1 | ¿La entidad cuenta con infraestructura con protocolos de autenticación, autorización y registro de actividad de usuario? | | | | |
| 2 | ¿Se mantiene un inventario actualizado de activos críticos de información y tecnología asociada? | | | | |
| 3 | ¿Los canales digitales implementan autenticación multifactor con los factores requeridos (Cat. 1, 2 y/o 3 según canal)? | | | | |
| 4 | ¿Las contraseñas cumplen requisitos de complejidad y tienen vigencia máxima de 180 días? | | | | |
| 5 | ¿Se envía confirmación inmediata al cliente sobre transacciones realizadas en canales digitales? | | | | |
| 6 | ¿Existen sistemas de monitoreo para detectar operaciones posiblemente fraudulentas o irregulares? | | | | |
| 7 | ¿La entidad cuenta con proceso de gestión de vulnerabilidades que incluye escaneos y pruebas de penetración? | | | | |
| 8 | ¿Se realizan pruebas de penetración periódicas a los canales digitales (banca en línea, banca móvil, APIs)? | | | | |
| 9 | ¿Se implementan herramientas antimalware actualizadas en la infraestructura de canales digitales? | | | | |
| 10 | ¿Se implementan herramientas anti-suplantación de identidad (anti-phishing, anti-spoofing)? | | | | |
| 11 | ¿Se gestiona el cifrado de datos de clientes en tránsito y en reposo en canales digitales? | | | | |
| 12 | ¿Existen herramientas de prevención de pérdida de datos (DLP) implementadas? | | | | |
| 13 | ¿Se gestionan los dispositivos móviles corporativos mediante solución MDM? | | | | |
| 14 | ¿Existen planes de emergencia y respuesta ante fallas que han sido probados periódicamente? | | | | |
| 15 | ¿Se ejecutan campañas de educación financiera a los clientes sobre ciberseguridad? | | | | |

---

### C-CIBER-01 — EVALUACIÓN DE CUMPLIMIENTO LEY DE CIBERSEGURIDAD D.L. 143/2024

**Carpeta:** C-CIBER  
**Clasificación:** MASTER  
**Referencias normativas:** D.L. 143/2024 — Ley de Ciberseguridad y Seguridad de la Información El Salvador; ISO 27001:2022 Cláusula 9.1

**Objetivo:** Evaluar el nivel de cumplimiento de la entidad con las obligaciones establecidas en la Ley de Ciberseguridad y Seguridad de la Información, incluyendo la implementación de un sistema de gestión de ciberseguridad, seguridad por diseño, notificación de incidentes y capacitación.

**Evaluación de cumplimiento D.L. 143/2024:**

| N° | Obligación Legal | Artículo Referencia | C | P/C | N/C |
|----|-----------------|---------------------|---|-----|-----|
| 1 | ¿La entidad ha implementado un sistema de gestión de ciberseguridad para identificar y mitigar riesgos? | Art. 18 | | | |
| 2 | ¿Se aplica el enfoque de seguridad por diseño en el desarrollo y adquisición de sistemas? | Art. 22 | | | |
| 3 | ¿Existe una estrategia de seguridad informática documentada y alineada a estándares internacionales (ISO, NIST)? | Art. 19 | | | |
| 4 | ¿Existe un protocolo formal de notificación de incidentes de ciberseguridad a la ACE y/o entes supervisores? | Art. 28 | | | |
| 5 | ¿Se han notificado todos los incidentes significativos en los plazos legales requeridos en el período auditado? | Art. 28 | | | |
| 6 | ¿Existen programas continuos de capacitación y concientización en ciberseguridad para el personal? | Art. 25 | | | |
| 7 | ¿Se gestiona la ciberseguridad de la cadena de suministro (terceros y proveedores tecnológicos)? | Art. 23 | | | |
| 8 | ¿Se han identificado y registrado los activos de infraestructura crítica bajo custodia de la entidad? | Art. 15 | | | |
| 9 | ¿La entidad tiene mecanismos de coordinación con la ACE establecidos? | Art. 20 | | | |
| 10 | ¿Los contratos con proveedores de TI incluyen cláusulas de ciberseguridad alineadas a la Ley? | Art. 23 | | | |

---

### C-COBIT-01 — EVALUACIÓN DE MADUREZ COBIT 2019 — SEGURIDAD TI

**Carpeta:** C-COBIT  
**Clasificación:** SMART  
**Referencias normativas:** COBIT 2019 — ISACA; ISO 27001:2022 Cláusula 9; NIST CSF GV

**Objetivo:** Evaluar el nivel de madurez de los procesos de gobierno y gestión de TI relacionados con seguridad de la información, utilizando la escala de capacidad de procesos COBIT 2019 (0-5).

**Procesos COBIT 2019 evaluados para Seguridad TI:**

| Dominio | Proceso | Nivel de Capacidad Objetivo | Nivel Observado | Brecha |
|---------|---------|---------------------------|-----------------|--------|
| EDM03 | Asegurar la optimización del riesgo | 3 | ___ | ___ |
| APO12 | Gestionar el riesgo | 3 | ___ | ___ |
| APO13 | Gestionar la seguridad | 3 | ___ | ___ |
| APO14 | Gestionar los datos | 3 | ___ | ___ |
| BAI06 | Gestionar los cambios | 3 | ___ | ___ |
| BAI10 | Gestionar la configuración | 3 | ___ | ___ |
| DSS04 | Gestionar la continuidad | 3 | ___ | ___ |
| DSS05 | Gestionar los servicios de seguridad | 3 | ___ | ___ |
| MEA02 | Gestionar el sistema de control interno | 3 | ___ | ___ |
| MEA03 | Gestionar el cumplimiento con requisitos externos | 3 | ___ | ___ |

**Escala de capacidad de procesos COBIT 2019:**

| Nivel | Denominación | Descripción |
|-------|-------------|-------------|
| 0 | Incompleto | El proceso no está implementado o no logra su propósito |
| 1 | Inicial | El proceso está implementado informalmente |
| 2 | Gestionado | El proceso está planificado, monitoreado y ajustado |
| 3 | Establecido | El proceso está documentado, estandarizado y comunicado |
| 4 | Predecible | El proceso opera con límites definidos para lograr sus resultados |
| 5 | Optimizado | El proceso mejora continuamente para cumplir metas relevantes |

---

### D-01 — CÉDULA CONSOLIDADA DE HALLAZGOS DE SEGURIDAD TI

**Carpeta:** D — Hallazgos e Informe  
**Clasificación:** MASTER  
**Referencias normativas:** IIA IPPF 2400; ISO 27001:2022 Cláusula 9.2; ISACA IS Audit Standards

**Objetivo:** Consolidar todos los hallazgos de seguridad TI identificados durante el trabajo de campo, clasificados por severidad, con evidencia referenciada, conclusión de la condición, criterio infringido, causa raíz, impacto potencial y recomendación.

**Estructura de cada hallazgo:**

| Campo | Descripción |
|-------|-------------|
| **Código** | Formato: H-[Carpeta]-[Número] (ej. H-IAM-001) |
| **Título** | Descripción concisa de la brecha de control |
| **Severidad** | Crítico / Alto / Moderado / Bajo (ver tabla de criterios) |
| **Condición** | Lo que el auditor encontró (estado actual) |
| **Criterio** | Qué debería ser según la norma o política (estándar incumplido) |
| **Causa** | Por qué existe la brecha (falla de diseño, implementación u operación) |
| **Impacto** | Consecuencia potencial si la brecha no se corrige |
| **Evidencia** | Referencia a papeles de trabajo de soporte (código PT) |
| **Recomendación** | Acción correctiva específica, medible y con plazo sugerido |
| **Comentario de la gerencia** | Respuesta formal de la administración auditada |
| **Plan de acción** | Responsable + fecha comprometida de remediación |

**Tabla de severidad de hallazgos:**

| Severidad | Criterio | Plazo de Remediación |
|-----------|----------|---------------------|
| **Crítico** | Exposición inmediata a pérdida financiera, violación regulatoria grave, o compromiso de datos masivo | Inmediato (≤15 días) |
| **Alto** | Debilidad significativa con potencial impacto material en confidencialidad, integridad o disponibilidad | ≤45 días |
| **Moderado** | Brecha de control con impacto limitado; cumplimiento parcial de norma | ≤90 días |
| **Bajo** | Oportunidad de mejora; riesgo residual aceptable | ≤180 días |

---

### D-02 — MATRIZ DE RIESGO RESIDUAL — SEGURIDAD TI

**Carpeta:** D — Hallazgos e Informe  
**Clasificación:** SMART  
**Referencias normativas:** ISO 27001:2022 Cláusula 6.1; COBIT APO12; NIST CSF GV.RM

**Objetivo:** Presentar la postura de riesgo residual de seguridad TI de la entidad, considerando los controles existentes y las brechas identificadas, para informar las decisiones de la alta dirección.

**Estructura de la Matriz de Riesgo Residual:**

| ID Riesgo | Amenaza | Activo Impactado | Prob. | Impacto | Riesgo Inherente | Control Existente | Efectividad Control | Riesgo Residual | Hallazgo Asociado |
|-----------|---------|-----------------|-------|---------|-----------------|-------------------|--------------------|-----------------|--------------------|
| RSI-001 | Acceso no autorizado mediante credenciales comprometidas | Sistemas core/aplicaciones críticas | Alta | Alto | Crítico | MFA, revisión de accesos | Parcial | Alto | H-IAM-003 |
| RSI-002 | Explotación de vulnerabilidad no parcheada | Servidores de aplicaciones web | Media | Alto | Alto | Gestión de parches mensual | Parcial | Moderado | H-VULN-001 |
| RSI-003 | Ransomware por falta de segmentación de red | Infraestructura completa | Media | Crítico | Crítico | Antimalware, backups | Parcial | Alto | H-VULN-002 |
| RSI-004 | Incumplimiento regulatorio NRP-32 por falta de 3FA | Canales digitales | Alta | Alto | Crítico | Contraseña + OTP | Parcial | Alto | H-IAM-003 |

---

### D-03 — INFORME DE AUDITORÍA DE SEGURIDAD TI

**Carpeta:** D — Hallazgos e Informe  
**Clasificación:** MASTER  
**Referencias normativas:** IIA IPPF 2400-2450; ISACA IS Audit Standards 1401-1402

**Objetivo:** Comunicar formalmente los resultados de la auditoría de seguridad TI a la alta dirección y al Directorio, con una opinión de auditoría clara y hallazgos con recomendaciones priorizadas.

**Estructura del Informe:**

```
1. INFORMACIÓN GENERAL
   1.1 Destinatarios
   1.2 Período auditado
   1.3 Equipo auditor
   1.4 Fecha de emisión

2. OPINIÓN DE AUDITORÍA
   [Satisfactorio / Con observaciones / Deficiente]

3. ALCANCE Y LIMITACIONES

4. RESUMEN EJECUTIVO
   4.1 Hallazgos críticos y altos (tabla resumen)
   4.2 Nivel de cumplimiento normativo por estándar
   4.3 Nivel de madurez COBIT vs. período anterior

5. HALLAZGOS DETALLADOS
   [Sección por cada hallazgo D-01]

6. CONCLUSIONES

7. RECOMENDACIONES PRIORITARIAS

8. PLAN DE ACCIÓN ACORDADO

9. FIRMAS
   - Auditor Líder / Director de Auditoría
   - Gerente de TI / CISO
   - Representante de la Dirección
```

---

### D-04 — PLAN DE ACCIÓN CORRECTIVA Y SEGUIMIENTO

**Carpeta:** D — Hallazgos e Informe  
**Clasificación:** STANDARD  
**Referencias normativas:** IIA IPPF 2500; ISO 27001:2022 Cláusula 10.1; COBIT MEA02

**Objetivo:** Documentar el plan de acción correctiva acordado con la administración auditada para remediar los hallazgos identificados, con responsables, plazos y mecanismos de seguimiento.

**Estructura del Plan de Acción:**

| Código Hallazgo | Severidad | Acción Correctiva | Responsable | Fecha Compromiso | Estado | Evidencia de Cierre |
|----------------|-----------|------------------|-------------|-----------------|--------|---------------------|
| H-IAM-001 | Crítico | Implementar revisión trimestral de accesos privilegiados con herramienta PAM | CISO | DD/MM/AAAA | Pendiente | — |
| H-VULN-001 | Alto | Establecer SLAs formales de remediación de vulnerabilidades y tablero de seguimiento | Gerente TI | DD/MM/AAAA | En Progreso | — |

**Frecuencia de seguimiento:** Hallazgos críticos: seguimiento mensual; altos: bimestral; moderados: trimestral; bajos: semestral.

---

## SECCIÓN 5 — CLASIFICACIÓN DE PAPELES: SMART / MASTER / STANDARD {#sección-5}

### 5.1 Definición de Tipos de Papel de Trabajo

En AuditMind, cada papel de trabajo recibe una clasificación que define su rol en el expediente de auditoría, el nivel de analítica de IA aplicable y los flujos de aprobación requeridos:

| Tipo | Descripción | Características | Flujo de Aprobación |
|------|-------------|-----------------|---------------------|
| **SMART** | Papel con lógica analítica inteligente, scoring automático, alertas dinámicas y capacidad de actualización en tiempo real mediante datos del sistema auditado | - Motor de scoring integrado - Semáforos de riesgo automáticos - Vinculación dinámica a hallazgos - Actualización por ingesta de datos (CSV, API) | Auditor → Gerente → Director |
| **MASTER** | Papel estratégico que consolida y estructura el trabajo completo; constituye la columna vertebral del expediente de auditoría; genera los documentos de comunicación formal | - Referenciado por múltiples papeles - Genera el informe final - Aprobación obligatoria del Director de Auditoría - Control de versiones estricto | Auditor → Gerente → Director → Archivo |
| **STANDARD** | Papel de procedimiento estándar con estructura fija; recopila evidencia específica mediante listas de verificación, muestras y pruebas definidas | - Estructura predefinida - Referencia a papeles MASTER - Sin lógica de scoring automático - Aprobación por Gerente | Auditor → Gerente |

---

### 5.2 Clasificación Completa de los 25 Papeles de Trabajo

| Código | Nombre del Papel | Tipo | Carpeta | Prioridad |
|--------|-----------------|------|---------|-----------|
| A-01 | Memorándum de Planificación de la Auditoría de Seguridad TI | MASTER | A | Alta |
| A-02 | Evaluación del Contexto Organizacional y Partes Interesadas | STANDARD | A | Alta |
| A-03 | Análisis de Riesgo de Auditoría — Seguridad TI | SMART | A | Alta |
| A-04 | Revisión del Marco Normativo Interno del SGSI | STANDARD | A | Alta |
| A-05 | Evaluación del Gobierno de Seguridad de la Información | SMART | A | Alta |
| A-06 | Plan de Muestreo y Procedimientos de Auditoría | MASTER | A | Alta |
| B-IAM-01 | Evaluación del Marco de Control de Accesos | SMART | B-IAM | Crítica |
| B-IAM-02 | Revisión de Cuentas Privilegiadas y PAM | SMART | B-IAM | Crítica |
| B-IAM-03 | Pruebas de Autenticación Multifactor (MFA/3FA) | STANDARD | B-IAM | Crítica |
| B-IAM-04 | Revisión del Ciclo de Vida de Cuentas (Onboarding/Offboarding) | STANDARD | B-IAM | Alta |
| B-VULN-01 | Evaluación del Programa de Gestión de Vulnerabilidades | SMART | B-VULN | Crítica |
| B-VULN-02 | Pruebas de Gestión de Parches y Configuración Segura | STANDARD | B-VULN | Alta |
| B-CRYPT-01 | Revisión de Controles Criptográficos y Gestión de Certificados | SMART | B-CRYPT | Alta |
| B-INC-01 | Evaluación del Proceso de Gestión de Incidentes | SMART | B-INC | Crítica |
| B-INC-02 | Pruebas de Capacidad de Detección y Respuesta (SOC/SIEM) | STANDARD | B-INC | Alta |
| B-PENTEST-01 | Revisión del Programa de Pruebas de Penetración | SMART | B-PENTEST | Alta |
| B-BCP-01 | Evaluación del Plan de Continuidad del Negocio (BCP/PCN) | SMART | B-BCP | Alta |
| B-BCP-02 | Prueba del Plan de Recuperación ante Desastres (DRP/PRD) | STANDARD | B-BCP | Alta |
| C-NRP-01 | Cuestionario de Cumplimiento NRP-23 BCR | MASTER | C-NRP | Crítica |
| C-NRP-02 | Cuestionario de Cumplimiento NRP-32 SSF | MASTER | C-NRP | Crítica |
| C-CIBER-01 | Evaluación de Cumplimiento Ley de Ciberseguridad D.L. 143/2024 | MASTER | C-CIBER | Crítica |
| C-COBIT-01 | Evaluación de Madurez COBIT 2019 — Seguridad TI | SMART | C-COBIT | Alta |
| D-01 | Cédula Consolidada de Hallazgos de Seguridad TI | MASTER | D | Crítica |
| D-02 | Matriz de Riesgo Residual — Seguridad TI | SMART | D | Alta |
| D-03 | Informe de Auditoría de Seguridad TI | MASTER | D | Crítica |
| D-04 | Plan de Acción Correctiva y Seguimiento | STANDARD | D | Alta |

**Total: 26 papeles de trabajo** — 7 MASTER | 10 SMART | 9 STANDARD

---

### 5.3 Diagrama de Dependencias entre Papeles

```
A-01 (MASTER — Planificación)
    └─ alimenta ──► A-02, A-03, A-04, A-05, A-06

A-03 (SMART — Riesgo)
    └─ define alcance de ──► B-IAM-01/02/03/04, B-VULN-01/02,
                              B-CRYPT-01, B-INC-01/02,
                              B-PENTEST-01, B-BCP-01/02

B-IAM-01, B-VULN-01, B-CRYPT-01, B-INC-01, B-PENTEST-01, B-BCP-01 (SMART)
    └─ generan hallazgos ──► D-01

C-NRP-01, C-NRP-02, C-CIBER-01, C-COBIT-01 (MASTER/SMART)
    └─ generan hallazgos normativos ──► D-01

D-01 (MASTER — Hallazgos)
    └─ alimenta ──► D-02 (Matriz Riesgo), D-03 (Informe)

D-03 (MASTER — Informe)
    └─ genera ──► D-04 (Plan de Acción)
```

---

## SECCIÓN 6 — MATRIZ DE CRUCE NORMATIVO {#sección-6}

La siguiente matriz muestra la cobertura de cada papel de trabajo sobre los principales controles y artículos de los estándares aplicables:

| Papel de Trabajo | ISO 27001:2022 | COBIT 2019 | NIST CSF 2.0 | NRP-23 BCR | NRP-32 SSF | D.L. 143/2024 |
|-----------------|---------------|------------|--------------|------------|------------|---------------|
| A-01 | Cl. 9.2 | MEA01 | GV.OV | Art. 40 | Art. 22 | Art. 19 |
| A-02 | Cl. 4.1-4.3 | EDM01 | GV.OC | Art. 2-3 | Art. 2 | Art. 2-5 |
| A-03 | Cl. 6.1.2 | APO12 | ID.RA; GV.RM | Art. 12-18 | Art. 5 | Art. 18 |
| A-04 | A.5.1, A.5.36 | APO01 | GV.PO | Art. 4-8 | Art. 3 | Art. 19 |
| A-05 | Cl. 5.1, 5.3 | EDM01, APO13 | GV.RR | Art. 3-5 | Art. 4 | Art. 15-25 |
| A-06 | Cl. 9.2 | MEA01 | GV.OV | Art. 40 | — | — |
| B-IAM-01 | A.5.15-A.5.18, A.8.2-A.8.5 | APO13, DSS05 | PR.AA | Art. 19-22 | Art. 7-10 | Art. 30 |
| B-IAM-02 | A.8.2, A.8.18 | DSS05 | PR.AA-05 | Art. 22 | Art. 8 | — |
| B-IAM-03 | A.8.5 | DSS05 | PR.AA-02 | Art. 21 | Art. 7-9 | Art. 30 |
| B-IAM-04 | A.6.5, A.5.18 | APO07 | PR.AA-05 | Art. 21 | Art. 7 | — |
| B-VULN-01 | A.8.8, A.8.7, A.8.9 | BAI10, DSS05 | ID.RA, PR.PS | Art. 25-27 | Art. 14 | Art. 32 |
| B-VULN-02 | A.8.8, A.8.9, A.8.19 | BAI06, BAI10 | PR.PS-01/02 | Art. 26 | Art. 14 | — |
| B-CRYPT-01 | A.8.24 | APO13, DSS05 | PR.DS-01/02 | Art. 20 | Art. 16 | Art. 30 |
| B-INC-01 | A.5.24-A.5.27 | DSS02 | RS.MA, RS.AN | Art. 28-32 | Art. 17 | Art. 28 |
| B-INC-02 | A.8.15, A.8.16, A.8.17 | DSS05 | DE.CM | Art. 29 | Art. 12 | Art. 28 |
| B-PENTEST-01 | A.8.29, A.8.34 | DSS05 | ID.RA-05 | Art. 33 | Art. 14 | Art. 32 |
| B-BCP-01 | A.5.29, A.5.30 | DSS04, BAI04 | RC.RP | Art. 35-38 | Art. 18-20 | Art. 22 |
| B-BCP-02 | A.5.30, A.8.13, A.8.14 | DSS04, BAI04 | RC.RP | Art. 38-40 | Art. 20 | — |
| C-NRP-01 | Múltiple Anexo A | APO12, APO13 | Múltiple | **Completa** | — | — |
| C-NRP-02 | A.8.5, A.8.8, A.8.24 | DSS05 | PR.AA, DE.CM | — | **Completa** | — |
| C-CIBER-01 | Cl. 9.1; A.5.24 | MEA03 | GV.OC | — | — | **Completa** |
| C-COBIT-01 | Cl. 9.1 | **Completo** | GV | Art. 40 | Art. 22 | Art. 19 |
| D-01 | Cl. 9.2 | MEA02 | RS.CO | Art. 41 | Art. 21 | Art. 28 |
| D-02 | Cl. 6.1 | APO12 | GV.RM | Art. 12 | Art. 5 | Art. 18 |
| D-03 | Cl. 9.2 | MEA01/02 | RS.CO | Art. 41 | Art. 22 | Art. 35 |
| D-04 | Cl. 10.1 | MEA02 | RC.RP | Art. 42 | Art. 22 | Art. 36 |

---

## SECCIÓN 7 — GLOSARIO TÉCNICO {#sección-7}

| Término | Definición |
|---------|-----------|
| **ACE** | Agencia de Ciberseguridad del Estado — ente autónomo rector de ciberseguridad en El Salvador, creado por D.L. 143/2024 |
| **BCP/PCN** | Plan de Continuidad del Negocio / Plan de Continuidad del Negocio — documentación para garantizar la continuidad de operaciones críticas ante interrupciones |
| **CIA** | Confidencialidad, Integridad y Disponibilidad — tríada fundamental de la seguridad de la información |
| **CISO** | Chief Information Security Officer — máximo responsable de la seguridad de la información en una organización |
| **COBIT** | Control Objectives for Information and Related Technologies — marco de gobierno y gestión de TI de ISACA |
| **CSIRT** | Computer Security Incident Response Team — equipo de respuesta a incidentes de ciberseguridad |
| **CVSS** | Common Vulnerability Scoring System — sistema estándar para clasificar la severidad de vulnerabilidades |
| **DLP** | Data Loss Prevention — tecnología para prevenir la fuga no autorizada de información sensible |
| **DRP/PRD** | Plan de Recuperación ante Desastres — procedimientos para restaurar sistemas TI críticos tras una interrupción grave |
| **EDR** | Endpoint Detection and Response — herramienta de detección y respuesta en dispositivos endpoint |
| **EOL/EOS** | End of Life / End of Support — fin del soporte oficial del fabricante para un producto tecnológico |
| **HSM** | Hardware Security Module — dispositivo físico para gestión segura de claves criptográficas |
| **IAM** | Identity and Access Management — gestión de identidades y control de accesos |
| **IDS/IPS** | Intrusion Detection System / Intrusion Prevention System — sistemas de detección/prevención de intrusiones |
| **MDM** | Mobile Device Management — gestión centralizada de dispositivos móviles corporativos |
| **MTTD** | Mean Time To Detect — tiempo medio para detectar un incidente de seguridad |
| **MTTR** | Mean Time To Respond/Remediate — tiempo medio para responder o remediar un incidente |
| **MFA/3FA** | Multi-Factor Authentication / Three-Factor Authentication — autenticación de múltiples factores |
| **NIST CSF** | National Institute of Standards and Technology Cybersecurity Framework — marco de ciberseguridad del NIST |
| **NRP** | Norma de Regulación Prudencial — instrumentos normativos del sistema financiero salvadoreño |
| **PAM** | Privileged Access Management — gestión de accesos privilegiados |
| **PKI** | Public Key Infrastructure — infraestructura de clave pública para gestión de certificados digitales |
| **RPO** | Recovery Point Objective — punto de recuperación objetivo; máxima pérdida de datos aceptable |
| **RTO** | Recovery Time Objective — tiempo de recuperación objetivo; máximo tiempo de interrupción aceptable |
| **SGSI** | Sistema de Gestión de Seguridad de la Información — conjunto de políticas, procesos y controles para gestionar la seguridad de la información |
| **SIEM** | Security Information and Event Management — plataforma de gestión de eventos e información de seguridad |
| **SOC** | Security Operations Center — centro de operaciones de seguridad |
| **SoA** | Statement of Applicability — declaración de aplicabilidad; documento que justifica la inclusión/exclusión de controles ISO 27001 |
| **SoD** | Segregation of Duties — segregación de funciones para prevenir fraude y errores |
| **SSF** | Superintendencia del Sistema Financiero — organismo supervisor del sistema financiero de El Salvador |
| **TLS** | Transport Layer Security — protocolo criptográfico para comunicaciones seguras en red |

---

## REFERENCIAS Y FUENTES

| Estándar/Normativa | Emisor | Versión/Fecha |
|-------------------|--------|---------------|
| ISO/IEC 27001 — Sistemas de Gestión de Seguridad de la Información | ISO/IEC | 2022 |
| ISO/IEC 27002 — Controles de Seguridad de la Información | ISO/IEC | 2022 |
| ISO/IEC 27005 — Gestión del Riesgo de Seguridad de la Información | ISO/IEC | 2022 |
| COBIT 2019 — Framework for the Governance and Management of Enterprise IT | ISACA | 2019 |
| NIST Cybersecurity Framework (CSF) 2.0 | NIST | Febrero 2024 |
| NRP-23 — Normas Técnicas para la Gestión de la Seguridad de la Información | BCR El Salvador | Vigente 01/07/2020 |
| NRP-32 — Normas Técnicas sobre Medidas de Ciberseguridad en Canales Digitales | SSF El Salvador | Vigente 08/03/2022; mod. 30/12/2022 |
| Decreto Legislativo N° 143 — Ley de Ciberseguridad y Seguridad de la Información | Asamblea Legislativa El Salvador | Vigente 23/11/2024 |
| NIST SP 800-115 — Technical Guide to Information Security Testing and Assessment | NIST | 2008 (vigente) |
| OWASP Web Security Testing Guide (WSTG) | OWASP | v4.2, 2021 |
| IIA International Professional Practices Framework (IPPF) | The IIA | 2024 |

---

*Documento generado para uso interno de AuditMind Intelligence Platform.*  
*Prohibida su reproducción parcial o total sin autorización expresa.*  
*© 2026 AuditMind — Todos los derechos reservados.*
