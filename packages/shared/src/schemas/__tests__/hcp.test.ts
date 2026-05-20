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
      // specialty is now a closed enum (Optometry | Ophthalmology) per the
      // v1.15.29 (a)-unify decision; v1.15.31 flipped from role-form to
      // field-form (data-team source-of-truth alignment). Legacy free-text
      // values (e.g. Cardiology) are rejected at the boundary.
      const hcpWithOptionals = {
        ...validHcp,
        specialty: 'Ophthalmology' as const,
        subSpecialty: 'Cornea',
        city: 'New York',
        state: 'NY',
      };

      const result = createHcpSchema.parse(hcpWithOptionals);
      expect(result.email).toBe('john.doe@example.com');
      expect(result.specialty).toBe('Ophthalmology');
      expect(result.subSpecialty).toBe('Cornea');
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
      // specialty constrained to the 2-value enum since v1.15.29.
      // v1.15.31 flipped canonical from role-form to field-form
      // (Optometry / Ophthalmology — matches DiseaseArea naming).
      const fullUpdate = {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane.smith@example.com',
        specialty: 'Optometry' as const,
        city: 'Boston',
        state: 'MA',
      };

      const result = updateHcpSchema.parse(fullUpdate);
      expect(result).toEqual(fullUpdate);
    });

    it('rejects legacy free-text and old role-form specialty values', () => {
      // Out-of-domain values (Cardiology, Neurology) and the old role-form
      // (Optometrist, Ophthalmologist) all get rejected at the boundary now.
      // The helper normalizeHcpSpecialty() still maps role-form → field-form
      // for legacy CSV imports; the Zod enum itself is strict.
      expect(() => updateHcpSchema.parse({ specialty: 'Cardiology' })).toThrow();
      expect(() => updateHcpSchema.parse({ specialty: 'Neurology' })).toThrow();
      expect(() => updateHcpSchema.parse({ specialty: 'Optometrist' })).toThrow();
      expect(() => updateHcpSchema.parse({ specialty: 'Ophthalmologist' })).toThrow();
    });

    it('should still validate fields when provided', () => {
      expect(() => updateHcpSchema.parse({ email: 'invalid' })).toThrow();
      expect(() => updateHcpSchema.parse({ firstName: '' })).toThrow();
      expect(() => updateHcpSchema.parse({ state: 'New York' })).toThrow();
    });
  });
});
