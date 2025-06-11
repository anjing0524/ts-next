// app/api/oauth/authorize/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { addMinutes } from 'date-fns';
import { 
  PKCEUtils, 
  ScopeUtils, 
  AuthorizationUtils, 
  OAuth2ErrorTypes, 
  RateLimitUtils 
} from '@/lib/auth/oauth2';
import { withOAuthAuthorizeValidation, OAuthValidationResult } from '@/lib/auth/middleware';
import { any, unknown } from 'zod';

async function handleAuthorizeRequest(request: NextRequest, context: OAuthValidationResult['context']): Promise<NextResponse> {
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
        error_description: `Invalid scopes: ${scopeValidation.invalidScopes.join(', ')}`
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
    
    if (code_challenge) {
      if (!code_challenge_method || code_challenge_method !== 'S256') {
        const error = {
          error: OAuth2ErrorTypes.INVALID_REQUEST,
          error_description: 'code_challenge_method must be S256'
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
          error_description: 'Invalid code_challenge format'
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
        codeChallengeMethod: code_challenge_method 
      };
    } else if (client.requirePkce) {
      const error = {
        error: OAuth2ErrorTypes.INVALID_REQUEST,
        error_description: 'PKCE is required for this client'
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
    const needsConsent = await checkConsentRequired(userId, client_id, requestedScopes, client.requireConsent);
    
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
        error_description: 'User consent required'
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
        state: state ?? undefined,
        nonce: nonce ?? undefined,
        authTime: new Date(),
        maxAge: max_age ? parseInt(max_age) : undefined,
        ...pkceData,
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

  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    await AuthorizationUtils.logAuditEvent({
      clientId: client?.id || "null", // Client may not be available in catch block
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
        error_description: 'An unexpected error occurred'
      },
      { status: 500 }
    );
  }
}

// Replace the placeholder authenticateUser function
async function authenticateUser(
  request: NextRequest,
  options: {
    maxAge?: number;
    prompt?: string;
    clientId: string;
    redirectUri: string;
    scope: string;
    state?: string;
  }
): Promise<string | null> {
  const { validateSession } = await import('@/lib/auth/session');
  
  // Check for existing user session
  const sessionContext = await validateSession(request);
  
  if (!sessionContext) {
    return null; // No valid session, needs to login
  }
  
  const { user, session } = sessionContext;
  
  // Handle max_age parameter for re-authentication
  if (options.maxAge !== undefined) {
    const authTime = session.createdAt;
    const maxAgeMs = options.maxAge * 1000;
    const now = new Date();
    
    if (now.getTime() - authTime.getTime() > maxAgeMs) {
      // Authentication is too old, force re-authentication
      return null;
    }
  }
  
  // Handle prompt parameter
  if (options.prompt === 'login') {
    // Force re-authentication regardless of session
    return null;
  }
  
  if (options.prompt === 'none') {
    // Silent authentication - must have valid session
    return user.id;
  }
  
  return user.id;
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
      userId_clientId: { // This is the @@unique constraint name
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
  } catch (e) {
    // Invalid JSON in DB, treat as no scopes granted or log error
    console.error("Invalid JSON in ConsentGrant.scopes for grant ID:", existingConsent.id);
    return true; // Requires re-consent if scopes are malformed
  }

  const allRequestedScopesCovered = requestedScopes.every(scope => grantedScopes.includes(scope));
  
  return !allRequestedScopesCovered; // True if not all scopes are covered (i.e., consent is required)
}

export const GET = withOAuthAuthorizeValidation(handleAuthorizeRequest);
