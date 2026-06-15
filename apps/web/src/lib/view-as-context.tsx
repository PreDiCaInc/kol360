'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

// v1.17.41 — lightweight "view-as" context.
//
// Distinct from impersonation: impersonation flips API behavior
// (X-Impersonate-Client header, query invalidation, navigation set),
// view-as is purely display. Used by Insights when a PLATFORM_ADMIN
// selects a client in the dropdown — the sidebar logo, brand stripe,
// and theme should reflect that client, but the user is still
// PLATFORM_ADMIN with full perms and platform-admin navigation.
//
// useCurrentClient consumes this context as a fallback after
// impersonation check, so all the existing brand surfaces (sidebar
// logo, brand stripe, theme provider) automatically pick it up
// without further plumbing.

export interface ViewAsClient {
  id: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
}

interface ViewAsContextValue {
  client: ViewAsClient | null;
  setViewAs: (client: ViewAsClient | null) => void;
}

const ViewAsContext = createContext<ViewAsContextValue>({
  client: null,
  setViewAs: () => {},
});

export function useViewAs() {
  return useContext(ViewAsContext);
}

export function ViewAsProvider({ children }: { children: ReactNode }) {
  const [client, setClient] = useState<ViewAsClient | null>(null);
  const setViewAs = useCallback((c: ViewAsClient | null) => setClient(c), []);
  return (
    <ViewAsContext.Provider value={{ client, setViewAs }}>
      {children}
    </ViewAsContext.Provider>
  );
}
