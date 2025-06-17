// __tests__/lib/auth/jwtUtils.test.ts

// IMPORTANT: Mock process.env BEFORE importing jwtUtils
const TEST_RSA_PRIVATE_KEY_PEM =
  `-----BEGIN RSA PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDRs5+x9V8xDRN9
7VbVXpQY9T7yT2VmszP9/gBsGgDY8xJ0gYJ8Z8SgN9xS2uV/c1A8j52yrHFo3nZuV
OXlW2Yx2k6aZ0Z9O9Y7f2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7
Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y
8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8
Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8ZCAwEAAQKBgQCOLc5+L5rN42gY
V7PqN9xS2uV/c1A8j52yrHFo3nZuVOXlW2Yx2k6aZ0Z9O9Y7f2Z7Y8Z/2Z7Y8Z/2
Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2
Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2
Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8ZAoGB
APyZ7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8
Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8
Z/2Z7Y8ZAoGBAPZZ7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/
Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/
Z7Y8Z/2Z7Y8Z/2Z7Y8ZAoGAO5Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7
Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7
Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8ZAoGAZ5Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/
Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/
Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8ZAoGARpZ7Y8Z/2Z7Y8Z/2Z7
Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7
Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z-----END RSA PRIVATE KEY-----`;

const TEST_RSA_PUBLIC_KEY_PEM =
  `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0bOfsfVfMQ0Tfe1W1V6U
GPU+8k9lZrMz/f4AbBoA2PMSdIGCfGfEoDfcUtblf3NQPI+dsqxxaN52blTl5Vtm
MdpcpmdGfTvWO39me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf
9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf
9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf
9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf
9me2PGf9me2PGf9me2PGQIDAQAB
-----END PUBLIC KEY-----`;

// Store original env
const originalEnv = { ...process.env };

process.env.JWT_RSA_PRIVATE_KEY = TEST_RSA_PRIVATE_KEY_PEM;
process.env.JWT_RSA_PUBLIC_KEY = TEST_RSA_PUBLIC_KEY_PEM;
process.env.JWT_ISSUER = 'test-issuer';
process.env.JWT_AUDIENCE = 'test-audience';

import { generateJwtToken, validateJwtToken, JwtCustomPayload, __test__resetKeys } from '@/lib/auth/jwtUtils';
import * as jose from 'jose';

const TEST_SUBJECT = 'test-user-123';

beforeEach(async () => {
  // Reset keys before each test to ensure clean state from process.env
  // This helps if a test modifies process.env for its specific scenario
  process.env.JWT_RSA_PRIVATE_KEY = TEST_RSA_PRIVATE_KEY_PEM;
  process.env.JWT_RSA_PUBLIC_KEY = TEST_RSA_PUBLIC_KEY_PEM;
  process.env.JWT_ISSUER = 'test-issuer';
  process.env.JWT_AUDIENCE = 'test-audience';
  await __test__resetKeys(); // Tell jwtUtils to re-import based on current (mocked) process.env
});

afterAll(() => {
  // Restore original environment variables after all tests in this file
  process.env = originalEnv;
});


