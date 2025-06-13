// 文件路径: app/api/v2/oauth/consent/route.ts
// 描述: 此文件实现了 OAuth 2.0 同意页面 (Consent Page) 的后端逻辑。
// 主要职责:
// GET 请求:
//  1. 验证用户身份: 确保用户已登录认证中心 (通过 `requirePermission` 中间件和 `auth-center:interact` 权限)。
//  2. 解析和验证来自授权服务器 (/authorize 端点重定向) 的请求参数 (client_id, redirect_uri, scope, state 等)。
//  3. 从数据库获取客户端信息和请求的 scope 的详细信息 (例如描述)。
//  4. 准备并返回一个 JSON 对象，其中包含渲染同意页面所需的所有数据 (客户端名称、logo、请求的权限列表、用户信息、表单提交URL等)。
// POST 请求:
//  1. 验证用户身份: 同 GET 请求。
//  2. 解析用户从同意页面提交的表单数据 (通常是 'allow' 或 'deny' 决策，以及原始的 OAuth 参数)。
//  3. 如果用户拒绝 (deny): 重定向回第三方客户端的 redirect_uri，并附带 'access_denied' 错误。
//  4. 如果用户允许 (allow):
//     a. 在数据库中记录或更新用户的同意授权 (ConsentGrant)。
//     b. 生成一个新的授权码 (Authorization Code)。
//     c. 将授权码、state (如果存在) 附加到第三方客户端的 redirect_uri，并重定向用户。
// 安全性:
//  - GET 和 POST 端点都受到 `requirePermission('auth-center:interact')` 的保护，确保只有登录认证中心并具有特定权限的用户才能访问。
//  - 验证 redirect_uri 以防止开放重定向。
//  - 验证客户端 ID 和请求的 scopes。
//  - CSRF 保护: state 参数的传递和验证 (虽然 CSRF 主要在 authorize 请求时由客户端生成并在回调时验证，但同意流程中 state 也需要正确传递)。

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma'; // Prisma ORM 用于数据库交互
import { User, OAuthClient as Client } from '@prisma/client'; // Prisma 生成的数据库模型类型 (将 OAuthClient 重命名为 Client 以避免与JS内置的 Client 冲突)
import { ScopeUtils, AuthorizationUtils } from '@/lib/auth/oauth2'; // OAuth 2.0 相关的辅助工具函数
import { addMinutes } from 'date-fns'; // 用于日期计算 (例如设置授权码过期时间)
import crypto from 'crypto'; // Node.js 内置加密模块 (例如用于生成授权码)
import { requirePermission, AuthenticatedRequest } from '@/lib/auth/middleware'; // 引入 requirePermission 高阶函数和 AuthenticatedRequest 类型定义

// 同意表单提交的目标 URL 路径
const CONSENT_API_URL_PATH = '/api/v2/oauth/consent';

/**
 * 辅助函数：构建并返回 JSON 格式的错误响应。
 * 此函数不执行重定向，而是直接返回 JSON 错误信息。
 * @param message 错误描述信息。
 * @param status HTTP 状态码。
 * @param errorCode 可选的错误代码字符串 (例如 'invalid_request')。
 * @returns NextResponse 对象。
 */
function errorResponseJson(message: string, status: number, errorCode?: string): NextResponse {
  console.warn(`Consent API error: ${errorCode || 'consent_error'} - ${message}`); // 服务端日志记录错误
  return NextResponse.json({ error: errorCode || 'consent_error', error_description: message }, { status });
}

/**
 * GET 请求处理函数的内部实现。
 * 被 `requirePermission` 包装以确保用户认证和授权。
 * @param request AuthenticatedRequest 对象，包含了已认证的用户信息。
 * @returns NextResponse 对象，包含渲染同意页面所需的数据或错误信息。
 */
