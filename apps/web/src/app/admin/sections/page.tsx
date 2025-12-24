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
import { Plus, MoreHorizontal, Eye, Pencil, Trash2, Lock, FolderOpen } from 'lucide-react';

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

  return (
    <RequireAuth allowedRoles={['PLATFORM_ADMIN', 'CLIENT_ADMIN']}>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold">Section Templates</h1>
            <p className="text-muted-foreground">
              Organize questions into reusable sections for survey templates
            </p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Section
          </Button>
        </div>

        {isLoading ? (
          <div className="text-center py-12">Loading...</div>
        ) : !sections || sections.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FolderOpen className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No sections yet</h3>
              <p className="text-muted-foreground mb-4">
                Create your first section to organize questions
              </p>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Section
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>All Sections</CardTitle>
              <CardDescription>
                {sections.length} section{sections.length !== 1 ? 's' : ''} available
              </CardDescription>
            </CardHeader>
            <CardContent>
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
                            <Lock className="w-4 h-4 text-muted-foreground" />
                          )}
                          <div>
                            <div className="font-medium">{section.name}</div>
                            {section.description && (
                              <div className="text-sm text-muted-foreground line-clamp-1">
                                {section.description}
                              </div>
                            )}
                          </div>
                          {section.isCore && (
                            <Badge variant="secondary">Core</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{section.questions.length}</Badge>
                      </TableCell>
                      <TableCell>
                        {section._count.templateSections > 0 ? (
                          <span className="text-sm">
                            {section._count.templateSections} template{section._count.templateSections !== 1 ? 's' : ''}
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
                />
              </div>
              <div>
                <label className="text-sm font-medium">Description</label>
                <Textarea
                  placeholder="Describe this section..."
                  value={newSectionDescription}
                  onChange={(e) => setNewSectionDescription(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={createSection.isPending || !newSectionName.trim()}>
                  Create
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
