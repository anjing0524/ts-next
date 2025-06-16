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

// local getTokenHash is replaced by JWTUtils.getTokenHash

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
      // Corrected error to invalid_request as per OIDC spec for malformed/missing token
      errorResponse(401, '未提供访问令牌 (Access token not provided)', 'INVALID_REQUEST', overallRequestId),
      { status: 401, headers: { 'WWW-Authenticate': 'Bearer error="invalid_request", error_description="Access token not provided"' } }
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
  const accessTokenHash = JWTUtils.getTokenHash(accessToken); // 使用 JWTUtils 中的方法
  const dbAccessToken = await prisma.accessToken.findFirst({
    where: {
      tokenHash: accessTokenHash,
      // revoked: false, // Prisma AccessToken schema might not have 'revoked'. Typically relies on expiry or explicit revocation list if needed.
      // For now, assume if it exists and JWT is valid, it's active unless specific revocation logic is added to AccessToken table.
      expiresAt: { gt: new Date() } // Double check expiry against DB record, though JWT verify also does.
    },
    include: {
      user: true, // 包含关联的用户信息 (Include associated user information)
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
      // Corrected error to lowercase 'insufficient_scope'
      errorResponse(403, '权限不足: 需要 "openid" 作用域 (Insufficient scope: "openid" scope is required)', 'insufficient_scope', overallRequestId),
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
    claims.name = `${user.firstName || ''} ${user.lastName || ''}`.trim() || undefined;
    claims.given_name = user.firstName || undefined;
    claims.family_name = user.lastName || undefined;
    // OIDC Standard Claims: middle_name, nickname, profile, website, gender, birthdate, zoneinfo, locale
    // These are not currently available on the User model. Example:
    // claims.middle_name = user.middleName || undefined;
    // claims.nickname = user.nickname || user.displayName || undefined;
    claims.preferred_username = user.username || undefined;
    claims.profile = user.profileUrl || undefined; // Assuming a 'profileUrl' field on User model
    claims.picture = user.avatar || undefined;
    claims.website = user.websiteUrl || undefined; // Assuming a 'websiteUrl' field on User model
    // claims.gender = user.gender || undefined; // Requires 'gender' field
    // claims.birthdate = user.birthdate ? user.birthdate.toISOString().split('T')[0] : undefined; // Requires 'birthdate' field (Date type)
    // claims.zoneinfo = user.zoneinfo || undefined; // Requires 'zoneinfo' field
    // claims.locale = user.locale || undefined; // Requires 'locale' field
    claims.updated_at = user.updatedAt ? Math.floor(user.updatedAt.getTime() / 1000) : undefined;
  }

  if (scopes.includes('email')) {
    claims.email = user.email || undefined;
    // If emailVerified field is not present on user model, default to false,
    // otherwise use its value. OIDC spec implies it should be returned if email claim is present.
    claims.email_verified = user.emailVerified === undefined ? false : user.emailVerified;
  }

  if (scopes.includes('address')) {
    // Address claim is a structured object. Requires address fields on User model.
    // Example:
    // if (user.address_formatted) { // Assuming user model has address fields
    //   claims.address = {
    //     formatted: user.address_formatted,
    //     street_address: user.address_street,
    //     locality: user.address_locality,
    //     region: user.address_region,
    //     postal_code: user.address_postal_code,
    //     country: user.address_country,
    //   };
    //   // Remove null/undefined from address object
    //   Object.keys(claims.address).forEach(key => {
    //     if (claims.address![key as keyof typeof claims.address] === null || claims.address![key as keyof typeof claims.address] === undefined) {
    //       delete claims.address![key as keyof typeof claims.address];
    //     }
    //   });
    //   if (Object.keys(claims.address).length === 0) delete claims.address;
    // }
  }

  if (scopes.includes('phone')) {
    claims.phone_number = user.phone || undefined;
    // If phoneVerified field is not present on user model, default to false,
    // otherwise use its value.
    claims.phone_number_verified = user.phoneVerified === undefined ? false : user.phoneVerified;
  }

  // 移除值为 null 或 undefined 的声明，以保持响应简洁
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
