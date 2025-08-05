import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface KeyVersion {
  version: string;
  privateKey: string;
  publicKey: string;
  createdAt: Date;
  isActive: boolean;
}

export interface KeyRotationConfig {
  rotationInterval?: number;
  maxVersions?: number;
  enableAutoRotation?: boolean;
}

export class KeyService {
  private keys: Map<string, KeyVersion> = new Map();
  private currentVersion: string = 'v1';
  private rotationInterval: number;
  private maxVersions: number;
  private enableAutoRotation: boolean;
  private rotationTimer: NodeJS.Timeout | null = null;
  private static instance: KeyService | null = null;

  constructor(config: KeyRotationConfig = {}) {
    this.rotationInterval = config.rotationInterval || 24 * 60 * 60 * 1000; // 24小时
    this.maxVersions = config.maxVersions || 3;
    this.enableAutoRotation = config.enableAutoRotation !== false;

    this.loadKeys();
  }

  public static getInstance(): KeyService {
    if (!KeyService.instance) {
      KeyService.instance = new KeyService();
    }
    return KeyService.instance;
  }

  private loadKeys(): void {
    const privateKeyPath = process.env.JWT_PRIVATE_KEY_PATH;
    const publicKeyPath = process.env.JWT_PUBLIC_KEY_PATH;
    const oldPrivateKeyPath = process.env.JWT_OLD_PRIVATE_KEY_PATH;
    const oldPublicKeyPath = process.env.JWT_OLD_PUBLIC_KEY_PATH;

    if (!privateKeyPath || !publicKeyPath) {
      throw new Error('JWT_PRIVATE_KEY_PATH and JWT_PUBLIC_KEY_PATH must be set');
    }

    // 加载当前密钥
    const currentPrivateKey = this.loadPrivateKey(privateKeyPath);
    const currentPublicKey = this.loadPublicKey(publicKeyPath);

    this.keys.set('v1', {
      version: 'v1',
      privateKey: currentPrivateKey,
      publicKey: currentPublicKey,
      createdAt: new Date(),
      isActive: true
    });

    // 加载旧版本密钥（如果存在）
    if (oldPrivateKeyPath && oldPublicKeyPath) {
      try {
        const oldPrivateKey = this.loadPrivateKey(oldPrivateKeyPath);
        const oldPublicKey = this.loadPublicKey(oldPublicKeyPath);

        this.keys.set('v0', {
          version: 'v0',
          privateKey: oldPrivateKey,
          publicKey: oldPublicKey,
          createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 设置为前一天
          isActive: false
        });
      } catch (error) {
        console.warn('Failed to load old keys:', error);
      }
    }
  }

  private loadPrivateKey(filePath: string): string {
    try {
      const keyData = fs.readFileSync(filePath, 'utf8');
      // 验证密钥格式
      if (!keyData.includes('-----BEGIN PRIVATE KEY-----') && !keyData.includes('-----BEGIN RSA PRIVATE KEY-----')) {
        throw new Error('Invalid private key format');
      }
      return keyData;
    } catch (error) {
      throw new Error(`Failed to load private key from ${filePath}: ${error}`);
    }
  }

  private loadPublicKey(filePath: string): string {
    try {
      const keyData = fs.readFileSync(filePath, 'utf8');
      // 验证密钥格式
      if (!keyData.includes('-----BEGIN PUBLIC KEY-----') && !keyData.includes('-----BEGIN RSA PUBLIC KEY-----')) {
        throw new Error('Invalid public key format');
      }
      return keyData;
    } catch (error) {
      throw new Error(`Failed to load public key from ${filePath}: ${error}`);
    }
  }

  public getCurrentPrivateKey(): string {
    const key = this.keys.get(this.currentVersion);
    if (!key) {
      throw new Error(`Current key version ${this.currentVersion} not found`);
    }
    return key.privateKey;
  }

  public getCurrentPublicKey(): string {
    const key = this.keys.get(this.currentVersion);
    if (!key) {
      throw new Error(`Current key version ${this.currentVersion} not found`);
    }
    return key.publicKey;
  }

  public getCurrentKeyVersion(): string {
    return this.currentVersion;
  }

  public getPrivateKey(version: string): string {
    const key = this.keys.get(version);
    if (!key) {
      throw new Error(`Key version ${version} not found`);
    }
    return key.privateKey;
  }

  public getPublicKey(version: string): string {
    const key = this.keys.get(version);
    if (!key) {
      throw new Error(`Key version ${version} not found`);
    }
    return key.publicKey;
  }

  public getAvailableVersions(): string[] {
    return Array.from(this.keys.keys()).sort((a, b) => {
      // 按版本号降序排列
      const versionA = parseInt(a.substring(1));
      const versionB = parseInt(b.substring(1));
      return versionB - versionA;
    });
  }

