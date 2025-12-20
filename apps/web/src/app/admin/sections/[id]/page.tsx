'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  useSection,
  useUpdateSection,
  useAddQuestionToSection,
  useRemoveQuestionFromSection,
  useReorderSectionQuestions,
} from '@/hooks/use-sections';
import { useQuestions } from '@/hooks/use-questions';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  ArrowLeft,
  Plus,
  Trash2,
  GripVertical,
  Lock,
  Search,
} from 'lucide-react';

const typeLabels: Record<string, string> = {
  TEXT: 'Text',
  NUMBER: 'Number',
  RATING: 'Rating',
  SINGLE_CHOICE: 'Single Choice',
  MULTI_CHOICE: 'Multi Choice',
  DROPDOWN: 'Dropdown',
  MULTI_TEXT: 'Multi Text',
};

export default function SectionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const sectionId = params.id as string;

  const { data: section, isLoading } = useSection(sectionId);
  const { data: questionsData } = useQuestions({ status: 'active', limit: 100 });
  const updateSection = useUpdateSection();
  const addQuestion = useAddQuestionToSection();
  const removeQuestion = useRemoveQuestionFromSection();
  const reorderQuestions = useReorderSectionQuestions();

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [questionToRemove, setQuestionToRemove] = useState<{ id: string; text: string } | null>(null);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [isAddingQuestions, setIsAddingQuestions] = useState(false);

  const availableQuestions = questionsData?.items.filter(
    (q) => !section?.questions.some((sq) => sq.questionId === q.id)
  ) || [];

  const filteredQuestions = availableQuestions.filter(
    (q) =>
      q.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.category?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleStartEdit = () => {
    if (section) {
      setEditName(section.name);
      setEditDescription(section.description || '');
      setIsEditing(true);
    }
  };

  const handleSaveEdit = async () => {
    if (!editName.trim()) return;
    try {
      await updateSection.mutateAsync({
        id: sectionId,
        data: {
          name: editName.trim(),
          description: editDescription.trim() || null,
        },
      });
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to update section:', error);
    }
  };

  const handleAddSelectedQuestions = async () => {
    if (selectedQuestionIds.length === 0) return;
    setIsAddingQuestions(true);
    try {
      for (const questionId of selectedQuestionIds) {
        await addQuestion.mutateAsync({ sectionId, questionId });
      }
      setSelectedQuestionIds([]);
      setShowAddDialog(false);
    } catch (error) {
      console.error('Failed to add questions:', error);
    } finally {
      setIsAddingQuestions(false);
    }
  };

  const toggleQuestionSelection = (questionId: string) => {
    setSelectedQuestionIds((prev) =>
      prev.includes(questionId)
        ? prev.filter((id) => id !== questionId)
        : [...prev, questionId]
    );
  };

  const handleRemoveQuestion = async () => {
    if (!questionToRemove) return;
    try {
      await removeQuestion.mutateAsync({ sectionId, questionId: questionToRemove.id });
      setQuestionToRemove(null);
    } catch (error) {
      console.error('Failed to remove question:', error);
    }
  };

  const handleMoveQuestion = async (index: number, direction: 'up' | 'down') => {
    if (!section) return;
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= section.questions.length) return;

    const newOrder = [...section.questions];
    [newOrder[index], newOrder[newIndex]] = [newOrder[newIndex], newOrder[index]];
    const questionIds = newOrder.map((q) => q.questionId);

    try {
      await reorderQuestions.mutateAsync({ sectionId, questionIds });
    } catch (error) {
      console.error('Failed to reorder questions:', error);
    }
  };

  if (isLoading) {
    return (
      <RequireAuth allowedRoles={['PLATFORM_ADMIN', 'CLIENT_ADMIN']}>
        <div className="p-6">Loading...</div>
      </RequireAuth>
    );
  }

  if (!section) {
    return (
      <RequireAuth allowedRoles={['PLATFORM_ADMIN', 'CLIENT_ADMIN']}>
        <div className="p-6">
          <div className="text-center py-12">
            <h2 className="text-xl font-semibold">Section not found</h2>
            <Button className="mt-4" onClick={() => router.push('/admin/sections')}>
              Back to Sections
            </Button>
          </div>
        </div>
      </RequireAuth>
    );
  }

  return (
    <RequireAuth allowedRoles={['PLATFORM_ADMIN', 'CLIENT_ADMIN']}>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/admin/sections">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Link>
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Section Info */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                {section.isCore && <Lock className="w-4 h-4 text-muted-foreground" />}
                <CardTitle>{isEditing ? 'Edit Section' : section.name}</CardTitle>
                {section.isCore && <Badge variant="secondary">Core</Badge>}
              </div>
              <CardDescription>
                {isEditing ? 'Update section details' : section.description || 'No description'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isEditing ? (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Name</label>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Description</label>
                    <Textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      rows={3}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setIsEditing(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleSaveEdit} disabled={updateSection.isPending}>
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="text-sm">
                    <span className="text-muted-foreground">Questions:</span>{' '}
                    <span className="font-medium">{section.questions.length}</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Used in:</span>{' '}
                    <span className="font-medium">{section._count.templateSections} template(s)</span>
                  </div>
                  <Button variant="outline" onClick={handleStartEdit}>
                    Edit Details
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Questions List */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Questions</CardTitle>
                <Button size="sm" onClick={() => setShowAddDialog(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Question
                </Button>
              </div>
              <CardDescription>
                Drag to reorder questions within this section
              </CardDescription>
            </CardHeader>
            <CardContent>
              {section.questions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No questions in this section. Add questions from the Question Bank.
                </div>
              ) : (
                <div className="space-y-2">
                  {section.questions.map((sq, index) => (
                    <div
                      key={sq.id}
                      className="flex items-center gap-3 p-3 border rounded-lg bg-background"
                    >
                      <div className="flex flex-col gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          disabled={index === 0}
                          onClick={() => handleMoveQuestion(index, 'up')}
                        >
                          <GripVertical className="w-4 h-4 rotate-90" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          disabled={index === section.questions.length - 1}
                          onClick={() => handleMoveQuestion(index, 'down')}
                        >
                          <GripVertical className="w-4 h-4 -rotate-90" />
                        </Button>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm line-clamp-2">{sq.question.text}</p>
                        <div className="flex gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">
                            {typeLabels[sq.question.type] || sq.question.type}
                          </Badge>
                          {sq.question.isRequired && (
                            <Badge variant="secondary" className="text-xs">
                              Required
                            </Badge>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setQuestionToRemove({ id: sq.questionId, text: sq.question.text })
                        }
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Add Question Dialog */}
        <Dialog open={showAddDialog} onOpenChange={(open) => {
          setShowAddDialog(open);
          if (!open) setSelectedQuestionIds([]);
        }}>
          <DialogContent className="max-w-2xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle>Add Questions to Section</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Search questions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <Button variant="outline" size="icon">
                  <Search className="w-4 h-4" />
                </Button>
              </div>
              <div className="max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Select</TableHead>
                      <TableHead>Question</TableHead>
                      <TableHead>Type</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredQuestions.map((q) => (
                      <TableRow
                        key={q.id}
                        className={selectedQuestionIds.includes(q.id) ? 'bg-muted/50' : ''}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selectedQuestionIds.includes(q.id)}
                            onCheckedChange={() => toggleQuestionSelection(q.id)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="line-clamp-2 text-sm">{q.text}</div>
                          {q.category && (
                            <span className="text-xs text-muted-foreground">{q.category}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{typeLabels[q.type] || q.type}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredQuestions.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                          {searchQuery
                            ? 'No matching questions found'
                            : 'All available questions have been added'}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              <div className="flex justify-between items-center pt-2 border-t">
                <span className="text-sm text-muted-foreground">
                  {selectedQuestionIds.length} question{selectedQuestionIds.length !== 1 ? 's' : ''} selected
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleAddSelectedQuestions}
                    disabled={selectedQuestionIds.length === 0 || isAddingQuestions}
                  >
                    {isAddingQuestions ? 'Adding...' : `Add ${selectedQuestionIds.length > 0 ? selectedQuestionIds.length : ''} Question${selectedQuestionIds.length !== 1 ? 's' : ''}`}
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Remove Question Confirmation */}
        <AlertDialog open={!!questionToRemove} onOpenChange={() => setQuestionToRemove(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove Question</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to remove this question from the section?
                <div className="mt-2 p-2 bg-muted rounded text-sm">
                  {questionToRemove?.text}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleRemoveQuestion}>Remove</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </RequireAuth>
  );
}
