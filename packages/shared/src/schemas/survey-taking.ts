import { z } from 'zod';

// Answer value can be:
// - string (TEXT, DROPDOWN)
// - number (NUMBER, RATING)
// - string[] (MULTI_TEXT)
// - object with selected/text for SINGLE_CHOICE: { selected: string, text?: string }
// - object with selected/texts for MULTI_CHOICE: { selected: string[], texts?: Record<string, string> }
// - null (unanswered)
const answerValueSchema = z.union([
  z.string(),
  z.number(),
  z.array(z.string()),
  z.object({
    selected: z.union([z.string(), z.array(z.string())]),
    text: z.string().optional(),
    texts: z.record(z.string(), z.string()).optional(),
  }),
  z.null(),
]);

// Schema for saving survey progress
export const saveProgressSchema = z.object({
  answers: z.record(z.string(), answerValueSchema),
});

export type SaveProgressInput = z.infer<typeof saveProgressSchema>;

// Schema for submitting survey
export const submitSurveySchema = z.object({
  answers: z.record(z.string(), answerValueSchema),
});

export type SubmitSurveyInput = z.infer<typeof submitSurveySchema>;

// Schema for unsubscribe request
export const unsubscribeSchema = z.object({
  scope: z.enum(['CAMPAIGN', 'GLOBAL']).default('CAMPAIGN'),
  reason: z.string().max(500).optional(),
});

export type UnsubscribeInput = z.infer<typeof unsubscribeSchema>;

// Response types for survey data
export const surveyQuestionTypeSchema = z.enum([
  'SINGLE_CHOICE',
  'MULTI_CHOICE',
  'RATING',
  'TEXT',
  'MULTI_TEXT',
]);

export type SurveyQuestionType = z.infer<typeof surveyQuestionTypeSchema>;

export const surveyResponseStatusSchema = z.enum([
  'PENDING',
  'OPENED',
  'IN_PROGRESS',
  'COMPLETED',
  'EXCLUDED',
]);

// Note: SurveyResponseStatus type is exported from types/index.ts
