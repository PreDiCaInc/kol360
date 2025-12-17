'use client';

import { useState } from 'react';
import { RequireAuth } from '@/components/auth/require-auth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Download,
  Search,
  Users,
  TrendingUp,
  BarChart3,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  useAssignedDiseaseAreas,
  useHcpScores,
  useDiseaseAreaStats,
  useLiteTopKols,
} from '@/hooks/use-lite-client';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

const SEGMENT_LABELS: Record<string, string> = {
  publications: 'Publications',
  clinicalTrials: 'Clinical Trials',
  tradePubs: 'Trade Publications',
  orgLeadership: 'Org Leadership',
  orgAwareness: 'Org Awareness',
  conference: 'Conference',
  socialMedia: 'Social Media',
  mediaPodcasts: 'Media/Podcasts',
  survey: 'Survey',
};

const SEGMENT_COLORS = [
  '#0088FE',
  '#00C49F',
  '#FFBB28',
  '#FF8042',
  '#8884D8',
  '#82CA9D',
  '#FFC658',
  '#8DD1E1',
  '#A569BD',
];

export default function LiteDashboardPage() {
  const [selectedDiseaseArea, setSelectedDiseaseArea] = useState<string>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data: diseaseAreas, isLoading: loadingAreas } = useAssignedDiseaseAreas();
  const { data: hcpScoresData, isLoading: loadingScores } = useHcpScores(
    selectedDiseaseArea,
    { search, page, limit: 20 }
  );
  const { data: stats } = useDiseaseAreaStats(selectedDiseaseArea);
  const { data: topKols } = useLiteTopKols(selectedDiseaseArea, 5);

  // Select first disease area by default
  const selectedArea = diseaseAreas?.find((da) => da.id === selectedDiseaseArea);

  // Prepare segment data for chart
  const segmentData = stats
    ? Object.entries(stats.segmentAverages).map(([key, value], index) => ({
        name: SEGMENT_LABELS[key] || key,
        value: value || 0,
        color: SEGMENT_COLORS[index % SEGMENT_COLORS.length],
      }))
    : [];

  const handleExport = async () => {
    if (!selectedDiseaseArea) return;

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(
        `/api/v1/lite/disease-areas/${selectedDiseaseArea}/export`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hcp-scores-${selectedArea?.code || 'export'}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export data. Please try again.');
    }
  };

  if (loadingAreas) {
    return (
      <RequireAuth>
        <div className="p-6 flex items-center justify-center">
          <div>Loading...</div>
        </div>
      </RequireAuth>
    );
  }

  if (!diseaseAreas || diseaseAreas.length === 0) {
    return (
      <RequireAuth>
        <div className="p-6">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <BarChart3 className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Access Granted</h3>
              <p className="text-muted-foreground text-center max-w-md">
                You currently don&apos;t have access to any disease areas. Please contact
                your administrator to request access.
              </p>
            </CardContent>
          </Card>
        </div>
      </RequireAuth>
    );
  }

  return (
    <RequireAuth>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">KOL Scores Dashboard</h1>
            <p className="text-muted-foreground">
              View and export KOL scores by disease area
            </p>
          </div>

          <div className="flex items-center gap-4">
            <Select
              value={selectedDiseaseArea}
              onValueChange={(value) => {
                setSelectedDiseaseArea(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select disease area" />
              </SelectTrigger>
              <SelectContent>
                {diseaseAreas.map((da) => (
                  <SelectItem key={da.id} value={da.id}>
                    {da.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              onClick={handleExport}
              disabled={!selectedDiseaseArea}
            >
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </div>

        {selectedDiseaseArea ? (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total HCPs</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats?.totalHcps || 0}</div>
                  <p className="text-xs text-muted-foreground">
                    Healthcare providers with scores
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Average Composite Score
                  </CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {stats?.averageCompositeScore?.toFixed(1) || '—'}
                  </div>
                  <p className="text-xs text-muted-foreground">Out of 100</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Disease Area</CardTitle>
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{selectedArea?.name}</div>
                  <p className="text-xs text-muted-foreground">
                    {selectedArea?.therapeuticArea}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Segment Averages */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Segment Score Averages</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={segmentData}
                        layout="vertical"
                        margin={{ left: 80 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" domain={[0, 100]} />
                        <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="value" fill="#8884d8">
                          {segmentData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Top KOLs */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Top KOLs</CardTitle>
                </CardHeader>
                <CardContent>
                  {topKols && topKols.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">#</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Specialty</TableHead>
                          <TableHead className="text-right">Score</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {topKols.map((kol) => (
                          <TableRow key={kol.hcp.id}>
                            <TableCell className="font-medium">{kol.rank}</TableCell>
                            <TableCell>
                              Dr. {kol.hcp.firstName} {kol.hcp.lastName}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {kol.hcp.specialty || '—'}
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {kol.compositeScore?.toFixed(1) || '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      No KOL data available
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Score Distribution */}
            {stats?.scoreDistribution && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Score Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stats.scoreDistribution}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="min"
                          tickFormatter={(value: number) => `${value}-${value + 10}`}
                          tick={{ fontSize: 11 }}
                        />
                        <YAxis />
                        <Tooltip
                          labelFormatter={(value: number) => `Score range: ${value}-${Number(value) + 10}`}
                        />
                        <Bar dataKey="count" fill="#8884d8" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* HCP Scores Table */}
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <CardTitle className="text-lg">All HCPs with Scores</CardTitle>
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by name or NPI..."
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setPage(1);
                      }}
                      className="pl-10"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loadingScores ? (
                  <div className="text-center py-8">Loading...</div>
                ) : !hcpScoresData?.data || hcpScoresData.data.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No HCPs found
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>NPI</TableHead>
                            <TableHead>Specialty</TableHead>
                            <TableHead>State</TableHead>
                            <TableHead className="text-right">Composite</TableHead>
                            <TableHead className="text-right">Survey</TableHead>
                            <TableHead className="text-right">Publications</TableHead>
                            <TableHead className="text-right">Clinical Trials</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {hcpScoresData.data.map((item) => (
                            <TableRow key={item.hcp.id}>
                              <TableCell className="font-medium">
                                Dr. {item.hcp.firstName} {item.hcp.lastName}
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {item.hcp.npi}
                              </TableCell>
                              <TableCell>
                                {item.hcp.specialty ? (
                                  <Badge variant="outline">{item.hcp.specialty}</Badge>
                                ) : (
                                  '—'
                                )}
                              </TableCell>
                              <TableCell>{item.hcp.state || '—'}</TableCell>
                              <TableCell className="text-right font-semibold">
                                {item.scores.composite?.toFixed(1) || '—'}
                              </TableCell>
                              <TableCell className="text-right">
                                {item.scores.survey?.toFixed(1) || '—'}
                              </TableCell>
                              <TableCell className="text-right">
                                {item.scores.publications?.toFixed(1) || '—'}
                              </TableCell>
                              <TableCell className="text-right">
                                {item.scores.clinicalTrials?.toFixed(1) || '—'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Pagination */}
                    {hcpScoresData.pagination.totalPages > 1 && (
                      <div className="flex items-center justify-between mt-4">
                        <p className="text-sm text-muted-foreground">
                          Showing {(page - 1) * 20 + 1} to{' '}
                          {Math.min(page * 20, hcpScoresData.pagination.total)} of{' '}
                          {hcpScoresData.pagination.total} results
                        </p>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(page - 1)}
                            disabled={page === 1}
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(page + 1)}
                            disabled={page >= hcpScoresData.pagination.totalPages}
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
          </>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <BarChart3 className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Select a Disease Area</h3>
              <p className="text-muted-foreground text-center max-w-md">
                Choose a disease area from the dropdown above to view KOL scores and
                analytics.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </RequireAuth>
  );
}
