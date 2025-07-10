import { test, expect } from '@playwright/test';

/**
 * Admin-Portal 与 OAuth-Service 基础集成测试
 * 
 * 测试目标：
 * 1. 验证两个服务的健康状态
 * 2. 验证基本页面访问
 * 3. 验证服务间通信
 */

const OAUTH_SERVICE_URL = 'http://localhost:3001';
const ADMIN_PORTAL_URL = 'http://localhost:3002';

test.describe('Admin-Portal 与 OAuth-Service 基础集成测试', () => {
  
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

  test('TC-002: 测试页面访问', async ({ page }) => {
    // 测试 admin-portal 主页
    await page.goto(`${ADMIN_PORTAL_URL}/`);
    await expect(page).toHaveTitle(/Admin Portal/);
    
    // 测试登录页面
    await page.goto(`${ADMIN_PORTAL_URL}/login`);
    await expect(page).toHaveTitle(/Admin Portal/);
    
    // 测试健康检查页面
    await page.goto(`${ADMIN_PORTAL_URL}/health`);
    // 等待页面加载完成
    await page.waitForLoadState('networkidle');
    
    // 检查页面是否包含健康检查相关内容
    const pageContent = await page.content();
    expect(pageContent).toContain('Admin Portal');
  });

  test('TC-003: OAuth服务API测试', async ({ page }) => {
    // 测试 oauth-service 测试端点
    const testResponse = await page.request.get(`${OAUTH_SERVICE_URL}/api/v2/test`);
    expect(testResponse.status()).toBe(200);
    
    const testData = await testResponse.json();
    expect(testData.status).toBe('ok');
    expect(testData.message).toBe('Test endpoint working');
  });

  test('TC-004: 服务间通信测试', async ({ page }) => {
    // 测试 admin-portal 是否能访问 oauth-service
    const response = await page.request.get(`${OAUTH_SERVICE_URL}/api/v2/health`);
    expect(response.status()).toBe(200);
    
    // 测试 admin-portal 是否能访问自己的API
    const adminResponse = await page.request.get(`${ADMIN_PORTAL_URL}/health`);
    expect(adminResponse.status()).toBe(200);
  });

  test('TC-005: 错误页面测试', async ({ page }) => {
    // 测试404页面
    const notFoundResponse = await page.request.get(`${ADMIN_PORTAL_URL}/non-existent-page`);
    expect(notFoundResponse.status()).toBe(404);
    
    // 测试 oauth-service 404页面
    const oauthNotFoundResponse = await page.request.get(`${OAUTH_SERVICE_URL}/api/v2/non-existent`);
    expect(oauthNotFoundResponse.status()).toBe(404);
  });

  test('TC-006: 性能测试', async ({ page }) => {
    // 测试页面加载性能
    const startTime = Date.now();
    await page.goto(`${ADMIN_PORTAL_URL}/health`);
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