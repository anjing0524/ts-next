// 文件路径: app/api/v2/oauth/userinfo/route.ts
// 描述: OpenID Connect UserInfo Endpoint (OIDC Core 1.0, Section 5.3)

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto'; // For potential token hashing if needed, though JWTUtils should handle it

import { prisma } from '@/lib/prisma';
import { successResponse, errorResponse } from '@/lib/api/apiResponse';
import { withErrorHandler, ApiError } from '@/lib/api/errorHandler';
import { JWTUtils, ScopeUtils } from '@/lib/auth/oauth2'; // JWTUtils for token verification, ScopeUtils for scope checking
// UserInfo endpoint is protected by an Access Token, not client credentials directly for the endpoint itself.
// However, the access token's 'aud' (audience) claim should be validated.

// 辅助函数：从 Bearer token 中提取 token
functionextractAccessToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.substring(7); // "Bearer ".length
  }
  return null;
}

// 确保 JWTUtils 中有 getTokenHash 方法 (如果用于在数据库中查找 AccessToken 记录)
const getTokenHash = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

/**
 * @swagger
 * /api/v2/oauth/userinfo:
 *   get:
 *     summary: OIDC UserInfo Endpoint
 *     description: |
 *       获取授权用户的声明。请求必须包含一个有效的访问令牌，并授予 "openid" 作用域。
 *       令牌通过 Authorization Bearer header 提供。
 *     tags:
 *       - OAuth V2 (OIDC)
 *     security:
 *       - bearerAuth: [] # Indicates Bearer token authentication
 *     produces:
 *       - application/json
 *     responses:
 *       '200':
 *         description: 成功返回用户声明。
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sub:
 *                   type: string
 *                   description: 用户的唯一标识符。
 *                 name:
 *                   type: string
 *                   description:用户的全名。
 *                 given_name:
 *                   type: string
 *                   description: 用户的名。
 *                 family_name:
 *                   type: string
 *                   description: 用户的姓。
 *                 email:
 *                   type: string
 *                   format: email
 *                   description: 用户的电子邮件地址。
 *                 email_verified:
 *                   type: boolean
 *                   description: 用户的电子邮件是否已验证。
 *                 # ... 其他基于 "openid" profile, email, phone, address scopes 的标准声明
 *                 # 以及任何自定义声明
 *       '401':
 *         description: 未经授权 (例如，令牌缺失、无效、过期或范围不足)。
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse' # Generic error response
 *       '403':
 *         description: 禁止访问 (例如，令牌有效但没有 "openid" 作用域)。
 *       '500':
 *         description: 服务器内部错误。
 * components: # Added for swagger to resolve $ref
 *   schemas:
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: false
 *         status:
 *           type: integer
 *         message:
 *           type: string
 *         errorCode:
 *           type: string
 *         requestId:
 *           type: string
 *   securitySchemes:
 *     bearerAuth: # For Swagger UI
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */
async function userinfoHandler(request: NextRequest) {
  const overallRequestId = (request as any).requestId; // from withErrorHandler

  const accessToken = extractAccessToken(request);
  if (!accessToken) {
    return NextResponse.json(
      errorResponse(401, '未提供访问令牌 (Access token not provided)', 'UNAUTHORIZED', overallRequestId),
      { status: 401, headers: { 'WWW-Authenticate': 'Bearer error="invalid_token", error_description="Access token not provided"' } }
    );
  }

  // 1. 验证访问令牌的有效性 (签名, 过期时间, aud, iss等)
  const tokenVerification = await JWTUtils.verifyAccessToken(accessToken);
  if (!tokenVerification.valid || !tokenVerification.payload) {
    return NextResponse.json(
      errorResponse(401, `无效的访问令牌: ${tokenVerification.error || 'Verification failed'} (Invalid access token)`, 'INVALID_TOKEN', overallRequestId),
      { status: 401, headers: { 'WWW-Authenticate': `Bearer error="invalid_token", error_description="${tokenVerification.error || 'Verification failed'}"` } }
    );
  }

  const jwtPayload = tokenVerification.payload;

  // 2. 检查令牌是否在数据库中被撤销 (如果 AccessToken 表有 isRevoked 字段)
  //    并确保它仍然有效 (未过期 - JWTUtils.verifyAccessToken 应该已经检查了 exp)
  const accessTokenHash = getTokenHash(accessToken); // 使用哈希查找
  const dbAccessToken = await prisma.accessToken.findFirst({
    where: {
      tokenHash: accessTokenHash, // 或者使用 jwtPayload.jti 如果 AccessToken 表中存储了 jti
      revoked: false,
      // expiresAt: { gt: new Date() } // JWTUtils.verifyAccessToken 应该已处理过期
      // clientId: jwtPayload.client_id // 确保令牌属于声明的客户端
    },
    include: {
      user: true, // 包含关联的用户信息
    }
  });

  if (!dbAccessToken) {
    return NextResponse.json(
      errorResponse(401, '访问令牌无效或已被撤销 (Access token is invalid or revoked)', 'INVALID_TOKEN', overallRequestId),
      { status: 401, headers: { 'WWW-Authenticate': 'Bearer error="invalid_token", error_description="Token not found in DB or revoked"' } }
    );
  }

  // 3. 检查访问令牌是否包含 "openid" 作用域
  const scopes = ScopeUtils.parseScopes(jwtPayload.scope as string || dbAccessToken.scope);
  if (!scopes.includes('openid')) {
    return NextResponse.json(
      errorResponse(403, '权限不足: 需要 "openid" 作用域 (Insufficient scope: "openid" scope is required)', 'INSUFFICIENT_SCOPE', overallRequestId),
      { status: 403, headers: { 'WWW-Authenticate': 'Bearer error="insufficient_scope", error_description="openid scope is required"' } }
    );
  }

  // 4. 获取用户信息
  // jwtPayload.sub 应该是用户ID
  const userId = jwtPayload.sub;
  if (!userId) {
    return NextResponse.json(
      errorResponse(500, '访问令牌中缺少用户标识 (User identifier missing in access token)', 'SERVER_ERROR', overallRequestId),
      { status: 500 }
    );
  }

  // 使用 dbAccessToken.user (如果 eager loaded) 或重新查询用户
  const user = dbAccessToken.user;
  if (!user) {
    // 这通常不应该发生，因为 AccessToken 应该总是关联到一个有效的用户 (除非是 client_credentials 令牌)
    // 如果是 client_credentials 令牌，它不应该有 openid scope，所以上面的检查会失败。
    return NextResponse.json(
      errorResponse(404, '未找到与令牌关联的用户 (User associated with token not found)', 'NOT_FOUND', overallRequestId),
      { status: 404 }
    );
  }

  // 5. 根据授予的作用域构建 UserInfo 响应
  // OIDC Core, Section 5.4. Standard Claims
  const claims: Record<string, any> = {
    sub: user.id, // 必须始终返回 sub
  };

  if (scopes.includes('profile')) {
    claims.name = `${user.firstName || ''} ${user.lastName || ''}`.trim() || null;
    claims.given_name = user.firstName || null;
    claims.family_name = user.lastName || null;
    claims.preferred_username = user.username || null; // 如果 Prisma User 模型中有 username
    claims.nickname = user.displayName || null; // 假设 displayName 是昵称
    claims.picture = user.avatar || null; // 假设 avatar 是头像 URL
    claims.updated_at = Math.floor(user.updatedAt.getTime() / 1000); // Unix timestamp
    // claims.website = user.website || null;
    // claims.gender = user.gender || null;
    // claims.birthdate = user.birthdate || null; // (YYYY-MM-DD)
    // claims.zoneinfo = user.zoneinfo || null;
    // claims.locale = user.locale || null;
  }

  if (scopes.includes('email')) {
    claims.email = user.email || null;
    // claims.email_verified = user.emailVerified || false; // 如果 Prisma User 模型中有 emailVerified
  }

  if (scopes.includes('phone')) {
    // claims.phone_number = user.phone || null;
    // claims.phone_number_verified = user.phoneVerified || false;
  }

  // ... 其他作用域 (address, etc.)

  // 移除值为 null 的声明，以保持响应简洁
  Object.keys(claims).forEach(key => {
    if (claims[key] === null || claims[key] === undefined) {
      delete claims[key];
    }
  });

  return NextResponse.json(claims, { status: 200 });
}

export const GET = withErrorHandler(userinfoHandler);
// UserInfo endpoint 通常也支持 POST (携带 access token 在 body 中)
// export const POST = withErrorHandler(userinfoHandler); // 如果也支持 POST

EOF
