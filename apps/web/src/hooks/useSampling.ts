'use client';

import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SamplingMethod   = 'MUS' | 'ATTRIBUTE';
export type SelectionMethod  = 'RANDOM' | 'SYSTEMATIC' | 'MUS';
export type ConfidenceLevel  = 70 | 75 | 80 | 90 | 95 | 99;

export interface MUSRequest {
  book_value: number;
  tolerable_misstatement: number;
  expected_misstatement?: number;
  confidence_level?: ConfidenceLevel;
}

export interface MUSResponse {
  method: 'MUS';
  sample_size: number;
  sampling_interval: number;
  confidence_factor: number;
  expansion_factor: number;
  methodology_note: string;
  parameters: Record<string, unknown>;
}

export interface AttributeRequest {
  population_size?: number;
  tolerable_deviation_rate: number;
  expected_deviation_rate?: number;
  confidence_level?: 90 | 95 | 99;
}

export interface AttributeResponse {
  method: 'ATTRIBUTE';
  sample_size: number;
  methodology_note: string;
  parameters: Record<string, unknown>;
}

export interface SelectionRequest {
  records:          Record<string, unknown>[];
  sample_size:      number;
  selection_method: SelectionMethod;
  value_field?:     string;
  seed?:            number;
}

export interface SelectionResponse {
  selected:         Record<string, unknown>[];
  selection_method: SelectionMethod;
  seed_used:        number | null;
  interval?:        number;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useCalculateMUS() {
  return useMutation({
    mutationFn: (req: MUSRequest) =>
      apiClient.post<MUSResponse>('/ai/sampling/calculate/mus', req),
  });
}

export function useCalculateAttribute() {
  return useMutation({
    mutationFn: (req: AttributeRequest) =>
      apiClient.post<AttributeResponse>('/ai/sampling/calculate/attribute', req),
  });
}

export function useSelectSample() {
  return useMutation({
    mutationFn: (req: SelectionRequest) =>
      apiClient.post<SelectionResponse>('/ai/sampling/select', req),
  });
}
