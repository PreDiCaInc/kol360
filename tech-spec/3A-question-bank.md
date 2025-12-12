# Module 3A: Question Bank

## Objective
Build question management with CRUD, categorization, and tagging for survey questions.

## Prerequisites
- Module 2A completed

---

## API Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/v1/questions` | List questions with filters | Admin |
| GET | `/api/v1/questions/:id` | Get question details | Admin |
| POST | `/api/v1/questions` | Create question | Admin |
| PUT | `/api/v1/questions/:id` | Update question | Admin |
| POST | `/api/v1/questions/:id/archive` | Archive question | Admin |
| POST | `/api/v1/questions/:id/restore` | Restore archived | Admin |

---

## Schemas

`packages/shared/src/schemas/question.ts`:

```typescript
import { z } from 'zod';

export const questionTypeSchema = z.enum([
  'TEXT',
  'NUMBER', 
  'RATING',
  'SINGLE_CHOICE',
  'MULTI_CHOICE',
  'DROPDOWN',
  'MULTI_TEXT',
]);

export const createQuestionSchema = z.object({
  text: z.string().min(10).max(500),
  type: questionTypeSchema,
  category: z.string().max(50).optional(),
  isRequired: z.boolean().default(false),
  options: z.array(z.string()).optional(), // For choice questions
  tags: z.array(z.string()).default([]),
}).refine(
  (data) => {
    // Choice questions must have options
    if (['SINGLE_CHOICE', 'MULTI_CHOICE', 'DROPDOWN'].includes(data.type)) {
      return data.options && data.options.length >= 2;
    }
    return true;
  },
  { message: 'Choice questions require at least 2 options' }
);

export const updateQuestionSchema = createQuestionSchema.partial();

export type QuestionType = z.infer<typeof questionTypeSchema>;
export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;
export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;
```

---

## Backend Implementation

### Service

`apps/api/src/services/question.service.ts`:

```typescript
import { prisma } from '../lib/prisma';
import { CreateQuestionInput, UpdateQuestionInput } from '@kol360/shared';

interface ListParams {
  category?: string;
  type?: string;
  tags?: string[];
  status?: string;
  search?: string;
  page: number;
  limit: number;
}

export class QuestionService {
  async list(params: ListParams) {
    const { category, type, tags, status, search, page, limit } = params;

    const where: any = {};
    
    if (category) where.category = category;
    if (type) where.type = type;
    if (status) where.status = status;
    if (tags?.length) where.tags = { hasSome: tags };
    if (search) {
      where.text = { contains: search, mode: 'insensitive' };
    }

    const [total, items] = await Promise.all([
      prisma.question.count({ where }),
      prisma.question.findMany({
        where,
        orderBy: [{ category: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async getById(id: string) {
    return prisma.question.findUnique({
      where: { id },
      include: {
        sectionQuestions: {
          include: { section: true },
        },
        _count: {
          select: { surveyQuestions: true },
        },
      },
    });
  }

  async create(data: CreateQuestionInput) {
    return prisma.question.create({
      data: {
        text: data.text,
        type: data.type,
        category: data.category,
        isRequired: data.isRequired,
        options: data.options,
        tags: data.tags,
        status: 'active',
      },
    });
  }

  async update(id: string, data: UpdateQuestionInput) {
    // Check if question is used in active campaigns
    const usageCount = await prisma.surveyQuestion.count({
      where: {
        questionId: id,
        campaign: { status: { in: ['ACTIVE'] } },
      },
    });

    if (usageCount > 0 && data.text) {
      throw new Error('Cannot modify text of question used in active campaigns');
    }

    return prisma.question.update({
      where: { id },
      data,
    });
  }

  async archive(id: string) {
    return prisma.question.update({
      where: { id },
      data: { status: 'archived' },
    });
  }

  async restore(id: string) {
    return prisma.question.update({
      where: { id },
      data: { status: 'active' },
    });
  }

  async getCategories() {
    const categories = await prisma.question.groupBy({
      by: ['category'],
      where: { category: { not: null } },
      _count: true,
    });
    return categories.map((c) => ({ name: c.category, count: c._count }));
  }

  async getTags() {
    const questions = await prisma.question.findMany({
      where: { tags: { isEmpty: false } },
      select: { tags: true },
    });
    
    const tagCounts: Record<string, number> = {};
    questions.forEach((q) => {
      q.tags.forEach((tag) => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });
    
    return Object.entries(tagCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }
}
```

