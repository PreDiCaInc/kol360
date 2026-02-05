# KOL360 Data Model: HCPs & Campaigns

## Entity Relationship Diagram

```
┌─────────────┐         ┌──────────────┐
│   Client    │         │ DiseaseArea  │
│             │         │              │
│ name        │         │ therapeutic  │
│ type        │         │ name, code   │
│ isLite      │         │ isActive     │
└──────┬──────┘         └──────┬───────┘
       │ 1:N                   │ 1:N
       ▼                       ▼
┌──────────────────────────────────────────────┐
│                  Campaign                    │
│                                              │
│ clientId (FK), diseaseAreaId (FK)            │
│ surveyTemplateId (FK)                        │
│ name, description                            │
│ status (DRAFT/ACTIVE/CLOSED/PUBLISHED)       │
│ honorariumAmount                             │
│ surveyOpenDate, surveyCloseDate              │
│ email templates (invitation, reminder, etc)  │
└──┬──────────┬──────────┬─────────────────────┘
   │ 1:N      │ 1:1      │ 1:N
   │          │          │
   ▼          ▼          ▼
CampaignHcp  Composite  SurveyQuestion
             ScoreConfig (frozen copy)
                           │ 1:N
                           ▼
                        Nomination
                           │
                           ▼
                     matched Hcp
```

---

## Core Tables

### Hcp (Healthcare Professional)

| Field           | Type    | Required | Notes                              |
|-----------------|---------|----------|------------------------------------|
| id              | cuid    | PK       |                                    |
| beId            | String  | Yes      | Unique BioExec ID                  |
| npi             | String  | No       | Unique, 10 digits                  |
| isSurveyTaker   | Boolean | Yes      | Imported via file for surveys      |
| isNominated     | Boolean | Yes      | Created via survey nominations     |
| firstName       | String  | Yes      |                                    |
| lastName        | String  | Yes      |                                    |
| email           | String  | No       | Required at import step            |
| specialty       | String  | No       | Legacy field, required at import   |
| subSpecialty     | String  | No       |                                    |
| city            | String  | No       |                                    |
| state           | String  | No       |                                    |
| yearsInPractice | Int     | No       |                                    |
| createdBy       | String  | No       |                                    |

**Relations:**

| Relation             | Target Table        | Type | Notes                              |
|----------------------|---------------------|------|------------------------------------|
| specialties          | HcpSpecialty        | 1:N  | Relational specialty model         |
| aliases              | HcpAlias            | 1:N  | Alternate names for matching       |
| campaignHcps         | CampaignHcp         | 1:N  | Campaign assignments               |
| diseaseAreaScores    | HcpDiseaseAreaScore | 1:N  | Cross-campaign scores              |
| campaignScores       | HcpCampaignScore    | 1:N  | Per-campaign nomination scores     |
| nominationsReceived  | Nomination          | 1:N  | Times this HCP was nominated       |
| nominationsGiven     | Nomination          | 1:N  | Nominations made as survey-taker   |
| surveyResponses      | SurveyResponse      | 1:N  |                                    |
| payments             | Payment             | 1:N  |                                    |
| optOuts              | OptOut              | 1:N  |                                    |
| clientExclusions     | ClientHcpExclusion  | 1:N  |                                    |
| campaignExclusions   | CampaignHcpExclusion| 1:N  |                                    |

---

### Campaign

| Field                | Type        | Required | Notes                          |
|----------------------|-------------|----------|--------------------------------|
| id                   | cuid        | PK       |                                |
| clientId             | FK→Client   | Yes      |                                |
| diseaseAreaId        | FK→DiseaseArea | Yes   |                                |
| surveyTemplateId     | FK→SurveyTemplate | No |                                |
| name                 | String      | Yes      |                                |
| description          | String      | No       |                                |
| status               | Enum        | Yes      | DRAFT/ACTIVE/CLOSED/PUBLISHED  |
| honorariumAmount     | Decimal     | No       |                                |
| surveyOpenDate       | DateTime    | No       |                                |
| surveyCloseDate      | DateTime    | No       |                                |
| publishedAt          | DateTime    | No       |                                |
| invitationEmailSubject/Body | String | No    | Email templates                |
| reminderEmailSubject/Body   | String | No    |                                |
| surveyWelcomeTitle/Message  | String | No    |                                |
| surveyThankYouTitle/Message | String | No    |                                |
| surveyAlreadyDoneTitle/Message | String | No |                                |
| scoreConfigConfirmedAt | DateTime  | No       | Workflow step timestamp        |
| templatesConfirmedAt   | DateTime  | No       | Workflow step timestamp        |

**Relations:**

