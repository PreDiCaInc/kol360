import { describe, it, expect } from 'vitest';
import {
  userRoleSchema,
  userStatusSchema,
  createUserSchema,
  updateUserSchema,
} from '../user';

describe('User Schemas', () => {
  describe('userRoleSchema', () => {
    it('should accept valid roles', () => {
      expect(userRoleSchema.parse('PLATFORM_ADMIN')).toBe('PLATFORM_ADMIN');
      expect(userRoleSchema.parse('CLIENT_ADMIN')).toBe('CLIENT_ADMIN');
      expect(userRoleSchema.parse('TEAM_MEMBER')).toBe('TEAM_MEMBER');
    });

    it('should reject invalid roles', () => {
      expect(() => userRoleSchema.parse('INVALID')).toThrow();
      expect(() => userRoleSchema.parse('')).toThrow();
      expect(() => userRoleSchema.parse(null)).toThrow();
    });
  });

  describe('userStatusSchema', () => {
    it('should accept valid statuses', () => {
      expect(userStatusSchema.parse('PENDING_VERIFICATION')).toBe('PENDING_VERIFICATION');
      expect(userStatusSchema.parse('PENDING_APPROVAL')).toBe('PENDING_APPROVAL');
      expect(userStatusSchema.parse('ACTIVE')).toBe('ACTIVE');
      expect(userStatusSchema.parse('DISABLED')).toBe('DISABLED');
    });

    it('should reject invalid statuses', () => {
      expect(() => userStatusSchema.parse('INVALID')).toThrow();
      expect(() => userStatusSchema.parse('')).toThrow();
    });
  });

  describe('createUserSchema', () => {
    it('should accept valid user data', () => {
      const validUser = {
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        role: 'TEAM_MEMBER',
      };

      const result = createUserSchema.parse(validUser);
      expect(result).toEqual(validUser);
    });

    it('should accept optional clientId', () => {
      const userWithClient = {
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        role: 'CLIENT_ADMIN',
        clientId: 'clxxxxxxxxxxxxxxxxx1234',
      };

      const result = createUserSchema.parse(userWithClient);
      expect(result.clientId).toBe('clxxxxxxxxxxxxxxxxx1234');
    });

    it('should accept null clientId', () => {
      const userWithNullClient = {
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        role: 'PLATFORM_ADMIN',
        clientId: null,
      };

      const result = createUserSchema.parse(userWithNullClient);
      expect(result.clientId).toBeNull();
    });

    it('should reject invalid email', () => {
      const invalidUser = {
        email: 'invalid-email',
        firstName: 'John',
        lastName: 'Doe',
        role: 'TEAM_MEMBER',
      };

      expect(() => createUserSchema.parse(invalidUser)).toThrow();
    });

    it('should reject empty firstName', () => {
      const invalidUser = {
        email: 'test@example.com',
        firstName: '',
        lastName: 'Doe',
        role: 'TEAM_MEMBER',
      };

      expect(() => createUserSchema.parse(invalidUser)).toThrow();
    });

    it('should reject firstName over 50 characters', () => {
      const invalidUser = {
        email: 'test@example.com',
        firstName: 'A'.repeat(51),
        lastName: 'Doe',
        role: 'TEAM_MEMBER',
      };

      expect(() => createUserSchema.parse(invalidUser)).toThrow();
    });

    it('should reject empty lastName', () => {
      const invalidUser = {
        email: 'test@example.com',
        firstName: 'John',
        lastName: '',
        role: 'TEAM_MEMBER',
      };

      expect(() => createUserSchema.parse(invalidUser)).toThrow();
    });

    it('should reject lastName over 50 characters', () => {
      const invalidUser = {
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'D'.repeat(51),
        role: 'TEAM_MEMBER',
      };

      expect(() => createUserSchema.parse(invalidUser)).toThrow();
    });

    it('should reject invalid role', () => {
      const invalidUser = {
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        role: 'SUPER_ADMIN',
      };

      expect(() => createUserSchema.parse(invalidUser)).toThrow();
    });
  });

  describe('updateUserSchema', () => {
    it('should accept partial updates', () => {
      const partialUpdate = { firstName: 'Jane' };
      const result = updateUserSchema.parse(partialUpdate);
      expect(result).toEqual({ firstName: 'Jane' });
    });

    it('should accept empty object', () => {
      const result = updateUserSchema.parse({});
      expect(result).toEqual({});
    });

    it('should accept full update', () => {
      const fullUpdate = {
        email: 'new@example.com',
        firstName: 'Jane',
        lastName: 'Smith',
        role: 'CLIENT_ADMIN',
      };

      const result = updateUserSchema.parse(fullUpdate);
      expect(result).toEqual(fullUpdate);
    });

    it('should still validate fields when provided', () => {
      expect(() => updateUserSchema.parse({ email: 'invalid' })).toThrow();
      expect(() => updateUserSchema.parse({ firstName: '' })).toThrow();
    });
  });
});
