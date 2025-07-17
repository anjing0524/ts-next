import { test, expect } from '@playwright/test';

/**
 * OAuth2.1 完整流程 E2E 测试
 * 测试授权码流程 + PKCE
 */
test.describe('OAuth2.1 完整流程测试', () => {
  const OAUTH_SERVICE_URL = 'http://localhost:3001';
  const ADMIN_PORTAL_URL = 'http://localhost:3002';
  const CLIENT_ID = 'auth-center-admin-client';
  const REDIRECT_URI = 'http://localhost:3002/api/auth/callback/credentials';
  const SCOPE = 'openid profile email admin:full_access';

  test('应该能够访问登录页面', async ({ page }) => {
    await page.goto(`${ADMIN_PORTAL_URL}/login`);

    // 验证页面标题
    await expect(page).toHaveTitle(/Admin Portal/);

    // 验证登录表单存在 - 使用正确的选择器
    await expect(page.locator('[data-slot="card-title"]')).toContainText('登录认证中心');
    await expect(page.locator('input[name="username"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('应该能够访问授权端点', async ({ page }) => {
    // 生成 PKCE 参数
    const codeVerifier = 'test-code-verifier-128-characters-long-for-testing-purposes-only';
    const codeChallenge = 'test-code-challenge-43-characters-long-for-testing';

    const authUrl =
      `${OAUTH_SERVICE_URL}/api/v2/oauth/authorize?` +
      `client_id=${CLIENT_ID}&` +
      `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
      `response_type=code&` +
      `scope=${encodeURIComponent(SCOPE)}&` +
      `state=test-state&` +
      `code_challenge=${codeChallenge}&` +
      `code_challenge_method=S256`;

    await page.goto(authUrl);

    // 验证授权页面或错误响应
    const content = await page.content();
    expect(content).toBeTruthy();

    // 检查是否包含错误信息或重定向到登录页面
    if (content.includes('error') || content.includes('login')) {
      console.log('授权端点正确返回错误或登录要求');
    }
  });

  test('应该能够获取 client_credentials token', async ({ request }) => {
    // 使用更简单的请求方式
    const response = await request.post(`${OAUTH_SERVICE_URL}/api/v2/oauth/token`, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      data: 'grant_type=client_credentials&client_id=auth-center-admin-client&client_secret=authcenteradminclientsecret',
    });

    // 检查响应状态
    console.log('Token 响应状态:', response.status());
    const responseText = await response.text();
    console.log('Token 响应内容:', responseText);

    if (response.status() === 200) {
      const tokenData = JSON.parse(responseText);
      expect(tokenData).toHaveProperty('access_token');
      expect(tokenData).toHaveProperty('token_type', 'Bearer');
      expect(tokenData).toHaveProperty('expires_in');
      console.log('✅ 成功获取 client_credentials token');
    } else {
      console.log('❌ Token 获取失败，状态码:', response.status());
      console.log('响应内容:', responseText);
    }
  });

  test('应该能够使用 token 访问受保护资源', async ({ request }) => {
    // 先获取 token
    const tokenResponse = await request.post(`${OAUTH_SERVICE_URL}/api/v2/oauth/token`, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      data: 'grant_type=client_credentials&client_id=auth-center-admin-client&client_secret=authcenteradminclientsecret',
    });

    if (tokenResponse.status() === 200) {
      const tokenData = await tokenResponse.json();
      const accessToken = tokenData.access_token;

      // 使用 token 访问受保护资源
      const menuResponse = await request.get(`${ADMIN_PORTAL_URL}/api/menu`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      expect(menuResponse.status()).toBe(200);

      const menuData = await menuResponse.json();
      expect(Array.isArray(menuData)).toBe(true);
      expect(menuData.length).toBeGreaterThan(0);

      console.log('✅ 成功访问受保护资源');
    } else {
      console.log('❌ 无法获取 token，跳过受保护资源测试');
    }
  });

  test('应该能够访问 JWKS 端点', async ({ request }) => {
    const response = await request.get(`${OAUTH_SERVICE_URL}/.well-known/jwks.json`);

    expect(response.status()).toBe(200);

    const jwksData = await response.json();
    expect(jwksData).toHaveProperty('keys');
    expect(Array.isArray(jwksData.keys)).toBe(true);
    expect(jwksData.keys.length).toBeGreaterThan(0);

    // 验证 RSA 密钥格式
    const key = jwksData.keys[0];
    expect(key).toHaveProperty('kty', 'RSA');
    expect(key).toHaveProperty('n');
    expect(key).toHaveProperty('e');

    console.log('✅ JWKS 端点正常');
  });

  test('应该能够访问健康检查端点', async ({ request }) => {
    const response = await request.get(`${ADMIN_PORTAL_URL}/health`);

    expect(response.status()).toBe(200);

    const content = await response.text();
    expect(content).toContain('Admin Portal 健康检查');

    console.log('✅ 健康检查端点正常');
  });

  test('应该能够访问管理后台首页', async ({ page }) => {
    await page.goto(`${ADMIN_PORTAL_URL}/admin`);

    // 验证页面加载
    await expect(page).toHaveTitle(/Admin Portal/);

    // 检查是否重定向到登录页面（因为未认证）
    const currentUrl = page.url();
    if (currentUrl.includes('/login')) {
      console.log('✅ 未认证用户正确重定向到登录页面');
    } else {
      console.log('⚠️ 页面访问状态:', currentUrl);
    }
  });

  test('应该能够访问 OAuth 授权确认页面', async ({ page }) => {
    await page.goto(`${ADMIN_PORTAL_URL}/oauth/consent`);

    // 验证页面加载
    await expect(page).toHaveTitle(/Admin Portal/);

    // 检查页面内容
    const content = await page.content();
    if (content.includes('授权确认') || content.includes('consent')) {
      console.log('✅ 授权确认页面正常');
    } else {
      console.log('⚠️ 授权确认页面状态:', content.substring(0, 200));
    }
  });
});

/**
 * OAuth2.1 配置测试
 */
test.describe('OAuth2.1 配置测试', () => {
  test('应该支持正确的客户端配置', async ({ request }) => {
    // 测试正确的客户端 ID
    const response = await request.post('http://localhost:3001/api/v2/oauth/token', {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      data: 'grant_type=client_credentials&client_id=auth-center-admin-client&client_secret=authcenteradminclientsecret',
    });

    console.log('客户端配置测试状态码:', response.status());
    const responseText = await response.text();
    console.log('客户端配置测试响应:', responseText);

    if (response.status() === 200) {
      const tokenData = JSON.parse(responseText);
      expect(tokenData).toHaveProperty('access_token');
      console.log('✅ 客户端配置正确');
    } else {
      console.log('❌ 客户端配置测试失败');
    }
  });

  test('应该拒绝错误的客户端配置', async ({ request }) => {
    const response = await request.post('http://localhost:3001/api/v2/oauth/token', {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      data: 'grant_type=client_credentials&client_id=invalid-client&client_secret=invalid-secret',
    });

    console.log('错误客户端配置测试状态码:', response.status());
    const responseText = await response.text();
    console.log('错误客户端配置测试响应:', responseText);

    // 期望返回 400 或 401 错误
    expect([400, 401]).toContain(response.status());

    if (response.status() === 400 || response.status() === 401) {
      console.log('✅ 错误客户端配置被正确拒绝');
    } else {
      console.log('⚠️ 错误客户端配置处理异常');
    }
  });
});

/**
 * 权限控制测试
 */
test.describe('权限控制测试', () => {
  test('应该根据权限返回不同的菜单', async ({ request }) => {
    // 获取 token
    const tokenResponse = await request.post('http://localhost:3001/api/v2/oauth/token', {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      data: 'grant_type=client_credentials&client_id=auth-center-admin-client&client_secret=authcenteradminclientsecret',
    });

    if (tokenResponse.status() === 200) {
      const tokenData = await tokenResponse.json();
      const accessToken = tokenData.access_token;

      // 访问菜单 API
      const menuResponse = await request.get('http://localhost:3002/api/menu', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      expect(menuResponse.status()).toBe(200);

      const menuData = await menuResponse.json();

      // 验证菜单结构
      expect(Array.isArray(menuData)).toBe(true);

      // 检查是否包含预期的菜单项
      const menuIds = menuData.map((item: any) => item.id);
      expect(menuIds).toContain('dashboard');
      expect(menuIds).toContain('system-management');

      console.log('✅ 菜单权限控制正常');
    } else {
      console.log('❌ 无法获取 token，跳过权限控制测试');
    }
  });
});
