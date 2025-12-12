# Module 4A: Composite Score Configuration

## Objective
Build weight configuration for the 9 scoring segments per campaign.

## Prerequisites
- Module 3B completed

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/campaigns/:id/score-config` | Get score weights |
| PUT | `/api/v1/campaigns/:id/score-config` | Update weights |
| POST | `/api/v1/campaigns/:id/score-config/reset` | Reset to defaults |

---

## Default Weights

| Segment | Code | Default Weight |
|---------|------|---------------|
| Peer-reviewed Publications | `publications` | 10% |
| Clinical Trials | `clinicalTrials` | 15% |
| Trade Publications | `tradePubs` | 10% |
| Organization Leadership | `orgLeadership` | 10% |
| Organization Awareness | `orgAwareness` | 10% |
| Conference Presentations | `conference` | 10% |
| Social Media | `socialMedia` | 5% |
| Media/Podcasts | `mediaPodcasts` | 5% |
| Survey (Sociometric) | `survey` | 25% |
| **Total** | | **100%** |

---

## Schema

```typescript
const scoreConfigSchema = z.object({
  weightPublications: z.number().min(0).max(100),
  weightClinicalTrials: z.number().min(0).max(100),
  weightTradePubs: z.number().min(0).max(100),
  weightOrgLeadership: z.number().min(0).max(100),
  weightOrgAwareness: z.number().min(0).max(100),
  weightConference: z.number().min(0).max(100),
  weightSocialMedia: z.number().min(0).max(100),
  weightMediaPodcasts: z.number().min(0).max(100),
  weightSurvey: z.number().min(0).max(100),
}).refine(
  (data) => {
    const sum = Object.values(data).reduce((a, b) => a + b, 0);
    return Math.abs(sum - 100) < 0.01; // Allow floating point tolerance
  },
  { message: 'Weights must sum to 100%' }
);
```

---

## Frontend Component

`apps/web/src/components/campaigns/score-config-form.tsx`:

```typescript
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

const segments = [
  { key: 'weightPublications', label: 'Peer-reviewed Publications' },
  { key: 'weightClinicalTrials', label: 'Clinical Trials' },
  { key: 'weightTradePubs', label: 'Trade Publications' },
  { key: 'weightOrgLeadership', label: 'Organization Leadership' },
  { key: 'weightOrgAwareness', label: 'Organization Awareness' },
  { key: 'weightConference', label: 'Conference Presentations' },
  { key: 'weightSocialMedia', label: 'Social Media' },
  { key: 'weightMediaPodcasts', label: 'Media/Podcasts' },
  { key: 'weightSurvey', label: 'Survey Score' },
];

export function ScoreConfigForm({ config, onSave, onReset }) {
  const form = useForm({
    defaultValues: config,
  });

  const values = form.watch();
  const total = segments.reduce((sum, s) => sum + (values[s.key] || 0), 0);

  return (
    <form onSubmit={form.handleSubmit(onSave)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {segments.map((segment) => (
          <div key={segment.key} className="flex items-center gap-2">
            <Label className="flex-1">{segment.label}</Label>
            <Input
              type="number"
              min={0}
              max={100}
              className="w-20"
              {...form.register(segment.key, { valueAsNumber: true })}
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
        ))}
      </div>

      <div className={`text-right font-bold ${total !== 100 ? 'text-red-600' : 'text-green-600'}`}>
        Total: {total}%
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onReset}>
          Reset to Defaults
        </Button>
        <Button type="submit" disabled={total !== 100}>
          Save Weights
        </Button>
      </div>
    </form>
  );
}
```

---

## Acceptance Criteria

- [ ] View current score weights for campaign
- [ ] Edit weights with real-time total calculation
- [ ] Validation: weights must sum to 100%
- [ ] Reset to default weights
- [ ] Config auto-created with defaults when campaign created

---

# Module 5A: Campaign Management

## Objective
Build campaign CRUD with full workflow.

## Prerequisites
- Module 4A completed

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/campaigns` | List campaigns (filtered by client) |
| GET | `/api/v1/campaigns/:id` | Get campaign details |
| POST | `/api/v1/campaigns` | Create campaign |
| PUT | `/api/v1/campaigns/:id` | Update campaign |
| POST | `/api/v1/campaigns/:id/activate` | DRAFT → ACTIVE |
| POST | `/api/v1/campaigns/:id/close` | ACTIVE → CLOSED |
| POST | `/api/v1/campaigns/:id/reopen` | CLOSED → ACTIVE |
| POST | `/api/v1/campaigns/:id/publish` | CLOSED → PUBLISHED |
| DELETE | `/api/v1/campaigns/:id` | Delete (draft only) |

