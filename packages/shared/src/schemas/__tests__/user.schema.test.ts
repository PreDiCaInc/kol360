import { describe, it, expect } from 'vitest';
import {
  userRoleSchema,
  userStatusSchema,
  createUserSchema,
  updateUserSchema,
} from '../user';

describe('User Schemas', () => {
  describe('userRoleSchema', () => {
    it('should accept valid role values', () => {
      expect(userRoleSchema.parse('PLATFORM_ADMIN')).toBe('PLATFORM_ADMIN');
      expect(userRoleSchema.parse('CLIENT_ADMIN')).toBe('CLIENT_ADMIN');
      expect(userRoleSchema.parse('TEAM_MEMBER')).toBe('TEAM_MEMBER');
    });

    it('should reject invalid role values', () => {
      expect(() => userRoleSchema.parse('ADMIN')).toThrow();
      expect(() => userRoleSchema.parse('admin')).toThrow();
      expect(() => userRoleSchema.parse('')).toThrow();
    });
  });

  describe('userStatusSchema', () => {
    it('should accept valid status values', () => {
      expect(userStatusSchema.parse('PENDING_VERIFICATION')).toBe('PENDING_VERIFICATION');
      expect(userStatusSchema.parse('PENDING_APPROVAL')).toBe('PENDING_APPROVAL');
      expect(userStatusSchema.parse('ACTIVE')).toBe('ACTIVE');
      expect(userStatusSchema.parse('DISABLED')).toBe('DISABLED');
    });

    it('should reject invalid status values', () => {
      expect(() => userStatusSchema.parse('PENDING')).toThrow();
      expect(() => userStatusSchema.parse('active')).toThrow();
    });
  });

  describe('createUserSchema', () => {
    const validInput = {
      email: 'user@example.com',
      firstName: 'John',
      lastName: 'Doe',
      role: 'CLIENT_ADMIN' as const,
    };

    it('should accept valid minimal input', () => {
      const result = createUserSchema.parse(validInput);
      expect(result.email).toBe('user@example.com');
      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe('Doe');
      expect(result.role).toBe('CLIENT_ADMIN');
    });

    it('should accept valid input with clientId', () => {
      const result = createUserSchema.parse({
        ...validInput,
        clientId: 'clxxxxxxxxxxxxxxxxxxxxxxxxx',
      });
      expect(result.clientId).toBe('clxxxxxxxxxxxxxxxxxxxxxxxxx');
    });

    it('should accept null clientId', () => {
      const result = createUserSchema.parse({
        ...validInput,
        clientId: null,
      });
      expect(result.clientId).toBeNull();
    });

    it('should reject invalid email', () => {
      expect(() =>
        createUserSchema.parse({ ...validInput, email: 'invalid-email' })
      ).toThrow();
    });

    it('should reject empty first name', () => {
      expect(() =>
        createUserSchema.parse({ ...validInput, firstName: '' })
      ).toThrow();
    });

    it('should reject first name over 50 characters', () => {
      expect(() =>
        createUserSchema.parse({ ...validInput, firstName: 'a'.repeat(51) })
      ).toThrow();
    });

    it('should reject empty last name', () => {
      expect(() =>
        createUserSchema.parse({ ...validInput, lastName: '' })
      ).toThrow();
    });

    it('should reject last name over 50 characters', () => {
      expect(() =>
        createUserSchema.parse({ ...validInput, lastName: 'a'.repeat(51) })
      ).toThrow();
    });

    it('should reject invalid role', () => {
      expect(() =>
        createUserSchema.parse({ ...validInput, role: 'INVALID_ROLE' })
      ).toThrow();
    });

    it('should reject invalid clientId format', () => {
      expect(() =>
        createUserSchema.parse({ ...validInput, clientId: 'invalid-id' })
      ).toThrow();
    });
  });

  describe('updateUserSchema', () => {
    it('should accept partial updates', () => {
      const result = updateUserSchema.parse({ firstName: 'Jane' });
      expect(result.firstName).toBe('Jane');
    });

    it('should accept empty object', () => {
      const result = updateUserSchema.parse({});
      expect(result).toEqual({});
    });

    it('should validate provided fields', () => {
      expect(() =>
        updateUserSchema.parse({ email: 'invalid' })
      ).toThrow();
    });

    it('should allow updating role', () => {
      const result = updateUserSchema.parse({ role: 'PLATFORM_ADMIN' });
      expect(result.role).toBe('PLATFORM_ADMIN');
    });
  });
});
