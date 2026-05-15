import { prisma } from '../lib/prisma';
import { NominationType, Prisma } from '@prisma/client';
import { DEFAULT_ANALYSIS_WEIGHTS, type AnalysisWeights } from '@kol360/shared';

// NominationType enum → HcpAnalysisScore field names (8 types).
const NOMINATION_TYPE_FIELDS: Record<NominationType, { score: string; count: string }> = {
  DISCUSSION_LEADERS: { score: 'scoreDiscussionLeaders', count: 'countDiscussionLeaders' },
  REFERRAL_LEADERS: { score: 'scoreReferralLeaders', count: 'countReferralLeaders' },
  ADVICE_LEADERS: { score: 'scoreAdviceLeaders', count: 'countAdviceLeaders' },
  NATIONAL_LEADER: { score: 'scoreNationalLeader', count: 'countNationalLeader' },
  RISING_STAR: { score: 'scoreRisingStar', count: 'countRisingStar' },
  SOCIAL_LEADER: { score: 'scoreSocialLeader', count: 'countSocialLeader' },
  REGIONAL_LEADER: { score: 'scoreRegionalLeader', count: 'countRegionalLeader' },
  BIASED_LEADER: { score: 'scoreBiasedLeader', count: 'countBiasedLeader' },
};

// Objective score field → weight key, used for the composite.
const OBJECTIVE_WEIGHT_MAP: Array<{ field: string; weight: keyof AnalysisWeights }> = [
  { field: 'scorePublications', weight: 'weightPublications' },
  { field: 'scoreClinicalTrials', weight: 'weightClinicalTrials' },
  { field: 'scoreTradePubs', weight: 'weightTradePubs' },
  { field: 'scoreOrgLeadership', weight: 'weightOrgLeadership' },
  { field: 'scoreOrgAwards', weight: 'weightOrgAwards' },
  { field: 'scoreConference', weight: 'weightConference' },
  { field: 'scoreSocialMedia', weight: 'weightSocialMedia' },
  { field: 'scoreMediaPodcasts', weight: 'weightMediaPodcasts' },
];

const toNum = (v: unknown): number => (v == null ? 0 : Number(v));

function parseWeights(weightsJson: Prisma.JsonValue): AnalysisWeights {
  if (weightsJson && typeof weightsJson === 'object' && !Array.isArray(weightsJson)) {
    return weightsJson as unknown as AnalysisWeights;
  }
  return DEFAULT_ANALYSIS_WEIGHTS;
}

