import { NextResponse } from 'next/server';

import * as jose from 'jose';

import logger from '@repo/lib/utils/logger';

export async function GET(): Promise<NextResponse> {
  try {
    const publicKeyPem = process.env.JWT_PUBLIC_KEY_PEM;
    const keyId = process.env.JWT_KEY_ID || 'default-kid'; // Default KID if not set
    const algorithm = process.env.JWT_ALGORITHM || 'RS256'; // Default to RS256

    if (algorithm.startsWith('HS')) {
      logger.warn(
        '[JWKS] Symmetric algorithm configured. JWKS endpoint will serve an empty key set.'
      );
      return NextResponse.json(
        { keys: [] },
        {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=3600, must-revalidate',
          },
        }
      );
    }

    if (!publicKeyPem) {
      logger.error('[JWKS] JWT_PUBLIC_KEY_PEM is not configured for asymmetric algorithm.');
      return NextResponse.json(
        {
          error: 'Service misconfiguration: Public key not available.',
          code: 'JWKS_NOT_CONFIGURED',
        },
        { status: 503 }
      );
    }

    let jwk: jose.JWK;
    try {
      // For SPKI, the algorithm in the key itself is usually not needed for import,
      // but jose might use the provided alg for validation or context.
      // The actual algorithm used for signing should match what's specified in JWT_ALGORITHM.
      const publicKey = await jose.importSPKI(publicKeyPem, algorithm as string); // alg is required by importSPKI
      jwk = await jose.exportJWK(publicKey);
    } catch (importError: unknown) {
      const error = importError as Error & { code?: string };
      logger.error('[JWKS] Failed to import or export public key:', {
        message: error.message,
        stack: error.stack,
        code: error.code, // jose errors often have a code property
      });
      return NextResponse.json(
        {
          error: 'Service misconfiguration: Invalid public key format or algorithm mismatch.',
          code: 'JWKS_KEY_PROCESSING_ERROR',
        },
        { status: 503 }
      );
    }

    const jwks = {
      keys: [
        {
          ...jwk, // Spread the exported JWK (contains kty, n, e for RSA)
          kid: keyId,
          alg: algorithm, // Algorithm used for the JWT signature
          use: 'sig', // Key usage: signature
        },
      ],
    };

    return NextResponse.json(jwks, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600, must-revalidate', // Cache for 1 hour
      },
    });
  } catch (err: unknown) {
    const error = err as Error;
    logger.error('[JWKS] Unexpected error generating JWKS:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
    return NextResponse.json(
      {
        error: 'Failed to generate JWKS due to an unexpected server error.',
        code: 'INTERNAL_SERVER_ERROR',
      },
      { status: 500 }
    );
  }
}
