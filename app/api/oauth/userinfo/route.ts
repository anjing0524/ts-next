import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth, AuthContext } from '@/lib/auth/middleware';

async function handleUserInfo(request: NextRequest, context: AuthContext): Promise<NextResponse> {
  // UserInfo endpoint requires user context
  if (!context.user_id) {
    return NextResponse.json(
      {
        error: 'invalid_token',
        error_description: 'Token does not contain user information',
      },
      { status: 401 }
    );
  }

  try {
    // Fetch user information
    const user = await prisma.user.findUnique({
      where: { id: context.user_id },
      select: {
        id: true,
        username: true,
        email: true,
        firstName: true,
        lastName: true,
        emailVerified: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        {
          error: 'invalid_token',
          error_description: 'User not found',
        },
        { status: 401 }
      );
    }

    // Build user info response based on requested scopes
    const userInfo: any = {
      sub: user.id, // Subject identifier
    };

    // Add profile information if profile scope is present
    if (context.scopes.includes('profile')) {
      userInfo.name = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username;
      userInfo.preferred_username = user.username;
      userInfo.updated_at = Math.floor(user.updatedAt.getTime() / 1000);

      if (user.firstName) userInfo.given_name = user.firstName;
      if (user.lastName) userInfo.family_name = user.lastName;
    }

    // Add email information if email scope is present
    if (context.scopes.includes('email')) {
      if (user.email) {
        userInfo.email = user.email;
        userInfo.email_verified = user.emailVerified;
      }
    }

    return NextResponse.json(userInfo, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store', // UserInfo should not be cached
      },
    });

  } catch (error) {
    console.error('Error in UserInfo endpoint:', error);
    
    return NextResponse.json(
      {
        error: 'server_error',
        error_description: 'An unexpected error occurred',
      },
      { status: 500 }
    );
  }
}

export const GET = withAuth(handleUserInfo, {
  requiredScopes: ['openid'], // OpenID Connect requires openid scope
  requireUserContext: true,
});

export const POST = withAuth(handleUserInfo, {
  requiredScopes: ['openid'],
  requireUserContext: true,
}); 