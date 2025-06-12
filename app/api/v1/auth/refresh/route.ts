import { NextRequest, NextResponse } from 'next/server';

import { Client as OAuthClientPrismaType } from '@prisma/client'; // Import Prisma type

import { successResponse } from '@/lib/api/apiResponse';
import { withErrorHandler, ApiError } from '@/lib/api/errorHandler';
import { withOAuthTokenValidation, OAuthValidationContext } from '@/lib/auth/middleware';
import { processRefreshTokenGrantLogic, OAuth2ErrorTypes } from '@/lib/auth/oauth2'; // Assuming it's placed here

// Attempt to reuse the middleware from the existing /oauth/token endpoint
// This middleware is expected to handle client authentication (e.g., Basic Auth, client_secret_post)
// and provide 'client', 'ipAddress', 'userAgent', 'body', 'params' in the context.

// Define the expected context structure after client authentication by the middleware
interface RefreshAuthContext extends OAuthValidationContext {
  // client, ipAddress, userAgent, params, body are from OAuthValidationContext
}

async function refreshTokenHandler(request: NextRequest, context: RefreshAuthContext) {
  const requestId = (request as any).requestId; // Injected by withErrorHandler

  if (!context.client) {
    // This should ideally be caught by withOAuthTokenValidation if client auth fails
    // If it's not, withOAuthTokenValidation might not be suitable or needs adjustment
    console.error('Client authentication failed or client not set in context by middleware.');
    throw new ApiError(401, 'Client authentication failed.', OAuth2ErrorTypes.INVALID_CLIENT);
  }

  // The /oauth/token endpoint expects 'application/x-www-form-urlencoded'
  // The 'body' in context from withOAuthTokenValidation should be a FormData instance.
  // If not, we might need to parse it here: const body = await request.formData();
  const body = context.body;
  if (!(body instanceof FormData)) {
    console.error('Request body is not FormData as expected from withOAuthTokenValidation.');
    throw new ApiError(
      400,
      'Invalid request format. Expected application/x-www-form-urlencoded.',
      OAuth2ErrorTypes.INVALID_REQUEST
    );
  }

  const refreshTokenValue = body.get('refresh_token') as string | undefined;
  const requestedScope = body.get('scope') as string | undefined;
  // client_id and client_secret are typically handled by the client authentication part of withOAuthTokenValidation
  // grant_type for this route is implicitly 'refresh_token'

  if (!refreshTokenValue) {
    throw new ApiError(400, 'refresh_token is required.', OAuth2ErrorTypes.INVALID_REQUEST);
  }

  const tokenResponse = await processRefreshTokenGrantLogic(
    refreshTokenValue,
    requestedScope,
    context.client as OAuthClientPrismaType, // Cast client to the specific Prisma type
    context.ipAddress,
    context.userAgent
  );

  return NextResponse.json(
    successResponse(tokenResponse, 200, 'Token refreshed successfully.', requestId),
    { status: 200 }
  );
}

// Wrap with withErrorHandler first (outermost)
// Then with withOAuthTokenValidation for client authentication and context setup.
// withOAuthTokenValidation is originally designed for /api/oauth/token which handles multiple grant types.
// We are assuming it can correctly set up the context (client, body, etc.) for this dedicated refresh route.
// The 'params' in context might contain grant_type if withOAuthTokenValidation extracts it,
// but refreshTokenHandler here doesn't need to switch on it.
export const POST = withErrorHandler(withOAuthTokenValidation(refreshTokenHandler));