describe('JWT Utils - generateJwtToken', () => {
  it('should generate a JWT token string', async () => {
    const payload: JwtCustomPayload = { username: 'testuser' };
    const expiresIn = '1h';
    const token = await generateJwtToken(payload, TEST_SUBJECT, expiresIn);
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3);
  });

  it('should contain the correct custom payload and standard claims', async () => {
    const payload: JwtCustomPayload = { customData: 'my-data', groups: ['groupA'] };
    const expiresIn = '30m';
    const token = await generateJwtToken(payload, TEST_SUBJECT, expiresIn);
    const decodedPayload = jose.decodeJwt(token);

    expect(decodedPayload).not.toBeNull();
    expect(decodedPayload.sub).toBe(TEST_SUBJECT);
    expect(decodedPayload.customData).toBe(payload.customData);
    expect(decodedPayload.groups).toEqual(payload.groups);
    expect(decodedPayload.iss).toBe(process.env.JWT_ISSUER);
    expect(decodedPayload.aud).toBe(process.env.JWT_AUDIENCE);
  });

  it('should set "exp" claim correctly (string format "1h")', async () => {
    const payload: JwtCustomPayload = {};
    const expiresIn = '1h';
    const token = await generateJwtToken(payload, TEST_SUBJECT, expiresIn);
    const decodedPayload = jose.decodeJwt(token);
    const nowInSeconds = Math.floor(Date.now() / 1000);
    expect(decodedPayload.exp).toBeDefined();
    expect(decodedPayload.exp).toBeGreaterThanOrEqual(nowInSeconds + 3600 - 15); // Increased leeway
    expect(decodedPayload.exp).toBeLessThanOrEqual(nowInSeconds + 3600 + 15);  // Increased leeway
  });

  it('should set "exp" claim correctly (number format seconds)', async () => {
    const payload: JwtCustomPayload = {};
    const expiresInSeconds = 1800; // 30 minutes
    const token = await generateJwtToken(payload, TEST_SUBJECT, expiresInSeconds);
    const decodedPayload = jose.decodeJwt(token);
    const nowInSeconds = Math.floor(Date.now() / 1000);
    expect(decodedPayload.exp).toBeDefined();
    expect(decodedPayload.exp).toBeGreaterThanOrEqual(nowInSeconds + expiresInSeconds - 5);
    expect(decodedPayload.exp).toBeLessThanOrEqual(nowInSeconds + expiresInSeconds + 5);
  });

  it('should set "iat" claim correctly', async () => {
    const payload: JwtCustomPayload = {};
    const token = await generateJwtToken(payload, TEST_SUBJECT, '1h');
    const decodedPayload = jose.decodeJwt(token);
    const nowInSeconds = Math.floor(Date.now() / 1000);
    expect(decodedPayload.iat).toBeDefined();
    expect(decodedPayload.iat).toBeGreaterThanOrEqual(nowInSeconds - 5);
    expect(decodedPayload.iat).toBeLessThanOrEqual(nowInSeconds + 5);
  });

  it('should have "alg" in header as RS256', async () => {
    const payload: JwtCustomPayload = {};
    const token = await generateJwtToken(payload, TEST_SUBJECT, '15m');
    const [headerEncoded] = token.split('.');
    const header = JSON.parse(Buffer.from(headerEncoded, 'base64url').toString('utf-8'));
    expect(header.alg).toBe('RS256');
  });

  it('should include a string "jti" claim', async () => {
    const payload: JwtCustomPayload = {};
    const token = await generateJwtToken(payload, TEST_SUBJECT, '1h');
    const decodedPayload = jose.decodeJwt(token);
    expect(decodedPayload.jti).toBeDefined();
    expect(typeof decodedPayload.jti).toBe('string');
  });

  it('should throw error if private key is not set (simulated by unsetting env var)', async () => {
    process.env.JWT_RSA_PRIVATE_KEY = ''; // Unset for this test
    await __test__resetKeys(); // Force re-evaluation of keys in jwtUtils
    await expect(generateJwtToken({ data: 'test' }, 'subject', '1h'))
      .rejects
      .toThrow('RSA private key is not available for JWT generation.');
  });
});

