# Module 7A: Response Collection & Review

## Objective
Build admin view of survey responses with review and edit capability.

## Prerequisites
- Module 6A completed

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/campaigns/:id/responses` | List responses |
| GET | `/api/v1/campaigns/:id/responses/:rid` | Get response detail |
| PUT | `/api/v1/campaigns/:id/responses/:rid` | Edit response (admin) |
| POST | `/api/v1/campaigns/:id/responses/:rid/exclude` | Exclude response |
| POST | `/api/v1/campaigns/:id/responses/:rid/include` | Re-include response |

---

## Response Service

`apps/api/src/services/response.service.ts`:

```typescript
import { prisma } from '../lib/prisma';

export class ResponseService {
  async listForCampaign(campaignId: string, params: { status?: string; page: number; limit: number }) {
    const { status, page, limit } = params;
    
    const where: any = { campaignId };
    if (status) where.status = status;

    const [total, items] = await Promise.all([
      prisma.surveyResponse.count({ where }),
      prisma.surveyResponse.findMany({
        where,
        include: {
          respondentHcp: {
            select: { id: true, npi: true, firstName: true, lastName: true, email: true },
          },
          _count: { select: { nominations: true } },
        },
        orderBy: { completedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async getResponseDetail(responseId: string) {
    return prisma.surveyResponse.findUnique({
      where: { id: responseId },
      include: {
        respondentHcp: true,
        answers: {
          include: {
            question: {
              include: { question: true },
            },
          },
          orderBy: { question: { sortOrder: 'asc' } },
        },
        nominations: {
          include: {
            matchedHcp: { select: { id: true, firstName: true, lastName: true, npi: true } },
          },
        },
        payment: true,
      },
    });
  }

  async updateAnswer(responseId: string, questionId: string, value: any) {
    const isJson = typeof value === 'object';
    
    return prisma.surveyResponseAnswer.upsert({
      where: { responseId_questionId: { responseId, questionId } },
      create: {
        responseId,
        questionId,
        answerText: isJson ? null : String(value),
        answerJson: isJson ? value : null,
      },
      update: {
        answerText: isJson ? null : String(value),
        answerJson: isJson ? value : null,
      },
    });
  }

  async excludeResponse(responseId: string, reason: string, excludedBy: string) {
    // Soft exclude by marking in metadata
    return prisma.surveyResponse.update({
      where: { id: responseId },
      data: {
        // Store exclusion info in a JSON field or separate table
        // For now, we'll use status
        status: 'EXCLUDED' as any, // Would need to add to enum
      },
    });
  }
}
```

---

## Frontend: Response List

`apps/web/src/app/admin/campaigns/[id]/responses/page.tsx`:

Features:
- Table: Respondent, Status, Completion Date, Nominations Count
- Filter by status
- Click row to view detail
- Export button

---

## Acceptance Criteria

- [ ] List all responses for campaign
- [ ] Filter by status (pending, completed, etc.)
- [ ] View individual response with all answers
- [ ] Admin can edit answers
- [ ] Exclude invalid responses
- [ ] Audit log for edits

---

# Module 7B: Nomination Matching

## Objective
Build UI for matching raw nomination text to HCP records.

## Prerequisites
- Module 7A completed

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/campaigns/:id/nominations` | List all nominations |
| GET | `/api/v1/campaigns/:id/nominations/unmatched` | Get unmatched only |
| GET | `/api/v1/nominations/:id/suggestions` | Get match suggestions |
| POST | `/api/v1/nominations/:id/match` | Match to existing HCP |
| POST | `/api/v1/nominations/:id/create-hcp` | Create new HCP and match |
| POST | `/api/v1/nominations/:id/exclude` | Mark as excluded |
| POST | `/api/v1/nominations/bulk-match` | Bulk auto-match |

---

## Nomination Service

`apps/api/src/services/nomination.service.ts`:

```typescript
import { prisma } from '../lib/prisma';

export class NominationService {
  async listForCampaign(campaignId: string, params: { status?: string; page: number; limit: number }) {
    const where: any = {
      response: { campaignId },
    };
    if (params.status) where.matchStatus = params.status;

    const [total, items] = await Promise.all([
      prisma.nomination.count({ where }),
      prisma.nomination.findMany({
        where,
        include: {
          matchedHcp: { select: { id: true, npi: true, firstName: true, lastName: true } },
          question: { include: { question: true } },
          nominatorHcp: { select: { firstName: true, lastName: true } },
        },
        orderBy: [{ matchStatus: 'asc' }, { rawNameEntered: 'asc' }],
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
    ]);

    return { items, pagination: { page: params.page, limit: params.limit, total, pages: Math.ceil(total / params.limit) } };
  }

  async getSuggestions(nominationId: string) {
    const nomination = await prisma.nomination.findUnique({
      where: { id: nominationId },
    });

    if (!nomination) return [];

    // Parse name parts
    const nameParts = nomination.rawNameEntered.toLowerCase().split(/\s+/).filter(Boolean);
    
    // Search HCPs by name parts and aliases
    const suggestions = await prisma.hcp.findMany({
      where: {
        OR: [
          ...nameParts.map(part => ({
            OR: [
              { firstName: { contains: part, mode: 'insensitive' as const } },
              { lastName: { contains: part, mode: 'insensitive' as const } },
            ],
          })),
          { aliases: { some: { aliasName: { contains: nomination.rawNameEntered, mode: 'insensitive' } } } },
        ],
      },
      include: { aliases: true },
      take: 10,
    });

    // Score and sort by relevance
    return suggestions.map(hcp => {
      const fullName = `${hcp.firstName} ${hcp.lastName}`.toLowerCase();
      const rawName = nomination.rawNameEntered.toLowerCase();
      
      let score = 0;
      if (fullName === rawName) score = 100;
      else if (fullName.includes(rawName) || rawName.includes(fullName)) score = 80;
      else if (hcp.aliases.some(a => a.aliasName.toLowerCase() === rawName)) score = 90;
      else score = 50; // Partial match

      return { hcp, score };
    }).sort((a, b) => b.score - a.score);
  }

  async matchToHcp(nominationId: string, hcpId: string, addAlias: boolean, matchedBy: string) {
    const nomination = await prisma.nomination.findUnique({ where: { id: nominationId } });
    if (!nomination) throw new Error('Nomination not found');

    // Optionally add as alias
    if (addAlias) {
      await prisma.hcpAlias.upsert({
        where: { hcpId_aliasName: { hcpId, aliasName: nomination.rawNameEntered } },
        create: { hcpId, aliasName: nomination.rawNameEntered, createdBy: matchedBy },
        update: {},
      });
    }

    return prisma.nomination.update({
      where: { id: nominationId },
      data: {
        matchedHcpId: hcpId,
        matchStatus: 'MATCHED',
        matchedBy,
        matchedAt: new Date(),
      },
    });
  }

  async createHcpAndMatch(nominationId: string, hcpData: any, matchedBy: string) {
    const nomination = await prisma.nomination.findUnique({ where: { id: nominationId } });
    if (!nomination) throw new Error('Nomination not found');

    // Create new HCP
    const hcp = await prisma.hcp.create({
      data: {
        ...hcpData,
        createdBy: matchedBy,
      },
    });

    // Add raw name as alias
    await prisma.hcpAlias.create({
      data: { hcpId: hcp.id, aliasName: nomination.rawNameEntered, createdBy: matchedBy },
    });

    // Update nomination
    return prisma.nomination.update({
      where: { id: nominationId },
      data: {
        matchedHcpId: hcp.id,
        matchStatus: 'NEW_HCP',
        matchedBy,
        matchedAt: new Date(),
      },
    });
  }

  async exclude(nominationId: string, matchedBy: string) {
    return prisma.nomination.update({
      where: { id: nominationId },
      data: {
        matchStatus: 'EXCLUDED',
        matchedBy,
        matchedAt: new Date(),
      },
    });
  }

  async getStats(campaignId: string) {
    const stats = await prisma.nomination.groupBy({
      by: ['matchStatus'],
      where: { response: { campaignId } },
      _count: true,
    });

    return stats.reduce((acc, s) => {
      acc[s.matchStatus] = s._count;
      return acc;
    }, {} as Record<string, number>);
  }
}
```

---

## Frontend: Nomination Matching UI

`apps/web/src/app/admin/campaigns/[id]/nominations/page.tsx`:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ NOMINATION MATCHING: Dry Eye 2025                                       │
│                                                                         │
│ Progress: ████████░░ 156/200 matched (78%)                             │
│ [Unmatched: 44] [Matched: 140] [New HCP: 12] [Excluded: 4]             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ "Bob Linstrum"                              From: Dr. Jane Smith    │ │
│ │ Question: National Advisors                                         │ │
│ │                                                                     │ │
│ │ Suggested matches:                                                  │ │
│ │ ○ Dr. Robert Linstrum (NPI: 1234567890) - 95% match                │ │
│ │ ○ Dr. Bob Lindstrom (NPI: 0987654321) - 80% match                  │ │
│ │                                                                     │ │
│ │ ☑ Add "Bob Linstrum" as alias for selected HCP                     │ │
│ │                                                                     │ │
│ │ [✓ Match to Selected]  [Create New HCP]  [Exclude]  [Skip]         │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ "Dr. Smith at Mayo"                         From: Dr. John Doe      │ │
│ │ ...                                                                 │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Acceptance Criteria

- [ ] List all nominations with match status
- [ ] Show unmatched nominations prominently
- [ ] Suggest HCP matches based on name similarity
- [ ] Match nomination to existing HCP
- [ ] Optionally add raw name as alias
- [ ] Create new HCP from nomination
- [ ] Exclude invalid nominations
- [ ] Show matching progress
- [ ] Bulk auto-match for exact matches

---

# Module 8A: Score Calculation & Publishing

## Objective
Calculate survey scores from nominations and publish to HCP database.

## Prerequisites
- Module 7B completed

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/campaigns/:id/calculate-scores` | Calculate scores |
| GET | `/api/v1/campaigns/:id/scores/preview` | Preview before publish |
| POST | `/api/v1/campaigns/:id/publish` | Publish scores |
| GET | `/api/v1/campaigns/:id/scores` | Get published scores |

---

## Score Calculation Service

`apps/api/src/services/score.service.ts`:

```typescript
import { prisma } from '../lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';

export class ScoreService {
  async calculateCampaignScores(campaignId: string) {
    // Get all matched nominations for this campaign
    const nominations = await prisma.nomination.findMany({
      where: {
        response: { campaignId },
        matchStatus: 'MATCHED',
        matchedHcpId: { not: null },
      },
    });

    // Count nominations per HCP
    const nominationCounts: Record<string, number> = {};
    for (const nom of nominations) {
      if (nom.matchedHcpId) {
        nominationCounts[nom.matchedHcpId] = (nominationCounts[nom.matchedHcpId] || 0) + 1;
      }
    }

    // Find max for normalization
    const maxCount = Math.max(...Object.values(nominationCounts), 1);

    // Get campaign with score config
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { compositeScoreConfig: true, diseaseArea: true },
    });

    if (!campaign?.compositeScoreConfig) {
      throw new Error('Campaign has no score configuration');
    }

    const config = campaign.compositeScoreConfig;

    // Calculate scores for each HCP
    const scores = [];
    for (const [hcpId, count] of Object.entries(nominationCounts)) {
      // Survey score: normalized to 0-100
      const surveyScore = new Decimal((count / maxCount) * 100);

      // Get disease area scores for composite calculation
      const diseaseAreaScore = await prisma.hcpDiseaseAreaScore.findFirst({
        where: { hcpId, diseaseAreaId: campaign.diseaseAreaId, isCurrent: true },
      });

      // Calculate composite
      let compositeScore = new Decimal(0);
      if (diseaseAreaScore) {
        compositeScore = compositeScore
          .plus(new Decimal(diseaseAreaScore.scorePublications || 0).times(config.weightPublications).div(100))
          .plus(new Decimal(diseaseAreaScore.scoreClinicalTrials || 0).times(config.weightClinicalTrials).div(100))
          .plus(new Decimal(diseaseAreaScore.scoreTradePubs || 0).times(config.weightTradePubs).div(100))
          .plus(new Decimal(diseaseAreaScore.scoreOrgLeadership || 0).times(config.weightOrgLeadership).div(100))
          .plus(new Decimal(diseaseAreaScore.scoreOrgAwareness || 0).times(config.weightOrgAwareness).div(100))
          .plus(new Decimal(diseaseAreaScore.scoreConference || 0).times(config.weightConference).div(100))
          .plus(new Decimal(diseaseAreaScore.scoreSocialMedia || 0).times(config.weightSocialMedia).div(100))
          .plus(new Decimal(diseaseAreaScore.scoreMediaPodcasts || 0).times(config.weightMediaPodcasts).div(100));
      }
      compositeScore = compositeScore.plus(surveyScore.times(config.weightSurvey).div(100));

      scores.push({
        hcpId,
        nominationCount: count,
        surveyScore,
        compositeScore,
      });
    }

    // Upsert campaign scores
    for (const score of scores) {
      await prisma.hcpCampaignScore.upsert({
        where: { hcpId_campaignId: { hcpId: score.hcpId, campaignId } },
        create: {
          hcpId: score.hcpId,
          campaignId,
          nominationCount: score.nominationCount,
          scoreSurvey: score.surveyScore,
          compositeScore: score.compositeScore,
          calculatedAt: new Date(),
        },
        update: {
          nominationCount: score.nominationCount,
          scoreSurvey: score.surveyScore,
          compositeScore: score.compositeScore,
          calculatedAt: new Date(),
        },
      });
    }

    return { calculated: scores.length };
  }

  async publishScores(campaignId: string) {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { hcpCampaignScores: true },
    });

    if (!campaign) throw new Error('Campaign not found');
    if (campaign.status !== 'CLOSED') throw new Error('Campaign must be closed before publishing');

    // Update campaign status
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });

    // Mark campaign scores as published
    await prisma.hcpCampaignScore.updateMany({
      where: { campaignId },
      data: { publishedAt: new Date() },
    });

    // Update disease area aggregate scores (SCD Type 2)
    await this.updateDiseaseAreaScores(campaign.diseaseAreaId);

    return { published: true };
  }

