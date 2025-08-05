import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/login-page';
import { DashboardPage } from '../pages/dashboard-page';

test.describe('Error Handling', () => {
  let loginPage: LoginPage;
  let dashboardPage: DashboardPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    dashboardPage = new DashboardPage(page);
  });

  test('should display appropriate error for invalid credentials', async ({ page }) => {
    await loginPage.goto();
    await loginPage.login({ username: 'invalid@example.com', password: 'wrongpassword' });
    
    // Check for error message using LoginPage's errorMessage locator
    await expect(loginPage.errorMessage).toBeVisible();
    await expect(loginPage.errorMessage).toContainText('Invalid credentials');
  });

  test('should handle network errors gracefully', async ({ page }) => {
    // Simulate network error by intercepting and failing requests
    await page.route('**/api/**', route => route.abort('failed'));
    
    await loginPage.goto();
    await loginPage.login({ username: 'test@example.com', password: 'password123' });
    
    // Check for network error message
    await expect(loginPage.errorMessage).toBeVisible();
    await expect(loginPage.errorMessage).toContainText('Network error');
  });

  test('should redirect to login on session expiry', async ({ page }) => {
    // First login successfully
    await loginPage.goto();
    await loginPage.login({ username: 'admin@example.com', password: 'admin123' });
    await dashboardPage.waitForLoad();
    
    // Simulate session expiry by clearing cookies
    await page.context().clearCookies();
    
    // Try to access protected page
    await page.goto('/admin/users');
    
    // Should be redirected to login
    await expect(page).toHaveURL(/\/login/);
  });

  test('should handle OAuth service unavailability', async ({ page }) => {
    // Simulate OAuth service being down
    await page.route('**/oauth/**', route => route.abort('failed'));
    
    await loginPage.goto();
    await loginPage.clickOAuthButton();
    
    // Check for service unavailable message
    await expect(loginPage.errorMessage).toBeVisible();
    await expect(loginPage.errorMessage).toContainText('Service unavailable');
  });

  test('should validate required form fields', async ({ page }) => {
    await loginPage.goto();
    
    // Try to submit empty form
    await loginPage.clickLoginButton();
    
    // Check for validation errors
    await expect(loginPage.usernameValidation).toBeVisible();
    await expect(loginPage.passwordValidation).toBeVisible();
  });

  test('should handle invalid redirect URIs', async ({ page }) => {
    // Attempt to access OAuth with invalid redirect URI
    await page.goto('/oauth/authorize?redirect_uri=invalid-uri');
    
    // Should show error page
    await expect(page.locator('.text-red-600')).toBeVisible();
  });

  test('should handle permission denied scenarios', async ({ page }) => {
    // Login as user with limited permissions
    await loginPage.goto();
    await loginPage.login({ username: 'user@example.com', password: 'user123' });
    
    // Try to access admin-only page
    await page.goto('/admin/system/roles');
    
    // Should show permission denied
    await expect(page.locator('[data-testid="permission-denied"], .text-red-600')).toBeVisible();
  });

  test('should handle invalid JWT tokens', async ({ page }) => {
    // Set invalid JWT token
    await page.context().addCookies([{
      name: 'auth_token',
      value: 'invalid.token.here',
      domain: 'localhost',
      path: '/',
    }]);
    
    // Try to access protected page
    await page.goto('/admin/dashboard');
    
    // Should be redirected to login
    await expect(page).toHaveURL(/\/login/);
  });

  test('should display 404 for non-existent routes', async ({ page }) => {
    await page.goto('/non-existent-route');
    
    // Should show 404 page
    await expect(page.locator('h1')).toContainText('404');
  });

  test('should handle rate limiting', async ({ page }) => {
    // Make multiple failed login attempts
    for (let i = 0; i < 5; i++) {
      await loginPage.goto();
      await loginPage.login({ username: `test${i}@example.com`, password: 'wrongpassword' });
    }
    
    // Check for rate limiting message
    await expect(loginPage.errorMessage).toBeVisible();
    await expect(loginPage.errorMessage).toContainText('Too many attempts');
  });
});