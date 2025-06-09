// app/api/oauth/token/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import * as crypto from 'crypto';
import { addHours, addDays, isPast } from 'date-fns';
import { 
  JWTUtils, 
  AuthorizationUtils, 
  OAuth2ErrorTypes,
  ScopeUtils
} from '@/lib/auth/oauth2';
import { withOAuthTokenValidation, OAuthValidationResult } from '@/lib/auth/middleware';

// PKCE S256 Verification Helper
function verifyPkceChallenge(verifier: string, challenge: string): boolean {
  if (!verifier || !challenge) {
    console.debug("PKCE verifyPkceChallenge: called with empty verifier or challenge.");
    return false;
  }
  const calculatedChallenge = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url'); 

  console.debug(`PKCE verifyPkceChallenge: Verifier: "${verifier}", Stored Challenge: "${challenge}", Calculated Challenge: "${calculatedChallenge}"`);
  return calculatedChallenge === challenge;
}

async function handleTokenRequest(request: NextRequest, context: OAuthValidationResult['context']): Promise<NextResponse> {
  const { body, client, ipAddress, userAgent, params } = context!;
  const grant_type = params!.grant_type;

  try {
    // Handle different grant types
    switch (grant_type) {
      case 'authorization_code':
        return await handleAuthorizationCodeGrant(request, body!, client, ipAddress, userAgent);
      
      case 'refresh_token':
        return await handleRefreshTokenGrant(request, body!, client, ipAddress, userAgent);
      
      case 'client_credentials':
        return await handleClientCredentialsGrant(request, body!, client, ipAddress, userAgent);
      
      default:
        return NextResponse.json(
          { 
            error: OAuth2ErrorTypes.UNSUPPORTED_GRANT_TYPE,
            error_description: 'Grant type not implemented' 
          },
          { status: 400 }
        );
    }

  } catch (error: unknown) {
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
  request: NextRequest,
  body: FormData,
  client: Record<string, unknown>,
  ipAddress?: string,
  userAgent?: string
): Promise<NextResponse> {
  const code = (body.get('code') ?? undefined) as string | undefined;
  const redirect_uri = (body.get('redirect_uri') ?? undefined) as string | undefined;
  const code_verifier = (body.get('code_verifier') ?? undefined) as string | undefined;

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
      clientId: client.id as string,
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
        error_description: 'Invalid authorization code' 
      },
      { status: 400 }
    );
  }

  // Validate authorization code expiry
  if (isPast(authCode.expiresAt)) {
    await AuthorizationUtils.logAuditEvent({
      clientId: client.id as string,
      action: 'expired_authorization_code',
      resource: 'oauth/token',
      ipAddress,
      userAgent,
      success: false,
      errorMessage: 'Authorization code expired',
    });

    return NextResponse.json(
      { 
        error: OAuth2ErrorTypes.INVALID_GRANT,
        error_description: 'Authorization code has expired' 
      },
      { status: 400 }
    );
  }

  // Validate client match
  if (authCode.clientId !== (client.id as string)) {
    await AuthorizationUtils.logAuditEvent({
      clientId: client.id as string,
      action: 'authorization_code_client_mismatch',
      resource: 'oauth/token',
      ipAddress,
      userAgent,
      success: false,
      errorMessage: 'Authorization code was issued to a different client',
    });

    return NextResponse.json(
      { 
        error: OAuth2ErrorTypes.INVALID_GRANT,
        error_description: 'Authorization code was issued to a different client' 
      },
      { status: 400 }
    );
  }

  // Validate redirect URI match
  if (authCode.redirectUri !== redirect_uri) {
    await AuthorizationUtils.logAuditEvent({
      clientId: client.id as string,
      userId: authCode.userId ?? undefined,
      action: 'redirect_uri_mismatch',
      resource: 'oauth/token',
      ipAddress,
      userAgent,
      success: false,
      errorMessage: 'Redirect URI does not match',
    });

    return NextResponse.json(
      { 
        error: OAuth2ErrorTypes.INVALID_GRANT,
        error_description: 'Redirect URI does not match' 
      },
      { status: 400 }
    );
  }

  // PKCE verification (if used)
  if (authCode.codeChallenge) {
    if (!code_verifier) {
      return NextResponse.json(
        { 
          error: OAuth2ErrorTypes.INVALID_REQUEST,
          error_description: 'Code verifier required for PKCE' 
        },
        { status: 400 }
      );
    }

    const isValidPkce = verifyPkceChallenge(code_verifier, authCode.codeChallenge);
    if (!isValidPkce) {
      await AuthorizationUtils.logAuditEvent({
        clientId: client.id as string,
        userId: authCode.userId ?? undefined,
        action: 'pkce_verification_failed',
        resource: 'oauth/token',
        ipAddress,
        userAgent,
        success: false,
        errorMessage: 'PKCE verification failed',
      });

      return NextResponse.json(
        { 
          error: OAuth2ErrorTypes.INVALID_GRANT,
          error_description: 'PKCE verification failed' 
        },
        { status: 400 }
      );
    }
  }

  // Mark authorization code as used to prevent replay
  await prisma.authorizationCode.update({
    where: { id: authCode.id },
    data: { used: true },
  });

  try {
    // Generate tokens
    const expiresIn = 3600; // 1 hour

    // Get permissions if user is involved
    let permissions: string[] = [];
    if (authCode.userId) {
      permissions = await AuthorizationUtils.getUserPermissions(authCode.userId);
    }

    // Create JWT payload
    const accessToken = await JWTUtils.createAccessToken({
      client_id: client.clientId as string,
      user_id: authCode.userId ?? undefined,
      scope: authCode.scope ?? undefined,
      permissions,
    });

    const refreshToken = await JWTUtils.createRefreshToken({
      client_id: client.clientId as string,
      user_id: authCode.userId ?? undefined,
      scope: authCode.scope ?? undefined,
    });

    const accessTokenHash = crypto.createHash('sha256').update(accessToken).digest('hex');
    const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    // Store tokens in database
    await prisma.accessToken.create({
      data: {
        token: accessToken,
        tokenHash: accessTokenHash,
        clientId: client.id as string,
        userId: authCode.userId ?? undefined,
        scope: authCode.scope ?? undefined,
        expiresAt: addHours(new Date(), 1),
        revoked: false,
      },
    });

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        tokenHash: refreshTokenHash,
        clientId: client.id as string,
        userId: authCode.userId ?? undefined,
        scope: authCode.scope ?? undefined,
        expiresAt: addDays(new Date(), 30),
        revoked: false,
      },
    });

    // Log successful token issuance
    await AuthorizationUtils.logAuditEvent({
      clientId: client.id as string,
      userId: authCode.userId ?? undefined,
      action: 'token_issued',
      resource: 'oauth/token',
      ipAddress,
      userAgent,
      success: true,
      metadata: {
        grantType: 'authorization_code',
        scope: authCode.scope,
        hasRefreshToken: true,
      },
    });

    const response: Record<string, unknown> = {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: expiresIn,
      refresh_token: refreshToken,
    };

    if (authCode.scope) {
      response.scope = authCode.scope;
    }

    return NextResponse.json(response, { 
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
        'Pragma': 'no-cache',
      },
    });

  } catch (error: unknown) {
    console.error('Token generation/storage error:', error);
    
    await AuthorizationUtils.logAuditEvent({
      clientId: client.id as string,
      userId: authCode.userId ?? undefined,
      action: 'token_generation_error',
      resource: 'oauth/token',
      ipAddress,
      userAgent,
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json(
      { 
        error: OAuth2ErrorTypes.SERVER_ERROR,
        error_description: 'Token generation failed' 
      },
      { status: 500 }
    );
  }
}

async function handleRefreshTokenGrant(
  request: NextRequest,
  body: FormData,
  client: Record<string, unknown>,
  ipAddress?: string,
  userAgent?: string
): Promise<NextResponse> {
  const refresh_token = (body.get('refresh_token') ?? undefined) as string | undefined;
  const scope = (body.get('scope') ?? undefined) as string | undefined;

  if (!refresh_token) {
    return NextResponse.json(
      { 
        error: OAuth2ErrorTypes.INVALID_REQUEST,
        error_description: 'Missing required parameter: refresh_token' 
      },
      { status: 400 }
    );
  }

  try {
    // Verify refresh token
    const verification = await JWTUtils.verifyRefreshToken(refresh_token);
    
    if (!verification.valid) {
      await AuthorizationUtils.logAuditEvent({
        clientId: client.id as string,
        action: 'invalid_refresh_token',
        resource: 'oauth/token',
        ipAddress,
        userAgent,
        success: false,
        errorMessage: verification.error,
      });

      return NextResponse.json(
        { 
          error: OAuth2ErrorTypes.INVALID_GRANT,
          error_description: verification.error || 'Invalid refresh token' 
        },
        { status: 400 }
      );
    }

    // Check if refresh token exists in database and is not revoked
    const refreshTokenHashVerify = crypto.createHash('sha256').update(refresh_token).digest('hex');
    const storedRefreshToken = await prisma.refreshToken.findFirst({
      where: {
        tokenHash: refreshTokenHashVerify,
        revoked: false,
        expiresAt: {
          gt: new Date(),
        },
      },
    });

    if (!storedRefreshToken) {
      await AuthorizationUtils.logAuditEvent({
        clientId: client.id as string,
        action: 'revoked_refresh_token_used',
        resource: 'oauth/token',
        ipAddress,
        userAgent,
        success: false,
        errorMessage: 'Refresh token not found or revoked',
      });

      return NextResponse.json(
        { 
          error: OAuth2ErrorTypes.INVALID_GRANT,
          error_description: 'Refresh token has been revoked or is invalid' 
        },
        { status: 400 }
      );
    }

    // Validate client match
    if (storedRefreshToken.clientId !== (client.id as string)) {
      await AuthorizationUtils.logAuditEvent({
        clientId: client.id as string,
        action: 'refresh_token_client_mismatch',
        resource: 'oauth/token',
        ipAddress,
        userAgent,
        success: false,
        errorMessage: 'Refresh token was issued to a different client',
      });

      return NextResponse.json(
        { 
          error: OAuth2ErrorTypes.INVALID_GRANT,
          error_description: 'Refresh token was issued to a different client' 
        },
        { status: 400 }
      );
    }

    // Handle scope parameter for refresh token
    const originalScopes = ScopeUtils.parseScopes(storedRefreshToken.scope ?? '');
    let finalScope = storedRefreshToken.scope ?? undefined;
    
    if (scope) {
      const requestedScopes = ScopeUtils.parseScopes(scope);
      
      // Ensure all requested scopes are within the original scope
      const scopeValidation = ScopeUtils.validateScopes(requestedScopes, originalScopes);
      if (!scopeValidation.valid) {
        return NextResponse.json(
          { 
            error: OAuth2ErrorTypes.INVALID_SCOPE,
            error_description: 'Requested scope is invalid or exceeds originally granted scope' 
          },
          { status: 400 }
        );
      }
      
      finalScope = scope;
    }

    // Get permissions if user is involved
    let permissions: string[] = [];
    if (storedRefreshToken.userId) {
      permissions = await AuthorizationUtils.getUserPermissions(storedRefreshToken.userId);
    }

    // Generate new access token
    const newAccessToken = await JWTUtils.createAccessToken({
      client_id: client.clientId as string,
      user_id: storedRefreshToken.userId ?? undefined,
      scope: finalScope,
      permissions,
    });

    const accessTokenHash = crypto.createHash('sha256').update(newAccessToken).digest('hex');

    // Store new access token in database
    await prisma.accessToken.create({
      data: {
        token: newAccessToken,
        tokenHash: accessTokenHash,
        clientId: client.id as string,
        userId: storedRefreshToken.userId ?? undefined,
        scope: finalScope ?? undefined,
        expiresAt: addHours(new Date(), 1),
        revoked: false,
      },
    });

    // Optionally create new refresh token (recommended for security)
    const newRefreshToken = await JWTUtils.createRefreshToken({
      client_id: client.clientId as string,
      user_id: storedRefreshToken.userId ?? undefined,
      scope: finalScope,
    });

    const newRefreshTokenHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');

    // Revoke old refresh token
    await prisma.refreshToken.update({
      where: { id: storedRefreshToken.id },
      data: { revoked: true, revokedAt: new Date() },
    });

    // Store new refresh token
    await prisma.refreshToken.create({
      data: {
        token: newRefreshToken,
        tokenHash: newRefreshTokenHash,
        clientId: client.id as string,
        userId: storedRefreshToken.userId ?? undefined,
        scope: finalScope ?? undefined,
        expiresAt: addDays(new Date(), 30),
        revoked: false,
      },
    });

    // Log successful token refresh
    await AuthorizationUtils.logAuditEvent({
      clientId: client.id as string,
      userId: storedRefreshToken.userId ?? undefined,
      action: 'token_refreshed',
      resource: 'oauth/token',
      ipAddress,
      userAgent,
      success: true,
      metadata: {
        grantType: 'refresh_token',
        scope: finalScope,
      },
    });

    const response: Record<string, unknown> = {
      access_token: newAccessToken,
      token_type: 'Bearer',
      expires_in: 3600,
      refresh_token: newRefreshToken,
    };

    if (finalScope) {
      response.scope = finalScope;
    }

    return NextResponse.json(response, { 
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
        'Pragma': 'no-cache',
      },
    });

  } catch (error: unknown) {
    console.error('Refresh token processing error:', error);
    
    await AuthorizationUtils.logAuditEvent({
      clientId: client.id as string,
      action: 'refresh_token_error',
      resource: 'oauth/token',
      ipAddress,
      userAgent,
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json(
      { 
        error: OAuth2ErrorTypes.SERVER_ERROR,
        error_description: 'Refresh token processing failed' 
      },
      { status: 500 }
    );
  }
}

async function handleClientCredentialsGrant(
  request: NextRequest,
  body: FormData,
  client: Record<string, unknown>,
  ipAddress?: string,
  userAgent?: string
): Promise<NextResponse> {
  const scope = (body.get('scope') ?? undefined) as string | undefined;

  try {
    // For client credentials, there's no user context
    const permissions: string[] = []; // Client permissions would be handled differently

    // Validate requested scopes against client's allowed scopes
    const finalScope = scope;
    if (scope) {
      const requestedScopes = ScopeUtils.parseScopes(scope);
      const clientScopes = ScopeUtils.parseScopes(client.scope as string || '');
      
      const scopeValidation = ScopeUtils.validateScopes(requestedScopes, clientScopes);
      if (!scopeValidation.valid) {
        await AuthorizationUtils.logAuditEvent({
          clientId: client.id as string,
          action: 'invalid_client_scope',
          resource: 'oauth/token',
          ipAddress,
          userAgent,
          success: false,
          errorMessage: 'Requested scope exceeds client allowed scope',
        });

        return NextResponse.json(
          { 
            error: OAuth2ErrorTypes.INVALID_SCOPE,
            error_description: 'Requested scope is invalid or exceeds client allowed scope' 
          },
          { status: 400 }
        );
      }
    }

    // Generate access token for client credentials
    const accessToken = await JWTUtils.createAccessToken({
      client_id: client.clientId as string,
      user_id: undefined, // No user for client credentials
      scope: finalScope,
      permissions,
    });

    const accessTokenHash = crypto.createHash('sha256').update(accessToken).digest('hex');

    // Store access token in database
    await prisma.accessToken.create({
      data: {
        token: accessToken,
        tokenHash: accessTokenHash,
        clientId: client.id as string,
        userId: undefined,
        scope: finalScope ?? undefined,
        expiresAt: addHours(new Date(), 1),
        revoked: false,
      },
    });

    // Log successful token issuance
    await AuthorizationUtils.logAuditEvent({
      clientId: client.id as string,
      action: 'client_credentials_token_issued',
      resource: 'oauth/token',
      ipAddress,
      userAgent,
      success: true,
      metadata: {
        grantType: 'client_credentials',
        scope: finalScope,
      },
    });

    const response: Record<string, unknown> = {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 3600,
    };

    if (finalScope) {
      response.scope = finalScope;
    }

    return NextResponse.json(response, { 
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
        'Pragma': 'no-cache',
      },
    });

  } catch (error: unknown) {
    console.error('Client credentials token generation error:', error);
    
    await AuthorizationUtils.logAuditEvent({
      clientId: client.id as string,
      action: 'client_credentials_error',
      resource: 'oauth/token',
      ipAddress,
      userAgent,
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json(
      { 
        error: OAuth2ErrorTypes.SERVER_ERROR,
        error_description: 'Client credentials token generation failed' 
      },
      { status: 500 }
    );
  }
}

// Apply OAuth 2.0 token validation middleware
export const POST = withOAuthTokenValidation(handleTokenRequest);