  async updateDiseaseAreaScores(diseaseAreaId: string) {
    // Get all HCPs with scores in this disease area
    const hcpIds = await prisma.hcpCampaignScore.findMany({
      where: { campaign: { diseaseAreaId } },
      select: { hcpId: true },
      distinct: ['hcpId'],
    });

    for (const { hcpId } of hcpIds) {
      // Sum nominations across all campaigns in this disease area
      const aggregation = await prisma.hcpCampaignScore.aggregate({
        where: { hcpId, campaign: { diseaseAreaId, status: 'PUBLISHED' } },
        _sum: { nominationCount: true },
        _count: true,
      });

      // Get current score record
      const current = await prisma.hcpDiseaseAreaScore.findFirst({
        where: { hcpId, diseaseAreaId, isCurrent: true },
      });

      // Calculate new survey score (will be normalized when all HCPs processed)
      const totalNominations = aggregation._sum.nominationCount || 0;

      // SCD Type 2: close old record if values changed
      if (current && current.totalNominationCount !== totalNominations) {
        await prisma.hcpDiseaseAreaScore.update({
          where: { id: current.id },
          data: { isCurrent: false, effectiveTo: new Date() },
        });

        // Create new record
        await prisma.hcpDiseaseAreaScore.create({
          data: {
            hcpId,
            diseaseAreaId,
            // Copy objective scores
            scorePublications: current.scorePublications,
            scoreClinicalTrials: current.scoreClinicalTrials,
            scoreTradePubs: current.scoreTradePubs,
            scoreOrgLeadership: current.scoreOrgLeadership,
            scoreOrgAwareness: current.scoreOrgAwareness,
            scoreConference: current.scoreConference,
            scoreSocialMedia: current.scoreSocialMedia,
            scoreMediaPodcasts: current.scoreMediaPodcasts,
            // Update survey data
            totalNominationCount: totalNominations,
            campaignCount: aggregation._count,
            isCurrent: true,
            lastCalculatedAt: new Date(),
          },
        });
      } else if (!current) {
        // Create first record
        await prisma.hcpDiseaseAreaScore.create({
          data: {
            hcpId,
            diseaseAreaId,
            totalNominationCount: totalNominations,
            campaignCount: aggregation._count,
            isCurrent: true,
            lastCalculatedAt: new Date(),
          },
        });
      }
    }
  }
}
```

---

## Acceptance Criteria

- [ ] Calculate survey scores from nomination counts
- [ ] Normalize scores to 0-100 scale
- [ ] Calculate composite scores using weights
- [ ] Preview scores before publishing
- [ ] Check for unmatched nominations (warn if >10%)
- [ ] Publish updates HcpCampaignScore
- [ ] Publish updates HcpDiseaseAreaScore (SCD Type 2)
- [ ] Campaign status changes to PUBLISHED

---

# Module 9A: Client Portal

## Objective
Build client-facing portal to view published survey results.

## Prerequisites
- Module 8A completed

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/portal/campaigns` | List client's published campaigns |
| GET | `/api/v1/portal/campaigns/:id` | Get campaign summary |
| GET | `/api/v1/portal/campaigns/:id/leaderboard` | HCP leaderboard |
| GET | `/api/v1/portal/campaigns/:id/hcps/:hcpId` | HCP score detail |
| GET | `/api/v1/portal/disease-areas/:id/scores` | Lite client: disease area scores |

