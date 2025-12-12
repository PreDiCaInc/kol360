# KOL Platform - Functional Specification

*Including Questions, Clarifications & Responses*

---

## 1. Project Overview

The objective of this project is to build a multi-tenant SaaS KOL Platform to help automate the KOL Survey process including insight generation and delivery for the clients of BioExec. This solution will cover the following modules built over 2 phases:

### Phase 1: Survey & Data Collection Platform

- Admin module for client onboarding, user management, and platform configuration (including composite score config)
- HCP module to manage the target physicians
- Question bank management module for survey customization
- Campaign-based survey module for config / deploy / track / review / publish
- Client portal for survey results viewing and data export

### Phase 2: Analytics Dashboards

- Three interactive dashboards for KOL insights and benchmarking
- Enhanced client portal with visual analytics
- Support for "Lite Clients" (data access only, no surveys)

---

## 2. Scope of Work

The scope for this statement of work developed and delivered over 2 phases of development with the following modules in each phase:

### Module 1: Admin Module (Platform Management)

Central administrative interface for BioExec team to manage the entire platform.

| Capability | Description |
|------------|-------------|
| Client Onboarding | Create new client tenants, configure branding (logo, colors, URL), set up admin users. Clients are of 2 types: a) clients who will have a campaign executed b) lite clients – who will be given access to data that already has been collected from prev campaigns from other clients. |
| User Management | Manage platform admins, client admins, and team member access |
| System Configuration | Global settings, audit logs, system-wide defaults |

#### Authentication & User Management

The platform uses **AWS Cognito** for authentication with a manual approval workflow for new user access.

**Why Cognito:**

| Requirement | Cognito Support |
|-------------|-----------------|
| Self-service signup | ✅ Built-in |
| Manual approval before access | ✅ User starts disabled until approved |
| Role-based access | ✅ Cognito Groups |
| Multi-tenant isolation | ✅ Custom attribute: `tenant_id` |
| SSO/SAML (future) | ✅ Built-in, no per-connection fees |
| Enterprise SLA | ✅ 99.9% contractual |

**Cognito Configuration:**

| Setting | Value |
|---------|-------|
| User Pool | One pool for entire platform |
| Username | Email address |
| MFA | Optional (can enable per client later) |
| Password Policy | Min 8 chars, uppercase, lowercase, number, symbol |
| Email Verification | Required |
| Account Status on Signup | Disabled (until approved) |
| Custom Attributes | `tenant_id`, `role`, `approved_at`, `approved_by` |
| Groups | `platform-admins`, `client-admins`, `team-members` |

**User States:**

| State | Can Login? | Description |
|-------|------------|-------------|
| UNCONFIRMED | No | Email not yet verified |
| CONFIRMED + DISABLED | No | Email verified, awaiting approval |
| CONFIRMED + ENABLED | Yes | Approved, full access |
| DISABLED (post-approval) | No | Access revoked by admin |

**Approval Matrix:**

| New User Type | Approved By | Notes |
|---------------|-------------|-------|
| Platform Admin | Existing Platform Admin | Rare, BioExec internal only |
| Client Admin | Platform Admin | First user for a new client |
| Client Team Member | Client Admin OR Platform Admin | Client Admin manages their own team |

#### User Signup & Approval Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 1: SELF-SERVICE SIGNUP                                         │
│ User visits signup page, enters details                             │
├─────────────────────────────────────────────────────────────────────┤
│  Name: [____________________]                                       │
│  Email: [____________________]  (becomes username)                  │
│  Company: [____________________]                                    │
│  Password: [____________________]                                   │
│  [Sign Up]                                                          │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 2: EMAIL VERIFICATION                                          │
│ Cognito sends verification code, user confirms email                │
├─────────────────────────────────────────────────────────────────────┤
│  "Check your email for a verification code"                         │
│  Code: [______]                                                     │
│  [Verify]                                                           │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 3: PENDING APPROVAL STATE                                      │
│ User account exists but is DISABLED in Cognito                      │
├─────────────────────────────────────────────────────────────────────┤
│  "Your account is pending approval.                                 │
│   You'll receive an email once approved."                           │
│  User CANNOT log in yet.                                            │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 4: ADMIN APPROVAL                                              │
│ Platform Admin or Client Admin reviews and approves                 │
├─────────────────────────────────────────────────────────────────────┤
│  PENDING USERS                                                      │
│  ┌──────────────┬─────────────┬────────────┬───────────────────┐    │
│  │ Name         │ Email       │ Company    │ Action            │    │
│  ├──────────────┼─────────────┼────────────┼───────────────────┤    │
│  │ Jane Smith   │ jane@rx.com │ Pharma Corp│ [Approve] [Reject]│    │
│  │ Bob Jones    │ bob@med.com │ MedCo      │ [Approve] [Reject]│    │
│  └──────────────┴─────────────┴────────────┴───────────────────┘    │
│                                                                     │
│  On Approve: Assign to Client (tenant_id) + Role                    │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 5: ACCESS GRANTED                                              │
│ User enabled in Cognito, welcome email sent                         │
├─────────────────────────────────────────────────────────────────────┤
│  "Your account has been approved! Click here to log in."            │
│  User can now access Client Portal                                  │
└─────────────────────────────────────────────────────────────────────┘
```

#### Admin-Initiated Invite Flow (Alternative)

Admins can directly invite users, bypassing the approval queue:

```
┌─────────────────────────────────────────────────────────────────────┐
│ INVITE NEW USER                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ Email: [____________________]                                   │ │
│ │                                                                 │ │
│ │ Client: [Pharma Corp ▼]                                         │ │
│ │                                                                 │ │
│ │ Role: ○ Client Admin  ○ Team Member                             │ │
│ │                                                                 │ │
│ │ [Cancel]                                    [Send Invitation]   │ │
│ └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

Invited user receives email with temporary password, sets new password on first login. Account is pre-approved (no pending state).

#### User Management Screen

```
┌─────────────────────────────────────────────────────────────────────┐
│ USER MANAGEMENT                                     [+ Invite User] │
│                                                                     │
│ Filter: [All Users ▼]  [All Clients ▼]  [All Statuses ▼]  [Search] │
│                                                                     │
│ ┌────────────┬─────────────────┬────────────┬──────────┬──────────┐ │
│ │ Name       │ Email           │ Client     │ Role     │ Status   │ │
│ ├────────────┼─────────────────┼────────────┼──────────┼──────────┤ │
│ │ Jane Smith │ jane@rx.com     │ Pharma Corp│ Admin    │ ● Active │ │
│ │ Bob Jones  │ bob@med.com     │ MedCo      │ Member   │ ● Active │ │
│ │ New User   │ new@pharma.com  │ —          │ —        │ ○ Pending│ │
│ │ Old User   │ old@gone.com    │ Pharma Corp│ Member   │ ○ Disabled│ │
│ └────────────┴─────────────────┴────────────┴──────────┴──────────┘ │
│                                                                     │
│ Actions: [Approve] [Disable] [Change Role] [Resend Invite]          │
└─────────────────────────────────────────────────────────────────────┘
```

#### Supported User Flows

| Flow | Description |
|------|-------------|
| Self-signup + Approval | User requests access, admin approves |
| Admin Invite | Admin creates user directly, sends invite |
| Password Reset | Self-service via Cognito |
| Role Change | Admin changes user's role |
| Disable User | Admin revokes access |
| Re-enable User | Admin restores access |

#### Data Model: Client

```
┌─────────────────────────────────────────────────────────────────────┐
│ CLIENT                                                              │
├─────────────────────────────────────────────────────────────────────┤
│ id                      PK
│ name                    e.g., "Pharma Corp"
│ type                    full | lite
│ 
│ — Branding —
│ logo_url                S3 path to uploaded logo
│ primary_color           hex code (e.g., "#0066CC")
│ secondary_color         hex code (optional)
│ 
│ — Access —
│ subdomain               e.g., "pharmacorp" → pharmacorp.kol360.com
│ is_active               boolean (soft delete)
│ 
│ — Contact —
│ primary_contact_name    main point of contact
│ primary_contact_email   
│ 
│ — Audit —
│ created_by              FK → User (platform admin who created)
│ created_at
│ updated_at
└─────────────────────────────────────────────────────────────────────┘
```

**Client Type Implications:**

| Capability | Full Client | Lite Client |
|------------|-------------|-------------|
| Run campaigns | ✅ Yes | ❌ No |
| View campaign results | ✅ Own campaigns | ✅ Assigned datasets |
| Access dashboards | ✅ Phase 2 | ✅ Phase 2 |
| Export data | ✅ Yes | ✅ Yes |
| See raw survey responses | ✅ Yes | ❌ No (scores only) |

**Lite Client Disease Area Access:**

Lite clients are granted access to one or more disease areas. They see **live** scores from HCP_DISEASE_AREA_SCORE (no snapshot).

```
┌─────────────────────────────────────────────────────────────────────┐
│ LITE_CLIENT_DISEASE_AREA (Junction Table)                           │
├─────────────────────────────────────────────────────────────────────┤
│ id                      PK
│ client_id               FK → Client (must be type=lite)
│ disease_area_id         FK → DiseaseArea
│ 
│ — Access Control —
│ is_active               boolean
│ expires_at              optional expiry date
│ 
│ — Audit —
│ granted_by              FK → User (platform admin)
│ granted_at              timestamp
│ 
│ UNIQUE(client_id, disease_area_id)
└─────────────────────────────────────────────────────────────────────┘
```

**What Lite Clients See:**
- All HCPs with scores in their assigned disease area(s)
- All 9 segment scores at disease area level (including BioExec-aggregated survey score)
- Composite score at disease area level
- Access via Phase 2 dashboards only (no campaign view, no raw survey data)

#### Data Model: User

Cognito handles authentication. App database stores preferences and extended profile.

```
┌─────────────────────────────────────────────────────────────────────┐
│ USER                                                                │
├─────────────────────────────────────────────────────────────────────┤
│ id                      PK (matches Cognito sub)
│ cognito_sub             Cognito user ID
│ email                   synced from Cognito
│ first_name              
│ last_name               
│ 
│ — Tenant —
│ client_id               FK → Client (null for platform admins)
│ role                    platform_admin | client_admin | team_member
│ 
│ — Status —
│ is_active               boolean
│ approved_at             timestamp
│ approved_by             FK → User
│ 
│ — Audit —
│ last_login_at           
│ created_at
│ updated_at
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ USER_PREFERENCE                                                     │
├─────────────────────────────────────────────────────────────────────┤
│ id                      PK
│ user_id                 FK → User
│ preference_key          e.g., "results_table_columns"
│ preference_value        JSON blob
│ 
│ UNIQUE(user_id, preference_key)
└─────────────────────────────────────────────────────────────────────┘
```

**Common Preference Keys:**

| Key | Value Example | Purpose |
|-----|---------------|---------|
| `results_table_columns` | `["name","npi","score","status"]` | Column visibility |
| `results_table_sort` | `{"column":"score","dir":"desc"}` | Default sort |
| `dashboard_layout` | `["kpi_cards","top_kols","map"]` | Dashboard component order |

