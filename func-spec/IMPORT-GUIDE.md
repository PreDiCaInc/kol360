# Survey Data Import Guide

## Overview

This guide covers importing survey respondent data and nominations from an external source (e.g., cleaned research data) into KOL360. This is used when survey data was collected outside the platform and needs to be loaded for the insights dashboard.

## Prerequisites

1. **HCPs must exist in the system first.** The import matches respondents by NPI. Any respondent whose NPI is not found in the HCP table will be skipped.
2. **A campaign must exist** for the disease area you're importing into. The campaign should be in PUBLISHED or ACTIVE status.
3. **Survey questions must be configured** on the campaign (the question bank + survey template must be set up so the import knows which question IDs to use).

## Template

Use `func-spec/survey-import-template.xlsx` as the starting point. It has two sheets:

### Sheet 1: Survey Data

| Column | Required | Description |
|---|---|---|
| NPI | Yes | National Provider Identifier — used to match respondent to HCP |
| Name | Yes | Full name (First Last) — for reference only, not used for matching |
| Role | Yes | Ophthalmologist or Optometrist |
| Years in Practice | No | Integer |
| Board Certified (Yes/No) | No | Yes or No |
| Zip Code | No | 5-digit US zip code |
| Practice Setting 1-3 | No | Multi-select — use multiple columns for multiple selections |
| Core Focus | No | Single value from: Comprehensive Ophthalmology, Medical Optometry, Cataract/Refractive Surgery, Cornea, Glaucoma, Retina, Dry Eye, Non-medical vision care, Other |
| Monthly Patients (number) | No | Integer — average monthly patient count |
| Monthly DED Patients (number) | No | Integer — average monthly DED patient count |
| Discussion Leader 1-5 | No | Full name (First Last) of nominated HCPs |
| Referral Leader 1-5 | No | Full name of nominated HCPs |
| Advice Leader 1-5 | No | Full name of nominated HCPs |
| National Leader 1-5 | No | Full name of nominated HCPs |
| Rising Star 1-5 | No | Full name of nominated HCPs |
| Social Leader 1-5 | No | Full name of nominated HCPs |

### Sheet 2: Instructions

Detailed field descriptions and valid values.

## Auto-Transformations

The following values are automatically standardized on import:

| Field | Input Values | Stored As |
|---|---|---|
| Specialty | OD | Optometry |
| Specialty | MD, DO | Ophthalmology |
| Nomination names | Dr., MD, OD, PhD, FACS, Jr, etc. | Stripped before matching (original preserved in rawNameEntered) |

## Data Quality Rules

1. **NPI must be valid and unique per row.** Duplicate NPIs will be skipped after the first.
2. **Nomination names should be as close to the HCP's actual name as possible.** The auto-match step will try to link names to HCPs, but misspellings reduce match rates. Titles and credentials (Dr., MD, OD) are automatically stripped before matching.
3. **Leave nomination cells empty** if the respondent didn't nominate anyone for that type. Don't use "N/A", "None", etc.
4. **Practice Setting** supports multiple values. Use columns 1, 2, 3 for respondents with multiple practice settings.
5. **Numbers only** for Monthly Patients and Monthly DED Patients — no commas, no text.

## Import Process

### Step 1: Prepare the data
- Fill in the template with cleaned survey data
- Verify all respondent NPIs are in the HCP table
- Remove test/internal entries

### Step 2: Import HCPs (if needed)
If the nominated HCPs aren't in the system yet, import them first via the HCP import on the platform.

### Step 3: Run the import script
```bash
# Dry run first (shows what would be created, no changes)
cd apps/api && npx tsx ../../scripts/import-survey-data.ts <path-to-excel> <campaign-id>

# Execute
cd apps/api && npx tsx ../../scripts/import-survey-data.ts <path-to-excel> <campaign-id> --execute
```

### Step 4: Run auto-match
After import, all nominations are UNMATCHED. Run auto-match from the campaign's Nominations tab in the UI, or:
```bash
# Via API
curl -X POST /api/v1/campaigns/<campaign-id>/nominations/auto-match
```

### Step 5: Review matches
Go to the campaign's Nominations tab and review:
- MATCHED — confirmed matches
- REVIEW_NEEDED — partial matches needing verification
- UNMATCHED — no match found (may need to create new HCPs or add aliases)

### Step 6: Calculate scores
Once nominations are matched, run score calculation from the campaign's Scores tab.

### Step 7: Load weighted scores (if available)
If 8-segment weighted scores are available from an external source:
```bash
cd apps/api && npx tsx ../../scripts/load-weighted-scores.ts [--execute]
```
This loads scores into `HcpDiseaseAreaScore` matching by NPI.

## What gets created

| Record | Description |
|---|---|
| CampaignHcp | Links respondent HCP to the campaign |
| SurveyResponse | One per respondent, status = COMPLETED |
| SurveyResponseAnswer | Demographic answers (years, board cert, practice setting, core focus, patients) |
| Nomination | One per nominated name, linked to the respondent's response |

## Troubleshooting

- **"Skipped (no HCP match)"** — Respondent's NPI not found in HCP table. Import the HCP first.
- **Low auto-match rate** — Nominated names may have typos or use nicknames. Add aliases in the Nominations review UI.
- **Missing nomination type** — If the survey didn't ask about a particular type (e.g., Referral Leaders), leave those columns empty.
