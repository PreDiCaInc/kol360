# KOL360 Campaign User Guide

A step-by-step guide for creating and running KOL (Key Opinion Leader) assessment campaigns.

---

## Quick Start (5-Minute Overview)

New to KOL360? Here's the fastest path to launching your first campaign:

### 1. Create Campaign (2 min)
**Campaigns → + New Campaign**
- Enter campaign name, select client & disease area
- Choose survey template, set honorarium amount
- Click **Create**

### 2. Add HCPs (1 min)
**Campaign → HCPs tab**
- Search and add HCPs, or upload CSV
- Minimum 1 HCP required

### 3. Confirm Settings (1 min)
**Campaign → Score Config tab** → Click **Confirm**
**Campaign → Templates tab** → Click **Confirm**

### 4. Launch! (30 sec)
**Campaign → Initiate Survey tab**
- Click **Activate Campaign**
- Click **Send Invitations**

That's it! Your campaign is live. Monitor responses and send reminders as needed.

**Next steps after responses come in:**
- Match nominations → Close survey → Calculate scores → Publish → Export payments

---

## Overview

A campaign in KOL360 follows this lifecycle:

```
DRAFT → ACTIVE → CLOSED → PUBLISHED
```

| Status | What's Happening |
|--------|-----------------|
| **DRAFT** | Setup phase - configure campaign, assign HCPs, set templates |
| **ACTIVE** | Survey collection - HCPs receive invitations and complete surveys |
| **CLOSED** | Survey closed - calculate and review scores |
| **PUBLISHED** | Final scores published to disease area rankings |

---

## Phase 1: Campaign Setup (DRAFT)

### Step 1: Create a New Campaign

1. Navigate to **Campaigns** in the left sidebar
2. Click **+ New Campaign**

![Screenshot: Campaign list with New Campaign button](screenshots/campaigns-list.png)
*Campaign list showing the "+ New Campaign" button*

3. Fill in the campaign details:

| Field | Description |
|-------|-------------|
| **Campaign Name** | Descriptive name (e.g., "Q1 2026 Oncology KOL Assessment") |
| **Client** | Select the client/tenant for this campaign |
| **Disease Area** | Select the therapeutic area and condition |
| **Survey Template** | Choose a pre-built template or create custom questions |
| **Honorarium Amount** | Payment amount per completed survey (e.g., $150) |

4. Click **Create Campaign**

![Screenshot: New campaign form](screenshots/campaign-create-form.png)
*New campaign creation form*

Your campaign is now in **DRAFT** status.

---

### Step 2: Assign HCPs

HCPs (Healthcare Professionals) are the participants who will take the survey and nominate other KOLs.

1. Open your campaign and go to the **HCPs** tab

![Screenshot: Campaign HCPs tab](screenshots/campaign-hcps-tab.png)
*HCPs tab showing assigned participants and search functionality*

2. Add HCPs using one of these methods:

**Option A: Search and Add**
- Use the search bar to find HCPs by name or NPI
- Click **Add** next to each HCP you want to include

**Option B: Bulk Upload (CSV)**
- Click **Import HCPs**
- Upload a CSV file with columns: `npi`, `firstName`, `lastName`, `email`
- Review the import preview and confirm

**Minimum requirement:** At least 1 HCP must be assigned before activation.

---

### Step 3: Configure Score Weights

The composite score is calculated from 9 dimensions. You can adjust the weights based on what matters most for your assessment.

1. Go to the **Score Config** tab

![Screenshot: Score configuration](screenshots/campaign-score-config.png)
*Score configuration showing the 9 scoring dimensions with adjustable weights*

2. Review and adjust the weights:

| Dimension | Default Weight | Description |
|-----------|---------------|-------------|
| Publications | 10% | Peer-reviewed papers and research |
| Clinical Trials | 15% | Involvement in clinical research |
| Trade Publications | 10% | Industry publications and articles |
| Org Leadership | 10% | Leadership roles in organizations |
| Org Awareness | 10% | Recognition within professional orgs |
| Conference Speaking | 10% | Speaking engagements at conferences |
| Social Media | 5% | Professional social media presence |
| Media/Podcasts | 5% | Media appearances and podcast features |
| **Survey Responses** | **25%** | Peer nominations from the survey |

3. Ensure weights total **100%**
4. Click **Confirm Score Configuration**

---

### Step 4: Customize Email Templates

Personalize the emails that HCPs will receive.

1. Go to the **Templates** tab

![Screenshot: Email templates](screenshots/campaign-templates.png)
*Templates tab showing invitation and reminder email customization*

2. Customize these templates:

**Invitation Email**
- Subject line
- Email body (include survey purpose, estimated time, honorarium info)