| Relation           | Target Table         | Type | Notes                       |
|--------------------|----------------------|------|-----------------------------|
| campaignHcps       | CampaignHcp          | 1:N  | Survey-taker assignments    |
| surveyQuestions    | SurveyQuestion       | 1:N  | Frozen questions            |
| surveyResponses    | SurveyResponse       | 1:N  | Responses from survey-takers|
| hcpCampaignScores  | HcpCampaignScore     | 1:N  | Nomination scores per HCP   |
| compositeScoreConfig | CompositeScoreConfig | 1:1 | Scoring weights             |
| payments           | Payment              | 1:N  |                             |
| optOuts            | OptOut               | 1:N  |                             |
| hcpExclusions      | CampaignHcpExclusion | 1:N  |                             |

---

## Linking / Junction Tables

### CampaignHcp (Survey-taker ↔ Campaign)

| Field          | Type     | Notes                        |
|----------------|----------|------------------------------|
| id             | cuid     | PK                           |
| campaignId     | FK       |                              |
| hcpId          | FK       |                              |
| surveyToken    | String   | Unique, used in survey URL   |
| emailSentAt    | DateTime | When invitation was sent     |
| reminderCount  | Int      |                              |
| lastReminderAt | DateTime |                              |

**Unique constraint:** `[campaignId, hcpId]`

---

### HcpSpecialty (Hcp ↔ Specialty)

| Field       | Type    | Notes                    |
|-------------|---------|--------------------------|
| id          | cuid    | PK                       |
| hcpId       | FK      |                          |
| specialtyId | FK      |                          |
| isPrimary   | Boolean | Which is the main one    |

**Unique constraint:** `[hcpId, specialtyId]`

---

### HcpAlias (alternate names for matching)

| Field     | Type   | Notes                        |
|-----------|--------|------------------------------|
| id        | cuid   | PK                           |
| hcpId     | FK     |                              |
| aliasName | String |                              |
| createdBy | String |                              |

**Unique constraint:** `[hcpId, aliasName]`

---

### Specialty

| Field    | Type    | Notes                                    |
|----------|---------|------------------------------------------|
| id       | cuid    | PK                                       |
| name     | String  | Unique                                   |
| code     | String  | Unique                                   |
| category | String  | e.g. "Medical", "Surgical"               |
| isActive | Boolean |                                          |

---

## Survey & Nomination Flow

### SurveyResponse

| Field           | Type   | Notes                                           |
|-----------------|--------|-------------------------------------------------|
| id              | cuid   | PK                                              |
| campaignId      | FK     |                                                 |
| respondentHcpId | FK     | The survey-taker HCP                            |
| surveyToken     | String | Unique                                          |
| status          | Enum   | PENDING/OPENED/IN_PROGRESS/COMPLETED/EXCLUDED/RECENTLY_SURVEYED |
| startedAt       | DateTime |                                               |
| completedAt     | DateTime |                                               |

**Relations:** → SurveyResponseAnswer[], Nomination[], Payment

---

### Nomination

| Field           | Type   | Notes                                            |
|-----------------|--------|--------------------------------------------------|
| id              | cuid   | PK                                               |
| responseId      | FK     | → SurveyResponse                                |
| questionId      | FK     | → SurveyQuestion                                |
| nominatorHcpId  | FK     | The HCP who nominated (survey-taker)             |
| rawNameEntered  | String | Free-text name entered by nominator              |
| matchedHcpId    | FK     | → Hcp (the nominated HCP, once matched)          |
| matchStatus     | Enum   | UNMATCHED/MATCHED/NEW_HCP/EXCLUDED/REVIEW_NEEDED |
| matchType       | String | exact/primary/alias/partial                      |
| matchConfidence | Int    | 0-100                                            |
| matchedBy       | String | User who performed the match                     |
| excludeReason   | String |                                                  |

---

### Flow Diagram

```
Survey-taker HCP
  │
  │ takes survey
  ▼
SurveyResponse (status: PENDING → COMPLETED)
  │
  ├── SurveyResponseAnswer[] (their answers)
  │
  └── Nomination[] (HCPs they nominated)
        │
        │ rawNameEntered = free-text
        │
        ├── matchStatus = UNMATCHED (initial)
        │
        ├──► Auto-match or manual match
        │     │
        │     ├── MATCHED     → linked to existing Hcp
        │     ├── NEW_HCP     → new Hcp created
        │     ├── EXCLUDED    → skipped with reason
        │     └── REVIEW_NEEDED → needs human verification
        │
        └── matchedHcpId → Hcp (isNominated=true)
```

---

## Scoring

### HcpCampaignScore (per campaign)

