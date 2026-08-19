'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export type AuditModality = 'INTERNAL' | 'EXTERNAL' | 'BOTH';

export interface Organization {
  id:             string;
  name:           string;
  auditModality:  AuditModality;
  logoUrl?:       string;
  primaryColor?:  string;
}

interface OrganizationContextValue {
  organization: Organization | undefined;
  isLoading:    boolean;
}

const OrganizationContext = createContext<OrganizationContextValue | undefined>(undefined);

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { data: organization, isLoading } = useQuery<Organization>({
    queryKey:  ['organization', 'me'],
    queryFn:   () => apiClient.get('/organizations/me'),
    // La modalidad de auditoría de una organización casi nunca cambia —
    // se cachea agresivamente para no repetir el fetch en cada navegación.
    staleTime: 5 * 60 * 1000,
  });

  return (
    <OrganizationContext.Provider value={{ organization, isLoading }}>
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization(): OrganizationContextValue {
  const ctx = useContext(OrganizationContext);
  if (!ctx) {
    throw new Error('useOrganization debe usarse dentro de un <OrganizationProvider>');
  }
  return ctx;
}
