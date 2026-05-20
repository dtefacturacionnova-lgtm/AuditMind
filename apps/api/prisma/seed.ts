import {
  PrismaClient, UserRole, AuditType, AuditStatus,
  WorkingPaperType, WorkingPaperStatus,
  PbcRequestStatus, ConfirmationType, ConfirmationStatus,
  TickMark, FindingSeverity, FindingStatus,
} from '@prisma/client';

const prisma = new PrismaClient();

// ─── Helpers ──────────────────────────────────────────────────────────────────
const d = (s: string) => new Date(s);

async function main() {
  console.log('\n🌱  AuditMind — Seed rico v2.0\n');

  // ══════════════════════════════════════════════════════════════
  // 1. ORGANIZACIÓN
  // ══════════════════════════════════════════════════════════════
  const org = await prisma.organization.upsert({
    where:  { slug: 'empresa-demo' },
    update: { name: 'Empresa Demo S.A.' },
    create: {
      id:           'org-demo',
      name:         'Empresa Demo S.A.',
      slug:         'empresa-demo',
      plan:         'professional',
      primaryColor: '#0F2D4A',
      settings: { country: 'Chile', industry: 'Retail', rut: '76.123.456-7' },
      active: true,
    },
  });
  console.log(`✅  Organización: ${org.name}`);

  // ══════════════════════════════════════════════════════════════
  // 2. USUARIOS (5)
  // ══════════════════════════════════════════════════════════════
  const cae = await prisma.user.upsert({
    where:  { email: 'cae@demo.cl' },
    update: { name: 'Carlos Auditor Ejecutivo' },
    create: {
      id: 'user-cae', email: 'cae@demo.cl',
      name: 'Carlos Auditor Ejecutivo',
      supabaseUserId: 'demo-cae',
      role: UserRole.CAE, organizationId: org.id, active: true,
    },
  });

  const manager = await prisma.user.upsert({
    where:  { email: 'gerente@demo.cl' },
    update: { name: 'María González' },
    create: {
      id: 'user-manager', email: 'gerente@demo.cl',
      name: 'María González',
      supabaseUserId: 'demo-manager',
      role: UserRole.AUDIT_MANAGER, organizationId: org.id, active: true,
    },
  });

  const senior = await prisma.user.upsert({
    where:  { email: 'senior@demo.cl' },
    update: { name: 'Javier Morales' },
    create: {
      id: 'user-senior', email: 'senior@demo.cl',
      name: 'Javier Morales',
      supabaseUserId: 'demo-senior',
      role: UserRole.SENIOR_AUDITOR, organizationId: org.id, active: true,
    },
  });

  const auditor = await prisma.user.upsert({
    where:  { email: 'auditor@demo.cl' },
    update: { name: 'Pedro Sánchez' },
    create: {
      id: 'user-auditor', email: 'auditor@demo.cl',
      name: 'Pedro Sánchez',
      supabaseUserId: 'demo-auditor',
      role: UserRole.AUDITOR, organizationId: org.id, active: true,
    },
  });

  const auditor2 = await prisma.user.upsert({
    where:  { email: 'auditor2@demo.cl' },
    update: { name: 'Valentina Torres' },
    create: {
      id: 'user-auditor2', email: 'auditor2@demo.cl',
      name: 'Valentina Torres',
      supabaseUserId: 'demo-auditor2',
      role: UserRole.AUDITOR, organizationId: org.id, active: true,
    },
  });
  console.log(`✅  Usuarios: 5 (CAE, Manager, Senior, Auditor x2)`);

  // ══════════════════════════════════════════════════════════════
  // 3. UNIVERSO DE AUDITORÍA (20 entidades)
  // ══════════════════════════════════════════════════════════════
  const entities = [
    // Financieros (5)
    { id:'ent-01', name:'Tesorería y Gestión de Caja', category:'Financiero', risk:82,
      description:'Gestión de fondos, flujo de caja y relaciones bancarias', responsible:manager.name },
    { id:'ent-02', name:'Cuentas por Pagar', category:'Financiero', risk:78,
      description:'Proceso de gestión y pago a proveedores', responsible:senior.name },
    { id:'ent-03', name:'Cuentas por Cobrar', category:'Financiero', risk:71,
      description:'Facturación, cobranzas y gestión de cartera', responsible:auditor.name },
    { id:'ent-04', name:'Activos Fijos e Intangibles', category:'Financiero', risk:55,
      description:'Alta, baja, depreciación y custodia de activos', responsible:manager.name },
    { id:'ent-05', name:'Inventario y Existencias', category:'Financiero', risk:68,
      description:'Control de stock, valorizaciones y obsolescencia', responsible:senior.name },
    // TI (4)
    { id:'ent-06', name:'Seguridad de la Información', category:'TI', risk:91,
      description:'Ciberseguridad, gestión de vulnerabilidades e infraestructura', responsible:cae.name },
    { id:'ent-07', name:'Gestión de Accesos y Privilegios', category:'TI', risk:88,
      description:'IAM, roles, accesos privilegiados y segregación en sistemas', responsible:senior.name },
    { id:'ent-08', name:'Continuidad del Negocio y DRP', category:'TI', risk:76,
      description:'Planes de contingencia, backups y recuperación de desastres', responsible:manager.name },
    { id:'ent-09', name:'Desarrollo y Cambios de Software', category:'TI', risk:62,
      description:'Gestión del ciclo de vida de software y control de cambios', responsible:auditor.name },
    // Operacional (5)
    { id:'ent-10', name:'Compras y Contratos', category:'Operacional', risk:65,
      description:'Adquisiciones, licitaciones y gestión contractual', responsible:auditor2.name },
    { id:'ent-11', name:'Gestión de Recursos Humanos', category:'Operacional', risk:58,
      description:'Nómina, contratación y evaluación de desempeño', responsible:manager.name },
    { id:'ent-12', name:'Logística y Distribución', category:'Operacional', risk:61,
      description:'Cadena de abastecimiento, despacho y transporte', responsible:senior.name },
    { id:'ent-13', name:'Atención al Cliente y CRM', category:'Operacional', risk:44,
      description:'Gestión de reclamos, satisfacción y datos de clientes', responsible:auditor.name },
    { id:'ent-14', name:'Producción y Operaciones', category:'Operacional', risk:70,
      description:'Procesos productivos, calidad y eficiencia operacional', responsible:senior.name },
    // Regulatorio (3)
    { id:'ent-15', name:'Cumplimiento Tributario', category:'Regulatorio', risk:73,
      description:'Declaraciones, impuestos y relación con SII', responsible:cae.name },
    { id:'ent-16', name:'Prevención de Lavado de Activos (UAF)', category:'Regulatorio', risk:85,
      description:'Cumplimiento Ley 19.913, debida diligencia y reportes UAF', responsible:manager.name },
    { id:'ent-17', name:'Protección de Datos Personales (Ley 21.719)', category:'Regulatorio', risk:79,
      description:'Gestión de datos personales, consentimientos y brechas', responsible:senior.name },
    // Gobierno (3)
    { id:'ent-18', name:'Gestión de Riesgos Corporativos (ERM)', category:'Gobierno', risk:67,
      description:'Marco ERM, identificación y respuesta a riesgos estratégicos', responsible:cae.name },
    { id:'ent-19', name:'Gestión de Proveedores Críticos', category:'Gobierno', risk:60,
      description:'Evaluación, monitoreo y riesgo de terceros', responsible:manager.name },
    { id:'ent-20', name:'Proyectos Estratégicos y PMO', category:'Gobierno', risk:57,
      description:'Gobierno de proyectos, presupuesto y entrega de valor', responsible:senior.name },
  ];

  for (const e of entities) {
    await prisma.auditEntity.upsert({
      where:  { id: e.id },
      update: { inherentRiskScore: e.risk },
      create: {
        id: e.id, organizationId: org.id,
        name: e.name, description: e.description,
        category: e.category,
        inherentRiskScore: e.risk,
        responsible: e.responsible,
        active: true,
      },
    });
  }
  console.log(`✅  Entidades: 20 (Financiero, TI, Operacional, Regulatorio, Gobierno)`);

  // ══════════════════════════════════════════════════════════════
  // LIMPIEZA: Eliminar auditorías previas del seed para idempotencia
  // ══════════════════════════════════════════════════════════════
  await prisma.audit.deleteMany({
    where: { id: { in: ['audit-01', 'audit-02', 'audit-03'] } },
  });

  // ══════════════════════════════════════════════════════════════
  // 4A. AUDITORÍA 1 — Financiera Q4 2025 (COMPLETED)
  // ══════════════════════════════════════════════════════════════
  const a1 = await prisma.audit.create({
    data: {
      id: 'audit-01',
      title: 'Auditoría Financiera Integral Q4 2025',
      type: AuditType.FINANCIAL,
      status: AuditStatus.CLOSED,
      organizationId: org.id,
      auditEntityId: 'ent-01',
      leadAuditorId: manager.id,
      startDate: d('2025-10-01'),
      endDate:   d('2025-12-15'),
      estimatedHours: 280, actualHours: 263,
      scope: 'Revisión integral de los procesos financieros del cuarto trimestre 2025: tesorería, cuentas por cobrar, cuentas por pagar y activos fijos.',
      objectives: 'Evaluar la razonabilidad de los estados financieros al 31-12-2025 y la efectividad de los controles internos relacionados.',
      materiality: 450000, materialityExecution: 337500, materialityAccumulation: 225000,
      materialityBase: 'Activos Totales', materialityBaseAmount: 22500000,
      auditRiskModel: { inherentRisk: 0.65, controlRisk: 0.45, detectionRisk: 0.17, auditRisk: 0.05 },
      isInvestigationMode: false,
    },
  });

  await prisma.auditTeam.createMany({
    data: [
      { auditId: a1.id, userId: manager.id,  role: 'LEAD' },
      { auditId: a1.id, userId: senior.id,   role: 'SENIOR_AUDITOR' },
      { auditId: a1.id, userId: auditor.id,  role: 'AUDITOR' },
    ],
    skipDuplicates: true,
  });

  // — Working Papers Auditoría 1 (5)
  await prisma.workingPaper.createMany({
    data: [
      {
        id: 'wp-01-a01', code: 'A-01', indexSection: 'A', title: 'Entendimiento del negocio y ambiente de control',
        type: WorkingPaperType.PLANNING_UNDERSTANDING, status: WorkingPaperStatus.APPROVED,
        auditId: a1.id, preparedById: senior.id, reviewedById: manager.id,
        content: {
          objective: 'Documentar el entendimiento del negocio, la industria y el ambiente de control interno de Empresa Demo S.A.',
          scope: 'Ejercicio fiscal Q4 2025 (octubre-diciembre 2025). Se incluyen los procesos financieros críticos.',
          procedures: '1. Entrevistas con la Gerencia de Finanzas y Contraloría.\n2. Revisión del organigrama y matriz de responsabilidades.\n3. Análisis de cambios significativos en el período.\n4. Revisión de políticas y procedimientos vigentes.',
          evidence: 'Memorándum de entendimiento firmado por Gerencia. Organigrama actualizado al 01-10-2025. Políticas contables aprobadas por Directorio.',
          observations: 'Se identificó que el manual de procedimientos de tesorería no ha sido actualizado desde 2023. Se recomienda su revisión en el próximo ejercicio.',
        },
        conclusion: 'El ambiente de control es adecuado en términos generales, con oportunidades de mejora en la documentación de procedimientos operativos.',
        version: 2, aiAssisted: false,
        tickMarks: [], crossReferences: [],
      },
      {
        id: 'wp-01-b01', code: 'B-01', indexSection: 'B', title: 'Evaluación de controles de tesorería',
        type: WorkingPaperType.CONTROL_EVALUATION, status: WorkingPaperStatus.APPROVED,
        auditId: a1.id, preparedById: auditor.id, reviewedById: senior.id,
        content: {
          objective: 'Evaluar la efectividad de los controles sobre el proceso de tesorería y gestión de efectivo.',
          scope: 'Cuentas bancarias activas durante Q4 2025. Pagos superiores a $500,000 CLP.',
          procedures: '1. Indagación con encargado de tesorería sobre flujo de autorizaciones.\n2. Inspección de los límites de autorización documentados.\n3. Re-ejecución de controles de conciliación bancaria (muestra: 3 meses).\n4. Verificación de segregación de funciones en sistema ERP.',
          evidence: 'Política de tesorería v2.1. Flujos de pago del sistema SAP (octubre-diciembre). Conciliaciones bancarias mensuales.',
          observations: 'Control de conciliación bancaria mensual se ejecuta dentro del plazo establecido. Sin embargo, se detectó que el 15% de pagos entre $500K y $1M no requieren segunda firma.',
        },
        conclusion: 'Los controles de tesorería son efectivos para transacciones sobre $1M CLP. Se identificó brecha de control para el rango $500K-$1M que originó Hallazgo B-01.',
        version: 3, aiAssisted: false,
        tickMarks: [], crossReferences: ['A-01'],
      },
      {
        id: 'wp-01-b02', code: 'B-02', indexSection: 'B', title: 'Evaluación de controles de cuentas por pagar',
        type: WorkingPaperType.CONTROL_EVALUATION, status: WorkingPaperStatus.APPROVED,
        auditId: a1.id, preparedById: auditor.id, reviewedById: manager.id,
        content: {
          objective: 'Evaluar la efectividad de los controles sobre el proceso de cuentas por pagar y pagos a proveedores.',
          scope: 'Universo: 2,340 facturas procesadas en Q4 2025. Muestra seleccionada: 120 facturas (criterio: riesgo + monetario).',
          procedures: '1. Verificación del proceso de triple cotización para compras > $2M CLP.\n2. Validación de control de factura/OC/recepción conforme (3-way match).\n3. Prueba de autorización: 120 facturas seleccionadas.\n4. Búsqueda de pagos duplicados en período.',
          evidence: 'Listado de facturas SAP Q4 2025. Órdenes de compra aprobadas. Actas de recepción de mercadería. Reporte de pagos duplicados (cero hallazgos).',
          observations: 'En 8 de 120 facturas verificadas (6.7%) no se encontró OC previa. Monto total: $1,240,000 CLP. No se detectaron pagos duplicados.',
        },
        conclusion: 'Los controles de CxP presentan debilidades en la adhesión al proceso de OC previa. Se generó Hallazgo relacionado.',
        version: 2, aiAssisted: false,
        tickMarks: [], crossReferences: ['A-01', 'B-01'],
      },
      {
        id: 'wp-01-c01', code: 'C-01', indexSection: 'C', title: 'Prueba sustantiva — Saldos bancarios al 31-12-2025',
        type: WorkingPaperType.SUBSTANTIVE_TEST, status: WorkingPaperStatus.APPROVED,
        auditId: a1.id, preparedById: senior.id, reviewedById: manager.id,
        content: {
          objective: 'Verificar la existencia y exactitud de los saldos bancarios registrados al 31 de diciembre de 2025.',
          scope: 'Todas las cuentas bancarias activas al 31-12-2025 (7 cuentas, 3 bancos). Saldo total registrado: $4,820,000 CLP.',
          procedures: '1. Solicitud y recepción de confirmaciones bancarias (enviadas 05-01-2026).\n2. Conciliación de saldos confirmados vs. registros contables.\n3. Análisis de partidas conciliatorias > 30 días.\n4. Verificación de corte de transacciones (últimos 3 días hábiles del período).',
          evidence: 'Confirmaciones bancarias firmadas: Banco Santander, BCI, BancoEstado. Conciliaciones contables al 31-12-2025. Análisis de corte de transacciones.',
          observations: 'Diferencia de $2,450,000 CLP entre confirmación Banco Santander y registros contables. Correspondiente a cheque en tránsito emitido el 29-12-2025.',
        },
        conclusion: 'Los saldos bancarios están razonablemente presentados. La diferencia identificada ($2.45M) corresponde a cheque en tránsito correctamente clasificado en conciliación.',
        version: 4, aiAssisted: true,
        tickMarks: [], crossReferences: ['B-01'],
      },
      {
        id: 'wp-01-e01', code: 'E-01', indexSection: 'E', title: 'Procedimientos de cierre y eventos subsecuentes',
        type: WorkingPaperType.CLOSURE_CONCLUSION, status: WorkingPaperStatus.APPROVED,
        auditId: a1.id, preparedById: senior.id, reviewedById: manager.id,
        content: {
          objective: 'Documentar los procedimientos de cierre de la auditoría y revisión de eventos subsecuentes hasta la fecha de emisión del informe.',
          scope: 'Período de revisión de eventos subsecuentes: 01-01-2026 a 20-01-2026.',
          procedures: '1. Revisión de actas de directorio enero 2026.\n2. Consulta a la Gerencia sobre hechos relevantes post-cierre.\n3. Lectura de prensa especializada del sector.\n4. Revisión de ajustes propuestos y estados financieros definitivos.',
          evidence: 'Acta directorio enero 2026. Declaración de la Gerencia General. Estados financieros auditados.',
          observations: 'Sin eventos subsecuentes materiales identificados.',
        },
        conclusion: 'No se identificaron eventos posteriores al cierre del ejercicio que requieran ajuste o revelación en los estados financieros al 31-12-2025.',
        version: 1, aiAssisted: false,
        tickMarks: [], crossReferences: ['A-01', 'C-01'],
      },
    ],
  });

  // — Tick mark entries Auditoría 1
  await prisma.tickMarkEntry.createMany({
    data: [
      { id:'tm-01-01', paperId:'wp-01-c01', fieldPath:'Saldo Banco Santander cta. 123-456-7', tickMark:TickMark.CONFIRMED_THIRD, note:'Confirmación recibida 08-01-2026', createdBy:senior.id },
      { id:'tm-01-02', paperId:'wp-01-c01', fieldPath:'Saldo Banco BCI cta. 00-123-45678-09', tickMark:TickMark.CONFIRMED_THIRD, note:'Confirmación recibida 10-01-2026', createdBy:senior.id },
      { id:'tm-01-03', paperId:'wp-01-c01', fieldPath:'Saldo BancoEstado cta. 987654321', tickMark:TickMark.CONFIRMED_THIRD, note:'Confirmación recibida 09-01-2026', createdBy:senior.id },
      { id:'tm-01-04', paperId:'wp-01-c01', fieldPath:'Cheque en tránsito $2,450,000', tickMark:TickMark.VERIFIED, note:'Cobrado el 03-01-2026 según extracto', createdBy:senior.id },
      { id:'tm-01-05', paperId:'wp-01-b01', fieldPath:'Pagos > $1M requieren doble firma', tickMark:TickMark.VERIFIED, note:'Muestra: 45 pagos, todos con doble firma', createdBy:auditor.id },
      { id:'tm-01-06', paperId:'wp-01-b01', fieldPath:'Pagos $500K-$1M sin segunda firma', tickMark:TickMark.EXCEPTION, note:'15% del rango no tiene segunda firma — ver Hallazgo', createdBy:auditor.id },
      { id:'tm-01-07', paperId:'wp-01-b02', fieldPath:'Triple cotización compras > $2M', tickMark:TickMark.VERIFIED, note:'100% de muestra cumple', createdBy:auditor.id },
      { id:'tm-01-08', paperId:'wp-01-b02', fieldPath:'Facturas sin OC previa (8/120)', tickMark:TickMark.EXCEPTION, note:'6.7% de la muestra — $1.24M CLP total', createdBy:auditor.id },
      { id:'tm-01-09', paperId:'wp-01-b02', fieldPath:'Total sumatoria facturas muestra', tickMark:TickMark.FOOTED, note:'Total verificado: $48,320,000 CLP', createdBy:auditor.id },
    ],
  });

  // — WP Comments Auditoría 1
  await prisma.workingPaperComment.createMany({
    data: [
      { id:'wc-01-01', paperId:'wp-01-b01', authorId:senior.id, content:'Por favor documentar el porcentaje exacto de la muestra y ampliar la conclusión sobre el control compensatorio existente.', resolved:true, resolvedBy:auditor.id },
      { id:'wc-01-02', paperId:'wp-01-c01', authorId:manager.id, content:'Confirmado. El cheque en tránsito fue cobrado el 03-01-2026. Actualizar la referencia en el papel.', resolved:true, resolvedBy:senior.id },
      { id:'wc-01-03', paperId:'wp-01-b02', authorId:manager.id, content:'Ampliar el análisis de las 8 facturas sin OC: ¿son del mismo proveedor? ¿misma área?', resolved:true, resolvedBy:auditor.id },
    ],
  });

  // — Hallazgos Auditoría 1 (4)
  await prisma.finding.createMany({
    data: [
      {
        id:'f-01-01',
        auditId: a1.id, organizationId: org.id,
        title: 'Brecha en autorización de pagos rango $500K-$1M',
        severity: FindingSeverity.HIGH,
        status: FindingStatus.CLOSED,
        condition: 'El 15% de los pagos en el rango $500K-$1M CLP se procesan sin segunda firma de autorización.',
        criteria: 'Según Política de Tesorería v2.1, todos los pagos sobre $500,000 CLP requieren autorización dual (doble firma del encargado y supervisor).',
        cause: 'La política fue actualizada en 2024 pero el sistema ERP no fue configurado para bloquear pagos en ese rango sin segunda firma. La capacitación al equipo fue insuficiente.',
        effect: 'Riesgo de pagos no autorizados o fraudulentos en el rango $500K-$1M sin detección oportuna. Monto del universo expuesto: $8,500,000 CLP en Q4 2025.',
        risk: 'Riesgo de fraude o error material. En Q4 2025 se procesaron 63 pagos en ese rango con un solo autorizador.',
        recommendation: '1. Configurar regla en ERP para bloquear pagos $500K-$1M sin doble firma.\n2. Revisar retroactivamente los 63 pagos afectados.\n3. Capacitar al equipo antes del 28-02-2026.',
        managementResponse: 'Aceptamos el hallazgo. Se programó configuración del ERP para el 31-01-2026. Revisión retroactiva de pagos completada sin anomalías.',
        effectAmount: 8500000, isMaterial: false,
        normativeReference: 'Política Interna de Tesorería v2.1', normativeArticle: 'Sección 4.2 — Niveles de autorización',
        qualityScore: 92, isRecurring: false, escalationLevel: 'NONE',
        dueDate: d('2026-01-31'), closedAt: d('2026-02-01'),
        responsibleId: manager.id,
      },
      {
        id:'f-01-02',
        auditId: a1.id, organizationId: org.id,
        title: 'Facturación de proveedores sin Orden de Compra previa',
        severity: FindingSeverity.MEDIUM,
        status: FindingStatus.CLOSED,
        condition: '8 de 120 facturas verificadas (6.7%) no cuentan con Orden de Compra aprobada como respaldo.',
        criteria: 'Según Procedimiento de Compras y Contratos, toda adquisición de bienes o servicios debe contar con OC aprobada por Jefatura de área antes de la recepción.',
        cause: 'Falta de cumplimiento por parte de 2 áreas (Operaciones y Marketing) que efectúan compras de emergencia sin seguir el proceso formal, incumpliendo el procedimiento establecido.',
        effect: 'Riesgo de pagos a proveedores no autorizados. Monto afectado en muestra: $1,240,000 CLP (extrapolado al universo: ~$19M CLP).',
        risk: 'Riesgo operacional y de fraude en el proceso de compras.',
        recommendation: 'Implementar bloqueo en ERP para no procesar facturas sin OC válida. Comunicar a jefaturas de Operaciones y Marketing.',
        managementResponse: 'Se implementó restricción en SAP. Los 8 pagos afectados fueron ratificados por Gerencias.',
        effectAmount: 19000000, isMaterial: false,
        normativeReference: 'Procedimiento de Compras PC-003', normativeArticle: 'Punto 3.1',
        qualityScore: 78, isRecurring: true, escalationLevel: 'NONE',
        dueDate: d('2026-02-15'), closedAt: d('2026-02-20'),
        responsibleId: auditor.id,
      },
      {
        id:'f-01-03',
        auditId: a1.id, organizationId: org.id,
        title: 'Ausencia de política de segregación de funciones en tesorería',
        severity: FindingSeverity.CRITICAL,
        status: FindingStatus.CLOSED,
        condition: 'El Encargado de Tesorería tiene acceso simultáneo a: ingreso de proveedores, autorización de pagos y conciliación bancaria en el sistema ERP.',
        criteria: 'COSO 2013 Principio 10 y NIA 315 establecen que las funciones incompatibles de custodia, autorización y registro deben estar segregadas.',
        cause: 'Reducción de personal en el área de finanzas en 2024 generó que un solo funcionario asumiera funciones incompatibles sin controles compensatorios formales.',
        effect: 'Riesgo material de fraude o error sin detección. El funcionario procesó $142M CLP en pagos durante Q4 2025 sin revisión independiente.',
        risk: 'Riesgo de fraude de alta probabilidad e impacto material sobre los estados financieros.',
        recommendation: '1. Implementar inmediatamente revisión diaria por CAE o Gerente de Finanzas hasta solución estructural.\n2. Contratar o reasignar personal para separar funciones antes del 30-03-2026.\n3. Configurar perfiles en SAP con restricción por función.',
        managementResponse: 'Hallazgo crítico aceptado. Se asignó al Gerente de Finanzas la revisión diaria a partir del 20-12-2025. Plan de reorganización aprobado por Directorio.',
        effectAmount: 142000000, isMaterial: true,
        normativeReference: 'COSO 2013 / NIA 315', normativeArticle: 'Principio 10 — Control de Actividades',
        qualityScore: 95, isRecurring: false, escalationLevel: 'CAE',
        dueDate: d('2026-03-30'), closedAt: d('2026-03-25'),
        responsibleId: cae.id,
      },
      {
        id:'f-01-04',
        auditId: a1.id, organizationId: org.id,
        title: 'Manual de procedimientos de tesorería desactualizado',
        severity: FindingSeverity.LOW,
        status: FindingStatus.CLOSED,
        condition: 'El manual de procedimientos de Tesorería data de 2023 y no refleja los cambios organizacionales y de sistemas implementados en 2024-2025.',
        criteria: 'Las mejores prácticas de control interno (COSO) establecen que la documentación de procedimientos debe estar vigente y aprobada por la Alta Dirección.',
        cause: 'No existe un proceso formal de revisión anual de manuales de procedimiento en el área de finanzas.',
        effect: 'Riesgo de que el personal ejecute procesos de manera inconsistente o no conforme con las prácticas actuales de la organización.',
        risk: 'Riesgo operacional bajo. Sin impacto financiero directo.',
        recommendation: 'Actualizar el manual de procedimientos de Tesorería antes del 30-06-2026 con aprobación del Directorio.',
        managementResponse: 'Aceptado. Se programó actualización del manual para el segundo trimestre 2026.',
        qualityScore: 65, isRecurring: false, escalationLevel: 'NONE',
        dueDate: d('2026-06-30'), closedAt: d('2026-06-28'),
        responsibleId: senior.id,
      },
    ],
  });

  // — PBC Requests Auditoría 1 (3)
  await prisma.pbcRequest.createMany({
    data: [
      {
        id: 'pbc-01-01',
        auditId: a1.id, organizationId: org.id,
        title: 'Estados de cuenta bancarios Q4 2025 — Todos los bancos',
        description: 'Se requieren los estados de cuenta de todas las cuentas bancarias de la empresa para el período octubre-diciembre 2025.',
        requestedToEmail: 'finanzas@demo.cl',
        requestedToName: 'Ana Rodríguez — Gerencia Finanzas',
        dueDate: d('2025-10-20'),
        portalToken: 'demo-portal-token-pbc-01-01',
        status: PbcRequestStatus.ACCEPTED,
        submittedAt: d('2025-10-18'),
        acceptedAt: d('2025-10-22'),
        fileUrls: ['Estados_Cuenta_Santander_Q4.pdf', 'Estados_Cuenta_BCI_Q4.pdf', 'Estados_Cuenta_BancoEstado_Q4.pdf'],
        createdById: senior.id,
      },
      {
        id: 'pbc-01-02',
        auditId: a1.id, organizationId: org.id,
        title: 'Conciliaciones bancarias — Octubre a Diciembre 2025',
        description: 'Conciliaciones bancarias mensuales preparadas por Contabilidad para todas las cuentas del período.',
        requestedToEmail: 'contabilidad@demo.cl',
        requestedToName: 'Luis Fuentes — Contabilidad',
        dueDate: d('2025-10-25'),
        portalToken: 'demo-portal-token-pbc-01-02',
        status: PbcRequestStatus.ACCEPTED,
        submittedAt: d('2025-10-23'),
        acceptedAt: d('2025-10-28'),
        fileUrls: ['Conciliacion_Oct2025.xlsx', 'Conciliacion_Nov2025.xlsx', 'Conciliacion_Dic2025.xlsx'],
        createdById: auditor.id,
      },
      {
        id: 'pbc-01-03',
        auditId: a1.id, organizationId: org.id,
        title: 'Detalle de facturas sin Orden de Compra — Q4 2025',
        description: 'Listado completo de facturas procesadas sin OC previa identificadas durante el período auditado.',
        requestedToEmail: 'operaciones@demo.cl',
        requestedToName: 'Roberto Campos — Jefe Operaciones',
        dueDate: d('2025-11-10'),
        portalToken: 'demo-portal-token-pbc-01-03',
        status: PbcRequestStatus.REJECTED,
        rejectionReason: 'La información recibida está incompleta. Faltan 3 de las 8 facturas identificadas. Se solicita complementar.',
        createdById: auditor.id,
      },
    ],
  });

  // — PBC Messages
  await prisma.pbcMessage.createMany({
    data: [
      { id:'pbcm-01-01', requestId:'pbc-01-01', senderEmail:'senior@demo.cl', senderName:'Javier Morales', isAuditor:true, content:'Buenos días Ana. Adjuntamos la solicitud formal de los estados de cuenta para el período Q4 2025. Por favor incluir todas las cuentas corrientes y cuentas de ahorro activas.' },
      { id:'pbcm-01-02', requestId:'pbc-01-01', senderEmail:'finanzas@demo.cl', senderName:'Ana Rodríguez', isAuditor:false, content:'Recibido. Adjunto los estados de cuenta de los tres bancos. El de BancoEstado incluye dos cuentas en documentos separados.' },
      { id:'pbcm-01-03', requestId:'pbc-01-03', senderEmail:'auditor@demo.cl', senderName:'Pedro Sánchez', isAuditor:true, content:'Estimado Roberto: se requiere el detalle de las 8 facturas identificadas sin OC. Por favor adjuntar también las aprobaciones retroactivas de las jefaturas de área.' },
      { id:'pbcm-01-04', requestId:'pbc-01-03', senderEmail:'operaciones@demo.cl', senderName:'Roberto Campos', isAuditor:false, content:'Adjunto lo que tenemos. Solo encontré respaldo de 5 facturas. Las otras 3 estamos buscando la documentación.' },
    ],
  });

  // — Confirmaciones Externas Auditoría 1 (3 bancarias)
  await prisma.externalConfirmation.createMany({
    data: [
      {
        id: 'conf-01-01',
        auditId: a1.id,
        type: ConfirmationType.BANK,
        respondentName: 'Banco Santander Chile',
        respondentEmail: 'confirmaciones@santander.cl',
        amount: 1250000.00,
        accountRef: 'Cta. Cte. 123-456-7',
        sentAt: d('2026-01-05'),
        sentBy: senior.name,
        responseReceivedAt: d('2026-01-08'),
        responseContent: 'Confirmamos saldo en cuenta corriente 123-456-7 al 31-12-2025: $1,250,000.00 CLP. Sin embargos ni restricciones vigentes.',
        responseAmount: 1250000.00,
        difference: 0,
        status: ConfirmationStatus.RECONCILED,
      },
      {
        id: 'conf-01-02',
        auditId: a1.id,
        type: ConfirmationType.BANK,
        respondentName: 'Banco BCI',
        respondentEmail: 'confirmaciones@bci.cl',
        amount: 3320000.00,
        accountRef: 'Cta. Cte. 00-123-45678-09',
        sentAt: d('2026-01-05'),
        sentBy: senior.name,
        responseReceivedAt: d('2026-01-10'),
        responseContent: 'El saldo de la cuenta corriente al 31-12-2025 es de $3,320,000.00 CLP. Línea de crédito disponible: $10,000,000 CLP, sin uso al 31-12-2025.',
        responseAmount: 3320000.00,
        difference: 0,
        status: ConfirmationStatus.RECONCILED,
      },
      {
        id: 'conf-01-03',
        auditId: a1.id,
        type: ConfirmationType.BANK,
        respondentName: 'BancoEstado',
        respondentEmail: 'cert.saldos@bancoestado.cl',
        amount: 2700000.00,
        accountRef: 'Cta. Cte. 987654321',
        sentAt: d('2026-01-05'),
        sentBy: senior.name,
        responseReceivedAt: d('2026-01-09'),
        responseContent: 'Saldo certificado al 31-12-2025: $2,702,450.00 CLP.',
        responseAmount: 2702450.00,
        difference: 2450.00,
        differenceExplanation: 'Diferencia de $2,450 corresponde a comisiones bancarias acreditadas el 31-12-2025 no incluidas en conciliación inicial.',
        status: ConfirmationStatus.RECONCILED,
      },
    ],
  });

  console.log(`✅  Auditoría 1 (COMPLETED): 5 WPs, 4 hallazgos, 3 PBCs, 3 confirmaciones bancarias`);

  // ══════════════════════════════════════════════════════════════
  // 4B. AUDITORÍA 2 — Seguridad TI Q1 2026 (IN_PROGRESS)
  // ══════════════════════════════════════════════════════════════
  const a2 = await prisma.audit.create({
    data: {
      id: 'audit-02',
      title: 'Auditoría de Seguridad de la Información Q1 2026',
      type: AuditType.IT,
      status: AuditStatus.IN_PROGRESS,
      organizationId: org.id,
      auditEntityId: 'ent-06',
      leadAuditorId: manager.id,
      startDate: d('2026-01-15'),
      endDate:   d('2026-03-31'),
      estimatedHours: 320, actualHours: 148,
      scope: 'Evaluación de la seguridad de la información: gestión de accesos, seguridad perimetral, gestión de vulnerabilidades, SGSI y cumplimiento ISO 27001.',
      objectives: 'Identificar brechas de seguridad críticas y evaluar la madurez del SGSI respecto al estándar ISO 27001:2022.',
      materiality: 0,
      auditRiskModel: { inherentRisk: 0.85, controlRisk: 0.6, detectionRisk: 0.1, auditRisk: 0.05 },
      isInvestigationMode: false,
    },
  });

  await prisma.auditTeam.createMany({
    data: [
      { auditId: a2.id, userId: manager.id,   role: 'LEAD' },
      { auditId: a2.id, userId: senior.id,    role: 'SENIOR_AUDITOR' },
      { auditId: a2.id, userId: auditor2.id,  role: 'AUDITOR' },
    ],
    skipDuplicates: true,
  });

  // — Working Papers Auditoría 2 (4)
  await prisma.workingPaper.createMany({
    data: [
      {
        id: 'wp-02-a01', code: 'A-01', indexSection: 'A', title: 'Entendimiento del SGSI y marco normativo',
        type: WorkingPaperType.PLANNING_UNDERSTANDING, status: WorkingPaperStatus.APPROVED,
        auditId: a2.id, preparedById: senior.id, reviewedById: manager.id,
        content: {
          objective: 'Documentar el entendimiento del Sistema de Gestión de Seguridad de la Información (SGSI) implementado por la empresa.',
          scope: 'Marco ISO 27001:2022, políticas de seguridad vigentes, organigrama de TI y comité de ciberseguridad.',
          procedures: '1. Revisión del manual SGSI versión vigente.\n2. Entrevistas con CISO y equipo de seguridad.\n3. Revisión de auditorías previas de seguridad.\n4. Análisis de incidentes de seguridad 2025.',
          evidence: 'Manual SGSI v3.2. Política de Seguridad aprobada Directorio Nov-2025. Informe auditoría externa ISO 2024.',
          observations: 'El SGSI fue certificado ISO 27001 en 2022 pero la renovación 2024 está pendiente. Hay 12 no conformidades abiertas de la auditoría externa.',
        },
        conclusion: 'El SGSI tiene una base sólida pero requiere atención urgente para la renovación de la certificación ISO 27001. Se identificaron áreas de alto riesgo para evaluación.',
        version: 2, aiAssisted: false,
        tickMarks: [], crossReferences: [],
      },
      {
        id: 'wp-02-b01', code: 'B-01', indexSection: 'B', title: 'Evaluación de controles de gestión de accesos e identidades',
        type: WorkingPaperType.CONTROL_EVALUATION, status: WorkingPaperStatus.IN_REVIEW,
        auditId: a2.id, preparedById: auditor2.id, reviewedById: senior.id,
        content: {
          objective: 'Evaluar los controles de gestión de accesos privilegiados, revisión de usuarios y segregación de funciones en los sistemas críticos.',
          scope: 'Sistemas críticos: SAP ERP, Active Directory, plataforma cloud AWS. Universo: 847 usuarios activos.',
          procedures: '1. Inventario de usuarios privilegiados en todos los sistemas.\n2. Revisión de usuarios inactivos (>90 días sin acceso).\n3. Verificación de proceso de revocación de accesos en desvinculaciones.\n4. Análisis de cuentas compartidas o genéricas.',
          evidence: 'Reporte AD de usuarios activos. Log de accesos SAP. Nómina RRHH vs. usuarios activos (comparación).',
          observations: 'Se identificaron 23 usuarios con acceso activo en AD pero desvinculados según RRHH. 15 cuentas genéricas activas sin dueño asignado.',
        },
        conclusion: 'EN PROCESO — pendiente análisis de cuentas privilegiadas en AWS y validación de hallazgo de usuarios desvinculados.',
        version: 1, aiAssisted: true,
        tickMarks: [], crossReferences: ['A-01'],
      },
      {
        id: 'wp-02-b02', code: 'B-02', indexSection: 'B', title: 'Evaluación de controles de seguridad perimetral y vulnerabilidades',
        type: WorkingPaperType.CONTROL_EVALUATION, status: WorkingPaperStatus.DRAFT,
        auditId: a2.id, preparedById: auditor2.id, reviewedById: senior.id,
        content: {
          objective: 'Evaluar los controles de seguridad perimetral, gestión de parches y vulnerabilidades en la infraestructura de TI.',
          scope: 'Infraestructura on-premise y cloud AWS. Período: enero 2026.',
          procedures: '1. Revisión del proceso de gestión de vulnerabilidades (frecuencia de scans, SLA de remediación).\n2. Verificación de últimas actualizaciones de seguridad aplicadas.\n3. Revisión de reglas de firewall.\n4. Análisis del último pentest disponible.',
          evidence: '',
          observations: 'EN PROCESO — evidencia pendiente de recopilación.',
        },
        conclusion: '',
        version: 1, aiAssisted: false,
        tickMarks: [], crossReferences: ['A-01', 'B-01'],
      },
      {
        id: 'wp-02-c01', code: 'C-01', indexSection: 'C', title: 'Prueba sustantiva — Análisis de log de accesos privilegiados',
        type: WorkingPaperType.SUBSTANTIVE_TEST, status: WorkingPaperStatus.DRAFT,
        auditId: a2.id, preparedById: senior.id, reviewedById: manager.id,
        content: {
          objective: 'Analizar los accesos privilegiados realizados en los sistemas críticos durante enero 2026 para detectar accesos no autorizados o fuera de horario.',
          scope: 'SAP ERP — perfil BASIS. Active Directory — Administradores de dominio. AWS — usuarios con policy AdministratorAccess.',
          procedures: '',
          evidence: '',
          observations: 'EN PROCESO.',
        },
        conclusion: '',
        version: 1, aiAssisted: false,
        tickMarks: [], crossReferences: ['B-01'],
      },
    ],
  });

  // — Tick marks Auditoría 2
  await prisma.tickMarkEntry.createMany({
    data: [
      { id:'tm-02-01', paperId:'wp-02-b01', fieldPath:'Usuarios desvinculados con acceso activo AD (23)', tickMark:TickMark.EXCEPTION, note:'Riesgo crítico — ver Hallazgo B-01', createdBy:auditor2.id },
      { id:'tm-02-02', paperId:'wp-02-b01', fieldPath:'Cuentas genéricas sin dueño asignado (15)', tickMark:TickMark.EXCEPTION, note:'Incumple política IAM-03', createdBy:auditor2.id },
      { id:'tm-02-03', paperId:'wp-02-b01', fieldPath:'Total usuarios activos verificados (847)', tickMark:TickMark.VERIFIED, note:'Cruzado con nómina RRHH al 31-01-2026', createdBy:auditor2.id },
      { id:'tm-02-04', paperId:'wp-02-b01', fieldPath:'Proceso baja de accesos documentado', tickMark:TickMark.ATTENTION, note:'Proceso existe pero no se cumple — pendiente mayor evidencia', createdBy:senior.id },
    ],
  });

  // — WP Comments Auditoría 2
  await prisma.workingPaperComment.createMany({
    data: [
      { id:'wc-02-01', paperId:'wp-02-b01', authorId:senior.id, content:'Ampliar el análisis de los 23 usuarios desvinculados: ¿cuándo fue su última actividad? ¿accedieron a datos sensibles?', resolved:false },
      { id:'wc-02-02', paperId:'wp-02-b01', authorId:manager.id, content:'Confirmar que el hallazgo CRÍTICO ya fue reportado verbalmente al CISO con carácter urgente.', resolved:true, resolvedBy:senior.id },
    ],
  });

  // — Hallazgos Auditoría 2 (3)
  await prisma.finding.createMany({
    data: [
      {
        id:'f-02-01',
        auditId: a2.id, organizationId: org.id,
        title: 'Accesos activos de 23 ex-empleados en sistemas críticos',
        severity: FindingSeverity.CRITICAL,
        status: FindingStatus.IN_PROGRESS,
        condition: 'Se identificaron 23 cuentas de usuario activas en Active Directory que corresponden a personas desvinculadas de la empresa en los últimos 12 meses.',
        criteria: 'ISO 27001:2022 Control A.5.18 establece que los derechos de acceso deben ser revocados inmediatamente al término de la relación laboral.',
        cause: 'El proceso de offboarding no incluye una notificación automática al área de TI. La comunicación se realiza manualmente y con demoras de hasta 30 días.',
        effect: 'Acceso no autorizado potencial a sistemas críticos (SAP, correo corporativo, repositorios de código). Riesgo de exfiltración de información confidencial.',
        risk: 'Riesgo CRÍTICO de seguridad. Incumplimiento regulatorio (Ley 21.719 Protección de Datos). Daño reputacional potencial.',
        recommendation: '1. Deshabilitar las 23 cuentas inmediatamente.\n2. Revisar logs de actividad de las cuentas en los últimos 90 días.\n3. Implementar proceso automatizado de notificación TI-RRHH en desvinculaciones (plazo: 24 horas).',
        effectAmount: 0, isMaterial: false,
        normativeReference: 'ISO 27001:2022', normativeArticle: 'Control A.5.18 — Derechos de acceso',
        qualityScore: 88, isRecurring: false, escalationLevel: 'MANAGER',
        dueDate: d('2026-02-15'),
        responsibleId: senior.id,
      },
      {
        id:'f-02-02',
        auditId: a2.id, organizationId: org.id,
        title: 'Cuentas genéricas y compartidas en sistemas productivos',
        severity: FindingSeverity.HIGH,
        status: FindingStatus.IN_REVIEW,
        condition: 'Se identificaron 15 cuentas de usuario genéricas o compartidas activas en sistemas productivos (SAP, plataforma CRM, herramientas de monitoreo).',
        criteria: 'ISO 27001:2022 Control A.5.16 y política IAM-03 establecen que cada usuario debe tener una cuenta individual e intransferible para garantizar la trazabilidad.',
        cause: 'Práctica heredada de administración que permitía cuentas compartidas para equipos de trabajo. No ha sido eliminada tras la implementación del SGSI.',
        effect: 'Imposibilidad de auditar acciones específicas ante un incidente. Riesgo de acceso no autorizado si las credenciales compartidas son comprometidas.',
        risk: 'Riesgo de seguridad alto. Impacto en trazabilidad forense.',
        recommendation: 'Eliminar todas las cuentas genéricas y asignar cuentas individuales. Plazo: 60 días.',
        qualityScore: 74, isRecurring: false, escalationLevel: 'NONE',
        dueDate: d('2026-03-15'),
        responsibleId: auditor2.id,
      },
      {
        id:'f-02-03',
        auditId: a2.id, organizationId: org.id,
        title: 'Certificación ISO 27001 vencida sin plan de renovación aprobado',
        severity: FindingSeverity.MEDIUM,
        status: FindingStatus.DRAFT,
        condition: 'La certificación ISO 27001:2022 de la organización venció en agosto 2025 y a la fecha no existe un plan de renovación formalmente aprobado.',
        criteria: 'El Directorio estableció en su política de gobierno de TI que la certificación ISO 27001 debe mantenerse vigente como requisito de los principales contratos con clientes.',
        cause: 'Cambio de proveedor de auditoría certificadora y demoras en el proceso de selección del nuevo proveedor. Presupuesto no asignado formalmente para 2026.',
        effect: 'Incumplimiento contractual con 3 clientes corporativos que exigen la certificación vigente. Riesgo de pérdida de contratos por valor estimado $280M CLP.',
        risk: 'Riesgo legal y comercial significativo.',
        recommendation: 'Aprobar plan y presupuesto de renovación en próximo Directorio (marzo 2026). Informar proactivamente a clientes afectados.',
        effectAmount: 280000000, isMaterial: true,
        qualityScore: 52, isRecurring: false, escalationLevel: 'NONE',
        dueDate: d('2026-04-30'),
        responsibleId: manager.id,
      },
    ],
  });

  // — PBC Requests Auditoría 2 (2)
  await prisma.pbcRequest.createMany({
    data: [
      {
        id: 'pbc-02-01',
        auditId: a2.id, organizationId: org.id,
        title: 'Inventario de sistemas críticos y matriz de accesos',
        description: 'Requerir el inventario actualizado de sistemas de información críticos y la matriz de accesos por perfil y sistema.',
        requestedToEmail: 'ti@demo.cl',
        requestedToName: 'Felipe Araya — Jefe de TI',
        dueDate: d('2026-02-01'),
        portalToken: 'demo-portal-token-pbc-02-01',
        status: PbcRequestStatus.SUBMITTED,
        submittedAt: d('2026-01-30'),
        fileUrls: ['Inventario_Sistemas_Criticos_2026.xlsx', 'Matriz_Accesos_SAP.pdf'],
        createdById: senior.id,
      },
      {
        id: 'pbc-02-02',
        auditId: a2.id, organizationId: org.id,
        title: 'Reportes de gestión de vulnerabilidades — Enero 2026',
        description: 'Solicitar los reportes del último scan de vulnerabilidades y el registro de remediaciones pendientes.',
        requestedToEmail: 'seguridad@demo.cl',
        requestedToName: 'Carolina Mejías — Analista de Seguridad',
        dueDate: d('2026-02-10'),
        portalToken: 'demo-portal-token-pbc-02-02',
        status: PbcRequestStatus.PENDING,
        createdById: auditor2.id,
      },
    ],
  });

  // — PBC Messages Auditoría 2
  await prisma.pbcMessage.createMany({
    data: [
      { id:'pbcm-02-01', requestId:'pbc-02-01', senderEmail:'senior@demo.cl', senderName:'Javier Morales', isAuditor:true, content:'Felipe, adjunto la solicitud formal. Por favor incluir también los privilegios de administrador en cada sistema.' },
      { id:'pbcm-02-02', requestId:'pbc-02-01', senderEmail:'ti@demo.cl', senderName:'Felipe Araya', isAuditor:false, content:'Enviado. El inventario incluye 47 sistemas. La matriz de accesos adjunta tiene 847 usuarios. Avisen si necesitan más detalle de algún sistema.' },
    ],
  });

  // — Confirmaciones Externas Auditoría 2 (2 a clientes)
  await prisma.externalConfirmation.createMany({
    data: [
      {
        id: 'conf-02-01',
        auditId: a2.id,
        type: ConfirmationType.CLIENT,
        respondentName: 'Supermercados del Sur S.A.',
        respondentEmail: 'auditoria@surmercados.cl',
        amount: 45000000.00,
        accountRef: 'Cuenta por cobrar — Factura 2025-12-00145 al 2025-12-00198',
        sentAt: d('2026-02-10'),
        sentBy: senior.name,
        responseReceivedAt: d('2026-02-15'),
        responseContent: 'Confirmamos que al 31-12-2025 mantenemos una deuda con Empresa Demo S.A. por $45,000,000 CLP.',
        responseAmount: 45000000.00,
        difference: 0,
        status: ConfirmationStatus.RECONCILED,
      },
      {
        id: 'conf-02-02',
        auditId: a2.id,
        type: ConfirmationType.CLIENT,
        respondentName: 'Retail Express Ltda.',
        respondentEmail: 'contabilidad@retailexpress.cl',
        amount: 28500000.00,
        accountRef: 'CxC — Facturas diciembre 2025',
        sentAt: d('2026-02-10'),
        sentBy: senior.name,
        status: ConfirmationStatus.SENT,
      },
    ],
  });

  console.log(`✅  Auditoría 2 (IN_PROGRESS): 4 WPs, 3 hallazgos, 2 PBCs, 2 confirmaciones clientes`);

  // ══════════════════════════════════════════════════════════════
  // 4C. AUDITORÍA 3 — Procesos Operacionales 2026 (PLANNING)
  // ══════════════════════════════════════════════════════════════
  const a3 = await prisma.audit.create({
    data: {
      id: 'audit-03',
      title: 'Auditoría de Procesos Operacionales 2026',
      type: AuditType.OPERATIONAL,
      status: AuditStatus.PLANNING,
      organizationId: org.id,
      auditEntityId: 'ent-10',
      leadAuditorId: senior.id,
      startDate: d('2026-04-01'),
      endDate:   d('2026-06-30'),
      estimatedHours: 180, actualHours: 0,
      scope: 'Evaluación de los procesos operacionales: compras y contratos, logística y distribución, y gestión de proveedores críticos.',
      objectives: 'Evaluar la eficiencia y cumplimiento normativo de los procesos operacionales con énfasis en la cadena de abastecimiento.',
      materiality: 300000,
      auditRiskModel: { inherentRisk: 0.55, controlRisk: 0.50, detectionRisk: 0.18, auditRisk: 0.05 },
      isInvestigationMode: false,
    },
  });

  await prisma.auditTeam.createMany({
    data: [
      { auditId: a3.id, userId: senior.id,   role: 'LEAD' },
      { auditId: a3.id, userId: auditor2.id, role: 'AUDITOR' },
    ],
    skipDuplicates: true,
  });

  // — Working Papers Auditoría 3 (2 borradores)
  await prisma.workingPaper.createMany({
    data: [
      {
        id: 'wp-03-a01', code: 'A-01', indexSection: 'A', title: 'Planificación y entendimiento — Procesos Operacionales',
        type: WorkingPaperType.PLANNING_UNDERSTANDING, status: WorkingPaperStatus.DRAFT,
        auditId: a3.id, preparedById: senior.id, reviewedById: manager.id,
        content: {
          objective: 'Documentar el entendimiento de los procesos operacionales sujetos a auditoría: compras, contratos, logística y distribución.',
          scope: 'Ejercicio enero-marzo 2026 (referencia). Auditoría cubrirá el ejercicio completo 2026.',
          procedures: '',
          evidence: '',
          observations: 'EN ELABORACIÓN — planificación en curso.',
        },
        conclusion: '',
        version: 1, aiAssisted: false,
        tickMarks: [], crossReferences: [],
      },
      {
        id: 'wp-03-ad01', code: 'AD-01', indexSection: 'AD', title: 'Archivo administrativo — Carta de encargo y alcance',
        type: WorkingPaperType.DATA_ANALYSIS, status: WorkingPaperStatus.DRAFT,
        auditId: a3.id, preparedById: auditor2.id, reviewedById: senior.id,
        content: {
          objective: 'Documentar la carta de encargo y el acuerdo de alcance firmado con la Gerencia.',
          scope: 'Documentación de inicio de auditoría.',
          procedures: '1. Preparar carta de encargo.\n2. Obtener firma de Gerencia General.\n3. Archivar en expediente de auditoría.',
          evidence: '',
          observations: 'Carta de encargo pendiente de firma.',
        },
        conclusion: '',
        version: 1, aiAssisted: false,
        tickMarks: [], crossReferences: [],
      },
    ],
  });

  // — Hallazgo Auditoría 3 (1 borrador)
  await prisma.finding.create({
    data: {
      id: 'f-03-01',
      auditId: a3.id, organizationId: org.id,
      title: 'Falta de evaluación formal de proveedores críticos',
      severity: FindingSeverity.MEDIUM,
      status: FindingStatus.DRAFT,
      condition: 'La empresa no cuenta con un proceso formal de evaluación y calificación de proveedores críticos (facturación > $10M CLP anual).',
      criteria: 'Las mejores prácticas de gestión de riesgos de terceros (ISO 31000, COSO) establecen que los proveedores críticos deben ser evaluados anualmente.',
      cause: 'No se ha definido una política de gestión de proveedores que incluya criterios de clasificación y evaluación periódica.',
      effect: 'Riesgo de continuidad operacional ante falla de proveedores críticos sin alternativas pre-calificadas.',
      risk: 'Riesgo operacional medio. Sin impacto financiero directo identificado a la fecha.',
      recommendation: 'Desarrollar e implementar una política de gestión de proveedores críticos con criterios de evaluación y aprobación.',
      qualityScore: 45, isRecurring: false, escalationLevel: 'NONE',
      dueDate: d('2026-07-31'),
      responsibleId: auditor2.id,
    },
  });

  // — PBC Request Auditoría 3 (1)
  await prisma.pbcRequest.create({
    data: {
      id: 'pbc-03-01',
      auditId: a3.id, organizationId: org.id,
      title: 'Listado de proveedores críticos y contratos vigentes',
      description: 'Listado de proveedores con facturación anual > $10M CLP y contratos vigentes con sus condiciones principales.',
      requestedToEmail: 'contratos@demo.cl',
      requestedToName: 'Patricia Vega — Jefa de Contratos',
      dueDate: d('2026-04-15'),
      portalToken: 'demo-portal-token-pbc-03-01',
      status: PbcRequestStatus.PENDING,
      createdById: senior.id,
    },
  });

  console.log(`✅  Auditoría 3 (PLANNING): 2 WPs, 1 hallazgo, 1 PBC`);

  // ══════════════════════════════════════════════════════════════
  // 5. REGISTROS DE RIESGO (para Auditoría 2 — TI)
  // ══════════════════════════════════════════════════════════════
  await prisma.riskRegister.createMany({
    data: [
      {
        id: 'risk-01',
        organizationId: org.id,
        auditEntityId: 'ent-06',
        title: 'Ransomware y cifrado malicioso de datos críticos',
        description: 'Un ataque de ransomware podría cifrar los sistemas productivos y bases de datos críticas, interrumpiendo las operaciones por días o semanas.',
        category: 'TI',
        probability: 4, impact: 5, inherentScore: 20,
        controlsScore: 3,
        residualScore: 12,
      },
      {
        id: 'risk-02',
        organizationId: org.id,
        auditEntityId: 'ent-07',
        title: 'Acceso no autorizado por credenciales comprometidas',
        description: 'Uso de credenciales de ex-empleados o phishing para acceder a sistemas productivos sin detección.',
        category: 'TI',
        probability: 4, impact: 5, inherentScore: 20,
        controlsScore: 2,
        residualScore: 16,
      },
      {
        id: 'risk-03',
        organizationId: org.id,
        auditEntityId: 'ent-16',
        title: 'Incumplimiento Ley de Prevención de Lavado de Activos',
        description: 'Falta de controles adecuados en la identificación de clientes y monitoreo de transacciones inusuales según Ley 19.913.',
        category: 'compliance',
        probability: 2, impact: 5, inherentScore: 10,
        controlsScore: 3,
        residualScore: 6,
      },
    ],
  });

  console.log(`✅  Registros de riesgo: 3`);

  // ══════════════════════════════════════════════════════════════
  // RESUMEN FINAL
  // ══════════════════════════════════════════════════════════════
  console.log('\n════════════════════════════════════════');
  console.log('🎉  Seed rico completado exitosamente');
  console.log('════════════════════════════════════════');
  console.log('Organización : Empresa Demo S.A.');
  console.log('Usuarios     : 5  (CAE, Manager, Senior, Auditor x2)');
  console.log('Entidades    : 20 (Financiero, TI, Operacional, Regulatorio, Gobierno)');
  console.log('Auditorías   : 3  (COMPLETED, IN_PROGRESS, PLANNING)');
  console.log('WPs          : 11 total (5 + 4 + 2)');
  console.log('Hallazgos    : 8  total (4 + 3 + 1)');
  console.log('PBC          : 6  total (3 + 2 + 1)');
  console.log('Confirmac.   : 5  total (3 bancarias + 2 clientes)');
  console.log('Tick marks   : 13 total');
  console.log('Riesgos      : 3');
  console.log('\nCredenciales demo (password: Auditoria2026$):');
  console.log('  cae@demo.cl      → CAE');
  console.log('  gerente@demo.cl  → AUDIT_MANAGER');
  console.log('  senior@demo.cl   → SENIOR_AUDITOR');
  console.log('  auditor@demo.cl  → AUDITOR');
  console.log('  auditor2@demo.cl → AUDITOR');
  console.log('\n⚠️  Ejecuta POST /api/v1/auth/setup-demo para sincronizar con Supabase Auth');
}

main()
  .catch((e) => {
    console.error('\n❌ Seed falló:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
