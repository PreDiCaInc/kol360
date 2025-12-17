import { z } from 'zod';

// Schema for saving survey progress
export const saveProgressSchema = z.object({
  answers: z.record(z.string(), z.union([
    z.string(),
    z.number(),
    z.array(z.string()),
    z.null(),
  ])),
});

export type SaveProgressInput = z.infer<typeof saveProgressSchema>;

// Schema for submitting survey
export const submitSurveySchema = z.object({
  answers: z.record(z.string(), z.union([
    z.string(),
    z.number(),
    z.array(z.string()),
    z.null(),
  ])),
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
