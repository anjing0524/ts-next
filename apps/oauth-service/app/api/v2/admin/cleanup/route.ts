/**
 * 清理 API 端点
 * 提供手动清理过期货物的功能
 */

import { NextRequest, NextResponse } from 'next/server';
import { CleanupService } from '@/lib/auth/services/cleanup-service';
import { withErrorHandling } from '@repo/lib/node';

/**
 * 手动触发清理的内部处理函数
 */
async function cleanupHandlerInternal(_request: NextRequest): Promise<NextResponse> {
  // 执行清理操作
  const result = await CleanupService.performCleanup();
  
  return NextResponse.json({
    success: true,
    message: 'Cleanup completed successfully',
    data: result
  });
}

// 使用错误处理包装器
export const POST = withErrorHandling(cleanupHandlerInternal);

// GET 方法也支持，便于测试
export const GET = withErrorHandling(cleanupHandlerInternal);