---

## Campaign Status Flow

```
                    ┌──────────┐
                    │  DRAFT   │
                    └────┬─────┘
                         │ activate
                         ▼
                    ┌──────────┐
         ┌─────────│  ACTIVE  │◄────────┐
         │ close   └──────────┘ reopen  │
         ▼                              │
    ┌──────────┐                        │
    │  CLOSED  │────────────────────────┘
    └────┬─────┘
         │ publish
         ▼
    ┌──────────┐
    │ PUBLISHED│ (terminal)
    └──────────┘
```

---

## Campaign Service

`apps/api/src/services/campaign.service.ts`:

```typescript
import { prisma } from '../lib/prisma';
import { SurveyTemplateService } from './survey-template.service';

const surveyTemplateService = new SurveyTemplateService();

interface CreateCampaignInput {
  clientId: string;
  diseaseAreaId: string;
  name: string;
  description?: string;
  surveyTemplateId?: string;
  honorariumAmount?: number;
  surveyOpenDate?: Date;
  surveyCloseDate?: Date;
}

export class CampaignService {
  async list(params: { clientId?: string; status?: string; page: number; limit: number }) {
    const { clientId, status, page, limit } = params;
    
    const where: any = {};
    if (clientId) where.clientId = clientId;
    if (status) where.status = status;

    const [total, items] = await Promise.all([
      prisma.campaign.count({ where }),
      prisma.campaign.findMany({
        where,
        include: {
          client: { select: { id: true, name: true } },
          diseaseArea: { select: { id: true, name: true } },
          _count: { 
            select: { 
              campaignHcps: true, 
              surveyResponses: true,
            } 
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async getById(id: string) {
    return prisma.campaign.findUnique({
      where: { id },
      include: {
        client: true,
        diseaseArea: true,
        surveyTemplate: true,
        compositeScoreConfig: true,
        surveyQuestions: {
          include: { question: true },
          orderBy: { sortOrder: 'asc' },
        },
        _count: {
          select: {
            campaignHcps: true,
            surveyResponses: true,
          },
        },
      },
    });
  }

  async create(data: CreateCampaignInput, createdBy: string) {
    const campaign = await prisma.campaign.create({
      data: {
        ...data,
        createdBy,
        status: 'DRAFT',
      },
    });

    // Create default score config
    await prisma.compositeScoreConfig.create({
      data: { campaignId: campaign.id },
    });

    // If template selected, instantiate questions
    if (data.surveyTemplateId) {
      await surveyTemplateService.instantiateForCampaign(
        data.surveyTemplateId,
        campaign.id
      );
    }

    return campaign;
  }

  async update(id: string, data: Partial<CreateCampaignInput>) {
    return prisma.campaign.update({ where: { id }, data });
  }

  async activate(id: string) {
    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (campaign?.status !== 'DRAFT') {
      throw new Error('Can only activate draft campaigns');
    }

    // Validate: must have HCPs and questions
    const hcpCount = await prisma.campaignHcp.count({ where: { campaignId: id } });
    const questionCount = await prisma.surveyQuestion.count({ where: { campaignId: id } });

    if (hcpCount === 0) throw new Error('Campaign must have at least one HCP');
    if (questionCount === 0) throw new Error('Campaign must have survey questions');

    return prisma.campaign.update({
      where: { id },
      data: { status: 'ACTIVE' },
    });
  }

  async close(id: string) {
    return prisma.campaign.update({
      where: { id },
      data: { status: 'CLOSED' },
    });
  }

  async reopen(id: string) {
    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (campaign?.status !== 'CLOSED') {
      throw new Error('Can only reopen closed campaigns');
    }

    return prisma.campaign.update({
      where: { id },
      data: { status: 'ACTIVE' },
    });
  }

  async publish(id: string) {
    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (campaign?.status !== 'CLOSED') {
      throw new Error('Can only publish closed campaigns');
    }

    return prisma.campaign.update({
      where: { id },
      data: { 
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });
  }
}
```

