import { NextRequest, NextResponse } from 'next/server';
import * as jose from 'jose';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // For HS256 (symmetric key), we don't expose the key in JWKS
    // This endpoint is mainly for asymmetric algorithms like RS256, ES256
    // In a production setup with asymmetric keys, you would:
    // 1. Load your public key from environment or key management service
    // 2. Convert it to JWK format
    // 3. Return it in the JWKS response

    // For now, we return an empty key set since we're using HS256 (symmetric)
    // If you switch to RS256/ES256, uncomment and modify the code below:

    /*
    // Example for RS256 public key:
    const publicKeyPem = process.env.JWT_PUBLIC_KEY;
    if (!publicKeyPem) {
      throw new Error('JWT_PUBLIC_KEY not configured');
    }

    const publicKey = await jose.importSPKI(publicKeyPem, 'RS256');
    const jwk = await jose.exportJWK(publicKey);
    
    const jwks = {
      keys: [
        {
          ...jwk,
          kid: 'main-signing-key', // Key ID
          alg: 'RS256',
          use: 'sig',
        }
      ]
    };
    */

    // Empty JWKS for HS256 (symmetric key algorithm)
    const jwks = {
      keys: []
    };

    return NextResponse.json(jwks, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    });

  } catch (error) {
    console.error('Error generating JWKS:', error);
    
    return NextResponse.json(
      { error: 'Failed to generate JWKS' },
      { status: 500 }
    );
  }
} 