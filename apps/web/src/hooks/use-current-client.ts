'use client';

import { useAuth } from '@/lib/auth/auth-provider';
import { useImpersonation } from '@/lib/impersonation-context';
import { useViewAs } from '@/lib/view-as-context';
import { useClientMe } from '@/hooks/use-clients';

// v1.17.30 — single source of truth for "which client am I currently
// viewing", used by the header brand badge + the ThemeProvider that
// applies client.primaryColor as a CSS variable.
//
// Three cases:
//   1. PLATFORM_ADMIN + impersonating → return the impersonated client
//      (data lives in the ImpersonationContext, no fetch needed).
//   2. PLATFORM_ADMIN, no impersonation → return null (no client to
//      surface; UI shows the default Bio-Exec branding).
//   3. TEAM_MEMBER / CLIENT_ADMIN → fetch via /api/v1/clients/me.
//
// Returns a normalized shape regardless of source so callers don't
// need to branch on origin.
export interface CurrentClient {
  id: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string;
}

export function useCurrentClient(): { data: CurrentClient | null; isLoading: boolean } {
  const { user } = useAuth();
  const { isImpersonating, clientId, clientName, logoUrl, primaryColor } = useImpersonation();
  const { client: viewAsClient } = useViewAs();
  const isPlatformAdmin = user?.role === 'PLATFORM_ADMIN';

  // PLATFORM_ADMIN never needs /clients/me — they either have an
  // impersonation context or no client at all.
  const meQuery = useClientMe(/* enabled */ !!user && !isPlatformAdmin);

  if (isImpersonating && clientId && clientName) {
    return {
      data: {
        id: clientId,
        name: clientName,
        logoUrl: logoUrl ?? null,
        primaryColor: primaryColor ?? '#0066CC',
      },
      isLoading: false,
    };
  }

  if (isPlatformAdmin) {
    // v1.17.41 — view-as is a display-only override (set by Insights
    // when a PLATFORM_ADMIN picks a client in the dropdown). Returning
    // it here lights up the sidebar logo, brand stripe, and theme
    // without flipping impersonation.
    if (viewAsClient) {
      return {
        data: {
          id: viewAsClient.id,
          name: viewAsClient.name,
          logoUrl: viewAsClient.logoUrl,
          primaryColor: viewAsClient.primaryColor ?? '#0066CC',
        },
        isLoading: false,
      };
    }
    return { data: null, isLoading: false };
  }

  const me = meQuery.data;
  if (!me) {
    return { data: null, isLoading: meQuery.isLoading };
  }
  return {
    data: {
      id: me.id,
      name: me.name,
      logoUrl: me.logoUrl,
      primaryColor: me.primaryColor || '#0066CC',
    },
    isLoading: false,
  };
}
