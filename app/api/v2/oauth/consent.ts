import { NextRequest, NextResponse } from 'next/server';

import { jwtVerify, JWTPayload } from 'jose'; // 引入JWT验证相关的模块

import { AuthorizationUtils, OAuth2ErrorTypes, ScopeUtils } from '@/lib/auth/oauth2';
// import { validateSession } from '@/lib/auth/session'; // To validate user's current session // 移除 session 验证
import { prisma } from '@/lib/prisma';

// 定义JWT相关的常量，与 authorize/route.ts 中保持一致
// Define JWT related constants, consistent with authorize/route.ts
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'your-fallback-secret-key');
const JWT_ISSUER = process.env.JWT_ISSUER || 'urn:example:issuer';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'urn:example:audience';

interface ConsentFormData {
  decision?: 'approve' | 'deny';
  client_id: string;
  redirect_uri: string;
  scope: string; // Original requested scopes string
  state?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  nonce?: string;
  // Potentially other original OAuth params if needed
}

export async function POST(request: NextRequest) {
  const ipAddress = request.headers.get('x-forwarded-for') || undefined;
  const userAgent = request.headers.get('user-agent') || undefined;

  // 1. 验证用户JWT // 1. Validate user JWT
  // const sessionContext = await validateSession(request); // 旧的 session 验证方式 // Old session validation method
  let userId: string;
  const token = request.cookies.get('auth_token')?.value;

  if (!token) {
    // 如果没有 token，返回401错误
    // If no token, return 401 error
    await AuthorizationUtils.logAuditEvent({
      // 记录审计事件时userId未知
      action: 'consent_page_access_denied_no_token',
      ipAddress,
      userAgent,
      success: false,
      errorMessage: 'Access to consent page denied: no auth_token cookie.',
    });
    return NextResponse.json(
      { error: 'User authentication required. No token found.' },
      { status: 401 }
    );
  }

  try {
    const { payload }: { payload: JWTPayload } = await jwtVerify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    if (!payload.sub) {
      // JWT中没有用户ID
      // No user ID in JWT
      await AuthorizationUtils.logAuditEvent({
        // userId未知
        action: 'consent_page_jwt_invalid_sub',
        ipAddress,
        userAgent,
        success: false,
        errorMessage: 'Access to consent page denied: JWT sub claim missing.',
      });
      return NextResponse.json(
        { error: 'Invalid token: User identifier missing.' },
        { status: 401 }
      );
    }
    userId = payload.sub; // 从JWT中获取用户ID // Get user ID from JWT
  } catch (error) {
    // JWT验证失败
    // JWT verification failed
    console.error('Consent page JWT verification failed:', error);
    await AuthorizationUtils.logAuditEvent({
      // userId未知或无效
      action: 'consent_page_jwt_verification_failed',
      ipAddress,
      userAgent,
      success: false,
      errorMessage: `JWT verification failed on consent page: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
    return NextResponse.json(
      { error: 'User authentication failed. Invalid token.' },
      { status: 401 }
    );
  }

  // const { user } = sessionContext; // 旧代码，user对象现在从JWT中提取ID得到 // Old code, user object's ID is now extracted from JWT

  // 2. Parse form data
  let formData: ConsentFormData;
  try {
    const rawFormData = await request.formData();
    formData = Object.fromEntries(rawFormData.entries()) as unknown as ConsentFormData;
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const {
    decision,
    client_id,
    redirect_uri,
    scope: requestedScopeString,
    state,
    code_challenge,
    code_challenge_method,
    nonce,
  } = formData;

  if (!decision || !client_id || !redirect_uri || !requestedScopeString) {
    return NextResponse.json(
      { error: 'Missing required form fields (decision, client_id, redirect_uri, scope).' },
      { status: 400 }
    );
  }

  // Fetch the OAuth client to get its actual DB ID (if client_id from form is the string identifier)
  // and to validate redirect_uri
  const oauthClient = await prisma.oAuthClient.findUnique({ where: { clientId: client_id } });
  if (!oauthClient) {
    // Log this attempt, client_id might be tampered with
    await AuthorizationUtils.logAuditEvent({
      userId: userId, // 使用从JWT获取的userId // Use userId obtained from JWT
      action: 'consent_decision_invalid_client',
      ipAddress,
      userAgent,
      success: false,
      errorMessage: `Consent decision for unknown client_id: ${client_id}`,
    });
    return NextResponse.json({ error: 'Invalid client_id' }, { status: 400 });
  }

  // Basic validation of redirect_uri against registered ones (simplified)
  const registeredUris = JSON.parse(oauthClient.redirectUris || '[]');
  if (!registeredUris.includes(redirect_uri)) {
    await AuthorizationUtils.logAuditEvent({
      userId: userId,
      clientId: oauthClient.id, // 使用从JWT获取的userId // Use userId obtained from JWT
      action: 'consent_decision_invalid_redirect_uri',
      ipAddress,
      userAgent,
      success: false,
      errorMessage: `Consent decision with invalid redirect_uri: ${redirect_uri}`,
    });
    return NextResponse.json({ error: 'Invalid redirect_uri' }, { status: 400 });
  }

  if (decision === 'approve') {
    const approvedScopes = ScopeUtils.parseScopes(requestedScopeString); // Use the originally requested scopes

    // Store/update consent grant
    // 更新同意授权记录，使用从JWT获取的userId
    // Update consent grant record, using userId obtained from JWT
    await prisma.consentGrant.upsert({
      where: {
        userId_clientId: { userId: userId, clientId: oauthClient.id },
      },
      update: {
        scopes: JSON.stringify(approvedScopes),
        issuedAt: new Date(),
        expiresAt: null, // Or set an expiration policy, e.g., 1 year from now
        revokedAt: null,
      },
      create: {
        userId: userId, // 使用从JWT获取的userId // Use userId obtained from JWT
        clientId: oauthClient.id,
        scopes: JSON.stringify(approvedScopes),
        issuedAt: new Date(),
        expiresAt: null, // Or set an expiration policy
      },
    });

    await AuthorizationUtils.logAuditEvent({
      userId: userId, // 使用从JWT获取的userId // Use userId obtained from JWT
      clientId: oauthClient.id,
      action: 'consent_approved',
      ipAddress,
      userAgent,
      success: true,
      metadata: { scopes: approvedScopes },
    });

    // Redirect back to the /api/oauth/authorize endpoint with original parameters
    // The authorize endpoint will re-check consent, find it, and issue the code.
    const authorizeUrl = new URL('/api/oauth/authorize', request.nextUrl.origin);
    authorizeUrl.searchParams.set('client_id', client_id);
    authorizeUrl.searchParams.set('redirect_uri', redirect_uri);
    authorizeUrl.searchParams.set('response_type', 'code'); // Assuming 'code' for now, should come from original req
    authorizeUrl.searchParams.set('scope', requestedScopeString);
    if (state) authorizeUrl.searchParams.set('state', state);
    if (code_challenge) authorizeUrl.searchParams.set('code_challenge', code_challenge);
    if (code_challenge_method)
      authorizeUrl.searchParams.set('code_challenge_method', code_challenge_method);
    if (nonce) authorizeUrl.searchParams.set('nonce', nonce);
    // Crucially, also pass prompt=none or some other indicator if the original authorize request should not prompt again.
    // However, the simplest is just to let it re-evaluate.

    return NextResponse.redirect(authorizeUrl.toString());
  } else {
    // Decision is 'deny' or anything else
    await AuthorizationUtils.logAuditEvent({
      userId: userId, // 使用从JWT获取的userId // Use userId obtained from JWT
      clientId: oauthClient.id,
      action: 'consent_denied',
      ipAddress,
      userAgent,
      success: true, // Action was successful (denial was processed)
      metadata: { scopes: ScopeUtils.parseScopes(requestedScopeString) },
    });

    // Redirect to client's redirect_uri with error
    const errorRedirectUrl = new URL(redirect_uri);
    errorRedirectUrl.searchParams.set('error', OAuth2ErrorTypes.ACCESS_DENIED);
    if (state) errorRedirectUrl.searchParams.set('state', state);

    return NextResponse.redirect(errorRedirectUrl.toString());
  }
}
