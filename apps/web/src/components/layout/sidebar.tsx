'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth/auth-provider';
import {
  LayoutDashboard,
  Building2,
  Users,
  Stethoscope,
  FileQuestion,
  Layers,
  FileText,
  BarChart3,
  ClipboardList,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useState } from 'react';

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: string[];
  children?: NavItem[];
}

const navigationItems: NavItem[] = [
  {
    title: 'Dashboard',
    href: '/admin',
    icon: LayoutDashboard,
  },
  {
    title: 'Clients',
    href: '/admin/clients',
    icon: Building2,
    roles: ['PLATFORM_ADMIN'],
  },
  {
    title: 'Users',
    href: '/admin/users',
    icon: Users,
  },
  {
    title: 'HCP Database',
    href: '/admin/hcps',
    icon: Stethoscope,
  },
  {
    title: 'Campaigns',
    href: '/admin/campaigns',
    icon: BarChart3,
  },
  {
    title: 'Question Bank',
    href: '/admin/questions',
    icon: FileQuestion,
    roles: ['PLATFORM_ADMIN'],
  },
  {
    title: 'Section Templates',
    href: '/admin/sections',
    icon: Layers,
    roles: ['PLATFORM_ADMIN'],
  },
  {
    title: 'Survey Templates',
    href: '/admin/survey-templates',
    icon: FileText,
    roles: ['PLATFORM_ADMIN'],
  },
  {
    title: 'Lite Clients',
    href: '/admin/lite-clients',
    icon: ClipboardList,
    roles: ['PLATFORM_ADMIN'],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  const filteredNavItems = navigationItems.filter((item) => {
    if (!item.roles) return true;
    return item.roles.includes(user?.role || '');
  });

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 h-screen transition-all duration-300 ease-in-out',
        'bg-[hsl(var(--sidebar-background))] text-[hsl(var(--sidebar-foreground))]',
        'border-r border-[hsl(var(--sidebar-muted))]',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo Section */}
      <div className="flex h-20 items-center justify-center border-b border-[hsl(var(--sidebar-muted))] px-4">
        <Link href="/admin" className="flex items-center justify-center">
          {!collapsed ? (
            <Image
              src="/images/logo-white.png"
              alt="BioExec"
              width={160}
              height={48}
              className="h-12 w-auto object-contain"
              priority
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-500">
              <span className="text-sm font-bold text-white">BE</span>
            </div>
          )}
        </Link>
      </div>

      {/* Navigation */}
      <nav className="custom-scrollbar h-[calc(100vh-9rem)] overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {filteredNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                    'hover:bg-[hsl(var(--sidebar-accent))]',
                    isActive
                      ? 'bg-[hsl(var(--sidebar-primary))]/10 text-[hsl(var(--sidebar-primary))]'
                      : 'text-[hsl(var(--sidebar-foreground))]/70 hover:text-[hsl(var(--sidebar-foreground))]',
                    collapsed && 'justify-center px-2'
                  )}
                  title={collapsed ? item.title : undefined}
                >
                  <Icon className={cn('h-5 w-5 flex-shrink-0', isActive && 'text-[hsl(var(--sidebar-primary))]')} />
                  {!collapsed && <span>{item.title}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Collapse Toggle */}
      <div className="absolute bottom-0 left-0 right-0 border-t border-[hsl(var(--sidebar-muted))] p-3">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm',
            'text-[hsl(var(--sidebar-foreground))]/60 hover:text-[hsl(var(--sidebar-foreground))]',
            'hover:bg-[hsl(var(--sidebar-accent))] transition-colors',
            collapsed && 'justify-center px-2'
          )}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}

export function SidebarSpacer({ collapsed }: { collapsed?: boolean }) {
  return <div className={cn('flex-shrink-0 transition-all duration-300', collapsed ? 'w-16' : 'w-64')} />;
}
