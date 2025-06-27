import { FullConfig } from '@playwright/test';

/**
 * Playwright全局测试清理函数
 * 在所有测试完成后执行清理工作
 */
export default async function globalTeardown(config: FullConfig) {
  console.log('🧹 开始全局测试清理...');

  try {
    // 清理测试过程中生成的临时文件
    // 这里可以添加具体的清理逻辑，比如：
    // - 清理测试数据库
    // - 删除临时文件
    // - 关闭测试服务器等

    console.log('✅ 全局测试清理完成');
  } catch (error) {
    console.error('❌ 全局测试清理失败:', error);
    throw error;
  }
}