describe('JWT Utils - validateJwtToken', () => {
  let validToken: string;
  const basicPayload: JwtCustomPayload = { info: 'standard-test-data' };
  const subject = 'validator-subject-test';
  let testSpecificPrivateKey: jose.KeyLike;

  beforeAll(async () => {
    // Use a freshly imported key for signing in this block to ensure it's valid
    testSpecificPrivateKey = await jose.importPkcs8(TEST_RSA_PRIVATE_KEY_PEM, 'RS256');
  });

  beforeEach(async () => {
    // Generate a fresh valid token before each validation test
    validToken = await new jose.SignJWT({ ...basicPayload })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(process.env.JWT_ISSUER!)
      .setAudience(process.env.JWT_AUDIENCE!)
      .setSubject(subject)
      .setExpirationTime('5m') // Short-lived for tests
      .setIssuedAt()
      .setJti(jose.randomBytes(16).toString('hex'))
      .sign(testSpecificPrivateKey);
  });

  it('should return decoded payload and header for a valid token', async () => {
    const { payload, protectedHeader } = await validateJwtToken(validToken);
    expect(payload.info).toBe(basicPayload.info);
    expect(payload.sub).toBe(subject);
    expect(payload.iss).toBe(process.env.JWT_ISSUER);
    expect(payload.aud).toBe(process.env.JWT_AUDIENCE);
    expect(protectedHeader.alg).toBe('RS256');
  });

  it('should throw error for an invalid signature', async () => {
    const parts = validToken.split('.');
    const tamperedToken = `${parts[0]}.${parts[1]}.InvalidSignatureContent`;
    await expect(validateJwtToken(tamperedToken))
      .rejects
      .toThrow('Invalid token signature.');
  });

  it('should throw error for an expired token', async () => {
    const expiredToken = await new jose.SignJWT({ expTest: true })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(process.env.JWT_ISSUER!)
      .setAudience(process.env.JWT_AUDIENCE!)
      .setSubject(subject)
      .setExpirationTime(1) // 1 second expiry
      .setIssuedAt(Math.floor(Date.now()/1000) - 2) // Issued 2 seconds ago
      .setJti(jose.randomBytes(16).toString('hex'))
      .sign(testSpecificPrivateKey);

    await new Promise(resolve => setTimeout(resolve, 1001)); // Wait for 1.001 seconds to ensure expiry

    await expect(validateJwtToken(expiredToken))
      .rejects
      .toThrow(/^Token expired at/);
  });

  it('should throw error for incorrect issuer', async () => {
    const tokenWithWrongIssuer = await new jose.SignJWT({ ...basicPayload })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer('urn:wrong-issuer')
      .setAudience(process.env.JWT_AUDIENCE!)
      .setSubject(subject)
      .setExpirationTime('1h')
      .setIssuedAt()
      .setJti(jose.randomBytes(16).toString('hex'))
      .sign(testSpecificPrivateKey);

    await expect(validateJwtToken(tokenWithWrongIssuer))
      .rejects
      .toThrow('Token claim validation failed: iss unexpected "iss" claim value.');
  });

  it('should throw error for incorrect audience', async () => {
    const tokenWithWrongAudience = await new jose.SignJWT({ ...basicPayload })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(process.env.JWT_ISSUER!)
      .setAudience('urn:wrong-audience')
      .setSubject(subject)
      .setExpirationTime('1h')
      .setIssuedAt()
      .setJti(jose.randomBytes(16).toString('hex'))
      .sign(testSpecificPrivateKey);

    await expect(validateJwtToken(tokenWithWrongAudience))
      .rejects
      .toThrow('Token claim validation failed: aud unexpected "aud" claim value.');
  });

  it('should throw error for a malformed token (not enough parts)', async () => {
    const malformedToken = 'notajwt';
    await expect(validateJwtToken(malformedToken))
      .rejects
      .toThrow('Invalid JWT: JWS Protected Header is invalid.');
  });

  it('should throw error for malformed token (invalid JSON in parts)', async () => {
    const malformedToken = "invalid.json.here";
     await expect(validateJwtToken(malformedToken))
      .rejects
      .toThrow('Invalid JWT: JWS Protected Header is invalid.');
  });

  it('should throw error if public key is not set for validation (simulated)', async () => {
    process.env.JWT_RSA_PUBLIC_KEY = ''; // Unset for this test
    await __test__resetKeys(); // Force re-evaluation of keys in jwtUtils
    await expect(validateJwtToken(validToken))
      .rejects
      .toThrow('RSA public key is not available for JWT validation.');
  });
});
