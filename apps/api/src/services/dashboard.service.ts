import { prisma } from '../lib/prisma';
import { DEFAULT_DASHBOARD_SECTIONS, STANDARD_COMPONENTS } from '@kol360/shared';

// Type from Prisma schema
type DashboardComponentType = 'STANDARD' | 'CUSTOM';

interface CreateDashboardInput {
  campaignId: string;
  name: string;
  clientId: string;
  createdBy: string;
}

interface AddComponentInput {
  componentType: DashboardComponentType;
  componentKey: string;
  configJson?: Record<string, unknown> | null;
  sectionTitle: string;
  displayOrder?: number;
  isVisible?: boolean;
}

interface UpdateComponentInput {
  configJson?: Record<string, unknown> | null;
  sectionTitle?: string;
  displayOrder?: number;
  isVisible?: boolean;
}

export class DashboardService {
  async getForCampaign(campaignId: string) {
    return prisma.dashboardConfig.findUnique({
      where: { campaignId },
      include: {
        components: {
          orderBy: [{ sectionTitle: 'asc' }, { displayOrder: 'asc' }],
        },
      },
    });
  }

  async create(input: CreateDashboardInput) {
    const { campaignId, name, clientId, createdBy } = input;

    // Create dashboard with default standard components
    const dashboard = await prisma.dashboardConfig.create({
      data: {
        campaignId,
        clientId,
        name,
        createdBy,
        components: {
          create: this.getDefaultComponents(),
        },
      },
      include: {
        components: {
          orderBy: [{ sectionTitle: 'asc' }, { displayOrder: 'asc' }],
        },
      },
    });

    return dashboard;
  }

  async createDefaultForCampaign(campaignId: string, clientId: string, createdBy: string) {
    const existing = await this.getForCampaign(campaignId);
    if (existing) return existing;

    return this.create({
      campaignId,
      clientId,
      name: 'Campaign Dashboard',
      createdBy,
    });
  }

  private getDefaultComponents(): Array<{
    componentType: DashboardComponentType;
    componentKey: string;
    sectionTitle: string;
    displayOrder: number;
    isVisible: boolean;
  }> {
    const components: Array<{
      componentType: DashboardComponentType;
      componentKey: string;
      sectionTitle: string;
      displayOrder: number;
      isVisible: boolean;
    }> = [];

    let displayOrder = 0;
    for (const section of DEFAULT_DASHBOARD_SECTIONS) {
      for (const componentKey of section.components) {
        components.push({
          componentType: 'STANDARD',
          componentKey,
          sectionTitle: section.title,
          displayOrder: displayOrder++,
          isVisible: true,
        });
      }
    }

    return components;
  }

  async update(
    dashboardId: string,
    data: { name?: string; isPublished?: boolean }
  ) {
    return prisma.dashboardConfig.update({
      where: { id: dashboardId },
      data,
      include: {
        components: {
          orderBy: [{ sectionTitle: 'asc' }, { displayOrder: 'asc' }],
        },
      },
    });
  }

  async publish(dashboardId: string) {
    return this.update(dashboardId, { isPublished: true });
  }

  async unpublish(dashboardId: string) {
    return this.update(dashboardId, { isPublished: false });
  }

  async addComponent(dashboardId: string, input: AddComponentInput) {
    const { componentType, componentKey, configJson, sectionTitle, displayOrder, isVisible } = input;

    return prisma.dashboardComponent.create({
      data: {
        dashboardId,
        componentType,
        componentKey,
        configJson: configJson as object ?? undefined,
        sectionTitle,
        displayOrder: displayOrder ?? 0,
        isVisible: isVisible ?? true,
      },
    });
  }

  async updateComponent(componentId: string, input: UpdateComponentInput) {
    const { configJson, sectionTitle, displayOrder, isVisible } = input;

    return prisma.dashboardComponent.update({
      where: { id: componentId },
      data: {
        ...(configJson !== undefined && { configJson: configJson as object }),
        ...(sectionTitle !== undefined && { sectionTitle }),
        ...(displayOrder !== undefined && { displayOrder }),
        ...(isVisible !== undefined && { isVisible }),
      },
    });
  }

