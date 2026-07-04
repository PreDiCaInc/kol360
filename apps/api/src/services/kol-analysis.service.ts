import { prisma } from '../lib/prisma';
import { NominationType, Prisma } from '@prisma/client';
import {
  DEFAULT_ANALYSIS_WEIGHTS,
  type AnalysisWeights,
  SURVEY_INCLUDED_NOMINATION_TYPES,
} from '@kol360/shared';

// v1.17.40 — types that contribute to scoreSurvey. Shared with the
// frontend tooltip via @kol360/shared/score-methodology so the formula
// and the in-product explainer are anchored to the same list.
// Matches Sun Pharma's published "Total Sociometric Weighted Score"
// methodology — see
// docs/findings/score-survey-formula-match-customer-2026-06-14.md.
const SURVEY_INCLUDED_TYPES: ReadonlySet<NominationType> = new Set(
  SURVEY_INCLUDED_NOMINATION_TYPES as readonly NominationType[]
);

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

// One respondent (survey-taker) deduped across campaigns within an analysis.
export interface DedupEntry {
  respondentHcpId: string;
  keptResponseId: string;
  keptCampaignId: string;
  keptRecencyAt: string;
  dropped: Array<{
    responseId: string;
    campaignId: string;
    recencyAt: string;
    nominationsDropped: number;
  }>;
}

// Output of the single shared pooling computation, consumed by the
// recalc (writes) and the read-only dedup-report / explain endpoints.
interface PooledResult {
  typesInPool: NominationType[];
  weights: AnalysisWeights;
  scoreRows: Array<Record<string, unknown>>;
  maxPerType: Map<string, number>; // nomination type (or '__legacy__') → pooled max count
  objectiveByHcp: Map<string, Record<string, unknown>>;
  dedup: DedupEntry[];
}

