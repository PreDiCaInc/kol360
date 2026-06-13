import { z } from 'zod';
import { hcpSpecialtySchema } from './hcp';

// Schema for listing nominations
export const nominationListQuerySchema = z.object({
  status: z.enum(['UNMATCHED', 'MATCHED', 'REVIEW_NEEDED', 'NEW_HCP', 'EXCLUDED']).optional(),
  search: z.string().max(255).optional(),
  searchMode: z.enum(['contains', 'exact']).optional(),
  nominationType: z.enum([
    'DISCUSSION_LEADERS', 'REFERRAL_LEADERS', 'ADVICE_LEADERS', 'NATIONAL_LEADER',
    'RISING_STAR', 'SOCIAL_LEADER', 'REGIONAL_LEADER', 'BIASED_LEADER',
  ]).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

export type NominationListQuery = z.infer<typeof nominationListQuerySchema>;

// Match types for nomination matching
export const matchTypeSchema = z.enum(['exact', 'primary', 'alias', 'partial']);
export type MatchType = z.infer<typeof matchTypeSchema>;

// Schema for matching nomination to existing HCP
export const matchNominationSchema = z.object({
  hcpId: z.string().cuid(),
  addAlias: z.boolean().default(true),
  matchType: matchTypeSchema.optional(),
  matchConfidence: z.number().int().min(0).max(100).optional(),
});

export type MatchNominationInput = z.infer<typeof matchNominationSchema>;

// v1.17.34: re-point an already-matched nomination to a different HCP.
// Separate schema from matchNominationSchema so the API surface (and
// audit action) cleanly distinguishes first-match from a re-point.
// Caller usually does NOT want to add an alias on a rematch (the prior
// match already produced one if appropriate), so the default flips.
export const rematchNominationSchema = z.object({
  newHcpId: z.string().cuid(),
  addAlias: z.boolean().default(false),
  reason: z.string().max(500).optional(),
});

export type RematchNominationInput = z.infer<typeof rematchNominationSchema>;

// Schema for creating new HCP from nomination.
//
// specialty: hcpSpecialtySchema (canonical 2-value enum) — NOT a loose
// z.string(). The pre-2026-05-21 schema accepted any string; TypeScript
// silently widened CreateHcpFromNominationInput.specialty (loose) into
// the service's CreateHcpInput.specialty (strict enum), letting old-form
// values like 'Optometrist' slip through Zod and hit the DB CHECK
// constraint (Hcp_specialty_not_role_form) — producing a raw Prisma
// error in the steward's browser. Fixed by prod-team report 2026-05-21
// after Jen Pikor hit it 4 times during the v1.15.31 deploy window with
// a stale browser tab. The UI dropdown already constrains to the enum
// values, so anything else hitting this endpoint is a programming error
// worth surfacing as a clean 400.
export const createHcpFromNominationSchema = z.object({
  npi: z.string().length(10, 'NPI must be 10 digits').optional().nullable(),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  // v1.17.20: email required at the DB layer; preprocess null/undefined/
  // empty-string → nomail@kol360research.com so nomination flows that
  // don't capture an email still produce a valid row.
  email: z
    .preprocess(
      (v) => (v == null || v === '' ? 'nomail@kol360research.com' : v),
      z.string().email()
    ),
  specialty: hcpSpecialtySchema.optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
});

export type CreateHcpFromNominationInput = z.infer<typeof createHcpFromNominationSchema>;

// Schema for nomination ID param
export const nominationIdParamSchema = z.object({
  nid: z.string().cuid(),
});

export type NominationIdParam = z.infer<typeof nominationIdParamSchema>;

// Schema for updating raw name (fixing typos)
export const updateNominationRawNameSchema = z.object({
  rawNameEntered: z.string().min(1, 'Name is required').max(255, 'Name is too long'),
});

export type UpdateNominationRawNameInput = z.infer<typeof updateNominationRawNameSchema>;

// Schema for excluding a nomination
export const excludeNominationSchema = z.object({
  reason: z.string().max(500, 'Reason is too long').optional(),
});

export type ExcludeNominationInput = z.infer<typeof excludeNominationSchema>;

// Schema for bulk-excluding nominations
export const bulkExcludeNominationsSchema = z.object({
  nominationIds: z.array(z.string().cuid()).min(1, 'At least one nomination is required').max(1000, 'Too many nominations'),
  reason: z.string().max(500, 'Reason is too long').optional(),
});

export type BulkExcludeNominationsInput = z.infer<typeof bulkExcludeNominationsSchema>;

// Schema for batch top-suggestion lookup — used by the list page to render
// inline "Accept" links without one suggestions-fetch per row.
export const nominationTopSuggestionsSchema = z.object({
  nominationIds: z
    .array(z.string().cuid())
    .min(1, 'At least one nomination is required')
    .max(200, 'Too many nominations — keep batches to ≤200 (one page)'),
});

export type NominationTopSuggestionsInput = z.infer<typeof nominationTopSuggestionsSchema>;

// Schema for bulk-accepting top suggestions. The client-side <90% confirmation
// gate is purely UX; the server applies whatever was confirmed.
export const bulkAcceptNominationsSchema = z.object({
  nominationIds: z
    .array(z.string().cuid())
    .min(1, 'At least one nomination is required')
    .max(500, 'Too many nominations — keep batches to ≤500'),
});

export type BulkAcceptNominationsInput = z.infer<typeof bulkAcceptNominationsSchema>;