---

## Portal Service

`apps/api/src/services/portal.service.ts`:

```typescript
import { prisma } from '../lib/prisma';

export class PortalService {
  async getCampaignsForClient(clientId: string) {
    return prisma.campaign.findMany({
      where: { clientId, status: 'PUBLISHED' },
      include: {
        diseaseArea: { select: { name: true } },
        _count: { select: { hcpCampaignScores: true } },
      },
      orderBy: { publishedAt: 'desc' },
    });
  }

  async getCampaignSummary(campaignId: string, clientId: string) {
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, clientId, status: 'PUBLISHED' },
      include: {
        diseaseArea: true,
        compositeScoreConfig: true,
        _count: {
          select: {
            surveyResponses: { where: { status: 'COMPLETED' } },
            hcpCampaignScores: true,
          },
        },
      },
    });

    if (!campaign) return null;

    // Get score distribution
    const scoreDistribution = await prisma.hcpCampaignScore.groupBy({
      by: [],
      where: { campaignId },
      _avg: { compositeScore: true },
      _max: { compositeScore: true },
      _min: { compositeScore: true },
    });

    return {
      campaign,
      stats: {
        completedResponses: campaign._count.surveyResponses,
        scoredHcps: campaign._count.hcpCampaignScores,
        ...scoreDistribution[0],
      },
    };
  }

  async getLeaderboard(campaignId: string, clientId: string, params: { page: number; limit: number; sortBy?: string }) {
    // Verify access
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, clientId, status: 'PUBLISHED' },
    });
    if (!campaign) throw new Error('Campaign not found');

    const { page, limit, sortBy = 'compositeScore' } = params;

    const [total, items] = await Promise.all([
      prisma.hcpCampaignScore.count({ where: { campaignId } }),
      prisma.hcpCampaignScore.findMany({
        where: { campaignId },
        include: {
          hcp: {
            select: {
              id: true, npi: true, firstName: true, lastName: true,
              specialty: true, city: true, state: true,
            },
          },
        },
        orderBy: { [sortBy]: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    // Add rank
    const ranked = items.map((item, index) => ({
      ...item,
      rank: (page - 1) * limit + index + 1,
    }));

    return { items: ranked, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async getHcpScoreDetail(campaignId: string, hcpId: string, clientId: string) {
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, clientId, status: 'PUBLISHED' },
      include: { diseaseArea: true },
    });
    if (!campaign) throw new Error('Campaign not found');

    const [campaignScore, diseaseAreaScore] = await Promise.all([
      prisma.hcpCampaignScore.findUnique({
        where: { hcpId_campaignId: { hcpId, campaignId } },
        include: { hcp: true },
      }),
      prisma.hcpDiseaseAreaScore.findFirst({
        where: { hcpId, diseaseAreaId: campaign.diseaseAreaId, isCurrent: true },
      }),
    ]);

    return {
      hcp: campaignScore?.hcp,
      campaignScore,
      diseaseAreaScore,
    };
  }

  // For Lite Clients
  async getDiseaseAreaScores(diseaseAreaId: string, clientId: string, params: { page: number; limit: number }) {
    // Verify lite client access
    const access = await prisma.liteClientDiseaseArea.findFirst({
      where: { clientId, diseaseAreaId, isActive: true },
    });
    if (!access) throw new Error('Access denied');

    const { page, limit } = params;

    const [total, items] = await Promise.all([
      prisma.hcpDiseaseAreaScore.count({ where: { diseaseAreaId, isCurrent: true } }),
      prisma.hcpDiseaseAreaScore.findMany({
        where: { diseaseAreaId, isCurrent: true },
        include: {
          hcp: {
            select: { id: true, npi: true, firstName: true, lastName: true, specialty: true, state: true },
          },
        },
        orderBy: { compositeScore: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }
}
```