async function getConsentHandlerInternal(request: AuthenticatedRequest): Promise<NextResponse> {
  // --- 用户身份验证 ---
  // `requirePermission` 中间件已验证了用户通过认证中心UI的会话令牌，
  // 并且用户具有 'auth-center:interact' 权限。用户信息存储在 `request.user` 中。
  const authUser = request.user; // 从 AuthenticatedRequest 中获取已认证的用户信息
  if (!authUser || !authUser.id) {
    // 理论上，如果 requirePermission 配置正确，不应发生此情况。
    return errorResponseJson('Unauthorized: User context not found after permission check. This indicates an internal authentication setup issue.', 401, 'internal_auth_error');
  }
  const userId = authUser.id; // 这是认证中心UI会话令牌中的 'sub' (subject)声明，即用户ID

  // 从数据库中再次查找用户，确保用户存在且处于活动状态。
  // 这是一个额外的健全性检查，防止令牌有效但用户记录已更改的情况。
  const user = await prisma.user.findUnique({ where: { id: userId, isActive: true }});
  if (!user) {
    return errorResponseJson('Authenticated user not found in database or is inactive. Please re-authenticate with the Auth Center.', 403, 'user_record_issue');
  }

  // --- 解析和验证请求参数 ---
  // 这些参数通常由 /authorize 端点在重定向到同意页面时设置。
  const { searchParams } = new URL(request.url); // 从请求URL中解析查询参数
  const clientId = searchParams.get('client_id');         // 第三方客户端的 ID
  const redirectUri = searchParams.get('redirect_uri');   // 第三方客户端的回调 URI
  const scopeString = searchParams.get('scope');          // 请求的权限范围 (字符串格式)
  const state = searchParams.get('state');                // 客户端提供的 state 参数 (用于防止 CSRF)
  const responseType = searchParams.get('response_type'); // 响应类型 (应为 'code')
  const codeChallenge = searchParams.get('code_challenge'); // PKCE code challenge (如果使用了 PKCE)
  const codeChallengeMethod = searchParams.get('code_challenge_method'); // PKCE code challenge method (应为 'S256')

  // 验证必需的参数是否存在
  if (!clientId || !redirectUri || !scopeString || !responseType) {
    return errorResponseJson('Missing required parameters from authorization server: client_id, redirect_uri, scope, response_type.', 400, 'invalid_request');
  }
  // 验证 response_type 是否为 'code' (授权码流程)
  if (responseType !== 'code') {
    return errorResponseJson('Invalid response_type from authorization server: must be "code".', 400, 'unsupported_response_type');
  }

  // --- 客户端验证 ---
  // (Client Validation)
  // 从数据库中获取第三方客户端的信息。
  const client = await prisma.oAuthClient.findUnique({ where: { clientId: clientId } });
  if (!client || !client.isActive) {
    return errorResponseJson('Third-party client not found or is not active.', 403, 'invalid_client');
  }
  // 验证 redirect_uri 是否与客户端注册的 URI 匹配。
  // 这是防止开放重定向攻击的关键安全措施。
  let registeredRedirectUris: string[] = [];
  try {
    // redirectUris 在数据库中通常存储为 JSON 字符串数组
    registeredRedirectUris = JSON.parse(client.redirectUris as string);
  } catch (e) {
    console.error(`Failed to parse redirectUris for client ${clientId}:`, e);
    // 如果配置错误，这是一个服务端问题。
    return errorResponseJson('Server error: Invalid client configuration for redirectUris.', 500, 'config_error');
  }
  // 使用 AuthorizationUtils.validateRedirectUri 进行验证
  if (!AuthorizationUtils.validateRedirectUri(redirectUri, registeredRedirectUris)) {
      return errorResponseJson('Provided redirect_uri is not registered for this client.', 400, 'invalid_request');
  }

  // --- Scope 处理与信息获取 ---
  // (Scope Processing and Information Retrieval)
  // 解析请求的 scope 字符串为数组，并从数据库中获取这些 scope 的详细信息 (例如描述)。
  const requestedScopeNames = ScopeUtils.parseScopes(scopeString); // 将空格分隔的 scope 字符串解析为数组
  // 从数据库中查找所有请求的、且处于活动状态的 scope 记录。
  const dbScopes = await prisma.scope.findMany({
    where: { name: { in: requestedScopeNames }, isActive: true },
  });

  // 将数据库中的 scope 信息映射为包含名称和描述的对象数组。
  const requestedScopesDetails = dbScopes.map(dbScope => ({
    name: dbScope.name,
    description: dbScope.description || 'No description available for this permission.', // 提供默认描述
  }));

  // 验证是否所有请求的 scopes 都找到了对应的活动记录。
  // 如果请求的 scopes 数量与找到的不同，说明有些 scopes 无效或未激活。
  if (requestedScopesDetails.length !== requestedScopeNames.length) {
    const foundNames = requestedScopesDetails.map(s => s.name);
    const missing = requestedScopeNames.filter(s => !foundNames.includes(s)); // 找出缺失或无效的 scopes
    return errorResponseJson(`The following requested permissions are invalid or inactive: ${missing.join(', ')}. Please contact the application developer.`, 400, 'invalid_scope');
  }

  // --- 准备响应数据 ---
  // (Prepare response data for rendering the consent page)
  // 构建一个 JSON 对象，包含渲染同意页面所需的所有信息。
  const responseData = {
    client: { // 第三方客户端信息
      id: client.clientId,
      name: client.clientName || client.clientId, // 显示客户端名称，如果未设置则显示ID
      logoUri: client.logoUri, // 客户端的 Logo URI (可选)
    },
    requested_scopes: requestedScopesDetails, // 请求的权限列表 (包含描述)
    user: { // 当前需要进行同意决策的用户信息
      id: user.id,
      username: user.username, // 或其他用户标识符，如 email
    },
    consent_form_action_url: CONSENT_API_URL_PATH, // 同意表单提交的目标 POST URL
    // 将原始的 OAuth 参数透传给同意页面，以便在用户提交决策时能一并 POST 回来。
    // 这些参数对于后续生成授权码至关重要。
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopeString, // 原始的、未经解析的 scope 字符串
    state: state || undefined, // 如果 state 存在则传递
    response_type: responseType,
    code_challenge: codeChallenge || undefined, // 如果 PKCE 相关参数存在则传递
    code_challenge_method: codeChallengeMethod || undefined,
  };

  // 返回 JSON 数据，前端将使用这些数据来渲染同意界面。
  return NextResponse.json(responseData);
}

