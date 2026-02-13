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
import { Breadcrumb } from './breadcrumb';

export function Header() {
  const { user, signOut } = useAuth();
  const { isImpersonating, clientId, clientName, startImpersonating, stopImpersonating } = useImpersonation();
  const isPlatformAdmin = user?.role === 'PLATFORM_ADMIN';
  const { data: clientsData } = useClients();
  const clients = clientsData?.items || [];

  const getRoleDisplay = (role?: string) => {
    if (!role) return 'User';
    return role.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const getInitials = (email?: string, firstName?: string, lastName?: string) => {
    if (firstName && lastName) {
      return `${firstName[0]}${lastName[0]}`.toUpperCase();
    }
    if (firstName) {
      return firstName.substring(0, 2).toUpperCase();
    }
    if (!email) return 'U';
    return email.substring(0, 2).toUpperCase();
  };

  const getDisplayName = (email?: string, firstName?: string) => {
    if (firstName) return firstName;
    if (!email) return 'User';
    return email.split('@')[0];
  };

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
    <>
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border/60 bg-card/95 backdrop-blur-sm px-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-4">
          <Breadcrumb />
        </div>

        {/* Right side actions */}
        <div className="flex items-center gap-2">
          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="flex items-center gap-2.5 px-2 h-10 hover:bg-muted/50"
              >
                <div className={`flex h-8 w-8 items-center justify-center rounded-full shadow-sm ${
                  isImpersonating
                    ? 'bg-gradient-to-br from-amber-400 to-amber-500 text-amber-950'
                    : 'bg-gradient-to-br from-primary/80 to-primary text-primary-foreground'
                }`}>
                  <span className="text-xs font-semibold">
                    {getInitials(user?.email, user?.firstName, user?.lastName)}
                  </span>
                </div>
                <div className="hidden flex-col items-start md:flex">
                  <span className="text-sm font-medium leading-tight">
                    {getDisplayName(user?.email, user?.firstName)}
                  </span>
                  <span className="text-[11px] text-muted-foreground leading-tight">
                    {isImpersonating ? `Viewing as ${clientName}` : getRoleDisplay(user?.role)}
                  </span>
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
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

              {/* Client Impersonation - PLATFORM_ADMIN only */}
              {isPlatformAdmin && (
                <>
                  <DropdownMenuSeparator />
                  <div className="px-2 py-2">
                    <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Eye className="h-3 w-3" />
                      View as Client
                    </p>
                    <Select
                      value={clientId || '__none__'}
                      onValueChange={handleClientChange}
                    >
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
        </div>
      </header>
    </>
  );
}
