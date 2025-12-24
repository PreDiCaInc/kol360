'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useClients, useDeleteClient } from '@/hooks/use-clients';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ClientFormDialog } from '@/components/clients/client-form-dialog';
import { Plus, Pencil, Trash2, Eye, BarChart3, Users, Building2 } from 'lucide-react';
import { Input } from '@/components/ui/input';

export default function ClientsPage() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingClient, setEditingClient] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const { data, isLoading } = useClients();
  const deleteClient = useDeleteClient();

  const clients = data?.items || [];
  const filteredClients = clients.filter((client) =>
    client.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Calculate stats
  const totalClients = clients.length;
  const activeClients = clients.filter((c) => c.isActive).length;
  const liteClients = clients.filter((c) => c.type === 'LITE').length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Client Management</h1>
          <p className="text-muted-foreground">Manage client organizations and their campaigns</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Client
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Clients</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalClients}</div>
            <p className="text-xs text-muted-foreground">{activeClients} active</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Full Clients</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalClients - liteClients}</div>
            <p className="text-xs text-muted-foreground">With campaign access</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Lite Clients</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{liteClients}</div>
            <p className="text-xs text-muted-foreground">Dashboard only access</p>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filter */}
      <div className="flex gap-4">
        <div className="relative flex-1 max-w-sm">
          <Input
            placeholder="Search clients..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full"
          />
        </div>
      </div>

      {/* Clients Table */}
      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading clients...</div>
          ) : filteredClients.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchQuery ? 'No clients match your search' : 'No clients found. Add your first client to get started.'}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Users</TableHead>
                  <TableHead>Campaigns</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-32">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClients.map((client) => (
                  <TableRow key={client.id} className="group">
                    <TableCell>
                      <Link
                        href={`/admin/clients/${client.id}`}
                        className="font-medium hover:text-primary hover:underline"
                      >
                        {client.name}
                      </Link>
                      {client.logoUrl && (
                        <span className="ml-2 text-xs text-muted-foreground">(has logo)</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={client.type === 'FULL' ? 'default' : 'secondary'}
                        className={client.type === 'LITE' ? 'bg-blue-100 text-blue-700' : ''}
                      >
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
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" asChild title="View Details">
                          <Link href={`/admin/clients/${client.id}`}>
                            <Eye className="w-4 h-4" />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditingClient(client.id)}
                          title="Edit Client"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm('Are you sure you want to deactivate this client?')) {
                              deleteClient.mutate(client.id);
                            }
                          }}
                          title="Deactivate Client"
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
        </CardContent>
      </Card>

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
