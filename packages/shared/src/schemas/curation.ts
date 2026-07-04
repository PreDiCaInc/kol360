import { z } from 'zod';
import { countrySchema, nationalIdTypeSchema, mincSchema, npiSchema } from './hcp';

// v1.17.29 — request/response contract for the curation integration.
// Wire spec: kolcuration/spec/curation-kol360-sync-spec-v0.3.md §6.2
// + kolcuration/spec/dba-ticket-kol360-deploy-sync-endpoints-koltest.md
//
// The curation-svc M2M client calls POST /api/v1/hcps/get-beid every
// time a reviewer Approves a NEW_HCP review item. We return either:
//   - an existing Hcp's beId (dedup by NPI)
//   - a freshly minted beId for a new Hcp
//
// Auth: Cognito client_credentials grant, scope `kol360-api/hcps:write-stub`,
// minted by the `curation-svc-to-kol360` client (id 5ml2abmii9ot8eesu6birg5dmq).

const discoveredFromSchema = z.object({
  source_url: z.string().url(),
  scraper_run_id: z.string().min(1),
  ai_verification_snapshot_url: z.string().min(1),
  captured_at: z.string().datetime(),
  // Reviewer-supplied reason for a no-NPI mint (curation's UI forces
  // this on the no-NPI path). Optional so the with-NPI path doesn't
  // require it.
  notes: z.string().optional(),
});

export const getBeIdRequestSchema = z
  .object({
    firstName: z.string().min(1).max(50),
    lastName: z.string().min(1).max(50),
    // hcpSpecialtySchema enum — kept loose here to avoid the shared package
    // pulling in the heavyweight constraint. The route layer re-validates
    // against the canonical specialty enum via Hcp_specialty_check at
    // insert time, so a bad value still 400s.
    specialty: z.string().optional(),
    city: z.string().optional(),
    state: z.string().length(2).optional(),
    // Optional identifier. When present, kol360 dedupes on Hcp.npi
    // (which stores either NPI or MINC per nationalIdType) and returns
    // the existing beId. When absent, mints a new beId with npi=NULL
    // and stashes discoveredFrom.notes (the reviewer's reason).
    npi: z.string().optional(),
    // v1.17.69 — multi-country identifier support. Callers may specify
    // country + nationalIdType; both default to US/NPI so existing
    // curation clients keep working. When nationalIdType='MINC',
    // `npi` is validated as a MINC (12-char CAMD########).
    country: countrySchema.default('US'),
    nationalIdType: nationalIdTypeSchema.default('NPI'),
    discoveredFrom: discoveredFromSchema,
  })
  .superRefine((data, ctx) => {
    // v1.17.71 — enforce country/nationalIdType pairing at the schema
    // level. Requested by the curation-svc team review of
    // curation-svc-canada-integration-spec-v1.md §2.1: unpaired combos
    // ('US' + 'MINC', 'CA' + 'NPI') are semantically wrong and were
    // previously accepted with defaults applied per-field independently.
    // Server-side is the right home for the invariant; belt-and-braces
    // with curation-svc's client-side check.
    const isMincCountry = data.country === 'CA';
    const isMincType = data.nationalIdType === 'MINC';
    if (isMincCountry !== isMincType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['nationalIdType'],
        message:
          "country and nationalIdType must be paired: 'CA' → 'MINC', 'US' → 'NPI'",
      });
      return; // don't spam a second error about identifier shape
    }
    if (!data.npi) return;
    const schema = data.nationalIdType === 'MINC' ? mincSchema : npiSchema;
    const check = schema.safeParse(data.npi);
    if (!check.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['npi'],
        message: check.error.errors[0]?.message ?? 'Invalid identifier',
      });
    }
  });

export const getBeIdResponseSchema = z.object({
  beId: z.string(),
  id: z.string(),
  createdAt: z.string().datetime(),
  // Always present (per dba-reply).
  //   true  → NPI matched an existing Hcp; we returned that row's beId.
  //   false → fresh mint (either with NPI provided + new, or no NPI at all).
  wasExisting: z.boolean(),
  // v1.17.71 — echo persisted country + nationalIdType so the client can
  // confirm what actually got stored without a follow-up GET. Requested
  // in curation-svc review §3.2. Additive fields — existing curation
  // clients that ignore them keep working.
  country: countrySchema,
  nationalIdType: nationalIdTypeSchema,
});

export type GetBeIdRequest = z.infer<typeof getBeIdRequestSchema>;
export type GetBeIdResponse = z.infer<typeof getBeIdResponseSchema>;
