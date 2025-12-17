import { z } from 'zod';

export const assignHcpsSchema = z.object({
  hcpIds: z.array(z.string().cuid()).min(1, 'At least one HCP is required'),
});

export const importHcpsSchema = z.object({
  // Excel import will be handled by multipart form
  overwrite: z.boolean().default(false),
});

export type AssignHcpsInput = z.infer<typeof assignHcpsSchema>;
export type ImportHcpsInput = z.infer<typeof importHcpsSchema>;