---

## Frontend: Client Portal

`apps/web/src/app/portal/page.tsx` - Campaign list for client
`apps/web/src/app/portal/campaigns/[id]/page.tsx` - Campaign results

Features:
- List published campaigns
- View completion stats
- Leaderboard sorted by composite score
- Filter/sort by score segments
- View individual HCP breakdown
- Export to Excel

---

## Acceptance Criteria

- [ ] Client users only see their campaigns
- [ ] Only PUBLISHED campaigns visible
- [ ] View survey completion statistics
- [ ] Leaderboard with ranking
- [ ] Sort by any score segment
- [ ] View HCP score breakdown
- [ ] Lite clients see disease area scores

---

# Module 9B: Exports & Payment Processing

## Objective
Build Excel exports and payment workflow.

## Prerequisites
- Module 9A completed

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/campaigns/:id/export/responses` | Export survey responses |
| POST | `/api/v1/campaigns/:id/export/scores` | Export HCP scores |
| POST | `/api/v1/campaigns/:id/export/payments` | Export for payment processing |
| GET | `/api/v1/campaigns/:id/payments` | List payments |
| POST | `/api/v1/campaigns/:id/payments/import-status` | Import payment status |

---

## Export Service

`apps/api/src/services/export.service.ts`:

```typescript
import { prisma } from '../lib/prisma';
import * as XLSX from 'xlsx';

