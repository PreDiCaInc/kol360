import { describe, it, expect } from 'vitest';
import {
  createQuestionSchema,
  updateQuestionSchema,
  questionTypeSchema,
  QUESTION_TAGS,
} from '../question';

describe('Question Schema', () => {
  describe('questionTypeSchema', () => {
    it('should accept valid question types', () => {
      const validTypes = [
        'TEXT',
        'NUMBER',
        'RATING',
        'SINGLE_CHOICE',
        'MULTI_CHOICE',
        'DROPDOWN',
        'MULTI_TEXT',
      ];

      validTypes.forEach((type) => {
        expect(questionTypeSchema.parse(type)).toBe(type);
      });
    });

    it('should reject invalid question types', () => {
      expect(() => questionTypeSchema.parse('INVALID')).toThrow();
      expect(() => questionTypeSchema.parse('checkbox')).toThrow();
      expect(() => questionTypeSchema.parse('')).toThrow();
    });
  });

  describe('QUESTION_TAGS', () => {
    it('should contain expected tags', () => {
      expect(QUESTION_TAGS).toContain('Demographics');
      expect(QUESTION_TAGS).toContain('Core');
      expect(QUESTION_TAGS).toContain('Clinical Practice');
      expect(QUESTION_TAGS).toContain('Research');
    });

    it('should have at least 10 predefined tags', () => {
      expect(QUESTION_TAGS.length).toBeGreaterThanOrEqual(10);
    });
  });

  describe('createQuestionSchema', () => {
    describe('text validation', () => {
      it('should accept valid question text', () => {
        const result = createQuestionSchema.parse({
          text: 'What is your experience with this treatment?',
          type: 'TEXT',
        });
        expect(result.text).toBe('What is your experience with this treatment?');
      });

      it('should reject text shorter than 10 characters', () => {
        expect(() =>
          createQuestionSchema.parse({
            text: 'Short?',
            type: 'TEXT',
          })
        ).toThrow('Question must be at least 10 characters');
      });

      it('should reject text longer than 500 characters', () => {
        const longText = 'A'.repeat(501);
        expect(() =>
          createQuestionSchema.parse({
            text: longText,
            type: 'TEXT',
          })
        ).toThrow();
      });
    });

    describe('type validation', () => {
      it('should accept TEXT type without options', () => {
        const result = createQuestionSchema.parse({
          text: 'Please describe your experience',
          type: 'TEXT',
        });
        expect(result.type).toBe('TEXT');
      });

      it('should accept NUMBER type', () => {
        const result = createQuestionSchema.parse({
          text: 'How many years of experience do you have?',
          type: 'NUMBER',
        });
        expect(result.type).toBe('NUMBER');
      });

      it('should accept RATING type', () => {
        const result = createQuestionSchema.parse({
          text: 'Rate your satisfaction on a scale of 1-10',
          type: 'RATING',
        });
        expect(result.type).toBe('RATING');
      });

      it('should accept MULTI_TEXT type for nominations', () => {
        const result = createQuestionSchema.parse({
          text: 'Please nominate up to 5 key opinion leaders',
          type: 'MULTI_TEXT',
          minEntries: 1,
          defaultEntries: 3,
        });
        expect(result.type).toBe('MULTI_TEXT');
        expect(result.minEntries).toBe(1);
        expect(result.defaultEntries).toBe(3);
      });
    });

    describe('choice questions with options', () => {
      it('should accept SINGLE_CHOICE with valid options', () => {
        const result = createQuestionSchema.parse({
          text: 'Which treatment do you prefer?',
          type: 'SINGLE_CHOICE',
          options: [
            { text: 'Option A', requiresText: false },
            { text: 'Option B', requiresText: false },
          ],
        });
        expect(result.options).toHaveLength(2);
      });

      it('should accept MULTI_CHOICE with valid options', () => {
        const result = createQuestionSchema.parse({
          text: 'Select all that apply to your practice',
          type: 'MULTI_CHOICE',
          options: [
            { text: 'Clinical trials' },
            { text: 'Research papers' },
            { text: 'Patient consultations' },
          ],
        });
        expect(result.options).toHaveLength(3);
      });

      it('should accept DROPDOWN with valid options', () => {
        const result = createQuestionSchema.parse({
          text: 'Select your primary specialty area',
          type: 'DROPDOWN',
          options: [
            { text: 'Cardiology' },
            { text: 'Oncology' },
            { text: 'Neurology' },
          ],
        });
        expect(result.options).toHaveLength(3);
      });

      it('should reject choice questions with less than 2 options', () => {
        expect(() =>
          createQuestionSchema.parse({
            text: 'Which option do you prefer?',
            type: 'SINGLE_CHOICE',
            options: [{ text: 'Only one option' }],
          })
        ).toThrow('Choice questions require at least 2 options');
      });

      it('should reject choice questions without options', () => {
        expect(() =>
          createQuestionSchema.parse({
            text: 'Which option do you prefer?',
            type: 'SINGLE_CHOICE',
          })
        ).toThrow('Choice questions require at least 2 options');
      });

      it('should reject choice questions with empty option text', () => {
        expect(() =>
          createQuestionSchema.parse({
            text: 'Which option do you prefer?',
            type: 'SINGLE_CHOICE',
            options: [{ text: '' }, { text: '   ' }],
          })
        ).toThrow('Choice questions require at least 2 options');
      });
    });

    describe('option requiresText flag', () => {
      it('should accept options with requiresText true', () => {
        const result = createQuestionSchema.parse({
          text: 'Which treatment approach do you use?',
          type: 'SINGLE_CHOICE',
          options: [
            { text: 'Standard protocol', requiresText: false },
            { text: 'Other (please specify)', requiresText: true },
          ],
        });
        expect(result.options?.[1].requiresText).toBe(true);
      });

      it('should default requiresText to false', () => {
        const result = createQuestionSchema.parse({
          text: 'Which treatment approach do you use?',
          type: 'SINGLE_CHOICE',
          options: [{ text: 'Option A' }, { text: 'Option B' }],
        });
        expect(result.options?.[0].requiresText).toBe(false);
        expect(result.options?.[1].requiresText).toBe(false);
      });
    });

    describe('optional fields', () => {
      it('should accept category', () => {
        const result = createQuestionSchema.parse({
          text: 'What is your primary area of focus?',
          type: 'TEXT',
          category: 'Demographics',
        });
        expect(result.category).toBe('Demographics');
      });

      it('should accept null category', () => {
        const result = createQuestionSchema.parse({
          text: 'What is your primary area of focus?',
          type: 'TEXT',
          category: null,
        });
        expect(result.category).toBeNull();
      });

      it('should default isRequired to false', () => {
        const result = createQuestionSchema.parse({
          text: 'This is an optional question field',
          type: 'TEXT',
        });
        expect(result.isRequired).toBe(false);
      });

      it('should accept isRequired true', () => {
        const result = createQuestionSchema.parse({
          text: 'This is a required question field',
          type: 'TEXT',
          isRequired: true,
        });
        expect(result.isRequired).toBe(true);
      });

      it('should default tags to empty array', () => {
        const result = createQuestionSchema.parse({
          text: 'Question without tags specified',
          type: 'TEXT',
        });
        expect(result.tags).toEqual([]);
      });

      it('should accept tags array', () => {
        const result = createQuestionSchema.parse({
          text: 'Question with specific tags assigned',
          type: 'TEXT',
          tags: ['Demographics', 'Core'],
        });
        expect(result.tags).toEqual(['Demographics', 'Core']);
      });
    });

    describe('MULTI_TEXT specific fields', () => {
      it('should accept minEntries for nomination questions', () => {
        const result = createQuestionSchema.parse({
          text: 'Please nominate key opinion leaders in your field',
          type: 'MULTI_TEXT',
          minEntries: 3,
        });
        expect(result.minEntries).toBe(3);
      });

      it('should accept defaultEntries for nomination questions', () => {
        const result = createQuestionSchema.parse({
          text: 'Please nominate key opinion leaders in your field',
          type: 'MULTI_TEXT',
          defaultEntries: 5,
        });
        expect(result.defaultEntries).toBe(5);
      });

      it('should reject non-integer minEntries', () => {
        expect(() =>
          createQuestionSchema.parse({
            text: 'Please nominate key opinion leaders',
            type: 'MULTI_TEXT',
            minEntries: 2.5,
          })
        ).toThrow();
      });

      it('should reject minEntries less than 1', () => {
        expect(() =>
          createQuestionSchema.parse({
            text: 'Please nominate key opinion leaders',
            type: 'MULTI_TEXT',
            minEntries: 0,
          })
        ).toThrow();
      });
    });
  });

  describe('updateQuestionSchema', () => {
    it('should allow partial updates with just text', () => {
      const result = updateQuestionSchema.parse({
        text: 'Updated question text here',
      });
      expect(result.text).toBe('Updated question text here');
      expect(result.type).toBeUndefined();
    });

    it('should allow partial updates with just type', () => {
      const result = updateQuestionSchema.parse({
        type: 'NUMBER',
      });
      expect(result.type).toBe('NUMBER');
    });

    it('should allow partial updates with multiple fields', () => {
      const result = updateQuestionSchema.parse({
        text: 'Updated question text here',
        isRequired: true,
        category: 'Updated Category',
      });
      expect(result.text).toBe('Updated question text here');
      expect(result.isRequired).toBe(true);
      expect(result.category).toBe('Updated Category');
    });

    it('should allow empty update object', () => {
      const result = updateQuestionSchema.parse({});
      expect(result).toEqual({});
    });

    it('should allow updating options', () => {
      const result = updateQuestionSchema.parse({
        options: [
          { text: 'New Option 1', requiresText: false },
          { text: 'New Option 2', requiresText: true },
        ],
      });
      expect(result.options).toHaveLength(2);
    });

    it('should allow updating tags', () => {
      const result = updateQuestionSchema.parse({
        tags: ['Research', 'Clinical Practice'],
      });
      expect(result.tags).toEqual(['Research', 'Clinical Practice']);
    });
  });
});
