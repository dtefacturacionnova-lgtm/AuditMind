import type {
  UserRole,
  AuditType,
  AuditStatus,
  RiskLevel,
  FindingSeverity,
  FindingStatus,
  WorkingPaperType,
  WorkingPaperStatus,
  TickMark,
  RagBase,
  AiAgentType,
  ConfirmationType,
  ConfirmationStatus,
  PbcRequestStatus,
  RecommendationStatus,
  EvidenceType,
  ControlType,
  ControlNature,
  TestingApproach,
} from './enums';

// ─── Auth / User ────────────────────────────────────────────────────────────

export interface AppUser {
  id: string;
  supabaseUserId: string;
  email: string;
  name: string;
  role: UserRole;
  organizationId: string;
  organizationName?: string;
  avatarUrl?: string;
  aiAssistantPersonality: string;
  isActive: boolean;
  createdAt: string;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  organizationId: string;
  iat?: number;
  exp?: number;
}

// ─── Pagination ──────────────────────────────────────────────────────────────

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// ─── Organization ────────────────────────────────────────────────────────────

export interface Organization {
  id: string;
  name: string;
  rut?: string;
  industry?: string;
  country: string;
  logoUrl?: string;
  primaryColor?: string;
  maxUsers: number;
  currentUsers: number;
  subscriptionTier: string;
  createdAt: string;
}

// ─── Audit ───────────────────────────────────────────────────────────────────

export interface AuditRiskModel {
  inherentRisk: number;    // RI (0-1)
  controlRisk: number;     // RC (0-1)
  detectionRisk: number;   // RD = 0.05 / (RI × RC)
  auditRisk: number;       // AR = RI × RC × RD ≈ 0.05 (5%)
}

export interface MaterialityModel {
  base: number;
  baseDescription: string;
  percentage: number;
  globalMateriality: number;          // MG
  executionMateriality: number;       // ME = 75% of MG
  accumulationThreshold: number;      // UAE = 50% of MG
}

export interface Audit {
  id: string;
  code: string;
  title: string;
  type: AuditType;
  status: AuditStatus;
  organizationId: string;
  auditableUnitId: string;
  auditableUnitName: string;
  leadAuditorId: string;
  leadAuditorName: string;
  startDate: string;
  endDate: string;
  plannedHours: number;
  actualHours: number;
  isInvestigationMode: boolean;
  materiality?: number;
  materialityExecution?: number;
  materialityAccumulation?: number;
  auditRiskModel?: AuditRiskModel;
  riskLevel: RiskLevel;
  scope?: string;
  objectives?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Working Papers ──────────────────────────────────────────────────────────

export interface WorkingPaper {
  id: string;
  code: string;
  title: string;
  type: WorkingPaperType;
  status: WorkingPaperStatus;
  indexSection: string;
  auditId: string;
  preparerId: string;
  reviewerId?: string;
  content?: string;
  conclusion?: string;
  tickMarks: TickMark[];
  crossReferences: string[];
  aiAssisted: boolean;
  ragBasesUsed: RagBase[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Findings ────────────────────────────────────────────────────────────────

export interface Finding {
  id: string;
  code: string;
  title: string;
  severity: FindingSeverity;
  status: FindingStatus;
  auditId: string;
  workingPaperId?: string;
  condition: string;
  criteria: string;
  cause: string;
  effect: string;
  isMaterial: boolean;
  qualityScore?: number;
  normativeReference?: string;
  normativeArticle?: string;
  escalationLevel: number;
  isRecurring: boolean;
  isInvestigation: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Recommendation {
  id: string;
  findingId: string;
  description: string;
  status: RecommendationStatus;
  responsibleId?: string;
  responsibleName?: string;
  dueDate?: string;
  implementedDate?: string;
  verificationNotes?: string;
  priority: RiskLevel;
  createdAt: string;
}

// ─── Evidence ────────────────────────────────────────────────────────────────

export interface Evidence {
  id: string;
  type: EvidenceType;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  description?: string;
  uploadedById: string;
  uploadedByName: string;
  workingPaperId?: string;
  findingId?: string;
  checksumSha256?: string;
  isForensic: boolean;
  chainOfCustody?: ChainOfCustodyEntry[];
  createdAt: string;
}

export interface ChainOfCustodyEntry {
  action: string;
  userId: string;
  userName: string;
  timestamp: string;
  hash: string;
}

// ─── Controls ────────────────────────────────────────────────────────────────

export interface Control {
  id: string;
  code: string;
  description: string;
  type: ControlType;
  nature: ControlNature;
  frequency: string;
  ownerId?: string;
  ownerName?: string;
  riskIds: string[];
  testingApproach: TestingApproach[];
  designEffective?: boolean;
  operatingEffective?: boolean;
  lastTestedDate?: string;
  deficiencies?: string;
}

// ─── External Confirmations (NIA 505) ────────────────────────────────────────

export interface ExternalConfirmation {
  id: string;
  type: ConfirmationType;
  status: ConfirmationStatus;
  auditId: string;
  workingPaperId?: string;
  counterpartyName: string;
  counterpartyEmail?: string;
  counterpartyAddress?: string;
  requestDate?: string;
  dueDate?: string;
  receivedDate?: string;
  responseContent?: string;
  differenceNotes?: string;
  isPositive: boolean;
  secondRequestSent: boolean;
  createdAt: string;
}

// ─── Portal / PBC ─────────────────────────────────────────────────────────────

export interface PbcRequest {
  id: string;
  auditId: string;
  title: string;
  description: string;
  status: PbcRequestStatus;
  assignedToEmail: string;
  assignedToName?: string;
  dueDate: string;
  submittedDate?: string;
  portalToken: string;
  isConfidential: boolean;
  attachments?: PbcAttachment[];
  auditeeNotes?: string;
  auditorNotes?: string;
  createdAt: string;
}

export interface PbcAttachment {
  id: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: string;
}

// ─── AI ──────────────────────────────────────────────────────────────────────

export interface AiConversation {
  id: string;
  agentType: AiAgentType;
  userId: string;
  auditId?: string;
  title: string;
  messages: AiMessage[];
  ragBasesUsed: RagBase[];
  modelUsed: string;
  totalTokens: number;
  createdAt: string;
  updatedAt: string;
}

export interface AiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  tokensUsed?: number;
  ragContext?: string[];
}

export interface AiTaskRequest {
  agentType: AiAgentType;
  task: string;
  context: Record<string, unknown>;
  ragBases?: RagBase[];
  conversationId?: string;
  auditId?: string;
}

export interface AiTaskResponse {
  conversationId: string;
  messageId: string;
  content: string;
  modelUsed: string;
  tokensUsed: number;
  ragChunksUsed: number;
  processingTimeMs: number;
}

// ─── Dashboard / KPIs ────────────────────────────────────────────────────────

export interface DashboardKpis {
  auditsInProgress: number;
  auditsCompleted: number;
  openFindings: number;
  criticalFindings: number;
  overduePbcRequests: number;
  planComplianceRate: number;
  avgAuditDurationDays: number;
  aiInteractionsThisMonth: number;
}

export interface AuditTimeline {
  auditId: string;
  auditTitle: string;
  startDate: string;
  endDate: string;
  status: AuditStatus;
  completionPercentage: number;
}

// ─── API Response wrapper ─────────────────────────────────────────────────────

export interface ApiResponse<T = void> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: string[];
}
