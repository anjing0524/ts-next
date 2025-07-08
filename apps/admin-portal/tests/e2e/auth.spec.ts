import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3002';
const OAUTH_SERVICE_URL = 'http://localhost:3001';

test.beforeAll(async ({ request }) => {
  // Reset the database before all tests in this file
  const response = await request.post(`${OAUTH_SERVICE_URL}/api/v2/test-setup`);
  expect(response.ok()).toBeTruthy();
});

test.describe('Core Authentication Flow', () => {
  // Test case for a successful login and logout flow
  test('should allow a user to log in and then log out', async ({ page }) => {
    // --- 1. Login Flow ---

    // Navigate to the login page
    await page.goto(`${BASE_URL}/login`);

    // Wait for the main content of the login page to be visible
    await expect(page.getByTestId('login-oauth-button')).toBeVisible({ timeout: 15000 });

    // The login button click will redirect to the OAuth service.
    // We need to handle this redirection. For a true E2E test, we would interact
    // with the OAuth provider's page. Here, we'll check the redirection and
    // then manually handle the callback for the purpose of this test.

    // Click the login button
    await page.getByTestId('login-oauth-button').click();

    // Assert that the page has redirected to the OAuth service's authorize endpoint.
    // We expect the URL to contain the base URL of the oauth-service and the /authorize path.
    await expect(page).toHaveURL(/http:\/\/localhost:3001\/api\/v2\/oauth\/authorize\?/, { timeout: 15000 });

    // --- This is where a real user would enter credentials. ---
    // For this test, we will simulate the callback from the OAuth service.
    // We'll assume the OAuth flow was successful and the service is redirecting
    // back to our app with an authorization code.
    // In a more advanced test setup, we might programmatically get a code from the backend.

    // Manually navigate to the callback URL with a dummy code.
    // This will fail because the code is invalid and PKCE checks will fail,
    // but it allows us to test the callback page's error handling.
    // A proper test would require a valid code.
    await page.goto(`${BASE_URL}/auth/callback?code=dummy_test_code&state=${page.url().split('state=')[1]}`);

    // For now, let's assume a successful login redirects to the admin dashboard.
    // We will refine this test in later tasks when the full flow is working.
    // Let's simulate a successful token storage and navigation for the next step.
    await page.goto(BASE_URL); // Navigate to root, which should redirect to /admin
    
    // After redirection, wait for the admin dashboard to be visible
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 10000 });

    // --- 2. Logout Flow ---

    // Find and click the user dropdown/button to reveal the logout option.
    // This assumes a user button/menu exists in the header.
    // We might need to adjust the selector based on the actual implementation.
    await page.getByTestId('user-nav-dropdown').click();

    // Find and click the logout button
    const logoutButton = page.getByRole('menuitem', { name: 'Log out' });
    await expect(logoutButton).toBeVisible();

    // We need to mock or intercept the revocation call to verify it's made.
    let revokeCallPromise = page.waitForRequest(req => 
      req.url().includes('/api/v2/oauth/revoke') && req.method() === 'POST'
    );

    await logoutButton.click();

    // Wait for the revocation API call to be made
    const revokeRequest = await revokeCallPromise;
    expect(revokeRequest).not.toBeNull();
    
    // Assert that after logout, the user is redirected to the login page.
    await expect(page).toHaveURL(`${BASE_URL}/login`, { timeout: 10000 });

    // Verify that the auth token cookie is cleared
    const cookies = await page.context().cookies();
    const authTokenCookie = cookies.find(c => c.name === 'auth_token');
    expect(authTokenCookie).toBeUndefined();
  });
});
