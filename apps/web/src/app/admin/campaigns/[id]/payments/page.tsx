'use client';

import { useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  usePayments,
  usePaymentStats,
  useExportPayments,
  useReExportPayments,
  useImportPaymentStatus,
} from '@/hooks/use-payments';
import { useCampaign } from '@/hooks/use-campaigns';
import { RequireAuth } from '@/components/auth/require-auth';
import { Button } from '@/components/ui/button';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  ArrowLeft,
  Download,
  Upload,
  Loader2,
  DollarSign,
  CheckCircle2,
  Clock,
  Mail,
  XCircle,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';

// Payment status configuration
const PAYMENT_STATUS_CONFIG: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive'; icon: React.ReactNode }
> = {
  PENDING_EXPORT: { label: 'Pending Export', variant: 'outline', icon: <Clock className="w-3 h-3" /> },
  EXPORTED: { label: 'Exported', variant: 'secondary', icon: <Download className="w-3 h-3" /> },
  EMAIL_SENT: { label: 'Email Sent', variant: 'secondary', icon: <Mail className="w-3 h-3" /> },
  EMAIL_DELIVERED: { label: 'Delivered', variant: 'secondary', icon: <Mail className="w-3 h-3" /> },
  EMAIL_OPENED: { label: 'Opened', variant: 'secondary', icon: <Mail className="w-3 h-3" /> },
  CLAIMED: { label: 'Claimed', variant: 'default', icon: <CheckCircle2 className="w-3 h-3" /> },
  BOUNCED: { label: 'Bounced', variant: 'destructive', icon: <XCircle className="w-3 h-3" /> },
  REJECTED: { label: 'Rejected', variant: 'destructive', icon: <XCircle className="w-3 h-3" /> },
  EXPIRED: { label: 'Expired', variant: 'destructive', icon: <Clock className="w-3 h-3" /> },
};

