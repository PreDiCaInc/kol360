import { describe, it, expect } from 'vitest';
import { config, getApiUrl, getAuthHeaders } from '../config';

describe('API Authentication', () => {
  describe('Protected Endpoints', () => {
    it('should reject requests without auth token', async () => {
      const response = await fetch(getApiUrl('/api/v1/campaigns'), {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Should return 401 Unauthorized
      expect(response.status).toBe(401);
    });

    it('should reject requests with invalid auth token', async () => {
      const response = await fetch(getApiUrl('/api/v1/campaigns'), {
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
      const response = await fetch(getApiUrl('/api/v1/campaigns'), {
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
      });

      // Should return 200 OK with valid token
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('items');
    });

    it.skipIf(!config.authToken)('should get current user via /users/me', async () => {
      const response = await fetch(getApiUrl('/api/v1/users/me'), {
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
      });

      // Should return 200 OK for active users
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('id');
      expect(data).toHaveProperty('email');
      expect(data).toHaveProperty('role');
      expect(data).toHaveProperty('status');
      expect(data.status).toBe('ACTIVE');
    });

    it('should reject /users/me without auth token', async () => {
      const response = await fetch(getApiUrl('/api/v1/users/me'), {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Should return 401 Unauthorized
      expect(response.status).toBe(401);
    });
  });
});
