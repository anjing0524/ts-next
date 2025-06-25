// app/api/oauth/authorize/route.ts
import { NextRequest, NextResponse } from 'next/server';

import { addMinutes } from 'date-fns';
import { jwtVerify, JWTPayload } from 'jose';

// import { withOAuthAuthorizeValidation, OAuthValidationResult } from '@/lib/auth';
import {
  PKCEUtils,
  ScopeUtils,
  AuthorizationUtils,
  OAuth2ErrorTypes,
} from '@/lib/auth/oauth2';
import { prisma } from '@/lib/prisma';

interface OAuthValidationResult {
  valid: boolean;
  context?: {
    client: any;
    ipAddress: string;
    userAgent: string;
    params: any;
  };
}

async function handleAuthorizeRequest(
  request: NextRequest,
  context: OAuthValidationResult['context']
): Promise<NextResponse> {
  const { client, ipAddress, userAgent, params } = context!;

  // Extract parameters (already validated by middleware)
  const client_id = params!.client_id;
  const redirect_uri = params!.redirect_uri;
  const response_type = params!.response_type;
  const scope = params!.scope || '';
  const state = params!.state;
  const code_challenge = params!.code_challenge;
  const code_challenge_method = params!.code_challenge_method;
  const nonce = params!.nonce; // For OIDC
  const max_age = params!.max_age; // Max authentication age
  const prompt = params!.prompt; // none, login, consent, select_account

  try {
    // Parse and validate scopes
    const requestedScopes = ScopeUtils.parseScopes(scope);
    const scopeValidation = await ScopeUtils.validateScopes(requestedScopes, client);

    if (!scopeValidation.valid) {
      const error = {
        error: OAuth2ErrorTypes.INVALID_SCOPE,
        error_description: `Invalid scopes: ${scopeValidation.invalidScopes.join(', ')}`,
      };

      const redirectUrl = new URL(redirect_uri);
      redirectUrl.searchParams.set('error', error.error);
      redirectUrl.searchParams.set('error_description', error.error_description);
      if (state) redirectUrl.searchParams.set('state', state);

      await AuthorizationUtils.logAuditEvent({
        clientId: client.id,
        action: 'invalid_scope',
        resource: 'oauth/authorize',
        ipAddress,
        userAgent,
        success: false,
        errorMessage: error.error_description,
        metadata: { requestedScopes, invalidScopes: scopeValidation.invalidScopes },
      });

      return NextResponse.redirect(redirectUrl.toString());
    }

    // PKCE validation
    let pkceData: { codeChallenge?: string; codeChallengeMethod?: string } = {};

    // Enforce PKCE for public clients
    if (client.clientType === 'PUBLIC') {
      if (!code_challenge || !code_challenge_method || code_challenge_method !== 'S256') {
        const error = {
          error: OAuth2ErrorTypes.INVALID_REQUEST,
          error_description: 'PKCE (code_challenge and code_challenge_method=S256) is required for public clients.',
        };

        await AuthorizationUtils.logAuditEvent({
          clientId: client.id,
          action: 'authorization_request_failed',
          resource: 'oauth/authorize',
          ipAddress,
          userAgent,
          success: false,
          errorMessage: error.error_description,
          metadata: { reason: 'Missing or invalid PKCE for public client' },
        });

        const redirectUrl = new URL(redirect_uri);
        redirectUrl.searchParams.set('error', error.error);
        redirectUrl.searchParams.set('error_description', error.error_description);
        if (state) redirectUrl.searchParams.set('state', state);

        return NextResponse.redirect(redirectUrl.toString());
      }
      // If PKCE parameters are present for a public client, they will be validated by the existing logic below.
    }

    if (code_challenge) {
      if (!code_challenge_method || code_challenge_method !== 'S256') {
        const error = {
          error: OAuth2ErrorTypes.INVALID_REQUEST,
          error_description: 'code_challenge_method must be S256',
        };

        await AuthorizationUtils.logAuditEvent({
          clientId: client.id,
          action: 'authorization_request_failed',
          resource: 'oauth/authorize',
          ipAddress,
          userAgent,
          success: false,
          errorMessage: error.error_description,
        });

        const redirectUrl = new URL(redirect_uri);
        redirectUrl.searchParams.set('error', error.error);
        redirectUrl.searchParams.set('error_description', error.error_description);
        if (state) redirectUrl.searchParams.set('state', state);

        return NextResponse.redirect(redirectUrl.toString());
      }

      if (!PKCEUtils.validateCodeChallenge(code_challenge)) {
        const error = {
          error: OAuth2ErrorTypes.INVALID_REQUEST,
          error_description: 'Invalid code_challenge format',
        };

        await AuthorizationUtils.logAuditEvent({
          clientId: client.id,
          action: 'authorization_request_failed',
          resource: 'oauth/authorize',
          ipAddress,
          userAgent,
          success: false,
          errorMessage: error.error_description,
        });

        const redirectUrl = new URL(redirect_uri);
        redirectUrl.searchParams.set('error', error.error);
        redirectUrl.searchParams.set('error_description', error.error_description);
        if (state) redirectUrl.searchParams.set('state', state);

        return NextResponse.redirect(redirectUrl.toString());
      }

      pkceData = {
        codeChallenge: code_challenge,
        codeChallengeMethod: code_challenge_method,
      };
    } else if (client.requirePkce) {
      const error = {
        error: OAuth2ErrorTypes.INVALID_REQUEST,
        error_description: 'PKCE is required for this client',
      };

      await AuthorizationUtils.logAuditEvent({
        clientId: client.id,
        action: 'authorization_request_failed',
        resource: 'oauth/authorize',
        ipAddress,
        userAgent,
        success: false,
        errorMessage: error.error_description,
      });

      const redirectUrl = new URL(redirect_uri);
      redirectUrl.searchParams.set('error', error.error);
      redirectUrl.searchParams.set('error_description', error.error_description);
      if (state) redirectUrl.searchParams.set('state', state);

      return NextResponse.redirect(redirectUrl.toString());
    }

    // TODO: User Authentication
    // This is a placeholder for user authentication logic
    // In a real implementation, you would:
    // 1. Check for existing user session
    // 2. Redirect to login page if not authenticated
    // 3. Handle max_age parameter for re-authentication
    // 4. Handle prompt parameter (none, login, consent, select_account)

    const userId = await authenticateUser(request, {
      maxAge: max_age ? parseInt(max_age) : undefined,
      prompt: prompt ?? undefined,
      clientId: client_id,
      redirectUri: redirect_uri,
      scope,
      state: state ?? undefined,
    });

    if (!userId) {
      // User not authenticated, redirect to login
      const loginUrl = new URL('/datamgr_flow/auth/login', request.url);
      loginUrl.searchParams.set('client_id', client_id);
      loginUrl.searchParams.set('redirect_uri', redirect_uri);
      loginUrl.searchParams.set('response_type', response_type);
      loginUrl.searchParams.set('scope', scope);
      if (state) loginUrl.searchParams.set('state', state);
      if (code_challenge) {
        loginUrl.searchParams.set('code_challenge', code_challenge);
        loginUrl.searchParams.set('code_challenge_method', code_challenge_method!);
      }
      if (nonce) loginUrl.searchParams.set('nonce', nonce);

      return NextResponse.redirect(loginUrl.toString());
    }

    // Check if user consent is required
    const needsConsent = await checkConsentRequired(
      userId,
      client_id,
      requestedScopes,
      client.requireConsent
    );

    if (needsConsent && prompt !== 'none') {
      // Redirect to consent page
      const consentUrl = new URL('/datamgr_flow/auth/consent', request.url);
      consentUrl.searchParams.set('client_id', client_id);
      consentUrl.searchParams.set('redirect_uri', redirect_uri);
      consentUrl.searchParams.set('response_type', response_type);
      consentUrl.searchParams.set('scope', scope);
      if (state) consentUrl.searchParams.set('state', state);
      if (code_challenge) {
        consentUrl.searchParams.set('code_challenge', code_challenge);
        consentUrl.searchParams.set('code_challenge_method', code_challenge_method!);
      }
      if (nonce) consentUrl.searchParams.set('nonce', nonce);

      return NextResponse.redirect(consentUrl.toString());
    }

    if (needsConsent && prompt === 'none') {
      // Consent required but prompt=none, return error
      const error = {
        error: OAuth2ErrorTypes.ACCESS_DENIED,
        error_description: 'User consent required',
      };

      const redirectUrl = new URL(redirect_uri);
      redirectUrl.searchParams.set('error', error.error);
      redirectUrl.searchParams.set('error_description', error.error_description);
      if (state) redirectUrl.searchParams.set('state', state);

      return NextResponse.redirect(redirectUrl.toString());
    }

    // Generate authorization code
    const authorizationCode = AuthorizationUtils.generateAuthorizationCode();
    const expiresAt = addMinutes(new Date(), 10); // Code expires in 10 minutes

    // Store authorization code
    await prisma.authorizationCode.create({
      data: {
        code: authorizationCode,
        expiresAt,
        redirectUri: redirect_uri,
        clientId: client.id,
        userId,
        scope,
        nonce: nonce ?? undefined,
        codeChallenge: pkceData.codeChallenge,
        codeChallengeMethod: pkceData.codeChallengeMethod,
      },
    });

    // Log successful authorization
    await AuthorizationUtils.logAuditEvent({
      userId,
      clientId: client.id,
      action: 'authorization_granted',
      resource: 'oauth/authorize',
      ipAddress,
      userAgent,
      success: true,
      metadata: {
        scope: requestedScopes,
        hasState: !!state,
        hasPKCE: !!code_challenge,
        hasNonce: !!nonce,
      },
    });

    // Redirect back to client with authorization code
    const redirectUrl = new URL(redirect_uri);
    redirectUrl.searchParams.set('code', authorizationCode);
    if (state) redirectUrl.searchParams.set('state', state);

    return NextResponse.redirect(redirectUrl.toString());
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await AuthorizationUtils.logAuditEvent({
      clientId: client?.id || 'null', // Client may not be available in catch block
      action: 'authorization_server_error',
      resource: 'oauth/authorize',
      ipAddress,
      userAgent,
      success: false,
      errorMessage,
    });

    console.error('Error during authorization:', error);

    // Try to redirect with error if we have a valid redirect_uri
    if (redirect_uri) {
      try {
        const errorRedirectUrl = new URL(redirect_uri);
        errorRedirectUrl.searchParams.set('error', OAuth2ErrorTypes.SERVER_ERROR);
        errorRedirectUrl.searchParams.set('error_description', 'An unexpected error occurred');
        if (state) errorRedirectUrl.searchParams.set('state', state);

        return NextResponse.redirect(errorRedirectUrl.toString());
      } catch {
        // If redirect_uri is invalid, return JSON error
      }
    }

    return NextResponse.json(
      {
        error: OAuth2ErrorTypes.SERVER_ERROR,
        error_description: 'An unexpected error occurred',
      },
      { status: 500 }
    );
  }
}

