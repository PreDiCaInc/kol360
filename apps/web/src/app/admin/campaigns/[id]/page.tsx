'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  useCampaign,
  useUpdateCampaign,
  useActivateCampaign,
  useCloseCampaign,
  useReopenCampaign,
  usePublishCampaign,
} from '@/hooks/use-campaigns';
import { useScoreConfig, useUpdateScoreConfig, useResetScoreConfig } from '@/hooks/use-score-config';
import { RequireAuth } from '@/components/auth/require-auth';
import { ScoreConfigForm } from '@/components/campaigns/score-config-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
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
  ArrowLeft,
  Play,
  Pause,
  RotateCcw,
  CheckCircle,
  Settings,
  Users,
  FileText,
  BarChart3,
} from 'lucide-react';
import { CampaignStatus, ScoreConfigInput } from '@kol360/shared';

const statusColors: Record<CampaignStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-800',
  ACTIVE: 'bg-green-100 text-green-800',
  CLOSED: 'bg-yellow-100 text-yellow-800',
  PUBLISHED: 'bg-blue-100 text-blue-800',
};

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const campaignId = params.id as string;

  const { data: campaign, isLoading } = useCampaign(campaignId);
  const { data: scoreConfig } = useScoreConfig(campaignId);
  const updateCampaign = useUpdateCampaign();
  const updateScoreConfig = useUpdateScoreConfig();
  const resetScoreConfig = useResetScoreConfig();
  const activateCampaign = useActivateCampaign();
  const closeCampaign = useCloseCampaign();
  const reopenCampaign = useReopenCampaign();
  const publishCampaign = usePublishCampaign();

  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({ name: '', description: '' });
  const [statusAction, setStatusAction] = useState<'activate' | 'close' | 'reopen' | 'publish' | null>(null);

  const handleStartEdit = () => {
    if (campaign) {
      setEditData({
        name: campaign.name,
        description: campaign.description || '',
      });
      setIsEditing(true);
    }
  };

  const handleSaveEdit = async () => {
    if (!editData.name.trim()) return;
    try {
      await updateCampaign.mutateAsync({
        id: campaignId,
        data: {
          name: editData.name.trim(),
          description: editData.description.trim() || null,
        },
      });
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to update campaign:', error);
    }
  };

  const handleStatusChange = async () => {
    if (!statusAction) return;
    try {
      switch (statusAction) {
        case 'activate':
          await activateCampaign.mutateAsync(campaignId);
          break;
        case 'close':
          await closeCampaign.mutateAsync(campaignId);
          break;
        case 'reopen':
          await reopenCampaign.mutateAsync(campaignId);
          break;
        case 'publish':
          await publishCampaign.mutateAsync(campaignId);
          break;
      }
      setStatusAction(null);
    } catch (error) {
      console.error('Failed to change status:', error);
    }
  };

  const handleSaveScoreConfig = async (data: ScoreConfigInput) => {
    await updateScoreConfig.mutateAsync({ campaignId, data });
  };

  const handleResetScoreConfig = async () => {
    await resetScoreConfig.mutateAsync(campaignId);
  };

  if (isLoading) {
    return (
      <RequireAuth allowedRoles={['PLATFORM_ADMIN', 'CLIENT_ADMIN']}>
        <div className="p-6">Loading...</div>
      </RequireAuth>
    );
  }

  if (!campaign) {
    return (
      <RequireAuth allowedRoles={['PLATFORM_ADMIN', 'CLIENT_ADMIN']}>
        <div className="p-6">
          <div className="text-center py-12">
            <h2 className="text-xl font-semibold">Campaign not found</h2>
            <Button className="mt-4" onClick={() => router.push('/admin/campaigns')}>
              Back to Campaigns
            </Button>
          </div>
        </div>
      </RequireAuth>
    );
  }

  const statusActionLabels = {
    activate: { title: 'Activate Campaign', description: 'This will make the campaign active and ready for survey distribution.' },
    close: { title: 'Close Campaign', description: 'This will close the survey collection. You can reopen it later if needed.' },
    reopen: { title: 'Reopen Campaign', description: 'This will reopen the campaign for additional survey responses.' },
    publish: { title: 'Publish Results', description: 'This will publish the KOL scores. This action cannot be undone.' },
  };

  return (
    <RequireAuth allowedRoles={['PLATFORM_ADMIN', 'CLIENT_ADMIN']}>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/admin/campaigns">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Link>
          </Button>
        </div>

        <div className="flex justify-between items-start mb-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold">{campaign.name}</h1>
              <Badge className={statusColors[campaign.status as CampaignStatus]}>
                {campaign.status}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {campaign.client.name} &middot; {campaign.diseaseArea.name}
            </p>
          </div>
          <div className="flex gap-2">
            {campaign.status === 'DRAFT' && (
              <Button onClick={() => setStatusAction('activate')}>
                <Play className="w-4 h-4 mr-2" />
                Activate
              </Button>
            )}
            {campaign.status === 'ACTIVE' && (
              <Button onClick={() => setStatusAction('close')} variant="outline">
                <Pause className="w-4 h-4 mr-2" />
                Close Survey
              </Button>
            )}
            {campaign.status === 'CLOSED' && (
              <>
                <Button onClick={() => setStatusAction('reopen')} variant="outline">
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Reopen
                </Button>
                <Button onClick={() => setStatusAction('publish')}>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Publish
                </Button>
              </>
            )}
          </div>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">
              <FileText className="w-4 h-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="hcps">
              <Users className="w-4 h-4 mr-2" />
              HCPs ({campaign._count.campaignHcps})
            </TabsTrigger>
            <TabsTrigger value="scores">
              <BarChart3 className="w-4 h-4 mr-2" />
              Score Config
            </TabsTrigger>
            <TabsTrigger value="settings">
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">HCPs Assigned</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{campaign._count.campaignHcps}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Survey Responses</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{campaign._count.surveyResponses}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Honorarium</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">
                    {campaign.honorariumAmount ? `$${campaign.honorariumAmount}` : 'N/A'}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Campaign Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {campaign.description && (
                  <div>
                    <label className="text-sm text-muted-foreground">Description</label>
                    <p>{campaign.description}</p>
                  </div>
                )}
                {campaign.surveyTemplate && (
                  <div>
                    <label className="text-sm text-muted-foreground">Survey Template</label>
                    <p>{campaign.surveyTemplate.name}</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-muted-foreground">Survey Open Date</label>
                    <p>{campaign.surveyOpenDate ? new Date(campaign.surveyOpenDate).toLocaleDateString() : 'Not set'}</p>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Survey Close Date</label>
                    <p>{campaign.surveyCloseDate ? new Date(campaign.surveyCloseDate).toLocaleDateString() : 'Not set'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="hcps">
            <Card>
              <CardHeader>
                <CardTitle>Assigned HCPs</CardTitle>
                <CardDescription>
                  Manage HCPs assigned to this campaign
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-center py-8">
                  HCP assignment will be available in Module 5B (Survey Distribution)
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="scores">
            {scoreConfig && (
              <ScoreConfigForm
                config={scoreConfig}
                onSave={handleSaveScoreConfig}
                onReset={handleResetScoreConfig}
                isLoading={updateScoreConfig.isPending || resetScoreConfig.isPending}
              />
            )}
          </TabsContent>

          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Campaign Settings</CardTitle>
                  {!isEditing && campaign.status === 'DRAFT' && (
                    <Button variant="outline" onClick={handleStartEdit}>
                      Edit
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {isEditing ? (
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium">Name</label>
                      <Input
                        value={editData.name}
                        onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Description</label>
                      <Textarea
                        value={editData.description}
                        onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                        rows={3}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => setIsEditing(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleSaveEdit} disabled={updateCampaign.isPending}>
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm text-muted-foreground">Name</label>
                      <p className="font-medium">{campaign.name}</p>
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">Description</label>
                      <p>{campaign.description || 'No description'}</p>
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">Client</label>
                      <p>{campaign.client.name}</p>
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">Disease Area</label>
                      <p>{campaign.diseaseArea.name}</p>
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">Created</label>
                      <p>{new Date(campaign.createdAt).toLocaleString()}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Status Change Confirmation */}
        <AlertDialog open={!!statusAction} onOpenChange={() => setStatusAction(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {statusAction && statusActionLabels[statusAction].title}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {statusAction && statusActionLabels[statusAction].description}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleStatusChange}>
                Confirm
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </RequireAuth>
  );
}
