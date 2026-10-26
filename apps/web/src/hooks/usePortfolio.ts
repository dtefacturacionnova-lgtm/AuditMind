'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────
export type ClientStatus =
  | 'PROSPECT' | 'IN_ACCEPTANCE' | 'PROPOSAL_IN_PROGRESS'
  | 'PENDING_SIGNATURE' | 'ACTIVE' | 'INACTIVE' | 'DECLINED';

export type AcceptanceRating = 'PENDING' | 'GREEN' | 'YELLOW' | 'RED';
export type ProposalStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
export type EngagementLetterStatus = 'DRAFT' | 'SENT' | 'SIGNED' | 'DECLINED';
export type EngagementStatus = 'DRAFT' | 'APPROVED' | 'CANCELLED';
/** Auditoría o consultoría: ambas llevan encargo, horas y costos; la consultoría es menos rigurosa. */
export type EngagementKind = 'AUDIT' | 'CONSULTING';

export interface BeneficialOwner {
  name:              string;
  participationPct?: number;
  idNumber?:         string;
}

export interface Client {
  /** Cliente ACTIVO sin carta firmada ni encargo vigente en el ejercicio anterior ni en el actual (se calcula al leer). */
  dormant?:           boolean;
  id:                 string;
  organizationId:     string;
  legalName:          string;
  tradeName?:         string | null;
  taxId?:             string | null;
  industry?:          string | null;
  contactName?:       string | null;
  contactEmail?:      string | null;
  contactPhone?:      string | null;
  address?:           string | null;
  fiscalYearEndMonth: number;
  fiscalYearEndDay:   number;
  status:             ClientStatus;
  auditEntityId?:     string | null;
  notes?:             string | null;
  /** DDC — representante legal y beneficiarios finales, para el screening de sanciones (Art. 15, Ley PLD/FT/FP). */
  legalRepName?:      string | null;
  beneficialOwners:   BeneficialOwner[];
  createdById:        string;
  createdAt:          string;
  updatedAt:          string;
  _count?: {
    acceptanceChecks: number;
    proposals:        number;
    engagementLetters: number;
    engagements:      number;
  };
}

export type ChecklistStatus = 'PENDING' | 'DONE' | 'NOT_APPLICABLE';

export interface AcceptanceChecklistItem {
  /** Ítem fijo del Radar (PREDECESSOR, CONFLICTS, PRIOR_SERVICES); sin clave = ítem libre de un Radar antiguo. */
  key?:     string;
  item:     string;
  status?:  ChecklistStatus;
  /** Fecha de la solicitud al auditor predecesor (AAAA-MM-DD). */
  date?:    string;
  answer?:  string;
  comment?: string;
}

export type ScreeningDecision = 'FALSE_POSITIVE' | 'CONFIRMED';

export interface ScreeningReview {
  decision: ScreeningDecision;
  reason:   string;
  byId:     string;
  byName:   string;
  at:       string;
}

/** Una coincidencia del screening de sanciones con su revisión (la arma el servidor). */
export interface ScreeningMatch {
  key:          string;
  uploadedName: string;
  matchedName:  string;
  sourceList:   string;
  score:        number | null;
  review:       ScreeningReview | null;
}

export interface SanctionsMatchRecord {
  uploaded_name:          string;
  matched_watchlist_name: string;
  match_type:             string;
  score:                  number;
  source_list:            string;
  entity_type?:            string | null;
  programs?:               string[] | null;
  other_candidates?:       string[];
}

export interface SanctionsScreeningResult {
  /** Constancia del screening (Art. 15 DDC): quién lo corrió, cuándo y qué nombres se revisaron. */
  screenedAt?:     string;
  screenedByName?: string;
  namesChecked?:   string[];
  total_screened:  number;
  matches_found:   number;
  /** Coincidencias con la revisión de cada una (falso positivo / confirmada). */
  matches?:        ScreeningMatch[];
  risk_score:       number;
  lists_consulted:  string;
  findings: Array<{
    test_name:      string;
    risk_level:     string;
    record_count:   number;
    description:    string;
    sample_records: SanctionsMatchRecord[];
  }>;
}

