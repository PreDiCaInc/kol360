# Module 3A: Question Bank

## Objective
Build question management with CRUD and categorization.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/questions` | List questions with filters |
| GET | `/api/v1/questions/:id` | Get question |
| POST | `/api/v1/questions` | Create question |
| PUT | `/api/v1/questions/:id` | Update question |
| DELETE | `/api/v1/questions/:id` | Archive question |

## Key Features

- Question types: TEXT, NUMBER, RATING, SINGLE_CHOICE, MULTI_CHOICE, DROPDOWN, MULTI_TEXT
- Categories: Demographics, Nominations, Custom
- Tags for organization
- Usage count tracking
- Archive instead of delete (preserve survey history)

## Question Schema

```typescript
const createQuestionSchema = z.object({
  text: z.string().min(10).max(500),
  type: z.enum(['TEXT', 'NUMBER', 'RATING', 'SINGLE_CHOICE', 'MULTI_CHOICE', 'DROPDOWN', 'MULTI_TEXT']),
  category: z.string().optional(),
  isRequired: z.boolean().default(false),
  options: z.array(z.string()).optional(), // For choice questions
  tags: z.array(z.string()).default([]),
});
```

---

# Module 3B: Survey Builder

## Objective
Build section templates and survey templates management.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/sections` | List section templates |
| POST | `/api/v1/sections` | Create section template |
| PUT | `/api/v1/sections/:id` | Update section |
| POST | `/api/v1/sections/:id/questions` | Add question to section |
| DELETE | `/api/v1/sections/:id/questions/:qId` | Remove question |
| GET | `/api/v1/survey-templates` | List survey templates |
| POST | `/api/v1/survey-templates` | Create survey template |
| PUT | `/api/v1/survey-templates/:id` | Update template |
| POST | `/api/v1/survey-templates/:id/clone` | Clone template |

## Architecture

```
Question Bank → Section Templates → Survey Templates → Campaign Survey
```

- Questions can be reused across sections
- Sections can be reused across templates
- Templates are cloned when assigned to campaigns
- Question text is snapshotted on campaign assignment

---

# Module 4A: Composite Score Configuration

## Objective
Build weight configuration for the 9 scoring segments.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/campaigns/:id/score-config` | Get score weights |
| PUT | `/api/v1/campaigns/:id/score-config` | Update weights |

## Default Weights

| Segment | Default Weight |
|---------|---------------|
| Publications | 10% |
| Clinical Trials | 15% |
| Trade Pubs | 10% |
| Org Leadership | 10% |
| Org Awareness | 10% |
| Conference | 10% |
| Social Media | 5% |
| Media/Podcasts | 5% |
| Survey (Sociometric) | 25% |
| **Total** | **100%** |

## Validation

Weights must sum to exactly 100.

---

# Module 5A: Campaign Management

## Objective
Build campaign CRUD with status workflow.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/campaigns` | List campaigns |
| GET | `/api/v1/campaigns/:id` | Get campaign details |
| POST | `/api/v1/campaigns` | Create campaign |
| PUT | `/api/v1/campaigns/:id` | Update campaign |
| POST | `/api/v1/campaigns/:id/activate` | Activate (DRAFT → ACTIVE) |
| POST | `/api/v1/campaigns/:id/close` | Close survey (ACTIVE → CLOSED) |
| POST | `/api/v1/campaigns/:id/publish` | Publish scores (CLOSED → PUBLISHED) |

## Campaign Status Flow

```
DRAFT → ACTIVE → CLOSED → PUBLISHED
  ↑_______|  (can reopen)
```

## Campaign Creation Flow

1. Select client
2. Select disease area
3. Enter name and description
4. Set honorarium amount
5. Select/clone survey template
6. Assign HCPs
7. Configure score weights
8. Save as draft

---

# Module 5B: Survey Distribution

## Objective
Build token generation, email sending, and reminder management.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/campaigns/:id/hcps` | Assign HCPs to campaign |
| DELETE | `/api/v1/campaigns/:id/hcps/:hcpId` | Remove HCP |
| POST | `/api/v1/campaigns/:id/send-invitations` | Send survey emails |
| POST | `/api/v1/campaigns/:id/send-reminders` | Send reminders |
| GET | `/api/v1/campaigns/:id/distribution-status` | Get send status |

## Token Generation

```typescript
// Each HCP gets unique token
const campaignHcp = await prisma.campaignHcp.create({
  data: {
    campaignId,
    hcpId,
    surveyToken: generateCuid(), // Unique, URL-safe
  },
});
```

## Survey Link Format

```
https://kol360.bio-exec.com/survey/{surveyToken}
```

## Email Templates (AWS SES)

- Invitation email
- Reminder email (1st, 2nd, 3rd)
- Completion confirmation

---

# Module 6A: Survey Taking Experience

## Objective
Build public survey UI that respondents access via unique token.

## API Endpoints (Public - No Auth)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/survey/take/:token` | Get survey for token |
| POST | `/api/v1/survey/take/:token/start` | Mark survey started |
| POST | `/api/v1/survey/take/:token/save` | Save progress |
| POST | `/api/v1/survey/take/:token/submit` | Submit survey |

## Survey Flow

