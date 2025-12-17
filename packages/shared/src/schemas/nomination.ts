import { z } from 'zod';

// Schema for listing nominations
export const nominationListQuerySchema = z.object({
  status: z.enum(['UNMATCHED', 'MATCHED', 'NEW_HCP', 'EXCLUDED']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

export type NominationListQuery = z.infer<typeof nominationListQuerySchema>;

// Schema for matching nomination to existing HCP
export const matchNominationSchema = z.object({
  hcpId: z.string().cuid(),
  addAlias: z.boolean().default(true),
});

export type MatchNominationInput = z.infer<typeof matchNominationSchema>;

// Schema for creating new HCP from nomination
export const createHcpFromNominationSchema = z.object({
  npi: z.string().length(10, 'NPI must be 10 digits'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email().optional().nullable(),
  specialty: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
});

export type CreateHcpFromNominationInput = z.infer<typeof createHcpFromNominationSchema>;

// Schema for nomination ID param
export const nominationIdParamSchema = z.object({
  nid: z.string().cuid(),
});

export type NominationIdParam = z.infer<typeof nominationIdParamSchema>;
