import { z } from 'zod';

export const scoreConfigSchema = z.object({
  weightPublications: z.number().min(0).max(100),
  weightClinicalTrials: z.number().min(0).max(100),
  weightTradePubs: z.number().min(0).max(100),
  weightOrgLeadership: z.number().min(0).max(100),
  weightOrgAwareness: z.number().min(0).max(100),
  weightConference: z.number().min(0).max(100),
  weightSocialMedia: z.number().min(0).max(100),
  weightMediaPodcasts: z.number().min(0).max(100),
  weightSurvey: z.number().min(0).max(100),
}).refine(
  (data) => {
    const sum = Object.values(data).reduce((a, b) => a + b, 0);
    return Math.abs(sum - 100) < 0.01; // Allow floating point tolerance
  },
  { message: 'Weights must sum to 100%' }
);

export const updateScoreConfigSchema = scoreConfigSchema;

export type ScoreConfigInput = z.infer<typeof scoreConfigSchema>;

export const DEFAULT_SCORE_WEIGHTS: ScoreConfigInput = {
  weightPublications: 10,
  weightClinicalTrials: 15,
  weightTradePubs: 10,
  weightOrgLeadership: 10,
  weightOrgAwareness: 10,
  weightConference: 10,
  weightSocialMedia: 5,
  weightMediaPodcasts: 5,
  weightSurvey: 25,
};
