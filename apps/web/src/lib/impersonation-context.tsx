'use client';

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { setImpersonateClientId } from './api';
import { useAuth } from './auth/auth-provider';

interface ImpersonationState {
  clientId: string | null;
  clientName: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
}

interface ImpersonationContextValue {
  isImpersonating: boolean;
  clientId: string | null;
  clientName: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  startImpersonating: (clientId: string, clientName: string, logoUrl?: string | null, primaryColor?: string | null) => void;
  stopImpersonating: () => void;
}

const STORAGE_KEY = 'kol360_impersonation';

const emptyState: ImpersonationState = { clientId: null, clientName: null, logoUrl: null, primaryColor: null };

const ImpersonationContext = createContext<ImpersonationContextValue>({
  isImpersonating: false,
  clientId: null,
  clientName: null,
  logoUrl: null,
  primaryColor: null,
  startImpersonating: () => {},
  stopImpersonating: () => {},
});

export function useImpersonation() {
  return useContext(ImpersonationContext);
}

function loadFromStorage(): ImpersonationState {
  if (typeof window === 'undefined') return emptyState;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...emptyState, ...JSON.parse(stored) };
  } catch {}
  return emptyState;
}

function saveToStorage(state: ImpersonationState) {
  if (typeof window === 'undefined') return;
  if (state.clientId) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function ImpersonationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isPlatformAdmin = user?.role === 'PLATFORM_ADMIN';

  const [state, setState] = useState<ImpersonationState>(() => {
    if (!isPlatformAdmin) return emptyState;
    return loadFromStorage();
  });

  // Sync impersonation header with api.ts on mount and state changes
  useEffect(() => {
    const effectiveId = isPlatformAdmin ? state.clientId : null;
    setImpersonateClientId(effectiveId);
  }, [state.clientId, isPlatformAdmin]);

  // Clear impersonation if user is no longer PLATFORM_ADMIN
  useEffect(() => {
    if (!isPlatformAdmin && state.clientId) {
      setState(emptyState);
      saveToStorage(emptyState);
      setImpersonateClientId(null);
    }
  }, [isPlatformAdmin, state.clientId]);

  const startImpersonating = useCallback((clientId: string, clientName: string, logoUrl?: string | null, primaryColor?: string | null) => {
    const newState: ImpersonationState = { clientId, clientName, logoUrl: logoUrl || null, primaryColor: primaryColor || null };
    setState(newState);
    saveToStorage(newState);
    setImpersonateClientId(clientId);
    queryClient.invalidateQueries();
  }, [queryClient]);

  const stopImpersonating = useCallback(() => {
    setState(emptyState);
    saveToStorage(emptyState);
    setImpersonateClientId(null);
    queryClient.invalidateQueries();
  }, [queryClient]);

  return (
    <ImpersonationContext.Provider
      value={{
        isImpersonating: !!state.clientId && isPlatformAdmin,
        clientId: state.clientId,
        clientName: state.clientName,
        logoUrl: state.logoUrl,
        primaryColor: state.primaryColor,
        startImpersonating,
        stopImpersonating,
      }}
    >
      {children}
    </ImpersonationContext.Provider>
  );
}