export interface AcceptanceCheck {
  id:                    string;
  organizationId:        string;
  clientId:              string;
  year:                  number;
  independenceStatus:    AcceptanceRating;
  independenceNotes?:    string | null;
  competenceStatus:      AcceptanceRating;
  competenceNotes?:      string | null;
  integrityStatus:       AcceptanceRating;
  integrityNotes?:       string | null;
  riskStatus:            AcceptanceRating;
  riskNotes?:            string | null;
  sanctionsStatus:        AcceptanceRating;
  sanctionsNotes?:        string | null;
  sanctionsScreeningResult?: SanctionsScreeningResult | null;
  checklist:              AcceptanceChecklistItem[];
  overallResult:          AcceptanceRating;
  overallJustification?:  string | null;
  decidedById?:           string | null;
  decidedAt?:             string | null;
  createdAt:              string;
  updatedAt:              string;
  decidedBy?: { id: string; name: string } | null;
  client?:    { id: string; legalName: string; status: ClientStatus };
}

export interface ProposalTeamMember {
  name:   string;
  role?:  string;
  hours?: number;
}

export interface Proposal {
  /** Enviada hace más de 60 días sin respuesta (aviso; no cambia su estado). */
  stale?:             boolean;
  id:                 string;
  organizationId:     string;
  clientId:           string;
  acceptanceCheckId?: string | null;
  year:               number;
  scope?:             string | null;
  fiscalPeriodStart?: string | null;
  fiscalPeriodEnd?:   string | null;
  feeAmount?:         number | string | null;
  feeCurrency:        string;
  teamJson?:          ProposalTeamMember[] | null;
  aiDraftContent?:    string | null;
  finalContent?:      string | null;
  status:             ProposalStatus;
  sentAt?:            string | null;
  respondedAt?:       string | null;
  createdById:        string;
  createdAt:          string;
  updatedAt:          string;
  client?:          { id: string; legalName: string; tradeName?: string | null; status: ClientStatus };
  acceptanceCheck?: { id: string; year: number; overallResult: AcceptanceRating } | null;
  createdBy?:       { id: string; name: string };
  engagementLetter?: { id: string; status: EngagementLetterStatus } | null;
  /** Solo presente en la respuesta de generate-draft */
  usedAI?: boolean;
}

export interface EngagementLetter {
  /** Enviada hace más de 60 días sin firmar (aviso; no cambia su estado). */
  stale?:              boolean;
  id:                  string;
  organizationId:      string;
  clientId:            string;
  proposalId?:         string | null;
  year:                number;
  content:             string;
  signedByClientName?: string | null;
  signedByClientRole?: string | null;
  signedAt?:           string | null;
  fileUrl?:            string | null;
  declineReason?:      string | null;
  status:              EngagementLetterStatus;
  createdById:         string;
  createdAt:           string;
  updatedAt:           string;
  client?:   { id: string; legalName: string; status: ClientStatus };
  proposal?: { id: string; year: number; status: ProposalStatus; feeAmount?: number | string | null; feeCurrency: string } | null;
  createdBy?: { id: string; name: string };
}

export interface Engagement {
  id:                  string;
  organizationId:      string;
  clientId:            string;
  engagementLetterId?: string | null;
  kind:                EngagementKind;
  title?:              string | null;
  fiscalYear:          number;
  fiscalYearEndDate:   string;
  plannedStartDate?:   string | null;
  plannedEndDate?:     string | null;
  leadPartnerId?:      string | null;
  templateId?:         string | null;
  status:              EngagementStatus;
  auditId?:            string | null;
  notes?:              string | null;
  createdById:         string;
  createdAt:           string;
  updatedAt:           string;
  client?:   { id: string; legalName: string; tradeName?: string | null; status: ClientStatus; auditEntityId?: string | null };
  template?: { id: string; name: string; code: string } | null;
  engagementLetter?: { id: string; status: EngagementLetterStatus; signedAt?: string | null; year: number } | null;
  /** `restricted`: investigación ajena al equipo del usuario; el API solo manda id y un título genérico. */
  audit?: { id: string; title: string; status?: string; type?: string; templateId?: string | null; restricted?: boolean } | null;
}

