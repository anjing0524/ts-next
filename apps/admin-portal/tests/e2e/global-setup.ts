import { execSync } from 'child_process';
import path from 'path';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * 全局测试设置
 * 在E2E测试开始前初始化测试环境
 */
async function globalSetup() {
  console.log('🚀 开始全局测试设置...');

  // 1. 创建测试报告目录
  const testResultsDir = join(process.cwd(), 'test-results');
  const screenshotsDir = join(testResultsDir, 'screenshots');
  const tracesDir = join(testResultsDir, 'traces');
  
  [testResultsDir, screenshotsDir, tracesDir].forEach(dir => {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  });

  // 2. 生成测试配置文件
  const testConfig = {
    testStartTime: new Date().toISOString(),
    testEnvironment: process.env.NODE_ENV || 'test',
    services: {
      oauth: { url: 'http://localhost:3001', port: 3001 },
      adminPortal: { url: 'http://localhost:3002', port: 3002 },
      klineService: { url: 'http://localhost:3003', port: 3003 },
      proxy: { url: 'http://localhost:6188', port: 6188 }
    },
    testUsers: {
      admin: { username: 'admin', roles: ['SYSTEM_ADMIN'] },
      userAdmin: { username: 'useradmin', roles: ['USER_ADMIN'] },
      regularUser: { username: 'testuser', roles: ['USER'] }
    }
  };

  writeFileSync(
    join(testResultsDir, 'test-config.json'),
    JSON.stringify(testConfig, null, 2)
  );

  // 3. 确保数据库已初始化
  console.log('📊 初始化测试数据库...');
  try {
    // 使用直接命令避免turbo问题
    execSync('cd ../../packages/database && npx prisma generate && npx prisma db push --force-reset && npx tsx prisma/seed.ts', {
      stdio: 'inherit',
    });
    console.log('✅ 数据库初始化完成');
  } catch (error) {
    console.error('❌ 数据库初始化失败:', error);
    throw error;
  }

  // 4. 验证服务健康状态
  console.log('🔍 验证服务健康状态...');
  const maxRetries = 30;
  const retryDelay = 2000; // 2秒

  const checkServiceHealth = async (url: string, serviceName: string) => {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          const text = await response.text();
          let healthData: any;
          try {
            healthData = JSON.parse(text);
          } catch {
            healthData = { status: text.trim() || 'healthy' };
          }
          console.log(`✅ ${serviceName} 服务已就绪 (${healthData.status || 'healthy'})`);
          return healthData;
        }
      } catch (error) {
        console.log(`⏳ 等待 ${serviceName} 服务启动... (${i + 1}/${maxRetries})`);
      }
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
    throw new Error(`${serviceName} 服务启动超时`);
  };

  // 等待OAuth服务启动
  const oauthHealth = await checkServiceHealth('http://localhost:3001/health', 'OAuth服务');
  
  // 等待Admin门户启动 - 使用页面健康检查
  const adminHealth = await checkServiceHealth('http://localhost:3002/api/health', 'Admin门户');

  // 5. 验证数据库连接
  console.log('🔍 验证数据库连接...');
  try {
    // Database health is included in the main health check response
    const healthCheck = await fetch('http://localhost:3001/health');
    if (healthCheck.ok) {
      const text = await healthCheck.text();
      if (text.includes('OK') || text.includes('healthy')) {
        console.log('✅ 数据库连接正常');
      } else {
        console.warn('⚠️  数据库连接检查失败，但继续测试');
      }
    } else {
      console.warn('⚠️  数据库连接检查失败，但继续测试');
    }
  } catch (error) {
    console.warn('⚠️  数据库连接检查失败，但继续测试');
  }

  // 6. 验证Redis连接（如果配置）
  console.log('🔍 验证Redis连接...');
  try {
    // Redis health is included in the main health check response
    const healthCheck = await fetch('http://localhost:3001/api/v2/health');
    if (healthCheck.ok) {
      const healthData = await healthCheck.json();
      if (healthData.services?.redis === 'healthy') {
        console.log('✅ Redis连接正常');
      } else {
        console.warn('⚠️  Redis连接检查失败，但继续测试');
      }
    } else {
      console.warn('⚠️  Redis连接检查失败，但继续测试');
    }
  } catch (error) {
    console.warn('⚠️  Redis连接检查失败，但继续测试');
  }

  // 7. 创建测试会话状态文件
  const sessionState = {
    sessions: {},
    testResults: [],
    startTime: Date.now()
  };

  writeFileSync(
    join(testResultsDir, 'session-state.json'),
    JSON.stringify(sessionState, null, 2)
  );

  // 8. 预热OAuth服务（可选）
  console.log('🔥 预热OAuth服务...');
  try {
    await fetch('http://localhost:3001/api/v2/oauth/jwks');
    console.log('✅ OAuth服务预热完成');
  } catch (error) {
    console.warn('⚠️  OAuth服务预热失败，但继续测试');
  }

  // 9. 记录环境变量
  const envVars = {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL ? '***configured***' : 'not set',
    REDIS_URL: process.env.REDIS_URL ? '***configured***' : 'not set',
    JWT_SECRET: process.env.JWT_SECRET ? '***configured***' : 'not set',
    NEXT_PUBLIC_OAUTH_SERVICE_URL: process.env.NEXT_PUBLIC_OAUTH_SERVICE_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL
  };

  writeFileSync(
    join(testResultsDir, 'environment-vars.json'),
    JSON.stringify(envVars, null, 2)
  );

  console.log('🎉 全局测试设置完成');
  console.log(`📁 测试结果目录: ${testResultsDir}`);
  console.log(`🖼️  截图目录: ${screenshotsDir}`);
  console.log(`🔍 跟踪目录: ${tracesDir}`);
}

export default globalSetup;