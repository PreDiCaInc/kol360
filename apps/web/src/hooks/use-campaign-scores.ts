import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

interface HcpSummary {
  id: string;
  npi: string;
  firstName: string;
  lastName: string;
  specialty: string | null;
  city: string | null;
  state: string | null;
}

interface CampaignScore {
  id: string;
  hcpId: string;
  campaignId: string;
  // Per-nomination-type scores
  scoreNationalKol: string | null;
  countNationalKol: number;
  scoreRisingStar: string | null;
  countRisingStar: number;
  scoreRegionalExpert: string | null;
  countRegionalExpert: number;
  scoreDigitalInfluencer: string | null;
  countDigitalInfluencer: number;
  scoreClinicalExpert: string | null;
  countClinicalExpert: number;
  // Consolidated score
  scoreSurvey: string | null;
  nominationCount: number;
  compositeScore: string | null;
  calculatedAt: string | null;
  publishedAt: string | null;
  hcp: HcpSummary;
  // Allow dynamic field access
  [key: string]: unknown;
}

interface CampaignScoresResponse {
  items: CampaignScore[];
  maxNominations: number;
  nominationTypes: string[];
  total: number;
}

interface ScoreCalculationStatus {
  totalNominations: number;
  matchedNominations: number;
  unmatchedNominations: number;
  hcpScoresCalculated: number;
  compositeScoresCalculated: number;
  readyToPublish: boolean;
}

interface CalculateSurveyScoresResult {
  processed: number;
  updated: number;
}

export function useCampaignScores(campaignId: string) {
  return useQuery({
    queryKey: ['campaigns', campaignId, 'scores'],
    queryFn: () =>
      apiClient.get<CampaignScoresResponse>(`/api/v1/campaigns/${campaignId}/scores`),
    enabled: !!campaignId,
  });
}

export function useScoreCalculationStatus(campaignId: string) {
  return useQuery({
    queryKey: ['campaigns', campaignId, 'scores', 'status'],
    queryFn: () =>
      apiClient.get<ScoreCalculationStatus>(`/api/v1/campaigns/${campaignId}/scores/status`),
    enabled: !!campaignId,
  });
}

export function useCalculateSurveyScores() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (campaignId: string) =>
      apiClient.post<CalculateSurveyScoresResult>(
        `/api/v1/campaigns/${campaignId}/scores/calculate-survey`,
        {}
      ),
    onSuccess: (_, campaignId) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns', campaignId, 'scores'] });
    },
  });
}

interface CalculateAllScoresResult {
  surveyScores: { processed: number; updated: number };
  compositeScores: { processed: number; updated: number };
}

export function useCalculateAllScores() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (campaignId: string) =>
      apiClient.post<CalculateAllScoresResult>(
        `/api/v1/campaigns/${campaignId}/scores/calculate-all`,
        {}
      ),
    onSuccess: (_, campaignId) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns', campaignId, 'scores'] });
    },
  });
}
