import { z } from 'zod';

export const clientTypeSchema = z.enum(['FULL', 'LITE']);

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
  logoUrl: z.string().url().optional().nullable(),
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
