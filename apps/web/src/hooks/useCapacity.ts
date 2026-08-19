'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HolidayConfig {
  id:        string;
  date:      string;
  label:     string;
  recurring: boolean;
  active:    boolean;
}

export interface CreateHolidayData {
  date:       string; // ISO yyyy-mm-dd
  label:      string;
  recurring?: boolean;
}

export interface UpdateHolidayData {
  date?:      string;
  label?:     string;
  recurring?: boolean;
  active?:    boolean;
}

export interface UserAvailabilityProfile {
  id:                 string;
  organizationId:     string;
  userId:             string;
  year:               number;
  workingDaysPerWeek: number;
  standardDailyHours: number;
  annualVacationDays: number;
  estimatedSickDays:  number;
  estimatedLeaveDays: number;
  // Calculados por el backend — no editables
  grossWorkingDays:   number;
  netAvailableDays:   number;
  netAvailableHours:  number;
  user?: { id: string; name: string };
}

export interface UpsertAvailabilityProfileData {
  userId:              string;
  year:                number;
  workingDaysPerWeek?: number;
  standardDailyHours?: number;
  annualVacationDays?: number;
  estimatedSickDays?:  number;
  estimatedLeaveDays?: number;
}

export type UpdateAvailabilityProfileData = Omit<UpsertAvailabilityProfileData, 'userId' | 'year'>;

export interface BillingRate {
  userId:                string;
  year:                  number;
  suggestedBillingRate:  number;
  effectiveOverrideRate?: number;
}

export interface UserCostProfile {
  id:                        string;
  organizationId:            string;
  userId:                    string;
  year:                      number;
  annualBaseSalary:          number;
  annualBonuses:             number;
  payrollTaxRatePct:         number;
  indirectCostRatePct:       number;
  otherAnnualCosts:          number;
  targetMultiplier:          number;
  targetUtilizationPct:      number;
  effectiveOverrideRate?:    number;
  netAvailableHoursOverride?: number;
  // Calculados por el backend — no editables
  totalAnnualCost:           number;
  costRatePerHour:           number;
  breakEvenBillableRate:     number;
  suggestedBillingRate:      number;
  user?: { id: string; name: string };
}

export interface UpsertCostProfileData {
  userId:                     string;
  year:                       number;
  annualBaseSalary:           number;
  annualBonuses?:             number;
  payrollTaxRatePct?:         number;
  indirectCostRatePct?:       number;
  otherAnnualCosts?:          number;
  targetMultiplier?:          number;
  targetUtilizationPct?:      number;
  effectiveOverrideRate?:     number;
  netAvailableHoursOverride?: number;
}

export type UpdateCostProfileData = Omit<UpsertCostProfileData, 'userId' | 'year'>;

// ─── Holidays ─────────────────────────────────────────────────────────────────

export function useHolidays(year: number) {
  return useQuery<HolidayConfig[]>({
    queryKey: ['capacity-holidays', year],
    queryFn:  () => apiClient.get(`/capacity/holidays?year=${year}`),
    enabled:  !!year,
    staleTime: 30_000,
  });
}

export function useCreateHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateHolidayData) => apiClient.post('/capacity/holidays', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['capacity-holidays'] }),
  });
}

