/**
 * Biblioteca — Auditoría fiscal (El Salvador) y PLD/FT. Lote 1.
 * Solo se cita un artículo local si está en ALLOWED_LEGAL_REFS (verificado contra el RAG FISCAL_SV): Art. 151 CT (pago a cuenta) y
 * Art. 119-E CT (invalidación de DTE). Todo lo demás se describe sin numeración inventada.
 */
import { PaperLibrary, entry } from './paper-library';

const R = '2026-11';

export const CATALOG_FISCAL: PaperLibrary = Object.fromEntries([
  // ─── CAAT: libros de IVA vs declaraciones ───────────────────────────────────
  entry('PT-FISC-CAAT-LIBROSIVA', R, [
    {
      title: 'Conciliar mensualmente el libro de ventas con el débito fiscal declarado',
      statement: 'Comparar para cada mes del ejercicio el total del libro de ventas con el débito fiscal declarado en la declaración de IVA, y explicar las diferencias.',
      development: 'Se comparó, mes a mes, el total del libro de ventas con el débito fiscal de la declaración de IVA (F-07) del ejercicio [completar: año]. Los meses con diferencia son: [completar: meses y montos]. Las diferencias se explicaron por [completar: causa: declaración modificada, documentos no incluidos, errores de registro] o quedan sin explicar: [completar: detalle].',
      technique: 'Recálculo', priority: 'HIGH',
    },
    {
      title: 'Conciliar el libro de compras con el crédito fiscal declarado',
      statement: 'Comparar para cada mes el total del libro de compras con el crédito fiscal declarado, e identificar documentos con crédito deducido que no cumplen los requisitos para su deducción.',
      development: 'Se comparó, mes a mes, el total del libro de compras con el crédito fiscal declarado en el ejercicio [completar: año]. Se examinó una selección de [completar: criterio y cantidad] documentos para verificar los requisitos de deducibilidad del crédito. Diferencias y crédito cuestionado: [completar: detalle y monto estimado].',
      technique: 'Recálculo', priority: 'HIGH',
    },
    {
      title: 'Cruzar los libros de IVA con la contabilidad',
      statement: 'Cruzar los totales anuales de los libros de ventas y compras con las cuentas de ingresos, costos, gastos y las cuentas de IVA del mayor, y explicar las partidas conciliatorias.',
      development: 'Se cruzaron los totales de los libros de ventas y compras con las cuentas [completar: cuentas de ingresos, costos, gastos e IVA] del mayor del ejercicio. Partidas conciliatorias identificadas: [completar: detalle]. Las diferencias sin respaldo se trasladan a la cédula de diferencias: [completar: referencia].',
      technique: 'Analítico', priority: 'MEDIUM',
    },
    {
      title: 'Investigar las diferencias recurrentes y las declaraciones modificadas',
      statement: 'Investigar las diferencias que se repiten entre libros y declaraciones y las declaraciones modificadas del ejercicio, determinando su causa y su efecto sobre el impuesto.',
      development: 'Se identificaron diferencias recurrentes en [completar: meses o conceptos] y declaraciones modificadas en [completar: períodos]. Se indagó con [completar: persona] sobre su causa y se inspeccionó el soporte [completar: documentos]. Efecto estimado sobre el impuesto y contingencia asociada: [completar: monto y conclusión].',
      technique: 'Indagación', priority: 'MEDIUM',
    },
  ]),

  // ─── CAAT: pago a cuenta ────────────────────────────────────────────────────
  entry('PT-FISC-CAAT-PAC', R, [
    {
      title: 'Recalcular el pago a cuenta mensual del impuesto sobre la renta',
      statement: 'Recalcular para cada mes el pago a cuenta como el 1.75 % de los ingresos brutos mensuales y compararlo con el declarado (Art. 151 CT), verificando que se aplique la tasa que corresponde a la actividad.',
      development: 'Se recalculó el pago a cuenta de cada mes del ejercicio [completar: año] aplicando [completar: tasa aplicable, 1.75 % u otra según la actividad] a los ingresos brutos mensuales, y se comparó con el pago declarado en la declaración (F-14). Meses con diferencia: [completar: meses y montos]. Causa: [completar: causa o sin explicar].',
      technique: 'Recálculo', ref: 'Art. 151 CT', priority: 'HIGH',
    },
    {
      title: 'Verificar que los ingresos base del pago a cuenta coincidan con los registros',
      statement: 'Verificar que los ingresos brutos usados como base del pago a cuenta coincidan con el libro de ventas y con las cuentas de ingresos de la contabilidad en cada mes.',
      development: 'Se contrastaron los ingresos brutos declarados como base del pago a cuenta con el libro de ventas y con las cuentas [completar: cuentas de ingresos] de cada mes. Las diferencias identificadas son: [completar: meses y montos]. Su efecto sobre el pago a cuenta y sobre el impuesto del ejercicio: [completar: conclusión].',
      technique: 'Analítico', ref: 'Art. 151 CT', priority: 'HIGH',
    },
    {
      title: 'Verificar la presentación y el pago oportuno de cada declaración mensual',
      statement: 'Verificar que cada declaración del pago a cuenta se haya presentado y pagado dentro del plazo legal, calculando los días de atraso y los intereses o multas aplicables.',
      development: 'Se verificó la fecha de presentación y de pago de las [completar: cantidad] declaraciones mensuales frente al plazo legal. Declaraciones fuera de plazo: [completar: períodos y días de atraso]. Intereses y multas pagados o por pagar: [completar: monto o ninguno].',
      technique: 'Inspección', priority: 'MEDIUM',
    },
    {
      title: 'Conciliar los pagos a cuenta con el crédito aplicado en la declaración anual',
      statement: 'Conciliar el total de pagos a cuenta del ejercicio con el monto acreditado en la declaración anual del impuesto sobre la renta, e identificar remanentes o excesos.',
      development: 'Se sumaron los pagos a cuenta del ejercicio [completar: monto total] y se compararon con el crédito aplicado en la declaración anual [completar: monto]. Diferencia identificada: [completar: monto]. Tratamiento del remanente o exceso y su efecto en el impuesto a pagar: [completar: conclusión].',
      technique: 'Recálculo', priority: 'MEDIUM',
    },
  ]),

  // ─── CAAT: oportunidad de presentación ──────────────────────────────────────
  entry('PT-FISC-CAAT-PLAZOS', R, [
    {
      title: 'Elaborar el calendario de obligaciones formales del ejercicio',
      statement: 'Elaborar el calendario de las declaraciones mensuales y anuales del ejercicio, con su fecha límite legal, según las obligaciones tributarias de la entidad.',
      development: 'Se elaboró el calendario de obligaciones del ejercicio [completar: año] según los impuestos a cargo de la entidad: [completar: IVA, pago a cuenta, renta anual y otras]. Se determinó la fecha límite legal de cada declaración considerando los días hábiles, y el calendario consta en [completar: referencia].',
      technique: 'Analítico', priority: 'HIGH',
    },
    {
      title: 'Contrastar la fecha de presentación real con la fecha límite de cada declaración',
      statement: 'Contrastar para cada declaración la fecha real de presentación con la fecha límite legal, por ejemplo la declaración de IVA dentro de los diez primeros días hábiles del mes siguiente, y calcular los días de atraso.',
      development: 'Se obtuvo la fecha de presentación de cada declaración mediante [completar: comprobantes o portal de la autoridad tributaria] y se comparó con su fecha límite. Declaraciones fuera de plazo: [completar: declaración, período y días de atraso]. Nivel de cumplimiento del ejercicio: [completar: porcentaje o cantidad en plazo].',
      technique: 'Inspección', priority: 'HIGH',
    },
    {
      title: 'Cuantificar multas e intereses por presentación extemporánea',
      statement: 'Cuantificar las multas e intereses pagados o por pagar por las declaraciones presentadas fuera de plazo y evaluar si están registrados o revelados como contingencia.',
      development: 'Para las declaraciones extemporáneas se estimó la multa y los intereses aplicables con [completar: base de cálculo]. Importes pagados: [completar: monto]. Importes por pagar o contingentes: [completar: monto]. Se verificó su registro o revelación en los estados financieros: [completar: resultado].',
      technique: 'Recálculo', priority: 'MEDIUM',
    },
    {
      title: 'Evaluar si existe un incumplimiento formal recurrente',
      statement: 'Evaluar si los atrasos detectados constituyen un patrón de incumplimiento formal recurrente, su causa y las acciones correctivas de la administración.',
      development: 'Se analizó la frecuencia de los atrasos del ejercicio: [completar: cantidad y períodos]. Se indagó con [completar: responsable] sobre su causa y sobre los controles para evitar su repetición. Conclusión sobre la recurrencia y recomendación al cliente: [completar: conclusión].',
      technique: 'Indagación', priority: 'MEDIUM',
    },
  ]),

  // ─── CAAT: documentos tributarios electrónicos ──────────────────────────────
  entry('PT-FISC-CAAT-DTE', R, [
    {
      title: 'Verificar la secuencia de correlativos por tipo de documento',
      statement: 'Verificar para cada tipo de documento tributario electrónico que la secuencia de correlativos sea continua e identificar los saltos, con su explicación.',
      development: 'Se examinó el rango de correlativos de [completar: tipos: comprobante de crédito fiscal, factura, nota de crédito, nota de débito] emitidos en el ejercicio. Se identificaron [completar: cantidad] saltos en [completar: rangos]. Se solicitó a la administración la explicación y su soporte: [completar: resultado].',
      technique: 'Analítico', priority: 'HIGH',
    },
    {
      title: 'Examinar los documentos invalidados y su sustento',
      statement: 'Examinar los documentos tributarios electrónicos invalidados, verificando su causa, el evento de invalidación con sello de recepción y su respaldo documental (Art. 119-E CT).',
      development: 'Se obtuvo la lista de documentos invalidados del ejercicio: [completar: cantidad]. Para una selección de [completar: criterio y cantidad] se verificó la causa de la invalidación, que el evento de invalidación obtuvo el sello de recepción y el respaldo documental. Invalidaciones sin sustento: [completar: detalle o ninguna].',
      technique: 'Inspección', ref: 'Art. 119-E CT', priority: 'HIGH',
    },
    {
      title: 'Conciliar los documentos emitidos con el libro de ventas y la declaración',
      statement: 'Conciliar el total de documentos tributarios electrónicos emitidos con el libro de ventas y con el débito fiscal declarado, e identificar documentos omitidos o registrados dos veces.',
      development: 'Se conciliaron los documentos emitidos en el ejercicio con el libro de ventas y la declaración de cada mes, usando [completar: archivo o portal de origen]. Documentos omitidos, duplicados o con importes distintos: [completar: detalle]. Efecto sobre el débito fiscal y el impuesto: [completar: conclusión].',
      technique: 'Recálculo', priority: 'HIGH',
    },
    {
      title: 'Analizar los documentos rechazados, observados o emitidos en contingencia',
      statement: 'Analizar los documentos con estado rechazado u observado y los emitidos en contingencia, verificando su regularización posterior y su registro contable.',
      development: 'Se identificaron [completar: cantidad] documentos rechazados u observados y [completar: cantidad] emitidos en contingencia en el ejercicio. Se verificó su regularización posterior, su transmisión y su registro contable: [completar: resultado]. Documentos pendientes de regularizar: [completar: detalle o ninguno].',
      technique: 'Inspección', priority: 'MEDIUM',
    },
  ]),

  // ─── Precios de transferencia ───────────────────────────────────────────────
  entry('PT-FISC-PT', R, [
    {
      title: 'Identificar las partes relacionadas y las operaciones del período',
      statement: 'Identificar las partes relacionadas según los criterios de vinculación del Código Tributario, su país y si es jurisdicción de baja o nula imposición, y las operaciones realizadas con ellas en el ejercicio.',
      development: 'Se identificaron las partes relacionadas mediante [completar: registros societarios, indagación, declaraciones] aplicando los criterios de vinculación del Código Tributario. Se determinó su país y si es de baja o nula imposición: [completar: detalle]. Las operaciones del ejercicio con cada una constan en [completar: referencia] por un total de [completar: monto].',
      technique: 'Indagación', priority: 'HIGH',
    },
    {
      title: 'Verificar la existencia y vigencia del estudio de precios de transferencia',
      statement: 'Verificar si la entidad cuenta con el estudio de precios de transferencia cuando es exigible, que esté vigente para el ejercicio y que cubra todas las operaciones con partes relacionadas relevantes.',
      development: 'Se verificó si la entidad está obligada a contar con el estudio de precios de transferencia por [completar: criterio de obligatoriedad]. El estudio [completar: existe / no existe], fue elaborado por [completar: preparador] para el ejercicio [completar: año] y cubre las operaciones: [completar: operaciones cubiertas y no cubiertas].',
      technique: 'Inspección', priority: 'HIGH',
    },
    {
      title: 'Evaluar el método aplicado y el análisis de comparabilidad',
      statement: 'Evaluar si el método seleccionado es el más apropiado según las Directrices de la OCDE y si los comparables y los ajustes de comparabilidad son pertinentes para las operaciones analizadas.',
      development: 'El método aplicado fue [completar: método]. Se evaluó su idoneidad frente a la naturaleza de la operación y a la información disponible, conforme a las Directrices de la OCDE. Se revisó la selección de comparables ([completar: criterios y fuentes]) y los ajustes de comparabilidad aplicados: [completar: conclusión].',
      technique: 'Analítico', priority: 'HIGH',
    },
    {
      title: 'Recalcular el rango de plena competencia y cuantificar el ajuste al impuesto',
      statement: 'Recalcular el rango de plena competencia con los comparables del estudio, comparar con los precios pactados y cuantificar el ajuste a la renta imponible por las operaciones fuera de rango.',
      development: 'Con los comparables del estudio se recalculó el rango de plena competencia para [completar: operación e indicador]: de [completar: límite inferior] a [completar: límite superior]. El resultado pactado por la entidad es [completar: valor]. Para las operaciones fuera del rango se cuantificó el ajuste a la renta imponible: [completar: monto] y su efecto en el impuesto.',
      technique: 'Recálculo', priority: 'HIGH',
    },
    {
      title: 'Verificar la presentación oportuna del informe de operaciones con partes relacionadas',
      statement: 'Verificar que el informe de operaciones con partes relacionadas (F982) se haya presentado ante la autoridad tributaria en el plazo legal y que sus datos coincidan con el inventario de operaciones.',
      development: 'Se obtuvo el informe de operaciones con partes relacionadas (F982) del ejercicio [completar: año] y su comprobante de presentación del [completar: fecha], frente al plazo legal de [completar: fecha límite]. Se contrastaron sus datos con el inventario de operaciones: [completar: diferencias o ninguna]. Conclusión sobre la oportunidad y la integridad: [completar: conclusión].',
      technique: 'Inspección', priority: 'MEDIUM',
    },
  ]),

  // ─── Riesgo LA/FT ───────────────────────────────────────────────────────────
  entry('PT-AML-RISK', R, [
    {
      title: 'Evaluar el riesgo por tipo de cliente',
      statement: 'Segmentar la cartera de clientes y evaluar el riesgo de cada segmento según indicadores como personas expuestas políticamente, jurisdicción, actividad económica y tipo de relación, determinando el nivel de debida diligencia que le corresponde.',
      development: 'Se segmentó la cartera de [completar: universo y fecha] en [completar: segmentos] y se evaluó el riesgo de cada uno considerando personas expuestas políticamente, jurisdicción, actividad económica y tipo de relación. El nivel de riesgo y la debida diligencia aplicable por segmento constan en [completar: referencia]. Segmentos de riesgo alto: [completar: detalle].',
      technique: 'Analítico', priority: 'HIGH',
    },
    {
      title: 'Evaluar el riesgo por productos, servicios, canales y zonas geográficas',
      statement: 'Evaluar el riesgo de los productos y servicios, los canales de distribución y las zonas geográficas, considerando anonimato, velocidad, facilidad de estructurar operaciones y exposición a jurisdicciones de mayor riesgo.',
      development: 'Para cada producto o servicio ([completar: lista]), canal ([completar: lista]) y zona geográfica ([completar: lista]) se evaluó el riesgo según anonimato, velocidad de las operaciones, facilidad para estructurarlas y exposición a jurisdicciones de mayor riesgo. Resultado por factor: [completar: niveles y justificación].',
      technique: 'Analítico', priority: 'HIGH',
    },
    {
      title: 'Consolidar la matriz de riesgo inherente de lavado y financiamiento del terrorismo',
      statement: 'Consolidar los factores de riesgo en una matriz con la ponderación definida en la metodología de la entidad y en la normativa aplicable, y determinar el nivel de riesgo inherente global.',
      development: 'Se consolidaron los factores de riesgo (clientes, productos, canales y geografía) en la matriz con la ponderación de la metodología de la entidad: [completar: ponderación]. El riesgo inherente global es [completar: nivel y puntaje]. Se verificó que la ponderación esté documentada y aprobada: [completar: resultado].',
      technique: 'Recálculo', priority: 'HIGH',
    },
    {
      title: 'Evaluar los controles de prevención en las tres líneas de defensa',
      statement: 'Evaluar el diseño y la efectividad de los controles de prevención en las tres líneas de defensa: el negocio, el oficial de cumplimiento y la auditoría independiente, indicando fortalezas y debilidades.',
      development: 'Se evaluó cada línea de defensa. Primera línea (negocio): [completar: identificación y reporte]. Segunda línea (oficial de cumplimiento): [completar: políticas, monitoreo, capacitación]. Tercera línea (revisión independiente): [completar: alcance y hallazgos]. Fortalezas y debilidades, y calificación de cada línea: [completar: resultado].',
      technique: 'Inspección', priority: 'HIGH',
    },
    {
      title: 'Determinar el riesgo residual y concluir sobre la efectividad del programa',
      statement: 'Determinar el riesgo residual a partir del riesgo inherente y de la efectividad de los controles, y concluir sobre la efectividad del programa de prevención con recomendaciones para el comité de cumplimiento.',
      development: 'Con un riesgo inherente [completar: nivel] y controles calificados como [completar: calificación], el riesgo residual es [completar: nivel]. Conclusión sobre la efectividad del programa de prevención: [completar: conclusión]. Hallazgos críticos y recomendaciones para el comité de cumplimiento: [completar: lista].',
      technique: 'Analítico', priority: 'MEDIUM',
    },
  ]),
]);
