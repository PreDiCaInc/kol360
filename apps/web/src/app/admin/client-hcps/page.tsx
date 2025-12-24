'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth/auth-provider';
import { useApiClient } from '@/hooks/use-api-client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
  Stethoscope,
  Search,
  Download,
  Filter,
  Eye,
  TrendingUp,
  MapPin,
} from 'lucide-react';

interface Hcp {
  id: string;
  firstName: string;
  lastName: string;
  npi: string;
  email: string | null;
  specialty: string | null;
  subSpecialty: string | null;
  city: string | null;
  state: string | null;
  yearsInPractice: number | null;
  compositeScore?: number;
  surveyScore?: number;
}

interface DiseaseArea {
  id: string;
  name: string;
  therapeuticArea: string;
}

export default function ClientHcpsPage() {
  const { user } = useAuth();
  const api = useApiClient();

  const [hcps, setHcps] = useState<Hcp[]>([]);
  const [diseaseAreas, setDiseaseAreas] = useState<DiseaseArea[]>([]);
  const [selectedDiseaseArea, setSelectedDiseaseArea] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 25;

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch disease areas for the client
        const diseaseAreasData = await api.get<{ items?: DiseaseArea[] } | DiseaseArea[]>('/api/v1/disease-areas/client').catch(() => null);
        if (diseaseAreasData) {
          const areas = Array.isArray(diseaseAreasData) ? diseaseAreasData : (diseaseAreasData.items || []);
          setDiseaseAreas(areas);
        }

        // Fetch HCPs
        const hcpsData = await api.get<{ items?: Hcp[]; hcps?: Hcp[]; total?: number }>('/api/v1/hcps', {
          page,
          limit: pageSize,
          clientFiltered: true,
          diseaseAreaId: selectedDiseaseArea !== 'all' ? selectedDiseaseArea : undefined,
          search: searchQuery || undefined,
        }).catch(() => null);
        if (hcpsData) {
          setHcps(hcpsData.items || hcpsData.hcps || []);
          setTotalCount(hcpsData.total || hcpsData.items?.length || 0);
        }
      } catch (error) {
        console.error('Failed to fetch HCPs:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [api, page, selectedDiseaseArea, searchQuery]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
  };

  const handleExport = async () => {
    try {
      // Build export URL and open in new tab for download
      const params = new URLSearchParams({
        clientFiltered: 'true',
        format: 'csv',
      });
      if (selectedDiseaseArea !== 'all') {
        params.set('diseaseAreaId', selectedDiseaseArea);
      }

      window.open(`/api/v1/hcps/export?${params.toString()}`, '_blank');
    } catch (error) {
      console.error('Failed to export:', error);
    }
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Your HCPs</h1>
          <p className="text-muted-foreground">
            Healthcare professionals in your disease areas
          </p>
        </div>
        <Button variant="outline" onClick={handleExport}>
          <Download className="w-4 h-4 mr-2" />
          Export
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total HCPs</CardTitle>
            <Stethoscope className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCount.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Available to you</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Disease Areas</CardTitle>
            <Filter className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{diseaseAreas.length}</div>
            <p className="text-xs text-muted-foreground">Accessible areas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">With Scores</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {hcps.filter(h => h.compositeScore != null).length}
            </div>
            <p className="text-xs text-muted-foreground">Have composite scores</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-4 flex-wrap">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1 max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, NPI, or specialty..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button type="submit" variant="secondary">Search</Button>
        </form>

        <Select value={selectedDiseaseArea} onValueChange={setSelectedDiseaseArea}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All Disease Areas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Disease Areas</SelectItem>
            {diseaseAreas.map((area) => (
              <SelectItem key={area.id} value={area.id}>
                {area.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* HCPs Table */}
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading HCPs...</div>
          ) : hcps.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Stethoscope className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No HCPs found</p>
              <p className="text-sm mt-1">
                {searchQuery ? 'Try adjusting your search criteria' : 'No HCPs available in your disease areas'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>NPI</TableHead>
                  <TableHead>Specialty</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">Composite Score</TableHead>
                  <TableHead className="text-right">Sociometric Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hcps.map((hcp) => (
                  <TableRow key={hcp.id}>
                    <TableCell className="font-medium">
                      {hcp.firstName} {hcp.lastName}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{hcp.npi}</TableCell>
                    <TableCell>
                      {hcp.specialty && (
                        <Badge variant="outline">{hcp.specialty}</Badge>
                      )}
                      {!hcp.specialty && '-'}
                    </TableCell>
                    <TableCell>
                      {hcp.city || hcp.state ? (
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          {[hcp.city, hcp.state].filter(Boolean).join(', ')}
                        </div>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {hcp.compositeScore != null ? (
                        <span className="font-semibold text-primary">
                          {hcp.compositeScore.toFixed(1)}
                        </span>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {hcp.surveyScore != null ? (
                        <Badge variant="secondary">
                          {hcp.surveyScore.toFixed(1)}
                        </Badge>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, totalCount)} of {totalCount} HCPs
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
