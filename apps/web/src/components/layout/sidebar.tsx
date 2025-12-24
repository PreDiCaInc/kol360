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
  ChevronDown,
  Palette,
  PanelTop,
  Eye,
  Dna,
  UserCheck,
} from 'lucide-react';
import { useState } from 'react';

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: string[];
  badge?: string;
}

interface NavSection {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: string[];
  items: NavItem[];
  defaultOpen?: boolean;
}

// Platform Admin Navigation Structure
const platformAdminSections: NavSection[] = [
  {
    title: 'Clients',
    icon: Building2,
    roles: ['PLATFORM_ADMIN'],
    defaultOpen: true,
    items: [
      { title: 'All Clients', href: '/admin/clients', icon: Building2 },
      { title: 'Lite Clients', href: '/admin/lite-clients', icon: ClipboardList },
    ],
  },
  {
    title: 'HCPs',
    icon: Stethoscope,
    defaultOpen: true,
    items: [
      { title: 'HCP Database', href: '/admin/hcps', icon: Stethoscope },
      { title: 'Disease Areas', href: '/admin/disease-areas', icon: Dna },
    ],
  },
  {
    title: 'Surveys & Questions',
    icon: FileText,
    roles: ['PLATFORM_ADMIN'],
    defaultOpen: false,
    items: [
      { title: 'Question Bank', href: '/admin/questions', icon: FileQuestion },
      { title: 'Section Templates', href: '/admin/sections', icon: Layers },
      { title: 'Survey Templates', href: '/admin/survey-templates', icon: FileText },
    ],
  },
  {
    title: 'Dashboards',
    icon: PanelTop,
    roles: ['PLATFORM_ADMIN'],
    defaultOpen: false,
    items: [
      { title: 'Dashboard Templates', href: '/admin/dashboard-templates', icon: Palette },
    ],
  },
];

// Client Admin sees limited navigation
const clientAdminSections: NavSection[] = [
  {
    title: 'My Organization',
    icon: Building2,
    roles: ['CLIENT_ADMIN'],
    defaultOpen: true,
    items: [
      { title: 'Dashboard', href: '/admin/client-dashboard', icon: LayoutDashboard },
      { title: 'HCPs', href: '/admin/client-hcps', icon: Stethoscope },
      { title: 'Users', href: '/admin/users', icon: Users },
    ],
  },
];

// Top-level navigation items (always visible based on role)
const topNavItems: NavItem[] = [
  { title: 'Home', href: '/admin', icon: LayoutDashboard },
  { title: 'Campaigns', href: '/admin/campaigns', icon: BarChart3 },
  { title: 'Nominations', href: '/admin/nominations', icon: UserCheck },
  { title: 'Users', href: '/admin/users', icon: Users, roles: ['PLATFORM_ADMIN'] },
];

interface CollapsibleSectionProps {
  section: NavSection;
  collapsed: boolean;
  pathname: string;
}