/**
 * POST 请求处理函数的内部实现。
 * 被 `requirePermission` 包装以确保用户认证和授权。
 * 处理用户从同意页面提交的决策。
 * @param request AuthenticatedRequest 对象，包含了已认证的用户信息。
 * @returns NextResponse 对象，通常是将用户重定向回第三方客户端的 redirect_uri。
 */
async function postConsentHandlerInternal(request: AuthenticatedRequest): Promise<NextResponse> {
  // --- 用户身份验证 --- (与 GET 请求类似)
  const authUser = request.user;
   if (!authUser || !authUser.id) {
    return errorResponseJson('Unauthorized: User context not found after permission check. This indicates an internal authentication setup issue.', 401, 'internal_auth_error');
  }
  const userId = authUser.id;

  // 再次确认用户存在且活动
  const user = await prisma.user.findUnique({ where: { id: userId, isActive: true }});
  if (!user) {
    return errorResponseJson('Authenticated user not found in database or is inactive. Please re-authenticate with the Auth Center.', 403, 'user_record_issue');
  }

  // --- 解析 POST 请求体 ---
  // (Parse POST request body)
  // 请求体可以是 'application/x-www-form-urlencoded' 或 'application/json'。
  let bodyParams: URLSearchParams | any; // 用于存储解析后的请求体参数
  const contentType = request.headers.get('content-type'); // 获取 Content-Type 头

  if (contentType?.includes('application/x-www-form-urlencoded')) {
    bodyParams = await request.formData(); // 解析表单数据
  } else if (contentType?.includes('application/json')) {
    bodyParams = await request.json(); // 解析 JSON 数据
  } else {
    // 不支持的内容类型
    return errorResponseJson('Unsupported Content-Type. Please use application/x-www-form-urlencoded or application/json.', 415);
  }

  // 从请求体中获取参数。需要兼容 formData (使用 .get()) 和 JSON 对象 (直接访问属性)。
  const decision = typeof bodyParams.get === 'function' ? bodyParams.get('decision') : bodyParams.decision; // 用户的决策: 'allow' 或 'deny'
  const clientId = typeof bodyParams.get === 'function' ? bodyParams.get('client_id') : bodyParams.client_id; // 第三方客户端 ID
  const grantedScopeString = typeof bodyParams.get === 'function' ? bodyParams.get('scope') : bodyParams.scope; // 用户同意授予的 scopes (字符串)
  const state = typeof bodyParams.get === 'function' ? bodyParams.get('state') : bodyParams.state; // 原始 state 参数
  const redirectUri = typeof bodyParams.get === 'function' ? bodyParams.get('redirect_uri') : bodyParams.redirect_uri; // 原始 redirect_uri
  const responseType = typeof bodyParams.get === 'function' ? bodyParams.get('response_type') : bodyParams.response_type; // 原始 response_type
  const codeChallenge = typeof bodyParams.get === 'function' ? bodyParams.get('code_challenge') : bodyParams.code_challenge; // PKCE challenge
  const codeChallengeMethod = typeof bodyParams.get === 'function' ? bodyParams.get('code_challenge_method') : bodyParams.code_challenge_method; // PKCE method

  // 验证 POST 请求中必需的参数是否存在
  if (!decision || !clientId || !grantedScopeString || !redirectUri || !responseType) {
    return errorResponseJson('Missing required form fields from consent submission: decision, client_id, scope, redirect_uri, response_type.', 400, 'invalid_request_body');
  }

  // --- 客户端和 Redirect URI 再次验证 ---
  // (Client and Redirect URI Re-validation)
  // 确保提交的 client_id 和 redirect_uri 仍然有效。
  const client = await prisma.oAuthClient.findUnique({ where: { clientId: clientId } });
  if (!client || !client.isActive) {
    return errorResponseJson('Client specified in consent form not found or is not active.', 403, 'invalid_client');
  }
  let registeredRedirectUris: string[] = [];
  try { registeredRedirectUris = JSON.parse(client.redirectUris as string); } catch (e) { /* ignore, will fail validation below */ }
  if (!AuthorizationUtils.validateRedirectUri(redirectUri, registeredRedirectUris)) {
      return errorResponseJson('Invalid redirect_uri submitted from consent form for this client.', 400, 'invalid_redirect_uri');
  }

  // 构建最终重定向回第三方客户端的 URL
  const finalRedirectUrl = new URL(redirectUri);
  if (state) finalRedirectUrl.searchParams.set('state', state); // 如果存在 state，则附加到重定向 URL

  // --- 处理用户决策 ---
  // (Process user's decision)
  if (decision === 'deny') { // 如果用户拒绝授权
    // 根据 OAuth 2.0 规范，重定向回客户端并附带 'access_denied' 错误。
    finalRedirectUrl.searchParams.set('error', 'access_denied');
    finalRedirectUrl.searchParams.set('error_description', 'The user denied access to the requested resources.');
    return NextResponse.redirect(finalRedirectUrl.toString(), 302); // 执行302重定向
  }

  if (decision === 'allow') { // 如果用户允许授权
    // 解析用户实际同意的 scopes。前端同意页面可能允许用户取消选择某些 scopes。
    const grantedScopes = ScopeUtils.parseScopes(grantedScopeString);

    // TODO: (重要) 验证 grantedScopes:
    // 1. 是否是有效的、系统中存在的 scopes。
    // 2. 是否是该客户端被允许请求的 scopes。
    // 3. 是否是原始请求的 scopes (在 GET /consent 时确定的 `requestedScopeNames`) 的子集。
    //    用户不能在同意页面上授予比原始请求更多的权限。
    //    如果验证失败，应返回错误而不是生成授权码。

    // --- 记录/更新用户的同意授权 ---
    // (Record/Update user's consent grant)
    // 使用 upsert 操作：如果用户之前已对此客户端有过同意记录，则更新；否则创建新记录。
    await prisma.consentGrant.upsert({
      where: { userId_clientId: { userId: user.id, clientId: client.id } }, // 唯一约束条件
      update: { scopes: ScopeUtils.formatScopes(grantedScopes), issuedAt: new Date(), revokedAt: null }, // 更新同意的 scopes 和时间
      create: { userId: user.id, clientId: client.id, scopes: ScopeUtils.formatScopes(grantedScopes) }, // 创建新的同意记录
    });

    // --- 生成授权码 ---
    // (Generate Authorization Code)
    const authorizationCodeValue = AuthorizationUtils.generateAuthorizationCode(); // 使用辅助函数生成安全的随机授权码
    const codeExpiresAt = addMinutes(new Date(), 10); // 设置授权码的过期时间 (例如10分钟)

    // 将授权码存储到数据库
    await prisma.authorizationCode.create({
      data: {
        code: authorizationCodeValue,
        userId: user.id,
        clientId: client.id, // 客户端的数据库 ID
        redirectUri: redirectUri, // 授权时使用的 redirect_uri
        scope: ScopeUtils.formatScopes(grantedScopes), // 用户实际同意的 scopes
        expiresAt: codeExpiresAt,
        // 存储 PKCE 相关参数，如果它们是从授权请求中传递过来的
        codeChallenge: codeChallenge || null,
        codeChallengeMethod: codeChallengeMethod || null,
      },
    });

    // --- 重定向回第三方客户端 ---
    // (Redirect back to the third-party client)
    // 将生成的授权码附加到客户端的 redirect_uri 上。
    finalRedirectUrl.searchParams.set('code', authorizationCodeValue);
    return NextResponse.redirect(finalRedirectUrl.toString(), 302); // 执行302重定向
  }

  // 如果 'decision' 参数的值不是 'allow' 或 'deny'
  return errorResponseJson('Invalid decision value submitted. Must be "allow" or "deny".', 400, 'invalid_decision');
}


// --- 导出路由处理函数 ---
// (Export route handlers)
// 使用 `requirePermission` 高阶函数包装内部处理逻辑，
// 以确保在执行核心逻辑之前，用户已通过认证中心的认证并具有 'auth-center:interact' 权限。
// 'auth-center:interact' 权限表明用户有权与认证中心的UI组件（如同意页面）进行交互。
export const GET = requirePermission('auth-center:interact')(getConsentHandlerInternal);
export const POST = requirePermission('auth-center:interact')(postConsentHandlerInternal);

// Swagger/OpenAPI 定义 (可以简化或移至专用文件，如果使用代码生成工具)
// (Swagger definitions can be simplified or moved if using a generator)
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
