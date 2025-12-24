'use client';

import { useState, useEffect } from 'react';
import { useApiClient } from '@/hooks/use-api-client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
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
import {
  Plus,
  Pencil,
  Trash2,
  Palette,
  Star,
  LayoutGrid,
  Eye,
  Copy,
} from 'lucide-react';

interface DashboardTemplate {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  isActive: boolean;
  componentKeys: string[];
  createdAt: string;
  updatedAt: string;
  _count?: {
    clientAssignments: number;
  };
}

const AVAILABLE_COMPONENTS = [
  { key: 'top_kols_table', name: 'Top KOLs Table', description: 'Ranked list of healthcare professionals' },
  { key: 'response_rate', name: 'Response Rate', description: 'Survey response rate metrics' },
  { key: 'score_distribution', name: 'Score Distribution', description: 'Histogram of composite scores' },
  { key: 'geographic_map', name: 'Geographic Map', description: 'HCP locations on a map' },
  { key: 'specialty_breakdown', name: 'Specialty Breakdown', description: 'HCPs by specialty' },
  { key: 'score_comparison', name: 'Score Comparison', description: 'Objective vs survey scores' },
  { key: 'trend_analysis', name: 'Trend Analysis', description: 'Score changes over time' },
  { key: 'nomination_network', name: 'Nomination Network', description: 'HCP nomination relationships' },
];

