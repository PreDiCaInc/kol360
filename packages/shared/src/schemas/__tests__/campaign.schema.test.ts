import { describe, it, expect } from 'vitest';
import {
  campaignStatusSchema,
  createCampaignSchema,
  updateCampaignSchema,
  campaignListQuerySchema,
} from '../campaign';

describe('Campaign Schemas', () => {
  describe('campaignStatusSchema', () => {
    it('should accept valid status values', () => {
      expect(campaignStatusSchema.parse('DRAFT')).toBe('DRAFT');
      expect(campaignStatusSchema.parse('ACTIVE')).toBe('ACTIVE');
      expect(campaignStatusSchema.parse('CLOSED')).toBe('CLOSED');
      expect(campaignStatusSchema.parse('PUBLISHED')).toBe('PUBLISHED');
    });

    it('should reject invalid status values', () => {
      expect(() => campaignStatusSchema.parse('INVALID')).toThrow();
      expect(() => campaignStatusSchema.parse('draft')).toThrow(); // case sensitive
      expect(() => campaignStatusSchema.parse('')).toThrow();
    });
  });

  describe('createCampaignSchema', () => {
    const validInput = {
      clientId: 'clxxxxxxxxxxxxxxxxxxxxxxxxx',
      diseaseAreaId: 'clxxxxxxxxxxxxxxxxxxxxxxxxx',
      name: 'Test Campaign',
    };

    it('should accept valid minimal input', () => {
      const result = createCampaignSchema.parse(validInput);
      expect(result.name).toBe('Test Campaign');
      expect(result.clientId).toBe(validInput.clientId);
    });

    it('should accept valid complete input', () => {
      const completeInput = {
        ...validInput,
        description: 'A test campaign description',
        surveyTemplateId: 'clxxxxxxxxxxxxxxxxxxxxxxxxx',
        honorariumAmount: 150,
        surveyOpenDate: '2024-01-01T00:00:00Z',
        surveyCloseDate: '2024-12-31T00:00:00Z',
      };

      const result = createCampaignSchema.parse(completeInput);
      expect(result.description).toBe('A test campaign description');
      expect(result.honorariumAmount).toBe(150);
    });

    it('should reject empty name', () => {
      expect(() =>
        createCampaignSchema.parse({ ...validInput, name: '' })
      ).toThrow('Name is required');
    });

    it('should reject name over 200 characters', () => {
      expect(() =>
        createCampaignSchema.parse({ ...validInput, name: 'a'.repeat(201) })
      ).toThrow();
    });

    it('should reject description over 1000 characters', () => {
      expect(() =>
        createCampaignSchema.parse({ ...validInput, description: 'a'.repeat(1001) })
      ).toThrow();
    });

    it('should reject negative honorarium amount', () => {
      expect(() =>
        createCampaignSchema.parse({ ...validInput, honorariumAmount: -10 })
      ).toThrow();
    });

    it('should accept null optional fields', () => {
      const result = createCampaignSchema.parse({
        ...validInput,
        description: null,
        surveyTemplateId: null,
        honorariumAmount: null,
      });

      expect(result.description).toBeNull();
      expect(result.surveyTemplateId).toBeNull();
    });

    it('should reject invalid cuid format', () => {
      expect(() =>
        createCampaignSchema.parse({ ...validInput, clientId: 'invalid-id' })
      ).toThrow();
    });

    it('should reject invalid datetime format', () => {
      expect(() =>
        createCampaignSchema.parse({ ...validInput, surveyOpenDate: 'not-a-date' })
      ).toThrow();
    });
  });

  describe('updateCampaignSchema', () => {
    it('should accept partial updates', () => {
      const result = updateCampaignSchema.parse({ name: 'Updated Name' });
      expect(result.name).toBe('Updated Name');
    });

    it('should accept empty object (no updates)', () => {
      const result = updateCampaignSchema.parse({});
      expect(result).toEqual({});
    });

    it('should not include clientId in update schema', () => {
      const parsed = updateCampaignSchema.parse({ clientId: 'clxxxxxxxxxxxxxxxxxxxxxxxxx' });
      expect(parsed).not.toHaveProperty('clientId');
    });

    it('should validate provided fields', () => {
      expect(() => updateCampaignSchema.parse({ name: '' })).toThrow();
    });
  });

  describe('campaignListQuerySchema', () => {
    it('should provide default pagination', () => {
      const result = campaignListQuerySchema.parse({});
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('should accept valid query parameters', () => {
      const result = campaignListQuerySchema.parse({
        clientId: 'clxxxxxxxxxxxxxxxxxxxxxxxxx',
        status: 'ACTIVE',
        page: 2,
        limit: 50,
      });

      expect(result.status).toBe('ACTIVE');
      expect(result.page).toBe(2);
      expect(result.limit).toBe(50);
    });

    it('should coerce string numbers to integers', () => {
      const result = campaignListQuerySchema.parse({
        page: '5',
        limit: '30',
      });

      expect(result.page).toBe(5);
      expect(result.limit).toBe(30);
    });

    it('should reject limit over 100', () => {
      expect(() =>
        campaignListQuerySchema.parse({ limit: 101 })
      ).toThrow();
    });

    it('should reject non-positive page numbers', () => {
      expect(() => campaignListQuerySchema.parse({ page: 0 })).toThrow();
      expect(() => campaignListQuerySchema.parse({ page: -1 })).toThrow();
    });

    it('should reject invalid status', () => {
      expect(() =>
        campaignListQuerySchema.parse({ status: 'INVALID' })
      ).toThrow();
    });
  });
});
