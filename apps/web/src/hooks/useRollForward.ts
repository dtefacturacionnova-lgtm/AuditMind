import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface RollForwardDto {
  title: string;
  startDate?: string;
  endDate?: string;
  carryOpenFindings?: boolean;
}

export function useRollForward(auditId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: RollForwardDto) =>
      apiClient.post<{ id: string; title: string }>(`/audits/${auditId}/roll-forward`, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audits'] });
    },
  });
}
