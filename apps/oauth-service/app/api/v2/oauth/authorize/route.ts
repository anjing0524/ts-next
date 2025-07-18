// 文件路径: app/api/v2/oauth/authorize/route.ts
// File path: app/api/v2/oauth/authorize/route.ts
// 描述: 此文件实现了 OAuth 2.0 授权端点 (Authorization Endpoint)。
// Description: This file implements the OAuth 2.0 Authorization Endpoint.
// (For detailed responsibilities, see original comments - preserved below)
// 主要职责: (Main responsibilities preserved from original)
// 1. 验证第三方客户端的请求参数 (client_id, redirect_uri, response_type, scope, PKCE parameters)。
// 2. 验证第三方客户端身份。
// 3. 确保用户已登录到认证中心 (Auth Center)。如果未登录，则重定向到认证中心的登录页面。
// 4. 检查用户是否已授予第三方客户端所请求的权限 (scopes)。如果未授予或部分授予，则重定向到同意页面。
// 5. 如果所有检查通过且用户已同意，则生成一个授权码 (Authorization Code) 并将其通过重定向发送给第三方客户端。
// 此端点支持 PKCE (Proof Key for Code Exchange, RFC 7636) 以增强安全性。
import { prisma, User } from '@repo/database';
import {
  AuthorizationUtils,
  OAuth2Error,
  OAuth2ErrorCode,
  PKCEUtils,
  ScopeUtils,
  withErrorHandling,
} from '@repo/lib/node';
import * as jose from 'jose';
import { NextRequest, NextResponse } from 'next/server';
import { URL } from 'url';
import { authorizeQuerySchema } from './schemas';
import { ConfigurationError, ValidationError } from '@repo/lib/node';

// --- 认证中心UI相关的常量 --- (Constants related to Auth Center UI - preserved)
const AUTH_CENTER_LOGIN_PAGE_URL = process.env.AUTH_CENTER_LOGIN_PAGE_URL || '/login';
const CONSENT_API_URL = '/api/v2/oauth/consent';
const AUTH_CENTER_UI_AUDIENCE = process.env.AUTH_CENTER_UI_AUDIENCE || 'urn:auth-center:ui';
const AUTH_CENTER_UI_CLIENT_ID = process.env.AUTH_CENTER_UI_CLIENT_ID || 'auth-center-admin-client';

/**
 * OAuth 2.0 授权端点 GET 请求处理函数。
 * (OAuth 2.0 Authorization Endpoint GET request handler.)
 * @param req NextRequest 对象，包含客户端的请求信息。 (NextRequest object, containing client's request information.)
 * @returns NextResponse 对象，通常是重定向。错误将由 withErrorHandling 处理为JSON响应或特定OAuth重定向。
 * (Returns NextResponse object, usually a redirect. Errors will be handled by withErrorHandling as JSON responses or specific OAuth redirects.)
 * @throws {OAuth2Error} 如果发生OAuth特定错误，例如无效请求、无效客户端。 (If an OAuth-specific error occurs, e.g., invalid request, invalid client.)
 * @throws {ValidationError} 如果请求参数验证失败。 (If request parameter validation fails.)
 * @throws {ConfigurationError} 如果服务器端配置错误。 (If there's a server-side configuration error.)
 * @throws {BaseError} 对于其他类型的内部服务器错误。 (For other types of internal server errors.)
 */
