import { z } from 'zod';

export const npiSchema = z.string().regex(/^\d{10}$/, 'NPI must be 10 digits');

// v1.17.68 — multi-country HCP identifier support.
// Ticket: docs/findings/canada-hcp-support-lite-plan-2026-06-25.md
//
// v1.18.4 — RELAXED FORMAT: any 10-or-12 alphanumeric chars after
// normalization. Prior strict CAMD######## rule dropped because real
// CA HCP data via the Canada HCP table import didn't fit that shape.
//
// v1.19.0 — RENAMED: `MINC` → `ONEKEY_ID` (display: "OneKey ID"),
// aligning with the IQVIA OneKey Reference vocabulary the Canada
// team uses. The underlying validation is unchanged (still 10-or-12
// alphanumeric). Historic `MINC` DB values are migrated to
// `ONEKEY_ID` in the same release; CSV imports still accept legacy
// column headers `MINC` / `minc` in addition to `OneKey`, `onekey`,
// `OneKeyID`, `onekey_id`.
//
// Country + nationalIdType fields set from import context remain the
// authoritative routing signal. Input may include hyphens or spaces
// for display; normalizer strips non-alphanumerics and uppercases.
export const COUNTRIES = ['US', 'CA'] as const;
export const NATIONAL_ID_TYPES = ['NPI', 'ONEKEY_ID'] as const;
export const countrySchema = z.enum(COUNTRIES);
export const nationalIdTypeSchema = z.enum(NATIONAL_ID_TYPES);
export type Country = z.infer<typeof countrySchema>;
export type NationalIdType = z.infer<typeof nationalIdTypeSchema>;

/**
 * Normalize a OneKey ID input string to canonical uppercase
 * alphanumeric form. Returns null when the result isn't 10 or 12
 * characters after stripping. Callers should feed the result into
 * oneKeyIdSchema for the shape check.
 *
 * v1.18.4 — accepts 10 OR 12 chars (previously 12 only).
 * v1.19.0 — renamed from `normalizeMinc`.
 */
export function normalizeOneKeyId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const stripped = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return stripped.length === 10 || stripped.length === 12 ? stripped : null;
}

/**
 * v1.18.4 — length-only OneKey ID validation. Accepts any 10-or-12
 * char alphanumeric identifier after normalization.
 * v1.19.0 — renamed from `mincSchema`.
 */
export const oneKeyIdSchema = z
  .string()
  .regex(
    /^([A-Z0-9]{10}|[A-Z0-9]{12})$/,
    'OneKey ID must be 10 or 12 alphanumeric characters (input may be hyphenated; will be normalized)',
  );

/**
 * Cross-check that the value stored in the `npi` column actually
 * matches its declared type. NPI values must be 10 digits; OneKey ID
 * values must be 10 or 12 alphanumeric chars after normalization.
 * Callers should already have normalized OneKey ID input via
 * `normalizeOneKeyId()` before passing here.
 */
export function validateNationalIdValue(
  value: string,
  type: NationalIdType,
): { ok: true } | { ok: false; message: string } {
  const schema = type === 'NPI' ? npiSchema : oneKeyIdSchema;
  const result = schema.safeParse(value);
  if (result.success) return { ok: true };
  return { ok: false, message: result.error.errors[0]?.message ?? 'Invalid identifier' };
}

// Specialty is binary: a practitioner is one of these two. Sub-specialty
// (focus area) is multi-select and unified with DiseaseArea (see
// `diseaseAreaIds` below) — sourced live from the DiseaseArea table.
//
// Canonical form is FIELD-form (Optometry / Ophthalmology), matching the
// DiseaseArea naming convention (Dry Eye, Glaucoma, Cornea, Retina, Medical
// Oncology — all field-form, not -ist forms) and the data-team's source-of-
// truth notation. v1.15.30 had this as role-form; v1.15.31 flipped it back
// per data-team alignment. See 20260520_canonicalize_specialty_to_field_form.
export const HCP_SPECIALTIES = ['Optometry', 'Ophthalmology'] as const;
export const hcpSpecialtySchema = z.enum(HCP_SPECIALTIES);
export type HcpSpecialty = z.infer<typeof hcpSpecialtySchema>;