export class ExportService {
  async exportResponses(campaignId: string) {
    const responses = await prisma.surveyResponse.findMany({
      where: { campaignId, status: 'COMPLETED' },
      include: {
        respondentHcp: true,
        answers: { include: { question: { include: { question: true } } } },
      },
    });

    const questions = await prisma.surveyQuestion.findMany({
      where: { campaignId },
      orderBy: { sortOrder: 'asc' },
    });

    // Build rows
    const rows = responses.map(r => {
      const row: Record<string, any> = {
        NPI: r.respondentHcp.npi,
        'First Name': r.respondentHcp.firstName,
        'Last Name': r.respondentHcp.lastName,
        Email: r.respondentHcp.email,
        'Completed At': r.completedAt?.toISOString(),
      };

      // Add answers
      for (const q of questions) {
        const answer = r.answers.find(a => a.questionId === q.id);
        row[q.questionTextSnapshot] = answer?.answerText || JSON.stringify(answer?.answerJson) || '';
      }

      return row;
    });

    return this.createExcelBuffer(rows, 'Responses');
  }

  async exportScores(campaignId: string) {
    const scores = await prisma.hcpCampaignScore.findMany({
      where: { campaignId },
      include: {
        hcp: true,
        campaign: { include: { diseaseArea: true } },
      },
      orderBy: { compositeScore: 'desc' },
    });

    // Get disease area scores for objective metrics
    const diseaseAreaScores = await prisma.hcpDiseaseAreaScore.findMany({
      where: {
        hcpId: { in: scores.map(s => s.hcpId) },
        diseaseAreaId: scores[0]?.campaign.diseaseAreaId,
        isCurrent: true,
      },
    });

    const daScoreMap = new Map(diseaseAreaScores.map(s => [s.hcpId, s]));

    const rows = scores.map((s, index) => {
      const da = daScoreMap.get(s.hcpId);
      return {
        Rank: index + 1,
        NPI: s.hcp.npi,
        'First Name': s.hcp.firstName,
        'Last Name': s.hcp.lastName,
        Specialty: s.hcp.specialty,
        City: s.hcp.city,
        State: s.hcp.state,
        'Publications Score': da?.scorePublications?.toNumber() || '',
        'Clinical Trials Score': da?.scoreClinicalTrials?.toNumber() || '',
        'Trade Pubs Score': da?.scoreTradePubs?.toNumber() || '',
        'Org Leadership Score': da?.scoreOrgLeadership?.toNumber() || '',
        'Org Awareness Score': da?.scoreOrgAwareness?.toNumber() || '',
        'Conference Score': da?.scoreConference?.toNumber() || '',
        'Social Media Score': da?.scoreSocialMedia?.toNumber() || '',
        'Media/Podcasts Score': da?.scoreMediaPodcasts?.toNumber() || '',
        'Survey Score': s.scoreSurvey?.toNumber() || '',
        'Nomination Count': s.nominationCount,
        'Composite Score': s.compositeScore?.toNumber() || '',
      };
    });

    return this.createExcelBuffer(rows, 'HCP Scores');
  }

