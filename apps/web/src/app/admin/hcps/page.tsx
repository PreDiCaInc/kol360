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
import { Plus, Upload, Search, ChevronLeft, ChevronRight, Users } from 'lucide-react';

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

  const { data, isLoading } = useHcps({
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
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">HCP Database</h1>
          <div className="flex gap-2">
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

        {/* Search and Filters */}
        <div className="flex gap-4 mb-6">
          <div className="flex-1 flex gap-2">
            <Input
              placeholder="Search by NPI, name, or alias..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              className="max-w-md"
            />
            <Button variant="outline" onClick={handleSearch}>
              <Search className="w-4 h-4" />
            </Button>
          </div>

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
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All Specialties" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Specialties</SelectItem>
              {filterOptions?.specialties.map((specialty) => (
                <SelectItem key={specialty} value={specialty}>
                  {specialty}
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
            <SelectTrigger className="w-32">
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

        {isLoading ? (
          <div>Loading...</div>
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
                    <TableCell className="font-mono">{hcp.npi}</TableCell>
                    <TableCell>
                      <Link
                        href={`/admin/hcps/${hcp.id}`}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {hcp.firstName} {hcp.lastName}
                      </Link>
                      {hcp.email && (
                        <div className="text-sm text-muted-foreground">{hcp.email}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      {hcp.specialty && (
                        <Badge variant="outline">{hcp.specialty}</Badge>
                      )}
                      {hcp.subSpecialty && (
                        <div className="text-sm text-muted-foreground mt-1">
                          {hcp.subSpecialty}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {hcp.city && hcp.state
                        ? `${hcp.city}, ${hcp.state}`
                        : hcp.state || '—'}
                    </TableCell>
                    <TableCell>
                      {hcp.aliases.length > 0 ? (
                        <Badge variant="secondary">{hcp.aliases.length}</Badge>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>
                      {hcp._count?.campaignHcps || 0}
                    </TableCell>
                  </TableRow>
                ))}
                {hcps.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No HCPs found. Try adjusting your search or import some data.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {/* Pagination */}
            {pagination && pagination.pages > 1 && (
              <div className="flex justify-between items-center mt-4">
                <div className="text-sm text-muted-foreground">
                  Showing {hcps.length} of {pagination.total} HCPs
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pagination.page <= 1}
                    onClick={() => setFilters((prev) => ({ ...prev, page: prev.page - 1 }))}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-sm">
                    Page {pagination.page} of {pagination.pages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pagination.page >= pagination.pages}
                    onClick={() => setFilters((prev) => ({ ...prev, page: prev.page + 1 }))}
                  >
                    <ChevronRight className="w-4 h-4" />
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
