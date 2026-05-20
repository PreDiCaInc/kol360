import { z } from 'zod';

// A KolAnalysis owns its weighting (decision: per-analysis weights).
// 9-component schema (8 objective + 1 survey); must sum to 100%.
// (Used to be re-exported from score-config.ts; inlined here when campaign-
// level scoring was torn down in Phase 3 PR A — the schema is now owned by
// the analysis layer, not by campaigns.)
export const analysisWeightsSchema = z
  .object({
    weightPublications: z.number().min(0).max(100),
    weightClinicalTrials: z.number().min(0).max(100),
    weightTradePubs: z.number().min(0).max(100),
    weightOrgLeadership: z.number().min(0).max(100),
    weightOrgAwards: z.number().min(0).max(100),
    weightConference: z.number().min(0).max(100),
    weightSocialMedia: z.number().min(0).max(100),
    weightMediaPodcasts: z.number().min(0).max(100),
    weightSurvey: z.number().min(0).max(100),
  })
  .refine(
    (data) => {
      const sum = Object.values(data).reduce((a, b) => a + b, 0);
      return Math.abs(sum - 100) < 0.01; // floating-point tolerance
    },
    { message: 'Weights must sum to 100%' }
  );
export type AnalysisWeights = z.infer<typeof analysisWeightsSchema>;

export const DEFAULT_ANALYSIS_WEIGHTS: AnalysisWeights = {
  weightPublications: 10,
  weightClinicalTrials: 15,
  weightTradePubs: 10,
  weightOrgLeadership: 10,
  weightOrgAwards: 10,
  weightConference: 10,
  weightSocialMedia: 5,
  weightMediaPodcasts: 5,
  weightSurvey: 25,
};

export const updateAnalysisCampaignsSchema = z.object({
  // Full desired set of (campaignId -> included). Replaces the current set.
  campaigns: z
    .array(
      z.object({
        campaignId: z.string().cuid(),
        included: z.boolean(),
      })
    )
    .min(1),
});
export type UpdateAnalysisCampaignsInput = z.infer<typeof updateAnalysisCampaignsSchema>;

export const updateAnalysisSchema = z.object({
  name: z.string().min(1).optional(),
  weights: analysisWeightsSchema.optional(),
});
export type UpdateAnalysisInput = z.infer<typeof updateAnalysisSchema>;

// Create an analysis for a (client, disease area) — works even when the
// client runs no campaigns of its own (e.g. lite clients). Campaigns are
// added afterward via the curation picker (same disease area only).
export const createAnalysisSchema = z.object({
  clientId: z.string().cuid(),
  diseaseAreaId: z.string().cuid(),
  name: z.string().min(1),
});
export type CreateAnalysisInput = z.infer<typeof createAnalysisSchema>;

export type AnalysisCalcStatus = 'idle' | 'running' | 'done' | 'error';
