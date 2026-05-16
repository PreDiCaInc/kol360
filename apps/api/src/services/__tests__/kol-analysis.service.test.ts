import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { KolAnalysisService } from '../kol-analysis.service';

vi.mock('../../lib/prisma', () => {
  const mockPrisma = {
    kolAnalysis: { findUnique: vi.fn(), update: vi.fn() },
    campaign: { findMany: vi.fn() },
    surveyQuestion: { findMany: vi.fn() },
    nomination: { findMany: vi.fn() },
    hcpDiseaseAreaScore: { findMany: vi.fn() },
    hcpAnalysisScore: { deleteMany: vi.fn(), createMany: vi.fn() },
    // Service uses the array form: prisma.$transaction([...ops])
    $transaction: vi.fn().mockImplementation(async (ops: unknown) =>
      Array.isArray(ops) ? Promise.all(ops) : ops
    ),
  };
  return { prisma: mockPrisma };
});

import { prisma } from '../../lib/prisma';

const svc = new KolAnalysisService();

let respSeq = 0;
// Build N nomination records of one type for an HCP from a campaign.
// Each nomination comes from a DISTINCT respondent (unique respondentHcpId +
// responseId) — models N different people each nominating the HCP once, so
// respondent-dedup does not collapse them.
function noms(hcpId: string, campaignId: string, n: number, type = 'NATIONAL_LEADER') {
  return Array.from({ length: n }, () => {
    const rid = `resp-${respSeq++}`;
    return {
      matchedHcpId: hcpId,
      question: { nominationType: type },
      response: {
        id: `r-${rid}`,
        campaignId,
        completedAt: new Date('2026-01-01T00:00:00Z'),
        createdAt: new Date('2026-01-01T00:00:00Z'),
        respondentHcpId: rid,
        respondentHcp: { email: 'r@x.com' },
      },
    };
  });
}

// A single respondent's nomination of `hcpId` in `campaignId`, with explicit
// recency — for testing cross-campaign respondent dedup.
function nomFrom(
  respondentHcpId: string,
  hcpId: string,
  campaignId: string,
  completedAt: string,
  type = 'NATIONAL_LEADER'
) {
  return {
    matchedHcpId: hcpId,
    question: { nominationType: type },
    response: {
      id: `r-${respondentHcpId}-${campaignId}`,
      campaignId,
      completedAt: new Date(completedAt),
      createdAt: new Date(completedAt),
      respondentHcpId,
      respondentHcp: { email: 'r@x.com' },
    },
  };
}

