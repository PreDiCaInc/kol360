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

    // Build HCP filters
    const hcpWhere: Record<string, unknown> = {};
    if (search) {
      hcpWhere.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { npi: { contains: search } },
      ];
    }
    if (specialty) {
      hcpWhere.specialty = specialty;
    }
    if (state) {
      hcpWhere.state = state;
    }

    // Build score filters
    const scoreWhere: Record<string, unknown> = {
      diseaseAreaId,
      isCurrent: true,
    };
    if (minCompositeScore !== undefined || maxCompositeScore !== undefined) {
      scoreWhere.compositeScore = {};
      if (minCompositeScore !== undefined) {
        (scoreWhere.compositeScore as Record<string, number>).gte = minCompositeScore;
      }
      if (maxCompositeScore !== undefined) {
        (scoreWhere.compositeScore as Record<string, number>).lte = maxCompositeScore;
      }
    }

    // Get total count
    const totalCount = await prisma.hcpDiseaseAreaScore.count({
      where: {
        ...scoreWhere,
        hcp: hcpWhere,
      },
    });

    // Determine sort field
    let orderBy: Record<string, unknown>;
    if (sortBy === 'compositeScore') {
      orderBy = { compositeScore: sortOrder };
    } else {
      orderBy = { hcp: { [sortBy]: sortOrder } };
    }

    // Get paginated scores with HCP data
    const scores = await prisma.hcpDiseaseAreaScore.findMany({
      where: {
        ...scoreWhere,
        hcp: hcpWhere,
      },
      include: {
        hcp: {
          select: {
            id: true,
            npi: true,
            firstName: true,
            lastName: true,
            specialty: true,
            subSpecialty: true,
            city: true,
            state: true,
            yearsInPractice: true,
          },
        },
        diseaseArea: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: scores.map((score: typeof scores[number]) => ({
        hcp: score.hcp,
        diseaseArea: score.diseaseArea,
        scores: {
          publications: score.scorePublications ? Number(score.scorePublications) : null,
          clinicalTrials: score.scoreClinicalTrials ? Number(score.scoreClinicalTrials) : null,
          tradePubs: score.scoreTradePubs ? Number(score.scoreTradePubs) : null,
          orgLeadership: score.scoreOrgLeadership ? Number(score.scoreOrgLeadership) : null,
          orgAwareness: score.scoreOrgAwareness ? Number(score.scoreOrgAwareness) : null,
          conference: score.scoreConference ? Number(score.scoreConference) : null,
          socialMedia: score.scoreSocialMedia ? Number(score.scoreSocialMedia) : null,
          mediaPodcasts: score.scoreMediaPodcasts ? Number(score.scoreMediaPodcasts) : null,
          survey: score.scoreSurvey ? Number(score.scoreSurvey) : null,
          composite: score.compositeScore ? Number(score.compositeScore) : null,
        },
        nominationCount: score.totalNominationCount,
        lastCalculatedAt: score.lastCalculatedAt,
      })),
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

    const scores = await prisma.hcpDiseaseAreaScore.findMany({
      where: {
        diseaseAreaId,
        isCurrent: true,
        compositeScore: { not: null },
      },
      select: {
        compositeScore: true,
        scorePublications: true,
        scoreClinicalTrials: true,
        scoreTradePubs: true,
        scoreOrgLeadership: true,
        scoreOrgAwareness: true,
        scoreConference: true,
        scoreSocialMedia: true,
        scoreMediaPodcasts: true,
        scoreSurvey: true,
      },
    });

    if (scores.length === 0) {
      return {
        totalHcps: 0,
        averageCompositeScore: 0,
        segmentAverages: {
          publications: 0,
          clinicalTrials: 0,
          tradePubs: 0,
          orgLeadership: 0,
          orgAwareness: 0,
          conference: 0,
          socialMedia: 0,
          mediaPodcasts: 0,
          survey: 0,
        },
        scoreDistribution: [],
      };
    }

    // Calculate averages
    const calcAvg = (values: (number | null)[]) => {
      const valid = values.filter((v): v is number => v !== null);
      return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : 0;
    };

    const compositeScores = scores.map((s: typeof scores[number]) => Number(s.compositeScore));
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

    return {
      totalHcps: scores.length,
      averageCompositeScore: Math.round(avgComposite * 100) / 100,
      segmentAverages: {
        publications: Math.round(calcAvg(scores.map((s: typeof scores[number]) => s.scorePublications ? Number(s.scorePublications) : null)) * 100) / 100,
        clinicalTrials: Math.round(calcAvg(scores.map((s: typeof scores[number]) => s.scoreClinicalTrials ? Number(s.scoreClinicalTrials) : null)) * 100) / 100,
        tradePubs: Math.round(calcAvg(scores.map((s: typeof scores[number]) => s.scoreTradePubs ? Number(s.scoreTradePubs) : null)) * 100) / 100,
        orgLeadership: Math.round(calcAvg(scores.map((s: typeof scores[number]) => s.scoreOrgLeadership ? Number(s.scoreOrgLeadership) : null)) * 100) / 100,
        orgAwareness: Math.round(calcAvg(scores.map((s: typeof scores[number]) => s.scoreOrgAwareness ? Number(s.scoreOrgAwareness) : null)) * 100) / 100,
        conference: Math.round(calcAvg(scores.map((s: typeof scores[number]) => s.scoreConference ? Number(s.scoreConference) : null)) * 100) / 100,
        socialMedia: Math.round(calcAvg(scores.map((s: typeof scores[number]) => s.scoreSocialMedia ? Number(s.scoreSocialMedia) : null)) * 100) / 100,
        mediaPodcasts: Math.round(calcAvg(scores.map((s: typeof scores[number]) => s.scoreMediaPodcasts ? Number(s.scoreMediaPodcasts) : null)) * 100) / 100,
        survey: Math.round(calcAvg(scores.map((s: typeof scores[number]) => s.scoreSurvey ? Number(s.scoreSurvey) : null)) * 100) / 100,
      },
      scoreDistribution: distribution,
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

    const scores = await prisma.hcpDiseaseAreaScore.findMany({
      where: {
        diseaseAreaId,
        isCurrent: true,
        compositeScore: { not: null },
      },
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
      orderBy: {
        compositeScore: 'desc',
      },
      take: limit,
    });

    return scores.map((score: typeof scores[number], index: number) => ({
      rank: index + 1,
      hcp: score.hcp,
      compositeScore: score.compositeScore ? Number(score.compositeScore) : null,
      nominationCount: score.totalNominationCount,
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

    const scores = await prisma.hcpDiseaseAreaScore.findMany({
      where: {
        diseaseAreaId,
        isCurrent: true,
      },
      include: {
        hcp: true,
        diseaseArea: true,
      },
      orderBy: {
        compositeScore: 'desc',
      },
    });

    return scores.map((score: typeof scores[number]) => ({
      npi: score.hcp.npi,
      firstName: score.hcp.firstName,
      lastName: score.hcp.lastName,
      specialty: score.hcp.specialty || '',
      subSpecialty: score.hcp.subSpecialty || '',
      city: score.hcp.city || '',
      state: score.hcp.state || '',
      yearsInPractice: score.hcp.yearsInPractice || '',
      diseaseArea: score.diseaseArea.name,
      scorePublications: score.scorePublications ? Number(score.scorePublications) : '',
      scoreClinicalTrials: score.scoreClinicalTrials ? Number(score.scoreClinicalTrials) : '',
      scoreTradePubs: score.scoreTradePubs ? Number(score.scoreTradePubs) : '',
      scoreOrgLeadership: score.scoreOrgLeadership ? Number(score.scoreOrgLeadership) : '',
      scoreOrgAwareness: score.scoreOrgAwareness ? Number(score.scoreOrgAwareness) : '',
      scoreConference: score.scoreConference ? Number(score.scoreConference) : '',
      scoreSocialMedia: score.scoreSocialMedia ? Number(score.scoreSocialMedia) : '',
      scoreMediaPodcasts: score.scoreMediaPodcasts ? Number(score.scoreMediaPodcasts) : '',
      scoreSurvey: score.scoreSurvey ? Number(score.scoreSurvey) : '',
      compositeScore: score.compositeScore ? Number(score.compositeScore) : '',
      nominationCount: score.totalNominationCount,
    }));
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
