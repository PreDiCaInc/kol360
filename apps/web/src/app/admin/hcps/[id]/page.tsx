'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useHcp, useAddHcpAlias, useRemoveHcpAlias } from '@/hooks/use-hcps';
import { RequireAuth } from '@/components/auth/require-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { HcpFormDialog } from '@/components/hcps/hcp-form-dialog';
import { ArrowLeft, Pencil, Plus, X } from 'lucide-react';

export default function HcpDetailPage() {
  const params = useParams();
  const router = useRouter();
  const hcpId = params.id as string;

  const { data: hcp, isLoading } = useHcp(hcpId);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [newAlias, setNewAlias] = useState('');

  const addAlias = useAddHcpAlias();
  const removeAlias = useRemoveHcpAlias();

  const handleAddAlias = async () => {
    if (!newAlias.trim()) return;
    await addAlias.mutateAsync({ hcpId, aliasName: newAlias.trim() });
    setNewAlias('');
  };

  const handleRemoveAlias = async (aliasId: string) => {
    if (confirm('Remove this alias?')) {
      await removeAlias.mutateAsync({ hcpId, aliasId });
    }
  };

  if (isLoading) {
    return (
      <RequireAuth allowedRoles={['PLATFORM_ADMIN', 'CLIENT_ADMIN']}>
        <div className="p-6">Loading...</div>
      </RequireAuth>
    );
  }

  if (!hcp) {
    return (
      <RequireAuth allowedRoles={['PLATFORM_ADMIN', 'CLIENT_ADMIN']}>
        <div className="p-6">
          <p>HCP not found</p>
          <Button variant="link" onClick={() => router.back()}>
            Go back
          </Button>
        </div>
      </RequireAuth>
    );
  }

  return (
    <RequireAuth allowedRoles={['PLATFORM_ADMIN', 'CLIENT_ADMIN']}>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link href="/admin/hcps">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">
              {hcp.firstName} {hcp.lastName}
            </h1>
            <p className="text-muted-foreground font-mono">NPI: {hcp.npi}</p>
          </div>
          <Button variant="outline" onClick={() => setShowEditDialog(true)}>
            <Pencil className="w-4 h-4 mr-2" />
            Edit
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Profile Info */}
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="font-medium text-muted-foreground">Email</dt>
                  <dd>{hcp.email || '—'}</dd>
                </div>
                <div>
                  <dt className="font-medium text-muted-foreground">Specialty</dt>
                  <dd>
                    {hcp.specialty ? (
                      <Badge variant="outline">{hcp.specialty}</Badge>
                    ) : (
                      '—'
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-muted-foreground">Sub-specialty</dt>
                  <dd>{hcp.subSpecialty || '—'}</dd>
                </div>
                <div>
                  <dt className="font-medium text-muted-foreground">Location</dt>
                  <dd>
                    {hcp.city && hcp.state
                      ? `${hcp.city}, ${hcp.state}`
                      : hcp.state || '—'}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-muted-foreground">Years in Practice</dt>
                  <dd>{hcp.yearsInPractice ?? '—'}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {/* Aliases */}
          <Card>
            <CardHeader>
              <CardTitle>Aliases</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {/* Add Alias Form */}
                <div className="flex gap-2">
                  <Input
                    placeholder="Add alias..."
                    value={newAlias}
                    onChange={(e) => setNewAlias(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAddAlias()}
                  />
                  <Button
                    size="icon"
                    onClick={handleAddAlias}
                    disabled={!newAlias.trim() || addAlias.isPending}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>

                {/* Aliases List */}
                <div className="space-y-2">
                  {hcp.aliases.length > 0 ? (
                    hcp.aliases.map((alias) => (
                      <div
                        key={alias.id}
                        className="flex items-center justify-between bg-muted/50 rounded px-3 py-2"
                      >
                        <span>{alias.aliasName}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleRemoveAlias(alias.id)}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No aliases defined
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Disease Area Scores */}
          <Card>
            <CardHeader>
              <CardTitle>Current Scores by Disease Area</CardTitle>
            </CardHeader>
            <CardContent>
              {hcp.diseaseAreaScores && hcp.diseaseAreaScores.length > 0 ? (
                <div className="space-y-3">
                  {hcp.diseaseAreaScores.map((score) => (
                    <div key={score.id} className="border rounded p-3">
                      <div className="font-medium mb-2">{score.diseaseArea.name}</div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Awareness:</span>{' '}
                          {score.awareness.toFixed(1)}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Adoption:</span>{' '}
                          {score.adoption.toFixed(1)}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Sentiment:</span>{' '}
                          {score.sentiment.toFixed(1)}
                        </div>
                        <div>
                          <span className="text-muted-foreground font-medium">Final:</span>{' '}
                          <span className="font-bold">{score.finalScore.toFixed(1)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No scores available
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Campaign History */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Campaign History</CardTitle>
          </CardHeader>
          <CardContent>
            {hcp.campaignHcps && hcp.campaignHcps.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campaign</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hcp.campaignHcps.map((ch, i) => (
                    <TableRow key={i}>
                      <TableCell>{ch.campaign.name}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            ch.campaign.status === 'COMPLETED'
                              ? 'default'
                              : ch.campaign.status === 'ACTIVE'
                              ? 'secondary'
                              : 'outline'
                          }
                        >
                          {ch.campaign.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No campaign history
              </p>
            )}
          </CardContent>
        </Card>

        <HcpFormDialog
          open={showEditDialog}
          onOpenChange={setShowEditDialog}
          hcpId={hcpId}
        />
      </div>
    </RequireAuth>
  );
}