---

## Acceptance Criteria

- [ ] Create campaign with client, disease area, name
- [ ] Select and clone survey template
- [ ] Configure score weights
- [ ] Set honorarium amount
- [ ] Activate (requires HCPs and questions)
- [ ] Close survey
- [ ] Reopen if needed
- [ ] Publish scores
- [ ] Status workflow enforced

---

# Module 5B: Survey Distribution

## Objective
Build HCP assignment, token generation, and email sending.

## Prerequisites
- Module 5A completed

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/campaigns/:id/hcps` | List assigned HCPs |
| POST | `/api/v1/campaigns/:id/hcps` | Assign HCPs (bulk) |
| DELETE | `/api/v1/campaigns/:id/hcps/:hcpId` | Remove HCP |
| POST | `/api/v1/campaigns/:id/hcps/import` | Import HCPs from Excel |
| POST | `/api/v1/campaigns/:id/send-invitations` | Send survey emails |
| POST | `/api/v1/campaigns/:id/send-reminders` | Send reminders |
| GET | `/api/v1/campaigns/:id/distribution-stats` | Get send statistics |

---

## Email Service (AWS SES)

`apps/api/src/services/email.service.ts`:

```typescript
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const ses = new SESClient({ region: process.env.AWS_REGION });
const FROM_EMAIL = process.env.SES_FROM_EMAIL || 'noreply@bio-exec.com';
const SURVEY_BASE_URL = process.env.SURVEY_BASE_URL || 'https://kol360.bio-exec.com';

export class EmailService {
  async sendSurveyInvitation(params: {
    to: string;
    hcpName: string;
    surveyToken: string;
    campaignName: string;
    honorarium?: number;
  }) {
    const surveyUrl = `${SURVEY_BASE_URL}/survey/${params.surveyToken}`;

    const html = `
      <h2>You're Invited to Participate in a KOL Survey</h2>
      <p>Dear Dr. ${params.hcpName},</p>
      <p>You have been selected to participate in our ${params.campaignName} survey.</p>
      ${params.honorarium ? `<p>Upon completion, you will receive a $${params.honorarium} honorarium.</p>` : ''}
      <p><a href="${surveyUrl}" style="background:#0066CC;color:white;padding:12px 24px;text-decoration:none;border-radius:4px;">Take Survey</a></p>
      <p>Or copy this link: ${surveyUrl}</p>
      <hr />
      <p style="font-size:12px;color:#666;">
        Don't want to receive these emails? <a href="${SURVEY_BASE_URL}/unsubscribe/${params.surveyToken}">Unsubscribe</a>
      </p>
    `;

    await ses.send(new SendEmailCommand({
      Source: FROM_EMAIL,
      Destination: { ToAddresses: [params.to] },
      Message: {
        Subject: { Data: `Survey Invitation: ${params.campaignName}` },
        Body: { Html: { Data: html } },
      },
    }));
  }

