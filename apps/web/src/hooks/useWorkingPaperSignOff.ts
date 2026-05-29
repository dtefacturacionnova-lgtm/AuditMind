import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export type SignOffLevel = 'prepare' | 'review' | 'signoff';

export interface SignOffMatrixRow {
  id: string;
  code: string;
  indexSection: string;
  title: string;
  status: string;
  type: string;
  preparedById:  string | null;
  preparedAt:    string | null;
  reviewedById:  string | null;
  reviewedAt:    string | null;
  signedOffById: string | null;
  signedOffAt:   string | null;
  preparedBy:    { id: string; name: string } | null;
  reviewedBy:    { id: string; name: string } | null;
  signedOffBy:   { id: string; name: string } | null;
  qualityScore:  number | null;
  _count: { comments: number };
}

export function useSignOffMatrix(auditId: string) {
  return useQuery({
    queryKey: ['sign-off-matrix', auditId],
    queryFn:  () => apiClient.get<SignOffMatrixRow[]>(`/working-papers/sign-off-matrix/${auditId}`),
    enabled:  !!auditId,
  });
}

export function useSignOff(paperId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (level: SignOffLevel) =>
      apiClient.post(`/working-papers/${paperId}/sign`, { level }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sign-off-matrix'] });
      queryClient.invalidateQueries({ queryKey: ['working-paper', paperId] });
    },
  });
}

export interface PbcLinkItem {
  id: string;
  pbcId: string;
  paperId: string;
  createdAt: string;
  pbc: {
    id: string;
    title: string;
    description: string;
    requestedToEmail: string;
    status: string;
    fileUrls: string[];
    submittedAt: string | null;
  };
}

export interface PbcAvailableItem {
  id: string;
  title: string;
  description: string;
  requestedToEmail: string;
  status: string;
  fileUrls: string[];
  submittedAt: string | null;
}

export interface PbcLinksResult {
  linkedItems:    PbcLinkItem[];
  availableItems: PbcAvailableItem[];
}

export function usePbcLinks(paperId: string) {
  return useQuery({
    queryKey: ['pbc-links', paperId],
    queryFn:  () => apiClient.get<PbcLinksResult>(`/working-papers/${paperId}/pbc-links`),
    enabled:  !!paperId,
  });
}

export function useLinkPbc(paperId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pbcId: string) =>
      apiClient.post(`/working-papers/${paperId}/pbc-links`, { pbcId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pbc-links', paperId] });
    },
  });
}

export function useUnlinkPbc(paperId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (linkId: string) =>
      apiClient.delete(`/working-papers/pbc-links/${linkId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pbc-links', paperId] });
    },
  });
}
