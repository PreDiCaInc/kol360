import { z } from 'zod';
import { nominationTypeSchema } from './question';

// Re-export nomination types for convenience
export const NOMINATION_TYPES = nominationTypeSchema.options;

// Influencer types for KOL classification
export const INFLUENCER_TYPES = [
  'National Leaders',
  'Rising Stars',
  'Regional Influencers',
] as const;

export type InfluencerType = (typeof INFLUENCER_TYPES)[number];

// Score field names mapping to HcpDiseaseAreaScore
export const SCORE_FIELDS = {
  scorePublications: 'Peer-Reviewed Publication Score',
  scoreTradePubs: 'Trade Publication Score',
  scoreOrgLeadership: 'Organizational Leadership Score',
  scoreOrgAwards: 'Organizational Awards Score',
  scoreClinicalTrials: 'Clinical Trial Score',
  scoreConference: 'Conference Educator Score',
  scoreSocialMedia: 'Social Media Score',
  scoreMediaPodcasts: 'Media (Podcasts/Blogs) Score',
  scoreSurvey: 'Sociometric Survey Score',
  compositeScore: 'Total Weighted Score',
} as const;

export type ScoreField = keyof typeof SCORE_FIELDS;

// Base filter schema for insights queries
// Use z.coerce for all numeric fields since URL query params are strings
export const insightsFilterSchema = z.object({
  // Score range filters (0-100)
  scorePublicationsMin: z.coerce.number().min(0).max(100).optional(),
  scorePublicationsMax: z.coerce.number().min(0).max(100).optional(),
  scoreTradePubsMin: z.coerce.number().min(0).max(100).optional(),
  scoreTradePubsMax: z.coerce.number().min(0).max(100).optional(),
  scoreOrgLeadershipMin: z.coerce.number().min(0).max(100).optional(),
  scoreOrgLeadershipMax: z.coerce.number().min(0).max(100).optional(),
  scoreOrgAwardsMin: z.coerce.number().min(0).max(100).optional(),
  scoreOrgAwardsMax: z.coerce.number().min(0).max(100).optional(),
  scoreClinicalTrialsMin: z.coerce.number().min(0).max(100).optional(),
  scoreClinicalTrialsMax: z.coerce.number().min(0).max(100).optional(),
  scoreConferenceMin: z.coerce.number().min(0).max(100).optional(),
  scoreConferenceMax: z.coerce.number().min(0).max(100).optional(),
  scoreSocialMediaMin: z.coerce.number().min(0).max(100).optional(),
  scoreSocialMediaMax: z.coerce.number().min(0).max(100).optional(),
  scoreMediaPodcastsMin: z.coerce.number().min(0).max(100).optional(),
  scoreMediaPodcastsMax: z.coerce.number().min(0).max(100).optional(),
  scoreSurveyMin: z.coerce.number().min(0).max(100).optional(),
  scoreSurveyMax: z.coerce.number().min(0).max(100).optional(),
  compositeScoreMin: z.coerce.number().min(0).max(100).optional(),
  compositeScoreMax: z.coerce.number().min(0).max(100).optional(),

  // Categorical filters - support both single string and comma-separated for arrays
  influencerTypes: z.string().optional().transform(v => v ? v.split(',').filter(Boolean) : undefined),
  specialties: z.string().optional().transform(v => v ? v.split(',').filter(Boolean) : undefined),
  states: z.string().optional().transform(v => v ? v.split(',').filter(Boolean) : undefined),
  // Keep single values for backwards compatibility
  influencerType: z.enum(INFLUENCER_TYPES).optional(),
  specialty: z.string().optional(),
  state: z.string().optional(),

  // Search
  search: z.string().optional(),

  // Pagination - use coerce for URL query params which are strings
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(5000).default(25),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// Output type (after transform) - used by API service
export type InsightsFilter = z.infer<typeof insightsFilterSchema>;

// Input type (before transform) - used by frontend hooks
export type InsightsFilterInput = z.input<typeof insightsFilterSchema>;

// Leader ranking query schema
export const leaderRankingQuerySchema = z.object({
  nominationType: nominationTypeSchema,
  // Single value filters (backwards compat)
  state: z.string().optional(),
  specialty: z.string().optional(),
  // Multi-value filters (comma-separated, transformed to arrays)
  states: z.string().optional().transform(v => v ? v.split(',').filter(Boolean) : undefined),
  specialties: z.string().optional().transform(v => v ? v.split(',').filter(Boolean) : undefined),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(5000).default(100),
});

// Output type (after transform) - used by API service
export type LeaderRankingQuery = z.infer<typeof leaderRankingQuerySchema>;

// Input type (before transform) - used by frontend hooks
export type LeaderRankingQueryInput = z.input<typeof leaderRankingQuerySchema>;

// KOL Profile query schema
export const kolProfileQuerySchema = z.object({
  hcpId: z.string().cuid(),
});

export type KolProfileQuery = z.infer<typeof kolProfileQuerySchema>;

// Response types

// Summary stats response
export const insightsSummarySchema = z.object({
  totalKols: z.number(),
  totalRespondents: z.number(),
  totalNominations: z.number(),
  totalCampaigns: z.number(),
  averageCompositeScore: z.number().nullable(),
  // true when no KolAnalysis exists for the (client, disease area).
  // The dashboard shell uses this to render the "not configured" empty
  // state and skip the tabs. Drives the whole dashboard's gating.
  notConfigured: z.boolean().optional(),
});

export type InsightsSummary = z.infer<typeof insightsSummarySchema>;

// KOL Explorer item
export const kolExplorerItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  specialty: z.string().nullable(),
  degree: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  influencerType: z.string().nullable(),
  // All 9 scores + composite
  scorePublications: z.number().nullable(),
  scoreTradePubs: z.number().nullable(),
  scoreOrgLeadership: z.number().nullable(),
  scoreOrgAwards: z.number().nullable(),
  scoreClinicalTrials: z.number().nullable(),
  scoreConference: z.number().nullable(),
  scoreSocialMedia: z.number().nullable(),
  scoreMediaPodcasts: z.number().nullable(),
  scoreSurvey: z.number().nullable(),
  compositeScore: z.number().nullable(),
});

