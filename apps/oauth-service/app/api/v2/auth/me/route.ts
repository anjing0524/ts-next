import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, successResponse } from '@repo/lib/node';
import { getServiceContainer } from '@/lib/auth/service-container';

export async function GET(req: NextRequest) {
  try {
    const authorization = req.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) {
      return errorResponse({
        message: '未提供访问令牌',
        statusCode: 401,
        details: { code: 'missing_token' },
      });
    }

    const token = authorization.substring(7);
    const container = getServiceContainer();
    const tokenService = container.getTokenService();
    
    const payload = await tokenService.validateAccessToken(token);
    if (!payload) {
      return errorResponse({
        message: '无效的访问令牌',
        statusCode: 401,
        details: { code: 'invalid_token' },
      });
    }

    const userService = container.getUserService();
    const user = await userService.getUserById(payload.user_id);
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
      permissions: payload.permissions || [],
      scope: payload.scope || '',
    });
  } catch (error) {
    console.error('获取当前用户信息失败:', error);
    return errorResponse({
      message: '服务器内部错误',
      statusCode: 500,
    });
  }
}