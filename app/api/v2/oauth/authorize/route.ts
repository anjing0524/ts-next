// 文件路径: app/api/v2/oauth/authorize/route.ts
// 描述: OAuth 2.0 授权端点，支持PKCE (RFC 7636)

import { NextRequest, NextResponse } from 'next/server';
import { URL } from 'url'; // For URL manipulation
import prisma from '@/lib/prisma';
import { OAuthClient, User } from '@prisma/client'; // Prisma-generated types
import { addMinutes } from 'date-fns'; // For setting expiry
import crypto from 'crypto';
import { PKCEUtils, ScopeUtils, AuthorizationUtils } from '@/lib/auth/oauth2'; // Assuming these utils are in lib/auth/oauth2.ts
import * as jose from 'jose'; // For standard OAuth token validation

// 认证中心UI相关的常量 (Constants related to Auth Center UI)
const AUTH_CENTER_LOGIN_PAGE_URL = process.env.AUTH_CENTER_LOGIN_PAGE_URL || '/login'; // 认证中心的登录页面
const CONSENT_API_URL = '/api/v2/oauth/consent'; // 同意API端点
const AUTH_CENTER_UI_AUDIENCE = process.env.AUTH_CENTER_UI_AUDIENCE || 'urn:auth-center:ui'; // 令牌的预期受众，用于认证中心UI会话
const AUTH_CENTER_UI_CLIENT_ID = process.env.AUTH_CENTER_UI_CLIENT_ID || 'auth-center-admin-client'; // 用于认证中心UI登录流程的OAuth客户端ID


