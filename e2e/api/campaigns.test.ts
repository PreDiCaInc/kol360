import { describe, it, expect } from 'vitest';
import { config, getApiUrl, getAuthHeaders } from '../config';

describe('API Campaigns', () => {
  describe.skipIf(!config.authToken)('GET /api/v1/campaigns', () => {
    it('should return campaigns list', async () => {
      const response = await fetch(getApiUrl('/api/v1/campaigns'), {
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('items');
      expect(Array.isArray(data.items)).toBe(true);
    });

    it('should return campaign with expected structure', async () => {
      const response = await fetch(getApiUrl('/api/v1/campaigns'), {
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
      });

      expect(response.status).toBe(200);

      const data = await response.json();

      if (data.items.length > 0) {
        const campaign = data.items[0];
        expect(campaign).toHaveProperty('id');
        expect(campaign).toHaveProperty('name');
        expect(campaign).toHaveProperty('status');
      }
    });
  });

  describe.skipIf(!config.authToken)('Campaign CRUD operations', () => {
    it('should reject invalid campaign creation', async () => {
      const response = await fetch(getApiUrl('/api/v1/campaigns'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          // Missing required fields
          name: '',
        }),
      });

      // Should return 400 Bad Request for invalid data
      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });
});
