import { z } from 'zod';

/**
 * Brand-Affinity Grid Nomination — shared Zod schemas.
 *
 * Consumed by:
 *   - apps/api routes for CampaignBrandOption CRUD + survey-response submit
 *   - apps/web admin UI + respondent survey UI
 *   - e2e tests
 *
 * See docs/findings/brand-affinity-grid-nomination-plan-2026-07-08.md
 * for the locked spec. Item S is enforced entirely here (Zod refines).
 */

// Sub-decision #4 in the plan doc: allow display-friendly brand names
// (Xiidra®, lifitegrast) up to 40 chars. Enum values stay stable in the
// DB — see BrandFlagType in the Prisma schema.
export const BRAND_NAME_MAX_LENGTH = 40;

// Practical ceiling; customers today ask for 3-10 brands per campaign.
// If someone hits this, the answer is almost certainly "collapse brands"
// not "raise the cap".
export const CAMPAIGN_MAX_BRANDS = 20;

// Per-nomination cap. Even in a 20-brand campaign, no realistic
// respondent will flag all 20 brands + NEUTRAL/DK. This caps at a
// generous 50 so a rogue payload can't blow past reasonable size.
export const NOMINATION_MAX_BRAND_FLAGS = 50;

export const brandFlagTypeSchema = z.enum(['BRAND', 'NEUTRAL', 'DONT_KNOW']);
export type BrandFlagType = z.infer<typeof brandFlagTypeSchema>;

// One row in a CampaignBrandOption list. `id` is optional so the same
// schema serves both create (no id) and update (existing id). Display
// order is normalized on the server side — the client can send any
// non-negative integers and the server re-writes them as 0..N-1 in the
// order presented.
export const brandOptionInputSchema = z.object({
  id: z.string().cuid().optional(),
  brandName: z
    .string()
    .trim()
    .min(1, 'Brand name is required')
    .max(BRAND_NAME_MAX_LENGTH, `Brand name must be ${BRAND_NAME_MAX_LENGTH} characters or fewer`),
  displayOrder: z.number().int().min(0),
});
export type BrandOptionInput = z.infer<typeof brandOptionInputSchema>;

// Full-replacement PUT payload for a campaign's brand list. Semantics
// on the server: any option not present in this list gets deleted (via
// cascade to NominationBrandFlag on prod data — safe pre-freeze only).
// Refinement catches dup brand names (case-insensitive) and dup display
// orders before we hit the DB unique constraint.
export const upsertBrandOptionsSchema = z
  .object({
    brands: z
      .array(brandOptionInputSchema)
      .min(1, 'At least one brand is required')
      .max(CAMPAIGN_MAX_BRANDS, `Cannot exceed ${CAMPAIGN_MAX_BRANDS} brands per campaign`),
  })
  .superRefine((val, ctx) => {
    const names = val.brands.map((b) => b.brandName.toLowerCase());
    const orders = val.brands.map((b) => b.displayOrder);
    if (new Set(names).size !== names.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['brands'],
        message: 'Duplicate brand names (case-insensitive)',
      });
    }
    if (new Set(orders).size !== orders.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['brands'],
        message: 'Duplicate display orders',
      });
    }
  });
export type UpsertBrandOptionsInput = z.infer<typeof upsertBrandOptionsSchema>;

// One brand-flag row on a nomination-submit payload. The refine below
// enforces the field-level shape (BRAND ⇔ brandOptionId present).
export const brandFlagSchema = z
  .object({
    flagType: brandFlagTypeSchema,
    // For BRAND rows this points at a CampaignBrandOption.id. For
    // NEUTRAL / DONT_KNOW rows it MUST be omitted. Server also verifies
    // the id belongs to the correct campaign (not enforceable here).
    brandOptionId: z.string().cuid().optional(),
  })
  .refine(
    (v) => (v.flagType === 'BRAND' ? !!v.brandOptionId : !v.brandOptionId),
    {
      message:
        'brandOptionId is required for BRAND flags and must be omitted for NEUTRAL / DONT_KNOW',
    }
  );
export type BrandFlagInput = z.infer<typeof brandFlagSchema>;

// Array-level invariant (item S in the plan doc):
//   A nomination MUST have EITHER 1+ BRAND rows OR exactly 1 NEUTRAL
//   OR exactly 1 DONT_KNOW. Empty array is INVALID — respondents must
//   answer the grid for every nomination on a useBrandGrid question.
//
// Applied at the survey-taking layer inside the nomination row schema.
// Kept as an exported schema so the admin/read layer can reuse.
export const nominationBrandFlagsSchema = z
  .array(brandFlagSchema)
  .min(1, 'Brand grid response is required (pick at least one brand, Neutral, or Unknown)')
  .max(NOMINATION_MAX_BRAND_FLAGS, 'Too many brand flags for a single nomination')
  .superRefine((flags, ctx) => {
    const brand = flags.filter((f) => f.flagType === 'BRAND');
    const neutral = flags.filter((f) => f.flagType === 'NEUTRAL');
    const dontKnow = flags.filter((f) => f.flagType === 'DONT_KNOW');

    // Rule 1: BRAND and NEUTRAL / DONT_KNOW cannot coexist.
    if (brand.length > 0 && (neutral.length > 0 || dontKnow.length > 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'BRAND flags cannot coexist with NEUTRAL or DONT_KNOW on the same nomination',
      });
    }
    // Rule 2: NEUTRAL and DONT_KNOW cannot coexist.
    if (neutral.length > 0 && dontKnow.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'NEUTRAL and DONT_KNOW cannot coexist on the same nomination',
      });
    }
    // Rule 3: at most one NEUTRAL, at most one DONT_KNOW row.
    if (neutral.length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Only one NEUTRAL row allowed per nomination',
      });
    }
    if (dontKnow.length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Only one DONT_KNOW row allowed per nomination',
      });
    }
    // Rule 4: no duplicate brand-option ids among BRAND rows.
    const brandIds = brand.map((f) => f.brandOptionId!);
    if (new Set(brandIds).size !== brandIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Duplicate brand selections on the same nomination',
      });
    }
  });
export type NominationBrandFlagsInput = z.infer<typeof nominationBrandFlagsSchema>;

// Read-side shape returned by GET endpoints. Distinct from
// brandOptionInputSchema in that id + createdAt are guaranteed present.
export const brandOptionOutputSchema = z.object({
  id: z.string().cuid(),
  campaignId: z.string().cuid(),
  brandName: z.string(),
  displayOrder: z.number().int(),
  createdAt: z.string().datetime(),
});
export type BrandOptionOutput = z.infer<typeof brandOptionOutputSchema>;

// PATCH payload for a single SurveyQuestion's grid toggle. Small, single
// field for now — if additional per-question grid settings emerge later
// (e.g. a per-question brand-list override) they'd extend this schema.
export const updateSurveyQuestionBrandGridSchema = z.object({
  useBrandGrid: z.boolean(),
});
export type UpdateSurveyQuestionBrandGridInput = z.infer<
  typeof updateSurveyQuestionBrandGridSchema
>;
