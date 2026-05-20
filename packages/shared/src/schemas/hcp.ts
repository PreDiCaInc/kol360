import { z } from 'zod';

export const npiSchema = z.string().regex(/^\d{10}$/, 'NPI must be 10 digits');

// Specialty is binary: a practitioner is one of these two. Sub-specialty
// (focus area) is multi-select and unified with DiseaseArea (see
// `diseaseAreaIds` below) — sourced live from the DiseaseArea table.
export const HCP_SPECIALTIES = ['Optometrist', 'Ophthalmologist'] as const;
export const hcpSpecialtySchema = z.enum(HCP_SPECIALTIES);
export type HcpSpecialty = z.infer<typeof hcpSpecialtySchema>;

/**
 * Map a freeform specialty string (CSV import, legacy data) to the canonical
 * 2-value enum. Returns null if the value doesn't map (out-of-domain HCPs
 * like Oncology are left for legacy/review rather than force-cast). Matches
 * the same rules used by the 20260519 normalization migration.
 */
export function normalizeHcpSpecialty(raw: string | null | undefined): HcpSpecialty | null {
  if (!raw) return null;
  const k = raw.trim().toLowerCase();
  if (['optometrist', 'optometry', 'od', 'o.d.'].includes(k)) return 'Optometrist';
  if (['ophthalmologist', 'ophthalmology', 'md', 'do', 'm.d.', 'd.o.'].includes(k)) return 'Ophthalmologist';
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
  email: z.string().email().optional().nullable(),
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