  async sendReminder(params: {
    to: string;
    hcpName: string;
    surveyToken: string;
    campaignName: string;
    reminderNumber: number;
  }) {
    const surveyUrl = `${SURVEY_BASE_URL}/survey/${params.surveyToken}`;

    const html = `
      <h2>Reminder: Complete Your Survey</h2>
      <p>Dear Dr. ${params.hcpName},</p>
      <p>This is a friendly reminder to complete the ${params.campaignName} survey.</p>
      <p><a href="${surveyUrl}" style="background:#0066CC;color:white;padding:12px 24px;text-decoration:none;border-radius:4px;">Complete Survey</a></p>
    `;

    await ses.send(new SendEmailCommand({
      Source: FROM_EMAIL,
      Destination: { ToAddresses: [params.to] },
      Message: {
        Subject: { Data: `Reminder: ${params.campaignName} Survey` },
        Body: { Html: { Data: html } },
      },
    }));
  }
}
```

---

## Distribution Service

`apps/api/src/services/distribution.service.ts`:

```typescript
import { prisma } from '../lib/prisma';
import { EmailService } from './email.service';

const emailService = new EmailService();

export class DistributionService {
  async assignHcps(campaignId: string, hcpIds: string[]) {
    const existing = await prisma.campaignHcp.findMany({
      where: { campaignId, hcpId: { in: hcpIds } },
      select: { hcpId: true },
    });
    const existingIds = new Set(existing.map(e => e.hcpId));
    const newIds = hcpIds.filter(id => !existingIds.has(id));

    if (newIds.length > 0) {
      await prisma.campaignHcp.createMany({
        data: newIds.map(hcpId => ({ campaignId, hcpId })),
      });

      // Create survey response records
      await prisma.surveyResponse.createMany({
        data: newIds.map(hcpId => ({
          campaignId,
          respondentHcpId: hcpId,
          surveyToken: prisma.campaignHcp.findFirst({
            where: { campaignId, hcpId },
            select: { surveyToken: true },
          }).then(r => r!.surveyToken),
        })),
        skipDuplicates: true,
      });
    }

    return { added: newIds.length, skipped: existingIds.size };
  }

