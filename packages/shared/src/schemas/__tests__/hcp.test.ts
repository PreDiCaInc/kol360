import { describe, it, expect } from 'vitest';
import {
  npiSchema,
  createHcpSchema,
  updateHcpSchema,
} from '../hcp';

describe('HCP Schemas', () => {
  describe('npiSchema', () => {
    it('should accept valid 10-digit NPI', () => {
      expect(npiSchema.parse('1234567890')).toBe('1234567890');
      expect(npiSchema.parse('0000000000')).toBe('0000000000');
      expect(npiSchema.parse('9999999999')).toBe('9999999999');
    });

    it('should reject NPI with less than 10 digits', () => {
      expect(() => npiSchema.parse('123456789')).toThrow();
      expect(() => npiSchema.parse('12345')).toThrow();
      expect(() => npiSchema.parse('')).toThrow();
    });

    it('should reject NPI with more than 10 digits', () => {
      expect(() => npiSchema.parse('12345678901')).toThrow();
      expect(() => npiSchema.parse('123456789012345')).toThrow();
    });

    it('should reject non-numeric NPI', () => {
      expect(() => npiSchema.parse('123456789a')).toThrow();
      expect(() => npiSchema.parse('abcdefghij')).toThrow();
      expect(() => npiSchema.parse('123-456-78')).toThrow();
    });
  });

  describe('createHcpSchema', () => {
    const validHcp = {
      npi: '1234567890',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
    };

    it('should accept valid HCP data', () => {
      const result = createHcpSchema.parse(validHcp);
      expect(result).toEqual(validHcp);
    });

    it('should require email field', () => {
      const { email, ...hcpWithoutEmail } = validHcp;
      expect(() => createHcpSchema.parse(hcpWithoutEmail)).toThrow();
    });

    it('should accept optional fields', () => {
      const hcpWithOptionals = {
        ...validHcp,
        specialty: 'Cardiology',
        subSpecialty: 'Interventional Cardiology',
        city: 'New York',
        state: 'NY',
      };

      const result = createHcpSchema.parse(hcpWithOptionals);
      expect(result.email).toBe('john.doe@example.com');
      expect(result.specialty).toBe('Cardiology');
      expect(result.subSpecialty).toBe('Interventional Cardiology');
      expect(result.city).toBe('New York');
      expect(result.state).toBe('NY');
    });

    it('should accept null optional fields', () => {
      const hcpWithNulls = {
        ...validHcp,
        specialty: null,
        city: null,
        state: null,
      };

      const result = createHcpSchema.parse(hcpWithNulls);
      expect(result.specialty).toBeNull();
    });

    it('should reject empty firstName', () => {
      expect(() =>
        createHcpSchema.parse({ ...validHcp, firstName: '' })
      ).toThrow();
    });

    it('should reject firstName over 50 characters', () => {
      expect(() =>
        createHcpSchema.parse({ ...validHcp, firstName: 'A'.repeat(51) })
      ).toThrow();
    });

    it('should reject empty lastName', () => {
      expect(() =>
        createHcpSchema.parse({ ...validHcp, lastName: '' })
      ).toThrow();
    });

    it('should reject lastName over 50 characters', () => {
      expect(() =>
        createHcpSchema.parse({ ...validHcp, lastName: 'D'.repeat(51) })
      ).toThrow();
    });

    it('should reject invalid email', () => {
      expect(() =>
        createHcpSchema.parse({ ...validHcp, email: 'invalid-email' })
      ).toThrow();
    });

    it('should reject invalid state (not 2 chars)', () => {
      expect(() =>
        createHcpSchema.parse({ ...validHcp, state: 'New York' })
      ).toThrow();
      expect(() =>
        createHcpSchema.parse({ ...validHcp, state: 'N' })
      ).toThrow();
    });

    it('should accept valid 2-character state', () => {
      const result = createHcpSchema.parse({ ...validHcp, state: 'CA' });
      expect(result.state).toBe('CA');
    });
  });

  describe('updateHcpSchema', () => {
    it('should accept partial updates', () => {
      const result = updateHcpSchema.parse({ firstName: 'Jane' });
      expect(result).toEqual({ firstName: 'Jane' });
    });

    it('should not allow NPI updates', () => {
      const result = updateHcpSchema.parse({
        npi: '0987654321',
        firstName: 'Jane',
      });
      // NPI should be omitted
      expect(result).not.toHaveProperty('npi');
      expect(result.firstName).toBe('Jane');
    });

    it('should accept empty object', () => {
      const result = updateHcpSchema.parse({});
      expect(result).toEqual({});
    });

    it('should accept full update (except NPI)', () => {
      const fullUpdate = {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane.smith@example.com',
        specialty: 'Neurology',
        city: 'Boston',
        state: 'MA',
      };

      const result = updateHcpSchema.parse(fullUpdate);
      expect(result).toEqual(fullUpdate);
    });

    it('should still validate fields when provided', () => {
      expect(() => updateHcpSchema.parse({ email: 'invalid' })).toThrow();
      expect(() => updateHcpSchema.parse({ firstName: '' })).toThrow();
      expect(() => updateHcpSchema.parse({ state: 'New York' })).toThrow();
    });
  });
});
