// /api/v2/oauth/consent

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { User, OAuthClient as Client } from '@prisma/client'; // Renamed to avoid conflict
import { ScopeUtils, AuthorizationUtils } from '@/lib/auth/oauth2'; // Reusing existing utils
import { addMinutes } from 'date-fns';
import crypto from 'crypto';
import { requirePermission, AuthenticatedRequest } from '@/lib/auth/middleware'; // Import HOF and AuthenticatedRequest

const CONSENT_API_URL_PATH = '/api/v2/oauth/consent'; // For form action

// 辅助函数：错误响应 (Helper function for error responses, not redirecting)
function errorResponseJson(message: string, status: number, errorCode?: string) {
  return NextResponse.json({ error: errorCode || 'consent_error', error_description: message }, { status });
}

// 原GET处理函数的核心逻辑 (Core logic of original GET handler)
async function getConsentHandlerInternal(request: AuthenticatedRequest) {
  // 用户已由 requirePermission 认证，用户信息在 request.user 中
  // (User is already authenticated by requirePermission, user info in request.user)
  const authUser = request.user;
  if (!authUser || !authUser.id) {
    return errorResponseJson('Unauthorized: User context not found after permission check.', 401, 'internal_auth_error');
  }
  const userId = authUser.id; // This is the 'sub' from the OAuth token used for Auth Center UI

  const user = await prisma.user.findUnique({ where: { id: userId, isActive: true }});
  if (!user) {
    // This case might indicate a desync if token is valid but user is gone/inactive
    return errorResponseJson('Authenticated user not found in database or inactive.', 403, 'user_record_issue');
  }

  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('client_id');
  const redirectUri = searchParams.get('redirect_uri');
  const scopeString = searchParams.get('scope');
  const state = searchParams.get('state');
  const responseType = searchParams.get('response_type');
  const codeChallenge = searchParams.get('code_challenge');
  const codeChallengeMethod = searchParams.get('code_challenge_method');

  if (!clientId || !redirectUri || !scopeString || !responseType) {
    return errorResponseJson('Missing required parameters (client_id, redirect_uri, scope, response_type).', 400, 'invalid_request');
  }
  if (responseType !== 'code') {
    return errorResponseJson('response_type must be "code".', 400, 'unsupported_response_type');
  }

  const client = await prisma.oAuthClient.findUnique({ where: { clientId: clientId } });
  if (!client || !client.isActive) {
    return errorResponseJson('Client not found or not active.', 403, 'invalid_client');
  }
  let registeredRedirectUris: string[] = [];
  try {
    registeredRedirectUris = JSON.parse(client.redirectUris as string);
  } catch (e) { /* ignore */ }
  if (!AuthorizationUtils.validateRedirectUri(redirectUri, registeredRedirectUris)) {
      return errorResponseJson('Invalid redirect_uri.', 400, 'invalid_request');
  }

  const requestedScopeNames = ScopeUtils.parseScopes(scopeString);
  const dbScopes = await prisma.scope.findMany({
    where: { name: { in: requestedScopeNames }, isActive: true },
  });

  const requestedScopesDetails = dbScopes.map(dbScope => ({
    name: dbScope.name,
    description: dbScope.description || 'No description available.',
  }));

  if (requestedScopesDetails.length !== requestedScopeNames.length) {
    const foundNames = requestedScopesDetails.map(s => s.name);
    const missing = requestedScopeNames.filter(s => !foundNames.includes(s));
    return errorResponseJson(`Invalid or inactive scopes requested: ${missing.join(', ')}.`, 400, 'invalid_scope');
  }

  const responseData = {
    client: {
      id: client.clientId,
      name: client.clientName || client.clientId,
      logoUri: client.logoUri,
    },
    requested_scopes: requestedScopesDetails,
    user: { // Information about the user who needs to consent
      id: user.id,
      username: user.username,
    },
    consent_form_action_url: CONSENT_API_URL_PATH, // POST URL for the form
    // Pass through original OAuth parameters needed for the POST
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopeString, // Original full scope string
    state: state || undefined,
    response_type: responseType,
    code_challenge: codeChallenge || undefined,
    code_challenge_method: codeChallengeMethod || undefined,
  };

  return NextResponse.json(responseData);
}

