'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useHcps, useHcpFilters } from '@/hooks/use-hcps';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { HcpImportDialog } from '@/components/hcps/hcp-import-dialog';
import { HcpFormDialog } from '@/components/hcps/hcp-form-dialog';
import { AliasImportDialog } from '@/components/hcps/alias-import-dialog';
import { Plus, Upload, Search, ChevronLeft, ChevronRight, Users, AlertTriangle, RefreshCw, Stethoscope, MapPin } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

// Helper to get specialty display name
function getSpecialtyDisplay(hcp: { specialty?: string | null; specialties?: { isPrimary: boolean; specialty: { name: string } }[] }) {
  // Prefer new specialties array over legacy field
  if (hcp.specialties && hcp.specialties.length > 0) {
    return hcp.specialties.map(s => s.specialty.name);
  }
  // Fall back to legacy specialty field
  if (hcp.specialty) {
    return [hcp.specialty];
  }
  return [];
}

export default function HcpsPage() {
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showAliasImportDialog, setShowAliasImportDialog] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<{
    query?: string;
    specialty?: string;
    state?: string;
    page: number;
  }>({ page: 1 });

  const { data, isLoading, isError, error, refetch } = useHcps({
    ...filters,
    query: filters.query,
  });
  const { data: filterOptions } = useHcpFilters();

  const hcps = data?.items || [];
  const pagination = data?.pagination;

  const handleSearch = () => {
    setFilters((prev) => ({ ...prev, query: searchQuery, page: 1 }));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div className="p-6 lg:p-8 fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">HCP Database</h1>
          <p className="text-muted-foreground mt-1">Healthcare professional records and management</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setShowImportDialog(true)}>
            <Upload className="w-4 h-4 mr-2" />
            Import HCPs
          </Button>
          <Button variant="outline" onClick={() => setShowAliasImportDialog(true)}>
            <Users className="w-4 h-4 mr-2" />
            Import Aliases
          </Button>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add HCP
          </Button>
        </div>
      </div>

      {/* Stats Summary */}
      {!isLoading && pagination && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-card rounded-xl border border-border/60 p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Stethoscope className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{pagination.total.toLocaleString()}</p>
              <p className="text-sm text-muted-foreground">Total HCPs</p>
            </div>
          </div>
          <div className="bg-card rounded-xl border border-border/60 p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{filterOptions?.specialties?.length || 0}</p>
              <p className="text-sm text-muted-foreground">Specialties</p>
            </div>
          </div>
          <div className="bg-card rounded-xl border border-border/60 p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <MapPin className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{filterOptions?.states?.length || 0}</p>
              <p className="text-sm text-muted-foreground">States Covered</p>
            </div>
          </div>
        </div>
      )}

      {/* Search and Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="flex-1 flex gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by NPI, name, or alias..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              className="pl-9"
            />
          </div>
          <Button variant="outline" onClick={handleSearch} className="shrink-0">
            Search
          </Button>
        </div>

        <div className="flex flex-wrap gap-3">
          <Select
            value={filters.specialty || 'all'}
            onValueChange={(value) =>
              setFilters((prev) => ({
                ...prev,
                specialty: value === 'all' ? undefined : value,
                page: 1,
              }))
            }
          >
            <SelectTrigger className="w-48 bg-card">
              <SelectValue placeholder="All Specialties" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Specialties</SelectItem>
              {filterOptions?.specialties?.map((specialty) => (
                <SelectItem key={specialty.id} value={specialty.name}>
                  {specialty.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.state || 'all'}
            onValueChange={(value) =>
              setFilters((prev) => ({
                ...prev,
                state: value === 'all' ? undefined : value,
                page: 1,
              }))
            }
          >
            <SelectTrigger className="w-36 bg-card">
              <SelectValue placeholder="All States" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All States</SelectItem>
              {filterOptions?.states.map((state) => (
                <SelectItem key={state} value={state}>
                  {state}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="bg-card rounded-xl border border-border/60 overflow-hidden">
          <div className="p-4 border-b border-border/60">
            <div className="h-4 w-24 skeleton rounded" />
          </div>
          {[...Array(8)].map((_, i) => (
            <div key={i} className="p-4 border-b border-border/40 last:border-0">
              <div className="flex items-center gap-4">
                <div className="h-4 w-24 skeleton rounded font-mono" />
                <div className="h-4 w-32 skeleton rounded" />
                <div className="h-5 w-20 skeleton rounded-full" />
                <div className="h-4 w-28 skeleton rounded" />
                <div className="h-5 w-8 skeleton rounded-full" />
                <div className="h-4 w-8 skeleton rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <Card className="border-destructive">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertTriangle className="w-12 h-12 text-destructive mb-4" />
            <h3 className="text-lg font-medium mb-2">Failed to load HCPs</h3>
            <p className="text-muted-foreground mb-4 text-center max-w-md">
              {error instanceof Error ? error.message : 'Unable to connect to the server. Please check your connection and try again.'}
            </p>
            <Button onClick={() => refetch()} variant="outline">
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : hcps.length === 0 ? (
        <div className="bg-card rounded-xl border border-border/60 p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
            <Stethoscope className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-2">No HCPs found</h3>
          <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
            {filters.query || filters.specialty || filters.state 
              ? 'Try adjusting your search filters to find more results.'
              : 'Import HCP data or add your first healthcare professional.'}
          </p>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" onClick={() => setShowImportDialog(true)}>
              <Upload className="w-4 h-4 mr-2" />
              Import HCPs
            </Button>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add HCP
            </Button>
          </div>
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>NPI</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Specialty</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Aliases</TableHead>
                <TableHead>Campaigns</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {hcps.map((hcp) => (
                <TableRow key={hcp.id}>
                  <TableCell className="font-mono text-muted-foreground">{hcp.npi}</TableCell>
                  <TableCell>
                    <Link
                      href={`/admin/hcps/${hcp.id}`}
                      className="font-medium text-primary hover:text-primary/80 transition-colors"
                    >
                      {hcp.firstName} {hcp.lastName}
                    </Link>
                    {hcp.email && (
                      <div className="text-sm text-muted-foreground">{hcp.email}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const specialties = getSpecialtyDisplay(hcp);
                      return specialties.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {specialties.map((spec, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {spec}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      );
                    })()}
                    {hcp.subSpecialty && (
                      <div className="text-sm text-muted-foreground mt-1">
                        {hcp.subSpecialty}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {hcp.city && hcp.state
                      ? `${hcp.city}, ${hcp.state}`
                      : hcp.state || '—'}
                  </TableCell>
                  <TableCell>
                    {hcp.aliases.length > 0 ? (
                      <Badge variant="secondary">{hcp.aliases.length}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {hcp._count?.campaignHcps || 0}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Pagination */}
          {pagination && pagination.pages > 1 && (
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-6 pt-4 border-t border-border/60">
              <div className="text-sm text-muted-foreground">
                Showing {hcps.length} of {pagination.total.toLocaleString()} HCPs
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page <= 1}
                  onClick={() => setFilters((prev) => ({ ...prev, page: prev.page - 1 }))}
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Previous
                </Button>
                <span className="text-sm px-3">
                  Page {pagination.page} of {pagination.pages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page >= pagination.pages}
                  onClick={() => setFilters((prev) => ({ ...prev, page: prev.page + 1 }))}
                >
                  Next
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <HcpImportDialog open={showImportDialog} onOpenChange={setShowImportDialog} />
      <AliasImportDialog open={showAliasImportDialog} onOpenChange={setShowAliasImportDialog} />
      <HcpFormDialog open={showCreateDialog} onOpenChange={setShowCreateDialog} />
    </div>
  );
}
