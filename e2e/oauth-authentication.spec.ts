import { test, expect } from '@playwright/test';

test.describe('OAuth Authentication Flow', () => {
  // 设置测试数据
  const testClient = {
    id: 'test-client-id',
    secret: 'test-client-secret',
    redirectUri: 'http://localhost:3000/callback',
  };

  test.beforeEach(async ({ page }) => {
    // 在每个测试开始前设置基础数据
    // 这里可以通过API调用或数据库直接插入测试数据
    await page.goto('/');
  });

  test('should complete OAuth authorization code flow', async ({ page }) => {
    // 1. 访问授权端点
    const authUrl = new URL('/api/oauth/authorize', 'http://localhost:3000');
    authUrl.searchParams.set('client_id', testClient.id);
    authUrl.searchParams.set('redirect_uri', testClient.redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'read:profile');
    authUrl.searchParams.set('state', 'test-state-value');

    await page.goto(authUrl.toString());

    // 2. 应该重定向到回调URL并包含授权码
    await page.waitForURL(/\/callback/);
    const currentUrl = new URL(page.url());
    
    expect(currentUrl.searchParams.get('code')).toBeTruthy();
    expect(currentUrl.searchParams.get('state')).toBe('test-state-value');

    const authCode = currentUrl.searchParams.get('code');

    // 3. 使用授权码交换访问令牌
    const tokenResponse = await page.request.post('/api/oauth/token', {
      form: {
        grant_type: 'authorization_code',
        code: authCode!,
        redirect_uri: testClient.redirectUri,
        client_id: testClient.id,
        client_secret: testClient.secret,
      },
    });

    expect(tokenResponse.status()).toBe(200);
    const tokenData = await tokenResponse.json();
    
    expect(tokenData.access_token).toBeTruthy();
    expect(tokenData.token_type).toBe('Bearer');
    expect(tokenData.expires_in).toBeGreaterThan(0);
    expect(tokenData.refresh_token).toBeTruthy();
    expect(tokenData.scope).toBe('read:profile');
  });

  test('should complete PKCE flow', async ({ page }) => {
    // 生成PKCE参数
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    // 1. 访问授权端点（使用PKCE）
    const authUrl = new URL('/api/oauth/authorize', 'http://localhost:3000');
    authUrl.searchParams.set('client_id', testClient.id);
    authUrl.searchParams.set('redirect_uri', testClient.redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'read:profile');
    authUrl.searchParams.set('state', 'pkce-test-state');
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');

    await page.goto(authUrl.toString());

    // 2. 应该重定向到回调URL
    await page.waitForURL(/\/callback/);
    const currentUrl = new URL(page.url());
    const authCode = currentUrl.searchParams.get('code');

    expect(authCode).toBeTruthy();
    expect(currentUrl.searchParams.get('state')).toBe('pkce-test-state');

    // 3. 使用授权码和PKCE验证器交换访问令牌
    const tokenResponse = await page.request.post('/api/oauth/token', {
      form: {
        grant_type: 'authorization_code',
        code: authCode!,
        redirect_uri: testClient.redirectUri,
        client_id: testClient.id,
        code_verifier: codeVerifier,
      },
    });

    expect(tokenResponse.status()).toBe(200);
    const tokenData = await tokenResponse.json();
    
    expect(tokenData.access_token).toBeTruthy();
    expect(tokenData.token_type).toBe('Bearer');
  });

  test('should handle invalid client_id', async ({ page }) => {
    const authUrl = new URL('/api/oauth/authorize', 'http://localhost:3000');
    authUrl.searchParams.set('client_id', 'invalid-client-id');
    authUrl.searchParams.set('redirect_uri', testClient.redirectUri);
    authUrl.searchParams.set('response_type', 'code');

    const response = await page.request.get(authUrl.toString());
    expect(response.status()).toBe(400);

    const errorData = await response.json();
    expect(errorData.error).toBe('unauthorized_client');
  });

  test('should handle invalid redirect_uri', async ({ page }) => {
    const authUrl = new URL('/api/oauth/authorize', 'http://localhost:3000');
    authUrl.searchParams.set('client_id', testClient.id);
    authUrl.searchParams.set('redirect_uri', 'http://malicious.com/callback');
    authUrl.searchParams.set('response_type', 'code');

    const response = await page.request.get(authUrl.toString());
    expect(response.status()).toBe(400);

    const errorData = await response.json();
    expect(errorData.error).toBe('invalid_request');
    expect(errorData.error_description).toContain('Invalid redirect_uri');
  });

  test('should handle refresh token flow', async ({ page }) => {
    // 首先获取访问令牌和刷新令牌
    const authUrl = new URL('/api/oauth/authorize', 'http://localhost:3000');
    authUrl.searchParams.set('client_id', testClient.id);
    authUrl.searchParams.set('redirect_uri', testClient.redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'read:profile');

    await page.goto(authUrl.toString());
    await page.waitForURL(/\/callback/);
    
    const currentUrl = new URL(page.url());
    const authCode = currentUrl.searchParams.get('code');

    // 获取初始令牌
    const initialTokenResponse = await page.request.post('/api/oauth/token', {
      form: {
        grant_type: 'authorization_code',
        code: authCode!,
        redirect_uri: testClient.redirectUri,
        client_id: testClient.id,
        client_secret: testClient.secret,
      },
    });

    const initialTokenData = await initialTokenResponse.json();
    const refreshToken = initialTokenData.refresh_token;

    // 使用刷新令牌获取新的访问令牌
    const refreshResponse = await page.request.post('/api/oauth/token', {
      form: {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: testClient.id,
        client_secret: testClient.secret,
      },
    });

    expect(refreshResponse.status()).toBe(200);
    const refreshTokenData = await refreshResponse.json();
    
    expect(refreshTokenData.access_token).toBeTruthy();
    expect(refreshTokenData.access_token).not.toBe(initialTokenData.access_token);
    expect(refreshTokenData.token_type).toBe('Bearer');
  });
});

// PKCE辅助函数
function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode.apply(null, Array.from(array)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(digest))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
} 