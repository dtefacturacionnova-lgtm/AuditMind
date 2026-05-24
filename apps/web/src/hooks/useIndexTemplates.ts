'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { PhaseType } from './useExpediente';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface FolderTemplate {
  ref: string;
  name: string;
  sortOrder: number;
  children?: FolderTemplate[];
}

export interface PhaseTemplate {
  phaseType: PhaseType;
  name: string;
  order: number;
  folders: FolderTemplate[];
}

export interface IndexTemplate {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  isDefault: boolean;
  isSystem: boolean;
  structure: PhaseTemplate[];
  createdById: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: { id: string; name: string };
}

export interface CreateTemplateData {
  name: string;
  description?: string;
  isDefault?: boolean;
  structure: PhaseTemplate[];
}

export interface UpdateTemplateData extends Partial<CreateTemplateData> {}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function countStructure(structure: PhaseTemplate[]) {
  let folders = 0;
  for (const phase of structure) {
    for (const f of phase.folders) {
      folders++;
      folders += f.children?.length ?? 0;
    }
  }
  return { phases: structure.length, folders };
}

/** Plantilla IIA estándar para usar como base al crear una nueva */
export const IIA_STARTER: PhaseTemplate[] = [
  {
    phaseType: 'PLANNING',
    name: 'Planificación de la Auditoría',
    order: 0,
    folders: [
      { ref: 'A', name: 'Planificación', sortOrder: 0, children: [
        { ref: 'A-1', name: 'Comunicación de Auditoría',  sortOrder: 0 },
        { ref: 'A-2', name: 'Entendimiento del Negocio',  sortOrder: 1 },
        { ref: 'A-3', name: 'Evaluación de Riesgos',      sortOrder: 2 },
        { ref: 'A-4', name: 'Materialidad',               sortOrder: 3 },
        { ref: 'A-5', name: 'Programa de Auditoría',      sortOrder: 4 },
      ]},
    ],
  },
  {
    phaseType: 'FIELDWORK',
    name: 'Ejecución de la Auditoría',
    order: 1,
    folders: [
      { ref: 'B', name: 'Evaluación de Controles', sortOrder: 0, children: [
        { ref: 'B-1', name: 'Ambiente de Control (COSO)',     sortOrder: 0 },
        { ref: 'B-2', name: 'Evaluación de Controles Clave',  sortOrder: 1 },
      ]},
      { ref: 'C', name: 'Pruebas Sustantivas', sortOrder: 1, children: [
        { ref: 'C-1', name: 'Área 1', sortOrder: 0 },
        { ref: 'C-2', name: 'Área 2', sortOrder: 1 },
      ]},
      { ref: 'AD', name: 'Análisis de Datos (CAATs)', sortOrder: 2 },
      { ref: 'I',  name: 'Entrevistas',               sortOrder: 3 },
    ],
  },
  {
    phaseType: 'REPORTING',
    name: 'Informe',
    order: 2,
    folders: [
      { ref: 'D', name: 'Hallazgos', sortOrder: 0 },
      { ref: 'E', name: 'Cierre y Conclusión', sortOrder: 1, children: [
        { ref: 'E-1', name: 'Borrador de Informe',  sortOrder: 0 },
        { ref: 'E-2', name: 'Revisión de Gerencia', sortOrder: 1 },
        { ref: 'E-3', name: 'Informe Final',        sortOrder: 2 },
      ]},
    ],
  },
  {
    phaseType: 'FOLLOWUP',
    name: 'Eventos Posteriores',
    order: 3,
    folders: [
      { ref: 'F', name: 'Seguimiento de Recomendaciones', sortOrder: 0 },
      { ref: 'G', name: 'Archivo Permanente',              sortOrder: 1 },
    ],
  },
];

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useIndexTemplates() {
  return useQuery<IndexTemplate[]>({
    queryKey: ['index-templates'],
    queryFn:  () => apiClient.get('/index-templates'),
    staleTime: 60_000,
  });
}

export function useIndexTemplate(id: string) {
  return useQuery<IndexTemplate>({
    queryKey: ['index-template', id],
    queryFn:  () => apiClient.get(`/index-templates/${id}`),
    enabled:  !!id,
    staleTime: 30_000,
  });
}

export function useCreateIndexTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTemplateData) =>
      apiClient.post<IndexTemplate>('/index-templates', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['index-templates'] }),
  });
}

export function useUpdateIndexTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTemplateData }) =>
      apiClient.patch<IndexTemplate>(`/index-templates/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['index-templates'] }),
  });
}

export function useDeleteIndexTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/index-templates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['index-templates'] }),
  });
}

export function useSetDefaultTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/index-templates/${id}/set-default`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['index-templates'] }),
  });
}