  async sendInvitations(campaignId: string) {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        campaignHcps: {
          where: { emailSentAt: null },
          include: { hcp: true },
        },
      },
    });

    if (!campaign) throw new Error('Campaign not found');
    if (campaign.status !== 'ACTIVE') throw new Error('Campaign must be active');

    let sent = 0;
    let failed = 0;

    for (const ch of campaign.campaignHcps) {
      if (!ch.hcp.email) {
        failed++;
        continue;
      }

      // Check opt-out
      const optOut = await prisma.optOut.findFirst({
        where: {
          email: ch.hcp.email,
          OR: [
            { scope: 'GLOBAL' },
            { scope: 'CAMPAIGN', campaignId },
          ],
          resubscribedAt: null,
        },
      });

      if (optOut) {
        failed++;
        continue;
      }

      try {
        await emailService.sendSurveyInvitation({
          to: ch.hcp.email,
          hcpName: ch.hcp.lastName,
          surveyToken: ch.surveyToken,
          campaignName: campaign.name,
          honorarium: campaign.honorariumAmount?.toNumber(),
        });

        await prisma.campaignHcp.update({
          where: { id: ch.id },
          data: { emailSentAt: new Date() },
        });

        sent++;
      } catch (error) {
        failed++;
      }
    }

    return { sent, failed };
  }

  async sendReminders(campaignId: string) {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        campaignHcps: {
          where: {
            emailSentAt: { not: null },
          },
          include: {
            hcp: true,
          },
        },
        surveyResponses: {
          where: { status: { in: ['PENDING', 'OPENED', 'IN_PROGRESS'] } },
          select: { respondentHcpId: true },
        },
      },
    });

    if (!campaign) throw new Error('Campaign not found');

    const incompleteHcpIds = new Set(campaign.surveyResponses.map(r => r.respondentHcpId));
    let sent = 0;

    for (const ch of campaign.campaignHcps) {
      if (!incompleteHcpIds.has(ch.hcpId) || !ch.hcp.email) continue;

      try {
        await emailService.sendReminder({
          to: ch.hcp.email,
          hcpName: ch.hcp.lastName,
          surveyToken: ch.surveyToken,
          campaignName: campaign.name,
          reminderNumber: ch.reminderCount + 1,
        });

        await prisma.campaignHcp.update({
          where: { id: ch.id },
          data: {
            reminderCount: { increment: 1 },
            lastReminderAt: new Date(),
          },
        });

        sent++;
      } catch (error) {
        // Log but continue
      }
    }

    return { sent };
  }

  async getStats(campaignId: string) {
    const [total, invited, started, completed] = await Promise.all([
      prisma.campaignHcp.count({ where: { campaignId } }),
      prisma.campaignHcp.count({ where: { campaignId, emailSentAt: { not: null } } }),
      prisma.surveyResponse.count({ 
        where: { campaignId, status: { in: ['OPENED', 'IN_PROGRESS'] } } 
      }),
      prisma.surveyResponse.count({ where: { campaignId, status: 'COMPLETED' } }),
    ]);

    return {
      total,
      invited,
      notInvited: total - invited,
      started,
      completed,
      completionRate: invited > 0 ? Math.round((completed / invited) * 100) : 0,
    };
  }
}
```

---

## Acceptance Criteria

- [ ] Assign HCPs to campaign (bulk or import)
- [ ] Each HCP gets unique survey token
- [ ] Send invitation emails
- [ ] Respects opt-out list
- [ ] Send reminder emails
- [ ] Track email sent dates and reminder counts
- [ ] View distribution statistics

---

# Module 6A: Survey Taking Experience

## Objective
Build public survey UI that respondents access via unique token.

## Prerequisites
- Module 5B completed

---

## API Endpoints (Public - No Auth Required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/survey/take/:token` | Get survey for token |
| POST | `/api/v1/survey/take/:token/start` | Mark survey started |
| POST | `/api/v1/survey/take/:token/save` | Save progress |
| POST | `/api/v1/survey/take/:token/submit` | Submit survey |
| POST | `/api/v1/unsubscribe/:token` | Opt-out from survey |

---

## Survey Taking Service

`apps/api/src/services/survey-taking.service.ts`:

