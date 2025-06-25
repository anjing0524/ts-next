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

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ClientType } from '@prisma/client';
import { ClientService } from '../../../../lib/services/client-service';
import { withErrorHandling } from '@repo/lib';
import { requirePermission } from '../../../../lib/auth/middleware';
import { ApiResponse } from '@repo/lib';
import { OAuth2Error, OAuth2ErrorCode } from '../../../../lib/errors';

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
 * GET /api/v2/clients/[clientId] - Get client details
 * 
 * 需要 'oauth:clients:read' 权限
 * Requires 'oauth:clients:read' permission
 */
async function getClientHandler(
  request: NextRequest,
  { params }: { params: { clientId: string } }
): Promise<NextResponse> {
  const { clientId } = params;

  try {
    // 获取客户端信息
    // Get client information
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

    // 隐藏敏感信息
    // Hide sensitive information
    const { clientSecret, ...safeClient } = client;

    return NextResponse.json<ApiResponse<typeof safeClient>>({
      success: true,
      data: safeClient,
      message: '客户端信息获取成功',
    }, { status: 200 });
  } catch (error) {
    throw error; // 由错误处理包装器处理
  }
}

/**
 * PUT /api/v2/clients/[clientId] - 更新客户端信息
 * PUT /api/v2/clients/[clientId] - Update client information
 * 
 * 需要 'oauth:clients:update' 权限
 * Requires 'oauth:clients:update' permission
 */
async function updateClientHandler(
  request: NextRequest,
  { params }: { params: { clientId: string } }
): Promise<NextResponse> {
  const { clientId } = params;

  try {
    // 解析请求体
    // Parse request body
    const body = await request.json();
    
    // 验证请求数据
    // Validate request data
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

    // 获取审计信息
    // Get audit information
    const auditInfo = {
      userId: (request as any).user?.id,
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
    };

    // 更新客户端
    // Update client
    const updatedClient = await ClientService.updateClient(clientId, updateParams, auditInfo);

    // 隐藏敏感信息
    // Hide sensitive information
    const { clientSecret, ...safeClient } = updatedClient;

    return NextResponse.json<ApiResponse<typeof safeClient>>({
      success: true,
      data: safeClient,
      message: '客户端更新成功',
    }, { status: 200 });
  } catch (error) {
    throw error; // 由错误处理包装器处理
  }
}

/**
 * DELETE /api/v2/clients/[clientId] - 删除客户端
 * DELETE /api/v2/clients/[clientId] - Delete client
 * 
 * 需要 'oauth:clients:delete' 权限
 * Requires 'oauth:clients:delete' permission
 */
async function deleteClientHandler(
  request: NextRequest,
  { params }: { params: { clientId: string } }
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

    // 删除客户端
    // Delete client
    await ClientService.deleteClient(clientId, auditInfo);

    return NextResponse.json<ApiResponse<null>>({
      success: true,
      data: null,
      message: '客户端删除成功',
    }, { status: 200 });
  } catch (error) {
    throw error; // 由错误处理包装器处理
  }
}

// 导出处理函数，使用权限中间件和错误处理包装器
// Export handler functions with permission middleware and error handling wrapper
export const GET = withErrorHandling(
  requirePermission('oauth:clients:read')(getClientHandler)
);

export const PUT = withErrorHandling(
  requirePermission('oauth:clients:update')(updateClientHandler)
);

export const DELETE = withErrorHandling(
  requirePermission('oauth:clients:delete')(deleteClientHandler)
); 