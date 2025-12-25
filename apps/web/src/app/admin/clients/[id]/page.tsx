'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useClient, useUpdateClient } from '@/hooks/use-clients';
import { useCampaigns } from '@/hooks/use-campaigns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Plus, Pencil, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { ClientFormDialog } from '@/components/clients/client-form-dialog';

export default function ClientDetailPage() {
  const params = useParams();
  const clientId = params.id as string;
  const [showEditDialog, setShowEditDialog] = useState(false);

  const { data: client, isLoading: clientLoading } = useClient(clientId);
  const { data: campaignsData, isLoading: campaignsLoading } = useCampaigns({ clientId });
  const updateClient = useUpdateClient();

  const campaigns = campaignsData?.items || [];

  const handleToggleIsLite = async (checked: boolean) => {
    if (!client) return;

    try {
      await updateClient.mutateAsync({
        id: clientId,
        data: {
          name: client.name,
          type: client.type as 'FULL' | 'LITE',
          primaryColor: client.primaryColor,
          isLite: checked,
        },
      });
    } catch (error) {
      // Error is handled by the mutation hook
    }
  };

  if (clientLoading) {
    return (
      <div className="p-6">
        <div>Loading...</div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="p-6">
        <div>Client not found</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/clients">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{client.name}</h1>
            <p className="text-sm text-muted-foreground">Client Details</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowEditDialog(true)}>
            <Pencil className="w-4 h-4 mr-2" />
            Edit Client
          </Button>
        </div>
      </div>

      {/* Client Info Card */}
      <Card>
        <CardHeader>
          <CardTitle>Client Information</CardTitle>
          <CardDescription>Basic information about this client</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-muted-foreground">Client Type</Label>
              <div className="mt-1">
                <Badge variant={client.type === 'FULL' ? 'default' : 'secondary'}>
                  {client.type}
                </Badge>
              </div>
            </div>
            <div>
              <Label className="text-muted-foreground">Status</Label>
              <div className="mt-1">
                <Badge variant={client.isActive ? 'default' : 'destructive'}>
                  {client.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between border-t pt-4">
            <div className="space-y-0.5">
              <Label htmlFor="isLite">Lite Client</Label>
              <p className="text-sm text-muted-foreground">
                Lite clients can view HCPs and scores but cannot run campaigns
              </p>
            </div>
            <Switch
              id="isLite"
              checked={client.isLite || false}
              onCheckedChange={handleToggleIsLite}
              disabled={updateClient.isPending}
            />
          </div>

          <div className="border-t pt-4">
            <Label className="text-muted-foreground">Brand Color</Label>
            <div className="mt-1 flex items-center gap-2">
              <div
                className="w-8 h-8 rounded border"
                style={{ backgroundColor: client.primaryColor }}
              />
              <span className="text-sm font-mono">{client.primaryColor}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Campaigns Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Campaigns</CardTitle>
              <CardDescription>Campaigns for this client</CardDescription>
            </div>
            <Link href={`/admin/campaigns/new?clientId=${clientId}`}>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                New Campaign
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {campaignsLoading ? (
            <div>Loading campaigns...</div>
          ) : campaigns.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No campaigns yet. Create your first campaign to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign Name</TableHead>
                  <TableHead>Disease Area</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>HCPs</TableHead>
                  <TableHead>Responses</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((campaign) => (
                  <TableRow key={campaign.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/admin/campaigns/${campaign.id}`}
                        className="hover:underline"
                      >
                        {campaign.name}
                      </Link>
                    </TableCell>
                    <TableCell>{campaign.diseaseArea.name}</TableCell>
                    <TableCell>
                      <Badge variant={campaign.status === 'ACTIVE' ? 'default' : 'secondary'}>
                        {campaign.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{campaign._count?.campaignHcps || 0}</TableCell>
                    <TableCell>{campaign._count?.surveyResponses || 0}</TableCell>
                    <TableCell>
                      <Link href={`/admin/campaigns/${campaign.id}`}>
                        <Button variant="ghost" size="icon">
                          <Pencil className="w-4 h-4" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* HCP Exclusions Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Client-Level HCP Exclusions</CardTitle>
              <CardDescription>
                HCPs excluded at the client level won't appear in any campaigns for this client
              </CardDescription>
            </div>
            <Button variant="outline">
              <Plus className="w-4 h-4 mr-2" />
              Add Exclusion
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            No client-level HCP exclusions configured.
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      {showEditDialog && (
        <ClientFormDialog
          open={showEditDialog}
          onOpenChange={setShowEditDialog}
          clientId={clientId}
        />
      )}
    </div>
  );
}
