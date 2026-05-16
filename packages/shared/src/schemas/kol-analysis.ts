import { z } from 'zod';
import { scoreConfigSchema, DEFAULT_SCORE_WEIGHTS } from './score-config';

// A KolAnalysis owns its weighting (decision: per-analysis weights).
// Reuse the existing 9-component weight schema; it must sum to 100.
export const analysisWeightsSchema = scoreConfigSchema;
export type AnalysisWeights = z.infer<typeof analysisWeightsSchema>;

export const DEFAULT_ANALYSIS_WEIGHTS: AnalysisWeights = DEFAULT_SCORE_WEIGHTS;

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
