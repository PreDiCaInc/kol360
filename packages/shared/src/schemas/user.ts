import { z } from 'zod';

export const userRoleSchema = z.enum(['PLATFORM_ADMIN', 'CLIENT_ADMIN', 'TEAM_MEMBER']);
export const userStatusSchema = z.enum(['PENDING_VERIFICATION', 'PENDING_APPROVAL', 'ACTIVE', 'DISABLED']);

export const createUserSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1).max(50),
  lastName: z.string().min(1).max(50),
  role: userRoleSchema,
  clientId: z.string().cuid().optional().nullable(),
});

export const updateUserSchema = createUserSchema.partial();

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
