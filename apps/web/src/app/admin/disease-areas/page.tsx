'use client';

import { useState, useEffect } from 'react';
import { useApiClient } from '@/hooks/use-api-client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Plus, Pencil, Dna, Activity } from 'lucide-react';

interface DiseaseArea {
  id: string;
  therapeuticArea: string;
  name: string;
  code: string;
  isActive: boolean;
  createdAt: string;
  _count?: {
    campaigns: number;
    hcpDiseaseAreaScores: number;
  };
}

export default function DiseaseAreasPage() {
  const api = useApiClient();

  const [diseaseAreas, setDiseaseAreas] = useState<DiseaseArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingArea, setEditingArea] = useState<DiseaseArea | null>(null);

  const [formData, setFormData] = useState({
    therapeuticArea: '',
    name: '',
    code: '',
    isActive: true,
  });

  useEffect(() => {
    fetchDiseaseAreas();
  }, []);

  const fetchDiseaseAreas = async () => {
    try {
      const data = await api.get<{ items?: DiseaseArea[] } | DiseaseArea[]>('/api/v1/disease-areas').catch(() => null);
      if (data) {
        const areas = Array.isArray(data) ? data : (data.items || []);
        setDiseaseAreas(areas);
      }
    } catch (error) {
      console.error('Failed to fetch disease areas:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setEditingArea(null);
    setFormData({
      therapeuticArea: '',
      name: '',
      code: '',
      isActive: true,
    });
    setDialogOpen(true);
  };

  const handleOpenEdit = (area: DiseaseArea) => {
    setEditingArea(area);
    setFormData({
      therapeuticArea: area.therapeuticArea,
      name: area.name,
      code: area.code,
      isActive: area.isActive,
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingArea) {
        await api.put(`/api/v1/disease-areas/${editingArea.id}`, formData);
      } else {
        await api.post('/api/v1/disease-areas', formData);
      }
      setDialogOpen(false);
      fetchDiseaseAreas();
    } catch (error) {
      console.error('Failed to save disease area:', error);
    }
  };

  // Group by therapeutic area
  const groupedAreas = diseaseAreas.reduce((acc, area) => {
    if (!acc[area.therapeuticArea]) {
      acc[area.therapeuticArea] = [];
    }
    acc[area.therapeuticArea].push(area);
    return acc;
  }, {} as Record<string, DiseaseArea[]>);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Disease Areas</h1>
          <p className="text-muted-foreground">
            Manage therapeutic areas and disease specializations
          </p>
        </div>
        <Button onClick={handleOpenCreate}>
          <Plus className="w-4 h-4 mr-2" />
          Add Disease Area
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Areas</CardTitle>
            <Dna className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{diseaseAreas.length}</div>
            <p className="text-xs text-muted-foreground">
              {diseaseAreas.filter((a) => a.isActive).length} active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Therapeutic Areas</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Object.keys(groupedAreas).length}</div>
            <p className="text-xs text-muted-foreground">Parent categories</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total HCPs</CardTitle>
            <Dna className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {diseaseAreas.reduce((sum, a) => sum + (a._count?.hcpDiseaseAreaScores || 0), 0).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">With scores</p>
          </CardContent>
        </Card>
      </div>

      {/* Disease Areas Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Disease Areas</CardTitle>
          <CardDescription>Grouped by therapeutic area</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading disease areas...</div>
          ) : diseaseAreas.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Dna className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No disease areas yet</p>
              <p className="text-sm mt-1">Add disease areas to categorize HCPs</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Therapeutic Area</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Campaigns</TableHead>
                  <TableHead>HCPs</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-20">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {diseaseAreas.map((area) => (
                  <TableRow key={area.id}>
                    <TableCell className="text-muted-foreground">{area.therapeuticArea}</TableCell>
                    <TableCell className="font-medium">{area.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">
                        {area.code}
                      </Badge>
                    </TableCell>
                    <TableCell>{area._count?.campaigns || 0}</TableCell>
                    <TableCell>{area._count?.hcpDiseaseAreaScores?.toLocaleString() || 0}</TableCell>
                    <TableCell>
                      <Badge variant={area.isActive ? 'default' : 'secondary'}>
                        {area.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenEdit(area)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingArea ? 'Edit Disease Area' : 'Add Disease Area'}
            </DialogTitle>
            <DialogDescription>
              Define a new disease area for categorizing HCPs
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="therapeuticArea">Therapeutic Area</Label>
              <Input
                id="therapeuticArea"
                value={formData.therapeuticArea}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, therapeuticArea: e.target.value }))
                }
                placeholder="e.g., Ophthalmology"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Retina, Dry Eye"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="code">Code</Label>
              <Input
                id="code"
                value={formData.code}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))
                }
                placeholder="e.g., RETINA, DRY_EYE"
                className="font-mono uppercase"
                required
              />
              <p className="text-xs text-muted-foreground">
                Unique identifier (uppercase, underscores allowed)
              </p>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">{editingArea ? 'Save Changes' : 'Create'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