### Routes

`apps/api/src/routes/questions.ts`:

```typescript
import { FastifyPluginAsync } from 'fastify';
import { createQuestionSchema, updateQuestionSchema } from '@kol360/shared';
import { requireClientAdmin } from '../middleware/rbac';
import { QuestionService } from '../services/question.service';

const questionService = new QuestionService();

export const questionRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', requireClientAdmin());

  // List questions
  fastify.get('/', async (request) => {
    const { category, type, tags, status, search, page, limit } = request.query as any;
    return questionService.list({
      category,
      type,
      tags: tags ? tags.split(',') : undefined,
      status: status || 'active',
      search,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
    });
  });

  // Get categories
  fastify.get('/categories', async () => {
    return questionService.getCategories();
  });

  // Get tags
  fastify.get('/tags', async () => {
    return questionService.getTags();
  });

  // Get question by ID
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const question = await questionService.getById(request.params.id);
    if (!question) {
      return reply.status(404).send({ error: 'Not Found' });
    }
    return question;
  });

  // Create question
  fastify.post('/', async (request, reply) => {
    const data = createQuestionSchema.parse(request.body);
    const question = await questionService.create(data);

    await fastify.prisma.auditLog.create({
      data: {
        userId: request.user!.sub,
        action: 'question.created',
        entityType: 'Question',
        entityId: question.id,
        newValues: data,
      },
    });

    return reply.status(201).send(question);
  });

  // Update question
  fastify.put<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const data = updateQuestionSchema.parse(request.body);
    
    try {
      const question = await questionService.update(request.params.id, data);
      return question;
    } catch (error: any) {
      if (error.message.includes('active campaigns')) {
        return reply.status(409).send({ 
          error: 'Conflict', 
          message: error.message 
        });
      }
      throw error;
    }
  });

  // Archive question
  fastify.post<{ Params: { id: string } }>('/:id/archive', async (request) => {
    return questionService.archive(request.params.id);
  });

  // Restore question
  fastify.post<{ Params: { id: string } }>('/:id/restore', async (request) => {
    return questionService.restore(request.params.id);
  });
};
```

---

## Frontend Implementation

### Question List Page

`apps/web/src/app/admin/questions/page.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
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
import { QuestionFormDialog } from '@/components/questions/question-form-dialog';
import { Plus, Pencil, Archive } from 'lucide-react';

const typeLabels: Record<string, string> = {
  TEXT: 'Text',
  NUMBER: 'Number',
  RATING: 'Rating',
  SINGLE_CHOICE: 'Single Choice',
  MULTI_CHOICE: 'Multi Choice',
  DROPDOWN: 'Dropdown',
  MULTI_TEXT: 'Multi Text (Nominations)',
};

export default function QuestionsPage() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const { data: questions, isLoading } = useQuery({
    queryKey: ['questions', { search, category: categoryFilter, type: typeFilter }],
    queryFn: () =>
      apiClient.get<{ items: any[] }>('/api/v1/questions', {
        search: search || undefined,
        category: categoryFilter || undefined,
        type: typeFilter || undefined,
      }),
  });

  const { data: categories } = useQuery({
    queryKey: ['question-categories'],
    queryFn: () => apiClient.get<{ name: string; count: number }[]>('/api/v1/questions/categories'),
  });

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
        <div className="flex gap-4 mb-4">
          <Input
            placeholder="Search questions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All categories</SelectItem>
              {categories?.map((cat) => (
                <SelectItem key={cat.name} value={cat.name!}>
                  {cat.name} ({cat.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All types</SelectItem>
              {Object.entries(typeLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        {isLoading ? (
          <div>Loading...</div>
        ) : (
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
              {questions?.items.map((q) => (
                <TableRow key={q.id}>
                  <TableCell>
                    <div className="line-clamp-2">{q.text}</div>
                    {q.tags?.length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {q.tags.map((tag: string) => (
                          <Badge key={tag} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{typeLabels[q.type]}</Badge>
                  </TableCell>
                  <TableCell>{q.category || '—'}</TableCell>
                  <TableCell>{q.isRequired ? 'Yes' : 'No'}</TableCell>
                  <TableCell>{q.usageCount}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setEditingQuestion(q.id)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
```

### Question Form Dialog

