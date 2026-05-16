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
      // Warm-up (discarded): absorbs cold-start / first-connection cost.
      await fetch(getApiUrl('/health'));

      // Best-of-3: the shared App Runner test instance can queue an individual
      // request past a tight bound under parallel E2E load. We assert the
      // endpoint *can* respond fast (catches real multi-second regressions)
      // rather than that every contended request does.
      let best = Infinity;
      for (let i = 0; i < 3; i++) {
        const start = Date.now();
        await fetch(getApiUrl('/health'));
        best = Math.min(best, Date.now() - start);
      }

      expect(best).toBeLessThan(3000);
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
