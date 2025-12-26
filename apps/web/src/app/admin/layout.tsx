'use client';

import { ReactNode, useState } from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { RequireAuth } from '@/components/auth/require-auth';
import { SidebarContext } from '@/components/layout/sidebar-context';
import { cn } from '@/lib/utils';

interface AdminLayoutProps {
  children: ReactNode;
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
      <AdminLayoutContent>{children}</AdminLayoutContent>
    </RequireAuth>
  );
}
