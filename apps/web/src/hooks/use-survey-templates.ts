import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { CreateSurveyTemplateInput, UpdateSurveyTemplateInput } from '@kol360/shared';

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
  questions: SectionQuestion[];
}

interface TemplateSection {
  id: string;
  sectionId: string;
  sortOrder: number;
  isLocked: boolean;
  section: Section;
}

interface SurveyTemplate {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  sections: TemplateSection[];
  _count: {
    campaigns: number;
  };
}

export function useSurveyTemplates() {
  return useQuery({
    queryKey: ['survey-templates'],
    queryFn: () => apiClient.get<SurveyTemplate[]>('/api/v1/survey-templates'),
  });
}

export function useSurveyTemplate(id: string) {
  return useQuery({
    queryKey: ['survey-templates', id],
    queryFn: () => apiClient.get<SurveyTemplate>(`/api/v1/survey-templates/${id}`),
    enabled: !!id,
  });
}

export function useCreateSurveyTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateSurveyTemplateInput) =>
      apiClient.post<SurveyTemplate>('/api/v1/survey-templates', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['survey-templates'] });
    },
  });
}

export function useUpdateSurveyTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateSurveyTemplateInput }) =>
      apiClient.put<SurveyTemplate>(`/api/v1/survey-templates/${id}`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['survey-templates'] });
      queryClient.invalidateQueries({ queryKey: ['survey-templates', variables.id] });
    },
  });
}

export function useDeleteSurveyTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/v1/survey-templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['survey-templates'] });
    },
  });
}

export function useCloneSurveyTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      apiClient.post<SurveyTemplate>(`/api/v1/survey-templates/${id}/clone`, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['survey-templates'] });
    },
  });
}

export function useAddSectionToTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      templateId,
      sectionId,
      isLocked = false,
    }: {
      templateId: string;
      sectionId: string;
      isLocked?: boolean;
    }) =>
      apiClient.post<TemplateSection>(`/api/v1/survey-templates/${templateId}/sections`, {
        sectionId,
        isLocked,
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['survey-templates', variables.templateId] });
    },
  });
}

export function useRemoveSectionFromTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ templateId, sectionId }: { templateId: string; sectionId: string }) =>
      apiClient.delete(`/api/v1/survey-templates/${templateId}/sections/${sectionId}`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['survey-templates', variables.templateId] });
    },
  });
}

export function useReorderTemplateSections() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ templateId, sectionIds }: { templateId: string; sectionIds: string[] }) =>
      apiClient.put(`/api/v1/survey-templates/${templateId}/sections/reorder`, { sectionIds }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['survey-templates', variables.templateId] });
    },
  });
}
