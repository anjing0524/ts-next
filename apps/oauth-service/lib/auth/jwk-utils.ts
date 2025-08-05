import * as crypto from 'crypto';

export interface JWK {
  kty: string;
  kid: string;
  use: string;
  alg: string;
  n?: string;
  e?: string;
  x?: string;
  y?: string;
  crv?: string;
}

export interface JWKS {
  keys: JWK[];
}

/**
 * Convert a PEM formatted RSA public key to JWK format
 * @param pem The PEM formatted public key
 * @param keyId The key identifier
 * @returns JWK object or null if conversion fails
 */
export function rsaPublicKeyToJwk(pem: string, keyId: string): JWK | null {
  try {
    // Clean the PEM string
    const cleanPem = pem
      .replace(/-----BEGIN PUBLIC KEY-----/g, '')
      .replace(/-----END PUBLIC KEY-----/g, '')
      .replace(/-----BEGIN RSA PUBLIC KEY-----/g, '')
      .replace(/-----END RSA PUBLIC KEY-----/g, '')
      .replace(/\s/g, '');

    // Decode base64
    const keyBuffer = Buffer.from(cleanPem, 'base64');
    
    // Parse the key using crypto
    const keyObject = crypto.createPublicKey({
      key: keyBuffer,
      format: 'der',
      type: 'spki'
    });

    // Export as JWK
    const jwk = keyObject.export({ format: 'jwk' });
    
    if (jwk.kty !== 'RSA') {
      throw new Error('Key is not RSA');
    }

    return {
      kty: 'RSA',
      kid: keyId,
      use: 'sig',
      alg: 'RS256',
      n: jwk.n,
      e: jwk.e
    };
  } catch (error) {
    console.error('Error converting RSA public key to JWK:', error);
    return null;
  }
}

/**
 * Validate if a string is a valid RSA public key in PEM format
 * @param pem The string to validate
 * @returns boolean indicating if the string is a valid RSA public key
 */
export function isValidRsaPublicKey(pem: string): boolean {
  try {
    const cleanPem = pem
      .replace(/-----BEGIN PUBLIC KEY-----/g, '')
      .replace(/-----END PUBLIC KEY-----/g, '')
      .replace(/-----BEGIN RSA PUBLIC KEY-----/g, '')
      .replace(/-----END RSA PUBLIC KEY-----/g, '')
      .replace(/\s/g, '');

    if (!cleanPem) {
      return false;
    }

    const keyBuffer = Buffer.from(cleanPem, 'base64');
    crypto.createPublicKey({
      key: keyBuffer,
      format: 'der',
      type: 'spki'
    });
    return true;
  } catch (_error) {
    return false;
  }
}

/**
 * Generate a key ID from a public key
 * @param publicKey The public key string
 * @returns A short key identifier
 */
export function generateKeyId(publicKey: string): string {
  return crypto
    .createHash('sha256')
    .update(publicKey)
    .digest('hex')
    .substring(0, 8);
}