  async exportPayments(campaignId: string) {
    const payments = await prisma.payment.findMany({
      where: { campaignId, status: 'PENDING_EXPORT' },
      include: {
        hcp: true,
        response: true,
        campaign: true,
      },
    });

    const rows = payments.map(p => ({
      NPI: p.hcp.npi,
      'First Name': p.hcp.firstName,
      'Last Name': p.hcp.lastName,
      Email: p.hcp.email,
      'Survey Completion Date': p.response.completedAt?.toISOString().split('T')[0],
      'Campaign Name': p.campaign.name,
      'Payment Amount': p.amount.toNumber(),
    }));

    // Mark as exported
    const batchId = await this.createExportBatch(campaignId, payments.length);
    await prisma.payment.updateMany({
      where: { id: { in: payments.map(p => p.id) } },
      data: { status: 'EXPORTED', exportedAt: new Date(), exportBatchId: batchId },
    });

    return this.createExcelBuffer(rows, 'Payments');
  }

  async importPaymentStatus(campaignId: string, buffer: Buffer, importedBy: string) {
    const workbook = XLSX.read(buffer);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet);

    const result = { processed: 0, updated: 0, errors: [] as any[] };

    for (const row of rows) {
      result.processed++;
      try {
        const npi = String(row.NPI || row.npi).trim();
        const status = String(row.Status || row.status).toUpperCase();

        // Map external status to our enum
        const statusMap: Record<string, string> = {
          SENT: 'EMAIL_SENT',
          DELIVERED: 'EMAIL_DELIVERED',
          OPENED: 'EMAIL_OPENED',
          CLAIMED: 'CLAIMED',
          ACCEPTED: 'CLAIMED',
          BOUNCED: 'BOUNCED',
          REJECTED: 'REJECTED',
          EXPIRED: 'EXPIRED',
        };

        const mappedStatus = statusMap[status];
        if (!mappedStatus) throw new Error(`Unknown status: ${status}`);

        const payment = await prisma.payment.findFirst({
          where: { campaignId, hcp: { npi } },
        });

        if (!payment) throw new Error(`Payment not found for NPI: ${npi}`);

        // Update status
        await prisma.payment.update({
          where: { id: payment.id },
          data: { status: mappedStatus as any, statusUpdatedAt: new Date() },
        });

        // Log history
        await prisma.paymentStatusHistory.create({
          data: {
            paymentId: payment.id,
            oldStatus: payment.status,
            newStatus: mappedStatus as any,
            changedBy: importedBy,
          },
        });

        result.updated++;
      } catch (error: any) {
        result.errors.push({ row: result.processed, error: error.message });
      }
    }

