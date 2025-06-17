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
import { URL } from 'url';
// Prisma client is now imported from a central place, e.g., '@/lib/prisma'
// import prisma from '@/lib/prisma'; // Assuming central prisma import
import { prisma } from '@/lib/prisma'; // Using the existing import style
import { User } from '@prisma/client'; // Prisma 生成的数据库模型类型
// addMinutes is not directly used after refactor, storeAuthorizationCode handles expiry
// import { addMinutes } from 'date-fns';
// crypto is still used by existing helpers, but not directly for code generation after refactor
// import crypto from 'crypto';
import { PKCEUtils, ScopeUtils } from '@/lib/auth/oauth2'; // OAuth 2.0 相关的辅助工具函数
import * as jose from 'jose'; // 用于 JWT (JSON Web Token) 的创建、验证等操作，此处用于验证认证中心UI的会话令牌
import { authorizeQuerySchema } from './schemas'; // Import Zod schema from separate file
import { storeAuthorizationCode } from '@/lib/auth/authorizationCodeFlow'; // Import new service

// --- 认证中心UI相关的常量 ---
// (Constants related to Auth Center UI)
// 这些常量定义了认证中心自身UI的交互行为，例如登录页面的URL、同意API的URL等。
// 当用户访问第三方应用的授权请求，但尚未登录认证中心时，会使用这些配置。
const AUTH_CENTER_LOGIN_PAGE_URL = process.env.AUTH_CENTER_LOGIN_PAGE_URL || '/login';
const CONSENT_API_URL = '/api/v2/oauth/consent';
const AUTH_CENTER_UI_AUDIENCE = process.env.AUTH_CENTER_UI_AUDIENCE || 'urn:auth-center:ui';
const AUTH_CENTER_UI_CLIENT_ID = process.env.AUTH_CENTER_UI_CLIENT_ID || 'auth-center-admin-client';

