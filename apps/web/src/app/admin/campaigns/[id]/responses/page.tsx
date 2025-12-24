'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  useResponses,
  useResponseStats,
  useResponse,
  useExcludeResponse,
  useIncludeResponse,
  useUpdateAnswer,
} from '@/hooks/use-responses';
import { useCampaign } from '@/hooks/use-campaigns';
import { RequireAuth } from '@/components/auth/require-auth';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  CheckCircle2,
  Clock,
  Eye,
  Ban,
  RotateCcw,
  Loader2,
  FileText,
  AlertCircle,
} from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-gray-100 text-gray-700',
  OPENED: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
  COMPLETED: 'bg-green-100 text-green-700',
  EXCLUDED: 'bg-red-100 text-red-700',
};

export default function ResponsesPage() {
  const params = useParams();
  const campaignId = params.id as string;

  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [selectedResponseId, setSelectedResponseId] = useState<string | null>(null);
  const [showExcludeDialog, setShowExcludeDialog] = useState(false);
  const [excludeReason, setExcludeReason] = useState('');
  const [responseToExclude, setResponseToExclude] = useState<string | null>(null);

  const { data: campaign } = useCampaign(campaignId);
  const { data: responses, isLoading } = useResponses(campaignId, {
    status: statusFilter || undefined,
    page,
    limit: 50,
  });
  const { data: stats } = useResponseStats(campaignId);

  const excludeResponse = useExcludeResponse();
  const includeResponse = useIncludeResponse();

  const handleExclude = async () => {
    if (!responseToExclude || !excludeReason) return;

    try {
      await excludeResponse.mutateAsync({
        campaignId,
        responseId: responseToExclude,
        reason: excludeReason,
      });
      setShowExcludeDialog(false);
      setExcludeReason('');
      setResponseToExclude(null);
    } catch (error) {
      console.error('Failed to exclude response:', error);
    }
  };

  const handleInclude = async (responseId: string) => {
    try {
      await includeResponse.mutateAsync({ campaignId, responseId });
    } catch (error) {
      console.error('Failed to include response:', error);
    }
  };

  const formatDate = (date: string | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleString();
  };

  return (
    <RequireAuth allowedRoles={['PLATFORM_ADMIN', 'CLIENT_ADMIN', 'TEAM_MEMBER']}>
      <div className="p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href={`/admin/campaigns/${campaignId}`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Campaign
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Survey Responses</h1>
            {campaign && (
              <p className="text-muted-foreground">{campaign.name}</p>
            )}
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card
              className={`cursor-pointer ${statusFilter === '' ? 'ring-2 ring-primary' : ''}`}
              onClick={() => setStatusFilter('')}
            >
              <CardHeader className="pb-2">
                <CardDescription>Total</CardDescription>
                <CardTitle className="text-2xl">
                  {Object.values(stats).reduce((a, b) => a + b, 0)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card
              className={`cursor-pointer ${statusFilter === 'PENDING' ? 'ring-2 ring-primary' : ''}`}
              onClick={() => setStatusFilter('PENDING')}
            >
              <CardHeader className="pb-2">
                <CardDescription>Pending</CardDescription>
                <CardTitle className="text-2xl">{stats.PENDING || 0}</CardTitle>
              </CardHeader>
            </Card>
            <Card
              className={`cursor-pointer ${statusFilter === 'IN_PROGRESS' ? 'ring-2 ring-primary' : ''}`}
              onClick={() => setStatusFilter('IN_PROGRESS')}
            >
              <CardHeader className="pb-2">
                <CardDescription>In Progress</CardDescription>
                <CardTitle className="text-2xl">
                  {(stats.OPENED || 0) + (stats.IN_PROGRESS || 0)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card
              className={`cursor-pointer ${statusFilter === 'COMPLETED' ? 'ring-2 ring-primary' : ''}`}
              onClick={() => setStatusFilter('COMPLETED')}
            >
              <CardHeader className="pb-2">
                <CardDescription>Completed</CardDescription>
                <CardTitle className="text-2xl text-green-600">{stats.COMPLETED || 0}</CardTitle>
              </CardHeader>
            </Card>
            <Card
              className={`cursor-pointer ${statusFilter === 'EXCLUDED' ? 'ring-2 ring-primary' : ''}`}
              onClick={() => setStatusFilter('EXCLUDED')}
            >
              <CardHeader className="pb-2">
                <CardDescription>Excluded</CardDescription>
                <CardTitle className="text-2xl text-red-600">{stats.EXCLUDED || 0}</CardTitle>
              </CardHeader>
            </Card>
          </div>
        )}

        {/* Responses Table */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Responses</CardTitle>
                <CardDescription>
                  {responses?.pagination.total || 0} responses found
                </CardDescription>
              </div>
              <Select value={statusFilter || 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="OPENED">Opened</SelectItem>
                  <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                  <SelectItem value="EXCLUDED">Excluded</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
            ) : !responses || responses.items.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No responses found.
              </p>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Respondent</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead>Completed</TableHead>
                      <TableHead>Nominations</TableHead>
                      <TableHead className="w-[120px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {responses.items.map((response) => (
                      <TableRow key={response.id}>
                        <TableCell className="font-medium">
                          {response.respondentHcp.firstName} {response.respondentHcp.lastName}
                          <div className="text-xs text-muted-foreground">
                            NPI: {response.respondentHcp.npi}
                          </div>
                        </TableCell>
                        <TableCell>{response.respondentHcp.email || '-'}</TableCell>
                        <TableCell>
                          <Badge className={STATUS_COLORS[response.status] || ''}>
                            {response.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatDate(response.startedAt)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatDate(response.completedAt)}
                        </TableCell>
                        <TableCell>{response._count.nominations}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedResponseId(response.id)}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            {response.status === 'EXCLUDED' ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleInclude(response.id)}
                                disabled={includeResponse.isPending}
                              >
                                <RotateCcw className="w-4 h-4 text-green-600" />
                              </Button>
                            ) : response.status === 'COMPLETED' ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setResponseToExclude(response.id);
                                  setShowExcludeDialog(true);
                                }}
                              >
                                <Ban className="w-4 h-4 text-red-500" />
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Pagination */}
                {responses.pagination.pages > 1 && (
                  <div className="flex justify-between items-center mt-4">
                    <p className="text-sm text-muted-foreground">
                      Page {responses.pagination.page} of {responses.pagination.pages}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page === 1}
                        onClick={() => setPage(page - 1)}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page === responses.pagination.pages}
                        onClick={() => setPage(page + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Response Detail Modal */}
        {selectedResponseId && (
          <ResponseDetailDialog
            campaignId={campaignId}
            responseId={selectedResponseId}
            onClose={() => setSelectedResponseId(null)}
          />
        )}

        {/* Exclude Confirmation */}
        <AlertDialog open={showExcludeDialog} onOpenChange={setShowExcludeDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Exclude Response</AlertDialogTitle>
              <AlertDialogDescription>
                Excluded responses will not be counted in score calculations.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-4">
              <Textarea
                placeholder="Enter reason for exclusion..."
                value={excludeReason}
                onChange={(e) => setExcludeReason(e.target.value)}
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setExcludeReason('')}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleExclude}
                disabled={!excludeReason || excludeResponse.isPending}
                className="bg-red-600 hover:bg-red-700"
              >
                Exclude
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </RequireAuth>
  );
}

