'use client';

import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Header } from '@/components/layout/Header';
import { apiClient } from '@/lib/api-client';
import {
  BarChart3, Play, Loader2, AlertCircle, CheckCircle2,
  TrendingUp, Search, Database, FileSpreadsheet, Cpu,
  ChevronDown, ChevronUp, Info, Upload, FileUp, X, ListChecks,
  AlertTriangle, RotateCcw, HelpCircle, FileDown, Table2,
  Target, FlaskConical, ScrollText, Save, ShieldAlert, Building2, Users, Receipt,
  CalendarClock, Gavel, Clock, Package, Layers, Ghost, Globe,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  fieldLabel, testLabel, formatValue, RISK_LEVEL_LABELS, CONFORMITY_LABELS,
} from '@/lib/caats-labels';
import { METHODOLOGY } from '@/lib/caats-methodology';
import { AnalysisResultView, type FindingLike } from '@/components/caats/CaatsResultView';
import { SaveAsWorkingPaperModal } from '@/components/caats/SaveAsWorkingPaperModal';
import { SecondaryDatasetUpload, type SecondaryDatasetValue } from '@/components/caats/SecondaryDatasetUpload';
import {
  type AnalysisId, type ParsedFile, FIELD_DEFS, SECONDARY_DATASET,
  normColName, autoMatchColumn, autoDetectNumericColumns,
} from '@/lib/caats-fields';

// ─── Analysis types ───────────────────────────────────────────────────────────

interface AnalysisType {
  id:          AnalysisId;
  label:       string;
  description: string;
  icon:        React.ElementType;
  color:       string;
  sampleKey:   string;
}

const ANALYSIS_TYPES: AnalysisType[] = [
  {
    id:          'gl',
    label:       'Libro Mayor (GL)',
    description: 'Detecta asientos fuera de horario, duplicados, montos redondos y entradas de alto riesgo.',
    icon:        Database,
    color:       'bg-blue-500',
    sampleKey:   'gl',
  },
  {
    id:          'ap',
    label:       'Cuentas por Pagar (AP)',
    description: 'Identifica pagos duplicados, proveedores fantasma y transacciones inusuales.',
    icon:        FileSpreadsheet,
    color:       'bg-indigo-500',
    sampleKey:   'ap',
  },
  {
    id:          'payroll',
    label:       'Nómina',
    description: 'Detecta empleados fantasma, pagos excesivos y anomalías en el ciclo de nómina.',
    icon:        TrendingUp,
    color:       'bg-green-500',
    sampleKey:   'payroll',
  },
  {
    id:          'benford',
    label:       "Ley de Benford",
    description: 'Prueba distribución de primeros dígitos para detectar manipulación de montos.',
    icon:        BarChart3,
    color:       'bg-purple-500',
    sampleKey:   'benford',
  },
  {
    id:          'anomaly',
    label:       'Detección de Anomalías (ML)',
    description: 'Isolation Forest para identificar transacciones estadísticamente atípicas.',
    icon:        Cpu,
    color:       'bg-red-500',
    sampleKey:   'anomaly',
  },
  {
    id:          'sod',
    label:       'Segregación de Funciones',
    description: 'Detecta usuarios con permisos incompatibles (crear proveedor + aprobar pago, etc.) sobre la matriz de accesos.',
    icon:        ShieldAlert,
    color:       'bg-amber-500',
    sampleKey:   'sod',
  },
  {
    id:          'vendor_master',
    label:       'Maestro de Proveedores',
    description: 'Detecta proveedores duplicados (mismo NIT o cuenta bancaria), reactivaciones no autorizadas e identidad débil.',
    icon:        Building2,
    color:       'bg-teal-500',
    sampleKey:   'vendor_master',
  },
  {
    id:          'related_parties',
    label:       'Partes Relacionadas',
    description: 'Cruza transacciones contra un registro de partes relacionadas/nómina para detectar conflictos de interés no revelados.',
    icon:        Users,
    color:       'bg-rose-500',
    sampleKey:   'related_parties',
  },
  {
    id:          'expenses',
    label:       'Gastos de Representación',
    description: 'Detecta fraccionamiento, gastos en fin de semana, duplicados y concentración en gastos de viáticos/representación.',
    icon:        Receipt,
    color:       'bg-cyan-500',
    sampleKey:   'expenses',
  },
  {
    id:          'revenue_cutoff',
    label:       'Corte de Ingresos',
    description: 'Cruza facturas cerca del cierre de período contra la fecha de entrega para detectar reconocimiento anticipado de ingresos.',
    icon:        CalendarClock,
    color:       'bg-lime-500',
    sampleKey:   'revenue_cutoff',
  },
  {
    id:          'bid_rigging',
    label:       'Licitación Colusoria',
    description: 'Detecta precios uniformes entre oferentes, ofertas perdedoras sospechosamente cercanas y tasas de adjudicación desproporcionadas.',
    icon:        Gavel,
    color:       'bg-orange-500',
    sampleKey:   'bid_rigging',
  },
  {
    id:          'ar_aging',
    label:       'Antigüedad de CxC',
    description: 'Calcula antigüedad de saldos por cliente y detecta notas de crédito de monto alto emitidas cerca del cierre.',
    icon:        Clock,
    color:       'bg-sky-500',
    sampleKey:   'ar_aging',
  },
  {
    id:          'fixed_assets',
    label:       'Activo Fijo',
    description: 'Recalcula depreciación esperada vs. registrada, activos totalmente depreciados aún en uso, y sin verificación física reciente.',
    icon:        Package,
    color:       'bg-fuchsia-500',
    sampleKey:   'fixed_assets',
  },
  {
    id:          'structuring',
    label:       'Pitufeo / Smurfing',
    description: 'Detecta transacciones cerca del umbral de reporte y patrones de fraccionamiento del mismo titular en ventanas cortas.',
    icon:        Layers,
    color:       'bg-violet-500',
    sampleKey:   'structuring',
  },
  {
    id:          'missing_trader',
    label:       'Missing Trader',
    description: 'Detecta proveedores con actividad concentrada en una ventana corta y volumen alto — firma transaccional del fraude carrusel de IVA.',
    icon:        Ghost,
    color:       'bg-slate-500',
    sampleKey:   'missing_trader',
  },
  {
    id:          'tax_haven',
    label:       'Jurisdicciones de Baja Tributación',
    description: 'Analiza concentración de transacciones hacia jurisdicciones de baja tributación (referencia, no lista oficial de Hacienda).',
    icon:        Globe,
    color:       'bg-emerald-500',
    sampleKey:   'tax_haven',
  },
];

// ─── Sample data ──────────────────────────────────────────────────────────────