// 移除基于 session 的用户认证，改为依赖JWT进行身份验证
// Removed session-based user authentication, changed to rely on JWT for identity verification.

// 假设JWT密钥等环境变量已定义
// Assuming JWT secret and other environment variables are defined
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'your-fallback-secret-key'); // Fallback for safety, should be configured
const JWT_ISSUER = process.env.JWT_ISSUER || 'urn:example:issuer';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'urn:example:audience';

async function authenticateUser(
  request: NextRequest,
  options: {
    maxAge?: number; // 最大认证有效期（秒）Max authentication age in seconds
    prompt?: string; // OIDC prompt parameter
    clientId: string; // Client ID requesting authorization
    redirectUri: string; // Redirect URI for error reporting (in some cases)
    scope: string; // Scopes requested
    state?: string; // State parameter for error reporting
  }
): Promise<string | null> {
  // 检查 prompt=login, 如果是，则强制重新登录
  // Check for prompt=login, if so, force re-login
  if (options.prompt === 'login') {
    // 用户请求强制登录，忽略现有JWT
    // User requests forced login, ignore existing JWT
    return null;
  }

  const token = request.cookies.get('auth_token')?.value;

  if (!token) {
    // 没有JWT存在
    // No JWT present
    if (options.prompt === 'none') {
      // 对于 prompt=none，如果无有效JWT，则表示登录失败或需要交互
      // For prompt=none, if no valid JWT, it indicates login failure or interaction required
      // 根据OIDC规范，可以返回 login_required 错误
      // According to OIDC spec, can return login_required error
      // 此处返回 null，上层逻辑会重定向到登录页面或根据redirect_uri返回错误
      // Returning null here, upper logic will redirect to login or return error based on redirect_uri
      return null;
    }
    // 对于其他情况，没有JWT则需要登录
    // For other cases, no JWT means login is required
    return null;
  }

  try {
    // 验证JWT
    // Verify the JWT
    const { payload }: { payload: JWTPayload } = await jwtVerify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

    const userId = payload.sub; // 从JWT的sub声明中获取用户ID
    // Get user ID from JWT's sub claim

    if (!userId) {
      // JWT中没有用户ID
      // No user ID in JWT
      console.error('JWT verification successful, but sub (user ID) claim is missing.');
      return null;
    }

    // 处理 max_age 参数
    // Handle max_age parameter
    if (options.maxAge !== undefined && payload.iat) {
      const authTime = payload.iat; // JWT的iat (issued at) 声明，单位为秒
      // JWT's iat (issued at) claim, in seconds
      const maxAgeSec = options.maxAge;
      const currentTimeSec = Math.floor(Date.now() / 1000);

      if (currentTimeSec - authTime > maxAgeSec) {
        // 认证时间过久，需要重新认证
        // Authentication is too old, re-authentication required
        // 如果 prompt=none，则返回错误或null
        // If prompt=none, return error or null
        if (options.prompt === 'none') {
          // OIDC prompt=none: if authentication is too old, it's an error
          // For simplicity, returning null; the caller handles redirection or error response.
          return null;
        }
        return null; // 触发重新登录
        // Trigger re-login
      }
    }

    // 如果 prompt=none 且JWT有效且满足max_age，则返回用户ID
    // If prompt=none and JWT is valid and max_age is satisfied, return user ID
    if (options.prompt === 'none') {
      return userId;
    }

    // 对于其他 prompt 值或没有 prompt，只要JWT有效且满足max_age，就返回用户ID
    // For other prompt values or no prompt, as long as JWT is valid and max_age is satisfied, return user ID
    return userId;
  } catch (error) {
    // JWT验证失败 (例如过期、签名无效等)
    // JWT verification failed (e.g., expired, invalid signature)
    console.error('JWT verification failed:', error);
    if (options.prompt === 'none') {
      // 对于 prompt=none，验证失败意味着无法静默认证
      // For prompt=none, verification failure means silent authentication is not possible
      return null;
    }
    // 其他情况，验证失败则需要登录
    // Other cases, verification failure means login is required
    return null;
  }
}

