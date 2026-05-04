import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthProvider, useAuth } from './useAuth';
import React from 'react';

// Mock do supabase e das funções relacionadas
vi.mock('../lib/supabase', () => {
  const getEnterpriseProfileMock = vi.fn();
  return {
    supabase: {
      auth: {
        getSession: vi.fn(),
        onAuthStateChange: vi.fn(),
        signInWithPassword: vi.fn(),
        signOut: vi.fn(),
      },
    },
    isSupabaseConfigured: true,
    getEnterpriseProfile: getEnterpriseProfileMock,
  };
});

import { supabase, getEnterpriseProfile } from '../lib/supabase';

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve restaurar a sessão corretamente no reload (F5)', async () => {
    const mockSession = { user: { id: 'user-1' } };
    const mockProfile = { id: 'user-1', role: 'client', company_id: 'comp-1' };

    // Simulando o retorno da sessão no getSession
    (supabase.auth.getSession as any).mockResolvedValue({ data: { session: mockSession } });
    
    // Simulando a onAuthStateChange sem novos eventos imediatos
    const unsubscribe = vi.fn();
    (supabase.auth.onAuthStateChange as any).mockReturnValue({
      data: { subscription: { unsubscribe } }
    });

    // Simulando a busca de perfil
    (getEnterpriseProfile as any).mockResolvedValue(mockProfile);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    // Inicialmente deve estar carregando
    expect(result.current.loading).toBe(true);

    // Após resolver, deve estar autenticado
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.session).toEqual(mockSession);
    expect(result.current.profile).toEqual(mockProfile);
    expect(result.current.isClient).toBe(true);
    expect(result.current.isMasterAdmin).toBe(false);
  });

  it('deve reconhecer o perfil de administrador (master_admin) após login', async () => {
    const mockSession = { user: { id: 'admin-1' } };
    const mockProfile = { id: 'admin-1', role: 'master_admin', company_id: null };

    (supabase.auth.getSession as any).mockResolvedValue({ data: { session: mockSession } });
    const unsubscribe = vi.fn();
    (supabase.auth.onAuthStateChange as any).mockReturnValue({
      data: { subscription: { unsubscribe } }
    });
    (getEnterpriseProfile as any).mockResolvedValue(mockProfile);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.isMasterAdmin).toBe(true);
    expect(result.current.isClient).toBe(false);
  });
});
