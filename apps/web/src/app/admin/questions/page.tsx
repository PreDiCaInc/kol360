'use client';

import { useState } from 'react';
import {
  useQuestions,
  useQuestionCategories,
  useArchiveQuestion,
  useRestoreQuestion,
} from '@/hooks/use-questions';
import { RequireAuth } from '@/components/auth/require-auth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { QuestionFormDialog } from '@/components/questions/question-form-dialog';
import { Plus, Pencil, Archive, RotateCcw, MoreHorizontal, Search, ChevronLeft, ChevronRight, MessageSquare, Layers, Tag } from 'lucide-react';
import { NOMINATION_TYPE_LABELS, NominationType } from '@kol360/shared';

const typeLabels: Record<string, string> = {
  TEXT: 'Text',
  NUMBER: 'Number',
  RATING: 'Rating',
  SINGLE_CHOICE: 'Radio',
  MULTI_CHOICE: 'Multi',
  DROPDOWN: 'Dropdown',
  MULTI_TEXT: 'Multi Text',
};

const typeBadgeVariants: Record<string, 'default' | 'secondary' | 'outline'> = {
  TEXT: 'outline',
  NUMBER: 'outline',
  RATING: 'secondary',
  SINGLE_CHOICE: 'default',
  MULTI_CHOICE: 'default',
  DROPDOWN: 'default',
  MULTI_TEXT: 'secondary',
};

