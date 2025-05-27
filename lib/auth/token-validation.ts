// lib/auth/token-validation.ts
import { NextRequest, NextResponse } from 'next/server';
import * as jose from 'jose';
import logger from '@/utils/logger'; // Assuming logger is available

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_ACCESS_TOKEN_SECRET || 'super-secret-key-for-hs256-oauth-dev-env-32-chars'
);
const JWT_ISSUER = process.env.JWT_ISSUER; // Will be dynamically set if not provided by env
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'api_resource';
const JWT_ALG = 'HS256';

/**
 * Verifies the JWT token from the Authorization header.
 * @param request NextRequest object
 * @returns Promise<{ valid: boolean; claims?: jose.JWTPayload; error?: string }>
 */
export async function verifyAuthToken(
  request: NextRequest
): Promise<{ valid: boolean; claims?: jose.JWTPayload; error?: string }> {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader) {
    logger.warn('verifyAuthToken: Missing Authorization header.');
    return { valid: false, error: 'Missing Authorization header' };
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    logger.warn('verifyAuthToken: Invalid token format (not Bearer).');
    return { valid: false, error: 'Invalid token format' };
  }

  const token = parts[1];

  try {
    // Dynamically determine issuer if not set by environment variable
    const expectedIssuer = JWT_ISSUER || `https://${request.headers.get('host') || 'localhost:3000'}`;
    
    const { payload } = await jose.jwtVerify(token, JWT_SECRET, {
      issuer: expectedIssuer,
      audience: JWT_AUDIENCE,
      algorithms: [JWT_ALG],
    });

    logger.info('verifyAuthToken: Token verified successfully.', { sub: payload.sub });
    return { valid: true, claims: payload };

  } catch (error: any) {
    logger.warn('verifyAuthToken: Token verification failed.', { errorName: error.name, errorMessage: error.message, code: error.code });
    let errorMessage = 'Invalid token';
    if (error instanceof jose.errors.JWTExpired) {
      errorMessage = 'Token has expired';
    } else if (error instanceof jose.errors.JWTClaimValidationFailed) {
      errorMessage = `Token claim validation failed: ${error.message}`;
    } else if (error instanceof jose.errors.JWSInvalid) {
      errorMessage = 'Token signature invalid';
    }
    // Add more specific jose error checks if needed
    return { valid: false, error: errorMessage };
  }
}

// Part 2 will be added here
export type ApiHandler = (
  request: NextRequest,
  params: { params: any }, // params will be { params: { resourceId: '...' } } for dynamic routes
  validatedClaims: jose.JWTPayload
) => Promise<NextResponse>;

export type RequiredPermission = string; // e.g., "profile:read"

export function withAuth(
  handler: ApiHandler,
  requiredPermissions?: RequiredPermission | RequiredPermission[]
): (request: NextRequest, params: { params: any }) => Promise<NextResponse> {
  return async (request: NextRequest, routeParams: { params: any }) => { // routeParams is the second arg for route handlers
    const verificationResult = await verifyAuthToken(request);

    if (!verificationResult.valid || !verificationResult.claims) {
      logger.warn('withAuth: Unauthorized access attempt.', { error: verificationResult.error });
      return NextResponse.json(
        { error: verificationResult.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    if (requiredPermissions) {
      const userPermissions = (verificationResult.claims.permissions as string[]) || [];
      const permissionsToCheck = Array.isArray(requiredPermissions)
        ? requiredPermissions
        : [requiredPermissions];

      const hasAllPermissions = permissionsToCheck.every(rp => userPermissions.includes(rp));

      if (!hasAllPermissions) {
        logger.warn('withAuth: Forbidden access attempt.', {
          userId: verificationResult.claims.sub,
          required: permissionsToCheck,
          found: userPermissions,
        });
        return NextResponse.json(
          { error: 'Forbidden. You do not have the required permissions.' },
          { status: 403 }
        );
      }
      logger.info('withAuth: User has required permissions.', { userId: verificationResult.claims.sub, required: permissionsToCheck });
    } else {
        logger.info('withAuth: No specific permissions required for this route.', { userId: verificationResult.claims.sub });
    }

    // If all checks pass, call the original handler
    return handler(request, routeParams, verificationResult.claims);
  };
}
