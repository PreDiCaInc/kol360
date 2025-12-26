import { z } from 'zod';

export const clientTypeSchema = z.enum(['FULL', 'LITE']);

export const createClientSchema = z.object({
  name: z.string().min(2).max(100),
  type: clientTypeSchema.default('FULL'),
  isLite: z.boolean().default(false).optional(),
  logoUrl: z.string().url().optional().nullable(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#0066CC'),
});

export const updateClientSchema = createClientSchema.partial();

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
