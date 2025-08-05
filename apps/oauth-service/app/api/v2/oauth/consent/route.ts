// 文件路径: app/api/v2/oauth/consent/route.ts
// File path: app/api/v2/oauth/consent/route.ts
// 描述: 此文件实现了 OAuth 2.0 同意页面 (Consent Page) 的后端逻辑。
// Description: This file implements the backend logic for the OAuth 2.0 Consent Page.
// (For detailed responsibilities, see original comments - preserved below)

import { prisma } from '@repo/database';
import {
  AuthorizationUtils,
  ConfigurationError,
  errorResponse,
  OAuth2Error,
  OAuth2ErrorCode,
  ResourceNotFoundError,
  ScopeUtils,
  withErrorHandling,
  successResponse,
} from '@repo/lib/node';
import { NextRequest, NextResponse } from 'next/server';
// import type { ConsentPageData } from '@repo/lib/node';
type ConsentPageData = any;

const CONSENT_API_URL_PATH = '/api/v2/oauth/consent';
// storeAuthorizationCode 已删除，业务逻辑应在 route handler 中实现

// GET 请求处理函数的内部实现 (Internal implementation of GET request handler)
async function getConsentPageDataHandlerInternal(request: NextRequest): Promise<NextResponse> {
  try {
    // 在这里手动获取用户身份验证信息
    // Manually get user authentication information here
    const authUser = (request as any).user; // 临时处理，实际应该通过中间件设置
    if (!authUser || !authUser.id) {
      throw new ConfigurationError('User context not found after permission check.');
    }
    const userId = authUser.id;

    const user = await prisma.user.findUnique({ where: { id: userId, isActive: true } });
    if (!user) {
      // 已认证用户在数据库中未找到或非活动
      // Authenticated user not found in DB or inactive
      throw new ResourceNotFoundError(
        'Authenticated user not found or inactive. Please re-authenticate.',
        'AUTH_USER_INVALID_CONSENT_GET',
        { userId }
      );
    }

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('client_id');
    const redirectUri = searchParams.get('redirect_uri');
    const scopeString = searchParams.get('scope');
    const state = searchParams.get('state');
    const responseType = searchParams.get('response_type');
    const codeChallenge = searchParams.get('code_challenge');
    const codeChallengeMethod = searchParams.get('code_challenge_method');
    const nonce = searchParams.get('nonce');

    if (!clientId || !redirectUri || !scopeString || !responseType) {
      // 缺少必需的查询参数
      // Missing required query parameters
      throw new OAuth2Error(
        'Missing required parameters from authorization server.',
        OAuth2ErrorCode.InvalidRequest,
        400,
        undefined,
        {
          missing: [
            !clientId && 'client_id',
            !redirectUri && 'redirect_uri',
            !scopeString && 'scope',
            !responseType && 'response_type',
          ].filter(Boolean),
        }
      );
    }
    if (responseType !== 'code') {
      // 无效的 response_type
      // Invalid response_type
      throw new OAuth2Error(
        'Invalid response_type from authorization server: must be "code".',
        OAuth2ErrorCode.InvalidRequest,
        400,
        undefined,
        { responseType }
      );
    }

    const client = await prisma.oAuthClient.findUnique({ where: { clientId: clientId } });
    if (!client || !client.isActive) {
      // 无效的客户端ID或客户端非活动
      // Invalid client ID or client is inactive
      throw new OAuth2Error(
        'Third-party client not found or is not active.',
        OAuth2ErrorCode.InvalidRequest,
        403,
        undefined,
        { clientId }
      );
    }

    let registeredRedirectUris: string[] = [];
    try {
      registeredRedirectUris = JSON.parse(client.redirectUris as string); // redirectUris 在DB中是JSON字符串 (redirectUris is JSON string in DB)
      if (!Array.isArray(registeredRedirectUris))
        throw new Error('Redirect URIs are not an array.');
    } catch (e) {
      console.error(`Failed to parse redirectUris for client ${clientId}:`, e);
      // 客户端 redirectUris 配置错误
      // Client redirectUris configuration error
      throw new ConfigurationError('Server error: Invalid client configuration for redirectUris.', {
        clientId,
      });
    }
    if (!AuthorizationUtils.validateRedirectUri(redirectUri, registeredRedirectUris)) {
      // 提供的 redirect_uri 未注册
      // Provided redirect_uri is not registered
      throw new OAuth2Error(
        'Provided redirect_uri is not registered for this client.',
        OAuth2ErrorCode.InvalidRequest,
        400,
        undefined,
        { redirectUri, registered: registeredRedirectUris }
      );
    }

    const requestedScopeNames = ScopeUtils.parseScopes(scopeString);
    const dbScopes = await prisma.scope.findMany({
      where: { name: { in: requestedScopeNames }, isActive: true },
    });
    const requestedScopesDetails = dbScopes.map((dbScope) => ({
      name: dbScope.name,
      description: dbScope.description || 'No description available for this permission.',
    }));
    if (requestedScopesDetails.length !== requestedScopeNames.length) {
      const foundNames = requestedScopesDetails.map((s) => s.name);
      const missing = requestedScopeNames.filter((s) => !foundNames.includes(s));
      // 请求的某些 scope 无效或非活动
      // Some requested scopes are invalid or inactive
      throw new OAuth2Error(
        `The following requested permissions are invalid or inactive: ${missing.join(', ')}. Please contact the application developer.`,
        OAuth2ErrorCode.InvalidRequest,
        400,
        undefined,
        { missingScopes: missing }
      );
    }

    const responseData: ConsentPageData = {
      client: {
        id: client.clientId,
        name: client.name || client.clientId,
        logoUri: client.logoUri,
      },
      requested_scopes: requestedScopesDetails,
      user: { id: user.id, username: user.username },
      consent_form_action_url: CONSENT_API_URL_PATH,
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scopeString,
      state: state || undefined,
      response_type: responseType,
      code_challenge: codeChallenge || undefined,
      code_challenge_method: codeChallengeMethod || undefined,
      nonce: nonce || undefined,
    };

    // 成功获取同意页面数据
    // Successfully retrieved consent page data
    return successResponse(responseData, 200, '同意页面数据获取成功');
  } catch (err: any) {
    return errorResponse({
      message: err.message || '获取同意信息失败',
      statusCode: err.status || 500,
      details: err.details || err.code,
    });
  }
}