| Field                  | Type    | Notes                     |
|------------------------|---------|---------------------------|
| hcpId                  | FK      |                           |
| campaignId             | FK      |                           |
| scoreDiscussionLeaders | Decimal | + count                  |
| scoreReferralLeaders   | Decimal | + count                  |
| scoreAdviceLeaders     | Decimal | + count                  |
| scoreNationalLeader    | Decimal | + count                  |
| scoreRisingStar        | Decimal | + count                  |
| scoreSocialLeader      | Decimal | + count                  |
| scoreSurvey            | Decimal | Consolidated survey score |
| nominationCount        | Int     |                           |
| compositeScore         | Decimal |                           |

**Unique constraint:** `[hcpId, campaignId]`

---

### HcpDiseaseAreaScore (cross-campaign, by disease area)

| Field                | Type    | Notes                        |
|----------------------|---------|------------------------------|
| hcpId                | FK      |                              |
| diseaseAreaId        | FK      |                              |
| scorePublications    | Decimal | External data                |
| scoreClinicalTrials  | Decimal | External data                |
| scoreTradePubs       | Decimal | External data                |
| scoreOrgLeadership   | Decimal | External data                |
| scoreOrgAwareness    | Decimal | External data                |
| scoreConference      | Decimal | External data                |
| scoreSocialMedia     | Decimal | External data                |
| scoreMediaPodcasts   | Decimal | External data                |
| scoreSurvey          | Decimal | From campaign scores         |
| totalNominationCount | Int     |                              |
| compositeScore       | Decimal | Weighted final score         |
| isCurrent            | Boolean | For versioning               |

---

### CompositeScoreConfig (per campaign)

| Field                | Type    | Default | Notes           |
|----------------------|---------|---------|-----------------|
| campaignId           | FK      |         | Unique, 1:1     |
| weightPublications   | Decimal | 10      |                 |
| weightClinicalTrials | Decimal | 15      |                 |
| weightTradePubs      | Decimal | 10      |                 |
| weightOrgLeadership  | Decimal | 10      |                 |
| weightOrgAwareness   | Decimal | 10      |                 |
| weightConference     | Decimal | 10      |                 |
| weightSocialMedia    | Decimal | 5       |                 |
| weightMediaPodcasts  | Decimal | 5       |                 |
| weightSurvey         | Decimal | 25      |                 |

---

### Scoring Flow

```
Nominations ──► HcpCampaignScore (per campaign)
                       │
                       │ weighted by CompositeScoreConfig
                       ▼
                HcpDiseaseAreaScore (cross-campaign)
                + 8 external scores (pubs, trials, etc)
                       │
                       ▼
                  compositeScore (final weighted score)
```

---

## Two HCP Populations

|                    | Survey-Taker              | Nominated                        |
|--------------------|---------------------------|----------------------------------|
| **Flag**           | `isSurveyTaker = true`    | `isNominated = true`             |
| **Created via**    | File import               | Survey nomination matching       |
| **Required fields**| NPI, name, email, specialty | Name only (NPI, email optional)|
| **Campaign link**  | Direct: `CampaignHcp`    | Indirect: `Nomination.matchedHcpId` |
| **Can take surveys** | Yes                     | No (unless also isSurveyTaker)   |
| **Can be both**    | Yes                       | Yes                              |

---

## Import Paths

| Import Type         | Service                     | Creates          | Assigns to Campaign |
|---------------------|-----------------------------|------------------|---------------------|
| Overall HCP Import  | `hcp.service.ts`            | Hcp only         | No                  |
| Campaign HCP Import | `distribution.service.ts`   | Hcp + CampaignHcp| Yes                 |
| Nomination Match    | `nomination.service.ts`     | Links or creates Hcp via `Nomination.matchedHcpId` | No (indirect) |

---

## Exclusion & Opt-Out

### ClientHcpExclusion
- Client-level exclusion of an HCP
- Unique: `[clientId, hcpId]`

### CampaignHcpExclusion
- Campaign-level exclusion of an HCP
- Unique: `[campaignId, hcpId]`

### OptOut
- HCP opts out of surveys
- Scope: `CAMPAIGN` (single campaign) or `GLOBAL` (all campaigns)
- Tracks `resubscribedAt` for re-enrollment

---

## Payment

### Payment

| Field               | Type    | Notes                                  |
|---------------------|---------|----------------------------------------|
| campaignId          | FK      |                                        |
| hcpId               | FK      |                                        |
| responseId          | FK      | Unique (one payment per response)      |
| amount              | Decimal |                                        |
| currency            | String  | Default: USD                           |
| status              | Enum    | PENDING_EXPORT → EXPORTED → EMAIL_SENT → CLAIMED etc |
| exportBatchId       | FK      | → PaymentExportBatch                   |
| externalReferenceId | String  |                                        |

**Unique constraint:** `[campaignId, hcpId]`

### PaymentExportBatch
- Groups payments for bulk export
- Tracks `exportedBy`, `recordCount`, `fileName`

### PaymentStatusHistory
- Audit trail of payment status changes
