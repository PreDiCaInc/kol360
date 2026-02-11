'use client';

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { setImpersonateClientId } from './api';
import { useAuth } from './auth/auth-provider';

interface ImpersonationState {
  clientId: string | null;
  clientName: string | null;
}

interface ImpersonationContextValue {
  isImpersonating: boolean;
  clientId: string | null;
  clientName: string | null;
  startImpersonating: (clientId: string, clientName: string) => void;
  stopImpersonating: () => void;
}

const STORAGE_KEY = 'kol360_impersonation';

const ImpersonationContext = createContext<ImpersonationContextValue>({
  isImpersonating: false,
  clientId: null,
  clientName: null,
  startImpersonating: () => {},
  stopImpersonating: () => {},
});

export function useImpersonation() {
  return useContext(ImpersonationContext);
}

function loadFromStorage(): ImpersonationState {
  if (typeof window === 'undefined') return { clientId: null, clientName: null };
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return { clientId: null, clientName: null };
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
    if (!isPlatformAdmin) return { clientId: null, clientName: null };
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
      setState({ clientId: null, clientName: null });
      saveToStorage({ clientId: null, clientName: null });
      setImpersonateClientId(null);
    }
  }, [isPlatformAdmin, state.clientId]);

  const startImpersonating = useCallback((clientId: string, clientName: string) => {
    const newState = { clientId, clientName };
    setState(newState);
    saveToStorage(newState);
    setImpersonateClientId(clientId);
    // Refetch all queries with the new impersonation header
    queryClient.invalidateQueries();
  }, [queryClient]);

  const stopImpersonating = useCallback(() => {
    setState({ clientId: null, clientName: null });
    saveToStorage({ clientId: null, clientName: null });
    setImpersonateClientId(null);
    // Refetch all queries without the impersonation header
    queryClient.invalidateQueries();
  }, [queryClient]);

  return (
    <ImpersonationContext.Provider
      value={{
        isImpersonating: !!state.clientId && isPlatformAdmin,
        clientId: state.clientId,
        clientName: state.clientName,
        startImpersonating,
        stopImpersonating,
      }}
    >
      {children}
    </ImpersonationContext.Provider>
  );
}
