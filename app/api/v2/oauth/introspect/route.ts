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
// authenticateIntrospectionClient is replaced by ClientAuthUtils.authenticateClient

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

  // --- 客户端认证 (Client Authentication) ---
  // 使用 ClientAuthUtils 进行客户端认证
  // (Use ClientAuthUtils for client authentication)
  const clientAuthResult = await ClientAuthUtils.authenticateClient(request, bodyParams);

  if (!clientAuthResult.client) {
    // ClientAuthUtils.authenticateClient 返回的错误对象结构可能与 errorResponse 不同
    // (The error object structure returned by ClientAuthUtils.authenticateClient might differ from errorResponse)
    // 因此，我们直接返回它提供的 NextResponse 或构建一个新的
    // (So, we either return the NextResponse it provides or construct a new one)
    if (clientAuthResult.error) {
      return NextResponse.json(clientAuthResult.error, { status: 401 });
    }
    // 默认错误，如果 authenticateClient 未返回特定错误响应
    // (Default error if authenticateClient didn't return a specific error response)
    return NextResponse.json({ error: OAuth2ErrorTypes.INVALID_CLIENT, error_description: 'Client authentication failed' }, { status: 401 });
  }
  const authenticatedClient = clientAuthResult.client;
  console.log(`Introspection request authenticated for client: ${authenticatedClient.clientId}`);


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
    const accessTokenHash = JWTUtils.getTokenHash(token);
    const dbAccessToken = await prisma.accessToken.findFirst({
        // where: { tokenHash: accessTokenHash, isRevoked: false, expiresAt: { gt: new Date() } } // isRevoked not in schema
        where: { tokenHash: accessTokenHash, expiresAt: { gt: new Date() } }
    });

    if (dbAccessToken) {
        // 令牌有效，并且属于进行内省请求的客户端，或者令牌没有特定的授权客户端（例如，某些内部令牌）
        // (Token is valid, AND belongs to the client making introspection request, OR token has no specific authorized client for introspection)
        // RFC 7662: "the specifics of a protected resource's authorization policy are beyond the scope of this specification".
        // 我们通常允许任何经过认证的客户端内省任何有效的令牌，但也可以添加策略，例如只允许令牌的原始客户端内省它。
        // (We typically allow any authenticated client to introspect any valid token, but policies can be added,
        //  e.g., only allow token's original client to introspect it.)
        // if (payload.client_id !== authenticatedClient.clientId) { /* ... potentially restrict ... */ }

        responsePayload = {
            active: true,
            scope: payload.scope as string || '',
            client_id: payload.client_id as string,
            username: payload.username as string || undefined, // 如果JWT中有username (If username in JWT)
            sub: payload.sub as string,
            aud: payload.aud as string | string[] | undefined, // aud can be array
            iss: payload.iss as string,
            exp: payload.exp,
            iat: payload.iat,
            jti: payload.jti,
            token_type: 'Bearer', // 通常访问令牌是 Bearer 类型 (Usually access tokens are Bearer type)
            // 根据需要添加更多声明 (Add more claims as needed)
            // 例如，如果令牌与用户关联，则添加用户相关的声明
            // (For example, if token is user-associated, add user-related claims)
            ...(dbAccessToken.userId && { user_id: dbAccessToken.userId }),
        };
    }
  }

  // 如果作为访问令牌验证失败，或者提示是 refresh_token (If access token verification fails, OR hint is refresh_token)
  // 注意：RFC 7662 内省端点主要用于访问令牌，但也可以用于其他令牌类型。
  // (Note: RFC 7662 introspection endpoint is primarily for access tokens, but can be used for other token types.)
  if (!responsePayload.active && (tokenTypeHint === 'refresh_token' || !accessTokenVerification.valid)) {
    const refreshTokenVerification = await JWTUtils.verifyRefreshToken(token);
    if (refreshTokenVerification.valid && refreshTokenVerification.payload) {
      const payload = refreshTokenVerification.payload;
      const refreshTokenHash = JWTUtils.getTokenHash(token);
      const dbRefreshToken = await prisma.refreshToken.findFirst({
          // where: { tokenHash: refreshTokenHash, isRevoked: false, expiresAt: { gt: new Date() }} // isRevoked not in schema
          where: { tokenHash: refreshTokenHash, expiresAt: { gt: new Date() }}
      });
      if (dbRefreshToken && !dbRefreshToken.isRevoked) { // Check isRevoked for refresh tokens specifically
        responsePayload = {
            active: true,
            scope: payload.scope as string || '',
            client_id: payload.client_id as string,
            sub: payload.sub as string, // 通常是 user_id 或 client_id (Usually user_id or client_id)
            aud: payload.aud as string | string[] | undefined,
            iss: payload.iss as string,
            exp: payload.exp,
            iat: payload.iat,
            jti: payload.jti,
            token_type: 'refresh_token', // 明确这是刷新令牌 (Clearly indicate this is a refresh token)
             ...(dbRefreshToken.userId && { user_id: dbRefreshToken.userId }),
        };
      }
    }
  }

  // 如果令牌有效 (active: true)，确保所有必要的声明都存在且符合RFC 7662
  // (If token is active, ensure all necessary claims exist and conform to RFC 7662)
  // The current construction of responsePayload should generally cover this.
  // Ensure client_id is always present if active.
  if (responsePayload.active && !responsePayload.client_id) {
      if (accessTokenVerification.payload?.client_id) {
          responsePayload.client_id = accessTokenVerification.payload.client_id;
      } else if (refreshTokenVerification?.payload?.client_id) {
          responsePayload.client_id = refreshTokenVerification.payload.client_id;
      } else {
          // This case should ideally not be reached if tokens are generated correctly
          console.warn("Active token introspection, but client_id could not be determined from token payload.");
          responsePayload.active = false; // Mark as inactive if essential info like client_id is missing
      }
  }


  // 审计日志 (可选) (Optional audit log)
  await AuthorizationUtils.logAuditEvent({
      clientId: authenticatedClient.id, // Use the DB ID of the authenticated client
      action: 'token_introspect',
      resource: `token_type:${tokenTypeHint || 'unknown'}`,
      ipAddress: request.headers.get('x-forwarded-for') || request.ip || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
      success: responsePayload.active,
      metadata: {
          introspected_token_jti: responsePayload.jti, // JTI of the token being introspected
          introspected_token_active: responsePayload.active,
      },
  });

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
