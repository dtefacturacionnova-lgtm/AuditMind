'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, FileText, Database, Sparkles, Activity, Paperclip,
  Loader2, AlertTriangle, Folder, CheckCircle2,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { useAudit } from '@/hooks/useAudits';
import { useCreateWorkingPaper, useWorkingPapersForAudit } from '@/hooks/useWorkingPapers';

const WORKING_PAPER_TYPES = [
  { value: 'PLANNING_UNDERSTANDING', label: 'Planificación y Entendimiento' },
  { value: 'CONTROL_EVALUATION',     label: 'Evaluación de Controles' },
  { value: 'SUBSTANTIVE_TEST',       label: 'Prueba Sustantiva' },
  { value: 'DATA_ANALYSIS',          label: 'Análisis de Datos / CAATs' },
  { value: 'FINDING',                label: 'Hallazgo' },
  { value: 'CLOSURE_CONCLUSION',     label: 'Cierre y Conclusión' },
  { value: 'INTERVIEW',              label: 'Entrevista' },
  { value: 'CONFIRMATION',           label: 'Confirmación Externa' },
  { value: 'NORMATIVE_ANALYSIS',     label: 'Análisis Normativo' },
] as const;

// ─── Canonical paper catalogue ───────────────────────────────────────────────

interface CanonicalPaper {
  code: string;
  label: string;
  kind: 'SMART' | 'MASTER';
  type: typeof WORKING_PAPER_TYPES[number]['value'];
  hint: string;
}

