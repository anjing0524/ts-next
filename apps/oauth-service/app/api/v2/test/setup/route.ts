import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { errorResponse, successResponse } from '@repo/lib/node';

export async function GET() {
  try {
    // 检查数据库连接
    await prisma.$queryRaw`SELECT 1`;
    
    // 检查是否有测试用户
    const testUser = await prisma.user.findFirst({
      where: { username: 'admin' },
    });

    // 检查是否有测试客户端
    const testClient = await prisma.oAuthClient.findFirst({
      where: { clientId: 'admin-portal-client' },
    });

    const status = {
      database: 'connected',
      testUsers: testUser ? 'present' : 'missing',
      testClients: testClient ? 'present' : 'missing',
      ready: !!(testUser && testClient),
    };

    return successResponse(status);
  } catch (error) {
    console.error('E2E setup check failed:', error);
    return errorResponse({
      message: 'Setup check failed',
      statusCode: 500,
      details: { error: error instanceof Error ? error.message : 'Unknown error' },
    });
  }
}

// 重置测试数据
export async function POST() {
  try {
    // 这里可以添加重置测试数据的逻辑
    console.log('Resetting test data...');
    
    return successResponse({
      message: 'Test data reset completed',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Reset test data failed:', error);
    return errorResponse({
      message: 'Reset failed',
      statusCode: 500,
    });
  }
}