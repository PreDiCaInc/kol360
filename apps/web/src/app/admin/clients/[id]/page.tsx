'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useApiClient } from '@/hooks/use-api-client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ArrowLeft,
  Building2,
  BarChart3,
  Users,
  Stethoscope,
  Eye,
  Plus,
  Pencil,
  Ban,
  Palette,
  ExternalLink,
  Calendar,
} from 'lucide-react';
import { ClientFormDialog } from '@/components/clients/client-form-dialog';

interface Client {
  id: string;
  name: string;
  type: 'FULL' | 'LITE';
  isLite?: boolean;
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

interface Campaign {
  id: string;
  name: string;
  status: 'DRAFT' | 'ACTIVE' | 'CLOSED' | 'PUBLISHED';
  diseaseArea?: { name: string };
  surveyOpenDate: string | null;
  surveyCloseDate: string | null;
  createdAt: string;
  _count?: {
    campaignHcps: number;
    surveyResponses: number;
  };
}

interface HcpExclusion {
  id: string;
  hcp: {
    id: string;
    firstName: string;
    lastName: string;
    npi: string;
    specialty: string | null;
  };
  reason: string | null;
  excludedAt: string;
  excludedBy: string;
}

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  status: string;
  lastLoginAt: string | null;
}

const statusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  ACTIVE: 'bg-green-100 text-green-700',
  CLOSED: 'bg-amber-100 text-amber-700',
  PUBLISHED: 'bg-blue-100 text-blue-700',
};

