import { describe, it, expect } from 'vitest';
import {
  questionTypeSchema,
  nominationTypeSchema,
  createQuestionSchema,
  updateQuestionSchema,
  QUESTION_TAGS,
  NOMINATION_TYPE_LABELS,
} from '../question';

describe('Question Schemas', () => {
  describe('questionTypeSchema', () => {
    it('should accept valid question types', () => {
      expect(questionTypeSchema.parse('TEXT')).toBe('TEXT');
      expect(questionTypeSchema.parse('NUMBER')).toBe('NUMBER');
      expect(questionTypeSchema.parse('RATING')).toBe('RATING');
      expect(questionTypeSchema.parse('SINGLE_CHOICE')).toBe('SINGLE_CHOICE');
      expect(questionTypeSchema.parse('MULTI_CHOICE')).toBe('MULTI_CHOICE');
      expect(questionTypeSchema.parse('DROPDOWN')).toBe('DROPDOWN');
      expect(questionTypeSchema.parse('MULTI_TEXT')).toBe('MULTI_TEXT');
    });

    it('should reject invalid question types', () => {
      expect(() => questionTypeSchema.parse('CHECKBOX')).toThrow();
      expect(() => questionTypeSchema.parse('')).toThrow();
    });
  });

  describe('nominationTypeSchema', () => {
    it('should accept valid nomination types', () => {
      expect(nominationTypeSchema.parse('NATIONAL_KOL')).toBe('NATIONAL_KOL');
      expect(nominationTypeSchema.parse('RISING_STAR')).toBe('RISING_STAR');
      expect(nominationTypeSchema.parse('REGIONAL_EXPERT')).toBe('REGIONAL_EXPERT');
      expect(nominationTypeSchema.parse('DIGITAL_INFLUENCER')).toBe('DIGITAL_INFLUENCER');
      expect(nominationTypeSchema.parse('CLINICAL_EXPERT')).toBe('CLINICAL_EXPERT');
    });

    it('should reject invalid nomination types', () => {
      expect(() => nominationTypeSchema.parse('EXPERT')).toThrow();
      expect(() => nominationTypeSchema.parse('')).toThrow();
    });
  });

  describe('createQuestionSchema', () => {
    const validTextQuestion = {
      text: 'This is a valid question text.',
      type: 'TEXT',
    };

    it('should accept valid text question', () => {
      const result = createQuestionSchema.parse(validTextQuestion);
      expect(result.text).toBe('This is a valid question text.');
      expect(result.type).toBe('TEXT');
      expect(result.isRequired).toBe(false); // default
      expect(result.tags).toEqual([]); // default
    });

    it('should accept question with all optional fields', () => {
      const fullQuestion = {
        text: 'Full question with all fields populated',
        type: 'TEXT',
        category: 'Demographics',
        isRequired: true,
        tags: ['Core', 'Demographics'],
      };

      const result = createQuestionSchema.parse(fullQuestion);
      expect(result.category).toBe('Demographics');
      expect(result.isRequired).toBe(true);
      expect(result.tags).toEqual(['Core', 'Demographics']);
    });

    it('should reject text less than 10 characters', () => {
      expect(() => createQuestionSchema.parse({ text: 'Short', type: 'TEXT' })).toThrow();
    });

    it('should reject text over 500 characters', () => {
      expect(() => createQuestionSchema.parse({ text: 'A'.repeat(501), type: 'TEXT' })).toThrow();
    });

    it('should accept text exactly 10 characters', () => {
      const result = createQuestionSchema.parse({ text: '1234567890', type: 'TEXT' });
      expect(result.text).toBe('1234567890');
    });

    describe('choice questions', () => {
      it('should accept SINGLE_CHOICE with valid options', () => {
        const question = {
          text: 'Select one option from the list',
          type: 'SINGLE_CHOICE',
          options: [
            { text: 'Option A', requiresText: false },
            { text: 'Option B', requiresText: false },
          ],
        };

        const result = createQuestionSchema.parse(question);
        expect(result.options).toHaveLength(2);
      });

      it('should accept MULTI_CHOICE with valid options', () => {
        const question = {
          text: 'Select multiple options from list',
          type: 'MULTI_CHOICE',
          options: [
            { text: 'Choice 1', requiresText: false },
            { text: 'Choice 2', requiresText: false },
            { text: 'Other', requiresText: true },
          ],
        };

        const result = createQuestionSchema.parse(question);
        expect(result.options).toHaveLength(3);
        expect(result.options![2].requiresText).toBe(true);
      });

      it('should accept DROPDOWN with valid options', () => {
        const question = {
          text: 'Select from dropdown menu below',
          type: 'DROPDOWN',
          options: [
            { text: 'First', requiresText: false },
            { text: 'Second', requiresText: false },
          ],
        };

        const result = createQuestionSchema.parse(question);
        expect(result.options).toHaveLength(2);
      });

      it('should reject SINGLE_CHOICE without options', () => {
        expect(() =>
          createQuestionSchema.parse({
            text: 'Select one option from list',
            type: 'SINGLE_CHOICE',
          })
        ).toThrow('Choice questions require at least 2 options');
      });

      it('should reject SINGLE_CHOICE with only 1 option', () => {
        expect(() =>
          createQuestionSchema.parse({
            text: 'Select one option from list',
            type: 'SINGLE_CHOICE',
            options: [{ text: 'Only option', requiresText: false }],
          })
        ).toThrow('Choice questions require at least 2 options');
      });

      it('should reject options with empty text', () => {
        expect(() =>
          createQuestionSchema.parse({
            text: 'Select one option from list',
            type: 'SINGLE_CHOICE',
            options: [
              { text: '', requiresText: false },
              { text: 'Valid', requiresText: false },
            ],
          })
        ).toThrow('Choice questions require at least 2 options');
      });
    });

    describe('nomination questions (MULTI_TEXT)', () => {
      it('should accept MULTI_TEXT with nominationType', () => {
        const question = {
          text: 'Nominate healthcare professionals',
          type: 'MULTI_TEXT',
          nominationType: 'NATIONAL_KOL',
          minEntries: 3,
          defaultEntries: 5,
        };

        const result = createQuestionSchema.parse(question);
        expect(result.nominationType).toBe('NATIONAL_KOL');
        expect(result.minEntries).toBe(3);
        expect(result.defaultEntries).toBe(5);
      });

      it('should reject MULTI_TEXT without nominationType', () => {
        expect(() =>
          createQuestionSchema.parse({
            text: 'Nominate healthcare professionals',
            type: 'MULTI_TEXT',
          })
        ).toThrow('Nomination questions require a nomination type');
      });

      it('should accept all nomination types', () => {
        const types = ['NATIONAL_KOL', 'RISING_STAR', 'REGIONAL_EXPERT', 'DIGITAL_INFLUENCER', 'CLINICAL_EXPERT'];

        types.forEach((type) => {
          const result = createQuestionSchema.parse({
            text: 'Nominate healthcare professionals',
            type: 'MULTI_TEXT',
            nominationType: type,
          });
          expect(result.nominationType).toBe(type);
        });
      });
    });

    describe('rating and number questions', () => {
      it('should accept RATING question', () => {
        const result = createQuestionSchema.parse({
          text: 'Rate this on a scale of 1-5',
          type: 'RATING',
        });
        expect(result.type).toBe('RATING');
      });

      it('should accept NUMBER question', () => {
        const result = createQuestionSchema.parse({
          text: 'Enter a number between 0 and 100',
          type: 'NUMBER',
        });
        expect(result.type).toBe('NUMBER');
      });
    });
  });

  describe('updateQuestionSchema', () => {
    it('should accept partial updates', () => {
      const result = updateQuestionSchema.parse({ text: 'Updated question text here' });
      expect(result.text).toBe('Updated question text here');
    });

    it('should accept empty object', () => {
      const result = updateQuestionSchema.parse({});
      expect(result).toEqual({});
    });

    it('should validate provided fields', () => {
      expect(() => updateQuestionSchema.parse({ text: 'Short' })).toThrow();
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
        tags: ['new-tag', 'another-tag'],
      });
      expect(result.tags).toEqual(['new-tag', 'another-tag']);
    });
  });

  describe('constants', () => {
    it('should have predefined question tags', () => {
      expect(QUESTION_TAGS).toContain('Demographics');
      expect(QUESTION_TAGS).toContain('Core');
      expect(QUESTION_TAGS).toContain('Treatment');
      expect(QUESTION_TAGS.length).toBeGreaterThan(0);
    });

    it('should have labels for all nomination types', () => {
      expect(NOMINATION_TYPE_LABELS.NATIONAL_KOL).toBe('National KOL');
      expect(NOMINATION_TYPE_LABELS.RISING_STAR).toBe('Rising Star');
      expect(NOMINATION_TYPE_LABELS.REGIONAL_EXPERT).toBe('Regional Expert');
      expect(NOMINATION_TYPE_LABELS.DIGITAL_INFLUENCER).toBe('Digital Influencer');
      expect(NOMINATION_TYPE_LABELS.CLINICAL_EXPERT).toBe('Clinical Expert');
    });
  });
});
