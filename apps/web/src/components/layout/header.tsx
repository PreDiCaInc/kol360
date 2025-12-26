'use client';

import { useAuth } from '@/lib/auth/auth-provider';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Bell, User, LogOut, Settings, ChevronDown, HelpCircle } from 'lucide-react';
import { Breadcrumb } from './breadcrumb';

export function Header() {
  const { user, signOut } = useAuth();

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

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border/60 bg-card/95 backdrop-blur-sm px-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-4">
        <Breadcrumb />
      </div>

      {/* Right side actions */}
      <div className="flex items-center gap-2">
        {/* Help */}
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-9 w-9 text-muted-foreground hover:text-foreground"
        >
          <HelpCircle className="h-[18px] w-[18px]" />
        </Button>

        {/* Notifications */}
        <Button 
          variant="ghost" 
          size="icon" 
          className="relative h-9 w-9 text-muted-foreground hover:text-foreground"
        >
          <Bell className="h-[18px] w-[18px]" />
          <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground ring-2 ring-card">
            3
          </span>
        </Button>

        <div className="mx-2 h-6 w-px bg-border" />

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="ghost" 
              className="flex items-center gap-2.5 px-2 h-10 hover:bg-muted/50"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary/80 to-primary text-primary-foreground shadow-sm">
                <span className="text-xs font-semibold">
                  {getInitials(user?.email, user?.firstName, user?.lastName)}
                </span>
              </div>
              <div className="hidden flex-col items-start md:flex">
                <span className="text-sm font-medium leading-tight">
                  {getDisplayName(user?.email, user?.firstName)}
                </span>
                <span className="text-[11px] text-muted-foreground leading-tight">
                  {getRoleDisplay(user?.role)}
                </span>
              </div>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
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
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer">
              <User className="mr-2.5 h-4 w-4 text-muted-foreground" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer">
              <Settings className="mr-2.5 h-4 w-4 text-muted-foreground" />
              Settings
            </DropdownMenuItem>
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
  );
}
