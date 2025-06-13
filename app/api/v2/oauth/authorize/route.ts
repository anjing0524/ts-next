// 文件路径: app/api/v2/oauth/authorize/route.ts
// 描述: 此文件实现了 OAuth 2.0 授权端点 (Authorization Endpoint)。
// 这是 OAuth 2.0 授权码流程 (Authorization Code Grant) 的第一步。
// 主要职责:
// 1. 验证第三方客户端的请求参数 (client_id, redirect_uri, response_type, scope, PKCE parameters)。
// 2. 验证第三方客户端身份。
// 3. 确保用户已登录到认证中心 (Auth Center)。如果未登录，则重定向到认证中心的登录页面。
// 4. 检查用户是否已授予第三方客户端所请求的权限 (scopes)。如果未授予或部分授予，则重定向到同意页面。
// 5. 如果所有检查通过且用户已同意，则生成一个授权码 (Authorization Code) 并将其通过重定向发送给第三方客户端。
// 此端点支持 PKCE (Proof Key for Code Exchange, RFC 7636) 以增强安全性，尤其适用于公共客户端 (如移动应用和SPA)。

import { NextRequest, NextResponse } from 'next/server';
import { URL } from 'url'; // 用于操作 URL 对象
import prisma from '@/lib/prisma'; // Prisma ORM 用于数据库交互
import { OAuthClient, User } from '@prisma/client'; // Prisma 生成的数据库模型类型
import { addMinutes } from 'date-fns'; // 用于日期计算，例如设置授权码的过期时间
import crypto from 'crypto'; // Node.js 内置的加密模块，可能用于生成 state 或其他安全相关的随机值
import { PKCEUtils, ScopeUtils, AuthorizationUtils } from '@/lib/auth/oauth2'; // OAuth 2.0 相关的辅助工具函数
import * as jose from 'jose'; // 用于 JWT (JSON Web Token) 的创建、验证等操作，此处用于验证认证中心UI的会话令牌

// --- 认证中心UI相关的常量 ---
// (Constants related to Auth Center UI)
// 这些常量定义了认证中心自身UI的交互行为，例如登录页面的URL、同意API的URL等。
// 当用户访问第三方应用的授权请求，但尚未登录认证中心时，会使用这些配置。
const AUTH_CENTER_LOGIN_PAGE_URL = process.env.AUTH_CENTER_LOGIN_PAGE_URL || '/login'; // 认证中心的登录页面URL。如果用户未登录，则重定向到此。
const CONSENT_API_URL = '/api/v2/oauth/consent'; // 同意API端点。如果需要用户明确授权，则重定向到此。
const AUTH_CENTER_UI_AUDIENCE = process.env.AUTH_CENTER_UI_AUDIENCE || 'urn:auth-center:ui'; // 认证中心UI会话令牌的预期受众 (Audience)。用于验证内部会话令牌。
const AUTH_CENTER_UI_CLIENT_ID = process.env.AUTH_CENTER_UI_CLIENT_ID || 'auth-center-admin-client'; // 用于认证中心UI自身登录流程的OAuth客户端ID。这代表认证中心UI本身也是一个OAuth客户端。

