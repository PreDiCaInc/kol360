'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  useCampaigns,
  useCreateCampaign,
  useDeleteCampaign,
} from '@/hooks/use-campaigns';
import { useClients } from '@/hooks/use-clients';
import { useDiseaseAreas } from '@/hooks/use-disease-areas';
import { useSurveyTemplates } from '@/hooks/use-survey-templates';
import { RequireAuth } from '@/components/auth/require-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, MoreHorizontal, Eye, Trash2, FileText } from 'lucide-react';
import { CampaignStatus } from '@kol360/shared';

const statusColors: Record<CampaignStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-800',
  ACTIVE: 'bg-green-100 text-green-800',
  CLOSED: 'bg-yellow-100 text-yellow-800',
  PUBLISHED: 'bg-blue-100 text-blue-800',
};

export default function CampaignsPage() {
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | 'ALL'>('ALL');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [campaignToDelete, setCampaignToDelete] = useState<{ id: string; name: string } | null>(null);

  const { data: campaignsData, isLoading } = useCampaigns({
    status: statusFilter === 'ALL' ? undefined : statusFilter,
  });
  const { data: clientsData } = useClients();
  const { data: diseaseAreasData } = useDiseaseAreas();
  const { data: templatesData } = useSurveyTemplates();
  const createCampaign = useCreateCampaign();
  const deleteCampaign = useDeleteCampaign();

  const [newCampaign, setNewCampaign] = useState({
    name: '',
    clientId: '',
    diseaseAreaId: '',
    surveyTemplateId: '',
  });

  const handleCreate = async () => {
    if (!newCampaign.name.trim() || !newCampaign.clientId || !newCampaign.diseaseAreaId) return;
    try {
      await createCampaign.mutateAsync({
        name: newCampaign.name.trim(),
        clientId: newCampaign.clientId,
        diseaseAreaId: newCampaign.diseaseAreaId,
        surveyTemplateId: newCampaign.surveyTemplateId || null,
      });
      setShowCreateDialog(false);
      setNewCampaign({ name: '', clientId: '', diseaseAreaId: '', surveyTemplateId: '' });
    } catch (error) {
      console.error('Failed to create campaign:', error);
    }
  };

  const handleDelete = async () => {
    if (!campaignToDelete) return;
    try {
      await deleteCampaign.mutateAsync(campaignToDelete.id);
      setCampaignToDelete(null);
    } catch (error) {
      console.error('Failed to delete campaign:', error);
    }
  };

  const campaigns = campaignsData?.items || [];
  const clients = clientsData?.items || [];
  const diseaseAreas = diseaseAreasData?.items || [];
  const templates = templatesData || [];

  return (
    <RequireAuth allowedRoles={['PLATFORM_ADMIN', 'CLIENT_ADMIN']}>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold">Campaigns</h1>
            <p className="text-muted-foreground">
              Manage KOL assessment campaigns
            </p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Campaign
          </Button>
        </div>

        {/* Filters */}
        <div className="flex gap-4 mb-6">
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as CampaignStatus | 'ALL')}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Statuses</SelectItem>
              <SelectItem value="DRAFT">Draft</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="CLOSED">Closed</SelectItem>
              <SelectItem value="PUBLISHED">Published</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="text-center py-12">Loading...</div>
        ) : campaigns.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No campaigns yet</h3>
              <p className="text-muted-foreground mb-4">
                Create your first campaign to get started
              </p>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Campaign
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>All Campaigns</CardTitle>
              <CardDescription>
                {campaignsData?.pagination.total} campaign{campaignsData?.pagination.total !== 1 ? 's' : ''}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Disease Area</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>HCPs</TableHead>
                    <TableHead>Responses</TableHead>
                    <TableHead className="w-16"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.map((campaign) => (
                    <TableRow key={campaign.id}>
                      <TableCell>
                        <Link
                          href={`/admin/campaigns/${campaign.id}`}
                          className="font-medium hover:underline"
                        >
                          {campaign.name}
                        </Link>
                      </TableCell>
                      <TableCell>{campaign.client.name}</TableCell>
                      <TableCell>{campaign.diseaseArea.name}</TableCell>
                      <TableCell>
                        <Badge className={statusColors[campaign.status]}>
                          {campaign.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{campaign._count.campaignHcps}</TableCell>
                      <TableCell>{campaign._count.surveyResponses}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/admin/campaigns/${campaign.id}`}>
                                <Eye className="w-4 h-4 mr-2" />
                                View Details
                              </Link>
                            </DropdownMenuItem>
                            {campaign.status === 'DRAFT' && (
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => setCampaignToDelete({ id: campaign.id, name: campaign.name })}
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Create Campaign Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Campaign</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Name</label>
                <Input
                  placeholder="e.g., Q1 2025 Retina Assessment"
                  value={newCampaign.name}
                  onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Client</label>
                <Select
                  value={newCampaign.clientId}
                  onValueChange={(value) => setNewCampaign({ ...newCampaign, clientId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Disease Area</label>
                <Select
                  value={newCampaign.diseaseAreaId}
                  onValueChange={(value) => setNewCampaign({ ...newCampaign, diseaseAreaId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select disease area" />
                  </SelectTrigger>
                  <SelectContent>
                    {diseaseAreas.map((area) => (
                      <SelectItem key={area.id} value={area.id}>
                        {area.therapeuticArea} - {area.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Survey Template (optional)</label>
                <Select
                  value={newCampaign.surveyTemplateId}
                  onValueChange={(value) => setNewCampaign({ ...newCampaign, surveyTemplateId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select template" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No template</SelectItem>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={
                    createCampaign.isPending ||
                    !newCampaign.name.trim() ||
                    !newCampaign.clientId ||
                    !newCampaign.diseaseAreaId
                  }
                >
                  Create
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={!!campaignToDelete} onOpenChange={() => setCampaignToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Campaign</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete &quot;{campaignToDelete?.name}&quot;? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </RequireAuth>
  );
}
