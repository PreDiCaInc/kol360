'use client';

import { useAuth } from '@/lib/auth/auth-provider';
import { useImpersonation } from '@/lib/impersonation-context';
import { useClients } from '@/hooks/use-clients';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LogOut, ChevronDown, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';

// v1.17.45 — user menu lifted out of the header so it can render in
// the sidebar bottom (the modern SaaS layout pattern: Linear, Notion,
// Slack, Vercel, Supabase all have profile at the bottom of left nav).
// The header now has just breadcrumb + ClientBadge; this component is
// rendered in the sidebar above the collapse toggle.
//
// Renders two shapes depending on `collapsed`:
//   - collapsed: avatar-only chip, dropdown opens to the side
//   - expanded: avatar + name + role/impersonation label + chevron
//
// Dropdown content is identical in both shapes (user info, PLATFORM_ADMIN's
// 'View as Client' picker, Sign Out).

function getRoleDisplay(role?: string) {
  if (!role) return 'User';
  return role.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase());
}

function getInitials(email?: string, firstName?: string, lastName?: string) {
  if (firstName && lastName) {
    return `${firstName[0]}${lastName[0]}`.toUpperCase();
  }
  if (firstName) return firstName.substring(0, 2).toUpperCase();
  if (!email) return 'U';
  return email.substring(0, 2).toUpperCase();
}

function getDisplayName(email?: string, firstName?: string) {
  if (firstName) return firstName;
  if (!email) return 'User';
  return email.split('@')[0];
}

interface Props {
  collapsed: boolean;
}

export function UserMenu({ collapsed }: Props) {
  const { user, signOut } = useAuth();
  const { isImpersonating, clientId, clientName, startImpersonating, stopImpersonating } =
    useImpersonation();
  const isPlatformAdmin = user?.role === 'PLATFORM_ADMIN';
  const { data: clientsData } = useClients();
  const clients = clientsData?.items || [];

  const handleClientChange = (value: string) => {
    if (value === '__none__') {
      stopImpersonating();
      return;
    }
    const client = clients.find((c) => c.id === value);
    if (client) {
      startImpersonating(client.id, client.name, client.logoUrl, client.primaryColor);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            'w-full hover:bg-[hsl(var(--sidebar-accent))] text-[hsl(var(--sidebar-foreground))]',
            collapsed ? 'h-12 justify-center px-2' : 'h-12 justify-start gap-3 px-3',
          )}
          title={collapsed ? getDisplayName(user?.email, user?.firstName) : undefined}
        >
          <div
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full shadow-sm shrink-0',
              isImpersonating
                ? 'bg-gradient-to-br from-amber-400 to-amber-500 text-amber-950'
                : 'bg-gradient-to-br from-primary/80 to-primary text-primary-foreground',
            )}
          >
            <span className="text-xs font-semibold">
              {getInitials(user?.email, user?.firstName, user?.lastName)}
            </span>
          </div>
          {!collapsed && (
            <>
              <div className="flex flex-col items-start min-w-0 flex-1">
                <span className="text-sm font-medium leading-tight truncate w-full text-left">
                  {getDisplayName(user?.email, user?.firstName)}
                </span>
                <span className="text-[11px] text-[hsl(var(--sidebar-foreground))]/60 leading-tight truncate w-full text-left">
                  {isImpersonating ? `Viewing as ${clientName}` : getRoleDisplay(user?.role)}
                </span>
              </div>
              <ChevronDown className="h-3.5 w-3.5 text-[hsl(var(--sidebar-foreground))]/40 ml-1 shrink-0" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={collapsed ? 'right' : 'top'} align={collapsed ? 'start' : 'end'} className="w-64">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1.5">
            <p className="text-sm font-medium leading-none">
              {user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : 'Account'}
            </p>
            <p className="text-xs text-muted-foreground leading-none">{user?.email}</p>
            <span className="inline-flex w-fit items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              {getRoleDisplay(user?.role)}
            </span>
          </div>
        </DropdownMenuLabel>

        {/* Client Impersonation — PLATFORM_ADMIN only */}
        {isPlatformAdmin && (
          <>
            <DropdownMenuSeparator />
            <div className="px-2 py-2">
              <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                <Eye className="h-3 w-3" />
                View as Client
              </p>
              <Select value={clientId || '__none__'} onValueChange={handleClientChange}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select client..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">
                    <span className="text-muted-foreground">None (Platform Admin)</span>
                  </SelectItem>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={signOut}
          className="cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
        >
          <LogOut className="mr-2.5 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
