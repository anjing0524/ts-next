// app/api/oauth/token/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma'; // Use Prisma singleton
import crypto from 'crypto';
import { addHours, addDays, differenceInSeconds, isPast } from 'date-fns';
import * as jose from 'jose';
import logger from '@/utils/logger'; // Assuming logger is available
import { 
  PKCEUtils, 
  JWTUtils, 
  ClientAuthUtils, 
  AuthorizationUtils, 
  OAuth2ErrorTypes,
  RateLimitUtils 
} from '@/lib/auth/oauth2';
import { withCORS } from '@/lib/auth/middleware';

// const prisma = new PrismaClient(); // Removed: Use imported singleton

// Helper function to construct the token endpoint URL
function getTokenEndpointUrl(request: NextRequest): string {
  const requestUrl = new URL(request.url);
  // Prefer X-Forwarded-Proto and X-Forwarded-Host if behind a proxy
  const protocol = request.headers.get('x-forwarded-proto') || requestUrl.protocol.slice(0, -1);
  const host = request.headers.get('x-forwarded-host') || requestUrl.host;
  return `${protocol}://${host}/api/oauth/token`;
}

// PKCE S256 Verification Helper
function verifyPkceChallenge(verifier: string, challenge: string): boolean {
  if (!verifier || !challenge) {
    logger.debug("PKCE verifyPkceChallenge: called with empty verifier or challenge.");
    return false;
  }
  const calculatedChallenge = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url'); 

  logger.debug(`PKCE verifyPkceChallenge: Verifier: "${verifier}", Stored Challenge: "${challenge}", Calculated Challenge: "${calculatedChallenge}"`);
  return calculatedChallenge === challenge;
}

async function handleTokenRequest(request: NextRequest): Promise<NextResponse> {
  // Rate limiting
  const rateLimitKey = RateLimitUtils.getRateLimitKey(request, 'ip');
  if (RateLimitUtils.isRateLimited(rateLimitKey, 100, 60000)) { // 100 requests per minute
    return NextResponse.json(
      { 
        error: OAuth2ErrorTypes.TEMPORARILY_UNAVAILABLE,
        error_description: 'Rate limit exceeded' 
      },
      { status: 429 }
    );
  }

  let body: FormData;
  try {
    body = await request.formData();
  } catch (error) {
    await AuthorizationUtils.logAuditEvent({
      action: 'token_request_parse_error',
      resource: 'oauth/token',
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
      success: false,
      errorMessage: 'Failed to parse request body',
    });

    return NextResponse.json(
      { 
        error: OAuth2ErrorTypes.INVALID_REQUEST,
        error_description: 'Failed to parse request body. Ensure it is application/x-www-form-urlencoded.' 
      },
      { status: 400 }
    );
  }

  const grant_type = body.get('grant_type') as string;
  const ipAddress = request.headers.get('x-forwarded-for') || undefined;
  const userAgent = request.headers.get('user-agent') || undefined;

  // Validate grant type
  if (grant_type !== 'authorization_code' && grant_type !== 'refresh_token' && grant_type !== 'client_credentials') {
    await AuthorizationUtils.logAuditEvent({
      action: 'unsupported_grant_type',
      resource: 'oauth/token',
      ipAddress,
      userAgent,
      success: false,
      errorMessage: `Unsupported grant type: ${grant_type}`,
    });

    return NextResponse.json(
      { 
        error: OAuth2ErrorTypes.UNSUPPORTED_GRANT_TYPE,
        error_description: 'Supported grant types: authorization_code, refresh_token, client_credentials' 
      },
      { status: 400 }
    );
  }

  // Authenticate client
  const clientAuth = await ClientAuthUtils.authenticateClient(request, body);
  
  if (!clientAuth.client) {
    await AuthorizationUtils.logAuditEvent({
      action: 'client_authentication_failed',
      resource: 'oauth/token',
      ipAddress,
      userAgent,
      success: false,
      errorMessage: clientAuth.error?.error_description,
    });

    return NextResponse.json(clientAuth.error, { status: 401 });
  }

  const client = clientAuth.client;

  try {
    // Handle different grant types
    switch (grant_type) {
      case 'authorization_code':
        return await handleAuthorizationCodeGrant(body, client, ipAddress, userAgent);
      
      case 'refresh_token':
        return await handleRefreshTokenGrant(body, client, ipAddress, userAgent);
      
      case 'client_credentials':
        return await handleClientCredentialsGrant(body, client, ipAddress, userAgent);
      
      default:
        return NextResponse.json(
          { 
            error: OAuth2ErrorTypes.UNSUPPORTED_GRANT_TYPE,
            error_description: 'Grant type not implemented' 
          },
          { status: 400 }
        );
    }

  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    await AuthorizationUtils.logAuditEvent({
      clientId: client.id,
      action: 'token_issuance_error',
      resource: 'oauth/token',
      ipAddress,
      userAgent,
      success: false,
      errorMessage,
    });

    console.error('Error during token issuance:', error);
    
    return NextResponse.json(
      { 
        error: OAuth2ErrorTypes.SERVER_ERROR,
        error_description: 'An unexpected error occurred' 
      },
      { status: 500 }
    );
  }
}

