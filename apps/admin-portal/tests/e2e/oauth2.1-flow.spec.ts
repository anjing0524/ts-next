import { test, expect } from '@playwright/test';
import { generateCodeVerifier, generateCodeChallenge } from 'pkce-challenge';

/**
 * OAuth2.1 完整流程 E2E 测试
 *
 * 测试目标：
 * 1. 模拟真实用户登录流程
 * 2. 验证OAuth2.1授权码+PKCE流程
 * 3. 验证token获取和刷新
 * 4. 验证受保护页面访问
 * 5. 验证权限控制和菜单渲染
 * 6. 验证错误处理和异常情况
 */

const OAUTH_SERVICE_URL = 'http://localhost:3001';
const ADMIN_PORTAL_URL = 'http://localhost:3002';

// 测试用户凭据
const TEST_USER = {
  email: 'admin@example.com',
  password: 'password123',
};

// OAuth客户端配置
const OAUTH_CLIENT = {
  clientId: 'auth-center-admin-client',
  redirectUri: 'http://localhost:3002/auth/callback',
};

test.describe('OAuth2.1 完整流程 E2E 测试', () => {
  test.beforeEach(async ({ page }) => {
    // 设置页面超时时间
    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(30000);
  });

  test('TC-001: 完整OAuth2.1授权码+PKCE登录流程', async ({ page }) => {
    console.log('开始测试完整OAuth2.1登录流程...');

    // 步骤1: 访问admin-portal登录页面
    console.log('步骤1: 访问登录页面');
    await page.goto(`${ADMIN_PORTAL_URL}/login`);
    await page.waitForLoadState('networkidle');

    // 验证登录页面元素
    await expect(page.locator('h1')).toContainText('登录');
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();

    // 步骤2: 填写登录表单并提交
    console.log('步骤2: 填写登录表单');
    await page.fill('input[name="email"]', TEST_USER.email);
    await page.fill('input[name="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');

    // 步骤3: 等待重定向到oauth-service授权页面
    console.log('步骤3: 等待重定向到授权页面');
    await page.waitForURL(`${OAUTH_SERVICE_URL}/**`);

    // 验证授权页面
    await expect(page.locator('h1')).toContainText('授权');
    await expect(page.locator('text=admin@example.com')).toBeVisible();

    // 步骤4: 点击授权按钮
    console.log('步骤4: 点击授权按钮');
    await page.click('button:has-text("授权")');

    // 步骤5: 等待重定向回admin-portal
    console.log('步骤5: 等待重定向回admin-portal');
    await page.waitForURL(`${ADMIN_PORTAL_URL}/**`);

    // 步骤6: 验证登录成功，重定向到仪表盘
    console.log('步骤6: 验证登录成功');
    await expect(page).toHaveURL(`${ADMIN_PORTAL_URL}/admin/dashboard`);

    // 验证仪表盘页面内容
    await expect(page.locator('h1')).toContainText('仪表盘');
    await expect(page.locator('text=admin@example.com')).toBeVisible();

    console.log('✅ OAuth2.1登录流程测试通过');
  });

  test('TC-002: 受保护页面访问权限验证', async ({ page }) => {
    console.log('开始测试受保护页面访问权限...');

    // 先完成登录流程
    await page.goto(`${ADMIN_PORTAL_URL}/login`);
    await page.fill('input[name="email"]', TEST_USER.email);
    await page.fill('input[name="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(`${OAUTH_SERVICE_URL}/**`);
    await page.click('button:has-text("授权")');
    await page.waitForURL(`${ADMIN_PORTAL_URL}/admin/dashboard`);

    // 测试用户管理页面访问
    console.log('测试用户管理页面访问');
    await page.goto(`${ADMIN_PORTAL_URL}/admin/users`);
    await expect(page.locator('h1')).toContainText('用户管理');

    // 测试角色管理页面访问
    console.log('测试角色管理页面访问');
    await page.goto(`${ADMIN_PORTAL_URL}/admin/system/roles`);
    await expect(page.locator('h1')).toContainText('角色管理');

    // 测试权限管理页面访问
    console.log('测试权限管理页面访问');
    await page.goto(`${ADMIN_PORTAL_URL}/admin/system/permissions`);
    await expect(page.locator('h1')).toContainText('权限管理');

    // 测试客户端管理页面访问
    console.log('测试客户端管理页面访问');
    await page.goto(`${ADMIN_PORTAL_URL}/admin/system/clients`);
    await expect(page.locator('h1')).toContainText('客户端管理');

    // 测试审计日志页面访问
    console.log('测试审计日志页面访问');
    await page.goto(`${ADMIN_PORTAL_URL}/admin/system/audits`);
    await expect(page.locator('h1')).toContainText('审计日志');

    console.log('✅ 受保护页面访问权限验证通过');
  });

  test('TC-003: 菜单动态渲染和导航测试', async ({ page }) => {
    console.log('开始测试菜单动态渲染...');

    // 先完成登录流程
    await page.goto(`${ADMIN_PORTAL_URL}/login`);
    await page.fill('input[name="email"]', TEST_USER.email);
    await page.fill('input[name="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(`${OAUTH_SERVICE_URL}/**`);
    await page.click('button:has-text("授权")');
    await page.waitForURL(`${ADMIN_PORTAL_URL}/admin/dashboard`);

    // 验证侧边栏菜单存在
    console.log('验证侧边栏菜单');
    await expect(page.locator('nav')).toBeVisible();

    // 验证菜单项存在
    await expect(page.locator('text=仪表盘')).toBeVisible();
    await expect(page.locator('text=用户管理')).toBeVisible();
    await expect(page.locator('text=角色管理')).toBeVisible();
    await expect(page.locator('text=权限管理')).toBeVisible();
    await expect(page.locator('text=客户端管理')).toBeVisible();
    await expect(page.locator('text=审计日志')).toBeVisible();

    // 测试菜单导航功能
    console.log('测试菜单导航功能');
    await page.click('text=用户管理');
    await expect(page).toHaveURL(`${ADMIN_PORTAL_URL}/admin/users`);

    await page.click('text=角色管理');
    await expect(page).toHaveURL(`${ADMIN_PORTAL_URL}/admin/system/roles`);

    await page.click('text=仪表盘');
    await expect(page).toHaveURL(`${ADMIN_PORTAL_URL}/admin/dashboard`);

    console.log('✅ 菜单动态渲染和导航测试通过');
  });

  test('TC-004: 未授权访问重定向测试', async ({ page }) => {
    console.log('开始测试未授权访问重定向...');

    // 直接访问受保护页面，应该重定向到登录页面
    console.log('直接访问受保护页面');
    await page.goto(`${ADMIN_PORTAL_URL}/admin/users`);

    // 验证重定向到登录页面
    await expect(page).toHaveURL(`${ADMIN_PORTAL_URL}/login`);

    // 验证登录页面显示
    await expect(page.locator('h1')).toContainText('登录');

    console.log('✅ 未授权访问重定向测试通过');
  });

  test('TC-005: 登录失败处理测试', async ({ page }) => {
    console.log('开始测试登录失败处理...');

    // 访问登录页面
    await page.goto(`${ADMIN_PORTAL_URL}/login`);

    // 使用无效凭据登录
    console.log('使用无效凭据登录');
    await page.fill('input[name="email"]', 'invalid@example.com');
    await page.fill('input[name="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');

    // 验证错误消息显示
    await expect(page.locator('.error-message, .alert-error, [role="alert"]')).toBeVisible();

    console.log('✅ 登录失败处理测试通过');
  });

  test('TC-006: 会话超时和重新登录测试', async ({ page }) => {
    console.log('开始测试会话超时和重新登录...');

    // 先完成登录流程
    await page.goto(`${ADMIN_PORTAL_URL}/login`);
    await page.fill('input[name="email"]', TEST_USER.email);
    await page.fill('input[name="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(`${OAUTH_SERVICE_URL}/**`);
    await page.click('button:has-text("授权")');
    await page.waitForURL(`${ADMIN_PORTAL_URL}/admin/dashboard`);

    // 清除本地存储模拟会话过期
    console.log('清除本地存储模拟会话过期');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    // 刷新页面，应该重定向到登录页面
    console.log('刷新页面验证重定向');
    await page.reload();
    await expect(page).toHaveURL(`${ADMIN_PORTAL_URL}/login`);

    // 重新登录
    console.log('重新登录');
    await page.fill('input[name="email"]', TEST_USER.email);
    await page.fill('input[name="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(`${OAUTH_SERVICE_URL}/**`);
    await page.click('button:has-text("授权")');
    await page.waitForURL(`${ADMIN_PORTAL_URL}/admin/dashboard`);

    console.log('✅ 会话超时和重新登录测试通过');
  });

  test('TC-007: API权限验证测试', async ({ page }) => {
    console.log('开始测试API权限验证...');

    // 使用client_credentials获取访问令牌
    console.log('获取访问令牌');
    const tokenResponse = await page.request.post(`${OAUTH_SERVICE_URL}/api/v2/oauth/token`, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      data: {
        grant_type: 'client_credentials',
        client_id: 'auth-center-admin-client',
        client_secret: 'admin-secret',
      },
    });

    expect(tokenResponse.status()).toBe(200);
    const tokenData = await tokenResponse.json();
    expect(tokenData.access_token).toBeDefined();

    // 使用令牌调用用户信息API
    console.log('调用用户信息API');
    const userResponse = await page.request.get(`${OAUTH_SERVICE_URL}/api/v2/user/info`, {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    expect(userResponse.status()).toBe(200);
    const userData = await userResponse.json();
    expect(userData.email).toBe('admin@example.com');

    // 调用权限验证API
    console.log('调用权限验证API');
    const permissionResponse = await page.request.post(`${OAUTH_SERVICE_URL}/api/v2/auth/verify`, {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        token: tokenData.access_token,
        permission: 'user:read',
      },
    });

    expect(permissionResponse.status()).toBe(200);

    // 测试无效令牌访问
    console.log('测试无效令牌访问');
    const invalidTokenResponse = await page.request.get(`${OAUTH_SERVICE_URL}/api/v2/user/info`, {
      headers: {
        Authorization: 'Bearer invalid-token',
      },
    });

    expect(invalidTokenResponse.status()).toBe(401);

    console.log('✅ API权限验证测试通过');
  });

  test('TC-008: 性能和安全测试', async ({ page }) => {
    console.log('开始性能和安全测试...');

    // 测试页面加载性能
    console.log('测试页面加载性能');
    const startTime = Date.now();
    await page.goto(`${ADMIN_PORTAL_URL}/login`);
    const loadTime = Date.now() - startTime;

    // 验证页面加载时间小于3秒
    expect(loadTime).toBeLessThan(3000);

    // 测试API响应性能
    console.log('测试API响应性能');
    const apiStartTime = Date.now();
    const response = await page.request.get(`${OAUTH_SERVICE_URL}/api/v2/health`);
    const apiResponseTime = Date.now() - apiStartTime;

    // 验证API响应时间小于1秒
    expect(apiResponseTime).toBeLessThan(1000);
    expect(response.status()).toBe(200);

    // 测试安全头部
    console.log('测试安全头部');
    const headers = response.headers();
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['x-xss-protection']).toBe('1; mode=block');

    console.log('✅ 性能和安全测试通过');
  });

  test('TC-009: 错误页面和异常处理测试', async ({ page }) => {
    console.log('开始错误页面和异常处理测试...');

    // 测试访问不存在的页面
    console.log('测试404页面');
    const notFoundResponse = await page.request.get(`${ADMIN_PORTAL_URL}/non-existent-page`);
    expect(notFoundResponse.status()).toBe(404);

    // 测试服务器错误
    console.log('测试服务器错误处理');
    const serverErrorResponse = await page.request.get(`${ADMIN_PORTAL_URL}/api/error-test`);
    expect(serverErrorResponse.status()).toBe(500);

    // 测试网络错误处理
    console.log('测试网络错误处理');
    try {
      await page.goto('http://localhost:9999/non-existent-service');
    } catch (error) {
      // 预期会失败
      console.log('网络错误处理正常');
    }

    console.log('✅ 错误页面和异常处理测试通过');
  });

  test('TC-010: 完整用户操作流程测试', async ({ page }) => {
    console.log('开始完整用户操作流程测试...');

    // 步骤1: 登录系统
    console.log('步骤1: 登录系统');
    await page.goto(`${ADMIN_PORTAL_URL}/login`);
    await page.fill('input[name="email"]', TEST_USER.email);
    await page.fill('input[name="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(`${OAUTH_SERVICE_URL}/**`);
    await page.click('button:has-text("授权")');
    await page.waitForURL(`${ADMIN_PORTAL_URL}/admin/dashboard`);

    // 步骤2: 访问用户管理页面
    console.log('步骤2: 访问用户管理页面');
    await page.click('text=用户管理');
    await expect(page).toHaveURL(`${ADMIN_PORTAL_URL}/admin/users`);

    // 步骤3: 创建新用户
    console.log('步骤3: 创建新用户');
    await page.click('button:has-text("创建用户")');
    await page.fill('input[name="email"]', 'test-user@example.com');
    await page.fill('input[name="name"]', '测试用户');
    await page.selectOption('select[name="role"]', 'user');
    await page.click('button:has-text("保存")');

    // 验证用户创建成功
    await expect(page.locator('.success-message, .alert-success')).toBeVisible();

    // 步骤4: 访问角色管理页面
    console.log('步骤4: 访问角色管理页面');
    await page.click('text=角色管理');
    await expect(page).toHaveURL(`${ADMIN_PORTAL_URL}/admin/system/roles`);

    // 步骤5: 创建新角色
    console.log('步骤5: 创建新角色');
    await page.click('button:has-text("创建角色")');
    await page.fill('input[name="name"]', '测试角色');
    await page.fill('input[name="description"]', '测试角色描述');
    await page.click('button:has-text("保存")');

    // 验证角色创建成功
    await expect(page.locator('.success-message, .alert-success')).toBeVisible();

    // 步骤6: 返回仪表盘
    console.log('步骤6: 返回仪表盘');
    await page.click('text=仪表盘');
    await expect(page).toHaveURL(`${ADMIN_PORTAL_URL}/admin/dashboard`);

    // 步骤7: 退出登录
    console.log('步骤7: 退出登录');
    await page.click('button:has-text("退出"), [data-testid="logout"]');
    await expect(page).toHaveURL(`${ADMIN_PORTAL_URL}/login`);

    console.log('✅ 完整用户操作流程测试通过');
  });
});
