import { prisma } from '../lib/prisma';

interface HcpScoreFilters {
  diseaseAreaId: string;
  search?: string;
  specialty?: string;
  state?: string;
  minCompositeScore?: number;
  maxCompositeScore?: number;
  sortBy?: 'compositeScore' | 'lastName' | 'specialty' | 'state';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

/**
 * Phase 3 PR B: lite-client repointed from HcpDiseaseAreaScore.scoreSurvey/
 * compositeScore (vestigial, dropped in this PR) to HcpAnalysisScore for the
 * per-(client, DA) KolAnalysis. Objective columns (scorePublications etc.)
 * continue to come from HcpDiseaseAreaScore — that's the canonical store
 * for external-import objective measures and is untouched by PR B.
 *
 * Behavior change customers should know: lite client now shows the
 * client-specific KOL Analysis scores (pooled-normalization + per-analysis
 * weights), not disease-area-wide aggregates from publishScores() averaging.
 * If a (client, DA) doesn't have a KolAnalysis yet, the response carries
 * `notConfigured: true` and survey/composite values are null — same shape
 * the insights dashboard uses for unconfigured analyses.
 */
async function resolveAnalysis(clientId: string, diseaseAreaId: string) {
  return prisma.kolAnalysis.findUnique({
    where: { clientId_diseaseAreaId: { clientId, diseaseAreaId } },
    select: { id: true },
  });
}

export class LiteClientService {
  /**
   * Get all disease areas assigned to a lite client
   */
  async getAssignedDiseaseAreas(clientId: string) {
    const assignments = await prisma.liteClientDiseaseArea.findMany({
      where: {
        clientId,
        isActive: true,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      include: {
        diseaseArea: true,
      },
      orderBy: {
        diseaseArea: { name: 'asc' },
      },
    });

    return assignments.map((a: typeof assignments[number]) => ({
      id: a.diseaseArea.id,
      name: a.diseaseArea.name,
      code: a.diseaseArea.code,
      therapeuticArea: a.diseaseArea.therapeuticArea,
      grantedAt: a.grantedAt,
      expiresAt: a.expiresAt,
    }));
  }

  /**
   * Check if a lite client has access to a specific disease area
   */
  async hasAccessToDiseaseArea(clientId: string, diseaseAreaId: string): Promise<boolean> {
    const access = await prisma.liteClientDiseaseArea.findFirst({
      where: {
        clientId,
        diseaseAreaId,
        isActive: true,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
    });

    return !!access;
  }

  /**
   * Get HCPs with disease area scores for lite client viewing
   */
  async getHcpScores(clientId: string, filters: HcpScoreFilters) {
    const {
      diseaseAreaId,
      search,
      specialty,
      state,
      minCompositeScore,
      maxCompositeScore,
      sortBy = 'compositeScore',
      sortOrder = 'desc',
      page = 1,
      limit = 50,
    } = filters;

    // Verify access first
    const hasAccess = await this.hasAccessToDiseaseArea(clientId, diseaseAreaId);
    if (!hasAccess) {
      throw new Error('Access denied to this disease area');
    }

    // Phase 3 PR B: repointed from HcpDiseaseAreaScore to HcpAnalysisScore for
    // survey + composite + nomination counts. Objective columns still come from
    // HcpDiseaseAreaScore (canonical objective store, untouched by PR B).
    // Driver query is now HcpAnalysisScore (per-(client, DA)); HcpDiseaseAreaScore
    // is joined in-memory by hcpId for the 8 objective columns.
    const analysis = await resolveAnalysis(clientId, diseaseAreaId);
    if (!analysis) {
      // No analysis configured for this (client, DA) yet. Same shape as
      // insights-report uses — return empty + notConfigured so the lite
      // client UI can prompt customers to contact admin.
      return {
        data: [],
        pagination: { page, limit, total: 0, totalPages: 0 },
        notConfigured: true,
      };
    }

    // Build HCP filters (applied via the hcp relation on HcpAnalysisScore)
    const hcpWhere: Record<string, unknown> = {};
    if (search) {
      hcpWhere.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { npi: { contains: search } },
      ];
    }
    if (specialty) hcpWhere.specialty = specialty;
    if (state) hcpWhere.state = state;

    // Build score filters on HcpAnalysisScore
    const scoreWhere: Record<string, unknown> = { analysisId: analysis.id };
    if (minCompositeScore !== undefined || maxCompositeScore !== undefined) {
      scoreWhere.compositeScore = {};
      if (minCompositeScore !== undefined) {
        (scoreWhere.compositeScore as Record<string, number>).gte = minCompositeScore;
      }
      if (maxCompositeScore !== undefined) {
        (scoreWhere.compositeScore as Record<string, number>).lte = maxCompositeScore;
      }
    }

    // Total count (analysis-scoped) — apply HCP filters via relation
    const totalCount = await prisma.hcpAnalysisScore.count({
      where: { ...scoreWhere, hcp: hcpWhere },
    });

    // Sort: compositeScore lives on HcpAnalysisScore now; the other 3 sort
    // keys are HCP attributes (lastName, specialty, state) — applied via the
    // hcp relation.
    const orderBy: Record<string, unknown> = sortBy === 'compositeScore'
      ? { compositeScore: sortOrder }
      : { hcp: { [sortBy]: sortOrder } };

    // Page of analysis scores with HCP attrs
    const analysisScores = await prisma.hcpAnalysisScore.findMany({
      where: { ...scoreWhere, hcp: hcpWhere },
      include: {
        hcp: {
          select: {
            id: true,
            npi: true,
            nationalIdType: true,
            firstName: true,
            lastName: true,
            specialty: true,
            subSpecialty: true,
            city: true,
            state: true,
            yearsInPractice: true,
          },
        },
      },
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    });

    // Join objective columns from HcpDiseaseAreaScore by hcpId (live pull —
    // same pattern as the analysis composite recompute itself).
    const hcpIds = analysisScores.map((s) => s.hcpId);
    const objectiveRows = hcpIds.length === 0
      ? []
      : await prisma.hcpDiseaseAreaScore.findMany({
          where: { hcpId: { in: hcpIds }, diseaseAreaId, isCurrent: true },
          select: {
            hcpId: true,
            scorePublications: true,
            scoreClinicalTrials: true,
            scoreTradePubs: true,
            scoreOrgLeadership: true,
            scoreOrgAwards: true,
            scoreConference: true,
            scoreSocialMedia: true,
            scoreMediaPodcasts: true,
          },
        });
    const objByHcp = new Map(objectiveRows.map((o) => [o.hcpId, o]));

    // Disease area name + code (single fetch, shared across all rows)
    const diseaseArea = await prisma.diseaseArea.findUnique({
      where: { id: diseaseAreaId },
      select: { id: true, name: true, code: true },
    });

    return {
      data: analysisScores.map((s) => {
        const o = objByHcp.get(s.hcpId);
        return {
          hcp: s.hcp,
          diseaseArea,
          scores: {
            publications: o?.scorePublications ? Number(o.scorePublications) : null,
            clinicalTrials: o?.scoreClinicalTrials ? Number(o.scoreClinicalTrials) : null,
            tradePubs: o?.scoreTradePubs ? Number(o.scoreTradePubs) : null,
            orgLeadership: o?.scoreOrgLeadership ? Number(o.scoreOrgLeadership) : null,
            orgAwards: o?.scoreOrgAwards ? Number(o.scoreOrgAwards) : null,
            conference: o?.scoreConference ? Number(o.scoreConference) : null,
            socialMedia: o?.scoreSocialMedia ? Number(o.scoreSocialMedia) : null,
            mediaPodcasts: o?.scoreMediaPodcasts ? Number(o.scoreMediaPodcasts) : null,
            survey: s.scoreSurvey ? Number(s.scoreSurvey) : null,
            composite: s.compositeScore ? Number(s.compositeScore) : null,
          },
          // HcpAnalysisScore has its own nominationCount (pre-summed across
          // the analysis's included campaigns) — same shape as the old
          // HcpDiseaseAreaScore.totalNominationCount field.
          nominationCount: s.nominationCount,
          lastCalculatedAt: s.calculatedAt,
        };
      }),
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    };
  }

  /**
   * Get score statistics for a disease area (for lite client dashboard)
   */
  async getDiseaseAreaStats(clientId: string, diseaseAreaId: string) {
    const hasAccess = await this.hasAccessToDiseaseArea(clientId, diseaseAreaId);
    if (!hasAccess) {
      throw new Error('Access denied to this disease area');
    }

    // Phase 3 PR B: composite + survey from HcpAnalysisScore (per-(client, DA)),
    // objective columns from HcpDiseaseAreaScore (live, canonical).
    const analysis = await resolveAnalysis(clientId, diseaseAreaId);
    const emptyStats = {
      totalHcps: 0,
      averageCompositeScore: 0,
      segmentAverages: {
        publications: 0,
        clinicalTrials: 0,
        tradePubs: 0,
        orgLeadership: 0,
        orgAwards: 0,
        conference: 0,
        socialMedia: 0,
        mediaPodcasts: 0,
        survey: 0,
      },
      scoreDistribution: [],
      notConfigured: !analysis,
    };
    if (!analysis) return emptyStats;

    const analysisScores = await prisma.hcpAnalysisScore.findMany({
      where: { analysisId: analysis.id, compositeScore: { not: null } },
      select: {
        hcpId: true,
        compositeScore: true,
        scoreSurvey: true,
      },
    });
    if (analysisScores.length === 0) return { ...emptyStats, notConfigured: false };

    // Live-pull objective columns for the same HCPs.
    const objectiveRows = await prisma.hcpDiseaseAreaScore.findMany({
      where: {
        hcpId: { in: analysisScores.map((a) => a.hcpId) },
        diseaseAreaId,
        isCurrent: true,
      },
      select: {
        hcpId: true,
        scorePublications: true,
        scoreClinicalTrials: true,
        scoreTradePubs: true,
        scoreOrgLeadership: true,
        scoreOrgAwards: true,
        scoreConference: true,
        scoreSocialMedia: true,
        scoreMediaPodcasts: true,
      },
    });
    const objByHcp = new Map(objectiveRows.map((o) => [o.hcpId, o]));

    // Calculate averages
    const calcAvg = (values: (number | null)[]) => {
      const valid = values.filter((v): v is number => v !== null);
      return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : 0;
    };

    const compositeScores = analysisScores.map((s) => Number(s.compositeScore));
    const avgComposite = calcAvg(compositeScores);

    // Score distribution (buckets of 10)
    const distribution = [
      { min: 0, max: 10, count: 0 },
      { min: 10, max: 20, count: 0 },
      { min: 20, max: 30, count: 0 },
      { min: 30, max: 40, count: 0 },
      { min: 40, max: 50, count: 0 },
      { min: 50, max: 60, count: 0 },
      { min: 60, max: 70, count: 0 },
      { min: 70, max: 80, count: 0 },
      { min: 80, max: 90, count: 0 },
      { min: 90, max: 100, count: 0 },
    ];
    compositeScores.forEach((score: number) => {
      const bucket = Math.min(Math.floor(score / 10), 9);
      distribution[bucket].count++;
    });

    // Objective-column lookup with type narrowing
    const objNum = (hcpId: string, key: keyof NonNullable<ReturnType<typeof objByHcp.get>>) => {
      const o = objByHcp.get(hcpId);
      const v = o?.[key];
      return v ? Number(v) : null;
    };

    return {
      totalHcps: analysisScores.length,
      averageCompositeScore: Math.round(avgComposite * 100) / 100,
      segmentAverages: {
        publications: Math.round(calcAvg(analysisScores.map((s) => objNum(s.hcpId, 'scorePublications'))) * 100) / 100,
        clinicalTrials: Math.round(calcAvg(analysisScores.map((s) => objNum(s.hcpId, 'scoreClinicalTrials'))) * 100) / 100,
        tradePubs: Math.round(calcAvg(analysisScores.map((s) => objNum(s.hcpId, 'scoreTradePubs'))) * 100) / 100,
        orgLeadership: Math.round(calcAvg(analysisScores.map((s) => objNum(s.hcpId, 'scoreOrgLeadership'))) * 100) / 100,
        orgAwards: Math.round(calcAvg(analysisScores.map((s) => objNum(s.hcpId, 'scoreOrgAwards'))) * 100) / 100,
        conference: Math.round(calcAvg(analysisScores.map((s) => objNum(s.hcpId, 'scoreConference'))) * 100) / 100,
        socialMedia: Math.round(calcAvg(analysisScores.map((s) => objNum(s.hcpId, 'scoreSocialMedia'))) * 100) / 100,
        mediaPodcasts: Math.round(calcAvg(analysisScores.map((s) => objNum(s.hcpId, 'scoreMediaPodcasts'))) * 100) / 100,
        survey: Math.round(calcAvg(analysisScores.map((s) => s.scoreSurvey ? Number(s.scoreSurvey) : null)) * 100) / 100,
      },
      scoreDistribution: distribution,
      notConfigured: false,
    };
  }

  /**
   * Get top KOLs for a disease area
   */
  async getTopKols(clientId: string, diseaseAreaId: string, limit = 10) {
    const hasAccess = await this.hasAccessToDiseaseArea(clientId, diseaseAreaId);
    if (!hasAccess) {
      throw new Error('Access denied to this disease area');
    }

    // Phase 3 PR B: top-N by composite from HcpAnalysisScore (per-(client,DA)).
    const analysis = await resolveAnalysis(clientId, diseaseAreaId);
    if (!analysis) return [];

    const scores = await prisma.hcpAnalysisScore.findMany({
      where: { analysisId: analysis.id, compositeScore: { not: null } },
      include: {
        hcp: {
          select: {
            id: true,
            npi: true,
            firstName: true,
            lastName: true,
            specialty: true,
            state: true,
          },
        },
      },
      orderBy: { compositeScore: 'desc' },
      take: limit,
    });

    return scores.map((s, index: number) => ({
      rank: index + 1,
      hcp: s.hcp,
      compositeScore: s.compositeScore ? Number(s.compositeScore) : null,
      nominationCount: s.nominationCount,
    }));
  }

  /**
   * Export HCP scores as CSV data (returns array of objects for CSV generation)
   */
  async exportHcpScores(clientId: string, diseaseAreaId: string) {
    const hasAccess = await this.hasAccessToDiseaseArea(clientId, diseaseAreaId);
    if (!hasAccess) {
      throw new Error('Access denied to this disease area');
    }

    // Phase 3 PR B: CSV export pulls composite+survey from HcpAnalysisScore,
    // objective from HcpDiseaseAreaScore (live). Same pattern as getHcpScores.
    const analysis = await resolveAnalysis(clientId, diseaseAreaId);
    if (!analysis) return [];

    const analysisScores = await prisma.hcpAnalysisScore.findMany({
      where: { analysisId: analysis.id },
      include: { hcp: true },
      orderBy: { compositeScore: 'desc' },
    });
    if (analysisScores.length === 0) return [];

    const objectiveRows = await prisma.hcpDiseaseAreaScore.findMany({
      where: {
        hcpId: { in: analysisScores.map((a) => a.hcpId) },
        diseaseAreaId,
        isCurrent: true,
      },
    });
    const objByHcp = new Map(objectiveRows.map((o) => [o.hcpId, o]));

    const diseaseArea = await prisma.diseaseArea.findUnique({
      where: { id: diseaseAreaId },
      select: { name: true },
    });

    return analysisScores.map((s) => {
      const o = objByHcp.get(s.hcpId);
      return {
        npi: s.hcp.npi,
        firstName: s.hcp.firstName,
        lastName: s.hcp.lastName,
        specialty: s.hcp.specialty || '',
        subSpecialty: s.hcp.subSpecialty || '',
        city: s.hcp.city || '',
        state: s.hcp.state || '',
        yearsInPractice: s.hcp.yearsInPractice || '',
        diseaseArea: diseaseArea?.name || '',
        scorePublications: o?.scorePublications ? Number(o.scorePublications) : '',
        scoreClinicalTrials: o?.scoreClinicalTrials ? Number(o.scoreClinicalTrials) : '',
        scoreTradePubs: o?.scoreTradePubs ? Number(o.scoreTradePubs) : '',
        scoreOrgLeadership: o?.scoreOrgLeadership ? Number(o.scoreOrgLeadership) : '',
        scoreOrgAwards: o?.scoreOrgAwards ? Number(o.scoreOrgAwards) : '',
        scoreConference: o?.scoreConference ? Number(o.scoreConference) : '',
        scoreSocialMedia: o?.scoreSocialMedia ? Number(o.scoreSocialMedia) : '',
        scoreMediaPodcasts: o?.scoreMediaPodcasts ? Number(o.scoreMediaPodcasts) : '',
        scoreSurvey: s.scoreSurvey ? Number(s.scoreSurvey) : '',
        compositeScore: s.compositeScore ? Number(s.compositeScore) : '',
        nominationCount: s.nominationCount,
      };
    });
  }

  /**
   * Admin: Grant disease area access to a lite client
   */
  async grantAccess(
    clientId: string,
    diseaseAreaId: string,
    grantedBy: string,
    expiresAt?: Date
  ) {
    // Verify the client is a lite client
    const client = await prisma.client.findUnique({
      where: { id: clientId },
    });

    if (!client || client.type !== 'LITE') {
      throw new Error('Only lite clients can be granted disease area access');
    }

    // Check if already exists
    const existing = await prisma.liteClientDiseaseArea.findUnique({
      where: {
        clientId_diseaseAreaId: {
          clientId,
          diseaseAreaId,
        },
      },
    });

    if (existing) {
      // Update existing record
      return prisma.liteClientDiseaseArea.update({
        where: { id: existing.id },
        data: {
          isActive: true,
          expiresAt,
          grantedBy,
          grantedAt: new Date(),
        },
        include: {
          diseaseArea: true,
        },
      });
    }

    return prisma.liteClientDiseaseArea.create({
      data: {
        clientId,
        diseaseAreaId,
        grantedBy,
        expiresAt,
      },
      include: {
        diseaseArea: true,
      },
    });
  }

  /**
   * Admin: Revoke disease area access from a lite client
   */
  async revokeAccess(clientId: string, diseaseAreaId: string) {
    return prisma.liteClientDiseaseArea.updateMany({
      where: {
        clientId,
        diseaseAreaId,
      },
      data: {
        isActive: false,
      },
    });
  }

  /**
   * Admin: Get all lite clients with their disease area assignments
   */
  async getAllLiteClientsWithAccess() {
    return prisma.client.findMany({
      where: {
        type: 'LITE',
        isActive: true,
      },
      include: {
        liteClientDiseaseAreas: {
          include: {
            diseaseArea: true,
          },
          orderBy: {
            diseaseArea: { name: 'asc' },
          },
        },
        _count: {
          select: { users: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }
}
