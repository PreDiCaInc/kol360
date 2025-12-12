# Module 1A: Client Management

## Objective
Build CRUD operations for Client entities with admin UI.

## Prerequisites
- Module 0C completed (authentication working)

---

## API Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/v1/clients` | List all clients | Platform Admin |
| GET | `/api/v1/clients/:id` | Get client by ID | Platform Admin |
| POST | `/api/v1/clients` | Create new client | Platform Admin |
| PUT | `/api/v1/clients/:id` | Update client | Platform Admin |
| DELETE | `/api/v1/clients/:id` | Soft delete (deactivate) | Platform Admin |

---

## Backend Implementation

### Routes

`apps/api/src/routes/clients.ts`:

```typescript
import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createClientSchema, updateClientSchema } from '@kol360/shared';
import { requirePlatformAdmin } from '../middleware/rbac';
import { ClientService } from '../services/client.service';

const clientService = new ClientService();

export const clientRoutes: FastifyPluginAsync = async (fastify) => {
  // Apply admin auth to all routes
  fastify.addHook('preHandler', requirePlatformAdmin());

  // List clients
  fastify.get('/', async (request, reply) => {
    const { includeInactive } = request.query as { includeInactive?: string };
    const clients = await clientService.list(includeInactive === 'true');
    return { items: clients };
  });

  // Get client by ID
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const client = await clientService.getById(request.params.id);
    if (!client) {
      return reply.status(404).send({ 
        error: 'Not Found', 
        message: 'Client not found',
        statusCode: 404 
      });
    }
    return client;
  });

  // Create client
  fastify.post('/', async (request, reply) => {
    const data = createClientSchema.parse(request.body);
    const client = await clientService.create(data, request.user!.sub);
    
    // Audit log
    await fastify.prisma.auditLog.create({
      data: {
        userId: request.user!.sub,
        action: 'client.created',
        entityType: 'Client',
        entityId: client.id,
        newValues: data,
      },
    });

    return reply.status(201).send(client);
  });

  // Update client
  fastify.put<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const data = updateClientSchema.parse(request.body);
    const existing = await clientService.getById(request.params.id);
    
    if (!existing) {
      return reply.status(404).send({ 
        error: 'Not Found', 
        message: 'Client not found',
        statusCode: 404 
      });
    }

    const client = await clientService.update(request.params.id, data);

    // Audit log
    await fastify.prisma.auditLog.create({
      data: {
        userId: request.user!.sub,
        action: 'client.updated',
        entityType: 'Client',
        entityId: client.id,
        oldValues: existing,
        newValues: data,
      },
    });

    return client;
  });

  // Deactivate client (soft delete)
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const existing = await clientService.getById(request.params.id);
    
    if (!existing) {
      return reply.status(404).send({ 
        error: 'Not Found', 
        message: 'Client not found',
        statusCode: 404 
      });
    }

    await clientService.deactivate(request.params.id);

    // Audit log
    await fastify.prisma.auditLog.create({
      data: {
        userId: request.user!.sub,
        action: 'client.deactivated',
        entityType: 'Client',
        entityId: request.params.id,
        oldValues: { isActive: true },
        newValues: { isActive: false },
      },
    });

    return reply.status(204).send();
  });
};
```

### Service

`apps/api/src/services/client.service.ts`:

```typescript
import { prisma } from '../lib/prisma';
import { CreateClientInput, UpdateClientInput } from '@kol360/shared';

export class ClientService {
  async list(includeInactive = false) {
    return prisma.client.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: {
        _count: {
          select: { 
            users: true, 
            campaigns: true,
            liteClientDiseaseAreas: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async getById(id: string) {
    return prisma.client.findUnique({
      where: { id },
      include: {
        users: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            status: true,
          },
        },
        campaigns: {
          select: {
            id: true,
            name: true,
            status: true,
            diseaseArea: { select: { name: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        liteClientDiseaseAreas: {
          include: {
            diseaseArea: true,
          },
        },
        _count: {
          select: { users: true, campaigns: true },
        },
      },
    });
  }

  async create(data: CreateClientInput, createdBy: string) {
    return prisma.client.create({
      data: {
        ...data,
      },
    });
  }

  async update(id: string, data: UpdateClientInput) {
    return prisma.client.update({
      where: { id },
      data,
    });
  }

  async deactivate(id: string) {
    return prisma.client.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async grantDiseaseAreaAccess(clientId: string, diseaseAreaId: string, grantedBy: string) {
    return prisma.liteClientDiseaseArea.create({
      data: {
        clientId,
        diseaseAreaId,
        grantedBy,
      },
    });
  }

  async revokeDiseaseAreaAccess(clientId: string, diseaseAreaId: string) {
    return prisma.liteClientDiseaseArea.deleteMany({
      where: { clientId, diseaseAreaId },
    });
  }
}
```

### Register Routes

Update `apps/api/src/index.ts`:

```typescript
import { clientRoutes } from './routes/clients';

// In main():
await fastify.register(clientRoutes, { prefix: '/api/v1/clients' });
```

---

## Frontend Implementation

### API Hooks

