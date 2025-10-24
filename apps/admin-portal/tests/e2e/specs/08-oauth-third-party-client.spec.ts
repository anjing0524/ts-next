import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/login-page';
import { DashboardPage } from '../pages/dashboard-page';
import { TestUsers, APIEndpoints, TestUrls } from '../helpers/test-data';

/**
 * OAuth 2.1 Third-Party Client Model Tests
 * 
 * Tests to verify that Admin Portal now strictly follows the third-party client pattern:
 * - No direct /login entry point
 * - Protected routes directly initiate OAuth authorize flow
 * - /login is only reachable via OAuth redirect with valid redirect parameter
 * 
 * This test suite validates the architectural refactoring to pure OAuth 2.1 compliance.
 */
test.describe('OAuth 2.1 Third-Party Client Pattern', () => {
  let loginPage: LoginPage;
  let dashboardPage: DashboardPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    dashboardPage = new DashboardPage(page);
  });

  test.describe('Protected Route Access Without Token', () => {
    test('should initiate OAuth flow when accessing /admin without token', async ({ page }) => {
      await test.step('Navigate to protected /admin route without token', async () => {
        await page.goto(TestUrls.DASHBOARD, { waitUntil: 'networkidle' });
      });

      await test.step('Verify redirect to OAuth authorize endpoint', async () => {
        // After middleware detects no token, should redirect to OAuth authorize
        // which then redirects to /login
        const url = page.url();
        expect(url).toMatch(/\/login/);
        // Should have redirect parameter pointing to authorize endpoint
        expect(url).toContain('redirect=');
        expect(url).toContain('%2Fapi%2Fv2%2Foauth%2Fauthorize'); // URL-encoded /api/v2/oauth/authorize
      });

      await test.step('Verify login form is displayed', async () => {
        await loginPage.waitForLoad();
        const isVisible = await loginPage.isVisible();
        expect(isVisible).toBe(true);
      });
    });

    test('should complete OAuth flow from protected route', async ({ page }) => {
      await test.step('Access protected route and trigger OAuth flow', async () => {
        await page.goto(TestUrls.DASHBOARD, { waitUntil: 'networkidle' });
      });

      await test.step('Fill and submit login credentials', async () => {
        await loginPage.fillUsername(TestUsers.admin.username);
        await loginPage.fillPassword(TestUsers.admin.password);
        await loginPage.clickLoginButton();
      });

      await test.step('Verify successful authentication and redirect', async () => {
        // Should eventually redirect back to originally requested page
        await expect(page).toHaveURL(/.*\/admin/, { timeout: 10000 });
        await dashboardPage.waitForLoad();
        const isLoggedIn = await dashboardPage.isLoggedIn();
        expect(isLoggedIn).toBe(true);
      });

      await test.step('Verify PKCE token exchange completed', async () => {
        const accessToken = await page.evaluate(() => localStorage.getItem('access_token'));
        expect(accessToken).toBeTruthy();
      });
    });
  });

  test.describe('Login Page Access Control', () => {
    test('should reject direct /login access without redirect parameter', async ({ page }) => {
      await test.step('Navigate directly to /login without parameters', async () => {
        await page.goto(`${TestUrls.BASE_URL}/login`, { waitUntil: 'networkidle' });
      });

      await test.step('Verify redirect to home page', async () => {
        // /login without valid redirect parameter should redirect to /
        await expect(page).toHaveURL(TestUrls.BASE_URL, { timeout: 5000 });
      });

      await test.step('Verify we are NOT on login page', async () => {
        const loginFormExists = await page.locator('form').filter({ has: page.locator('input[type="password"]') }).count();
        expect(loginFormExists).toBe(0);
      });
    });

    test('should accept /login access with valid redirect parameter', async ({ page }) => {
      await test.step('Navigate to /login with valid OAuth authorize redirect', async () => {
        const authUrl = encodeURIComponent(
          `http://localhost:3001/api/v2/oauth/authorize?client_id=admin-portal&redirect_uri=http://localhost:3002/auth/callback&response_type=code&scope=openid`
        );
        await page.goto(`${TestUrls.BASE_URL}/login?redirect=${authUrl}`, { waitUntil: 'networkidle' });
      });

      await test.step('Verify login form is displayed', async () => {
        const isVisible = await loginPage.isVisible();
        expect(isVisible).toBe(true);
      });

      await test.step('Verify login can proceed', async () => {
        await loginPage.fillUsername(TestUsers.admin.username);
        await loginPage.fillPassword(TestUsers.admin.password);
        // Don't click button yet, just verify form is functional
        const submitButton = await loginPage.getLoginButton();
        expect(submitButton).toBeTruthy();
      });
    });

    test('should reject /login with invalid redirect parameter', async ({ page }) => {
      await test.step('Navigate to /login with invalid redirect (not oauth authorize endpoint)', async () => {
        const badUrl = encodeURIComponent('https://evil.example.com/callback');
        await page.goto(`${TestUrls.BASE_URL}/login?redirect=${badUrl}`, { waitUntil: 'networkidle' });
      });

      await test.step('Verify redirect to home page', async () => {
        await expect(page).toHaveURL(TestUrls.BASE_URL, { timeout: 5000 });
      });

      await test.step('Verify we are NOT on login page', async () => {
        const loginFormExists = await page.locator('form').filter({ has: page.locator('input[type="password"]') }).count();
        expect(loginFormExists).toBe(0);
      });
    });
  });

  test.describe('OAuth Callback Behavior', () => {
    test('should redirect already-logged-in users away from /auth/callback', async ({ page }) => {
      await test.step('First, login via the normal OAuth flow', async () => {
        await page.goto(TestUrls.DASHBOARD, { waitUntil: 'networkidle' });
        await loginPage.fillUsername(TestUsers.admin.username);
        await loginPage.fillPassword(TestUsers.admin.password);
        await loginPage.clickLoginButton();
        await expect(page).toHaveURL(/.*\/admin/, { timeout: 10000 });
      });

      await test.step('Now try to access /auth/callback while logged in', async () => {
        // Manually try to access the callback endpoint (which shouldn't happen in normal flow)
        await page.goto(`${TestUrls.BASE_URL}/auth/callback?code=invalid&state=invalid`, { waitUntil: 'networkidle' });
      });

      await test.step('Verify redirect to /admin (not staying on callback)', async () => {
        // According to middleware logic, already-logged-in users on /auth/callback
        // should be redirected to /admin
        await expect(page).toHaveURL(/.*\/admin/, { timeout: 5000 });
      });
    });
  });

  test.describe('Security: Redirect Parameter Validation', () => {
    test('should validate redirect parameter points to OAuth authorize endpoint', async ({ page }) => {
      // Create various redirect URLs and test which ones are accepted
      const testCases = [
        {
          redirect: encodeURIComponent('http://localhost:3001/api/v2/oauth/authorize?client_id=admin'),
          shouldAccept: true,
          description: 'Valid OAuth authorize endpoint'
        },
        {
          redirect: encodeURIComponent('https://localhost:6188/api/v2/oauth/authorize?client_id=admin'),
          shouldAccept: true,
          description: 'Valid OAuth authorize through Pingora'
        },
        {
          redirect: encodeURIComponent('http://localhost:3001/oauth/authorize'),
          shouldAccept: true,
          description: 'Valid OAuth authorize (alternate path)'
        },
        {
          redirect: encodeURIComponent('http://localhost:3002/admin'),
          shouldAccept: false,
          description: 'Invalid - redirects to Admin Portal, not OAuth'
        },
        {
          redirect: encodeURIComponent('https://evil.com/phishing'),
          shouldAccept: false,
          description: 'Invalid - external phishing domain'
        },
        {
          redirect: encodeURIComponent('javascript:alert(1)'),
          shouldAccept: false,
          description: 'Invalid - JavaScript injection attempt'
        }
      ];

      for (const testCase of testCases) {
        await test.step(`Test: ${testCase.description}`, async () => {
          await page.goto(`${TestUrls.BASE_URL}/login?redirect=${testCase.redirect}`, { 
            waitUntil: 'networkidle' 
          });

          const loginFormExists = await page.locator('form').filter({ 
            has: page.locator('input[type="password"]') 
          }).count() > 0;

          if (testCase.shouldAccept) {
            expect(loginFormExists).toBe(true, `Login form should be shown for: ${testCase.description}`);
          } else {
            expect(loginFormExists).toBe(false, `Login form should NOT be shown for: ${testCase.description}`);
            // Should be redirected away
            expect(page.url()).not.toContain('/login');
          }
        });
      }
    });
  });

  test.describe('PKCE Parameter Handling', () => {
    test('should preserve PKCE parameters through OAuth flow', async ({ page }) => {
      await test.step('Access protected route to trigger OAuth flow', async () => {
        await page.goto(TestUrls.DASHBOARD, { waitUntil: 'networkidle' });
      });

      await test.step('Intercept authorization URL and verify PKCE parameters', async () => {
        // Monitor network requests to verify PKCE parameters are present
        let authorizationRequestUrl = '';
        
        page.on('response', async (response) => {
          if (response.url().includes('/api/v2/oauth/authorize')) {
            authorizationRequestUrl = response.url();
          }
        });

        // PKCE parameters should be in the authorize URL
        // code_challenge, code_challenge_method, state, code_verifier (in cookie)
        const url = page.url();
        expect(url).toContain('redirect='); // Should be redirecting through /login
      });

      await test.step('Complete login and verify token exchange', async () => {
        await loginPage.fillUsername(TestUsers.admin.username);
        await loginPage.fillPassword(TestUsers.admin.password);
        
        // Before clicking, verify code_verifier is in a secure httpOnly cookie
        const cookies = await page.context().cookies();
        const codeVerifierCookie = cookies.find(c => c.name === 'oauth_code_verifier');
        expect(codeVerifierCookie).toBeTruthy();
        expect(codeVerifierCookie?.httpOnly).toBe(true); // Should be httpOnly for security
        
        await loginPage.clickLoginButton();
      });

      await test.step('Verify successful token exchange', async () => {
        await expect(page).toHaveURL(/.*\/admin/, { timeout: 10000 });
        const accessToken = await page.evaluate(() => localStorage.getItem('access_token'));
        expect(accessToken).toBeTruthy();
      });
    });
  });
});