**Reminder Email**
- Subject line
- Email body (for HCPs who haven't completed the survey)

**Landing Page Messages**
- Welcome message (shown when HCP opens survey)
- Thank you message (shown after completion)
- Already completed message (if HCP clicks link again)

3. Click **Confirm Templates**

---

### Step 5: Activate the Campaign

Before activating, verify the checklist:

- [ ] HCPs assigned
- [ ] Score configuration confirmed
- [ ] Templates confirmed
- [ ] Survey questions configured

1. Go to the **Initiate Survey** tab
2. Review the activation checklist

![Screenshot: Activation checklist](screenshots/campaign-activate-checklist.png)
*Activation checklist showing all requirements before launch*

3. Click **Activate Campaign**

Your campaign is now **ACTIVE** and ready for survey distribution.

---

## Phase 2: Survey Collection (ACTIVE)

### Step 6: Send Invitations

1. Go to the **Initiate Survey** tab
2. Review the distribution summary:
   - Total HCPs assigned
   - Invitations sent
   - Surveys completed

![Screenshot: Distribution summary](screenshots/campaign-distribution-stats.png)
*Distribution summary showing invitation and response statistics*

3. Click **Send Invitations**

Each HCP receives an email with a unique survey link. The system tracks:
- Email sent timestamp
- Email opened (if trackable)
- Survey started
- Survey completed

---

### Step 7: Monitor Responses

Track survey progress in real-time:

| Metric | Description |
|--------|-------------|
| **Not Invited** | HCPs who haven't received an invitation yet |
| **Invited** | Invitations sent, survey not started |
| **In Progress** | Survey started but not completed |
| **Completed** | Survey fully submitted |

---

### Step 8: Send Reminders

For HCPs who haven't completed the survey:

1. Go to the **Initiate Survey** tab
2. Click **Send Reminders**

The system automatically:
- Skips HCPs who already completed
- Respects a 24-hour cooldown between reminders
- Uses your customized reminder template

---

### Step 9: Match Nominations

As surveys come in, HCPs nominate colleagues. These nominations need to be matched to HCP records.

1. Go to the **Nominations** tab

![Screenshot: Nominations matching](screenshots/campaign-nominations.png)
*Nominations tab showing unmatched entries and matching suggestions*

2. Review unmatched nominations:

| Status | Action Needed |
|--------|--------------|
| **Matched** | Automatically matched - no action needed |
| **Review Needed** | System found possible matches - review and confirm |
| **Unmatched** | No matches found - manually search and link |

3. For each unmatched nomination:
   - View the raw name entered
   - Search for the correct HCP
   - Click **Link** to match, or **Create New HCP** if not in system
   - Or mark as **Excluded** if invalid

4. Click **Run Bulk Match** to auto-match remaining nominations

---

## Phase 3: Close Survey (CLOSED)

### Step 10: Close Survey Collection

When you've collected enough responses:

1. Go to the **Initiate Survey** tab
2. Click **Close Survey**

This:
- Stops accepting new survey responses
- Changes status to **CLOSED**
- Prepares campaign for score calculation

---

### Step 11: Calculate Scores

1. Go to the **Scores** tab
2. Click **Calculate Scores**

![Screenshot: Score calculation](screenshots/campaign-scores.png)
*Scores tab showing calculated composite scores for each HCP*

The system calculates:

**Survey Scores** (per HCP):
- Counts nominations received for each type
- Normalizes scores across all respondents

**Composite Scores** (per HCP):
- Combines survey scores with external data
- Applies your configured weights
- Produces final KOL ranking score

---

## Phase 4: Publish Results (PUBLISHED)

### Step 12: Publish Campaign

Publishing finalizes scores and updates disease area rankings.

1. Go to the **Scores** tab
2. Review the calculated scores
3. Click **Publish Results**

**Important:** Publishing cannot be undone. Scores become final and are aggregated into disease area KOL rankings.

---

### Step 13: View Dashboard

After publishing:

1. Go to the **Dashboard** tab

![Screenshot: Campaign dashboard](screenshots/campaign-dashboard.png)
*Dashboard showing top-ranked KOLs, score breakdown, and campaign metrics*

2. View:
   - Top-ranked KOLs by composite score
   - Score breakdown by dimension
   - Nomination network visualization
   - Campaign performance metrics

---

### Step 14: Manage Payments

For HCPs who completed the survey and are owed honorariums:

1. Go to the **Payments** tab

![Screenshot: Payments management](screenshots/campaign-payments.png)
*Payments tab showing payment status and export options*

2. View payment status:

| Status | Description |
|--------|-------------|
| **Pending Export** | Ready to be exported to accounting |
| **Exported** | Sent to accounting system |
| **Claimed** | Payment claimed by HCP |

3. Click **Export Payments** to generate a payment file
4. After payments are processed, import status updates

---

## Optional: Reopen Campaign

Need more responses after closing?

1. Go to the **Initiate Survey** tab
2. Click **Reopen Survey**

This changes status back to **ACTIVE**, allowing:
- Additional survey responses
- More invitations/reminders
- Updated score calculations

---

## Quick Reference: Campaign Checklist

### Before Activation
- [ ] Campaign name and disease area set
- [ ] HCPs assigned (minimum 1)
- [ ] Survey questions configured
- [ ] Score weights reviewed and confirmed
- [ ] Email templates customized and confirmed

### During Collection
- [ ] Invitations sent to all HCPs
- [ ] Monitor response rate
- [ ] Send reminders as needed
- [ ] Match nominations regularly

### Before Publishing
- [ ] Survey closed
- [ ] All nominations matched (or excluded)
- [ ] Scores calculated and reviewed
- [ ] Ready for final publication

### After Publishing
- [ ] Dashboard reviewed
- [ ] Payments exported
- [ ] Results shared with stakeholders

---

## Tips for Success

1. **Plan your HCP list carefully** - Quality participants lead to better nominations
2. **Customize your emails** - Personal, clear emails improve response rates
3. **Monitor daily** - Track responses and send reminders promptly
4. **Match nominations quickly** - Don't let the backlog grow
5. **Review scores before publishing** - Publishing is permanent

---

## Need Help?

- **Technical issues:** Contact your system administrator
- **Campaign strategy:** Consult with your client success manager
- **Data questions:** Review the campaign audit log for detailed history

---

*Last updated: January 2026*
