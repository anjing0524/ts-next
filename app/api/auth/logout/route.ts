import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AuthorizationUtils } from '@/lib/auth/oauth2';
import { withCORS } from '@/lib/auth/middleware';
import { validateSession, destroySession } from '@/lib/auth/session'; // Keep if session logic is still used alongside token
import { Buffer } from 'buffer'; // Required for base64 encoding

// Helper function to revoke tokens
const revokeToken = async (
  token: string,
  tokenTypeHint: 'access_token' | 'refresh_token',
  requestUrl: string // Pass the original request URL to construct revokeUrl
) => {
  const clientId = 'auth-center-self';
  const clientSecret = process.env.AUTH_CENTER_SELF_CLIENT_SECRET || 'auth-center-secret'; // Use env var or default
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  // Construct full URL for the revoke endpoint based on the incoming request's host
  const internalRevokeUrl = new URL(requestUrl); // e.g. http://localhost:3000/api/auth/logout
  internalRevokeUrl.pathname = '/api/oauth/revoke'; // Change to /api/oauth/revoke
  internalRevokeUrl.search = ''; // Clear existing search params

  try {
    const response = await fetch(internalRevokeUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
      },
      body: new URLSearchParams({ token, token_type_hint: tokenTypeHint }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to revoke ${tokenTypeHint} (status: ${response.status}): ${errorText}`);
      // Log this error appropriately using AuthorizationUtils.logAuditEvent if possible
      await AuthorizationUtils.logAuditEvent({
        action: `revoke_token_failed_${tokenTypeHint}`,
        resource: 'auth/logout',
        success: false,
        errorMessage: `Revoke failed: ${response.status} - ${errorText}`,
      });
    } else {
      console.log(`${tokenTypeHint} revoked successfully`);
      await AuthorizationUtils.logAuditEvent({
        action: `revoke_token_success_${tokenTypeHint}`,
        resource: 'auth/logout',
        success: true,
      });
    }
  } catch (e: any) {
    console.error(`Error calling revoke endpoint for ${tokenTypeHint}:`, e);
    await AuthorizationUtils.logAuditEvent({
      action: `revoke_token_exception_${tokenTypeHint}`,
      resource: 'auth/logout',
      success: false,
      errorMessage: e.message || 'Exception during token revocation',
    });
  }
};


async function handleLogout(request: NextRequest): Promise<NextResponse> {
  const ipAddress = request.headers.get('x-forwarded-for') || undefined;
  const userAgent = request.headers.get('user-agent') || undefined;
  let userIdFromToken: string | undefined; // If you can extract user_id from token

  try {
    // 1. Retrieve Tokens for Revocation
    let accessTokenFromCookie = request.cookies.get('auth_token')?.value;
    let accessTokenFromBody: string | undefined;
    let refreshTokenFromBody: string | undefined;

    if (request.method === 'POST') {
      try {
        const body = await request.json();
        accessTokenFromBody = body.access_token;
        refreshTokenFromBody = body.refresh_token;
        // Potentially extract userId from access token if needed for logging before revocation
        // For example: const decoded = jwt.decode(accessTokenFromBody || accessTokenFromCookie); userIdFromToken = decoded.sub;
      } catch (e) {
        // Not a JSON body or no tokens, ignore
      }
    }

    const accessTokenToRevoke = accessTokenFromBody || accessTokenFromCookie;

    // 2. Revoke Tokens using /api/oauth/revoke
    if (accessTokenToRevoke) {
      await revokeToken(accessTokenToRevoke, 'access_token', request.url);
    }
    if (refreshTokenFromBody) {
      await revokeToken(refreshTokenFromBody, 'refresh_token', request.url);
    }

    // Legacy session destruction (if still applicable)
    const sessionId = request.cookies.get('session_id')?.value;
    if (sessionId) {
      const sessionContext = await validateSession(request); // This might rely on a valid session
      if (sessionContext) {
        await destroySession(sessionId);
        await AuthorizationUtils.logAuditEvent({
          userId: sessionContext.user.id, // Use user ID from session if available
          action: 'user_session_logout',
          resource: 'auth/logout',
          ipAddress,
          userAgent,
          success: true,
        });
      }
    }

    // Handle OAuth 2.0 post-logout redirection
    const { searchParams } = new URL(request.url);
    const post_logout_redirect_uri = searchParams.get('post_logout_redirect_uri');
    const state = searchParams.get('state');

    let response: NextResponse;

    if (post_logout_redirect_uri) {
      // TODO: Validate post_logout_redirect_uri against registered URIs
      const redirectUrl = new URL(post_logout_redirect_uri);
      if (state) {
        redirectUrl.searchParams.set('state', state);
      }
      response = NextResponse.redirect(redirectUrl.toString());
    } else {
      response = NextResponse.json({
        success: true,
        message: 'Logged out successfully. Client should clear any local storage (e.g., sessionStorage).',
      });
    }

    // 3. Clear Client-Side Tokens (auth_token cookie)
    response.cookies.set('auth_token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict', // Or 'lax' depending on requirements
      maxAge: 0, // Expire immediately
      path: '/',
    });
    // Also clear session_id cookie if it was used
    response.cookies.set('session_id', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 0,
      path: '/',
    });

    // General logout audit event (might be redundant if specific revocation events are logged)
    // Consider if a general "logout_processed" is needed or if token specific logs are enough
    await AuthorizationUtils.logAuditEvent({
      userId: userIdFromToken, // Or from session if that was primary
      action: 'user_logout_processed',
      resource: 'auth/logout',
      ipAddress,
      userAgent,
      success: true,
    });

    return response;

  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error during logout';
    
    await AuthorizationUtils.logAuditEvent({
      userId: userIdFromToken,
      action: 'logout_processing_error',
      resource: 'auth/logout',
      ipAddress,
      userAgent,
      success: false,
      errorMessage,
    });

    console.error('Error during logout processing:', error);
    
    // Even in case of error, try to clear cookies
    const errorResponse = NextResponse.json(
      { 
        error: 'server_error',
        error_description: errorMessage
      },
      { status: 500 }
    );
    errorResponse.cookies.set('auth_token', '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 0, path: '/' });
    errorResponse.cookies.set('session_id', '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 0, path: '/' });
    return errorResponse;
  }
}

export const POST = withCORS(handleLogout);
export const GET = withCORS(handleLogout);