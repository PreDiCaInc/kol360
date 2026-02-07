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
  scoreOrgAwareness: 'Organizational Awards Score',
  scoreClinicalTrials: 'Clinical Trial Score',
  scoreConference: 'Conference Educator Score',
  scoreSocialMedia: 'Social Media Score',
  scoreMediaPodcasts: 'Media (Podcasts/Blogs) Score',
  scoreSurvey: 'Sociometric Survey Score',
  compositeScore: 'Total Weighted Score',
} as const;

export type ScoreField = keyof typeof SCORE_FIELDS;

// Base filter schema for insights queries
export const insightsFilterSchema = z.object({
  // Score range filters (0-100)
  scorePublicationsMin: z.number().min(0).max(100).optional(),
  scorePublicationsMax: z.number().min(0).max(100).optional(),
  scoreTradePubsMin: z.number().min(0).max(100).optional(),
  scoreTradePubsMax: z.number().min(0).max(100).optional(),
  scoreOrgLeadershipMin: z.number().min(0).max(100).optional(),
  scoreOrgLeadershipMax: z.number().min(0).max(100).optional(),
  scoreOrgAwarenessMin: z.number().min(0).max(100).optional(),
  scoreOrgAwarenessMax: z.number().min(0).max(100).optional(),
  scoreClinicalTrialsMin: z.number().min(0).max(100).optional(),
  scoreClinicalTrialsMax: z.number().min(0).max(100).optional(),
  scoreConferenceMin: z.number().min(0).max(100).optional(),
  scoreConferenceMax: z.number().min(0).max(100).optional(),
  scoreSocialMediaMin: z.number().min(0).max(100).optional(),
  scoreSocialMediaMax: z.number().min(0).max(100).optional(),
  scoreMediaPodcastsMin: z.number().min(0).max(100).optional(),
  scoreMediaPodcastsMax: z.number().min(0).max(100).optional(),
  scoreSurveyMin: z.number().min(0).max(100).optional(),
  scoreSurveyMax: z.number().min(0).max(100).optional(),
  compositeScoreMin: z.number().min(0).max(100).optional(),
  compositeScoreMax: z.number().min(0).max(100).optional(),

  // Categorical filters
  influencerType: z.enum(INFLUENCER_TYPES).optional(),
  specialty: z.string().optional(),
  state: z.string().optional(),

  // Search
  search: z.string().optional(),

  // Pagination
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(25),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type InsightsFilter = z.infer<typeof insightsFilterSchema>;

// Leader ranking query schema
export const leaderRankingQuerySchema = z.object({
  nominationType: nominationTypeSchema,
  state: z.string().optional(),
  specialty: z.string().optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(100),
});

export type LeaderRankingQuery = z.infer<typeof leaderRankingQuerySchema>;

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
  scoreOrgAwareness: z.number().nullable(),
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
    scoreOrgAwareness: z.number().nullable(),
    scoreClinicalTrials: z.number().nullable(),
    scoreConference: z.number().nullable(),
    scoreSocialMedia: z.number().nullable(),
    scoreMediaPodcasts: z.number().nullable(),
    scoreSurvey: z.number().nullable(),
    compositeScore: z.number().nullable(),
  }),

  // 6 nomination counts
  nominations: z.object({
    discussionLeaders: z.number(),
    referralLeaders: z.number(),
    adviceLeaders: z.number(),
    nationalLeader: z.number(),
    risingStar: z.number(),
    socialLeader: z.number(),
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
