import { z } from 'zod';

export const assignHcpsSchema = z.object({
  hcpIds: z.array(z.string().cuid()).min(1, 'At least one HCP is required'),
});

export const importHcpsSchema = z.object({
  // Excel import will be handled by multipart form
  overwrite: z.boolean().default(false),
});

// Campaign-level HCP segmentation fields (all optional)
export const campaignHcpSegmentationSchema = z.object({
  marketDecile: z.number().int().min(1).max(10).optional().nullable(),
  product1Decile: z.number().int().min(1).max(10).optional().nullable(),
  product2Decile: z.number().int().min(1).max(10).optional().nullable(),
  practiceSetting: z.string().optional().nullable(), // Surgical, Community, Academic, Retail
  practiceSentiment: z.string().optional().nullable(),
  prescribingBehavior: z.string().optional().nullable(), // Champions/Loyalist, Splitter, Dabblers, Unaware/Disengaged
  segmentation1: z.string().optional().nullable(),
  segmentation2: z.string().optional().nullable(),
  segmentation3: z.string().optional().nullable(),
});

export type AssignHcpsInput = z.infer<typeof assignHcpsSchema>;
export type ImportHcpsInput = z.infer<typeof importHcpsSchema>;
export type CampaignHcpSegmentation = z.infer<typeof campaignHcpSegmentationSchema>;
