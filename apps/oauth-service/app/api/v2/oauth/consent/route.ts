// 文件路径: app/api/v2/oauth/consent/route.ts
// File path: app/api/v2/oauth/consent/route.ts
// 描述: 此文件实现了 OAuth 2.0 同意页面 (Consent Page) 的后端逻辑。
// Description: This file implements the backend logic for the OAuth 2.0 Consent Page.
// (For detailed responsibilities, see original comments - preserved below)

import { prisma } from '@repo/database';
import { AuthorizationUtils, ScopeUtils } from '@repo/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

// storeAuthorizationCode 已删除，业务逻辑应在 route handler 中实现
import {
  ConfigurationError,
  OAuth2Error,
  OAuth2ErrorCode,
  ResourceNotFoundError,
} from '@repo/lib/errors';
import { ApiResponse } from '@repo/lib/types/api';
import { withErrorHandling } from '@repo/lib/utils/error-handler';

// 同意表单提交的目标 URL 路径
// Target URL path for consent form submission
const CONSENT_API_URL_PATH = '/api/v2/oauth/consent';

// 为GET请求成功响应定义数据类型
// Define data type for successful GET request response
interface ConsentPageData {
  client: {
    id: string; // 客户端的公开ID (Client's public ID)
    name: string; // 客户端名称 (Client name)
    logoUri?: string | null; // 客户端Logo URI (Client Logo URI)
  };
  requested_scopes: { name: string; description: string }[]; // 请求的权限范围详情 (Details of requested scopes)
  user: {
    id: string; // 用户ID (User ID)
    username: string | null; // 用户名或邮箱等 (Username or email etc.)
  };
  consent_form_action_url: string; // 同意表单提交的URL (URL for consent form submission)
  // OAuth 原始参数，需要透传 (Original OAuth parameters, need to be passed through)
  client_id: string;
  redirect_uri: string;
  scope: string; // 原始的、未经解析的 scope 字符串 (Original, unparsed scope string)
  state?: string;
  response_type: string;
  code_challenge?: string;
  code_challenge_method?: string;
  nonce?: string;
}

/**
 * @swagger
 * /api/v2/oauth/consent:
 *   get:
 *     summary: 获取用户同意信息 (Get User Consent Information)
 *     description: (需要 'auth-center:interact' 权限) 此端点准备并返回渲染同意页面所需的数据。
 *                  ((Requires 'auth-center:interact' permission) This endpoint prepares and returns data needed to render the consent page.)
 *     tags: [OAuth V2]
 *     security:
 *       - bearerAuth: []
 *     parameters: # 详细参数已在之前定义，此处省略 (Detailed parameters defined before, omitted here for brevity)
 *     responses:
 *       '200':
 *         description: 成功获取同意页面所需数据。 (Successfully fetched data required for the consent page.)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponseConsentData'
 *       '400':
 *         description: 无效的请求参数。 (Invalid request parameters.)
 *         content: { $ref: '#/components/schemas/ApiResponseError' }
 *       '401':
 *         description: 用户未认证或无权限访问认证中心交互功能。 (User not authenticated or no permission to interact with Auth Center.)
 *         content: { $ref: '#/components/schemas/ApiResponseError' }
 *       '403':
 *         description: 禁止访问/客户端无效或用户记录问题。 (Forbidden / Invalid client or user record issue.)
 *         content: { $ref: '#/components/schemas/ApiResponseError' }
 *       '500':
 *         description: 服务器内部错误。 (Internal server error.)
 *         content: { $ref: '#/components/schemas/ApiResponseError' }
 *   post:
 *     summary: 用户提交同意决策 (User Submits Consent Decision)
 *     description: (需要 'auth-center:interact' 权限) 用户通过此端点提交同意或拒绝的决策。
 *                  ((Requires 'auth-center:interact' permission) User submits their consent or denial decision via this endpoint.)
 *     tags: [OAuth V2]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             $ref: '#/components/schemas/ConsentFormPayload'
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ConsentFormPayload'
 *     responses:
 *       '302': # 重定向 (Redirect)
 *         description: 同意决策已处理，重定向到客户端的redirect_uri。 (Consent decision processed, redirecting to client's redirect_uri.)
 *       '400':
 *         description: 无效的请求体或参数。 (Invalid request body or parameters.)
 *         content: { $ref: '#/components/schemas/ApiResponseError' }
 *       '401':
 *         description: 用户未认证或无权限。 (User not authenticated or no permission.)
 *         content: { $ref: '#/components/schemas/ApiResponseError' }
 *       '403':
 *         description: 客户端无效或用户记录问题。 (Invalid client or user record issue.)
 *         content: { $ref: '#/components/schemas/ApiResponseError' }
 *       '415':
 *         description: 不支持的Content-Type。 (Unsupported Content-Type.)
 *         content: { $ref: '#/components/schemas/ApiResponseError' }
 *       '500':
 *         description: 服务器内部错误。 (Internal server error.)
 *         content: { $ref: '#/components/schemas/ApiResponseError' }
 * components:
 *   schemas:
 *     ConsentPageData: # 已在上面接口中定义 (Defined in interface above)
 *       # ... properties from ConsentPageData interface ...
 *     ApiResponseConsentData:
 *       allOf:
 *         - $ref: '#/components/schemas/ApiResponseBase'
 *         - type: object
 *           properties:
 *             data: { $ref: '#/components/schemas/ConsentPageData' }
 *             message: { type: string, example: "Consent data retrieved successfully." }
 *     ConsentFormPayload: # 已在上面接口中定义 (Defined in interface above for POST)
 *       # ... properties from POST handler ...
 *     # ApiResponseBase, ApiError, ApiResponseError 已在其他地方定义 (Defined elsewhere)
 */
// GET 请求处理函数的内部实现 (Internal implementation of GET request handler)
async function getConsentPageDataHandlerInternal(request: NextRequest): Promise<NextResponse> {
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
    if (!Array.isArray(registeredRedirectUris)) throw new Error('Redirect URIs are not an array.');
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
  return NextResponse.json<ApiResponse<ConsentPageData>>(
    {
      success: true,
      data: responseData,
      message: 'Consent data retrieved successfully.',
    },
    { status: 200 }
  );
}

// POST 请求处理函数的内部实现 (Internal implementation of POST request handler)
async function submitConsentDecisionHandlerInternal(request: NextRequest): Promise<NextResponse> {
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
    typeof bodyParams.get === 'function' ? bodyParams.get('redirect_uri') : bodyParams.redirect_uri;
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
}

// 使用 withErrorHandling 包装处理函数
// Wrap handlers with withErrorHandling
export const GET = withErrorHandling(getConsentPageDataHandlerInternal);
export const POST = withErrorHandling(submitConsentDecisionHandlerInternal);

// 文件结束 (End Of File)
// EOF
