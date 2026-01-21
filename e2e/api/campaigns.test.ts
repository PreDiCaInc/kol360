import { describe, it, expect } from 'vitest';
import { config, getApiUrl, getAuthHeaders } from '../config';

describe('API Campaigns', () => {
  describe.skipIf(!config.authToken)('GET /api/campaigns', () => {
    it('should return campaigns list', async () => {
      const response = await fetch(getApiUrl('/api/campaigns'), {
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('campaigns');
      expect(Array.isArray(data.campaigns)).toBe(true);
    });

    it('should return campaign with expected structure', async () => {
      const response = await fetch(getApiUrl('/api/campaigns'), {
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
      });

      expect(response.status).toBe(200);

      const data = await response.json();

      if (data.campaigns.length > 0) {
        const campaign = data.campaigns[0];
        expect(campaign).toHaveProperty('id');
        expect(campaign).toHaveProperty('name');
        expect(campaign).toHaveProperty('status');
      }
    });
  });

  describe.skipIf(!config.authToken)('Campaign CRUD operations', () => {
    it('should reject invalid campaign creation', async () => {
      const response = await fetch(getApiUrl('/api/campaigns'), {
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
