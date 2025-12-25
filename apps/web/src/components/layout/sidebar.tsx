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
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Megaphone,
} from 'lucide-react';
import { useState, useEffect } from 'react';

interface NavItem {
  title: string;
  href?: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: string[];
  children?: NavItem[];
  collapsible?: boolean;
}

// Navigation structure for Platform Admin
const platformAdminNavigation: NavItem[] = [
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
    title: 'HCPs',
    href: '/admin/hcps',
    icon: Stethoscope,
    roles: ['PLATFORM_ADMIN'],
  },
  {
    title: 'Campaigns',
    href: '/admin/campaigns',
    icon: Megaphone,
    roles: ['PLATFORM_ADMIN'],
  },
  {
    title: 'Surveys & Questions',
    icon: FileText,
    collapsible: true,
    roles: ['PLATFORM_ADMIN'],
    children: [
      {
        title: 'Survey Templates',
        href: '/admin/survey-templates',
        icon: FileText,
      },
      {
        title: 'Section Templates',
        href: '/admin/sections',
        icon: Layers,
      },
      {
        title: 'Question Bank',
        href: '/admin/questions',
        icon: FileQuestion,
      },
    ],
  },
  {
    title: 'Dashboards',
    href: '/admin/dashboards',
    icon: BarChart3,
    roles: ['PLATFORM_ADMIN'],
  },
  {
    title: 'Users',
    href: '/admin/users',
    icon: Users,
    roles: ['PLATFORM_ADMIN'],
  },
];

// Navigation structure for Client Admin
const clientAdminNavigation: NavItem[] = [
  {
    title: 'Dashboard',
    href: '/admin',
    icon: LayoutDashboard,
  },
  {
    title: 'HCPs',
    href: '/admin/hcps',
    icon: Stethoscope,
  },
  {
    title: 'Users',
    href: '/admin/users',
    icon: Users,
  },
];

function NavItemComponent({
  item,
  collapsed,
  pathname,
  level = 0,
}: {
  item: NavItem;
  collapsed: boolean;
  pathname: string;
  level?: number;
}) {
  // Check if this item or any of its children are active
  const isActive = item.href ? (pathname === item.href || pathname.startsWith(item.href + '/')) : false;
  const hasActiveChild = item.children?.some(child =>
    child.href && (pathname === child.href || pathname.startsWith(child.href + '/'))
  );

  // Auto-expand if child is active
  const [isExpanded, setIsExpanded] = useState(hasActiveChild || false);
  const Icon = item.icon;

  // Update expansion state when active child changes
  useEffect(() => {
    if (hasActiveChild) {
      setIsExpanded(true);
    }
  }, [hasActiveChild]);

  // If item has children and is collapsible
  if (item.collapsible && item.children) {
    return (
      <li>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={cn(
            'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
            'hover:bg-[hsl(var(--sidebar-accent))]',
            hasActiveChild
              ? 'text-[hsl(var(--sidebar-primary))]'
              : 'text-[hsl(var(--sidebar-foreground))]/70 hover:text-[hsl(var(--sidebar-foreground))]',
            collapsed && 'justify-center px-2',
            level > 0 && 'pl-6'
          )}
          title={collapsed ? item.title : undefined}
        >
          <Icon className={cn('h-5 w-5 flex-shrink-0', hasActiveChild && 'text-[hsl(var(--sidebar-primary))]')} />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">{item.title}</span>
              <ChevronDown
                className={cn(
                  'h-4 w-4 transition-transform',
                  isExpanded && 'rotate-180'
                )}
              />
            </>
          )}
        </button>
        {!collapsed && isExpanded && item.children && (
          <ul className="ml-3 mt-1 space-y-1 border-l border-[hsl(var(--sidebar-muted))] pl-3">
            {item.children.map((child, idx) => (
              <NavItemComponent
                key={child.href || `child-${idx}`}
                item={child}
                collapsed={collapsed}
                pathname={pathname}
                level={level + 1}
              />
            ))}
          </ul>
        )}
      </li>
    );
  }

  // Regular link item
  if (item.href) {
    return (
      <li>
        <Link
          href={item.href}
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
            'hover:bg-[hsl(var(--sidebar-accent))]',
            isActive
              ? 'bg-[hsl(var(--sidebar-primary))]/10 text-[hsl(var(--sidebar-primary))]'
              : 'text-[hsl(var(--sidebar-foreground))]/70 hover:text-[hsl(var(--sidebar-foreground))]',
            collapsed && 'justify-center px-2',
            level > 0 && !collapsed && 'pl-6 text-xs'
          )}
          title={collapsed ? item.title : undefined}
        >
          <Icon className={cn('h-4 w-4 flex-shrink-0', isActive && 'text-[hsl(var(--sidebar-primary))]')} />
          {!collapsed && <span>{item.title}</span>}
        </Link>
      </li>
    );
  }

  return null;
}

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  // Determine navigation based on role
  const isPlatformAdmin = user?.role === 'PLATFORM_ADMIN';
  const navigationItems = isPlatformAdmin ? platformAdminNavigation : clientAdminNavigation;

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
          {filteredNavItems.map((item, idx) => (
            <NavItemComponent
              key={item.href || `nav-${idx}`}
              item={item}
              collapsed={collapsed}
              pathname={pathname}
            />
          ))}
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
