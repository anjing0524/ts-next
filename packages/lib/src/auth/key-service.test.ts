import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as jose from 'jose';
import { KeyService, KeyVersion } from './key-service';

// Mock jose module
jest.mock('jose', () => ({
  ...jest.requireActual('jose'),
  importSPKI: jest.fn(),
  importPKCS8: jest.fn(),
  generateKeyPair: jest.fn(),
  exportSPKI: jest.fn(),
  exportPKCS8: jest.fn(),
})));

// Mock fs module for file operations
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    access: jest.fn(),
  },
})));

describe('KeyService', () => {
  let keyService: KeyService;
  let mockPrivateKey: any;
  let mockPublicKey: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mock keys
    mockPrivateKey = { type: 'private' };
    mockPublicKey = { type: 'public' };
    
    // Reset environment variables
    delete process.env.JWT_PRIVATE_KEY;
    delete process.env.JWT_PUBLIC_KEY;
    delete process.env.JWT_PRIVATE_KEY_PATH;
    delete process.env.JWT_PUBLIC_KEY_PATH;
    delete process.env.JWT_KEY_VERSION;
    delete process.env.JWT_OLD_PRIVATE_KEY;
    delete process.env.JWT_OLD_PUBLIC_KEY;
  });

  afterEach(() => {
    keyService?.cleanup();
  });

  describe('key loading', () => {
    it('should load keys from environment variables', async () => {
      process.env.JWT_PRIVATE_KEY = 'mock-private-key';
      process.env.JWT_PUBLIC_KEY = 'mock-public-key';
      
      const importPKCS8Mock = jose.importPKCS8 as jest.MockedFunction<typeof jose.importPKCS8>;
      const importSPKIMock = jose.importSPKI as jest.MockedFunction<typeof jose.importSPKI>;
      
      importPKCS8Mock.mockResolvedValueOnce(mockPrivateKey);
      importSPKIMock.mockResolvedValueOnce(mockPublicKey);
      
      keyService = await KeyService.getInstance();
      
      expect(importPKCS8Mock).toHaveBeenCalledWith('mock-private-key', 'RS256');
      expect(importSPKIMock).toHaveBeenCalledWith('mock-public-key', 'RS256');
      expect(keyService.getCurrentKeyVersion()).toBe('v1');
    });

    it('should load keys from file paths', async () => {
      const fs = require('fs');
      process.env.JWT_PRIVATE_KEY_PATH = '/path/to/private.key';
      process.env.JWT_PUBLIC_KEY_PATH = '/path/to/public.key';
      
      const readFileMock = fs.promises.readFile as jest.MockedFunction<any>;
      readFileMock.mockImplementation(async (path: string) => {
        if (path.includes('private.key')) return 'file-private-key';
        if (path.includes('public.key')) return 'file-public-key';
        throw new Error('File not found');
      });
      
      const importPKCS8Mock = jose.importPKCS8 as jest.MockedFunction<typeof jose.importPKCS8>;
      const importSPKIMock = jose.importSPKI as jest.MockedFunction<typeof jose.importSPKI>;
      
      importPKCS8Mock.mockResolvedValueOnce(mockPrivateKey);
      importSPKIMock.mockResolvedValueOnce(mockPublicKey);
      
      keyService = await KeyService.getInstance();
      
      expect(readFileMock).toHaveBeenCalledWith('/path/to/private.key', 'utf8');
      expect(readFileMock).toHaveBeenCalledWith('/path/to/public.key', 'utf8');
    });

    it('should throw error when keys are not provided', async () => {
      await expect(KeyService.getInstance()).rejects.toThrow(
        'No JWT keys provided'
      );
    });

    it('should handle key loading errors gracefully', async () => {
      process.env.JWT_PRIVATE_KEY = 'invalid-private-key';
      process.env.JWT_PUBLIC_KEY = 'invalid-public-key';
      
      const importPKCS8Mock = jose.importPKCS8 as jest.MockedFunction<typeof jose.importPKCS8>;
      importPKCS8Mock.mockRejectedValueOnce(new Error('Invalid key format'));
      
      await expect(KeyService.getInstance()).rejects.toThrow('Invalid key format');
    });
  });

  describe('key rotation', () => {
    it('should support key rotation with old keys', async () => {
      process.env.JWT_PRIVATE_KEY = 'new-private-key';
      process.env.JWT_PUBLIC_KEY = 'new-public-key';
      process.env.JWT_OLD_PRIVATE_KEY = 'old-private-key';
      process.env.JWT_OLD_PUBLIC_KEY = 'old-public-key';
      process.env.JWT_KEY_VERSION = 'v2';
      
      const importPKCS8Mock = jose.importPKCS8 as jest.MockedFunction<typeof jose.importPKCS8>;
      const importSPKIMock = jose.importSPKI as jest.MockedFunction<typeof jose.importSPKI>;
      
      importPKCS8Mock
        .mockResolvedValueOnce(mockPrivateKey) // new private key
        .mockResolvedValueOnce({ type: 'old-private' }); // old private key
      importSPKIMock
        .mockResolvedValueOnce(mockPublicKey) // new public key
        .mockResolvedValueOnce({ type: 'old-public' }); // old public key
      
      keyService = await KeyService.getInstance();
      
      expect(keyService.getCurrentKeyVersion()).toBe('v2');
      expect(keyService.getOldKeyVersion()).toBe('v1');
      expect(importPKCS8Mock).toHaveBeenCalledTimes(2);
      expect(importSPKIMock).toHaveBeenCalledTimes(2);
    });

    it('should rotate keys without downtime', async () => {
      process.env.JWT_PRIVATE_KEY = 'current-private-key';
      process.env.JWT_PUBLIC_KEY = 'current-public-key';
      
      const importPKCS8Mock = jose.importPKCS8 as jest.MockedFunction<typeof jose.importPKCS8>;
      const importSPKIMock = jose.importSPKI as jest.MockedFunction<typeof jose.importSPKI>;
      const generateKeyPairMock = jose.generateKeyPair as jest.MockedFunction<typeof jose.generateKeyPair>;
      const exportSPKIMock = jose.exportSPKI as jest.MockedFunction<typeof jose.exportSPKI>;
      const exportPKCS8Mock = jose.exportPKCS8 as jest.MockedFunction<typeof jose.exportPKCS8>;
      
      importPKCS8Mock.mockResolvedValue(mockPrivateKey);
      importSPKIMock.mockResolvedValue(mockPublicKey);
      generateKeyPairMock.mockResolvedValue({ privateKey: mockPrivateKey, publicKey: mockPublicKey });
      exportSPKIMock.mockResolvedValue('generated-public-key');
      exportPKCS8Mock.mockResolvedValue('generated-private-key');
      
      keyService = await KeyService.getInstance();
      
      // Mock new keys
      const newPrivateKey = { type: 'new-private' };
      const newPublicKey = {: 'new-public' };
      generateKeyPairMock.mockResolvedValue({ privateKey: newPrivateKey, publicKey: newPublicKey });
      exportSPKIMock.mockResolvedValue('new-public-key-content');
      exportPKCS8Mock.mockResolvedValue('new-private-key-content');
      
      const result = await keyService.rotateKeys();
      
      expect(result.success).toBe(true);
      expect(result.newVersion).toBe('v2');
      expect(result.oldVersion).toBe('v1');
    });
  });

  describe('key validation', () => {
    it('should validate tokens with current keys', async () => {
      process.env.JWT_PRIVATE_KEY = 'current-private-key';
      process.env.JWT_PUBLIC_KEY = 'current-public-key';
      
      const importPKCS8Mock = jose.importPKCS8 as jest.MockedFunction<typeof jose.importPKCS8>;
      const importSPKIMock = jose.importSPKI as jest.MockedFunction<typeof jose.importSPKI>;
      
      importPKCS8Mock.mockResolvedValue(mockPrivateKey);
      importSPKIMock.mockResolvedValue(mockPublicKey);
      
      keyService = await KeyService.getInstance();
      
      // Mock JWT verification
      const mockPayload = { sub: 'user123', exp: Date.now() + 3600000 };
      jest.spyOn(jose, 'jwtVerify').mockResolvedValue({ payload: mockPayload } as any);
      
      const result = await keyService.verifyToken('test-token');
      expect(result.valid).toBe(true);
      expect(result.payload).toEqual(mockPayload);
    });

    it('should validate tokens with old keys during rotation', async () => {
      process.env.JWT_PRIVATE_KEY = 'new-private-key';
      process.env.JWT_PUBLIC_KEY = 'new-public-key';
      process.env.JWT_OLD_PRIVATE_KEY = 'old-private-key';
      process.env.JWT_OLD_PUBLIC_KEY = 'old-public-key';
      
      const importPKCS8Mock = jose.importPKCS8 as jest.MockedFunction<typeof jose.importPKCS8>;
      const importSPKIMock = jose.importSPKI as jest.MockedFunction<typeof jose.importSPKI>;
      
      importPKCS8Mock
        .mockResolvedValueOnce(mockPrivateKey)
        .mockResolvedValueOnce({ type: 'old-private' });
      importSPKIMock
        .mockResolvedValueOnce(mockPublicKey)
        .mockResolvedValueOnce({ type: 'old-public' });
      
      keyService = await KeyService.getInstance();
      
      // Mock JWT verification - first attempt fails, second succeeds
      const mockPayload = { sub: 'user123', exp: Date.now() + 3600000 };
      jest.spyOn(jose, 'jwtVerify')
        .mockRejectedValueOnce(new Error('Invalid signature'))
        .mockResolvedValueOnce({ payload: mockPayload } as any);
      
      const result = await keyService.verifyToken('test-token');
      expect(result.valid).toBe(true);
      expect(result.payload).toEqual(mockPayload);
    });
  });

  describe('key lifecycle', () => {
    it('should track key creation and expiration', async () => {
      process.env.JWT_PRIVATE_KEY = 'private-key';
      process.env.JWT_PUBLIC_KEY = 'public-key';
      process.env.JWT_KEY_VERSION = 'v1';
      
      const importPKCS8Mock = jose.importPKCS8 as jest.MockedFunction<typeof jose.importPKCS8>;
      const importSPKIMock = jose.importSPKI as jest.MockedFunction<typeof jose.importSPKI>;
      
      importPKCS8Mock.mockResolvedValue(mockPrivateKey);
      importSPKIMock.mockResolvedValue(mockPublicKey);
      
      keyService = await KeyService.getInstance();
      
      const currentKey = keyService.getCurrentKey();
      expect(currentKey.version).toBe('v1');
      expect(currentKey.createdAt).toBeInstanceOf(Date);
      expect(currentKey.expiresAt).toBeInstanceOf(Date);
    });

    it('should cleanup old keys after rotation period', async () => {
      process.env.JWT_PRIVATE_KEY = 'new-private-key';
      process.env.JWT_PUBLIC_KEY = 'new-public-key';
      process.env.JWT_OLD_PRIVATE_KEY = 'old-private-key';
      process.env.JWT_OLD_PUBLIC_KEY = 'old-public-key';
      
      const importPKCS8Mock = jose.importPKCS8 as jest.MockedFunction<typeof jose.importPKCS8>;
      const importSPKIMock = jose.importSPKI as jest.MockedFunction<typeof jose.importSPKI>;
      
      importPKCS8Mock
        .mockResolvedValueOnce(mockPrivateKey)
        .mockResolvedValueOnce({ type: 'old-private' });
      importSPKIMock
        .mockResolvedValueOnce(mockPublicKey)
        .mockResolvedValueOnce({ type: 'old-public' });
      
      keyService = await KeyService.getInstance();
      
      expect(keyService.getOldKeyVersion()).toBe('v1');
      
      keyService.cleanupOldKeys();
      
      expect(keyService.getOldKeyVersion()).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('should handle key loading errors', async () => {
      process.env.JWT_PRIVATE_KEY = 'private-key';
      process.env.JWT_PUBLIC_KEY = 'public-key';
      
      const importPKCS8Mock = jose.importPKCS8 as jest.MockedFunction<typeof jose.importPKCS8>;
      importPKCS8Mock.mockRejectedValue(new Error('Key format error'));
      
      await expect(KeyService.getInstance()).rejects.toThrow('Key format error');
    });

    it('should handle token verification errors', async () => {
      process.env.JWT_PRIVATE_KEY = 'private-key';
      process.env.JWT_PUBLIC_KEY = 'public-key';
      
      const importPKCS8Mock = jose.importPKCS8 as jest.MockedFunction<typeof jose.importPKCS8>;
      const importSPKIMock = jose.importSPKI as jest.MockedFunction<typeof jose.importSPKI>;
      
      importPKCS8Mock.mockResolvedValue(mockPrivateKey);
      importSPKIMock.mockResolvedValue(mockPublicKey);
      
      keyService = await KeyService.getInstance();
      
      jest.spyOn(jose, 'jwtVerify').mockRejectedValue(new Error('Token expired'));
      
      const result = await keyService.verifyToken('expired-token');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('singleton behavior', () => {
    it('should return the same instance for multiple calls', async () => {
      process.env.JWT_PRIVATE_KEY = 'private-key';
      process.env.JWT_PUBLIC_KEY = 'public-key';
      
      const importPKCS8Mock = jose.importPKCS8 as jest.MockedFunction<typeof jose.importPKCS8>;
      const importSPKIMock = jose.importSPKI as jest.MockedFunction<typeof jose.importSPKI>;
      
      importPKCS8Mock.mockResolvedValue(mockPrivateKey);
      importSPKIMock.mockResolvedValue(mockPublicKey);
      
      const instance1 = await KeyService.getInstance();
      const instance2 = await KeyService.getInstance();
      
      expect(instance1).toBe(instance2);
    });
  });
});