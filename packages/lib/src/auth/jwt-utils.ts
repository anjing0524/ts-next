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

/**
 * 获取或生成JWT密钥对
 */
async function getOrGenerateKeyPair(): Promise<{ publicKey: jose.KeyLike; privateKey: jose.KeyLike }> {
  const publicKeyPem = process.env.JWT_PUBLIC_KEY;
  const privateKeyPem = process.env.JWT_PRIVATE_KEY;

  if (publicKeyPem && privateKeyPem) {
    try {
      // 确保PEM格式正确
      const cleanPublicKey = publicKeyPem.replace(/\\n/g, '\n');
      const cleanPrivateKey = privateKeyPem.replace(/\\n/g, '\n');
      
      const publicKey = await jose.importSPKI(cleanPublicKey, 'RS256');
      const privateKey = await jose.importPKCS8(cleanPrivateKey, 'RS256');
      
      console.log('Successfully imported existing JWT keys');
      return { publicKey, privateKey };
    } catch (error) {
      console.warn('Failed to import existing JWT keys, generating new ones:', error);
    }
  }

  // 生成新的密钥对
  console.log('Generating new JWT key pair...');
  const { publicKey, privateKey } = await jose.generateKeyPair('RS256', {
    modulusLength: 2048,
  });

  // 导出密钥为PEM格式
  const publicKeyPemNew = await jose.exportSPKI(publicKey);
  const privateKeyPemNew = await jose.exportPKCS8(privateKey);

  console.log('Generated new JWT keys. Please update your environment variables:');
  console.log('JWT_PUBLIC_KEY=' + publicKeyPemNew);
  console.log('JWT_PRIVATE_KEY=' + privateKeyPemNew);

  return { publicKey, privateKey };
}

async function getPublicKey(): Promise<jose.KeyLike> {
  const { publicKey } = await getOrGenerateKeyPair();
  return publicKey;
}

async function getPrivateKey(): Promise<jose.KeyLike> {
  const { privateKey } = await getOrGenerateKeyPair();
  return privateKey;
}

// --- Main JWT Utility Class ---

export class JWTUtils {
  static async generateToken(payload: JWTPayload, options: JWTOptions = {}): Promise<string> {
    try {
      const privateKey = await getPrivateKey();
      const jwt = await new jose.SignJWT(payload)
        .setProtectedHeader({ alg: 'RS256' })
        .setIssuedAt()
        .setExpirationTime(options.expiresIn || '1h')
        .sign(privateKey);
      return jwt;
    } catch (error) {
      console.error('Failed to generate JWT token:', error);
      throw new Error(`JWT token generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
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

  /**
   * 获取公钥
   */
  static async getPublicKey(): Promise<jose.KeyLike> {
    return await getPublicKey();
  }

  /**
   * 导出公钥为JWK格式
   */
  static async exportPublicKeyAsJWK(publicKey: jose.KeyLike): Promise<jose.JWK> {
    return await jose.exportJWK(publicKey);
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