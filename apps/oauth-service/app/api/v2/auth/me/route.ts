import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, successResponse } from '@repo/lib/node';
import { authenticateBearer } from '@/lib/auth/bearer-auth';
import { getServiceContainer } from '@/lib/auth/service-container';

export async function GET(req: NextRequest) {
  try {
    const authResult = await authenticateBearer(req, {
      requireUserContext: true,
    });

    if (!authResult.success) {
      return authResult.response || errorResponse({
        message: '认证失败',
        statusCode: 401,
        details: { code: 'authentication_failed' },
      });
    }

    const { context } = authResult;
    if (!context?.user_id) {
      return errorResponse({
        message: '用户上下文缺失',
        statusCode: 401,
        details: { code: 'user_context_missing' },
      });
    }

    const container = getServiceContainer();
    const userService = container.getUserService();
    const user = await userService.getUserById(context.user_id);
    
    if (!user) {
      return errorResponse({
        message: '用户不存在',
        statusCode: 404,
        details: { code: 'user_not_found' },
      });
    }

    return successResponse({
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      permissions: context.permissions || [],
      scope: context.scopes.join(' '),
    });
  } catch (error) {
    console.error('获取当前用户信息失败:', error);
    return errorResponse({
      message: '服务器内部错误',
      statusCode: 500,
    });
  }
}