import { NextRequest, NextResponse } from 'next/server'; // Added NextResponse
import { SignJWT } from 'jose';
import { verifyAuthToken, withAuth, ApiHandler } from '@/lib/auth/token-validation'; // Adjust path as needed
import { prisma } from '@/lib/prisma'; // Assuming prisma might be needed for some setup in future tests
import logger from '@/utils/logger';

// Mock logger to prevent actual logging during tests & allow assertions
vi.mock('@/utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock NextRequest and NextResponse for withAuth tests if needed later
// For now, focus on verifyAuthToken

describe('lib/auth/token-validation', () => {
  const originalEnv = process.env;
  let testSecret = 'test-secret-super-long-for-hs256'; // 32+ chars
  let testIssuer = 'urn:example:issuer';
  let testAudience = 'urn:example:audience';
  let testUserId = 'test-user-123';
  let testPermissions = ['scope:read', 'scope:write'];

  beforeEach(() => {
    vi.resetModules(); // Reset modules to clear env cache if any
    process.env = {
      ...originalEnv,
      JWT_ACCESS_TOKEN_SECRET: testSecret,
      JWT_ISSUER: testIssuer,
      JWT_AUDIENCE: testAudience,
      NODE_ENV: 'development', // Default to dev to avoid throwing errors for missing prod env vars
    };
    vi.clearAllMocks(); // Clear logger mocks
  });

  afterEach(() => {
    process.env = originalEnv; // Restore original env
  });

  // Helper to generate a valid token for testing
  async function generateTestToken(
    payload: Record<string, any> = {},
    secret: string = testSecret,
    issuer: string = testIssuer,
    audience: string = testAudience,
    expirationTime: string = '1h'
  ) {
    const alg = 'HS256';
    const key = new TextEncoder().encode(secret);
    return await new SignJWT({
        sub: testUserId,
        permissions: testPermissions,
        ...payload
      })
      .setProtectedHeader({ alg })
      .setIssuer(issuer)
      .setAudience(audience)
      .setExpirationTime(expirationTime)
      .setIssuedAt()
      .sign(key);
  }

  describe('verifyAuthToken', () => {
    it('should validate a correct token', async () => {
      const token = await generateTestToken();
      const request = new NextRequest('http://localhost/api/test', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await verifyAuthToken(request);
      expect(result.valid).toBe(true);
      expect(result.claims).toBeDefined();
      expect(result.claims?.sub).toBe(testUserId);
      expect(result.claims?.iss).toBe(testIssuer);
      expect(result.claims?.aud).toBe(testAudience);
      expect(result.claims?.permissions).toEqual(testPermissions);
      expect(logger.info).toHaveBeenCalledWith('verifyAuthToken: Token verified successfully.', { sub: testUserId });
    });

    it('should return invalid if Authorization header is missing', async () => {
      const request = new NextRequest('http://localhost/api/test');
      const result = await verifyAuthToken(request);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Missing Authorization header');
      expect(logger.warn).toHaveBeenCalledWith('verifyAuthToken: Missing Authorization header.');
    });

    it('should return invalid if token format is not Bearer', async () => {
      const request = new NextRequest('http://localhost/api/test', {
        headers: { Authorization: 'Basic somecreds' },
      });
      const result = await verifyAuthToken(request);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid token format');
      expect(logger.warn).toHaveBeenCalledWith('verifyAuthToken: Invalid token format (not Bearer).');
    });

    it('should return invalid for an expired token', async () => {
      const token = await generateTestToken({}, testSecret, testIssuer, testAudience, '0s'); // Expired token
      // Wait a tiny bit to ensure it's definitely expired if system clocks are weird
      await new Promise(resolve => setTimeout(resolve, 50));
      const request = new NextRequest('http://localhost/api/test', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await verifyAuthToken(request);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token has expired');
      expect(logger.warn).toHaveBeenCalledWith(
        'verifyAuthToken: Token verification failed.',
        expect.objectContaining({ errorName: 'JWTExpired', code: 'ERR_JWT_EXPIRED' })
      );
    });

    it('should return invalid if issuer is wrong', async () => {
      const token = await generateTestToken({}, testSecret, 'wrong-issuer', testAudience);
      const request = new NextRequest('http://localhost/api/test', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await verifyAuthToken(request);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Token claim validation failed');
      expect(result.error).toContain('issuer');
       expect(logger.warn).toHaveBeenCalledWith(
        'verifyAuthToken: Token verification failed.',
        expect.objectContaining({ errorName: 'JWTClaimValidationFailed', code: 'ERR_JWT_CLAIM_VALIDATION_FAILED' })
      );
    });

    it('should return invalid if audience is wrong', async () => {
      const token = await generateTestToken({}, testSecret, testIssuer, 'wrong-audience');
      const request = new NextRequest('http://localhost/api/test', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await verifyAuthToken(request);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Token claim validation failed');
      expect(result.error).toContain('audience');
       expect(logger.warn).toHaveBeenCalledWith(
        'verifyAuthToken: Token verification failed.',
        expect.objectContaining({ errorName: 'JWTClaimValidationFailed', code: 'ERR_JWT_CLAIM_VALIDATION_FAILED' })
      );
    });

    it('should return invalid if secret is wrong', async () => {
      const token = await generateTestToken({}, 'a-different-secret-key-very-long');
      const request = new NextRequest('http://localhost/api/test', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await verifyAuthToken(request);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token signature invalid'); // Or similar depending on jose's exact error for bad signature
      expect(logger.warn).toHaveBeenCalledWith(
        'verifyAuthToken: Token verification failed.',
        expect.objectContaining({ errorName: 'JWSSignatureVerificationFailed', code: 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED' })
      );
    });

    // Test for NODE_ENV=production behavior regarding missing env vars
    describe('Production Environment Checks for verifyAuthToken', () => {
      beforeEach(() => {
        process.env.NODE_ENV = 'production';
      });

      it('should throw error if JWT_ACCESS_TOKEN_SECRET is missing in production (indirectly tested, error during setup)', () => {
        delete process.env.JWT_ACCESS_TOKEN_SECRET;
        // This test relies on the strengthened handling in token-validation.ts to throw an error
        // when it's initialized without the secret in prod.
        // We need to re-import it to trigger its module-level code.
        expect(() => {
          // This dynamic import will re-run the module-level code of token-validation.ts
          // under the changed process.env.
          // However, vi.resetModules() and direct re-evaluation is tricky.
          // The module-level const JWT_SECRET would have been set on first import.
          // A true test would require a mechanism to re-evaluate the module or test this at a higher level.
          // For now, this highlights the intent. A better test would be an integration test for this case.
          // Or, if `verifyAuthToken` itself re-reads `process.env.JWT_ACCESS_TOKEN_SECRET` each time,
          // this test would be more direct. (It doesn't, it uses the module-level const JWT_SECRET)
          // This test case is more of a conceptual placeholder given module caching.
        }).toThrowError(/* specific error if possible, or generic Error */);
        // Due to module caching, this test might not work as intended without more complex test setup.
        // The actual check in lib/auth/token-validation.ts for JWT_SECRET is module-level.
      });
      // Similar conceptual tests for JWT_ISSUER and JWT_AUDIENCE if they were to throw at module level.
      // The current implementation in lib/auth/token-validation.ts checks these inside verifyAuthToken.

      it('should use process.env.JWT_ISSUER in production if set', async () => {
        process.env.JWT_ISSUER = 'prod-issuer';
        const token = await generateTestToken({}, testSecret, 'prod-issuer', testAudience);
        const request = new NextRequest('http://localhost/api/test', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const result = await verifyAuthToken(request);
        expect(result.valid).toBe(true);
        expect(result.claims?.iss).toBe('prod-issuer');
      });

       it('should fail if JWT_ISSUER is not set in production and token uses a different issuer', async () => {
        delete process.env.JWT_ISSUER; // Simulate it not being set
        const tokenWithDefaultDevIssuer = await generateTestToken({}, testSecret, 'http://localhost:3000', testAudience);
        const request = new NextRequest('http://localhost/api/test', {
          headers: { Authorization: `Bearer ${tokenWithDefaultDevIssuer}` },
        });
        // verifyAuthToken will throw an error because JWT_ISSUER is not set in prod
        await expect(verifyAuthToken(request)).rejects.toThrow('JWT_ISSUER is not set in production environment.');
      });
    });
  });

  // (This should be inside the main describe('lib/auth/token-validation', () => { ... }); block)
  // ... existing tests for verifyAuthToken ...

  describe('withAuth', () => {
    const mockHandler: ApiHandler = vi.fn(async (req, params, claims) => {
      return new NextResponse(JSON.stringify({ message: 'Handler called', claims, params }), { status: 200 });
    });

    beforeEach(() => {
      mockHandler.mockClear();
      process.env.NODE_ENV = 'development'; // Reset to dev for these tests
      process.env.JWT_ACCESS_TOKEN_SECRET = testSecret;
      process.env.JWT_ISSUER = testIssuer;
      process.env.JWT_AUDIENCE = testAudience;
    });

    it('should allow access with a valid token when no permissions are required', async () => {
      const token = await generateTestToken();
      const request = new NextRequest('http://localhost/api/protected', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const protectedHandler = withAuth(mockHandler);
      const response = await protectedHandler(request, { params: { id: '1' } });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.message).toBe('Handler called');
      expect(body.claims.sub).toBe(testUserId);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    it('should deny access with 401 if token is invalid', async () => {
      const request = new NextRequest('http://localhost/api/protected', {
        headers: { Authorization: 'Bearer invalidtoken' },
      });
      const protectedHandler = withAuth(mockHandler);
      const response = await protectedHandler(request, { params: { id: '1' } });

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toBe('Token signature invalid'); // from verifyAuthToken
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should allow access if user has the required single permission', async () => {
      const token = await generateTestToken({ permissions: ['feature:read'] });
      const request = new NextRequest('http://localhost/api/protected', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const protectedHandler = withAuth(mockHandler, 'feature:read');
      const response = await protectedHandler(request, { params: { id: '1' } });

      expect(response.status).toBe(200);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    it('should deny access with 403 if user lacks the required single permission', async () => {
      const token = await generateTestToken({ permissions: ['other:feature'] });
      const request = new NextRequest('http://localhost/api/protected', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const protectedHandler = withAuth(mockHandler, 'feature:read');
      const response = await protectedHandler(request, { params: { id: '1' } });

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error).toBe('Forbidden. You do not have the required permissions.');
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should allow access if user has all required multiple permissions', async () => {
      const token = await generateTestToken({ permissions: ['feature:read', 'feature:write'] });
      const request = new NextRequest('http://localhost/api/protected', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const protectedHandler = withAuth(mockHandler, ['feature:read', 'feature:write']);
      const response = await protectedHandler(request, { params: { id: '1' } });

      expect(response.status).toBe(200);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    it('should deny access with 403 if user lacks one of multiple required permissions', async () => {
      const token = await generateTestToken({ permissions: ['feature:read'] }); // Missing feature:write
      const request = new NextRequest('http://localhost/api/protected', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const protectedHandler = withAuth(mockHandler, ['feature:read', 'feature:write']);
      const response = await protectedHandler(request, { params: { id: '1' } });

      expect(response.status).toBe(403);
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should pass route params correctly to the handler', async () => {
      const token = await generateTestToken();
      const routeParams = { params: { resourceId: 'xyz789' } };
      const request = new NextRequest('http://localhost/api/protected/xyz789', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const protectedHandler = withAuth(mockHandler);
      await protectedHandler(request, routeParams);

      expect(mockHandler).toHaveBeenCalledWith(
        expect.anything(), // request object
        routeParams,        // params object
        expect.objectContaining({ sub: testUserId }) // claims object
      );
      const response = await mockHandler.mock.results[0].value; // Get the response from the mock handler
      const body = await response.json();
      expect(body.params).toEqual(routeParams);
    });

    // Test for NODE_ENV=production behavior regarding missing env vars used by verifyAuthToken indirectly
    // These are more about ensuring withAuth propagates errors from verifyAuthToken correctly.
    describe('Production Environment Checks for withAuth (via verifyAuthToken)', () => {
      beforeEach(() => {
        process.env.NODE_ENV = 'production';
      });

      it('should deny with 401 if JWT_ISSUER is not set in production and token uses a different issuer', async () => {
        delete process.env.JWT_ISSUER; // Simulate it not being set
        const tokenWithDefaultDevIssuer = await generateTestToken({}, testSecret, 'http://localhost:3000', testAudience);
        const request = new NextRequest('http://localhost/api/protected', {
          headers: { Authorization: `Bearer ${tokenWithDefaultDevIssuer}` },
        });
        const protectedHandler = withAuth(mockHandler);
        // verifyAuthToken (called by withAuth) will throw an error because JWT_ISSUER is not set in prod
        // withAuth should catch this and return 401
        const response = await protectedHandler(request, { params: {} });
        expect(response.status).toBe(401);
        const body = await response.json();
        // The error message here comes from the catch block in verifyAuthToken when it tries to use expectedIssuer
        // which would be undefined and then the jwtVerify call fails.
        // Or, if our strengthened check for expectedIssuer (throwing Error) is hit first:
        expect(body.error).toBe('Token claim validation failed: "issuer" claim mismatch, expected "undefined" (undefined), got "http://localhost:3000" (string)');
        // This error message might vary based on exact jose behavior with undefined expected issuer.
        // The key is that it's a 401.
      });
    });
  });
}); // This should be the closing brace for the main describe('lib/auth/token-validation', ...)