export function useUpdateHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateHolidayData }) =>
      apiClient.patch(`/capacity/holidays/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['capacity-holidays'] }),
  });
}

export function useDeleteHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/capacity/holidays/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['capacity-holidays'] }),
  });
}

// ─── Availability profiles ────────────────────────────────────────────────────

export function useMyAvailabilityProfile(year: number) {
  return useQuery<UserAvailabilityProfile | null>({
    queryKey: ['capacity-availability-me', year],
    queryFn:  () => apiClient.get(`/capacity/availability-profiles/me?year=${year}`),
    enabled:  !!year,
    staleTime: 30_000,
  });
}

/** Lista los perfiles del equipo para un año — el único medio de consultar el
 *  perfil de OTRO usuario (no existe GET por userId; la búsqueda se hace en el cliente). */
export function useTeamAvailabilityProfiles(year: number) {
  return useQuery<UserAvailabilityProfile[]>({
    queryKey: ['capacity-availability-team', year],
    queryFn:  () => apiClient.get(`/capacity/availability-profiles?year=${year}`),
    enabled:  !!year,
    staleTime: 15_000,
  });
}

export function useUpsertAvailabilityProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpsertAvailabilityProfileData) =>
      apiClient.post<UserAvailabilityProfile>('/capacity/availability-profiles', data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['capacity-availability-team', vars.year] });
      qc.invalidateQueries({ queryKey: ['capacity-availability-me'] });
      // El backend recalcula el UserCostProfile vinculado (si existe) al cambiar disponibilidad
      qc.invalidateQueries({ queryKey: ['capacity-cost-profile'] });
      qc.invalidateQueries({ queryKey: ['capacity-cost-profiles', vars.year] });
    },
  });
}

export function useUpdateAvailabilityProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateAvailabilityProfileData }) =>
      apiClient.patch<UserAvailabilityProfile>(`/capacity/availability-profiles/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['capacity-availability-team'] });
      qc.invalidateQueries({ queryKey: ['capacity-availability-me'] });
      qc.invalidateQueries({ queryKey: ['capacity-cost-profile'] });
      qc.invalidateQueries({ queryKey: ['capacity-cost-profiles'] });
    },
  });
}

// ─── Cost profiles ────────────────────────────────────────────────────────────

/** Tarifa de facturación sugerida sin desglose de costos (visible desde AUDIT_MANAGER+). */
export function useBillingRate(userId: string, year: number) {
  return useQuery<BillingRate>({
    queryKey: ['capacity-billing-rate', userId, year],
    queryFn:  () => apiClient.get(`/capacity/cost-profiles/${userId}/billing-rate?year=${year}`),
    enabled:  !!userId && !!year,
    retry:    false, // 404 = aún no existe perfil de costeo para este usuario/año
    staleTime: 30_000,
  });
}

/** Desglose completo de costeo de un usuario (requiere rol CAE+).
 *  Devuelve error 404 si aún no se ha configurado — se trata como "sin perfil todavía". */
export function useCostProfile(userId: string, year: number) {
  return useQuery<UserCostProfile>({
    queryKey: ['capacity-cost-profile', userId, year],
    queryFn:  () => apiClient.get(`/capacity/cost-profiles/${userId}?year=${year}`),
    enabled:  !!userId && !!year,
    retry:    false,
    staleTime: 15_000,
  });
}

export function useCostProfiles(year: number) {
  return useQuery<UserCostProfile[]>({
    queryKey: ['capacity-cost-profiles', year],
    queryFn:  () => apiClient.get(`/capacity/cost-profiles?year=${year}`),
    enabled:  !!year,
    staleTime: 15_000,
  });
}

export function useUpsertCostProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpsertCostProfileData) =>
      apiClient.post<UserCostProfile>('/capacity/cost-profiles', data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['capacity-cost-profile', vars.userId, vars.year] });
      qc.invalidateQueries({ queryKey: ['capacity-cost-profiles', vars.year] });
      qc.invalidateQueries({ queryKey: ['capacity-billing-rate', vars.userId, vars.year] });
    },
  });
}

export function useUpdateCostProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateCostProfileData }) =>
      apiClient.patch<UserCostProfile>(`/capacity/cost-profiles/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['capacity-cost-profile'] });
      qc.invalidateQueries({ queryKey: ['capacity-cost-profiles'] });
      qc.invalidateQueries({ queryKey: ['capacity-billing-rate'] });
    },
  });
}

// ─── Selector de empleados de la organización ─────────────────────────────────
// No existe un hook compartido para esto hoy — `admin/users/page.tsx` define un
// `useUsers(search, page)` local y paginado (para la tabla de gestión de usuarios).
// Para selectores tipo <select> reutilizamos el mismo endpoint `GET /users` pero
// pidiendo una página única y grande (sin paginación real en la UI).

export interface OrgUserOption {
  id:    string;
  name:  string;
  email: string;
  role:  string;
}

interface UsersListResponse {
  data: OrgUserOption[];
  meta: { total: number; page: number; totalPages: number };
}

export function useOrgUsersList() {
  return useQuery<OrgUserOption[]>({
    queryKey: ['org-users-list'],
    queryFn:  async () => {
      const res = await apiClient.get<UsersListResponse>('/users?page=1&limit=500');
      return res.data;
    },
    staleTime: 60_000,
  });
}
