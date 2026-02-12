'use client';

import { ReactNode, useState } from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { RequireAuth } from '@/components/auth/require-auth';
import { SidebarContext } from '@/components/layout/sidebar-context';
import { ImpersonationProvider, useImpersonation } from '@/lib/impersonation-context';
import { cn } from '@/lib/utils';
import { Eye, X } from 'lucide-react';

interface AdminLayoutProps {
  children: ReactNode;
}

function ImpersonationBanner() {
  const { isImpersonating, clientName, primaryColor, stopImpersonating } = useImpersonation();

  if (!isImpersonating) return null;

  const bgColor = primaryColor || '#4f46e5';

  return (
    <div
      className="flex h-9 items-center justify-center gap-2 text-white text-sm font-medium"
      style={{ backgroundColor: bgColor }}
    >
      <Eye className="h-3.5 w-3.5" />
      <span>Viewing as: {clientName}</span>
      <button
        onClick={stopImpersonating}
        className="ml-2 rounded-full p-0.5 hover:bg-black/20 transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function AdminLayoutContent({ children }: AdminLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed }}>
      <div className="min-h-screen bg-background">
        {/* Sidebar */}
        <Sidebar />

        {/* Main Content Area */}
        <div
          className={cn(
            'flex min-h-screen flex-col transition-all duration-300',
            collapsed ? 'ml-16' : 'ml-64'
          )}
        >
          {/* Header */}
          <Header />

          {/* Impersonation Banner */}
          <ImpersonationBanner />

          {/* Page Content */}
          <main className="flex-1">{children}</main>

          {/* Footer */}
          <Footer />
        </div>
      </div>
    </SidebarContext.Provider>
  );
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <RequireAuth>
      <ImpersonationProvider>
        <AdminLayoutContent>{children}</AdminLayoutContent>
      </ImpersonationProvider>
    </RequireAuth>
  );
}
