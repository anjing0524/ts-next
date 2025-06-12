// 文件路径: app/api/v2/oauth/introspect/route.ts
// 描述: OAuth 2.0 令牌内省端点 (RFC 7662)

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { successResponse, errorResponse } from '@/lib/api/apiResponse';
import { withErrorHandler, ApiError } from '@/lib/api/errorHandler';
import { JWTUtils, ClientAuthUtils, OAuth2ErrorTypes, ScopeUtils } from '@/lib/auth/oauth2'; // 假设这些工具类可用
// import { withClientAuth } from '@/lib/auth/middleware'; // 可能需要一个专门的客户端认证中间件

// --- 请求 Schema ---
const IntrospectionRequestSchema = z.object({
  token: z.string().min(1, '令牌 (token) 不能为空'),
  token_type_hint: z.string().optional().describe('可选的令牌类型提示 (e.g., access_token, refresh_token)'),
  // RFC 7662 允许客户端发送额外的参数，服务器可以忽略或使用它们
  // clientId: z.string().optional(), // 客户端ID，用于验证客户端是否有权内省此令牌
  // clientSecret: z.string().optional(), // 客户端密钥
});

// --- 辅助函数 ---
// （如果 withClientAuth 中间件尚不存在或不适用，这里可能需要一个轻量级的客户端认证逻辑）
// 简化的客户端认证：实际应用中应使用 ClientAuthUtils.authenticateClient
async function authenticateIntrospectionClient(request: NextRequest, body: URLSearchParams): Promise<{ clientId: string | null; error?: NextResponse }> {
  // 客户端凭证可以来自 Authorization header (Basic) 或请求体
  const authHeader = request.headers.get('Authorization');
  let clientId: string | null = null;
  let clientSecret: string | null = null;

  if (authHeader && authHeader.toLowerCase().startsWith('basic ')) {
    try {
      const credentials = Buffer.from(authHeader.substring(6), 'base64').toString('utf-8');
      [clientId, clientSecret] = credentials.split(':');
    } catch (e) {
      return { clientId: null, error: NextResponse.json(errorResponse(401, '无效的 Basic 认证头 (Invalid Basic auth header)', OAuth2ErrorTypes.INVALID_CLIENT), { status: 401 }) };
    }
  } else {
    clientId = body.get('client_id');
    clientSecret = body.get('client_secret');
  }

  if (!clientId) {
    return { clientId: null, error: NextResponse.json(errorResponse(401, '客户端认证失败: 缺少客户端ID (Client authentication failed: missing client_id)', OAuth2ErrorTypes.INVALID_CLIENT), { status: 401 }) };
  }

  // 在实际应用中，这里需要验证 clientId 和 clientSecret 的有效性
  // 例如，查询数据库中的 OAuthClient 并验证密钥
  const client = await prisma.oAuthClient.findUnique({ where: { clientId }});
  if (!client) {
    return { clientId: null, error: NextResponse.json(errorResponse(401, '客户端认证失败: 客户端未找到 (Client authentication failed: client not found)', OAuth2ErrorTypes.INVALID_CLIENT), { status: 401 }) };
  }

  if (client.clientSecret) { // 机密客户端
    if (!clientSecret || client.clientSecret !== clientSecret) { // 注意：实际应比较哈希后的密钥
       // const isValidSecret = await bcrypt.compare(clientSecret, client.clientSecretHash);
       // if (!isValidSecret) {
      return { clientId: null, error: NextResponse.json(errorResponse(401, '客户端认证失败: 客户端密钥无效 (Client authentication failed: invalid client_secret)', OAuth2ErrorTypes.INVALID_CLIENT), { status: 401 }) };
       // }
    }
  }
  // 对于公共客户端，clientSecret 可能不存在，认证通过

  return { clientId: client.clientId }; // 返回经过验证的客户端ID
}


