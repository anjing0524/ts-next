// __tests__/e2e/auth.oauth.e2e.ts
import { test, expect } from '@playwright/test';
import crypto from 'crypto'; // For PKCE

// Helper to generate PKCE
const generatePKCE = () => {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
};

// E2E Test User - MUST exist in the database for E2E tests
const e2eUser = {
  username: process.env.E2E_TEST_USER_USERNAME || 'e2e-test-user',
  password: process.env.E2E_TEST_USER_PASSWORD || 'E2ePassword123!',
};

// E2E Test Client - MUST be pre-registered in the database for E2E tests
// This should be a public client for typical SPA/mobile E2E tests of this flow.
const e2ePublicClient = {
  clientId: process.env.E2E_TEST_PUBLIC_CLIENT_ID || 'e2e-public-client',
  // This redirect URI must be one of the registered URIs for the e2e-public-client
  redirectUri: process.env.E2E_TEST_PUBLIC_CLIENT_REDIRECT_URI || 'http://localhost:3001/callback', // A dummy callback for E2E test
  scope: 'openid profile email', // Example scopes
};

test.describe('Authentication - OAuth 2.0 Authorization Code Grant Flow (User Interaction)', () => {
  const loginPath = '/login';
  // The consent page path might be dynamic or include query params, adjust as needed.
  // It's often part of the /oauth/authorize flow before redirecting to consent UI.
  // Or it might be a dedicated page like /oauth/consent.
  // The V2 consent page is at /oauth/consent as per app structure.
  const consentPagePath = '/oauth/consent';

  // Helper function for login - can be extracted to a common E2E helper file
  async function login(page: any, username: string, password: string) {
    await page.goto(loginPath);
    await page.fill('input[name="username"]', username);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');
    // Wait for login to complete, e.g., by checking for URL change or a specific element.
    // If login redirects away from /login, this will be handled by Playwright's auto-wait.
    // If it stays on /login due to error, subsequent checks in the main test will fail as expected.
  }

  test('TC_E2E_OAUTH_001: should complete Authorization Code Grant flow with login and consent', async ({ page }) => {
    const { challenge: codeChallenge } = generatePKCE();
    const state = crypto.randomBytes(16).toString('hex');

    // Construct the initial authorization URL
    const authUrl = `/api/v2/oauth/authorize?${new URLSearchParams({
      client_id: e2ePublicClient.clientId,
      redirect_uri: e2ePublicClient.redirectUri,
      response_type: 'code',
      scope: e2ePublicClient.scope,
      state: state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    }).toString()}`;

    // 1. Navigate to the authorization URL (simulating redirection from a client app)
    await page.goto(authUrl);

    // 2. If not logged in, auth server should redirect to its login page.
    //    Playwright will follow redirects. Check if current URL is the login page.
    //    The login page URL might also contain a 'redirect_uri' or 'callback_url' pointing back to the authUrl or a specific auth server flow.
    if (!page.url().includes(loginPath)) { // Check if already logged in from a previous test run's session
        const currentUrl = page.url();
        if (currentUrl.includes(loginPath)) {
            // Already on login page, proceed to fill form
        } else if (currentUrl.includes(e2ePublicClient.redirectUri) || currentUrl.includes(consentPagePath)) {
            // If already past login (e.g. session persisted), skip login step. This can happen in local E2E runs.
            console.log('Skipping login, session might be active or redirected to consent/callback.');
        } else {
            // If not on login, callback or consent, wait for login redirect
            await expect(page).toHaveURL(new RegExp(`^${loginPath}`), { timeout: 15000 });
        }
    }

    // Perform login only if on login page
    if (page.url().includes(loginPath)) {
        await page.fill('input[name="username"]', e2eUser.username);
        await page.fill('input[name="password"]', e2eUser.password);
        await page.click('button[type="submit"]');
    }


    // 3. After successful login, user should be redirected to the consent page (or directly to client if consent already given & not forced).
    //    Wait for navigation to a URL that looks like the consent page.
    //    The URL for consent page might be /oauth/consent or similar, possibly with query params.
    //    Example: /oauth/consent?client_id=e2e-public-client&scope=openid%20profile...
    //    Adjust the expected URL pattern for the consent page.
    await expect(page).toHaveURL(new RegExp(`^${consentPagePath}`), { timeout: 20000 });


    // 4. Interact with the consent page
    //    Verify client name and scopes are displayed (adjust selectors based on actual UI)
    //    Example: await expect(page.locator(`text=${e2ePublicClient.clientId}`)).toBeVisible();
    //    Example: await expect(page.locator(`text=openid`)).toBeVisible();
    //    Example: await expect(page.locator(`text=profile`)).toBeVisible();
    //    For now, we assume there's a button to approve/authorize.
    await expect(page.locator(`button:has-text("Authorize")`)).toBeVisible({ timeout: 10000 }); // Or "Allow", "Approve", etc.
    await page.click('button:has-text("Authorize")');


    // 5. After consent, auth server should redirect to the client's redirect_uri with code and state.
    //    Playwright will follow this redirect.
    await expect(page).toHaveURL(new RegExp(`^${e2ePublicClient.redirectUri}`), { timeout: 15000 });

    // 6. Verify 'code' and 'state' are in the callback URL query parameters.
    const callbackUrl = new URL(page.url());
    expect(callbackUrl.searchParams.get('code')).toBeTruthy(); // Check that 'code' param exists and is not empty
    expect(callbackUrl.searchParams.get('state')).toBe(state); // Check that 'state' param matches the original state

    // Check for error parameter - should not be present
    expect(callbackUrl.searchParams.get('error')).toBeNull();
  });
});
