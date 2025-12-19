import { describe, it, expect } from 'vitest';
import { scoreConfigSchema, DEFAULT_SCORE_WEIGHTS } from '../score-config';

describe('Score Config Schemas', () => {
  describe('scoreConfigSchema', () => {
    it('should accept valid weights that sum to 100', () => {
      const result = scoreConfigSchema.parse(DEFAULT_SCORE_WEIGHTS);

      expect(result.weightPublications).toBe(10);
      expect(result.weightClinicalTrials).toBe(15);
      expect(result.weightTradePubs).toBe(10);
      expect(result.weightOrgLeadership).toBe(10);
      expect(result.weightOrgAwareness).toBe(10);
      expect(result.weightConference).toBe(10);
      expect(result.weightSocialMedia).toBe(5);
      expect(result.weightMediaPodcasts).toBe(5);
      expect(result.weightSurvey).toBe(25);
    });

    it('should accept weights that sum exactly to 100', () => {
      const weights = {
        weightPublications: 20,
        weightClinicalTrials: 20,
        weightTradePubs: 10,
        weightOrgLeadership: 10,
        weightOrgAwareness: 10,
        weightConference: 10,
        weightSocialMedia: 10,
        weightMediaPodcasts: 5,
        weightSurvey: 5,
      };

      const result = scoreConfigSchema.parse(weights);
      expect(result).toEqual(weights);
    });

    it('should reject weights that sum to less than 100', () => {
      const weights = {
        weightPublications: 10,
        weightClinicalTrials: 10,
        weightTradePubs: 10,
        weightOrgLeadership: 10,
        weightOrgAwareness: 10,
        weightConference: 10,
        weightSocialMedia: 10,
        weightMediaPodcasts: 10,
        weightSurvey: 10, // Sum = 90
      };

      expect(() => scoreConfigSchema.parse(weights)).toThrow('Weights must sum to 100%');
    });

    it('should reject weights that sum to more than 100', () => {
      const weights = {
        weightPublications: 20,
        weightClinicalTrials: 20,
        weightTradePubs: 20,
        weightOrgLeadership: 20,
        weightOrgAwareness: 20,
        weightConference: 10,
        weightSocialMedia: 10,
        weightMediaPodcasts: 10,
        weightSurvey: 10, // Sum = 140
      };

      expect(() => scoreConfigSchema.parse(weights)).toThrow('Weights must sum to 100%');
    });

    it('should reject negative weight values', () => {
      const weights = {
        ...DEFAULT_SCORE_WEIGHTS,
        weightPublications: -10,
      };

      expect(() => scoreConfigSchema.parse(weights)).toThrow();
    });

    it('should reject weight values over 100', () => {
      const weights = {
        ...DEFAULT_SCORE_WEIGHTS,
        weightPublications: 110,
      };

      expect(() => scoreConfigSchema.parse(weights)).toThrow();
    });

    it('should accept weights with floating point values that sum to 100', () => {
      const weights = {
        weightPublications: 11.11,
        weightClinicalTrials: 11.11,
        weightTradePubs: 11.11,
        weightOrgLeadership: 11.11,
        weightOrgAwareness: 11.11,
        weightConference: 11.11,
        weightSocialMedia: 11.11,
        weightMediaPodcasts: 11.12,
        weightSurvey: 11.11,
      };

      // 11.11 * 8 + 11.12 = 100.00, should be accepted
      const result = scoreConfigSchema.parse(weights);
      expect(result).toEqual(weights);
    });

    it('should accept all weights as zero except one at 100', () => {
      const weights = {
        weightPublications: 0,
        weightClinicalTrials: 0,
        weightTradePubs: 0,
        weightOrgLeadership: 0,
        weightOrgAwareness: 0,
        weightConference: 0,
        weightSocialMedia: 0,
        weightMediaPodcasts: 0,
        weightSurvey: 100,
      };

      const result = scoreConfigSchema.parse(weights);
      expect(result.weightSurvey).toBe(100);
    });

    it('should reject missing weight fields', () => {
      const partialWeights = {
        weightPublications: 50,
        weightSurvey: 50,
      };

      expect(() => scoreConfigSchema.parse(partialWeights)).toThrow();
    });

    it('should reject non-numeric weight values', () => {
      const weights = {
        ...DEFAULT_SCORE_WEIGHTS,
        weightPublications: 'ten' as unknown as number,
      };

      expect(() => scoreConfigSchema.parse(weights)).toThrow();
    });
  });

  describe('DEFAULT_SCORE_WEIGHTS', () => {
    it('should have all required fields', () => {
      expect(DEFAULT_SCORE_WEIGHTS).toHaveProperty('weightPublications');
      expect(DEFAULT_SCORE_WEIGHTS).toHaveProperty('weightClinicalTrials');
      expect(DEFAULT_SCORE_WEIGHTS).toHaveProperty('weightTradePubs');
      expect(DEFAULT_SCORE_WEIGHTS).toHaveProperty('weightOrgLeadership');
      expect(DEFAULT_SCORE_WEIGHTS).toHaveProperty('weightOrgAwareness');
      expect(DEFAULT_SCORE_WEIGHTS).toHaveProperty('weightConference');
      expect(DEFAULT_SCORE_WEIGHTS).toHaveProperty('weightSocialMedia');
      expect(DEFAULT_SCORE_WEIGHTS).toHaveProperty('weightMediaPodcasts');
      expect(DEFAULT_SCORE_WEIGHTS).toHaveProperty('weightSurvey');
    });

    it('should be a valid score config', () => {
      expect(() => scoreConfigSchema.parse(DEFAULT_SCORE_WEIGHTS)).not.toThrow();
    });

    it('should sum to 100', () => {
      const sum = Object.values(DEFAULT_SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
      expect(sum).toBe(100);
    });

    it('should have survey weight as highest', () => {
      expect(DEFAULT_SCORE_WEIGHTS.weightSurvey).toBe(25);
      expect(DEFAULT_SCORE_WEIGHTS.weightClinicalTrials).toBe(15);
    });
  });
});
