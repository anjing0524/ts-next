/**
 * OAuth客户端管理API路由
 * OAuth Client Management API Routes
 * 
 * 提供客户端的CRUD操作接口
 * Provides CRUD operation interfaces for clients
 * 
 * @author OAuth团队
 * @since 1.0.0
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ClientType } from '@prisma/client';
import { ClientService } from '@/lib/services/client-service';
import { withErrorHandling, ApiResponse } from '@repo/lib';
import { withAuth, type AuthContext } from '@/lib/auth/middleware/bearer-auth';

/**
 * 客户端创建请求Schema
 * Client creation request schema
 */
const createClientSchema = z.object({
  name: z.string().min(1, '客户端名称不能为空').max(100, '客户端名称不能超过100个字符'),
  description: z.string().optional(),
  clientType: z.nativeEnum(ClientType, { 
    errorMap: () => ({ message: '客户端类型必须是PUBLIC或CONFIDENTIAL' }) 
  }),
  redirectUris: z.array(z.string().url('重定向URI必须是有效的URL')).min(1, '至少需要一个重定向URI'),
  grantTypes: z.array(z.string()).min(1, '至少需要一个授权类型'),
  responseTypes: z.array(z.string()).min(1, '至少需要一个响应类型'),
  allowedScopes: z.array(z.string()).min(1, '至少需要一个允许的权限范围'),
  logoUri: z.string().url('Logo URI必须是有效的URL').optional(),
  policyUri: z.string().url('隐私政策URI必须是有效的URL').optional(),
  tosUri: z.string().url('服务条款URI必须是有效的URL').optional(),
  requirePkce: z.boolean().optional(),
  requireConsent: z.boolean().optional(),
  ipWhitelist: z.array(z.string()).optional(),
  accessTokenTtl: z.number().int().positive('访问令牌TTL必须是正整数').optional(),
  refreshTokenTtl: z.number().int().positive('刷新令牌TTL必须是正整数').optional(),
  authorizationCodeLifetime: z.number().int().positive('授权码生命周期必须是正整数').optional(),
});

/**
 * 客户端查询请求Schema
 * Client query request schema
 */
const queryClientsSchema = z.object({
  clientType: z.nativeEnum(ClientType).optional(),
  isActive: z.string().transform(val => val === 'true').optional(),
  name: z.string().optional(),
  limit: z.string().transform(val => parseInt(val)).pipe(z.number().int().positive().max(100)).optional(),
  offset: z.string().transform(val => parseInt(val)).pipe(z.number().int().min(0)).optional(),
});

/**
 * GET /api/v2/clients - 获取客户端列表
 * GET /api/v2/clients - Get client list
 * 
 * 需要 'oauth:clients:read' 权限
 * Requires 'oauth:clients:read' permission
 */
async function getClientsHandler(request: NextRequest, context: AuthContext): Promise<NextResponse> {
  // 验证查询参数
  // Validate query parameters
  const url = new URL(request.url);
  const queryParams = Object.fromEntries(url.searchParams.entries());
  
  const validationResult = queryClientsSchema.safeParse(queryParams);
  if (!validationResult.success) {
    return NextResponse.json<ApiResponse<never>>({
      success: false,
      error: {
        code: 'invalid_request',
        message: '请求参数验证失败',
        details: validationResult.error.flatten().fieldErrors,
      },
    }, { status: 400 });
  }

  const params = validationResult.data;

  try {
    // 获取客户端列表
    // Get client list
    const result = await ClientService.getClients({
      clientType: params.clientType,
      isActive: params.isActive,
      name: params.name,
      limit: params.limit,
      offset: params.offset,
    });

    return NextResponse.json<ApiResponse<typeof result>>({
      success: true,
      data: result,
      message: '客户端列表获取成功',
    }, { status: 200 });
  } catch (error) {
    throw error; // 由错误处理包装器处理
  }
}

/**
 * POST /api/v2/clients - 创建新客户端
 * POST /api/v2/clients - Create new client
 * 
 * 需要 'oauth:clients:create' 权限
 * Requires 'oauth:clients:create' permission
 */
async function createClientHandler(request: NextRequest, context: AuthContext): Promise<NextResponse> {
  try {
    // 解析请求体
    // Parse request body
    const body = await request.json();
    
    // 验证请求数据
    // Validate request data
    const validationResult = createClientSchema.safeParse(body);
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

    const params = validationResult.data;

    // 获取审计信息
    // Get audit information
    const auditInfo = {
      userId: (request as any).user?.id,
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
    };

    // 创建客户端
    // Create client
    const client = await ClientService.createClient(params, auditInfo);

    return NextResponse.json<ApiResponse<typeof client>>({
      success: true,
      data: client,
      message: '客户端创建成功',
    }, { status: 201 });
  } catch (error) {
    throw error; // 由错误处理包装器处理
  }
}

// 导出处理函数，使用权限中间件和错误处理包装器
// Export handler functions with permission middleware and error handling wrapper
export const GET = withErrorHandling(
  withAuth(getClientsHandler, { requiredPermissions: ['oauth:clients:read'] })
);

export const POST = withErrorHandling(
  withAuth(createClientHandler, { requiredPermissions: ['oauth:clients:create'] })
); 