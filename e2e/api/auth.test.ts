import { describe, it, expect } from 'vitest';
import { config, getApiUrl, getAuthHeaders } from '../config';

describe('API Authentication', () => {
  describe('Protected Endpoints', () => {
    it('should reject requests without auth token', async () => {
      const response = await fetch(getApiUrl('/api/campaigns'), {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Should return 401 Unauthorized
      expect(response.status).toBe(401);
    });

    it('should reject requests with invalid auth token', async () => {
      const response = await fetch(getApiUrl('/api/campaigns'), {
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer invalid-token-12345',
        },
      });

      // Should return 401 Unauthorized
      expect(response.status).toBe(401);
    });
  });

  describe('Authenticated Requests', () => {
    it.skipIf(!config.authToken)('should accept valid auth token', async () => {
      const response = await fetch(getApiUrl('/api/campaigns'), {
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
      });

      // Should return 200 OK with valid token
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('campaigns');
    });

    it.skipIf(!config.authToken)('should return user info', async () => {
      const response = await fetch(getApiUrl('/api/users/me'), {
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('email');
    });
  });
});
