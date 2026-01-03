import { describe, it, expect } from 'vitest';
import {
  campaignStatusSchema,
  createCampaignSchema,
  updateCampaignSchema,
  campaignListQuerySchema,
  emailTemplatesSchema,
  landingPageTemplatesSchema,
} from '../campaign';

describe('Campaign Schemas', () => {
  describe('campaignStatusSchema', () => {
    it('should accept valid statuses', () => {
      expect(campaignStatusSchema.parse('DRAFT')).toBe('DRAFT');
      expect(campaignStatusSchema.parse('ACTIVE')).toBe('ACTIVE');
      expect(campaignStatusSchema.parse('CLOSED')).toBe('CLOSED');
      expect(campaignStatusSchema.parse('PUBLISHED')).toBe('PUBLISHED');
    });

    it('should reject invalid statuses', () => {
      expect(() => campaignStatusSchema.parse('PENDING')).toThrow();
      expect(() => campaignStatusSchema.parse('')).toThrow();
    });
  });

  describe('createCampaignSchema', () => {
    const validCampaign = {
      clientId: 'clxxxxxxxxxxxxxxxxx1234',
      diseaseAreaId: 'clxxxxxxxxxxxxxxxxx5678',
      name: 'Test Campaign',
    };

    it('should accept valid campaign data', () => {
      const result = createCampaignSchema.parse(validCampaign);
      expect(result).toEqual(validCampaign);
    });

    it('should accept optional fields', () => {
      const campaignWithOptionals = {
        ...validCampaign,
        description: 'Test description',
        surveyTemplateId: 'clxxxxxxxxxxxxxxxxx9012',
        honorariumAmount: 100,
        surveyOpenDate: '2024-01-01T00:00:00Z',
        surveyCloseDate: '2024-12-31T23:59:59Z',
      };

      const result = createCampaignSchema.parse(campaignWithOptionals);
      expect(result.description).toBe('Test description');
      expect(result.honorariumAmount).toBe(100);
    });

    it('should accept null optional fields', () => {
      const campaignWithNulls = {
        ...validCampaign,
        description: null,
        surveyTemplateId: null,
        honorariumAmount: null,
      };

      const result = createCampaignSchema.parse(campaignWithNulls);
      expect(result.description).toBeNull();
    });

    it('should reject empty name', () => {
      const invalid = { ...validCampaign, name: '' };
      expect(() => createCampaignSchema.parse(invalid)).toThrow();
    });

    it('should reject name over 200 characters', () => {
      const invalid = { ...validCampaign, name: 'A'.repeat(201) };
      expect(() => createCampaignSchema.parse(invalid)).toThrow();
    });

    it('should reject description over 1000 characters', () => {
      const invalid = { ...validCampaign, description: 'A'.repeat(1001) };
      expect(() => createCampaignSchema.parse(invalid)).toThrow();
    });

    it('should reject negative honorarium', () => {
      const invalid = { ...validCampaign, honorariumAmount: -50 };
      expect(() => createCampaignSchema.parse(invalid)).toThrow();
    });

    it('should accept zero honorarium', () => {
      const campaign = { ...validCampaign, honorariumAmount: 0 };
      const result = createCampaignSchema.parse(campaign);
      expect(result.honorariumAmount).toBe(0);
    });

    it('should reject invalid datetime format', () => {
      const invalid = { ...validCampaign, surveyOpenDate: 'not-a-date' };
      expect(() => createCampaignSchema.parse(invalid)).toThrow();
    });
  });

  describe('updateCampaignSchema', () => {
    it('should accept partial updates', () => {
      const partialUpdate = { name: 'Updated Name' };
      const result = updateCampaignSchema.parse(partialUpdate);
      expect(result).toEqual({ name: 'Updated Name' });
    });

    it('should not allow clientId updates', () => {
      const result = updateCampaignSchema.parse({
        clientId: 'clxxxxxxxxxxxxxxxxx1234',
        name: 'Test',
      });
      // clientId should be omitted
      expect(result).not.toHaveProperty('clientId');
    });

    it('should accept empty object', () => {
      const result = updateCampaignSchema.parse({});
      expect(result).toEqual({});
    });
  });

  describe('campaignListQuerySchema', () => {
    it('should apply default values', () => {
      const result = campaignListQuerySchema.parse({});
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('should coerce string numbers', () => {
      const result = campaignListQuerySchema.parse({
        page: '5',
        limit: '50',
      });
      expect(result.page).toBe(5);
      expect(result.limit).toBe(50);
    });

    it('should accept optional filters', () => {
      const result = campaignListQuerySchema.parse({
        clientId: 'clxxxxxxxxxxxxxxxxx1234',
        status: 'ACTIVE',
      });
      expect(result.clientId).toBe('clxxxxxxxxxxxxxxxxx1234');
      expect(result.status).toBe('ACTIVE');
    });

    it('should reject limit over 100', () => {
      expect(() => campaignListQuerySchema.parse({ limit: 101 })).toThrow();
    });

    it('should reject non-positive page', () => {
      expect(() => campaignListQuerySchema.parse({ page: 0 })).toThrow();
      expect(() => campaignListQuerySchema.parse({ page: -1 })).toThrow();
    });
  });

  describe('emailTemplatesSchema', () => {
    it('should accept valid email templates', () => {
      const templates = {
        invitationEmailSubject: 'Survey Invitation',
        invitationEmailBody: '<p>Hello</p>',
        reminderEmailSubject: 'Survey Reminder',
        reminderEmailBody: '<p>Reminder</p>',
      };

      const result = emailTemplatesSchema.parse(templates);
      expect(result).toEqual(templates);
    });

    it('should accept partial templates', () => {
      const result = emailTemplatesSchema.parse({
        invitationEmailSubject: 'Subject only',
      });
      expect(result.invitationEmailSubject).toBe('Subject only');
    });

    it('should accept null values', () => {
      const result = emailTemplatesSchema.parse({
        invitationEmailSubject: null,
        invitationEmailBody: null,
      });
      expect(result.invitationEmailSubject).toBeNull();
    });

    it('should reject subject over 200 characters', () => {
      expect(() =>
        emailTemplatesSchema.parse({
          invitationEmailSubject: 'A'.repeat(201),
        })
      ).toThrow();
    });

    it('should reject body over 50000 characters', () => {
      expect(() =>
        emailTemplatesSchema.parse({
          invitationEmailBody: 'A'.repeat(50001),
        })
      ).toThrow();
    });
  });

  describe('landingPageTemplatesSchema', () => {
    it('should accept valid landing page templates', () => {
      const templates = {
        surveyWelcomeTitle: 'Welcome',
        surveyWelcomeMessage: 'Welcome to the survey',
        surveyThankYouTitle: 'Thank You',
        surveyThankYouMessage: 'Thanks for participating',
        surveyAlreadyDoneTitle: 'Already Done',
        surveyAlreadyDoneMessage: 'You already completed this',
      };

      const result = landingPageTemplatesSchema.parse(templates);
      expect(result).toEqual(templates);
    });

    it('should accept partial templates', () => {
      const result = landingPageTemplatesSchema.parse({
        surveyWelcomeTitle: 'Welcome',
      });
      expect(result.surveyWelcomeTitle).toBe('Welcome');
    });

    it('should reject title over 200 characters', () => {
      expect(() =>
        landingPageTemplatesSchema.parse({
          surveyWelcomeTitle: 'A'.repeat(201),
        })
      ).toThrow();
    });

    it('should reject message over 5000 characters', () => {
      expect(() =>
        landingPageTemplatesSchema.parse({
          surveyWelcomeMessage: 'A'.repeat(5001),
        })
      ).toThrow();
    });
  });
});