// Nombres de campo alineados EXACTO con los defaults que espera cada analizador
// en apps/ai-service/app/services/caats/*.py (ver ai.service.ts→runCaats, que no
// manda field_mapping — así que estos nombres literales son los que se usan).
// Cada muestra trae al menos un hallazgo plantado y suficientes registros para
// pasar los mínimos estadísticos del backend (Benford ≥50, Anomalía/ML ≥10,
// outliers de nómina >10) — de lo contrario el análisis corre pero no encuentra
// nada, o se rechaza antes de intentarlo.
const SAMPLE_DATA: Record<string, unknown> = {
  gl: {
    records: [
      { date: '2026-01-15', account_code: '5010', description: 'Gastos operacionales', amount: 45000, posted_by: 'jsmith', time: '09:32' },
      { date: '2026-01-15', account_code: '5010', description: 'Gastos operacionales', amount: 45000, posted_by: 'jsmith', time: '09:33' },
      { date: '2026-01-20', account_code: '1010', description: 'Ajuste fin de mes',    amount: 1000000, posted_by: 'admin', time: '23:45' },
      { date: '2026-01-22', account_code: '2030', description: 'Provisión especial',   amount: 500000,  posted_by: 'admin', time: '22:10' },
      { date: '2026-02-01', account_code: '5020', description: 'Servicios profesionales', amount: 75000, posted_by: 'aperez', time: '14:05' },
    ],
  },
  ap: {
    records: [
      { invoice_number: 'INV-001', vendor_id: 'V-ABC', vendor_name: 'Consultores ABC', amount: 120000, invoice_date: '2026-01-10', bank_account: '123-456' },
      { invoice_number: 'INV-002', vendor_id: 'V-ABC', vendor_name: 'Consultores ABC', amount: 120000, invoice_date: '2026-01-11', bank_account: '123-456' },
      { invoice_number: 'INV-003', vendor_id: 'V-XYZ', vendor_name: 'Servicios XYZ',   amount: 45000,  invoice_date: '2026-01-12', bank_account: '789-012' },
      { invoice_number: 'INV-004', vendor_id: 'V-TEC', vendor_name: 'Tech Solutions',  amount: 980000, invoice_date: '2026-01-13', bank_account: '345-678' },
      { invoice_number: 'INV-005', vendor_id: 'V-TEC', vendor_name: 'Tech Solutions',  amount: 980000, invoice_date: '2026-01-14', bank_account: '345-678' },
    ],
  },
  payroll: {
    // >10 registros — habilita la prueba de outliers por Z-score (PAY_OUTLIERS).
    // E999 con nombre vacío dispara GHOST_EMPLOYEES; Carlos Pérez ($15M vs. ~$2M
    // del resto) dispara PAY_OUTLIERS.
    records: [
      { employee_id: 'E001', employee_name: 'Juan González',   gross_pay: 2500000,  days_worked: 30, department: 'IT' },
      { employee_id: 'E002', employee_name: 'María López',     gross_pay: 1800000,  days_worked: 30, department: 'Admin' },
      { employee_id: 'E003', employee_name: 'Carlos Pérez',    gross_pay: 15000000, days_worked: 30, department: 'IT' },
      { employee_id: 'E004', employee_name: 'Ana Rodríguez',   gross_pay: 2100000,  days_worked: 25, department: 'Ventas' },
      { employee_id: 'E005', employee_name: 'Pedro Martínez',  gross_pay: 1950000,  days_worked: 30, department: 'Ventas' },
      { employee_id: 'E006', employee_name: 'Lucía Fernández', gross_pay: 2200000,  days_worked: 30, department: 'IT' },
      { employee_id: 'E007', employee_name: 'Diego Ramírez',   gross_pay: 1750000,  days_worked: 30, department: 'Admin' },
      { employee_id: 'E008', employee_name: 'Sofía Torres',    gross_pay: 2050000,  days_worked: 30, department: 'Ventas' },
      { employee_id: 'E009', employee_name: 'Miguel Castro',   gross_pay: 1900000,  days_worked: 28, department: 'IT' },
      { employee_id: 'E010', employee_name: 'Valeria Ortiz',   gross_pay: 2300000,  days_worked: 30, department: 'Admin' },
      { employee_id: 'E011', employee_name: 'Roberto Silva',   gross_pay: 2000000,  days_worked: 30, department: 'Ventas' },
      { employee_id: 'E012', employee_name: 'Camila Vargas',   gross_pay: 1850000,  days_worked: 30, department: 'IT' },
      { employee_id: 'E013', employee_name: 'Andrés Molina',   gross_pay: 2150000,  days_worked: 30, department: 'Admin' },
      { employee_id: 'E999', employee_name: '',                gross_pay: 3200000,  days_worked: 30, department: 'NONE' },
      { employee_id: 'E014', employee_name: 'Gabriela Ríos',   gross_pay: 1980000,  days_worked: 30, department: 'Ventas' },
    ],
  },
  benford: {
    // 60 montos — el backend exige mínimo 50. 45 "naturales" con distribución
    // aproximada a Benford + 15 concentrados en dígito inicial 9, justo debajo
    // de un umbral de $100,000 (indicio clásico de fraccionamiento para evitar
    // aprobación) — sesga la distribución lo suficiente para disparar
    // SUSPECT/NON_CONFORMING y demostrar el caso de uso real.
    amounts: [
      1200, 1450, 1890, 1050, 1670, 1320, 1780, 1990, 1120, 1560, 1234, 1099, 1670, 1450, 1990,
      2340, 2870, 2100, 2560, 2990, 2450, 2780, 2340, 2120,
      3120, 3450, 3890, 3670, 3230,
      4560, 4120, 4890, 4340,
      5670, 5120, 5890,
      6340, 6780, 6120,
      7450, 7890,
      8120, 8670,
      9340, 9780,
      91200, 92500, 93800, 94100, 95600, 96900, 97200, 98500, 99100, 91800, 93400, 95000, 96200, 97800, 99900,
    ],
  },
  anomaly: {
    // 13 registros — el backend exige mínimo 10. Se conservan los 2 outliers
    // extremos originales (madrugada, sin actividad previa del usuario) sobre
    // una base más amplia de transacciones "normales" para que Isolation
    // Forest tenga contra qué comparar.
    records: [
      { amount: 45000, hour: 9,  day_of_week: 1, user_transactions: 12 },
      { amount: 52000, hour: 10, day_of_week: 2, user_transactions: 15 },
      { amount: 48000, hour: 11, day_of_week: 1, user_transactions: 10 },
      { amount: 51000, hour: 14, day_of_week: 3, user_transactions: 18 },
      { amount: 44000, hour: 9,  day_of_week: 4, user_transactions: 11 },
      { amount: 49500, hour: 13, day_of_week: 2, user_transactions: 14 },
      { amount: 47000, hour: 10, day_of_week: 5, user_transactions: 13 },
      { amount: 53000, hour: 15, day_of_week: 1, user_transactions: 16 },
      { amount: 46000, hour: 11, day_of_week: 3, user_transactions: 9 },
      { amount: 50000, hour: 12, day_of_week: 4, user_transactions: 17 },
      { amount: 960000, hour: 23, day_of_week: 6, user_transactions: 1 },
      { amount: 1200000, hour: 2, day_of_week: 0, user_transactions: 0 },
      { amount: 48500, hour: 9,  day_of_week: 2, user_transactions: 12 },
    ],
    numeric_fields: ['amount', 'hour', 'day_of_week', 'user_transactions'],
  },
  sod: {
    // Un registro por permiso asignado. U001/U002/U004/U007 disparan un
    // conflicto puntual del catálogo; U005 (admin) dispara un conflicto Y la
    // prueba de concentración (4 categorías sensibles); U003/U006 quedan
    // limpios para mostrar que el motor no marca todo indiscriminadamente.
    records: [
      { user: 'U001', user_name: 'Carlos Ramírez', permission: 'Crear Proveedor',            department: 'Compras' },
      { user: 'U001', user_name: 'Carlos Ramírez', permission: 'Aprobar Pago',                department: 'Compras' },
      { user: 'U002', user_name: 'Ana Torres',      permission: 'Registrar Asiento Contable',  department: 'Contabilidad' },
      { user: 'U002', user_name: 'Ana Torres',      permission: 'Conciliación Bancaria',       department: 'Contabilidad' },
      { user: 'U003', user_name: 'Luis Pérez',      permission: 'Crear Orden de Compra',       department: 'Compras' },
      { user: 'U004', user_name: 'María Gómez',     permission: 'Procesar Nómina',             department: 'RRHH' },
      { user: 'U004', user_name: 'María Gómez',     permission: 'Aprobar Nómina',              department: 'RRHH' },
      { user: 'U005', user_name: 'admin',           permission: 'Crear Proveedor',             department: 'TI' },
      { user: 'U005', user_name: 'admin',           permission: 'Aprobar Pago',                department: 'TI' },
      { user: 'U005', user_name: 'admin',           permission: 'Registrar Asiento Contable',  department: 'TI' },
      { user: 'U005', user_name: 'admin',           permission: 'Administración de Accesos',   department: 'TI' },
      { user: 'U006', user_name: 'Jorge Díaz',      permission: 'Aprobar Orden de Compra',     department: 'Compras' },
      { user: 'U007', user_name: 'Sofía Reyes',     permission: 'Crear Cliente',               department: 'Ventas' },
      { user: 'U007', user_name: 'Sofía Reyes',     permission: 'Aplicar Nota de Crédito',      department: 'Ventas' },
    ],
  },
  vendor_master: {
    // 10 proveedores — V003/V004 comparten NIT (nombres distintos), V005/V006
    // comparten cuenta bancaria, V007 tiene identidad débil (nombre genérico
    // + sin NIT/dirección), V008 está "Inactivo" pero con actividad muy
    // reciente, V009/V010 comparten dirección (señal más débil).
    records: [
      { vendor_id: 'V001', vendor_name: 'Importadora Continental SA',   tax_id: 'NIT-0614-010101-001-1', bank_account: '123-456789-0', address: 'Blvd. del Ejército #100, San Salvador', status: 'Activo',   last_activity_date: '2025-08-10' },
      { vendor_id: 'V002', vendor_name: 'Distribuciones del Norte SA',  tax_id: 'NIT-0614-020202-002-2', bank_account: '234-567890-1', address: 'Calle Nueva #45, Santa Ana',            status: 'Activo',   last_activity_date: '2025-07-22' },
      { vendor_id: 'V003', vendor_name: 'Comercial Rivas SA',           tax_id: 'NIT-0614-030303-003-3', bank_account: '345-678901-2', address: 'Av. Los Próceres #12, San Salvador',    status: 'Activo',   last_activity_date: '2025-08-01' },
      { vendor_id: 'V004', vendor_name: 'Rivas Import Export SA',       tax_id: 'NIT-0614-030303-003-3', bank_account: '456-789012-3', address: 'Colonia Escalón #78, San Salvador',     status: 'Activo',   last_activity_date: '2025-06-15' },
      { vendor_id: 'V005', vendor_name: 'Servicios XYZ',                tax_id: 'NIT-0614-050505-005-5', bank_account: '567-890123-4', address: 'Zona Industrial #5, Soyapango',         status: 'Activo',   last_activity_date: '2025-05-10' },
      { vendor_id: 'V006', vendor_name: 'Consultores ABC',              tax_id: 'NIT-0614-060606-006-6', bank_account: '567-890123-4', address: 'Torre Futura Piso 3, San Salvador',     status: 'Activo',   last_activity_date: '2025-04-18' },
      { vendor_id: 'V007', vendor_name: 'Proveedor Temporal',           tax_id: '',                      bank_account: '901-234567-8', address: '',                                       status: 'Activo',   last_activity_date: '2025-03-01' },
      { vendor_id: 'V008', vendor_name: 'Suministros del Este SA',      tax_id: 'NIT-0614-080808-008-8', bank_account: '678-901234-5', address: 'Carretera a San Miguel Km 30',           status: 'Inactivo', last_activity_date: '2025-08-20' },
      { vendor_id: 'V009', vendor_name: 'Tech Solutions SA',            tax_id: 'NIT-0614-090909-009-9', bank_account: '789-012345-6', address: 'Plaza Mundo Local 45, San Salvador',    status: 'Activo',   last_activity_date: '2025-06-01' },
      { vendor_id: 'V010', vendor_name: 'Soluciones Tecnológicas SA',   tax_id: 'NIT-0614-101010-010-0', bank_account: '890-123456-7', address: 'Plaza Mundo Local 45, San Salvador',    status: 'Activo',   last_activity_date: '2025-05-20' },
    ],
  },
  related_parties: {
    // Único motor con DOS datasets: records = transacciones, reference_records
    // = registro de partes relacionadas. "Comercial Familiar SA" y "Carlos
    // Ramírez Servicios" matchean por NIT exacto (señal fuerte); "Juan Pérez
    // Consultores" matchea solo por nombre contra "Juan Pérez" (señal débil,
    // sin NIT); "Distribuidora Zeta" y "Proveedor Externo SA" quedan limpios.
    records: [
      { vendor_name: 'Comercial Familiar SA',    amount: 85000, tax_id: 'CF-004', date: '2025-04-12' },
      { vendor_name: 'Distribuidora Zeta',       amount: 22000, tax_id: 'DZ-999', date: '2025-05-03' },
      { vendor_name: 'Juan Pérez Consultores',   amount: 15000, tax_id: '',       date: '2025-03-20' },
      { vendor_name: 'Carlos Ramírez Servicios', amount: 9000,  tax_id: 'CR-003', date: '2025-06-08' },
      { vendor_name: 'Proveedor Externo SA',     amount: 30000, tax_id: 'PE-100', date: '2025-06-15' },
    ],
    reference_records: [
      { party_name: 'Juan Pérez',           relationship: 'Director',   tax_id: 'JP-001' },
      { party_name: 'María López',          relationship: 'Accionista', tax_id: 'ML-002' },
      { party_name: 'Carlos Ramírez',       relationship: 'Empleado',   tax_id: 'CR-003' },
      { party_name: 'Comercial Familiar SA', relationship: 'Filial',    tax_id: 'CF-004' },
    ],
  },
  expenses: {
    // Ana Gómez: $92 (justo bajo el umbral de $100) + dos gastos el mismo día
    // que suman $105 (fraccionamiento). Carlos Ruiz: gasto en sábado. Diego
    // Paz: mismo monto/fecha dos veces (duplicado). Sofía Lima: concentra la
    // mayoría del gasto total (ejecutiva con viajes frecuentes, legítimo pero
    // amerita revisión). Luis Vega y Marta Cruz quedan limpios.
    records: [
      { employee_name: 'Ana Gómez',    amount: 92,   date: '2025-03-03', category: 'Comidas',        approved_by: 'Jefe Comercial' },
      { employee_name: 'Ana Gómez',    amount: 55,   date: '2025-03-04', category: 'Transporte',     approved_by: 'Jefe Comercial' },
      { employee_name: 'Ana Gómez',    amount: 50,   date: '2025-03-04', category: 'Transporte',     approved_by: 'Jefe Comercial' },
      { employee_name: 'Carlos Ruiz',  amount: 150,  date: '2025-04-12', category: 'Hospedaje',      approved_by: 'Jefe Operaciones' },
      { employee_name: 'Diego Paz',    amount: 200,  date: '2025-05-10', category: 'Cena con Cliente', approved_by: 'Gerente Ventas' },
      { employee_name: 'Diego Paz',    amount: 200,  date: '2025-05-10', category: 'Cena con Cliente', approved_by: 'Gerente Ventas' },
      { employee_name: 'Sofía Lima',   amount: 1500, date: '2025-02-05', category: 'Viaje Internacional', approved_by: 'Dirección' },
      { employee_name: 'Sofía Lima',   amount: 1500, date: '2025-03-18', category: 'Viaje Internacional', approved_by: 'Dirección' },
      { employee_name: 'Sofía Lima',   amount: 1500, date: '2025-04-22', category: 'Viaje Internacional', approved_by: 'Dirección' },
      { employee_name: 'Sofía Lima',   amount: 1500, date: '2025-06-14', category: 'Viaje Internacional', approved_by: 'Dirección' },
      { employee_name: 'Luis Vega',    amount: 300,  date: '2025-02-15', category: 'Combustible',    approved_by: 'Jefe Operaciones' },
      { employee_name: 'Marta Cruz',   amount: 250,  date: '2025-06-01', category: 'Comidas',        approved_by: 'Jefe Comercial' },
    ],
  },
  revenue_cutoff: {
    // 5 facturas repartidas en el período (línea base) + 4 en los últimos días
    // del cierre (2025-06-27..30): 2 sin guía de despacho, 1 con entrega 7 días
    // después (mismatch), 1 con entrega el mismo día (limpia). El volumen de
    // esos 4 días también dispara la prueba de concentración.
    records: [
      { customer_name: 'Cliente A', amount: 5000,  date: '2025-01-15', delivery_date: '2025-01-16', invoice_number: 'F-001' },
      { customer_name: 'Cliente B', amount: 4500,  date: '2025-02-20', delivery_date: '2025-02-21', invoice_number: 'F-002' },
      { customer_name: 'Cliente C', amount: 6000,  date: '2025-03-10', delivery_date: '2025-03-11', invoice_number: 'F-003' },
      { customer_name: 'Cliente A', amount: 5500,  date: '2025-04-05', delivery_date: '2025-04-06', invoice_number: 'F-004' },
      { customer_name: 'Cliente D', amount: 4800,  date: '2025-05-12', delivery_date: '2025-05-13', invoice_number: 'F-005' },
      { customer_name: 'Cliente E', amount: 12000, date: '2025-06-27', delivery_date: '',           invoice_number: 'F-006' },
      { customer_name: 'Cliente F', amount: 11000, date: '2025-06-28', delivery_date: '2025-07-05',  invoice_number: 'F-007' },
      { customer_name: 'Cliente A', amount: 9000,  date: '2025-06-29', delivery_date: '2025-06-29', invoice_number: 'F-008' },
      { customer_name: 'Cliente G', amount: 13000, date: '2025-06-30', delivery_date: '',           invoice_number: 'F-009' },
    ],
  },
  bid_rigging: {
    // T-001: 4 oferentes con precios casi idénticos (uniformidad) y 3 ofertas
    // perdedoras muy cerca del ganador. T-002: proceso competitivo normal
    // (sin patrón). T-003: normal. Proveedor D gana 2 de 3 procesos en los que
    // participa → tasa de adjudicación desproporcionada.
    records: [
      { tender_id: 'T-001', bidder_name: 'Proveedor D', amount: 99500,  is_winner: 'Sí' },
      { tender_id: 'T-001', bidder_name: 'Proveedor A', amount: 100000, is_winner: 'No' },
      { tender_id: 'T-001', bidder_name: 'Proveedor B', amount: 100800, is_winner: 'No' },
      { tender_id: 'T-001', bidder_name: 'Proveedor C', amount: 101200, is_winner: 'No' },
      { tender_id: 'T-002', bidder_name: 'Proveedor E', amount: 50000,  is_winner: 'Sí' },
      { tender_id: 'T-002', bidder_name: 'Proveedor F', amount: 65000,  is_winner: 'No' },
      { tender_id: 'T-002', bidder_name: 'Proveedor G', amount: 72000,  is_winner: 'No' },
      { tender_id: 'T-002', bidder_name: 'Proveedor D', amount: 68000,  is_winner: 'No' },
      { tender_id: 'T-003', bidder_name: 'Proveedor D', amount: 30000,  is_winner: 'Sí' },
      { tender_id: 'T-003', bidder_name: 'Proveedor H', amount: 34000,  is_winner: 'No' },
      { tender_id: 'T-003', bidder_name: 'Proveedor I', amount: 36000,  is_winner: 'No' },
    ],
  },
  ar_aging: {
    // Cliente D concentra 2 facturas 90+ días vencidas ($27,000 de $49,000
    // total — >50%). Cliente F también 90+. Cliente A tiene una nota de
    // crédito emitida cerca del cierre de período.
    records: [
      { customer_name: 'Cliente A', amount: 3000,  due_date: '2025-06-20', date: '2025-05-20' },
      { customer_name: 'Cliente B', amount: 4000,  due_date: '2025-05-15', date: '2025-04-15' },
      { customer_name: 'Cliente C', amount: 5000,  due_date: '2025-04-20', date: '2025-03-20' },
      { customer_name: 'Cliente D', amount: 15000, due_date: '2025-02-01', date: '2025-01-01' },
      { customer_name: 'Cliente D', amount: 12000, due_date: '2025-01-15', date: '2024-12-15' },
      { customer_name: 'Cliente E', amount: 2000,  due_date: '2025-06-30', date: '2025-05-30' },
      { customer_name: 'Cliente F', amount: 8000,  due_date: '2025-03-10', date: '2025-02-10' },
      { customer_name: 'Cliente A', amount: 1500,  due_date: '2025-06-22', date: '2025-06-22', is_credit_note: 'Sí' },
    ],
  },
  fixed_assets: {
    // Vehículo: totalmente depreciado pero sigue "Activo" + sin verificación
    // física reciente. Computadoras: depreciación registrada muy por debajo
    // de la esperada. Mobiliario: correcta pero nunca verificada físicamente.
    // Maquinaria: recién adquirida (fija la fecha de referencia). Equipo
    // Descontinuado: dado de baja, correcto, no dispara nada.
    records: [
      { asset_id: 'AF-001', asset_name: 'Vehículo de Reparto 1', cost: 25000, acquisition_date: '2019-01-15', useful_life_years: 5,  accumulated_depreciation: 25000, status: 'Activo',        last_physical_check_date: '2021-01-01' },
      { asset_id: 'AF-002', asset_name: 'Computadoras Oficina',  cost: 12000, acquisition_date: '2023-06-01', useful_life_years: 3,  accumulated_depreciation: 2000,  status: 'Activo',        last_physical_check_date: '2025-01-01' },
      { asset_id: 'AF-003', asset_name: 'Mobiliario',            cost: 8000,  acquisition_date: '2022-03-01', useful_life_years: 10, accumulated_depreciation: 2600,  status: 'Activo',        last_physical_check_date: '' },
      { asset_id: 'AF-004', asset_name: 'Maquinaria Industrial', cost: 50000, acquisition_date: '2025-06-01', useful_life_years: 8,  accumulated_depreciation: 0,     status: 'Activo',        last_physical_check_date: '2025-06-01' },
      { asset_id: 'AF-005', asset_name: 'Equipo Descontinuado',  cost: 6000,  acquisition_date: '2015-01-01', useful_life_years: 5,  accumulated_depreciation: 6000,  status: 'Dado de Baja',  last_physical_check_date: '2024-01-01' },
    ],
  },
  structuring: {
    // Juan Pérez: 3 depósitos de $3,500 en 3 días consecutivos (suman
    // $10,500 — fraccionamiento clásico). María Gómez: un depósito de $9,500
    // (95% del umbral de $10,000). Carlos Ruiz y Ana Torres quedan limpios.
    records: [
      { account_holder: 'Juan Pérez',   amount: 3500, date: '2025-03-01' },
      { account_holder: 'Juan Pérez',   amount: 3500, date: '2025-03-02' },
      { account_holder: 'Juan Pérez',   amount: 3500, date: '2025-03-03' },
      { account_holder: 'María Gómez',  amount: 9500, date: '2025-04-10' },
      { account_holder: 'Carlos Ruiz',  amount: 2000, date: '2025-05-01' },
      { account_holder: 'Ana Torres',   amount: 1500, date: '2025-05-15' },
    ],
  },
  missing_trader: {
    // Suministros Rápidos SA e Import Fugaz SA concentran su actividad en
    // menos de 30 días con volumen alto (burst). Import Fugaz además no tiene
    // NIT ni dirección registrada. Proveedor Histórico/Distribuidora
    // Central/Comercial del Sur tienen actividad larga — quedan limpios.
    records: [
      { vendor_name: 'Suministros Rápidos SA', amount: 30000, date: '2025-05-01', tax_id: 'SR-001', address: 'Zona Industrial, San Salvador' },
      { vendor_name: 'Suministros Rápidos SA', amount: 25000, date: '2025-05-10', tax_id: 'SR-001', address: 'Zona Industrial, San Salvador' },
      { vendor_name: 'Suministros Rápidos SA', amount: 25000, date: '2025-05-20', tax_id: 'SR-001', address: 'Zona Industrial, San Salvador' },
      { vendor_name: 'Proveedor Histórico SA',  amount: 8000,  date: '2025-01-15', tax_id: 'PH-002', address: 'Col. Escalón, San Salvador' },
      { vendor_name: 'Proveedor Histórico SA',  amount: 12000, date: '2025-03-10', tax_id: 'PH-002', address: 'Col. Escalón, San Salvador' },
      { vendor_name: 'Proveedor Histórico SA',  amount: 20000, date: '2025-06-01', tax_id: 'PH-002', address: 'Col. Escalón, San Salvador' },
      { vendor_name: 'Distribuidora Central',   amount: 15000, date: '2025-02-05', tax_id: 'DC-003', address: 'Merliot, Santa Tecla' },
      { vendor_name: 'Distribuidora Central',   amount: 15000, date: '2025-05-25', tax_id: 'DC-003', address: 'Merliot, Santa Tecla' },
      { vendor_name: 'Comercial del Sur',       amount: 12000, date: '2025-01-20', tax_id: 'CS-004', address: 'San Miguel' },
      { vendor_name: 'Comercial del Sur',       amount: 13000, date: '2025-06-05', tax_id: 'CS-004', address: 'San Miguel' },
      { vendor_name: 'Import Fugaz SA',         amount: 45000, date: '2025-06-10', tax_id: '',       address: '' },
      { vendor_name: 'Import Fugaz SA',         amount: 45000, date: '2025-06-25', tax_id: '',       address: '' },
    ],
  },
  tax_haven: {
    // Holding Internacional (Panamá), Servicios Offshore (Islas Caimán) y
    // Trading International (Islas Vírgenes Británicas) concentran el 75.7%
    // del monto total — dispara tanto las transacciones puntuales como la
    // concentración general.
    records: [
      { vendor_name: 'Proveedor Local SA',          amount: 20000, jurisdiction: 'El Salvador',              date: '2025-02-01' },
      { vendor_name: 'Distribuidora Regional',      amount: 15000, jurisdiction: 'Guatemala',                date: '2025-03-01' },
      { vendor_name: 'Holding Internacional SA',    amount: 45000, jurisdiction: 'Panamá',                   date: '2025-04-01' },
      { vendor_name: 'Servicios Offshore Ltd',      amount: 60000, jurisdiction: 'Islas Caimán',             date: '2025-05-01' },
      { vendor_name: 'Consultora Global',           amount: 10000, jurisdiction: 'Estados Unidos',           date: '2025-05-15' },
      { vendor_name: 'Trading International Corp',  amount: 35000, jurisdiction: 'Islas Vírgenes Británicas', date: '2025-06-01' },
    ],
  },
};

