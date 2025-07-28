import * as jose from 'jose';
import { promises as fs } from 'fs';
import { createHash } from 'crypto';

export interface KeyVersion {
  version: string;
  privateKey: jose.KeyLike;
  publicKey: jose.KeyLike;
  createdAt: Date;
  expiresAt: Date;
  isActive: boolean;
}

export interface KeyRotationResult {
  success: boolean;
  newVersion: string;
  oldVersion?: string;
  publicKeyPem?: string;
  privateKeyPem?: string;
  error?: string;
}

export interface TokenVerificationResult {
  valid: boolean;
  payload?: jose.JWTPayload;
  version?: string;
  error?: Error;
}

export class KeyService {
  private static instance: KeyService;
  private currentKey: KeyVersion;
  private oldKey?: KeyVersion;
  private keyRotationInterval?: NodeJS.Timeout;

  private constructor(currentKey: KeyVersion, oldKey?: KeyVersion) {
    this.currentKey = currentKey;
    this.oldKey = oldKey;
  }

  /**
   * Get singleton instance of KeyService
   */
  public static async getInstance(): Promise<KeyService> {
    if (!KeyService.instance) {
      const { currentKey, oldKey } = await KeyService.initializeKeys();
      KeyService.instance = new KeyService(currentKey, oldKey);
    }
    return KeyService.instance;
  }

  /**
   * Initialize keys from environment or files
   */
  private static async initializeKeys(): Promise<{ currentKey: KeyVersion; oldKey?: KeyVersion }> {
    let currentPrivateKeyPem: string | undefined;
    let currentPublicKeyPem: string | undefined;
    let oldPrivateKeyPem: string | undefined;
    let oldPublicKeyPem: string | undefined;

    // Try to load from environment variables first
    if (process.env.JWT_PRIVATE_KEY && process.env.JWT_PUBLIC_KEY) {
      currentPrivateKeyPem = process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
      currentPublicKeyPem = process.env.JWT_PUBLIC_KEY.replace(/\\n/g, '\n');
    }

    // Try to load from file paths
    if (!currentPrivateKeyPem && process.env.JWT_PRIVATE_KEY_PATH) {
      try {
        currentPrivateKeyPem = await fs.readFile(process.env.JWT_PRIVATE_KEY_PATH, 'utf8');
      } catch (error) {
        throw new Error(`Failed to read private key from ${process.env.JWT_PRIVATE_KEY_PATH}: ${error}`);
      }
    }

    if (!currentPublicKeyPem && process.env.JWT_PUBLIC_KEY_PATH) {
      try {
        currentPublicKeyPem = await fs.readFile(process.env.JWT_PUBLIC_KEY_PATH, 'utf8');
      } catch (error) {
        throw new Error(`Failed to read public key from ${process.env.JWT_PUBLIC_KEY_PATH}: ${error}`);
      }
    }

    if (!currentPrivateKeyPem || !currentPublicKeyPem) {
      throw new Error('No JWT keys provided. Please set JWT_PRIVATE_KEY/JWT_PUBLIC_KEY environment variables or JWT_PRIVATE_KEY_PATH/JWT_PUBLIC_KEY_PATH.');
    }

    // Load old keys if provided (for rotation support)
    if (process.env.JWT_OLD_PRIVATE_KEY && process.env.JWT_OLD_PUBLIC_KEY) {
      oldPrivateKeyPem = process.env.JWT_OLD_PRIVATE_KEY.replace(/\\n/g, '\n');
      oldPublicKeyPem = process.env.JWT_OLD_PUBLIC_KEY.replace(/\\n/g, '\n');
    }

    const currentVersion = process.env.JWT_KEY_VERSION || 'v1';
    const expiresInDays = parseInt(process.env.JWT_KEY_EXPIRES_IN_DAYS || '90', 10);
    
    const currentKey = await KeyService.createKeyVersion(
      currentVersion,
      currentPrivateKeyPem,
      currentPublicKeyPem,
      expiresInDays
    );

    let oldKey: KeyVersion | undefined;
    if (oldPrivateKeyPem && oldPublicKeyPem) {
      const oldVersion = `v${parseInt(currentVersion.replace('v', ''), 10) - 1}`;
      oldKey = await KeyService.createKeyVersion(
        oldVersion,
        oldPrivateKeyPem,
        oldPublicKeyPem,
        expiresInDays
      );
    }

    return { currentKey, oldKey };
  }

  /**
   * Create a KeyVersion from PEM strings
   */
  private static async createKeyVersion(
    version: string,
    privateKeyPem: string,
    publicKeyPem: string,
    expiresInDays: number
  ): Promise<KeyVersion> {
    try {
      const privateKey = await jose.importPKCS8(privateKeyPem, 'RS256');
      const publicKey = await jose.importSPKI(publicKeyPem, 'RS256');

      const createdAt = new Date();
      const expiresAt = new Date(createdAt.getTime() + expiresInDays * 24 * 60 * 60 * 1000);

      return {
        version,
        privateKey,
        publicKey,
        createdAt,
        expiresAt,
        isActive: true,
      };
    } catch (error) {
      throw new Error(`Failed to import keys for version ${version}: ${error}`);
    }
  }

  /**
   * Get current key version
   */
  public getCurrentKeyVersion(): string {
    return this.currentKey.version;
  }

  /**
   * Get current key details
   */
  public getCurrentKey(): KeyVersion {
    return this.currentKey;
  }

