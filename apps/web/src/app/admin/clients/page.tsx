'use client';

import { useState } from 'react';
import { useClients, useDeleteClient } from '@/hooks/use-clients';
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
import { Plus, Pencil, Trash2, Building2, Users, FolderKanban } from 'lucide-react';
import Link from 'next/link';

export default function ClientsPage() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingClient, setEditingClient] = useState<string | null>(null);
  const { data, isLoading } = useClients();
  const deleteClient = useDeleteClient();

  const clients = data?.items || [];

  return (
    <div className="p-6 lg:p-8 fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Clients</h1>
          <p className="text-muted-foreground mt-1">Manage pharmaceutical client accounts</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} className="shrink-0">
          <Plus className="w-4 h-4 mr-2" />
          Add Client
        </Button>
      </div>

      {/* Stats Summary */}
      {!isLoading && clients.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-card rounded-xl border border-border/60 p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{clients.length}</p>
              <p className="text-sm text-muted-foreground">Total Clients</p>
            </div>
          </div>
          <div className="bg-card rounded-xl border border-border/60 p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-semibold">
                {clients.reduce((acc, c) => acc + (c._count?.users || 0), 0)}
              </p>
              <p className="text-sm text-muted-foreground">Total Users</p>
            </div>
          </div>
          <div className="bg-card rounded-xl border border-border/60 p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <FolderKanban className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-semibold">
                {clients.reduce((acc, c) => acc + (c._count?.campaigns || 0), 0)}
              </p>
              <p className="text-sm text-muted-foreground">Total Campaigns</p>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="bg-card rounded-xl border border-border/60 overflow-hidden">
          <div className="p-4 border-b border-border/60">
            <div className="h-4 w-24 skeleton rounded" />
          </div>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="p-4 border-b border-border/40 last:border-0">
              <div className="flex items-center gap-4">
                <div className="h-4 w-32 skeleton rounded" />
                <div className="h-5 w-16 skeleton rounded-full" />
                <div className="h-4 w-12 skeleton rounded ml-auto" />
                <div className="h-4 w-12 skeleton rounded" />
                <div className="h-5 w-16 skeleton rounded-full" />
                <div className="flex gap-2">
                  <div className="h-8 w-8 skeleton rounded" />
                  <div className="h-8 w-8 skeleton rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : clients.length === 0 ? (
        <div className="bg-card rounded-xl border border-border/60 p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-2">No clients yet</h3>
          <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
            Get started by adding your first pharmaceutical client to the platform.
          </p>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Your First Client
          </Button>
        </div>
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
                <TableCell className="font-medium">
                  <Link
                    href={`/admin/clients/${client.id}`}
                    className="text-primary hover:text-primary/80 transition-colors"
                  >
                    {client.name}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant={client.type === 'FULL' ? 'default' : 'secondary'}>
                    {client.type}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {client._count?.users || 0}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {client._count?.campaigns || 0}
                </TableCell>
                <TableCell>
                  <Badge variant={client.isActive ? 'success' : 'muted'}>
                    {client.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => setEditingClient(client.id)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        if (confirm('Are you sure you want to deactivate this client?')) {
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
  );
}