export default function QuestionsPage() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<{
    search?: string;
    category?: string;
    type?: string;
    status: string;
    page: number;
  }>({ status: 'active', page: 1 });

  const { data, isLoading } = useQuestions({
    ...filters,
    search: filters.search,
  });
  const { data: categories } = useQuestionCategories();
  const archiveQuestion = useArchiveQuestion();
  const restoreQuestion = useRestoreQuestion();

  const questions = data?.items || [];
  const pagination = data?.pagination;

  const handleSearch = () => {
    setFilters((prev) => ({ ...prev, search: searchQuery, page: 1 }));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleArchive = async (id: string) => {
    try {
      await archiveQuestion.mutateAsync(id);
    } catch (error) {
      console.error('Failed to archive question:', error);
    }
  };

  const handleRestore = async (id: string) => {
    try {
      await restoreQuestion.mutateAsync(id);
    } catch (error) {
      console.error('Failed to restore question:', error);
    }
  };

  const uniqueTypes = Array.from(new Set(questions.map(q => q.type))).length;

  return (
    <RequireAuth allowedRoles={['PLATFORM_ADMIN', 'CLIENT_ADMIN']}>
      <div className="p-6 lg:p-8 fade-in">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Question Bank</h1>
            <p className="text-muted-foreground mt-1">Manage survey questions and templates</p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Question
          </Button>
        </div>

        {/* Stats Summary */}
        {!isLoading && pagination && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <div className="bg-card rounded-xl border border-border/60 p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-semibold">{pagination.total}</p>
                <p className="text-sm text-muted-foreground">Total Questions</p>
              </div>
            </div>
            <div className="bg-card rounded-xl border border-border/60 p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <Layers className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-semibold">{uniqueTypes}</p>
                <p className="text-sm text-muted-foreground">Question Types</p>
              </div>
            </div>
            <div className="bg-card rounded-xl border border-border/60 p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Tag className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-semibold">{categories?.length || 0}</p>
                <p className="text-sm text-muted-foreground">Categories</p>
              </div>
            </div>
          </div>
        )}

        {/* Search and Filters */}
        <div className="flex flex-col lg:flex-row gap-4 mb-6">
          <div className="flex-1 flex gap-2">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search questions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyPress}
                className="pl-9"
              />
            </div>
            <Button variant="outline" onClick={handleSearch} className="shrink-0">
              Search
            </Button>
          </div>

          <div className="flex flex-wrap gap-3">
            <Select
              value={filters.category || 'all'}
              onValueChange={(value) =>
                setFilters((prev) => ({
                  ...prev,
                  category: value === 'all' ? undefined : (value === 'uncategorized' ? '' : value),
                  page: 1,
                }))
              }
            >
              <SelectTrigger className="w-48 bg-card">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories?.map((cat) => (
                  <SelectItem key={cat.name || 'uncategorized'} value={cat.name || 'uncategorized'}>
                    {cat.name || 'Uncategorized'} ({cat.count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.type || 'all'}
              onValueChange={(value) =>
                setFilters((prev) => ({
                  ...prev,
                  type: value === 'all' ? undefined : value,
                  page: 1,
                }))
              }
            >
              <SelectTrigger className="w-44 bg-card">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {Object.entries(typeLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.status}
              onValueChange={(value) =>
                setFilters((prev) => ({ ...prev, status: value, page: 1 }))
              }
            >
              <SelectTrigger className="w-32 bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="bg-card rounded-xl border border-border/60 overflow-hidden">
            <div className="p-4 border-b border-border/60">
              <div className="h-4 w-24 skeleton rounded" />
            </div>
            {[...Array(8)].map((_, i) => (
              <div key={i} className="p-4 border-b border-border/40 last:border-0">
                <div className="flex items-center gap-4">
                  <div className="h-4 w-64 skeleton rounded" />
                  <div className="h-5 w-20 skeleton rounded-full" />
                  <div className="h-5 w-24 skeleton rounded-full" />
                  <div className="h-4 w-20 skeleton rounded ml-auto" />
                  <div className="h-8 w-8 skeleton rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : questions.length === 0 ? (
          <div className="bg-card rounded-xl border border-border/60 p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
              <MessageSquare className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-2">No questions found</h3>
            <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
              {filters.search || filters.category || filters.type
                ? 'Try adjusting your filters to find more questions.'
                : 'Create your first question to get started building surveys.'}
            </p>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Question
            </Button>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-1/3">Question</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Nomination Type</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Required</TableHead>
                  <TableHead>Usage</TableHead>
                  <TableHead className="w-20">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {questions.map((q) => (
                  <TableRow key={q.id}>
                    <TableCell>
                      <div className="line-clamp-2">{q.text}</div>
                      {q.tags?.length > 0 && (
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {q.tags.map((tag: string) => (
                            <Badge key={tag} variant="outline" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={typeBadgeVariants[q.type] || 'secondary'}>
                        {typeLabels[q.type] || q.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {q.nominationType ? (
                        <Badge variant="outline" className="text-xs">
                          {NOMINATION_TYPE_LABELS[q.nominationType as NominationType] || q.nominationType}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{q.category || '—'}</TableCell>
                    <TableCell>
                      <Badge variant={q.isRequired ? 'success' : 'muted'}>
                        {q.isRequired ? 'Yes' : 'No'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {(q._count?.sectionQuestions ?? 0) + (q._count?.surveyQuestions ?? 0)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditingQuestion(q.id)}>
                            <Pencil className="w-4 h-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          {q.status === 'active' ? (
                            <DropdownMenuItem
                              onClick={() => handleArchive(q.id)}
                              className="text-destructive"
                            >
                              <Archive className="w-4 h-4 mr-2" />
                              Archive
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => handleRestore(q.id)}>
                              <RotateCcw className="w-4 h-4 mr-2" />
                              Restore
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Pagination */}
            {pagination && pagination.pages > 1 && (
              <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-6 pt-4 border-t border-border/60">
                <div className="text-sm text-muted-foreground">
                  Showing {questions.length} of {pagination.total} questions
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pagination.page <= 1}
                    onClick={() => setFilters((prev) => ({ ...prev, page: prev.page - 1 }))}
                  >
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    Previous
                  </Button>
                  <span className="text-sm px-3">
                    Page {pagination.page} of {pagination.pages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pagination.page >= pagination.pages}
                    onClick={() => setFilters((prev) => ({ ...prev, page: prev.page + 1 }))}
                  >
                    Next
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        <QuestionFormDialog
          open={showCreateDialog}
          onOpenChange={setShowCreateDialog}
        />

        {editingQuestion && (
          <QuestionFormDialog
            open={true}
            onOpenChange={() => setEditingQuestion(null)}
            questionId={editingQuestion}
          />
        )}
      </div>
    </RequireAuth>
  );
}
