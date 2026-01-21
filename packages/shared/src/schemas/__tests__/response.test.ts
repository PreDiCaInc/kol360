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
    it('should apply default values', () => {
      const result = responseListQuerySchema.parse({});
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
    });

    it('should accept valid status', () => {
      const statuses = ['PENDING', 'OPENED', 'IN_PROGRESS', 'COMPLETED', 'EXCLUDED'];
      statuses.forEach((status) => {
        const result = responseListQuerySchema.parse({ status });
        expect(result.status).toBe(status);
      });
    });

    it('should reject invalid status', () => {
      expect(() => responseListQuerySchema.parse({ status: 'INVALID' })).toThrow();
    });

    it('should coerce string numbers', () => {
      const result = responseListQuerySchema.parse({
        page: '5',
        limit: '25',
      });
      expect(result.page).toBe(5);
      expect(result.limit).toBe(25);
    });

    it('should reject non-positive page', () => {
      expect(() => responseListQuerySchema.parse({ page: 0 })).toThrow();
      expect(() => responseListQuerySchema.parse({ page: -1 })).toThrow();
    });

    it('should reject limit over 100', () => {
      expect(() => responseListQuerySchema.parse({ limit: 101 })).toThrow();
    });
  });

  describe('updateAnswerSchema', () => {
    it('should accept string value', () => {
      const result = updateAnswerSchema.parse({
        questionId: 'clxxxxxxxxxxxxxxxxx1234',
        value: 'Answer text',
      });
      expect(result.value).toBe('Answer text');
    });

    it('should accept number value', () => {
      const result = updateAnswerSchema.parse({
        questionId: 'clxxxxxxxxxxxxxxxxx1234',
        value: 42,
      });
      expect(result.value).toBe(42);
    });

    it('should accept array of strings', () => {
      const result = updateAnswerSchema.parse({
        questionId: 'clxxxxxxxxxxxxxxxxx1234',
        value: ['Option A', 'Option B'],
      });
      expect(result.value).toEqual(['Option A', 'Option B']);
    });

    it('should accept null value', () => {
      const result = updateAnswerSchema.parse({
        questionId: 'clxxxxxxxxxxxxxxxxx1234',
        value: null,
      });
      expect(result.value).toBeNull();
    });

    it('should require valid CUID for questionId', () => {
      expect(() =>
        updateAnswerSchema.parse({
          questionId: 'invalid-id',
          value: 'test',
        })
      ).toThrow();
    });

    it('should reject missing questionId', () => {
      expect(() => updateAnswerSchema.parse({ value: 'test' })).toThrow();
    });
  });

  describe('excludeResponseSchema', () => {
    it('should accept valid reason', () => {
      const result = excludeResponseSchema.parse({
        reason: 'Invalid data submission',
      });
      expect(result.reason).toBe('Invalid data submission');
    });

    it('should reject empty reason', () => {
      expect(() => excludeResponseSchema.parse({ reason: '' })).toThrow('Reason is required');
    });

    it('should reject reason over 500 characters', () => {
      expect(() =>
        excludeResponseSchema.parse({
          reason: 'A'.repeat(501),
        })
      ).toThrow();
    });

    it('should accept reason exactly 500 characters', () => {
      const reason = 'A'.repeat(500);
      const result = excludeResponseSchema.parse({ reason });
      expect(result.reason).toBe(reason);
    });
  });

  describe('responseIdParamSchema', () => {
    it('should accept valid CUID params', () => {
      const result = responseIdParamSchema.parse({
        id: 'clxxxxxxxxxxxxxxxxx1234',
        rid: 'clxxxxxxxxxxxxxxxxx5678',
      });
      expect(result.id).toBe('clxxxxxxxxxxxxxxxxx1234');
      expect(result.rid).toBe('clxxxxxxxxxxxxxxxxx5678');
    });

    it('should reject invalid id format', () => {
      expect(() =>
        responseIdParamSchema.parse({
          id: 'invalid',
          rid: 'clxxxxxxxxxxxxxxxxx5678',
        })
      ).toThrow();
    });

    it('should reject invalid rid format', () => {
      expect(() =>
        responseIdParamSchema.parse({
          id: 'clxxxxxxxxxxxxxxxxx1234',
          rid: 'invalid',
        })
      ).toThrow();
    });

    it('should require both id and rid', () => {
      expect(() =>
        responseIdParamSchema.parse({
          id: 'clxxxxxxxxxxxxxxxxx1234',
        })
      ).toThrow();
    });
  });

  describe('paymentListQuerySchema', () => {
    it('should apply default values', () => {
      const result = paymentListQuerySchema.parse({});
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('should accept valid payment statuses', () => {
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
      expect(() => paymentListQuerySchema.parse({ status: 'PAID' })).toThrow();
    });

    it('should coerce string numbers', () => {
      const result = paymentListQuerySchema.parse({
        page: '3',
        limit: '50',
      });
      expect(result.page).toBe(3);
      expect(result.limit).toBe(50);
    });

    it('should reject limit over 100', () => {
      expect(() => paymentListQuerySchema.parse({ limit: 101 })).toThrow();
    });

    it('should reject non-positive page', () => {
      expect(() => paymentListQuerySchema.parse({ page: 0 })).toThrow();
    });
  });
});