export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  // 1. 从查询参数中检索参数 (Retrieve parameters from query string)
  const clientId = searchParams.get('client_id'); // For the third-party client
  const redirectUri = searchParams.get('redirect_uri');
  const responseType = searchParams.get('response_type');
  const scope = searchParams.get('scope');
  const state = searchParams.get('state');
  const codeChallenge = searchParams.get('code_challenge');
  const codeChallengeMethod = searchParams.get('code_challenge_method');

  // 构建错误重定向URL的辅助函数 (Helper function to build error redirect URL)
  const buildErrorRedirect = (baseRedirectUri: string | null, error: string, description: string, originalState?: string | null) => {
    if (!baseRedirectUri) {
      return NextResponse.json({ error, error_description: description, state: originalState }, { status: 400 });
    }
    const errorUrl = new URL(baseRedirectUri);
    errorUrl.searchParams.set('error', error);
    errorUrl.searchParams.set('error_description', description);
    if (originalState) {
      errorUrl.searchParams.set('state', originalState);
    }
    return NextResponse.redirect(errorUrl.toString(), 302);
  };

  // 2. 参数验证 (Parameter Validation for the third-party client request)
  if (!clientId || !redirectUri || !responseType || !codeChallenge || !codeChallengeMethod) {
    return buildErrorRedirect(redirectUri, 'invalid_request', 'Missing required parameters (client_id, redirect_uri, response_type, code_challenge, code_challenge_method).', state);
  }
  if (responseType !== 'code') {
    return buildErrorRedirect(redirectUri, 'unsupported_response_type', 'response_type must be "code".', state);
  }
  if (codeChallengeMethod !== 'S256') {
    return buildErrorRedirect(redirectUri, 'invalid_request', 'code_challenge_method must be "S256".', state);
  }
  if (!PKCEUtils.validateCodeChallenge(codeChallenge)) {
     return buildErrorRedirect(redirectUri, 'invalid_request', 'Invalid code_challenge format.', state);
  }

  // 3. 第三方客户端验证 (Third-party Client Validation)
  const thirdPartyClient = await prisma.oAuthClient.findUnique({ where: { clientId: clientId } });
  if (!thirdPartyClient || !thirdPartyClient.isActive) {
    return NextResponse.json({ error: 'invalid_client', error_description: 'Client not found or not active.' }, { status: 400 });
  }
  let registeredRedirectUris: string[] = [];
  try {
    registeredRedirectUris = JSON.parse(thirdPartyClient.redirectUris as string);
  } catch (e) {
    console.error("Failed to parse third-party client's redirectUris:", thirdPartyClient.redirectUris);
    return NextResponse.json({ error: 'server_error', error_description: 'Invalid client configuration for redirectUris.' }, { status: 500 });
  }
  if (!Array.isArray(registeredRedirectUris) || !registeredRedirectUris.includes(redirectUri)) {
    return NextResponse.json({ error: 'invalid_request', error_description: 'Invalid redirect_uri.' }, { status: 400 });
  }

  // 4. 范围验证 (Scope Validation for the third-party client request)
  if (!scope) {
      return buildErrorRedirect(redirectUri, 'invalid_scope', 'Scope parameter is required.', state);
  }
  const requestedScopes = ScopeUtils.parseScopes(scope);
  const scopeValidationResult = await ScopeUtils.validateScopes(requestedScopes, thirdPartyClient);
  if (!scopeValidationResult.valid) {
    const errorDescription = scopeValidationResult.error_description ||
                             `Invalid or not allowed scope(s): ${scopeValidationResult.invalidScopes.join(', ')}.`;
    return buildErrorRedirect(redirectUri, 'invalid_scope', errorDescription, state);
  }
  const validatedScopes = requestedScopes;


  // 5. 用户认证 (User Authentication - for Auth Center UI session)
  // 用户必须已登录到认证中心才能授权第三方应用
  // (User must be logged into the Auth Center to authorize third-party apps)
  let user: User | null = null;
  const internalAuthToken = req.cookies.get('auth_center_session_token')?.value; // Example: Get token from HttpOnly cookie

  if (internalAuthToken) {
    try {
      const jwksUriString = process.env.JWKS_URI;
      if (!jwksUriString) throw new Error('JWKS_URI not configured for internal auth.');
      const JWKS = jose.createRemoteJWKSet(new URL(jwksUriString));
      const expectedIssuer = process.env.JWT_ISSUER;
      if (!expectedIssuer) throw new Error('JWT_ISSUER not configured for internal auth.');

      const { payload: internalAuthTokenPayload } = await jose.jwtVerify(internalAuthToken, JWKS, {
        issuer: expectedIssuer,
        audience: AUTH_CENTER_UI_AUDIENCE, // Specific audience for Auth Center UI tokens
        algorithms: ['RS256'],
      });

      if (internalAuthTokenPayload && internalAuthTokenPayload.sub) {
        user = await prisma.user.findUnique({ where: { id: internalAuthTokenPayload.sub, isActive: true }});
      }
    } catch (error) {
      console.warn('Auth Center UI session token verification failed during /authorize:', (error as Error).message);
    }
  }

  if (!user) {
    // 用户未登录认证中心，重定向到认证中心的登录流程 (User not logged into Auth Center, redirect to its login flow)
    // 这个登录流程会为认证中心UI自身创建一个OAuth会话
    // (This login flow creates an OAuth session for the Auth Center UI itself)
    const authCenterLoginUrl = new URL(AUTH_CENTER_LOGIN_PAGE_URL, req.nextUrl.origin);
    const paramsForUiLogin = new URLSearchParams({
      client_id: AUTH_CENTER_UI_CLIENT_ID, // The Auth Center's own UI client
      redirect_uri: req.nextUrl.href, // Important: Redirect back to this /authorize URL with all original 3rd-party params
      response_type: 'code',
      scope: 'openid profile email auth-center:interact', // Scopes needed for the Auth Center UI session
      // state: crypto.randomBytes(16).toString('hex'), // Optional: internal state for this first-party login
    });
    authCenterLoginUrl.search = paramsForUiLogin.toString();

    console.log(`User not authenticated with Auth Center. Redirecting to Auth Center login: ${authCenterLoginUrl.toString()}`);
    return NextResponse.redirect(authCenterLoginUrl.toString(), 302);
  }
  console.log(`User ${user.id} authenticated to Auth Center UI. Continuing /authorize flow for client ${clientId}.`);


  // 6. 同意检查 (Consent Check for the third-party client)
  const existingConsent = await prisma.consentGrant.findFirst({
    where: { userId: user.id, clientId: thirdPartyClient.id },
  });
  let hasFullConsent = false;
  if (existingConsent) {
    const grantedScopes = ScopeUtils.parseScopes(existingConsent.scopes);
    hasFullConsent = validatedScopes.every(scope => grantedScopes.includes(scope));
  }

  if (!hasFullConsent) {
    // 重定向到同意页面API (Redirect to consent page API)
    const consentUrl = new URL(CONSENT_API_URL, req.nextUrl.origin);
    consentUrl.searchParams.set('client_id', clientId); // Third-party client_id
    consentUrl.searchParams.set('redirect_uri', redirectUri);
    consentUrl.searchParams.set('scope', ScopeUtils.formatScopes(validatedScopes));
    if (state) consentUrl.searchParams.set('state', state);
    consentUrl.searchParams.set('response_type', responseType);
    if (codeChallenge) consentUrl.searchParams.set('code_challenge', codeChallenge);
    if (codeChallengeMethod) consentUrl.searchParams.set('code_challenge_method', codeChallengeMethod);

    console.log(`Redirecting user ${user.id} to consent page for client ${thirdPartyClient.clientId}`);
    // The consent page will be protected by `requirePermission('auth-center:interact')`
    // which expects the `auth_center_session_token` (or equivalent) to be present.
    return NextResponse.redirect(consentUrl.toString(), 302);
  }

  console.log(`User ${user.id} already consented for client ${thirdPartyClient.clientId}. Issuing code.`);

  // 7. 生成并存储授权码 (Generate and Store Authorization Code for the third-party client)
  const authorizationCodeValue = AuthorizationUtils.generateAuthorizationCode(); // Use helper
  const codeExpiresAt = addMinutes(new Date(), 10);

  try {
    await prisma.authorizationCode.create({
      data: {
        code: authorizationCodeValue,
        userId: user.id,
        clientId: thirdPartyClient.id, // Use DB CUID for relations
        redirectUri: redirectUri,
        scope: ScopeUtils.formatScopes(validatedScopes),
        expiresAt: codeExpiresAt,
        codeChallenge: codeChallenge,
        codeChallengeMethod: codeChallengeMethod,
      },
    });
  } catch (dbError) {
    console.error('Failed to store authorization code:', dbError);
    return buildErrorRedirect(redirectUri, 'server_error', 'Could not generate authorization code.', state);
  }

  // 8. 重定向到第三方客户端 (Redirect to third-party client)
  const successUrl = new URL(redirectUri);
  successUrl.searchParams.set('code', authorizationCodeValue);
  if (state) {
    successUrl.searchParams.set('state', state);
  }
  return NextResponse.redirect(successUrl.toString(), 302);
}
