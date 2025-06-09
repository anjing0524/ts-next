import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { 
  ClientAuthUtils, 
  AuthorizationUtils, 
  OAuth2ErrorTypes,
  RateLimitUtils 
} from '@/lib/auth/oauth2';
import { withOAuthRevokeValidation, OAuthValidationResult } from '@/lib/auth/middleware';

async function handleRevokeRequest(request: NextRequest, context: OAuthValidationResult['context']): Promise<NextResponse> {
  const { body, client, ipAddress, userAgent, params } = context!;
  const token = params!.token;
  const token_type_hint = (body!.get('token_type_hint') ?? undefined) as string | undefined; // 'access_token' or 'refresh_token'

  try {
    // Determine token type and revoke accordingly
    let revokedAccessToken = false;
    let revokedRefreshToken = false;
    let userId: string | undefined;

    // Try to revoke as access token first (or if hint suggests it)
    if (!token_type_hint || token_type_hint === 'access_token') {
      const accessToken = await prisma.accessToken.findFirst({
        where: {
          token: token,
          clientId: client.id,
          revoked: false,
        },
      });

      if (accessToken) {
        // Revoke the access token
        await prisma.accessToken.update({
          where: { id: accessToken.id },
          data: {
            revoked: true,
            revokedAt: new Date(),
          },
        });

        userId = accessToken.userId ?? undefined;
        revokedAccessToken = true;

        // Also revoke any related refresh tokens if this was the only access token
        const relatedRefreshTokens = await prisma.refreshToken.findMany({
          where: {
            clientId: client.id,
            userId: accessToken.userId,
            revoked: false,
          },
        });

        for (const refreshToken of relatedRefreshTokens) {
          await prisma.refreshToken.update({
            where: { id: refreshToken.id },
            data: {
              revoked: true,
              revokedAt: new Date(),
            },
          });
          revokedRefreshToken = true;
        }
      }
    }

    // Try to revoke as refresh token if not found as access token
    if (!revokedAccessToken && (!token_type_hint || token_type_hint === 'refresh_token')) {
      const refreshToken = await prisma.refreshToken.findFirst({
        where: {
          token: token,
          clientId: client.id,
          revoked: false,
        },
      });

      if (refreshToken) {
        // Revoke the refresh token
        await prisma.refreshToken.update({
          where: { id: refreshToken.id },
          data: {
            revoked: true,
            revokedAt: new Date(),
          },
        });

        userId = refreshToken.userId ?? undefined;
        revokedRefreshToken = true;

        // Revoke all related access tokens for this client and user
        await prisma.accessToken.updateMany({
          where: {
            clientId: client.id,
            userId: refreshToken.userId,
            revoked: false,
          },
          data: {
            revoked: true,
            revokedAt: new Date(),
          },
        });
        revokedAccessToken = true;
      }
    }

    // Log the revocation attempt
    await AuthorizationUtils.logAuditEvent({
      userId,
      clientId: client.id,
      action: 'token_revoked',
      resource: 'oauth/revoke',
      ipAddress,
      userAgent,
      success: revokedAccessToken || revokedRefreshToken,
      errorMessage: (revokedAccessToken || revokedRefreshToken) ? undefined : 'Token not found or already revoked',
      metadata: {
        tokenTypeHint: token_type_hint,
        revokedAccessToken,
        revokedRefreshToken,
      },
    });

    // According to RFC 7009, the revocation endpoint should return 200 OK
    // even if the token was not found or already revoked
    return new NextResponse(null, { status: 200 });

  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    await AuthorizationUtils.logAuditEvent({
      clientId: client.id,
      action: 'token_revocation_error',
      resource: 'oauth/revoke',
      ipAddress,
      userAgent,
      success: false,
      errorMessage,
    });

    console.error('Error during token revocation:', error);
    
    return NextResponse.json(
      { 
        error: OAuth2ErrorTypes.SERVER_ERROR,
        error_description: 'An unexpected error occurred' 
      },
      { status: 500 }
    );
  }
}

// Apply middleware that handles rate limiting, client auth, and validation
export const POST = withOAuthRevokeValidation(handleRevokeRequest); 