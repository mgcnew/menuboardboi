import React, { createContext, useContext, useCallback, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured, getEnterpriseProfile } from '../lib/supabase';
import type { Profile, UserRole } from '../types';

interface AuthContextType {
  session: any;
  profile: Profile | null;
  loading: boolean;
  isAuthenticated: boolean;
  isClient: boolean;
  isMasterAdmin: boolean;
  signIn: (email: string, password: string) => Promise<any>;
  signUp: (email: string, password: string, fullName?: string) => Promise<any>;
  signOut: () => Promise<void>;
  hasRole: (role: UserRole) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
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

    let mounted = true;

    // Get initial session
    supabase!.auth.getSession().then(({ data: { session: initialSession } }) => {
      if (mounted) {
        setSession(initialSession);
        if (initialSession?.user) {
          loadProfile(initialSession.user.id).then((userProfile) => {
            if (mounted) {
              setProfile(userProfile);
              setLoading(false);
            }
          });
        } else {
          setLoading(false);
        }
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase!.auth.onAuthStateChange((event, currentSession) => {
      if (!mounted) return;
      
      setSession(currentSession);
      
      if (currentSession?.user) {
        // Only set loading to true if we are actually signing in/out to avoid flickering
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          loadProfile(currentSession.user.id).then((userProfile) => {
            if (mounted) setProfile(userProfile);
          });
        }
      } else {
        if (mounted) setProfile(null);
        if (event === 'SIGNED_OUT') {
          if (mounted) setLoading(false);
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
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

  const value = {
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

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}