// ─── Subir archivo — mapeo de columnas (sin plantilla fija) ───────────────────
// El usuario sube CUALQUIER CSV/Excel con SUS propios nombres de columna; acá
// solo se define qué campos entiende cada analizador (los mismos que ya
// aceptan amount_field/vendor_field/etc. en el backend) para que el frontend
// arme el `field_mapping` correcto — nunca se exige renombrar el archivo.

// FieldDef/FIELD_DEFS/FIELD_ALIASES/normColName/autoMatchColumn/autoDetectNumericColumns/
// ParsedFile extraídos a lib/caats-fields.ts (compartido con el panel embebido PT-B4).

// ─── Result renderer — extraído a components/caats/CaatsResultView.tsx ───────
// (compartido con el panel embebido en el papel de trabajo PT-B4)

// ─── Modal de metodología ──────────────────────────────────────────────────────

function MethodologyModal({ analysisId, label, onClose }: { analysisId: AnalysisId; label: string; onClose: () => void }) {
  const info = METHODOLOGY[analysisId];
  if (!info) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-gradient-to-r from-[#0F2D4A] to-[#1a4a7a] px-6 py-5 flex items-start justify-between gap-4 shrink-0">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-white/60">Metodología del análisis</p>
            <h3 className="text-xl font-bold text-white mt-0.5">{label}</h3>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-5 space-y-5">
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide flex items-center gap-1.5 mb-1.5">
              <Target className="w-3.5 h-3.5" /> Objetivo
            </p>
            <p className="text-sm text-gray-700 leading-relaxed">{info.objetivo}</p>
          </div>

          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide flex items-center gap-1.5 mb-1.5">
              <FlaskConical className="w-3.5 h-3.5" /> Metodología
            </p>
            <p className="text-sm text-gray-700 leading-relaxed">{info.metodologia}</p>
          </div>

          {info.normativa && (
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide flex items-center gap-1.5 mb-1.5">
                <ScrollText className="w-3.5 h-3.5" /> Marco normativo de referencia
              </p>
              <p className="text-sm text-gray-700 leading-relaxed">{info.normativa}</p>
            </div>
          )}

          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Pruebas que aplica</p>
            <div className="space-y-2">
              {info.pruebas.map((p, i) => (
                <div key={i} className="bg-gray-50 rounded-lg px-3 py-2.5">
                  <p className="text-xs font-semibold text-gray-800">{p.nombre}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{p.descripcion}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3.5 py-3">
            <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-1">Limitaciones y buen uso</p>
            <p className="text-xs text-amber-700 leading-relaxed">{info.limitaciones}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [selected, setSelected] = useState<AnalysisType>(ANALYSIS_TYPES[0]);
  const [running, setRunning]   = useState(false);
  const [result, setResult]     = useState<Record<string, unknown> | null>(null);
  const [error, setError]       = useState('');
  const [showPayload, setShowPayload] = useState(false);
  const [showMethodology, setShowMethodology] = useState(false);
  const [exporting, setExporting] = useState<'pdf' | 'excel' | null>(null);
  const [showSaveAsPaper, setShowSaveAsPaper] = useState(false);

  const [dataMode, setDataMode] = useState<'sample' | 'upload'>('sample');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [showRowPicker, setShowRowPicker] = useState(false);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [benfordColumn, setBenfordColumn] = useState('');
  const [anomalyColumns, setAnomalyColumns] = useState<string[]>([]);
  const [secondaryData, setSecondaryData] = useState<SecondaryDatasetValue | null>(null);

  // Solo se limpia el dataset secundario al cambiar de MOTOR — un re-upload
  // del archivo principal para el mismo motor no debe perder el secundario
  // ya cargado (era un bug real: el efecto de abajo corre también cuando
  // `parsed` cambia por un simple re-upload, y ponerlo ahí borraba el
  // dataset secundario en cada subida del archivo principal).
  useEffect(() => {
    setSecondaryData(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected.id]);

  // Al cambiar de tipo de análisis con un archivo ya cargado, re-mapear
  // automáticamente contra las columnas de ESE archivo para el nuevo tipo.
  useEffect(() => {
    if (dataMode !== 'upload' || !parsed) return;
    if (selected.id === 'benford') {
      setBenfordColumn(autoMatchColumn('amount', parsed.columns));
    } else if (selected.id === 'anomaly') {
      setAnomalyColumns(autoDetectNumericColumns(parsed.columns, parsed.rows));
    } else {
      const defs = FIELD_DEFS[selected.id] ?? [];
      const mapping: Record<string, string> = {};
      defs.forEach(d => { mapping[d.key] = autoMatchColumn(d.key, parsed.columns); });
      setFieldMapping(mapping);
    }
    setResult(null);
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected.id, dataMode, parsed]);

  async function parseFile(file: File, headerRow?: number) {
    setUploading(true);
    setUploadError('');
    setResult(null);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (headerRow !== undefined) fd.append('headerRow', String(headerRow));
      const data = await apiClient.postForm<ParsedFile>('/ai/parse-file', fd);
      setParsed(data);
      setShowRowPicker(false);
    } catch (err) {
      setParsed(null);
      setUploadError(err instanceof Error ? err.message : 'No se pudo leer el archivo');
    } finally {
      setUploading(false);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite re-subir el mismo archivo si se corrige algo
    if (!file) return;
    setUploadedFile(file);
    await parseFile(file);
  }

  function clearUpload() {
    setParsed(null);
    setUploadedFile(null);
    setShowRowPicker(false);
    setUploadError('');
    setFieldMapping({});
    setBenfordColumn('');
    setAnomalyColumns([]);
    setResult(null);
    setError('');
  }

  const fieldDefs = FIELD_DEFS[selected.id];
  const secondaryConfig = SECONDARY_DATASET[selected.id];
  const missingRequired = useMemo(() => {
    if (dataMode !== 'upload' || !fieldDefs) return false;
    return fieldDefs.some(d => d.required && !fieldMapping[d.key]);
  }, [dataMode, fieldDefs, fieldMapping]);
  const secondaryMissingRequired = useMemo(() => {
    if (dataMode !== 'upload' || !secondaryConfig) return false;
    if (!secondaryData) return true;
    return secondaryConfig.fieldDefs.some(d => d.required && !secondaryData.fieldMapping[d.key]);
  }, [dataMode, secondaryConfig, secondaryData]);

  const canRun = dataMode === 'sample'
    ? true
    : selected.id === 'benford'
      ? !!parsed && !!benfordColumn
      : selected.id === 'anomaly'
        ? !!parsed && anomalyColumns.length > 0
        : !!parsed && !missingRequired && !secondaryMissingRequired;

  async function runAnalysis() {
    setRunning(true);
    setResult(null);
    setError('');

    try {
      let payload: unknown;
      if (dataMode === 'sample') {
        payload = SAMPLE_DATA[selected.sampleKey];
      } else if (!parsed) {
        throw new Error('Primero sube un archivo');
      } else if (selected.id === 'benford') {
        const amounts = parsed.rows
          .map(r => Number(String(r[benfordColumn] ?? '').replace(/[^0-9.-]/g, '')))
          .filter(n => Number.isFinite(n) && n !== 0);
        payload = { amounts };
      } else if (selected.id === 'anomaly') {
        payload = { records: parsed.rows, numeric_fields: anomalyColumns };
      } else {
        const mapping: Record<string, string> = {};
        Object.entries(fieldMapping).forEach(([key, col]) => { if (col) mapping[key] = col; });
        payload = secondaryConfig && secondaryData
          ? {
              records: parsed.rows, field_mapping: mapping,
              reference_records: secondaryData.rows, reference_field_mapping: secondaryData.fieldMapping,
            }
          : { records: parsed.rows, field_mapping: mapping };
      }

      const data = await apiClient.post<Record<string, unknown>>(
        `/ai/analytics/${selected.id}`,
        payload,
      );
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setRunning(false);
    }
  }

  async function exportPdf() {
    if (!result) return;
    setExporting('pdf');
    try {
      const filename = `auditmind_caats_${selected.id}_${new Date().toISOString().slice(0, 10)}.pdf`;
      await apiClient.postDownload(`/ai/analytics/${selected.id}/pdf`, { result, label: selected.label }, filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar el PDF');
    } finally {
      setExporting(null);
    }
  }

  function exportExcel() {
    if (!result) return;
    setExporting('excel');
    try {
      const wb = XLSX.utils.book_new();

      const scalarSkip = new Set([
        'findings', 'summary', 'vendor_concentration', 'pay_distribution', 'digits',
        'top_anomalous_amounts', 'interpretation', 'top_anomalies', 'feature_stats', 'conformity',
      ]);
      const summaryRows = Object.entries(result)
        .filter(([k, v]) => !scalarSkip.has(k) && typeof v !== 'object')
        .map(([k, v]) => ({ Indicador: fieldLabel(k), Valor: formatValue(v, k) }));
      if (typeof result.conformity === 'string') summaryRows.push({ Indicador: fieldLabel('conformity'), Valor: CONFORMITY_LABELS[result.conformity] ?? result.conformity });
      if (typeof result.interpretation === 'string') summaryRows.push({ Indicador: 'Interpretación', Valor: result.interpretation });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Resumen');

      if (Array.isArray(result.findings) && result.findings.length > 0) {
        const findingRows = (result.findings as FindingLike[]).map(f => ({
          Prueba: testLabel(f.test_name),
          'Nivel de Riesgo': RISK_LEVEL_LABELS[f.risk_level] ?? f.risk_level,
          Registros: f.record_count,
          Descripción: f.description,
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(findingRows), 'Hallazgos');

        (result.findings as FindingLike[]).forEach((f, i) => {
          if (f.sample_records && f.sample_records.length > 0) {
            const sheetName = `Muestra ${i + 1} - ${testLabel(f.test_name)}`.slice(0, 31);
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(f.sample_records), sheetName);
          }
        });
      }
      if (Array.isArray(result.vendor_concentration)) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(result.vendor_concentration), 'Concentración Proveedores');
      }
      if (Array.isArray(result.top_anomalous_amounts)) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(result.top_anomalous_amounts), 'Montos Atípicos');
      }
      if (Array.isArray(result.digits)) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(result.digits), 'Distribución de Dígitos');
      }
      if (Array.isArray(result.top_anomalies)) {
        const rows = (result.top_anomalies as Array<Record<string, unknown>>).map(a => ({
          Índice: a.index, Puntaje: a.anomaly_score,
          Señales: Array.isArray(a.flags) ? (a.flags as string[]).join(', ') : a.flags,
          ...(a.record && typeof a.record === 'object' ? a.record as Record<string, unknown> : {}),
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Anomalías');
      }

      XLSX.writeFile(wb, `auditmind_caats_${selected.id}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } finally {
      setExporting(null);
    }
  }

  const payload = SAMPLE_DATA[selected.sampleKey];

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Analytics — CAATs"
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Reportería e IA' },
          { label: 'Analytics CAATs' },
        ]}
      />

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto space-y-6">

          {/* Info banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex gap-3">
            <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
            <p className="text-sm text-blue-700">
              <strong>Computer-Assisted Audit Techniques (CAATs)</strong> — Motor de análisis con IA integrado.
              Prueba con datos de muestra, o sube tu propio CSV/Excel — no necesita un formato predefinido,
              tú decides qué columna de tu archivo corresponde a cada campo antes de ejecutar.
            </p>
          </div>

          {/* Analysis type selector */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {ANALYSIS_TYPES.map(type => (
              <button
                key={type.id}
                onClick={() => { setSelected(type); setResult(null); setError(''); }}
                className={cn(
                  'flex flex-col items-center gap-2 p-4 rounded-xl border-2 text-center transition-all',
                  selected.id === type.id
                    ? 'border-[#0F2D4A] bg-[#0F2D4A]/5 shadow-sm'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm',
                )}
              >
                <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', type.color)}>
                  <type.icon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className={cn(
                    'text-xs font-semibold leading-tight',
                    selected.id === type.id ? 'text-[#0F2D4A]' : 'text-gray-700',
                  )}>
                    {type.label}
                  </p>
                </div>
              </button>
            ))}
          </div>

          {/* Selected description + data mode + run */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-start gap-4">
                <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center shrink-0', selected.color)}>
                  <selected.icon className="w-6 h-6 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base font-bold text-gray-900">{selected.label}</h2>
                    <button
                      onClick={() => setShowMethodology(true)}
                      className="flex items-center gap-1 text-[11px] font-semibold text-[#0F2D4A] bg-[#0F2D4A]/5 hover:bg-[#0F2D4A]/10 px-2 py-1 rounded-full transition-colors"
                    >
                      <HelpCircle className="w-3 h-3" /> Metodología
                    </button>
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">{selected.description}</p>
                </div>
              </div>

              <button
                onClick={runAnalysis}
                disabled={running || !canRun}
                title={!canRun ? 'Completa el mapeo de columnas requerido antes de ejecutar' : undefined}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#0F2D4A] text-white text-sm font-medium rounded-xl hover:bg-[#1a4a7a] disabled:opacity-60 shrink-0 transition-colors"
              >
                {running
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Analizando…</>
                  : <><Play className="w-4 h-4" /> Ejecutar análisis</>
                }
              </button>
            </div>

            {showMethodology && (
              <MethodologyModal analysisId={selected.id} label={selected.label} onClose={() => setShowMethodology(false)} />
            )}

            {/* Data mode toggle */}
            <div className="mt-4 pt-4 border-t border-gray-100">
              <div className="inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1">
                {([
                  { key: 'sample' as const, label: 'Datos de muestra', icon: Search },
                  { key: 'upload' as const, label: 'Subir archivo',    icon: Upload },
                ]).map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    onClick={() => { setDataMode(key); setResult(null); setError(''); }}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                      dataMode === key ? 'bg-white text-[#0F2D4A] shadow-sm' : 'text-gray-500 hover:text-gray-700',
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </button>
                ))}
              </div>

              {dataMode === 'sample' ? (
                <div className="mt-3">
                  <button
                    onClick={() => setShowPayload(!showPayload)}
                    className="text-xs text-[#0F2D4A] font-medium flex items-center gap-1 hover:underline"
                  >
                    <Search className="w-3 h-3" />
                    {showPayload ? 'Ocultar' : 'Ver'} datos de muestra
                    {showPayload ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                  {showPayload && (
                    <pre className="mt-2 bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-600 overflow-x-auto max-h-56">
                      {JSON.stringify(payload, null, 2)}
                    </pre>
                  )}
                </div>
              ) : (
                <div className="mt-3 space-y-4">
                  {!parsed ? (
                    <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl py-8 cursor-pointer hover:border-[#0F2D4A]/40 hover:bg-gray-50 transition-colors">
                      <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFileChange} disabled={uploading} />
                      {uploading ? (
                        <>
                          <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
                          <span className="text-xs text-gray-500">Leyendo archivo…</span>
                        </>
                      ) : (
                        <>
                          <FileUp className="w-6 h-6 text-gray-300" />
                          <span className="text-sm font-medium text-gray-600">Haz clic para elegir un archivo</span>
                          <span className="text-[11px] text-gray-400">CSV o Excel (.xlsx, .xls) — cualquier nombre de columna</span>
                        </>
                      )}
                    </label>
                  ) : (
                    <div className="flex items-center justify-between gap-3 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2 text-xs text-emerald-700">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>
                          <strong>{parsed.filename}</strong> — {parsed.rowCount} filas, {parsed.columns.length} columnas detectadas
                          {parsed.truncated && ` (de ${parsed.totalRows} totales — se usarán solo las primeras ${parsed.rowCount})`}
                        </span>
                      </div>
                      <button onClick={clearUpload} className="text-emerald-600 hover:text-emerald-800 shrink-0" title="Quitar archivo">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {/* Validación del encabezado: avisa si el archivo trae título/filas
                      antes de las columnas, y deja elegir la fila correcta a mano. */}
                  {parsed && (parsed.headerRowIndex > 0 || parsed.headerConfidence === 'low') && (
                    <div className={cn(
                      'rounded-lg px-3 py-2 text-xs space-y-2',
                      parsed.headerConfidence === 'low'
                        ? 'bg-amber-50 border border-amber-200 text-amber-800'
                        : 'bg-blue-50 border border-blue-200 text-blue-800',
                    )}>
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>
                          {parsed.headerRowIndex > 0
                            ? `El archivo trae ${parsed.headerRowIndex} fila(s) antes de los encabezados (título de reporte, filas vacías, etc.) — se usó la fila ${parsed.headerRowIndex + 1} como encabezado.`
                            : 'No estamos completamente seguros de que la fila 1 sea el encabezado correcto.'}
                          {parsed.headerConfidence === 'low' && ' Revisa que las columnas de abajo se vean correctas.'}
                        </span>
                      </div>
                      <button
                        onClick={() => setShowRowPicker(s => !s)}
                        className="flex items-center gap-1 font-semibold hover:underline"
                      >
                        <RotateCcw className="w-3 h-3" />
                        {showRowPicker ? 'Ocultar filas originales' : '¿No es correcto? Elegir la fila de encabezado'}
                      </button>
                      {showRowPicker && (
                        <div className="overflow-x-auto bg-white border border-gray-200 rounded-lg">
                          <table className="w-full text-[11px]">
                            <tbody className="divide-y divide-gray-100">
                              {parsed.rawPreview.map((row, i) => (
                                <tr key={i} className={i === parsed.headerRowIndex ? 'bg-emerald-50' : undefined}>
                                  <td className="px-2 py-1 text-gray-400 whitespace-nowrap">Fila {i + 1}</td>
                                  <td className="px-2 py-1 text-gray-700 font-mono whitespace-nowrap">
                                    {row.filter(Boolean).join(' | ') || <span className="text-gray-300">(vacía)</span>}
                                  </td>
                                  <td className="px-2 py-1 text-right">
                                    <button
                                      onClick={() => uploadedFile && parseFile(uploadedFile, i)}
                                      disabled={uploading}
                                      className="text-[#0F2D4A] font-semibold hover:underline disabled:opacity-40"
                                    >
                                      Usar esta fila
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {uploadError && (
                    <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      {uploadError}
                    </div>
                  )}

                  {/* Column mapping */}
                  {parsed && (
                    <div className="border-t border-gray-100 pt-3">
                      <p className="text-xs font-semibold text-gray-700 flex items-center gap-1.5 mb-2">
                        <ListChecks className="w-3.5 h-3.5" />
                        Indica qué columna de tu archivo corresponde a cada campo
                      </p>

                      {selected.id === 'benford' ? (
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-gray-600 w-40 shrink-0">Columna de montos <span className="text-red-500">*</span></label>
                          <select
                            value={benfordColumn}
                            onChange={e => setBenfordColumn(e.target.value)}
                            className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">— selecciona —</option>
                            {parsed.columns.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                      ) : selected.id === 'anomaly' ? (
                        <div>
                          <p className="text-[11px] text-gray-400 mb-2">
                            Selecciona las columnas numéricas que el modelo debe evaluar (mínimo 1).
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {parsed.columns.map(c => {
                              const active = anomalyColumns.includes(c);
                              return (
                                <button
                                  key={c}
                                  type="button"
                                  onClick={() => setAnomalyColumns(prev =>
                                    active ? prev.filter(x => x !== c) : [...prev, c],
                                  )}
                                  className={cn(
                                    'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                                    active
                                      ? 'bg-[#0F2D4A] text-white border-[#0F2D4A]'
                                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300',
                                  )}
                                >
                                  {c}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="grid sm:grid-cols-2 gap-x-4 gap-y-2">
                          {(fieldDefs ?? []).map(field => (
                            <div key={field.key} className="flex items-center gap-2">
                              <label className="text-xs text-gray-600 w-40 shrink-0 truncate" title={field.label}>
                                {field.label} {field.required && <span className="text-red-500">*</span>}
                              </label>
                              <select
                                value={fieldMapping[field.key] ?? ''}
                                onChange={e => setFieldMapping(prev => ({ ...prev, [field.key]: e.target.value }))}
                                className={cn(
                                  'flex-1 rounded-lg border px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500',
                                  field.required && !fieldMapping[field.key] ? 'border-red-200' : 'border-gray-200',
                                )}
                              >
                                <option value="">— no usar —</option>
                                {parsed.columns.map(c => <option key={c} value={c}>{c}</option>)}
                              </select>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {secondaryConfig && (
                    <SecondaryDatasetUpload
                      label={secondaryConfig.label}
                      fieldDefs={secondaryConfig.fieldDefs}
                      onChange={setSecondaryData}
                    />
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-700">Error al ejecutar análisis</p>
                <p className="text-xs text-red-500 mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {/* Results */}
          {result && !running && (
            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between gap-3 pb-3 border-b border-gray-200 flex-wrap">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                  <h3 className="text-base font-bold text-gray-900">
                    Resultados — {selected.label}
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowSaveAsPaper(true)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Guardar como papel de trabajo
                  </button>
                  <button
                    onClick={exportExcel}
                    disabled={exporting !== null}
                    className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
                  >
                    {exporting === 'excel' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Table2 className="w-3.5 h-3.5" />}
                    Excel
                  </button>
                  <button
                    onClick={exportPdf}
                    disabled={exporting !== null}
                    className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[#0F2D4A] hover:bg-[#1a4a7a] px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
                  >
                    {exporting === 'pdf' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
                    PDF
                  </button>
                </div>
              </div>
              <AnalysisResultView result={result} />
            </div>
          )}

          {showSaveAsPaper && result && (
            <SaveAsWorkingPaperModal
              engine={selected.id}
              label={selected.label}
              result={result}
              fileName={dataMode === 'upload' ? parsed?.filename : 'Datos de muestra'}
              fieldMapping={dataMode === 'upload' && selected.id !== 'benford' && selected.id !== 'anomaly' ? fieldMapping : undefined}
              benfordColumn={dataMode === 'upload' && selected.id === 'benford' ? benfordColumn : undefined}
              anomalyColumns={dataMode === 'upload' && selected.id === 'anomaly' ? anomalyColumns : undefined}
              onClose={() => setShowSaveAsPaper(false)}
            />
          )}

          {/* Empty state before running */}
          {!result && !running && !error && (
            <div className="bg-white border border-gray-200 rounded-xl py-16 flex flex-col items-center text-gray-400">
              <BarChart3 className="w-14 h-14 mb-4 opacity-20" />
              <p className="text-sm font-medium">Selecciona un análisis y presiona &quot;Ejecutar&quot;</p>
              <p className="text-xs mt-1 text-gray-300">Los resultados aparecerán aquí</p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
