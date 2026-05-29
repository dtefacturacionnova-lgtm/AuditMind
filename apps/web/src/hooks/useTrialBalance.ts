import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TbAccount {
  code:    string;
  name:    string;
  debit:   number;
  credit:  number;
  balance: number;
}

export interface TrialBalanceSummary {
  id:          string;
  filename:    string;
  periodLabel: string;
  importedAt:  string;
  totalDebit:  string;
  totalCredit: string;
  isBalanced:  boolean;
  _count:      { paperLinks: number };
}

export interface TrialBalanceFull {
  id:           string;
  filename:     string;
  periodLabel:  string;
  importedAt:   string;
  totalDebit:   string;
  totalCredit:  string;
  isBalanced:   boolean;
  accounts:     TbAccount[];
  paperLinks:   Array<{
    id:           string;
    paperId:      string;
    accountCodes: string[];
    note?:        string;
    paper: {
      id:           string;
      code:         string;
      title:        string;
      indexSection: string;
    };
  }>;
}

export interface ImportTrialBalanceDto {
  filename:    string;
  periodLabel: string;
  accounts:    TbAccount[];
}

// ─── Parse CSV client-side ────────────────────────────────────────────────────

export function parseCsv(text: string): TbAccount[] {
  const lines  = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = lines[0].split(/[;,\t]/).map(h => h.trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, ''));  // strip accents

  const colMap = {
    code:    ['codigo', 'code', 'cuenta', 'account', 'cod'],
    name:    ['nombre', 'name', 'descripcion', 'description', 'denominacion'],
    debit:   ['debe', 'debit', 'debito', 'debitos'],
    credit:  ['haber', 'credit', 'credito', 'creditos'],
    balance: ['saldo', 'balance', 'neto', 'net'],
  };

  function findIdx(keys: string[]) {
    for (const k of keys) {
      const i = headers.findIndex(h => h.includes(k));
      if (i >= 0) return i;
    }
    return -1;
  }

  const codeIdx    = findIdx(colMap.code);
  const nameIdx    = findIdx(colMap.name);
  const debitIdx   = findIdx(colMap.debit);
  const creditIdx  = findIdx(colMap.credit);
  const balanceIdx = findIdx(colMap.balance);

  if (codeIdx < 0 || nameIdx < 0) return [];

  const sep = lines[0].includes(';') ? ';' : lines[0].includes('\t') ? '\t' : ',';

  return lines.slice(1).map(line => {
    const cols   = line.split(sep).map(c => c.trim().replace(/"/g, ''));
    const debit  = parseFloat((cols[debitIdx]  ?? '0').replace(/[,$]/g, '').replace(',', '.')) || 0;
    const credit = parseFloat((cols[creditIdx] ?? '0').replace(/[,$]/g, '').replace(',', '.')) || 0;
    const balance = balanceIdx >= 0
      ? parseFloat((cols[balanceIdx] ?? '0').replace(/[,$]/g, '').replace(',', '.')) || 0
      : debit - credit;

    return {
      code:    cols[codeIdx]  ?? '',
      name:    cols[nameIdx]  ?? '',
      debit,
      credit,
      balance,
    };
  }).filter(a => a.code);
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useTrialBalances(auditId: string) {
  return useQuery({
    queryKey: ['trial-balances', auditId],
    queryFn:  () => apiClient.get<TrialBalanceSummary[]>(`/audits/${auditId}/trial-balance`),
    enabled:  !!auditId,
  });
}

export function useTrialBalance(tbId: string) {
  return useQuery({
    queryKey: ['trial-balance', tbId],
    queryFn:  () => apiClient.get<TrialBalanceFull>(`/audits/trial-balance/${tbId}`),
    enabled:  !!tbId,
  });
}

export function useImportTrialBalance(auditId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: ImportTrialBalanceDto) =>
      apiClient.post<TrialBalanceSummary>(`/audits/${auditId}/trial-balance`, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trial-balances', auditId] });
    },
  });
}

export function useLinkTrialBalance(tbId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: { paperId: string; accountCodes: string[]; note?: string }) =>
      apiClient.post(`/audits/trial-balance/${tbId}/link`, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trial-balance', tbId] });
    },
  });
}

export function useDeleteTrialBalance(auditId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tbId: string) =>
      apiClient.delete(`/audits/trial-balance/${tbId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trial-balances', auditId] });
    },
  });
}
