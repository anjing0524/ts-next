import { chromium, FullConfig } from '@playwright/test';
import { exec as execCallback } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execCallback);

/**
 * Playwright全局测试设置
 * 在所有测试运行前执行一次
 */
async function globalSetup(config: FullConfig) {
  console.log('🚀 开始全局测试设置...');

  // 创建浏览器实例用于设置
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 检查服务是否可用
    await checkServices();

    // 初始化测试数据库
    await initializeTestDatabase();

    // 获取并设置认证cookie
    await setupAuthCookies(context);

    // 预热应用
    await warmupApplication(page);

    console.log('✅ 全局测试设置完成');
  } catch (error) {
    console.error('❌ 全局测试设置失败:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

/**
 * 检查必要的服务是否运行
 */
async function checkServices() {
  // 使用统一配置获取服务URL
  const adminPortalUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3002';
  const oauthServiceUrl = process.env.NEXT_PUBLIC_OAUTH_SERVICE_URL || 'http://localhost:3001';

  const services = [
    { name: 'admin-portal', url: `${adminPortalUrl}/api/menu` },
    { name: 'oauth-service', url: `${oauthServiceUrl}/api/v2/.well-known/openid-configuration` },
  ];

  for (const service of services) {
    try {
      const response = await fetch(service.url);
      if (!response.ok) {
        throw new Error(`${service.name} 服务健康检查失败: ${response.status}`);
      }
      console.log(`✅ ${service.name} 服务运行正常`);
    } catch (error) {
      console.warn(`⚠️  ${service.name} 服务可能未运行，跳过检查`);
      // 不阻止测试继续进行
    }
  }
}

/**
 * 初始化测试数据库
 */
async function initializeTestDatabase() {
  try {
    // 这里可以设置测试数据库的初始化逻辑
    // 例如运行迁移、种子数据等
    console.log('📊 测试数据库初始化...');

    // 可以调用 Prisma 迁移或其他数据库设置
    await exec('pnpm --filter @repo/database db:migrate');
    await exec('pnpm --filter @repo/database db:seed');

    console.log('✅ 测试数据库初始化完成');
  } catch (error) {
    console.warn(
      '⚠️  测试数据库初始化失败，跳过:',
      error instanceof Error ? error.message : String(error)
    );
  }
}

/**
 * 获取并设置认证cookie
 */
async function setupAuthCookies(context: any) {
  console.log('🍪 获取并设置认证cookie...');
  const oauthServiceUrl = process.env.NEXT_PUBLIC_OAUTH_SERVICE_URL || 'http://localhost:3001';

  try {
    // 模拟登录请求以获取认证cookie
    const response = await fetch(`${oauthServiceUrl}/api/v2/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'password',
        username: 'admin@example.com',
        password: 'adminpassword',
        client_id: process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID || 'auth-center-admin-client',
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(`Failed to get access token: ${errorData.message}`);
    }

    const tokenData = await response.json();

    // 将获取到的token作为cookie设置到browserContext中
    await context.addCookies([
      {
        name: 'oauth_access_token',
        value: tokenData.access_token,
        domain: 'localhost',
        path: '/',
        expires: -1,
        httpOnly: false,
        secure: false,
      },
      {
        name: 'oauth_refresh_token',
        value: tokenData.refresh_token,
        domain: 'localhost',
        path: '/',
        expires: -1,
        httpOnly: false,
        secure: false,
      },
    ]);

    console.log('✅ 认证cookie设置成功');
  } catch (error) {
    console.error('❌ 认证cookie设置失败:', error);
    throw error;
  }
}

/**
 * 预热应用
 */
async function warmupApplication(page: any) {
  try {
    // 访问登录页面预热应用
    await page.goto('http://localhost:3002/login', { timeout: 30000 });
    console.log('🔥 应用预热完成');
  } catch (error) {
    console.warn('⚠️  应用预热失败:', error instanceof Error ? error.message : String(error));
  }
}

export default globalSetup;
