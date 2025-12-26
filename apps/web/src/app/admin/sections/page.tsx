'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSections, useCreateSection, useDeleteSection } from '@/hooks/use-sections';
import { RequireAuth } from '@/components/auth/require-auth';
import { Button } from '@/components/ui/button';
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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Plus, MoreHorizontal, Eye, Pencil, Trash2, Lock, FolderOpen, MessageSquare, Layers } from 'lucide-react';

export default function SectionsPage() {
  const { data: sections, isLoading } = useSections();
  const createSection = useCreateSection();
  const deleteSection = useDeleteSection();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [sectionToDelete, setSectionToDelete] = useState<{ id: string; name: string } | null>(null);
  const [newSectionName, setNewSectionName] = useState('');
  const [newSectionDescription, setNewSectionDescription] = useState('');

  const handleCreate = async () => {
    if (!newSectionName.trim()) return;
    try {
      await createSection.mutateAsync({
        name: newSectionName.trim(),
        description: newSectionDescription.trim() || null,
        isCore: false,
      });
      setShowCreateDialog(false);
      setNewSectionName('');
      setNewSectionDescription('');
    } catch (error) {
      console.error('Failed to create section:', error);
    }
  };

  const handleDelete = async () => {
    if (!sectionToDelete) return;
    try {
      console.log('Deleting section:', sectionToDelete.id);
      await deleteSection.mutateAsync(sectionToDelete.id);
      console.log('Section deleted successfully');
      setSectionToDelete(null);
    } catch (error) {
      console.error('Failed to delete section:', error);
      alert(error instanceof Error ? error.message : 'Failed to delete section');
    }
  };

  const totalQuestions = sections?.reduce((sum, s) => sum + s.questions.length, 0) || 0;
  const coreCount = sections?.filter(s => s.isCore).length || 0;

  return (
    <RequireAuth allowedRoles={['PLATFORM_ADMIN', 'CLIENT_ADMIN']}>
      <div className="p-6 lg:p-8 fade-in">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Section Templates</h1>
            <p className="text-muted-foreground mt-1">Organize questions into reusable sections for survey templates</p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Section
          </Button>
        </div>

        {/* Stats Summary */}
        {!isLoading && sections && sections.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <div className="bg-card rounded-xl border border-border/60 p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Layers className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-semibold">{sections.length}</p>
                <p className="text-sm text-muted-foreground">Total Sections</p>
              </div>
            </div>
            <div className="bg-card rounded-xl border border-border/60 p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-semibold">{totalQuestions}</p>
                <p className="text-sm text-muted-foreground">Total Questions</p>
              </div>
            </div>
            <div className="bg-card rounded-xl border border-border/60 p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Lock className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-semibold">{coreCount}</p>
                <p className="text-sm text-muted-foreground">Core Sections</p>
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
                  <div className="h-4 w-40 skeleton rounded" />
                  <div className="h-5 w-10 skeleton rounded-full" />
                  <div className="h-4 w-24 skeleton rounded ml-auto" />
                  <div className="h-8 w-8 skeleton rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : !sections || sections.length === 0 ? (
          <div className="bg-card rounded-xl border border-border/60 p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
              <FolderOpen className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-2">No sections yet</h3>
            <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
              Create your first section to start organizing questions into reusable groups.
            </p>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Section
            </Button>
          </div>
        ) : (
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">All Sections</CardTitle>
              <CardDescription>
                {sections.length} section{sections.length !== 1 ? 's' : ''} available
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Questions</TableHead>
                    <TableHead>Used In</TableHead>
                    <TableHead className="w-16"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sections.map((section) => (
                    <TableRow key={section.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {section.isCore && (
                            <Lock className="w-4 h-4 text-amber-500" />
                          )}
                          <div>
                            <Link
                              href={`/admin/sections/${section.id}`}
                              className="font-medium text-primary hover:text-primary/80 transition-colors"
                            >
                              {section.name}
                            </Link>
                            {section.description && (
                              <div className="text-sm text-muted-foreground line-clamp-1">
                                {section.description}
                              </div>
                            )}
                          </div>
                          {section.isCore && (
                            <Badge variant="warning" className="ml-2">Core</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{section.questions.length}</Badge>
                      </TableCell>
                      <TableCell>
                        {section._count.templateSections > 0 ? (
                          <Badge variant="success">
                            {section._count.templateSections} template{section._count.templateSections !== 1 ? 's' : ''}
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
                              <Link href={`/admin/sections/${section.id}`}>
                                <Eye className="w-4 h-4 mr-2" />
                                View Details
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/admin/sections/${section.id}`}>
                                <Pencil className="w-4 h-4 mr-2" />
                                Edit
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => setSectionToDelete({ id: section.id, name: section.name })}
                              disabled={section.isCore || (section._count?.templateSections ?? 0) > 0}
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

        {/* Create Section Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Section Template</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Name</label>
                <Input
                  placeholder="e.g., Demographics"
                  value={newSectionName}
                  onChange={(e) => setNewSectionName(e.target.value)}
                  className="mt-1.5"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Description</label>
                <Textarea
                  placeholder="Describe this section..."
                  value={newSectionDescription}
                  onChange={(e) => setNewSectionDescription(e.target.value)}
                  rows={3}
                  className="mt-1.5"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={createSection.isPending || !newSectionName.trim()}>
                  Create Section
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={!!sectionToDelete} onOpenChange={() => setSectionToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Section</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete &quot;{sectionToDelete?.name}&quot;? This action
                cannot be undone and will remove the section from all templates using it.
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