function CollapsibleSection({ section, collapsed, pathname }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(section.defaultOpen ?? false);
  const Icon = section.icon;

  // Check if any item in the section is active
  const isActive = section.items.some(
    (item) => pathname === item.href || pathname.startsWith(item.href + '/')
  );

  // Auto-open if any child is active
  const shouldOpen = isOpen || isActive;

  if (collapsed) {
    // In collapsed mode, show first item as the section link
    const firstItem = section.items[0];
    const ItemIcon = firstItem.icon;
    return (
      <li>
        <Link
          href={firstItem.href}
          className={cn(
            'flex items-center justify-center gap-3 rounded-lg px-2 py-2.5 text-sm font-medium transition-all',
            'hover:bg-[hsl(var(--sidebar-accent))]',
            isActive
              ? 'bg-[hsl(var(--sidebar-primary))]/10 text-[hsl(var(--sidebar-primary))]'
              : 'text-[hsl(var(--sidebar-foreground))]/70 hover:text-[hsl(var(--sidebar-foreground))]'
          )}
          title={section.title}
        >
          <Icon className={cn('h-5 w-5 flex-shrink-0', isActive && 'text-[hsl(var(--sidebar-primary))]')} />
        </Link>
      </li>
    );
  }

  return (
    <li className="space-y-1">
      <button
        onClick={() => setIsOpen(!shouldOpen ? true : !isOpen)}
        className={cn(
          'flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-all',
          'hover:bg-[hsl(var(--sidebar-accent))]',
          isActive
            ? 'text-[hsl(var(--sidebar-primary))]'
            : 'text-[hsl(var(--sidebar-foreground))]/70 hover:text-[hsl(var(--sidebar-foreground))]'
        )}
      >
        <div className="flex items-center gap-3">
          <Icon className={cn('h-5 w-5 flex-shrink-0', isActive && 'text-[hsl(var(--sidebar-primary))]')} />
          <span>{section.title}</span>
        </div>
        <ChevronDown
          className={cn(
            'h-4 w-4 transition-transform duration-200',
            shouldOpen && 'rotate-180'
          )}
        />
      </button>
      {shouldOpen && (
        <ul className="ml-4 space-y-0.5 border-l border-[hsl(var(--sidebar-muted))] pl-3">
          {section.items.map((item) => {
            const ItemIcon = item.icon;
            const itemActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-all',
                    'hover:bg-[hsl(var(--sidebar-accent))]',
                    itemActive
                      ? 'bg-[hsl(var(--sidebar-primary))]/10 text-[hsl(var(--sidebar-primary))] font-medium'
                      : 'text-[hsl(var(--sidebar-foreground))]/60 hover:text-[hsl(var(--sidebar-foreground))]'
                  )}
                >
                  <ItemIcon
                    className={cn(
                      'h-4 w-4 flex-shrink-0',
                      itemActive && 'text-[hsl(var(--sidebar-primary))]'
                    )}
                  />
                  <span>{item.title}</span>
                  {item.badge && (
                    <span className="ml-auto rounded-full bg-primary/20 px-1.5 py-0.5 text-xs text-primary">
                      {item.badge}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  const isPlatformAdmin = user?.role === 'PLATFORM_ADMIN';
  const isClientAdmin = user?.role === 'CLIENT_ADMIN';

  // Filter top nav items by role
  const filteredTopItems = topNavItems.filter((item) => {
    if (!item.roles) return true;
    return item.roles.includes(user?.role || '');
  });

  // Get relevant sections based on role
  const sections = isPlatformAdmin
    ? platformAdminSections
    : isClientAdmin
    ? clientAdminSections
    : [];

  // Filter sections by role
  const filteredSections = sections.filter((section) => {
    if (!section.roles) return true;
    return section.roles.includes(user?.role || '');
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
        {/* Top Navigation Items */}
        <ul className="space-y-1">
          {filteredTopItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href ||
              (item.href !== '/admin' && pathname.startsWith(item.href + '/'));
            // Special case for Home - only active on exact match
            const isHomeActive = item.href === '/admin' && pathname === '/admin';
            const finalActive = item.href === '/admin' ? isHomeActive : isActive;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                    'hover:bg-[hsl(var(--sidebar-accent))]',
                    finalActive
                      ? 'bg-[hsl(var(--sidebar-primary))]/10 text-[hsl(var(--sidebar-primary))]'
                      : 'text-[hsl(var(--sidebar-foreground))]/70 hover:text-[hsl(var(--sidebar-foreground))]',
                    collapsed && 'justify-center px-2'
                  )}
                  title={collapsed ? item.title : undefined}
                >
                  <Icon className={cn('h-5 w-5 flex-shrink-0', finalActive && 'text-[hsl(var(--sidebar-primary))]')} />
                  {!collapsed && <span>{item.title}</span>}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Section Divider */}
        {filteredSections.length > 0 && (
          <div className="my-4 border-t border-[hsl(var(--sidebar-muted))]" />
        )}

        {/* Platform Admin Label */}
        {isPlatformAdmin && !collapsed && (
          <div className="mb-2 px-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--sidebar-foreground))]/40">
              Platform Admin
            </span>
          </div>
        )}

        {/* Collapsible Sections */}
        <ul className="space-y-2">
          {filteredSections.map((section) => (
            <CollapsibleSection
              key={section.title}
              section={section}
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
