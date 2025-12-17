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
import { Plus, Pencil, Archive, RotateCcw, MoreHorizontal, Search, ChevronLeft, ChevronRight } from 'lucide-react';

const typeLabels: Record<string, string> = {
  TEXT: 'Text',
  NUMBER: 'Number',
  RATING: 'Rating',
  SINGLE_CHOICE: 'Single Choice',
  MULTI_CHOICE: 'Multi Choice',
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

  return (
    <RequireAuth allowedRoles={['PLATFORM_ADMIN', 'CLIENT_ADMIN']}>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Question Bank</h1>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Question
          </Button>
        </div>

        {/* Filters */}
        <div className="flex gap-4 mb-6">
          <div className="flex-1 flex gap-2">
            <Input
              placeholder="Search questions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyPress}
              className="max-w-md"
            />
            <Button variant="outline" onClick={handleSearch}>
              <Search className="w-4 h-4" />
            </Button>
          </div>

          <Select
            value={filters.category || 'all'}
            onValueChange={(value) =>
              setFilters((prev) => ({
                ...prev,
                category: value === 'all' ? undefined : value,
                page: 1,
              }))
            }
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories?.map((cat) => (
                <SelectItem key={cat.name || 'uncategorized'} value={cat.name || ''}>
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
            <SelectTrigger className="w-48">
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
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        {isLoading ? (
          <div>Loading...</div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-1/2">Question</TableHead>
                  <TableHead>Type</TableHead>
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
                    <TableCell>{q.category || '—'}</TableCell>
                    <TableCell>{q.isRequired ? 'Yes' : 'No'}</TableCell>
                    <TableCell>{q.usageCount}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
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
                {questions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No questions found. Create your first question to get started.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {/* Pagination */}
            {pagination && pagination.pages > 1 && (
              <div className="flex justify-between items-center mt-4">
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
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-sm">
                    Page {pagination.page} of {pagination.pages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pagination.page >= pagination.pages}
                    onClick={() => setFilters((prev) => ({ ...prev, page: prev.page + 1 }))}
                  >
                    <ChevronRight className="w-4 h-4" />
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
