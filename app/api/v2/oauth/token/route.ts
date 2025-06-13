// 文件路径: app/api/v2/oauth/token/route.ts
// 描述: 此文件实现了 OAuth 2.0 令牌端点 (Token Endpoint)。
// 主要职责:
// 1. 客户端认证 (Client Authentication): 验证请求令牌的客户端身份。支持 HTTP Basic Authentication 或请求体中的 client_id 和 client_secret。
// 2. 处理不同的授权类型 (Grant Types):
//    - 'authorization_code': 使用从授权端点获得的授权码来交换访问令牌和刷新令牌。包括 PKCE 验证。
//    - 'refresh_token': 使用刷新令牌来获取新的访问令牌，并可能实现刷新令牌轮换 (Refresh Token Rotation)。
//    - 'client_credentials': 允许客户端直接获取访问令牌以访问其自身拥有的资源或代表其自身执行操作。
// 3. 生成和存储令牌: 创建 JWT 格式的访问令牌和刷新令牌，并将它们（或其哈希）存储到数据库中。
// 4. 返回令牌响应: 将访问令牌、令牌类型 (Bearer)、有效期、刷新令牌（如果适用）和授予的范围返回给客户端。
// 安全性: 强调客户端认证、PKCE、授权码和刷新令牌的一次性使用或轮换机制。

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma'; // Prisma ORM 用于数据库交互
import { OAuthClient, User, AuthorizationCode, RefreshToken as PrismaRefreshToken, AccessToken as PrismaAccessToken } from '@prisma/client'; // Prisma 生成的数据库模型类型
// OAuth 2.0 相关的辅助工具函数:
// ClientAuthUtils: 用于客户端认证逻辑。
// AuthorizationUtils: 用于获取用户权限等授权相关操作。
// OAuth2ErrorTypes: 定义标准的 OAuth 2.0 错误代码。
// PKCEUtils: 用于 PKCE (Proof Key for Code Exchange) 的验证。
// ScopeUtils: 用于处理和验证 scopes (权限范围)。
// JWTUtils: 用于创建和操作 JWT (JSON Web Tokens)。
import { ClientAuthUtils, AuthorizationUtils, OAuth2ErrorTypes, PKCEUtils, ScopeUtils, JWTUtils } from '@/lib/auth/oauth2';
import { addHours, addDays, getUnixTime } from 'date-fns'; // 用于日期和时间操作 (例如设置令牌过期时间)
import crypto from 'crypto'; // Node.js 内置加密模块，用于生成令牌哈希等

// --- 辅助函数 ---
/**
 * 构建并返回标准化的错误响应。
 * @param error - OAuth 2.0 错误代码 (例如, 'invalid_request', 'invalid_client', 'invalid_grant', 'unsupported_grant_type', 'server_error')，遵循 RFC 6749, Section 5.2。
 * @param description - 对错误的详细描述，帮助客户端开发者理解问题。
 * @param status - HTTP 状态码，通常是 400 (Bad Request), 401 (Unauthorized), 或 500 (Internal Server Error)。
 * @returns NextResponse 对象，包含 JSON 格式的错误信息。
 */
function errorResponse(error: string, description: string, status: number = 400): NextResponse {
  console.warn(`Token endpoint error: ${error} - ${description}`); // 在服务端记录错误日志，便于调试
  return NextResponse.json({ error, error_description: description }, { status });
}

// --- 主处理函数 (HTTP POST) ---
/**
 * 处理来自客户端的 POST 请求，用于交换或获取令牌。
 * @param req NextRequest 对象，包含客户端的请求信息 (通常是 x-www-form-urlencoded 格式的表单数据)。
 * @returns NextResponse 对象，包含令牌信息或错误信息。
 */