// Check if user consent is required
async function checkConsentRequired(
  userId: string,
  clientIdFromRequest: string, // Renamed to avoid conflict with OAuthClient.id
  requestedScopes: string[],
  clientRequiresConsent: boolean // This comes from OAuthClient.requireConsent
): Promise<boolean> {
  // If client doesn't require consent (e.g., first-party app or specific setting), skip consent.
  if (!clientRequiresConsent) {
    return false;
  }

  // Find the OAuthClient to get its actual ID if we only have clientId string
  // This step might be redundant if 'client' object passed to authorize handler already has the DB ID.
  // For now, assuming clientIdFromRequest is the actual client's unique ID string from DB.
  // If not, it should be fetched:
  // const oauthClient = await prisma.oAuthClient.findUnique({ where: { clientId: clientIdFromRequest }});
  // if (!oauthClient) return true; // Or handle as error: client not found
  // const actualClientId = oauthClient.id;

  const existingConsent = await prisma.consentGrant.findUnique({
    where: {
      userId_clientId: {
        // This is the @@unique constraint name
        userId: userId,
        clientId: clientIdFromRequest, // Use the ID of the client model
      },
      revokedAt: null, // Check if consent has not been revoked
    },
  });

  if (!existingConsent) {
    return true; // No existing valid consent
  }

  // Check if consent has expired (if expiresAt is set)
  if (existingConsent.expiresAt && existingConsent.expiresAt < new Date()) {
    return true; // Consent has expired
  }

  // Check if all requested scopes are covered by the existing grant
  let grantedScopes: string[] = [];
  try {
    grantedScopes = JSON.parse(existingConsent.scopes);
    if (!Array.isArray(grantedScopes)) grantedScopes = [];
  } catch {
    // Invalid JSON in DB, treat as no scopes granted or log error
    console.error('Invalid JSON in ConsentGrant.scopes for grant ID:', existingConsent.id);
    return true; // Requires re-consent if scopes are malformed
  }

  const allRequestedScopesCovered = requestedScopes.every((scope) => grantedScopes.includes(scope));

  return !allRequestedScopesCovered; // True if not all scopes are covered (i.e., consent is required)
}

export const GET = handleAuthorizeRequest;
