import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { CreateQuestionInput, UpdateQuestionInput } from '@kol360/shared';

interface QuestionOption {
  text: string;
  requiresText: boolean;
}

interface Question {
  id: string;
  text: string;
  type: string;
  category: string | null;
  isRequired: boolean;
  options: QuestionOption[] | null;
  tags: string[];
  status: string;
  usageCount: number;
  minEntries: number | null;
  defaultEntries: number | null;
  nominationType: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: {
    sectionQuestions: number;
    surveyQuestions: number;
  };
}

interface QuestionDetail extends Question {
  sectionQuestions: {
    section: { id: string; name: string };
  }[];
  _count: {
    sectionQuestions: number;
    surveyQuestions: number;
  };
}

interface QuestionsListResponse {
  items: Question[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

interface QuestionsQuery {
  search?: string;
  category?: string;
  type?: string;
  tags?: string;
  status?: string;
  page?: number;
  limit?: number;
}

interface CategoryCount {
  name: string | null;
  count: number;
}

interface TagCount {
  name: string;
  count: number;
}

export function useQuestions(query: QuestionsQuery = {}) {
  const { page = 1, limit = 50, ...filters } = query;

  return useQuery({
    queryKey: ['questions', { page, limit, ...filters }],
    queryFn: () =>
      apiClient.get<QuestionsListResponse>('/api/v1/questions', {
        page,
        limit,
        ...filters,
      }),
  });
}

export function useQuestion(id: string) {
  return useQuery({
    queryKey: ['questions', id],
    queryFn: () => apiClient.get<QuestionDetail>(`/api/v1/questions/${id}`),
    enabled: !!id,
  });
}

export function useQuestionCategories() {
  return useQuery({
    queryKey: ['questions', 'categories'],
    queryFn: () => apiClient.get<CategoryCount[]>('/api/v1/questions/categories'),
  });
}

export function useQuestionTags() {
  return useQuery({
    queryKey: ['questions', 'tags'],
    queryFn: () => apiClient.get<TagCount[]>('/api/v1/questions/tags'),
  });
}

export function useCreateQuestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateQuestionInput) =>
      apiClient.post<Question>('/api/v1/questions', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['questions'] });
    },
  });
}

export function useUpdateQuestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateQuestionInput }) =>
      apiClient.put<Question>(`/api/v1/questions/${id}`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['questions'] });
      queryClient.invalidateQueries({ queryKey: ['questions', variables.id] });
    },
  });
}

export function useArchiveQuestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<Question>(`/api/v1/questions/${id}/archive`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['questions'] });
    },
  });
}

export function useRestoreQuestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<Question>(`/api/v1/questions/${id}/restore`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['questions'] });
    },
  });
}