export interface ClientDetail extends Client {
  createdBy:   { id: string; name: string; avatarUrl?: string | null };
  auditEntity?: { id: string; name: string } | null;
  acceptanceChecks: AcceptanceCheck[];
  proposals:        Proposal[];
  engagementLetters: EngagementLetter[];
  engagements:       Engagement[];
}

// ─── Data (create/update) ──────────────────────────────────────────────────────
export interface CreateClientData {
  legalName:           string;
  tradeName?:          string;
  taxId?:              string;
  industry?:           string;
  contactName?:        string;
  contactEmail?:       string;
  contactPhone?:       string;
  address?:            string;
  fiscalYearEndMonth?: number;
  fiscalYearEndDay?:   number;
  notes?:              string;
  legalRepName?:       string;
  beneficialOwners?:   BeneficialOwner[];
}
export type UpdateClientData = Partial<CreateClientData>;

export interface UpdateAcceptanceCheckData {
  independenceStatus?: AcceptanceRating;
  independenceNotes?:  string;
  competenceStatus?:   AcceptanceRating;
  competenceNotes?:    string;
  integrityStatus?:    AcceptanceRating;
  integrityNotes?:     string;
  riskStatus?:         AcceptanceRating;
  riskNotes?:          string;
  sanctionsStatus?:    AcceptanceRating;
  sanctionsNotes?:     string;
  checklist?:          AcceptanceChecklistItem[];
}

export interface CreateProposalData {
  clientId:            string;
  scope?:              string;
  fiscalPeriodStart?:  string;
  fiscalPeriodEnd?:    string;
  feeAmount?:          number;
  feeCurrency?:        string;
  teamJson?:           ProposalTeamMember[];
}

export interface UpdateProposalData {
  scope?:              string;
  fiscalPeriodStart?:  string;
  fiscalPeriodEnd?:    string;
  feeAmount?:          number;
  feeCurrency?:        string;
  teamJson?:           ProposalTeamMember[];
  finalContent?:       string;
  aiDraftContent?:     string;
}

export interface CreateEngagementLetterData {
  proposalId: string;
  /** Marco de información financiera que nombra la carta (NIA 210.6(a)). */
  reportingFramework?: 'NIIF_COMPLETAS' | 'NIIF_PYMES' | 'OTRO';
  reportingFrameworkOther?: string;
}

export interface UpdateEngagementLetterData {
  content?: string;
}

export interface SignEngagementLetterData {
  signedByClientName: string;
  signedByClientRole: string;
  fileUrl?:           string;
}

export interface CreateEngagementData {
  clientId:            string;
  kind?:               EngagementKind;
  title?:              string;
  engagementLetterId?: string;
  fiscalYear:          number;
  fiscalYearEndDate:   string;
  plannedStartDate?:   string;
  plannedEndDate?:     string;
  leadPartnerId?:      string;
  templateId?:         string;
  notes?:              string;
}

// ─── Rentabilidad por Encargo ───────────────────────────────────────────────────

export interface ProfitabilityPersonRow {
  userId:          string;
  userName:        string;
  horasTotales:    number;
  /** null = no se pudo calcular (esa persona no tiene perfil de costeo) — mostrar "Sin costear", nunca $0. */
  costoCalculado:  number | null;
  horasSinCostear: number;
  /** Horas de meses todavía sin cerrar: se costean con el perfil vigente y pueden cambiar. */
  horasProvisionales?: number;
  /** Tarifa pactada con el cliente (Equipo del Encargo). null = sin tarifa asignada todavía. */
  tarifaTipo:        string | null;
  tarifaPorHora:      number | null;
  ingresoPorTarifa:   number | null;
}