  async removeComponent(componentId: string) {
    return prisma.dashboardComponent.delete({
      where: { id: componentId },
    });
  }

  async toggleComponentVisibility(componentId: string) {
    const component = await prisma.dashboardComponent.findUnique({
      where: { id: componentId },
    });

    if (!component) {
      throw new Error('Component not found');
    }

    return prisma.dashboardComponent.update({
      where: { id: componentId },
      data: { isVisible: !component.isVisible },
    });
  }

  async reorderComponents(dashboardId: string, componentIds: string[]) {
    const updates = componentIds.map((id, index) =>
      prisma.dashboardComponent.update({
        where: { id },
        data: { displayOrder: index },
      })
    );

    await prisma.$transaction(updates);

    return this.getForCampaign(
      (await prisma.dashboardConfig.findUnique({
        where: { id: dashboardId },
        select: { campaignId: true },
      }))?.campaignId ?? ''
    );
  }

  // Dashboard data endpoints
  async getStats(campaignId: string) {
    const [responseStats, hcpStats, scoreStats] = await Promise.all([
      this.getResponseStats(campaignId),
      this.getHcpStats(campaignId),
      this.getScoreStats(campaignId),
    ]);

    return {
      ...responseStats,
      ...hcpStats,
      ...scoreStats,
    };
  }

  private async getResponseStats(campaignId: string) {
    const stats = await prisma.surveyResponse.groupBy({
      by: ['status'],
      where: { campaignId },
      _count: true,
    });

    const totalSent = await prisma.campaignHcp.count({
      where: { campaignId, emailSentAt: { not: null } },
    });

    const counts = stats.reduce((acc: Record<string, number>, s: { status: string; _count: number }) => {
      acc[s.status] = s._count;
      return acc;
    }, {});

    const totalCompleted = counts['COMPLETED'] || 0;

    return {
      totalSent,
      totalOpened: (counts['OPENED'] || 0) + (counts['IN_PROGRESS'] || 0) + totalCompleted,
      totalStarted: (counts['IN_PROGRESS'] || 0) + totalCompleted,
      totalCompleted,
      responseRate: totalSent > 0 ? Math.round((totalCompleted / totalSent) * 100) : 0,
    };
  }

