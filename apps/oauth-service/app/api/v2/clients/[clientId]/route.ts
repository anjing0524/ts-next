/**
 * 单个OAuth客户端管理API路由
 * Individual OAuth Client Management API Routes
 * 
 * 提供单个客户端的查看、更新、删除操作
 * Provides view, update, and delete operations for individual clients
 * 
 * @author OAuth团队
 * @since 1.0.0
 */

import { ClientService } from '@/lib/services/client-service';
import { ApiResponse, withErrorHandling } from '@repo/lib';
import { withAuth, type AuthContext } from '@repo/lib/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

interface RouteParams {
  clientId: string;
}

/**
 * 客户端更新请求Schema
 * Client update request schema
 */
const updateClientSchema = z.object({
  name: z.string().min(1, '客户端名称不能为空').max(100, '客户端名称不能超过100个字符').optional(),
  description: z.string().optional(),
  redirectUris: z.array(z.string().url('重定向URI必须是有效的URL')).min(1, '至少需要一个重定向URI').optional(),
  grantTypes: z.array(z.string()).min(1, '至少需要一个授权类型').optional(),
  responseTypes: z.array(z.string()).min(1, '至少需要一个响应类型').optional(),
  allowedScopes: z.array(z.string()).min(1, '至少需要一个允许的权限范围').optional(),
  logoUri: z.string().url('Logo URI必须是有效的URL').optional(),
  policyUri: z.string().url('隐私政策URI必须是有效的URL').optional(),
  tosUri: z.string().url('服务条款URI必须是有效的URL').optional(),
  requirePkce: z.boolean().optional(),
  requireConsent: z.boolean().optional(),
  ipWhitelist: z.array(z.string()).optional(),
  accessTokenTtl: z.number().int().positive('访问令牌TTL必须是正整数').optional(),
  refreshTokenTtl: z.number().int().positive('刷新令牌TTL必须是正整数').optional(),
  authorizationCodeLifetime: z.number().int().positive('授权码生命周期必须是正整数').optional(),
  isActive: z.boolean().optional(),
});

/**
 * GET /api/v2/clients/[clientId] - 获取客户端详情
 * 需要 'client:read' 权限
 */
async function getClientHandler(
  request: NextRequest,
  { params }: { authContext: AuthContext; params: RouteParams }
): Promise<NextResponse> {
  const { clientId } = params;

  try {
    const client = await ClientService.getClientById(clientId);
    
    if (!client) {
      return NextResponse.json<ApiResponse<never>>({
        success: false,
        error: {
          code: 'client_not_found',
          message: '客户端不存在',
        },
      }, { status: 404 });
    }

    const { clientSecret, ...safeClient } = client;

    return NextResponse.json<ApiResponse<typeof safeClient>>({
      success: true,
      data: safeClient,
      message: '客户端信息获取成功',
    }, { status: 200 });
  } catch (error) {
    throw error;
  }
}

/**
 * PUT /api/v2/clients/[clientId] - 更新客户端信息
 * 需要 'client:update' 权限
 */
async function updateClientHandler(
  request: NextRequest,
  { authContext, params }: { authContext: AuthContext; params: RouteParams }
): Promise<NextResponse> {
  const { clientId } = params;

  try {
    const body = await request.json();
    
    const validationResult = updateClientSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json<ApiResponse<never>>({
        success: false,
        error: {
          code: 'invalid_request',
          message: '请求数据验证失败',
          details: validationResult.error.flatten().fieldErrors,
        },
      }, { status: 400 });
    }

    const updateParams = validationResult.data;

    const auditInfo = {
      userId: authContext.user_id,
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
    };

    const updatedClient = await ClientService.updateClient(clientId, updateParams, auditInfo);

    const { clientSecret, ...safeClient } = updatedClient;

    return NextResponse.json<ApiResponse<typeof safeClient>>({
      success: true,
      data: safeClient,
      message: '客户端更新成功',
    }, { status: 200 });
  } catch (error) {
    throw error;
  }
}

/**
 * DELETE /api/v2/clients/[clientId] - 删除客户端
 * 需要 'client:delete' 权限
 */
async function deleteClientHandler(
  request: NextRequest,
  { authContext, params }: { authContext: AuthContext; params: RouteParams }
): Promise<NextResponse> {
  const { clientId } = params;

  try {
    const auditInfo = {
      userId: authContext.user_id,
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
    };

    await ClientService.deleteClient(clientId, auditInfo);

    return NextResponse.json<ApiResponse<null>>({
      success: true,
      data: null,
      message: '客户端删除成功',
    }, { status: 200 });
  } catch (error) {
    throw error;
  }
}

// 导出处理函数，使用权限中间件和错误处理包装器
export const GET = withErrorHandling(
  withAuth(getClientHandler, { requiredPermissions: ['client:read'] })
);

export const PUT = withErrorHandling(
  withAuth(updateClientHandler, { requiredPermissions: ['client:update'] })
);

export const DELETE = withErrorHandling(
  withAuth(deleteClientHandler, { requiredPermissions: ['client:delete'] })
); 