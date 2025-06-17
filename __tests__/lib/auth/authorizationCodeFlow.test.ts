// __tests__/lib/auth/authorizationCodeFlow.test.ts

import { prisma } from '@/lib/prisma';
import {
  storeAuthorizationCode,
  validateAuthorizationCode,
  DEFAULT_AUTHORIZATION_CODE_LIFETIME_SECONDS,
} from '@/lib/auth/authorizationCodeFlow';
import { setupTestDb, teardownTestDb } from '../../utils/test-helpers';
import { TestDataManager } from '../../utils/test-helpers'; // To create user and client
import crypto from 'crypto';
import { addSeconds, differenceInSeconds } from 'date-fns';

describe('Authorization Code Flow', () => {
  let testDataCreator: TestDataManager;
  let testUser: any;
  let testClient: any;

  beforeAll(async () => {
    await setupTestDb(); // Clear DB and set up basic scopes, etc.
  });

  beforeEach(async () => {
    // Create a new TestDataManager for each test to ensure data isolation via prefixes
    testDataCreator = new TestDataManager('auth_code_flow_');

    // Create a standard test user and client for use in tests
    // Note: `createUser` and `createClient` in TestDataManager return custom TestUser/TestClient types,
    // but we need the actual Prisma User/OAuthClient IDs.
    const rawUser = await testDataCreator.createUser({ username: 'authcode_user' });
    const rawClient = await testDataCreator.createClient({ clientId: 'authcode_client', isPublic: false });

    // Fetch the actual DB records to get their CUIDs
    testUser = await prisma.user.findUnique({ where: { username: rawUser.username } });
    if (!testUser) throw new Error('Test user not found in DB after creation');

    const dbClient = await prisma.oAuthClient.findUnique({ where: { clientId: rawClient.clientId } });
    if (!dbClient) throw new Error('Test client not found in DB after creation');
    testClient = dbClient; // testClient will now have the cuid `id` field
  });

  afterEach(async () => {
    await testDataCreator.cleanup(); // Clean up data created with the prefix
  });

  afterAll(async () => {
    await teardownTestDb(); // Final full cleanup
  });

  describe('storeAuthorizationCode', () => {
    it('should store an authorization code with correct details and S256 PKCE', async () => {
      const redirectUri = 'https://client.example.com/callback';
      const scope = JSON.stringify(['openid', 'profile']);
      const codeChallenge = 'test_challenge_s256';
      const codeChallengeMethod = 'S256';

      const result = await storeAuthorizationCode(
        testClient.id, // Pass the CUID of the client
        testUser.id,
        redirectUri,
        scope,
        codeChallenge,
        codeChallengeMethod,
      );

      expect(result).toBeDefined();
      expect(result.code).toBeTypeOf('string');
      expect(result.code.length).toBeGreaterThan(32); // Expect a reasonably long random code
      expect(result.clientId).toBe(testClient.id);
      expect(result.userId).toBe(testUser.id);
      expect(result.redirectUri).toBe(redirectUri);
      expect(result.scope).toBe(scope);
      expect(result.codeChallenge).toBe(codeChallenge);
      expect(result.codeChallengeMethod).toBe(codeChallengeMethod);
      expect(result.isUsed).toBe(false);

      const now = new Date();
      const expectedExpiresAt = addSeconds(now, DEFAULT_AUTHORIZATION_CODE_LIFETIME_SECONDS);
      // Allow a small difference (e.g., 5 seconds) due to execution time
      expect(differenceInSeconds(result.expiresAt, expectedExpiresAt)).toBeLessThanOrEqual(5);

      // Verify in DB
      const dbCode = await prisma.authorizationCode.findUnique({ where: { code: result.code } });
      expect(dbCode).not.toBeNull();
      expect(dbCode?.clientId).toBe(testClient.id);
      expect(dbCode?.userId).toBe(testUser.id);
    });

    it('should use custom expiresInSeconds if provided', async () => {
      const customLifetime = 300; // 5 minutes
      const result = await storeAuthorizationCode(
        testClient.id,
        testUser.id,
        'uri',
        'scope',
        'challenge',
        'S256',
        customLifetime,
      );
      const now = new Date();
      const expectedExpiresAt = addSeconds(now, customLifetime);
      expect(differenceInSeconds(result.expiresAt, expectedExpiresAt)).toBeLessThanOrEqual(5);
    });

    it('should throw an error if code_challenge_method is not S256', async () => {
      await expect(
        storeAuthorizationCode(
          testClient.id,
          testUser.id,
          'uri',
          'scope',
          'challenge',
          'plain' as any, // Force invalid method
        ),
      ).rejects.toThrow('Invalid code_challenge_method. Only S256 is supported.');
    });
  });

  describe('validateAuthorizationCode', () => {
    let storedCodeData: any; // Will hold the result of storeAuthorizationCode
    const redirectUri = 'https://client.example.com/callback/validate';
    const scope = JSON.stringify(['openid', 'email']);
    const plainVerifier = 'valid_pkce_verifier_string_long_enough_for_sha256';
    let s256Challenge: string;

    beforeEach(async () => {
      // Generate S256 challenge from verifier
      s256Challenge = crypto
        .createHash('sha256')
        .update(plainVerifier)
        .digest('base64url');

      storedCodeData = await storeAuthorizationCode(
        testClient.id,
        testUser.id,
        redirectUri,
        scope,
        s256Challenge,
        'S256',
      );
    });

    it('should validate a correct, unexpired, unused code with valid PKCE and mark it as used', async () => {
      const validated = await validateAuthorizationCode(
        storedCodeData.code,
        testClient.id,
        redirectUri,
        plainVerifier,
      );

      expect(validated).not.toBeNull();
      expect(validated?.userId).toBe(testUser.id);
      expect(validated?.scope).toBe(scope);
      expect(validated?.clientId).toBe(testClient.id);

      // Verify it's marked as used in DB
      const dbCode = await prisma.authorizationCode.findUnique({ where: { code: storedCodeData.code } });
      expect(dbCode?.isUsed).toBe(true);
    });

    it('should return null for a non-existent code', async () => {
      const validated = await validateAuthorizationCode(
        'non_existent_code_12345',
        testClient.id,
        redirectUri,
        plainVerifier,
      );
      expect(validated).toBeNull();
    });

    it('should return null if code is already used', async () => {
      // First, use the code successfully
      await validateAuthorizationCode(
        storedCodeData.code,
        testClient.id,
        redirectUri,
        plainVerifier,
      );

      // Attempt to use it again
      const validatedSecondAttempt = await validateAuthorizationCode(
        storedCodeData.code,
        testClient.id,
        redirectUri,
        plainVerifier,
      );
      expect(validatedSecondAttempt).toBeNull();
    });

    it('should return null if code is expired', async () => {
      const shortLivedCode = await storeAuthorizationCode(
        testClient.id, testUser.id, redirectUri, scope, s256Challenge, 'S256', 1 // 1 second expiry
      );
      await new Promise(resolve => setTimeout(resolve, 1100)); // Wait for 1.1 seconds

      const validated = await validateAuthorizationCode(
        shortLivedCode.code, testClient.id, redirectUri, plainVerifier
      );
      expect(validated).toBeNull();

      // Check if it was deleted from DB
      const dbCode = await prisma.authorizationCode.findUnique({ where: { code: shortLivedCode.code } });
      expect(dbCode).toBeNull();
    });

    it('should return null if client ID does not match', async () => {
      const otherClient = await testDataCreator.createClient({ clientId: 'other_client_for_auth_code' });
      const dbOtherClient = await prisma.oAuthClient.findUnique({where: {clientId: otherClient.clientId}});
      if(!dbOtherClient) throw new Error("Failed to create other client");

      const validated = await validateAuthorizationCode(
        storedCodeData.code,
        dbOtherClient.id, // Different client CUID
        redirectUri,
        plainVerifier,
      );
      expect(validated).toBeNull();
    });

    it('should return null if redirect URI does not match', async () => {
      const validated = await validateAuthorizationCode(
        storedCodeData.code,
        testClient.id,
        'https://different.uri/callback',
        plainVerifier,
      );
      expect(validated).toBeNull();
    });

    it('should return null if PKCE code_verifier is incorrect', async () => {
      const validated = await validateAuthorizationCode(
        storedCodeData.code,
        testClient.id,
        redirectUri,
        'incorrect_verifier_string_pkce',
      );
      expect(validated).toBeNull();
    });

    // This test handles the case where a code is found but its method is somehow not S256 (defensive)
    it('should return null if stored code challenge method is not S256 (edge case)', async () => {
      // Manually update a code to have an invalid method (not typical)
      await prisma.authorizationCode.update({
        where: { code: storedCodeData.code },
        data: { codeChallengeMethod: 'plain' as any },
      });

      const validated = await validateAuthorizationCode(
        storedCodeData.code,
        testClient.id,
        redirectUri,
        plainVerifier,
      );
      expect(validated).toBeNull();
    });
  });
});
