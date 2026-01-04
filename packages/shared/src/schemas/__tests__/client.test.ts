import { describe, it, expect } from 'vitest';
import {
  clientTypeSchema,
  createClientSchema,
  updateClientSchema,
} from '../client';

describe('Client Schemas', () => {
  describe('clientTypeSchema', () => {
    it('should accept valid client types', () => {
      expect(clientTypeSchema.parse('FULL')).toBe('FULL');
      expect(clientTypeSchema.parse('LITE')).toBe('LITE');
    });

    it('should reject invalid client types', () => {
      expect(() => clientTypeSchema.parse('PREMIUM')).toThrow();
      expect(() => clientTypeSchema.parse('')).toThrow();
      expect(() => clientTypeSchema.parse('full')).toThrow(); // Case sensitive
    });
  });

  describe('createClientSchema', () => {
    it('should accept valid client data with minimal fields', () => {
      const result = createClientSchema.parse({ name: 'Test Client' });
      expect(result.name).toBe('Test Client');
      expect(result.type).toBe('FULL'); // default
      expect(result.primaryColor).toBe('#0066CC'); // default
    });

    it('should accept all optional fields', () => {
      const clientWithOptionals = {
        name: 'Test Client',
        type: 'LITE',
        isLite: true,
        logoUrl: 'https://example.com/logo.png',
        primaryColor: '#FF5733',
      };

      const result = createClientSchema.parse(clientWithOptionals);
      expect(result.type).toBe('LITE');
      expect(result.isLite).toBe(true);
      expect(result.logoUrl).toBe('https://example.com/logo.png');
      expect(result.primaryColor).toBe('#FF5733');
    });

    it('should accept null logoUrl', () => {
      const result = createClientSchema.parse({
        name: 'Test Client',
        logoUrl: null,
      });
      expect(result.logoUrl).toBeNull();
    });

    it('should reject name less than 2 characters', () => {
      expect(() => createClientSchema.parse({ name: 'A' })).toThrow();
      expect(() => createClientSchema.parse({ name: '' })).toThrow();
    });

    it('should reject name over 100 characters', () => {
      expect(() =>
        createClientSchema.parse({ name: 'A'.repeat(101) })
      ).toThrow();
    });

    it('should accept name exactly 2 characters', () => {
      const result = createClientSchema.parse({ name: 'AB' });
      expect(result.name).toBe('AB');
    });

    it('should accept name exactly 100 characters', () => {
      const name = 'A'.repeat(100);
      const result = createClientSchema.parse({ name });
      expect(result.name).toBe(name);
    });

    it('should reject invalid logoUrl', () => {
      expect(() =>
        createClientSchema.parse({
          name: 'Test Client',
          logoUrl: 'not-a-url',
        })
      ).toThrow();
    });

    it('should reject invalid primaryColor format', () => {
      expect(() =>
        createClientSchema.parse({
          name: 'Test Client',
          primaryColor: 'red',
        })
      ).toThrow();
      expect(() =>
        createClientSchema.parse({
          name: 'Test Client',
          primaryColor: '#FFF', // Only 3 chars
        })
      ).toThrow();
      expect(() =>
        createClientSchema.parse({
          name: 'Test Client',
          primaryColor: '#GGGGGG', // Invalid hex
        })
      ).toThrow();
    });

    it('should accept valid hex colors', () => {
      const colors = ['#000000', '#FFFFFF', '#ff5733', '#ABC123'];
      colors.forEach((color) => {
        const result = createClientSchema.parse({
          name: 'Test',
          primaryColor: color,
        });
        expect(result.primaryColor).toBe(color);
      });
    });
  });

  describe('updateClientSchema', () => {
    it('should accept partial updates', () => {
      const result = updateClientSchema.parse({ name: 'Updated Name' });
      expect(result).toEqual({ name: 'Updated Name' });
    });

    it('should accept empty object', () => {
      const result = updateClientSchema.parse({});
      expect(result).toEqual({});
    });

    it('should accept full update', () => {
      const fullUpdate = {
        name: 'Updated Client',
        type: 'LITE',
        isLite: true,
        logoUrl: 'https://new.example.com/logo.png',
        primaryColor: '#123456',
      };

      const result = updateClientSchema.parse(fullUpdate);
      expect(result).toEqual(fullUpdate);
    });

    it('should still validate fields when provided', () => {
      expect(() => updateClientSchema.parse({ name: 'A' })).toThrow();
      expect(() =>
        updateClientSchema.parse({ primaryColor: 'invalid' })
      ).toThrow();
      expect(() =>
        updateClientSchema.parse({ logoUrl: 'not-a-url' })
      ).toThrow();
    });

    it('should not require defaults for partial updates', () => {
      // Type and primaryColor have defaults in create, but partial update shouldn't require them
      const result = updateClientSchema.parse({ name: 'Just name' });
      expect(result.type).toBeUndefined();
      expect(result.primaryColor).toBeUndefined();
    });
  });
});
