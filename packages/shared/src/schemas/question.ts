import { z } from 'zod';

// Predefined question tags for categorization
export const QUESTION_TAGS = [
  'Demographics',
  'Core',
  'Dry Eye',
  'Retina',
  'Glaucoma',
  'Cataract',
  'Cornea',
  'Pediatric',
  'Oculoplastics',
  'Neuro-Ophthalmology',
  'Uveitis',
  'Clinical Practice',
  'Research',
  'Treatment',
  'Diagnosis',
  'Patient Care',
  'Technology',
  'Outcomes',
] as const;

export type QuestionTag = (typeof QUESTION_TAGS)[number];

export const questionTypeSchema = z.enum([
  'TEXT',
  'NUMBER',
  'RATING',
  'SINGLE_CHOICE',
  'MULTI_CHOICE',
  'DROPDOWN',
  'MULTI_TEXT',
]);

// Nomination types for categorizing HCP nominations
export const nominationTypeSchema = z.enum([
  'NATIONAL_KOL',       // Nationally recognized thought leader
  'RISING_STAR',        // Emerging/up-and-coming KOL
  'REGIONAL_EXPERT',    // Regional/local expert
  'DIGITAL_INFLUENCER', // Social media/digital presence
  'CLINICAL_EXPERT',    // Clinical trial/research expert
]);

export type NominationType = z.infer<typeof nominationTypeSchema>;

// Human-readable labels for nomination types
export const NOMINATION_TYPE_LABELS: Record<NominationType, string> = {
  NATIONAL_KOL: 'National KOL',
  RISING_STAR: 'Rising Star',
  REGIONAL_EXPERT: 'Regional Expert',
  DIGITAL_INFLUENCER: 'Digital Influencer',
  CLINICAL_EXPERT: 'Clinical Expert',
};

// Option object with text and optional requiresText flag
const questionOptionSchema = z.object({
  text: z.string(),
  requiresText: z.boolean().default(false),
});

export type QuestionOption = z.infer<typeof questionOptionSchema>;

// Base schema without refinement for partial updates
const baseQuestionSchema = z.object({
  text: z.string().min(10, 'Question must be at least 10 characters').max(500),
  type: questionTypeSchema,
  category: z.string().max(50).optional().nullable(),
  isRequired: z.boolean().default(false),
  options: z.array(questionOptionSchema).optional().nullable(),
  tags: z.array(z.string()).default([]),
  // For MULTI_TEXT (nominations) questions
  minEntries: z.number().int().min(1).optional().nullable(), // Minimum required entries
  defaultEntries: z.number().int().min(1).optional().nullable(), // Initial text boxes to show (user can add more with +)
  nominationType: nominationTypeSchema.optional().nullable(), // For nomination questions: which type of KOL
});

export const createQuestionSchema = baseQuestionSchema
  .refine(
    (data) => {
      // Choice questions must have at least 2 options with non-empty text
      if (['SINGLE_CHOICE', 'MULTI_CHOICE', 'DROPDOWN'].includes(data.type)) {
        if (!data.options || data.options.length < 2) return false;
        const validOptions = data.options.filter((opt) => opt.text && opt.text.trim().length > 0);
        return validOptions.length >= 2;
      }
      return true;
    },
    { message: 'Choice questions require at least 2 options', path: ['options'] }
  )
  .refine(
    (data) => {
      // Nomination questions (MULTI_TEXT type) require a nomination type
      if (data.type === 'MULTI_TEXT') {
        return !!data.nominationType;
      }
      return true;
    },
    { message: 'Nomination questions require a nomination type', path: ['nominationType'] }
  );

export const updateQuestionSchema = baseQuestionSchema.partial();

// Note: QuestionType is already exported from types/index.ts
export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;
export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;