#### Client Onboarding UX

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ CREATE NEW CLIENT                                               Step 1 of 3     │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│ BASIC INFORMATION                                                               │
│ ━━━━━━━━━━●━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                                                                 │
│ Client Name *                                                                   │
│ [Pharma Corp________________________________]                                   │
│                                                                                 │
│ Client Type *                                                                   │
│ ○ Full Client (runs campaigns)                                                  │
│ ○ Lite Client (data access only)                                                │
│                                                                                 │
│ Primary Contact Name *                                                          │
│ [Jane Smith_________________________________]                                   │
│                                                                                 │
│ Primary Contact Email *                                                         │
│ [jane.smith@pharmacorp.com__________________]                                   │
│                                                                                 │
│ [Cancel]                                                        [Next: Branding]│
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│ CREATE NEW CLIENT                                               Step 2 of 3     │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│ BRANDING                                                                        │
│ ━━━━━━━━━━━━━━━━━━━━●━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                                                                 │
│ Logo                                                                            │
│ ┌─────────────────────────────────────────────────────────────────────────────┐ │
│ │  📁 Drop logo here or click to browse                                       │ │
│ │  Recommended: 200x50px, PNG or SVG                                          │ │
│ └─────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                 │
│ Primary Color                                                                   │
│ [#0066CC] [■]  ← color picker                                                   │
│                                                                                 │
│ Subdomain                                                                       │
│ [pharmacorp].kol360.com                                                         │
│ ✓ Available                                                                     │
│                                                                                 │
│ [← Back]                                                     [Next: Admin User] │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│ CREATE NEW CLIENT                                               Step 3 of 3     │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│ INITIAL ADMIN USER                                                              │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━●━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                                                                 │
│ Create the first admin user for this client.                                    │
│                                                                                 │
│ First Name *                        Last Name *                                 │
│ [Jane_________________]             [Smith________________]                     │
│                                                                                 │
│ Email * (will be used for login)                                                │
│ [jane.smith@pharmacorp.com__________________]                                   │
│                                                                                 │
│ ☑ Send welcome email with login instructions                                    │
│                                                                                 │
│ ─────────────────────────────────────────────────────────────────────────────   │
│                                                                                 │
│ SUMMARY                                                                         │
│ • Client: Pharma Corp (Full Client)                                             │
│ • Portal URL: https://pharmacorp.kol360.com                                     │
│ • Admin: Jane Smith (jane.smith@pharmacorp.com)                                 │
│                                                                                 │
│ [← Back]                                                      [Create Client]   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

#### Navigation Structure

**Admin Portal Navigation (Platform Admin):**

```
┌─────────────────────┐
│ KOL360 Admin        │
├─────────────────────┤
│ 📊 Dashboard        │  ← Overview stats
├─────────────────────┤
│ 👥 Clients          │  ← Client management
│    ├ All Clients    │
│    └ + New Client   │
├─────────────────────┤
│ 🏥 HCP Database     │  ← Physician records
│    ├ All HCPs       │
│    ├ Import         │
│    └ Aliases        │
├─────────────────────┤
│ 📋 Campaigns        │  ← Campaign management
│    ├ All Campaigns  │
│    ├ + New Campaign │
│    └ Nominations    │  ← Matching queue
├─────────────────────┤
│ ❓ Question Bank    │  ← Survey questions
│    ├ Questions      │
│    ├ Sections       │
│    └ Templates      │
├─────────────────────┤
│ 👤 Users            │  ← User management
│    ├ All Users      │
│    ├ Pending        │
│    └ + Invite User  │
├─────────────────────┤
│ ⚙️ Settings         │
│    ├ Disease Areas  │
│    ├ Specialties    │
│    └ Audit Logs     │
└─────────────────────┘
```

**Client Portal Navigation (Client Admin/Team):**

```
┌─────────────────────┐
│ [Client Logo]       │
│ KOL360              │
├─────────────────────┤
│ 🏠 Home             │  ← Welcome, recent activity
├─────────────────────┤
│ 📋 Campaigns        │  ← Their campaigns only
│    └ [Campaign 1]   │
│    └ [Campaign 2]   │
├─────────────────────┤
│ 📊 Results          │  ← Survey results table
├─────────────────────┤
│ 📈 Dashboards       │  ← Phase 2
├─────────────────────┤
│ 📥 Exports          │  ← Download history
├─────────────────────┤
│ 👥 Team             │  ← Client admin only
│    ├ Members        │
│    └ + Invite       │
├─────────────────────┤
│ ⚙️ Settings         │
│    └ Profile        │
└─────────────────────┘
```

#### Audit Log Viewing UI

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ AUDIT LOGS                                                    [Platform Admin]  │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│ Filters:                                                                        │
│ Date Range: [Dec 1, 2025] to [Dec 11, 2025]                                     │
│ User: [All Users ▼]  Action: [All Actions ▼]  Resource: [All Types ▼]           │
│ [🔍 Search...]                                                    [Apply]       │
│                                                                                 │
│ ┌─────────────────────────────────────────────────────────────────────────────┐ │
│ │ Timestamp           │ User          │ Action        │ Resource    │ Details │ │
│ ├─────────────────────┼───────────────┼───────────────┼─────────────┼─────────┤ │
│ │ Dec 11, 2:34pm      │ admin@bio.com │ hcp.updated   │ HCP #1234   │ [View]  │ │
│ │ Dec 11, 2:30pm      │ jane@rx.com   │ export.created│ Campaign #5 │ [View]  │ │
│ │ Dec 11, 2:15pm      │ admin@bio.com │ user.approved │ User #89    │ [View]  │ │
│ │ Dec 11, 1:45pm      │ system        │ score.calc    │ Campaign #5 │ [View]  │ │
│ │ Dec 11, 1:30pm      │ admin@bio.com │ nom.matched   │ Nom #456    │ [View]  │ │
│ └─────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                 │
│ Showing 1-25 of 1,234                          [← Prev]  Page 1 of 50  [Next →] │
│                                                                                 │
│ [Export Logs]                                                                   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Audit Log Detail View:**

```
┌─────────────────────────────────────────────────────────────────────┐
│ AUDIT LOG DETAIL                                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ Timestamp: December 11, 2025 at 2:34:15 PM EST                      │
│ Action: hcp.updated                                                 │
│ User: admin@bioexec.com (Platform Admin)                            │
│ IP Address: 192.168.1.100                                           │
│ User Agent: Chrome 120 / macOS                                      │
│                                                                     │
│ Resource: HCP #1234 (Dr. Richard Linstrum)                          │
│                                                                     │
│ Changes:                                                            │
│ ┌─────────────────┬─────────────────┬─────────────────┐             │
│ │ Field           │ Old Value       │ New Value       │             │
│ ├─────────────────┼─────────────────┼─────────────────┤             │
│ │ email           │ old@email.com   │ new@email.com   │             │
│ │ specialty       │ Optometry       │ Ophthalmology   │             │
│ └─────────────────┴─────────────────┴─────────────────┘             │
│                                                                     │
│ [Close]                                                             │
└─────────────────────────────────────────────────────────────────────┘
```

### Module 2: HCP Database Module

Centralized physician database with comprehensive profiles and objective scoring.

| Capability | Description |
|------------|-------------|
| Physician Profiles | NPI, demographics (name, specialty, city, state), contact info |
| 9 Objective Scores | Peer-reviewed pubs, clinical trials, trade pubs, org leadership, org awareness, conference education, social media, media/podcasts, sociometric survey |
| Manual UI Updates | Add/modify/delete HCP records with search functionality |
| Bulk Import | Excel upload for batch physician data import |
| Audit History | Complete change history for all physician data updates |

HCPs will have raw scores across the 9 segments. Each campaign will create a set of raw scores for the HCP. There will also be overall scores for the HCP across campaigns (use avg for now).

#### HCP Alias Management

Survey respondents enter physician names as free text (e.g., "Bob Linstrum", "Rich Linstrum", "Richard Linstrum"). To accurately count nominations, the platform maintains an alias mapping table.

| Capability | Description |
|------------|-------------|
| Alias Directory | Master list mapping name variations to canonical HCP records (by NPI) |
| Alias CRUD | Add, edit, delete aliases for any HCP |
| Bulk Import | Excel upload for batch alias import (template provided) |
| Search | Find HCPs by any known alias |

#### Nomination Matching & Resolution

After survey completion, raw nomination text must be matched to HCP records before scores can be calculated.

| Capability | Description |
|------------|-------------|
| Nomination Inbox | Queue of unmatched nominations awaiting admin review |
| Fuzzy Matching | System suggests potential HCP matches based on name similarity |
| Manual Match | Admin selects correct HCP from suggestions or searches database |
| Auto-Add Alias | Option to add matched name as new alias (checkbox, default ON) |
| Create New HCP | Option to create new HCP record if nomination doesn't match existing |
| Match Status | Track status: Unmatched, Matched, New HCP Created, Excluded |

#### Survey Score Calculation (Segment 9)

The sociometric survey score is calculated from nomination counts after all names are matched.

| Capability | Description |
|------------|-------------|
| Mention Aggregation | Sum all mentions across name variations for each unique HCP |
| Scaled Scoring | Highest mention count = 100, others scaled proportionally |
| Category Breakdown | Track mentions by nomination category (National Advisor, Local Advisor, etc.) |
| Recalculation | Ability to recalculate scores after alias corrections |
| Score Publishing | Push calculated scores to HCP database for the campaign |

**Scoring Formula:**
```
HCP Score = (HCP Mention Count / Max Mention Count in Campaign) × 100
```

#### Nomination → Score Calculation UX Flow

```
SURVEY COMPLETION
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ SCREEN 1: NOMINATION INBOX                                          │
│ Raw nominations land here — unmatched, awaiting admin review        │
│ ┌─────────────────┬──────────────┬───────────┬───────────────────┐  │
│ │ Raw Name        │ Nominated By │ Status    │ Action            │  │
│ ├─────────────────┼──────────────┼───────────┼───────────────────┤  │
│ │ Bob Linstrum    │ Dr. Jane Doe │ ⚠ Unmatch │ [Match] [Exclude] │  │
│ │ Dr. Sarah Chen  │ Dr. Jane Doe │ ✓ Matched │ [View]            │  │
│ │ Rich Linstrum   │ Dr. J. Smith │ ⚠ Unmatch │ [Match] [Exclude] │  │
│ └─────────────────┴──────────────┴───────────┴───────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼ [Click "Match"]
┌─────────────────────────────────────────────────────────────────────┐
│ SCREEN 2: NAME MATCHING MODAL                                       │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ Raw Name: "Bob Linstrum"                                        │ │
│ │ Nominated By: Dr. Jane Doe | Category: National Advisor         │ │
│ ├─────────────────────────────────────────────────────────────────┤ │
│ │ Search HCP Database: [Bob Linstrum________] [Search]            │ │
│ │                                                                 │ │
│ │ Suggested Matches:                                              │ │
│ │ ○ Richard Linstrum (NPI: 9876543210) — Ophthalmology, Boston    │ │
│ │   Known aliases: Rich Linstrum, R. Linstrum         [Select]    │ │
│ │ ○ Robert Linstrom (NPI: 5555555555) — Cardiology, Chicago       │ │
│ │   Known aliases: Bob Linstrom                       [Select]    │ │
│ │                                                                 │ │
│ │ ☑ Add "Bob Linstrum" as new alias for selected HCP              │ │
│ │                                                                 │ │
│ │ [Cancel]  [Create New HCP Instead]  [Confirm Match]             │ │
│ └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼ [After all nominations matched]
┌─────────────────────────────────────────────────────────────────────┐
│ SCREEN 3: ALIAS MANAGEMENT (also in Admin menu)                     │
│ ┌─────────────────┬───────────┬─────────────────────────────────┐   │
│ │ Canonical Name  │ NPI       │ Known Aliases                   │   │
│ ├─────────────────┼───────────┼─────────────────────────────────┤   │
│ │ Richard Linstrum│ 9876543210│ Rich, Bob, R. Linstrum [+ Add]  │   │
│ │ Sarah Chen      │ 1111111111│ Dr. Sarah Chen, S. Chen [+ Add] │   │
│ └─────────────────┴───────────┴─────────────────────────────────┘   │
│ [Import Aliases from Excel]  [Download Template]                    │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼ [Calculate Scores]
┌─────────────────────────────────────────────────────────────────────┐
│ SCREEN 4: SURVEY SCORE CALCULATION                                  │
│ Campaign: Dry Eye 2025          Status: ✓ All matched (47/47)       │
│ ┌─────────────────┬───────────┬──────────┬───────┬────────────┐     │
│ │ HCP Name        │ NPI       │ Mentions │ Score │ Details    │     │
│ ├─────────────────┼───────────┼──────────┼───────┼────────────┤     │
│ │ Richard Linstrum│ 9876543210│ 23       │ 100   │ [View]     │     │
│ │ Sarah Chen      │ 1111111111│ 18       │ 78    │ [View]     │     │
│ │ Michael Torres  │ 2222222222│ 12       │ 52    │ [View]     │     │
│ └─────────────────┴───────────┴──────────┴───────┴────────────┘     │
│ [Recalculate]  [Export]  [Publish Scores to HCP Database]           │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼ [Click "View" on an HCP]
┌─────────────────────────────────────────────────────────────────────┐
│ SCREEN 5: MENTION DETAIL DRILLDOWN                                  │
│ Richard Linstrum (NPI: 9876543210) | Mentions: 23 | Score: 100      │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ Breakdown by Name Variation:                                    │ │
│ │   • "Richard Linstrum" — 12 mentions                            │ │
│ │   • "Bob Linstrum" — 6 mentions                                 │ │
│ │   • "Rich Linstrum" — 4 mentions                                │ │
│ │   • "R. Linstrum" — 1 mention                                   │ │
│ ├─────────────────────────────────────────────────────────────────┤ │
│ │ Nominated By:                                                   │ │
│ │ ┌──────────────────┬─────────────────┬────────────────────────┐ │ │
│ │ │ Nominator        │ Name Used       │ Category               │ │ │
│ │ ├──────────────────┼─────────────────┼────────────────────────┤ │ │
│ │ │ Dr. Jane Doe     │ Bob Linstrum    │ National Advisor       │ │ │
│ │ │ Dr. John Smith   │ Rich Linstrum   │ Local Advisor          │ │ │
│ │ │ Dr. Amy Park     │ Richard Linstrum│ National Advisor       │ │ │
│ │ └──────────────────┴─────────────────┴────────────────────────┘ │ │
│ └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

#### Data Model: HCP (Base Table)

```
┌─────────────────────────────────────────────────────────────────────┐
│ HCP                                                                 │
│ Central physician record — one row per unique NPI                   │
├─────────────────────────────────────────────────────────────────────┤
│ id                      PK
│ npi                     10-digit NPI (UNIQUE, NOT NULL)
│ first_name              NOT NULL
│ last_name               NOT NULL
│ email                   for survey invitations (nullable)
│ specialty               e.g., "Ophthalmology"
│ sub_specialty           e.g., "Retina", "Cornea"
│ city                    
│ state                   2-letter code
│ years_in_practice       positive integer
│ 
│ — Audit —
│ created_at              timestamp
│ updated_at              timestamp
│ created_by              FK → User
│ 
│ INDEX(npi)
│ INDEX(last_name, first_name)
│ INDEX(specialty)
│ INDEX(state)
└─────────────────────────────────────────────────────────────────────┘
```

**Notes:**
- NPI is the unique identifier for all HCPs in the US healthcare system
- Scores are stored separately in HCP_DISEASE_AREA_SCORE and HCP_CAMPAIGN_SCORE
- Name variations are tracked in HCP_ALIAS

#### Data Model: Nomination & Alias Tables

See **Module 6: Survey Response Collection → Nomination Tables** for the complete NOMINATION table definition.

**Relationship Overview:**

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│      HCP        │       │   HCP_ALIAS     │       │  NOMINATION     │
├─────────────────┤       ├─────────────────┤       ├─────────────────┤
│ id              │──┐    │ id              │       │ id              │
│ npi             │  │    │ hcp_id (FK)     │──┐    │ response_id (FK)│
│ canonical_name  │  └───▶│ alias_name      │  │    │ question_id (FK)│
│ ...             │       │ created_at      │  │    │ nominator_hcp_id│
└─────────────────┘       │ created_by      │  │    │ raw_name_entered│
                          └─────────────────┘  │    │ matched_hcp_id  │◀─┘
                                               │    │ match_status    │
                                               └───▶│ matched_by      │
                                                    │ matched_at      │
                                                    └─────────────────┘
```

**HCP_ALIAS Table:**

```
┌─────────────────────────────────────────────────────────────────────┐
│ HCP_ALIAS                                                           │
├─────────────────────────────────────────────────────────────────────┤
│ id                      PK
│ hcp_id                  FK → HCP
│ alias_name              e.g., "Bob Linstrum", "R. Linstrum"
│ created_by              FK → User (who created)
│ created_at              timestamp
│ 
│ UNIQUE(hcp_id, alias_name)
└─────────────────────────────────────────────────────────────────────┘
```

#### UX Design Decisions

| Decision | Approach | Rationale |
|----------|----------|-----------|
| Auto-matching | Fuzzy suggestions, admin confirms | Balance efficiency with accuracy |
| Alias creation | Checkbox default ON on match | Build alias database over time |
| Unmatched handling | Allow score calc with warning | Don't block progress, show counts |
| Bulk alias import | Before campaign + ongoing | Seed common nicknames upfront |
| Score publishing | Manual trigger | Admin controls when scores flow to HCP database |

#### Data Model: Disease Area

```
┌─────────────────────────────────────────────────────────────────────┐
│ DISEASE_AREA                                                        │
├─────────────────────────────────────────────────────────────────────┤
│ id                      PK
│ name                    e.g., "Dry Eye Disease"
│ code                    e.g., "DRY_EYE" (for URLs, exports)
│ therapeutic_area        e.g., "Ophthalmology" (parent grouping)
│ description             optional longer description
│ is_active               boolean
│ created_at
│ updated_at
└─────────────────────────────────────────────────────────────────────┘
```

**Initial Seed Data (4 Disease Areas):**

| Name | Code | Therapeutic Area |
|------|------|------------------|
| Retina | RETINA | Ophthalmology |
| Dry Eye | DRY_EYE | Ophthalmology |
| Glaucoma | GLAUCOMA | Ophthalmology |
| Cornea | CORNEA | Ophthalmology |

**Usage:**
- Campaign belongs to one disease area
- 8 objective scores maintained at disease area level (not campaign)
- Survey score calculated at both campaign level (for clients) and disease area level (BioExec aggregate)
- Lite clients granted access to disease areas (see live scores)
- Dashboards filter/group by disease area

#### Data Model: HCP Disease Area Score (BioExec Master)

This is the **master score table** for BioExec — aggregating survey scores across all campaigns within a disease area. Uses **SCD Type 2** for score history tracking.

```
┌─────────────────────────────────────────────────────────────────────┐
│ HCP_DISEASE_AREA_SCORE                                              │
│ BioExec's master view — scores at disease area level                │
├─────────────────────────────────────────────────────────────────────┤
│ id                      PK
│ hcp_id                  FK → HCP
│ disease_area_id         FK → DiseaseArea
│ 
│ — 8 Objective Scores (manually maintained, NOT campaign-dependent) —
│ score_publications      0-100, uploaded by BioExec
│ score_clinical_trials   0-100, uploaded by BioExec
│ score_trade_pubs        0-100, uploaded by BioExec
│ score_org_leadership    0-100, uploaded by BioExec
│ score_org_awareness     0-100, uploaded by BioExec
│ score_conference        0-100, uploaded by BioExec
│ score_social_media      0-100, uploaded by BioExec
│ score_media_podcasts    0-100, uploaded by BioExec
│ 
│ — Survey Score (system-calculated, aggregated across ALL campaigns) —
│ score_survey            0-100, calculated from total nominations
│ total_nomination_count  raw sum across all campaigns in this disease area
│ 
│ — Composite —
│ composite_score         weighted sum of all 9 segments
│ 
│ — SCD Type 2 (History Tracking) —
│ is_current              boolean (true = active record)
│ effective_from          when this version became active
│ effective_to            when superseded (null if current)
│ 
│ — Metadata —
│ campaign_count          how many campaigns contributed to survey score
│ last_calculated_at      when survey score was recalculated
│ created_at
│ updated_at
│ 
│ INDEX(hcp_id, disease_area_id, is_current)
└─────────────────────────────────────────────────────────────────────┘
```

**Survey Score Calculation (Disease Area Level):**

```
Survey Score = (HCP's total nominations across ALL campaigns in disease area) 
             / (Max total nominations for any HCP in disease area) × 100
```

**Example — Dry Eye Disease Area:**

| HCP | Campaign 1 | Campaign 2 | Campaign 3 | TOTAL | Survey Score |
|-----|------------|------------|------------|-------|--------------|
| Dr. Chen | 12 | 20 | 8 | 40 | 40/40 × 100 = **100** |
| Dr. Smith | 10 | 15 | 8 | 33 | 33/40 × 100 = **82.5** |
| Dr. Torres | 5 | 8 | 6 | 19 | 19/40 × 100 = **47.5** |

**SCD Type 2 Behavior:**

| Event | Action |
|-------|--------|
| Score changes (any segment) | End-date current row, insert new row with `is_current = true` |
| Query current scores | `WHERE is_current = true` |
| Query historical scores | `WHERE effective_from <= date AND (effective_to IS NULL OR effective_to > date)` |

**Recalculation Triggers:**

| Event | Action |
|-------|--------|
| Campaign published | Recalculate survey score for all HCPs in that disease area |
| Nomination matched/changed | Recalculate affected HCP's survey score |
| Objective scores uploaded | Update 8 objective scores for affected HCPs |
| Any score change | Create new SCD row, end-date previous |

#### Data Model: HCP Campaign Score (Client View)

This is the **campaign-specific** score table — what Full Clients see for their own campaigns.

```
┌─────────────────────────────────────────────────────────────────────┐
│ HCP_CAMPAIGN_SCORE                                                  │
│ Client's view — survey score specific to their campaign             │
├─────────────────────────────────────────────────────────────────────┤
│ id                      PK
│ hcp_id                  FK → HCP
│ campaign_id             FK → Campaign
│ 
│ — Survey Score (THIS campaign only) —
│ score_survey            0-100, this campaign's nominations only
│ nomination_count        raw count in this campaign
│ 
│ — Composite (combines campaign survey + disease area objectives) —
│ composite_score         weighted sum using campaign's weight config
│ 
│ — Metadata —
│ calculated_at           when scores were calculated
│ published_at            when made visible to client
│ 
│ UNIQUE(hcp_id, campaign_id)
└─────────────────────────────────────────────────────────────────────┘
```

**Campaign Survey Score Calculation:**

```
Campaign Survey Score = (HCP's nominations in THIS campaign) 
                      / (Max nominations in THIS campaign) × 100
```

**Campaign Composite Calculation:**

```
Campaign Composite = Weighted sum of:
  - 8 objective scores (from HCP_DISEASE_AREA_SCORE for this disease area)
  - 1 survey score (from HCP_CAMPAIGN_SCORE for this campaign)
  - Weights defined in campaign's COMPOSITE_SCORE_CONFIG
```

#### Who Sees What

| Viewer | Survey Score | 8 Objective Scores | Composite |
|--------|--------------|-------------------|-----------|
| **Full Client** | Campaign-specific (HCP_CAMPAIGN_SCORE) | Disease area level (HCP_DISEASE_AREA_SCORE) | Campaign composite |
| **Lite Client** | Disease area aggregate (HCP_DISEASE_AREA_SCORE) | Disease area level (HCP_DISEASE_AREA_SCORE) | Disease area composite |
| **BioExec Admin** | Both views | Disease area level | Both views |

#### HCP Profile View (BioExec Admin)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ HCP PROFILE                                                                     │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│ Dr. Richard Linstrum                                            [Edit] [Delete] │
│ NPI: 1234567890                                                                 │
│                                                                                 │
│ ┌─────────────────────────────────────────────────────────────────────────────┐ │
│ │ DEMOGRAPHICS                                                                │ │
│ │ Specialty: Ophthalmology          │ City: Boston                            │ │
│ │ Sub-specialty: Cornea             │ State: MA                               │ │
│ │ Email: rlinstrum@eyeclinic.com    │ Years in Practice: 15                   │ │
│ └─────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                 │
│ ┌─────────────────────────────────────────────────────────────────────────────┐ │
│ │ DISEASE AREA SCORES                                   Disease: [Dry Eye ▼] │ │
│ │                                                                             │ │
│ │ Composite Score: 76.5                                                       │ │
│ │                                                                             │ │
│ │ 8 OBJECTIVE SCORES (manually maintained)                                    │ │
│ │ ┌─────────────────────────────────────────────────────────────────────────┐ │ │
│ │ │ Publications        ████████████████████░░░░░░ 85                       │ │ │
│ │ │ Clinical Trials     ██████████████░░░░░░░░░░░░ 72                       │ │ │
│ │ │ Trade Pubs          █████████░░░░░░░░░░░░░░░░░ 45                       │ │ │
│ │ │ Org Leadership      ██████████████████░░░░░░░░ 90                       │ │ │
│ │ │ Org Awareness       ████████████░░░░░░░░░░░░░░ 60                       │ │ │
│ │ │ Conference          ███████████████░░░░░░░░░░░ 78                       │ │ │
│ │ │ Social Media        ███████░░░░░░░░░░░░░░░░░░░ 35                       │ │ │
│ │ │ Media/Podcasts      ██████████░░░░░░░░░░░░░░░░ 50                       │ │ │
│ │ └─────────────────────────────────────────────────────────────────────────┘ │ │
│ │                                                                             │ │
│ │ SURVEY SCORE (aggregated across 3 campaigns)                                │ │
│ │ ┌─────────────────────────────────────────────────────────────────────────┐ │ │
│ │ │ Survey (Sociometric)████████████████████░░░░░░ 100  (40 total noms)     │ │ │
│ │ └─────────────────────────────────────────────────────────────────────────┘ │ │
│ └─────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                 │
│ ┌─────────────────────────────────────────────────────────────────────────────┐ │
│ │ CAMPAIGN HISTORY (Dry Eye)                                                  │ │
│ │ ┌────────────────────┬─────────────┬───────────┬────────────┬─────────────┐ │ │
│ │ │ Campaign           │ Client      │ Status    │ Noms       │ Survey Score│ │ │
│ │ ├────────────────────┼─────────────┼───────────┼────────────┼─────────────┤ │ │
│ │ │ Dry Eye 2025       │ Pharma Corp │ Published │ 20         │ 100         │ │ │
│ │ │ Dry Eye Q2 2025    │ MedCo       │ Published │ 12         │ 85          │ │ │
│ │ │ Dry Eye 2024       │ Pharma Corp │ Published │ 8          │ 72          │ │ │
│ │ └────────────────────┴─────────────┴───────────┴────────────┴─────────────┘ │ │
│ │ Total Nominations (Dry Eye): 40                                             │ │
│ └─────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                 │
│ ┌─────────────────────────────────────────────────────────────────────────────┐ │
│ │ NOMINATIONS DETAIL (Dry Eye 2025)                               [View All]  │ │
│ │                                                                             │ │
│ │ This Campaign: 20 mentions                                                  │ │
│ │ • National Advisor: 12 mentions                                             │ │
│ │ • Local Advisor: 5 mentions                                                 │ │
│ │ • Rising Star: 3 mentions                                                   │ │
│ │                                                                             │ │
│ │ Nominated By (sample):                                                      │ │
│ │   Dr. Jane Doe, Dr. Michael Torres, Dr. Sarah Chen, +17 more                │ │
│ └─────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                 │
│ ┌─────────────────────────────────────────────────────────────────────────────┐ │
│ │ KNOWN ALIASES                                                    [+ Add]    │ │
│ │ Richard Linstrum, Rich Linstrum, Bob Linstrum, R. Linstrum, Dr. Linstrum   │ │
│ └─────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

#### HCP Bulk Import Template

**Required Columns:**

| Column | Required | Validation | Notes |
|--------|----------|------------|-------|
| NPI | Yes | 10 digits, valid NPI format | Unique identifier |
| First Name | Yes | Non-empty | |
| Last Name | Yes | Non-empty | |
| Email | No | Valid email format | For survey invitations |
| Specialty | No | Must match predefined list | |
| Sub-specialty | No | Must match predefined list | |
| City | No | | |
| State | No | 2-letter code | |
| Years in Practice | No | Positive integer | |

**Import Behavior:**

| Scenario | Action |
|----------|--------|
| NPI exists | Update non-empty fields (merge) |
| NPI new | Create new HCP record |
| NPI invalid format | Skip row, add to error report |
| Email invalid | Skip email field, import rest |
| Duplicate NPI in file | Use last occurrence |

#### Alias Bulk Import Template

**Required Columns:**

| Column | Required | Validation |
|--------|----------|------------|
| NPI | Yes | Must exist in HCP database |
| Alias | Yes | Non-empty string |

**Import Behavior:**

| Scenario | Action |
|----------|--------|
| NPI exists, alias new | Add alias |
| NPI exists, alias exists | Skip (no duplicate) |
| NPI not found | Skip row, add to error report |

#### Score Entry UX for 8 Objective Segments

The 8 objective scores are maintained at the **disease area level** (not campaign level). They are entered via bulk import (primary) or manual entry (secondary). The 9th score (survey/sociometric) is calculated automatically by the system.

**Method 1: Bulk Score Import (Primary)**

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ OBJECTIVE SCORE IMPORT                                                          │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│ Disease Area: [Dry Eye ▼]                                                       │
│                                                                                 │
│ ┌─────────────────────────────────────────────────────────────────────────────┐ │
│ │ Import Objective Scores                                                     │ │
│ │                                                                             │ │
│ │ Upload Excel file with HCP scores for the 8 objective segments.             │ │
│ │ These scores are maintained at the disease area level and apply             │ │
│ │ across all campaigns in this disease area.                                  │ │
│ │                                                                             │ │
│ │ The survey segment (9th) is calculated automatically from campaign          │ │
│ │ nominations — do not include it in the upload.                              │ │
│ │                                                                             │ │
│ │ [Download Template]                                                         │ │
│ │                                                                             │ │
│ │ ┌─────────────────────────────────────────────────────────────────────────┐ │ │
│ │ │  📁 Drop Excel file here or click to browse                             │ │ │
│ │ └─────────────────────────────────────────────────────────────────────────┘ │ │
│ └─────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Score Import Template Columns:**

| Column | Required | Validation |
|--------|----------|------------|
| NPI | Yes | Must exist in HCP database |
| Publications Score | No | 0-100 |
| Clinical Trials Score | No | 0-100 |
| Trade Pubs Score | No | 0-100 |
| Org Leadership Score | No | 0-100 |
| Org Awareness Score | No | 0-100 |
| Conference Score | No | 0-100 |
| Social Media Score | No | 0-100 |
| Media/Podcasts Score | No | 0-100 |

**Note:** Empty cells will not overwrite existing scores. To clear a score, enter 0.

**Score Import Preview:**

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ IMPORT PREVIEW                                                                  │
├─────────────────────────────────────────────────────────────────────────────────┤
│ Disease Area: Dry Eye                                                           │
│ File: dry_eye_scores_dec2025.xlsx                                               │
│ Records: 150                                                                    │
│                                                                                 │
│ ✓ Matched: 148 HCPs found in database                                           │
│ ⚠ Unmatched: 2 NPIs not found (will be skipped)                                 │
│                                                                                 │
│ Score Updates:                                                                  │
│   • Publications: 145 HCPs will be updated                                      │
│   • Clinical Trials: 142 HCPs will be updated                                   │
│   • Trade Pubs: 98 HCPs will be updated                                         │
│   • (empty cells will not overwrite existing scores)                            │
│                                                                                 │
│ ⓘ Updated scores will create new history records (SCD Type 2)                   │
│                                                                                 │
│ Unmatched NPIs:                                                                 │
│ ┌────────────────┬─────────────────────────────────────────────────────────────┐│
│ │ NPI            │ Issue                                                       ││
│ ├────────────────┼─────────────────────────────────────────────────────────────┤│
│ │ 9999999999     │ NPI not found in HCP database                               ││
│ │ 8888888888     │ NPI not found in HCP database                               ││
│ └────────────────┴─────────────────────────────────────────────────────────────┘│
│                                                                                 │
│ [Cancel]  [Download Unmatched]  [Import 148 Records]                            │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Method 2: Manual Score Entry (Secondary)**

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ HCP DISEASE AREA SCORES: Dr. Richard Linstrum (NPI: 1234567890)                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│ Disease Area: [Dry Eye ▼]                                                       │
│                                                                                 │
│ 8 OBJECTIVE SCORES (manually maintained)                                        │
│ ┌─────────────────────────────────────────────────────────────────────────────┐ │
│ │ Segment                  │ Score │ Last Updated    │ Source                 │ │
│ ├──────────────────────────┼───────┼─────────────────┼────────────────────────┤ │
│ │ Peer-reviewed Pubs       │ [85 ] │ Dec 10, 2025    │ Monocle Import         │ │
│ │ Clinical Trials          │ [72 ] │ Dec 10, 2025    │ Monocle Import         │ │
│ │ Trade Publications       │ [45 ] │ Dec 8, 2025     │ Manual Entry           │ │
│ │ Org Leadership           │ [90 ] │ Dec 5, 2025     │ Manual Entry           │ │
│ │ Org Awareness            │ [60 ] │ Dec 5, 2025     │ Manual Entry           │ │
│ │ Conference Education     │ [78 ] │ Dec 10, 2025    │ Manual Entry           │ │
│ │ Social Media             │ [35 ] │ Dec 1, 2025     │ Manual Entry           │ │
│ │ Media/Podcasts           │ [50 ] │ Dec 1, 2025     │ Manual Entry           │ │
│ └─────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                 │
│ SURVEY SCORE (system-calculated, read-only)                                     │
│ ┌─────────────────────────────────────────────────────────────────────────────┐ │
│ │ Survey (Sociometric)     │  100  │ Auto-calculated │ 40 total nominations   │ │
│ │                          │       │                 │ across 3 campaigns     │ │
│ └─────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                 │
│ DISEASE AREA COMPOSITE: 76.5 (based on default weights)                         │
│                                                                                 │
│ [Cancel]                                                    [Save Scores]       │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Score Import Audit Trail:**

Each import batch is tracked for audit purposes.

```
┌─────────────────────────────────────────────────────────────────────┐
│ SCORE_IMPORT_BATCH                                                  │
├─────────────────────────────────────────────────────────────────────┤
│ id                      PK
│ disease_area_id         FK → DiseaseArea
│ filename                original file name
│ records_total           total rows in file
│ records_imported        successfully imported
│ records_skipped         skipped (unmatched NPI, invalid data)
│ imported_by             FK → User
│ imported_at             timestamp
│ notes                   optional admin notes
└─────────────────────────────────────────────────────────────────────┘
```

### Module 3: Question Bank & Survey Builder Module

A hybrid approach combining a central question repository with reusable templates for efficient survey creation.

#### Architecture Overview

The survey system uses four layers:

```
┌─────────────────────────────────────────────────────────────────────┐
│ LAYER 1: QUESTION BANK                                              │
│ Central repository — all questions live here                        │
│ Single source of truth for question text, types, and metadata       │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ LAYER 2: SECTION TEMPLATES                                          │
│ Pre-built groupings of related questions (e.g., Demographics,       │
│ Practice Info, KOL Nominations) — reusable building blocks          │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ LAYER 3: SURVEY TEMPLATES                                           │
│ Full survey structures combining sections — starting point for      │
│ new surveys (e.g., "Standard KOL Survey")                           │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ LAYER 4: CAMPAIGN SURVEY (Instance)                                 │
│ Actual survey assigned to a campaign — locked once campaign active  │
│ Snapshot of questions frozen at time of assignment                  │
└─────────────────────────────────────────────────────────────────────┘
```

#### Layer 1: Question Bank

| Capability | Description |
|------------|-------------|
| Global Question Library | Full repository of questions covering demographics, practice info, peer nominations, and engagement |
| Question Types | Text, number, rating, single choice, multi choice, dropdown, multi-text (for physician nominations) |
| Categories | Questions organized by type: Demographics, Practice, Nominations, Engagement, Custom |
| Question Metadata | Each question tracks: text, type, category, required/optional default, tags, usage count, status |
| CRUD Operations | Create, edit, deprecate questions (edits don't affect past surveys) |
| Usage Tracking | See which surveys/campaigns use each question |
| Search & Filter | Find questions by text, category, tags, or usage |

**Question Metadata Schema:**

| Field | Purpose |
|-------|---------|
| Question text | The actual question displayed to respondent |
| Type | text, number, dropdown, single-choice, multi-choice, multi-text, rating |
| Category | demographics, practice, nominations, engagement, custom |
| Required/Optional | Default setting (can be overridden per survey) |
| Tags | Disease areas, therapeutic tags for filtering |
| Usage count | How many surveys use this question |
| Created by / date | Audit trail |
| Status | Active, Deprecated |

#### Layer 2: Section Templates

| Capability | Description |
|------------|-------------|
| Pre-built Sections | Reusable groupings: Demographics, Practice Info, KOL Nominations, Engagement |
| Section CRUD | Create, edit, delete section templates |
| Question Ordering | Define display order of questions within a section |
| Core vs Custom | Mark sections as "core" (locked by default) or "custom" (editable) |

**Standard Section Templates:**

| Section | Questions Included | Core? |
|---------|-------------------|-------|
| Demographics | First Name, Last Name, NPI, Email | Yes |
| Practice Info | Primary Specialty, Years in Practice, Patients/Month | Yes |
| KOL Nominations | National Advisors, Local Advisors, Rising Stars | Yes |
| Engagement | Conference Attendance, Clinical Trial Interest | No |
| Custom | Client-specific questions | No |

#### Layer 3: Survey Templates

| Capability | Description |
|------------|-------------|
| Template Library | Pre-configured survey structures (e.g., "Standard KOL Survey") |
| Section Assembly | Combine section templates into full survey flow |
| Template CRUD | Create, edit, clone, delete survey templates |
| Save as Template | Option to save any survey configuration as new template |
| Core Section Locking | Core sections locked by default, admin can override |

#### Layer 4: Campaign Survey (Instance)

| Capability | Description |
|------------|-------------|
| Question Snapshot | Questions frozen at time of campaign assignment |
| No Retroactive Changes | Edits to question bank don't affect active/completed surveys |
| Instance Customization | Add/remove/reorder questions before campaign goes active |
| Lock on Activation | Survey structure locked once campaign status = Active |

#### Survey Builder UX

```
┌─────────────────────────────────────────────────────────────────────┐
│ CREATE NEW SURVEY                                                   │
│                                                                     │
│ Survey Name: [_________________________________]                    │
│                                                                     │
│ Start from:                                                         │
│   ○ Blank survey                                                    │
│   ○ Survey template: [Standard KOL Survey ▼]                        │
│   ○ Clone existing: [Dry Eye 2024 - Pharma Corp ▼]                  │
│                                                                     │
│                                          [Cancel]  [Continue →]     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ SURVEY BUILDER                                                      │
│ ┌───────────────────────────────┬─────────────────────────────────┐ │
│ │ AVAILABLE                     │ SURVEY STRUCTURE                │ │
│ │                               │                                 │ │
│ │ Section Templates:            │ § Demographics (core) 🔒 [−]    │ │
│ │  [+ Demographics]             │   ├ First Name *                │ │
│ │  [+ Practice Info]            │   ├ Last Name *                 │ │
│ │  [+ KOL Nominations]          │   └ NPI *                       │ │
│ │  [+ Engagement]               │                                 │ │
│ │                               │ § Practice Info (core) 🔒 [−]   │ │
│ │ Question Bank:                │   ├ Primary Specialty *         │ │
│ │  [🔍 Search questions...]     │   └ Years in Practice           │ │
│ │  ├ How many patients/month?   │                                 │ │
│ │  ├ Conference attendance?     │ § KOL Nominations (core) 🔒 [−] │ │
│ │  ├ Clinical trial interest?   │   ├ National Advisors *         │ │
│ │  └ [+ Create New Question]    │   ├ Local Advisors *            │ │
│ │                               │   └ Rising Stars                │ │
│ │                               │                                 │ │
│ │                               │ § Custom Questions [+]          │ │
│ │                               │   └ [Drag questions here]       │ │
│ │                               │                                 │ │
│ └───────────────────────────────┴─────────────────────────────────┘ │
│                                                                     │
│ [Preview]  [Save as Template]  [Save Draft]  [Assign to Campaign]   │
└─────────────────────────────────────────────────────────────────────┘

Legend: 🔒 = Core section (locked), * = Required question
```

#### Adding a New Question

```
┌─────────────────────────────────────────────────────────────────────┐
│ ADD NEW QUESTION                                                    │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ Question Text:                                                  │ │
│ │ [What clinical trials are you currently involved in?_________]  │ │
│ │                                                                 │ │
│ │ Type: [Multi-text ▼]                                            │ │
│ │                                                                 │ │
│ │ Category: [Engagement ▼]                                        │ │
│ │                                                                 │ │
│ │ Tags: [Dry Eye] [Clinical Trials] [+ Add tag]                   │ │
│ │                                                                 │ │
│ │ ☑ Required by default                                           │ │
│ │ ☑ Add to Question Bank (reusable in future surveys)             │ │
│ │                                                                 │ │
│ │ [Cancel]                                    [Add to Survey]     │ │
│ └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

#### Data Model: Question Bank & Survey Structure

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│    Question     │       │ SectionTemplate │       │ SurveyTemplate  │
├─────────────────┤       ├─────────────────┤       ├─────────────────┤
│ id              │◀──┐   │ id              │◀──┐   │ id              │
│ text            │   │   │ name            │   │   │ name            │
│ type            │   │   │ is_core         │   │   │ description     │
│ category        │   │   │ created_at      │   │   │ created_at      │
│ is_required     │   │   └─────────────────┘   │   └─────────────────┘
│ tags            │   │           │             │           │
│ status          │   │           ▼             │           ▼
│ usage_count     │   │   ┌─────────────────┐   │   ┌─────────────────┐
│ created_at      │   │   │SectionQuestion  │   │   │TemplateSection  │
└─────────────────┘   │   ├─────────────────┤   │   ├─────────────────┤
                      ├───│ question_id(FK) │   ├───│ section_id (FK) │
                      │   │ section_id (FK) │   │   │ template_id(FK) │
                      │   │ order           │   │   │ order           │
                      │   └─────────────────┘   │   │ is_locked       │
                      │                         │   └─────────────────┘
                      │                         │
                      │   ┌─────────────────┐   │
                      │   │ CampaignSurvey  │   │
                      │   ├─────────────────┤   │
                      │   │ id              │───┘
                      │   │ campaign_id(FK) │
                      │   │ name            │
                      │   │ status          │
                      │   │ locked_at       │
                      │   └─────────────────┘
                      │           │
                      │           ▼
                      │   ┌─────────────────┐
                      │   │SurveyQuestion   │
                      │   ├─────────────────┤
                      └───│ question_id(FK) │
                          │ survey_id (FK)  │
                          │ section_name    │
                          │ order           │
                          │ is_required     │
                          │ question_text_  │ ← Snapshot of text at assignment
                          │   snapshot      │
                          └─────────────────┘
```

#### Design Decisions

| Decision | Approach | Rationale |
|----------|----------|-----------|
| Core sections editable? | Locked by default, admin override available | Prevent accidental changes to standard questions |
| Question versioning | Snapshot on campaign assignment | Once assigned, question text frozen for that survey |
| Global question edit | Updates bank only, not past surveys | Historical data integrity preserved |
| Section reordering | Allowed within survey builder | Flexibility for client-specific flow |
| Custom questions | Option to add to bank or one-off | "Add to Question Bank" checkbox for reusability |
| Clone behavior | Deep copy of structure, not linked | Changes to original don't affect clone |

### Module 4: Composite Score Configuration

Client-specific scoring weights for calculating composite KOL scores. This is done for each campaign.

| Capability | Description |
|------------|-------------|
| Weight Configuration | Set custom weights (%) for each of the 9 objective metrics per client + campaign |
| Default Weights | Peer-reviewed pubs (20%), Clinical trials (18%), Trade pubs (15%), Org leadership (12%), Conference (10%), Org awareness (8%), Media (7%), Social (5%), Survey (5%) |

### Module 5: Campaign & Survey Management

Configure, deploy, and track survey campaigns with real-time monitoring.

| Capability | Description |
|------------|-------------|
| Campaign Hierarchy | Client → Campaign → Survey structure. Support multiple campaigns per client for different therapeutic areas |
| Survey Configuration | 2 step process: questionnaire config (select questions) and physician audience config (select physicians), set branding |
| Link Generation | Unique, single-use survey tokens for each HCP with tracking capabilities |
| Email Distribution | Branded email templates with survey links, honorarium messaging, automated reminders |
| Response Tracking | Real-time status: pending, opened, in-progress, completed. Capture IP, geolocation, timestamps |
| Opt-Out Management | Handle unsubscribe requests at campaign, client, or global level |

#### Opt-Out Management

HCPs can opt out of survey communications via an unsubscribe link in email footers. The platform supports three levels of opt-out granularity.

**Opt-Out Levels:**

| Level | Blocks | Allows |
|-------|--------|--------|
| Campaign | This survey only | All other surveys |
| Global | All KOL surveys | Transactional emails (payment, confirmations) |

**Email Types & Opt-Out Applicability:**

| Email Type | Respects Opt-Out? | Notes |
|------------|-------------------|-------|
| Survey invitation | ✅ Yes | Primary opt-out target |
| Survey reminder | ✅ Yes | Same as invitation |
| Survey confirmation | ❌ No | Transactional (they just submitted) |
| Payment notification | ❌ No | Transactional (they're owed money) |
| Password reset | ❌ No | Transactional |

**Opt-Out Flow:**

```
┌─────────────────────────────────────────────────────────────────────┐
│ EMAIL FOOTER                                                        │
├─────────────────────────────────────────────────────────────────────┤
│  Questions? Contact support@kol360.com                              │
│  Don't want to receive these emails? [Unsubscribe from this survey] │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (click link)
┌─────────────────────────────────────────────────────────────────────┐
│ UNSUBSCRIBE PAGE                                                    │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ Unsubscribe: Dr. Jane Doe (jane@hospital.com)                   │ │
│ │                                                                 │ │
│ │ Please select your preference:                                  │ │
│ │                                                                 │ │
│ │ ○ Unsubscribe from this survey only                             │ │
│ │   (Dry Eye KOL Survey 2025)                                     │ │
│ │                                                                 │ │
│ │ ○ Unsubscribe from all KOL surveys                              │ │
│ │   (You will not receive any future survey invitations)          │ │
│ │                                                                 │ │
│ │ Optional: Tell us why (helps us improve)                        │ │
│ │ [________________________________]                              │ │
│ │                                                                 │ │
│ │ [Cancel]                              [Confirm Unsubscribe]     │ │
│ └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ CONFIRMATION                                                        │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ ✓ You have been unsubscribed.                                   │ │
│ │                                                                 │ │
│ │ You will no longer receive invitations for:                     │ │
│ │ • Dry Eye KOL Survey 2025                                       │ │
│ │                                                                 │ │
│ │ Changed your mind? [Re-subscribe]                               │ │
│ └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

**Data Model:**

```
┌─────────────────────────────────────────────────────────────────────┐
│ OPT_OUT                                                             │
├─────────────────────────────────────────────────────────────────────┤
│ id                      PK
│ hcp_id                  FK → HCP (null if by email only)
│ email                   email address (for matching if no HCP record)
│ 
│ — Scope —
│ scope                   campaign | global
│ campaign_id             FK → Campaign (if scope = campaign)
│ 
│ — Metadata —
│ reason                  optional feedback text
│ opted_out_at            timestamp
│ opted_out_via           email_link | admin_manual | api
│ 
│ — Re-subscribe —
│ resubscribed_at         timestamp (null if still opted out)
│ resubscribed_via        email_link | admin_manual
│ 
│ — Audit —
│ created_at
│ updated_at
└─────────────────────────────────────────────────────────────────────┘
```

**Opt-Out Check Logic (before sending any survey email):**

```
1. Check if email has global opt-out → BLOCK
2. Check if email has campaign opt-out for this campaign → BLOCK
3. Otherwise → SEND
```

**Admin View: Opt-Out Management**

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ OPT-OUT MANAGEMENT                                                              │
│                                                                                 │
│ Filter: [All Scopes ▼]  [🔍 Search by email/name...]                            │
│                                                                                 │
│ ┌──────────────────┬────────────┬───────────────┬────────────┬────────────────┐ │
│ │ Email            │ HCP Name   │ Scope         │ Date       │ Action         │ │
│ ├──────────────────┼────────────┼───────────────┼────────────┼────────────────┤ │
│ │ jane@hosp.com    │ Dr. Jane   │ 🌐 Global     │ Dec 10     │ [Remove]       │ │
│ │ amy@med.edu      │ Dr. Amy    │ 📋 Dry Eye '25│ Dec 5      │ [Remove]       │ │
│ └──────────────────┴────────────┴───────────────┴────────────┴────────────────┘ │
│                                                                                 │
│ [+ Add Manual Opt-Out]  [Export List]                                           │
└─────────────────────────────────────────────────────────────────────────────────┘

Scope Icons: 🌐 Global | 📋 Campaign-specific
```

**Edge Cases:**

| Scenario | Handling |
|----------|----------|
| HCP opts out globally, then new campaign created | Still blocked — global opt-out persists |
| HCP opts out of Campaign A, gets invited to Campaign B | Allowed — only Campaign A is blocked |
| Admin manually removes opt-out | Logged in audit trail, HCP can opt-out again |
| Email not in HCP database | Store opt-out by email address, match later if HCP added |

**Compliance Requirements:**

| Requirement | Implementation |
|-------------|----------------|
| CAN-SPAM | Unsubscribe link in footer, honored within 10 days |
| One-click unsubscribe | Link pre-fills email, one confirmation click |
| List-Unsubscribe header | Include in email headers for email client support |
| Record keeping | Audit trail of all opt-outs |
| Re-subscribe | Must be explicit action, not automatic |

#### Data Model: Campaign

```
┌─────────────────────────────────────────────────────────────────────┐
│ CAMPAIGN                                                            │
├─────────────────────────────────────────────────────────────────────┤
│ id                      PK
│ client_id               FK → Client
│ name                    e.g., "Dry Eye KOL Study 2025"
│ disease_area_id         FK → DiseaseArea
│ status                  draft | active | closed | published
│ 
│ — Survey Configuration —
│ survey_id               FK → CampaignSurvey (snapshot)
│ 
│ — Audience —
│ target_hcp_count        expected respondents
│ 
│ — Honorarium —
│ honorarium_amount       decimal (e.g., 150.00)
│ honorarium_currency     USD (default)
│ 
│ — Timeline —
│ planned_start_date      when campaign should launch
│ planned_end_date        expected close date
│ activated_at            actual activation timestamp
│ closed_at               actual close timestamp
│ published_at            when results made visible to client
│ 
│ — Audit —
│ created_by              FK → User
│ created_at
│ updated_at
│ 
│ — Indexes —
│ INDEX(client_id, status)
│ INDEX(disease_area_id)
└─────────────────────────────────────────────────────────────────────┘
```

#### Campaign Status Transitions

```
                    ┌─────────┐
                    │  DRAFT  │
                    └────┬────┘
                         │ Activate
                         │ (requires: survey, audience, honorarium)
                         ▼
                    ┌─────────┐
                    │ ACTIVE  │
                    └────┬────┘
                         │ Close
                         │ (manual or auto on end_date)
                         ▼
                    ┌─────────┐
                    │ CLOSED  │
                    └────┬────┘
                         │ Publish
                         │ (requires: all nominations matched, scores calculated)
                         ▼
                    ┌───────────┐
                    │ PUBLISHED │
                    └───────────┘
```

**What Gets Locked at Each State:**

| Transition | What Gets Locked | What Stays Editable |
|------------|------------------|---------------------|
| Draft → Active | Survey structure, HCP audience list | Score weights, reminder schedule |
| Active → Closed | New responses blocked | Nomination matching, score entry |
| Closed → Published | All data frozen | Nothing (read-only) |

**Validation Rules:**

| Transition | Requirements |
|------------|--------------|
| Draft → Active | Survey assigned, ≥1 HCP in audience, honorarium > 0 |
| Active → Closed | None (can close anytime) |
| Closed → Published | All nominations matched OR excluded, scores calculated |

**Admin Actions by State:**

| State | Available Actions |
|-------|-------------------|
| Draft | Edit everything, Delete campaign |
| Active | Send reminders, View responses, Close early |
| Closed | Match nominations, Enter scores, Calculate composite, Publish |
| Published | View only, Export data |

#### Campaign HCP Assignment

**Data Model:**

```
┌─────────────────────────────────────────────────────────────────────┐
│ CAMPAIGN_HCP (Junction Table)                                       │
├─────────────────────────────────────────────────────────────────────┤
│ id                      PK
│ campaign_id             FK → Campaign
│ hcp_id                  FK → HCP
│ 
│ — Override Contact —
│ email_override          use this instead of HCP.email (optional)
│ 
│ — Survey Status —
│ survey_token            unique 64-char token for this HCP's survey link
│ token_expires_at        token expiry (e.g., 60 days after campaign start)
│ invitation_sent_at      when first invite email sent
│ reminder_count          number of reminders sent
│ last_reminder_at        timestamp of last reminder
│ 
│ — Audit —
│ added_by                FK → User
│ added_at                timestamp
│ 
│ UNIQUE(campaign_id, hcp_id)
│ UNIQUE(survey_token)
└─────────────────────────────────────────────────────────────────────┘
```

**HCP Selection Screen:**

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ CAMPAIGN AUDIENCE: Dry Eye 2025                                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│ Target Audience: 150 HCPs                          [Import from Excel] [Save]   │
│                                                                                 │
│ ┌─────────────────────────────────────┬─────────────────────────────────────────┐
│ │ AVAILABLE HCPs                      │ SELECTED FOR CAMPAIGN                   │
│ │                                     │                                         │
│ │ Filters:                            │ 150 HCPs selected                       │
│ │ Specialty: [Ophthalmology ▼]        │                                         │
│ │ State: [All States ▼]               │ ┌─────────────────────────────────────┐ │
│ │ Score Range: [50] to [100]          │ │ ☑ Dr. Richard Linstrum    [Remove] │ │
│ │ [🔍 Search by name/NPI...]          │ │ ☑ Dr. Sarah Chen          [Remove] │ │
│ │                                     │ │ ☑ Dr. Michael Torres      [Remove] │ │
│ │ ┌─────────────────────────────────┐ │ │ ☑ Dr. Jane Doe            [Remove] │ │
│ │ │ ☐ Dr. Amy Park         Score: 82│ │ │ ...                                │ │
│ │ │ ☐ Dr. Bob Lee          Score: 75│ │ └─────────────────────────────────────┘ │
│ │ │ ☐ Dr. Carol White      Score: 71│ │                                         │
│ │ │ ☐ Dr. David Kim        Score: 68│ │ [Clear All]                             │
│ │ │ ...                             │ │                                         │
│ │ └─────────────────────────────────┘ │                                         │
│ │                                     │                                         │
│ │ Showing 1-25 of 847                 │                                         │
│ │ [Select All Filtered (847)]         │                                         │
│ │ [Add Selected →]                    │                                         │
│ └─────────────────────────────────────┴─────────────────────────────────────────┘
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Bulk Import Audience Option:**

```
┌─────────────────────────────────────────────────────────────────────┐
│ IMPORT CAMPAIGN AUDIENCE                                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ Upload Excel file with NPI list to add HCPs to this campaign.       │
│                                                                     │
│ [Download Template]                                                 │
│                                                                     │
│ Required columns:                                                   │
│ • NPI (required)                                                    │
│ • Email (optional - overrides HCP database email)                   │
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │  📁 Drop Excel file here or click to browse                     │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

#### Survey Token & Link Management

**Token Specification:**

| Setting | Value | Rationale |
|---------|-------|-----------|
| Token format | 64-char hex (SHA-256) or UUID v4 | Unguessable, URL-safe |
| Validity period | 60 days from campaign activation | Ample time for completion |
| One submission per token | Yes — enforced | Prevents duplicates |
| Expiry on completion | Yes | No re-submission |
| Expiry on campaign close | Yes | No late submissions |

**Token States:**

| State | Can Access Survey? | User Experience |
|-------|-------------------|-----------------|
| Valid, not started | Yes | Show landing page |
| Valid, in progress | Yes | Resume from last answer |
| Valid, completed | No | "Already submitted" message |
| Expired (time) | No | "Link expired" message |
| Expired (campaign closed) | No | "Survey closed" message |
| Invalid (not found) | No | "Invalid link" message |

**Duplicate Submission Prevention:**

One token = one submission. Once a survey token has a completed response, no second submission is possible.

```
Survey Access Logic:
1. User clicks survey link with token
2. Lookup token in CAMPAIGN_HCP
   → Not found? Show "Invalid link" page
3. Check if token has SurveyResponse with status = completed
   → Yes? Show "Already submitted" page
4. Check if campaign is active
   → No (closed/draft)? Show "Survey closed" page
5. Check if token expired
   → Yes? Show "Link expired" page
6. Otherwise → Allow access (new or resume in-progress)
```

#### Survey Reminder Management

**Manual Reminder Flow:**

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ SEND REMINDERS: Dry Eye 2025                                                    │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│ Current Status:                                                                 │
│   • Total Audience: 150                                                         │
│   • Completed: 87 (58%)                                                         │
│   • In Progress: 12                                                             │
│   • Not Started: 51                                                             │
│                                                                                 │
│ Send Reminder To:                                                               │
│   ○ All who haven't completed (63)                                              │
│   ○ Only "In Progress" (12)                                                     │
│   ○ Only "Not Started" (51)                                                     │
│   ○ Custom selection...                                                         │
│                                                                                 │
│ Exclude:                                                                        │
│   ☑ HCPs who received reminder in last 3 days (8 excluded)                      │
│   ☑ HCPs who opted out (2 excluded)                                             │
│                                                                                 │
│ Recipients after filters: 53                                                    │
│                                                                                 │
│ [Cancel]                                              [Send 53 Reminders]       │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Reminder Rules:**

| Rule | Value |
|------|-------|
| Minimum days between reminders (same HCP) | 3 days |
| Maximum reminders per HCP | 5 |
| No reminders after | Campaign end date |
| Respect opt-outs | Always |

#### Survey Taking Experience (Public-Facing)

**Step 1: Landing Page**

URL: `https://survey.kol360.com/s/{token}`

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ SURVEY LANDING PAGE                                                             │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│                         [KOL360 Logo]                                           │
│                                                                                 │
│                    KOL Research Survey                                          │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                                                                           │  │
│  │  Hello Dr. Linstrum,                                                      │  │
│  │                                                                           │  │
│  │  You've been invited to participate in a Key Opinion Leader               │  │
│  │  research survey. Your insights are valuable to advancing                 │  │
│  │  understanding in your therapeutic area.                                  │  │
│  │                                                                           │  │
│  │  • Estimated time: 10-15 minutes                                          │  │
│  │  • Honorarium: $150 upon completion                                       │  │
│  │  • Your responses are confidential                                        │  │
│  │                                                                           │  │
│  │  You can save your progress and return later using this same link.        │  │
│  │                                                                           │  │
│  │                      [Begin Survey]                                       │  │
│  │                                                                           │  │
│  │  ─────────────────────────────────────────────────────────────────────   │  │
│  │  Questions? Contact research@kol360.com                                   │  │
│  │                                                                           │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  Privacy Policy  |  Terms of Service                                            │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Step 2: Survey Questions (Desktop)**

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ KOL Research Survey                                           Progress: 40%     │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━●━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  SECTION: Practice Information                                                  │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                                                                           │  │
│  │  3. What is your primary specialty? *                                     │  │
│  │                                                                           │  │
│  │     ○ Ophthalmology                                                       │  │
│  │     ○ Optometry                                                           │  │
│  │     ○ Retina Specialist                                                   │  │
│  │     ○ Cornea Specialist                                                   │  │
│  │     ○ Other: [________________]                                           │  │
│  │                                                                           │  │
│  │  ─────────────────────────────────────────────────────────────────────   │  │
│  │                                                                           │  │
│  │  4. How many years have you been in practice?                             │  │
│  │                                                                           │  │
│  │     [    ] years                                                          │  │
│  │                                                                           │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  [← Previous Section]            [Save & Continue Later]     [Next Section →]   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Step 3: Nomination Questions (Multi-Text)**

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ KOL Research Survey                                           Progress: 65%     │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━●━━━━━━━━━━━━━━━━━━━━━━━ │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  SECTION: KOL Nominations                                                       │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                                                                           │  │
│  │  8. Who do you consider to be NATIONAL thought leaders in Dry Eye         │  │
│  │     disease? Please list up to 5 physicians.                              │  │
│  │                                                                           │  │
│  │     1. [Dr. Sarah Chen_________________] ✓                                │  │
│  │     2. [Dr. Michael Torres_____________] ✓                                │  │
│  │     3. [________________________________]                                 │  │
│  │     4. [________________________________]                                 │  │
│  │     5. [________________________________]                                 │  │
│  │                                                                           │  │
│  │     [+ Add another] (max 10)                                              │  │
│  │                                                                           │  │
│  │  ─────────────────────────────────────────────────────────────────────   │  │
│  │                                                                           │  │
│  │  9. Who do you consider to be LOCAL/REGIONAL thought leaders in           │  │
│  │     Dry Eye disease in your area?                                         │  │
│  │                                                                           │  │
│  │     1. [________________________________]                                 │  │
│  │     2. [________________________________]                                 │  │
│  │     3. [________________________________]                                 │  │
│  │                                                                           │  │
│  │     [+ Add another] (max 10)                                              │  │
│  │                                                                           │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  [← Previous Section]            [Save & Continue Later]     [Next Section →]   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Step 4: Review & Submit**

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ KOL Research Survey                                           Progress: 95%     │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━●━━━ │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  REVIEW YOUR RESPONSES                                                          │
│                                                                                 │
│  Please review your answers before submitting.                                  │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │ § Demographics                                              [Edit]        │  │
│  │   Name: Dr. Richard Linstrum                                              │  │
│  │   NPI: 1234567890                                                         │  │
│  │   Email: rlinstrum@eyeclinic.com                                          │  │
│  ├───────────────────────────────────────────────────────────────────────────┤  │
│  │ § Practice Information                                      [Edit]        │  │
│  │   Specialty: Ophthalmology                                                │  │
│  │   Years in Practice: 15                                                   │  │
│  │   Patients per Month: 251-500                                             │  │
│  ├───────────────────────────────────────────────────────────────────────────┤  │
│  │ § KOL Nominations                                           [Edit]        │  │
│  │   National Leaders: Dr. Sarah Chen, Dr. Michael Torres                    │  │
│  │   Local Leaders: Dr. Amy Park                                             │  │
│  │   Rising Stars: Dr. James Wilson                                          │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  ☐ I confirm my responses are accurate and I agree to the terms.               │
│                                                                                 │
│  [← Back to Survey]                                      [Submit Survey]        │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Step 5: Confirmation**

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                                                                 │
│                              [KOL360 Logo]                                      │
│                                                                                 │
│                         ✓ Survey Submitted                                      │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                                                                           │  │
│  │  Thank you, Dr. Linstrum!                                                 │  │
│  │                                                                           │  │
│  │  Your responses have been recorded successfully.                          │  │
│  │                                                                           │  │
│  │  ─────────────────────────────────────────────────────────────────────   │  │
│  │                                                                           │  │
│  │  HONORARIUM PAYMENT                                                       │  │
│  │                                                                           │  │
│  │  You will receive an email within 5-7 business days with instructions     │  │
│  │  to claim your $150 honorarium payment.                                   │  │
│  │                                                                           │  │
│  │  Please ensure your email (rlinstrum@eyeclinic.com) is correct.           │  │
│  │  If you need to update your email, contact research@kol360.com.           │  │
│  │                                                                           │  │
│  │  ─────────────────────────────────────────────────────────────────────   │  │
│  │                                                                           │  │
│  │  Confirmation #: KOL-2025-DRY-00847                                       │  │
│  │  Submitted: December 11, 2025 at 2:34 PM EST                              │  │
│  │                                                                           │  │
│  │  A confirmation email has been sent to your email address.                │  │
│  │                                                                           │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│                         [Close Window]                                          │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Already Submitted Page:**

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│                         [KOL360 Logo]                               │
│                                                                     │
│                    Survey Already Completed                         │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                                                               │  │
│  │  Our records show you have already submitted this survey.     │  │
│  │                                                               │  │
│  │  Confirmation #: KOL-2025-DRY-00847                           │  │
│  │  Submitted: December 10, 2025 at 2:34 PM EST                  │  │
│  │                                                               │  │
│  │  If you believe this is an error, please contact:             │  │
│  │  research@kol360.com                                          │  │
│  │                                                               │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Auto-Save Behavior:**

| Trigger | Action |
|---------|--------|
| Answer changed | Save after 2 second debounce |
| Navigation (next/previous) | Save immediately |
| "Save & Continue Later" clicked | Save + show confirmation |
| Browser close/refresh | Warn if unsaved changes |
| Session timeout (30 min inactive) | Auto-save, show "session expired" on return |

#### Email Templates

**Email 1: Survey Invitation**

```
Subject: You're Invited: KOL Research Survey (${{campaign.honorarium_amount}} Honorarium)

───────────────────────────────────────────────────────

[KOL360 Logo]

Dear Dr. {{hcp.last_name}},

You have been identified as a Key Opinion Leader in {{campaign.disease_area}} 
and are invited to participate in a brief research survey.

SURVEY DETAILS
• Estimated time: 10-15 minutes
• Honorarium: ${{campaign.honorarium_amount}} upon completion
• Deadline: {{campaign.end_date | format: "MMMM D, YYYY"}}

Your insights will help advance understanding of thought leadership 
in your therapeutic area.

        [Begin Survey →]
        {{survey_link}}

This survey link is unique to you. Please do not share it.

Questions? Contact research@kol360.com

───────────────────────────────────────────────────────

You are receiving this email because you were identified as a healthcare 
professional with expertise in {{campaign.disease_area}}.

Don't want to receive these emails? [Unsubscribe]

KOL360 Research | Bio-Exec, Inc.
123 Research Drive, Boston, MA 02101
```

**Email 2: Survey Reminder**

```
Subject: Reminder: Complete Your KOL Survey (${{campaign.honorarium_amount}} Honorarium)

───────────────────────────────────────────────────────

[KOL360 Logo]

Dear Dr. {{hcp.last_name}},

This is a friendly reminder that your KOL research survey is still 
waiting for you.

{% if response.status == 'in_progress' %}
You've already started the survey — pick up where you left off!
{% else %}
The survey takes only 10-15 minutes to complete.
{% endif %}

        [Continue Survey →]
        {{survey_link}}

Survey closes: {{campaign.end_date | format: "MMMM D, YYYY"}}
Honorarium: ${{campaign.honorarium_amount}}

Questions? Contact research@kol360.com

───────────────────────────────────────────────────────

[Unsubscribe from this survey]

KOL360 Research | Bio-Exec, Inc.
```

**Email 3: Survey Confirmation**

```
Subject: Thank You — Survey Received (Confirmation #{{confirmation_number}})

───────────────────────────────────────────────────────

[KOL360 Logo]

Dear Dr. {{hcp.last_name}},

Thank you for completing the {{campaign.name}} survey!

CONFIRMATION DETAILS
• Confirmation #: {{confirmation_number}}
• Submitted: {{response.completed_at | format: "MMMM D, YYYY at h:mm A z"}}

HONORARIUM PAYMENT
You will receive a separate email within 5-7 business days with 
instructions to claim your ${{campaign.honorarium_amount}} payment.

Please ensure your email address is correct:
{{hcp.email}}

If you need to update your information, reply to this email.

Thank you for your valuable contribution to KOL research.

───────────────────────────────────────────────────────

KOL360 Research | Bio-Exec, Inc.
```

**Email 4: User Approval (Welcome)**

```
Subject: Welcome to KOL360 — Your Account is Approved

───────────────────────────────────────────────────────

[KOL360 Logo]

Hi {{user.first_name}},

Great news! Your KOL360 account has been approved.

You now have access to:
{% if user.role == 'client_admin' %}
• Campaign results and analytics
• Team member management
• Data exports
{% else %}
• Campaign results and analytics
• Data exports
{% endif %}

        [Log In to KOL360 →]
        {{login_link}}

Your account:
• Email: {{user.email}}
• Organization: {{client.name}}
• Role: {{user.role | humanize}}

Questions? Contact support@kol360.com

───────────────────────────────────────────────────────

KOL360 | Bio-Exec, Inc.
```

**Email 5: User Invitation**

```
Subject: You're Invited to KOL360

───────────────────────────────────────────────────────

[KOL360 Logo]

Hi {{user.first_name}},

You've been invited to join KOL360 as a {{user.role | humanize}} 
for {{client.name}}.

        [Accept Invitation →]
        {{invite_link}}

You'll be asked to set your password when you first log in.

This invitation expires in 7 days.

Questions? Contact support@kol360.com

───────────────────────────────────────────────────────

KOL360 | Bio-Exec, Inc.
```

### Module 6: Survey Response Collection & Review

Real-time response viewing, data validation, and export capabilities.

| Capability | Description |
|------------|-------------|
| Response Viewing | View individual survey responses, filter by completion status, search by respondent |
| Progress Dashboard | Campaign metrics: total sent, opened, in-progress, completed, completion rate |
| Data Export | Export to Excel: raw responses, physician nominations, summary statistics |
| Data Validation | Flag incomplete responses, validate physician name entries, identify duplicate nominations |
| Payment | Process to select HCPs who have completed for 3rd party payment provider submission |

#### Data Model: Survey Responses & Scoring

**Design Decision:** Use a **Header + Line Items** pattern for both responses and nominations. This avoids creating a new table per campaign (schema nightmare) and enables cross-campaign queries.

**Why NOT table-per-campaign:**

| Approach | Pros | Cons |
|----------|------|------|
| Table per campaign | Simple columns | Schema chaos, can't query across campaigns |
| EAV (one row per answer) | Max flexibility | Complex queries, performance issues |
| **Header + Line Items** ✅ | Normalized, flexible, queryable | Slightly more joins (acceptable) |
| JSONB column | Flexible | Hard to aggregate, indexing limits |

**Survey Response Tables:**

```
┌─────────────────────────────────────────────────────────────────────┐
│ SURVEY_RESPONSE (Header)                                            │
│ One row per survey submission                                       │
├─────────────────────────────────────────────────────────────────────┤
│ id                      PK
│ campaign_id             FK → Campaign
│ respondent_hcp_id       FK → HCP
│ survey_token            unique token for this respondent
│ status                  pending | opened | in_progress | completed
│ started_at              timestamp
│ completed_at            timestamp
│ ip_address              for audit
│ created_at
│ updated_at
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ 1:many
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ SURVEY_RESPONSE_ANSWER (Line Items)                                 │
│ One row per question answered                                       │
├─────────────────────────────────────────────────────────────────────┤
│ id                      PK
│ response_id             FK → SurveyResponse
│ question_id             FK → SurveyQuestion (snapshot)
│ answer_text             for text, number, single-choice
│ answer_json             for multi-choice arrays
│ created_at
│ updated_at
└─────────────────────────────────────────────────────────────────────┘
```

**Nomination Tables (extracted from multi-text answers):**

```
┌─────────────────────────────────────────────────────────────────────┐
│ NOMINATION (Header-ish — links response to nomination question)     │
│ One row per nomination entry (each name entered)                    │
├─────────────────────────────────────────────────────────────────────┤
│ id                      PK
│ response_id             FK → SurveyResponse
│ question_id             FK → SurveyQuestion (National/Local/etc.)
│ nominator_hcp_id        FK → HCP (who nominated)
│ raw_name_entered        "Bob Linstrum" (exactly as typed)
│ matched_hcp_id          FK → HCP (null until matched)
│ match_status            unmatched | matched | new_hcp | excluded
│ matched_by              FK → User (who performed match)
│ matched_at              timestamp
│ created_at
└─────────────────────────────────────────────────────────────────────┘
```

**Scoring Table:**

See **Module 2: HCP Database → Data Model: HCP Campaign Score (Client View)** for the complete HCP_CAMPAIGN_SCORE definition.

Key points:
- Stores campaign-specific survey score only (not the 8 objective scores)
- 8 objective scores come from HCP_DISEASE_AREA_SCORE
- Composite calculated by combining both

**Full Entity Relationship:**

```
┌──────────────┐     ┌──────────────────┐     ┌────────────────────────┐
│   Campaign   │────▶│  SurveyResponse  │────▶│ SurveyResponseAnswer   │
└──────────────┘     │    (header)      │     │     (line items)       │
       │             └──────────────────┘     └────────────────────────┘
       │                    │
       │                    │ 1:many
       │                    ▼
       │             ┌──────────────────┐
       │             │    Nomination    │ ← one row per name entered
       │             │   (line items)   │
       │             └──────────────────┘
       │                    │
       │                    │ after matching
       │                    ▼
       │             ┌──────────────────┐
       └────────────▶│ HCPCampaignScore │ ← campaign survey score only
                     └──────────────────┘
                            │
                            │ combined with
                            ▼
                     ┌──────────────────────┐
                     │HCPDiseaseAreaScore   │ ← 8 objective scores + aggregated survey
                     │(BioExec Master)      │   SCD Type 2 for history
                     └──────────────────────┘
                            │
                            ▼
                     ┌──────────────────┐
                     │       HCP        │ ← master record
                     └──────────────────┘
```

**Scoring Architecture:**

```
┌─────────────────────────────────────────────────────────────────────┐
│                        SCORING DATA FLOW                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────┐     ┌─────────────────────────────────┐    │
│  │  Excel Upload       │────▶│  HCP_DISEASE_AREA_SCORE         │    │
│  │  (8 Objective       │     │  • 8 objective scores           │    │
│  │   Scores)           │     │  • Survey score (aggregated)    │    │
│  └─────────────────────┘     │  • Disease area composite       │    │
│                              │  • SCD Type 2 history           │    │
│  ┌─────────────────────┐     └──────────────┬──────────────────┘    │
│  │  Campaign Surveys   │                    │                       │
│  │  (Nominations)      │                    │ 8 scores              │
│  └──────────┬──────────┘                    │ pulled from           │
│             │                               │ disease area          │
│             │ campaign                      ▼                       │
│             │ survey score    ┌─────────────────────────────────┐   │
│             └────────────────▶│  HCP_CAMPAIGN_SCORE             │   │
│                               │  • Campaign survey score        │   │
│                               │  • Campaign composite           │   │
│                               │    (8 from disease + 1 survey)  │   │
│                               └─────────────────────────────────┘   │
│                                                                     │
│  CLIENTS SEE: Campaign scores (their campaigns only)                │
│  LITE CLIENTS SEE: Disease area scores (live, no snapshot)          │
│  BIOEXEC SEES: Both levels                                          │
└─────────────────────────────────────────────────────────────────────┘
```

**Key Indexes:**

| Table | Index | Purpose |
|-------|-------|---------|
| SurveyResponse | `campaign_id` | Filter by campaign |
| SurveyResponse | `respondent_hcp_id` | Find responses by HCP |
| SurveyResponse | `survey_token` | Token lookup |
| SurveyResponseAnswer | `response_id` | Get all answers for response |
| Nomination | `campaign_id, match_status` | Find unmatched nominations |
| Nomination | `matched_hcp_id` | Count nominations per HCP |
| HCPCampaignScore | `campaign_id` | Client leaderboard queries |
| HCPCampaignScore | `hcp_id` | HCP profile queries |
| HCPDiseaseAreaScore | `disease_area_id, is_current` | Lite client queries |
| HCPDiseaseAreaScore | `hcp_id, is_current` | HCP profile (disease area view) |
| HCPDiseaseAreaScore | `hcp_id, disease_area_id, is_current` | Specific disease area lookup |

#### Payment Processing

Survey respondents (HCPs) receive honorarium payments via a **third-party payment service**. The platform supports this workflow through export, import, and status tracking.

**Workflow:**

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1. SURVEY COMPLETION → HCP marked eligible for payment              │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 2. EXPORT → Admin exports eligible HCPs → uploads to 3rd party      │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 3. 3RD PARTY PROCESSES → (outside system) emails sent, claimed      │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 4. IMPORT → Admin downloads status XLS → imports into platform      │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 5. REVIEW → Admin reviews status, handles failures                  │
└─────────────────────────────────────────────────────────────────────┘
```

**Payment Status Values:**

| Status | Description | Terminal? |
|--------|-------------|-----------|
| `pending_export` | Completed survey, not yet exported | No |
| `exported` | Included in export file | No |
| `email_sent` | 3rd party sent payment email | No |
| `email_delivered` | Email confirmed delivered | No |
| `email_opened` | Recipient opened email | No |
| `claimed` | Payment successfully claimed | ✅ Yes (Success) |
| `bounced` | Email bounced | ✅ Yes (Failed) |
| `rejected` | Payment rejected by recipient | ✅ Yes (Failed) |
| `expired` | Payment link expired unclaimed | ✅ Yes (Failed) |

**Data Model: Payment Tables**

```
┌─────────────────────────────────────────────────────────────────────┐
│ PAYMENT                                                             │
│ One row per HCP per campaign                                        │
├─────────────────────────────────────────────────────────────────────┤
│ id                      PK
│ campaign_id             FK → Campaign
│ hcp_id                  FK → HCP
│ response_id             FK → SurveyResponse
│ 
│ — Payment Details —
│ amount                  decimal (e.g., 150.00)
│ currency                default 'USD'
│ 
│ — Status Tracking —
│ status                  enum (see above)
│ status_updated_at       timestamp of last status change
│ 
│ — Export Tracking —
│ exported_at             when included in export
│ export_batch_id         FK → PaymentExportBatch
│ 
│ — 3rd Party Reference —
│ external_reference_id   ID from 3rd party system
│ 
│ — Audit —
│ created_at
│ updated_at
│ 
│ UNIQUE(campaign_id, hcp_id)
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ PAYMENT_EXPORT_BATCH                                                │
│ Tracks each export file generated                                   │
├─────────────────────────────────────────────────────────────────────┤
│ id                      PK
│ campaign_id             FK → Campaign
│ exported_by             FK → User
│ exported_at             timestamp
│ record_count            number of HCPs in export
│ file_name               for reference
│ notes                   optional admin notes
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ PAYMENT_STATUS_HISTORY                                              │
│ Audit trail of all status changes                                   │
├─────────────────────────────────────────────────────────────────────┤
│ id                      PK
│ payment_id              FK → Payment
│ old_status              previous status
│ new_status              new status
│ changed_at              timestamp
│ changed_by              FK → User (null if via import)
│ import_batch_id         FK → PaymentImportBatch (if from import)
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ PAYMENT_IMPORT_BATCH                                                │
│ Tracks each status import                                           │
├─────────────────────────────────────────────────────────────────────┤
│ id                      PK
│ campaign_id             FK → Campaign
│ imported_by             FK → User
│ imported_at             timestamp
│ file_name               original file name
│ record_count            rows processed
│ matched_count           rows successfully matched
│ unmatched_count         rows that couldn't match
│ status                  processing | completed | completed_with_errors
└─────────────────────────────────────────────────────────────────────┘
```

**Export File Format:**

| Column | Source | Required |
|--------|--------|----------|
| NPI | HCP.npi | Yes |
| First Name | HCP.first_name | Yes |
| Last Name | HCP.last_name | Yes |
| Email | HCP.email | Yes |
| Amount | Campaign.honorarium_amount | Yes |
| Campaign | Campaign.name | Reference |
| Completion Date | SurveyResponse.completed_at | Reference |
| Reference ID | Payment.id | For matching |

**Import File Matching Logic:**
1. Match by `Reference ID` (Payment.id) — preferred
2. Fallback: Match by `Email` + `Campaign`
3. Fallback: Match by `NPI` + `Campaign`
4. No match → flag for manual review

**Payment Management Screen:**

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ PAYMENTS: Dry Eye 2025                                                          │
│                                                                                 │
│ ┌─────────────────────────────────────────────────────────────────────────────┐ │
│ │ SUMMARY                                                                     │ │
│ │ ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐       │ │
│ │ │ Eligible  │ │ Exported  │ │ Pending   │ │ Claimed   │ │ Failed    │       │ │
│ │ │    127    │ │    120    │ │    45     │ │    68     │ │     7     │       │ │
│ │ └───────────┘ └───────────┘ └───────────┘ └───────────┘ └───────────┘       │ │
│ └─────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                 │
│ ┌─────────────────────────────────────────────────────────────────────────────┐ │
│ │ [Export Pending]  [Import Status Report]  [Download Template]               │ │
│ └─────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                 │
│ Filter: [All Statuses ▼]  [🔍 Search by name/NPI...]                           │
│                                                                                 │
│ ┌───────┬──────────────┬────────────┬─────────────────┬──────────┬───────────┐ │
│ │ ☑     │ Name         │ NPI        │ Email           │ Amount   │ Status    │ │
│ ├───────┼──────────────┼────────────┼─────────────────┼──────────┼───────────┤ │
│ │ ☐     │ Dr. Jane Doe │ 1234567890 │ jane@hosp.com   │ $150.00  │ ● Claimed │ │
│ │ ☐     │ Dr. John Smith│ 2345678901│ john@clinic.com │ $150.00  │ ○ Sent    │ │
│ │ ☐     │ Dr. Amy Park │ 3456789012 │ amy@med.edu     │ $150.00  │ ○ Opened  │ │
│ │ ☐     │ Dr. Bob Lee  │ 4567890123 │ bob@eye.com     │ $150.00  │ ✗ Bounced │ │
│ │ ☐     │ Dr. New User │ 5678901234 │ new@rx.com      │ $150.00  │ ◌ Pending │ │
│ └───────┴──────────────┴────────────┴─────────────────┴──────────┴───────────┘ │
│                                                                                 │
│ Showing 1-25 of 127                          [← Prev]  Page 1 of 6  [Next →]   │
└─────────────────────────────────────────────────────────────────────────────────┘

Status Icons: ◌ Pending | ○ In Progress | ● Claimed | ✗ Failed
```

**Export Flow:**

```
┌─────────────────────────────────────────────────────────────────────┐
│ EXPORT PAYMENTS                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ Campaign: Dry Eye 2025                                          │ │
│ │                                                                 │ │
│ │ Eligible for Export:                                            │ │
│ │   • 7 HCPs with status "Pending Export"                         │ │
│ │   • Honorarium Amount: $150.00 each                             │ │
│ │   • Total: $1,050.00                                            │ │
│ │                                                                 │ │
│ │ ☐ Include previously exported (re-export)                       │ │
│ │                                                                 │ │
│ │ Notes (optional): [________________________________]            │ │
│ │                                                                 │ │
│ │ [Cancel]                                    [Export to Excel]   │ │
│ └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

**Import Flow with Preview:**

```
┌─────────────────────────────────────────────────────────────────────┐
│ IMPORT PREVIEW                                                      │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ File: payment_status_dec10.xlsx                                 │ │
│ │ Records: 45                                                     │ │
│ │                                                                 │ │
│ │ ✓ Matched: 43                                                   │ │
│ │ ⚠ Unmatched: 2 (review required)                                │ │
│ │                                                                 │ │
│ │ Status Changes:                                                 │ │
│ │   • 12 → Claimed                                                │ │
│ │   • 8 → Email Delivered                                         │ │
│ │   • 3 → Bounced                                                 │ │
│ │   • 20 → No change                                              │ │
│ │                                                                 │ │
│ │ Unmatched Records:                                              │ │
│ │ ┌──────────────────┬───────────────┬──────────────────────────┐ │ │
│ │ │ Email            │ Status        │ Issue                    │ │ │
│ │ ├──────────────────┼───────────────┼──────────────────────────┤ │ │
│ │ │ unknown@test.com │ Claimed       │ Email not found          │ │ │
│ │ │ old@retired.com  │ Bounced       │ NPI not in campaign      │ │ │
│ │ └──────────────────┴───────────────┴──────────────────────────┘ │ │
│ │                                                                 │ │
│ │ [Cancel]  [Download Unmatched]  [Confirm Import]                │ │
│ └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

**Payment History (click row to view):**

```
┌─────────────────────────────────────────────────────────────────────┐
│ PAYMENT HISTORY: Dr. Jane Doe                                       │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ Campaign: Dry Eye 2025 | Amount: $150.00 | Status: ● Claimed    │ │
│ ├─────────────────────────────────────────────────────────────────┤ │
│ │ Status Timeline:                                                │ │
│ │                                                                 │ │
│ │ Dec 10, 2:15pm   ● Claimed                                      │ │
│ │ Dec 9, 11:30am   ○ Email Opened                                 │ │
│ │ Dec 8, 3:45pm    ○ Email Delivered                              │ │
│ │ Dec 8, 3:44pm    ○ Email Sent                                   │ │
│ │ Dec 8, 10:00am   ○ Exported (Batch #12)                         │ │
│ │ Dec 7, 4:30pm    ◌ Survey Completed                             │ │
│ └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

**Payment Capabilities Summary:**

| Capability | Description |
|------------|-------------|
| Auto-eligibility | HCPs marked eligible on survey completion |
| Bulk Export | Export all pending payments to Excel for 3rd party upload |
| Re-export | Option to re-export previously exported records |
| Status Import | Import XLS status report from 3rd party |
| Smart Matching | Match by Reference ID, fallback to Email/NPI |
| Unmatched Handling | Flag unmatched records for manual review |
| Status Dashboard | Summary cards + filterable table |
| Status History | Full audit trail per payment |
| Export/Import Batches | Track what was exported/imported when |

### Module 7: Client Portal (Results View)

Secure client access to survey results, raw data, and campaign progress.

| Capability | Description |
|------------|-------------|
| Client Authentication | Secure login for Client Admin and Team Members with Role Based Access Control |
| Survey Results Tables | View all survey responses in tabular format with search, filter, and sort |
| Campaign Metrics | Real-time statistics: completion rate, response counts by category, progress charts |
| Data Export | Download raw data to Excel: all responses, nominations list, respondent demographics |
| Multi-Tenant Security | Clients see only their own campaigns and data |

#### Survey Results Table

A feature-rich data table for viewing raw survey responses using **TanStack Table** (already in stack for dashboards).

**Why TanStack Table:**

| Library | Column Toggle | Sort | Filter | Export | Notes |
|---------|---------------|------|--------|--------|-------|
| **TanStack Table** ✅ | ✅ | ✅ | ✅ | ✅ | Already in stack, headless, full Tailwind control |
| AG Grid | ✅ | ✅ | ✅ | ✅ | Heavier, free tier limited |
| MUI DataGrid | ✅ | ✅ | ✅ | Pro only | Requires MUI ecosystem |

**Table Features:**

| Feature | Behavior |
|---------|----------|
| Column visibility | Toggle any column on/off, persisted per user |
| Column reordering | Drag columns to reorder |
| Sorting | Click header for asc/desc, shift+click for multi-column |
| Filtering | Per-column filters + global search |
| Pagination | Server-side for large datasets (1,000+ responses) |
| Row expansion | Click to see full response detail |
| Row selection | Checkbox for bulk export |
| Sticky header | Header visible on scroll |
| Export | CSV/Excel with current filters applied |

**Main Table View:**

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ SURVEY RESULTS: Dry Eye 2025                                                    │
│                                                                                 │
│ ┌─────────────────────────────────────────────────────────────────────────────┐ │
│ │ [🔍 Search respondents...]        [Columns ▼]  [Filters ▼]  [Export CSV]   │ │
│ └─────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                 │
│ ┌───────┬──────────────┬────────────┬──────────┬──────────┬──────────┬───────┐ │
│ │ ☑     │ Name ↕       │ NPI        │ Specialty│ Status ↕ │ Completed│ Score │ │
│ ├───────┼──────────────┼────────────┼──────────┼──────────┼──────────┼───────┤ │
│ │ ☐     │ Dr. Jane Doe │ 1234567890 │ Ophthalm │ ● Done   │ Dec 10   │ 87    │ │
│ │ ☐     │ Dr. John Smith│ 2345678901│ Optometry│ ● Done   │ Dec 9    │ 72    │ │
│ │ ☐     │ Dr. Amy Park │ 3456789012 │ Retina   │ ○ Partial│ —        │ —     │ │
│ │ ☐     │ Dr. Bob Lee  │ 4567890123 │ Ophthalm │ ○ Pending│ —        │ —     │ │
│ └───────┴──────────────┴────────────┴──────────┴──────────┴──────────┴───────┘ │
│                                                                                 │
│ Showing 1-25 of 847 responses              [← Prev]  Page 1 of 34  [Next →]    │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Column Visibility Panel:**

```
┌─────────────────────────────────────────┐
│ COLUMNS                      [Reset]    │
├─────────────────────────────────────────┤
│ ☑ Name                                  │
│ ☑ NPI                                   │
│ ☑ Specialty                             │
│ ☑ Status                                │
│ ☑ Completed Date                        │
│ ☑ Score                                 │
│ ☐ Email                                 │
│ ☐ City                                  │
│ ☐ State                                 │
│ ☐ Years in Practice                     │
│ ───────────────────────────────────     │
│ Survey Questions:                       │
│ ☐ Q1: Primary therapeutic focus         │
│ ☐ Q2: Patients per month                │
│ ☐ Q3: Conference attendance             │
│ ☐ Q4: Clinical trial interest           │
│ ...                                     │
├─────────────────────────────────────────┤
│ [Select All]  [Clear All]  [Apply]      │
└─────────────────────────────────────────┘
```

**Filter Panel:**

```
┌─────────────────────────────────────────┐
│ FILTERS                      [Clear All]│
├─────────────────────────────────────────┤
│ Status:                                 │
│   ☑ Completed  ☑ In Progress  ☐ Pending │
│                                         │
│ Specialty:                              │
│   [All Specialties ▼]                   │
│                                         │
│ Completed Date:                         │
│   [From: ____]  [To: ____]              │
│                                         │
│ Score Range:                            │
│   [Min: __]  [Max: __]                  │
│                                         │
├─────────────────────────────────────────┤
│ [Apply Filters]                         │
└─────────────────────────────────────────┘
```

**Expanded Row Detail (click row to expand):**

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ ▼ Dr. Jane Doe (NPI: 1234567890)                                                │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  DEMOGRAPHICS                          PRACTICE INFO                            │
│  ─────────────                         ────────────                             │
│  Email: jane.doe@hospital.com          Specialty: Ophthalmology                 │
│  City: Boston                          Years in Practice: 15                    │
│  State: MA                             Patients/Month: 200+                     │
│                                                                                 │
│  NOMINATIONS                                                                    │
│  ───────────                                                                    │
│  National Advisors: Richard Linstrum, Sarah Chen, Michael Torres               │
│  Local Advisors: Amy Park, David Kim                                           │
│  Rising Stars: Jennifer Wu                                                     │
│                                                                                 │
│  ENGAGEMENT                                                                     │
│  ──────────                                                                     │
│  Conference Attendance: AAO, ARVO, ASCRS                                       │
│  Clinical Trial Interest: Very Interested                                      │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Export Options Modal:**

```
┌─────────────────────────────────────────┐
│ EXPORT DATA                             │
├─────────────────────────────────────────┤
│                                         │
│ Include:                                │
│   ○ Current view (visible columns only) │
│   ○ All columns                         │
│   ○ Custom selection...                 │
│                                         │
│ Rows:                                   │
│   ○ Current filtered results (128)      │
│   ○ All responses (847)                 │
│                                         │
│ Format:                                 │
│   ○ CSV                                 │
│   ○ Excel (.xlsx)                       │
│                                         │
├─────────────────────────────────────────┤
│ [Cancel]                    [Download]  │
└─────────────────────────────────────────┘
```

**Data Handling:**

| Scenario | Approach |
|----------|----------|
| < 100 responses | Client-side filtering/sorting |
| 1,000+ responses | Server-side pagination + filtering |
| Survey questions as columns | Dynamic columns from campaign's survey |
| Nomination columns | Comma-separated or expandable in row detail |
| Column preferences | Stored in `UserPreference` table per user |

#### Export Column Specifications

**Survey Responses Export:**

| Column | Source | Notes |
|--------|--------|-------|
| Response ID | SurveyResponse.id | Internal reference |
| NPI | HCP.npi | Primary identifier |
| First Name | HCP.first_name | |
| Last Name | HCP.last_name | |
| Email | HCP.email | |
| Specialty | HCP.specialty | |
| City | HCP.city | |
| State | HCP.state | |
| Status | SurveyResponse.status | pending, opened, in_progress, completed |
| Started At | SurveyResponse.started_at | ISO timestamp |
| Completed At | SurveyResponse.completed_at | ISO timestamp |
| Q1: [Question Text] | Answer text | Dynamic per survey |
| Q2: [Question Text] | Answer text | Dynamic per survey |
| ... | ... | One column per question |

**Nominations Export:**

| Column | Source |
|--------|--------|
| Nominator NPI | HCP.npi (nominator) |
| Nominator First Name | HCP.first_name |
| Nominator Last Name | HCP.last_name |
| Nomination Category | Question category (National/Local/Rising Star) |
| Raw Name Entered | Nomination.raw_name_entered |
| Matched HCP NPI | HCP.npi (matched) |
| Matched HCP First Name | HCP.first_name |
| Matched HCP Last Name | HCP.last_name |
| Match Status | matched / unmatched / excluded / new_hcp |
| Matched By | User who performed match |
| Matched At | Timestamp |

**HCP Scores Export (Campaign Context):**

| Column | Source | Notes |
|--------|--------|-------|
| NPI | HCP.npi | |
| First Name | HCP.first_name | |
| Last Name | HCP.last_name | |
| Specialty | HCP.specialty | |
| City | HCP.city | |
| State | HCP.state | |
| Publications Score | HCPDiseaseAreaScore.score_publications | From disease area |
| Clinical Trials Score | HCPDiseaseAreaScore.score_clinical_trials | From disease area |
| Trade Pubs Score | HCPDiseaseAreaScore.score_trade_pubs | From disease area |
| Org Leadership Score | HCPDiseaseAreaScore.score_org_leadership | From disease area |
| Org Awareness Score | HCPDiseaseAreaScore.score_org_awareness | From disease area |
| Conference Score | HCPDiseaseAreaScore.score_conference | From disease area |
| Social Media Score | HCPDiseaseAreaScore.score_social_media | From disease area |
| Media/Podcasts Score | HCPDiseaseAreaScore.score_media_podcasts | From disease area |
| Survey Score | HCPCampaignScore.score_survey | Campaign-specific |
| Composite Score | HCPCampaignScore.composite_score | Campaign composite |
| Nomination Count | HCPCampaignScore.nomination_count | Campaign nominations |

**Note:** The export joins HCP_CAMPAIGN_SCORE with HCP_DISEASE_AREA_SCORE (matching on disease area) to provide a complete view.

### Module 8: Interactive Analytics Dashboards (Phase 2)

Enhanced client portal with visual analytics dashboards for comprehensive KOL analysis. Uses a **config-driven approach** to support 80% standard visualizations with 20% client-specific customizations — minimizing manual work per client.

#### Architecture: Config-Driven Dashboards

**Why this approach vs. Superset/Metabase:**

| Consideration | External Tool (Superset) | Config-Driven (Recommended) |
|---------------|--------------------------|----------------------------|
| Per-client setup | Clone dashboard, manual edits | Admin configures via UI |
| Customization | Limited to tool features | Full control |
| UX consistency | Iframe embedding quirks | Native, polished |
| Maintenance | Separate system to host/secure | Part of platform |
| Dev effort per client | Medium | Near-zero |

#### Technology Stack for Dashboards

| Component | Library | Rationale |
|-----------|---------|-----------|
| Charts | **Recharts** | React-native, declarative, covers bar/pie/line/area |
| Tables | **TanStack Table** | Sorting, filtering, pagination built-in |
| Maps | **React Simple Maps** | Lightweight US state/region views |
| Framework | Next.js + Tailwind | Consistent with platform |

**Why not D3.js?** D3 is powerful but verbose — 50+ lines for a bar chart vs. 10 with Recharts. D3 makes sense for novel visualizations, not standard charts.

#### The 80/20 Split

**80% Standard Components (Pre-built, always available):**

| Component | Type | Data Source | Description |
|-----------|------|-------------|-------------|
| Response Rate Card | KPI | campaign_stats | Completion % with trend |
| Completion Funnel | Funnel | campaign_stats | Sent → Opened → Started → Completed |
| Top KOLs Table | Table | hcp_scores | Ranked list with composite scores |
| Score Distribution | Histogram | hcp_scores | Bell curve of scores |
| Geographic Heat Map | Map | hcp_locations | US map with HCP density |
| Segment Score Breakdown | Stacked Bar | hcp_segment_scores | 9 segments side-by-side |
| Score Trend Over Time | Line | historical_scores | Campaign-over-campaign comparison |

**20% Custom Components (Config-driven, admin builds via UI):**

Custom visualizations based on client-specific survey questions. Admin selects:
- Chart type (bar, pie, table)
- Data source (survey responses, HCP attributes)
- Question to visualize
- Grouping dimension (specialty, region, etc.)
- Metric (count, average, sum)

#### Dashboard Configuration Model

```
┌─────────────────────────────────────────────────────────────────────┐
│ DASHBOARD CONFIGURATION (stored in database per client/campaign)    │
├─────────────────────────────────────────────────────────────────────┤
│ {                                                                   │
│   "client_id": "pharma_corp",                                       │
│   "campaign_id": "dry_eye_2025",                                    │
│   "sections": [                                                     │
│     {                                                               │
│       "title": "Response Overview",                                 │
│       "type": "standard",                                           │
│       "components": ["response_rate", "completion_funnel"]          │
│     },                                                              │
│     {                                                               │
│       "title": "KOL Rankings",                                      │
│       "type": "standard",                                           │
│       "components": ["top_kols_table", "score_distribution"]        │
│     },                                                              │
│     {                                                               │
│       "title": "Custom: Trial Interest",                            │
│       "type": "custom",                                             │
│       "components": [                                               │
│         {                                                           │
│           "chart_type": "bar",                                      │
│           "title": "Clinical Trial Interest by Specialty",          │
│           "data_source": "question_responses",                      │
│           "question_id": "q_trial_interest",                        │
│           "group_by": "specialty",                                  │
│           "metric": "count"                                         │
│         }                                                           │
│       ]                                                             │
│     }                                                               │
│   ]                                                                 │
│ }                                                                   │
└─────────────────────────────────────────────────────────────────────┘
```

#### Dashboard Builder UX (Admin Interface)

```
┌─────────────────────────────────────────────────────────────────────┐
│ DASHBOARD CONFIGURATION: Dry Eye 2025 - Pharma Corp                 │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ STANDARD SECTIONS                                    [Expand All]│ │
│ │                                                                 │ │
│ │ ☑ Response Overview                                             │ │
│ │   └ Response Rate Card, Completion Funnel                       │ │
│ │ ☑ KOL Rankings                                                  │ │
│ │   └ Top KOLs Table, Score Distribution                          │ │
│ │ ☑ Geographic Analysis                                           │ │
│ │   └ Heat Map, Regional Breakdown                                │ │
│ │ ☐ Score Trends (hide for this client)                           │ │
│ │                                                                 │ │
│ ├─────────────────────────────────────────────────────────────────┤ │
│ │ CUSTOM SECTIONS                              [+ Add Custom Chart]│ │
│ │                                                                 │ │
│ │ ┌─────────────────────────────────────────────────────────────┐ │ │
│ │ │ 📊 Clinical Trial Interest by Specialty          [Edit] [×] │ │ │
│ │ │    Bar Chart | Question: Q12 | Group: Specialty             │ │ │
│ │ └─────────────────────────────────────────────────────────────┘ │ │
│ │ ┌─────────────────────────────────────────────────────────────┐ │ │
│ │ │ 🥧 Conference Attendance Distribution            [Edit] [×] │ │ │
│ │ │    Pie Chart | Question: Q8 | Metric: Count                 │ │ │
│ │ └─────────────────────────────────────────────────────────────┘ │ │
│ │                                                                 │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ [Preview Dashboard]  [Save Draft]  [Publish to Client Portal]       │
└─────────────────────────────────────────────────────────────────────┘
```

#### Add Custom Visualization Modal

```
┌─────────────────────────────────────────────────────────────────────┐
│ ADD CUSTOM VISUALIZATION                                            │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ Title: [Clinical Trial Interest by Specialty___________]        │ │
│ │                                                                 │ │
│ │ Chart Type:                                                     │ │
│ │   ○ Bar Chart  ○ Pie Chart  ○ Table  ○ Line Chart               │ │
│ │                                                                 │ │
│ │ Data Source: [Survey Responses ▼]                               │ │
│ │                                                                 │ │
│ │ Question: [Q12: Rate your interest in clinical trials ▼]        │ │
│ │                                                                 │ │
│ │ Group By: [Specialty ▼]                                         │ │
│ │           Options: Specialty, Region, Years in Practice         │ │
│ │                                                                 │ │
│ │ Metric: ○ Count  ○ Average  ○ Sum                               │ │
│ │                                                                 │ │
│ │ [Preview]                                                       │ │
│ │ ┌─────────────────────────────────────────────────────────────┐ │ │
│ │ │  ████████████████ Ophthalmology (45)                        │ │ │
│ │ │  ████████████ Optometry (32)                                │ │ │
│ │ │  ██████ Retina Specialist (18)                              │ │ │
│ │ └─────────────────────────────────────────────────────────────┘ │ │
│ │                                                                 │ │
│ │ [Cancel]                              [Add to Dashboard]        │ │
│ └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

#### Data Model: Dashboard Configuration

```
┌─────────────────────┐       ┌─────────────────────┐
│ DashboardConfig     │       │ DashboardComponent  │
├─────────────────────┤       ├─────────────────────┤
│ id                  │──┐    │ id                  │
│ client_id (FK)      │  │    │ dashboard_id (FK)   │
│ campaign_id (FK)    │  └───▶│ component_type      │  ← standard | custom
│ name                │       │ component_key       │  ← e.g., "top_kols_table"
│ is_published        │       │ config_json         │  ← custom chart settings
│ created_at          │       │ section_title       │
│ updated_at          │       │ display_order       │
└─────────────────────┘       │ is_visible          │
                              └─────────────────────┘
```

#### Rendering Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ CLIENT PORTAL REQUEST                                               │
│ GET /api/dashboard/{campaign_id}                                    │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ LOAD CONFIG FROM DATABASE                                           │
│ DashboardConfig + DashboardComponents for this campaign             │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ REACT DASHBOARD RENDERER                                            │
│ Maps component_key → React component                                │
│                                                                     │
│  Standard Components:              Custom Components:               │
│  ┌──────────────────────┐         ┌──────────────────────┐         │
│  │ "response_rate"      │         │ config_json parsed   │         │
│  │   → <ResponseRate /> │         │   → <DynamicChart    │         │
│  │ "top_kols_table"     │         │        type="bar"    │         │
│  │   → <TopKolsTable /> │         │        data={...}    │         │
│  │ "score_distribution" │         │        groupBy=...   │         │
│  │   → <ScoreHist />    │         │      />              │         │
│  └──────────────────────┘         └──────────────────────┘         │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ RENDERED DASHBOARD                                                  │
│ Consistent UX, client-specific content                              │
└─────────────────────────────────────────────────────────────────────┘
```

#### Design Decisions

| Decision | Approach | Rationale |
|----------|----------|-----------|
| External tool vs. built-in | Built-in with Recharts | Full control, no embedding issues, consistent UX |
| Standard charts editable? | Toggle visibility only | Prevent accidental misconfiguration |
| Custom chart types | Bar, Pie, Table, Line | Covers 95% of use cases |
| Config storage | Database (JSON column) | Easy to clone, version, audit |
| Chart library | Recharts | React-native, declarative, sufficient for standard charts |
| Default dashboard | Auto-created on campaign | Every campaign gets standard sections by default |

### Module 9: Lite Client Support (Phase 2)

A dashboard solution for Lite Clients who access KOL scores without conducting surveys, using BioExec's aggregated disease area data.

---

## 3. Non-Functional Requirements

### Logging Strategy

#### Application Logging (Troubleshooting)

| Level | Use Case | Examples |
|-------|----------|----------|
| `ERROR` | Failures requiring attention | DB connection failed, 3rd party API error, unhandled exception |
| `WARN` | Potential issues, degraded service | Retry succeeded, slow query, rate limit approaching |
| `INFO` | Key business events | User login, survey submitted, payment exported |
| `DEBUG` | Detailed flow (dev/staging only) | Request payload, query params, function entry/exit |

**Structured Log Format (JSON):**

```json
{
  "timestamp": "2025-01-15T10:23:45.123Z",
  "level": "INFO",
  "service": "api",
  "trace_id": "abc-123-xyz",
  "user_id": "user_456",
  "tenant_id": "client_789",
  "action": "survey.submitted",
  "campaign_id": "camp_101",
  "response_id": "resp_202",
  "duration_ms": 145,
  "message": "Survey response submitted successfully"
}
```

**Key Log Fields:**

| Field | Purpose |
|-------|---------|
| `trace_id` | Correlate logs across services/requests |
| `user_id` | Who performed the action |
| `tenant_id` | Multi-tenant isolation for log queries |
| `action` | Searchable event type |
| `duration_ms` | Performance tracking |

#### Audit Logging (Compliance)

Separate audit log for compliance-sensitive operations — immutable, retained per policy.

**Audited Events:**

| Category | Events |
|----------|--------|
| Authentication | Login, logout, failed login, password reset |
| User Management | User created, role changed, user disabled |
| Data Access | HCP data viewed, exported, modified |
| Survey | Response submitted, edited, deleted |
| Nominations | Matched, excluded, alias created |
| Scores | Published, recalculated |
| Payments | Exported, status imported, manually updated |
| Configuration | Campaign created, weights changed, survey published |

**Audit Log Schema:**

```
┌─────────────────────────────────────────────────────────────────────┐
│ AUDIT_LOG                                                           │
├─────────────────────────────────────────────────────────────────────┤
│ id                      PK
│ timestamp               when event occurred
│ actor_id                FK → User (who)
│ actor_type              user | system | api_key
│ tenant_id               FK → Client (multi-tenant filter)
│ action                  event type (e.g., "hcp.updated")
│ resource_type           entity type (e.g., "HCP", "Campaign")
│ resource_id             entity ID
│ old_value               JSON snapshot before change (if applicable)
│ new_value               JSON snapshot after change (if applicable)
│ ip_address              request origin
│ user_agent              browser/client info
│ metadata                additional context (JSON)
└─────────────────────────────────────────────────────────────────────┘
```

**Audit Retention:** 5 years (per data retention policy)

---

### Testing Strategy

#### Unit Tests

| Layer | Coverage Target | Focus |
|-------|-----------------|-------|
| Services/Business Logic | 80%+ | Core calculations, validations, state transitions |
| API Routes | 80%+ | Request validation, auth checks, response format |
| Utilities | 90%+ | Helper functions, formatters, parsers |
| React Components | 70%+ | User interactions, conditional rendering |

**Unit Test Standards:**

| Standard | Requirement |
|----------|-------------|
| Framework | Vitest (backend + frontend) |
| Naming | `describe('ServiceName')` → `it('should do X when Y')` |
| Isolation | Mock external dependencies (DB, APIs) |
| Speed | Suite runs < 60 seconds |
| CI Gate | PRs blocked if tests fail |

**Critical Paths Requiring Tests:**

| Module | Critical Tests |
|--------|----------------|
| Auth | Token validation, role checks, tenant isolation |
| Survey | Response validation, nomination extraction, duplicate detection |
| Scoring | Mention counting, scaling formula, weight calculations |
| Payments | Export generation, import matching, status transitions |
| Multi-tenant | Data isolation, cross-tenant access prevention |

#### Integration Tests

| Scope | Coverage |
|-------|----------|
| API Endpoints | All CRUD operations with real DB (test container) |
| Auth Flows | Signup → approval → login → access |
| Survey Flow | Create → distribute → respond → score |
| Payment Flow | Export → import → reconcile |

**Integration Test Standards:**

| Standard | Requirement |
|----------|-------------|
| Database | Testcontainers (PostgreSQL) |
| Isolation | Each test suite gets fresh DB |
| Speed | Suite runs < 5 minutes |
| CI Gate | Run on PR merge to main |

#### End-to-End Tests

| Flow | Scope |
|------|-------|
| Survey Taking | HCP receives link → completes survey → submission confirmed |
| Admin Workflow | Create campaign → configure survey → send invites |
| Client Portal | Login → view results → export data |

**E2E Test Standards:**

| Standard | Requirement |
|----------|-------------|
| Framework | Playwright |
| Environments | Staging only (not production) |
| Frequency | Nightly + before release |
| Flakiness | < 5% flaky test tolerance |

---

### Monitoring & Health Checks

#### Health Check Endpoints

**Backend API:**

```
GET /health/live    → Basic liveness (is process running?)
GET /health/ready   → Readiness (can handle traffic?)
GET /health/full    → Detailed status (admin only)
```

**Liveness Response:**

```json
{
  "status": "ok",
  "timestamp": "2025-01-15T10:23:45.123Z"
}
```

**Readiness Response:**

```json
{
  "status": "ok",
  "checks": {
    "database": "ok",
    "cognito": "ok"
  }
}
```

**Full Health Response (Admin Only):**

```json
{
  "status": "ok",
  "version": "1.2.3",
  "uptime_seconds": 86400,
  "checks": {
    "database": { "status": "ok", "latency_ms": 12 },
    "cognito": { "status": "ok", "latency_ms": 45 },
    "ses": { "status": "ok" }
  },
  "memory": { "used_mb": 256, "total_mb": 512 }
}
```

**Frontend (Next.js on Amplify):**

```
GET /health         → Static health page (Amplify handles routing)
```

Note: Frontend health is primarily monitored via Amplify's built-in health checks and CloudWatch Web Vitals.

#### Dependency Checks

| Dependency | Check Method | Timeout |
|------------|--------------|---------|
| Aurora PostgreSQL | `SELECT 1` query | 5s |
| AWS Cognito | Token validation call | 5s |
| AWS SES | Service status (cached) | 5s |
| AWS S3 | Bucket access check | 5s |

#### CloudWatch Metrics

**Backend Metrics:**

| Metric | Description | Alarm Threshold |
|--------|-------------|-----------------|
| `api.request.count` | Total requests | — |
| `api.request.latency_p95` | 95th percentile latency | > 2s |
| `api.request.errors` | 5xx error count | > 10/min |
| `api.request.4xx` | Client errors | > 100/min |
| `db.query.latency_p95` | DB query latency | > 500ms |
| `db.connection.pool` | Active connections | > 80% pool |
| `auth.login.failed` | Failed logins | > 20/min (brute force) |

**Frontend Metrics:**

| Metric | Description | Alarm Threshold |
|--------|-------------|-----------------|
| `web.page.load_time` | Page load duration | > 3s |
| `web.errors.js` | JavaScript errors | > 50/hour |
| `web.vitals.lcp` | Largest Contentful Paint | > 2.5s |
| `web.vitals.fid` | First Input Delay | > 100ms |

**Business Metrics:**

| Metric | Description | Alert |
|--------|-------------|-------|
| `survey.response.count` | Submissions per hour | — |
| `survey.response.errors` | Failed submissions | > 5/hour |
| `payment.export.count` | Payment exports | — |
| `payment.bounce.rate` | Bounced payments % | > 10% |

#### Alerting

| Severity | Response Time | Channel | Examples |
|----------|---------------|---------|----------|
| Critical | < 15 min | PagerDuty + Slack | DB down, API 5xx spike, auth failure |
| Warning | < 1 hour | Slack | High latency, error rate elevated |
| Info | Next business day | Email digest | Unusual patterns, capacity trends |

**Alert Examples:**

| Alert | Condition | Severity |
|-------|-----------|----------|
| API Down | Health check fails 3x consecutive | Critical |
| High Error Rate | 5xx > 10/min for 5 min | Critical |
| Slow Responses | p95 latency > 2s for 10 min | Warning |
| DB Connection Pool | > 80% utilized for 15 min | Warning |
| Failed Logins Spike | > 20 failed/min | Warning |
| Survey Submission Errors | > 5 failures/hour | Warning |

#### Ops Dashboard (CloudWatch)

```
┌─────────────────────────────────────────────────────────────────────┐
│ KOL360 OPERATIONS DASHBOARD                                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ SERVICE HEALTH                           CURRENT ALERTS             │
│ ┌─────────────┐ ┌─────────────┐          ┌─────────────────────────┐│
│ │ API: ● OK   │ │ DB: ● OK    │          │ ⚠ High latency (p95)   ││
│ └─────────────┘ └─────────────┘          │   2.3s (threshold: 2s)  ││
│ ┌─────────────┐ ┌─────────────┐          └─────────────────────────┘│
│ │ Auth: ● OK  │ │ Web: ● OK   │                                     │
│ └─────────────┘ └─────────────┘                                     │
│                                                                     │
│ REQUEST VOLUME (24h)                     ERROR RATE (24h)           │
│ ┌─────────────────────────────┐          ┌─────────────────────────┐│
│ │     ╭─╮                     │          │                         ││
│ │   ╭─╯ ╰─╮    ╭──╮           │          │ ___________  0.1%       ││
│ │ ──╯     ╰────╯  ╰──         │          │                         ││
│ └─────────────────────────────┘          └─────────────────────────┘│
│                                                                     │
│ LATENCY P95 (24h)                        DB CONNECTIONS             │
│ ┌─────────────────────────────┐          ┌─────────────────────────┐│
│ │                    ╭─╮      │          │ ████████░░░░ 65%        ││
│ │ ──────────────────╯ ╰──    │          │ 13 / 20 connections      ││
│ └─────────────────────────────┘          └─────────────────────────┘│
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

### Error Handling Standards

#### Backend Error Responses

**Standard Error Format:**

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request parameters",
    "details": [
      { "field": "email", "message": "Invalid email format" }
    ],
    "trace_id": "abc-123-xyz"
  }
}
```

**Error Codes:**

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid request data |
| `UNAUTHORIZED` | 401 | Missing/invalid auth |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource doesn't exist |
| `CONFLICT` | 409 | Duplicate/state conflict |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Unexpected server error |
| `SERVICE_UNAVAILABLE` | 503 | Dependency down |

#### Frontend Error Handling

| Error Type | User Experience |
|------------|-----------------|
| Network error | "Connection lost. Retrying..." with auto-retry |
| 401 Unauthorized | Redirect to login |
| 403 Forbidden | "You don't have access to this resource" |
| 404 Not Found | Friendly "Page not found" screen |
| 500 Server Error | "Something went wrong. Please try again." |
| Form validation | Inline field errors |

#### Error Tracking

| Tool | Purpose |
|------|---------|
| Sentry (or AWS X-Ray) | Exception tracking, stack traces |
| CloudWatch Logs | Centralized log aggregation |
| CloudWatch Insights | Log queries and analysis |

---

### Performance Standards

| Metric | Target | Measurement |
|--------|--------|-------------|
| API response (p95) | < 500ms | CloudWatch |
| Page load (LCP) | < 2.5s | Web Vitals |
| Time to Interactive | < 3.5s | Lighthouse |
| Database query (p95) | < 100ms | Query logging |
| Survey submission | < 2s end-to-end | APM |

---

### Responsive Design Strategy

The platform is responsive with a **tiered approach** — full mobile support for critical paths (surveys), functional mobile for viewing, desktop-preferred for complex admin tasks.

#### Mobile Use Cases by User Type

| User Type | Mobile Use Case | Priority |
|-----------|-----------------|----------|
| HCP taking survey | Complete survey on phone | 🔴 Critical |
| Client team member | Check dashboard, view results | 🟡 Important |
| Client admin | Quick status check | 🟡 Important |
| Platform admin | Complex config, data entry | 🟢 Low (desktop OK) |

#### Tiered Responsive Approach

**Tier 1: Full Mobile Support (Must Work Well)**

| Feature | Mobile Adaptation |
|---------|-------------------|
| Survey taking | Single-column, large touch targets, progress indicator |
| Login / Auth | Standard responsive form |
| Dashboard KPIs | Cards stack vertically |
| Score leaderboard | Simplified table or card view |
| Notifications | Native-feeling alerts |

**Tier 2: Functional but Desktop-Preferred**

| Feature | Mobile Adaptation |
|---------|-------------------|
| Survey results table | Card view toggle or horizontal scroll with sticky first column |
| HCP profile view | Collapsible sections |
| Campaign overview | Summary cards, drill-down for details |
| Charts/visualizations | Full-width, touch-friendly tooltips |

**Tier 3: Desktop-Only (Graceful Degradation)**

| Feature | Mobile Behavior |
|---------|-----------------|
| Survey builder | Read-only preview, "Edit on desktop" prompt |
| Question bank management | View-only list, edit disabled |
| Dashboard configuration | View-only, "Configure on desktop" message |
| Bulk imports (Excel) | Hidden, "Use desktop for imports" message |
| Complex data tables (50+ columns) | Card view or "View on desktop" |

#### Responsive Patterns

**Tables → Cards on Mobile:**

```
DESKTOP:
┌────────────┬────────────┬──────────┬───────┐
│ Name       │ Specialty  │ Status   │ Score │
├────────────┼────────────┼──────────┼───────┤
│ Dr. Jane   │ Ophthalm   │ ● Done   │ 87    │
└────────────┴────────────┴──────────┴───────┘

MOBILE (Card View):
┌─────────────────────────────┐
│ Dr. Jane Doe           87   │
│ Ophthalmology    ● Complete │
├─────────────────────────────┤
│ Dr. John Smith         —    │
│ Optometry        ○ Pending  │
└─────────────────────────────┘

Toggle: [Table] [Cards]
```

**Complex Forms → Stepper on Mobile:**

```
MOBILE:
┌─────────────────────────────┐
│ Step 2 of 4: Practice Info  │
│ ━━━━━━━━━━○───────────────  │
├─────────────────────────────┤
│ Primary Specialty           │
│ [Ophthalmology ▼]           │
│                             │
│ Years in Practice           │
│ [15                      ]  │
├─────────────────────────────┤
│ [← Back]           [Next →] │
└─────────────────────────────┘
```

**Dashboards → Stacked Cards:**

```
MOBILE:
┌─────────────────────────────┐
│ Response Rate               │
│        78%                  │
│   ███████████░░░            │
├─────────────────────────────┤
│ Top KOLs                    │
│ 1. Dr. Linstrum      100    │
│ 2. Dr. Chen           87    │
│ [View All →]                │
└─────────────────────────────┘
```

**Navigation → Bottom Nav (Clients) / Hamburger (Admin):**

```
MOBILE CLIENT NAV:
┌─────────────────────────────┐
│ ☰  KOL360          [avatar] │
├─────────────────────────────┤
│      (page content)         │
├─────────────────────────────┤
│ 🏠    📊    📋    👤        │
│ Home  Dash  Results Profile │
└─────────────────────────────┘
```

#### Survey Mobile UX (Critical Path)

Since HCPs taking surveys on mobile is critical, extra attention here:

| Element | Mobile Treatment |
|---------|------------------|
| Progress bar | Sticky at top |
| Questions | One per screen or scrollable single page |
| Multi-text nominations | Vertical stack, large "+" button |
| Radio/checkbox | Large touch targets (min 44px) |
| Dropdowns | Native select on iOS/Android |
| Save & resume | Auto-save, clear "Continue later" option |
| Submit | Sticky footer button |

```
MOBILE SURVEY:
┌─────────────────────────────┐
│ Dry Eye KOL Survey    65%   │
│ ━━━━━━━━━━━━━━━━━○───────── │
├─────────────────────────────┤
│ Who do you consider a       │
│ national thought leader     │
│ in Dry Eye disease?         │
│                             │
│ ┌─────────────────────────┐ │
│ │ Dr. Richard Linstrum    │ │
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ Dr. Sarah Chen          │ │
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │                         │ │
│ └─────────────────────────┘ │
│      [+ Add Another]        │
├─────────────────────────────┤
│ [← Previous]       [Next →] │
└─────────────────────────────┘
```

#### Breakpoints (Tailwind Defaults)

| Breakpoint | Width | Target |
|------------|-------|--------|
| `sm` | 640px | Large phones landscape |
| `md` | 768px | Tablets (primary mobile/desktop switch) |
| `lg` | 1024px | Small laptops |
| `xl` | 1280px | Desktops |

#### Implementation Notes

| Aspect | Approach |
|--------|----------|
| CSS Framework | Tailwind responsive utilities (`md:`, `lg:`) |
| Component library | Shadcn/ui (responsive by default) |
| Touch targets | Minimum 44x44px for all interactive elements |
| Font sizes | Minimum 16px inputs (prevents iOS zoom) |
| Tables | TanStack Table with card view toggle |
| Testing | Chrome DevTools + real device testing |

---

### NFR Summary

| Category | Requirement |
|----------|-------------|
| **Logging** | Structured JSON, trace IDs, separate audit log |
| **Audit** | All sensitive operations logged, 5-year retention |
| **Unit Tests** | 80% coverage, < 60s runtime, CI gate |
| **Integration Tests** | Real DB via Testcontainers, < 5 min |
| **E2E Tests** | Critical flows, Playwright, nightly runs |
| **Health Checks** | /health/live, /health/ready, /health/full |
| **Monitoring** | CloudWatch metrics, alerts, ops dashboard |
| **Alerting** | Critical < 15 min, Warning < 1 hour |
| **Error Handling** | Standard format, trace IDs, user-friendly |
| **Performance** | API < 500ms, Page < 2.5s LCP |
| **Responsive** | Tiered approach, mobile-first for surveys |

---

## 4. Technical Stack

### Architecture: Fastify Backend + Next.js Frontend

A separated architecture with Fastify handling API/business logic and Next.js handling the UI layer.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         ARCHITECTURE                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────┐         ┌─────────────────────┐            │
│  │   Next.js Frontend  │         │   Fastify Backend   │            │
│  │   (AWS Amplify)     │ ──────▶ │   (AWS App Runner)  │            │
│  │                     │   API   │                     │            │
│  │  • Admin Portal     │  calls  │  • REST API         │            │
│  │  • Client Portal    │         │  • Business Logic   │            │
│  │  • Survey UI        │         │  • Prisma ORM       │            │
│  └─────────────────────┘         └──────────┬──────────┘            │
│                                             │                       │
│                                             ▼                       │
│                                  ┌─────────────────────┐            │
│                                  │ Aurora PostgreSQL   │            │
│                                  │ (Serverless v2)     │            │
│                                  └─────────────────────┘            │
│                                                                     │
│  ┌─────────────────────┐         ┌─────────────────────┐            │
│  │   AWS Cognito       │         │   AWS S3            │            │
│  │   (Authentication)  │         │   (File Storage)    │            │
│  └─────────────────────┘         └─────────────────────┘            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Backend Stack (Fastify)

| Category | Component | Purpose |
|----------|-----------|---------|
| Runtime | Node.js 22 LTS | Latest features, native fetch |
| Framework | Fastify 5.x | Fast, low overhead, schema-based validation |
| Language | TypeScript 5.x | Type safety, better DX |
| ORM | Prisma | Type-safe database access |
| Validation | Zod + Fastify schemas | Request/response validation |
| Database | Aurora PostgreSQL | Serverless v2, auto-scaling |
| Auth | AWS Cognito | User authentication, SSO-ready |
| Deployment | AWS App Runner | Container-based, auto-scaling |

### Frontend Stack (Next.js)

| Category | Component | Purpose |
|----------|-----------|---------|
| Framework | Next.js 15 (App Router) | SSR, routing, React Server Components |
| Language | TypeScript 5.x | Type safety |
| Styling | Tailwind CSS | Utility-first CSS |
| Components | Shadcn/ui | Accessible, customizable components |
| State | React Query (TanStack) | Server state management, caching |
| Forms | React Hook Form + Zod | Form handling with validation |
| Deployment | AWS Amplify | CDN, CI/CD, preview deployments |

### API Design

| Aspect | Approach |
|--------|----------|
| Style | REST (OpenAPI 3.0 documented) |
| Auth | JWT tokens via Cognito |
| Versioning | URL prefix (`/api/v1/`) |
| Rate Limiting | Fastify rate-limit plugin |
| CORS | Configured for frontend domain(s) |

---

## 5. Questions & Clarifications Required

*The following questions must be resolved before development begins.*

### 5.1 Critical Gaps (Must Resolve Before Development)

#### Lite Client Model

| Question | Why It Matters | Response |
|----------|----------------|----------|
| What exactly is a 'dataset' for lite clients? | Is it a subset of HCPs? A previous campaign's results? Need clear definition. | ✅ It is the set of HCPs that are selected by the admin team for the client |
| Can lite clients see individual survey responses or just aggregate scores? | Major privacy/data sharing implications | ✅ No, they only see the scores not the raw data |
| How is consent handled when sharing data across clients? | Pharma compliance requirement | ✅ The data being shared is data owned by BioExec so no consent required |
| Can the same HCP data be sold to multiple lite clients? | Business model + data isolation design | ✅ Yes, it can be sold to multiple lite clients because the data collected belongs to BioExec as well |

#### HCP Scoring Logic

| Question | Why It Matters | Response |
|----------|----------------|----------|
| How are the 9 raw scores calculated? | Are they imported? Manually entered? Auto-calculated from external sources? | ✅ **See detailed breakdown below** |
| What's the scale for each score? (1-10? 1-100?) | Composite calculation depends on consistent scales | ✅ 1-100 |
| 'Overall scores using avg' — average of what exactly? | Composite scores? Raw scores per category? Need formula. | ✅ Total Weighted Score across all 9 segments using configurable weights |
| When a campaign closes, how are 'final raw scores' computed? | Algorithm/formula specification needed | ✅ Each segment has its own scoring, then weighted to create Total Weighted Score |
| What happens to an HCP's score if they appear in multiple campaigns? | Versioning strategy? Latest wins? Rolling average? | ✅ Scores are tracked per campaign AND per disease area. Same HCP can have different scores for different disease areas. |

**CLARIFICATION: The 9 Segment Scoring Architecture**

The "Sociometric Survey" is only 1 of the 9 segments. Each segment is sourced differently:

| Segment | Data Source | Collection Method |
|---------|-------------|-------------------|
| Peer-reviewed Publications | Data vendors (Monocle, IQVIA, etc.) | Imported/API |
| Clinical Trials | Data vendors (Monocle, IQVIA, etc.) | Imported/API |
| Trade Publications | Manual research | BioExec team manually combs through data |
| Org Leadership | Manual research | BioExec team |
| Org Awareness | Manual research | BioExec team |
| Conference Education | Manual research / Data vendors | Mixed |
| Social Media | Manual research | BioExec team manually combs through data |
| Media/Podcasts | Manual research | BioExec team |
| Sociometric Survey | KOL360 Platform | Survey responses (nominations) |

**Scoring Process:**
1. Each segment has its own database of information
2. A score is generated for each HCP within each segment (1-100 scale)
3. Configurable weighting is applied to each segment
4. Total Weighted Score is calculated across all segments
5. Platform must support viewing each segment independently AND the total weighted score

**Survey (Sociometric) Score Details:**
- Total score of nominations received
- Some HCPs may have scores in different categories
- Need to see: total score AND score in each category
- Must be able to trace back: when viewing a nominated HCP, show who nominated them

📅 **ACTION ITEM:** Schedule 1-hour session to walk through raw data file and Looker Studio report to understand full depth of scoring

#### Survey Nomination Handling

| Question | Why It Matters | Response |
|----------|----------------|----------|
| When HCPs nominate other physicians, how is matching done? | Free text entry? NPI lookup? Dropdown selection? | ✅ Likely NPI lookup and manual verification/recon for this initial phase |
| What if a nominated physician doesn't exist in the HCP database? | Create new record? Flag for review? Ignore? | ✅ Flag for review and based on that, option to create a new record in the DB |
| How do nominations feed back into the scoring? | This is the 'sociometric survey' score — need algorithm | ✅ Total nominations received = score. Must track who nominated whom for traceability. Scores can be broken down by category. |
| Is there a limit to how many physicians can be nominated? | Impacts UI design and data model | ✅ Maximum 10 nominations per question. Dynamic add/remove with 3 visible fields initially. |

**RECOMMENDATION:** Suggest limiting to 5-10 nominations per question to keep data manageable and reduce survey fatigue. This is industry standard for KOL surveys.

#### Campaign Workflow States

| Question | Why It Matters | Response |
|----------|----------------|----------|
| What are all the campaign states? | Draft → Active → [Paused?] → Closed → [Published?] | ✅ No paused — just 4 states: Draft → Active → Closed → Published |
| Can a campaign be paused and resumed? | Affects reminder emails, link validity | ✅ No |
| Can surveys be reopened after submission? | Spec says yes until campaign closed — please confirm | ✅ **Yes, allow edits BUT need lock-down point** — must be able to lock before data pull. Also need to prevent duplicate submissions (same person submitting twice or using different email alias for 2nd honorarium) |
| What's the review/publish workflow for responses? | Admin approves before client sees? Batch or individual? | ✅ **See detailed workflow below** |
| Can individual responses be rejected/excluded? | Data quality control mechanism needed | ✅ Yes — BioExec reviews and can make edits (e.g., if someone is deceased, or data errors missed in review) |

**CLARIFICATION: Data Review & Publish Workflow**

| Access Level | What They See |
|--------------|---------------|
| Client IT & Market Research Teams | Raw data files (as requested) |
| BioExec Admin | Full raw data + review/edit capabilities |
| Client Portal (after publish) | Published/cleaned data only |

**Workflow:**
1. Survey responses come in → visible to BioExec admins immediately
2. BioExec reviews responses internally
3. BioExec can make edits (deceased HCPs, data errors, etc.)
4. BioExec can review WITH client before publishing
5. BioExec publishes → data visible in client portal
6. Raw data export available to client IT/Market Research teams

**Duplicate Submission Prevention:**
- Each HCP gets a unique survey token
- If using email-based sign-in, prevent same person from submitting under different email aliases
- System should detect and flag potential duplicate submissions for admin review

#### Email & Communication

| Question | Why It Matters | Response |
|----------|----------------|----------|
| Who sends the emails — BioExec domain or client domain? | SES configuration, deliverability, branding | ✅ **@bio-exec.com OR KOL360-related domain** — Several domains secured for development. Opportunity to build out KOL360 branding with landing page and website. Decision to be made as a team. |
| How many reminder emails and what cadence? | Business rules needed (e.g., 3 reminders at 3, 7, 14 days) | ✅ Manual step at this point — option for someone to manually send out a reminder |
| Is there an opt-out/unsubscribe mechanism? | CAN-SPAM compliance requirement | ✅ **Yes, needs design** — No opt-outs received to date, but need to plan for it. Open question: scope of opt-out (all surveys? specific client? everything from BioExec?) |
| What triggers the 'survey details' email to HCP? | Automatic on completion or manual trigger? | ✅ Automatic on completion |

**CLARIFICATION: Email & Branding Strategy**

| Element | Branding |
|---------|----------|
| Survey invitation email | BioExec brand only (NOT client branded) |
| Survey landing page | BioExec brand only |
| Reminder emails | BioExec brand only |
| Completion confirmation | BioExec brand only |

**Rationale:** Client branding is intentionally excluded to avoid influencing survey responses.

**Domain Options (To Be Decided):**
- @bio-exec.com ✅ **CONFIRMED**

**Opt-Out Levels (Confirmed):**

| Opt-Out Scope | Implication |
|---------------|-------------|
| Opt out of this survey | Still eligible for all other campaigns |
| Opt out of all surveys | No future survey invitations (transactional emails still sent) |

#### Payment Processing

| Question | Why It Matters | Response |
|----------|----------------|----------|
| What columns are needed in the payment export file? | Column specification needed for 3rd party integration | ✅ NPI, Full Name, Email, Survey Completion Date, Campaign Name, Payment Amount (see below) |
| What format does the 3rd party payment provider need? | CSV? Excel? Specific template? | ✅ XLS |
| What statuses come back from payment provider? | 'Sent' and 'accepted' mentioned — any others? | ✅ Defined: pending_export, exported, email_sent, email_delivered, email_opened, claimed, bounced, rejected, expired |
| Is payment amount stored per survey or per campaign? | Data model design impact | ✅ One survey per campaign — so one amount per campaign |
| What happens if payment fails? | Retry workflow? Manual intervention? | ✅ Manual reconciliation — admin reviews failures and handles individually |

**Payment Export Columns (Confirmed):** 
- NPI
- Full Name (First, Last)
- Email
- Survey Completion Date
- Campaign Name
- Payment Amount

---

### 5.2 Medium Priority Gaps

#### Multi-Tenant Data Model

| Question | Why It Matters | Response |
|----------|----------------|----------|
| Is the HCP database shared across all clients or per-client? | Spec implies shared ('centralized') — confirm | ✅ HCP DB belongs to BioExec and is the central DB — each client is given access to a subset decided by the BioExec admin team |
| If shared, how to prevent Client A from seeing Client B's scores? | Row-level security design requirement | ✅ The client gets to only view scores of the campaign that they ran or were assigned |
| Can two clients run campaigns with overlapping HCPs simultaneously? | Conflict handling strategy needed | ✅ **YES — this is a critical requirement** (see details below) |

**CLARIFICATION: Overlapping HCP Campaigns**

This is a confirmed and common scenario:

**Scenario 1: Same HCP, Different Disease Areas (Single Client)**
- Client commissions: Dry Eye survey, Glaucoma survey, Retina survey
- Same HCP may be targeted for all 3 surveys
- Each survey generates separate scores per disease area

**Scenario 2: Same HCP, Same Disease Area (Different Clients)**
- Client A and Client B both commission Dry Eye surveys
- Same HCP could be targeted by both clients simultaneously
- Each client's campaign generates its own scores

**Data Model Implications:**
| Entity | Relationship |
|--------|--------------|
| HCP | Central record (one per physician) |
| Campaign | Belongs to one Client, tagged with Disease Area |
| Survey Response | Links HCP → Campaign (one response per HCP per campaign) |
| HCP Score | Per Campaign AND per Disease Area |
| Nominations | Tracked per Campaign (who nominated whom) |

**Score Isolation:**
- Client A sees only scores from Client A's campaigns
- Disease-level scores are aggregated from campaigns within that disease area
- Overall HCP score can aggregate across disease areas (with appropriate weighting)

📅 **ACTION ITEM:** Review previous survey questions (Jen to provide)

#### Question Bank

| Question | Why It Matters | Response |
|----------|----------------|----------|
| Can clients create custom questions or only select from bank? | Spec says 'disease area customization' but unclear scope | ✅ Questions are only created by admin team — not by client |
| Can questions have conditional logic? | E.g., 'If yes to Q1, show Q2' — impacts UI complexity | ✅ Not for Phase 1 |
| Can questions be versioned? | What if you edit a question mid-campaign? | ✅ No changes to questions mid-campaign. Once a questionnaire is assigned to a campaign — it stays fixed for that campaign |
| Multi-text for nominations — how many fields? | Fixed number or dynamic add/remove? | ✅ Dynamic add/remove with max 10. Start with 3 visible fields and "[+ Add another]" button. |

**CONFIRMED — Nomination Fields:** Dynamic add/remove with a maximum of 10 nominations per question. Start with 3 visible fields and an "[+ Add another]" button.

#### Branding / White-Label

| Question | Why It Matters | Response |
|----------|----------------|----------|
| What branding elements are configurable? | Logo, colors, URL — anything else? (fonts, footer text?) | ✅ Client logo when they login to portal. **Survey emails and landing pages are BioExec brand only** — no client branding to avoid influencing responses |
| Custom domain per client or subdomain? | client.bioexec.com vs survey.clientname.com — SSL/DNS impact | ✅ Will be a BioExec subdomain (or KOL360 domain) |
| Is the survey URL branded? | Affects trust and response rates | ✅ BioExec/KOL360 branded — not client branded |

**CLARIFICATION: Branding Matrix**

| Touchpoint | Branding | Rationale |
|------------|----------|-----------|
| Client Portal Login | Client logo displayed | Personalization for client users |
| Client Portal Pages | BioExec platform | Consistent platform experience |
| Survey Invitation Email | BioExec/KOL360 only | Avoid influencing responses |
| Survey Landing Page | BioExec/KOL360 only | Avoid influencing responses |
| Survey Questions | BioExec/KOL360 only | Avoid influencing responses |
| Completion Email | BioExec/KOL360 only | Consistency |

**Key Decision:** Client branding is intentionally excluded from all survey-related touchpoints to maintain response integrity.

#### Data Export

| Question | Why It Matters | Response |
|----------|----------------|----------|
| What specific columns in each export type? | Specification needed for raw responses, nominations, demographics | ✅ Full raw response data can be exported by the clients |
| Are exports filtered by date range? Status? | Feature scope definition | ✅ Should be able to filter on screen and then trigger the export. Filter by date range and status is good. Sort options for NPI and HCP name or any other appropriate column |
| Excel only, or also CSV/PDF? | Implementation scope | ✅ XLS only |
| Are exports logged/audited? | Compliance requirement for pharma | ✅ Yes, exports are logged and audited |

---

### 5.3 Missing Non-Functional Requirements

| Question | Why It Matters | Response |
|----------|----------------|----------|
| Expected concurrent users? | Performance/scaling targets | ✅ Don't expect more than 10-20 concurrent users |
| Response time targets? | E.g., page load < 2 sec, API response < 500ms | ✅ Page loads under 2 secs and API under 500ms is good |
| Data retention policy? | How long to keep survey responses? Audit logs? | ✅ Will need to be held for at least 5 years and then a data archival policy will be defined in the coming years |
| Backup/Recovery requirements? | RPO/RTO targets? | ✅ Recommendation accepted: RPO 1 hour, RTO 4 hours (see details below) |
| Accessibility requirements? | WCAG 2.1 AA compliance? | ✅ Not for this initial release — maybe in a future version |
| Browser support? | Which browsers/versions? | ✅ Recommendation accepted: Chrome, Edge, Safari, Firefox (last 2 versions each) |
| Mobile support? | Responsive only, or native app later? | ✅ Responsive only |
| Localization? | English only, or multi-language support? | ✅ English only to begin with — but in future multi-lang especially Western European languages are likely |
| PHI/HIPAA confirmation? | Explicitly confirm no PHI is stored to avoid HIPAA scope | ✅ Correct — no PHI, only NPI and HCP data |

#### RECOMMENDATION: Backup/Recovery

For a small, non-mission-critical solution optimizing for cost:

| Setting | Recommendation | Rationale |
|---------|----------------|-----------|
| **RPO (Recovery Point Objective)** | 1 hour | Aurora automated backups with continuous backup to S3 |
| **RTO (Recovery Time Objective)** | 4 hours | Acceptable for non-critical system; allows time for manual intervention if needed |
| **Automated Backup Retention** | 7 days | Aurora default, allows point-in-time recovery within the week |
| **Manual Snapshots** | Weekly, retained 30 days | For additional safety before major releases |
| **Estimated Additional Cost** | ~$5-10/month | Minimal overhead, included in Aurora pricing |

Aurora Serverless v2 provides:
- Continuous backup to S3 (no performance impact)
- Point-in-time recovery to any second within retention period
- Automated failover within ~30 seconds
- 6 copies of data across 3 Availability Zones

#### RECOMMENDATION: Browser Support

| Browser | Minimum Version | Notes |
|---------|-----------------|-------|
| Chrome | Last 2 major versions | Primary target (~65% of users) |
| Edge | Last 2 major versions | Windows enterprise users |
| Safari | Last 2 major versions | Mac/iOS users |
| Firefox | Last 2 major versions | Secondary support |

**Not supported:** Internet Explorer (end of life), older mobile browsers

This covers 98%+ of enterprise users without excessive testing overhead.

---

### 5.4 User Roles Matrix (Confirmed)

| Role | Admin Module | HCP DB | Campaigns | Client Portal |
|------|--------------|--------|-----------|---------------|
| Platform Admin | Full | Full | Full | View All |
| Client Admin | — | View Own | View | Add/manage team members, view client portal pages (campaigns, surveys, dashboards) |
| Client Team Member | — | View Own | View Own | View |
| HCP (Survey Taker) | — | — | — | Own Survey |

---

## 6. Open Items Summary

### Action Items

| Item | Owner | Notes |
|------|-------|-------|
| 📅 Walk through raw data file and Looker Studio report | BioExec + Dev Team | 1-hour session to understand scoring depth |
| 📅 Review previous survey questions | Jen | To provide survey format/questions |

### Items Still Needing Response

*All critical items have been resolved.*

### Decisions Needed

*All critical decisions have been made.*

### Clarified Items (Previously Open)

| Item | Resolution |
|------|------------|
| How are the 9 raw scores calculated? | ✅ Each segment sourced differently — survey is 1 of 9 |
| Can surveys be reopened after submission? | ✅ Yes, but with lock-down before data pull + duplicate prevention |
| Review/publish workflow | ✅ BioExec reviews, can edit, then publishes |
| Can responses be rejected/excluded? | ✅ Yes, manual process for now |
| Email sending domain | ✅ @bio-exec.com confirmed |
| Opt-out mechanism | ✅ Two levels: this survey only, or all surveys |
| Overlapping HCP campaigns | ✅ Yes, supported — scores tracked per campaign + disease area |
| Survey branding | ✅ BioExec only, no client branding to avoid influence |
| Nomination field limit | ✅ Max 10 nominations per question, dynamic add/remove |
| Multi-text fields | ✅ Start with 3 visible, add more up to 10 |
| Disease areas | ✅ 4 initial: Retina, Dry Eye, Glaucoma, Cornea |
| Lite Client model | ✅ Live access to disease area scores (no snapshot) |
| 8 objective scores | ✅ Maintained at disease area level, manually uploaded |
| Survey score aggregation | ✅ BioExec aggregates across campaigns per disease area |
| Score history | ✅ SCD Type 2 for disease area scores |
| Payment statuses | ✅ Full status enum defined in spec |
| Payment failure handling | ✅ Manual reconciliation |
| KOL360 branding/website | ✅ Not current scope (landing page only, finalize later) |

---

## 7. Sign-Off

Once questions are resolved, both parties sign below to confirm the functional specification is complete and approved for development.

| BioExec | Service Provider |
|---------|------------------|
| Name: _______________________ | Name: _______________________ |
| Signature: ___________________ | Signature: ___________________ |
| Date: _______________________ | Date: _______________________ |