const CANONICAL_PAPER_GROUPS: { group: string; items: CanonicalPaper[] }[] = [
  {
    group: 'General — Planificación y Riesgo',
    items: [
      { code: 'PT-A1',   label: 'Entendimiento del Negocio y Entorno',        kind: 'SMART',  type: 'PLANNING_UNDERSTANDING', hint: 'Contexto del sector, estructura, regulación y entorno' },
      { code: 'PT-A2',   label: 'Evaluación de Riesgo Inherente (RI)',         kind: 'SMART',  type: 'PLANNING_UNDERSTANDING', hint: 'Aserciones por área y factores de riesgo significativo' },
      { code: 'PT-A3',   label: 'Evaluación de Controles y Riesgo de Control', kind: 'SMART',  type: 'CONTROL_EVALUATION',     hint: 'Diseño y efectividad operativa de controles clave' },
      { code: 'PT-A4',   label: 'Cálculo de Materialidad (NIA 320)',           kind: 'SMART',  type: 'PLANNING_UNDERSTANDING', hint: 'MG, ME y UAE con benchmark referencial automático' },
      { code: 'PT-COSO', label: 'Evaluación COSO 2013 — SCI (5 Comp./17 P.)', kind: 'SMART',  type: 'CONTROL_EVALUATION',     hint: 'Evaluación del SCI: 5 componentes, 17 principios, semáforo global y enfoque de auditoría' },
      { code: 'PT-MEMO', label: 'Memorando de Planificación',                  kind: 'MASTER', type: 'PLANNING_UNDERSTANDING', hint: 'Consolida entendimiento, riesgo, materialidad y estrategia global' },
      { code: 'PT-PROG', label: 'Programa de Auditoría',                       kind: 'MASTER', type: 'PLANNING_UNDERSTANDING', hint: 'Procedimientos auto-generados desde RI + materialidad' },
      { code: 'PT-DIFS', label: 'Cédula de Diferencias y Ajustes',            kind: 'MASTER', type: 'CLOSURE_CONCLUSION',      hint: 'Acumula excepciones, semáforo vs materialidad, propuesta de opinión' },
    ],
  },
  {
    group: 'Auditoría Financiera — Planificación',
    items: [
      { code: 'PT-INDEP',     label: 'Independencia, Ética y Aceptación del Encargo (NIA 220/IESBA)', kind: 'SMART', type: 'PLANNING_UNDERSTANDING', hint: 'Amenazas, salvaguardas, servicios prohibidos, EQR, aceptación/continuación' },
      { code: 'PT-FIN-A3-KC', label: 'Conocimiento del Cliente y Entorno (NIA 315)',                   kind: 'SMART', type: 'PLANNING_UNDERSTANDING', hint: 'Historia, gobierno corporativo, ciclos clave, partes relacionadas' },
      { code: 'PT-FIN-B00',   label: 'Importación Trial Balance y Cédula Madre',                        kind: 'SMART', type: 'SUBSTANTIVE_TEST',        hint: 'Import Excel/CSV/ERP, clasificador de cuentas, semáforo de materialidad' },
      { code: 'PT-FIN-B07',   label: 'Análisis de Variaciones (NIA 520)',                               kind: 'SMART', type: 'DATA_ANALYSIS',           hint: 'Horizontal, vertical, 12 ratios financieros, señales de fraude NIA 240' },
      { code: 'PT-FIN-B09',   label: 'Libro de AJEs — Base Técnica NIIF',                              kind: 'SMART', type: 'SUBSTANTIVE_TEST',        hint: 'Desde B-08, justificación técnica NIIF, carta propuesta al cliente' },
      { code: 'PT-NIA250',    label: 'Cumplimiento con Leyes y Regulaciones (NIA 250)',                 kind: 'SMART', type: 'PLANNING_UNDERSTANDING', hint: 'Marco legal aplicable, indicios de incumplimiento, comunicación a dirección' },
      { code: 'PT-NIA530',    label: 'Plan Maestro de Muestreo Estadístico (NIA 530)',                  kind: 'SMART', type: 'PLANNING_UNDERSTANDING', hint: 'Población, muestra MUS/aleatorio, umbral de error tolerable, resultados' },
      { code: 'PT-NIA610',    label: 'Uso del Trabajo de Auditoría Interna (NIA 610)',                  kind: 'SMART', type: 'PLANNING_UNDERSTANDING', hint: 'Evaluación AI, alcance, competencia/objetividad, resultados utilizados' },
      { code: 'PT-NIA620',    label: 'Uso del Trabajo de Experto del Auditor (NIA 620)',                kind: 'SMART', type: 'PLANNING_UNDERSTANDING', hint: 'Evaluación de competencia, acuerdo, resultados y referencia en informe' },
    ],
  },
  {
    group: 'Auditoría Financiera — Cédulas Sumarias',
    items: [
      { code: 'PT-FIN-B01', label: 'Cédula Sumaria — Activos Corrientes',      kind: 'MASTER', type: 'SUBSTANTIVE_TEST', hint: 'B-01a Caja, B-01b CxC, B-01c Inventarios, B-01d Otros AC' },
      { code: 'PT-FIN-B02', label: 'Cédula Sumaria — Activos No Corrientes',   kind: 'MASTER', type: 'SUBSTANTIVE_TEST', hint: 'PP&E, intangibles, inversiones LP' },
      { code: 'PT-FIN-B03', label: 'Cédula Sumaria — Pasivos Corrientes',      kind: 'MASTER', type: 'SUBSTANTIVE_TEST', hint: 'CxP comerciales, obligaciones bancarias CP, impuestos' },
      { code: 'PT-FIN-B04', label: 'Cédula Sumaria — Pasivos No Corrientes',   kind: 'MASTER', type: 'SUBSTANTIVE_TEST', hint: 'Deuda LP, provisiones NIC 37, arrendamientos NIIF 16' },
      { code: 'PT-FIN-B05', label: 'Cédula Sumaria — Patrimonio',              kind: 'MASTER', type: 'SUBSTANTIVE_TEST', hint: 'Capital social, reservas, utilidades retenidas + Estado de Cambios' },
      { code: 'PT-FIN-B06', label: 'Cédula Sumaria — Resultados (P&G)',        kind: 'MASTER', type: 'SUBSTANTIVE_TEST', hint: 'Ingresos, costos, gastos, márgenes, EBITDA vs sector' },
    ],
  },
  {
    group: 'Auditoría Financiera — Pruebas y Cierre',
    items: [
      { code: 'PT-FIN-C-SUST',  label: 'Prueba Sustantiva por Área (genérico)',            kind: 'SMART',  type: 'SUBSTANTIVE_TEST',   hint: 'Diferencias auto-push a B-08 cuando superan UAE' },
      { code: 'PT-CIRC',        label: 'Circularización de CxC (NIA 505)',                 kind: 'SMART',  type: 'SUBSTANTIVE_TEST',   hint: 'Universo CxC, selección, envío, seguimiento y evaluación de respuestas' },
      { code: 'PT-FIN-C-ESTIM', label: 'Estimaciones Contables (NIA 540 Rev.)',            kind: 'SMART',  type: 'SUBSTANTIVE_TEST',   hint: 'Espectro de resultados, rango del auditor vs. estimación gerencia, indicadores de sesgo' },
      { code: 'PT-FIN-C-NORM',  label: 'Análisis Normativo por Área (genérico)',           kind: 'SMART',  type: 'NORMATIVE_ANALYSIS', hint: 'NIA 550 Partes Rel. / NIA 570 Continuidad Operativa' },
      { code: 'PT-ADJ-RECLASIF',label: 'Libro de Ajustes y Reclasificaciones del Auditor', kind: 'SMART',  type: 'SUBSTANTIVE_TEST',   hint: 'AJEs propuestos, alimenta B-08 con diferencias no registradas' },
      { code: 'PT-FIN-B08',     label: 'Diferencias y Semáforo de Opinión',                kind: 'MASTER', type: 'CLOSURE_CONCLUSION',  hint: 'Acumula diferencias C-XX → semáforo vs MG/ME, opinión propuesta' },
      { code: 'PT-REP580',      label: 'Carta de Representación (NIA 580)',                 kind: 'SMART',  type: 'CLOSURE_CONCLUSION',  hint: 'Representaciones explícitas e implícitas, período, firmantes' },
      { code: 'PT-NIA560',      label: 'Eventos Posteriores al Cierre (NIA 560)',           kind: 'SMART',  type: 'CLOSURE_CONCLUSION',  hint: 'Procedimientos de búsqueda, Tipo I (ajuste) y Tipo II (revelación)' },
      { code: 'PT-NIA265',      label: 'Carta de Debilidades de CI (NIA 265)',              kind: 'MASTER', type: 'CLOSURE_CONCLUSION',  hint: 'Deficiencias significativas / materiales vinculadas a COSO, comunicadas a gobierno' },
      { code: 'PT-FIN-D02CI',   label: 'Carta de Debilidades CI — Financiera (NIA 265)',   kind: 'MASTER', type: 'CLOSURE_CONCLUSION',  hint: 'Deficiencias significativas y materiales comunicadas a gobierno (versión financiera)' },
      { code: 'PT-NIA260',      label: 'Comunicación con Gobierno Corporativo (NIA 260)',   kind: 'SMART',  type: 'CLOSURE_CONCLUSION',  hint: 'Responsabilidades del auditor, hallazgos significativos, independencia, representación' },
      { code: 'PT-FIN-DICT',    label: 'Dictamen del Auditor — NIA 700-720',               kind: 'MASTER', type: 'CLOSURE_CONCLUSION',  hint: 'Opinión auto-fill desde B-08, KAMs NIA 701, párrafo de énfasis' },
    ],
  },
  {
    group: 'Auditoría Fiscal SV (NACOT)',
    items: [
      { code: 'PT-FISC-INDEP',   label: 'Independencia Fiscal (NACOT Sec. 2)',    kind: 'SMART',  type: 'PLANNING_UNDERSTANDING', hint: '5 amenazas CIEPC, servicios prohibidos, salvaguardas' },
      { code: 'PT-FISC-QC',      label: 'Control de Calidad (NACOT Sec. 3)',       kind: 'SMART',  type: 'PLANNING_UNDERSTANDING', hint: 'Revisor independiente, aprobación previa al dictamen' },
      { code: 'PT-FISC-ENCARGO', label: 'Carta de Encargo Fiscal (NACOT Sec. 4)', kind: 'SMART',  type: 'PLANNING_UNDERSTANDING', hint: 'Términos, alcance ISR/IVA/retenciones, SDF 31 mayo' },
      { code: 'PT-FISC-RISK',    label: 'Riesgo de Incumplimiento Fiscal',         kind: 'SMART',  type: 'CONTROL_EVALUATION',     hint: 'RI por impuesto, fraude fiscal NIA 240, respuesta planeada' },
      { code: 'PT-FISC-AML',     label: 'Indicadores LA/FT (LCLDA / FATF)',        kind: 'SMART',  type: 'NORMATIVE_ANALYSIS',     hint: '40 señales FATF, paraísos fiscales, obligaciones UIF' },
      { code: 'PT-FISC-PT',      label: 'Precios de Transferencia (Art. 199-A CT)',kind: 'SMART',  type: 'SUBSTANTIVE_TEST',        hint: '5 métodos OCDE, principio plena competencia, ajuste ISR, F982' },
      { code: 'PT-FISC-ZF',      label: 'Dictamen Semestral Zona Franca / SI',     kind: 'SMART',  type: 'CLOSURE_CONCLUSION',      hint: 'Régimen de exención, 1er y 2do semestre' },
      { code: 'PT-FISC-DICT',    label: 'Dictamen Fiscal NACOT Anexo 1',           kind: 'MASTER', type: 'CLOSURE_CONCLUSION',      hint: 'Modelo oficial, 3 tipos de opinión NACOT, independencia auto-fill' },
    ],
  },
  {
    group: 'Especializado (ISO · NAIG · LA/FT)',
    items: [
      { code: 'PT-GOV-HAL',  label: 'Hallazgo Gubernamental (NAIG — 5 elementos)', kind: 'SMART', type: 'FINDING',            hint: 'Condición, Criterio, Causa, Efecto, Recomendación + clasificación NAIG' },
      { code: 'PT-SEC-RISK', label: 'Evaluación de Riesgos ISO 27001:2022',         kind: 'SMART', type: 'CONTROL_EVALUATION', hint: '93 controles Anexo A, madurez SGSI, NRP-23/32 BCR/SSF' },
      { code: 'PT-BIA',      label: 'BIA — Impacto en el Negocio (ISO 22301:2019)', kind: 'SMART', type: 'SUBSTANTIVE_TEST',   hint: 'RTO, RPO, MTPoD, dependencias críticas, brecha vs ISO 22301' },
      { code: 'PT-AML-RISK', label: 'Riesgo LA/FT — NRP-36 / GAFI Rec. 1',         kind: 'SMART', type: 'CONTROL_EVALUATION', hint: 'Clientes 40%, productos 30%, canales 20%, geografía 10%, 3 líneas defensa' },
    ],
  },
];