export class KolAnalysisService {
  /**
   * Shared pooling computation — the single source of truth for analysis
   * scores. Pools MATCHED/NEW_HCP nominations across the included campaigns,
   * dedups respondents to their most-recent survey, normalizes each
   * nomination type ONCE against the pooled max, then composites with live
   * objective scores. Pure read (no writes) so the recalc and the
   * explain/dedup-report endpoints can never drift apart.
   */
  private async computePooled(input: {
    diseaseAreaId: string;
    weightsJson: Prisma.JsonValue;
    includedCampaignIds: string[];
  }): Promise<PooledResult> {
    const { diseaseAreaId, weightsJson, includedCampaignIds } = input;
    const weights = parseWeights(weightsJson);

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
          select: {
            id: true,
            campaignId: true,
            completedAt: true,
            createdAt: true,
            respondentHcpId: true,
            respondentHcp: { select: { email: true } },
          },
        },
      },
    });

    // Respondent dedup: within an analysis a respondent (survey-taker) must
    // count once. If the same HCP submitted the survey in >1 included
    // campaign, keep only their MOST RECENT response (completedAt, fallback
    // createdAt) and drop nominations from older responses — otherwise their
    // nominations would be double-counted in the pooled score.
    const recency = (r: { completedAt: Date | null; createdAt: Date }) =>
      (r.completedAt ?? r.createdAt).getTime();
    const bestResponseByRespondent = new Map<string, { responseId: string; key: number }>();
    // Per respondent → per response: campaign, recency, eligible nomination count.
    const respResponses = new Map<
      string,
      Map<string, { campaignId: string; key: number; count: number }>
    >();
    for (const n of nominations) {
      const respId = n.response.respondentHcpId;
      const key = recency(n.response);
      const cur = bestResponseByRespondent.get(respId);
      if (
        !cur ||
        key > cur.key ||
        (key === cur.key && n.response.id > cur.responseId)
      ) {
        bestResponseByRespondent.set(respId, { responseId: n.response.id, key });
      }
      if (!respResponses.has(respId)) respResponses.set(respId, new Map());
      const byResp = respResponses.get(respId)!;
      if (!byResp.has(n.response.id)) {
        byResp.set(n.response.id, {
          campaignId: n.response.campaignId,
          key,
          count: 0,
        });
      }
      byResp.get(n.response.id)!.count++;
    }

    // Build the dedup report: respondents with >1 response in the included
    // set. Kept = most-recent; dropped = the rest (with their nom counts).
    const dedup: DedupEntry[] = [];
    for (const [respId, byResp] of respResponses) {
      if (byResp.size < 2) continue;
      const best = bestResponseByRespondent.get(respId)!;
      const dropped: DedupEntry['dropped'] = [];
      for (const [responseId, info] of byResp) {
        if (responseId === best.responseId) continue;
        dropped.push({
          responseId,
          campaignId: info.campaignId,
          recencyAt: new Date(info.key).toISOString(),
          nominationsDropped: info.count,
        });
      }
      if (dropped.length === 0) continue;
      const keptInfo = byResp.get(best.responseId)!;
      dedup.push({
        respondentHcpId: respId,
        keptResponseId: best.responseId,
        keptCampaignId: keptInfo.campaignId,
        keptRecencyAt: new Date(best.key).toISOString(),
        dropped,
      });
    }

    // Apply internal-email exclusion + respondent dedup.
    const pooled = nominations.filter((n) => {
      if (!n.matchedHcpId) return false;
      if (internalExcludedCampaigns.has(n.response.campaignId)) {
        const email = n.response.respondentHcp?.email ?? '';
        if (email.toLowerCase().endsWith('@bio-exec.com')) return false;
      }
      const best = bestResponseByRespondent.get(n.response.respondentHcpId);
      if (!best || best.responseId !== n.response.id) return false;
      return true;
    });

    // ---- Pooled aggregation ----
    let scoreRows: Array<Record<string, unknown>>;
    const maxPerType = new Map<string, number>();
    const hcpIds = new Set<string>();

    if (typesInPool.length > 0) {
      const hcpTypeCount = new Map<string, Map<NominationType, number>>();
      for (const n of pooled) {
        const t = n.question.nominationType;
        if (!t || !n.matchedHcpId) continue;
        if (!hcpTypeCount.has(n.matchedHcpId)) hcpTypeCount.set(n.matchedHcpId, new Map());
        const tc = hcpTypeCount.get(n.matchedHcpId)!;
        const next = (tc.get(t) || 0) + 1;
        tc.set(t, next);
        if (next > (maxPerType.get(t) || 0)) maxPerType.set(t, next);
      }

      // v1.17.40 — scoreSurvey switched from "avg of per-type-normalized
      // scores across all 7 types" to "sum of nominations across the 4
      // counted types ÷ max-such-sum × 100". Matches Sun Pharma's
      // published formula to the 2nd decimal across 2,301 HCPs. Per-type
      // score columns (scoreNationalLeader, etc.) keep their existing
      // max-normalized formula — the Sociometric Summary matrix display
      // is unchanged. Only the aggregate scoreSurvey value changes.
      //
      // Pass 1: per-HCP sum across the counted types, and the global
      // max-such-sum (the leaderboard anchor).
      const surveyTypeSumByHcp = new Map<string, number>();
      let maxSurveyTypeSum = 0;
      for (const [hcpId, typeCounts] of hcpTypeCount) {
        let surveySum = 0;
        for (const [t, count] of typeCounts) {
          if (SURVEY_INCLUDED_TYPES.has(t)) surveySum += count;
        }
        surveyTypeSumByHcp.set(hcpId, surveySum);
        if (surveySum > maxSurveyTypeSum) maxSurveyTypeSum = surveySum;
      }

      // Pass 2: write rows. Per-type fields keep max-per-type
      // normalization; scoreSurvey uses the new sum-and-normalize.
      scoreRows = [];
      for (const [hcpId, typeCounts] of hcpTypeCount) {
        hcpIds.add(hcpId);
        const row: Record<string, unknown> = { hcpId };
        let total = 0;
        for (const t of typesInPool) {
          const count = typeCounts.get(t) || 0;
          const maxCount = maxPerType.get(t) || 1;
          const f = NOMINATION_TYPE_FIELDS[t];
          row[f.count] = count;
          total += count;
          row[f.score] = count > 0 ? (count / maxCount) * 100 : null;
        }
        row.nominationCount = total;
        const surveySum = surveyTypeSumByHcp.get(hcpId) || 0;
        row.scoreSurvey =
          maxSurveyTypeSum > 0 ? (surveySum / maxSurveyTypeSum) * 100 : null;
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
      maxPerType.set('__legacy__', maxCount);
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
    // v1.17.56 — pteam request: include EVERY HCP with seg scores in
    // the DA, even if they don't appear in any included campaign's
    // nominations. Rationale: "make the dataset consistent — if we have
    // segment data on a KOL, they should show up on WTD with their
    // segment-driven composite, regardless of survey activity."
    //
    // Implementation: query all `HcpDiseaseAreaScore(da, isCurrent)`
    // (was: filter by hcpId IN the nominated set), then synthesize
    // empty score rows for HCPs that have seg scores but aren't yet
    // in `scoreRows`. The composite loop below covers them naturally
    // — survey contributes 0 (no survey signal), objective fields
    // contribute their seg scores × weights.
    const daScores = await prisma.hcpDiseaseAreaScore.findMany({
      where: { diseaseAreaId, isCurrent: true },
    });
    const daByHcp = new Map(daScores.map((d) => [d.hcpId, d as Record<string, unknown>]));

    // v1.17.56 — synthesize rows for seg-only HCPs. All nomination
    // fields default to null/0 via the createMany `?? null` /  `?? 0`
    // mapping at the persistence step. nominationCount = 0. scoreSurvey
    // remains undefined → null on persist → reads as 0 in the composite
    // calc below (consistent with the existing null-handling logic).
    for (const da of daScores) {
      if (hcpIds.has(da.hcpId)) continue;
      hcpIds.add(da.hcpId);
      scoreRows.push({ hcpId: da.hcpId, nominationCount: 0 });
    }

    for (const row of scoreRows) {
      const hcpId = row.hcpId as string;
      const da = daByHcp.get(hcpId);
      const surveyScore = row.scoreSurvey == null ? 0 : Number(row.scoreSurvey);
      let composite = surveyScore * (toNum(weights.weightSurvey) / 100);
      for (const { field, weight } of OBJECTIVE_WEIGHT_MAP) {
        const objVal = da ? toNum(da[field]) : 0; // null/missing → 0
        composite += objVal * (toNum(weights[weight]) / 100);
      }
      row.compositeScore = composite;
    }

    return { typesInPool, weights, scoreRows, maxPerType, objectiveByHcp: daByHcp, dedup };
  }

  /**
   * Recompute and persist scores for an analysis.
   *
   * Pools nominations across INCLUDED campaigns, dedups respondents to their
   * most-recent survey, normalizes each type ONCE against the pooled max
   * (fixes the old per-campaign-then-average bug — Eric 5/100 + 55/90).
   * Objective scores are read LIVE from HcpDiseaseAreaScore.
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

      const { scoreRows } = await this.computePooled({
        diseaseAreaId: analysis.diseaseAreaId,
        weightsJson: analysis.weightsJson,
        includedCampaignIds,
      });

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

  /**
   * Read-only: which respondents were deduped across campaigns (kept vs
   * dropped). Recomputes from the same pooling logic — no writes — so it
   * always reflects what recalc would do. Enriched with HCP + campaign names.
   */
  async getDedupReport(analysisId: string) {
    const analysis = await prisma.kolAnalysis.findUnique({
      where: { id: analysisId },
      // v1.17.69 — pull client.defaultCountry so we can country-scope
      // the HCP query below. Analysis lives under a Client which has
      // one country regime; every HCP in a well-formed analysis
      // shares it. Filter defensively at read time so cross-country
      // drift can't leak into the dedup report.
      include: { campaigns: true, client: { select: { defaultCountry: true } } },
    });
    if (!analysis) throw new Error('Analysis not found');
    const country = analysis.client?.defaultCountry === 'CA' ? 'CA' : 'US';

    const includedCampaignIds = analysis.campaigns
      .filter((c) => c.included)
      .map((c) => c.campaignId);
    if (includedCampaignIds.length === 0) return { items: [] };

    const { dedup } = await this.computePooled({
      diseaseAreaId: analysis.diseaseAreaId,
      weightsJson: analysis.weightsJson,
      includedCampaignIds,
    });
    if (dedup.length === 0) return { items: [] };

    const hcpIds = dedup.map((d) => d.respondentHcpId);
    const campaignIds = [
      ...new Set(
        dedup.flatMap((d) => [d.keptCampaignId, ...d.dropped.map((x) => x.campaignId)])
      ),
    ];
    const [hcps, campaigns] = await Promise.all([
      prisma.hcp.findMany({
        where: { id: { in: hcpIds }, country },
        select: { id: true, firstName: true, lastName: true, npi: true, nationalIdType: true },
      }),
      prisma.campaign.findMany({
        where: { id: { in: campaignIds } },
        select: { id: true, name: true },
      }),
    ]);
    const hcpById = new Map(hcps.map((h) => [h.id, h]));
    const campById = new Map(campaigns.map((c) => [c.id, c.name]));

    return {
      items: dedup.map((d) => {
        const h = hcpById.get(d.respondentHcpId);
        return {
          respondentHcpId: d.respondentHcpId,
          respondentName: h ? `${h.firstName} ${h.lastName}` : 'Unknown',
          respondentNpi: h?.npi ?? null,
          kept: {
            campaignId: d.keptCampaignId,
            campaignName: campById.get(d.keptCampaignId) ?? 'Unknown',
            respondedAt: d.keptRecencyAt,
          },
          dropped: d.dropped.map((x) => ({
            campaignId: x.campaignId,
            campaignName: campById.get(x.campaignId) ?? 'Unknown',
            respondedAt: x.recencyAt,
            nominationsDropped: x.nominationsDropped,
          })),
        };
      }),
    };
  }

  /**
   * Read-only: full calc breakdown for one HCP in an analysis — per-type
   * count vs pooled max → normalized score, survey mean, objective values +
   * weights → composite arithmetic, cross-checked against the stored row.
   * The admin troubleshooting view.
   */
  async explainHcp(analysisId: string, hcpId: string) {
    const analysis = await prisma.kolAnalysis.findUnique({
      where: { id: analysisId },
      // v1.17.69 — country regime pulled from the analysis's client
      // so the HCP lookup below rejects cross-country deep-links.
      include: { campaigns: true, client: { select: { defaultCountry: true } } },
    });
    if (!analysis) throw new Error('Analysis not found');
    const country = analysis.client?.defaultCountry === 'CA' ? 'CA' : 'US';

    const includedCampaignIds = analysis.campaigns
      .filter((c) => c.included)
      .map((c) => c.campaignId);
    if (includedCampaignIds.length === 0) {
      return { found: false as const, reason: 'No included campaigns' };
    }

    const { typesInPool, weights, scoreRows, maxPerType, objectiveByHcp } =
      await this.computePooled({
        diseaseAreaId: analysis.diseaseAreaId,
        weightsJson: analysis.weightsJson,
        includedCampaignIds,
      });

    const row = scoreRows.find((r) => r.hcpId === hcpId);
    const hcp = await prisma.hcp.findUnique({
      where: { id: hcpId },
      select: { id: true, firstName: true, lastName: true, npi: true, nationalIdType: true, country: true },
    });
    // v1.17.69 — reject cross-country lookup as HCP-not-found.
    if (hcp && hcp.country !== country) {
      return {
        found: false as const,
        reason: 'HCP is not in this analysis\'s country regime',
        hcp: null,
      };
    }
    if (!row) {
      return {
        found: false as const,
        reason: 'HCP has no nominations in the included campaigns',
        hcp: hcp
          ? { id: hcp.id, name: `${hcp.firstName} ${hcp.lastName}`, npi: hcp.npi }
          : null,
      };
    }

    // Per-type breakdown: count, pooled max (the denominator), normalized score.
    const perType = typesInPool.map((t) => {
      const f = NOMINATION_TYPE_FIELDS[t];
      const count = (row[f.count] as number) ?? 0;
      const pooledMax = maxPerType.get(t) ?? 0;
      const score = (row[f.score] as number | null) ?? null;
      return {
        nominationType: t,
        count,
        pooledMax,
        formula: pooledMax > 0 ? `${count} / ${pooledMax} × 100` : 'n/a',
        score,
      };
    });

    const presentScores = perType
      .map((p) => p.score)
      .filter((s): s is number => s != null);
    const surveyScore = (row.scoreSurvey as number | null) ?? null;

    const da = objectiveByHcp.get(hcpId);
    const objective = OBJECTIVE_WEIGHT_MAP.map(({ field, weight }) => {
      const value = da ? toNum(da[field]) : 0;
      const w = toNum(weights[weight]);
      return {
        field,
        value,
        weight: w,
        contribution: (value * w) / 100,
        hasData: !!da && da[field] != null,
      };
    });
    const surveyContribution =
      (surveyScore ?? 0) * (toNum(weights.weightSurvey) / 100);
    const compositeComputed =
      objective.reduce((s, o) => s + o.contribution, 0) + surveyContribution;

    const stored = await prisma.hcpAnalysisScore.findUnique({
      where: { analysisId_hcpId: { analysisId, hcpId } },
    });

    return {
      found: true as const,
      hcp: hcp
        ? { id: hcp.id, name: `${hcp.firstName} ${hcp.lastName}`, npi: hcp.npi }
        : { id: hcpId, name: 'Unknown', npi: null },
      survey: {
        perType,
        meanOfPresentTypeScores:
          presentScores.length > 0
            ? presentScores.reduce((a, b) => a + b, 0) / presentScores.length
            : null,
        scoreSurvey: surveyScore,
        nominationCount: (row.nominationCount as number) ?? 0,
      },
      composite: {
        objective,
        surveyWeight: toNum(weights.weightSurvey),
        surveyContribution,
        computed: compositeComputed,
      },
      // Cross-check: recomputed vs the value persisted at last recalc.
      stored: stored
        ? {
            scoreSurvey: stored.scoreSurvey != null ? Number(stored.scoreSurvey) : null,
            compositeScore:
              stored.compositeScore != null ? Number(stored.compositeScore) : null,
            calculatedAt: stored.calculatedAt,
          }
        : null,
      inSyncWithStored:
        !!stored &&
        stored.compositeScore != null &&
        Math.abs(Number(stored.compositeScore) - compositeComputed) < 0.01,
    };
  }
}

export const kolAnalysisService = new KolAnalysisService();
