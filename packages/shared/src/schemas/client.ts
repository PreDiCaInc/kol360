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
  // Empty array = no restriction (opt-in mode for backwards compat).
  // bio-exec.com is implicitly always allowed (see userService).
  emailDomains: z.array(emailDomainSchema).default([]),
});

export const updateClientSchema = createClientSchema.partial();

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
