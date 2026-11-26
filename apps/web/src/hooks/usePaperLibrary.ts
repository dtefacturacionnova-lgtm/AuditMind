'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// Biblioteca por papel de la organización: catálogo del sistema + ajustes propios (ver API working-papers/paper-library/org-library.ts).

export const TECHNIQUES = ['Inspección', 'Confirmación', 'Observación', 'Indagación', 'Recálculo', 'Reejecución', 'Analítico'] as const;
export type Technique = (typeof TECHNIQUES)[number];
export type LibraryPriority = 'HIGH' | 'MEDIUM' | 'LOW';
export type LibraryOrigin = 'BASE' | 'EDITED' | 'OWN';

export const PRIORITY_LABEL: Record<LibraryPriority, string> = { HIGH: 'Alta', MEDIUM: 'Media', LOW: 'Baja' };

/** Tipos de encargo (los mismos del sistema) con su nombre en pantalla. */
export const AUDIT_TYPE_LABEL: Record<string, string> = {
  INTERNAL: 'Interna', EXTERNAL: 'Externa', OPERATIONAL: 'Operativa', FINANCIAL: 'Financiera', IT: 'TI', COMPLIANCE: 'Cumplimiento',
  ESG: 'ESG', FORENSIC: 'Forense', BCP_DRP: 'BCP/DRP', INTERNAL_GOVERNMENTAL: 'Interna gubernamental',
  EXTERNAL_FINANCIAL: 'Financiera externa', IT_SECURITY: 'Seguridad de la información', BCP_CONTINUITY: 'Continuidad del negocio',
  IT_SYSTEMS: 'Sistemas de información', AML: 'PLD / AML', FISCAL: 'Fiscal',
};

/** Lo que el auditor escribe para un procedimiento de la biblioteca. */
export interface LibraryItemInput {
  title: string;
  statement: string;
  development: string;
  technique: Technique;
  ref?: string;
  priority: LibraryPriority;
  /** Vacío = todos los tipos de encargo. */
  auditTypes?: string[];
}

export interface LibraryItem extends LibraryItemInput {
  /** Id estable: el del sistema (`PT-NIA550.02`) o `org-<fila>` si lo creó la organización. */
  id: string;
  origin: LibraryOrigin;
  hidden: boolean;
  rowId?: string;
  /** Solo si fue editado: el texto original del sistema. */
  original?: LibraryItemInput & { id: string };
}

export interface PaperLibrarySummary {
  paperCode: string;
  title: string | null;
  baseCount: number;
  editedCount: number;
  hiddenCount: number;
  ownCount: number;
}

export interface PaperLibraryDetail {
  paperCode: string;
  title: string | null;
  hasBase: boolean;
  reviewedAt: string;
  items: LibraryItem[];
}

const KEY = ['paper-library'];

export function usePaperLibraryList() {
  return useQuery<PaperLibrarySummary[]>({
    queryKey: [...KEY, 'list'],
    queryFn: () => apiClient.get('/paper-library'),
    staleTime: 30_000,
  });
}

export function usePaperLibrary(paperCode: string | null | undefined) {
  return useQuery<PaperLibraryDetail>({
    queryKey: [...KEY, 'paper', paperCode],
    queryFn: () => apiClient.get(`/paper-library/${encodeURIComponent(paperCode as string)}`),
    enabled: !!paperCode,
    staleTime: 30_000,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: KEY });
}

export function useCreateLibraryItem() {
  const done = useInvalidate();
  return useMutation({
    mutationFn: ({ paperCode, data }: { paperCode: string; data: LibraryItemInput }) =>
      apiClient.post<{ id: string; rowId: string }>(`/paper-library/${encodeURIComponent(paperCode)}/items`, data),
    onSuccess: done,
  });
}

export function useUpdateLibraryItem() {
  const done = useInvalidate();
  return useMutation({
    mutationFn: ({ rowId, data }: { rowId: string; data: Partial<LibraryItemInput> }) =>
      apiClient.patch<{ id: string; rowId: string }>(`/paper-library/items/${rowId}`, data),
    onSuccess: done,
  });
}

export function useDeleteLibraryItem() {
  const done = useInvalidate();
  return useMutation({
    mutationFn: (rowId: string) => apiClient.delete(`/paper-library/items/${rowId}`),
    onSuccess: done,
  });
}

/** Edita y/u oculta un procedimiento que trae el sistema, solo para esta organización. */
export function useOverrideBaseItem() {
  const done = useInvalidate();
  return useMutation({
    mutationFn: ({ paperCode, baseId, hidden, content }: { paperCode: string; baseId: string; hidden?: boolean; content?: LibraryItemInput }) =>
      apiClient.put(`/paper-library/${encodeURIComponent(paperCode)}/base/${encodeURIComponent(baseId)}`, { hidden, content }),
    onSuccess: done,
  });
}

export function useRestoreBaseItem() {
  const done = useInvalidate();
  return useMutation({
    mutationFn: ({ paperCode, baseId }: { paperCode: string; baseId: string }) =>
      apiClient.delete(`/paper-library/${encodeURIComponent(paperCode)}/base/${encodeURIComponent(baseId)}`),
    onSuccess: done,
  });
}
