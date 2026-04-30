import { useCallback, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured, getEnterpriseProfile } from '../lib/supabase';
import type { Profile, UserRole } from '../types';

export function useAuth() {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string) => {
    if (!isSupabaseConfigured) return null;
    try {
      const data = await getEnterpriseProfile(userId);
      return data as Profile;
    } catch (error) {
      console.error('[useAuth] Erro ao carregar perfil:', error);
      return null;
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    // Carregar sessão inicial
    const init = async () => {
      try {
        const { data: { session: initialSession } } = await supabase!.auth.getSession();
        setSession(initialSession);

        if (initialSession?.user) {
          const userProfile = await loadProfile(initialSession.user.id);
          setProfile(userProfile);
        }
      } catch (err) {
        console.error('[useAuth] Erro na inicialização:', err);
      } finally {
        setLoading(false);
      }
    };
    init();

    // Escutar mudanças de autenticação
    const { data: { subscription } } = supabase!.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      if (session?.user) {
        const userProfile = await loadProfile(session.user.id);
        setProfile(userProfile);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!isSupabaseConfigured) throw new Error('Supabase não configurado');
    const { data, error } = await supabase!.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName?: string) => {
    if (!isSupabaseConfigured) throw new Error('Supabase não configurado');
    const { data, error } = await supabase!.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    });
    if (error) throw error;
    return data;
  }, []);

  const signOut = useCallback(async () => {
    if (!isSupabaseConfigured) throw new Error('Supabase não configurado');
    await supabase!.auth.signOut();
  }, []);

  const hasRole = useCallback((role: UserRole) => {
    return profile?.role === role;
  }, [profile]);

  return {
    session,
    profile,
    loading,
    signIn,
    signUp,
    signOut,
    isAuthenticated: !!session?.user,
    isClient: hasRole('client'),
    isMasterAdmin: hasRole('master_admin'),
    hasRole,
  };
}