// Flat lookup: paperCode → metadata
const CANONICAL_BY_CODE = Object.fromEntries(
  CANONICAL_PAPER_GROUPS.flatMap(g => g.items).map(p => [p.code, p]),
);

// ─── Allowed paper codes per audit type ───────────────────────────────────────
// Based on system template definitions in audit-templates.service.ts

const _EXT_FIN = new Set([
  'PT-INDEP', 'PT-A1', 'PT-A2', 'PT-A3', 'PT-A4', 'PT-COSO', 'PT-MEMO', 'PT-PROG',
  'PT-NIA250', 'PT-NIA530', 'PT-NIA610', 'PT-NIA620',
  'PT-FIN-A3-KC', 'PT-FIN-B00', 'PT-FIN-B01', 'PT-FIN-B02', 'PT-FIN-B03',
  'PT-FIN-B04', 'PT-FIN-B05', 'PT-FIN-B06', 'PT-FIN-B07', 'PT-FIN-B08', 'PT-FIN-B09',
  'PT-ADJ-RECLASIF', 'PT-DIFS', 'PT-CIRC', 'PT-FIN-C-SUST', 'PT-FIN-C-NORM', 'PT-FIN-C-ESTIM',
  'PT-REP580', 'PT-NIA560', 'PT-NIA265', 'PT-NIA260',
  'PT-FIN-D02CI', 'PT-FIN-DICT',
]);

