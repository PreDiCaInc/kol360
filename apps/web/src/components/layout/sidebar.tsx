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
            'group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
            'hover:bg-[hsl(var(--sidebar-accent))]',
            hasActiveChild
              ? 'text-[hsl(var(--sidebar-primary))]'
              : 'text-[hsl(var(--sidebar-foreground))]/70 hover:text-[hsl(var(--sidebar-foreground))]',
            collapsed && 'justify-center px-2',
            level > 0 && 'pl-6'
          )}
          title={collapsed ? item.title : undefined}
        >
          <Icon className={cn(
            'h-[18px] w-[18px] flex-shrink-0 transition-colors duration-200',
            hasActiveChild ? 'text-[hsl(var(--sidebar-primary))]' : 'text-[hsl(var(--sidebar-foreground))]/50 group-hover:text-[hsl(var(--sidebar-foreground))]/70'
          )} />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">{item.title}</span>
              <ChevronDown
                className={cn(
                  'h-4 w-4 text-[hsl(var(--sidebar-foreground))]/40 transition-transform duration-200',
                  isExpanded && 'rotate-180'
                )}
              />
            </>
          )}
        </button>
        <div
          className={cn(
            'overflow-hidden transition-all duration-200',
            isExpanded && !collapsed ? 'max-h-48 opacity-100' : 'max-h-0 opacity-0'
          )}
        >
          <ul className="ml-4 mt-1 space-y-0.5 border-l border-[hsl(var(--sidebar-border))] pl-3">
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
        </div>
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
            'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
            'hover:bg-[hsl(var(--sidebar-accent))]',
            isActive
              ? 'bg-[hsl(var(--sidebar-primary))]/10 text-[hsl(var(--sidebar-primary))] shadow-sm'
              : 'text-[hsl(var(--sidebar-foreground))]/70 hover:text-[hsl(var(--sidebar-foreground))]',
            collapsed && 'justify-center px-2',
            level > 0 && !collapsed && 'py-2 text-[13px]'
          )}
          title={collapsed ? item.title : undefined}
        >
          <div className="relative">
            <Icon className={cn(
              'h-[18px] w-[18px] flex-shrink-0 transition-colors duration-200',
              isActive 
                ? 'text-[hsl(var(--sidebar-primary))]' 
                : 'text-[hsl(var(--sidebar-foreground))]/50 group-hover:text-[hsl(var(--sidebar-foreground))]/70'
            )} />
            {isActive && collapsed && (
              <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-[hsl(var(--sidebar-primary))]" />
            )}
          </div>
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
        'fixed left-0 top-0 z-40 h-screen transition-all duration-300 ease-out',
        'bg-[hsl(var(--sidebar-background))] text-[hsl(var(--sidebar-foreground))]',
        'border-r border-[hsl(var(--sidebar-border))]',
        collapsed ? 'w-[72px]' : 'w-64'
      )}
    >
      {/* Logo Section */}
      <div className={cn(
        'flex h-[72px] items-center border-b border-[hsl(var(--sidebar-border))] transition-all duration-300',
        collapsed ? 'justify-center px-2' : 'px-5'
      )}>
        <Link href="/admin" className="flex items-center">
          {!collapsed ? (
            <Image
              src="/images/logo-white.png"
              alt="BioExec"
              width={140}
              height={42}
              className="h-10 w-auto object-contain"
              priority
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-500/20">
              <span className="text-sm font-bold text-white">BE</span>
            </div>
          )}
        </Link>
      </div>

      {/* Navigation */}
      <nav className={cn(
        'custom-scrollbar h-[calc(100vh-72px-64px)] overflow-y-auto py-4 transition-all duration-300',
        collapsed ? 'px-2' : 'px-3'
      )}>
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
      <div className="absolute bottom-0 left-0 right-0 border-t border-[hsl(var(--sidebar-border))] p-3">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            'group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm',
            'text-[hsl(var(--sidebar-foreground))]/50 hover:text-[hsl(var(--sidebar-foreground))]',
            'hover:bg-[hsl(var(--sidebar-accent))] transition-all duration-200',
            collapsed && 'justify-center px-2'
          )}
        >
          <div className={cn(
            'flex h-6 w-6 items-center justify-center rounded-md bg-[hsl(var(--sidebar-muted))] transition-all duration-200',
            'group-hover:bg-[hsl(var(--sidebar-primary))]/20'
          )}>
            {collapsed ? (
              <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <ChevronLeft className="h-3.5 w-3.5" />
            )}
          </div>
          {!collapsed && <span className="text-[13px]">Collapse sidebar</span>}
        </button>
      </div>
    </aside>
  );
}

export function SidebarSpacer({ collapsed }: { collapsed?: boolean }) {
  return <div className={cn('flex-shrink-0 transition-all duration-300', collapsed ? 'w-[72px]' : 'w-64')} />;
}
