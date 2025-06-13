// 文件路径: app/api/v2/oauth/authorize/route.ts
// 描述: OAuth 2.0 授权端点，支持PKCE (RFC 7636)

import { NextRequest, NextResponse } from 'next/server';
import { URL } from 'url'; // For URL manipulation
import prisma from '@/lib/prisma';
import { OAuthClient, User } from '@prisma/client'; // Prisma-generated types
import { addMinutes } from 'date-fns'; // For setting expiry
import crypto from 'crypto';
import { PKCEUtils, ScopeUtils } from '@/lib/auth/oauth2'; // Assuming these utils are in lib/auth/oauth2.ts

// 模拟已认证的用户ID (Simulated authenticated user ID)
const SIMULATED_USER_ID = 'cluser1test123456789012345'; // Replace with a valid User ID from your seed data or test setup

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  // 1. 从查询参数中检索参数 (Retrieve parameters from query string)
  const clientId = searchParams.get('client_id');
  const redirectUri = searchParams.get('redirect_uri');
  const responseType = searchParams.get('response_type');
  const scope = searchParams.get('scope'); // 客户端请求的范围 (Scopes requested by the client)
  const state = searchParams.get('state');
  const codeChallenge = searchParams.get('code_challenge');
  const codeChallengeMethod = searchParams.get('code_challenge_method');

  // 构建错误重定向URL的辅助函数 (Helper function to build error redirect URL)
  const buildErrorRedirect = (baseRedirectUri: string | null, error: string, description: string, originalState?: string | null) => {
    if (!baseRedirectUri) { // 如果 redirect_uri 本身无效或未提供 (If redirect_uri itself is invalid or not provided)
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

  // 2. 参数验证 (Parameter Validation)
  if (!clientId || !redirectUri || !responseType || !codeChallenge || !codeChallengeMethod) {
    return buildErrorRedirect(redirectUri, 'invalid_request', 'Missing required parameters (client_id, redirect_uri, response_type, code_challenge, code_challenge_method).', state);
  }

  if (responseType !== 'code') {
    return buildErrorRedirect(redirectUri, 'unsupported_response_type', 'response_type must be "code".', state);
  }

  // 验证 code_challenge_method (Validate code_challenge_method)
  if (codeChallengeMethod !== 'S256') {
    // OAuth 2.1 推荐仅支持 S256 (OAuth 2.1 recommends supporting only S256)
    return buildErrorRedirect(redirectUri, 'invalid_request', 'code_challenge_method must be "S256".', state);
  }

  // 验证 code_challenge 格式 (Validate code_challenge format - RFC 7636 Appendix A)
  if (!PKCEUtils.validateCodeChallenge(codeChallenge)) {
     return buildErrorRedirect(redirectUri, 'invalid_request', 'Invalid code_challenge format.', state);
  }


  // 3. 客户端验证 (Client Validation)
  const client = await prisma.oAuthClient.findUnique({ where: { clientId: clientId } });
  if (!client || !client.isActive) {
    // 不重定向到 redirect_uri，因为客户端未知或无效 (Do not redirect to redirect_uri as client is unknown/invalid)
    return NextResponse.json({ error: 'invalid_client', error_description: 'Client not found or not active.' }, { status: 400 });
  }

  // 验证 redirect_uri (Validate redirect_uri)
  let registeredRedirectUris: string[] = [];
  try {
    registeredRedirectUris = JSON.parse(client.redirectUris);
  } catch (e) {
    console.error("Failed to parse client's redirectUris:", client.redirectUris);
    return NextResponse.json({ error: 'server_error', error_description: 'Invalid client configuration for redirectUris.' }, { status: 500 });
  }
  if (!Array.isArray(registeredRedirectUris) || !registeredRedirectUris.includes(redirectUri)) {
    // 不重定向，因为提供的 redirect_uri 与注册的不匹配 (Do not redirect as provided redirect_uri does not match registered ones)
    return NextResponse.json({ error: 'invalid_request', error_description: 'Invalid redirect_uri.' }, { status: 400 });
  }

  // 4. 范围验证 (Scope Validation - OIDC spec requires scope parameter)
  if (!scope) {
      return buildErrorRedirect(redirectUri, 'invalid_scope', 'Scope parameter is required.', state);
  }
  const requestedScopes = ScopeUtils.parseScopes(scope); // 使用 lib/auth/oauth2.ts 中的 ScopeUtils

  // 对请求的范围进行全面验证 (Perform full validation of requested scopes)
  // 这会检查客户端是否允许这些范围，以及这些范围是否是系统中已定义的有效范围
  // (This checks if the client is allowed these scopes and if they are valid, defined scopes in the system)
  const scopeValidationResult = await ScopeUtils.validateScopes(requestedScopes, client);
  if (!scopeValidationResult.valid) {
    const errorDescription = scopeValidationResult.error_description ||
                             `Invalid or not allowed scope(s): ${scopeValidationResult.invalidScopes.join(', ')}.`;
    return buildErrorRedirect(redirectUri, 'invalid_scope', errorDescription, state);
  }
  // 使用经过验证和可能已过滤/排序的范围 (Use validated and potentially filtered/sorted scopes if ScopeUtils.validateScopes modifies them)
  // 当前 ScopeUtils.validateScopes 返回原始请求的子集或完全相同的有效范围
  // (Currently ScopeUtils.validateScopes returns a subset of original requests or identical valid scopes)
  const validatedScopes = requestedScopes; // Assuming validateScopes doesn't alter the array structure if valid, just confirms validity.

  // 5. 用户认证和同意 (User Authentication & Consent - Simulated)
  // TODO: 此处应重定向到登录和同意页面 (Redirect to login and consent page here)
  // 模拟用户已认证 (Simulate user is authenticated)
  const user = await prisma.user.findUnique({ where: { id: SIMULATED_USER_ID, isActive: true }});
  if (!user) {
      // This is a server configuration/simulation issue
      console.error(`Simulated user with ID ${SIMULATED_USER_ID} not found or inactive.`);
      return buildErrorRedirect(redirectUri, 'server_error', 'User authentication failed (simulated).', state);
  }
  // 模拟用户同意所有请求的范围 (Simulate user consents to all requested scopes)


  // 6. 生成并存储授权码 (Generate and Store Authorization Code)
  const authorizationCodeValue = crypto.randomBytes(32).toString('hex');
  const codeExpiresAt = addMinutes(new Date(), 10); // 授权码10分钟后过期 (Authorization code expires in 10 minutes)

  try {
    await prisma.authorizationCode.create({
      data: {
        code: authorizationCodeValue,
        userId: user.id,
        clientId: client.id, // 使用数据库中的客户端ID (Use client ID from database)
        redirectUri: redirectUri, // 存储用于验证令牌请求中的 redirect_uri (Store for validating redirect_uri in token request)
        scope: ScopeUtils.formatScopes(validatedScopes), // 存储已验证和授予的范围 (Store validated and granted scopes)
        expiresAt: codeExpiresAt,
        codeChallenge: codeChallenge,
        codeChallengeMethod: codeChallengeMethod,
        // isUsed: false by default
      },
    });
  } catch (dbError) {
    console.error('Failed to store authorization code:', dbError);
    return buildErrorRedirect(redirectUri, 'server_error', 'Could not generate authorization code.', state);
  }

  // 7. 重定向到客户端 (Redirect to client)
  const successUrl = new URL(redirectUri);
  successUrl.searchParams.set('code', authorizationCodeValue);
  if (state) {
    successUrl.searchParams.set('state', state);
  }
  return NextResponse.redirect(successUrl.toString(), 302);
}