/**
 * HTTP GET 处理函数
 * @param req NextRequest 对象，包含客户端的请求信息
 * @returns NextResponse 对象，用于将用户重定向到适当的URL或返回错误信息
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  // 辅助函数: 构建错误重定向URL。
  const buildErrorRedirect = (baseRedirectUri: string | null, error: string, description: string, originalState?: string | null): NextResponse => {
    if (!baseRedirectUri) {
      return NextResponse.json({ error, error_description: description, state: originalState }, { status: 400 });
    }
    try {
      const errorUrl = new URL(baseRedirectUri);
      errorUrl.searchParams.set('error', error);
      errorUrl.searchParams.set('error_description', description);
      if (originalState) {
        errorUrl.searchParams.set('state', originalState);
      }
      return NextResponse.redirect(errorUrl.toString(), 302);
    } catch (e) {
      // If baseRedirectUri is invalid URL itself
      return NextResponse.json({ error, error_description: `${description} (Additionally, the provided redirect_uri was invalid.)`, state: originalState }, { status: 400 });
    }
  };

  // --- 步骤 2: 第三方客户端请求参数验证 (使用Zod) ---
  const paramsToValidate: Record<string, any> = {};
  searchParams.forEach((value, key) => {
    paramsToValidate[key] = value;
  });

  // Use imported Zod schema
  const validationResult = authorizeQuerySchema.safeParse(paramsToValidate);

  if (!validationResult.success) {
    const firstError = validationResult.error.errors[0];
    const baseRedirectUriForError =
      typeof paramsToValidate.redirect_uri === 'string' && authorizeQuerySchema.shape.redirect_uri.safeParse(paramsToValidate.redirect_uri).success
        ? paramsToValidate.redirect_uri
        : null;
    return buildErrorRedirect(
      baseRedirectUriForError,
      'invalid_request',
      `${firstError.path.join('.')}: ${firstError.message}`,
      paramsToValidate.state
    );
  }

  const {
    client_id, // Renamed to client_id for consistency with schema
    redirect_uri, // Renamed
    response_type, // Already 'code' from schema
    scope: requestedScopeString, // Renamed for clarity
    state,
    code_challenge,
    code_challenge_method, // Already 'S256' from schema
    nonce
  } = validationResult.data;

  // PKCE code_challenge format validation (Zod schema already has min/max length checks)
  // PKCEUtils.validateCodeChallenge might do more specific character validation if needed.
  if (!PKCEUtils.validateCodeChallenge(code_challenge)) { // Keep this for stricter format check if Zod's isn't enough
     return buildErrorRedirect(redirect_uri, 'invalid_request', 'Invalid code_challenge format.', state);
  }

  // --- 步骤 3: 第三方客户端验证 ---
  const thirdPartyClient = await prisma.oAuthClient.findUnique({ where: { clientId: client_id } });
  if (!thirdPartyClient || !thirdPartyClient.isActive) {
    return NextResponse.json({ error: 'invalid_client', error_description: 'Client not found or not active.' }, { status: 400 });
  }

  let registeredRedirectUrisList: string[] = [];
  try {
    registeredRedirectUrisList = JSON.parse(thirdPartyClient.redirectUris || '[]');
    if (!Array.isArray(registeredRedirectUrisList)) throw new Error("Redirect URIs are not an array.");
  } catch (e) {
    console.error("Failed to parse third-party client's redirectUris:", thirdPartyClient.redirectUris, e);
    return NextResponse.json({ error: 'server_error', error_description: 'Invalid client configuration for redirectUris.' }, { status: 500 });
  }
  if (!registeredRedirectUrisList.includes(redirect_uri)) {
    return NextResponse.json({ error: 'invalid_request', error_description: 'Invalid redirect_uri.' }, { status: 400 });
  }

  // --- 步骤 4: 范围 (Scope) 验证 ---
  // requestedScopeString comes from validated Zod schema, which checks for presence.
  if (!requestedScopeString) {
      return buildErrorRedirect(redirect_uri, 'invalid_scope', 'Scope parameter is required.', state);
  }
  const parsedRequestedScopes = ScopeUtils.parseScopes(requestedScopeString);
  const scopeValidationResult = await ScopeUtils.validateScopes(parsedRequestedScopes, thirdPartyClient);
  if (!scopeValidationResult.valid) {
    const errorDesc = scopeValidationResult.error_description ||
                      `Invalid or not allowed scope(s): ${scopeValidationResult.invalidScopes.join(', ')}.`;
    return buildErrorRedirect(redirect_uri, 'invalid_scope', errorDesc, state);
  }
  const finalGrantedScopesArray = parsedRequestedScopes.filter(s => scopeValidationResult.valid && // Ensure overall validity
    !scopeValidationResult.invalidScopes.includes(s) // Filter out any specific invalid scopes (though validateScopes should ensure this if valid=true)
  );


  // --- 步骤 5: 用户认证 (针对认证中心UI会话) ---
  let currentUser: User | null = null;
  const internalAuthToken = req.cookies.get('auth_center_session_token')?.value;

  if (internalAuthToken) {
    try {
      const jwksUriString = process.env.JWKS_URI;
      if (!jwksUriString) throw new Error('JWKS_URI not configured for internal auth.');
      const JWKS = jose.createRemoteJWKSet(new URL(jwksUriString));

      const expectedIssuer = process.env.JWT_ISSUER;
      if (!expectedIssuer) throw new Error('JWT_ISSUER not configured for internal auth.');

      const { payload: internalAuthTokenPayload } = await jose.jwtVerify(internalAuthToken, JWKS, {
        issuer: expectedIssuer,
        audience: AUTH_CENTER_UI_AUDIENCE,
        algorithms: ['RS256'],
      });

      if (internalAuthTokenPayload && internalAuthTokenPayload.sub) {
        currentUser = await prisma.user.findUnique({ where: { id: internalAuthTokenPayload.sub as string, isActive: true }});
      }
    } catch (error) {
      console.warn('Auth Center UI session token verification failed during /authorize:', (error as Error).message);
    }
  }

  if (!currentUser) {
    const authCenterLoginUrl = new URL(AUTH_CENTER_LOGIN_PAGE_URL, req.nextUrl.origin);
    const paramsForUiLogin = new URLSearchParams({
      client_id: AUTH_CENTER_UI_CLIENT_ID,
      redirect_uri: req.nextUrl.href,
      response_type: 'code',
      scope: 'openid profile email auth-center:interact',
    });
    authCenterLoginUrl.search = paramsForUiLogin.toString();
    console.log(`User not authenticated with Auth Center. Redirecting to Auth Center login: ${authCenterLoginUrl.toString()}`);
    return NextResponse.redirect(authCenterLoginUrl.toString(), 302);
  }
  console.log(`User ${currentUser.id} authenticated to Auth Center UI. Continuing /authorize flow for client ${client_id}.`);

  // --- 步骤 6: 同意检查 (针对第三方客户端的请求) ---
  const existingConsent = await prisma.consentGrant.findFirst({
    where: { userId: currentUser.id, clientId: thirdPartyClient.id },
  });
  let hasFullConsent = false;
  if (existingConsent) {
    const previouslyGrantedScopes = ScopeUtils.parseScopes(existingConsent.scopes);
    hasFullConsent = finalGrantedScopesArray.every(scope => previouslyGrantedScopes.includes(scope));
  }

  if (!hasFullConsent) {
    const consentUrl = new URL(CONSENT_API_URL, req.nextUrl.origin);
    consentUrl.searchParams.set('client_id', client_id);
    consentUrl.searchParams.set('redirect_uri', redirect_uri);
    consentUrl.searchParams.set('scope', ScopeUtils.formatScopes(finalGrantedScopesArray));
    if (state) consentUrl.searchParams.set('state', state);
    consentUrl.searchParams.set('response_type', response_type);
    if (code_challenge) consentUrl.searchParams.set('code_challenge', code_challenge);
    if (code_challenge_method) consentUrl.searchParams.set('code_challenge_method', code_challenge_method);
    if (nonce) consentUrl.searchParams.set('nonce', nonce);


    console.log(`Redirecting user ${currentUser.id} to consent page for client ${thirdPartyClient.clientId}`);
    return NextResponse.redirect(consentUrl.toString(), 302);
  }

  console.log(`User ${currentUser.id} already consented for client ${thirdPartyClient.clientId}. Issuing code.`);

  // --- 步骤 7: 生成并存储授权码 (针对第三方客户端) ---
  // Use the new storeAuthorizationCode service
  const authCode = await storeAuthorizationCode(
    thirdPartyClient.id, // Pass the Prisma CUID of the client
    currentUser.id,
    redirect_uri,
    ScopeUtils.formatScopes(finalGrantedScopesArray), // Pass the validated and finalized scopes
    code_challenge,
    code_challenge_method, // 'S256' from schema validation
    thirdPartyClient.authorizationCodeLifetime || undefined,
    // TODO: Add nonce to storeAuthorizationCode if it needs to be stored with the code
  );

  // --- 步骤 8: 重定向到第三方客户端的回调URL ---
  const successRedirectUrl = new URL(redirect_uri);
  successRedirectUrl.searchParams.set('code', authCode.code);
  if (state) {
    successRedirectUrl.searchParams.set('state', state);
  }
  return NextResponse.redirect(successRedirectUrl.toString(), 302);
}
