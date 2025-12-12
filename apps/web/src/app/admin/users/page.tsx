'use client';

import { useState } from 'react';
import { useUsers, useApproveUser, useDisableUser, useEnableUser } from '@/hooks/use-users';
import { useClients } from '@/hooks/use-clients';
import { RequireAuth } from '@/components/auth/require-auth';
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
import { Plus, MoreHorizontal, Check, X, UserCog } from 'lucide-react';

export default function UsersPage() {
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [filters, setFilters] = useState<{
    clientId?: string;
    role?: string;
    status?: string;
  }>({});

  const { data, isLoading } = useUsers(filters);
  const { data: clientsData } = useClients();
  const approveUser = useApproveUser();
  const disableUser = useDisableUser();
  const enableUser = useEnableUser();

  const users = data?.items || [];
  const clients = clientsData?.items || [];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return <Badge variant="default">Active</Badge>;
      case 'PENDING_VERIFICATION':
        return <Badge variant="secondary">Pending</Badge>;
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
        return <Badge variant="secondary">Client Admin</Badge>;
      case 'TEAM_MEMBER':
        return <Badge variant="outline">Team Member</Badge>;
      default:
        return <Badge variant="outline">{role}</Badge>;
    }
  };

  return (
    <RequireAuth allowedRoles={['PLATFORM_ADMIN', 'CLIENT_ADMIN']}>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Users</h1>
          <Button onClick={() => setShowInviteDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Invite User
          </Button>
        </div>

        {/* Filters */}
        <div className="flex gap-4 mb-6">
          <Select
            value={filters.clientId || 'all'}
            onValueChange={(value) =>
              setFilters((prev) => ({
                ...prev,
                clientId: value === 'all' ? undefined : value,
              }))
            }
          >
            <SelectTrigger className="w-48">
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
            <SelectTrigger className="w-48">
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
            <SelectTrigger className="w-48">
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
          <div>Loading...</div>
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
                        <DropdownMenuItem>
                          <UserCog className="w-4 h-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {user.status === 'PENDING_VERIFICATION' && (
                          <DropdownMenuItem
                            onClick={() => approveUser.mutate(user.id)}
                          >
                            <Check className="w-4 h-4 mr-2" />
                            Approve
                          </DropdownMenuItem>
                        )}
                        {user.status === 'ACTIVE' && (
                          <DropdownMenuItem
                            onClick={() => {
                              if (confirm('Are you sure you want to disable this user?')) {
                                disableUser.mutate(user.id);
                              }
                            }}
                            className="text-destructive"
                          >
                            <X className="w-4 h-4 mr-2" />
                            Disable
                          </DropdownMenuItem>
                        )}
                        {user.status === 'DISABLED' && (
                          <DropdownMenuItem
                            onClick={() => enableUser.mutate(user.id)}
                          >
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
      </div>
    </RequireAuth>
  );
}