/**
 * HTTP GET 处理函数
 * @param req NextRequest 对象，包含客户端的请求信息
 * @returns NextResponse 对象，用于将用户重定向到适当的URL或返回错误信息
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url); // 从请求URL中解析查询参数

  // --- 步骤 1: 从查询参数中检索第三方客户端的请求参数 ---
  // (Retrieve parameters from query string for the third-party client request)
  // 这些参数是 OAuth 2.0 授权码流程的标准参数。
  const clientId = searchParams.get('client_id');         // 第三方客户端的ID (client_id)
  const redirectUri = searchParams.get('redirect_uri');   // 第三方客户端注册的回调URL
  const responseType = searchParams.get('response_type'); // 必须是 "code" (授权码流程)
  const scope = searchParams.get('scope');                // 请求的权限范围 (scopes)
  const state = searchParams.get('state');                // 客户端提供的随机字符串，用于防止CSRF攻击，授权服务器应在回调时原样返回
  const codeChallenge = searchParams.get('code_challenge'); // PKCE code challenge (S256哈希后的 code_verifier)
  const codeChallengeMethod = searchParams.get('code_challenge_method'); // PKCE code challenge method (必须是 "S256")

  // 辅助函数: 构建错误重定向URL。
  // OAuth 2.0 规范要求在发生错误时，如果可能，将用户重定向回客户端的 redirect_uri 并附带错误信息。
  // (Helper function to build error redirect URL)
  const buildErrorRedirect = (baseRedirectUri: string | null, error: string, description: string, originalState?: string | null) => {
    // 如果 redirect_uri 无效或未提供，则不能安全地重定向，返回JSON错误。
    if (!baseRedirectUri) {
      return NextResponse.json({ error, error_description: description, state: originalState }, { status: 400 });
    }
    const errorUrl = new URL(baseRedirectUri); // 基于客户端提供的 redirect_uri 构建错误URL
    errorUrl.searchParams.set('error', error); // 标准错误代码 (e.g., 'invalid_request')
    errorUrl.searchParams.set('error_description', description); // 错误的详细描述
    if (originalState) { // 如果原始请求中有 state 参数，则必须在错误响应中也包含它
      errorUrl.searchParams.set('state', originalState);
    }
    return NextResponse.redirect(errorUrl.toString(), 302); // 执行302重定向
  };

  // --- 步骤 2: 第三方客户端请求参数验证 ---
  // (Parameter Validation for the third-party client request)
  // 检查所有必需的参数是否存在且格式正确。
  if (!clientId || !redirectUri || !responseType || !codeChallenge || !codeChallengeMethod) {
    // 安全考虑: redirectUri 可能未提供或无效，因此这里直接调用 buildErrorRedirect，它会处理 redirectUri 为 null 的情况。
    return buildErrorRedirect(redirectUri, 'invalid_request', 'Missing required parameters (client_id, redirect_uri, response_type, code_challenge, code_challenge_method).', state);
  }
  if (responseType !== 'code') { // 响应类型必须是 'code'
    return buildErrorRedirect(redirectUri, 'unsupported_response_type', 'response_type must be "code".', state);
  }
  if (codeChallengeMethod !== 'S256') { // PKCE 质询方法必须是 'S256'
    return buildErrorRedirect(redirectUri, 'invalid_request', 'code_challenge_method must be "S256".', state);
  }
  if (!PKCEUtils.validateCodeChallenge(codeChallenge)) { // 使用 PKCEUtils 验证 code_challenge 的格式是否符合规范
     return buildErrorRedirect(redirectUri, 'invalid_request', 'Invalid code_challenge format.', state);
  }

  // --- 步骤 3: 第三方客户端验证 ---
  // (Third-party Client Validation)
  // 从数据库中查找提供的 client_id 是否对应一个已注册且激活的客户端。
  const thirdPartyClient = await prisma.oAuthClient.findUnique({ where: { clientId: clientId } });
  if (!thirdPartyClient || !thirdPartyClient.isActive) {
    // 安全考虑: 客户端不存在或无效，不能重定向到其 redirect_uri，因此直接返回JSON错误。
    // 这是为了防止将错误信息泄露给未经验证的 redirect_uri。
    return NextResponse.json({ error: 'invalid_client', error_description: 'Client not found or not active.' }, { status: 400 });
  }
  // 验证 redirect_uri 是否与客户端注册的 redirect_uris 之一匹配。
  // 这是防止开放重定向 (Open Redirect) 漏洞的关键安全措施。
  let registeredRedirectUris: string[] = [];
  try {
    // redirectUris 在数据库中通常存储为 JSON 字符串数组
    registeredRedirectUris = JSON.parse(thirdPartyClient.redirectUris as string);
  } catch (e) {
    console.error("Failed to parse third-party client's redirectUris:", thirdPartyClient.redirectUris);
    // 客户端配置错误，属于服务端问题。
    return NextResponse.json({ error: 'server_error', error_description: 'Invalid client configuration for redirectUris.' }, { status: 500 });
  }
  if (!Array.isArray(registeredRedirectUris) || !registeredRedirectUris.includes(redirectUri)) {
    // 提供的 redirect_uri 未在客户端注册列表中，直接返回JSON错误。
    return NextResponse.json({ error: 'invalid_request', error_description: 'Invalid redirect_uri.' }, { status: 400 });
  }

  // --- 步骤 4: 范围 (Scope) 验证 ---
  // (Scope Validation for the third-party client request)
  // 验证客户端请求的 scope 是否有效，以及是否是该客户端被允许请求的 scope。
  if (!scope) { // scope 参数是必需的
      return buildErrorRedirect(redirectUri, 'invalid_scope', 'Scope parameter is required.', state);
  }
  const requestedScopes = ScopeUtils.parseScopes(scope); // 将 scope 字符串 (空格分隔) 解析为数组
  // 使用 ScopeUtils.validateScopes 检查请求的 scopes 是否有效以及是否被客户端允许
  const scopeValidationResult = await ScopeUtils.validateScopes(requestedScopes, thirdPartyClient);
  if (!scopeValidationResult.valid) {
    const errorDescription = scopeValidationResult.error_description ||
                             `Invalid or not allowed scope(s): ${scopeValidationResult.invalidScopes.join(', ')}.`;
    return buildErrorRedirect(redirectUri, 'invalid_scope', errorDescription, state);
  }
  const validatedScopes = requestedScopes; // 存储已验证的 scopes 列表


  // --- 步骤 5: 用户认证 (针对认证中心UI会话) ---
  // (User Authentication - for Auth Center UI session)
  // 在处理第三方应用的授权请求之前，用户必须首先登录到认证中心。
  // 这里的逻辑是检查用户是否已经有一个有效的认证中心会话。
  // 通常通过检查一个特定的 cookie (例如 'auth_center_session_token') 来实现。
  // 这个 token 是用户登录认证中心UI时获得的，与第三方应用的 token 不同。
  let user: User | null = null; // 用于存储已认证的用户对象
  const internalAuthToken = req.cookies.get('auth_center_session_token')?.value; // 从 HttpOnly cookie 中获取认证中心会话令牌

  if (internalAuthToken) { // 如果存在会话令牌
    try {
      // 验证此内部会话令牌的有效性 (签名, 过期时间, 签发者, 受众等)
      const jwksUriString = process.env.JWKS_URI; // JWKS (JSON Web Key Set) URI 用于获取验证签名的公钥
      if (!jwksUriString) throw new Error('JWKS_URI not configured for internal auth.');
      const JWKS = jose.createRemoteJWKSet(new URL(jwksUriString)); // 创建远程 JWKSet 实例

      const expectedIssuer = process.env.JWT_ISSUER; // 预期的令牌签发者
      if (!expectedIssuer) throw new Error('JWT_ISSUER not configured for internal auth.');

      // 使用 jose.jwtVerify 验证令牌
      const { payload: internalAuthTokenPayload } = await jose.jwtVerify(internalAuthToken, JWKS, {
        issuer: expectedIssuer,
        audience: AUTH_CENTER_UI_AUDIENCE, // 关键: 验证令牌的受众是否是认证中心UI
        algorithms: ['RS256'], // 预期的签名算法
      });

      // 如果令牌有效且包含用户ID (sub声明)，则从数据库中获取用户信息
      if (internalAuthTokenPayload && internalAuthTokenPayload.sub) {
        user = await prisma.user.findUnique({ where: { id: internalAuthTokenPayload.sub as string, isActive: true }});
      }
    } catch (error) {
      // 令牌验证失败 (例如，过期、签名无效、受众不匹配等)
      console.warn('Auth Center UI session token verification failed during /authorize:', (error as Error).message);
      // user 保持为 null
    }
  }

  // 如果用户未通过认证中心UI的认证 (user 为 null)
  if (!user) {
    // --- 用户未登录认证中心，重定向到认证中心的登录流程 ---
    // (User not logged into Auth Center, redirect to its login flow)
    // 这里的目标是让用户先登录认证中心。一旦登录成功，认证中心会将会话信息（例如通过cookie）存储起来，
    // 然后将用户重定向回当前的 /authorize URL (带着原始第三方客户端的所有请求参数)，此时上面的用户认证逻辑就能成功。
    // 这个登录流程本身也可能是一个 OAuth 流程，其中认证中心UI作为客户端 (使用 AUTH_CENTER_UI_CLIENT_ID)。
    const authCenterLoginUrl = new URL(AUTH_CENTER_LOGIN_PAGE_URL, req.nextUrl.origin); // 构建认证中心登录页面的完整URL

    // 为认证中心UI的登录准备参数。
    // 注意: redirect_uri 设置为当前的 /authorize URL，这样登录成功后能返回到这里继续处理第三方应用的请求。
    const paramsForUiLogin = new URLSearchParams({
      client_id: AUTH_CENTER_UI_CLIENT_ID,       // 认证中心UI自己的 client_id
      redirect_uri: req.nextUrl.href,            // 关键: 登录成功后重定向回当前完整的 /authorize URL (包含所有原始第三方应用的参数)
      response_type: 'code',                     // 认证中心UI登录也使用授权码流程
      scope: 'openid profile email auth-center:interact', // 认证中心UI会话所需的权限 (例如，与认证中心交互的权限)
      // state: crypto.randomBytes(16).toString('hex'), // 可选: 为认证中心UI的登录流程生成一个内部 state
    });
    authCenterLoginUrl.search = paramsForUiLogin.toString();

    console.log(`User not authenticated with Auth Center. Redirecting to Auth Center login: ${authCenterLoginUrl.toString()}`);
    return NextResponse.redirect(authCenterLoginUrl.toString(), 302); // 重定向到认证中心登录页面
  }
  // 如果代码执行到这里，说明用户已成功登录认证中心。
  console.log(`User ${user.id} authenticated to Auth Center UI. Continuing /authorize flow for client ${clientId}.`);


  // --- 步骤 6: 同意检查 (针对第三方客户端的请求) ---
  // (Consent Check for the third-party client)
  // 检查用户是否已经对这个第三方客户端授予了所请求的所有权限 (scopes)。
  const existingConsent = await prisma.consentGrant.findFirst({
    where: { userId: user.id, clientId: thirdPartyClient.id }, // 查找用户对此客户端的现有同意记录
  });
  let hasFullConsent = false; // 标志用户是否已授予所有请求的 scopes
  if (existingConsent) {
    const grantedScopes = ScopeUtils.parseScopes(existingConsent.scopes); // 解析已授予的 scopes
    // 检查所有请求的 scopes 是否都包含在已授予的 scopes 中
    hasFullConsent = validatedScopes.every(scope => grantedScopes.includes(scope));
  }

  // 如果用户尚未授予全部请求的权限，则重定向到同意页面。
  if (!hasFullConsent) {
    // 构建到同意页面 (/api/v2/oauth/consent) 的URL，并携带所有必要的参数。
    // 同意页面会向用户展示第三方客户端请求的权限，并让用户选择是否同意。
    const consentUrl = new URL(CONSENT_API_URL, req.nextUrl.origin);
    consentUrl.searchParams.set('client_id', clientId); // 第三方客户端的 client_id
    consentUrl.searchParams.set('redirect_uri', redirectUri); // 第三方客户端的 redirect_uri
    consentUrl.searchParams.set('scope', ScopeUtils.formatScopes(validatedScopes)); // 请求的 scopes
    if (state) consentUrl.searchParams.set('state', state); // 第三方客户端的 state
    consentUrl.searchParams.set('response_type', responseType); // 'code'
    if (codeChallenge) consentUrl.searchParams.set('code_challenge', codeChallenge); // PKCE challenge
    if (codeChallengeMethod) consentUrl.searchParams.set('code_challenge_method', codeChallengeMethod); // PKCE method

    console.log(`Redirecting user ${user.id} to consent page for client ${thirdPartyClient.clientId}`);
    // 同意页面本身也需要用户已登录认证中心。
    // 它通常会受到一个权限保护，例如 `requirePermission('auth-center:interact')`，
    // 该权限检查会验证之前设置的 'auth_center_session_token'。
    return NextResponse.redirect(consentUrl.toString(), 302); // 重定向到同意页面
  }

  // 如果用户已授予所有请求的权限 (hasFullConsent is true)，则直接生成授权码。
  console.log(`User ${user.id} already consented for client ${thirdPartyClient.clientId}. Issuing code.`);

  // --- 步骤 7: 生成并存储授权码 (针对第三方客户端) ---
  // (Generate and Store Authorization Code for the third-party client)
  // 授权码是短暂的，通常只能使用一次。
  const authorizationCodeValue = AuthorizationUtils.generateAuthorizationCode(); // 使用辅助函数生成一个安全的随机授权码
  const codeExpiresAt = addMinutes(new Date(), 10); // 设置授权码的过期时间 (例如10分钟)

  try {
    // 将授权码及其相关信息存储到数据库。
    // 这些信息将在后续的 token 端点用于验证授权码并签发 access token。
    await prisma.authorizationCode.create({
      data: {
        code: authorizationCodeValue,        // 授权码本身
        userId: user.id,                     // 授权用户ID
        clientId: thirdPartyClient.id,       // 第三方客户端的数据库ID (注意: 不是clientId字符串，而是外键关联)
        redirectUri: redirectUri,            // 授权时使用的 redirect_uri (token端点会再次验证)
        scope: ScopeUtils.formatScopes(validatedScopes), // 实际授予的 scopes
        expiresAt: codeExpiresAt,            // 过期时间
        codeChallenge: codeChallenge,        // PKCE code challenge
        codeChallengeMethod: codeChallengeMethod, // PKCE method ('S256')
      },
    });
  } catch (dbError) {
    console.error('Failed to store authorization code:', dbError);
    // 数据库错误，无法生成授权码。
    return buildErrorRedirect(redirectUri, 'server_error', 'Could not generate authorization code.', state);
  }

  // --- 步骤 8: 重定向到第三方客户端的回调URL ---
  // (Redirect to third-party client's redirect_uri)
  // 将生成的授权码和原始的 state 参数附加到客户端的 redirect_uri 上，并重定向用户。
  const successUrl = new URL(redirectUri);
  successUrl.searchParams.set('code', authorizationCodeValue); // 附上授权码
  if (state) { // 如果原始请求中有 state，则必须在成功响应中也包含它
    successUrl.searchParams.set('state', state);
  }
  return NextResponse.redirect(successUrl.toString(), 302); // 执行302重定向
}