export async function POST(req: NextRequest) {
  // OAuth 2.0 令牌端点通常接收 application/x-www-form-urlencoded 格式的请求体。
  const formData = await req.formData(); // 解析请求体中的表单数据

  // --- 步骤 1: 客户端认证 (Client Authentication) ---
  // (Client Authentication as per RFC 6749, Section 2.3 and Section 3.2.1)
  // 验证发出请求的客户端的身份。这对于机密客户端 (Confidential Clients) 是必需的。
  // ClientAuthUtils.authenticateClient 应该能够处理 HTTP Basic Authentication (使用 client_id 和 client_secret)
  // 以及在请求体中传递 client_id 和 client_secret 的方式。
  const authResult = await ClientAuthUtils.authenticateClient(req, formData);

  // 如果客户端认证失败或未找到客户端
  if (authResult.error || !authResult.client) {
    return errorResponse(
      authResult.error?.error || OAuth2ErrorTypes.INVALID_CLIENT, // 错误类型
      authResult.error?.error_description || 'Client authentication failed.', // 错误描述
      authResult.error?.error === OAuth2ErrorTypes.INVALID_CLIENT ? 401 : 400 // 通常 'invalid_client' 返回 401，其他请求参数问题返回 400
    );
  }
  const client = authResult.client as OAuthClient; // 类型断言，因为我们检查了 !authResult.client

  // --- 步骤 2: 根据 grant_type (授权类型) 分发处理 ---
  // (Dispatch based on grant_type)
  // grant_type 参数指示客户端希望如何获取访问令牌。
  const grantType = formData.get('grant_type') as string;

  try {
    // 根据不同的 grant_type 调用相应的处理函数
    switch (grantType) {
      case 'authorization_code': // 授权码模式
        return await handleAuthorizationCodeGrant(formData, client);
      case 'refresh_token': // 刷新令牌模式
        return await handleRefreshTokenGrant(formData, client);
      case 'client_credentials': // 客户端凭据模式
        return await handleClientCredentialsGrant(formData, client);
      default: // 不支持的授权类型
        return errorResponse(OAuth2ErrorTypes.UNSUPPORTED_GRANT_TYPE, `Unsupported grant_type: ${grantType}`);
    }
  } catch (e: any) {
    // 捕获在各个 grant_type 处理函数中可能主动抛出的特定错误对象。
    // 这些错误对象通常包含 error, error_description, 和 status 字段。
    if (e.error && e.error_description) {
        return errorResponse(e.error, e.error_description, e.status || 400);
    }
    // 如果是未预料的内部服务器错误
    console.error('Token endpoint internal error:', e);
    return errorResponse(OAuth2ErrorTypes.SERVER_ERROR, 'An unexpected error occurred.');
  }
}


// --- 'authorization_code' 授权类型处理函数 ---
/**
 * 处理 'authorization_code' 授权类型。
 * 客户端使用从授权端点获得的授权码来交换访问令牌和刷新令牌。
 * @param formData 包含请求参数的 FormData 对象。
 * @param client 经过认证的 OAuthClient 对象。
 * @returns NextResponse 对象，包含令牌或错误信息。
 */