export interface ProfitabilityTotals {
  horasTotales:    number;
  costoTotal:      number;
  horasSinCostear: number;
  /** Horas de meses todavía sin cerrar (cifra provisional). Con el cierre de horas apagado son todas, así que solo se avisa si el cierre está activo. */
  horasProvisionales?: number;
  /** null = no se pudo calcular (sin honorario vinculado, o falta perfil de costeo de alguien). */
  margenAbsoluto:  number | null;
  margenPct:       number | null;
  /** Vista alternativa: horas reales × tarifa pactada por persona (Equipo del Encargo),
   *  en vez del honorario fijo de la Propuesta. */
  ingresoPorTarifa:          number;
  horasSinTarifa:            number;
  /** null = nadie del equipo tiene tarifa asignada todavía. */
  margenPorTarifaAbsoluto:   number | null;
  margenPorTarifaPct:        number | null;
  /** Margen sobre lo devengado (honorario × avance − costo); null si el avance no se puede calcular. */
  margenDevengadoAbsoluto?:  number | null;
  margenDevengadoPct?:       number | null;
}

/** Devengado de un encargo (fase 3c): avance del trabajo y honorario ganado; null si el encargo no tiene honorario en Cobranza. */
export interface Devengado {
  progressPct: number | null; accrued: number | null; toInvoice: number | null; invoicedNet: number;
  basis: 'HOURS' | 'COMPLETION' | 'MILESTONES' | 'MANUAL' | 'INVOICED' | 'NONE'; missing: 'NO_BUDGET' | 'NO_MANUAL_PROGRESS' | null;
  billableHours: number; budgetHours: number | null;
}

export interface EngagementProfitability {
  devengado?:  Devengado | null;
  clientName:  string;
  fiscalYear:  number;
  /** null = aún no hay honorario (de Cobranza o de la propuesta) — mostrar "Honorario no definido", nunca $0. */
  ingreso:     { feeAmount: number; feeCurrency: string } | null;
  /** De dónde sale el ingreso: el honorario del encargo en Cobranza o el de la propuesta de su carta. */
  ingresoOrigen?: 'FEE' | 'PROPOSAL' | null;
  /** Explicación cuando no hay ingreso aunque exista un honorario (carta compartida entre encargos, honorario por tiempo). */
  ingresoAviso?:  string | null;
  /** null = el encargo no está aprobado todavía (estado válido, no error) — no hay horas que mostrar. */
  auditId:     string | null;
  porPersona:  ProfitabilityPersonRow[];
  totales:     ProfitabilityTotals;
}

/** Resumen de un encargo aprobado dentro del listado de cartera (sin desglose por persona).
 *  `engagementId`/`clientId` no están descritos en el contrato del endpoint de lista — se
 *  incluyen como opcionales para poder enlazar al detalle del cliente si el backend los envía,
 *  sin romper el render si todavía no lo hace. */
export interface PortfolioProfitabilitySummary {
  engagementId?: string;
  clientId?:     string;
  clientName:    string;
  fiscalYear:    number;
  ingreso:       { feeAmount: number; feeCurrency: string } | null;
  ingresoOrigen?: 'FEE' | 'PROPOSAL' | null;
  ingresoAviso?:  string | null;
  auditId:       string | null;
  totales:       ProfitabilityTotals;
}

// ─── Query keys ───────────────────────────────────────────────────────────────
const CLIENTS_KEY         = 'portfolio-clients';
export const CLIENT_KEY   = 'portfolio-client';
const ENGAGEMENTS_KEY     = 'portfolio-engagements';
const PROFITABILITY_KEY   = 'portfolio-profitability';
const PROFITABILITY_LIST_KEY = 'portfolio-profitability-list';