/**
 * Map a freeform specialty string (CSV import, legacy data, NPI credentials)
 * to the canonical 2-value enum. Returns null if the value doesn't map
 * (out-of-domain HCPs like Oncology are left for legacy/review rather than
 * force-cast).
 *
 * Accepts BOTH the new field-form and the old role-form so legacy CSVs from
 * before the v1.15.31 flip keep importing cleanly — output is always
 * canonical field-form.
 */
export function normalizeHcpSpecialty(raw: string | null | undefined): HcpSpecialty | null {
  if (!raw) return null;
  const k = raw.trim().toLowerCase();
  if (['optometry', 'optometrist', 'od', 'o.d.'].includes(k)) return 'Optometry';
  if (['ophthalmology', 'ophthalmologist', 'md', 'do', 'm.d.', 'd.o.'].includes(k)) return 'Ophthalmology';
  return null;
}

// v1.17.68 — `npi` field now holds either an NPI (US) or a OneKey ID
// (CA) depending on the row's nationalIdType. Column name unchanged
// for backward compat across the ~100 references in api + web code.
// `country` + `nationalIdType` default to US/NPI when the caller
// doesn't set them, keeping every existing writer working without
// change.
//
// Base object separated from the refined variants so
// `updateHcpSchema` can still call `.partial()` on the base (partial
// then re-attach the same refinement for the fields that are present).
const hcpBaseSchema = z.object({
  npi: z.string(),
  firstName: z.string().min(1).max(50),
  lastName: z.string().min(1).max(50),
  email: z.string().email(),
  specialty: hcpSpecialtySchema.optional().nullable(),
  // Multi-select sub-specialty as a list of DiseaseArea IDs.
  diseaseAreaIds: z.array(z.string().cuid()).optional(),
  // Legacy freeform sub-specialty — retained for one release to support
  // import flows that haven't moved to diseaseAreaIds yet.
  subSpecialty: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().length(2).optional().nullable(),
  country: countrySchema.default('US'),
  nationalIdType: nationalIdTypeSchema.default('NPI'),
  // Informational only — cross-licensed HCPs' secondary IDs.
  // Not indexed, not used for nomination matching.
  alternateIds: z
    .array(
      z.object({
        type: nationalIdTypeSchema,
        country: countrySchema,
        value: z.string().min(1),
      }),
    )
    .optional()
    .nullable(),
});

// Cross-validate that the supplied identifier matches the declared
// type (used by both create + update variants when both fields are
// present in the payload).
function refineNpiType(
  data: { npi?: string; nationalIdType?: NationalIdType },
  ctx: z.RefinementCtx,
): void {
  if (!data.npi) return; // Absence is fine — update semantics.
  const type = data.nationalIdType ?? 'NPI';
  const check = validateNationalIdValue(data.npi, type);
  if (!check.ok) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['npi'],
      message: check.message,
    });
  }
}

export const createHcpSchema = hcpBaseSchema.superRefine(refineNpiType);

export const createNominatedHcpSchema = z.object({
  npi: npiSchema.optional().nullable(),
  firstName: z.string().min(1).max(50),
  lastName: z.string().min(1).max(50),
  // v1.17.20: email required at the DB layer; preprocess null/undefined/
  // empty-string → nomail@kol360research.com so nomination flows that
  // don't capture an email still produce a valid row.
  email: z
    .preprocess(
      (v) => (v == null || v === '' ? 'nomail@kol360research.com' : v),
      z.string().email()
    ),
  specialty: hcpSpecialtySchema.optional().nullable(),
  diseaseAreaIds: z.array(z.string().cuid()).optional(),
  subSpecialty: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().length(2).optional().nullable(),
});

// v1.17.34: npi is now editable (was: omitted from updates entirely).
// Frontend gates the input behind PLATFORM_ADMIN role; the API route
// will reject a non-PLATFORM_ADMIN that tries to set it via the
// gateWritesToAdmins preHandler (already covers all writes since
// v1.17.20). Backend route surfaces a clean 409 when the new value
// collides with the Hcp.npi @unique constraint.
export const updateHcpSchema = hcpBaseSchema
  .partial()
  .extend({
    isSurveyTaker: z.boolean().optional(),
    isNominated: z.boolean().optional(),
  })
  .superRefine(refineNpiType);

export type CreateHcpInput = z.infer<typeof createHcpSchema>;
export type CreateNominatedHcpInput = z.infer<typeof createNominatedHcpSchema>;
export type UpdateHcpInput = z.infer<typeof updateHcpSchema>;
