import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test.describe('Public Routes', () => {
    test('root path should be accessible', async ({ page }) => {
      const response = await page.goto('/');
      expect(response?.status()).toBeLessThan(500);
    });

    test('should handle 404 gracefully', async ({ page }) => {
      const response = await page.goto('/non-existent-page-12345');

      // Should not crash - either 404 page or redirect to login
      expect(response?.status()).toBeLessThan(500);
    });
  });

  test.describe('Protected Routes', () => {
    test('dashboard should redirect to login when unauthenticated', async ({ page }) => {
      await page.goto('/dashboard');

      // Should redirect to login or show auth error
      await page.waitForLoadState('networkidle');

      const url = page.url();
      const hasLoginRedirect =
        url.includes('login') ||
        url.includes('signin') ||
        url.includes('auth') ||
        url === new URL('/', page.url()).href;

      // Either redirected to login or on a page with login form
      const hasLoginForm =
        (await page.locator('input[type="email"], input[name="email"]').count()) > 0;

      expect(hasLoginRedirect || hasLoginForm).toBe(true);
    });

    test('campaigns should redirect to login when unauthenticated', async ({ page }) => {
      await page.goto('/campaigns');

      await page.waitForLoadState('networkidle');

      const url = page.url();
      const hasLoginRedirect =
        url.includes('login') ||
        url.includes('signin') ||
        url.includes('auth') ||
        url === new URL('/', page.url()).href;

      const hasLoginForm =
        (await page.locator('input[type="email"], input[name="email"]').count()) > 0;

      expect(hasLoginRedirect || hasLoginForm).toBe(true);
    });
  });

  test.describe('Static Assets', () => {
    test('favicon should be accessible', async ({ page }) => {
      const response = await page.goto('/favicon.ico');

      // Favicon should exist or return redirect
      expect(response?.status()).toBeLessThan(500);
    });
  });
});