async function handleAuthorizationCodeGrant(formData: FormData, client: OAuthClient): Promise<NextResponse> {
  // 从请求中获取必要的参数
  const code = formData.get('code') as string;                     // 授权码
  const redirectUri = formData.get('redirect_uri') as string;     // 客户端的重定向URI，必须与授权请求中使用的完全匹配
  const codeVerifier = formData.get('code_verifier') as string;   // PKCE (RFC 7636) 的 code_verifier

  // 验证必需参数是否存在
  if (!code || !redirectUri) {
    // 主动抛出错误对象，由上层 catch 块处理并转换为标准错误响应
    throw { error: OAuth2ErrorTypes.INVALID_REQUEST, error_description: 'Missing required parameters: code, redirect_uri.' };
  }
  // 对于授权码流程，如果客户端在授权请求中发送了 code_challenge (PKCE)，则此处必须提供 code_verifier。
  // 现代 OAuth 2.0 实现通常强制要求 PKCE。
  if (!codeVerifier) {
      throw { error: OAuth2ErrorTypes.INVALID_REQUEST, error_description: 'Missing required parameter: code_verifier.' };
  }

  // --- 验证授权码 (Validate Authorization Code) ---
  // 从数据库中查找授权码记录，并包含关联的用户信息。
  const authCode = await prisma.authorizationCode.findUnique({
    where: { code },        // 使用授权码本身进行查找
    include: { user: true } // 同时加载关联的用户信息
  });

  // 授权码不存在
  if (!authCode) {
    throw { error: OAuth2ErrorTypes.INVALID_GRANT, error_description: 'Authorization code not found.' };
  }
  // 安全考虑: 授权码已被使用。一个授权码只能使用一次。
  // 如果检测到已使用的授权码被再次尝试使用，可能表明存在安全风险 (如授权码被窃取)，可以考虑撤销相关的令牌。
  if (authCode.isUsed) {
    // TODO: 考虑实现一个机制，当已使用的授权码被重放时，撤销该授权码之前签发的所有相关令牌。
    throw { error: OAuth2ErrorTypes.INVALID_GRANT, error_description: 'Authorization code has already been used.' };
  }
  // 授权码已过期
  if (authCode.expiresAt < new Date()) {
    throw { error: OAuth2ErrorTypes.INVALID_GRANT, error_description: 'Authorization code expired.' };
  }
  // redirect_uri 不匹配。必须与生成授权码时使用的 redirect_uri 完全一致。
  // 这是防止授权码被拦截后在其他重定向URI上使用。
  if (authCode.redirectUri !== redirectUri) {
    throw { error: OAuth2ErrorTypes.INVALID_GRANT, error_description: 'redirect_uri mismatch.' };
  }
  // 授权码并非颁发给此客户端。
  if (authCode.clientId !== client.id) {
    throw { error: OAuth2ErrorTypes.INVALID_GRANT, error_description: 'Authorization code was not issued to this client.' };
  }

  // --- PKCE 验证 (PKCE Verification) ---
  // (RFC 7636: Proof Key for Code Exchange)
  // 防止授权码被恶意应用拦截后使用。
  // 客户端在授权请求时发送 code_challenge，在令牌请求时发送 code_verifier。
  // 服务器验证 code_verifier 通过哈希计算后是否与 code_challenge 匹配。
  if (!authCode.codeChallenge || !authCode.codeChallengeMethod) {
      // 如果数据库中存储的授权码记录没有 code_challenge，说明授权请求阶段就没有使用PKCE。
      // 根据策略，这可能是一个错误，因为现代实现通常强制PKCE。
      console.error(`Authorization code ${authCode.id} is missing PKCE challenge information from database.`);
      throw { error: OAuth2ErrorTypes.INVALID_GRANT, error_description: 'PKCE challenge missing from authorization code record. Authorization request might not have used PKCE.' };
  }
  // 使用 PKCEUtils.verifyCodeChallenge 验证 code_verifier。
  // 它会根据 authCode.codeChallengeMethod (应为 'S256') 对 codeVerifier 进行哈希，然后与 authCode.codeChallenge 比较。
  if (!PKCEUtils.verifyCodeChallenge(codeVerifier, authCode.codeChallenge, authCode.codeChallengeMethod as 'S256')) { // 类型断言，因为我们通常只支持S256
    throw { error: OAuth2ErrorTypes.INVALID_GRANT, error_description: 'PKCE verification failed: Invalid code_verifier.' };
  }

  // --- 将授权码标记为已使用 ---
  // (Mark authorization code as used to prevent reuse)
  // 这是确保授权码一次性使用的关键步骤。
  await prisma.authorizationCode.update({
    where: { id: authCode.id },
    data: { isUsed: true }, // 将 isUsed 字段设置为 true
  });

  // --- 生成访问令牌 (Access Token) 和刷新令牌 (Refresh Token) ---
  // 确保授权码关联的用户信息存在。
  if (!authCode.userId || !authCode.user) {
      console.error(`User ID or user object missing for AuthorizationCode ID: ${authCode.id}. This indicates a data integrity issue.`);
      throw { error: OAuth2ErrorTypes.SERVER_ERROR, error_description: 'User information missing from authorization code record.' };
  }

  // 获取用户的权限列表，这些权限将被包含在访问令牌中。
  const userPermissions = await AuthorizationUtils.getUserPermissions(authCode.userId);

  // 使用 JWTUtils 创建访问令牌。
  // 访问令牌是一个 JWT，包含了客户端ID、用户ID、授予的范围、用户权限等信息。
  const accessTokenString = await JWTUtils.createAccessToken({
    client_id: client.clientId,   // 客户端的字符串ID (e.g., 'my-app-client')
    user_id: authCode.userId,     // 用户ID
    scope: authCode.scope,        // 从授权码中获取的、用户已同意授予的范围
    permissions: userPermissions, // 用户的权限列表
  });
  // 使用 JWTUtils 创建刷新令牌。
  // 刷新令牌通常也是 JWT，包含足够的信息以便在后续刷新时识别用户和客户端。
  const refreshTokenString = await JWTUtils.createRefreshToken({
    client_id: client.clientId,
    user_id: authCode.userId,
    scope: authCode.scope, // 刷新令牌也关联了原始授予的范围
  });

  // --- 存储访问令牌和刷新令牌到数据库 ---
  // (Store Access Token and Refresh Token in the database)
  // 存储令牌（或其哈希）可以用于撤销、审计等目的。
  // 安全考虑: 不建议直接存储原始令牌字符串，而是存储其哈希值，以防止数据库泄露时令牌被直接使用。
  const accessTokenExpiresIn = 3600; // 访问令牌有效期，例如1小时 (秒)
  await prisma.accessToken.create({
    data: {
      token: accessTokenString, // 考虑仅存储哈希: JWTUtils.getTokenHash(accessTokenString)
      tokenHash: JWTUtils.getTokenHash(accessTokenString), // 存储令牌的哈希值
      userId: authCode.userId,
      clientId: client.id, // 存储客户端的数据库ID (外键)
      scope: authCode.scope,
      expiresAt: addHours(new Date(), accessTokenExpiresIn / 3600), // 计算过期时间
      isRevoked: false,
    },
  });
  await prisma.refreshToken.create({
    data: {
      token: refreshTokenString, // 考虑仅存储哈希: JWTUtils.getTokenHash(refreshTokenString)
      tokenHash: JWTUtils.getTokenHash(refreshTokenString), // 存储令牌的哈希值
      userId: authCode.userId,
      clientId: client.id,
      scope: authCode.scope,
      expiresAt: addDays(new Date(), 30), // 刷新令牌有效期通常更长，例如30天
      isRevoked: false,
    },
  });

  // --- 返回令牌响应 ---
  // (Return token response as per RFC 6749, Section 5.1)
  return NextResponse.json({
    access_token: accessTokenString,      // 访问令牌
    token_type: 'Bearer',                 // 令牌类型 (固定为 'Bearer')
    expires_in: accessTokenExpiresIn,     // 访问令牌的有效期 (秒)
    refresh_token: refreshTokenString,    // 刷新令牌
    scope: authCode.scope,                // 实际授予的范围
    // id_token: "...", // 如果请求了 openid scope 并且是 OIDC 流程，则此处还应包含 ID Token
  });
}

