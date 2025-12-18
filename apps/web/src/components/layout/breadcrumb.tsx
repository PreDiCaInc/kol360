'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BreadcrumbItem {
  label: string;
  href: string;
}

// Map of path segments to display labels
const pathLabels: Record<string, string> = {
  admin: 'Dashboard',
  clients: 'Clients',
  users: 'Users',
  hcps: 'HCP Database',
  campaigns: 'Campaigns',
  questions: 'Question Bank',
  sections: 'Section Templates',
  'survey-templates': 'Survey Templates',
  'lite-clients': 'Lite Clients',
  nominations: 'Nominations',
  dashboard: 'Dashboard',
  results: 'Results',
  settings: 'Settings',
  new: 'New',
  edit: 'Edit',
  client: 'Client Portal',
  lite: 'Lite Dashboard',
};

export function Breadcrumb() {
  const pathname = usePathname();

  const generateBreadcrumbs = (): BreadcrumbItem[] => {
    const segments = pathname.split('/').filter(Boolean);
    const breadcrumbs: BreadcrumbItem[] = [];

    let currentPath = '';

    segments.forEach((segment, index) => {
      currentPath += `/${segment}`;

      // Skip dynamic segments (like IDs) but keep track of the path
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment);
      const isNumeric = /^\d+$/.test(segment);
      const isCuid = /^c[a-z0-9]{24,}$/i.test(segment);

      if (isUUID || isNumeric || isCuid) {
        // For dynamic segments, we might want to show a context label
        const prevSegment = segments[index - 1];
        if (prevSegment === 'campaigns') {
          breadcrumbs.push({
            label: 'Campaign Details',
            href: currentPath,
          });
        } else if (prevSegment === 'clients') {
          breadcrumbs.push({
            label: 'Client Details',
            href: currentPath,
          });
        } else if (prevSegment === 'hcps') {
          breadcrumbs.push({
            label: 'HCP Profile',
            href: currentPath,
          });
        }
        return;
      }

      const label = pathLabels[segment] || segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ');

      breadcrumbs.push({
        label,
        href: currentPath,
      });
    });

    return breadcrumbs;
  };

  const breadcrumbs = generateBreadcrumbs();

  if (breadcrumbs.length <= 1) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <Home className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium text-foreground">{breadcrumbs[0]?.label || 'Dashboard'}</span>
      </div>
    );
  }

  return (
    <nav aria-label="Breadcrumb" className="flex items-center">
      <ol className="flex items-center gap-1">
        {breadcrumbs.map((item, index) => {
          const isLast = index === breadcrumbs.length - 1;
          const isFirst = index === 0;

          return (
            <li key={item.href} className="flex items-center">
              {!isFirst && <ChevronRight className="mx-1 h-4 w-4 text-muted-foreground/50" />}
              {isLast ? (
                <span className="text-sm font-medium text-foreground">{item.label}</span>
              ) : (
                <Link
                  href={item.href}
                  className={cn(
                    'text-sm text-muted-foreground transition-colors hover:text-foreground',
                    isFirst && 'flex items-center gap-1.5'
                  )}
                >
                  {isFirst && <Home className="h-3.5 w-3.5" />}
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