export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const api = useApiClient();
  const clientId = params.id as string;

  const [client, setClient] = useState<Client | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [exclusions, setExclusions] = useState<HcpExclusion[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    async function fetchClientData() {
      try {
        const [clientData, campaignsData, usersData] = await Promise.all([
          api.get<Client>(`/api/v1/clients/${clientId}`),
          api.get<{ campaigns?: Campaign[]; items?: Campaign[] }>(`/api/v1/campaigns`, { clientId }),
          api.get<{ items?: User[]; users?: User[] }>(`/api/v1/users`, { clientId }),
        ]);

        if (clientData) setClient(clientData);
        if (campaignsData) setCampaigns(campaignsData.campaigns || campaignsData.items || []);
        if (usersData) setUsers(usersData.items || usersData.users || []);
      } catch (error) {
        console.error('Failed to fetch client data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchClientData();
  }, [api, clientId]);

  const handleViewAsClient = () => {
    // Store impersonation data in session storage
    sessionStorage.setItem('viewAsClient', JSON.stringify({
      clientId: client?.id,
      clientName: client?.name,
      originalUrl: window.location.href,
    }));
    // Redirect to client dashboard view
    router.push('/admin/client-dashboard');
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3"></div>
          <div className="h-32 bg-muted rounded"></div>
          <div className="h-64 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <h2 className="text-lg font-semibold">Client not found</h2>
          <p className="text-muted-foreground mt-1">The requested client could not be found.</p>
          <Button asChild className="mt-4">
            <Link href="/admin/clients">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Clients
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/admin/clients">
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{client.name}</h1>
              <Badge variant={client.type === 'FULL' ? 'default' : 'secondary'}>
                {client.type}
              </Badge>
              <Badge variant={client.isActive ? 'outline' : 'destructive'}>
                {client.isActive ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1">
              Created {new Date(client.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleViewAsClient}>
            <Eye className="w-4 h-4 mr-2" />
            View as Client
          </Button>
          <Button variant="outline" onClick={() => setEditDialogOpen(true)}>
            <Pencil className="w-4 h-4 mr-2" />
            Edit
          </Button>
          {client.type === 'FULL' && (
            <Button asChild>
              <Link href={`/admin/campaigns/new?clientId=${clientId}`}>
                <Plus className="w-4 h-4 mr-2" />
                New Campaign
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Campaigns</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{campaigns.length}</div>
            <p className="text-xs text-muted-foreground">
              {campaigns.filter(c => c.status === 'ACTIVE').length} active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{users.length}</div>
            <p className="text-xs text-muted-foreground">
              Team members
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">HCP Exclusions</CardTitle>
            <Ban className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{exclusions.length}</div>
            <p className="text-xs text-muted-foreground">
              Excluded HCPs
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Brand Color</CardTitle>
            <Palette className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded border"
                style={{ backgroundColor: client.primaryColor }}
              />
              <span className="text-sm font-mono">{client.primaryColor}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="campaigns">Campaigns ({campaigns.length})</TabsTrigger>
          <TabsTrigger value="users">Users ({users.length})</TabsTrigger>
          <TabsTrigger value="exclusions">HCP Exclusions</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Client Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Client Type</span>
                    <p className="font-medium">{client.type}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Status</span>
                    <p className="font-medium">{client.isActive ? 'Active' : 'Inactive'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Created</span>
                    <p className="font-medium">{new Date(client.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Last Updated</span>
                    <p className="font-medium">{new Date(client.updatedAt).toLocaleDateString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent Activity</CardTitle>
              </CardHeader>
              <CardContent>
                {campaigns.length > 0 ? (
                  <div className="space-y-3">
                    {campaigns.slice(0, 3).map((campaign) => (
                      <div key={campaign.id} className="flex items-center justify-between text-sm">
                        <div>
                          <Link
                            href={`/admin/campaigns/${campaign.id}`}
                            className="font-medium hover:underline"
                          >
                            {campaign.name}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {campaign.diseaseArea?.name}
                          </p>
                        </div>
                        <Badge className={statusColors[campaign.status]}>
                          {campaign.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No campaigns yet</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Campaigns Tab */}
        <TabsContent value="campaigns" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Campaigns</CardTitle>
                <CardDescription>
                  All campaigns for this client
                </CardDescription>
              </div>
              {client.type === 'FULL' && (
                <Button asChild>
                  <Link href={`/admin/campaigns/new?clientId=${clientId}`}>
                    <Plus className="w-4 h-4 mr-2" />
                    New Campaign
                  </Link>
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {campaigns.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campaign Name</TableHead>
                      <TableHead>Disease Area</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>HCPs</TableHead>
                      <TableHead>Responses</TableHead>
                      <TableHead>Survey Dates</TableHead>
                      <TableHead className="w-20">Actions</TableHead>
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
                        <TableCell>{campaign.diseaseArea?.name || '-'}</TableCell>
                        <TableCell>
                          <Badge className={statusColors[campaign.status]}>
                            {campaign.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{campaign._count?.campaignHcps || 0}</TableCell>
                        <TableCell>{campaign._count?.surveyResponses || 0}</TableCell>
                        <TableCell>
                          {campaign.surveyOpenDate ? (
                            <span className="text-sm">
                              {new Date(campaign.surveyOpenDate).toLocaleDateString()}
                              {campaign.surveyCloseDate && (
                                <> - {new Date(campaign.surveyCloseDate).toLocaleDateString()}</>
                              )}
                            </span>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" asChild>
                            <Link href={`/admin/campaigns/${campaign.id}`}>
                              <ExternalLink className="w-4 h-4" />
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No campaigns yet</p>
                  {client.type === 'FULL' && (
                    <p className="text-sm mt-1">Create a campaign to get started</p>
                  )}
                  {client.type === 'LITE' && (
                    <p className="text-sm mt-1">Lite clients have view-only access to dashboards</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Users Tab */}
        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Team Members</CardTitle>
                <CardDescription>
                  Users with access to this client organization
                </CardDescription>
              </div>
              <Button asChild>
                <Link href={`/admin/users/new?clientId=${clientId}`}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add User
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {users.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Login</TableHead>
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
                          <Badge variant="outline">
                            {user.role.replace(/_/g, ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={user.status === 'ACTIVE' ? 'default' : 'secondary'}>
                            {user.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {user.lastLoginAt
                            ? new Date(user.lastLoginAt).toLocaleDateString()
                            : 'Never'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No users yet</p>
                  <p className="text-sm mt-1">Add team members to give them access</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* HCP Exclusions Tab */}
        <TabsContent value="exclusions" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>HCP Exclusions</CardTitle>
                <CardDescription>
                  Healthcare professionals excluded from this client's view
                </CardDescription>
              </div>
              <Button variant="outline">
                <Plus className="w-4 h-4 mr-2" />
                Add Exclusion
              </Button>
            </CardHeader>
            <CardContent>
              {exclusions.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>HCP Name</TableHead>
                      <TableHead>NPI</TableHead>
                      <TableHead>Specialty</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Excluded Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {exclusions.map((exclusion) => (
                      <TableRow key={exclusion.id}>
                        <TableCell className="font-medium">
                          {exclusion.hcp.firstName} {exclusion.hcp.lastName}
                        </TableCell>
                        <TableCell>{exclusion.hcp.npi}</TableCell>
                        <TableCell>{exclusion.hcp.specialty || '-'}</TableCell>
                        <TableCell>{exclusion.reason || '-'}</TableCell>
                        <TableCell>
                          {new Date(exclusion.excludedAt).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Ban className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No HCP exclusions</p>
                  <p className="text-sm mt-1">
                    Add exclusions to hide specific HCPs from this client's dashboard
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Branding</CardTitle>
                <CardDescription>Client visual identity settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Logo</label>
                  {client.logoUrl ? (
                    <div className="mt-2 p-4 border rounded bg-muted/50">
                      <img
                        src={client.logoUrl}
                        alt={`${client.name} logo`}
                        className="max-h-16 object-contain"
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground mt-1">No logo uploaded</p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium">Primary Color</label>
                  <div className="flex items-center gap-3 mt-2">
                    <div
                      className="w-10 h-10 rounded border"
                      style={{ backgroundColor: client.primaryColor }}
                    />
                    <span className="font-mono text-sm">{client.primaryColor}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Dashboard Template</CardTitle>
                <CardDescription>Assigned dashboard configuration</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-4 text-muted-foreground">
                  <Palette className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Using default template</p>
                  <Button variant="outline" size="sm" className="mt-3">
                    Assign Template
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      {editDialogOpen && (
        <ClientFormDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          clientId={clientId}
        />
      )}
    </div>
  );
}
