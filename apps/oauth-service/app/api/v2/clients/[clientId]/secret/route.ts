/**
 * OAuth客户端密钥轮换API路由
 * OAuth Client Secret Rotation API Route
 * 
 * 提供客户端密钥轮换功能
 * Provides client secret rotation functionality
 * 
 * @author OAuth团队
 * @since 1.0.0
 */

import { NextRequest, NextResponse } from 'next/server';
import { ClientService } from '@/lib/services/client-service';
import { withErrorHandling } from '@repo/lib';
import { withAuth, type AuthContext } from '@repo/lib/middleware';
import { ApiResponse } from '@repo/lib';

/**
 * POST /api/v2/clients/[clientId]/secret - 轮换客户端密钥
 * POST /api/v2/clients/[clientId]/secret - Rotate client secret
 * 
 * 需要 'oauth:clients:manage' 权限
 * Requires 'oauth:clients:manage' permission
 */
async function rotateSecretHandler(
  request: NextRequest,
  { params, authContext }: { authContext: AuthContext; params: { clientId: string } }
): Promise<NextResponse> {
  const { clientId } = params;

  try {
    // 获取审计信息
    // Get audit information
    const auditInfo = {
      userId: (request as any).user?.id,
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
    };

    // 轮换客户端密钥
    // Rotate client secret
    const newSecret = await ClientService.rotateClientSecret(clientId, auditInfo);

    return NextResponse.json<ApiResponse<{ clientSecret: string }>>({
      success: true,
      data: { clientSecret: newSecret },
      message: '客户端密钥轮换成功',
    }, { status: 200 });
  } catch (error) {
    throw error; // 由错误处理包装器处理
  }
}

// 导出处理函数，使用权限中间件和错误处理包装器
// Export handler function with permission middleware and error handling wrapper
export const POST = withErrorHandling(
  withAuth(async (request: NextRequest, context: { authContext: AuthContext; params: { clientId: string } }) => {
    return rotateSecretHandler(request, { params: context.params, authContext: context.authContext });
  }, { requiredPermissions: ['oauth:clients:manage'] })
) as any;