// ═══════════════════════════════════════════════════════════════════════════
// Clientes
// ═══════════════════════════════════════════════════════════════════════════

export function useClients(status?: ClientStatus) {
  const qs = status ? `?status=${status}` : '';
  return useQuery<Client[]>({
    queryKey: [CLIENTS_KEY, status ?? 'all'],
    queryFn:  () => apiClient.get(`/portfolio/clients${qs}`),
    staleTime: 15_000,
  });
}

export function useClient(id: string) {
  return useQuery<ClientDetail>({
    queryKey: [CLIENT_KEY, id],
    queryFn:  () => apiClient.get(`/portfolio/clients/${id}`),
    enabled:  !!id,
    staleTime: 10_000,
  });
}

export function useCreateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateClientData) => apiClient.post<Client>('/portfolio/clients', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [CLIENTS_KEY] }),
  });
}

export function useUpdateClient(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateClientData) => apiClient.patch<Client>(`/portfolio/clients/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [CLIENTS_KEY] });
      qc.invalidateQueries({ queryKey: [CLIENT_KEY, id] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Radar de Aceptación (NIA 220 / ISQM 1)
// ═══════════════════════════════════════════════════════════════════════════

export function useStartAcceptance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (clientId: string) =>
      apiClient.post<AcceptanceCheck>(`/portfolio/clients/${clientId}/start-acceptance`, {}),
    onSuccess: (_, clientId) => {
      qc.invalidateQueries({ queryKey: [CLIENT_KEY, clientId] });
      qc.invalidateQueries({ queryKey: [CLIENTS_KEY] });
    },
  });
}

export function useUpdateAcceptanceCheck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateAcceptanceCheckData }) =>
      apiClient.patch<AcceptanceCheck>(`/portfolio/acceptance-checks/${id}`, data),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: [CLIENT_KEY, result.clientId] });
    },
  });
}

/** Se decide con las calificaciones y notas tal como están en pantalla (el servidor las guarda junto con la decisión). */
export function useDecideAcceptance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; overallJustification: string } & UpdateAcceptanceCheckData) =>
      apiClient.post<AcceptanceCheck>(`/portfolio/acceptance-checks/${id}/decide`, body),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: [CLIENT_KEY, result.clientId] });
      qc.invalidateQueries({ queryKey: [CLIENTS_KEY] });
    },
  });
}

/** Reabrir un Radar ya decidido (solo CAE o superior): exige el motivo. */
/** Revisar UNA coincidencia del screening de sanciones: falso positivo o confirmada, siempre con el motivo. */
export function useReviewScreeningMatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; screenedAt: string; matchKey: string; decision: ScreeningDecision; reason: string }) =>
      apiClient.post<AcceptanceCheck>(`/portfolio/acceptance-checks/${id}/review-screening-match`, body),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: [CLIENT_KEY, result.clientId] });
    },
  });
}

export function useReopenAcceptance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiClient.post<AcceptanceCheck>(`/portfolio/acceptance-checks/${id}/reopen`, { reason }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: [CLIENT_KEY, result.clientId] });
      qc.invalidateQueries({ queryKey: [CLIENTS_KEY] });
    },
  });
}

export interface CompetenceSummary {
  year: number;
  staffTotal: number;
  staffCompliant: number;
  cpeCompliancePct: number | null;
  minRequiredHours: number;
  certifications: Array<{ type: string; count: number }>;
  competencyAreas: Array<{ area: string; count: number }>;
}

/** Resumen real de competencia/CPE/recursos de la firma — evidencia de
 *  referencia para la dimensión "Competencia y Recursos", org-wide (no
 *  depende del cliente/check en cuestión). */
export function useCompetenceSummary(enabled: boolean = true) {
  return useQuery<CompetenceSummary>({
    queryKey: ['portfolio-competence-summary'],
    queryFn: () => apiClient.get('/portfolio/acceptance-checks/competence-summary'),
    enabled,
    staleTime: 60_000,
  });
}

/** Corre el motor CAATs de sanciones (OFAC/ONU/UK) sobre el cliente — razón
 *  social, representante legal y beneficiarios finales. */
export function useScreenSanctions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<AcceptanceCheck>(`/portfolio/acceptance-checks/${id}/screen-sanctions`, {}),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: [CLIENT_KEY, result.clientId] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Propuestas
// ═══════════════════════════════════════════════════════════════════════════

export function useCreateProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateProposalData) => apiClient.post<Proposal>('/portfolio/proposals', data),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: [CLIENT_KEY, result.clientId] });
      qc.invalidateQueries({ queryKey: [CLIENTS_KEY] });
    },
  });
}

export function useGenerateProposalDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post<Proposal>(`/portfolio/proposals/${id}/generate-draft`, {}),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: [CLIENT_KEY, result.clientId] });
    },
  });
}

export function useUpdateProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateProposalData }) =>
      apiClient.patch<Proposal>(`/portfolio/proposals/${id}`, data),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: [CLIENT_KEY, result.clientId] });
    },
  });
}

export function useSendProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post<Proposal>(`/portfolio/proposals/${id}/send`, {}),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: [CLIENT_KEY, result.clientId] });
      qc.invalidateQueries({ queryKey: [CLIENTS_KEY] });
    },
  });
}

export function useAcceptProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post<Proposal>(`/portfolio/proposals/${id}/accept`, {}),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: [CLIENT_KEY, result.clientId] });
      qc.invalidateQueries({ queryKey: [CLIENTS_KEY] });
    },
  });
}

export function useRejectProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post<Proposal>(`/portfolio/proposals/${id}/reject`, {}),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: [CLIENT_KEY, result.clientId] });
      qc.invalidateQueries({ queryKey: [CLIENTS_KEY] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Carta de Compromiso
// ═══════════════════════════════════════════════════════════════════════════

export function useCreateEngagementLetter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateEngagementLetterData) =>
      apiClient.post<EngagementLetter>('/portfolio/engagement-letters', data),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: [CLIENT_KEY, result.clientId] });
      qc.invalidateQueries({ queryKey: [CLIENTS_KEY] });
    },
  });
}

export function useUpdateEngagementLetter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateEngagementLetterData }) =>
      apiClient.patch<EngagementLetter>(`/portfolio/engagement-letters/${id}`, data),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: [CLIENT_KEY, result.clientId] });
    },
  });
}

export function useSignEngagementLetter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: SignEngagementLetterData }) =>
      apiClient.post<EngagementLetter>(`/portfolio/engagement-letters/${id}/sign`, data),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: [CLIENT_KEY, result.clientId] });
      qc.invalidateQueries({ queryKey: [CLIENTS_KEY] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Encargos
// ═══════════════════════════════════════════════════════════════════════════

export function useEngagements(clientId?: string, status?: EngagementStatus) {
  const params = new URLSearchParams();
  if (clientId) params.set('clientId', clientId);
  if (status)   params.set('status', status);
  const qs = params.toString();
  return useQuery<Engagement[]>({
    queryKey: [ENGAGEMENTS_KEY, clientId ?? 'all', status ?? 'all'],
    queryFn:  () => apiClient.get(`/portfolio/engagements${qs ? '?' + qs : ''}`),
    staleTime: 15_000,
  });
}

export function useCreateEngagement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateEngagementData) => apiClient.post<Engagement>('/portfolio/engagements', data),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: [ENGAGEMENTS_KEY] });
      qc.invalidateQueries({ queryKey: [CLIENT_KEY, result.clientId] });
    },
  });
}

export interface UpdateEngagementData {
  title?:            string;
  /** Solo mientras el encargo es borrador. */
  engagementLetterId?: string;
  fiscalYearEndDate?: string;
  plannedStartDate?: string;
  plannedEndDate?:   string;
  leadPartnerId?:    string;
  notes?:            string;
}

export function useUpdateEngagement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateEngagementData }) =>
      apiClient.patch<Engagement>(`/portfolio/engagements/${id}`, data),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: [ENGAGEMENTS_KEY] });
      qc.invalidateQueries({ queryKey: [CLIENT_KEY, result.clientId] });
      qc.invalidateQueries({ queryKey: ['audits'] });
      qc.invalidateQueries({ queryKey: ['collections'] });
    },
  });
}

export function useApproveEngagement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post<Engagement>(`/portfolio/engagements/${id}/approve`, {}),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: [ENGAGEMENTS_KEY] });
      qc.invalidateQueries({ queryKey: [CLIENT_KEY, result.clientId] });
      // La aprobación crea una Audit real — refresca también el listado de auditorías.
      qc.invalidateQueries({ queryKey: ['audits'] });
    },
  });
}

export function useCancelEngagement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post<Engagement>(`/portfolio/engagements/${id}/cancel`, {}),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: [ENGAGEMENTS_KEY] });
      qc.invalidateQueries({ queryKey: [CLIENT_KEY, result.clientId] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Rentabilidad por Encargo
// ═══════════════════════════════════════════════════════════════════════════
// Ambos endpoints requieren rol CAE o superior (ADMIN/SUPER_ADMIN pasan por la
// jerarquía de `hasRole`). El parámetro `enabled` permite a la UI evitar por
// completo la llamada de red cuando el usuario no califica, en vez de dejar que
// el backend la rechace — pásalo como `hasRole([...])` desde el componente.

/** Rentabilidad de un encargo puntual (con desglose por persona). */
export function useEngagementProfitability(engagementId: string, enabled = true) {
  return useQuery<EngagementProfitability>({
    queryKey: [PROFITABILITY_KEY, engagementId],
    queryFn:  () => apiClient.get(`/portfolio/engagements/${engagementId}/profitability`),
    enabled:  enabled && !!engagementId,
    staleTime: 15_000,
  });
}

/** Rentabilidad de todos los encargos aprobados de un año (sin desglose por persona),
 *  ya ordenados por el backend por margen % descendente (no calculables al final). */
export function usePortfolioProfitability(year: number, enabled = true) {
  return useQuery<PortfolioProfitabilitySummary[]>({
    queryKey: [PROFITABILITY_LIST_KEY, year],
    queryFn:  () => apiClient.get(`/portfolio/profitability?year=${year}`),
    enabled:  enabled && !!year,
    staleTime: 15_000,
  });
}

// ─── Config visual ──────────────────────────────────────────────────────────

/** Orden natural del pipeline comercial. INACTIVE/DECLINED se muestran aparte. */
export const PIPELINE_STATUSES: ClientStatus[] = [
  'PROSPECT', 'IN_ACCEPTANCE', 'PROPOSAL_IN_PROGRESS', 'PENDING_SIGNATURE', 'ACTIVE',
];
export const ARCHIVED_STATUSES: ClientStatus[] = ['INACTIVE', 'DECLINED'];

export const CLIENT_STATUS_CONFIG: Record<ClientStatus, { label: string; color: string; bg: string; dot: string }> = {
  PROSPECT:             { label: 'Prospecto',            color: 'text-gray-600',    bg: 'bg-gray-100',    dot: 'bg-gray-400' },
  IN_ACCEPTANCE:        { label: 'En Aceptación',        color: 'text-amber-700',   bg: 'bg-amber-100',   dot: 'bg-amber-500' },
  PROPOSAL_IN_PROGRESS: { label: 'Propuesta en Curso',   color: 'text-blue-700',    bg: 'bg-blue-100',    dot: 'bg-blue-500' },
  PENDING_SIGNATURE:    { label: 'Pendiente de Firma',   color: 'text-violet-700',  bg: 'bg-violet-100',  dot: 'bg-violet-500' },
  ACTIVE:               { label: 'Activo',               color: 'text-emerald-700', bg: 'bg-emerald-100', dot: 'bg-emerald-500' },
  INACTIVE:             { label: 'Inactivo',             color: 'text-gray-500',    bg: 'bg-gray-100',    dot: 'bg-gray-400' },
  DECLINED:             { label: 'Declinado',            color: 'text-red-700',     bg: 'bg-red-100',     dot: 'bg-red-500' },
};

export const ACCEPTANCE_RATING_CONFIG: Record<AcceptanceRating, { label: string; color: string; bg: string; border: string }> = {
  PENDING: { label: 'Pendiente', color: 'text-gray-500',    bg: 'bg-gray-100',    border: 'border-gray-200' },
  GREEN:   { label: 'Verde',     color: 'text-emerald-700', bg: 'bg-emerald-100', border: 'border-emerald-300' },
  YELLOW:  { label: 'Amarillo',  color: 'text-amber-700',   bg: 'bg-amber-100',   border: 'border-amber-300' },
  RED:     { label: 'Rojo',      color: 'text-red-700',     bg: 'bg-red-100',     border: 'border-red-300' },
};

export const PROPOSAL_STATUS_CONFIG: Record<ProposalStatus, { label: string; color: string; bg: string }> = {
  DRAFT:    { label: 'Borrador',  color: 'text-gray-600',    bg: 'bg-gray-100' },
  SENT:     { label: 'Enviada',   color: 'text-blue-700',    bg: 'bg-blue-100' },
  ACCEPTED: { label: 'Aceptada',  color: 'text-emerald-700', bg: 'bg-emerald-100' },
  REJECTED: { label: 'Rechazada', color: 'text-red-700',     bg: 'bg-red-100' },
  EXPIRED:  { label: 'Expirada',  color: 'text-gray-500',    bg: 'bg-gray-100' },
};

export const ENGAGEMENT_LETTER_STATUS_CONFIG: Record<EngagementLetterStatus, { label: string; color: string; bg: string }> = {
  DRAFT:    { label: 'Borrador', color: 'text-gray-600',    bg: 'bg-gray-100' },
  SENT:     { label: 'Enviada',  color: 'text-blue-700',    bg: 'bg-blue-100' },
  SIGNED:   { label: 'Firmada',  color: 'text-emerald-700', bg: 'bg-emerald-100' },
  DECLINED: { label: 'Rechazada', color: 'text-red-700',    bg: 'bg-red-100' },
};

export const ENGAGEMENT_STATUS_CONFIG: Record<EngagementStatus, { label: string; color: string; bg: string }> = {
  DRAFT:     { label: 'Borrador', color: 'text-gray-600',    bg: 'bg-gray-100' },
  APPROVED:  { label: 'Aprobado', color: 'text-emerald-700', bg: 'bg-emerald-100' },
  CANCELLED: { label: 'Cancelado', color: 'text-red-700',    bg: 'bg-red-100' },
};

/** Umbrales semánticos de margen % para Rentabilidad por Encargo.
 *  >30% sano, 10–30% ajustado, 0–10% bajo, <0 negativo, null = no calculable. */
export function marginTone(pct: number | null): { label: string; text: string; bg: string; border: string; dot: string } {
  if (pct === null) return { label: 'No calculable', text: 'text-gray-500',    bg: 'bg-gray-50',    border: 'border-gray-200',    dot: 'bg-gray-300' };
  if (pct >= 30)     return { label: 'Margen sano',    text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500' };
  if (pct >= 10)     return { label: 'Margen ajustado', text: 'text-amber-700',  bg: 'bg-amber-50',   border: 'border-amber-200',   dot: 'bg-amber-500' };
  if (pct >= 0)      return { label: 'Margen bajo',     text: 'text-red-700',    bg: 'bg-red-50',     border: 'border-red-200',     dot: 'bg-red-500' };
  return               { label: 'Margen negativo',    text: 'text-red-700',    bg: 'bg-red-50',     border: 'border-red-200',     dot: 'bg-red-500' };
}