    return result;
  }

  private createExcelBuffer(rows: any[], sheetName: string): Buffer {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }

  private async createExportBatch(campaignId: string, count: number) {
    const batch = await prisma.paymentExportBatch.create({
      data: {
        campaignId,
        exportedBy: 'system', // Would be actual user
        recordCount: count,
      },
    });
    return batch.id;
  }
}
```

---

## Frontend: Payments Page

`apps/web/src/app/admin/campaigns/[id]/payments/page.tsx`:

Features:
- List all payments with status
- Filter by status
- Export pending payments button
- Import status file upload
- View payment history per HCP

---

## Acceptance Criteria

- [ ] Export survey responses to Excel
- [ ] Export HCP scores to Excel
- [ ] Export payments (only pending_export)
- [ ] Payment export marks records as exported
- [ ] Import payment status updates
- [ ] Status history tracked
- [ ] View payment status per HCP

---

## Build Complete! 🎉

All Phase 1 modules are now documented. The build sequence is:

1. **Foundation**: 0A → 0B → 0C
2. **Core**: 1A → 1B → 2A
3. **Survey Config**: 3A → 3B → 4A
4. **Campaign**: 5A → 5B → 6A
5. **Processing**: 7A → 7B → 8A
6. **Delivery**: 9A → 9B

Each module can be fed to Claude Code as a standalone prompt.
