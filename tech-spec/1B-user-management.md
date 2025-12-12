# Module 1B: User Management

## Objective
Build user CRUD with Cognito integration and approval workflow.

## Prerequisites
- Module 1A completed

---

## API Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/v1/users` | List users (filtered) | Admin |
| GET | `/api/v1/users/:id` | Get user details | Admin |
| POST | `/api/v1/users/invite` | Invite new user | Admin |
| PUT | `/api/v1/users/:id` | Update user | Admin |
| POST | `/api/v1/users/:id/approve` | Approve pending user | Admin |
| POST | `/api/v1/users/:id/disable` | Disable user | Admin |
| POST | `/api/v1/users/:id/enable` | Re-enable user | Admin |

---

## Backend Implementation

### Routes

`apps/api/src/routes/users.ts`:

```typescript
import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createUserSchema, updateUserSchema } from '@kol360/shared';
import { requireClientAdmin, requirePlatformAdmin } from '../middleware/rbac';
import { UserService } from '../services/user.service';

const userService = new UserService();

const querySchema = z.object({
  clientId: z.string().optional(),
  role: z.enum(['PLATFORM_ADMIN', 'CLIENT_ADMIN', 'TEAM_MEMBER']).optional(),
  status: z.enum(['PENDING_VERIFICATION', 'PENDING_APPROVAL', 'ACTIVE', 'DISABLED']).optional(),
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(50),
});

export const userRoutes: FastifyPluginAsync = async (fastify) => {
  // List users
  fastify.get('/', { preHandler: requireClientAdmin() }, async (request) => {
    const query = querySchema.parse(request.query);
    
    // Client admins can only see their own client's users
    if (request.user!.role === 'CLIENT_ADMIN') {
      query.clientId = request.user!.tenantId;
    }
    
    return userService.list(query);
  });

  // Get user by ID
  fastify.get<{ Params: { id: string } }>('/:id', { preHandler: requireClientAdmin() }, async (request, reply) => {
    const user = await userService.getById(request.params.id);
    
    if (!user) {
      return reply.status(404).send({ error: 'Not Found', message: 'User not found', statusCode: 404 });
    }

    // Client admins can only view their own client's users
    if (request.user!.role === 'CLIENT_ADMIN' && user.clientId !== request.user!.tenantId) {
      return reply.status(403).send({ error: 'Forbidden', statusCode: 403 });
    }

    return user;
  });

  // Invite new user
  fastify.post('/invite', { preHandler: requireClientAdmin() }, async (request, reply) => {
    const data = createUserSchema.parse(request.body);
    
    // Client admins can only invite to their own client
    if (request.user!.role === 'CLIENT_ADMIN') {
      if (data.clientId && data.clientId !== request.user!.tenantId) {
        return reply.status(403).send({ error: 'Forbidden', statusCode: 403 });
      }
      data.clientId = request.user!.tenantId;
      data.role = 'TEAM_MEMBER'; // Client admins can only create team members
    }

    const user = await userService.invite(data);
    
    await fastify.prisma.auditLog.create({
      data: {
        userId: request.user!.sub,
        action: 'user.invited',
        entityType: 'User',
        entityId: user.id,
        newValues: { email: data.email, role: data.role },
      },
    });

    return reply.status(201).send(user);
  });

  // Update user
  fastify.put<{ Params: { id: string } }>('/:id', { preHandler: requireClientAdmin() }, async (request, reply) => {
    const data = updateUserSchema.parse(request.body);
    const existing = await userService.getById(request.params.id);

    if (!existing) {
      return reply.status(404).send({ error: 'Not Found', statusCode: 404 });
    }

    // Client admins can only update their own client's users
    if (request.user!.role === 'CLIENT_ADMIN' && existing.clientId !== request.user!.tenantId) {
      return reply.status(403).send({ error: 'Forbidden', statusCode: 403 });
    }

    const user = await userService.update(request.params.id, data);

    await fastify.prisma.auditLog.create({
      data: {
        userId: request.user!.sub,
        action: 'user.updated',
        entityType: 'User',
        entityId: user.id,
        oldValues: existing,
        newValues: data,
      },
    });

    return user;
  });

  // Approve user
  fastify.post<{ Params: { id: string } }>('/:id/approve', { preHandler: requireClientAdmin() }, async (request, reply) => {
    const user = await userService.approve(request.params.id, request.user!.sub);

    await fastify.prisma.auditLog.create({
      data: {
        userId: request.user!.sub,
        action: 'user.approved',
        entityType: 'User',
        entityId: user.id,
      },
    });

    return user;
  });

  // Disable user
  fastify.post<{ Params: { id: string } }>('/:id/disable', { preHandler: requireClientAdmin() }, async (request, reply) => {
    const user = await userService.disable(request.params.id);

    await fastify.prisma.auditLog.create({
      data: {
        userId: request.user!.sub,
        action: 'user.disabled',
        entityType: 'User',
        entityId: user.id,
      },
    });

    return user;
  });

  // Enable user
  fastify.post<{ Params: { id: string } }>('/:id/enable', { preHandler: requireClientAdmin() }, async (request, reply) => {
    const user = await userService.enable(request.params.id);

    await fastify.prisma.auditLog.create({
      data: {
        userId: request.user!.sub,
        action: 'user.enabled',
        entityType: 'User',
        entityId: user.id,
      },
    });

    return user;
  });
};
```

### Service

`apps/api/src/services/user.service.ts`:

