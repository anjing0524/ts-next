import { execSync } from 'child_process';
import path from 'path';

/**
 * 全局测试设置
 * 在E2E测试开始前初始化测试环境
 */
async function globalSetup() {
  console.log('🚀 开始全局测试设置...');

  // 1. 确保数据库已初始化
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

  // 2. 验证服务健康状态
  console.log('🔍 验证服务健康状态...');
  const maxRetries = 30;
  const retryDelay = 2000; // 2秒

  const checkServiceHealth = async (url: string, serviceName: string) => {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          console.log(`✅ ${serviceName} 服务已就绪`);
          return;
        }
      } catch (error) {
        console.log(`⏳ 等待 ${serviceName} 服务启动... (${i + 1}/${maxRetries})`);
      }
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
    throw new Error(`${serviceName} 服务启动超时`);
  };

  // 等待OAuth服务启动
  await checkServiceHealth('http://localhost:3001/api/v2/health', 'OAuth服务');
  
  // 等待Admin门户启动
  await checkServiceHealth('http://localhost:3002/api/v2/health', 'Admin门户');

  console.log('🎉 全局测试设置完成');
}

export default globalSetup;