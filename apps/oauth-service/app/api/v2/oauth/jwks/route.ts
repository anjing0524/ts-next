import { NextRequest, NextResponse } from 'next/server';
import { KeyService } from '@repo/lib/node';
import { rsaPublicKeyToJwk, isValidRsaPublicKey, JWK } from '@/lib/auth/jwk-utils';

/**
 * JWKS (JSON Web Key Set) endpoint
 * Returns the public keys used for JWT signature verification
 * 
 * RFC 7517 compliant implementation
 */
export async function GET(request: NextRequest) {
  try {
    // Initialize key service at request time to avoid build-time issues
    const keyService = new KeyService();
    const availableVersions = keyService.getAvailableVersions();
    const jwks = { keys: [] as JWK[] };

    for (const version of availableVersions) {
      try {
        const publicKey = keyService.getPublicKey(version);
        const keyInfo = keyService.getKeyInfo(version);

        if (!publicKey || !keyInfo || !isValidRsaPublicKey(publicKey)) {
          console.warn(`Invalid or missing public key for version: ${version}`);
          continue;
        }

        const jwk = rsaPublicKeyToJwk(publicKey, keyInfo.keyId);
        if (jwk) {
          jwks.keys.push(jwk);
        }
      } catch (error) {
        console.error(`Error processing key version ${version}:`, error);
        // Continue with other keys instead of failing entirely
        continue;
      }
    }

    return new NextResponse(JSON.stringify(jwks), {
      status: 200,
      headers: {
        'Content-Type': 'application/jwk-set+json',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
        'Access-Control-Allow-Origin': '*', // Allow CORS for public keys
      },
    });
  } catch (error) {
    console.error('JWKS endpoint error:', error);
    
    return new NextResponse(
      JSON.stringify({ 
        error: 'server_error',
        error_description: 'Failed to retrieve JWKS' 
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
}

// Handle CORS preflight requests
export async function OPTIONS(_request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Cache-Control': 'no-cache',
    },
  });
}