export class KolAnalysisService {
  /**
   * Recompute scores for an analysis.
   *
   * The fix vs old campaign scoring: nominations are POOLED across all
   * INCLUDED campaigns, then each nomination type is normalized ONCE against
   * the pooled max. (Old behavior normalized per-campaign then averaged the
   * percentages, which is statistically invalid — see Eric 5/100 + 55/90.)
   *
   * Objective scores are read LIVE from the current HcpDiseaseAreaScore;
   * they are not stored on HcpAnalysisScore.
   */
  async recalculateAnalysis(analysisId: string): Promise<{ processed: number }> {
    const analysis = await prisma.kolAnalysis.findUnique({
      where: { id: analysisId },
      include: { campaigns: true },
    });
    if (!analysis) throw new Error('Analysis not found');

    await prisma.kolAnalysis.update({
      where: { id: analysisId },
      data: { calcStatus: 'running', calcError: null },
    });

    try {
      const includedCampaignIds = analysis.campaigns
        .filter((c) => c.included)
        .map((c) => c.campaignId);

      if (includedCampaignIds.length === 0) {
        await prisma.$transaction([
          prisma.hcpAnalysisScore.deleteMany({ where: { analysisId } }),
          prisma.kolAnalysis.update({
            where: { id: analysisId },
            data: { calcStatus: 'done', lastCalculatedAt: new Date(), calcError: null },
          }),
        ]);
        return { processed: 0 };
      }

      // Campaigns that exclude internal (@bio-exec.com) respondents.
      const internalExcludedCampaigns = new Set(
        (
          await prisma.campaign.findMany({
            where: { id: { in: includedCampaignIds }, excludeInternalEmails: true },
            select: { id: true },
          })
        ).map((c) => c.id)
      );

      // Nomination types present across the included campaigns.
      const surveyQuestions = await prisma.surveyQuestion.findMany({
        where: { campaignId: { in: includedCampaignIds }, nominationType: { not: null } },
        select: { nominationType: true },
      });
      const typesInPool = [
        ...new Set(
          surveyQuestions
            .map((q) => q.nominationType)
            .filter((t): t is NominationType => t !== null)
        ),
      ];

      // Pull MATCHED/NEW_HCP nominations across the pooled campaign set.
      const nominations = await prisma.nomination.findMany({
        where: {
          matchStatus: { in: ['MATCHED', 'NEW_HCP'] },
          matchedHcpId: { not: null },
          response: { campaignId: { in: includedCampaignIds } },
        },
        select: {
          matchedHcpId: true,
          question: { select: { nominationType: true } },
          response: {
            select: { campaignId: true, respondentHcp: { select: { email: true } } },
          },
        },
      });

      // Apply per-campaign internal-email exclusion.
      const pooled = nominations.filter((n) => {
        if (!n.matchedHcpId) return false;
        if (internalExcludedCampaigns.has(n.response.campaignId)) {
          const email = n.response.respondentHcp?.email ?? '';
          if (email.toLowerCase().endsWith('@bio-exec.com')) return false;
        }
        return true;
      });

      const weights = parseWeights(analysis.weightsJson);

      // ---- Pooled aggregation ----
      let scoreRows: Array<Record<string, unknown>>;
      const hcpIds = new Set<string>();

      if (typesInPool.length > 0) {
        // Per-type pooled counts + single normalization against pooled max.
        const hcpTypeCount = new Map<string, Map<NominationType, number>>();
        const maxPerType = new Map<NominationType, number>();

        for (const n of pooled) {
          const t = n.question.nominationType;
          if (!t || !n.matchedHcpId) continue;
          if (!hcpTypeCount.has(n.matchedHcpId)) hcpTypeCount.set(n.matchedHcpId, new Map());
          const tc = hcpTypeCount.get(n.matchedHcpId)!;
          const next = (tc.get(t) || 0) + 1;
          tc.set(t, next);
          if (next > (maxPerType.get(t) || 0)) maxPerType.set(t, next);
        }

        scoreRows = [];
        for (const [hcpId, typeCounts] of hcpTypeCount) {
          hcpIds.add(hcpId);
          const row: Record<string, unknown> = { hcpId };
          const typeScores: number[] = [];
          let total = 0;
          for (const t of typesInPool) {
            const count = typeCounts.get(t) || 0;
            const maxCount = maxPerType.get(t) || 1;
            const f = NOMINATION_TYPE_FIELDS[t];
            row[f.count] = count;
            total += count;
            if (count > 0) {
              const s = (count / maxCount) * 100;
              row[f.score] = s;
              typeScores.push(s);
            } else {
              row[f.score] = null;
            }
          }
          row.nominationCount = total;
          row.scoreSurvey =
            typeScores.length > 0
              ? typeScores.reduce((a, b) => a + b, 0) / typeScores.length
              : null;
          scoreRows.push(row);
        }
      } else {
        // Legacy fallback: no nomination types — pool total nominations per HCP,
        // normalize once against the pooled max.
        const hcpCount = new Map<string, number>();
        for (const n of pooled) {
          if (!n.matchedHcpId) continue;
          hcpCount.set(n.matchedHcpId, (hcpCount.get(n.matchedHcpId) || 0) + 1);
        }
        const maxCount = Math.max(1, ...hcpCount.values());
        scoreRows = [];
        for (const [hcpId, count] of hcpCount) {
          hcpIds.add(hcpId);
          scoreRows.push({
            hcpId,
            nominationCount: count,
            scoreSurvey: (count / maxCount) * 100,
          });
        }
      }

      // ---- Composite: live-pull objective scores from HcpDiseaseAreaScore ----
      const daScores = await prisma.hcpDiseaseAreaScore.findMany({
        where: {
          hcpId: { in: [...hcpIds] },
          diseaseAreaId: analysis.diseaseAreaId,
          isCurrent: true,
        },
      });
      const daByHcp = new Map(daScores.map((d) => [d.hcpId, d]));

      for (const row of scoreRows) {
        const hcpId = row.hcpId as string;
        const da = daByHcp.get(hcpId) as Record<string, unknown> | undefined;
        const surveyScore = row.scoreSurvey == null ? 0 : Number(row.scoreSurvey);
        let composite = surveyScore * (toNum(weights.weightSurvey) / 100);
        for (const { field, weight } of OBJECTIVE_WEIGHT_MAP) {
          const objVal = da ? toNum(da[field]) : 0; // null/missing → 0
          composite += objVal * (toNum(weights[weight]) / 100);
        }
        row.compositeScore = composite;
      }

      // ---- Persist: replace this analysis's score rows ----
      await prisma.$transaction([
        prisma.hcpAnalysisScore.deleteMany({ where: { analysisId } }),
        ...(scoreRows.length > 0
          ? [
              prisma.hcpAnalysisScore.createMany({
                data: scoreRows.map((r) => ({
                  analysisId,
                  hcpId: r.hcpId as string,
                  scoreDiscussionLeaders: (r.scoreDiscussionLeaders as number) ?? null,
                  countDiscussionLeaders: (r.countDiscussionLeaders as number) ?? 0,
                  scoreReferralLeaders: (r.scoreReferralLeaders as number) ?? null,
                  countReferralLeaders: (r.countReferralLeaders as number) ?? 0,
                  scoreAdviceLeaders: (r.scoreAdviceLeaders as number) ?? null,
                  countAdviceLeaders: (r.countAdviceLeaders as number) ?? 0,
                  scoreNationalLeader: (r.scoreNationalLeader as number) ?? null,
                  countNationalLeader: (r.countNationalLeader as number) ?? 0,
                  scoreRisingStar: (r.scoreRisingStar as number) ?? null,
                  countRisingStar: (r.countRisingStar as number) ?? 0,
                  scoreSocialLeader: (r.scoreSocialLeader as number) ?? null,
                  countSocialLeader: (r.countSocialLeader as number) ?? 0,
                  scoreRegionalLeader: (r.scoreRegionalLeader as number) ?? null,
                  countRegionalLeader: (r.countRegionalLeader as number) ?? 0,
                  scoreBiasedLeader: (r.scoreBiasedLeader as number) ?? null,
                  countBiasedLeader: (r.countBiasedLeader as number) ?? 0,
                  scoreSurvey: (r.scoreSurvey as number) ?? null,
                  nominationCount: (r.nominationCount as number) ?? 0,
                  compositeScore: (r.compositeScore as number) ?? null,
                })),
              }),
            ]
          : []),
        prisma.kolAnalysis.update({
          where: { id: analysisId },
          data: { calcStatus: 'done', lastCalculatedAt: new Date(), calcError: null },
        }),
      ]);

      return { processed: scoreRows.length };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await prisma.kolAnalysis.update({
        where: { id: analysisId },
        data: { calcStatus: 'error', calcError: message },
      });
      throw error;
    }
  }
}

export const kolAnalysisService = new KolAnalysisService();
