import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

interface DiseaseArea {
  id: string;
  therapeuticArea: string;
  name: string;
  code: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export function useDiseaseAreas() {
  return useQuery({
    queryKey: ['disease-areas'],
    queryFn: () => apiClient.get<{ items: DiseaseArea[] }>('/api/v1/disease-areas'),
  });
}

export function useDiseaseArea(id: string) {
  return useQuery({
    queryKey: ['disease-areas', id],
    queryFn: () => apiClient.get<DiseaseArea>(`/api/v1/disease-areas/${id}`),
    enabled: !!id,
  });
}