// --- 'refresh_token' 授权类型处理函数 ---
/**
 * 处理 'refresh_token' 授权类型。
 * 客户端使用之前获得的刷新令牌来获取新的访问令牌。
 * @param formData 包含请求参数的 FormData 对象。
 * @param client 经过认证的 OAuthClient 对象。
 * @returns NextResponse 对象，包含新的令牌或错误信息。
 */
async function handleRefreshTokenGrant(formData: FormData, client: OAuthClient): Promise<NextResponse> {
  const refreshTokenValue = formData.get('refresh_token') as string; // 客户端提交的刷新令牌
  const requestedScope = formData.get('scope') as string | undefined;   // 客户端可能请求缩减范围 (Optional scope parameter for narrowing scope)

  if (!refreshTokenValue) {
    throw { error: OAuth2ErrorTypes.INVALID_REQUEST, error_description: 'Missing required parameter: refresh_token.' };
  }

  // --- 查找并验证刷新令牌 ---
  // (Find and validate the refresh token)
  // 安全考虑: 应使用刷新令牌的哈希值在数据库中进行查找，而不是原始令牌字符串。
  const refreshTokenHash = JWTUtils.getTokenHash(refreshTokenValue);
  const storedRefreshToken = await prisma.refreshToken.findUnique({
    where: { tokenHash: refreshTokenHash }, // 使用哈希值查找
  });

  // 刷新令牌未找到
  if (!storedRefreshToken) {
    throw { error: OAuth2ErrorTypes.INVALID_GRANT, error_description: 'Refresh token not found.' };
  }
  // 刷新令牌已被撤销
  // 安全增强: 如果一个已撤销的刷新令牌被尝试使用，这可能表明该令牌已被泄露。
  // OAuth 2.0 BCP (Best Current Practice) 建议在这种情况下，授权服务器应撤销该刷新令牌及其所有后代令牌（通过轮换机制产生的）。
  if (storedRefreshToken.isRevoked) {
    // TODO: 实现检测和处理被盗刷新令牌的逻辑 (e.g., 撤销整个令牌家族)。
    console.warn(`Attempt to use revoked refresh token (ID: ${storedRefreshToken.id}, Client: ${client.clientId}).`);
    throw { error: OAuth2ErrorTypes.INVALID_GRANT, error_description: 'Refresh token has been revoked.' };
  }
  // 刷新令牌已过期
  if (storedRefreshToken.expiresAt < new Date()) {
    throw { error: OAuth2ErrorTypes.INVALID_GRANT, error_description: 'Refresh token expired.' };
  }
  // 刷新令牌并非颁发给此客户端
  if (storedRefreshToken.clientId !== client.id) {
    throw { error: OAuth2ErrorTypes.INVALID_GRANT, error_description: 'Refresh token was not issued to this client.' };
  }

  // --- 范围验证 (Scope Validation) ---
  // 当使用刷新令牌时，客户端可以请求与原始授予范围相同或更窄的范围。
  // 不能请求超出原始授予范围的权限。
  const originalScopes = ScopeUtils.parseScopes(storedRefreshToken.scope); // 原始授予的范围
  let grantedScope = storedRefreshToken.scope; // 默认情况下，新访问令牌的范围与原始范围相同

  if (requestedScope) { // 如果客户端在刷新请求中指定了 scope 参数
    const newRequestedScopes = ScopeUtils.parseScopes(requestedScope);
    // 检查请求的新范围是否是原始范围的子集
    if (newRequestedScopes.some(s => !originalScopes.includes(s))) {
      // 请求了原始范围之外的权限，这是不允许的
      throw { error: OAuth2ErrorTypes.INVALID_SCOPE, error_description: 'Requested scope exceeds originally granted scope for the refresh token.' };
    }
    grantedScope = ScopeUtils.formatScopes(newRequestedScopes); // 如果有效，则授予请求的新范围 (通常是缩小的范围)
  }

  // 确保刷新令牌关联的用户信息存在
  if (!storedRefreshToken.userId) {
      console.error(`User ID missing for RefreshToken ID: ${storedRefreshToken.id}. Data integrity issue.`);
      throw { error: OAuth2ErrorTypes.SERVER_ERROR, error_description: 'User information missing from refresh token record.' };
  }
  // 获取用户权限，用于创建新的访问令牌
  const userPermissions = await AuthorizationUtils.getUserPermissions(storedRefreshToken.userId);

  // --- 生成新的访问令牌 ---
  // (Generate new Access Token)
  const newAccessTokenString = await JWTUtils.createAccessToken({
    client_id: client.clientId,
    user_id: storedRefreshToken.userId,
    scope: grantedScope, // 新访问令牌的范围
    permissions: userPermissions,
  });

  // --- 存储新的访问令牌到数据库 ---
  // (Store new Access Token in the database)
  const accessTokenExpiresIn = 3600; // 新访问令牌的有效期，例如1小时
  const newAccessTokenHash = JWTUtils.getTokenHash(newAccessTokenString);
  await prisma.accessToken.create({
    data: {
      tokenHash: newAccessTokenHash,
      userId: storedRefreshToken.userId,
      clientId: client.id,
      scope: grantedScope,
      expiresAt: addHours(new Date(), accessTokenExpiresIn / 3600),
      isRevoked: false,
      // refreshTokenId: storedRefreshToken.id, // 可选: 关联到使用的刷新令牌 (如果不是轮换机制)
    },
  });

  // --- 刷新令牌轮换 (Refresh Token Rotation) ---
  // (Refresh Token Rotation as per OAuth 2.0 Security Best Current Practice)
  // 为了提高安全性，当一个刷新令牌被使用后，授权服务器应该：
  // 1. 将用过的刷新令牌标记为已撤销或立即作废。
  // 2. 颁发一个新的刷新令牌给客户端。
  // 这种机制有助于检测刷新令牌的泄露。如果一个已被轮换掉的（旧的）刷新令牌被再次使用，服务器可以检测到并撤销整个令牌家族。

  // 1. 将当前使用的刷新令牌标记为已撤销
  await prisma.refreshToken.update({
    where: { id: storedRefreshToken.id },
    data: {
      isRevoked: true,        // 标记为已撤销
      revokedAt: new Date(),  // 记录撤销时间
      // replacedByTokenId: newRefreshToken.id, // 可选: 如果新刷新令牌已生成ID，可以链接 (需要调整逻辑顺序)
    },
  });

  // 2. 生成一个新的刷新令牌
  const newRefreshTokenString = await JWTUtils.createRefreshToken({
    client_id: client.clientId,
    user_id: storedRefreshToken.userId,
    scope: grantedScope, // 新的刷新令牌继承计算后的范围 (通常与新访问令牌的范围一致)
  });
  const newGeneratedRefreshTokenHash = JWTUtils.getTokenHash(newRefreshTokenString); // 注意变量名区分
  const newRefreshTokenExpiresAt = addDays(new Date(), 30); // 假设新的刷新令牌有效期仍为30天

  // 3. 存储新的刷新令牌到数据库
  await prisma.refreshToken.create({
    data: {
      tokenHash: newGeneratedRefreshTokenHash,
      userId: storedRefreshToken.userId,
      clientId: client.id,
      scope: grantedScope,
      expiresAt: newRefreshTokenExpiresAt,
      isRevoked: false,
      previousTokenId: storedRefreshToken.id, // 关键: 链接到被它替换掉的旧刷新令牌的ID，用于追踪和泄露检测
    },
  });

  // 日志记录轮换事件
  console.log(`Refresh token rotated for user ${storedRefreshToken.userId}, client ${client.clientId}. Old RT ID: ${storedRefreshToken.id}, New RT Hash: ${newGeneratedRefreshTokenHash}.`);


  // --- 返回包含新访问令牌和新刷新令牌的响应 ---
  return NextResponse.json({
    access_token: newAccessTokenString,
    token_type: 'Bearer',
    expires_in: accessTokenExpiresIn,
    refresh_token: newRefreshTokenString, // 返回新的刷新令牌
    scope: grantedScope,
  });
}