// POST 请求处理函数的内部实现 (Internal implementation of POST request handler)
async function submitConsentDecisionHandlerInternal(request: NextRequest): Promise<NextResponse> {
  try {
    // 在这里手动获取用户身份验证信息
    // Manually get user authentication information here
    const authUser = (request as any).user; // 临时处理，实际应该通过中间件设置
    if (!authUser || !authUser.id) {
      throw new ConfigurationError('User context not found after permission check.');
    }
    const userId = authUser.id;

    const user = await prisma.user.findUnique({ where: { id: userId, isActive: true } });
    if (!user) {
      throw new ResourceNotFoundError(
        'Authenticated user not found or inactive.',
        'AUTH_USER_INVALID_CONSENT_POST',
        { userId }
      );
    }

    let bodyParams: URLSearchParams | any;
    const contentType = request.headers.get('content-type');

    if (contentType?.includes('application/x-www-form-urlencoded')) {
      bodyParams = await request.formData();
    } else if (contentType?.includes('application/json')) {
      bodyParams = await request.json();
    } else {
      // 不支持的 Content-Type
      // Unsupported Content-Type
      throw new OAuth2Error(
        'Unsupported Content-Type. Please use application/x-www-form-urlencoded or application/json.',
        OAuth2ErrorCode.InvalidRequest,
        415,
        undefined,
        {}
      );
    }

    const decision =
      typeof bodyParams.get === 'function' ? bodyParams.get('decision') : bodyParams.decision;
    const clientId =
      typeof bodyParams.get === 'function' ? bodyParams.get('client_id') : bodyParams.client_id;
    const grantedScopeString =
      typeof bodyParams.get === 'function' ? bodyParams.get('scope') : bodyParams.scope;
    const state = typeof bodyParams.get === 'function' ? bodyParams.get('state') : bodyParams.state;
    const redirectUri =
      typeof bodyParams.get === 'function'
        ? bodyParams.get('redirect_uri')
        : bodyParams.redirect_uri;
    const responseType =
      typeof bodyParams.get === 'function'
        ? bodyParams.get('response_type')
        : bodyParams.response_type;
    const codeChallenge =
      typeof bodyParams.get === 'function'
        ? bodyParams.get('code_challenge')
        : bodyParams.code_challenge;
    const codeChallengeMethod =
      typeof bodyParams.get === 'function'
        ? bodyParams.get('code_challenge_method')
        : bodyParams.code_challenge_method;
    const nonce = typeof bodyParams.get === 'function' ? bodyParams.get('nonce') : bodyParams.nonce;

    if (!decision || !clientId || !grantedScopeString || !redirectUri || !responseType) {
      // 提交的表单缺少必要字段
      // Submitted form is missing required fields
      throw new OAuth2Error(
        'Missing required form fields from consent submission.',
        OAuth2ErrorCode.InvalidRequest,
        400,
        undefined,
        {
          missing: [
            !decision && 'decision',
            !clientId && 'client_id',
            !grantedScopeString && 'scope',
            !redirectUri && 'redirect_uri',
            !responseType && 'response_type',
          ].filter(Boolean),
        }
      );
    }
    if (responseType !== 'code') {
      throw new OAuth2Error(
        'Invalid response_type submitted from consent form: must be "code".',
        OAuth2ErrorCode.InvalidRequest,
        400,
        undefined,
        { responseType }
      );
    }

    const client = await prisma.oAuthClient.findUnique({ where: { clientId: clientId } });
    if (!client || !client.isActive) {
      // 表单中指定的客户端无效
      // Client specified in form is invalid
      throw new OAuth2Error(
        'Client specified in consent form not found or is not active.',
        OAuth2ErrorCode.InvalidRequest,
        403,
        undefined,
        { clientId }
      );
    }
    let registeredRedirectUris: string[] = [];
    try {
      registeredRedirectUris = JSON.parse(client.redirectUris as string);
    } catch {
      /* ignore */
    }
    if (!AuthorizationUtils.validateRedirectUri(redirectUri, registeredRedirectUris)) {
      // 表单中指定的 redirect_uri 无效
      // redirect_uri specified in form is invalid
      throw new OAuth2Error(
        'Invalid redirect_uri submitted from consent form for this client.',
        OAuth2ErrorCode.InvalidRequest,
        400,
        undefined,
        { redirectUri }
      );
    }

    const finalRedirectUrl = new URL(redirectUri);
    if (state) finalRedirectUrl.searchParams.set('state', state);

    if (decision === 'deny') {
      finalRedirectUrl.searchParams.set('error', OAuth2ErrorCode.AccessDenied);
      finalRedirectUrl.searchParams.set(
        'error_description',
        'The user denied access to the requested resources.'
      );
      return NextResponse.redirect(finalRedirectUrl.toString(), 302);
    }

    if (decision === 'allow') {
      const grantedScopes = ScopeUtils.parseScopes(grantedScopeString);
      // TODO: (重要) 验证 grantedScopes - 是否有效、是否客户端允许、是否原始请求的子集
      // TODO: (Important) Validate grantedScopes - are they valid, client-allowed, subset of original request
      // Example (conceptual - needs full implementation of fetching original requested scopes for comparison):
      // const originalRequestedScopes = ScopeUtils.parseScopes(searchParams.get('original_scope_for_validation_here') || '');
      // if (!grantedScopes.every(gs => originalRequestedScopes.includes(gs))) {
      //   throw new OAuth2Error("Granted scopes exceed originally requested scopes.", OAuth2ErrorCode.InvalidScope);
      // }

      await prisma.consentGrant.upsert({
        where: { userId_clientId: { userId: user.id, clientId: client.id } },
        update: {
          scopes: ScopeUtils.formatScopes(grantedScopes),
          issuedAt: new Date(),
          revokedAt: null,
        },
        create: {
          userId: user.id,
          clientId: client.id,
          scopes: ScopeUtils.formatScopes(grantedScopes),
        },
      });

      // 使用恢复的 authorization-code-flow 业务逻辑
      const { storeAuthorizationCode } = await import(
        '../../../../../lib/auth/authorization-code-flow'
      );

      const authCodeResult = await storeAuthorizationCode(
        user.id,
        client.id,
        redirectUri,
        codeChallenge || '',
        codeChallengeMethod || 'S256',
        ScopeUtils.formatScopes(grantedScopes),
        600, // 10分钟过期
        nonce
      );

      // 将授权码添加到重定向URL
      finalRedirectUrl.searchParams.set('code', authCodeResult.code);

      // 记录成功的审计事件
      await AuthorizationUtils.logAuditEvent({
        userId: user.id,
        clientId: client.clientId,
        action: 'CONSENT_GRANTED_AUTH_CODE_ISSUED',
        success: true,
        ipAddress:
          request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
        userAgent: request.headers.get('user-agent') || undefined,
        metadata: {
          client_id: client.clientId,
          grantedScopes: ScopeUtils.formatScopes(grantedScopes),
          hasPKCE: !!codeChallenge,
          hasNonce: !!nonce,
        },
      });

      // 审计日志
      await AuthorizationUtils.logAuditEvent({
        userId: user.id,
        clientId: client.clientId,
        action: decision === 'allow' ? 'CONSENT_GRANTED' : 'CONSENT_DENIED',
        success: decision === 'allow',
        ipAddress:
          request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
        userAgent: request.headers.get('user-agent') || undefined,
        metadata: {
          client_id: client.clientId,
          grantedScopes: decision === 'allow' ? ScopeUtils.formatScopes(grantedScopes) : undefined,
          hasPKCE: !!codeChallenge,
          hasNonce: !!nonce,
          decision,
          state,
        },
      });

      return NextResponse.redirect(finalRedirectUrl.toString(), 302);
    }

    // 无效的 decision 值
    // Invalid decision value
    throw new OAuth2Error(
      'Invalid decision value submitted. Must be "allow" or "deny".',
      OAuth2ErrorCode.InvalidRequest,
      400,
      undefined,
      { decision }
    );
  } catch (err: any) {
    return errorResponse({
      message: err.message || '处理同意决策失败',
      statusCode: err.status || 500,
      details: err.details || err.code,
    });
  }
}

// 使用 withErrorHandling 包装处理函数
// Wrap handlers with withErrorHandling
export const GET = withErrorHandling(getConsentPageDataHandlerInternal);
export const POST = withErrorHandling(submitConsentDecisionHandlerInternal);

// 文件结束 (End Of File)
// EOF