`apps/web/src/components/questions/question-form-dialog.tsx`:

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createQuestionSchema, CreateQuestionInput } from '@kol360/shared';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, X } from 'lucide-react';

const questionTypes = [
  { value: 'TEXT', label: 'Text', hasOptions: false },
  { value: 'NUMBER', label: 'Number', hasOptions: false },
  { value: 'RATING', label: 'Rating (1-5)', hasOptions: false },
  { value: 'SINGLE_CHOICE', label: 'Single Choice', hasOptions: true },
  { value: 'MULTI_CHOICE', label: 'Multi Choice', hasOptions: true },
  { value: 'DROPDOWN', label: 'Dropdown', hasOptions: true },
  { value: 'MULTI_TEXT', label: 'Multi Text (Nominations)', hasOptions: false },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  questionId?: string;
}

export function QuestionFormDialog({ open, onOpenChange, questionId }: Props) {
  const queryClient = useQueryClient();
  const isEdit = !!questionId;

  const { data: question } = useQuery({
    queryKey: ['questions', questionId],
    queryFn: () => apiClient.get<any>(`/api/v1/questions/${questionId}`),
    enabled: !!questionId,
  });

  const form = useForm<CreateQuestionInput>({
    resolver: zodResolver(createQuestionSchema),
    defaultValues: {
      text: '',
      type: 'TEXT',
      category: '',
      isRequired: false,
      options: [],
      tags: [],
    },
  });

  const selectedType = form.watch('type');
  const needsOptions = ['SINGLE_CHOICE', 'MULTI_CHOICE', 'DROPDOWN'].includes(selectedType);

  useEffect(() => {
    if (question) {
      form.reset({
        text: question.text,
        type: question.type,
        category: question.category || '',
        isRequired: question.isRequired,
        options: question.options || [],
        tags: question.tags || [],
      });
    }
  }, [question, form]);

  const createMutation = useMutation({
    mutationFn: (data: CreateQuestionInput) =>
      apiClient.post('/api/v1/questions', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['questions'] });
      onOpenChange(false);
      form.reset();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: CreateQuestionInput) =>
      apiClient.put(`/api/v1/questions/${questionId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['questions'] });
      onOpenChange(false);
    },
  });

  function onSubmit(data: CreateQuestionInput) {
    if (isEdit) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  }

  const [options, setOptions] = useState<string[]>(['', '']);

  useEffect(() => {
    if (question?.options) {
      setOptions(question.options);
    }
  }, [question]);

  function addOption() {
    setOptions([...options, '']);
  }

  function removeOption(index: number) {
    setOptions(options.filter((_, i) => i !== index));
  }

  function updateOption(index: number, value: string) {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
    form.setValue('options', newOptions.filter(Boolean));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Question' : 'Add Question'}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="text"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Question Text</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Enter the question text..."
                      rows={3}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Question Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {questionTypes.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g., Demographics" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {needsOptions && (
              <div className="space-y-2">
                <FormLabel>Options</FormLabel>
                {options.map((option, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      value={option}
                      onChange={(e) => updateOption(index, e.target.value)}
                      placeholder={`Option ${index + 1}`}
                    />
                    {options.length > 2 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeOption(index)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={addOption}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Option
                </Button>
              </div>
            )}

            <FormField
              control={form.control}
              name="isRequired"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <FormLabel className="!mt-0">Required question</FormLabel>
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {isEdit ? 'Update' : 'Create'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
```

---

## Question Types Reference

| Type | Description | Input Component | Options |
|------|-------------|-----------------|---------|
| TEXT | Free text | Textarea | - |
| NUMBER | Numeric | Number input | - |
| RATING | 1-5 scale | Star rating | - |
| SINGLE_CHOICE | One selection | Radio buttons | Required |
| MULTI_CHOICE | Multiple selections | Checkboxes | Required |
| DROPDOWN | One from list | Select dropdown | Required |
| MULTI_TEXT | Multiple text entries | Dynamic text fields | Max 10 |

---

## Acceptance Criteria

- [ ] List questions with search and filters
- [ ] Create questions of all types
- [ ] Choice questions require 2+ options
- [ ] Update questions (blocked if in active campaign)
- [ ] Archive/restore questions
- [ ] View question usage count
- [ ] Categories auto-populated from existing
- [ ] Tags support

---

## Next Module
→ `3B-survey-builder.md` - Section and survey template management