```typescript
import { prisma } from '../lib/prisma';
import { cognitoService } from './cognito.service';
import { CreateUserInput, UpdateUserInput } from '@kol360/shared';

interface ListQuery {
  clientId?: string;
  role?: string;
  status?: string;
  page: number;
  limit: number;
}

export class UserService {
  async list(query: ListQuery) {
    const { clientId, role, status, page, limit } = query;
    
    const where: any = {};
    if (clientId) where.clientId = clientId;
    if (role) where.role = role;
    if (status) where.status = status;

    const [total, items] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        include: {
          client: { select: { id: true, name: true } },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      items,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async getById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      include: {
        client: true,
        auditLogs: {
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  async invite(data: CreateUserInput) {
    // Create in Cognito first
    const cognitoUser = await cognitoService.createUser(data.email);
    
    // Set custom attributes
    await cognitoService.updateUserAttributes(data.email, {
      role: data.role,
      tenantId: data.clientId || undefined,
    });

    // Add to group
    await cognitoService.addUserToGroup(
      data.email, 
      cognitoService.getRoleGroup(data.role)
    );

    // Create in database
    return prisma.user.create({
      data: {
        cognitoSub: cognitoUser?.Username || '',
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        role: data.role as any,
        clientId: data.clientId,
        status: 'PENDING_VERIFICATION',
      },
    });
  }

  async update(id: string, data: UpdateUserInput) {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new Error('User not found');

    // Update Cognito if role changed
    if (data.role && data.role !== user.role) {
      await cognitoService.removeUserFromGroup(user.email, cognitoService.getRoleGroup(user.role));
      await cognitoService.addUserToGroup(user.email, cognitoService.getRoleGroup(data.role));
      await cognitoService.updateUserAttributes(user.email, { role: data.role });
    }

    return prisma.user.update({
      where: { id },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        role: data.role as any,
        clientId: data.clientId,
      },
    });
  }

  async approve(id: string, approvedBy: string) {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new Error('User not found');

    // Enable in Cognito
    await cognitoService.enableUser(user.email);

    return prisma.user.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        approvedAt: new Date(),
        approvedBy,
      },
    });
  }

  async disable(id: string) {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new Error('User not found');

    await cognitoService.disableUser(user.email);

    return prisma.user.update({
      where: { id },
      data: { status: 'DISABLED' },
    });
  }

  async enable(id: string) {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new Error('User not found');

    await cognitoService.enableUser(user.email);

    return prisma.user.update({
      where: { id },
      data: { status: 'ACTIVE' },
    });
  }
}
```

---

## Frontend Implementation

### User List Page

`apps/web/src/app/admin/users/page.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { RequireAuth } from '@/components/auth/require-auth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { UserInviteDialog } from '@/components/users/user-invite-dialog';
import { Plus, Check, X, MoreHorizontal } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const statusColors: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  ACTIVE: 'default',
  PENDING_APPROVAL: 'secondary',
  PENDING_VERIFICATION: 'outline',
  DISABLED: 'destructive',
};

export default function UsersPage() {
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['users', { status: statusFilter }],
    queryFn: () => apiClient.get<{ items: any[] }>('/api/v1/users', { 
      status: statusFilter || undefined 
    }),
  });

  const approveUser = useMutation({
    mutationFn: (id: string) => apiClient.post(`/api/v1/users/${id}/approve`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  const disableUser = useMutation({
    mutationFn: (id: string) => apiClient.post(`/api/v1/users/${id}/disable`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  const enableUser = useMutation({
    mutationFn: (id: string) => apiClient.post(`/api/v1/users/${id}/enable`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  const users = data?.items || [];
  const pendingCount = users.filter(u => u.status === 'PENDING_APPROVAL').length;

  return (
    <RequireAuth allowedRoles={['PLATFORM_ADMIN', 'CLIENT_ADMIN']}>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold">Users</h1>
            {pendingCount > 0 && (
              <p className="text-sm text-orange-600">{pendingCount} pending approval</p>
            )}
          </div>
          <Button onClick={() => setShowInviteDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Invite User
          </Button>
        </div>

        <div className="flex gap-4 mb-4">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All statuses</SelectItem>
              <SelectItem value="PENDING_APPROVAL">Pending Approval</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
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
                <TableHead>Role</TableHead>
                <TableHead>Client</TableHead>
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
                  <TableCell>
                    <Badge variant="outline">{user.role}</Badge>
                  </TableCell>
                  <TableCell>{user.client?.name || '—'}</TableCell>
                  <TableCell>
                    <Badge variant={statusColors[user.status]}>
                      {user.status.replace('_', ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {user.status === 'PENDING_APPROVAL' && (
                          <DropdownMenuItem onClick={() => approveUser.mutate(user.id)}>
                            <Check className="w-4 h-4 mr-2" />
                            Approve
                          </DropdownMenuItem>
                        )}
                        {user.status === 'ACTIVE' && (
                          <DropdownMenuItem onClick={() => disableUser.mutate(user.id)}>
                            <X className="w-4 h-4 mr-2" />
                            Disable
                          </DropdownMenuItem>
                        )}
                        {user.status === 'DISABLED' && (
                          <DropdownMenuItem onClick={() => enableUser.mutate(user.id)}>
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

        <UserInviteDialog open={showInviteDialog} onOpenChange={setShowInviteDialog} />
      </div>
    </RequireAuth>
  );
}
```

---

## Acceptance Criteria

- [ ] Platform admin can list all users
- [ ] Client admin can only see their client's users
- [ ] Admin can invite new users
- [ ] Invited users receive email (via Cognito)
- [ ] Admin can approve pending users (enables in Cognito)
- [ ] Admin can disable/enable users (syncs with Cognito)
- [ ] User status shows correctly
- [ ] Audit logs created for all operations

---

## Next Module
→ `2A-hcp-database.md` - HCP management and bulk import
