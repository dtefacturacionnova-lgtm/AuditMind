'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import {
  pollInterval, type SealStatus, type SignatureDocumentType, type SignatureEventView, type SignatureStatus,
} from '@/lib/signature/internal';

// ─── Tipos (reflejan internalRequestView de apps/api/src/signatures/signature-views.ts) ──────────────────────
export interface SignatureAttachmentView {
  id: string;
  originalName: string;
  detectedType: string | null;
  sizeBytes: number;
  scanStatus: 'CLEAN' | 'INFECTED' | 'ERROR';
  submitted: boolean;
  hasSafeCopy: boolean;
  originalSha256: string | null;
  safeSha256: string | null;
}

export interface SignatureRequestView {
  id: string;
  documentType: SignatureDocumentType;
  documentLabel: string;
  targetId: string;
  auditId: string | null;
  title: string;
  signerName: string;
  signerEmail: string;
  signerRole: string | null;
  status: SignatureStatus;
  sealStatus: SealStatus;
  createdAt: string;
  expiresAt: string | null;
  sentAt: string | null;
  sendCount: number;
  reminderEnabled: boolean;
  viewedAt: string | null;
  signedAt: string | null;
  signedName: string | null;
  signedRole: string | null;
  signerIp: string | null;
  response: Record<string, unknown> | null;
  declineReason: string | null;
  verificationCode: string | null;
  documentSha256: string | null;
  signedPdfSha256: string | null;
  sealedAt: string | null;
  timestamped: boolean;
  revokedAt: string | null;
  revokedReason: string | null;
  hasSignedPdf: boolean;
  events: SignatureEventView[];
  attachments: SignatureAttachmentView[];
}

/** Respuesta de crear y de reenviar. `signUrl` es la ÚNICA vez que el enlace llega en claro: no se guarda en caché. */
export interface SendResult {
  request: SignatureRequestView;
  signUrl: string;
  emailSent: boolean;
}

export interface CreateSignatureData {
  documentType: SignatureDocumentType;
  targetId: string;
  signerName: string;
  signerEmail: string;
  signerRole?: string;
  expiresInDays?: number;
  reminderEnabled?: boolean;
  /** Datos propios del tipo de documento (los valida su adaptador en el servidor). */
  payload?: Record<string, unknown>;
}

export interface IntegrityResult {
  ok: boolean;
  checks: Array<{ name: string; ok: boolean; detail?: string }>;
}

export interface SignatureFileLink {
  url: string;
  expiresInSeconds: number;
  warning?: string;
}

const KEY = 'signature-requests';
const base = '/signature-requests';

// ─── Consultas ───────────────────────────────────────────────────────────────
/** Solicitudes de firma de un documento. Se refresca sola mientras alguna se está sellando. */
export function useSignatureRequests(documentType: SignatureDocumentType, targetId: string | undefined) {
  return useQuery<SignatureRequestView[]>({
    queryKey: [KEY, documentType, targetId],
    queryFn: () => apiClient.get(`${base}?documentType=${documentType}&targetId=${encodeURIComponent(targetId ?? '')}`),
    enabled: !!targetId,
    staleTime: 15_000,
    refetchInterval: (query) => pollInterval(query.state.data),
  });
}

// ─── Acciones ────────────────────────────────────────────────────────────────
function useRefreshing<TVars, TData>(fn: (vars: TVars) => Promise<TData>) {
  const qc = useQueryClient();
  return useMutation<TData, Error, TVars>({
    mutationFn: fn,
    onSuccess: () => { void qc.invalidateQueries({ queryKey: [KEY] }); },
    // El enlace en claro no debe quedarse en la caché de mutaciones más de lo necesario.
    gcTime: 0,
  });
}

export const useCreateSignatureRequest = () =>
  useRefreshing<CreateSignatureData, SendResult>((data) => apiClient.post(base, data));

export const useResendSignatureRequest = () =>
  useRefreshing<{ id: string; expiresInDays?: number }, SendResult>(({ id, expiresInDays }) =>
    apiClient.post(`${base}/${id}/resend`, expiresInDays ? { expiresInDays } : {}));

export const useRevokeSignatureRequest = () =>
  useRefreshing<{ id: string; reason: string }, SignatureRequestView>(({ id, reason }) =>
    apiClient.post(`${base}/${id}/revoke`, { reason }));

export const useResealSignatureRequest = () =>
  useRefreshing<{ id: string }, SignatureRequestView>(({ id }) => apiClient.post(`${base}/${id}/reseal`, {}));

/** Pide un enlace de 10 minutos a un archivo: original | signed | attachment:<id> | quarantine:<id>. */
export const useSignatureFileLink = () =>
  useMutation<SignatureFileLink, Error, { id: string; kind: string }>({
    mutationFn: ({ id, kind }) => apiClient.get(`${base}/${id}/file/${encodeURIComponent(kind)}`),
  });

export const useSignatureIntegrity = () =>
  useMutation<IntegrityResult, Error, { id: string }>({
    mutationFn: ({ id }) => apiClient.get(`${base}/${id}/integrity`),
  });
