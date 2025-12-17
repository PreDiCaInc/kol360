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
import { Label } from '@/components/ui/label';
import { Plus, Pencil, Trash2, Lock, FileText } from 'lucide-react';

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
      await deleteSection.mutateAsync(sectionToDelete.id);
      setSectionToDelete(null);
    } catch (error) {
      console.error('Failed to delete section:', error);
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
            Add Section
          </Button>
        </div>

        {isLoading ? (
          <div>Loading...</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Questions</TableHead>
                <TableHead>Used In</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sections?.map((section) => (
                <TableRow key={section.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {section.isCore && (
                        <Lock className="w-4 h-4 text-muted-foreground" />
                      )}
                      <Link
                        href={`/admin/sections/${section.id}`}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {section.name}
                      </Link>
                      {section.isCore && (
                        <Badge variant="secondary">Core</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-xs truncate">
                    {section.description || '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      <FileText className="w-3 h-3 mr-1" />
                      {section.questions.length}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {section._count.templateSections} template(s)
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" asChild>
                        <Link href={`/admin/sections/${section.id}`}>
                          <Pencil className="w-4 h-4" />
                        </Link>
                      </Button>
                      {!section.isCore && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setSectionToDelete({ id: section.id, name: section.name })}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {(!sections || sections.length === 0) && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No section templates found. Create your first section to get started.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}

        {/* Create Section Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Section Template</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={newSectionName}
                  onChange={(e) => setNewSectionName(e.target.value)}
                  placeholder="e.g., Demographics"
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={newSectionDescription}
                  onChange={(e) => setNewSectionDescription(e.target.value)}
                  placeholder="Optional description..."
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={!newSectionName.trim() || createSection.isPending}
                >
                  {createSection.isPending ? 'Creating...' : 'Create'}
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
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </RequireAuth>
  );
}
