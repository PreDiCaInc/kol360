import { z } from 'zod';

export const campaignStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'CLOSED', 'PUBLISHED']);

export const createCampaignSchema = z.object({
  clientId: z.string().cuid(),
  diseaseAreaId: z.string().cuid(),
  name: z.string().min(1, 'Name is required').max(200),
  description: z.string().max(1000).optional().nullable(),
  surveyTemplateId: z.string().cuid().optional().nullable(),
  honorariumAmount: z.number().min(0).optional().nullable(),
  surveyOpenDate: z.string().datetime().optional().nullable(),
  surveyCloseDate: z.string().datetime().optional().nullable(),
});

export const updateCampaignSchema = createCampaignSchema.partial().omit({
  clientId: true,
});

export const campaignListQuerySchema = z.object({
  clientId: z.string().cuid().optional(),
  status: campaignStatusSchema.optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

// CampaignStatus type is exported from types/index.ts
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;
export type CampaignListQuery = z.infer<typeof campaignListQuerySchema>;
