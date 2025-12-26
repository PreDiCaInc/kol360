'use client';

import { useState } from 'react';
import { useUsers, useApproveUser, useDisableUser, useEnableUser } from '@/hooks/use-users';
import { useClients } from '@/hooks/use-clients';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { UserInviteDialog } from '@/components/users/user-invite-dialog';
import { UserEditDialog } from '@/components/users/user-edit-dialog';
import { Plus, MoreHorizontal, Check, X, UserCog, AlertTriangle, RefreshCw, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface User {
  id: string;
  cognitoSub: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'PLATFORM_ADMIN' | 'CLIENT_ADMIN' | 'TEAM_MEMBER';
  status: 'PENDING_VERIFICATION' | 'ACTIVE' | 'DISABLED';
  clientId: string | null;
  client?: { id: string; name: string } | null;
}

export default function UsersPage() {
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [filters, setFilters] = useState<{
    clientId?: string;
    role?: string;
    status?: string;
  }>({});

  const { data, isLoading, isError, error, refetch } = useUsers(filters);
  const { data: clientsData } = useClients();
  const approveUser = useApproveUser();
  const disableUser = useDisableUser();
  const enableUser = useEnableUser();

  const users = (data?.items || []) as User[];
  const clients = clientsData?.items || [];

  const handleApprove = async (userId: string) => {
    setActionError(null);
    try {
      await approveUser.mutateAsync(userId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to approve user';
      setActionError(message);
    }
  };

  const handleDisable = async (userId: string) => {
    if (!confirm('Are you sure you want to disable this user?')) return;
    setActionError(null);
    try {
      await disableUser.mutateAsync(userId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to disable user';
      setActionError(message);
    }
  };

  const handleEnable = async (userId: string) => {
    setActionError(null);
    try {
      await enableUser.mutateAsync(userId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to enable user';
      setActionError(message);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return <Badge variant="success">Active</Badge>;
      case 'PENDING_VERIFICATION':
        return <Badge variant="warning">Pending</Badge>;
      case 'DISABLED':
        return <Badge variant="destructive">Disabled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'PLATFORM_ADMIN':
        return <Badge variant="default">Platform Admin</Badge>;
      case 'CLIENT_ADMIN':
        return <Badge variant="info">Client Admin</Badge>;
      case 'TEAM_MEMBER':
        return <Badge variant="muted">Team Member</Badge>;
      default:
        return <Badge variant="outline">{role}</Badge>;
    }
  };

  return (
    <div className="p-6 lg:p-8 fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Users</h1>
          <p className="text-muted-foreground mt-1">Manage platform users and permissions</p>
        </div>
          <Button onClick={() => setShowInviteDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Invite User
          </Button>
        </div>

        {/* Error Alert */}
        {actionError && (
          <div className="mb-6 p-4 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-lg border border-red-200 dark:border-red-800/30 flex justify-between items-center">
            <span>{actionError}</span>
            <button onClick={() => setActionError(null)} className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6">
          <Select
            value={filters.clientId || 'all'}
            onValueChange={(value) =>
              setFilters((prev) => ({
                ...prev,
                clientId: value === 'all' ? undefined : value,
              }))
            }
          >
            <SelectTrigger className="w-48 bg-card">
              <SelectValue placeholder="All Clients" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Clients</SelectItem>
              {clients.map((client) => (
                <SelectItem key={client.id} value={client.id}>
                  {client.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.role || 'all'}
            onValueChange={(value) =>
              setFilters((prev) => ({
                ...prev,
                role: value === 'all' ? undefined : value,
              }))
            }
          >
            <SelectTrigger className="w-48 bg-card">
              <SelectValue placeholder="All Roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="PLATFORM_ADMIN">Platform Admin</SelectItem>
              <SelectItem value="CLIENT_ADMIN">Client Admin</SelectItem>
              <SelectItem value="TEAM_MEMBER">Team Member</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={filters.status || 'all'}
            onValueChange={(value) =>
              setFilters((prev) => ({
                ...prev,
                status: value === 'all' ? undefined : value,
              }))
            }
          >
            <SelectTrigger className="w-48 bg-card">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="PENDING_VERIFICATION">Pending</SelectItem>
              <SelectItem value="DISABLED">Disabled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 rounded-lg skeleton" />
            ))}
          </div>
        ) : isError ? (
          <Card className="border-destructive">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <AlertTriangle className="w-12 h-12 text-destructive mb-4" />
              <h3 className="text-lg font-medium mb-2">Failed to load users</h3>
              <p className="text-muted-foreground mb-4 text-center max-w-md">
                {error instanceof Error ? error.message : 'Unable to connect to the server. Please check your connection and try again.'}
              </p>
              <Button onClick={() => refetch()} variant="outline">
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry
              </Button>
            </CardContent>
          </Card>
        ) : users.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Users className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No users found</h3>
              <p className="text-muted-foreground mb-4">
                {Object.values(filters).some(Boolean) ? 'Try adjusting your filters' : 'Invite your first user to get started'}
              </p>
              <Button onClick={() => setShowInviteDialog(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Invite User
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">
                    {user.firstName} {user.lastName}
                  </TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>{user.client?.name || '—'}</TableCell>
                  <TableCell>{getRoleBadge(user.role)}</TableCell>
                  <TableCell>{getStatusBadge(user.status)}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setEditingUser(user)}>
                          <UserCog className="w-4 h-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {user.status === 'PENDING_VERIFICATION' && (
                          <DropdownMenuItem onSelect={() => handleApprove(user.id)}>
                            <Check className="w-4 h-4 mr-2" />
                            Approve
                          </DropdownMenuItem>
                        )}
                        {user.status === 'ACTIVE' && (
                          <DropdownMenuItem
                            onSelect={() => handleDisable(user.id)}
                            className="text-destructive"
                          >
                            <X className="w-4 h-4 mr-2" />
                            Disable
                          </DropdownMenuItem>
                        )}
                        {user.status === 'DISABLED' && (
                          <DropdownMenuItem onSelect={() => handleEnable(user.id)}>
                            <Check className="w-4 h-4 mr-2" />
                            Enable
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* Pagination */}
        {data?.pagination && (
          <div className="flex justify-between items-center mt-4">
            <div className="text-sm text-muted-foreground">
              Showing {users.length} of {data.pagination.total} users
            </div>
            <div className="text-sm text-muted-foreground">
              Page {data.pagination.page} of {data.pagination.pages}
            </div>
          </div>
        )}

        <UserInviteDialog
          open={showInviteDialog}
          onOpenChange={setShowInviteDialog}
        />

        <UserEditDialog
          open={!!editingUser}
          onOpenChange={(open) => !open && setEditingUser(null)}
          user={editingUser}
        />
      </div>
  );
}
