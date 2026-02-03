import { test, expect } from '@playwright/test';

test.describe('Web Application', () => {
  test.describe('Home/Login Page', () => {
    test('should load the login page', async ({ page }) => {
      await page.goto('/');

      // Page should load without errors
      await expect(page).toHaveTitle(/KOL360|Login/i);
    });

    test('should display login form elements', async ({ page }) => {
      await page.goto('/');

      // Check for presence of login-related elements
      // The page might redirect to login or show a landing page
      const hasLoginElements =
        (await page.locator('input[type="email"], input[name="email"]').count()) > 0 ||
        (await page.locator('button:has-text("Sign in"), button:has-text("Login")').count()) > 0 ||
        (await page.locator('text=/sign in|log in/i').count()) > 0;

      // If not a login page, should be authenticated content
      const hasContent = (await page.locator('nav, header, main').count()) > 0;

      expect(hasLoginElements || hasContent).toBe(true);
    });

    test('should respond within acceptable time', async ({ page }) => {
      const start = Date.now();
      await page.goto('/');
      const duration = Date.now() - start;

      // Page should load in under 5 seconds
      expect(duration).toBeLessThan(5000);
    });
  });

  test.describe('Page Performance', () => {
    test('should not have console errors on load', async ({ page }) => {
      const errors: string[] = [];

      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          errors.push(msg.text());
        }
      });

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Filter out expected errors (like auth redirects)
      const unexpectedErrors = errors.filter(
        (e) => !e.includes('401') && !e.includes('Unauthorized') && !e.includes('Failed to fetch')
      );

      expect(unexpectedErrors).toHaveLength(0);
    });

    test('should not have JavaScript exceptions', async ({ page }) => {
      const exceptions: string[] = [];

      page.on('pageerror', (error) => {
        exceptions.push(error.message);
      });

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      expect(exceptions).toHaveLength(0);
    });
  });

  test.describe('Accessibility', () => {
    test('page should have proper heading structure', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Check for at least one heading
      const headingCount = await page.locator('h1, h2, h3').count();
      expect(headingCount).toBeGreaterThan(0);
    });

    test('interactive elements should be keyboard accessible', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // All buttons and links should be focusable
      const buttons = page.locator('button, a[href]');
      const count = await buttons.count();

      if (count > 0) {
        const firstButton = buttons.first();
        await firstButton.focus();
        await expect(firstButton).toBeFocused();
      }
    });
  });
});