```typescript
import { prisma } from '../lib/prisma';

export class SurveyTakingService {
  async getSurveyByToken(token: string) {
    const campaignHcp = await prisma.campaignHcp.findUnique({
      where: { surveyToken: token },
      include: {
        campaign: {
          include: {
            surveyQuestions: {
              include: { question: true },
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
        hcp: {
          select: { firstName: true, lastName: true },
        },
      },
    });

    if (!campaignHcp) return null;

    // Get existing response if any
    const response = await prisma.surveyResponse.findUnique({
      where: { surveyToken: token },
      include: {
        answers: true,
      },
    });

    return {
      campaign: {
        name: campaignHcp.campaign.name,
        status: campaignHcp.campaign.status,
      },
      hcp: campaignHcp.hcp,
      questions: campaignHcp.campaign.surveyQuestions.map(sq => ({
        id: sq.id,
        questionId: sq.questionId,
        text: sq.questionTextSnapshot,
        type: sq.question.type,
        section: sq.sectionName,
        isRequired: sq.isRequired,
        options: sq.question.options,
      })),
      response: response ? {
        status: response.status,
        answers: response.answers.reduce((acc, a) => {
          acc[a.questionId] = a.answerText || a.answerJson;
          return acc;
        }, {} as Record<string, any>),
      } : null,
    };
  }

  async startSurvey(token: string, ipAddress?: string) {
    const response = await prisma.surveyResponse.findUnique({
      where: { surveyToken: token },
    });

    if (!response) {
      // Create response record if not exists
      const campaignHcp = await prisma.campaignHcp.findUnique({
        where: { surveyToken: token },
      });

      if (!campaignHcp) throw new Error('Invalid token');

      return prisma.surveyResponse.create({
        data: {
          campaignId: campaignHcp.campaignId,
          respondentHcpId: campaignHcp.hcpId,
          surveyToken: token,
          status: 'OPENED',
          startedAt: new Date(),
          ipAddress,
        },
      });
    }

    if (response.status === 'COMPLETED') {
      throw new Error('Survey already completed');
    }

    return prisma.surveyResponse.update({
      where: { surveyToken: token },
      data: {
        status: response.status === 'PENDING' ? 'OPENED' : response.status,
        startedAt: response.startedAt || new Date(),
      },
    });
  }

  async saveProgress(token: string, answers: Record<string, any>) {
    const response = await prisma.surveyResponse.findUnique({
      where: { surveyToken: token },
    });

    if (!response || response.status === 'COMPLETED') {
      throw new Error('Cannot save to this survey');
    }

    // Update status to in progress
    await prisma.surveyResponse.update({
      where: { id: response.id },
      data: { status: 'IN_PROGRESS' },
    });

    // Upsert answers
    for (const [questionId, value] of Object.entries(answers)) {
      const isJson = typeof value === 'object';
      
      await prisma.surveyResponseAnswer.upsert({
        where: {
          responseId_questionId: {
            responseId: response.id,
            questionId,
          },
        },
        create: {
          responseId: response.id,
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

    return { saved: true };
  }

  async submitSurvey(token: string, answers: Record<string, any>) {
    // Save final answers
    await this.saveProgress(token, answers);

    const response = await prisma.surveyResponse.findUnique({
      where: { surveyToken: token },
      include: {
        campaign: true,
        answers: {
          include: {
            question: {
              include: { question: true },
            },
          },
        },
      },
    });

    if (!response) throw new Error('Survey not found');

    // Mark completed
    await prisma.surveyResponse.update({
      where: { id: response.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });

    // Create nominations from MULTI_TEXT answers
    const nominations = [];
    for (const answer of response.answers) {
      if (answer.question.question.type === 'MULTI_TEXT' && answer.answerJson) {
        const names = answer.answerJson as string[];
        for (const name of names.filter(Boolean)) {
          nominations.push({
            responseId: response.id,
            questionId: answer.questionId,
            nominatorHcpId: response.respondentHcpId,
            rawNameEntered: name.trim(),
          });
        }
      }
    }

    if (nominations.length > 0) {
      await prisma.nomination.createMany({ data: nominations });
    }

    // Create payment record if honorarium set
    if (response.campaign.honorariumAmount) {
      await prisma.payment.create({
        data: {
          campaignId: response.campaignId,
          hcpId: response.respondentHcpId,
          responseId: response.id,
          amount: response.campaign.honorariumAmount,
          status: 'PENDING_EXPORT',
        },
      });
    }

    return { submitted: true };
  }
}
```

---

## Frontend: Survey Page

`apps/web/src/app/survey/[token]/page.tsx`:

Key features:
- No auth required (public page)
- Progress bar
- Section headers
- Question types render correctly
- MULTI_TEXT: dynamic add/remove fields (max 10)
- Auto-save every 30 seconds
- Submit button validates required fields
- Completion message

---

## Acceptance Criteria

- [ ] Access survey via token URL
- [ ] Validate token and campaign status
- [ ] Display questions by section
- [ ] All question types render and save correctly
- [ ] MULTI_TEXT allows up to 10 entries
- [ ] Auto-save progress
- [ ] Submit creates nominations from MULTI_TEXT
- [ ] Submit creates payment record if honorarium set
- [ ] Cannot resubmit completed survey
- [ ] Opt-out link works

---

## Next Module
→ `7A-response-collection.md` - Admin response review
