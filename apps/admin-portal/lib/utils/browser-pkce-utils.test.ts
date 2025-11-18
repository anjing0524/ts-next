/**
 * Unit tests for BrowserPKCEUtils
 */

import { describe, it, expect, beforeEach, beforeAll, afterAll } from '@jest/globals';
import { BrowserPKCEUtils, browserPKCE } from './browser-pkce-utils';

// Mock crypto.subtle for jsdom environment
const mockDigest = async (algorithm: string, data: BufferSource): Promise<ArrayBuffer> => {
  // Simple mock that returns deterministic hash based on input
  const input = new Uint8Array(data as ArrayBuffer);
  const hash = new Uint8Array(32); // SHA-256 produces 32 bytes

  // Generate deterministic hash for testing
  for (let i = 0; i < 32; i++) {
    let sum = 0;
    for (let j = 0; j < input.length; j++) {
      sum += input[j] * (i + 1) * (j + 1);
    }
    hash[i] = sum % 256;
  }

  return hash.buffer;
};

describe('BrowserPKCEUtils', () => {
  // Save original crypto methods
  const originalGetRandomValues = crypto.getRandomValues;
  const originalSubtle = crypto.subtle;

  beforeAll(() => {
    // Mock crypto.subtle for jsdom environment
    if (!global.crypto.subtle) {
      Object.defineProperty(global.crypto, 'subtle', {
        value: {
          digest: mockDigest,
        },
        writable: true,
        configurable: true,
      });
    }
  });

  afterAll(() => {
    // Restore original crypto.subtle
    if (originalSubtle) {
      Object.defineProperty(global.crypto, 'subtle', {
        value: originalSubtle,
        writable: true,
        configurable: true,
      });
    }
  });

  beforeEach(() => {
    // Restore original crypto methods before each test
    global.crypto.getRandomValues = originalGetRandomValues;
  });

  describe('generateCodeVerifier', () => {
    it('should generate a code verifier with correct length', () => {
      const verifier = BrowserPKCEUtils.generateCodeVerifier();

      expect(typeof verifier).toBe('string');
      expect(verifier.length).toBe(128);
    });

    it('should generate different verifiers on each call', () => {
      const verifier1 = BrowserPKCEUtils.generateCodeVerifier();
      const verifier2 = BrowserPKCEUtils.generateCodeVerifier();

      expect(verifier1).not.toBe(verifier2);
    });

    it('should generate Base64URL-safe characters only', () => {
      const verifier = BrowserPKCEUtils.generateCodeVerifier();

      // Base64URL characters: A-Z, a-z, 0-9, -, _
      const base64URLRegex = /^[A-Za-z0-9\-_]+$/;
      expect(base64URLRegex.test(verifier)).toBe(true);
    });

    it('should not contain padding characters', () => {
      const verifier = BrowserPKCEUtils.generateCodeVerifier();

      expect(verifier).not.toContain('=');
    });

    it('should be RFC 7636 compliant (43-128 characters)', () => {
      const verifier = BrowserPKCEUtils.generateCodeVerifier();

      expect(verifier.length).toBeGreaterThanOrEqual(43);
      expect(verifier.length).toBeLessThanOrEqual(128);
    });
  });

  describe('generateCodeChallenge', () => {
    it('should generate a code challenge from a verifier', async () => {
      const verifier = BrowserPKCEUtils.generateCodeVerifier();
      const challenge = await BrowserPKCEUtils.generateCodeChallenge(verifier);

      expect(typeof challenge).toBe('string');
      expect(challenge.length).toBeGreaterThan(0);
    });

    it('should generate consistent challenge for same verifier', async () => {
      const verifier = 'test_verifier_12345678901234567890123456789012';
      const challenge1 = await BrowserPKCEUtils.generateCodeChallenge(verifier);
      const challenge2 = await BrowserPKCEUtils.generateCodeChallenge(verifier);

      expect(challenge1).toBe(challenge2);
    });

    it('should generate different challenges for different verifiers', async () => {
      const verifier1 = 'verifier_1_1234567890123456789012345678901234';
      const verifier2 = 'verifier_2_1234567890123456789012345678901234';

      const challenge1 = await BrowserPKCEUtils.generateCodeChallenge(verifier1);
      const challenge2 = await BrowserPKCEUtils.generateCodeChallenge(verifier2);

      expect(challenge1).not.toBe(challenge2);
    });

    it('should generate Base64URL-encoded string', async () => {
      const verifier = BrowserPKCEUtils.generateCodeVerifier();
      const challenge = await BrowserPKCEUtils.generateCodeChallenge(verifier);

      const base64URLRegex = /^[A-Za-z0-9\-_]+$/;
      expect(base64URLRegex.test(challenge)).toBe(true);
    });

    it('should not contain padding characters', async () => {
      const verifier = BrowserPKCEUtils.generateCodeVerifier();
      const challenge = await BrowserPKCEUtils.generateCodeChallenge(verifier);

      expect(challenge).not.toContain('=');
    });

    it('should generate challenge with length of 43 (SHA256 Base64URL)', async () => {
      const verifier = BrowserPKCEUtils.generateCodeVerifier();
      const challenge = await BrowserPKCEUtils.generateCodeChallenge(verifier);

      // SHA256 hash is 32 bytes, Base64URL encoded is 43 characters (without padding)
      expect(challenge.length).toBe(43);
    });
  });

  describe('verifyPKCE', () => {
    it('should verify matching verifier and challenge', async () => {
      const verifier = BrowserPKCEUtils.generateCodeVerifier();
      const challenge = await BrowserPKCEUtils.generateCodeChallenge(verifier);

      const isValid = await BrowserPKCEUtils.verifyPKCE(verifier, challenge);
      expect(isValid).toBe(true);
    });

    it('should reject non-matching verifier and challenge', async () => {
      const verifier1 = 'verifier_1_1234567890123456789012345678901234';
      const verifier2 = 'verifier_2_1234567890123456789012345678901234';
      const challenge = await BrowserPKCEUtils.generateCodeChallenge(verifier1);

      const isValid = await BrowserPKCEUtils.verifyPKCE(verifier2, challenge);
      expect(isValid).toBe(false);
    });

    it('should return false for invalid challenge format', async () => {
      const verifier = BrowserPKCEUtils.generateCodeVerifier();
      const invalidChallenge = 'invalid-challenge';

      const isValid = await BrowserPKCEUtils.verifyPKCE(verifier, invalidChallenge);
      expect(isValid).toBe(false);
    });

    it('should handle errors gracefully', async () => {
      const verifier = 'test';
      const challenge = 'test';

      const isValid = await BrowserPKCEUtils.verifyPKCE(verifier, challenge);
      expect(isValid).toBe(false);
    });
  });

  describe('validateCodeChallenge', () => {
    it('should accept valid code challenge', async () => {
      const verifier = BrowserPKCEUtils.generateCodeVerifier();
      const challenge = await BrowserPKCEUtils.generateCodeChallenge(verifier);

      const isValid = BrowserPKCEUtils.validateCodeChallenge(challenge);
      expect(isValid).toBe(true);
    });

    it('should accept 43-character Base64URL string', () => {
      const validChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

      const isValid = BrowserPKCEUtils.validateCodeChallenge(validChallenge);
      expect(isValid).toBe(true);
    });

    it('should reject challenge shorter than 43 characters', () => {
      const shortChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuG';

      const isValid = BrowserPKCEUtils.validateCodeChallenge(shortChallenge);
      expect(isValid).toBe(false);
    });

    it('should reject challenge longer than 43 characters', () => {
      const longChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cMExtra';

      const isValid = BrowserPKCEUtils.validateCodeChallenge(longChallenge);
      expect(isValid).toBe(false);
    });

    it('should reject challenge with invalid characters', () => {
      const invalidChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJ+stw/cM'; // + and / are not Base64URL

      const isValid = BrowserPKCEUtils.validateCodeChallenge(invalidChallenge);
      expect(isValid).toBe(false);
    });

    it('should reject challenge with padding', () => {
      const paddedChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw=cM';

      const isValid = BrowserPKCEUtils.validateCodeChallenge(paddedChallenge);
      expect(isValid).toBe(false);
    });

    it('should reject empty string', () => {
      const isValid = BrowserPKCEUtils.validateCodeChallenge('');
      expect(isValid).toBe(false);
    });
  });

  describe('validateCodeVerifier', () => {
    it('should accept valid code verifier', () => {
      const verifier = BrowserPKCEUtils.generateCodeVerifier();

      const isValid = BrowserPKCEUtils.validateCodeVerifier(verifier);
      expect(isValid).toBe(true);
    });

    it('should accept verifier with 43 characters (minimum)', () => {
      const minVerifier = 'a'.repeat(43);

      const isValid = BrowserPKCEUtils.validateCodeVerifier(minVerifier);
      expect(isValid).toBe(true);
    });

    it('should accept verifier with 128 characters (maximum)', () => {
      const maxVerifier = 'a'.repeat(128);

      const isValid = BrowserPKCEUtils.validateCodeVerifier(maxVerifier);
      expect(isValid).toBe(true);
    });

    it('should accept verifier with allowed characters (A-Z, a-z, 0-9, -, ., _, ~)', () => {
      const verifier = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnop-._~';

      const isValid = BrowserPKCEUtils.validateCodeVerifier(verifier);
      expect(isValid).toBe(true);
    });

    it('should reject verifier shorter than 43 characters', () => {
      const shortVerifier = 'a'.repeat(42);

      const isValid = BrowserPKCEUtils.validateCodeVerifier(shortVerifier);
      expect(isValid).toBe(false);
    });

    it('should reject verifier longer than 128 characters', () => {
      const longVerifier = 'a'.repeat(129);

      const isValid = BrowserPKCEUtils.validateCodeVerifier(longVerifier);
      expect(isValid).toBe(false);
    });

    it('should reject verifier with invalid characters', () => {
      const invalidVerifier = 'a'.repeat(42) + '@'; // @ is not allowed

      const isValid = BrowserPKCEUtils.validateCodeVerifier(invalidVerifier);
      expect(isValid).toBe(false);
    });

    it('should reject verifier with spaces', () => {
      const verifierWithSpace = 'a'.repeat(20) + ' ' + 'a'.repeat(22);

      const isValid = BrowserPKCEUtils.validateCodeVerifier(verifierWithSpace);
      expect(isValid).toBe(false);
    });

    it('should reject empty string', () => {
      const isValid = BrowserPKCEUtils.validateCodeVerifier('');
      expect(isValid).toBe(false);
    });
  });

  describe('generatePKCEPair', () => {
    it('should generate complete PKCE parameter pair', async () => {
      const pair = await BrowserPKCEUtils.generatePKCEPair();

      expect(pair).toHaveProperty('codeVerifier');
      expect(pair).toHaveProperty('codeChallenge');
      expect(pair).toHaveProperty('codeChallengeMethod');
    });

    it('should generate S256 challenge method', async () => {
      const pair = await BrowserPKCEUtils.generatePKCEPair();

      expect(pair.codeChallengeMethod).toBe('S256');
    });

    it('should generate valid verifier', async () => {
      const pair = await BrowserPKCEUtils.generatePKCEPair();

      const isValid = BrowserPKCEUtils.validateCodeVerifier(pair.codeVerifier);
      expect(isValid).toBe(true);
    });

    it('should generate valid challenge', async () => {
      const pair = await BrowserPKCEUtils.generatePKCEPair();

      const isValid = BrowserPKCEUtils.validateCodeChallenge(pair.codeChallenge);
      expect(isValid).toBe(true);
    });

    it('should generate matching verifier and challenge', async () => {
      const pair = await BrowserPKCEUtils.generatePKCEPair();

      const isValid = await BrowserPKCEUtils.verifyPKCE(pair.codeVerifier, pair.codeChallenge);
      expect(isValid).toBe(true);
    });

    it('should generate different pairs on each call', async () => {
      const pair1 = await BrowserPKCEUtils.generatePKCEPair();
      const pair2 = await BrowserPKCEUtils.generatePKCEPair();

      expect(pair1.codeVerifier).not.toBe(pair2.codeVerifier);
      expect(pair1.codeChallenge).not.toBe(pair2.codeChallenge);
    });
  });

  describe('generateState', () => {
    it('should generate a state string', () => {
      const state = BrowserPKCEUtils.generateState();

      expect(typeof state).toBe('string');
      expect(state.length).toBe(32);
    });

    it('should generate different states on each call', () => {
      const state1 = BrowserPKCEUtils.generateState();
      const state2 = BrowserPKCEUtils.generateState();

      expect(state1).not.toBe(state2);
    });

    it('should generate Base64URL-safe characters only', () => {
      const state = BrowserPKCEUtils.generateState();

      const base64URLRegex = /^[A-Za-z0-9\-_]+$/;
      expect(base64URLRegex.test(state)).toBe(true);
    });

    it('should not contain padding characters', () => {
      const state = BrowserPKCEUtils.generateState();

      expect(state).not.toContain('=');
    });
  });

  describe('browserPKCE export', () => {
    it('should export browserPKCE as alias for BrowserPKCEUtils', () => {
      expect(browserPKCE).toBe(BrowserPKCEUtils);
    });
  });
});