  public validateKeys(): boolean {
    try {
      const privateKey = this.getCurrentPrivateKey();
      const publicKey = this.getCurrentPublicKey();

      // 验证密钥格式
      const privateKeyValid = privateKey.includes('-----BEGIN PRIVATE KEY-----') || 
                             privateKey.includes('-----BEGIN RSA PRIVATE KEY-----');
      const publicKeyValid = publicKey.includes('-----BEGIN PUBLIC KEY-----') || 
                            publicKey.includes('-----BEGIN RSA PUBLIC KEY-----');

      return privateKeyValid && publicKeyValid;
    } catch (error) {
      return false;
    }
  }

  public async rotateKeys(): Promise<void> {
    return new Promise((resolve) => {
      // 模拟密钥轮换 - 在实际环境中应该生成新的密钥对
      const versions = this.getAvailableVersions();
      const maxVersion = versions.length > 0 ? 
        Math.max(...versions.map(v => parseInt(v.substring(1)))) : 0;
      const newVersion = `v${maxVersion + 1}`;

      // 使用当前密钥作为新密钥（实际环境中应该生成新的）
      const currentKey = this.keys.get(this.currentVersion);
      if (currentKey) {
        this.keys.set(newVersion, {
          version: newVersion,
          privateKey: currentKey.privateKey,
          publicKey: currentKey.publicKey,
          createdAt: new Date(),
          isActive: true
        });

        // 更新当前版本
        this.currentVersion = newVersion;

        // 标记旧版本为非活动状态
        for (const [version, key] of this.keys) {
          if (version !== newVersion) {
            key.isActive = false;
          }
        }

        // 清理旧版本（如果超过最大版本数）
        if (this.keys.size > this.maxVersions) {
          const sortedVersions = this.getAvailableVersions();
          const versionsToRemove = sortedVersions.slice(this.maxVersions);
          
          for (const version of versionsToRemove) {
            this.keys.delete(version);
          }
        }
      }
      
      resolve();
    });
  }

  public startAutoRotation(): void {
    if (!this.enableAutoRotation) {
      return;
    }

    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
    }

    this.rotationTimer = setInterval(() => {
      this.rotateKeys().catch(error => {
        console.error('Auto key rotation failed:', error);
      });
    }, this.rotationInterval);
  }

  public stopAutoRotation(): void {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
      this.rotationTimer = null;
    }
  }

  public isAutoRotationEnabled(): boolean {
    return this.rotationTimer !== null;
  }

  public getKeyInfo(version?: string): any {
    const keyVersion = version || this.currentVersion;
    const key = this.keys.get(keyVersion);
    
    if (!key) {
      return null;
    }

    return {
      version: key.version,
      createdAt: key.createdAt,
      isActive: key.isActive,
      keyId: crypto.createHash('sha256').update(key.publicKey).digest('hex').substring(0, 16)
    };
  }

  public async signToken(payload: any, options: any = {}): Promise<string> {
    const privateKey = this.getCurrentPrivateKey();
    const jwt = await import('jose');
    
    const privateKeyObj = await jwt.importPKCS8(privateKey, 'RS256');
    
    const tokenOptions: any = {
      algorithm: 'RS256',
      ...options
    };
    
    if (options.expiresIn) {
      tokenOptions.expiresIn = options.expiresIn;
    }
    
    return await new jwt.SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256' })
      .sign(privateKeyObj);
  }

  public async verifyToken(token: string): Promise<any> {
    const publicKey = this.getCurrentPublicKey();
    const jwt = await import('jose');
    
    try {
      const publicKeyObj = await jwt.importSPKI(publicKey, 'RS256');
      const { payload } = await jwt.jwtVerify(token, publicKeyObj, {
        algorithms: ['RS256']
      });
      
      return {
        valid: true,
        payload,
        version: this.currentVersion
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error : new Error('Token verification failed')
      };
    }
  }

  public async getJWK(): Promise<any> {
    const publicKey = this.getCurrentPublicKey();
    const jwt = await import('jose');
    const publicKeyObj = await jwt.importSPKI(publicKey, 'RS256');
    return await jwt.exportJWK(publicKeyObj);
  }

  public async getOldJWK(): Promise<any> {
    const oldVersion = this.getAvailableVersions().find(v => v !== this.currentVersion);
    if (!oldVersion) return undefined;
    
    const publicKey = this.getPublicKey(oldVersion);
    const jwt = await import('jose');
    const publicKeyObj = await jwt.importSPKI(publicKey, 'RS256');
    return await jwt.exportJWK(publicKeyObj);
  }

  public async getCurrentKey(): Promise<any> {
    const jwt = await import('jose');
    return {
      publicKey: await jwt.importSPKI(this.getCurrentPublicKey(), 'RS256'),
      privateKey: await jwt.importPKCS8(this.getCurrentPrivateKey(), 'RS256'),
      version: this.currentVersion
    };
  }
}