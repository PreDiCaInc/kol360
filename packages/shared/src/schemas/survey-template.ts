import { z } from 'zod';

export const createSurveyTemplateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional().nullable(),
});

export const updateSurveyTemplateSchema = createSurveyTemplateSchema.partial();

export const addSectionToTemplateSchema = z.object({
  sectionId: z.string().min(1),
  isLocked: z.boolean().default(false),
});

export const reorderSectionsSchema = z.object({
  sectionIds: z.array(z.string().min(1)),
});

export const cloneTemplateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
});

export type CreateSurveyTemplateInput = z.infer<typeof createSurveyTemplateSchema>;
export type UpdateSurveyTemplateInput = z.infer<typeof updateSurveyTemplateSchema>;
export type AddSectionToTemplateInput = z.infer<typeof addSectionToTemplateSchema>;
export type ReorderSectionsInput = z.infer<typeof reorderSectionsSchema>;
export type CloneTemplateInput = z.infer<typeof cloneTemplateSchema>;
