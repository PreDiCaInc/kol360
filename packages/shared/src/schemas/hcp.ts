import { z } from 'zod';

export const npiSchema = z.string().regex(/^\d{10}$/, 'NPI must be 10 digits');

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

export const createHcpSchema = z.object({
  npi: npiSchema,
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
});

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

export const updateHcpSchema = createHcpSchema.partial().omit({ npi: true }).extend({
  isSurveyTaker: z.boolean().optional(),
  isNominated: z.boolean().optional(),
});

export type CreateHcpInput = z.infer<typeof createHcpSchema>;
export type CreateNominatedHcpInput = z.infer<typeof createNominatedHcpSchema>;
export type UpdateHcpInput = z.infer<typeof updateHcpSchema>;