async function handleAuthorizationCodeGrant(
  body: FormData,
  client: any,
  ipAddress?: string,
  userAgent?: string
): Promise<NextResponse> {
  const code = body.get('code') as string;
  const redirect_uri = body.get('redirect_uri') as string;
  const code_verifier = body.get('code_verifier') as string;

  if (!code || !redirect_uri) {
    return NextResponse.json(
      { 
        error: OAuth2ErrorTypes.INVALID_REQUEST,
        error_description: 'Missing required parameters: code, redirect_uri' 
      },
      { status: 400 }
    );
  }

  // Find authorization code
  const authCode = await prisma.authorizationCode.findUnique({
    where: { code },
    include: { user: true },
  });

  if (!authCode) {
    await AuthorizationUtils.logAuditEvent({
      clientId: client.id,
      action: 'invalid_authorization_code',
      resource: 'oauth/token',
      ipAddress,
      userAgent,
      success: false,
      errorMessage: 'Authorization code not found',
    });

    return NextResponse.json(
      { 
        error: OAuth2ErrorTypes.INVALID_GRANT,
        error_description: 'Authorization code not found' 
      },
      { status: 400 }
    );
  }

  // Check if code has expired
  if (isPast(authCode.expiresAt)) {
    await prisma.authorizationCode.delete({ where: { id: authCode.id } });
    
    await AuthorizationUtils.logAuditEvent({
      clientId: client.id,
      action: 'expired_authorization_code',
      resource: 'oauth/token',
      ipAddress,
      userAgent,
      success: false,
      errorMessage: 'Authorization code has expired',
    });

    return NextResponse.json(
      { 
        error: OAuth2ErrorTypes.INVALID_GRANT,
        error_description: 'Authorization code has expired' 
      },
      { status: 400 }
    );
  }

  // Check if code was already used
  if (authCode.used) {
    await prisma.authorizationCode.delete({ where: { id: authCode.id } });
    
    await AuthorizationUtils.logAuditEvent({
      clientId: client.id,
      action: 'authorization_code_reuse',
      resource: 'oauth/token',
      ipAddress,
      userAgent,
      success: false,
      errorMessage: 'Authorization code was already used',
    });

    return NextResponse.json(
      { 
        error: OAuth2ErrorTypes.INVALID_GRANT,
        error_description: 'Authorization code was already used' 
      },
      { status: 400 }
    );
  }

  // Validate client
  if (authCode.clientId !== client.id) {
    await AuthorizationUtils.logAuditEvent({
      clientId: client.id,
      action: 'authorization_code_client_mismatch',
      resource: 'oauth/token',
      ipAddress,
      userAgent,
      success: false,
      errorMessage: 'Authorization code was not issued to this client',
    });

    return NextResponse.json(
      { 
        error: OAuth2ErrorTypes.INVALID_GRANT,
        error_description: 'Authorization code was not issued to this client' 
      },
      { status: 400 }
    );
  }

  // Validate redirect URI
  if (authCode.redirectUri !== redirect_uri) {
    await AuthorizationUtils.logAuditEvent({
      clientId: client.id,
      action: 'redirect_uri_mismatch',
      resource: 'oauth/token',
      ipAddress,
      userAgent,
      success: false,
      errorMessage: 'Redirect URI mismatch',
    });

    return NextResponse.json(
      { 
        error: OAuth2ErrorTypes.INVALID_GRANT,
        error_description: 'Invalid redirect_uri. It must match the one used in the authorization request' 
      },
      { status: 400 }
    );
  }

  // PKCE validation
  if (authCode.codeChallenge && authCode.codeChallengeMethod) {
    if (!code_verifier) {
      await prisma.authorizationCode.delete({ where: { id: authCode.id } });
      
      return NextResponse.json(
        { 
          error: OAuth2ErrorTypes.INVALID_GRANT,
          error_description: 'Missing code_verifier for PKCE flow' 
        },
        { status: 400 }
      );
    }

    if (!PKCEUtils.verifyCodeChallenge(code_verifier, authCode.codeChallenge, authCode.codeChallengeMethod)) {
      await prisma.authorizationCode.delete({ where: { id: authCode.id } });
      
      await AuthorizationUtils.logAuditEvent({
        clientId: client.id,
        userId: authCode.userId || undefined,
        action: 'pkce_verification_failed',
        resource: 'oauth/token',
        ipAddress,
        userAgent,
        success: false,
        errorMessage: 'Invalid code_verifier',
      });

      return NextResponse.json(
        { 
          error: OAuth2ErrorTypes.INVALID_GRANT,
          error_description: 'Invalid code_verifier' 
        },
        { status: 400 }
      );
    }
  } else if (code_verifier) {
    return NextResponse.json(
      { 
        error: OAuth2ErrorTypes.INVALID_REQUEST,
        error_description: 'code_verifier provided but no PKCE challenge was initiated' 
      },
      { status: 400 }
    );
  }

  // Generate tokens
  const accessTokenExpiresAt = addHours(new Date(), 1);
  const refreshTokenExpiresAt = addDays(new Date(), 30);

  // Get user permissions if user is present
  let permissions: string[] = [];
  if (authCode.userId) {
    const userPermissions = await prisma.userResourcePermission.findMany({
      where: { 
        userId: authCode.userId,
        isActive: true,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      include: { resource: true, permission: true },
    });
    permissions = userPermissions.map((urp: any) => `${urp.resource.name}:${urp.permission.name}`);
  }

  // Create JWT access token
  const accessToken = await JWTUtils.createAccessToken({
    client_id: client.clientId,
    user_id: authCode.userId || undefined,
    scope: authCode.scope || undefined,
    permissions,
    exp: '1h',
  });

  // Generate refresh token
  const refreshToken = crypto.randomBytes(32).toString('hex');
  const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

  // Store tokens in database
  const [accessTokenRecord, refreshTokenRecord] = await Promise.all([
    prisma.accessToken.create({
      data: {
        token: accessToken,
        tokenHash: crypto.createHash('sha256').update(accessToken).digest('hex'),
        expiresAt: accessTokenExpiresAt,
        userId: authCode.userId,
        clientId: client.id,
        scope: authCode.scope,
      },
    }),
    prisma.refreshToken.create({
      data: {
        token: refreshToken,
        tokenHash: refreshTokenHash,
        expiresAt: refreshTokenExpiresAt,
        userId: authCode.userId,
        clientId: client.id,
        scope: authCode.scope,
      },
    }),
  ]);

  // Mark authorization code as used and delete it
  await prisma.authorizationCode.delete({ where: { id: authCode.id } });

  // Create ID token if openid scope is requested
  let idToken: string | undefined;
  if (authCode.scope?.includes('openid') && authCode.user) {
    idToken = await JWTUtils.createIdToken(authCode.user, client, authCode.nonce || undefined);
  }

  // Log successful token issuance
  await AuthorizationUtils.logAuditEvent({
    userId: authCode.userId || undefined,
    clientId: client.id,
    action: 'tokens_issued',
    resource: 'oauth/token',
    ipAddress,
    userAgent,
    success: true,
    metadata: {
      grantType: 'authorization_code',
      scope: authCode.scope,
      hasIdToken: !!idToken,
    },
  });

  const tokenResponse: any = {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: differenceInSeconds(accessTokenExpiresAt, new Date()),
    refresh_token: refreshToken,
    scope: authCode.scope,
  };

  if (idToken) {
    tokenResponse.id_token = idToken;
  }

  return NextResponse.json(tokenResponse);
}

async function handleRefreshTokenGrant(
  body: FormData,
  client: any,
  ipAddress?: string,
  userAgent?: string
): Promise<NextResponse> {
  const refresh_token = body.get('refresh_token') as string;
  const scope = body.get('scope') as string;

  if (!refresh_token) {
    return NextResponse.json(
      { 
        error: OAuth2ErrorTypes.INVALID_REQUEST,
        error_description: 'Missing required parameter: refresh_token' 
      },
      { status: 400 }
    );
  }

  // Find refresh token
  const refreshTokenHash = crypto.createHash('sha256').update(refresh_token).digest('hex');
  const refreshTokenRecord = await prisma.refreshToken.findUnique({
    where: { tokenHash: refreshTokenHash },
    include: { user: true },
  });

  if (!refreshTokenRecord) {
    await AuthorizationUtils.logAuditEvent({
      clientId: client.id,
      action: 'invalid_refresh_token',
      resource: 'oauth/token',
      ipAddress,
      userAgent,
      success: false,
      errorMessage: 'Refresh token not found',
    });

    return NextResponse.json(
      { 
        error: OAuth2ErrorTypes.INVALID_GRANT,
        error_description: 'Invalid refresh token' 
      },
      { status: 400 }
    );
  }

  // Check if token has expired
  if (isPast(refreshTokenRecord.expiresAt)) {
    await prisma.refreshToken.delete({ where: { id: refreshTokenRecord.id } });
    
    return NextResponse.json(
      { 
        error: OAuth2ErrorTypes.INVALID_GRANT,
        error_description: 'Refresh token has expired' 
      },
      { status: 400 }
    );
  }

  // Check if token is revoked
  if (refreshTokenRecord.revoked) {
    return NextResponse.json(
      { 
        error: OAuth2ErrorTypes.INVALID_GRANT,
        error_description: 'Refresh token has been revoked' 
      },
      { status: 400 }
    );
  }

  // Validate client
  if (refreshTokenRecord.clientId !== client.id) {
    return NextResponse.json(
      { 
        error: OAuth2ErrorTypes.INVALID_GRANT,
        error_description: 'Refresh token was not issued to this client' 
      },
      { status: 400 }
    );
  }

  // Determine scope for new tokens
  const tokenScope = scope || refreshTokenRecord.scope;

  // Generate new tokens
  const accessTokenExpiresAt = addHours(new Date(), 1);
  const newRefreshTokenExpiresAt = addDays(new Date(), 30);

  // Get user permissions
  let permissions: string[] = [];
  if (refreshTokenRecord.userId) {
    const userPermissions = await prisma.userResourcePermission.findMany({
      where: { 
        userId: refreshTokenRecord.userId,
        isActive: true,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      include: { resource: true, permission: true },
    });
    permissions = userPermissions.map((urp: any) => `${urp.resource.name}:${urp.permission.name}`);
  }

  // Create new access token
  const newAccessToken = await JWTUtils.createAccessToken({
    client_id: client.clientId,
    user_id: refreshTokenRecord.userId || undefined,
    scope: tokenScope || undefined,
    permissions,
    exp: '1h',
  });

  // Generate new refresh token
  const newRefreshToken = crypto.randomBytes(32).toString('hex');

  // Store new tokens and revoke old refresh token
  await Promise.all([
    prisma.accessToken.create({
      data: {
        token: newAccessToken,
        tokenHash: crypto.createHash('sha256').update(newAccessToken).digest('hex'),
        expiresAt: accessTokenExpiresAt,
        userId: refreshTokenRecord.userId,
        clientId: client.id,
        scope: tokenScope,
      },
    }),
    prisma.refreshToken.create({
      data: {
        token: newRefreshToken,
        tokenHash: crypto.createHash('sha256').update(newRefreshToken).digest('hex'),
        expiresAt: newRefreshTokenExpiresAt,
        userId: refreshTokenRecord.userId,
        clientId: client.id,
        scope: tokenScope,
      },
    }),
    prisma.refreshToken.update({
      where: { id: refreshTokenRecord.id },
      data: { revoked: true, revokedAt: new Date() },
    }),
  ]);

  // Log successful token refresh
  await AuthorizationUtils.logAuditEvent({
    userId: refreshTokenRecord.userId || undefined,
    clientId: client.id,
    action: 'tokens_refreshed',
    resource: 'oauth/token',
    ipAddress,
    userAgent,
    success: true,
    metadata: {
      grantType: 'refresh_token',
      scope: tokenScope,
    },
  });

  return NextResponse.json({
    access_token: newAccessToken,
    token_type: 'Bearer',
    expires_in: differenceInSeconds(accessTokenExpiresAt, new Date()),
    refresh_token: newRefreshToken,
    scope: tokenScope,
  });
}

async function handleClientCredentialsGrant(
  body: FormData,
  client: any,
  ipAddress?: string,
  userAgent?: string
): Promise<NextResponse> {
  const scope = body.get('scope') as string;

  // Client credentials flow is for machine-to-machine authentication
  // No user context involved

  // Generate access token
  const accessTokenExpiresAt = addHours(new Date(), 1);

  const accessToken = await JWTUtils.createAccessToken({
    client_id: client.clientId,
    scope: scope || undefined,
    permissions: [], // No user permissions for client credentials
    exp: '1h',
  });

  // Store access token
  await prisma.accessToken.create({
    data: {
      token: accessToken,
      tokenHash: crypto.createHash('sha256').update(accessToken).digest('hex'),
      expiresAt: accessTokenExpiresAt,
      clientId: client.id,
      scope: scope,
      // No userId for client credentials flow
    },
  });

  // Log successful token issuance
  await AuthorizationUtils.logAuditEvent({
    clientId: client.id,
    action: 'client_credentials_token_issued',
    resource: 'oauth/token',
    ipAddress,
    userAgent,
    success: true,
    metadata: {
      grantType: 'client_credentials',
      scope: scope,
    },
  });

  return NextResponse.json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: differenceInSeconds(accessTokenExpiresAt, new Date()),
    scope: scope,
    // No refresh token for client credentials flow
  });
}

export const POST = withCORS(handleTokenRequest);