async function authorizeHandlerInternal(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);

  // 辅助函数: 构建错误重定向URL (仅在 redirect_uri 已验证且必须重定向错误时使用)
  // Helper function: Build error redirect URL (use only if redirect_uri is validated and error MUST be redirected)
  const buildErrorRedirect = (
    baseRedirectUri: string,
    error: OAuth2ErrorCode,
    description: string,
    originalState?: string | null
  ): NextResponse => {
    try {
      const errorUrl = new URL(baseRedirectUri);
      errorUrl.searchParams.set('error', error);
      errorUrl.searchParams.set('error_description', description);
      if (originalState) {
        errorUrl.searchParams.set('state', originalState);
      }
      return NextResponse.redirect(errorUrl.toString(), 302);
    } catch (e) {
      // 如果 baseRedirectUri 无效，这是一个严重问题，可能表明早期验证不足或配置错误
      // If baseRedirectUri is invalid, this is a serious issue, possibly indicating prior insufficient validation or misconfiguration.
      console.error(
        'CRITICAL: buildErrorRedirect called with invalid baseRedirectUri',
        baseRedirectUri,
        e
      );
      // 抛出一个通用错误，让 withErrorHandling 处理
      // Throw a generic error for withErrorHandling to process
      throw new ConfigurationError(
        `Server error: Could not construct redirect URL due to invalid base redirect URI. Original error: ${error}`,
        { code: 'REDIRECT_URI_CONSTRUCTION_FAILED' }
      );
    }
  };

  // --- 步骤 1: 请求参数验证 (使用Zod) --- (Step 1: Request parameter validation (using Zod))
  const paramsToValidate: Record<string, any> = {};
  searchParams.forEach((value, key) => {
    paramsToValidate[key] = value;
  });

  const validationResult = authorizeQuerySchema.safeParse(paramsToValidate);
  if (!validationResult.success) {
    const firstError = validationResult.error.errors[0];
    // 对于参数验证错误，OAuth2 通常建议如果可能，重定向到 redirect_uri 并附带错误。
    // 但如果 redirect_uri 本身就有问题或未提供，则不能重定向。
    // For parameter validation errors, OAuth2 often suggests redirecting to redirect_uri with error if possible.
    // However, if redirect_uri itself is problematic or not provided, redirection isn't feasible.
    // 此处抛出 ValidationError，withErrorHandling 将其转换为 JSON 响应。
    // Throw ValidationError here, withErrorHandling will convert it to a JSON response.
    const errorMessage = firstError
      ? `Invalid authorization request: ${firstError.path.join('.')} - ${firstError.message}`
      : 'Invalid authorization request: Validation failed';
    throw new ValidationError(
      errorMessage,
      { issues: validationResult.error.flatten().fieldErrors, state: paramsToValidate.state },
      OAuth2ErrorCode.InvalidRequest // 使用 OAuth2 标准错误码 (Use OAuth2 standard error code)
    );
  }

  const {
    client_id,
    redirect_uri,
    response_type,
    scope: requestedScopeString,
    state,
    code_challenge,
    code_challenge_method,
    nonce,
  } = validationResult.data;

  // --- 步骤 2: 第三方客户端验证 --- (Step 2: Third-party client validation)
  const thirdPartyClient = await prisma.oAuthClient.findUnique({ where: { clientId: client_id } });
  if (!thirdPartyClient || !thirdPartyClient.isActive) {
    // 客户端无效或未找到，不应重定向到其 redirect_uri。直接返回 JSON 错误。
    // Invalid or not found client, should not redirect to its redirect_uri. Return JSON error directly.
    throw new OAuth2Error('Client not found or not active.', OAuth2ErrorCode.InvalidClient, 400);
  }

  // --- 步骤 2.1: PKCE 强制检查 --- (Step 2.1: PKCE enforcement check)
  if (thirdPartyClient.requirePkce && (!code_challenge || !code_challenge_method)) {
    throw new OAuth2Error(
      'PKCE is required for this client. code_challenge and code_challenge_method must be provided.',
      OAuth2ErrorCode.InvalidRequest,
      400
    );
  }

  // 验证 PKCE 方法
  if (code_challenge_method && code_challenge_method !== 'S256') {
    throw new OAuth2Error(
      'Unsupported code_challenge_method. Only S256 is supported.',
      OAuth2ErrorCode.InvalidRequest,
      400
    );
  }

  let registeredRedirectUrisList: string[] = [];
  try {
    registeredRedirectUrisList = JSON.parse(thirdPartyClient.redirectUris || '[]');
    if (!Array.isArray(registeredRedirectUrisList))
      throw new Error('Redirect URIs are not an array.');
  } catch (e) {
    console.error(
      "Failed to parse third-party client's redirectUris:",
      thirdPartyClient.redirectUris,
      e
    );
    // 客户端配置错误是服务器端的问题
    // Client configuration error is a server-side issue
    throw new ConfigurationError('Invalid client configuration for redirectUris.', {
      clientId: client_id,
      code: 'CLIENT_CONFIG_REDIRECT_URI_INVALID',
    });
  }
  if (!registeredRedirectUrisList.includes(redirect_uri)) {
    // redirect_uri 不匹配，不应重定向。直接返回 JSON 错误。
    // redirect_uri mismatch, should not redirect. Return JSON error directly.
    throw new OAuth2Error('Invalid redirect_uri.', OAuth2ErrorCode.InvalidRequest, 400, undefined, {
      provided: redirect_uri,
      expected: registeredRedirectUrisList,
    });
  }

  // redirect_uri 已验证，现在可以使用 buildErrorRedirect 安全地重定向错误
  // redirect_uri is validated, can now use buildErrorRedirect safely for redirecting errors

  // --- PKCE 强制执行检查 --- (PKCE Enforcement Check) ---
  // 根据客户端类型或特定设置，强制要求PKCE参数。
  // Enforce PKCE parameters based on client type or specific settings.
  // The clientType and requirePkce fields are defined in the OAuthClient Prisma model.
  if (thirdPartyClient.clientType === 'PUBLIC' || thirdPartyClient.requirePkce) {
    if (!code_challenge || !code_challenge_method) {
      await AuthorizationUtils.logAuditEvent({
        clientId: thirdPartyClient.clientId,
        action: 'AUTH_CODE_PKCE_REQUIRED_MISSING_PARAMS',
        success: false,
        ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
        userAgent: req.headers.get('user-agent') || undefined,
        errorMessage:
          'PKCE (code_challenge and code_challenge_method) is required for this client but one or both were missing.',
        metadata: {
          client_id: thirdPartyClient.clientId,
          clientType: thirdPartyClient.clientType,
          requirePkceField: thirdPartyClient.requirePkce,
          hasCodeChallenge: !!code_challenge,
          hasCodeChallengeMethod: !!code_challenge_method,
        },
      });
      return buildErrorRedirect(
        redirect_uri,
        OAuth2ErrorCode.InvalidRequest,
        'PKCE (code_challenge and code_challenge_method) is required for this client.',
        state
      );
    }
  }

  // PKCE code_challenge 格式验证 (如果提供了 code_challenge)
  // PKCE code_challenge format validation (if code_challenge is provided)
  if (code_challenge && !PKCEUtils.validateCodeChallenge(code_challenge)) {
    await AuthorizationUtils.logAuditEvent({
      clientId: thirdPartyClient.clientId,
      action: 'AUTH_CODE_PKCE_INVALID_CHALLENGE_FORMAT',
      success: false,
      ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
      userAgent: req.headers.get('user-agent') || undefined,
      errorMessage: 'Invalid PKCE code_challenge format.',
      metadata: {
        client_id: thirdPartyClient.clientId,
        code_challenge_provided: code_challenge, // Be cautious logging the challenge itself if it's sensitive or too long
      },
    });
    return buildErrorRedirect(
      redirect_uri,
      OAuth2ErrorCode.InvalidRequest,
      'Invalid code_challenge format.',
      state
    );
  }

  // --- 步骤 3: 范围 (Scope) 验证 --- (Step 3: Scope validation)
  if (!requestedScopeString) {
    // Zod schema should enforce 'scope' presence
    return buildErrorRedirect(
      redirect_uri,
      OAuth2ErrorCode.InvalidScope,
      'Scope parameter is required.',
      state
    );
  }
  const parsedRequestedScopes = ScopeUtils.parseScopes(requestedScopeString);
  const scopeValidationResult = await ScopeUtils.validateScopes(
    parsedRequestedScopes,
    thirdPartyClient
  );
  if (!scopeValidationResult.valid) {
    const errorDesc =
      scopeValidationResult.error_description ||
      `Invalid or not allowed scope(s): ${scopeValidationResult.invalidScopes.join(', ')}.`;
    return buildErrorRedirect(redirect_uri, OAuth2ErrorCode.InvalidScope, errorDesc, state);
  }
  const finalGrantedScopesArray = parsedRequestedScopes.filter(
    (s) => !scopeValidationResult.invalidScopes.includes(s)
  );

  // --- 步骤 4: 用户认证 (针对认证中心UI会话) --- (Step 4: User authentication for Auth Center UI session)
  let currentUser: User | null = null;
  const internalAuthToken = req.cookies.get('auth_center_session_token')?.value;

  if (internalAuthToken) {
    try {
      const jwksUriString = process.env.JWKS_URI;
      if (!jwksUriString)
        throw new ConfigurationError('JWKS_URI not configured for internal auth.', {
          code: 'CONFIG_JWKS_URI_MISSING',
        });
      const JWKS = jose.createRemoteJWKSet(new URL(jwksUriString));

      const expectedIssuer = process.env.JWT_ISSUER;
      if (!expectedIssuer)
        throw new ConfigurationError('JWT_ISSUER not configured for internal auth.', {
          code: 'CONFIG_JWT_ISSUER_MISSING',
        });

      const { payload: internalAuthTokenPayload } = await jose.jwtVerify(internalAuthToken, JWKS, {
        issuer: expectedIssuer,
        audience: AUTH_CENTER_UI_AUDIENCE,
        algorithms: ['RS256'],
      });

      if (internalAuthTokenPayload && internalAuthTokenPayload.sub) {
        currentUser = await prisma.user.findUnique({
          where: { id: internalAuthTokenPayload.sub as string, isActive: true },
        });
      }
    } catch (error: any) {
      // 如果内部令牌验证失败 (例如过期、签名无效)，清除它并继续，将用户视为未登录
      // If internal token verification fails (e.g., expired, invalid signature), clear it and proceed, treating user as not logged in
      console.warn(
        'Auth Center UI session token verification failed during /authorize:',
        error.message
      );
      // Potentially clear the invalid cookie here
      // res.cookies.delete('auth_center_session_token'); // Need to return NextResponse to set cookie
    }
  }

  if (!currentUser) {
    const authCenterLoginUrl = new URL(AUTH_CENTER_LOGIN_PAGE_URL, req.nextUrl.origin);
    const paramsForUiLogin = new URLSearchParams({
      client_id: AUTH_CENTER_UI_CLIENT_ID,
      redirect_uri: req.nextUrl.href,
      response_type: 'code',
      scope: 'openid profile email auth-center:interact',
      // 将原始请求的 state 和 nonce（如果有）传递给登录流程，以便登录后可以恢复它们
      // Pass original request's state and nonce (if any) to login flow so they can be restored after login
      ...(state && { state_passthrough: state }),
      ...(nonce && { nonce_passthrough: nonce }),
    });
    authCenterLoginUrl.search = paramsForUiLogin.toString();
    console.log(
      `User not authenticated with Auth Center. Redirecting to Auth Center login: ${authCenterLoginUrl.toString()}`
    );
    return NextResponse.redirect(authCenterLoginUrl.toString(), 302);
  }
  console.log(
    `User ${currentUser.id} authenticated to Auth Center UI. Continuing /authorize flow for client ${client_id}.`
  );

  // --- 步骤 5: 同意检查 --- (Step 5: Consent check)
  const existingConsent = await prisma.consentGrant.findFirst({
    where: { userId: currentUser.id, clientId: thirdPartyClient.id },
  });
  let hasFullConsent = false;
  if (existingConsent) {
    const previouslyGrantedScopes = ScopeUtils.parseScopes(existingConsent.scopes);
    hasFullConsent = finalGrantedScopesArray.every((scope) =>
      previouslyGrantedScopes.includes(scope)
    );
  }

  if (!hasFullConsent) {
    const consentUrl = new URL(CONSENT_API_URL, req.nextUrl.origin);
    consentUrl.searchParams.set('client_id', client_id);
    consentUrl.searchParams.set('redirect_uri', redirect_uri);
    consentUrl.searchParams.set('scope', ScopeUtils.formatScopes(finalGrantedScopesArray));
    if (state) consentUrl.searchParams.set('state', state);
    consentUrl.searchParams.set('response_type', response_type);
    if (code_challenge) consentUrl.searchParams.set('code_challenge', code_challenge);
    if (code_challenge_method)
      consentUrl.searchParams.set('code_challenge_method', code_challenge_method);
    if (nonce) consentUrl.searchParams.set('nonce', nonce);

    console.log(
      `Redirecting user ${currentUser.id} to consent page for client ${thirdPartyClient.clientId}`
    );
    return NextResponse.redirect(consentUrl.toString(), 302);
  }
  console.log(
    `User ${currentUser.id} already consented for client ${thirdPartyClient.clientId}. Issuing code.`
  );

  // --- 步骤 6: 生成并存储授权码 --- (Step 6: Generate and store authorization code)
  // 使用恢复的 authorization-code-flow 业务逻辑
  const { storeAuthorizationCode } = await import(
    '../../../../../lib/auth/authorization-code-flow'
  );

  const authCodeResult = await storeAuthorizationCode(
    currentUser.id,
    thirdPartyClient.id,
    redirect_uri,
    code_challenge || '',
    code_challenge_method || 'S256',
    ScopeUtils.formatScopes(finalGrantedScopesArray),
    600, // 10分钟过期
    nonce
  );

  // 构建成功的重定向URL
  const successRedirectUrl = new URL(redirect_uri);
  successRedirectUrl.searchParams.set('code', authCodeResult.code);
  if (state) {
    successRedirectUrl.searchParams.set('state', state);
  }

  // 记录成功的审计事件
  await AuthorizationUtils.logAuditEvent({
    userId: currentUser.id,
    clientId: thirdPartyClient.clientId,
    action: 'AUTHORIZATION_CODE_ISSUED',
    success: true,
    ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
    userAgent: req.headers.get('user-agent') || undefined,
    metadata: {
      client_id: thirdPartyClient.clientId,
      scope: ScopeUtils.formatScopes(finalGrantedScopesArray),
      hasPKCE: !!code_challenge,
      hasNonce: !!nonce,
    },
  });

  console.log(
    `Authorization code issued for user ${currentUser.id} and client ${thirdPartyClient.clientId}`
  );
  return NextResponse.redirect(successRedirectUrl.toString(), 302);
}

// 使用 withErrorHandling 包装 authorizeHandlerInternal
// Wrap authorizeHandlerInternal with withErrorHandling
export const GET = withErrorHandling(authorizeHandlerInternal);
