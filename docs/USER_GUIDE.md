# KOL360 Platform User Guide

## Table of Contents

1. [Platform Overview](#platform-overview)
2. [Getting Started](#getting-started)
3. [Dashboard Overview](#dashboard-overview)
4. [Managing HCPs (Healthcare Professionals)](#managing-hcps)
5. [Creating and Running a Campaign](#creating-and-running-a-campaign)
6. [Nomination Matching](#nomination-matching)
7. [Score Calculation and Publishing](#score-calculation-and-publishing)
8. [Dashboards and Analytics](#dashboards-and-analytics)
9. [User Management](#user-management)
10. [Client Management](#client-management)

---

## Platform Overview

**KOL360** is a Key Opinion Leader (KOL) assessment and management platform designed to help healthcare and pharmaceutical organizations identify, score, and manage healthcare professionals (HCPs) within specific therapeutic areas.

### Key Features

- **Campaign Management**: Create and manage KOL assessment campaigns
- **Survey Distribution**: Send customizable surveys to healthcare professionals
- **Nomination Tracking**: Collect and match peer nominations
- **Scoring System**: Calculate composite scores with configurable weights
- **Analytics Dashboards**: Visualize campaign results and KOL rankings
- **HCP Database**: Centralized healthcare professional management

### User Roles

| Role | Permissions |
|------|-------------|
| **Platform Admin** | Full system access - manage all clients, users, campaigns, and settings |
| **Client Admin** | Manage campaigns, users, and HCP data within their organization |
| **Team Member** | Limited access to campaigns within their organization |

---

## Getting Started

### Logging In

1. Navigate to the platform URL
2. Enter your email address and password
3. Click **Sign In**
4. If this is your first login, you may need to change your password

### First-Time Setup Checklist

Before creating your first campaign, ensure the following are configured:

- [ ] Disease areas are set up for your therapeutic focus
- [ ] HCPs are imported into the database
- [ ] Survey templates are created with appropriate questions
- [ ] Email templates are customized (optional)

---

## Dashboard Overview

After logging in, you'll see the Admin Dashboard with:

### Quick Statistics
- **Active Campaigns**: Number of currently running campaigns
- **HCPs in Database**: Total healthcare professionals available
- **Survey Responses**: Completed survey count
- **Pending Nominations**: Nominations awaiting matching

### Quick Actions
- Manage Clients
- Manage Users
- HCP Database
- Create Campaigns
- Configure Survey Templates
- View Analytics Dashboards

---

## Managing HCPs

### Viewing the HCP Database

1. Navigate to **HCP Database** from the sidebar
2. Use the search bar to find HCPs by name, NPI, or specialty
3. Filter by state or specialty as needed

### Importing HCPs

1. Go to **HCP Database**
2. Click **Import HCPs**
3. Download the CSV/Excel template if needed
4. Prepare your file with the following columns:
   - **NPI** (required, 10-digit National Provider Identifier)
   - **First Name** (required)
   - **Last Name** (required)
   - **Email** (required for survey distribution)
   - **City**
   - **State**
   - **Specialty**
   - **Years in Practice**
5. Upload your file
6. Review the import preview
7. Click **Import** to add HCPs to the database

> **Note**: HCPs are deduplicated by NPI. If an NPI already exists, the record will be updated.

### Adding Individual HCPs

1. Go to **HCP Database**
2. Click **Add HCP**
3. Fill in the required fields:
   - NPI (10 digits)
   - First Name
   - Last Name
   - Email
4. Add optional information (city, state, specialties)
5. Click **Save**

### Managing HCP Aliases

Aliases help match nominations to HCPs when names vary (nicknames, maiden names, etc.):

1. Open an HCP's detail page
2. Click **Manage Aliases**
3. Add alternative names
4. Save changes

---

## Creating and Running a Campaign

This section provides step-by-step instructions for the complete campaign lifecycle.

### Campaign Lifecycle Overview

```
DRAFT → ACTIVE → CLOSED → PUBLISHED
```

| Status | Description |
|--------|-------------|
| **Draft** | Setup phase - configure all campaign settings |
| **Active** | Campaign is live - surveys being collected |
| **Closed** | Survey collection ended - prepare for scoring |
| **Published** | Scores calculated - results available to client |

---

### Step 1: Create a New Campaign

1. Navigate to **Campaigns** in the sidebar
2. Click **Create Campaign**
3. Fill in the basic information:
   - **Campaign Name**: A descriptive name for the campaign
   - **Client**: Select the client organization
   - **Disease Area**: Select the therapeutic area
   - **Survey Template**: Choose a pre-configured template (optional)
4. Click **Create Campaign**

You'll be taken to the Campaign Configuration page.

---

### Step 2: Campaign Configuration (Draft Status)

The campaign configuration has multiple tabs that must be completed before activation:

#### 2.1 Overview Tab

Review and edit basic campaign details:
- Campaign name
- Description
- Client and disease area
- Target completion date

#### 2.2 HCPs Tab - Assign Healthcare Professionals

1. Click the **HCPs** tab
2. Click **Add HCPs**
3. Search and select HCPs from the database
4. Or use **Bulk Import** to add multiple HCPs at once
5. Review the assigned HCP list
6. Remove any HCPs if needed

> **Important**: Only HCPs assigned to the campaign will receive survey invitations.

**HCP Status Types:**
- **Assigned**: HCP is part of the campaign
- **Excluded**: HCP removed from campaign (can be re-added)

#### 2.3 Score Config Tab - Configure Scoring Weights

Set up how the composite KOL score will be calculated:

1. Click the **Score Config** tab
2. Define scoring segments:
   - **Segment Name**: e.g., "Clinical Expertise", "Leadership"
   - **Weight**: Percentage contribution (all weights must sum to 100%)
   - **Type**: Survey-based or Nomination-based
3. For nomination-based segments, configure nomination types:
   - Discussion Leaders
   - Referral Leaders
   - Advice Leaders
   - National Leader
   - Rising Star
   - Social Leader
4. Click **Save Configuration**

**Example Score Configuration:**

| Segment | Weight | Type |
|---------|--------|------|
| Clinical Expertise | 40% | Survey |
| Peer Recognition | 30% | Nominations |
| Leadership | 20% | Survey |
| Digital Presence | 10% | Survey |

#### 2.4 Email Templates Tab - Customize Communications

Customize the emails HCPs will receive:

**Invitation Email:**
1. Edit the subject line
2. Customize the email body
3. Use available merge fields:
   - `{{firstName}}` - HCP's first name
   - `{{lastName}}` - HCP's last name
   - `{{campaignName}}` - Campaign name
   - `{{surveyLink}}` - Auto-generated survey link

**Reminder Email:**
1. Configure reminder subject and body
2. Set maximum reminders allowed
3. Set minimum days between reminders

**Landing Page:**
1. Customize the welcome message
2. Customize the thank-you message

Click **Save Templates** when done.

---

### Step 3: Activate the Campaign (Initiate Survey)

Once all configuration is complete:

1. Click the **Initiate Survey** tab
2. Review the activation checklist:
   - [ ] HCPs assigned to campaign
   - [ ] Score configuration saved
   - [ ] Email templates configured
3. Click **Activate Campaign**
4. Confirm the activation

> **Warning**: Once activated, some settings cannot be changed. Review everything carefully.

---

### Step 4: Send Survey Invitations (Active Status)

After activation, send invitations to HCPs:

1. Go to the **Initiate Survey** tab
2. View invitation status:
   - **Not Invited**: Ready to receive invitation
   - **Invited**: Invitation sent
   - **Opened**: Email opened
   - **Completed**: Survey finished
3. Click **Send Invitations** to email all un-invited HCPs
4. Or select specific HCPs and click **Send Selected**

---

### Step 5: Monitor Survey Progress

Track survey completion in real-time:

1. View the **Response Funnel**:
   - Invitations Sent
   - Emails Opened
   - Surveys Started
   - Surveys Completed
2. Check individual response status in the HCPs tab
3. Review submitted responses in the **Responses** tab

---

### Step 6: Send Reminders

To encourage completion:

1. Go to **Initiate Survey** tab
2. Click **Send Reminders**
3. Reminders will be sent to:
   - HCPs who haven't completed the survey
   - HCPs who haven't received a reminder in the last 24 hours
   - HCPs who haven't exceeded the maximum reminder count

---

### Step 7: Close the Survey

When you've collected enough responses:

1. Go to the campaign overview
2. Click **Close Survey**
3. Confirm the closure

> **Note**: You can reopen the survey if needed by clicking **Reopen Survey**.

---

### Step 8: Match Nominations (Closed Status)

See the [Nomination Matching](#nomination-matching) section for detailed instructions.

---

### Step 9: Calculate Scores

See the [Score Calculation and Publishing](#score-calculation-and-publishing) section for detailed instructions.

---

### Step 10: Publish Results

After scores are calculated:

1. Review the calculated scores
2. Click **Publish Results**
3. Confirm publication

The campaign status changes to **Published** and results become available in the client portal.

---

## Nomination Matching

Nominations are peer recommendations collected through the survey. HCPs nominate colleagues they consider top KOLs.

### Nomination Statuses

| Status | Description |
|--------|-------------|
| **Unmatched** | New nomination, not linked to any HCP |
| **Matched** | Successfully linked to existing HCP |
| **Review Needed** | System found potential matches, needs manual review |
| **New HCP** | Created as new HCP from nomination |
| **Excluded** | Nomination excluded from scoring |

### Viewing Nominations

1. Navigate to your campaign
2. Click the **Nominations** tab
3. View nominations by status using the filter

### Auto-Matching Nominations

The system can automatically match nominations to existing HCPs:

1. Click **Auto-Match** button
2. The system will attempt to match nominations based on:
   - Exact name matches
   - Primary name matches
   - Alias matches
   - Partial name matches
3. Review the results

### Manual Matching

For nominations requiring review:

1. Click on a nomination marked **Review Needed**
2. View suggested HCP matches with confidence scores
3. Select the correct HCP match
4. Click **Confirm Match**

Or if no match exists:
1. Click **Create New HCP**
2. Enter the NPI and other required information
3. The nomination will be linked to the new HCP

### Excluding Nominations

To exclude invalid nominations:

1. Select the nomination
2. Click **Exclude**
3. Enter an exclusion reason
4. Confirm

---

## Score Calculation and Publishing

### Understanding Scores

KOL360 calculates two types of scores:

1. **Survey Score**: Based on survey question responses
2. **Composite Score**: Weighted combination of survey scores and nomination counts

### Calculating Scores

1. Navigate to your campaign (must be in **Closed** status)
2. Click the **Survey Scores** tab
3. Review the score configuration
4. Click **Calculate Scores**
5. Wait for calculation to complete

### Reviewing Scores

After calculation:

1. View the score summary table
2. Check individual HCP scores
3. Review score breakdown by segment
4. Identify any anomalies

### Quality Control

Before publishing, you can:

- **Exclude Responses**: Remove invalid survey responses from scoring
- **Update Answers**: Correct data entry errors
- **Recalculate**: Run scoring again after changes

### Publishing Scores

1. Review all scores carefully
2. Click **Publish Scores**
3. Confirm publication

Once published:
- Campaign status changes to **Published**
- Results appear in the client portal
- Dashboards become available
- Scores cannot be modified (unless unpublished)

---

## Dashboards and Analytics

### Campaign Dashboard

Access the campaign dashboard to view:

1. **Response Analytics**
   - Completion rates
   - Response funnel visualization
   - Response timeline

2. **KOL Rankings**
   - Top KOLs by composite score
   - Score distribution chart
   - Nomination counts

3. **Geographic Insights**
   - Heat map by state
   - Regional distribution

4. **Segment Analysis**
   - Score breakdown by segment
   - Nomination type distribution

### Creating Custom Charts

1. Navigate to **Dashboards** in the sidebar
2. Click **Create Chart**
3. Configure the chart:
   - **Chart Type**: Bar, Pie, Line, or Table
   - **Data Source**: Survey responses or HCP attributes
   - **Grouping**: By specialty, region, state, or years in practice
   - **Metric**: Count, Average, or Sum
4. Preview the chart
5. Click **Save**

### Exporting Data

From any dashboard or data table:

1. Click the **Export** button
2. Choose format (CSV or Excel)
3. Download the file

---

## User Management

### Inviting New Users

1. Navigate to **Users** in the sidebar
2. Click **Invite User**
3. Enter the user's email address
4. Select a role:
   - **Platform Admin**: Full access (admin only)
   - **Client Admin**: Manages their organization
   - **Team Member**: Limited campaign access
5. Select the client organization (for non-platform admins)
6. Click **Send Invitation**

The user will receive an email to set up their account.

### Approving Users

New users require approval:

1. Go to **Users**
2. Filter by **Pending Verification**
3. Review the user request
4. Click **Approve** or **Reject**

### Managing User Status

| Status | Description |
|--------|-------------|
| **Pending Verification** | Awaiting approval |
| **Active** | Can access the platform |
| **Disabled** | Access revoked |

To disable a user:
1. Find the user in the list
2. Click **Edit**
3. Change status to **Disabled**
4. Save changes

---

## Client Management

*(Platform Admins only)*

### Creating a Client

1. Navigate to **Clients** in the sidebar
2. Click **Create Client**
3. Enter client details:
   - **Client Name**: Organization name
   - **Client Type**: Full or Lite
   - **Logo**: Upload organization logo (optional)
   - **Primary Color**: Brand color for client portal
4. Click **Create**

### Managing Client Settings

1. Click on a client to open details
2. Edit settings as needed
3. View client's campaigns and users
4. Save changes

### Client Exclusions

Set up HCPs that should never be included in any of the client's campaigns:

1. Open client details
2. Go to **Exclusions** tab
3. Add HCPs to the exclusion list
4. These HCPs will be automatically excluded from all future campaigns

---

## Quick Reference: Campaign Creation Checklist

Use this checklist when creating a new campaign:

### Pre-Campaign Setup
- [ ] Disease area configured
- [ ] HCPs imported with NPIs and emails
- [ ] Survey template created with questions
- [ ] Questions assigned to sections

### Campaign Configuration (Draft)
- [ ] Campaign created with name, client, disease area
- [ ] HCPs assigned to campaign
- [ ] Score configuration saved (weights sum to 100%)
- [ ] Email templates customized
- [ ] Landing page messages set

### Campaign Execution (Active)
- [ ] Campaign activated
- [ ] Invitations sent to HCPs
- [ ] Response progress monitored
- [ ] Reminders sent as needed
- [ ] Survey closed when complete

### Post-Survey (Closed)
- [ ] Nominations reviewed and matched
- [ ] Invalid responses excluded
- [ ] Scores calculated
- [ ] Results reviewed for accuracy

### Publication (Published)
- [ ] Scores published
- [ ] Client portal dashboards verified
- [ ] Results exported if needed

---

## Troubleshooting

### Common Issues

**Q: HCPs not receiving survey invitations?**
- Verify HCP email addresses are correct
- Check spam/junk folders
- Ensure HCP is assigned to the campaign (not excluded)

**Q: Cannot activate campaign?**
- Ensure HCPs are assigned
- Verify score configuration is saved
- Check that all required fields are completed

**Q: Nomination not matching correctly?**
- Try manual matching
- Add aliases to the HCP record
- Check for spelling variations

**Q: Scores not calculating?**
- Ensure survey is in **Closed** status
- Verify score configuration is complete
- Check that responses exist

### Getting Help

For additional support:
- Contact your system administrator
- Submit a support ticket through the platform
- Review the documentation at `/docs`

---

## Glossary

| Term | Definition |
|------|------------|
| **HCP** | Healthcare Professional |
| **KOL** | Key Opinion Leader |
| **NPI** | National Provider Identifier (10-digit unique ID for US healthcare providers) |
| **Nomination** | A peer recommendation identifying another HCP as a KOL |
| **Composite Score** | Weighted combination of survey scores and nomination counts |
| **Disease Area** | Therapeutic focus area (e.g., Oncology, Cardiology) |
| **Survey Template** | Pre-configured set of questions and sections |

---

*Last Updated: January 2026*
