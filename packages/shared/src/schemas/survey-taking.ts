import { z } from 'zod';
import { brandFlagSchema } from './brand-affinity';

// v1.17.81 — MULTI_TEXT extended shape for Brand-Affinity Grid campaigns.
// Legacy shape (string[]) still accepted; grid campaigns send the object
// form. `brandFlags[i]` corresponds to `names[i]`. Per-nomination invariant
// (mutual exclusion + at-most-one sentinel) is applied in the service
// layer at submit-time because Zod here can't see whether a specific
// question has useBrandGrid on.
export const multiTextWithGridSchema = z.object({
  names: z.array(z.string()),
  brandFlags: z.array(z.array(brandFlagSchema)),
});
export type MultiTextWithGridValue = z.infer<typeof multiTextWithGridSchema>;

// Answer value can be:
// - string (TEXT, DROPDOWN, QUALIFYING)
// - number (NUMBER, RATING)
// - string[] (MULTI_TEXT legacy, RANK_ORDER without requiresText)
// - object with selected/text for SINGLE_CHOICE: { selected: string, text?: string }
// - object with selected/texts for MULTI_CHOICE: { selected: string[], texts?: Record<string, string> }
// - object with ranked/texts for RANK_ORDER: { ranked: string[], texts?: Record<string, string> }
// - object with names/brandFlags for MULTI_TEXT+grid (v1.17.81)
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
  z.object({
    ranked: z.array(z.string()),
    texts: z.record(z.string(), z.string()).optional(),
  }),
  multiTextWithGridSchema,
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
  'RANK_ORDER',
  'QUALIFYING',
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