// --- 'client_credentials' 授权类型处理函数 ---
/**
 * 处理 'client_credentials' 授权类型。
 * 客户端直接使用其凭据 (已通过初始的客户端认证验证) 来获取访问令牌。
 * 这种授权类型通常用于机器对机器的通信，访问令牌代表客户端自身，而不是某个最终用户。
 * @param formData 包含请求参数的 FormData 对象 (可能包含可选的 'scope' 参数)。
 * @param client 经过认证的 OAuthClient 对象。
 * @returns NextResponse 对象，包含令牌或错误信息。
 */
async function handleClientCredentialsGrant(formData: FormData, client: OAuthClient): Promise<NextResponse> {
  // 安全考虑: 公共客户端 (Public Clients) 通常不应使用 client_credentials 授权类型，
  // 因为它们无法安全地存储客户端凭据。ClientAuthUtils.authenticateClient 可能已经处理了这一点，
  // 但在此处进行双重检查是好的。
  if (client.clientType === 'PUBLIC') {
      throw { error: OAuth2ErrorTypes.UNAUTHORIZED_CLIENT, error_description: 'Public clients are not permitted to use the client_credentials grant type.' };
  }

  const requestedScope = formData.get('scope') as string | undefined; // 客户端可能请求特定的范围
  let grantedScope: string | undefined = undefined; // 最终授予的范围

  // 范围处理逻辑:
  // 1. 如果客户端请求了 specific scopes:
  //    - 验证这些 scopes 是否是该客户端被允许请求的 (通常在客户端注册信息中配置)。
  //    - 如果有效，则授予这些 scopes。
  // 2. 如果客户端未请求 specific scopes:
  //    - 可以授予客户端预配置的一组默认 scopes。
  //    - 或者，如果策略是要求明确请求，则可能不授予任何 scopes 或返回错误。
  if (requestedScope) {
    const requestedScopesArray = ScopeUtils.parseScopes(requestedScope);
    // 从数据库中获取客户端允许的范围 (client.allowedScopes 可能是一个 JSON 字符串数组)
    const clientAllowedScopes = client.allowedScopes ? ScopeUtils.parseScopes(JSON.parse(client.allowedScopes as string)) : [];

    // 检查请求的每个 scope 是否都在客户端允许的范围内
    if (requestedScopesArray.some(s => !clientAllowedScopes.includes(s))) {
      throw { error: OAuth2ErrorTypes.INVALID_SCOPE, error_description: 'Requested scope is not allowed for this client or is invalid.' };
    }
    // TODO: 还应验证这些 scopes 是否是系统中定义的有效 scopes (全局范围字典)。
    grantedScope = ScopeUtils.formatScopes(requestedScopesArray);
  } else {
    // 如果客户端没有请求 scope，可以根据策略授予客户端所有被允许的 scope，或一组默认 scope。
    // 这里假设授予客户端所有被允许的 scope。
    try {
        const clientScopes = client.allowedScopes ? JSON.parse(client.allowedScopes as string) : [];
        if (Array.isArray(clientScopes) && clientScopes.length > 0) {
            grantedScope = ScopeUtils.formatScopes(clientScopes); // 默认授予客户端所有允许的范围
        }
    } catch(e) {
        console.error("Error parsing client.allowedScopes for client_credentials grant for client:", client.clientId, e);
        // 根据策略决定行为: 可以授予空范围，或返回错误。
        // 为了简单起见，如果解析失败，则 grantedScope 将保持 undefined。
    }
  }

  // --- 生成访问令牌 ---
  // (Generate Access Token for the client)
  // client_credentials 流程中颁发的访问令牌代表客户端自身，因此通常不包含 user_id。
  // 其权限 (permissions) 可能来源于客户端自身的配置，而不是用户的权限。
  const accessTokenString = await JWTUtils.createAccessToken({
    client_id: client.clientId,   // 令牌属于此客户端
    // user_id: undefined,        // client_credentials 流程中没有用户上下文
    scope: grantedScope,          // 授予的范围
    permissions: [],              // 对于 client_credentials，权限通常是客户端级别的，可能需要不同的加载方式
                                  // 例如，可以定义一组 "client_permissions" 关联到 OAuthClient 模型。
                                  // 此处简单设置为空数组。
  });
  const accessTokenHash = JWTUtils.getTokenHash(accessTokenString);

  // --- 存储访问令牌到数据库 ---
  // (Store Access Token in the database)
  const accessTokenExpiresIn = 3600; // 访问令牌有效期，例如1小时
  await prisma.accessToken.create({
    data: {
      tokenHash: accessTokenHash,
      // userId: null, // client_credentials 流程中没有用户
      clientId: client.id,
      scope: grantedScope,
      expiresAt: addHours(new Date(), accessTokenExpiresIn / 3600),
      isRevoked: false, // 通常不单独撤销，依赖其较短的有效期
    },
  });

  // --- 返回令牌响应 ---
  return NextResponse.json({
    access_token: accessTokenString,
    token_type: 'Bearer',
    expires_in: accessTokenExpiresIn,
    scope: grantedScope, // 返回实际授予的范围
    // 注意: client_credentials 流程通常不返回 refresh_token。
  });
}

// The declare module block for ClientAuthUtils.getUserPermissions is no longer needed
// as AuthorizationUtils.getUserPermissions is used and expected to be correctly defined.
// (原有的模块声明用于类型提示，如果 AuthorizationUtils.getUserPermissions 定义清晰，则不再需要)