export type KolExplorerItem = z.infer<typeof kolExplorerItemSchema>;

// KOL Explorer response
export const kolExplorerResponseSchema = z.object({
  items: z.array(kolExplorerItemSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  totalPages: z.number(),
});

export type KolExplorerResponse = z.infer<typeof kolExplorerResponseSchema>;

// Leader ranking item
export const leaderRankingItemSchema = z.object({
  rank: z.number(),
  hcpId: z.string(),
  name: z.string(),
  degree: z.string().nullable(),
  specialty: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  count: z.number(),
  influencerType: z.string().nullable(),
});

export type LeaderRankingItem = z.infer<typeof leaderRankingItemSchema>;

// Leader rankings response
export const leaderRankingsResponseSchema = z.object({
  nominationType: nominationTypeSchema,
  items: z.array(leaderRankingItemSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  totalPages: z.number(),
});

export type LeaderRankingsResponse = z.infer<typeof leaderRankingsResponseSchema>;

// KOL Profile response
export const kolProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  npi: z.string().nullable(),
  specialty: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  influencerType: z.string().nullable(),

  // 9 scores
  scores: z.object({
    scorePublications: z.number().nullable(),
    scoreTradePubs: z.number().nullable(),
    scoreOrgLeadership: z.number().nullable(),
    scoreOrgAwards: z.number().nullable(),
    scoreClinicalTrials: z.number().nullable(),
    scoreConference: z.number().nullable(),
    scoreSocialMedia: z.number().nullable(),
    scoreMediaPodcasts: z.number().nullable(),
    scoreSurvey: z.number().nullable(),
    compositeScore: z.number().nullable(),
  }),

  // 8 nomination counts
  nominations: z.object({
    discussionLeaders: z.number(),
    referralLeaders: z.number(),
    adviceLeaders: z.number(),
    nationalLeader: z.number(),
    risingStar: z.number(),
    socialLeader: z.number(),
    biasedLeader: z.number(),
    total: z.number(),
  }),

  // Regional count (sum of all nominations where nominator is from same region)
  regionalCount: z.number(),
});

export type KolProfile = z.infer<typeof kolProfileSchema>;

// Sociometric summary item (master table)
export const sociometricSummaryItemSchema = z.object({
  rank: z.number(),
  hcpId: z.string(),
  name: z.string(),
  specialty: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  influencerType: z.string().nullable(),
  // Nomination counts by type
  discussionLeaders: z.number(),
  referralLeaders: z.number(),
  adviceLeaders: z.number(),
  nationalLeaders: z.number(),
  risingStars: z.number(),
  socialLeaders: z.number(),
  regional: z.number(),
  biasedLeaders: z.number(),
  total: z.number(),
});

export type SociometricSummaryItem = z.infer<typeof sociometricSummaryItemSchema>;

// Sociometric summary response
export const sociometricSummaryResponseSchema = z.object({
  items: z.array(sociometricSummaryItemSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  totalPages: z.number(),
});

export type SociometricSummaryResponse = z.infer<typeof sociometricSummaryResponseSchema>;

// Nominator item (who nominated a specific KOL)
export const nominatorItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  specialty: z.string().nullable(),
  state: z.string().nullable(),
  nominationType: nominationTypeSchema,
  campaignName: z.string(),
  respondedAt: z.string(), // ISO date
});

export type NominatorItem = z.infer<typeof nominatorItemSchema>;

// Nominator demographics (aggregated for charts)
export const nominatorDemographicsSchema = z.object({
  bySpecialty: z.array(
    z.object({
      name: z.string(),
      count: z.number(),
    })
  ),
  byState: z.array(
    z.object({
      name: z.string(),
      count: z.number(),
    })
  ),
  byNominationType: z.array(
    z.object({
      name: z.string(),
      count: z.number(),
    })
  ),
});

export type NominatorDemographics = z.infer<typeof nominatorDemographicsSchema>;

// Extended KOL Profile with nominator data
export const kolProfileWithNominatorsSchema = kolProfileSchema.extend({
  nominators: z.array(nominatorItemSchema),
  nominatorDemographics: nominatorDemographicsSchema,
});

export type KolProfileWithNominators = z.infer<typeof kolProfileWithNominatorsSchema>;

// Respondent Analytics schemas

// Distribution item for charts
export const distributionItemSchema = z.object({
  name: z.string(),
  count: z.number(),
  percentage: z.number(),
});

export type DistributionItem = z.infer<typeof distributionItemSchema>;