describe('KolAnalysisService.recalculateAnalysis — pooled normalization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.kolAnalysis.update as Mock).mockResolvedValue({});
    (prisma.campaign.findMany as Mock).mockResolvedValue([]); // none exclude internal
    (prisma.hcpDiseaseAreaScore.findMany as Mock).mockResolvedValue([]); // no objective data
    (prisma.hcpAnalysisScore.deleteMany as Mock).mockResolvedValue({});
    (prisma.hcpAnalysisScore.createMany as Mock).mockResolvedValue({ count: 0 });
  });

  it('pools nominations across campaigns and normalizes ONCE (the Eric bug)', async () => {
    // Eric: 5/? in Campaign A, 55/? in Campaign B.
    // "Top": 100 in Campaign A — sets the pooled max for the type at 100.
    // Old per-campaign-then-average → ~33%.  Pooled → 60/100*100 = 60%.
    (prisma.kolAnalysis.findUnique as Mock).mockResolvedValue({
      id: 'an-1',
      diseaseAreaId: 'da-1',
      // weightSurvey 100 isolates survey into the composite (objective = 0)
      weightsJson: {
        weightPublications: 0, weightClinicalTrials: 0, weightTradePubs: 0,
        weightOrgLeadership: 0, weightOrgAwards: 0, weightConference: 0,
        weightSocialMedia: 0, weightMediaPodcasts: 0, weightSurvey: 100,
      },
      campaigns: [
        { campaignId: 'A', included: true },
        { campaignId: 'B', included: true },
      ],
    });
    (prisma.surveyQuestion.findMany as Mock).mockResolvedValue([
      { nominationType: 'NATIONAL_LEADER' },
    ]);
    (prisma.nomination.findMany as Mock).mockResolvedValue([
      ...noms('eric', 'A', 5),
      ...noms('eric', 'B', 55),
      ...noms('top', 'A', 100),
    ]);

    await svc.recalculateAnalysis('an-1');

    const createArg = (prisma.hcpAnalysisScore.createMany as Mock).mock.calls[0][0];
    const rows: Array<Record<string, number | string>> = createArg.data;
    const eric = rows.find((r) => r.hcpId === 'eric')!;
    const top = rows.find((r) => r.hcpId === 'top')!;

    expect(eric.nominationCount).toBe(60);
    // Pooled: 60 / 100 * 100 = 60. NOT the old avg(5%, 61%) ≈ 33%.
    expect(Number(eric.scoreSurvey)).toBeCloseTo(60, 5);
    expect(Number(eric.scoreSurvey)).not.toBeCloseTo(33, 0);
    expect(Number(top.scoreSurvey)).toBeCloseTo(100, 5);
    // weightSurvey=100, no objective → composite == survey
    expect(Number(eric.compositeScore)).toBeCloseTo(60, 5);
  });

  it('dedups a respondent across campaigns: only most-recent survey counts', async () => {
    // Respondent "drA" took the survey in BOTH campaign A and B (included).
    // In A (older) they nominated eric; in B (newer) they nominated bob.
    // Only the newer (B) response should count → eric gets 0, bob gets 1.
    // 9 other distinct respondents in B also nominate bob (sets the max).
    (prisma.kolAnalysis.findUnique as Mock).mockResolvedValue({
      id: 'an-1',
      diseaseAreaId: 'da-1',
      weightsJson: {
        weightPublications: 0, weightClinicalTrials: 0, weightTradePubs: 0,
        weightOrgLeadership: 0, weightOrgAwards: 0, weightConference: 0,
        weightSocialMedia: 0, weightMediaPodcasts: 0, weightSurvey: 100,
      },
      campaigns: [
        { campaignId: 'A', included: true },
        { campaignId: 'B', included: true },
      ],
    });
    (prisma.surveyQuestion.findMany as Mock).mockResolvedValue([
      { nominationType: 'NATIONAL_LEADER' },
    ]);
    (prisma.nomination.findMany as Mock).mockResolvedValue([
      nomFrom('drA', 'eric', 'A', '2026-01-01T00:00:00Z'), // older — dropped
      nomFrom('drA', 'bob', 'B', '2026-02-01T00:00:00Z'),  // newer — kept
      ...noms('bob', 'B', 9), // 9 other distinct respondents
    ]);

    await svc.recalculateAnalysis('an-1');

    const rows = (prisma.hcpAnalysisScore.createMany as Mock).mock.calls[0][0].data;
    const eric = rows.find((r: { hcpId: string }) => r.hcpId === 'eric');
    const bob = rows.find((r: { hcpId: string }) => r.hcpId === 'bob');
    // drA's older A-response was dropped → eric not scored at all.
    expect(eric).toBeUndefined();
    // bob: 1 (drA newer) + 9 others = 10 nominations.
    expect(bob.nominationCount).toBe(10);
  });

  it('excluding a campaign re-pools and changes the max (keeps scores current)', async () => {
    // Exclude Campaign A. Pool is now only B: Eric 55, Top 0 → Eric is the max.
    (prisma.kolAnalysis.findUnique as Mock).mockResolvedValue({
      id: 'an-1',
      diseaseAreaId: 'da-1',
      weightsJson: {
        weightPublications: 0, weightClinicalTrials: 0, weightTradePubs: 0,
        weightOrgLeadership: 0, weightOrgAwards: 0, weightConference: 0,
        weightSocialMedia: 0, weightMediaPodcasts: 0, weightSurvey: 100,
      },
      campaigns: [
        { campaignId: 'A', included: false },
        { campaignId: 'B', included: true },
      ],
    });
    (prisma.surveyQuestion.findMany as Mock).mockResolvedValue([
      { nominationType: 'NATIONAL_LEADER' },
    ]);
    (prisma.nomination.findMany as Mock).mockResolvedValue([...noms('eric', 'B', 55)]);

    await svc.recalculateAnalysis('an-1');

    const rows = (prisma.hcpAnalysisScore.createMany as Mock).mock.calls[0][0].data;
    const eric = rows.find((r: { hcpId: string }) => r.hcpId === 'eric');
    expect(eric.nominationCount).toBe(55);
    expect(Number(eric.scoreSurvey)).toBeCloseTo(100, 5); // sole HCP = pooled max
  });

  it('applies objective scores live with per-analysis weights; null objective → 0', async () => {
    (prisma.kolAnalysis.findUnique as Mock).mockResolvedValue({
      id: 'an-1',
      diseaseAreaId: 'da-1',
      weightsJson: {
        weightPublications: 50, weightClinicalTrials: 0, weightTradePubs: 0,
        weightOrgLeadership: 0, weightOrgAwards: 0, weightConference: 0,
        weightSocialMedia: 0, weightMediaPodcasts: 0, weightSurvey: 50,
      },
      campaigns: [{ campaignId: 'A', included: true }],
    });
    (prisma.surveyQuestion.findMany as Mock).mockResolvedValue([
      { nominationType: 'NATIONAL_LEADER' },
    ]);
    (prisma.nomination.findMany as Mock).mockResolvedValue([...noms('eric', 'A', 10)]);
    // Eric has Publications=80; no other objective rows.
    (prisma.hcpDiseaseAreaScore.findMany as Mock).mockResolvedValue([
      { hcpId: 'eric', scorePublications: 80 },
    ]);

    await svc.recalculateAnalysis('an-1');

    const rows = (prisma.hcpAnalysisScore.createMany as Mock).mock.calls[0][0].data;
    const eric = rows.find((r: { hcpId: string }) => r.hcpId === 'eric');
    // survey = 100 (sole HCP). composite = 100*0.5 + 80*0.5 = 90.
    expect(Number(eric.scoreSurvey)).toBeCloseTo(100, 5);
    expect(Number(eric.compositeScore)).toBeCloseTo(90, 5);
  });

  it('sets calcStatus=error and rethrows on failure', async () => {
    (prisma.kolAnalysis.findUnique as Mock).mockResolvedValue({
      id: 'an-1', diseaseAreaId: 'da-1', weightsJson: {}, campaigns: [{ campaignId: 'A', included: true }],
    });
    (prisma.surveyQuestion.findMany as Mock).mockResolvedValue([]);
    (prisma.nomination.findMany as Mock).mockRejectedValue(new Error('db down'));

    await expect(svc.recalculateAnalysis('an-1')).rejects.toThrow('db down');
    const lastUpdate = (prisma.kolAnalysis.update as Mock).mock.calls.at(-1)?.[0];
    expect(lastUpdate.data.calcStatus).toBe('error');
  });

  it('empty included set clears scores and finishes done', async () => {
    (prisma.kolAnalysis.findUnique as Mock).mockResolvedValue({
      id: 'an-1', diseaseAreaId: 'da-1', weightsJson: {},
      campaigns: [{ campaignId: 'A', included: false }],
    });

    const res = await svc.recalculateAnalysis('an-1');
    expect(res.processed).toBe(0);
    expect(prisma.hcpAnalysisScore.deleteMany).toHaveBeenCalledWith({ where: { analysisId: 'an-1' } });
  });
});
