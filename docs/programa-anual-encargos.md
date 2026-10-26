# Programa anual de encargos (modalidad externa)

**Qué es.** Una pantalla informativa que cruza las horas comprometidas en los encargos vivos con la capacidad neta del equipo en un año.
Responde «¿puedo aceptar otro encargo en 2027 con este equipo?». No bloquea ni cambia nada. Ruta: `/dashboard/portfolio/program`
(menú *Horas y Rentabilidad › Programa de Encargos*, gerente o superior). API: `GET /portfolio/engagements/program?year=AAAA`.

**Qué encargos entran.** Borrador y aprobados. Se excluyen los cancelados, los de una auditoría cerrada o cancelada y las investigaciones ajenas al
equipo de quien consulta (la dirección sí las ve).

**A qué año pertenece un encargo** (`engagement-program.util.ts`, `yearShare`):

| Datos del encargo | Año(s) que ocupa |
|---|---|
| Fecha prevista de inicio **y** de fin | Sus días se reparten entre los años que toca; cada año recibe su parte de las horas (un encargo del 17-dic al 15-ene reparte 50 % y 50 %) |
| Una sola fecha | Todo en el año de esa fecha |
| Sin fechas | Auditoría: el año **siguiente** a su ejercicio (se audita 2026 en 2027). Consultoría: el año de su ejercicio |

**De dónde salen las horas** (la primera que exista):
1. Presupuesto del equipo de la auditoría (`AuditTeam.budgetedHours`, por persona). Si la auditoría tiene más horas estimadas que las repartidas, el resto queda *sin asignar a personas*.
2. Horas estimadas de la auditoría (`Audit.estimatedHours`).
3. Horas del equipo propuesto en la propuesta (`Proposal.teamJson`, por rol, no por persona: todas quedan sin asignar).
4. Ninguna: el encargo se lista aparte («Sin horas todavía») para que alguien le ponga horas.

**Capacidad.** Horas netas disponibles del perfil de disponibilidad del año (`UserAvailabilityProfile.netAvailableHours`) de las personas activas.
Quien tiene horas comprometidas pero ningún perfil aparece con «sin perfil» y su capacidad no se suma (se avisa).

**Qué muestra.** Totales (capacidad, comprometidas, sin asignar, holgura, uso, personas sobreasignadas), capacidad por persona (comprometidas, ya
trabajadas en el año y barra de uso: <85 % con holgura, 85–100 % al límite, ≥100 % sobreasignada) y los encargos del año con su socio, fechas y fuente de horas.

**Supuestos a confirmar con el despacho.** (1) Que «el año siguiente al ejercicio» sea la regla por defecto de una auditoría sin fechas. (2) Que las horas
presupuestadas de una auditoría en curso se cuenten completas aunque parte ya se haya trabajado (las trabajadas se muestran aparte para comparar).

**Modelo recomendado por tarea.** Diseño del criterio de año y fuentes de horas: Opus (hecho). Construcción y pantalla: Sonnet. Pruebas sobre el patrón existente: Haiku/Sonnet.