1. User clicks email link → `/survey/{token}`
2. Validate token, check not already completed
3. Display survey questions
4. Auto-save progress
5. Submit → mark completed, create nominations

## Key Features

- Mobile-responsive
- Progress indicator
- Auto-save every 30 seconds
- One submission per token
- MULTI_TEXT fields for nominations (max 10, dynamic add)

---

# Module 7A: Response Collection & Review

## Objective
Build admin view of survey responses with review capability.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/campaigns/:id/responses` | List responses |
| GET | `/api/v1/campaigns/:id/responses/:rid` | Get response detail |
| PUT | `/api/v1/campaigns/:id/responses/:rid` | Edit response (admin) |
| POST | `/api/v1/campaigns/:id/responses/:rid/exclude` | Exclude response |

## Response Statuses

- PENDING - Not started
- OPENED - Link clicked
- IN_PROGRESS - Partially completed
- COMPLETED - Submitted

## Admin Review Features

- View all responses for campaign
- Filter by status
- View individual answers
- Edit answers if needed
- Exclude invalid responses

---

# Module 7B: Nomination Matching

## Objective
Build UI for matching raw nomination text to HCP records.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/campaigns/:id/nominations` | List nominations |
| GET | `/api/v1/campaigns/:id/nominations/unmatched` | Get unmatched only |
| POST | `/api/v1/nominations/:id/match` | Match to HCP |
| POST | `/api/v1/nominations/:id/create-hcp` | Create new HCP |
| POST | `/api/v1/nominations/:id/exclude` | Mark as excluded |

## Matching Workflow

```
┌─────────────────────────────────────────────────────┐
│ NOMINATION INBOX                                    │
├─────────────────────────────────────────────────────┤
│ "Bob Linstrum" → [Suggested: Dr. Robert Linstrum]  │
│                  [✓ Match] [Create New] [Exclude]  │
│                  ☑ Add "Bob Linstrum" as alias     │
└─────────────────────────────────────────────────────┘
```

## Fuzzy Matching

Use Levenshtein distance or similar to suggest matches from:
- HCP canonical names
- Existing aliases

---

# Module 8A: Score Calculation & Publishing

## Objective
Calculate survey scores and publish to HCP database.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/campaigns/:id/calculate-scores` | Calculate survey scores |
| GET | `/api/v1/campaigns/:id/scores/preview` | Preview before publish |
| POST | `/api/v1/campaigns/:id/publish` | Publish scores |

## Score Calculation Formula

### Campaign Survey Score
```
HCP Score = (HCP nominations in this campaign) / (Max nominations in campaign) × 100
```

### Campaign Composite Score
```
Composite = Σ(segment_score × weight) for all 9 segments
```
Where 8 objective scores come from HcpDiseaseAreaScore and survey score from this campaign.

### Disease Area Survey Score (BioExec Aggregate)
```
Score = (HCP total nominations across ALL campaigns in disease area) 
      / (Max total for any HCP in disease area) × 100
```

## Publishing Flow

1. Ensure all nominations matched (or warn about unmatched %)
2. Calculate campaign scores
3. Update HcpCampaignScore
4. Recalculate HcpDiseaseAreaScore (creates new SCD row)
5. Mark campaign as PUBLISHED

---

# Module 9A: Client Portal - Results View

## Objective
Build client-facing portal to view survey results.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/portal/campaigns` | List client's campaigns |
| GET | `/api/v1/portal/campaigns/:id` | Get campaign results |
| GET | `/api/v1/portal/campaigns/:id/leaderboard` | Get HCP leaderboard |
| GET | `/api/v1/portal/campaigns/:id/hcps/:hcpId` | Get HCP detail |

## Client Portal Features

- List of their campaigns (published only)
- Survey completion stats
- HCP leaderboard by composite score
- Individual HCP score breakdown
- Filter by score segment

## Access Control

- Client users only see their client's campaigns
- Only see PUBLISHED campaigns
- Cannot see raw survey responses (only aggregated scores)

---

# Module 9B: Exports & Payments

## Objective
Build Excel exports and payment tracking.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/campaigns/:id/export/responses` | Export responses |
| POST | `/api/v1/campaigns/:id/export/scores` | Export HCP scores |
| POST | `/api/v1/campaigns/:id/export/payments` | Export for payment |
| POST | `/api/v1/campaigns/:id/payments/import-status` | Import payment status |

## Export Formats (Excel)

### Survey Responses Export
- Respondent NPI, Name, Email
- Each question as column
- Completion timestamp

### HCP Scores Export
- NPI, Name, Specialty, City, State
- 8 objective scores (from disease area)
- Survey score (from campaign)
- Composite score
- Nomination count

### Payment Export
- NPI
- Full Name
- Email
- Survey Completion Date
- Campaign Name
- Payment Amount

## Payment Workflow

1. Export completed respondents to Excel
2. Upload to 3rd party payment provider
3. Import status file back
4. Track: pending_export → exported → email_sent → claimed/bounced

---

## Phase 2 Modules (Future)

### Module 10A: Analytics Dashboards
- Config-driven dashboard system
- Standard visualizations (leaderboard, geography, trends)
- Client-specific customizations

### Module 10B: Lite Client Support
- Disease area access grants
- Live score access (no snapshot)
- Phase 2 dashboards only