`apps/web/src/hooks/use-clients.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { CreateClientInput, UpdateClientInput } from '@kol360/shared';

interface Client {
  id: string;
  name: string;
  type: 'FULL' | 'LITE';
  logoUrl: string | null;
  primaryColor: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: {
    users: number;
    campaigns: number;
  };
}

export function useClients(includeInactive = false) {
  return useQuery({
    queryKey: ['clients', { includeInactive }],
    queryFn: () => apiClient.get<{ items: Client[] }>('/api/v1/clients', { includeInactive }),
  });
}

export function useClient(id: string) {
  return useQuery({
    queryKey: ['clients', id],
    queryFn: () => apiClient.get<Client>(`/api/v1/clients/${id}`),
    enabled: !!id,
  });
}

export function useCreateClient() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: CreateClientInput) => 
      apiClient.post<Client>('/api/v1/clients', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}

export function useUpdateClient() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateClientInput }) =>
      apiClient.put<Client>(`/api/v1/clients/${id}`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['clients', variables.id] });
    },
  });
}

export function useDeleteClient() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/v1/clients/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}
```

### Client List Page

`apps/web/src/app/admin/clients/page.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { useClients, useDeleteClient } from '@/hooks/use-clients';
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
import { ClientFormDialog } from '@/components/clients/client-form-dialog';
import { Plus, Pencil, Trash2 } from 'lucide-react';

export default function ClientsPage() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingClient, setEditingClient] = useState<string | null>(null);
  const { data, isLoading } = useClients();
  const deleteClient = useDeleteClient();

  const clients = data?.items || [];

  return (
    <RequireAuth allowedRoles={['PLATFORM_ADMIN']}>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Clients</h1>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Client
          </Button>
        </div>

        {isLoading ? (
          <div>Loading...</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Users</TableHead>
                <TableHead>Campaigns</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((client) => (
                <TableRow key={client.id}>
                  <TableCell className="font-medium">{client.name}</TableCell>
                  <TableCell>
                    <Badge variant={client.type === 'FULL' ? 'default' : 'secondary'}>
                      {client.type}
                    </Badge>
                  </TableCell>
                  <TableCell>{client._count?.users || 0}</TableCell>
                  <TableCell>{client._count?.campaigns || 0}</TableCell>
                  <TableCell>
                    <Badge variant={client.isActive ? 'default' : 'destructive'}>
                      {client.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditingClient(client.id)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm('Are you sure?')) {
                            deleteClient.mutate(client.id);
                          }
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <ClientFormDialog
          open={showCreateDialog}
          onOpenChange={setShowCreateDialog}
        />

        {editingClient && (
          <ClientFormDialog
            open={true}
            onOpenChange={() => setEditingClient(null)}
            clientId={editingClient}
          />
        )}
      </div>
    </RequireAuth>
  );
}
```

### Client Form Dialog

`apps/web/src/components/clients/client-form-dialog.tsx`:

```typescript
'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createClientSchema, CreateClientInput } from '@kol360/shared';
import { useClient, useCreateClient, useUpdateClient } from '@/hooks/use-clients';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId?: string;
}

export function ClientFormDialog({ open, onOpenChange, clientId }: Props) {
  const { data: client } = useClient(clientId || '');
  const createClient = useCreateClient();
  const updateClient = useUpdateClient();
  const isEdit = !!clientId;

  const form = useForm<CreateClientInput>({
    resolver: zodResolver(createClientSchema),
    defaultValues: {
      name: '',
      type: 'FULL',
      primaryColor: '#0066CC',
    },
  });

  useEffect(() => {
    if (client) {
      form.reset({
        name: client.name,
        type: client.type,
        primaryColor: client.primaryColor,
        logoUrl: client.logoUrl,
      });
    }
  }, [client, form]);

  async function onSubmit(data: CreateClientInput) {
    try {
      if (isEdit) {
        await updateClient.mutateAsync({ id: clientId!, data });
      } else {
        await createClient.mutateAsync(data);
      }
      onOpenChange(false);
      form.reset();
    } catch (error) {
      console.error('Failed to save client:', error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Client' : 'Add Client'}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Client Name</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Acme Pharma" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Client Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="FULL">Full (Surveys + Data)</SelectItem>
                      <SelectItem value="LITE">Lite (Data Only)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="primaryColor"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Brand Color</FormLabel>
                  <FormControl>
                    <div className="flex gap-2">
                      <Input {...field} type="color" className="w-16 h-10 p-1" />
                      <Input {...field} placeholder="#0066CC" />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createClient.isPending || updateClient.isPending}>
                {isEdit ? 'Update' : 'Create'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
```

---

## Acceptance Criteria

- [ ] Platform admin can list all clients
- [ ] Platform admin can create a new client (Full or Lite type)
- [ ] Platform admin can edit client details
- [ ] Platform admin can deactivate a client
- [ ] Client list shows user count and campaign count
- [ ] Color picker works for brand color
- [ ] Audit log entries created for all operations
- [ ] Non-admin users cannot access client management

---

## Next Module
→ `1B-user-management.md` - User CRUD and approval workflow