const _FISCAL = new Set([
  'PT-A1', 'PT-A2', 'PT-A3', 'PT-A4', 'PT-MEMO', 'PT-PROG',
  'PT-FISC-INDEP', 'PT-FISC-QC', 'PT-FISC-ENCARGO', 'PT-FISC-RISK',
  'PT-FISC-AML', 'PT-FISC-PT', 'PT-FISC-ZF', 'PT-FISC-DICT',
]);

const _INTERNAL = new Set([
  'PT-A1', 'PT-A2', 'PT-A3', 'PT-A4', 'PT-COSO', 'PT-MEMO', 'PT-PROG', 'PT-DIFS',
]);

const _NAIG = new Set([
  'PT-A1', 'PT-A2', 'PT-A4', 'PT-COSO', 'PT-MEMO', 'PT-PROG', 'PT-GOV-HAL',
]);

const _IT = new Set([
  'PT-A1', 'PT-A3', 'PT-MEMO', 'PT-PROG', 'PT-SEC-RISK', 'PT-BIA',
]);

const _AML = new Set([
  'PT-A1', 'PT-A3', 'PT-MEMO', 'PT-PROG', 'PT-AML-RISK',
]);

const _FORENSIC = new Set([
  'PT-A2', 'PT-MEMO', 'PT-PROG', 'PT-DIFS',
]);

