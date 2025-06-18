// 文件路径: app/api/v2/oauth/userinfo/route.ts
// File path: app/api/v2/oauth/userinfo/route.ts
// 描述: OpenID Connect UserInfo 端点 (OIDC Core 1.0, Section 5.3)
// Description: OpenID Connect UserInfo Endpoint (OIDC Core 1.0, Section 5.3)

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withErrorHandling } from '@/lib/utils/error-handler';
import { JWTUtils, ScopeUtils, OAuth2ErrorTypes } from '@/lib/auth/oauth2';
import { UserInfoResponse, userInfoResponseSchema } from './schemas';
import { User } from '@prisma/client';
import { ApiResponse } from '@/lib/types/api';
import { OAuth2Error, OAuth2ErrorCode, BaseError, ResourceNotFoundError } from '@/lib/errors';

// UserInfo 端点受访问令牌保护。
// UserInfo endpoint is protected by an Access Token.
// 访问令牌的 'aud' (受众) 声明应被验证 (由 JWTUtils.verifyAccessToken 处理)。
// The access token's 'aud' (audience) claim should be validated (handled by JWTUtils.verifyAccessToken).

/**
 * @swagger
 * /api/v2/oauth/userinfo:
 *   get:
 *     summary: OIDC UserInfo 端点 (OIDC UserInfo Endpoint)
 *     description: |
 *       获取授权用户的声明。请求必须包含一个有效的访问令牌，并授予 "openid" 作用域。
 *       Gets claims about the authenticated end-user. The request MUST contain a valid Access Token that grants the "openid" scope.
 *       令牌通过 Authorization Bearer header 提供。
 *       The token is provided via the Authorization Bearer header.
 *     tags:
 *       - OAuth V2 (OIDC)
 *     security:
 *       - bearerAuth: []
 *     produces:
 *       - application/json
 *     responses:
 *       '200':
 *         description: 成功返回用户声明。 (Successfully returns user claims.)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponseUserInfo' # 更新为 ApiResponse 结构 (Updated to ApiResponse structure)
 *       '400':
 *         description: 无效请求（例如，Authorization header 格式错误）。 (Invalid request (e.g., malformed Authorization header).)
 *       '401':
 *         description: 未经授权 (例如，令牌缺失、无效、过期或被撤销)。 (Unauthorized (e.g., token missing, invalid, expired, or revoked).)
 *       '403':
 *         description: 禁止访问 (例如，令牌有效但没有 "openid" 作用域)。 (Forbidden (e.g., token valid but no "openid" scope).)
 *       '404':
 *         description: 与令牌关联的用户数据未找到。 (User data associated with the token not found.)
 *       '500':
 *         description: 服务器内部错误。 (Internal server error.)
 * components:
 *   schemas:
 *     UserInfoResponseData: # OIDC UserInfo 响应中 'data' 字段的结构 (Structure of 'data' field in OIDC UserInfo response)
 *       type: object
 *       properties:
 *         sub: { type: string, description: "用户的唯一标识符。" }
 *         name: { type: string, nullable: true, description: "用户的全名。" }
 *         given_name: { type: string, nullable: true, description: "用户的名。" }
 *         family_name: { type: string, nullable: true, description: "用户的姓。" }
 *         preferred_username: { type: string, nullable: true, description: "用户的首选用户名。" }
 *         email: { type: string, format: email, nullable: true, description: "用户的电子邮件地址。" }
 *         email_verified: { type: boolean, nullable: true, description: "用户的电子邮件是否已验证。" }
 *         picture: { type: string, format: url, nullable: true, description: "用户头像的URL。" }
 *         organization: { type: string, nullable: true, description: "用户所属组织。" }
 *         department: { type: string, nullable: true, description: "用户所属部门。" }
 *         updated_at: { type: number, format: int64, description: "用户信息最后更新时间的Unix时间戳。" }
 *     ApiResponseUserInfo: # UserInfo 端点的标准成功响应 (Standard success response for UserInfo endpoint)
 *       allOf:
 *         - $ref: '#/components/schemas/ApiResponseBase'
 *         - type: object
 *           properties:
 *             data: { $ref: '#/components/schemas/UserInfoResponseData' }
 *     ApiResponseBase: # 已在其他地方定义 (Defined elsewhere)
 *       type: object
 *       properties: { success: {type: boolean}, message: {type: string, nullable: true} }
 *     ApiError: # 已在其他地方定义 (Defined elsewhere)
 *       type: object
 *       properties: { code: {type: string}, message: {type: string}, details: {type: object, nullable: true} }
 *     ApiResponseError: # 已在其他地方定义 (Defined elsewhere)
 *       allOf:
 *         - $ref: '#/components/schemas/ApiResponseBase'
 *         - type: object
 *           properties: { error: { $ref: '#/components/schemas/ApiError' } }
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */
// UserInfo 端点处理函数
// UserInfo endpoint handler function
async function userinfoHandlerInternal(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    // 如果头部缺失或格式不正确，抛出 OAuth2Error
    // If header is missing or malformed, throw OAuth2Error
    // withErrorHandling 将添加 WWW-Authenticate (如果 handleError 配置如此)
    // withErrorHandling would add WWW-Authenticate if handleError is configured to do so
    throw new OAuth2Error('Authorization header with Bearer token is required.', OAuth2ErrorCode.InvalidRequest, 401);
  }
  const accessTokenValue = authHeader.substring(7); // 去除 "Bearer " 前缀 (Remove "Bearer " prefix)

  // 1. 验证访问令牌的有效性
  // 1. Validate the access token's validity
  const tokenVerification = await JWTUtils.verifyAccessToken(accessTokenValue);
  if (!tokenVerification.valid || !tokenVerification.payload) {
    // 如果令牌无效或已过期，抛出 OAuth2Error
    // If token is invalid or expired, throw OAuth2Error
    throw new OAuth2Error(tokenVerification.error || 'Invalid or expired access token.', OAuth2ErrorCode.InvalidToken, 401);
  }
  const jwtPayload = tokenVerification.payload;

  // 2. JTI黑名单检查
  // 2. JTI blacklist check
  if (jwtPayload.jti) {
    const blacklistedJti = await prisma.tokenBlacklist.findUnique({ where: { jti: jwtPayload.jti } });
    if (blacklistedJti) {
      // 如果JTI在黑名单中，令牌已被撤销，抛出 OAuth2Error
      // If JTI is in the blacklist, token has been revoked, throw OAuth2Error
      throw new OAuth2Error('Access token has been revoked (JTI blacklisted).', OAuth2ErrorCode.InvalidToken, 401);
    }
  }

  // 3. 检查数据库中的 AccessToken 记录
  // 3. Check AccessToken record in the database
  const dbAccessToken = await prisma.accessToken.findFirst({
    where: {
      tokenHash: JWTUtils.getTokenHash(accessTokenValue),
      expiresAt: { gt: new Date() },
      // isRevoked 字段已从 AccessToken 模型中移除，依赖于 TokenBlacklist
      // isRevoked field was removed from AccessToken model, relying on TokenBlacklist
    },
    include: { user: true }
  });

  if (!dbAccessToken) {
    // 数据库中没有匹配的、有效的访问令牌记录
    // No matching, valid access token record in DB
    throw new OAuth2Error('Access token is invalid or not found in database.', OAuth2ErrorCode.InvalidToken, 401);
  }

  // 确保JWT中的 'sub' (subject) 与数据库中访问令牌记录关联的 userId 匹配
  // Ensure 'sub' (subject) from JWT matches the userId associated with the AccessToken record in DB
  if (jwtPayload.sub !== dbAccessToken.userId) {
    console.error(`UserInfo Error: JWT sub (${jwtPayload.sub}) does not match AccessToken record's userId (${dbAccessToken.userId}). Potential token misuse.`);
    throw new OAuth2Error('Token subject mismatch with database record.', OAuth2ErrorCode.InvalidToken, 401);
  }

  // 从数据库记录中获取用户，而不是仅依赖令牌的 sub
  // Get user from the database record, not just relying on token's sub
  const user = dbAccessToken.user;
  if (!user) {
      // 如果访问令牌有效，但关联的用户在 User 表中找不到
      // If access token is valid, but the associated user is not found in User table
      throw new ResourceNotFoundError(`User data not found for user ID: ${dbAccessToken.userId}.`, 'USER_DATA_NOT_FOUND_USERINFO', { userId: dbAccessToken.userId });
  }
  if (!user.isActive) {
      // 如果用户账户被禁用
      // If user account is disabled
      throw new AuthenticationError('User account is inactive.', { userId: user.id }, 'ACCOUNT_INACTIVE_USERINFO');
  }


  // 4. 检查 "openid" 作用域
  // 4. Check for "openid" scope
  const scopes = ScopeUtils.parseScopes(jwtPayload.scope as string || dbAccessToken.scope || '');
  if (!scopes.includes('openid')) {
    // 如果没有 "openid" 范围，则禁止访问 UserInfo 端点
    // If "openid" scope is not present, forbid access to UserInfo endpoint
    throw new OAuth2Error('The "openid" scope is required to access UserInfo.', OAuth2ErrorCode.InsufficientScope, 403);
  }

  // 5. 根据授予的作用域构建 UserInfo 响应
  // 5. Construct UserInfo response based on granted scopes
  const userInfoClaims: Partial<UserInfoResponse> = {
    sub: user.id,
  };

  if (scopes.includes('profile')) {
    userInfoClaims.name = user.displayName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || undefined;
    if (!userInfoClaims.name) delete userInfoClaims.name;

    userInfoClaims.given_name = user.firstName || undefined;
    userInfoClaims.family_name = user.lastName || undefined;
    userInfoClaims.preferred_username = user.username || undefined;
    userInfoClaims.picture = user.avatar || undefined;
    userInfoClaims.organization = user.organization || undefined;
    userInfoClaims.department = user.department || undefined;
    if (user.updatedAt) userInfoClaims.updated_at = Math.floor(user.updatedAt.getTime() / 1000);
  }

  if (scopes.includes('email')) {
    userInfoClaims.email = user.email || undefined;
    userInfoClaims.email_verified = user.emailVerified ?? undefined; // Prisma schema might have emailVerified as boolean | null
  }
  if (scopes.includes('phone') && user.phone) { // 假设 User 模型中有 phone 和 phone_verified 字段
                                               // Assuming User model has phone and phone_verified fields
    userInfoClaims.phone_number = user.phone;
    // userInfoClaims.phone_number_verified = user.phoneVerified ?? false;
  }
  // TODO: 根据需要添加 'address' 范围的声明 (Add claims for 'address' scope if needed)

  // 根据 Zod 模式验证最终响应对象
  // Validate final response against Zod schema
  const parsedUserInfo = userInfoResponseSchema.safeParse(userInfoClaims);
  if (!parsedUserInfo.success) {
      console.error("UserInfo response schema validation failed (final constructed object):", parsedUserInfo.error.flatten());
      throw new BaseError('Error constructing userinfo response according to schema.', 500, 'USERINFO_RESPONSE_SCHEMA_ERROR', { zodIssues: parsedUserInfo.error.flatten() });
  }

  // 返回遵循 ApiResponse 结构的成功响应
  // Return a successful response following the ApiResponse structure
  return NextResponse.json<ApiResponse<UserInfoResponse>>({
    success: true,
    data: parsedUserInfo.data,
    message: "User information retrieved successfully."
  }, { status: 200 });
}

// 使用 withErrorHandling 包装处理函数
// Wrap the handler with withErrorHandling
export const GET = withErrorHandling(userinfoHandlerInternal);
// UserInfo 端点通常也支持 POST (在请求体中携带访问令牌)
// UserInfo endpoint usually also supports POST (carrying access token in the body)
export const POST = withErrorHandling(userinfoHandlerInternal); // 如果也支持 POST (If POST is also supported)

// 文件结束 (End Of File)
// EOF
