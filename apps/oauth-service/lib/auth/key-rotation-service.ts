/**
 * 密钥轮换服务
 * 自动管理和轮换 JWT 签名密钥
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
// import { KeyService } from '@repo/lib/node';

/**
 * 密钥信息接口
 */
export interface KeyInfo {
  version: string;
  keyId: string;
  publicKey: string;
  privateKey: string;
  createdAt: Date;
  expiresAt: Date;
  isActive: boolean;
}

/**
 * 密钥轮换配置
 */
export interface KeyRotationConfig {
  /**
   * 密钥生命周期（小时）
   */
  keyLifetimeHours?: number;
  /**
   * 提前轮换时间（小时）
   */
  rotationAdvanceHours?: number;
  /**
   * 保留的旧密钥数量
   */
  keepOldKeysCount?: number;
  /**
   * 密钥存储目录
   */
  keysDirectory?: string;
  /**
   * 是否启用自动轮换
   */
  autoRotate?: boolean;
}

/**
 * 密钥轮换服务类
 */
export class KeyRotationService {
  private keys: Map<string, KeyInfo> = new Map();
  private currentVersion: string = 'v1';
  private rotationTimer: NodeJS.Timeout | null = null;
  private config: Required<KeyRotationConfig>;
  
  constructor(config: KeyRotationConfig = {}) {
    this.config = {
      keyLifetimeHours: config.keyLifetimeHours ?? 24 * 30, // 30天
      rotationAdvanceHours: config.rotationAdvanceHours ?? 24 * 7, // 7天
      keepOldKeysCount: config.keepOldKeysCount ?? 2,
      keysDirectory: config.keysDirectory ?? './keys',
      autoRotate: config.autoRotate ?? true,
    };
    
    this.initializeKeys();
  }
  
  /**
   * 初始化密钥
   */
  private async initializeKeys(): Promise<void> {
    try {
      // 确保密钥目录存在
      if (!fs.existsSync(this.config.keysDirectory)) {
        fs.mkdirSync(this.config.keysDirectory, { recursive: true });
      }
      
      // 加载现有密钥
      await this.loadExistingKeys();
      
      // 检查是否需要生成新密钥
      await this.checkAndRotateKeys();
      
      // 启动自动轮换
      if (this.config.autoRotate) {
        this.startAutoRotation();
      }
    } catch (error) {
      console.error('[KeyRotationService] Failed to initialize:', error);
      throw error;
    }
  }
  
  /**
   * 加载现有密钥
   */
  private async loadExistingKeys(): Promise<void> {
    try {
      const files = fs.readdirSync(this.config.keysDirectory);
      
      for (const file of files) {
        if (file.endsWith('.pub') || file.endsWith('.key')) {
          const match = file.match(/^(v\d+)\.(pub|key)$/);
          if (match && match[1] && match[2]) {
            const version = match[1];
            const isPublic = match[2] === 'pub';
            
            if (isPublic) {
              const keyPath = path.join(this.config.keysDirectory, file);
              const publicKey = fs.readFileSync(keyPath, 'utf8');
              
              // 检查是否有对应的私钥
              const privateKeyPath = path.join(this.config.keysDirectory, `${version}.key`);
              if (fs.existsSync(privateKeyPath)) {
                const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
                
                // 从文件名或内容中提取创建时间
                const stats = fs.statSync(keyPath);
                const createdAt = stats.birthtime;
                const expiresAt = new Date(createdAt.getTime() + this.config.keyLifetimeHours * 60 * 60 * 1000);
                
                const keyId = this.generateKeyId(publicKey);
                
                this.keys.set(version, {
                  version,
                  keyId,
                  publicKey,
                  privateKey,
                  createdAt,
                  expiresAt,
                  isActive: version === this.currentVersion,
                });
              }
            }
          }
        }
      }
      
      // 如果没有密钥，生成初始密钥
      if (this.keys.size === 0) {
        await this.generateNewKey();
      }
      
      console.log(`[KeyRotationService] Loaded ${this.keys.size} keys`);
    } catch (error) {
      console.error('[KeyRotationService] Failed to load existing keys:', error);
    }
  }
  
  /**
   * 生成新的密钥对
   */
  private async generateNewKey(): Promise<KeyInfo> {
    const { publicKey, privateKey } = await this.generateKeyPair();
    const version = this.getNextVersion();
    const keyId = this.generateKeyId(publicKey);
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + this.config.keyLifetimeHours * 60 * 60 * 1000);
    
    const keyInfo: KeyInfo = {
      version,
      keyId,
      publicKey,
      privateKey,
      createdAt,
      expiresAt,
      isActive: true,
    };
    
    // 保存到文件
    this.saveKeyToFile(keyInfo);
    
    // 添加到内存
    this.keys.set(version, keyInfo);
    this.currentVersion = version;
    
    // 标记其他密钥为非活动
    for (const [v, key] of this.keys) {
      if (v !== version) {
        key.isActive = false;
      }
    }
    