export default function CampaignPaymentsPage() {
  const params = useParams();
  const campaignId = params.id as string;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [showImportResult, setShowImportResult] = useState<{
    processed: number;
    updated: number;
    errors: Array<{ row: number; error: string }>;
  } | null>(null);

  const { data: campaign } = useCampaign(campaignId);
  const { data: payments, isLoading } = usePayments(campaignId, {
    status: statusFilter !== 'all' ? statusFilter : undefined,
    page,
    limit: 20,
  });
  const { data: stats } = usePaymentStats(campaignId);
  const exportPayments = useExportPayments();
  const reExportPayments = useReExportPayments();
  const importStatus = useImportPaymentStatus();

  const handleExport = async () => {
    try {
      await exportPayments.mutateAsync(campaignId);
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  const handleReExport = async () => {
    try {
      await reExportPayments.mutateAsync(campaignId);
    } catch (error) {
      console.error('Re-export failed:', error);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const result = await importStatus.mutateAsync({ campaignId, file });
      setShowImportResult(result);
    } catch (error) {
      console.error('Import failed:', error);
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const formatCurrency = (amount: string, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
    }).format(parseFloat(amount));
  };

  const pendingCount = stats?.byStatus?.PENDING_EXPORT?.count || 0;
  const exportedCount = stats?.byStatus?.EXPORTED?.count || 0;

  return (
    <RequireAuth allowedRoles={['PLATFORM_ADMIN']}>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/admin/campaigns/${campaignId}`}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Campaign
            </Link>
          </Button>
        </div>

        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-2xl font-bold">Honorarium Payments</h1>
            {campaign && (
              <p className="text-muted-foreground">{campaign.name}</p>
            )}
          </div>
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              className="hidden"
            />
            <Button variant="outline" onClick={handleImportClick} disabled={importStatus.isPending}>
              {importStatus.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Upload className="w-4 h-4 mr-2" />
              )}
              Import Status
            </Button>
            <Button
              variant="outline"
              onClick={handleReExport}
              disabled={reExportPayments.isPending || exportedCount === 0}
              title="Re-download exported payments without changing status"
            >
              {reExportPayments.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Re-export ({exportedCount})
            </Button>
            <Button
              onClick={handleExport}
              disabled={exportPayments.isPending || pendingCount === 0}
            >
              {exportPayments.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Export Pending ({pendingCount})
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Payments
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.total?.count || 0}</div>
              <p className="text-sm text-muted-foreground">
                {stats?.total?.amount ? formatCurrency(stats.total.amount.toString(), 'USD') : '$0.00'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Pending
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.byStatus?.PENDING_EXPORT?.count || 0}</div>
              <p className="text-sm text-muted-foreground">
                {stats?.byStatus?.PENDING_EXPORT?.amount
                  ? formatCurrency(stats.byStatus.PENDING_EXPORT.amount.toString(), 'USD')
                  : '$0.00'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                Claimed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {stats?.byStatus?.CLAIMED?.count || 0}
              </div>
              <p className="text-sm text-muted-foreground">
                {stats?.byStatus?.CLAIMED?.amount
                  ? formatCurrency(stats.byStatus.CLAIMED.amount.toString(), 'USD')
                  : '$0.00'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <XCircle className="w-4 h-4 text-destructive" />
                Issues
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">
                {(stats?.byStatus?.BOUNCED?.count || 0) +
                  (stats?.byStatus?.REJECTED?.count || 0) +
                  (stats?.byStatus?.EXPIRED?.count || 0)}
              </div>
              <p className="text-sm text-muted-foreground">Bounced/Rejected/Expired</p>
            </CardContent>
          </Card>
        </div>

        {/* Payments Table */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Payment Records</CardTitle>
                <CardDescription>
                  Track honorarium payments for survey respondents
                </CardDescription>
              </div>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {Object.entries(PAYMENT_STATUS_CONFIG).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      {config.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-12">Loading...</div>
            ) : !payments?.items || payments.items.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <DollarSign className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
                <p>No payments found</p>
                <p className="text-sm mt-1">
                  Payments are created when survey responses are completed.
                </p>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>HCP</TableHead>
                      <TableHead>NPI</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Completed</TableHead>
                      <TableHead>Last Updated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.items.map((payment) => {
                      const statusConfig = PAYMENT_STATUS_CONFIG[payment.status] || {
                        label: payment.status,
                        variant: 'outline' as const,
                        icon: null,
                      };
                      return (
                        <TableRow key={payment.id}>
                          <TableCell>
                            <div>
                              <Link
                                href={`/admin/hcps/${payment.hcpId}`}
                                className="font-medium text-blue-600 hover:underline"
                              >
                                {payment.hcp.firstName} {payment.hcp.lastName}
                              </Link>
                              {payment.hcp.email && (
                                <p className="text-sm text-muted-foreground">
                                  {payment.hcp.email}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono">{payment.hcp.npi}</TableCell>
                          <TableCell>{formatCurrency(payment.amount, payment.currency)}</TableCell>
                          <TableCell>
                            <Badge variant={statusConfig.variant} className="flex items-center gap-1 w-fit">
                              {statusConfig.icon}
                              {statusConfig.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {payment.response.completedAt
                              ? new Date(payment.response.completedAt).toLocaleDateString()
                              : '—'}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {payment.statusUpdatedAt
                              ? new Date(payment.statusUpdatedAt).toLocaleDateString()
                              : '—'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                {/* Pagination */}
                {payments.pagination && payments.pagination.pages > 1 && (
                  <div className="flex justify-between items-center mt-4">
                    <div className="text-sm text-muted-foreground">
                      Showing {payments.items.length} of {payments.pagination.total} payments
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => p - 1)}
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <span className="text-sm">
                        Page {page} of {payments.pagination.pages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page >= payments.pagination.pages}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Import Result Dialog */}
        <Dialog open={!!showImportResult} onOpenChange={() => setShowImportResult(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Import Complete</DialogTitle>
              <DialogDescription>
                Payment status update results
              </DialogDescription>
            </DialogHeader>
            {showImportResult && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-muted rounded-lg">
                    <div className="text-2xl font-bold">{showImportResult.processed}</div>
                    <div className="text-sm text-muted-foreground">Processed</div>
                  </div>
                  <div className="text-center p-4 bg-green-50 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">{showImportResult.updated}</div>
                    <div className="text-sm text-muted-foreground">Updated</div>
                  </div>
                  <div className="text-center p-4 bg-red-50 rounded-lg">
                    <div className="text-2xl font-bold text-red-600">{showImportResult.errors.length}</div>
                    <div className="text-sm text-muted-foreground">Errors</div>
                  </div>
                </div>

                {showImportResult.errors.length > 0 && (
                  <div className="max-h-40 overflow-y-auto">
                    <p className="text-sm font-medium mb-2">Errors:</p>
                    <div className="space-y-1">
                      {showImportResult.errors.slice(0, 10).map((err, i) => (
                        <p key={i} className="text-sm text-destructive">
                          Row {err.row}: {err.error}
                        </p>
                      ))}
                      {showImportResult.errors.length > 10 && (
                        <p className="text-sm text-muted-foreground">
                          ...and {showImportResult.errors.length - 10} more errors
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button onClick={() => setShowImportResult(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </RequireAuth>
  );
}
