import { z } from 'zod';

export const clientTypeSchema = z.enum(['FULL', 'LITE']);

// v1.17.60 — logoUrl accepts either an http(s) URL OR a data:image/*
// base64 URI (inline upload path). Cap at 32 KB string length so a
// 20 KB binary image (~27 KB base64 + prefix) fits comfortably but a
// 1 MB blob is rejected at the schema layer. The 20 KB binary cap is
// the canonical limit; the schema's character cap is the loose outer
// boundary that prevents abuse.
const LOGO_URL_MAX_CHARS = 32 * 1024;
const logoUrlSchema = z
  .string()
  .max(
    LOGO_URL_MAX_CHARS,
    `Logo data must be at most ${LOGO_URL_MAX_CHARS} characters (~20 KB binary). Compress the image (e.g. tinypng.com) or upload a smaller version.`,
  )
  .refine(
    (val) => /^(https?:\/\/|data:image\/)/i.test(val),
    'Must be an http(s) URL or an inline data:image/* URI',
  );

// Single domain like "sunpharma.com" — letters/digits/hyphens, at least one
// dot, ≥2-char TLD. Normalized to lowercase. Whole-domain match only;
// subdomains like "na.sunpharma.com" are NOT covered by "sunpharma.com"
// — list them explicitly if needed.
export const emailDomainSchema = z
  .string()
  .regex(
    /^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)+$/i,
    'Must be a valid domain like example.com (no scheme, no @)'
  )
  .transform((d) => d.toLowerCase());

export const createClientSchema = z.object({
  name: z.string().min(2).max(100),
  type: clientTypeSchema.default('FULL'),
  isLite: z.boolean().default(false).optional(),
  logoUrl: logoUrlSchema.optional().nullable(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#0066CC'),
  // 2026-06-03 (v1.17.17): now required (was optional + default([])).
  // Every new client must specify at least one domain. Existing clients
  // with empty arrays are grandfathered at the service layer (see
  // userService allowlist check) until they're next edited — at that
  // point this rule applies and forces the admin to fill it in.
  // bio-exec.com is implicitly always allowed (see userService).
  emailDomains: z
    .array(emailDomainSchema)
    .min(1, 'At least one email domain is required'),
});

export const updateClientSchema = createClientSchema.partial();

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
