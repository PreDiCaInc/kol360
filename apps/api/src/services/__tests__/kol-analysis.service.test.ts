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

// Build N nomination records of one type for an HCP from a campaign.
function noms(hcpId: string, campaignId: string, n: number, type = 'NATIONAL_LEADER') {
  return Array.from({ length: n }, () => ({
    matchedHcpId: hcpId,
    question: { nominationType: type },
    response: { campaignId, respondentHcp: { email: 'r@x.com' } },
  }));
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
