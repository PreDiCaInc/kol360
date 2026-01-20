'use client';

import { useState } from 'react';
import {
  useCampaignHcps,
  useDistributionStats,
  useAssignHcps,
  useRemoveHcp,
  useSendInvitations,
  useSendReminders,
} from '@/hooks/use-distribution';
import { useHcps } from '@/hooks/use-hcps';
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  UserPlus,
  Send,
  Bell,
  Trash2,
  MailCheck,
  Search,
  AlertCircle,
  CheckCircle2,
  Clock,
  Eye,
  Loader2,
  Upload,
} from 'lucide-react';
import { CampaignHcpImportDialog } from './campaign-hcp-import-dialog';

interface CampaignHcpsTabProps {
  campaignId: string;
  campaignStatus: string;
}

export function CampaignHcpsTab({ campaignId, campaignStatus }: CampaignHcpsTabProps) {
  const { data: campaignHcps, isLoading: hcpsLoading } = useCampaignHcps(campaignId);
  const { data: stats } = useDistributionStats(campaignId);
  const [searchQuery, setSearchQuery] = useState('');
  const { data: allHcps } = useHcps({ query: searchQuery, limit: 100 });

  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [selectedHcpIds, setSelectedHcpIds] = useState<string[]>([]);
  const [hcpToRemove, setHcpToRemove] = useState<{ id: string; name: string } | null>(null);
  const [showSendConfirm, setShowSendConfirm] = useState<'invitations' | 'reminders' | null>(null);
  const [sendResult, setSendResult] = useState<{ sent: number; failed?: number; skipped?: number; skippedCompleted?: number; skippedRecentlyReminded?: number; skippedMaxReminders?: number; errors: Array<{ email: string; error: string }> } | null>(null);

  const assignHcps = useAssignHcps();
  const removeHcp = useRemoveHcp();
  const sendInvitations = useSendInvitations();
  const sendReminders = useSendReminders();

  const assignedHcpIds = new Set(campaignHcps?.map((ch) => ch.hcpId) || []);
  const availableHcps = allHcps?.items.filter((hcp) => !assignedHcpIds.has(hcp.id)) || [];

  const handleAssign = async () => {
    if (selectedHcpIds.length === 0) return;
    try {
      await assignHcps.mutateAsync({ campaignId, hcpIds: selectedHcpIds });
      setSelectedHcpIds([]);
      setShowAssignDialog(false);
    } catch (error) {
      console.error('Failed to assign HCPs:', error);
    }
  };

  const handleRemove = async () => {
    if (!hcpToRemove) return;
    try {
      await removeHcp.mutateAsync({ campaignId, hcpId: hcpToRemove.id });
      setHcpToRemove(null);
    } catch (error) {
      console.error('Failed to remove HCP:', error);
    }
  };

  const handleSend = async () => {
    try {
      if (showSendConfirm === 'invitations') {
        const result = await sendInvitations.mutateAsync(campaignId);
        setSendResult(result);
      } else if (showSendConfirm === 'reminders') {
        const result = await sendReminders.mutateAsync(campaignId);
        setSendResult(result);
      }
      setShowSendConfirm(null);
    } catch (error) {
      console.error('Failed to send:', error);
    }
  };

  const toggleHcpSelection = (hcpId: string) => {
    setSelectedHcpIds((prev) =>
      prev.includes(hcpId) ? prev.filter((id) => id !== hcpId) : [...prev, hcpId]
    );
  };

  const isActive = campaignStatus === 'ACTIVE';
  const canModify = campaignStatus === 'DRAFT' || campaignStatus === 'ACTIVE';

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Assigned</CardDescription>
              <CardTitle className="text-2xl">{stats.total}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Invited</CardDescription>
              <CardTitle className="text-2xl">{stats.invited}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Not Invited</CardDescription>
              <CardTitle className="text-2xl">{stats.notInvited}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>In Progress</CardDescription>
              <CardTitle className="text-2xl">{stats.inProgress}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Completed</CardDescription>
              <CardTitle className="text-2xl text-green-600">{stats.completed}</CardTitle>
              <p className="text-sm text-muted-foreground">{stats.completionRate}% rate</p>
            </CardHeader>
          </Card>
        </div>
      )}

      {/* Actions */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Assigned HCPs</CardTitle>
              <CardDescription>
                Manage HCPs participating in this campaign
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {canModify && (
                <>
                  <Button onClick={() => setShowImportDialog(true)} variant="outline">
                    <Upload className="w-4 h-4 mr-2" />
                    Import HCPs
                  </Button>
                  <Button onClick={() => setShowAssignDialog(true)}>
                    <UserPlus className="w-4 h-4 mr-2" />
                    Assign HCPs
                  </Button>
                </>
              )}
              {isActive && stats && stats.notInvited > 0 && (
                <Button onClick={() => setShowSendConfirm('invitations')} variant="outline">
                  <Send className="w-4 h-4 mr-2" />
                  Send Invitations ({stats.notInvited})
                </Button>
              )}
              {isActive && stats && stats.invited > stats.completed && (
                <Button onClick={() => setShowSendConfirm('reminders')} variant="outline">
                  <Bell className="w-4 h-4 mr-2" />
                  Send Reminders
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {hcpsLoading ? (
            <p className="text-center py-4">Loading...</p>
          ) : !campaignHcps || campaignHcps.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No HCPs assigned yet. Click "Assign HCPs" to add healthcare providers to this campaign.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Specialty</TableHead>
                  <TableHead>Institution</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reminders</TableHead>
                  {canModify && <TableHead className="w-[80px]"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaignHcps.map((ch) => (
                  <TableRow key={ch.id}>
                    <TableCell className="font-medium">
                      {ch.hcp.firstName} {ch.hcp.lastName}
                    </TableCell>
                    <TableCell>{ch.hcp.email || '-'}</TableCell>
                    <TableCell>{ch.hcp.specialty || '-'}</TableCell>
                    <TableCell>{ch.hcp.institution || '-'}</TableCell>
                    <TableCell>
                      {ch.surveyStatus === 'COMPLETED' ? (
                        <Badge variant="outline" className="bg-green-50 text-green-700">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Completed
                        </Badge>
                      ) : ch.surveyStatus === 'IN_PROGRESS' ? (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700">
                          <Loader2 className="w-3 h-3 mr-1" />
                          In Progress
                        </Badge>
                      ) : ch.surveyStatus === 'OPENED' ? (
                        <Badge variant="outline" className="bg-purple-50 text-purple-700">
                          <Eye className="w-3 h-3 mr-1" />
                          Opened
                        </Badge>
                      ) : ch.emailSentAt ? (
                        <Badge variant="outline" className="bg-yellow-50 text-yellow-700">
                          <MailCheck className="w-3 h-3 mr-1" />
                          Invited
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-gray-50">
                          <Clock className="w-3 h-3 mr-1" />
                          Pending
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{ch.reminderCount}</TableCell>
                    {canModify && (
                      <TableCell>
                        {!ch.emailSentAt && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setHcpToRemove({
                                id: ch.hcpId,
                                name: `${ch.hcp.firstName} ${ch.hcp.lastName}`,
                              })
                            }
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Assign HCPs Dialog */}
      <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Assign HCPs to Campaign</DialogTitle>
            <DialogDescription>
              Select healthcare providers to participate in this campaign.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, NPI, or specialty..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <div className="flex-1 overflow-auto border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]"></TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Specialty</TableHead>
                  <TableHead>Email</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {availableHcps.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      {searchQuery ? 'No matching HCPs found' : 'All HCPs are already assigned'}
                    </TableCell>
                  </TableRow>
                ) : (
                  availableHcps.map((hcp) => (
                    <TableRow key={hcp.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedHcpIds.includes(hcp.id)}
                          onCheckedChange={() => toggleHcpSelection(hcp.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        {hcp.firstName} {hcp.lastName}
                      </TableCell>
                      <TableCell>{hcp.specialty || '-'}</TableCell>
                      <TableCell>{hcp.email || '-'}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowAssignDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAssign}
              disabled={selectedHcpIds.length === 0 || assignHcps.isPending}
            >
              Assign Selected ({selectedHcpIds.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove HCP Confirmation */}
      <AlertDialog open={!!hcpToRemove} onOpenChange={() => setHcpToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove HCP from Campaign</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {hcpToRemove?.name} from this campaign?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemove}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Send Confirmation */}
      <AlertDialog open={!!showSendConfirm} onOpenChange={() => setShowSendConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {showSendConfirm === 'invitations' ? 'Send Survey Invitations' : 'Send Reminders'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {showSendConfirm === 'invitations'
                ? `This will send survey invitation emails to ${stats?.notInvited || 0} HCPs who haven't been invited yet.`
                : 'This will send reminder emails to HCPs who have been invited but haven\'t completed the survey.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSend}>Send Emails</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Send Result Dialog */}
      <Dialog open={!!sendResult} onOpenChange={() => setSendResult(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {sendResult?.failed === 0 ? (
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              ) : (
                <AlertCircle className="w-5 h-5 text-yellow-500" />
              )}
              Emails Sent
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-2">
            <p className="text-lg">
              Successfully sent: <strong className="text-green-600">{sendResult?.sent || 0}</strong>
            </p>
            {(sendResult?.failed ?? 0) > 0 && (
              <p className="text-lg">
                Failed: <strong className="text-red-600">{sendResult?.failed}</strong>
              </p>
            )}
            {(sendResult?.skipped ?? 0) > 0 && (
              <div className="space-y-1">
                <p className="text-lg">
                  Skipped: <strong className="text-muted-foreground">{sendResult?.skipped}</strong>
                </p>
                {((sendResult?.skippedCompleted ?? 0) > 0 || (sendResult?.skippedRecentlyReminded ?? 0) > 0 || (sendResult?.skippedMaxReminders ?? 0) > 0) && (
                  <ul className="text-sm text-muted-foreground ml-4 list-disc">
                    {(sendResult?.skippedCompleted ?? 0) > 0 && (
                      <li>{sendResult?.skippedCompleted} already completed</li>
                    )}
                    {(sendResult?.skippedMaxReminders ?? 0) > 0 && (
                      <li>{sendResult?.skippedMaxReminders} reached max reminders</li>
                    )}
                    {(sendResult?.skippedRecentlyReminded ?? 0) > 0 && (
                      <li>{sendResult?.skippedRecentlyReminded} received a reminder within the last 24 hrs</li>
                    )}
                  </ul>
                )}
              </div>
            )}
            {sendResult?.errors && sendResult.errors.length > 0 && (
              <div className="mt-4">
                <p className="font-medium mb-2">Errors:</p>
                <ul className="text-sm text-muted-foreground space-y-1">
                  {sendResult.errors.map((err, i) => (
                    <li key={i}>{err.email}: {err.error}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setSendResult(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import HCPs Dialog */}
      <CampaignHcpImportDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        campaignId={campaignId}
      />
    </div>
  );
}