// 原POST处理函数的核心逻辑 (Core logic of original POST handler)
async function postConsentHandlerInternal(request: AuthenticatedRequest) {
  const authUser = request.user;
   if (!authUser || !authUser.id) {
    return errorResponseJson('Unauthorized: User context not found after permission check.', 401, 'internal_auth_error');
  }
  const userId = authUser.id;

  const user = await prisma.user.findUnique({ where: { id: userId, isActive: true }});
  if (!user) {
    return errorResponseJson('Authenticated user not found in database or inactive.', 403, 'user_record_issue');
  }

  let bodyParams: URLSearchParams | any;
  const contentType = request.headers.get('content-type');
  if (contentType?.includes('application/x-www-form-urlencoded')) {
    bodyParams = await request.formData();
  } else if (contentType?.includes('application/json')) {
    bodyParams = await request.json();
  } else {
    return errorResponseJson('Unsupported Content-Type. Use application/x-www-form-urlencoded or application/json.', 415);
  }

  const decision = typeof bodyParams.get === 'function' ? bodyParams.get('decision') : bodyParams.decision;
  const clientId = typeof bodyParams.get === 'function' ? bodyParams.get('client_id') : bodyParams.client_id;
  const grantedScopeString = typeof bodyParams.get === 'function' ? bodyParams.get('scope') : bodyParams.scope;
  const state = typeof bodyParams.get === 'function' ? bodyParams.get('state') : bodyParams.state;
  const redirectUri = typeof bodyParams.get === 'function' ? bodyParams.get('redirect_uri') : bodyParams.redirect_uri;
  const responseType = typeof bodyParams.get === 'function' ? bodyParams.get('response_type') : bodyParams.response_type;
  const codeChallenge = typeof bodyParams.get === 'function' ? bodyParams.get('code_challenge') : bodyParams.code_challenge;
  const codeChallengeMethod = typeof bodyParams.get === 'function' ? bodyParams.get('code_challenge_method') : bodyParams.code_challenge_method;

  if (!decision || !clientId || !grantedScopeString || !redirectUri || !responseType) {
    return errorResponseJson('Missing required form fields (decision, client_id, scope, redirect_uri, response_type).', 400, 'invalid_request_body');
  }

  const client = await prisma.oAuthClient.findUnique({ where: { clientId: clientId } });
  if (!client || !client.isActive) {
    return errorResponseJson('Client not found or not active.', 403, 'invalid_client');
  }
  let registeredRedirectUris: string[] = [];
  try { registeredRedirectUris = JSON.parse(client.redirectUris as string); } catch (e) { /* ignore */ }
  if (!AuthorizationUtils.validateRedirectUri(redirectUri, registeredRedirectUris)) {
      return errorResponseJson('Invalid redirect_uri for this client.', 400, 'invalid_redirect_uri');
  }

  const finalRedirectUrl = new URL(redirectUri);
  if (state) finalRedirectUrl.searchParams.set('state', state);

  if (decision === 'deny') {
    finalRedirectUrl.searchParams.set('error', 'access_denied');
    finalRedirectUrl.searchParams.set('error_description', 'The user denied access to the requested resources.');
    return NextResponse.redirect(finalRedirectUrl.toString(), 302);
  }

  if (decision === 'allow') {
    const grantedScopes = ScopeUtils.parseScopes(grantedScopeString);
    // TODO: Validate grantedScopes are valid for the client and system, and subset of original request.

    await prisma.consentGrant.upsert({
      where: { userId_clientId: { userId: user.id, clientId: client.id } },
      update: { scopes: ScopeUtils.formatScopes(grantedScopes), issuedAt: new Date(), revokedAt: null },
      create: { userId: user.id, clientId: client.id, scopes: ScopeUtils.formatScopes(grantedScopes) },
    });

    const authorizationCodeValue = crypto.randomBytes(32).toString('hex');
    const codeExpiresAt = addMinutes(new Date(), 10);

    await prisma.authorizationCode.create({
      data: {
        code: authorizationCodeValue,
        userId: user.id,
        clientId: client.id,
        redirectUri: redirectUri,
        scope: ScopeUtils.formatScopes(grantedScopes),
        expiresAt: codeExpiresAt,
        codeChallenge: codeChallenge || null,
        codeChallengeMethod: codeChallengeMethod || null,
      },
    });

    finalRedirectUrl.searchParams.set('code', authorizationCodeValue);
    return NextResponse.redirect(finalRedirectUrl.toString(), 302);
  }

  return errorResponseJson('Invalid decision value.', 400, 'invalid_decision');
}


// Wrap handlers with requirePermission
export const GET = requirePermission('auth-center:interact')(getConsentHandlerInternal);
export const POST = requirePermission('auth-center:interact')(postConsentHandlerInternal);

// Swagger definitions (can be simplified or moved if using a generator)
/**
 * @swagger
 * /api/v2/oauth/consent:
 *   get:
 *     summary: 获取用户同意信息 (OAuth 同意管理)
 *     description: (需要用户通过OAuth认证并持有 'auth-center:interact' 权限) 此端点准备并返回渲染同意页面所需的数据。
 *     tags: [OAuth2.1 API]
 *     security:
 *       - bearerAuth: [] # Indicates Bearer token authentication for this endpoint itself
 *     parameters:
 *       - name: client_id
 *         in: query
 *         required: true
 *       - name: redirect_uri
 *         in: query
 *         required: true
 *       # ... other OAuth parameters from original swagger ...
 *     responses:
 *       200:
 *         description: 成功获取同意页面所需数据。
 *       401:
 *         description: 用户未认证或无权限。
 *       403:
 *         description: 禁止访问/客户端无效。
 *   post:
 *     summary: 用户提交同意决策 (OAuth 同意管理)
 *     description: (需要用户通过OAuth认证并持有 'auth-center:interact' 权限) 用户通过此端点提交决策。
 *     tags: [OAuth2.1 API]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             required: [client_id, redirect_uri, scope, decision, response_type]
 *             # ... properties from original swagger ...
 *     responses:
 *       302:
 *         description: 同意决策已处理，重定向到客户端的redirect_uri。
 *       401:
 *         description: 用户未认证或无权限。
 */
