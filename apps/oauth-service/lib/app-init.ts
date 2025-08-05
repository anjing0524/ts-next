/**
 * 应用初始化模块
 * 在应用启动时执行初始化任务
 */

import { CleanupService } from './auth/services/cleanup-service';

// 全局变量存储清理定时器
let cleanupTimer: NodeJS.Timeout | null = null;

/**
 * 初始化应用
 */
export function initializeApp(): void {
  console.log('[AppInit] Initializing OAuth Service...');
  
  try {
    // 启动定时清理任务（每30分钟执行一次）
    const cleanupInterval = parseInt(process.env.CLEANUP_INTERVAL_MINUTES || '30', 10);
    cleanupTimer = CleanupService.startScheduledCleanup(cleanupInterval);
    
    console.log('[AppInit] OAuth Service initialized successfully');
  } catch (error) {
    console.error('[AppInit] Failed to initialize OAuth Service:', error);
    // 即使初始化失败，也继续运行应用
  }
}

/**
 * 停止应用（清理资源）
 */
export function shutdownApp(): void {
  console.log('[AppInit] Shutting down OAuth Service...');
  
  if (cleanupTimer) {
    CleanupService.stopScheduledCleanup(cleanupTimer);
    cleanupTimer = null;
  }
  
  console.log('[AppInit] OAuth Service shutdown complete');
}

// 在模块加载时自动初始化
if (typeof window === 'undefined') {
  // 仅在服务器端初始化
  initializeApp();
}

// 处理进程退出事件
if (typeof process !== 'undefined' && process.on) {
  process.on('SIGTERM', () => {
    shutdownApp();
    process.exit(0);
  });
  
  process.on('SIGINT', () => {
    shutdownApp();
    process.exit(0);
  });
}