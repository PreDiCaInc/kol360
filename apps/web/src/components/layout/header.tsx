'use client';

import { Breadcrumb } from './breadcrumb';
import { ClientBadge } from './client-badge';

// v1.17.45 — user menu lifted out of the header into the sidebar
// bottom (see components/layout/user-menu.tsx). Header now carries
// only the breadcrumb on the left and the ClientBadge on the right
// (current-client context, including "Viewing as X" during
// impersonation). PLATFORM_ADMIN's 'View as Client' picker moved
// into the UserMenu dropdown.
export function Header() {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border/60 bg-card/95 backdrop-blur-sm px-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-4">
        <Breadcrumb />
      </div>

      {/* Right side: ClientBadge only */}
      <div className="flex items-center gap-3">
        <ClientBadge />
      </div>
    </header>
  );
}
