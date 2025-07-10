import { test, expect } from '@playwright/test';

/**
 * Admin-Portal 与 OAuth-Service 集成 E2E 测试
 * 
 * 测试目标：
 * 1. 验证两个服务的健康状态
 * 2. 验证OAuth认证流程
 * 3. 验证页面访问权限
 * 4. 验证API集成
 * 5. 验证错误处理
 */

const OAUTH_SERVICE_URL = 'http://localhost:3001';
const ADMIN_PORTAL_URL = 'http://localhost:3002';

test.describe('Admin-Portal 与 OAuth-Service 集成测试', () => {
  
  test.beforeEach(async ({ page }) => {
    // 设置页面超时时间
    page.setDefaultTimeout(30000);
  });

  test('TC-001: 服务健康检查', async ({ page }) => {
    // 测试 oauth-service 健康检查
    const oauthResponse = await page.request.get(`${OAUTH_SERVICE_URL}/api/v2/health`);
    expect(oauthResponse.status()).toBe(200);
    
    const oauthData = await oauthResponse.json();
    expect(oauthData.status).toBe('ok');
    
    // 测试 admin-portal 健康检查
    const adminResponse = await page.request.get(`${ADMIN_PORTAL_URL}/health`);
    expect(adminResponse.status()).toBe(200);
  });

  test('TC-002: OAuth认证流程', async ({ page }) => {
    // 访问 admin-portal 登录页面
    await page.goto(`${ADMIN_PORTAL_URL}/login`);
    
    // 等待页面加载
    await page.waitForLoadState('networkidle');
    
    // 验证登录页面元素存在
    await expect(page.locator('h1')).toContainText('登录');
    
    // 填写登录表单
    await page.fill('input[name="email"]', 'admin@example.com');
    await page.fill('input[name="password"]', 'password123');
    
    // 点击登录按钮
    await page.click('button[type="submit"]');
    
    // 等待重定向到 oauth-service
    await page.waitForURL(`${OAUTH_SERVICE_URL}/**`);
    
    // 验证 oauth-service 授权页面
    await expect(page.locator('h1')).toContainText('授权');
    
    // 点击授权按钮
    await page.click('button:has-text("授权")');
    
    // 等待重定向回 admin-portal
    await page.waitForURL(`${ADMIN_PORTAL_URL}/**`);
    
    // 验证登录成功，重定向到仪表盘
    await expect(page).toHaveURL(`${ADMIN_PORTAL_URL}/admin/dashboard`);
  });

  test('TC-003: 页面访问权限测试', async ({ page }) => {
    // 先登录系统
    await page.goto(`${ADMIN_PORTAL_URL}/login`);
    await page.fill('input[name="email"]', 'admin@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    
    // 等待登录完成
    await page.waitForURL(`${ADMIN_PORTAL_URL}/admin/dashboard`);
    
    // 测试用户管理页面访问
    await page.goto(`${ADMIN_PORTAL_URL}/admin/users`);
    await expect(page.locator('h1')).toContainText('用户管理');
    
    // 测试角色管理页面访问
    await page.goto(`${ADMIN_PORTAL_URL}/admin/roles`);
    await expect(page.locator('h1')).toContainText('角色管理');
    
    // 测试权限管理页面访问
    await page.goto(`${ADMIN_PORTAL_URL}/admin/permissions`);
    await expect(page.locator('h1')).toContainText('权限管理');
    
    // 测试客户端管理页面访问
    await page.goto(`${ADMIN_PORTAL_URL}/admin/clients`);
    await expect(page.locator('h1')).toContainText('客户端管理');
  });

  test('TC-004: API集成测试', async ({ page }) => {
    // 使用 client_credentials grant 获取访问令牌
    const tokenResponse = await page.request.post(`${OAUTH_SERVICE_URL}/api/v2/oauth/token`, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      data: {
        grant_type: 'client_credentials',
        client_id: 'auth-center-admin-client',
        client_secret: 'admin-secret'
      }
    });
    
    expect(tokenResponse.status()).toBe(200);
    const tokenData = await tokenResponse.json();
    expect(tokenData.access_token).toBeDefined();
    
    // 使用令牌调用用户信息API
    const userResponse = await page.request.get(`${OAUTH_SERVICE_URL}/api/v2/user/info`, {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`
      }
    });
    
    expect(userResponse.status()).toBe(200);
    const userData = await userResponse.json();
    expect(userData.email).toBe('admin@example.com');
    
    // 调用权限验证API
    const permissionResponse = await page.request.post(`${OAUTH_SERVICE_URL}/api/v2/auth/verify`, {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        token: tokenData.access_token,
        permission: 'user:read'
      }
    });
    
    expect(permissionResponse.status()).toBe(200);
  });

  test('TC-005: 错误处理测试', async ({ page }) => {
    // 测试无效令牌访问
    const invalidTokenResponse = await page.request.get(`${OAUTH_SERVICE_URL}/api/v2/user/info`, {
      headers: {
        'Authorization': 'Bearer invalid-token'
      }
    });
    
    expect(invalidTokenResponse.status()).toBe(401);
    
    // 测试访问不存在的页面
    const notFoundResponse = await page.request.get(`${ADMIN_PORTAL_URL}/non-existent-page`);
    expect(notFoundResponse.status()).toBe(404);
    
    // 测试无效登录凭据
    await page.goto(`${ADMIN_PORTAL_URL}/login`);
    await page.fill('input[name="email"]', 'invalid@example.com');
    await page.fill('input[name="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');
    
    // 验证错误消息显示
    await expect(page.locator('.error-message')).toBeVisible();
  });

  test('TC-006: 用户管理功能测试', async ({ page }) => {
    // 登录系统
    await page.goto(`${ADMIN_PORTAL_URL}/login`);
    await page.fill('input[name="email"]', 'admin@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL(`${ADMIN_PORTAL_URL}/admin/dashboard`);
    
    // 访问用户管理页面
    await page.goto(`${ADMIN_PORTAL_URL}/admin/users`);
    
    // 验证用户列表加载
    await expect(page.locator('.user-list')).toBeVisible();
    
    // 测试创建用户功能
    await page.click('button:has-text("创建用户")');
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="name"]', '测试用户');
    await page.selectOption('select[name="role"]', 'user');
    await page.click('button:has-text("保存")');
    
    // 验证用户创建成功
    await expect(page.locator('.success-message')).toBeVisible();
  });

  test('TC-007: 角色管理功能测试', async ({ page }) => {
    // 登录系统
    await page.goto(`${ADMIN_PORTAL_URL}/login`);
    await page.fill('input[name="email"]', 'admin@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL(`${ADMIN_PORTAL_URL}/admin/dashboard`);
    
    // 访问角色管理页面
    await page.goto(`${ADMIN_PORTAL_URL}/admin/roles`);
    
    // 验证角色列表加载
    await expect(page.locator('.role-list')).toBeVisible();
    
    // 测试创建角色功能
    await page.click('button:has-text("创建角色")');
    await page.fill('input[name="name"]', '测试角色');
    await page.fill('input[name="description"]', '测试角色描述');
    await page.click('button:has-text("保存")');
    
    // 验证角色创建成功
    await expect(page.locator('.success-message')).toBeVisible();
  });

  test('TC-008: 客户端管理功能测试', async ({ page }) => {
    // 登录系统
    await page.goto(`${ADMIN_PORTAL_URL}/login`);
    await page.fill('input[name="email"]', 'admin@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL(`${ADMIN_PORTAL_URL}/admin/dashboard`);
    
    // 访问客户端管理页面
    await page.goto(`${ADMIN_PORTAL_URL}/admin/clients`);
    
    // 验证客户端列表加载
    await expect(page.locator('.client-list')).toBeVisible();
    
    // 测试创建客户端功能
    await page.click('button:has-text("创建客户端")');
    await page.fill('input[name="name"]', '测试客户端');
    await page.fill('input[name="redirectUri"]', 'http://localhost:3000/callback');
    await page.click('button:has-text("保存")');
    
    // 验证客户端创建成功
    await expect(page.locator('.success-message')).toBeVisible();
  });

  test('TC-009: 审计日志功能测试', async ({ page }) => {
    // 登录系统
    await page.goto(`${ADMIN_PORTAL_URL}/login`);
    await page.fill('input[name="email"]', 'admin@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL(`${ADMIN_PORTAL_URL}/admin/dashboard`);
    
    // 访问审计日志页面
    await page.goto(`${ADMIN_PORTAL_URL}/admin/audit`);
    
    // 验证日志列表加载
    await expect(page.locator('.audit-list')).toBeVisible();
    
    // 测试日志过滤功能
    await page.fill('input[name="search"]', 'login');
    await page.click('button:has-text("搜索")');
    
    // 验证过滤结果
    await expect(page.locator('.audit-item')).toHaveCount(1);
  });

  test('TC-010: 性能测试', async ({ page }) => {
    // 测试页面加载性能
    const startTime = Date.now();
    await page.goto(`${ADMIN_PORTAL_URL}/login`);
    const loadTime = Date.now() - startTime;
    
    // 验证页面加载时间小于3秒
    expect(loadTime).toBeLessThan(3000);
    
    // 测试API响应性能
    const apiStartTime = Date.now();
    const response = await page.request.get(`${OAUTH_SERVICE_URL}/api/v2/health`);
    const apiResponseTime = Date.now() - apiStartTime;
    
    // 验证API响应时间小于1秒
    expect(apiResponseTime).toBeLessThan(1000);
    expect(response.status()).toBe(200);
  });
}); 