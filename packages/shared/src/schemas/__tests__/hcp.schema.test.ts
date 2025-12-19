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
      expect(() => npiSchema.parse('123456789')).toThrow('NPI must be 10 digits');
      expect(() => npiSchema.parse('')).toThrow();
    });

    it('should reject NPI with more than 10 digits', () => {
      expect(() => npiSchema.parse('12345678901')).toThrow('NPI must be 10 digits');
    });

    it('should reject NPI with non-numeric characters', () => {
      expect(() => npiSchema.parse('123456789a')).toThrow();
      expect(() => npiSchema.parse('12345-6789')).toThrow();
      expect(() => npiSchema.parse('123 456 78')).toThrow();
    });
  });

  describe('createHcpSchema', () => {
    const validInput = {
      npi: '1234567890',
      firstName: 'John',
      lastName: 'Smith',
    };

    it('should accept valid minimal input', () => {
      const result = createHcpSchema.parse(validInput);
      expect(result.npi).toBe('1234567890');
      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe('Smith');
    });

    it('should accept valid complete input', () => {
      const completeInput = {
        ...validInput,
        email: 'doctor@hospital.com',
        specialty: 'Cardiology',
        subSpecialty: 'Interventional Cardiology',
        city: 'New York',
        state: 'NY',
        yearsInPractice: 15,
      };

      const result = createHcpSchema.parse(completeInput);
      expect(result.email).toBe('doctor@hospital.com');
      expect(result.specialty).toBe('Cardiology');
      expect(result.state).toBe('NY');
      expect(result.yearsInPractice).toBe(15);
    });

    it('should reject invalid NPI', () => {
      expect(() =>
        createHcpSchema.parse({ ...validInput, npi: 'invalid' })
      ).toThrow();
    });

    it('should reject empty first name', () => {
      expect(() =>
        createHcpSchema.parse({ ...validInput, firstName: '' })
      ).toThrow();
    });

    it('should reject first name over 50 characters', () => {
      expect(() =>
        createHcpSchema.parse({ ...validInput, firstName: 'a'.repeat(51) })
      ).toThrow();
    });

    it('should reject empty last name', () => {
      expect(() =>
        createHcpSchema.parse({ ...validInput, lastName: '' })
      ).toThrow();
    });

    it('should reject invalid email format', () => {
      expect(() =>
        createHcpSchema.parse({ ...validInput, email: 'not-an-email' })
      ).toThrow();
    });

    it('should accept null email', () => {
      const result = createHcpSchema.parse({ ...validInput, email: null });
      expect(result.email).toBeNull();
    });

    it('should reject state not exactly 2 characters', () => {
      expect(() =>
        createHcpSchema.parse({ ...validInput, state: 'N' })
      ).toThrow();
      expect(() =>
        createHcpSchema.parse({ ...validInput, state: 'NEW' })
      ).toThrow();
    });

    it('should accept valid 2-character state', () => {
      const result = createHcpSchema.parse({ ...validInput, state: 'CA' });
      expect(result.state).toBe('CA');
    });

    it('should accept null state', () => {
      const result = createHcpSchema.parse({ ...validInput, state: null });
      expect(result.state).toBeNull();
    });

    it('should reject non-positive years in practice', () => {
      expect(() =>
        createHcpSchema.parse({ ...validInput, yearsInPractice: 0 })
      ).toThrow();
      expect(() =>
        createHcpSchema.parse({ ...validInput, yearsInPractice: -5 })
      ).toThrow();
    });

    it('should reject non-integer years in practice', () => {
      expect(() =>
        createHcpSchema.parse({ ...validInput, yearsInPractice: 10.5 })
      ).toThrow();
    });

    it('should accept null years in practice', () => {
      const result = createHcpSchema.parse({ ...validInput, yearsInPractice: null });
      expect(result.yearsInPractice).toBeNull();
    });
  });

  describe('updateHcpSchema', () => {
    it('should accept partial updates', () => {
      const result = updateHcpSchema.parse({ firstName: 'Jane' });
      expect(result.firstName).toBe('Jane');
    });

    it('should not allow NPI updates', () => {
      const parsed = updateHcpSchema.parse({ npi: '9876543210' });
      expect(parsed).not.toHaveProperty('npi');
    });

    it('should accept empty object', () => {
      const result = updateHcpSchema.parse({});
      expect(result).toEqual({});
    });

    it('should validate provided fields', () => {
      expect(() =>
        updateHcpSchema.parse({ email: 'invalid-email' })
      ).toThrow();
    });

    it('should allow updating specialty and location', () => {
      const result = updateHcpSchema.parse({
        specialty: 'Oncology',
        city: 'Boston',
        state: 'MA',
      });

      expect(result.specialty).toBe('Oncology');
      expect(result.city).toBe('Boston');
      expect(result.state).toBe('MA');
    });
  });
});