interface ResponseDetailDialogProps {
  campaignId: string;
  responseId: string;
  onClose: () => void;
}

function ResponseDetailDialog({ campaignId, responseId, onClose }: ResponseDetailDialogProps) {
  const { data: response, isLoading } = useResponse(campaignId, responseId);
  const updateAnswer = useUpdateAnswer();
  const [editingQuestion, setEditingQuestion] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  const handleSaveEdit = async (questionId: string) => {
    try {
      await updateAnswer.mutateAsync({
        campaignId,
        responseId,
        questionId,
        value: editValue,
      });
      setEditingQuestion(null);
      setEditValue('');
    } catch (error) {
      console.error('Failed to update answer:', error);
    }
  };

  const startEdit = (questionId: string, currentValue: unknown) => {
    setEditingQuestion(questionId);
    if (typeof currentValue === 'string') {
      setEditValue(currentValue);
    } else if (Array.isArray(currentValue)) {
      setEditValue(currentValue.join(', '));
    } else {
      setEditValue(String(currentValue || ''));
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Response Detail</DialogTitle>
          {response && (
            <DialogDescription>
              {response.respondentHcp.firstName} {response.respondentHcp.lastName} ({response.respondentHcp.npi})
            </DialogDescription>
          )}
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        ) : response ? (
          <div className="flex-1 overflow-auto space-y-6 py-4">
            {/* Response Info */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Status:</span>{' '}
                <Badge className={STATUS_COLORS[response.status] || ''}>
                  {response.status}
                </Badge>
              </div>
              <div>
                <span className="text-muted-foreground">Completed:</span>{' '}
                {response.completedAt ? new Date(response.completedAt).toLocaleString() : '-'}
              </div>
              <div>
                <span className="text-muted-foreground">IP Address:</span>{' '}
                {response.ipAddress || '-'}
              </div>
              <div>
                <span className="text-muted-foreground">Nominations:</span>{' '}
                {response.nominations.length}
              </div>
            </div>

            {/* Answers */}
            <div>
              <h3 className="font-semibold mb-4">Answers</h3>
              <div className="space-y-4">
                {response.answers.map((answer) => (
                  <div key={answer.id} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <p className="font-medium text-sm">{answer.question.questionTextSnapshot}</p>
                        {answer.question.sectionName && (
                          <p className="text-xs text-muted-foreground">
                            Section: {answer.question.sectionName}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => startEdit(answer.questionId, answer.answerText || answer.answerJson)}
                      >
                        Edit
                      </Button>
                    </div>
                    {editingQuestion === answer.questionId ? (
                      <div className="mt-2 space-y-2">
                        <Textarea
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleSaveEdit(answer.questionId)}
                            disabled={updateAnswer.isPending}
                          >
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingQuestion(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 text-sm bg-gray-50 p-2 rounded">
                        {answer.answerText ||
                          (answer.answerJson
                            ? Array.isArray(answer.answerJson)
                              ? answer.answerJson.filter(Boolean).join(', ')
                              : JSON.stringify(answer.answerJson)
                            : '-')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Nominations */}
            {response.nominations.length > 0 && (
              <div>
                <h3 className="font-semibold mb-4">Nominations</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Raw Name Entered</TableHead>
                      <TableHead>Match Status</TableHead>
                      <TableHead>Matched HCP</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {response.nominations.map((nom) => (
                      <TableRow key={nom.id}>
                        <TableCell>{nom.rawNameEntered}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              nom.matchStatus === 'MATCHED'
                                ? 'bg-green-50 text-green-700'
                                : nom.matchStatus === 'EXCLUDED'
                                  ? 'bg-red-50 text-red-700'
                                  : ''
                            }
                          >
                            {nom.matchStatus}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {nom.matchedHcp
                            ? `${nom.matchedHcp.firstName} ${nom.matchedHcp.lastName} (${nom.matchedHcp.npi})`
                            : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Payment */}
            {response.payment && (
              <div>
                <h3 className="font-semibold mb-4">Payment</h3>
                <div className="border rounded-lg p-4 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-muted-foreground">Amount:</span>{' '}
                      ${response.payment.amount}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Status:</span>{' '}
                      <Badge variant="outline">{response.payment.status}</Badge>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-center py-8 text-muted-foreground">Response not found</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
