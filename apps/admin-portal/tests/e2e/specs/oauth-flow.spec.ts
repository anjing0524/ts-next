import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/login-page';
import { ConsentPage } from '../pages/consent-page';
import { DashboardPage } from '../pages/dashboard-page';
import { TestHelpers, TEST_USERS } from '../utils/test-helpers';

test.describe('OAuth 2.1 认证流程', () => {
  let loginPage: LoginPage;
  let consentPage: ConsentPage;
  let dashboardPage: DashboardPage;
  
  const testClient = TestHelpers.generateClientData({
    clientId: 'test-admin-portal',
    name: 'Admin Portal',
    redirectUris: ['http://localhost:3000/auth/callback'],
    pkceRequired: true
  });
  
  const testUser = TestHelpers.generateUserData({
    username: 'testuser',
    email: 'testuser@example.com',
    roles: ['admin']
  });

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    consentPage = new ConsentPage(page);
    dashboardPage = new DashboardPage(page);
    
    // 清除认证状态
    await TestHelpers.clearAuthState(page);
    
    // 模拟客户端配置API
    await TestHelpers.mockApiResponse(
      page,
      '**/api/clients/test-admin-portal',
      testClient
    );
  });

  test('完整的OAuth授权码流程', async ({ page }) => {
    // 生成PKCE参数
    const { codeVerifier, codeChallenge } = TestHelpers.generatePKCEChallenge();
    const state = 'test-state-' + Date.now();
    
    // 1. 访问授权端点
    const authUrl = TestHelpers.generateOAuthAuthorizationUrl(
      testClient.clientId,
      testClient.redirectUris[0],
      state,
      codeChallenge
    );
    
    await page.goto(authUrl);
    
    // 2. 应该重定向到登录页面
    await loginPage.verifyPageLoaded();
    await loginPage.verifyPageTitle('登录');
    
    // 3. 模拟登录API响应
    await TestHelpers.mockApiResponse(
      page,
      '**/api/auth/login',
      {
        success: true,
        user: testUser,
        requiresConsent: true
      }
    );
    
    // 4. 执行登录
    await loginPage.login(testUser.username, 'password123');
    
    // 5. 应该重定向到授权同意页面
    await consentPage.verifyPageLoaded();
    await consentPage.verifyClientInfo(testClient.name, testClient.description);
    await consentPage.verifyRequestedScopes(['openid', 'profile', 'email']);
    await consentPage.verifyUserInfo(testUser.username, testUser.email);
    
    // 6. 模拟授权API响应
    const authorizationCode = 'test-auth-code-' + Date.now();
    await TestHelpers.mockApiResponse(
      page,
      '**/api/oauth/authorize',
      {
        code: authorizationCode,
        state: state
      }
    );
    
    // 7. 同意授权
    await consentPage.grantConsent();
    
    // 8. 应该重定向到客户端回调地址
    await page.waitForURL(new RegExp(testClient.redirectUris[0]));
    
    // 9. 验证回调参数
    const url = new URL(page.url());
    expect(url.searchParams.get('code')).toBe(authorizationCode);
    expect(url.searchParams.get('state')).toBe(state);
    
    // 10. 模拟令牌交换
    const accessToken = TestHelpers.generateAccessToken(testUser, ['read:dashboard']);
    const refreshToken = TestHelpers.generateRefreshToken(testUser);
    
    await TestHelpers.mockApiResponse(
      page,
      '**/api/oauth/token',
      {
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'openid profile email'
      }
    );
    
    // 11. 模拟客户端处理回调并设置认证状态
    await TestHelpers.setAuthState(page, testUser, ['read:dashboard']);
    
    // 12. 访问仪表盘验证认证成功
    await dashboardPage.goto();
    await dashboardPage.verifyPageLoaded();
    await dashboardPage.verifyUserLoggedIn(testUser.username);
  });

  test('PKCE验证失败', async ({ page }) => {
    const state = 'test-state-' + Date.now();
    
    // 1. 不使用PKCE访问授权端点
    const authUrl = TestHelpers.generateOAuthAuthorizationUrl(
      testClient.clientId,
      testClient.redirectUris[0],
      state
    );
    
    await page.goto(authUrl);
    
    // 2. 应该显示PKCE必需的错误
    await expect(page.locator('[data-testid="error-message"]')).toContainText('PKCE is required');
  });

  test('无效客户端ID', async ({ page }) => {
    // 模拟客户端不存在的API响应
    await TestHelpers.mockApiError(
      page,
      '**/api/clients/invalid-client',
      { code: 'invalid_client', message: 'Client not found' },
      404
    );
    
    const authUrl = TestHelpers.generateOAuthAuthorizationUrl(
      'invalid-client',
      'http://localhost:3000/callback'
    );
    
    await page.goto(authUrl);
    
    // 应该显示客户端无效错误
    await expect(page.locator('[data-testid="error-message"]')).toContainText('invalid_client');
  });

  test('无效重定向URI', async ({ page }) => {
    const { codeChallenge } = TestHelpers.generatePKCEChallenge();
    
    const authUrl = TestHelpers.generateOAuthAuthorizationUrl(
      testClient.clientId,
      'http://malicious-site.com/callback', // 无效的重定向URI
      'test-state',
      codeChallenge
    );
    
    await page.goto(authUrl);
    
    // 应该显示重定向URI无效错误
    await expect(page.locator('[data-testid="error-message"]')).toContainText('invalid_redirect_uri');
  });

  test('用户拒绝授权', async ({ page }) => {
    const { codeChallenge } = TestHelpers.generatePKCEChallenge();
    const state = 'test-state-' + Date.now();
    
    const authUrl = TestHelpers.generateOAuthAuthorizationUrl(
      testClient.clientId,
      testClient.redirectUris[0],
      state,
      codeChallenge
    );
    
    await page.goto(authUrl);
    await loginPage.verifyPageLoaded();
    
    // 模拟登录成功
    await TestHelpers.mockApiResponse(
      page,
      '**/api/auth/login',
      {
        success: true,
        user: testUser,
        requiresConsent: true
      }
    );
    
    await loginPage.login(testUser.username, 'password123');
    await consentPage.verifyPageLoaded();
    
    // 模拟拒绝授权的API响应
    await TestHelpers.mockApiResponse(
      page,
      '**/api/oauth/authorize',
      {
        error: 'access_denied',
        error_description: 'The user denied the request',
        state: state
      }
    );
    
    // 拒绝授权
    await consentPage.denyConsent();
    
    // 应该重定向到客户端并带有错误参数
    await page.waitForURL(new RegExp(testClient.redirectUris[0]));
    
    const url = new URL(page.url());
    expect(url.searchParams.get('error')).toBe('access_denied');
    expect(url.searchParams.get('state')).toBe(state);
  });

  test('登录失败处理', async ({ page }) => {
    const { codeChallenge } = TestHelpers.generatePKCEChallenge();
    
    const authUrl = TestHelpers.generateOAuthAuthorizationUrl(
      testClient.clientId,
      testClient.redirectUris[0],
      'test-state',
      codeChallenge
    );
    
    await page.goto(authUrl);
    await loginPage.verifyPageLoaded();
    
    // 模拟登录失败
    await TestHelpers.mockApiError(
      page,
      '**/api/auth/login',
      { code: 'invalid_credentials', message: 'Invalid username or password' },
      401
    );
    
    await loginPage.login('invalid-user', 'wrong-password');
    
    // 应该显示登录错误
    await loginPage.verifyLoginError('Invalid username or password');
    
    // 应该保持在登录页面
    await loginPage.verifyPageLoaded();
  });

  test('会话超时处理', async ({ page }) => {
    // 设置过期的认证状态
    const expiredUser = { ...testUser };
    const expiredToken = TestHelpers.generateJwtToken(
      {
        sub: expiredUser.id,
        username: expiredUser.username,
        exp: Math.floor(Date.now() / 1000) - 3600 // 1小时前过期
      }
    );
    
    await page.addInitScript((token) => {
      localStorage.setItem('access_token', token);
    }, expiredToken);
    
    // 访问需要认证的页面
    await dashboardPage.goto();
    
    // 应该重定向到登录页面
    await loginPage.verifyPageLoaded();
    
    // 应该显示会话过期消息
    await expect(page.locator('[data-testid="info-message"]')).toContainText('会话已过期');
  });

  test('令牌刷新流程', async ({ page }) => {
    // 设置即将过期的令牌
    const nearExpiredToken = TestHelpers.generateJwtToken(
      {
        sub: testUser.id,
        username: testUser.username,
        exp: Math.floor(Date.now() / 1000) + 300 // 5分钟后过期
      }
    );
    
    const refreshToken = TestHelpers.generateRefreshToken(testUser);
    
    await page.addInitScript((tokens) => {
      localStorage.setItem('access_token', tokens.accessToken);
      localStorage.setItem('refresh_token', tokens.refreshToken);
    }, { accessToken: nearExpiredToken, refreshToken });
    
    // 模拟令牌刷新API
    const newAccessToken = TestHelpers.generateAccessToken(testUser, ['read:dashboard']);
    await TestHelpers.mockApiResponse(
      page,
      '**/api/oauth/token',
      {
        access_token: newAccessToken,
        token_type: 'Bearer',
        expires_in: 3600
      }
    );
    
    // 访问仪表盘
    await dashboardPage.goto();
    await dashboardPage.verifyPageLoaded();
    
    // 验证令牌刷新API被调用
    await TestHelpers.verifyApiCall(page, '/api/oauth/token', 'POST', {
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    });
    
    // 验证新令牌被保存
    const storedToken = await page.evaluate(() => localStorage.getItem('access_token'));
    expect(storedToken).toBe(newAccessToken);
  });

  test('多客户端并发授权', async ({ page, context }) => {
    // 创建第二个客户端
    const secondClient = TestHelpers.generateClientData({
      clientId: 'test-second-client',
      name: 'Second Client',
      redirectUris: ['http://localhost:3001/callback']
    });
    
    await TestHelpers.mockApiResponse(
      page,
      '**/api/clients/test-second-client',
      secondClient
    );
    
    // 在新标签页中打开第二个客户端的授权流程
    const secondPage = await context.newPage();
    
    const { codeChallenge: challenge1 } = TestHelpers.generatePKCEChallenge();
    const { codeChallenge: challenge2 } = TestHelpers.generatePKCEChallenge();
    
    const authUrl1 = TestHelpers.generateOAuthAuthorizationUrl(
      testClient.clientId,
      testClient.redirectUris[0],
      'state1',
      challenge1
    );
    
    const authUrl2 = TestHelpers.generateOAuthAuthorizationUrl(
      secondClient.clientId,
      secondClient.redirectUris[0],
      'state2',
      challenge2
    );
    
    // 同时访问两个授权端点
    await Promise.all([
      page.goto(authUrl1),
      secondPage.goto(authUrl2)
    ]);
    
    // 验证两个页面都正确加载
    await Promise.all([
      new LoginPage(page).verifyPageLoaded(),
      new LoginPage(secondPage).verifyPageLoaded()
    ]);
    
    // 清理
    await secondPage.close();
  });

  test('OAuth错误参数验证', async ({ page }) => {
    const testCases = [
      {
        name: '缺少response_type',
        params: {
          client_id: testClient.clientId,
          redirect_uri: testClient.redirectUris[0]
        },
        expectedError: 'invalid_request'
      },
      {
        name: '无效的response_type',
        params: {
          response_type: 'invalid',
          client_id: testClient.clientId,
          redirect_uri: testClient.redirectUris[0]
        },
        expectedError: 'unsupported_response_type'
      },
      {
        name: '缺少client_id',
        params: {
          response_type: 'code',
          redirect_uri: testClient.redirectUris[0]
        },
        expectedError: 'invalid_request'
      }
    ];
    
    for (const testCase of testCases) {
      const params = new URLSearchParams(testCase.params);
      const url = `/oauth/authorize?${params.toString()}`;
      
      await page.goto(url);
      
      // 验证错误消息
      await expect(page.locator('[data-testid="error-message"]')).toContainText(testCase.expectedError);
    }
  });

  test('安全头验证', async ({ page }) => {
    const { codeChallenge } = TestHelpers.generatePKCEChallenge();
    
    const authUrl = TestHelpers.generateOAuthAuthorizationUrl(
      testClient.clientId,
      testClient.redirectUris[0],
      'test-state',
      codeChallenge
    );
    
    const response = await page.goto(authUrl);
    
    // 验证安全头
    expect(response?.headers()['x-frame-options']).toBe('DENY');
    expect(response?.headers()['x-content-type-options']).toBe('nosniff');
    expect(response?.headers()['x-xss-protection']).toBe('1; mode=block');
    expect(response?.headers()['strict-transport-security']).toBeTruthy();
  });
});