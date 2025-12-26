'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  useSurveyTemplates,
  useCreateSurveyTemplate,
  useDeleteSurveyTemplate,
  useCloneSurveyTemplate,
} from '@/hooks/use-survey-templates';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, MoreHorizontal, Copy, Trash2, Eye, Pencil, FileText, ClipboardList, MessageSquare, FolderKanban } from 'lucide-react';

export default function SurveyTemplatesPage() {
  const { data: templates, isLoading } = useSurveyTemplates();
  const createTemplate = useCreateSurveyTemplate();
  const deleteTemplate = useDeleteSurveyTemplate();
  const cloneTemplate = useCloneSurveyTemplate();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showCloneDialog, setShowCloneDialog] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<{ id: string; name: string } | null>(null);
  const [templateToClone, setTemplateToClone] = useState<{ id: string; name: string } | null>(null);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [cloneName, setCloneName] = useState('');

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await createTemplate.mutateAsync({
        name: newName.trim(),
        description: newDescription.trim() || null,
      });
      setShowCreateDialog(false);
      setNewName('');
      setNewDescription('');
    } catch (error) {
      console.error('Failed to create template:', error);
    }
  };

  const handleDelete = async () => {
    if (!templateToDelete) return;
    try {
      await deleteTemplate.mutateAsync(templateToDelete.id);
      setTemplateToDelete(null);
    } catch (error) {
      console.error('Failed to delete template:', error);
    }
  };

  const handleClone = async () => {
    if (!templateToClone || !cloneName.trim()) return;
    try {
      await cloneTemplate.mutateAsync({
        id: templateToClone.id,
        name: cloneName.trim(),
      });
      setShowCloneDialog(false);
      setTemplateToClone(null);
      setCloneName('');
    } catch (error) {
      console.error('Failed to clone template:', error);
    }
  };

  const openCloneDialog = (template: { id: string; name: string }) => {
    setTemplateToClone(template);
    setCloneName(`${template.name} (Copy)`);
    setShowCloneDialog(true);
  };

  const getTotalQuestions = (template: { sections: { section: { questions: unknown[] } }[] }) => {
    return template.sections.reduce((sum, ts) => sum + ts.section.questions.length, 0);
  };

  const totalSections = templates?.reduce((sum, t) => sum + t.sections.length, 0) || 0;
  const totalQuestions = templates?.reduce((sum, t) => sum + getTotalQuestions(t), 0) || 0;

  return (
    <RequireAuth allowedRoles={['PLATFORM_ADMIN', 'CLIENT_ADMIN']}>
      <div className="p-6 lg:p-8 fade-in">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Survey Templates</h1>
            <p className="text-muted-foreground mt-1">Create and manage reusable survey templates</p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Template
          </Button>
        </div>

        {/* Stats Summary */}
        {!isLoading && templates && templates.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <div className="bg-card rounded-xl border border-border/60 p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <ClipboardList className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-semibold">{templates.length}</p>
                <p className="text-sm text-muted-foreground">Templates</p>
              </div>
            </div>
            <div className="bg-card rounded-xl border border-border/60 p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <FolderKanban className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-semibold">{totalSections}</p>
                <p className="text-sm text-muted-foreground">Total Sections</p>
              </div>
            </div>
            <div className="bg-card rounded-xl border border-border/60 p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-semibold">{totalQuestions}</p>
                <p className="text-sm text-muted-foreground">Total Questions</p>
              </div>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="bg-card rounded-xl border border-border/60 overflow-hidden">
            <div className="p-4 border-b border-border/60">
              <div className="h-5 w-32 skeleton rounded" />
            </div>
            {[...Array(5)].map((_, i) => (
              <div key={i} className="p-4 border-b border-border/40 last:border-0">
                <div className="flex items-center gap-4">
                  <div className="h-4 w-48 skeleton rounded" />
                  <div className="h-5 w-12 skeleton rounded-full" />
                  <div className="h-5 w-12 skeleton rounded-full" />
                  <div className="h-4 w-24 skeleton rounded ml-auto" />
                  <div className="h-8 w-8 skeleton rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : !templates || templates.length === 0 ? (
          <div className="bg-card rounded-xl border border-border/60 p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-2">No templates yet</h3>
            <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
              Create your first survey template to start building reusable questionnaires.
            </p>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Template
            </Button>
          </div>
        ) : (
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">All Templates</CardTitle>
              <CardDescription>
                {templates.length} template{templates.length !== 1 ? 's' : ''} available
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Sections</TableHead>
                    <TableHead>Questions</TableHead>
                    <TableHead>Used By</TableHead>
                    <TableHead className="w-16"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map((template) => (
                    <TableRow key={template.id}>
                      <TableCell>
                        <div>
                          <Link
                            href={`/admin/survey-templates/${template.id}`}
                            className="font-medium text-primary hover:text-primary/80 transition-colors"
                          >
                            {template.name}
                          </Link>
                          {template.description && (
                            <div className="text-sm text-muted-foreground line-clamp-1">
                              {template.description}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{template.sections.length}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{getTotalQuestions(template)}</Badge>
                      </TableCell>
                      <TableCell>
                        {template._count.campaigns > 0 ? (
                          <Badge variant="success">
                            {template._count.campaigns} campaign{template._count.campaigns !== 1 ? 's' : ''}
                          </Badge>
                        ) : (
                          <span className="text-sm text-muted-foreground">Not used</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/admin/survey-templates/${template.id}`}>
                                <Eye className="w-4 h-4 mr-2" />
                                View Details
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/admin/survey-templates/${template.id}?edit=true`}>
                                <Pencil className="w-4 h-4 mr-2" />
                                Edit
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openCloneDialog(template)}>
                              <Copy className="w-4 h-4 mr-2" />
                              Clone
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => setTemplateToDelete({ id: template.id, name: template.name })}
                              disabled={template._count.campaigns > 0}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Create Template Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Survey Template</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Name</label>
                <Input
                  placeholder="e.g., Quarterly HCP Survey"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="mt-1.5"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Description</label>
                <Textarea
                  placeholder="Describe this template..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  rows={3}
                  className="mt-1.5"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={createTemplate.isPending || !newName.trim()}>
                  Create Template
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Clone Template Dialog */}
        <Dialog open={showCloneDialog} onOpenChange={setShowCloneDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Clone Template</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Create a copy of &quot;{templateToClone?.name}&quot; with a new name.
              </p>
              <div>
                <label className="text-sm font-medium">New Name</label>
                <Input
                  placeholder="Enter name for cloned template"
                  value={cloneName}
                  onChange={(e) => setCloneName(e.target.value)}
                  className="mt-1.5"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setShowCloneDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleClone} disabled={cloneTemplate.isPending || !cloneName.trim()}>
                  Clone Template
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={!!templateToDelete} onOpenChange={() => setTemplateToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Template</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete &quot;{templateToDelete?.name}&quot;? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </RequireAuth>
  );
}
