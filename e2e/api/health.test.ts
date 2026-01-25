import { describe, it, expect } from 'vitest';
import { config, getApiUrl } from '../config';

describe('API Health Checks', () => {
  describe('GET /health', () => {
    it('should return healthy status', async () => {
      const response = await fetch(getApiUrl('/health'));

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('status', 'ok');
    });

    it('should respond within acceptable time', async () => {
      const start = Date.now();
      await fetch(getApiUrl('/health'));
      const duration = Date.now() - start;

      // Health check should respond in under 4 seconds (allowing for network latency)
      expect(duration).toBeLessThan(4000);
    });
  });

  describe('API Root', () => {
    it('should require authentication at root path', async () => {
      const response = await fetch(getApiUrl('/'));

      // Root path requires authentication
      expect(response.status).toBe(401);
    });
  });

  describe('Environment', () => {
    it('should be configured correctly', () => {
      console.log(`Testing against API: ${config.apiUrl}`);
      expect(config.apiUrl).toBeTruthy();
      expect(config.apiUrl).toMatch(/^https?:\/\//);
    });
  });
});