/**
 * @swagger
 * /api/v2/oauth/introspect:
 *   post:
 *     summary: OAuth 2.0 令牌内省 (Token Introspection)
 *     description: |
 *       验证令牌的有效性并返回其元数据。
 *       此端点受客户端凭证保护 (通常是机密客户端使用 Basic Auth)。
 *       参考 RFC 7662。
 *     tags:
 *       - OAuth V2
 *     consumes:
 *       - application/x-www-form-urlencoded
 *     produces:
 *       - application/json
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             properties:
 *               token:
 *                 type: string
 *                 description: 需要内省的令牌。
 *                 example: '2YotnFZFEjr1zCsicMWpAA'
 *               token_type_hint:
 *                 type: string
 *                 description: 可选的令牌类型提示 (例如 "access_token" 或 "refresh_token")。
 *                 example: 'access_token'
 *               client_id:
 *                 type: string
 *                 description: (如果未使用Basic Auth) 进行请求的客户端ID。
 *               client_secret:
 *                 type: string
 *                 description: (如果未使用Basic Auth且客户端是机密的) 客户端密钥。
 *             required:
 *               - token
 *     responses:
 *       '200':
 *         description: 令牌内省响应。
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 active:
 *                   type: boolean
 *                   description: 指示令牌是否有效且活动的布尔值。
 *                 scope:
 *                   type: string
 *                   description: 令牌关联的作用域 (空格分隔)。
 *                 client_id:
 *                   type: string
 *                   description: 令牌颁发给的客户端ID。
 *                 username:
 *                   type: string
 *                   description: 令牌关联的资源所有者用户名 (如果适用)。
 *                 sub:
 *                   type: string
 *                   description: 令牌的主题 (通常是用户ID或客户端ID)。
 *                 aud:
 *                   type: string
 *                   description: 令牌的受众。
 *                 iss:
 *                   type: string
 *                   description: 令牌的颁发者。
 *                 exp:
 *                   type: integer
 *                   format: int64
 *                   description: 令牌的过期时间戳 (Unix时间)。
 *                 iat:
 *                   type: integer
 *                   format: int64
 *                   description: 令牌的颁发时间戳 (Unix时间)。
 *                 jti:
 *                   type: string
 *                   description: 令牌的唯一标识符 (JWT ID)。
 *                 token_type:
 *                   type: string
 *                   description: 令牌类型 (例如 "Bearer")。
 *                 # ... 其他根据令牌类型和服务器策略的声明
 *       '400':
 *         description: 无效的请求 (例如缺少 'token' 参数)。
 *       '401':
 *         description: 客户端认证失败。
 *       '500':
 *         description: 服务器内部错误。
 */
