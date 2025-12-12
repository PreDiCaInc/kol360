import { z } from 'zod';

export const npiSchema = z.string().regex(/^\d{10}$/, 'NPI must be 10 digits');

export const createHcpSchema = z.object({
  npi: npiSchema,
  firstName: z.string().min(1).max(50),
  lastName: z.string().min(1).max(50),
  email: z.string().email().optional().nullable(),
  specialty: z.string().optional().nullable(),
  subSpecialty: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().length(2).optional().nullable(),
  yearsInPractice: z.number().int().positive().optional().nullable(),
});

export const updateHcpSchema = createHcpSchema.partial().omit({ npi: true });

export type CreateHcpInput = z.infer<typeof createHcpSchema>;
export type UpdateHcpInput = z.infer<typeof updateHcpSchema>;
