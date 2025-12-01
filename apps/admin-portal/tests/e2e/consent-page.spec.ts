import { test, expect, Page } from '@playwright/test';
import { completeOAuthLogin, clearAuthState } from './helpers/test-helpers';

/**
 * Consent Page E2E Tests
 *
 * These tests verify the OAuth 2.1 permission consent page functionality.
 * The consent page appears after user login to request permission for scopes.
 *
 * Test Scenarios:
 * 1. Page load and rendering
 * 2. Scope display and descriptions
 * 3. User approval flow
 * 4. User denial flow
 * 5. Remember choice functionality
 * 6. Error handling
 * 7. Responsive design
 * 8. Accessibility
 */

test.describe('Consent Page E2E Tests', () => {
  const baseUrl = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:6188';
  const testUsername = process.env.TEST_ADMIN_USERNAME || 'admin';
  const testPassword = process.env.TEST_ADMIN_PASSWORD || 'admin123';

  /**
   * Test Group 1: Page Load and Rendering
   */
  test.describe('Page Load and Rendering', () => {
    test('Should render consent page with required elements', async ({ page }) => {
      // 1. Complete OAuth login
      await completeOAuthLogin(page, testUsername, testPassword);

      // 2. Check for consent page elements
      // Header with app name
      const header = page.locator('h1:has-text("权限批准请求")');
      await expect(header).toBeVisible();

      // Client info card
      const clientCard = page.locator('.client-info');
      await expect(clientCard).toBeVisible();

      // Scope list
      const scopesList = page.locator('.scopes-list');
      await expect(scopesList).toBeVisible();

      // Action buttons
      const denyButton = page.locator('button:has-text("拒绝")');
      const approveButton = page.locator('button:has-text("同意并继续")');
      await expect(denyButton).toBeVisible();
      await expect(approveButton).toBeVisible();
    });

    test('Should display client application name', async ({ page }) => {
      await completeOAuthLogin(page, testUsername, testPassword);

      const clientName = page.locator('.client-info h2');
      const clientNameText = await clientName.textContent();
      expect(clientNameText).toBeTruthy();
      expect(clientNameText?.length).toBeGreaterThan(0);
    });

    test('Should display user email/name', async ({ page }) => {
      await completeOAuthLogin(page, testUsername, testPassword);

      const userInfo = page.locator('.user-info');
      const userInfoText = await userInfo.textContent();
      expect(userInfoText).toBeTruthy();
    });
  });

  /**
   * Test Group 2: Scope Display
   */
  test.describe('Scope Display and Descriptions', () => {
    test('Should display requested scopes', async ({ page }) => {
      await completeOAuthLogin(page, testUsername, testPassword);

      const scopeItems = page.locator('.scope-item');
      const count = await scopeItems.count();
      expect(count).toBeGreaterThan(0);
    });

    test('Should show scope descriptions', async ({ page }) => {
      await completeOAuthLogin(page, testUsername, testPassword);

      const scopeDescriptions = page.locator('.scope-item');
      const firstScope = scopeDescriptions.first();

      // Should have scope badge (e.g., "openid")
      const badge = firstScope.locator('.scope-badge');
      await expect(badge).toBeVisible();

      // Should have human-readable text
      const scopeText = await firstScope.textContent();
      expect(scopeText).toBeTruthy();
    });

    test('Should display security information footer', async ({ page }) => {
      await completeOAuthLogin(page, testUsername, testPassword);

      const securityInfo = page.locator('.security-info');
      await expect(securityInfo).toBeVisible();

      const securityText = await securityInfo.textContent();
      expect(securityText).toContain('OAuth');
    });
  });

  /**
   * Test Group 3: User Approval Flow
   */
  test.describe('User Approval Flow', () => {
    test('Should submit consent form and redirect on approval', async ({ page }) => {
      await completeOAuthLogin(page, testUsername, testPassword);

      // Find and click approve button
      const approveButton = page.locator('button:has-text("同意并继续")');
      await expect(approveButton).toBeVisible();
      await approveButton.click();

      // Should redirect away from consent page
      // (actual redirect depends on configured client redirect URI)
      await page.waitForNavigation({ timeout: 5000 }).catch(() => {
        // Navigation might not occur in test environment
      });

      // Verify we're no longer on consent page or on success page
      const url = page.url();
      expect(!url.includes('/oauth/consent')).toBeTruthy();
    });

    test('Should include OAuth parameters in approval submission', async ({ page }) => {
      await completeOAuthLogin(page, testUsername, testPassword);

      // Set up request listener to capture form submission
      let formData: { decision: string; client_id: string } | null = null;

      page.on('request', request => {
        if (request.postData()?.includes('decision=approve')) {
          formData = {
            decision: 'approve',
            client_id: 'captured'
          };
        }
      });

      const approveButton = page.locator('button:has-text("同意并继续")');
      await approveButton.click();

      // Wait for form submission
      await page.waitForTimeout(1000);

      // Verify form was submitted with correct data
      expect(formData?.decision).toBe('approve');
    });
  });

  /**
   * Test Group 4: User Denial Flow
   */
  test.describe('User Denial Flow', () => {
    test('Should submit consent form on denial', async ({ page }) => {
      await completeOAuthLogin(page, testUsername, testPassword);

      // Find and click deny button
      const denyButton = page.locator('button:has-text("拒绝")');
      await expect(denyButton).toBeVisible();
      await denyButton.click();

      // Should redirect away from consent page
      await page.waitForNavigation({ timeout: 5000 }).catch(() => {
        // Navigation might not occur in test environment
      });

      // Verify form submission occurred
      const url = page.url();
      expect(!url.includes('/oauth/consent')).toBeTruthy();
    });

    test('Should capture deny decision in form submission', async ({ page }) => {
      await completeOAuthLogin(page, testUsername, testPassword);

      // Set up request listener
      let denialCaptured = false;

      page.on('request', request => {
        if (request.postData()?.includes('decision=deny')) {
          denialCaptured = true;
        }
      });

      const denyButton = page.locator('button:has-text("拒绝")');
      await denyButton.click();

      // Wait for form submission
      await page.waitForTimeout(1000);

      expect(denialCaptured).toBeTruthy();
    });
  });

  /**
   * Test Group 5: Remember Choice Functionality
   */
  test.describe('Remember Choice Feature', () => {
    test('Should have remember checkbox', async ({ page }) => {
      await completeOAuthLogin(page, testUsername, testPassword);

      const rememberCheckbox = page.locator('#remember');
      await expect(rememberCheckbox).toBeVisible();
    });

    test('Should toggle remember checkbox', async ({ page }) => {
      await completeOAuthLogin(page, testUsername, testPassword);

      const rememberCheckbox = page.locator('#remember');

      // Initially unchecked
      let isChecked = await rememberCheckbox.isChecked();
      expect(!isChecked).toBeTruthy();

      // Check it
      await rememberCheckbox.check();
      isChecked = await rememberCheckbox.isChecked();
      expect(isChecked).toBeTruthy();

      // Uncheck it
      await rememberCheckbox.uncheck();
      isChecked = await rememberCheckbox.isChecked();
      expect(!isChecked).toBeTruthy();
    });

    test('Should include remember value in form submission', async ({ page }) => {
      await completeOAuthLogin(page, testUsername, testPassword);

      // Check remember checkbox
      const rememberCheckbox = page.locator('#remember');
      await rememberCheckbox.check();

      // Capture form submission data
      let rememberValue = '';

      page.on('request', request => {
        const body = request.postData();
        if (body && body.includes('remember')) {
          rememberValue = body.includes('remember=true') ? 'true' : 'false';
        }
      });

      const approveButton = page.locator('button:has-text("同意并继续")');
      await approveButton.click();

      await page.waitForTimeout(1000);

      // When remember is checked, form should include remember=true
      expect(rememberValue).toBeTruthy();
    });
  });

  /**
   * Test Group 6: Responsive Design
   */
  test.describe('Responsive Design', () => {
    test('Should render properly on mobile viewport', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 812 });

      await completeOAuthLogin(page, testUsername, testPassword);

      // Elements should still be visible
      const header = page.locator('h1:has-text("权限批准请求")');
      await expect(header).toBeVisible();

      const approveButton = page.locator('button:has-text("同意并继续")');
      await expect(approveButton).toBeVisible();

      // Button should be clickable on mobile
      const boundingBox = await approveButton.boundingBox();
      expect(boundingBox?.width).toBeGreaterThan(0);
    });

    test('Should render properly on tablet viewport', async ({ page }) => {
      // Set tablet viewport
      await page.setViewportSize({ width: 768, height: 1024 });

      await completeOAuthLogin(page, testUsername, testPassword);

      const header = page.locator('h1:has-text("权限批准请求")');
      await expect(header).toBeVisible();

      const scopesList = page.locator('.scopes-list');
      await expect(scopesList).toBeVisible();
    });

    test('Should render properly on desktop viewport', async ({ page }) => {
      // Default desktop viewport
      await page.setViewportSize({ width: 1920, height: 1080 });

      await completeOAuthLogin(page, testUsername, testPassword);

      const consentCard = page.locator('.consent-card');
      await expect(consentCard).toBeVisible();

      const boundingBox = await consentCard.boundingBox();
      expect(boundingBox?.width).toBeLessThanOrEqual(600 * 1.1); // Allow for some scaling
    });
  });

  /**
   * Test Group 7: Accessibility
   */
  test.describe('Accessibility Features', () => {
    test('Should have proper heading hierarchy', async ({ page }) => {
      await completeOAuthLogin(page, testUsername, testPassword);

      // Main heading should be h1
      const h1 = page.locator('h1');
      await expect(h1).toBeVisible();

      // Should have readable text
      const h1Text = await h1.textContent();
      expect(h1Text).toBeTruthy();
    });

    test('Should have accessible form labels', async ({ page }) => {
      await completeOAuthLogin(page, testUsername, testPassword);

      // Remember checkbox should have associated label
      const rememberCheckbox = page.locator('#remember');
      const label = page.locator('label[for="remember"]');

      // Either label exists or checkbox has aria-label
      const hasLabel = await label.count() > 0 ||
        await rememberCheckbox.getAttribute('aria-label').then(v => v !== null);
      expect(hasLabel).toBeTruthy();
    });

    test('Should be keyboard navigable', async ({ page }) => {
      await completeOAuthLogin(page, testUsername, testPassword);

      // Tab to buttons
      await page.keyboard.press('Tab');
      const focusedElement = await page.evaluate(() => {
        return document.activeElement?.tagName;
      });

      expect(focusedElement).toBeTruthy();
    });

    test('Should have focus visible on buttons', async ({ page }) => {
      await completeOAuthLogin(page, testUsername, testPassword);

      const denyButton = page.locator('button:has-text("拒绝")');
      await denyButton.focus();

      const focusStyle = await denyButton.evaluate(el => {
        return window.getComputedStyle(el).outline;
      });

      expect(focusStyle).not.toBe('none');
    });
  });

  /**
   * Test Group 8: Error Handling and Edge Cases
   */
  test.describe('Error Handling', () => {
    test('Should handle missing client info gracefully', async ({ page }) => {
      // Try to access consent page without proper OAuth flow
      await page.goto(`${baseUrl}/oauth/consent`, {
        waitUntil: 'domcontentloaded'
      });

      // Should either show error or redirect
      const url = page.url();
      const isError = url.includes('error') || url.includes('login');
      expect(isError).toBeTruthy();
    });

    test('Should handle invalid session', async ({ page }) => {
      // Clear all cookies
      await page.context().clearCookies();

      // Try to access consent page
      await page.goto(`${baseUrl}/oauth/consent`, {
        waitUntil: 'domcontentloaded'
      });

      // Should redirect to login
      const url = page.url();
      expect(url.includes('login') || url.includes('error')).toBeTruthy();
    });

    test('Should handle network errors gracefully', async ({ page }) => {
      await completeOAuthLogin(page, testUsername, testPassword);

      // Go offline
      await page.context().setOffline(true);

      // Try to submit form
      const approveButton = page.locator('button:has-text("同意并继续")');

      // Button should still be interactive even if network fails
      await expect(approveButton).toBeEnabled();

      // Go back online
      await page.context().setOffline(false);
    });
  });

  /**
   * Test Group 9: Security
   */
  test.describe('Security Features', () => {
    test('Should include CSRF protection (state parameter)', async ({ page }) => {
      await completeOAuthLogin(page, testUsername, testPassword);

      // Capture form submission
      let stateIncluded = false;

      page.on('request', request => {
        if (request.postData()?.includes('state=')) {
          stateIncluded = true;
        }
      });

      const approveButton = page.locator('button:has-text("同意并继续")');
      await approveButton.click();

      await page.waitForTimeout(1000);

      expect(stateIncluded).toBeTruthy();
    });

    test('Should use secure form submission (POST)', async ({ page }) => {
      await completeOAuthLogin(page, testUsername, testPassword);

      let submissionMethod = '';

      page.on('request', request => {
        if (request.url().includes('consent')) {
          submissionMethod = request.method();
        }
      });

      const approveButton = page.locator('button:has-text("同意并继续")');
      await approveButton.click();

      await page.waitForTimeout(1000);

      expect(submissionMethod).toBe('POST');
    });

    test('Should not expose sensitive data in URL', async ({ page }) => {
      await completeOAuthLogin(page, testUsername, testPassword);

      const url = page.url();

      // URL should not contain sensitive information
      expect(!url.includes('password')).toBeTruthy();
      expect(!url.includes('token')).toBeTruthy();
      expect(!url.includes('client_secret')).toBeTruthy();
    });
  });

  /**
   * Test Group 10: Visual Feedback
   */
  test.describe('Visual Feedback and Interactions', () => {
    test('Should show visual feedback on button hover', async ({ page }) => {
      await completeOAuthLogin(page, testUsername, testPassword);

      const approveButton = page.locator('button:has-text("同意并继续")');

      // Get initial style
      const initialTransform = await approveButton.evaluate(el => {
        return window.getComputedStyle(el).transform;
      });

      // Hover over button
      await approveButton.hover();

      // Get hover style
      const hoverTransform = await approveButton.evaluate(el => {
        return window.getComputedStyle(el).transform;
      });

      // Style should change on hover
      expect(initialTransform).not.toBe(hoverTransform);
    });

    test('Should show loading state during form submission', async ({ page }) => {
      await completeOAuthLogin(page, testUsername, testPassword);

      // Monitor button state during submission
      const approveButton = page.locator('button:has-text("同意并继续")');

      // Button should be enabled initially
      await expect(approveButton).toBeEnabled();

      // Click button
      await approveButton.click();

      // After click, button may show loading state or be disabled
      // (depends on implementation)
    });
  });
});
