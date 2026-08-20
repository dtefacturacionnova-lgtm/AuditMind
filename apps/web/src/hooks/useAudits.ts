'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface Audit {
  id: string;
  code: string;
  title: string;
  type: string;
  subtype?: string;
  status: string;
  riskLevel?: string;
  startDate: string;
  endDate: string;
  estimatedHours: number;
  actualHours: number;
  scope?: string;
  objectives?: string;
  materiality?: number;
  materialityExecution?: number;
  materialityAccumulation?: number;
  materialityBase?: string;
  materialityBaseAmount?: number;
  auditRiskModel?: {
    inherentRisk: number;
    controlRisk: number;
    detectionRisk: number;
    auditRisk: number;
  };
  isInvestigationMode: boolean;
  templateId?: string;
  template?: { id: string; name: string };
  auditableUnit?: { id: string; name: string; division?: string };
  auditEntity?: { id: string; name: string; category?: string; inherentRiskScore?: number };
  leadAuditor?: { id: string; name: string; avatarUrl?: string };
  team?: { id: string; role: string; userId: string; user: { id: string; name: string; role: string; avatarUrl?: string } }[];
  _count: {
    workingPapers: number;
    findings: number;
    pbcRequests: number;
    externalConfirmations?: number;
  };
  // Solo en useAudit(id) (findOne) — hallazgos de seguimiento de informes
  // anteriores (isRecurring), excluidos de _count.findings para no inflarlo.
  recurringFindingsCount?: number;
}

export interface AuditsResponse {
  data: Audit[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export function useAudits(params?: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  type?: string;
  subtype?: string;
}) {
  const query = new URLSearchParams();
  if (params?.page)    query.set('page',    String(params.page));
  if (params?.limit)   query.set('limit',   String(params.limit));
  if (params?.search)  query.set('search',  params.search);
  if (params?.status)  query.set('status',  params.status);
  if (params?.type)    query.set('type',    params.type);
  if (params?.subtype) query.set('subtype', params.subtype);

  return useQuery({
    queryKey: ['audits', params],
    queryFn: () => apiClient.get<AuditsResponse>(`/audits?${query}`),
  });
}

export function useAudit(id: string) {
  return useQuery({
    queryKey: ['audits', id],
    queryFn: () => apiClient.get<Audit>(`/audits/${id}`),
    enabled: !!id,
  });
}

export function useCreateAudit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => apiClient.post('/audits', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['audits'] }),
  });
}

export function useUpdateAuditStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, comment }: { id: string; status: string; comment?: string }) =>
      apiClient.patch(`/audits/${id}/status`, { status, comment }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['audits'] });
      qc.invalidateQueries({ queryKey: ['audits', vars.id] });
    },
  });
}

// ─── Backup / restauración (BKP-09) ──────────────────────────────────────────

export interface RestoreBackupResultado {
  audit: { id: string; title: string };
  totalFilasCreadas: number;
  totalArchivosSubidos: number;
  advertencias: { modelo: string; filaId?: string; mensaje: string }[];
}

export function useRestoreBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file, titulo }: { file: File; titulo?: string }) => {
      const form = new FormData();
      form.append('file', file);
      if (titulo?.trim()) form.append('titulo', titulo.trim());
      return apiClient.postForm<RestoreBackupResultado>('/audits/restore-backup', form);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['audits'] }),
  });
}

// ─── Restauración DESTRUCTIVA (BKP-12) — sobrescribe un encargo existente ────

export interface RestoreDestructivePreview {
  auditTituloActual: string;
  backup: {
    auditTitulo: string;
    generadoEn: string;
    generadoPor: string;
    conteoPorModelo: Record<string, number>;
  };
  conteoActual: Record<string, number>;
}

export interface RestoreDestructivoResultado {
  audit: { id: string; title: string };
  totalFilasCreadas: number;
  totalArchivosSubidos: number;
  advertencias: { modelo: string; filaId?: string; mensaje: string }[];
}

export function usePreviewRestoreDestructivo(auditId: string) {
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return apiClient.postForm<RestoreDestructivePreview>(`/audits/${auditId}/backup/restore-preview`, form);
    },
  });
}

export function useRestoreDestructivo(auditId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file, confirmarTitulo }: { file: File; confirmarTitulo: string }) => {
      const form = new FormData();
      form.append('file', file);
      form.append('confirmarTitulo', confirmarTitulo);
      return apiClient.postForm<RestoreDestructivoResultado>(`/audits/${auditId}/backup/restore-destructive`, form);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['audits'] });
      qc.invalidateQueries({ queryKey: ['audits', auditId] });
    },
  });
}

// ─── Borrado COMPLETO de un encargo (2026-08-20) ─────────────────────────────
// A diferencia de la restauración destructiva (BKP-12, sobrescribe pero
// conserva el Audit), esto lo borra por completo — filas y archivos. Mismo
// patrón de previsualización + confirmación escrita del título.

export interface DeleteAuditPreview {
  auditId: string;
  auditTitulo: string;
  totalFilas: number;
  conteoPorModelo: Record<string, number>;
  engagementVinculado: number;
}

export interface DeleteAuditResultado {
  auditId: string;
  auditTitulo: string;
  totalFilasBorradas: number;
  conteoPorModelo: Record<string, number>;
  archivosBorrados: number;
  archivosConError: number;
  engagementesDesvinculados: number;
  advertencias: { modelo: string; filaId?: string; mensaje: string }[];
}

export function useDeleteAuditPreview(auditId: string) {
  return useMutation({
    mutationFn: () => apiClient.get<DeleteAuditPreview>(`/audits/${auditId}/delete-preview`),
  });
}

export function useDeleteAudit(auditId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (confirmarTitulo: string) =>
      apiClient.post<DeleteAuditResultado>(`/audits/${auditId}/delete`, { confirmarTitulo }),
    // "Fire and forget" — NO retornar la promesa de invalidateQueries. A
    // diferencia de crear/restaurar (donde el recurso invalidado sigue
    // existiendo y su refetch siempre resuelve OK), aquí el encargo YA no
    // existe: el refetch de useAudit(auditId) que dispara la invalidación
    // SIEMPRE falla con 404. TanStack Query espera la promesa que retorna
    // onSuccess antes de asentar la mutación — si esa promesa se rechaza (o
    // tarda) por culpa de ese refetch fallido, mutateAsync() nunca resuelve
    // para quien llama, dejando el modal pegado en "isPending" para siempre
    // aunque el borrado ya haya terminado (bug real, encontrado en pruebas
    // reales contra producción — verificado con fetch instrumentado que la
    // llamada real SÍ completaba, solo la promesa de la mutación no).
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['audits'] }).catch(() => {}); },
  });
}

// ─── Papeles disponibles desde plantilla ─────────────────────────────────────

export interface AvailableTemplatePaper {
  code: string;
  indexSection: string;
  title: string;
  type: string;
  wpKind: string;
  paperCode?: string;
}

export function useAvailableTemplatePapers(auditId: string | undefined) {
  return useQuery<AvailableTemplatePaper[]>({
    queryKey: ['available-template-papers', auditId],
    queryFn: () => apiClient.get<AvailableTemplatePaper[]>(`/audits/${auditId}/available-template-papers`),
    enabled: !!auditId,
    staleTime: 30_000,
  });
}

export function useAddTemplatePaper(auditId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) =>
      apiClient.post(`/audits/${auditId}/add-template-paper`, { code }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['available-template-papers', auditId] });
      qc.invalidateQueries({ queryKey: ['audits', auditId] });
      qc.invalidateQueries({ queryKey: ['expediente', auditId] });
    },
  });
}
