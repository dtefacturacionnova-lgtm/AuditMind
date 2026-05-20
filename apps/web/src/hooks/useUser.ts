'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../lib/supabase/client';
import type { User } from '@supabase/supabase-js';

export interface AppUser {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string;
  organizationName?: string;
  aiPersonality: string;
  supabaseUser: User;
}

export function useUser() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const getUser = async () => {
      const { data: { user: sbUser } } = await supabase.auth.getUser();
      if (sbUser) {
        setUser({
          id: sbUser.id,
          email: sbUser.email!,
          name: (sbUser.user_metadata?.name as string) ?? sbUser.email!,
          role: (sbUser.app_metadata?.role as string) ?? 'AUDITOR',
          organizationId: (sbUser.app_metadata?.organization_id as string) ?? '',
          organizationName: sbUser.app_metadata?.organization_name as string | undefined,
          aiPersonality: (sbUser.user_metadata?.ai_personality as string) ?? 'ATHENA',
          supabaseUser: sbUser,
        });
      } else {
        setUser(null);
      }
      setLoading(false);
    };

    getUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email!,
          name: (session.user.user_metadata?.name as string) ?? session.user.email!,
          role: (session.user.app_metadata?.role as string) ?? 'AUDITOR',
          organizationId: (session.user.app_metadata?.organization_id as string) ?? '',
          organizationName: session.user.app_metadata?.organization_name as string | undefined,
          aiPersonality: (session.user.user_metadata?.ai_personality as string) ?? 'ATHENA',
          supabaseUser: session.user,
        });
      } else {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const hasRole = (roles: string[]): boolean => {
    if (!user) return false;
    const hierarchy: Record<string, number> = {
      SUPER_ADMIN: 100, ADMIN: 90, CAE: 80, AUDIT_MANAGER: 70,
      SENIOR_AUDITOR: 60, AUDITOR: 50, AUDITEE: 20, READ_ONLY: 10,
    };
    return roles.some(r => (hierarchy[user.role] ?? 0) >= (hierarchy[r] ?? 0));
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return { user, loading, hasRole, signOut };
}