const TEMPLATE_ALLOWED_CODES: Record<string, Set<string>> = {
  EXTERNAL:             _EXT_FIN,
  FINANCIAL:            _EXT_FIN,
  EXTERNAL_FINANCIAL:   _EXT_FIN,
  FISCAL:               _FISCAL,
  INTERNAL:             _INTERNAL,
  OPERATIONAL:          _INTERNAL,
  IT:                   _INTERNAL,
  COMPLIANCE:           _INTERNAL,
  ESG:                  _INTERNAL,
  BCP_DRP:              _INTERNAL,
  INTERNAL_GOVERNMENTAL: _NAIG,
  IT_SECURITY:          _IT,
  AML:                  _AML,
  FORENSIC:             _FORENSIC,
};

const WP_KINDS = [
  { value: 'STANDARD', label: 'Estándar', icon: FileText,  description: 'Documento tradicional con adjuntos y narrativa libre',          color: 'bg-gray-50 border-gray-300 text-gray-700' },
  { value: 'SMART',    label: 'Inteligente', icon: Database, description: 'Secciones tipadas, asistencia IA por sección, propagación al grafo', color: 'bg-blue-50 border-blue-400 text-blue-700' },
  { value: 'MASTER',   label: 'Maestro',   icon: Sparkles, description: 'Consolida múltiples papeles SMART vía IA',                       color: 'bg-violet-50 border-violet-500 text-violet-700' },
  { value: 'LIVE',     label: 'Vivo',      icon: Activity, description: 'Dashboard en tiempo real (no editable manualmente)',             color: 'bg-emerald-50 border-emerald-500 text-emerald-700' },
  { value: 'FILE',     label: 'Archivo',   icon: Paperclip, description: 'Solo archivo adjunto sin contenido propio',                     color: 'bg-amber-50 border-amber-400 text-amber-700' },
] as const;

