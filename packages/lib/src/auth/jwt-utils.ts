import * as jose from 'jose';
import { NextRequest } from 'next/server';
import { createHash } from 'crypto';

// --- Type Definitions ---
export interface JWTPayload extends jose.JWTPayload {
  permissions?: string[];
  // Add any other custom claims your application uses
}

export interface AccessTokenPayload extends JWTPayload {
  // Access token specific claims
}

export interface RefreshTokenPayload extends JWTPayload {
  // Refresh token specific claims
}

export interface IdTokenPayload extends JWTPayload {
  // OIDC specific claims
}

export interface JWTOptions {
  expiresIn?: string | number;
}

export interface TokenValidationResult {
  valid: boolean;
  payload?: JWTPayload;
  error?: Error;
}

// --- Helper Functions ---

async function getPublicKey(): Promise<jose.KeyLike> {
  const publicKeyPem = process.env.JWT_PUBLIC_KEY;
  if (!publicKeyPem) {
    throw new Error('JWT_PUBLIC_KEY environment variable is not set.');
  }
  return await jose.importSPKI(publicKeyPem, 'RS256');
}

async function getPrivateKey(): Promise<jose.KeyLike> {
  const privateKeyPem = process.env.JWT_PRIVATE_KEY;
  if (!privateKeyPem) {
    throw new Error('JWT_PRIVATE_KEY environment variable is not set.');
  }
  return await jose.importPKCS8(privateKeyPem, 'RS256');
}


// --- Main JWT Utility Class ---

export class JWTUtils {
  static async generateToken(payload: JWTPayload, options: JWTOptions = {}): Promise<string> {
    const privateKey = await getPrivateKey();
    const jwt = await new jose.SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt()
      .setExpirationTime(options.expiresIn || '1h')
      .sign(privateKey);
    return jwt;
  }

  static async verifyToken(token: string): Promise<TokenValidationResult> {
    try {
      const publicKey = await getPublicKey();
      const { payload } = await jose.jwtVerify(token, publicKey);
      return { valid: true, payload };
    } catch (error) {
      return { valid: false, error: error as Error };
    }
  }

  static getTokenHash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  static decodeTokenPayload(token: string): JWTPayload {
    return jose.decodeJwt(token);
  }

  static async verifyAndDecodeRefreshToken(token: string, client: any): Promise<RefreshTokenPayload> {
    const result = await this.verifyToken(token);
    if (!result.valid || !result.payload) {
      throw result.error || new Error('Invalid refresh token');
    }
    if (result.payload.client_id !== client.clientId) {
      throw new Error('Token was not issued to this client.');
    }
    return result.payload as RefreshTokenPayload;
  }
}

// --- Standalone Utility Functions ---

export async function getUserIdFromRequest(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.substring(7);

  try {
    const publicKey = await getPublicKey();
    const { payload } = await jose.jwtVerify(token, publicKey);
    return payload.sub || null;
  } catch (error) {
    console.error('JWT verification failed in getUserIdFromRequest:', error);
    return null;
  }
}