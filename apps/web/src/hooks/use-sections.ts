import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { CreateSectionInput, UpdateSectionInput } from '@kol360/shared';

interface Question {
  id: string;
  text: string;
  type: string;
  category: string | null;
  isRequired: boolean;
}

interface SectionQuestion {
  id: string;
  questionId: string;
  sortOrder: number;
  question: Question;
}

interface Section {
  id: string;
  name: string;
  description: string | null;
  isCore: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  questions: SectionQuestion[];
  _count: {
    templateSections: number;
  };
}

export function useSections() {
  return useQuery({
    queryKey: ['sections'],
    queryFn: () => apiClient.get<Section[]>('/api/v1/sections'),
  });
}

export function useSection(id: string) {
  return useQuery({
    queryKey: ['sections', id],
    queryFn: () => apiClient.get<Section>(`/api/v1/sections/${id}`),
    enabled: !!id,
  });
}

export function useCreateSection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateSectionInput) =>
      apiClient.post<Section>('/api/v1/sections', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sections'] });
    },
  });
}

export function useUpdateSection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateSectionInput }) =>
      apiClient.put<Section>(`/api/v1/sections/${id}`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['sections'] });
      queryClient.invalidateQueries({ queryKey: ['sections', variables.id] });
    },
  });
}

export function useDeleteSection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/v1/sections/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sections'] });
    },
  });
}

export function useAddQuestionToSection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sectionId, questionId }: { sectionId: string; questionId: string }) =>
      apiClient.post<SectionQuestion>(`/api/v1/sections/${sectionId}/questions`, { questionId }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['sections', variables.sectionId] });
    },
  });
}

export function useRemoveQuestionFromSection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sectionId, questionId }: { sectionId: string; questionId: string }) =>
      apiClient.delete(`/api/v1/sections/${sectionId}/questions/${questionId}`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['sections', variables.sectionId] });
    },
  });
}

export function useReorderSectionQuestions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sectionId, questionIds }: { sectionId: string; questionIds: string[] }) =>
      apiClient.put(`/api/v1/sections/${sectionId}/questions/reorder`, { questionIds }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['sections', variables.sectionId] });
    },
  });
}
