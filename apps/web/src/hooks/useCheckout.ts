import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface CheckoutResult {
  success:        boolean;
  checkedOutById?: string;
  checkedOutAt?:  string;
  lockedBy?:      string;
  lockedAt?:      string;
  expiresAt?:     string;
}

export function useCheckout(paperId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient.post<CheckoutResult>(`/working-papers/${paperId}/checkout`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['working-paper', paperId] });
    },
  });
}

export function useCheckin(paperId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient.post<{ success: boolean }>(`/working-papers/${paperId}/checkin`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['working-paper', paperId] });
    },
  });
}
