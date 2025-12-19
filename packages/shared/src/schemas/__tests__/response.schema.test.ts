import { describe, it, expect } from 'vitest';
import {
  responseListQuerySchema,
  updateAnswerSchema,
  excludeResponseSchema,
  responseIdParamSchema,
  paymentListQuerySchema,
} from '../response';

describe('Response Schemas', () => {
  describe('responseListQuerySchema', () => {
    it('should provide default pagination values', () => {
      const result = responseListQuerySchema.parse({});
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
    });

    it('should accept valid status values', () => {
      const statuses = ['PENDING', 'OPENED', 'IN_PROGRESS', 'COMPLETED', 'EXCLUDED'];

      statuses.forEach((status) => {
        const result = responseListQuerySchema.parse({ status });
        expect(result.status).toBe(status);
      });
    });

    it('should reject invalid status', () => {
      expect(() =>
        responseListQuerySchema.parse({ status: 'INVALID' })
      ).toThrow();
    });

    it('should coerce string numbers', () => {
      const result = responseListQuerySchema.parse({
        page: '3',
        limit: '25',
      });

      expect(result.page).toBe(3);
      expect(result.limit).toBe(25);
    });

    it('should reject limit over 100', () => {
      expect(() =>
        responseListQuerySchema.parse({ limit: 101 })
      ).toThrow();
    });

    it('should reject non-positive page', () => {
      expect(() => responseListQuerySchema.parse({ page: 0 })).toThrow();
      expect(() => responseListQuerySchema.parse({ page: -1 })).toThrow();
    });
  });

  describe('updateAnswerSchema', () => {
    it('should accept string value', () => {
      const result = updateAnswerSchema.parse({
        questionId: 'clxxxxxxxxxxxxxxxxxxxxxxxxx',
        value: 'My answer text',
      });

      expect(result.value).toBe('My answer text');
    });

    it('should accept number value', () => {
      const result = updateAnswerSchema.parse({
        questionId: 'clxxxxxxxxxxxxxxxxxxxxxxxxx',
        value: 42,
      });

      expect(result.value).toBe(42);
    });

    it('should accept array of strings', () => {
      const result = updateAnswerSchema.parse({
        questionId: 'clxxxxxxxxxxxxxxxxxxxxxxxxx',
        value: ['option1', 'option2', 'option3'],
      });

      expect(result.value).toEqual(['option1', 'option2', 'option3']);
    });

    it('should accept null value', () => {
      const result = updateAnswerSchema.parse({
        questionId: 'clxxxxxxxxxxxxxxxxxxxxxxxxx',
        value: null,
      });

      expect(result.value).toBeNull();
    });

    it('should reject invalid questionId', () => {
      expect(() =>
        updateAnswerSchema.parse({
          questionId: 'invalid-id',
          value: 'answer',
        })
      ).toThrow();
    });

    it('should reject object values', () => {
      expect(() =>
        updateAnswerSchema.parse({
          questionId: 'clxxxxxxxxxxxxxxxxxxxxxxxxx',
          value: { key: 'value' },
        })
      ).toThrow();
    });
  });

  describe('excludeResponseSchema', () => {
    it('should accept valid reason', () => {
      const result = excludeResponseSchema.parse({
        reason: 'Duplicate response from same participant',
      });

      expect(result.reason).toBe('Duplicate response from same participant');
    });

    it('should reject empty reason', () => {
      expect(() =>
        excludeResponseSchema.parse({ reason: '' })
      ).toThrow('Reason is required');
    });

    it('should reject reason over 500 characters', () => {
      expect(() =>
        excludeResponseSchema.parse({ reason: 'a'.repeat(501) })
      ).toThrow();
    });

    it('should accept reason at max length', () => {
      const result = excludeResponseSchema.parse({ reason: 'a'.repeat(500) });
      expect(result.reason.length).toBe(500);
    });
  });

  describe('responseIdParamSchema', () => {
    it('should accept valid IDs', () => {
      const result = responseIdParamSchema.parse({
        id: 'clxxxxxxxxxxxxxxxxxxxxxxxxx',
        rid: 'clyyyyyyyyyyyyyyyyyyyyyyyyy',
      });

      expect(result.id).toBe('clxxxxxxxxxxxxxxxxxxxxxxxxx');
      expect(result.rid).toBe('clyyyyyyyyyyyyyyyyyyyyyyyyy');
    });

    it('should reject invalid campaign ID', () => {
      expect(() =>
        responseIdParamSchema.parse({
          id: 'invalid',
          rid: 'clxxxxxxxxxxxxxxxxxxxxxxxxx',
        })
      ).toThrow();
    });

    it('should reject invalid response ID', () => {
      expect(() =>
        responseIdParamSchema.parse({
          id: 'clxxxxxxxxxxxxxxxxxxxxxxxxx',
          rid: 'invalid',
        })
      ).toThrow();
    });
  });

  describe('paymentListQuerySchema', () => {
    it('should provide default pagination', () => {
      const result = paymentListQuerySchema.parse({});
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('should accept all valid payment status values', () => {
      const statuses = [
        'PENDING_EXPORT',
        'EXPORTED',
        'EMAIL_SENT',
        'EMAIL_DELIVERED',
        'EMAIL_OPENED',
        'CLAIMED',
        'BOUNCED',
        'REJECTED',
        'EXPIRED',
      ];

      statuses.forEach((status) => {
        const result = paymentListQuerySchema.parse({ status });
        expect(result.status).toBe(status);
      });
    });

    it('should reject invalid payment status', () => {
      expect(() =>
        paymentListQuerySchema.parse({ status: 'PAID' })
      ).toThrow();
    });

    it('should reject limit over 100', () => {
      expect(() =>
        paymentListQuerySchema.parse({ limit: 101 })
      ).toThrow();
    });

    it('should coerce string numbers', () => {
      const result = paymentListQuerySchema.parse({
        page: '2',
        limit: '50',
      });

      expect(result.page).toBe(2);
      expect(result.limit).toBe(50);
    });
  });
});