  private async getHcpStats(campaignId: string) {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { diseaseAreaId: true },
    });

    const totalHcps = await prisma.campaignHcp.count({
      where: { campaignId },
    });

    const hcpsBySpecialty = await prisma.hcp.groupBy({
      by: ['specialty'],
      where: {
        campaignHcps: { some: { campaignId } },
      },
      _count: true,
    });

    const hcpsByState = await prisma.hcp.groupBy({
      by: ['state'],
      where: {
        campaignHcps: { some: { campaignId } },
      },
      _count: true,
    });

    return {
      totalHcps,
      hcpsBySpecialty: hcpsBySpecialty
        .filter((h: { specialty: string | null; _count: number }) => h.specialty)
        .map((h: { specialty: string | null; _count: number }) => ({
          specialty: h.specialty || 'Unknown',
          count: h._count,
        }))
        .sort((a: { count: number }, b: { count: number }) => b.count - a.count),
      hcpsByState: hcpsByState
        .filter((h: { state: string | null; _count: number }) => h.state)
        .map((h: { state: string | null; _count: number }) => ({
          state: h.state || 'Unknown',
          count: h._count,
        }))
        .sort((a: { count: number }, b: { count: number }) => b.count - a.count),
    };
  }

  /**
   * Resolve the (analysisId, hcpIds) tuple for a campaign — the basis for
   * pulling per-HCP scores from HcpAnalysisScore for the campaign's roster.
   * Returns null if no analysis exists yet for the campaign's (client, DA),
   * which callers should treat as "empty result" (Phase 3 PR B repoint).
   */
  private async getCampaignAnalysisContext(campaignId: string) {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { clientId: true, diseaseAreaId: true },
    });
    if (!campaign) return null;
    const analysis = await prisma.kolAnalysis.findUnique({
      where: {
        clientId_diseaseAreaId: {
          clientId: campaign.clientId,
          diseaseAreaId: campaign.diseaseAreaId,
        },
      },
      select: { id: true },
    });
    if (!analysis) return null;
    const hcpRows = await prisma.hcpCampaignScore.findMany({
      where: { campaignId },
      select: { hcpId: true },
    });
    return { analysisId: analysis.id, hcpIds: hcpRows.map((r) => r.hcpId) };
  }

  private async getScoreStats(campaignId: string) {
    // Phase 3 PR B repoint: composite scores now live on HcpAnalysisScore
    // per-(client, DA). For a single-campaign view we filter to the
    // campaign's HCPs within the analysis.
    const ctx = await this.getCampaignAnalysisContext(campaignId);
    if (!ctx || ctx.hcpIds.length === 0) {
      return { averageScore: null, medianScore: null, minScore: null, maxScore: null };
    }
    const scores = await prisma.hcpAnalysisScore.findMany({
      where: { analysisId: ctx.analysisId, hcpId: { in: ctx.hcpIds }, compositeScore: { not: null } },
      select: { compositeScore: true },
    });

    if (scores.length === 0) {
      return {
        averageScore: null,
        medianScore: null,
        minScore: null,
        maxScore: null,
      };
    }

    const values = scores
      .map((s) => (s.compositeScore ? Number(s.compositeScore) : 0))
      .sort((a: number, b: number) => a - b);

    const sum = values.reduce((a: number, b: number) => a + b, 0);
    const mid = Math.floor(values.length / 2);

    return {
      averageScore: Math.round((sum / values.length) * 100) / 100,
      medianScore: values.length % 2 === 0
        ? Math.round(((values[mid - 1] + values[mid]) / 2) * 100) / 100
        : values[mid],
      minScore: values[0],
      maxScore: values[values.length - 1],
    };
  }

  async getCompletionFunnel(campaignId: string) {
    const [sent, stats] = await Promise.all([
      prisma.campaignHcp.count({
        where: { campaignId, emailSentAt: { not: null } },
      }),
      prisma.surveyResponse.groupBy({
        by: ['status'],
        where: { campaignId },
        _count: true,
      }),
    ]);

    const counts = stats.reduce((acc: Record<string, number>, s: { status: string; _count: number }) => {
      acc[s.status] = s._count;
      return acc;
    }, {});

    const completed = counts['COMPLETED'] || 0;
    const started = (counts['IN_PROGRESS'] || 0) + completed;
    const opened = (counts['OPENED'] || 0) + started;

    return { sent, opened, started, completed };
  }

  async getScoreDistribution(campaignId: string) {
    // Phase 3 PR B repoint: same pattern as getScoreStats — distribution
    // of HcpAnalysisScore.compositeScore for the campaign's HCPs.
    const ctx = await this.getCampaignAnalysisContext(campaignId);
    const ranges = [
      { min: 0, max: 20, count: 0 },
      { min: 20, max: 40, count: 0 },
      { min: 40, max: 60, count: 0 },
      { min: 60, max: 80, count: 0 },
      { min: 80, max: 100, count: 0 },
    ];
    if (!ctx || ctx.hcpIds.length === 0) return { ranges };

    const scores = await prisma.hcpAnalysisScore.findMany({
      where: { analysisId: ctx.analysisId, hcpId: { in: ctx.hcpIds }, compositeScore: { not: null } },
      select: { compositeScore: true },
    });

    for (const score of scores) {
      const value = score.compositeScore ? Number(score.compositeScore) : 0;
      for (const range of ranges) {
        if (value >= range.min && value < range.max) {
          range.count++;
          break;
        }
      }
      // Handle exact 100
      if (value === 100) {
        ranges[4].count++;
      }
    }

    return { ranges };
  }

  async getTopKols(campaignId: string, limit = 10) {
    // Phase 3 PR B repoint: top-N by composite from HcpAnalysisScore for
    // the campaign's HCPs (filtered to this analysis). Survey value also
    // from HcpAnalysisScore (replacing the dropped HcpCampaignScore.scoreSurvey).
    const ctx = await this.getCampaignAnalysisContext(campaignId);
    if (!ctx || ctx.hcpIds.length === 0) return [];

    const kols = await prisma.hcpAnalysisScore.findMany({
      where: { analysisId: ctx.analysisId, hcpId: { in: ctx.hcpIds } },
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

    return kols.map((k) => ({
      id: k.hcp.id,
      npi: k.hcp.npi,
      firstName: k.hcp.firstName,
      lastName: k.hcp.lastName,
      specialty: k.hcp.specialty,
      state: k.hcp.state,
      compositeScore: k.compositeScore ? Number(k.compositeScore) : null,
      surveyScore: k.scoreSurvey ? Number(k.scoreSurvey) : null,
      nominationCount: k.nominationCount,
    }));
  }

  async getSegmentScores(campaignId: string) {
    // Phase 3 PR B repoint:
    // - Weights: were on Campaign.compositeScoreConfig (dropped). Now from
    //   KolAnalysis.weightsJson for the campaign's (clientId, diseaseAreaId).
    //   Fallback to DEFAULT_ANALYSIS_WEIGHTS if no analysis exists yet.
    // - Survey segment value: was on HcpCampaignScore.scoreSurvey (dropped).
    //   Now from HcpAnalysisScore.scoreSurvey for the same analysis +
    //   the campaign's HCPs. SEMANTIC SHIFT: survey scores are now pooled
    //   across the analysis's included campaigns (not per-campaign-normalized).
    //   For customers viewing a single-campaign dashboard, the survey number
    //   reflects the pooled normalization that drives the KOL Analysis
    //   dashboard — same source-of-truth, just visible per-campaign.
    // - Objective columns: unchanged, still from HcpDiseaseAreaScore.
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { diseaseAreaId: true, clientId: true },
    });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    // Get the analysis for this (client, DA). May not exist for a brand-new
    // campaign in a brand-new (client, DA) pair — fall back to defaults.
    const analysis = await prisma.kolAnalysis.findUnique({
      where: {
        clientId_diseaseAreaId: {
          clientId: campaign.clientId,
          diseaseAreaId: campaign.diseaseAreaId,
        },
      },
      select: { id: true, weightsJson: true },
    });

    const weights = ((analysis?.weightsJson as Record<string, number> | null) ?? null) as Record<string, number> | null;
    const w = (key: string, fallback: number) =>
      weights && typeof weights[key] === 'number' ? weights[key] : fallback;

    // Pull campaign HCPs + their objective scores from HcpDiseaseAreaScore.
    const hcpScores = await prisma.hcpCampaignScore.findMany({
      where: { campaignId },
      include: {
        hcp: {
          include: {
            diseaseAreaScores: {
              where: { diseaseAreaId: campaign.diseaseAreaId, isCurrent: true },
            },
          },
        },
      },
    });

    // For survey: pull HcpAnalysisScore.scoreSurvey for these HCPs, scoped
    // to the campaign's analysis. May be empty if no analysis or no scores.
    const hcpIds = hcpScores.map((s) => s.hcpId);
    const analysisSurveyByHcp = new Map<string, number | null>();
    if (analysis && hcpIds.length > 0) {
      const analysisScores = await prisma.hcpAnalysisScore.findMany({
        where: { analysisId: analysis.id, hcpId: { in: hcpIds } },
        select: { hcpId: true, scoreSurvey: true },
      });
      for (const a of analysisScores) {
        analysisSurveyByHcp.set(a.hcpId, a.scoreSurvey ? Number(a.scoreSurvey) : null);
      }
    }

    const segments = [
      { name: 'Publications', key: 'scorePublications', weight: w('weightPublications', 10) },
      { name: 'Clinical Trials', key: 'scoreClinicalTrials', weight: w('weightClinicalTrials', 15) },
      { name: 'Trade Publications', key: 'scoreTradePubs', weight: w('weightTradePubs', 10) },
      { name: 'Org Leadership', key: 'scoreOrgLeadership', weight: w('weightOrgLeadership', 10) },
      { name: 'Org Awards', key: 'scoreOrgAwards', weight: w('weightOrgAwards', 10) },
      { name: 'Conference', key: 'scoreConference', weight: w('weightConference', 10) },
      { name: 'Social Media', key: 'scoreSocialMedia', weight: w('weightSocialMedia', 5) },
      { name: 'Media/Podcasts', key: 'scoreMediaPodcasts', weight: w('weightMediaPodcasts', 5) },
      { name: 'Survey', key: 'scoreSurvey', weight: w('weightSurvey', 25) },
    ];

    const segmentAverages = segments.map((segment) => {
      let sum = 0;
      let count = 0;

      for (const score of hcpScores) {
        let value: number | null = null;
        if (segment.key === 'scoreSurvey') {
          value = analysisSurveyByHcp.get(score.hcpId) ?? null;
        } else {
          const diseaseScore = score.hcp.diseaseAreaScores[0];
          if (diseaseScore) {
            value = (diseaseScore as unknown as Record<string, { toNumber?: () => number } | null>)[segment.key]?.toNumber?.() ?? null;
          }
        }

        if (value !== null) {
          sum += value;
          count++;
        }
      }

      return {
        name: segment.name,
        averageScore: count > 0 ? Math.round((sum / count) * 100) / 100 : null,
        weight: segment.weight,
      };
    });

    return { segments: segmentAverages };
  }

  async getCustomChartData(
    campaignId: string,
    config: {
      questionId?: string;
      groupBy?: string;
      metric: string;
    }
  ) {
    const { questionId, groupBy, metric } = config;

    if (!questionId) {
      throw new Error('Question ID is required for custom charts');
    }

    // Get answers for the question
    const answers = await prisma.surveyResponseAnswer.findMany({
      where: {
        question: { campaignId, questionId },
        response: { status: 'COMPLETED' },
      },
      include: {
        response: {
          include: {
            respondentHcp: {
              select: { specialty: true, state: true, yearsInPractice: true },
            },
          },
        },
      },
    });

    // Group by dimension if specified
    const grouped = new Map<string, number[]>();

    for (const answer of answers) {
      let groupKey = 'All';
      if (groupBy) {
        const hcp = answer.response.respondentHcp;
        switch (groupBy) {
          case 'specialty':
            groupKey = hcp.specialty || 'Unknown';
            break;
          case 'state':
          case 'region':
            groupKey = hcp.state || 'Unknown';
            break;
          case 'years_in_practice':
            const years = hcp.yearsInPractice ?? 0;
            if (years < 5) groupKey = '< 5 years';
            else if (years < 10) groupKey = '5-10 years';
            else if (years < 20) groupKey = '10-20 years';
            else groupKey = '20+ years';
            break;
        }
      }

      if (!grouped.has(groupKey)) {
        grouped.set(groupKey, []);
      }

      // Parse answer value
      const answerValue = answer.answerJson
        ? (answer.answerJson as { value?: number })?.value ?? 0
        : parseFloat(answer.answerText || '0') || 1;
      grouped.get(groupKey)!.push(answerValue);
    }

    // Calculate metric
    const labels: string[] = [];
    const data: number[] = [];

    for (const [key, values] of grouped.entries()) {
      labels.push(key);
      switch (metric) {
        case 'count':
          data.push(values.length);
          break;
        case 'average':
          data.push(values.length > 0
            ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100
            : 0);
          break;
        case 'sum':
          data.push(values.reduce((a, b) => a + b, 0));
          break;
        default:
          data.push(values.length);
      }
    }

    return {
      labels,
      data,
      total: data.reduce((a, b) => a + b, 0),
    };
  }
}

export const dashboardService = new DashboardService();
