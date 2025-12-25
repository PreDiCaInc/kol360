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
import { Plus, MoreHorizontal, Copy, Trash2, Eye, Pencil, FileText } from 'lucide-react';

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

  return (
    <RequireAuth allowedRoles={['PLATFORM_ADMIN', 'CLIENT_ADMIN']}>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold">Survey Templates</h1>
            <p className="text-muted-foreground">
              Create and manage reusable survey templates
            </p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Template
          </Button>
        </div>

        {isLoading ? (
          <div className="text-center py-12">Loading...</div>
        ) : !templates || templates.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No templates yet</h3>
              <p className="text-muted-foreground mb-4">
                Create your first survey template to get started
              </p>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Template
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>All Templates</CardTitle>
              <CardDescription>
                {templates.length} template{templates.length !== 1 ? 's' : ''} available
              </CardDescription>
            </CardHeader>
            <CardContent>
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
                            className="font-medium text-blue-600 hover:underline"
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
                          <span className="text-sm">
                            {template._count.campaigns} campaign{template._count.campaigns !== 1 ? 's' : ''}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">Not used</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
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
                />
              </div>
              <div>
                <label className="text-sm font-medium">Description</label>
                <Textarea
                  placeholder="Describe this template..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={createTemplate.isPending || !newName.trim()}>
                  Create
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
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowCloneDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleClone} disabled={cloneTemplate.isPending || !cloneName.trim()}>
                  Clone
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
