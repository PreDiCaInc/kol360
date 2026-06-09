'use client';

import Image from 'next/image';
import { useCurrentClient } from '@/hooks/use-current-client';
import { useImpersonation } from '@/lib/impersonation-context';
import { useAuth } from '@/lib/auth/auth-provider';
import { pickReadableTextColor, withAlpha } from '@/lib/color';

// v1.17.30 — top-header brand badge for the current client context.
//
// Drives off useCurrentClient(), which unifies:
//   - PLATFORM_ADMIN impersonating → impersonated client
//   - TEAM_MEMBER / CLIENT_ADMIN  → their own client via /clients/me
//   - PLATFORM_ADMIN no impersonation → null (badge hidden)
//
// Renders a compact name + logo (or color-tinted initials avatar). When
// impersonating, prefixes with "Viewing as" so it's unmissable. Placed
// in the Header to the LEFT of the user menu (Option C from the
// branding ticket — pairs with user context, no new layout zone).
export function ClientBadge() {
  const { user } = useAuth();
  const { isImpersonating } = useImpersonation();
  const { data: client } = useCurrentClient();

  if (!client) return null;

  const color = client.primaryColor || '#0066CC';
  const initials = client.name.slice(0, 2).toUpperCase();
  // 10% alpha tint for the badge body — subtle, branded, AA-readable
  // text via pickReadableTextColor() against the full-color logo tile.
  const bgTint = withAlpha(color, 0.1);
  const fgOnFull = pickReadableTextColor(color);

  return (
    <div
      className="hidden md:flex items-center gap-2 rounded-full pl-1 pr-3 py-1 text-sm font-medium"
      style={{ backgroundColor: bgTint }}
      title={isImpersonating ? `Viewing as ${client.name}` : client.name}
    >
      {client.logoUrl ? (
        <Image
          src={client.logoUrl}
          alt={client.name}
          width={24}
          height={24}
          className="h-6 w-6 rounded-full object-contain bg-white"
        />
      ) : (
        <div
          className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold"
          style={{ backgroundColor: color, color: fgOnFull }}
        >
          {initials}
        </div>
      )}
      <span className="text-foreground/90">
        {isImpersonating && (
          <span className="text-foreground/60 mr-1.5 text-[11px] uppercase tracking-wide">
            Viewing as
          </span>
        )}
        {client.name}
      </span>
      {/* Hide on small viewports; user role hint stays below in user
          menu sublabel for narrow screens. */}
      {user?.role === 'PLATFORM_ADMIN' && isImpersonating && (
        <span
          className="ml-1 h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: color }}
          aria-hidden
        />
      )}
    </div>
  );
}
