'use client';

import { useState } from 'react';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, X, Building2, MapPin } from 'lucide-react';
import {
  useLiteClients,
  useGrantDiseaseAreaAccess,
  useRevokeDiseaseAreaAccess,
} from '@/hooks/use-lite-client';
import { useDiseaseAreas } from '@/hooks/use-disease-areas';
import { format } from 'date-fns';

export default function LiteClientsPage() {
  const [grantDialogOpen, setGrantDialogOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [selectedDiseaseArea, setSelectedDiseaseArea] = useState<string>('');
  const [expiresAt, setExpiresAt] = useState<string>('');

  const { data: liteClients, isLoading } = useLiteClients();
  const { data: diseaseAreas } = useDiseaseAreas();
  const grantAccess = useGrantDiseaseAreaAccess();
  const revokeAccess = useRevokeDiseaseAreaAccess();

  const handleGrantAccess = () => {
    if (!selectedClient || !selectedDiseaseArea) return;

    grantAccess.mutate(
      {
        clientId: selectedClient,
        diseaseAreaId: selectedDiseaseArea,
        expiresAt: expiresAt || undefined,
      },
      {
        onSuccess: () => {
          setGrantDialogOpen(false);
          setSelectedClient(null);
          setSelectedDiseaseArea('');
          setExpiresAt('');
        },
      }
    );
  };

  const handleRevokeAccess = (clientId: string, diseaseAreaId: string) => {
    if (confirm('Are you sure you want to revoke access to this disease area?')) {
      revokeAccess.mutate({ clientId, diseaseAreaId });
    }
  };

  const openGrantDialog = (clientId: string) => {
    setSelectedClient(clientId);
    setGrantDialogOpen(true);
  };

  // Get disease areas not yet assigned to the selected client
  const getAvailableDiseaseAreas = (clientId: string) => {
    const client = liteClients?.find((c) => c.id === clientId);
    const assignedIds = new Set(
      client?.liteClientDiseaseAreas.map((a) => a.diseaseAreaId) || []
    );
    const allDiseaseAreas = diseaseAreas?.items || [];
    return allDiseaseAreas.filter((da) => !assignedIds.has(da.id));
  };

  return (
    <RequireAuth allowedRoles={['PLATFORM_ADMIN']}>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Lite Client Access Management</h1>
          <p className="text-muted-foreground mt-1">
            Manage disease area access for lite clients who view aggregated KOL scores.
          </p>
        </div>

        {isLoading ? (
          <div>Loading...</div>
        ) : liteClients?.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Building2 className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Lite Clients</h3>
              <p className="text-muted-foreground text-center max-w-md">
                There are no lite clients configured. Create a client with type
                &quot;Lite&quot; to enable disease area access management.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {liteClients?.map((client) => (
              <Card key={client.id}>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">{client.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {client._count.users} user(s)
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openGrantDialog(client.id)}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Grant Access
                  </Button>
                </CardHeader>
                <CardContent>
                  {client.liteClientDiseaseAreas.length === 0 ? (
                    <div className="flex items-center justify-center py-8 text-muted-foreground">
                      <MapPin className="w-5 h-5 mr-2" />
                      No disease areas assigned
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Disease Area</TableHead>
                          <TableHead>Code</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Granted</TableHead>
                          <TableHead>Expires</TableHead>
                          <TableHead className="w-24">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {client.liteClientDiseaseAreas.map((access) => (
                          <TableRow key={access.id}>
                            <TableCell className="font-medium">
                              {access.diseaseArea.name}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {access.diseaseArea.code}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={access.isActive ? 'default' : 'secondary'}
                              >
                                {access.isActive ? 'Active' : 'Inactive'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {format(new Date(access.grantedAt), 'MMM d, yyyy')}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {access.expiresAt
                                ? format(new Date(access.expiresAt), 'MMM d, yyyy')
                                : 'Never'}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  handleRevokeAccess(client.id, access.diseaseAreaId)
                                }
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Grant Access Dialog */}
        <Dialog open={grantDialogOpen} onOpenChange={setGrantDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Grant Disease Area Access</DialogTitle>
              <DialogDescription>
                Select a disease area to grant access to this lite client.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Disease Area</Label>
                <Select
                  value={selectedDiseaseArea}
                  onValueChange={setSelectedDiseaseArea}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select disease area" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedClient &&
                      getAvailableDiseaseAreas(selectedClient).map((da) => (
                        <SelectItem key={da.id} value={da.id}>
                          {da.name} ({da.code})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Expiration Date (optional)</Label>
                <Input
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                />
                <p className="text-xs text-muted-foreground">
                  Leave blank for no expiration
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setGrantDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleGrantAccess}
                disabled={!selectedDiseaseArea || grantAccess.isPending}
              >
                {grantAccess.isPending ? 'Granting...' : 'Grant Access'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </RequireAuth>
  );
}
