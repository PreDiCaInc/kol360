import { describe, it, expect } from 'vitest';
import {
  nominationListQuerySchema,
  matchTypeSchema,
  matchNominationSchema,
  createHcpFromNominationSchema,
  nominationIdParamSchema,
  updateNominationRawNameSchema,
  excludeNominationSchema,
} from '../nomination';

describe('Nomination Schemas', () => {
  describe('nominationListQuerySchema', () => {
    it('should apply default values', () => {
      const result = nominationListQuerySchema.parse({});
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
    });

    it('should accept valid status values', () => {
      const statuses = ['UNMATCHED', 'MATCHED', 'REVIEW_NEEDED', 'NEW_HCP', 'EXCLUDED'];
      statuses.forEach((status) => {
        const result = nominationListQuerySchema.parse({ status });
        expect(result.status).toBe(status);
      });
    });

    it('should reject invalid status', () => {
      expect(() => nominationListQuerySchema.parse({ status: 'INVALID' })).toThrow();
    });

    it('should coerce string numbers', () => {
      const result = nominationListQuerySchema.parse({ page: '3', limit: '25' });
      expect(result.page).toBe(3);
      expect(result.limit).toBe(25);
    });

    it('should reject limit over 100', () => {
      expect(() => nominationListQuerySchema.parse({ limit: 101 })).toThrow();
    });
  });

  describe('matchTypeSchema', () => {
    it('should accept valid match types', () => {
      expect(matchTypeSchema.parse('exact')).toBe('exact');
      expect(matchTypeSchema.parse('primary')).toBe('primary');
      expect(matchTypeSchema.parse('alias')).toBe('alias');
      expect(matchTypeSchema.parse('partial')).toBe('partial');
    });

    it('should reject invalid match types', () => {
      expect(() => matchTypeSchema.parse('fuzzy')).toThrow();
      expect(() => matchTypeSchema.parse('')).toThrow();
    });
  });

  describe('matchNominationSchema', () => {
    it('should accept valid match data', () => {
      const validMatch = {
        hcpId: 'clxxxxxxxxxxxxxxxxx1234',
      };
      const result = matchNominationSchema.parse(validMatch);
      expect(result.hcpId).toBe('clxxxxxxxxxxxxxxxxx1234');
      expect(result.addAlias).toBe(true); // default
    });

    it('should accept optional fields', () => {
      const matchWithOptionals = {
        hcpId: 'clxxxxxxxxxxxxxxxxx1234',
        addAlias: false,
        matchType: 'exact',
        matchConfidence: 95,
      };
      const result = matchNominationSchema.parse(matchWithOptionals);
      expect(result.addAlias).toBe(false);
      expect(result.matchType).toBe('exact');
      expect(result.matchConfidence).toBe(95);
    });

    it('should reject matchConfidence below 0', () => {
      expect(() =>
        matchNominationSchema.parse({
          hcpId: 'clxxxxxxxxxxxxxxxxx1234',
          matchConfidence: -1,
        })
      ).toThrow();
    });

    it('should reject matchConfidence above 100', () => {
      expect(() =>
        matchNominationSchema.parse({
          hcpId: 'clxxxxxxxxxxxxxxxxx1234',
          matchConfidence: 101,
        })
      ).toThrow();
    });
  });

  describe('createHcpFromNominationSchema', () => {
    it('should accept valid HCP data', () => {
      const validHcp = {
        npi: '1234567890',
        firstName: 'John',
        lastName: 'Doe',
      };
      const result = createHcpFromNominationSchema.parse(validHcp);
      expect(result).toEqual(validHcp);
    });

    it('should accept optional fields', () => {
      const hcpWithOptionals = {
        npi: '1234567890',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        specialty: 'Cardiology',
        city: 'New York',
        state: 'NY',
      };
      const result = createHcpFromNominationSchema.parse(hcpWithOptionals);
      expect(result.email).toBe('john@example.com');
      expect(result.specialty).toBe('Cardiology');
    });

    it('should reject NPI not 10 digits', () => {
      expect(() =>
        createHcpFromNominationSchema.parse({
          npi: '123',
          firstName: 'John',
          lastName: 'Doe',
        })
      ).toThrow('NPI must be 10 digits');
    });

    it('should reject empty firstName', () => {
      expect(() =>
        createHcpFromNominationSchema.parse({
          npi: '1234567890',
          firstName: '',
          lastName: 'Doe',
        })
      ).toThrow();
    });

    it('should reject empty lastName', () => {
      expect(() =>
        createHcpFromNominationSchema.parse({
          npi: '1234567890',
          firstName: 'John',
          lastName: '',
        })
      ).toThrow();
    });

    it('should reject invalid email', () => {
      expect(() =>
        createHcpFromNominationSchema.parse({
          npi: '1234567890',
          firstName: 'John',
          lastName: 'Doe',
          email: 'invalid-email',
        })
      ).toThrow();
    });

    it('should accept null email', () => {
      const result = createHcpFromNominationSchema.parse({
        npi: '1234567890',
        firstName: 'John',
        lastName: 'Doe',
        email: null,
      });
      expect(result.email).toBeNull();
    });
  });

  describe('nominationIdParamSchema', () => {
    it('should accept valid CUID', () => {
      const result = nominationIdParamSchema.parse({
        nid: 'clxxxxxxxxxxxxxxxxx1234',
      });
      expect(result.nid).toBe('clxxxxxxxxxxxxxxxxx1234');
    });

    it('should reject invalid CUID', () => {
      expect(() => nominationIdParamSchema.parse({ nid: 'invalid' })).toThrow();
    });
  });

  describe('updateNominationRawNameSchema', () => {
    it('should accept valid name', () => {
      const result = updateNominationRawNameSchema.parse({
        rawNameEntered: 'Dr. John Smith',
      });
      expect(result.rawNameEntered).toBe('Dr. John Smith');
    });

    it('should reject empty name', () => {
      expect(() =>
        updateNominationRawNameSchema.parse({ rawNameEntered: '' })
      ).toThrow();
    });

    it('should reject name over 255 characters', () => {
      expect(() =>
        updateNominationRawNameSchema.parse({
          rawNameEntered: 'A'.repeat(256),
        })
      ).toThrow();
    });
  });

  describe('excludeNominationSchema', () => {
    it('should accept empty object', () => {
      const result = excludeNominationSchema.parse({});
      expect(result).toEqual({});
    });

    it('should accept reason', () => {
      const result = excludeNominationSchema.parse({
        reason: 'Duplicate entry',
      });
      expect(result.reason).toBe('Duplicate entry');
    });

    it('should reject reason over 500 characters', () => {
      expect(() =>
        excludeNominationSchema.parse({
          reason: 'A'.repeat(501),
        })
      ).toThrow();
    });
  });
});
