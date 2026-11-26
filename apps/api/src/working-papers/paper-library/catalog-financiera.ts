/**
 * Biblioteca — Auditoría financiera (marco NIA). Lote 1.
 * Solo se cita la NIA/NIC por número; sin numeración de párrafos ni normas locales (ver REGLA DE CONTENIDO en paper-library.ts).
 */
import { PaperLibrary, entry } from './paper-library';

const R = '2026-11';

export const CATALOG_FINANCIERA: PaperLibrary = Object.fromEntries([
  // ─── Partes relacionadas ────────────────────────────────────────────────────
  entry('PT-NIA550', R, [
    {
      title: 'Indagar sobre partes relacionadas con la administración y el gobierno',
      statement: 'Indagar con la administración y los responsables del gobierno corporativo sobre la identidad de las partes relacionadas, la naturaleza de las relaciones, las transacciones del período y los controles para identificarlas.',
      development: 'Se realizó indagación con [completar: nombres y cargos] el [completar: fecha] sobre la identidad de las partes relacionadas, la naturaleza de cada relación y el tipo y propósito de las transacciones del período. Se consultó además por los controles para identificar, autorizar y registrar estas transacciones. Las respuestas constan en [completar: referencia] y se contrastaron con los registros de la entidad: [completar: resultado].',
      technique: 'Indagación', ref: 'NIA 550', priority: 'HIGH',
    },
    {
      title: 'Contrastar la lista de partes relacionadas con registros independientes',
      statement: 'Contrastar la lista de partes relacionadas de la administración con el libro de accionistas, las actas, las confirmaciones bancarias, las declaraciones tributarias y los mayores, para detectar relaciones no informadas.',
      development: 'Se comparó la lista de partes relacionadas proporcionada por la administración con [completar: fuentes revisadas: libro de accionistas, actas, confirmaciones bancarias, declaraciones, mayores]. Se identificaron [completar: cantidad] partes o transacciones no incluidas en la lista, detalladas en [completar: referencia]. La administración [completar: reconoció / no reconoció] las diferencias al confrontarlas.',
      technique: 'Inspección', ref: 'NIA 550', priority: 'HIGH',
    },
    {
      title: 'Evaluar transacciones significativas fuera del curso normal del negocio',
      statement: 'Para cada transacción significativa fuera del curso normal, entender el racional comercial, evaluar los términos y la aprobación, y compararlos con la explicación dada por la administración.',
      development: 'Para la transacción [completar: descripción] con [completar: parte relacionada] se obtuvo el entendimiento del racional comercial mediante [completar: indagación / documentos]. Se evaluó si los términos y la aprobación [completar: órgano y fecha] son consistentes con la explicación de la administración y con condiciones de mercado. Conclusión: [completar: conclusión y señales de fraude, si las hubo].',
      technique: 'Inspección', ref: 'NIA 550', priority: 'HIGH',
    },
    {
      title: 'Verificar una selección de transacciones con partes relacionadas contra soporte',
      statement: 'Inspeccionar contratos, facturas y pagos de una selección de transacciones con partes relacionadas y recalcular los saldos pendientes con sus condiciones de pago.',
      development: 'Se seleccionaron [completar: criterio y cantidad] transacciones con partes relacionadas. Para cada una se inspeccionaron [completar: contratos, facturas, comprobantes de pago] y se recalculó el saldo pendiente al cierre con sus condiciones. Las diferencias entre los registros y la verificación del auditor se detallan en [completar: referencia]: [completar: resultado].',
      technique: 'Inspección', ref: 'NIA 550', priority: 'MEDIUM',
    },
    {
      title: 'Evaluar la revelación de partes relacionadas en los estados financieros',
      statement: 'Comparar las notas a los estados financieros con los requerimientos de revelación de la NIC 24: relación, importes de las transacciones, saldos pendientes, términos y garantías.',
      development: 'Se comparó la nota [completar: número] de los estados financieros con los requerimientos de la NIC 24: naturaleza de la relación, importe de las transacciones por tipo, saldos pendientes con sus términos y garantías. Se identificaron [completar: omisiones o inconsistencias, o ninguna]. Conclusión sobre la adecuación de la revelación: [completar: conclusión].',
      technique: 'Inspección', ref: 'NIA 550 / NIC 24', priority: 'MEDIUM',
    },
  ]),

  // ─── Negocio en marcha ──────────────────────────────────────────────────────
  entry('PT-NIA570', R, [
    {
      title: 'Evaluar la valoración de negocio en marcha realizada por la administración',
      statement: 'Evaluar el proceso, los supuestos y el período cubierto por la valoración de la administración, que debe abarcar al menos doce meses desde la fecha de los estados financieros, e indagar sobre lo posterior a ese período.',
      development: 'La administración [completar: realizó / no realizó] una valoración formal de la capacidad de continuar como negocio en marcha, que cubre [completar: período]. Se evaluó el proceso seguido, los supuestos utilizados y su consistencia con el resto de la evidencia. Para el período posterior a la valoración se indagó con [completar: persona] sobre hechos o condiciones conocidos: [completar: resultado].',
      technique: 'Indagación', ref: 'NIA 570', priority: 'HIGH',
    },
    {
      title: 'Identificar eventos o condiciones que generen duda significativa',
      statement: 'Identificar indicadores financieros (pérdidas recurrentes, patrimonio negativo, incumplimiento de convenios), operativos y de otro tipo que puedan generar duda significativa sobre la continuidad de la entidad.',
      development: 'Se analizaron indicadores financieros, operativos y de otro tipo a partir de [completar: fuentes: estados financieros, flujos, actas, correspondencia]. Los indicadores identificados son: [completar: lista o ninguno]. Para cada uno se evaluó si existe un plan de la administración que lo mitigue: [completar: resultado].',
      technique: 'Analítico', ref: 'NIA 570', priority: 'HIGH',
    },
    {
      title: 'Analizar el flujo de caja proyectado y sus supuestos',
      statement: 'Analizar el flujo de caja proyectado y los supuestos clave de la administración, comparándolos con resultados históricos y con evidencia externa, y evaluar la fiabilidad de los datos de base.',
      development: 'Se obtuvo el flujo de caja proyectado para [completar: período] y se identificaron los supuestos clave: [completar: supuestos]. Se compararon con los resultados históricos y con [completar: evidencia externa o contratos], y se evaluó la fiabilidad de los datos de base. Los supuestos que no se consideraron razonables son: [completar: lista o ninguno].',
      technique: 'Analítico', ref: 'NIA 570', priority: 'HIGH',
    },
    {
      title: 'Revisar financiamiento, convenios y apoyo de terceros',
      statement: 'Revisar los contratos de deuda, el cumplimiento de convenios, las líneas de crédito vigentes y las cartas de apoyo de terceros o accionistas, y evaluar su capacidad para respaldar los planes de la administración.',
      development: 'Se revisaron los contratos de financiamiento con [completar: acreedores], el cumplimiento de los convenios al [completar: fecha] y las líneas de crédito vigentes. Las cartas de apoyo de [completar: tercero o accionista] se evaluaron en cuanto a la capacidad financiera de quien las emite y su carácter vinculante: [completar: resultado].',
      technique: 'Inspección', ref: 'NIA 570', priority: 'MEDIUM',
    },
    {
      title: 'Evaluar la adecuación de la revelación sobre negocio en marcha',
      statement: 'Evaluar si los estados financieros revelan los eventos o condiciones principales, los planes de la administración y la existencia de una incertidumbre material, conforme a la NIC 1.',
      development: 'Se evaluó si la nota [completar: número] revela los principales eventos o condiciones, los planes de la administración y, cuando corresponde, la incertidumbre material relacionada con la continuidad. Resultado de la comparación con la NIC 1: [completar: adecuada / insuficiente, y por qué]. Efecto en el informe: [completar: conclusión].',
      technique: 'Inspección', ref: 'NIA 570 / NIC 1', priority: 'MEDIUM',
    },
  ]),

  // ─── Hechos posteriores ─────────────────────────────────────────────────────
  entry('PT-NIA560', R, [
    {
      title: 'Leer las actas posteriores al cierre hasta la fecha del informe',
      statement: 'Leer las actas de junta directiva y de asamblea de accionistas desde la fecha de cierre hasta la fecha del informe, e identificar acuerdos que puedan afectar los estados financieros.',
      development: 'Se leyeron las actas de [completar: órganos] correspondientes al período del [completar: fecha de cierre] al [completar: fecha del informe]. Los acuerdos con posible efecto en los estados financieros son: [completar: lista o ninguno]. Su tratamiento (ajuste, revelación o ninguno) se documenta en [completar: referencia].',
      technique: 'Inspección', ref: 'NIA 560', priority: 'HIGH',
    },
    {
      title: 'Indagar sobre hechos posteriores con la administración y los asesores legales',
      statement: 'Indagar con la administración y con los asesores legales sobre litigios, reclamaciones, cambios en estimaciones y otros hechos ocurridos después del cierre que puedan afectar los estados financieros.',
      development: 'Se indagó con [completar: persona y cargo] el [completar: fecha] sobre hechos posteriores al cierre: litigios, reclamaciones, cambios en estimaciones, decisiones de financiamiento y transacciones inusuales. También se consultó al asesor legal [completar: nombre]. Hechos comunicados: [completar: lista o ninguno].',
      technique: 'Indagación', ref: 'NIA 560', priority: 'HIGH',
    },
    {
      title: 'Revisar información financiera posterior al cierre',
      statement: 'Revisar los estados financieros intermedios, presupuestos, flujos de caja y la información de gestión posteriores al cierre, e identificar variaciones o eventos relevantes.',
      development: 'Se revisó la información financiera posterior al cierre: [completar: estados intermedios, presupuestos, flujos y reportes de gestión del período]. Las variaciones o eventos inusuales identificados son: [completar: lista o ninguno]. Su efecto potencial sobre los saldos al cierre se evaluó en [completar: referencia].',
      technique: 'Analítico', ref: 'NIA 560', priority: 'MEDIUM',
    },
    {
      title: 'Probar cobros, pagos posteriores y pasivos no registrados',
      statement: 'Examinar los cobros y pagos posteriores al cierre, y buscar pasivos no registrados mediante la revisión de desembolsos, facturas y documentos recibidos después de la fecha de los estados financieros.',
      development: 'Se examinaron los desembolsos y facturas recibidos entre el [completar: fecha de cierre] y el [completar: fecha de la prueba] para identificar pasivos relativos al período auditado no registrados, y los cobros posteriores de saldos relevantes. Partidas identificadas: [completar: detalle o ninguna]. Ajustes propuestos: [completar: monto y cuenta].',
      technique: 'Inspección', ref: 'NIA 560', priority: 'HIGH',
    },
    {
      title: 'Clasificar los hechos posteriores y evaluar su ajuste o revelación',
      statement: 'Clasificar cada hecho posterior como ajustable (evidencia condiciones existentes al cierre) o de solo revelación, y evaluar su efecto en los estados financieros y en el informe del auditor.',
      development: 'Cada hecho posterior identificado se clasificó así: [completar: hecho — ajustable / solo revelación — justificación]. Para los ajustables se evaluó el efecto sobre los saldos al cierre y su registro por la administración; para los de revelación, la adecuación de la nota. Efecto en el informe del auditor: [completar: conclusión].',
      technique: 'Inspección', ref: 'NIA 560', priority: 'MEDIUM',
    },
  ]),

  // ─── Circularización de cuentas por cobrar ──────────────────────────────────
  entry('PT-CIRC', R, [
    {
      title: 'Definir la selección de saldos a confirmar',
      statement: 'Definir la selección de saldos a circularizar: todos los que superen la materialidad de ejecución y una muestra del resto, justificando por qué la muestra es representativa de la población.',
      development: 'Se determinó la población de cuentas por cobrar de [completar: monto total del mayor] y se estratificó por monto. Se seleccionó el [completar: porcentaje] de los saldos que superan la materialidad de ejecución y una muestra del resto mediante [completar: método de selección]. La cobertura del saldo total es [completar: porcentaje]; la justificación de la representatividad consta en [completar: referencia].',
      technique: 'Confirmación', ref: 'NIA 505 / NIA 530', priority: 'HIGH',
    },
    {
      title: 'Mantener el control del envío y la recepción de las confirmaciones',
      statement: 'Mantener el control de todo el proceso: validar de forma independiente los nombres y direcciones, enviar las solicitudes directamente y recibir las respuestas sin intervención de la entidad.',
      development: 'Las solicitudes se prepararon con la información de [completar: fuente], se validaron los nombres y las direcciones de manera independiente y se enviaron directamente por el equipo de auditoría el [completar: fecha]. Las respuestas se recibieron [completar: medio] sin pasar por la entidad. Se controló el envío y la recepción en [completar: referencia].',
      technique: 'Confirmación', ref: 'NIA 505', priority: 'HIGH',
    },
    {
      title: 'Dar seguimiento a las no respuestas con procedimientos alternativos',
      statement: 'Para las confirmaciones sin respuesta, hacer una segunda solicitud y aplicar procedimientos alternativos: cobros posteriores, facturas, documentos de despacho y contratos o pedidos.',
      development: 'Para las [completar: cantidad] confirmaciones sin respuesta se realizó una segunda solicitud el [completar: fecha]. Persistiendo la falta de respuesta se aplicaron procedimientos alternativos: [completar: cobros posteriores, inspección de facturas, documentos de despacho, contratos]. Resultado: [completar: saldos soportados / no soportados y su tratamiento].',
      technique: 'Inspección', ref: 'NIA 505', priority: 'HIGH',
    },
    {
      title: 'Investigar las diferencias entre el saldo confirmado y el saldo en libros',
      statement: 'Investigar cada diferencia reportada por los deudores, determinar su causa (partidas en tránsito, errores, disputas, posible fraude) y evaluar el efecto sobre el saldo y la proyección de errores.',
      development: 'Se investigaron las [completar: cantidad] diferencias reportadas, comparando los registros de la entidad con la respuesta del deudor. Las causas identificadas son: [completar: partidas en tránsito, errores, disputas u otras]. Diferencias que constituyen error: [completar: detalle]; su efecto proyectado y el ajuste propuesto constan en [completar: referencia].',
      technique: 'Inspección', ref: 'NIA 505', priority: 'MEDIUM',
    },
    {
      title: 'Evaluar la antigüedad de saldos y la estimación de incobrables',
      statement: 'Analizar la antigüedad de la cartera, comparar la política de provisión de la entidad con su práctica y con los cobros posteriores, y evaluar la razonabilidad de la estimación de incobrables.',
      development: 'Se analizó la antigüedad de la cartera al [completar: fecha] y se comparó la política de provisión de la entidad con la práctica observada, los cobros posteriores y el historial de castigos. La estimación registrada es [completar: monto] frente a la estimación del auditor de [completar: monto]. Conclusión sobre su razonabilidad: [completar: conclusión].',
      technique: 'Analítico', ref: 'NIA 540', priority: 'MEDIUM',
    },
  ]),

  // ─── Estimaciones contables ─────────────────────────────────────────────────
  entry('PT-FIN-C-ESTIM', R, [
    {
      title: 'Identificar las estimaciones significativas y evaluar su riesgo de incorrección',
      statement: 'Identificar las estimaciones contables significativas y evaluar el riesgo de incorrección material según su grado de incertidumbre, complejidad y subjetividad.',
      development: 'Se identificaron las siguientes estimaciones significativas: [completar: provisión de incobrables, deterioro, valor razonable, contingencias, otras]. Para cada una se evaluó el grado de incertidumbre, complejidad y subjetividad, y si existe un riesgo significativo: [completar: evaluación]. Las estimaciones nuevas o cuyo método cambió respecto al período anterior son: [completar: lista].',
      technique: 'Analítico', ref: 'NIA 540', priority: 'HIGH',
    },
    {
      title: 'Evaluar el método, los datos y los supuestos de la administración',
      statement: 'Evaluar si el método de estimación, los datos y los supuestos de la administración son adecuados, consistentes con el marco de información financiera y aplicados de forma uniforme respecto de períodos anteriores.',
      development: 'Para la estimación de [completar: estimación] se evaluó la adecuación del método frente al marco de información financiera, la relevancia y fiabilidad de los datos y la razonabilidad de los supuestos. Se comparó con el método y los supuestos del período anterior: [completar: cambios y su justificación]. Observaciones: [completar: resultado].',
      technique: 'Inspección', ref: 'NIA 540', priority: 'HIGH',
    },
    {
      title: 'Elaborar una estimación puntual o un rango propio del auditor',
      statement: 'Desarrollar una estimación puntual o un rango propio del auditor y compararlo con la estimación de la administración, evaluando la distancia a los extremos del rango.',
      development: 'Se desarrolló [completar: estimación puntual / rango] con [completar: método y datos propios del auditor]. La estimación de la administración [completar: se ubica dentro / fuera] del rango, a una distancia de [completar: monto] del extremo más cercano. Las diferencias frente al punto más probable se evaluaron contra la materialidad: [completar: resultado].',
      technique: 'Recálculo', ref: 'NIA 540', priority: 'HIGH',
    },
    {
      title: 'Realizar la revisión retrospectiva de las estimaciones del período anterior',
      statement: 'Comparar las estimaciones del período anterior con el resultado real o con su reestimación posterior, como indicio de la precisión del proceso de estimación y de posible sesgo.',
      development: 'Se compararon las estimaciones de [completar: estimaciones del período anterior] con los resultados reales o su reestimación posterior. Las diferencias identificadas son: [completar: detalle]. Se evaluó su relevancia como indicio de la calidad del proceso de estimación y de sesgo de la administración: [completar: conclusión].',
      technique: 'Analítico', ref: 'NIA 540', priority: 'MEDIUM',
    },
    {
      title: 'Evaluar indicios de sesgo de la administración en el conjunto de estimaciones',
      statement: 'Evaluar si las estimaciones individualmente razonables muestran, en conjunto, un patrón de sesgo, considerando su dirección respecto del rango del auditor y su efecto en el resultado.',
      development: 'Se evaluó la dirección de las estimaciones respecto de los rangos del auditor: [completar: cuántas conservadoras y cuántas agresivas]. El efecto acumulado en el resultado del período es [completar: monto y dirección]. Conclusión sobre la existencia de sesgo y su efecto en la opinión: [completar: conclusión].',
      technique: 'Analítico', ref: 'NIA 540', priority: 'MEDIUM',
    },
  ]),

  // ─── Cumplimiento de leyes y regulaciones ───────────────────────────────────
  entry('PT-NIA250', R, [
    {
      title: 'Entender el marco legal aplicable y clasificar las disposiciones por su efecto',
      statement: 'Obtener un entendimiento del marco legal y regulatorio aplicable a la entidad y clasificar las disposiciones según tengan efecto directo en los importes de los estados financieros o solo operativo.',
      development: 'Se obtuvo el entendimiento del marco legal y regulatorio aplicable a [completar: entidad y sector] mediante [completar: indagación, experiencia previa, documentos]. Las disposiciones se clasificaron así: [completar: leyes con efecto directo en los estados financieros / leyes operativas]. El detalle consta en [completar: referencia].',
      technique: 'Indagación', ref: 'NIA 250', priority: 'HIGH',
    },
    {
      title: 'Indagar sobre el cumplimiento con la dirección y los responsables del gobierno',
      statement: 'Indagar con la dirección y con los responsables del gobierno sobre las políticas de cumplimiento, las notificaciones recibidas de las autoridades, los litigios y los incumplimientos conocidos o sospechados.',
      development: 'Se indagó con [completar: persona y cargo] el [completar: fecha] sobre las políticas y procedimientos de cumplimiento, las notificaciones o resoluciones recibidas de autoridades durante el período, los litigios en curso y los incumplimientos conocidos o sospechados. Respuestas: [completar: resumen y evaluación del auditor].',
      technique: 'Indagación', ref: 'NIA 250', priority: 'HIGH',
    },
    {
      title: 'Inspeccionar la correspondencia con autoridades y las actas',
      statement: 'Inspeccionar la correspondencia con las autoridades reguladoras y tributarias, las actas de los órganos de gobierno y los documentos de multas, sanciones o procesos abiertos durante el período.',
      development: 'Se inspeccionó la correspondencia con [completar: autoridades] y las actas de [completar: órganos] del período [completar: fechas]. Se identificaron [completar: cantidad] documentos relacionados con multas, sanciones, inspecciones o procesos abiertos: [completar: detalle o ninguno]. Su efecto sobre los estados financieros se evaluó en [completar: referencia].',
      technique: 'Inspección', ref: 'NIA 250', priority: 'MEDIUM',
    },
    {
      title: 'Consultar al asesor legal sobre litigios y contingencias',
      statement: 'Solicitar al asesor legal externo información sobre litigios, reclamaciones y contingencias relacionadas con el incumplimiento de leyes, y evaluar su efecto sobre los estados financieros.',
      development: 'Se envió la solicitud de información a [completar: asesor legal] el [completar: fecha] y se recibió respuesta el [completar: fecha]. Los litigios y contingencias confirmados son: [completar: detalle o ninguno], con una estimación de [completar: monto o rango]. Su tratamiento (provisión o revelación) se evaluó en [completar: referencia].',
      technique: 'Confirmación', ref: 'NIA 250 / NIA 501', priority: 'MEDIUM',
    },
    {
      title: 'Evaluar los incumplimientos identificados y su efecto en los estados financieros',
      statement: 'Evaluar cada incumplimiento identificado o sospechado: su naturaleza, su efecto en los estados financieros, la respuesta de la administración, las comunicaciones requeridas y las consecuencias para el informe.',
      development: 'Para cada incumplimiento identificado se documentó su naturaleza, el período, el importe involucrado y la respuesta de la administración: [completar: matriz de incumplimientos]. Se evaluó su efecto sobre los estados financieros y sobre la integridad de la administración, y se comunicó a [completar: destinatario] el [completar: fecha]. Efecto en el informe del auditor: [completar: conclusión].',
      technique: 'Inspección', ref: 'NIA 250', priority: 'HIGH',
    },
  ]),

  // ─── Controles generales de TI ──────────────────────────────────────────────
  entry('PT-ITGC', R, [
    {
      title: 'Definir los sistemas en alcance y los procesos financieros que soportan',
      statement: 'Identificar los sistemas e infraestructura que soportan los procesos financieros relevantes, las cuentas que alimentan y la justificación de los sistemas incluidos o excluidos del alcance.',
      development: 'Se identificaron los sistemas que soportan los procesos financieros relevantes: [completar: sistema, versión, proveedor y procesos que soporta]. Se determinó su relevancia por las cuentas que afectan: [completar: cuentas]. Quedaron fuera del alcance [completar: sistemas excluidos] por [completar: justificación].',
      technique: 'Indagación', ref: 'NIA 315', priority: 'HIGH',
    },
    {
      title: 'Probar la gestión de accesos lógicos',
      statement: 'Probar con una muestra las altas, bajas y cambios de acceso, la revisión periódica de usuarios, la gestión de usuarios privilegiados y la segregación de funciones en los sistemas en alcance.',
      development: 'Se obtuvo la lista de usuarios de [completar: sistema] y se probó una muestra de [completar: tamaño] altas, bajas y cambios de acceso contra su autorización. Se evaluó la revisión periódica de accesos, los usuarios privilegiados y los conflictos de segregación de funciones. Excepciones: [completar: cantidad y detalle]. Efectividad del control: [completar: conclusión].',
      technique: 'Reejecución', ref: 'NIA 315', priority: 'HIGH',
    },
    {
      title: 'Probar la gestión de cambios a programas y configuraciones',
      statement: 'Probar con una muestra de cambios a los sistemas que cuentan con solicitud, aprobación, pruebas y autorización de paso a producción, y que existe separación entre los ambientes de desarrollo y producción.',
      development: 'Se obtuvo la población de cambios del período y se probó una muestra de [completar: tamaño]. Para cada cambio se verificó la solicitud, la aprobación previa, las pruebas realizadas y la autorización de paso a producción, así como la separación de ambientes. Excepciones: [completar: cantidad y detalle]. Efectividad del control: [completar: conclusión].',
      technique: 'Inspección', ref: 'NIA 315', priority: 'HIGH',
    },
    {
      title: 'Probar las operaciones de TI: respaldos, procesos y manejo de incidentes',
      statement: 'Evaluar el monitoreo de procesos críticos, la ejecución y restauración de respaldos y la gestión de incidentes que puedan afectar la integridad de la información financiera.',
      development: 'Se evaluó el monitoreo de los procesos críticos de [completar: sistema], la ejecución de respaldos durante el período y la evidencia de pruebas de restauración. Se revisó la gestión de incidentes relevantes: [completar: incidentes y su resolución]. Excepciones: [completar: detalle o ninguna]. Conclusión: [completar: efectividad].',
      technique: 'Inspección', ref: 'NIA 315', priority: 'MEDIUM',
    },
    {
      title: 'Evaluar los informes SOC 1 de las organizaciones de servicio',
      statement: 'Cuando se usen organizaciones de servicio, evaluar el informe SOC 1: su tipo, el período cubierto, las excepciones, los controles complementarios del usuario y la cobertura de los controles relevantes.',
      development: 'Para la organización de servicio [completar: nombre] se obtuvo un informe SOC 1 de tipo [completar: I / II] que cubre [completar: período]. Se evaluó la opinión del auditor de servicio, las excepciones, los controles complementarios que debe aplicar la entidad y la cobertura de los controles relevantes. Conclusión sobre la confianza en el informe: [completar: conclusión].',
      technique: 'Inspección', ref: 'NIA 402', priority: 'MEDIUM',
    },
  ]),
]);
