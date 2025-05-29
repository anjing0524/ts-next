import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AuthorizationUtils } from '@/lib/auth/oauth2';
import { withCORS } from '@/lib/auth/middleware';
import { validateSession, destroySession } from '@/lib/auth/session';

async function handleLogout(request: NextRequest): Promise<NextResponse> {
  const ipAddress = request.headers.get('x-forwarded-for') || undefined;
  const userAgent = request.headers.get('user-agent') || undefined;

  try {
    // Handle both session-based logout and OAuth logout
    const sessionId = request.cookies.get('session_id')?.value;
    let userId: string | undefined;

    // Validate current session
    if (sessionId) {
      const sessionContext = await validateSession(request);
      if (sessionContext) {
        userId = sessionContext.user.id;
        
        // Destroy the session
        await destroySession(sessionId);

        // Log successful logout
        await AuthorizationUtils.logAuditEvent({
          userId,
          action: 'user_logout',
          resource: 'auth/logout',
          ipAddress,
          userAgent,
          success: true,
        });
      }
    }

    // Handle OAuth 2.0 logout parameters
    const { searchParams } = new URL(request.url);
    const id_token_hint = searchParams.get('id_token_hint');
    const post_logout_redirect_uri = searchParams.get('post_logout_redirect_uri');
    const state = searchParams.get('state');

    // If this is an OAuth logout with redirect URI
    if (post_logout_redirect_uri) {
      // TODO: Validate post_logout_redirect_uri against registered URIs
      // In a production system, you should validate that the redirect URI
      // is registered for the client that issued the ID token
      
      const redirectUrl = new URL(post_logout_redirect_uri);
      if (state) {
        redirectUrl.searchParams.set('state', state);
      }

      // Clear session cookie and redirect
      const response = NextResponse.redirect(redirectUrl.toString());
      response.cookies.set('session_id', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 0, // Expire immediately
        path: '/',
      });

      return response;
    }

    // Regular logout response
    const response = NextResponse.json({
      success: true,
      message: 'Logged out successfully',
    });

    // Clear session cookie
    response.cookies.set('session_id', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 0, // Expire immediately
      path: '/',
    });

    return response;

  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    await AuthorizationUtils.logAuditEvent({
      action: 'logout_error',
      resource: 'auth/logout',
      ipAddress,
      userAgent,
      success: false,
      errorMessage,
    });

    console.error('Error during logout:', error);
    
    return NextResponse.json(
      { 
        error: 'server_error',
        error_description: 'An unexpected error occurred' 
      },
      { status: 500 }
    );
  }
}

export const POST = withCORS(handleLogout);
export const GET = withCORS(handleLogout); // Support both GET and POST for OAuth logout 