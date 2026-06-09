'use client';

import { ReactNode, useEffect } from 'react';
import { useCurrentClient } from '@/hooks/use-current-client';
import { hexToRgb, pickReadableTextColor, withAlpha } from '@/lib/color';

// v1.17.30 — applies client.primaryColor to a small set of accent
// surfaces via CSS custom properties on document.documentElement.
//
// Variables set:
//   --brand-primary       — full color hex (#0066CC default)
//   --brand-primary-rgb   — "r, g, b" so callers can do rgba(var(...) / .1)
//   --brand-on-primary    — auto-picked text color (#ffffff or #111827)
//                           with enough contrast against --brand-primary
//   --brand-primary-tint  — pre-rendered 10% alpha background tint
//
// Consumers:
//   - The 4px top brand strip below the impersonation banner (rendered
//     in admin layout)
//   - ClientBadge component (already uses the color directly via
//     useCurrentClient — left as-is to avoid a layout-flash on first
//     paint while the CSS var is being set)
//   - Future: sidebar active-item + primary button accents can read
//     --brand-primary if/when we want them themed. Kept minimal here.
//
// Default falls back to the existing #0066CC so PLATFORM_ADMIN with no
// impersonation sees no visual change.
export function ClientThemeProvider({ children }: { children: ReactNode }) {
  const { data: client } = useCurrentClient();
  const color = client?.primaryColor || '#0066CC';

  useEffect(() => {
    const root = document.documentElement;
    const rgb = hexToRgb(color) ?? { r: 0, g: 102, b: 204 };
    root.style.setProperty('--brand-primary', color);
    root.style.setProperty('--brand-primary-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`);
    root.style.setProperty('--brand-on-primary', pickReadableTextColor(color));
    root.style.setProperty('--brand-primary-tint', withAlpha(color, 0.1));

    // No cleanup on unmount: the vars want to persist across page
    // navigations within the admin layout, and AdminLayout is the
    // single mount point. Re-running the effect on color change is
    // sufficient.
  }, [color]);

  return <>{children}</>;
}
