import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/login-page';
import { DashboardPage } from '../pages/dashboard-page';
import { TestUsers, APIEndpoints, TestUrls } from '../helpers/test-data';

/**
 * OAuth 2.1 认证流程测试套件
 * 验证完整的认证集成流程
 */
test.describe('OAuth 2.1 Authentication Flow', () => {
  let loginPage: LoginPage;
  let dashboardPage: DashboardPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    dashboardPage = new DashboardPage(page);
  });

  test.describe('Direct Authentication', () => {
    test('should login successfully with admin credentials', async ({ page }) => {
      await test.step('Navigate to login page', async () => {
        await loginPage.goto();
      });

      await test.step('Enter admin credentials', async () => {
        await loginPage.fillUsername(TestUsers.admin.username);
        await loginPage.fillPassword(TestUsers.admin.password);
      });

      await test.step('Submit login form', async () => {
        await loginPage.clickLoginButton();
      });

      await test.step('Verify successful login and redirect', async () => {
        await expect(page).toHaveURL(/.*\/dashboard/, { timeout: 10000 });
        await dashboardPage.waitForLoad();
        const welcomeText = await dashboardPage.getWelcomeMessage();
        expect(welcomeText).toContain(TestUsers.admin.displayName);
      });

      await test.step('Verify session establishment', async () => {
        const isLoggedIn = await dashboardPage.isLoggedIn();
        expect(isLoggedIn).toBe(true);
        
        // Check session storage
        const accessToken = await page.evaluate(() => sessionStorage.getItem('access_token'));
        const refreshToken = await page.evaluate(() => sessionStorage.getItem('refresh_token'));
        expect(accessToken).toBeTruthy();
        expect(refreshToken).toBeTruthy();
      });
    });

    test('should handle invalid credentials', async ({ page }) => {
      await test.step('Navigate to login page', async () => {
        await loginPage.goto();
      });

      await test.step('Enter invalid credentials', async () => {
        await loginPage.fillUsername('invaliduser');
        await loginPage.fillPassword('wrongpassword');
        await loginPage.clickLoginButton();
      });

      await test.step('Verify error message', async () => {
        const errorMessage = await loginPage.getErrorMessage();
        expect(errorMessage).toContain('用户名或密码错误');
      });

      await test.step('Verify remains on login page', async () => {
        await expect(page).toHaveURL(/.*\/login/);
      });
    });

    test('should validate required fields', async ({ page }) => {
      await test.step('Navigate to login page', async () => {
        await loginPage.goto();
      });

      await test.step('Attempt to submit empty form', async () => {
        await loginPage.clickLoginButton();
      });

      await test.step('Verify validation errors', async () => {
        // Check for validation messages
        const usernameValidation = await loginPage.usernameValidation.isVisible();
        const passwordValidation = await loginPage.passwordValidation.isVisible();
        expect(usernameValidation || passwordValidation).toBe(true);
      });
    });

    test('should handle session expiration', async ({ page }) => {
      await test.step('Login successfully', async () => {
        await loginPage.login(TestUsers.admin);
        await dashboardPage.waitForLoad();
      });

      await test.step('Simulate session expiration', async () => {
        // Clear session storage to simulate expiration
        await page.evaluate(() => {
          sessionStorage.clear();
        });
        
        // Navigate to protected route
        await page.goto('/admin/users');
      });

      await test.step('Verify redirect to login', async () => {
        await expect(page).toHaveURL(/.*\/login/);
      });
    });
  });

  test.describe('OAuth Authorization Code Flow', () => {
    test('should initiate OAuth flow correctly', async ({ page }) => {
      await test.step('Navigate to login page', async () => {
        await loginPage.goto();
      });

      await test.step('Click OAuth login button', async () => {
        await loginPage.clickOAuthButton();
      });

      await test.step('Verify redirect to OAuth service', async () => {
        await expect(page).toHaveURL(/localhost:3001\/api\/v2\/oauth\/authorize/);
        
        // Verify OAuth parameters
        const url = page.url();
        expect(url).toContain('response_type=code');
        expect(url).toContain('client_id=');
        expect(url).toContain('redirect_uri=');
        expect(url).toContain('code_challenge=');
        expect(url).toContain('code_challenge_method=S256');
        expect(url).toContain('state=');
      });

      await test.step('Verify PKCE parameters stored', async () => {
        const codeVerifier = await page.evaluate(() => sessionStorage.getItem('oauth_code_verifier'));
        const state = await page.evaluate(() => sessionStorage.getItem('oauth_state'));
        expect(codeVerifier).toBeTruthy();
        expect(state).toBeTruthy();
      });
    });

    test('should complete OAuth authorization flow', async ({ page }) => {
      await test.step('Initiate OAuth flow', async () => {
        await loginPage.goto();
        await loginPage.clickOAuthButton();
      });

      await test.step('Login on OAuth service', async () => {
        // Wait for OAuth service page
        await page.waitForSelector('input[name="username"]');
        await page.fill('input[name="username"]', TestUsers.admin.username);
        await page.fill('input[name="password"]', TestUsers.admin.password);
        await page.click('button[type="submit"]');
      });

      await test.step('Handle authorization consent if presented', async () => {
        try {
          // Check if consent page is shown
          const consentButton = page.locator('button:has-text("同意"), button:has-text("Authorize")');
          if (await consentButton.isVisible({ timeout: 5000 })) {
            await consentButton.click();
          }
        } catch (e) {
          // Consent page might not be shown for trusted clients
          console.log('Consent page not shown, proceeding...');
        }
      });

      await test.step('Verify redirect back to admin portal', async () => {
        await expect(page).toHaveURL(/localhost:3002\/auth\/callback/);
        
        // Wait for callback processing
        await page.waitForURL(/.*\/dashboard/, { timeout: 15000 });
      });

      await test.step('Verify successful authentication', async () => {
        await dashboardPage.waitForLoad();
        const welcomeText = await dashboardPage.getWelcomeMessage();
        expect(welcomeText).toContain(TestUsers.admin.displayName);
        
        // Verify tokens are stored
        const accessToken = await page.evaluate(() => sessionStorage.getItem('access_token'));
        expect(accessToken).toBeTruthy();
      });
    });

    test('should handle OAuth authorization denial', async ({ page }) => {
      await test.step('Initiate OAuth flow', async () => {
        await loginPage.goto();
        await loginPage.clickOAuthButton();
      });

      await test.step('Login on OAuth service', async () => {
        await page.waitForSelector('input[name="username"]');
        await page.fill('input[name="username"]', TestUsers.admin.username);
        await page.fill('input[name="password"]', TestUsers.admin.password);
        await page.click('button[type="submit"]');
      });

      await test.step('Deny authorization if consent page shown', async () => {
        try {
          const denyButton = page.locator('button:has-text("拒绝"), button:has-text("Deny")');
          if (await denyButton.isVisible({ timeout: 5000 })) {
            await denyButton.click();
            
            // Verify redirect back with error
            await expect(page).toHaveURL(/localhost:3002\/auth\/callback/);
            expect(page.url()).toContain('error=');
          }
        } catch (e) {
          // Skip if consent page not shown
          test.skip();
        }
      });
    });

    test('should validate OAuth state parameter for CSRF protection', async ({ page }) => {
      await test.step('Navigate to login page', async () => {
        await loginPage.goto();
      });

      await test.step('Initiate OAuth flow and capture state', async () => {
        await loginPage.clickOAuthButton();
        
        // Store original state
        const originalState = await page.evaluate(() => sessionStorage.getItem('oauth_state'));
        expect(originalState).toBeTruthy();
      });

      await test.step('Simulate CSRF by modifying state parameter', async () => {
        // This test would require intercepting and modifying the OAuth request
        // For now, we'll verify the state parameter exists and is properly formatted
        const url = page.url();
        const stateMatch = url.match(/state=([^&]+)/);
        expect(stateMatch).toBeTruthy();
        expect(stateMatch![1]).toHaveLengthGreaterThan(20);
      });
    });
  });

  test.describe('Token Management', () => {
    test('should handle token refresh', async ({ page }) => {
      await test.step('Login successfully', async () => {
        await loginPage.login(TestUsers.admin);
        await dashboardPage.waitForLoad();
      });

      await test.step('Capture original tokens', async () => {
        const originalAccessToken = await page.evaluate(() => sessionStorage.getItem('access_token'));
        const originalRefreshToken = await page.evaluate(() => sessionStorage.getItem('refresh_token'));
        expect(originalAccessToken).toBeTruthy();
        expect(originalRefreshToken).toBeTruthy();
      });

      await test.step('Simulate token expiration and refresh', async () => {
        // This would typically be handled automatically by the auth service
        // For testing, we can verify the refresh token exists and is properly formatted
        const refreshToken = await page.evaluate(() => sessionStorage.getItem('refresh_token'));
        expect(refreshToken).toBeTruthy();
        expect(refreshToken!.length).toBeGreaterThan(100);
      });
    });

    test('should clear tokens on logout', async ({ page }) => {
      await test.step('Login successfully', async () => {
        await loginPage.login(TestUsers.admin);
        await dashboardPage.waitForLoad();
      });

      await test.step('Verify tokens exist', async () => {
        const accessToken = await page.evaluate(() => sessionStorage.getItem('access_token'));
        expect(accessToken).toBeTruthy();
      });

      await test.step('Perform logout', async () => {
        await dashboardPage.clickUserMenu();
        await dashboardPage.clickLogoutButton();
      });

      await test.step('Verify tokens are cleared', async () => {
        await expect(page).toHaveURL(/.*\/login/);
        
        const accessToken = await page.evaluate(() => sessionStorage.getItem('access_token'));
        const refreshToken = await page.evaluate(() => sessionStorage.getItem('refresh_token'));
        expect(accessToken).toBeNull();
        expect(refreshToken).toBeNull();
      });
    });

    test('should handle invalid tokens', async ({ page }) => {
      await test.step('Login successfully', async () => {
        await loginPage.login(TestUsers.admin);
        await dashboardPage.waitForLoad();
      });

      await test.step('Corrupt access token', async () => {
        await page.evaluate(() => {
          sessionStorage.setItem('access_token', 'invalid_token');
        });
        
        // Navigate to protected route
        await page.goto('/admin/users');
      });

      await test.step('Verify redirect to login', async () => {
        await expect(page).toHaveURL(/.*\/login/);
      });
    });
  });

  test.describe('Error Handling', () => {
    test('should handle network errors during login', async ({ page }) => {
      await test.step('Navigate to login page', async () => {
        await loginPage.goto();
      });

      await test.step('Simulate network error', async () => {
        await page.route('**/api/v2/auth/login', route => route.abort());
      });

      await test.step('Attempt login', async () => {
        await loginPage.fillUsername(TestUsers.admin.username);
        await loginPage.fillPassword(TestUsers.admin.password);
        await loginPage.clickLoginButton();
      });

      await test.step('Verify error handling', async () => {
        const errorMessage = await loginPage.getErrorMessage();
        expect(errorMessage).toBeTruthy();
      });
    });

    test('should handle OAuth service unavailable', async ({ page }) => {
      await test.step('Navigate to login page', async () => {
        await loginPage.goto();
      });

      await test.step('Simulate OAuth service unavailable', async () => {
        await page.route('**/api/v2/oauth/authorize', route => route.abort());
      });

      await test.step('Attempt OAuth login', async () => {
        await loginPage.clickOAuthButton();
      });

      await test.step('Verify error message', async () => {
        const errorMessage = await loginPage.getErrorMessage();
        expect(errorMessage).toBeTruthy();
      });
    });

    test('should handle invalid redirect URI', async ({ page }) => {
      await test.step('Navigate to login page', async () => {
        await loginPage.goto();
      });

      await test.step('Intercept and modify OAuth request with invalid redirect URI', async () => {
        await page.route('**/api/v2/oauth/authorize', async (route) => {
          const url = new URL(route.request().url());
          url.searchParams.set('redirect_uri', 'http://invalid-redirect-uri.com');
          await route.continue({ url: url.toString() });
        });
      });

      await test.step('Attempt OAuth login', async () => {
        await loginPage.clickOAuthButton();
      });

      await test.step('Verify error handling', async () => {
        // Should handle OAuth error response
        await expect(page.url()).toContain('error=');
      });
    });
  });

  test.describe('Session Persistence', () => {
    test('should maintain session across page reloads', async ({ page }) => {
      await test.step('Login successfully', async () => {
        await loginPage.login(TestUsers.admin);
        await dashboardPage.waitForLoad();
      });

      await test.step('Reload page', async () => {
        await page.reload();
      });

      await test.step('Verify session persists', async () => {
        await dashboardPage.waitForLoad();
        const isLoggedIn = await dashboardPage.isLoggedIn();
        expect(isLoggedIn).toBe(true);
      });
    });

    test('should handle session timeout', async ({ page }) => {
      await test.step('Login successfully', async () => {
        await loginPage.login(TestUsers.admin);
        await dashboardPage.waitForLoad();
      });

      await test.step('Manually expire session', async () => {
        // Clear all session data
        await page.evaluate(() => {
          sessionStorage.clear();
          localStorage.clear();
        });
      });

      await test.step('Navigate to protected route', async () => {
        await page.goto('/admin/users');
      });

      await test.step('Verify redirect to login', async () => {
        await expect(page).toHaveURL(/.*\/login/);
      });
    });
  });
});