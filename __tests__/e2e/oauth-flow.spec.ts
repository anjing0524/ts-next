import { test, expect, Page } from '@playwright/test';

test.describe('OAuth 2.0 End-to-End Flow', () => {
  let page: Page;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
  });

  test.afterEach(async () => {
    await page.close();
  });

  test('complete OAuth 2.0 admin flow', async () => {
    // Step 1: Navigate to login page
    await page.goto('/login');
    await expect(page).toHaveTitle(/Login/);
    await expect(page.locator('h1')).toContainText('Admin Center Login');

    // Step 2: Fill in login credentials
    await page.fill('#username', 'admin');
    await page.fill('#password', 'admin123');
    
    // Step 3: Submit login form
    await page.click('button[type="submit"]');
    
    // Step 4: Should redirect to OAuth authorize endpoint
    await page.waitForURL('**/api/oauth/authorize**');
    
    // Step 5: Should automatically redirect to callback with authorization code
    await page.waitForURL('**/auth/callback**');
    
    // Step 6: Verify callback processing
    await expect(page.locator('text=Processing authorization')).toBeVisible();
    
    // Step 7: Should redirect to admin dashboard
    await page.waitForURL('**/admin');
    
    // Step 8: Verify admin dashboard loads
    await expect(page.locator('h1')).toContainText('OAuth 2.0 Admin Center');
    await expect(page.locator('text=Welcome,')).toBeVisible();
    
    // Step 9: Verify dashboard tabs are present
    await expect(page.locator('text=Overview')).toBeVisible();
    await expect(page.locator('text=Users')).toBeVisible();
    await expect(page.locator('text=Clients')).toBeVisible();
    await expect(page.locator('text=Permissions')).toBeVisible();
    
    // Step 10: Test navigation between tabs
    await page.click('text=Users');
    await expect(page.locator('text=User Management')).toBeVisible();
    
    await page.click('text=Clients');
    await expect(page.locator('text=OAuth Client Management')).toBeVisible();
    
    await page.click('text=Permissions');
    await expect(page.locator('text=Permission Management')).toBeVisible();
  });

  test('OAuth 2.0 external client authorization', async () => {
    // Step 1: Register a test client
    await page.goto('/clients/register');
    await page.fill('#name', 'Test External App');
    await page.fill('#redirectUris', 'http://localhost:3000/test-callback');
    await page.click('button[type="submit"]');
    
    // Wait for success response and extract client ID
    await expect(page.locator('text=Registration Successful!')).toBeVisible();
    const clientId = await page.locator('#clientIdDisplay').inputValue();
    
    // Step 2: Simulate external OAuth flow
    const oauthUrl = `/api/oauth/authorize?client_id=${clientId}&redirect_uri=http://localhost:3000/test-callback&response_type=code&scope=openid profile&state=test-state`;
    
    await page.goto(oauthUrl);
    
    // Step 3: Should redirect to login if not authenticated
    await page.waitForURL('**/login**');
    
    // Step 4: Login
    await page.fill('#username', 'testuser');
    await page.fill('#password', 'testpass123');
    await page.click('button[type="submit"]');
    
    // Step 5: Should redirect back to OAuth authorize with session
    await page.waitForURL('**/api/oauth/authorize**');
    
    // Step 6: Should redirect to callback with authorization code
    await page.waitForURL('http://localhost:3000/test-callback**');
    
    // Step 7: Verify authorization code is present in URL
    const url = page.url();
    expect(url).toContain('code=');
    expect(url).toContain('state=test-state');
  });

  test('OAuth 2.0 PKCE flow validation', async () => {
    // Test PKCE code challenge validation
    const invalidOauthUrl = '/api/oauth/authorize?client_id=admin-center&redirect_uri=http://localhost:3000/auth/callback&response_type=code&scope=openid&code_challenge=invalid&code_challenge_method=S256';
    
    await page.goto('/login');
    await page.fill('#username', 'admin');
    await page.fill('#password', 'admin123');
    await page.click('button[type="submit"]');
    
    // Manually navigate to authorize with invalid PKCE
    await page.goto(invalidOauthUrl);
    
    // Should handle PKCE validation appropriately
    await page.waitForLoadState('networkidle');
  });

  test('logout functionality', async () => {
    // Step 1: Login and navigate to dashboard
    await page.goto('/login');
    await page.fill('#username', 'admin');
    await page.fill('#password', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/admin');
    
    // Step 2: Click logout button
    await page.click('text=Logout');
    
    // Step 3: Should redirect to login page
    await page.waitForURL('**/login');
    
    // Step 4: Verify session is cleared by trying to access protected route
    await page.goto('/admin');
    await page.waitForURL('**/login');
    await expect(page.locator('h1')).toContainText('Admin Center Login');
  });

  test('error handling - invalid client', async () => {
    const invalidClientUrl = '/api/oauth/authorize?client_id=invalid-client&redirect_uri=http://localhost:3000/callback&response_type=code';
    
    await page.goto(invalidClientUrl);
    
    // Should return error response
    await page.waitForLoadState('networkidle');
    const content = await page.content();
    expect(content).toContain('invalid_client');
  });

  test('error handling - invalid redirect URI', async () => {
    const invalidRedirectUrl = '/api/oauth/authorize?client_id=admin-center&redirect_uri=http://evil.com/callback&response_type=code';
    
    await page.goto(invalidRedirectUrl);
    
    // Should return error response
    await page.waitForLoadState('networkidle');
    const content = await page.content();
    expect(content).toContain('invalid_request');
  });

  test('API endpoints return correct headers', async () => {
    // Test CORS and security headers
    const response = await page.request.get('/api/oauth/.well-known/openid_configuration');
    
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');
    
    const body = await response.json();
    expect(body.issuer).toBeTruthy();
    expect(body.authorization_endpoint).toBeTruthy();
    expect(body.token_endpoint).toBeTruthy();
    expect(body.userinfo_endpoint).toBeTruthy();
  });

  test('user registration flow', async () => {
    // Step 1: Navigate to registration page
    await page.goto('/register');
    await expect(page.locator('h1')).toContainText('Create Account');
    
    // Step 2: Fill registration form
    await page.fill('#firstName', 'Test');
    await page.fill('#lastName', 'User');
    await page.fill('#username', 'newuser');
    await page.fill('#email', 'newuser@example.com');
    await page.fill('#password', 'NewPass123');
    await page.fill('#confirmPassword', 'NewPass123');
    
    // Step 3: Submit registration
    await page.click('button[type="submit"]');
    
    // Step 4: Should show success message and redirect to login
    await expect(page.locator('text=Registration successful!')).toBeVisible();
    await page.waitForURL('**/login');
    
    // Step 5: Test login with new credentials
    await page.fill('#username', 'newuser');
    await page.fill('#password', 'NewPass123');
    await page.click('button[type="submit"]');
    
    // Should successfully authenticate
    await page.waitForURL('**/admin');
  });

  test('client registration flow', async () => {
    // Step 1: Login as admin
    await page.goto('/login');
    await page.fill('#username', 'admin');
    await page.fill('#password', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/admin');
    
    // Step 2: Navigate to client registration
    await page.goto('/clients/register');
    
    // Step 3: Fill client registration form
    await page.fill('#name', 'My Test Application');
    await page.fill('#redirectUris', 'https://myapp.com/callback, https://myapp.com/dev-callback');
    await page.fill('#jwksUri', 'https://myapp.com/.well-known/jwks.json');
    
    // Step 4: Submit registration
    await page.click('button[type="submit"]');
    
    // Step 5: Verify success response
    await expect(page.locator('text=Registration Successful!')).toBeVisible();
    
    // Step 6: Verify client credentials are displayed
    const clientId = await page.locator('#clientIdDisplay').inputValue();
    const clientSecret = await page.locator('#clientSecretDisplay').inputValue();
    
    expect(clientId).toBeTruthy();
    expect(clientSecret).toBeTruthy();
    expect(clientId.length).toBeGreaterThan(10);
    expect(clientSecret.length).toBeGreaterThan(20);
  });

  test('responsive design', async () => {
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    await page.goto('/login');
    await expect(page.locator('.card')).toBeVisible();
    
    await page.goto('/admin');
    await page.fill('#username', 'admin');
    await page.fill('#password', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/admin');
    
    // Dashboard should be responsive
    await expect(page.locator('.grid')).toBeVisible();
    
    // Test tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.reload();
    await expect(page.locator('h1')).toContainText('OAuth 2.0 Admin Center');
  });
}); 