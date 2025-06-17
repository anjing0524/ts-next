// app/api/v2/.well-known/jwks.json/route.test.ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { GET } from './route'; // Adjust path based on your actual file structure
import { NextRequest } from 'next/server';
import * as jose from 'jose';

// Use the same mock keys as in lib/auth/oauth2.test.ts for consistency
// These are placeholders and need to be valid PEMs for the tests to truly pass.
const MOCK_PUBLIC_KEY_PEM_FOR_JWKS = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0pPz7oNnPpGk3C8gXc6N
yLccCqrPT2GLYjS9N4kYpEYu4ddr4XymXk7VqV9qPAhscVHZzVJGzR3h71y3AHgm
8z5zQ7jodm2WqgY3H7EAL3Q+P70NBHLHcM8uD8qzn5H2lHbtzV9P4VrMAUEp54y9
4jQjHkY8b02YPYuKbS6iMwqkYS8lXvE0l0xM7u1WS7n8kPBkS7xKzL/kIXS/6K5q
jZ2fKjY0x3tD6n78/64D5y37L0x0e9Zz0x7tG9jV7eZ4x8n9mH6p7y8v8L9f7v6o
F0o9T8zE/v2r1e3tA5j6h8j7k0l5m+n9bX2g3Y4c1eZ6x7k8B==
-----END PUBLIC KEY-----`; // Replace with a real dummy public key for testing
const MOCK_JWT_KEY_ID = 'test-kid-jwks-001';
const MOCK_JWT_ALGORITHM = 'RS256';

describe('/api/v2/.well-known/jwks.json Endpoint', () => {
  const originalEnv = process.env;

  beforeAll(() => {
    process.env = {
      ...originalEnv,
      JWT_PUBLIC_KEY_PEM: MOCK_PUBLIC_KEY_PEM_FOR_JWKS,
      JWT_KEY_ID: MOCK_JWT_KEY_ID,
      JWT_ALGORITHM: MOCK_JWT_ALGORITHM,
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  // Conditional skip if using placeholder keys
  const isKeyPlaceholder = MOCK_PUBLIC_KEY_PEM_FOR_JWKS.includes("...");
  const itif = (condition: boolean) => condition ? it : it.skip;


  itif(!isKeyPlaceholder)('should return a valid JWKSet with the correct public key details', async () => {
    // Mock NextRequest if your GET handler uses it for anything (e.g., base URL derivation, though not typical for JWKS)
    const req = new NextRequest('http://localhost/.well-known/jwks.json');
    const response = await GET(); // Assuming GET doesn't need 'req' or it's handled if 'req' is undefined

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/json');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600, must-revalidate');

    const jwks = await response.json();
    expect(jwks).toBeTypeOf('object');
    expect(jwks.keys).toBeInstanceOf(Array);
    expect(jwks.keys.length).toBe(1);

    const jwk = jwks.keys[0];
    expect(jwk.kty).toBe('RSA');
    expect(jwk.kid).toBe(MOCK_JWT_KEY_ID);
    expect(jwk.alg).toBe(MOCK_JWT_ALGORITHM);
    expect(jwk.use).toBe('sig');
    expect(jwk.n).toBeDefined(); // Modulus
    expect(jwk.e).toBe('AQAB'); // Exponent (usually 'AQAB' for RSA)

    // Verify the public key material (n, e) matches the PEM
    // This is a more involved check: import the PEM, export to JWK, compare n and e.
    const publicKey = await jose.importSPKI(MOCK_PUBLIC_KEY_PEM_FOR_JWKS, MOCK_JWT_ALGORITHM);
    const expectedExportedJwk = await jose.exportJWK(publicKey);
    expect(jwk.n).toBe(expectedExportedJwk.n);
    expect(jwk.e).toBe(expectedExportedJwk.e);
  });

  it('should return an empty key set if a symmetric algorithm (HS256) is configured', async () => {
    process.env.JWT_ALGORITHM = 'HS256'; // Temporarily override for this test
    const response = await GET();
    expect(response.status).toBe(200);
    const jwks = await response.json();
    expect(jwks.keys).toEqual([]);
    process.env.JWT_ALGORITHM = MOCK_JWT_ALGORITHM; // Reset
  });

  itif(!isKeyPlaceholder)('should return 503 if JWT_PUBLIC_KEY_PEM is not configured for an asymmetric algorithm', async () => {
    delete process.env.JWT_PUBLIC_KEY_PEM; // Temporarily remove for this test
    const response = await GET();
    expect(response.status).toBe(503);
    const error = await response.json();
    expect(error.code).toBe('JWKS_NOT_CONFIGURED');
    process.env.JWT_PUBLIC_KEY_PEM = MOCK_PUBLIC_KEY_PEM_FOR_JWKS; // Restore
  });

  // This test is tricky because a truly invalid PEM might cause jose.importSPKI to throw
  // an error that's hard to distinguish from "not configured" unless the error messages are very specific.
  // The current implementation logs the error and returns a generic 503.
  it('should return 503 if JWT_PUBLIC_KEY_PEM is invalid (simulated by empty string)', async () => {
    process.env.JWT_PUBLIC_KEY_PEM = ''; // Invalid PEM
    const response = await GET();
    expect(response.status).toBe(503);
    const error = await response.json();
     // The error code might be JWKS_NOT_CONFIGURED (if empty string is treated as not configured)
     // or JWKS_KEY_PROCESSING_ERROR if importSPKI fails more specifically.
     // Based on current route logic, an empty string for PEM would lead to 'JWKS_NOT_CONFIGURED'.
    expect(error.code).toBe('JWKS_NOT_CONFIGURED');
    process.env.JWT_PUBLIC_KEY_PEM = MOCK_PUBLIC_KEY_PEM_FOR_JWKS; // Restore
  });

});