  /**
   * Get old key version (if exists)
   */
  public getOldKeyVersion(): string | undefined {
    return this.oldKey?.version;
  }

  /**
   * Get old key details
   */
  public getOldKey(): KeyVersion | undefined {
    return this.oldKey;
  }

  /**
   * Rotate keys - generate new key pair and move current to old
   */
  public async rotateKeys(): Promise<KeyRotationResult> {
    try {
      // Generate new key pair
      const { privateKey, publicKey } = await jose.generateKeyPair('RS256', {
        modulusLength: 2048,
      });

      // Export keys to PEM format
      const publicKeyPem = await jose.exportSPKI(publicKey);
      const privateKeyPem = await jose.exportPKCS8(privateKey);

      // Calculate new version
      const currentVersion = parseInt(this.currentKey.version.replace('v', ''), 10);
      const newVersion = `v${currentVersion + 1}`;

      // Move current key to old key
      this.oldKey = this.currentKey;

      // Create new current key
      const expiresInDays = parseInt(process.env.JWT_KEY_EXPIRES_IN_DAYS || '90', 10);
      this.currentKey = await KeyService.createKeyVersion(
        newVersion,
        privateKeyPem,
        publicKeyPem,
        expiresInDays
      );

      return {
        success: true,
        newVersion,
        oldVersion: this.oldKey?.version,
        publicKeyPem,
        privateKeyPem,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during key rotation',
        newVersion: '',
      };
    }
  }

  /**
   * Verify token with current and old keys (for zero-downtime rotation)
   */
  public async verifyToken(token: string): Promise<TokenVerificationResult> {
    try {
      // Try current key first
      const { payload } = await jose.jwtVerify(token, this.currentKey.publicKey);
      return {
        valid: true,
        payload,
        version: this.currentKey.version,
      };
    } catch (error) {
      // If old key exists, try with old key
      if (this.oldKey) {
        try {
          const { payload } = await jose.jwtVerify(token, this.oldKey.publicKey);
          return {
            valid: true,
            payload,
            version: this.oldKey.version,
          };
        } catch (oldError) {
          // Both keys failed
          return {
            valid: false,
            error: error as Error,
          };
        }
      }

      // Only current key exists and it failed
      return {
        valid: false,
        error: error as Error,
      };
    }
  }

  /**
   * Sign token with current key
   */
  public async signToken(payload: jose.JWTPayload, options: { expiresIn?: string | number } = {}): Promise<string> {
    const jwt = await new jose.SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt()
      .setExpirationTime(options.expiresIn || '1h')
      .sign(this.currentKey.privateKey);
    
    return jwt;
  }

  /**
   * Get JWK for JWKS endpoint
   */
  public async getJWK(): Promise<jose.JWK> {
    return await jose.exportJWK(this.currentKey.publicKey);
  }

  /**
   * Get old key JWK (for JWKS endpoint during rotation)
   */
  public async getOldJWK(): Promise<jose.JWK | undefined> {
    if (!this.oldKey) return undefined;
    return await jose.exportJWK(this.oldKey.publicKey);
  }

  /**
   * Cleanup old keys after rotation period
   */
  public cleanupOldKeys(): void {
    this.oldKey = undefined;
  }

  /**
   * Schedule automatic key rotation
   */
  public scheduleKeyRotation(intervalMs: number): void {
    if (this.keyRotationInterval) {
      clearInterval(this.keyRotationInterval);
    }

    this.keyRotationInterval = setInterval(async () => {
      try {
        console.log('Starting automatic key rotation...');
        const result = await this.rotateKeys();
        if (result.success) {
          console.log(`Key rotation completed: ${result.oldVersion} -> ${result.newVersion}`);
        } else {
          console.error('Key rotation failed:', result.error);
        }
      } catch (error) {
        console.error('Error during key rotation:', error);
      }
    }, intervalMs);
  }

  /**
   * Generate new key pair for manual rotation
   */
  public static async generateKeyPair(): Promise<{ publicKeyPem: string; privateKeyPem: string }> {
    const { privateKey, publicKey } = await jose.generateKeyPair('RS256', {
      modulusLength: 2048,
    });

    const publicKeyPem = await jose.exportSPKI(publicKey);
    const privateKeyPem = await jose.exportPKCS8(privateKey);

    return { publicKeyPem, privateKeyPem };
  }

  /**
   * Cleanup resources
   */
  public cleanup(): void {
    if (this.keyRotationInterval) {
      clearInterval(this.keyRotationInterval);
      this.keyRotationInterval = undefined;
    }
  }

  /**
   * Get key information for monitoring
   */
  public getKeyInfo(): {
    current: { version: string; createdAt: Date; expiresAt: Date; daysUntilExpiry: number };
    old?: { version: string; createdAt: Date; expiresAt: Date; daysUntilExpiry: number };
  } {
    const now = new Date();
    const currentDaysUntilExpiry = Math.ceil(
      (this.currentKey.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    const result = {
      current: {
        version: this.currentKey.version,
        createdAt: this.currentKey.createdAt,
        expiresAt: this.currentKey.expiresAt,
        daysUntilExpiry: currentDaysUntilExpiry,
      },
    };

    if (this.oldKey) {
      const oldDaysUntilExpiry = Math.ceil(
        (this.oldKey.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      result.old = {
        version: this.oldKey.version,
        createdAt: this.oldKey.createdAt,
        expiresAt: this.oldKey.expiresAt,
        daysUntilExpiry: oldDaysUntilExpiry,
      };
    }

    return result;
  }
}