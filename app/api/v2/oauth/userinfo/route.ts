// 文件路径: app/api/v2/oauth/userinfo/route.ts
// 描述: OpenID Connect UserInfo Endpoint (OIDC Core 1.0, Section 5.3)

import { NextRequest, NextResponse } from 'next/server';
// import crypto from 'crypto'; // Not directly used here after refactor

import { prisma } from '@/lib/prisma';
// successResponse, errorResponse are not directly used here, standard NextResponse.json is used.
// import { successResponse, errorResponse } from '@/lib/api/apiResponse';
import { withErrorHandler, ApiError } from '@/lib/api/errorHandler';
import { JWTUtils, ScopeUtils, OAuth2ErrorTypes } from '@/lib/auth/oauth2'; // JWTUtils for token verification, ScopeUtils for scope checking
import { UserInfoResponse, userInfoResponseSchema } from './schemas'; // Import the Zod schema
import { User } from '@prisma/client'; // Import User type if needed for casting
// UserInfo endpoint is protected by an Access Token, not client credentials directly for the endpoint itself.
// However, the access token's 'aud' (audience) claim should be validated.

// 辅助函数：从 Bearer token 中提取 token (this function is defined inline in the handler now or can be kept if used elsewhere)
// function extractAccessToken(request: NextRequest): string | null { ... }

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

  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return NextResponse.json(
      { error: OAuth2ErrorTypes.INVALID_REQUEST, error_description: 'Authorization header with Bearer token is required.' },
      { status: 401, headers: { 'WWW-Authenticate': 'Bearer error="invalid_request"' } }
    );
  }
  const accessTokenValue = authHeader.substring(7);

  // 1. 验证访问令牌的有效性
  const tokenVerification = await JWTUtils.verifyAccessToken(accessTokenValue);
  if (!tokenVerification.valid || !tokenVerification.payload) {
    return NextResponse.json(
      { error: OAuth2ErrorTypes.INVALID_TOKEN, error_description: tokenVerification.error || 'Invalid or expired access token.' },
      { status: 401, headers: { 'WWW-Authenticate': `Bearer error="${OAuth2ErrorTypes.INVALID_TOKEN}", error_description="${tokenVerification.error || 'Verification failed'}"` } }
    );
  }
  const jwtPayload = tokenVerification.payload;

  // 2. JTI黑名单检查
  if (jwtPayload.jti) {
    const blacklistedJti = await prisma.tokenBlacklist.findUnique({ where: { jti: jwtPayload.jti } });
    if (blacklistedJti) {
      console.log(`UserInfo: Access token JTI (${jwtPayload.jti}) found in blacklist.`);
      return NextResponse.json(
        { error: OAuth2ErrorTypes.INVALID_TOKEN, error_description: 'Access token has been revoked (JTI blacklisted).' },
        { status: 401, headers: { 'WWW-Authenticate': 'Bearer error="invalid_token", error_description="Token revoked (JTI blacklisted)"' } }
      );
    }
  }

  // 3. 检查数据库中的 AccessToken 记录 (可选, 但推荐)
  const dbAccessToken = await prisma.accessToken.findFirst({
    where: {
      tokenHash: JWTUtils.getTokenHash(accessTokenValue), // Consistent with how token is stored if hashed
      expiresAt: { gt: new Date() },
      isRevoked: false, // Ensure DB record also not marked as revoked
    },
    include: { user: true }
  });

  if (!dbAccessToken || !dbAccessToken.user) {
    return NextResponse.json(
      { error: OAuth2ErrorTypes.INVALID_TOKEN, error_description: 'Access token is invalid, revoked, or user not found.' },
      { status: 401, headers: { 'WWW-Authenticate': 'Bearer error="invalid_token", error_description="Token not found in DB, revoked, or user missing."' } }
    );
  }
  // Ensure sub from JWT matches the user associated with the token in DB
  if (jwtPayload.sub !== dbAccessToken.userId) {
    console.error(`UserInfo Error: JWT sub (${jwtPayload.sub}) does not match AccessToken record's userId (${dbAccessToken.userId}).`);
    return NextResponse.json(
      { error: OAuth2ErrorTypes.INVALID_TOKEN, error_description: 'Token subject mismatch with database record.' },
      { status: 401 }
    );
  }
  const user = dbAccessToken.user; // Use the user record from the validated DB access token.

  // 4. 检查 "openid" 作用域
  const scopes = ScopeUtils.parseScopes(jwtPayload.scope as string || dbAccessToken.scope || '');
  if (!scopes.includes('openid')) {
    return NextResponse.json(
      { error: OAuth2ErrorTypes.INSUFFICIENT_SCOPE, error_description: 'The "openid" scope is required to access UserInfo.' },
      { status: 403, headers: { 'WWW-Authenticate': 'Bearer error="insufficient_scope", error_description="openid scope required"' } }
    );
  }

  // 5. 根据授予的作用域构建 UserInfo 响应
  const userInfoClaims: Partial<UserInfoResponse> = { // Use Partial for progressive build
    sub: user.id,
  };

  if (scopes.includes('profile')) {
    userInfoClaims.name = user.displayName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || undefined;
    if (!userInfoClaims.name) delete userInfoClaims.name; // Remove if empty string after trim

    userInfoClaims.given_name = user.firstName || undefined;
    userInfoClaims.family_name = user.lastName || undefined;
    userInfoClaims.preferred_username = user.username; // Assuming username is suitable
    userInfoClaims.picture = user.avatar || undefined;
    userInfoClaims.organization = user.organization || undefined;
    userInfoClaims.department = user.department || undefined;
    if (user.updatedAt) userInfoClaims.updated_at = Math.floor(user.updatedAt.getTime() / 1000);
  }

  // Prisma schema does not have email, email_verified, phone_number, phone_number_verified, address.
  // If they were added, they would be populated here based on scope. Example for email:
  // if (scopes.includes('email')) {
  //   userInfoClaims.email = user.email || undefined;
  //   userInfoClaims.email_verified = user.emailVerified || false; // Assuming boolean, default false
  // }

  // 移除值为 undefined 的声明，以保持响应简洁 (Zod schema's .optional() handles this effectively)
  // Object.keys(userInfoClaims).forEach(key => {
  //   if (userInfoClaims[key as keyof UserInfoResponse] === undefined) {
  //     delete userInfoClaims[key as keyof UserInfoResponse];
  //   }
  // });

  // Validate final response against Zod schema to ensure correctness
  const parsedUserInfo = userInfoResponseSchema.safeParse(userInfoClaims);
  if (!parsedUserInfo.success) {
      console.error("UserInfo response schema validation failed (final constructed object):", parsedUserInfo.error.flatten());
      return NextResponse.json(
        { error: OAuth2ErrorTypes.SERVER_ERROR, error_description: 'Error constructing userinfo response according to schema.' },
        { status: 500 }
      );
  }

  return NextResponse.json(parsedUserInfo.data, { status: 200 });
}

export const GET = withErrorHandler(userinfoHandler);
// UserInfo endpoint 通常也支持 POST (携带 access token 在 body 中)
// export const POST = withErrorHandler(userinfoHandler); // 如果也支持 POST

EOF
