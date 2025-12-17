import { z } from 'zod';

// Schema for listing responses
export const responseListQuerySchema = z.object({
  status: z.enum(['PENDING', 'OPENED', 'IN_PROGRESS', 'COMPLETED', 'EXCLUDED']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

export type ResponseListQuery = z.infer<typeof responseListQuerySchema>;

// Schema for updating a response answer
export const updateAnswerSchema = z.object({
  questionId: z.string().cuid(),
  value: z.union([
    z.string(),
    z.number(),
    z.array(z.string()),
    z.null(),
  ]),
});

export type UpdateAnswerInput = z.infer<typeof updateAnswerSchema>;

// Schema for excluding a response
export const excludeResponseSchema = z.object({
  reason: z.string().min(1, 'Reason is required').max(500),
});

export type ExcludeResponseInput = z.infer<typeof excludeResponseSchema>;

// Schema for response ID param
export const responseIdParamSchema = z.object({
  id: z.string().cuid(),
  rid: z.string().cuid(),
});

export type ResponseIdParam = z.infer<typeof responseIdParamSchema>;