export default function DashboardTemplatesPage() {
  const api = useApiClient();

  const [templates, setTemplates] = useState<DashboardTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<DashboardTemplate | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    isDefault: false,
    isActive: true,
    componentKeys: ['top_kols_table', 'response_rate'] as string[],
  });

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const data = await api.get<{ items?: DashboardTemplate[] } | DashboardTemplate[]>('/api/v1/dashboard-templates').catch(() => null);
      if (data) {
        const templates = Array.isArray(data) ? data : (data.items || []);
        setTemplates(templates);
      }
    } catch (error) {
      console.error('Failed to fetch templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setEditingTemplate(null);
    setFormData({
      name: '',
      description: '',
      isDefault: false,
      isActive: true,
      componentKeys: ['top_kols_table', 'response_rate'],
    });
    setDialogOpen(true);
  };

  const handleOpenEdit = (template: DashboardTemplate) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      description: template.description || '',
      isDefault: template.isDefault,
      isActive: template.isActive,
      componentKeys: template.componentKeys,
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingTemplate) {
        await api.put(`/api/v1/dashboard-templates/${editingTemplate.id}`, formData);
      } else {
        await api.post('/api/v1/dashboard-templates', formData);
      }
      setDialogOpen(false);
      fetchTemplates();
    } catch (error) {
      console.error('Failed to save template:', error);
    }
  };

  const handleDelete = async (templateId: string) => {
    if (!confirm('Are you sure you want to delete this template?')) return;
    try {
      await api.delete(`/api/v1/dashboard-templates/${templateId}`);
      fetchTemplates();
    } catch (error) {
      console.error('Failed to delete template:', error);
    }
  };

  const handleDuplicate = async (template: DashboardTemplate) => {
    try {
      await api.post('/api/v1/dashboard-templates', {
        name: `${template.name} (Copy)`,
        description: template.description,
        isDefault: false,
        isActive: true,
        componentKeys: template.componentKeys,
      });
      fetchTemplates();
    } catch (error) {
      console.error('Failed to duplicate template:', error);
    }
  };

  const toggleComponent = (key: string) => {
    setFormData((prev) => ({
      ...prev,
      componentKeys: prev.componentKeys.includes(key)
        ? prev.componentKeys.filter((k) => k !== key)
        : [...prev.componentKeys, key],
    }));
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard Templates</h1>
          <p className="text-muted-foreground">
            Configure and manage dashboard layouts for clients
          </p>
        </div>
        <Button onClick={handleOpenCreate}>
          <Plus className="w-4 h-4 mr-2" />
          New Template
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Templates</CardTitle>
            <Palette className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{templates.length}</div>
            <p className="text-xs text-muted-foreground">
              {templates.filter((t) => t.isActive).length} active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Available Components</CardTitle>
            <LayoutGrid className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{AVAILABLE_COMPONENTS.length}</div>
            <p className="text-xs text-muted-foreground">Widget types</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Default Template</CardTitle>
            <Star className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {templates.find((t) => t.isDefault)?.name || 'None'}
            </div>
            <p className="text-xs text-muted-foreground">For new clients</p>
          </CardContent>
        </Card>
      </div>

      {/* Templates List */}
      <Card>
        <CardHeader>
          <CardTitle>Templates</CardTitle>
          <CardDescription>Manage dashboard configurations</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading templates...</div>
          ) : templates.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Palette className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No templates yet</p>
              <p className="text-sm mt-1">Create your first dashboard template</p>
              <Button onClick={handleOpenCreate} className="mt-4">
                <Plus className="w-4 h-4 mr-2" />
                Create Template
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Components</TableHead>
                  <TableHead>Clients</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-32">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((template) => (
                  <TableRow key={template.id} className="group">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{template.name}</span>
                        {template.isDefault && (
                          <Badge variant="secondary" className="gap-1">
                            <Star className="h-3 w-3" />
                            Default
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-xs truncate">
                      {template.description || '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{template.componentKeys.length} widgets</Badge>
                    </TableCell>
                    <TableCell>{template._count?.clientAssignments || 0}</TableCell>
                    <TableCell>
                      <Badge variant={template.isActive ? 'default' : 'secondary'}>
                        {template.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenEdit(template)}
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDuplicate(template)}
                          title="Duplicate"
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(template.id)}
                          title="Delete"
                          disabled={template.isDefault}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? 'Edit Template' : 'Create Dashboard Template'}
            </DialogTitle>
            <DialogDescription>
              Configure the dashboard layout and components for this template
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Template Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Standard KOL Dashboard"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Settings</Label>
                  <div className="flex gap-6 pt-2">
                    <div className="flex items-center gap-2">
                      <Switch
                        id="isActive"
                        checked={formData.isActive}
                        onCheckedChange={(checked) =>
                          setFormData((prev) => ({ ...prev, isActive: checked }))
                        }
                      />
                      <Label htmlFor="isActive">Active</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        id="isDefault"
                        checked={formData.isDefault}
                        onCheckedChange={(checked) =>
                          setFormData((prev) => ({ ...prev, isDefault: checked }))
                        }
                      />
                      <Label htmlFor="isDefault">Default</Label>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, description: e.target.value }))
                  }
                  placeholder="Brief description of this template..."
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label>Dashboard Components</Label>
                <p className="text-sm text-muted-foreground mb-3">
                  Select which widgets to include in this dashboard template
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {AVAILABLE_COMPONENTS.map((component) => (
                    <div
                      key={component.key}
                      onClick={() => toggleComponent(component.key)}
                      className={`
                        p-3 rounded-lg border cursor-pointer transition-colors
                        ${
                          formData.componentKeys.includes(component.key)
                            ? 'border-primary bg-primary/5'
                            : 'border-muted hover:border-muted-foreground/50'
                        }
                      `}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`
                            w-5 h-5 rounded border-2 flex items-center justify-center mt-0.5
                            ${
                              formData.componentKeys.includes(component.key)
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-muted-foreground/30'
                            }
                          `}
                        >
                          {formData.componentKeys.includes(component.key) && (
                            <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor">
                              <path d="M10.28 2.28L4.5 8.06l-2.78-2.78a.75.75 0 00-1.06 1.06l3.25 3.25a.75.75 0 001.06 0l6.25-6.25a.75.75 0 00-1.06-1.06z" />
                            </svg>
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{component.name}</p>
                          <p className="text-xs text-muted-foreground">{component.description}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                {editingTemplate ? 'Save Changes' : 'Create Template'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