    console.log(`[KeyRotationService] Generated new key: ${version}`);
    return keyInfo;
  }
  
  /**
   * 生成 RSA 密钥对
   */
  private async generateKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
    const { generateKeyPair } = await import('crypto');
    
    return new Promise((resolve, reject) => {
      generateKeyPair(
        'rsa',
        {
          modulusLength: 4096,
          publicExponent: 0x10001,
          privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem',
          },
          publicKeyEncoding: {
            type: 'spki',
            format: 'pem',
          },
        },
        (err, publicKey, privateKey) => {
          if (err) {
            reject(err);
          } else {
            resolve({ publicKey, privateKey });
          }
        }
      );
    });
  }
  
  /**
   * 保存密钥到文件
   */
  private saveKeyToFile(keyInfo: KeyInfo): void {
    const publicKeyPath = path.join(this.config.keysDirectory, `${keyInfo.version}.pub`);
    const privateKeyPath = path.join(this.config.keysDirectory, `${keyInfo.version}.key`);
    
    fs.writeFileSync(publicKeyPath, keyInfo.publicKey);
    fs.writeFileSync(privateKeyPath, keyInfo.privateKey);
    
    // 设置文件权限（仅所有者可读写）
    fs.chmodSync(privateKeyPath, 0o600);
    fs.chmodSync(publicKeyPath, 0o644);
  }
  
  /**
   * 获取下一个版本号
   */
  private getNextVersion(): string {
    const versions = Array.from(this.keys.keys())
      .filter(v => v.startsWith('v'))
      .map(v => parseInt(v.substring(1)))
      .filter(v => !isNaN(v));
    
    const maxVersion = versions.length > 0 ? Math.max(...versions) : 0;
    return `v${maxVersion + 1}`;
  }
  
  /**
   * 生成密钥 ID
   */
  private generateKeyId(publicKey: string): string {
    return crypto.createHash('sha256').update(publicKey).digest('hex').substring(0, 16);
  }
  
  /**
   * 检查并轮换密钥
   */
  private async checkAndRotateKeys(): Promise<void> {
    const currentKey = this.keys.get(this.currentVersion);
    
    if (!currentKey) {
      await this.generateNewKey();
      return;
    }
    
    const now = new Date();
    const rotationTime = new Date(currentKey.expiresAt.getTime() - this.config.rotationAdvanceHours * 60 * 60 * 1000);
    
    // 如果当前密钥即将过期，生成新密钥
    if (now >= rotationTime) {
      await this.generateNewKey();
      
      // 清理旧密钥
      await this.cleanupOldKeys();
    }
  }
  
  /**
   * 清理旧密钥
   */
  private async cleanupOldKeys(): Promise<void> {
    const versions = Array.from(this.keys.entries())
      .sort((a, b) => a[1].createdAt.getTime() - b[1].createdAt.getTime())
      .map(([version]) => version);
    
    const keepCount = this.config.keepOldKeysCount;
    
    if (versions.length > keepCount) {
      const toDelete = versions.slice(0, versions.length - keepCount);
      
      for (const version of toDelete) {
        const keyInfo = this.keys.get(version);
        if (keyInfo) {
          // 删除文件
          const publicKeyPath = path.join(this.config.keysDirectory, `${version}.pub`);
          const privateKeyPath = path.join(this.config.keysDirectory, `${version}.key`);
          
          try {
            if (fs.existsSync(publicKeyPath)) fs.unlinkSync(publicKeyPath);
            if (fs.existsSync(privateKeyPath)) fs.unlinkSync(privateKeyPath);
            this.keys.delete(version);
            console.log(`[KeyRotationService] Deleted old key: ${version}`);
          } catch (error) {
            console.error(`[KeyRotationService] Failed to delete key ${version}:`, error);
          }
        }
      }
    }
  }
  
  /**
   * 启动自动轮换
   */
  private startAutoRotation(): void {
    // 每小时检查一次
    this.rotationTimer = setInterval(async () => {
      try {
        await this.checkAndRotateKeys();
      } catch (error) {
        console.error('[KeyRotationService] Auto rotation failed:', error);
      }
    }, 60 * 60 * 1000);
    
    console.log('[KeyRotationService] Auto rotation started');
  }
  
  /**
   * 停止自动轮换
   */
  stopAutoRotation(): void {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
      this.rotationTimer = null;
      console.log('[KeyRotationService] Auto rotation stopped');
    }
  }
  
  /**
   * 获取当前密钥
   */
  getCurrentKey(): KeyInfo | null {
    return this.keys.get(this.currentVersion) || null;
  }
  
  /**
   * 获取所有密钥
   */
  getAllKeys(): KeyInfo[] {
    return Array.from(this.keys.values()).sort((a, b) => 
      b.createdAt.getTime() - a.createdAt.getTime()
    );
  }
  
  /**
   * 根据 keyId 获取密钥
   */
  getKeyByKeyId(keyId: string): KeyInfo | null {
    for (const key of this.keys.values()) {
      if (key.keyId === keyId) {
        return key;
      }
    }
    return null;
  }
  
  /**
   * 手动轮换密钥
   */
  async rotateKey(): Promise<KeyInfo> {
    await this.generateNewKey();
    await this.cleanupOldKeys();
    return this.getCurrentKey()!;
  }
}

/**
 * 全局密钥轮换服务实例
 */
let globalKeyRotationService: KeyRotationService | null = null;

/**
 * 获取密钥轮换服务实例
 */
export function getKeyRotationService(): KeyRotationService {
  if (!globalKeyRotationService) {
    globalKeyRotationService = new KeyRotationService();
  }
  return globalKeyRotationService;
}

/**
 * 初始化密钥轮换服务
 */
export async function initializeKeyRotation(config?: KeyRotationConfig): Promise<KeyRotationService> {
  globalKeyRotationService = new KeyRotationService(config);
  return globalKeyRotationService;
}