import { z } from 'zod';

export const questionTypeSchema = z.enum([
  'TEXT',
  'NUMBER',
  'RATING',
  'SINGLE_CHOICE',
  'MULTI_CHOICE',
  'DROPDOWN',
  'MULTI_TEXT',
]);

// Base schema without refinement for partial updates
const baseQuestionSchema = z.object({
  text: z.string().min(10, 'Question must be at least 10 characters').max(500),
  type: questionTypeSchema,
  category: z.string().max(50).optional().nullable(),
  isRequired: z.boolean().default(false),
  options: z.array(z.string()).optional().nullable(),
  tags: z.array(z.string()).default([]),
});

export const createQuestionSchema = baseQuestionSchema.refine(
  (data) => {
    // Choice questions must have at least 2 options
    if (['SINGLE_CHOICE', 'MULTI_CHOICE', 'DROPDOWN'].includes(data.type)) {
      return data.options && data.options.length >= 2;
    }
    return true;
  },
  { message: 'Choice questions require at least 2 options', path: ['options'] }
);

export const updateQuestionSchema = baseQuestionSchema.partial();

// Note: QuestionType is already exported from types/index.ts
export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;
export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;
