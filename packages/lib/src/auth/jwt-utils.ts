import * as jose from 'jose';
import { NextRequest } from 'next/server';
import { createHash } from 'crypto';
import { KeyService } from './key-service';

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
  version?: string;
}

// --- Main JWT Utility Class ---

export class JWTUtils {
  static async generateToken(payload: JWTPayload, options: JWTOptions = {}): Promise<string> {
    try {
      const keyService = await KeyService.getInstance();
      const jwt = await keyService.signToken(payload, options);
      return jwt;
    } catch (error) {
      console.error('Failed to generate JWT token:', error);
      throw new Error(
        `JWT token generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  static async verifyToken(token: string): Promise<TokenValidationResult> {
    try {
      const keyService = await KeyService.getInstance();
      const result = await keyService.verifyToken(token);
      return {
        valid: result.valid,
        payload: result.payload as JWTPayload,
        version: result.version,
        error: result.error,
      };
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

  static async verifyAndDecodeRefreshToken(
    token: string,
    client: any
  ): Promise<RefreshTokenPayload> {
    const result = await this.verifyToken(token);
    if (!result.valid || !result.payload) {
      throw result.error || new Error('Invalid refresh token');
    }
    if (result.payload.client_id !== client.clientId) {
      throw new Error('Token was not issued to this client.');
    }
    return result.payload as RefreshTokenPayload;
  }

  /**
   * 获取公钥
   */
  static async getPublicKey(): Promise<CryptoKey> {
    const keyService = await KeyService.getInstance();
    const currentKey = await keyService.getCurrentKey();
    return currentKey.publicKey;
  }

  /**
   * 导出公钥为JWK格式
   */
  static async exportPublicKeyAsJWK(publicKey?: CryptoKey): Promise<jose.JWK> {
    if (publicKey) {
      return await jose.exportJWK(publicKey);
    }
    const keyService = await KeyService.getInstance();
    return await keyService.getJWK();
  }

  /**
   * Get JWK for JWKS endpoint
   */
  static async getJWK(): Promise<jose.JWK> {
    const keyService = await KeyService.getInstance();
    return await keyService.getJWK();
  }

  /**
   * Get old JWK for JWKS endpoint during rotation
   */
  static async getOldJWK(): Promise<jose.JWK | undefined> {
    const keyService = await KeyService.getInstance();
    return await keyService.getOldJWK();
  }

  /**
   * Get key information for monitoring
   */
  static async getKeyInfo() {
    const keyService = await KeyService.getInstance();
    return keyService.getKeyInfo();
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
    const publicKey = await JWTUtils.getPublicKey();
    const { payload } = await jose.jwtVerify(token, publicKey);
    return payload.sub || null;
  } catch (error) {
    console.error('JWT verification failed in getUserIdFromRequest:', error);
    return null;
  }
}
