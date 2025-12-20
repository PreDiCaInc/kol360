'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  useSurveyTemplate,
  useUpdateSurveyTemplate,
  useAddSectionToTemplate,
  useRemoveSectionFromTemplate,
  useReorderTemplateSections,
} from '@/hooks/use-survey-templates';
import { useSections } from '@/hooks/use-sections';
import { RequireAuth } from '@/components/auth/require-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  ArrowLeft,
  Plus,
  Trash2,
  GripVertical,
  Lock,
  Search,
  ChevronUp,
  ChevronDown,
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

export default function SurveyTemplateDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const templateId = params.id as string;

  const { data: template, isLoading } = useSurveyTemplate(templateId);
  const { data: sections } = useSections();
  const updateTemplate = useUpdateSurveyTemplate();
  const addSection = useAddSectionToTemplate();
  const removeSection = useRemoveSectionFromTemplate();
  const reorderSections = useReorderTemplateSections();

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSectionIds, setSelectedSectionIds] = useState<string[]>([]);
  const [isLocked, setIsLocked] = useState(false);
  const [sectionToRemove, setSectionToRemove] = useState<{ id: string; name: string } | null>(null);
  const [isAddingSections, setIsAddingSections] = useState(false);

  // Check for edit=true query param
  useEffect(() => {
    if (searchParams.get('edit') === 'true' && template) {
      handleStartEdit();
    }
  }, [searchParams, template]);

  const availableSections = sections?.filter(
    (s) => !template?.sections.some((ts) => ts.sectionId === s.id)
  ) || [];

  const filteredSections = availableSections.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleStartEdit = () => {
    if (template) {
      setEditName(template.name);
      setEditDescription(template.description || '');
      setIsEditing(true);
    }
  };

  const handleSaveEdit = async () => {
    if (!editName.trim()) return;
    try {
      await updateTemplate.mutateAsync({
        id: templateId,
        data: {
          name: editName.trim(),
          description: editDescription.trim() || null,
        },
      });
      setIsEditing(false);
      // Remove edit query param
      router.replace(`/admin/survey-templates/${templateId}`);
    } catch (error) {
      console.error('Failed to update template:', error);
    }
  };

  const handleAddSelectedSections = async () => {
    if (selectedSectionIds.length === 0) return;
    setIsAddingSections(true);
    try {
      for (const sectionId of selectedSectionIds) {
        await addSection.mutateAsync({
          templateId,
          sectionId,
          isLocked,
        });
      }
      setSelectedSectionIds([]);
      setIsLocked(false);
      setShowAddDialog(false);
    } catch (error) {
      console.error('Failed to add sections:', error);
    } finally {
      setIsAddingSections(false);
    }
  };

  const toggleSectionSelection = (sectionId: string) => {
    setSelectedSectionIds((prev) =>
      prev.includes(sectionId)
        ? prev.filter((id) => id !== sectionId)
        : [...prev, sectionId]
    );
  };

  const handleRemoveSection = async () => {
    if (!sectionToRemove) return;
    try {
      await removeSection.mutateAsync({ templateId, sectionId: sectionToRemove.id });
      setSectionToRemove(null);
    } catch (error) {
      console.error('Failed to remove section:', error);
    }
  };

  const handleMoveSection = async (index: number, direction: 'up' | 'down') => {
    if (!template) return;
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= template.sections.length) return;

    const newOrder = [...template.sections];
    [newOrder[index], newOrder[newIndex]] = [newOrder[newIndex], newOrder[index]];
    const sectionIds = newOrder.map((ts) => ts.sectionId);

    try {
      await reorderSections.mutateAsync({ templateId, sectionIds });
    } catch (error) {
      console.error('Failed to reorder sections:', error);
    }
  };

  const getTotalQuestions = () => {
    if (!template) return 0;
    return template.sections.reduce((sum, ts) => sum + ts.section.questions.length, 0);
  };

  if (isLoading) {
    return (
      <RequireAuth allowedRoles={['PLATFORM_ADMIN', 'CLIENT_ADMIN']}>
        <div className="p-6">Loading...</div>
      </RequireAuth>
    );
  }

  if (!template) {
    return (
      <RequireAuth allowedRoles={['PLATFORM_ADMIN', 'CLIENT_ADMIN']}>
        <div className="p-6">
          <div className="text-center py-12">
            <h2 className="text-xl font-semibold">Template not found</h2>
            <Button className="mt-4" onClick={() => router.push('/admin/survey-templates')}>
              Back to Templates
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
            <Link href="/admin/survey-templates">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Link>
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Template Info */}
          <Card>
            <CardHeader>
              <CardTitle>{isEditing ? 'Edit Template' : template.name}</CardTitle>
              <CardDescription>
                {isEditing ? 'Update template details' : template.description || 'No description'}
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
                    <Button
                      variant="outline"
                      onClick={() => {
                        setIsEditing(false);
                        router.replace(`/admin/survey-templates/${templateId}`);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button onClick={handleSaveEdit} disabled={updateTemplate.isPending}>
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="text-sm">
                    <span className="text-muted-foreground">Sections:</span>{' '}
                    <span className="font-medium">{template.sections.length}</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Total Questions:</span>{' '}
                    <span className="font-medium">{getTotalQuestions()}</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Used in:</span>{' '}
                    <span className="font-medium">{template._count.campaigns} campaign(s)</span>
                  </div>
                  <Button variant="outline" onClick={handleStartEdit}>
                    Edit Details
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sections List */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Sections</CardTitle>
                <Button size="sm" onClick={() => setShowAddDialog(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Section
                </Button>
              </div>
              <CardDescription>
                Manage sections in this template. Reorder to change survey flow.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {template.sections.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No sections in this template. Add sections to build your survey.
                </div>
              ) : (
                <Accordion type="multiple" className="space-y-2">
                  {template.sections.map((ts, index) => (
                    <AccordionItem
                      key={ts.id}
                      value={ts.id}
                      className="border rounded-lg px-4"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            disabled={index === 0}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMoveSection(index, 'up');
                            }}
                          >
                            <ChevronUp className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            disabled={index === template.sections.length - 1}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMoveSection(index, 'down');
                            }}
                          >
                            <ChevronDown className="w-4 h-4" />
                          </Button>
                        </div>
                        <AccordionTrigger className="flex-1 hover:no-underline">
                          <div className="flex items-center gap-2">
                            <GripVertical className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium">{ts.section.name}</span>
                            {ts.section.isCore && (
                              <Badge variant="secondary" className="text-xs">Core</Badge>
                            )}
                            {ts.isLocked && (
                              <Lock className="w-3 h-3 text-muted-foreground" />
                            )}
                            <Badge variant="outline" className="ml-2">
                              {ts.section.questions.length} question{ts.section.questions.length !== 1 ? 's' : ''}
                            </Badge>
                          </div>
                        </AccordionTrigger>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSectionToRemove({ id: ts.sectionId, name: ts.section.name });
                          }}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                      <AccordionContent>
                        {ts.section.description && (
                          <p className="text-sm text-muted-foreground mb-3">
                            {ts.section.description}
                          </p>
                        )}
                        {ts.section.questions.length === 0 ? (
                          <p className="text-sm text-muted-foreground italic">
                            No questions in this section
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {ts.section.questions.map((sq, qIndex) => (
                              <div
                                key={sq.id}
                                className="flex items-start gap-2 text-sm p-2 bg-muted/50 rounded"
                              >
                                <span className="text-muted-foreground w-6">
                                  {qIndex + 1}.
                                </span>
                                <div className="flex-1">
                                  <p className="line-clamp-2">{sq.question.text}</p>
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
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="mt-3">
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/admin/sections/${ts.sectionId}`}>
                              Edit Section
                            </Link>
                          </Button>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Add Section Dialog */}
        <Dialog open={showAddDialog} onOpenChange={(open) => {
          setShowAddDialog(open);
          if (!open) {
            setSelectedSectionIds([]);
            setIsLocked(false);
          }
        }}>
          <DialogContent className="max-w-2xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle>Add Sections to Template</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Search sections..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <Button variant="outline" size="icon">
                  <Search className="w-4 h-4" />
                </Button>
              </div>
              <div className="max-h-64 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Select</TableHead>
                      <TableHead>Section</TableHead>
                      <TableHead>Questions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSections.map((s) => (
                      <TableRow
                        key={s.id}
                        className={selectedSectionIds.includes(s.id) ? 'bg-muted/50' : ''}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selectedSectionIds.includes(s.id)}
                            onCheckedChange={() => toggleSectionSelection(s.id)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {s.isCore && <Lock className="w-3 h-3 text-muted-foreground" />}
                            <div>
                              <div className="font-medium">{s.name}</div>
                              {s.description && (
                                <div className="text-xs text-muted-foreground line-clamp-1">
                                  {s.description}
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{s.questions.length}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredSections.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                          {searchQuery
                            ? 'No matching sections found'
                            : 'All available sections have been added'}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              {selectedSectionIds.length > 0 && (
                <div className="flex items-center gap-2 p-3 bg-muted rounded">
                  <Checkbox
                    id="isLocked"
                    checked={isLocked}
                    onCheckedChange={(checked) => setIsLocked(checked === true)}
                  />
                  <label htmlFor="isLocked" className="text-sm">
                    Lock selected sections (clients cannot remove them from their surveys)
                  </label>
                </div>
              )}
              <div className="flex justify-between items-center pt-2 border-t">
                <span className="text-sm text-muted-foreground">
                  {selectedSectionIds.length} section{selectedSectionIds.length !== 1 ? 's' : ''} selected
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleAddSelectedSections}
                    disabled={selectedSectionIds.length === 0 || isAddingSections}
                  >
                    {isAddingSections ? 'Adding...' : `Add ${selectedSectionIds.length > 0 ? selectedSectionIds.length : ''} Section${selectedSectionIds.length !== 1 ? 's' : ''}`}
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Remove Section Confirmation */}
        <AlertDialog open={!!sectionToRemove} onOpenChange={() => setSectionToRemove(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove Section</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to remove &quot;{sectionToRemove?.name}&quot; from this template?
                The section itself will not be deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleRemoveSection}>Remove</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </RequireAuth>
  );
}