function NewWorkingPaperInner() {
  const router = useRouter();
  const params = useSearchParams();
  const auditId  = params.get('auditId')  ?? '';
  const folderId = params.get('folderId') ?? '';

  const { data: audit, isLoading: auditLoading, isError: auditError } = useAudit(auditId);
  const create = useCreateWorkingPaper();
  const { data: existingPapers = [] } = useWorkingPapersForAudit(auditId);

  const existingPaperCodes = useMemo(
    () => new Set(existingPapers.map(p => p.paperCode).filter(Boolean) as string[]),
    [existingPapers],
  );

  const allowedCodes = audit?.type ? TEMPLATE_ALLOWED_CODES[audit.type] : undefined;

  const filteredGroups = useMemo(() => {
    return CANONICAL_PAPER_GROUPS
      .map(g => ({
        ...g,
        items: g.items.filter(p => !allowedCodes || allowedCodes.has(p.code)),
      }))
      .filter(g => g.items.length > 0);
  }, [allowedCodes]);

  const [title,     setTitle]     = useState('');
  const [type,      setType]      = useState<typeof WORKING_PAPER_TYPES[number]['value']>('PLANNING_UNDERSTANDING');
  const [wpKind,    setWpKind]    = useState<typeof WP_KINDS[number]['value']>('SMART');
  const [code,      setCode]      = useState('');
  const [paperCode,   setPaperCode]   = useState('');
  const [customCode,  setCustomCode]  = useState(false);
  const [error,       setError]       = useState('');

  function handleSelectPaperCode(value: string) {
    if (value === '__custom__') { setCustomCode(true); setPaperCode(''); return; }
    setPaperCode(value);
    if (!value) return;
    const meta = CANONICAL_BY_CODE[value];
    if (meta) {
      if (!title.trim()) setTitle(meta.label);
      setType(meta.type as never);
      setWpKind(meta.kind as never);
    }
  }

  // Pre-fill code based on folder ref (if available)
  const [folderRef, setFolderRef] = useState('');
  useEffect(() => {
    if (!audit || !folderId) return;
    interface FolderShape { id: string; ref: string; phaseId: string; parentId: string | null }
    interface AuditShape { phases?: Array<{ folders?: FolderShape[] }> }
    const a = audit as unknown as AuditShape;
    const allFolders = (a.phases ?? []).flatMap(p => p.folders ?? []);
    const folder = allFolders.find(f => f.id === folderId);
    if (folder?.ref) setFolderRef(folder.ref);
  }, [audit, folderId]);

  if (!auditId) {
    return (
      <div className="flex flex-col h-screen bg-[#F0F4F8]">
        <Header />
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <AlertTriangle className="w-10 h-10 text-amber-500" />
          <p className="text-sm text-gray-700">Falta el parámetro <code>auditId</code> en la URL.</p>
          <Link href="/dashboard/audits" className="text-xs text-blue-600 hover:underline">Volver al listado</Link>
        </div>
      </div>
    );
  }

  if (auditLoading && !auditError) {
    return (
      <div className="flex flex-col h-screen bg-[#F0F4F8]">
        <Header />
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
          <p className="text-xs text-gray-500">Cargando auditoría…</p>
        </div>
      </div>
    );
  }

  // If audit not found or errored, still allow creating with the auditId we have
  if (auditError || !audit) {
    return (
      <div className="flex flex-col h-screen bg-[#F0F4F8]">
        <Header />
        <div className="flex-1 flex flex-col items-center justify-center gap-3 max-w-md mx-auto text-center px-6">
          <AlertTriangle className="w-10 h-10 text-amber-500" />
          <p className="text-sm text-gray-700 font-semibold">Auditoría no encontrada</p>
          <p className="text-xs text-gray-500">
            El identificador <code className="bg-gray-100 px-1.5 py-0.5 rounded">{auditId}</code> no corresponde a ninguna auditoría existente.
            Es posible que el enlace sea de prueba o que la auditoría haya sido eliminada.
          </p>
          <div className="flex gap-2 mt-2">
            <Link href="/dashboard/audits" className="text-xs text-blue-600 hover:underline">Ir al listado</Link>
            <button onClick={() => router.back()} className="text-xs text-gray-500 hover:text-gray-800">Volver</button>
          </div>
        </div>
      </div>
    );
  }

  async function handleCreate() {
    setError('');
    if (!title.trim()) { setError('El título es obligatorio'); return; }

    try {
      const newPaper = await create.mutateAsync({
        title:        title.trim(),
        type:         type as never,
        indexSection: folderRef || 'A',
        auditId,
        folderId:     folderId || undefined,
        wpKind,
        code:         code.trim() || undefined,
        paperCode:    paperCode.trim() || undefined,
      });
      router.push(`/dashboard/working-papers/${newPaper.id}`);
    } catch (e) {
      setError((e as Error).message ?? 'Error al crear papel');
    }
  }

  return (
    <div className="flex flex-col h-screen bg-[#F0F4F8]">
      <Header />

      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
          {/* Header */}
          <div>
            <button
              onClick={() => router.back()}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 mb-3"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Volver
            </button>
            <h1 className="text-2xl font-bold text-gray-900">Nuevo Papel de Trabajo</h1>
            <div className="flex items-center gap-2 mt-1 text-sm text-gray-500 flex-wrap">
              <span>Auditoría: <strong className="text-gray-700">{audit?.title}</strong></span>
              {folderRef && (
                <>
                  <span>·</span>
                  <Folder className="w-3.5 h-3.5 text-violet-500" />
                  <span>Carpeta: <strong className="text-violet-700">{folderRef}</strong></span>
                </>
              )}
            </div>
          </div>

          {/* Form */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Título <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Ej. Evaluación de Controles de Caja"
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-400"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Código (opcional)
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  placeholder={folderRef ? `Ej. ${folderRef}-01` : 'Ej. B-01'}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-400 font-mono"
                />
                <p className="text-[10px] text-gray-400 mt-1">Si no se da, se genera automáticamente</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Tipo
                </label>
                <select
                  value={type}
                  onChange={e => setType(e.target.value as never)}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white"
                >
                  {WORKING_PAPER_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* wpKind selector visual */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-2">
                Tipo de Papel (motor inteligente)
              </label>
              <div className="grid grid-cols-5 gap-2">
                {WP_KINDS.map(k => {
                  const Icon = k.icon;
                  const selected = wpKind === k.value;
                  return (
                    <button
                      key={k.value}
                      type="button"
                      onClick={() => setWpKind(k.value)}
                      className={`p-3 border-2 rounded-xl transition-all text-center ${
                        selected ? `${k.color} ring-2 ring-current` : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <Icon className="w-5 h-5 mx-auto mb-1" />
                      <p className="text-xs font-bold">{k.label}</p>
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-gray-500 mt-2">
                {WP_KINDS.find(k => k.value === wpKind)?.description}
              </p>
            </div>

            {/* Canonical paper picker — only for SMART / MASTER */}
            {(wpKind === 'SMART' || wpKind === 'MASTER') && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-gray-700">
                    Plantilla canónica de secciones
                  </label>
                  {allowedCodes && audit?.template?.name && (
                    <span className="text-[10px] text-violet-600 font-medium bg-violet-50 px-2 py-0.5 rounded-full border border-violet-200">
                      {audit.template.name}
                    </span>
                  )}
                </div>
                {!customCode ? (
                  <select
                    value={paperCode}
                    onChange={e => handleSelectPaperCode(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white"
                  >
                    <option value="">— Sin plantilla (papel en blanco) —</option>
                    {filteredGroups.map(g => (
                      <optgroup key={g.group} label={g.group}>
                        {g.items.map(p => {
                          const used = existingPaperCodes.has(p.code);
                          return (
                            <option key={p.code} value={p.code} disabled={used}>
                              {used ? `✓ ${p.code} — ${p.label} (ya en el encargo)` : `${p.code} — ${p.label}`}
                            </option>
                          );
                        })}
                      </optgroup>
                    ))}
                    <option value="__custom__">✎ Ingresar código manualmente…</option>
                  </select>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={paperCode}
                      onChange={e => setPaperCode(e.target.value)}
                      placeholder="PT-A1, PT-COSO, PT-MEMO…"
                      className="flex-1 px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-400 font-mono"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => { setCustomCode(false); setPaperCode(''); }}
                      className="px-3 py-2 text-xs text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 whitespace-nowrap"
                    >
                      ← Lista
                    </button>
                  </div>
                )}
                {paperCode && CANONICAL_BY_CODE[paperCode] && (
                  <p className="text-[10px] text-blue-600 mt-1">
                    💡 {CANONICAL_BY_CODE[paperCode].hint}
                  </p>
                )}
                {existingPaperCodes.size > 0 && !customCode && (
                  <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                    Las plantillas marcadas con ✓ ya están en este encargo y no pueden seleccionarse
                  </p>
                )}
                {!paperCode && !customCode && existingPaperCodes.size === 0 && (
                  <p className="text-[10px] text-gray-400 mt-1">
                    Al seleccionar una plantilla, el tipo, motor y secciones se inicializan automáticamente.
                  </p>
                )}
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                onClick={() => router.back()}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreate}
                disabled={create.isPending || !title.trim()}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#0F2D4A] text-white font-semibold rounded-xl hover:bg-[#1a4a7a] disabled:opacity-50 text-sm"
              >
                {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Crear papel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Wrapper con Suspense (Next.js 15 exige Suspense para useSearchParams) ─────
export default function NewWorkingPaperPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col h-screen bg-[#F0F4F8]">
          <Header />
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
          </div>
        </div>
      }
    >
      <NewWorkingPaperInner />
    </Suspense>
  );
}