async function introspectionHandler(request: NextRequest) {
  const overallRequestId = (request as any).requestId; // from withErrorHandler

  if (request.headers.get('content-type') !== 'application/x-www-form-urlencoded') {
    return NextResponse.json(errorResponse(415, '不支持的媒体类型 (Unsupported Media Type). 请使用 application/x-www-form-urlencoded。', 'UNSUPPORTED_MEDIA_TYPE', overallRequestId), { status: 415 });
  }

  const bodyParams = new URLSearchParams(await request.text());

  // --- 客户端认证 ---
  // RFC 7662 要求此端点受保护。客户端凭证通过HTTP Basic认证或包含在请求体中。
  // 实际项目中，这里应该使用一个健壮的客户端认证中间件或 ClientAuthUtils.authenticateClient
  const authResult = await authenticateIntrospectionClient(request, bodyParams);
  if (authResult.error) {
    return authResult.error;
  }
  const authenticatedClientId = authResult.clientId; // 用于审计或进一步检查

  // --- 请求体验证 ---
  const token = bodyParams.get('token');
  const tokenTypeHint = bodyParams.get('token_type_hint');

  if (!token) {
    // 如果令牌无效或过期，或者客户端无权内省，则返回 active: false
    // 这里是请求格式错误的情况
    return NextResponse.json({ active: false, error: '请求缺少令牌 (token is required)' }, { status: 400 });
  }

  let responsePayload: Record<string, any> = { active: false };

  // --- 令牌验证逻辑 ---
  // 尝试验证为访问令牌
  const accessTokenVerification = await JWTUtils.verifyAccessToken(token);
  if (accessTokenVerification.valid && accessTokenVerification.payload) {
    const payload = accessTokenVerification.payload;
    // 检查令牌是否在数据库中被撤销 (如果 AccessToken 表有 isRevoked 字段)
    const dbToken = await prisma.accessToken.findFirst({
        where: { tokenHash: JWTUtils.getTokenHash(token), /* 或其他唯一标识符 */ revoked: false, expiresAt: { gt: new Date() } }
    });

    if (dbToken) {
        responsePayload = {
            active: true,
            scope: payload.scope as string || '',
            client_id: payload.client_id as string,
            username: payload.username as string, // 如果JWT中有username
            sub: payload.sub as string,
            aud: payload.aud as string | string[],
            iss: payload.iss as string,
            exp: payload.exp,
            iat: payload.iat,
            jti: payload.jti,
            token_type: 'Bearer', // 通常访问令牌是 Bearer 类型
            // 根据需要添加更多声明
        };
    }
  } else if (tokenTypeHint === 'refresh_token' || !accessTokenVerification.valid) {
    // 如果提示是 refresh_token，或者作为 access_token 验证失败，尝试验证为刷新令牌
    const refreshTokenVerification = await JWTUtils.verifyRefreshToken(token);
    if (refreshTokenVerification.valid && refreshTokenVerification.payload) {
      const payload = refreshTokenVerification.payload;
      const dbToken = await prisma.refreshToken.findFirst({
          where: { tokenHash: JWTUtils.getTokenHash(token), revoked: false, expiresAt: { gt: new Date() }}
      });
      if (dbToken) {
        responsePayload = {
            active: true,
            scope: payload.scope as string || '',
            client_id: payload.client_id as string,
            sub: payload.sub as string, // 通常是 user_id 或 client_id
            aud: payload.aud as string | string[],
            iss: payload.iss as string,
            exp: payload.exp,
            iat: payload.iat,
            jti: payload.jti,
            token_type: 'refresh_token',
        };
      }
    }
  }

  // 如果令牌有效 (active: true)，确保所有必要的声明都存在且符合RFC 7662
  if (responsePayload.active) {
    // 确保 client_id 存在 (从JWT中获取)
    if (!responsePayload.client_id && accessTokenVerification.payload?.client_id) {
      responsePayload.client_id = accessTokenVerification.payload.client_id;
    } else if (!responsePayload.client_id && refreshTokenVerification.payload?.client_id) {
      responsePayload.client_id = refreshTokenVerification.payload.client_id;
    }
    // ... 其他必要的字段转换或填充
  }


  // 审计日志 (可选)
  // await prisma.auditLog.create({ data: { action: 'token_introspect', actorId: authenticatedClientId, resourceId: token.substring(0,10)+"...", success: responsePayload.active }});

  return NextResponse.json(responsePayload, { status: 200 });
}

// TODO: 替换简化的 authenticateIntrospectionClient 为健壮的客户端认证中间件 (e.g., withClientAuth)
// export const POST = withErrorHandler(withClientAuth(introspectionHandler, { requiredClientTypes: ['CONFIDENTIAL'] }));
export const POST = withErrorHandler(introspectionHandler);

// 添加一个辅助函数到JWTUtils（如果它不存在）
// JWTUtils.getTokenHash = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
// 这应该在 lib/auth/oauth2.ts 中定义

// 临时添加到此文件末尾，实际应在 lib/auth/oauth2.ts 的 JWTUtils 类中
// class JWTUtils {
//   static getTokenHash(token: string): string {
//     const crypto = require('crypto');
//     return crypto.createHash('sha256').update(token).digest('hex');
//   }
//   // ... other methods
// }
