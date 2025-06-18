// __tests__/lib/auth/oauth2.test.ts

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcrypt';
import * as jose from 'jose';
import { ClientAuthUtils, PKCEUtils, ScopeUtils, JWTUtils, AuthorizationUtils } from '@/lib/auth/oauth2'; // Import actual classes/objects
import { OAuth2Error, OAuth2ErrorCode, ConfigurationError, BaseError } from '@/lib/errors'; // Import custom errors
import { OAuthClient as Client, ClientType as PrismaClientType, User, Scope } from '@prisma/client'; // Import Prisma types

// Mock Prisma
jest.mock('@/lib/prisma', () => ({
  prisma: {
    oAuthClient: {
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    tokenBlacklist: {
        findUnique: jest.fn(),
    },
    scope: { // For ScopeUtils.validateScopes
        findMany: jest.fn(),
    }
    // Add other models if needed by other utils in oauth2.ts
  },
}));

// Mock bcrypt
jest.mock('bcrypt', () => ({
  compare: jest.fn(),
}));

// Mock jose for JWTUtils or parts that make external calls or specific crypto not easily testable
jest.mock('jose', () => {
  const originalJose = jest.requireActual('jose');
  return {
    ...originalJose,
    createRemoteJWKSet: jest.fn().mockImplementation((url) => {
        // console.log(`Mocked createRemoteJWKSet called with URL: ${url}`);
        // Return a dummy JWKS function that can be called by jwtVerify
        return async () => ({ alg: 'RS256', kty: 'RSA', /* ...other minimal key props */ });
    }),
    importPKCS8: jest.fn().mockResolvedValue('mocked-pkcs8-key'),
    importSPKI: jest.fn().mockResolvedValue('mocked-spki-key'),
    importX509: jest.fn().mockResolvedValue('mocked-x509-key'),
    decodeJwt: jest.fn(), // For ClientAuthUtils and JWTUtils.verify...
    jwtVerify: jest.fn(), // For ClientAuthUtils and JWTUtils.verify...
    SignJWT: jest.fn().mockImplementation(() => ({ // For JWTUtils.create...
        setProtectedHeader: jest.fn().mockReturnThis(),
        setExpirationTime: jest.fn().mockReturnThis(),
        sign: jest.fn().mockResolvedValue('signed.jwt.token'),
    })),
  };
});

// Mock crypto for randomUUID and randomBytes if needed, though usually it's fine
jest.mock('crypto', () => {
    const originalCrypto = jest.requireActual('crypto');
    return {
        ...originalCrypto,
        randomBytes: jest.fn((size) => Buffer.from(new Array(size).fill(0).map((_,i) => i % 256))), // Deterministic bytes
        randomUUID: jest.fn(() => 'mocked-uuid-string'),
    };
});


describe('OAuth2 Utility Functions', () => {

  const OLD_ENV = process.env; // To backup and restore env vars

  beforeEach(() => {
    jest.resetModules(); // Clear module cache if env vars are set per test
    process.env = { ...OLD_ENV }; // Make a copy
    jest.clearAllMocks();

    // Default environment variables for JWTUtils
    process.env.JWT_ISSUER = 'test-issuer';
    process.env.JWT_AUDIENCE = 'test-audience';
    process.env.JWT_PRIVATE_KEY_PEM = '-----BEGIN PRIVATE KEY-----\nMEECAQAwEwYHKoZIzj0CAQYIKoZIzj0DAQcEJzAlAgEBBCCD3mG4p0nMhpT1s5r3T0N0Y2n1+K+5GSCMHeGkYpLpbg==\n-----END PRIVATE KEY-----';
    process.env.JWT_PUBLIC_KEY_PEM = '-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEgmGS29sFL8+WA7x4C0NnhyCshdYI\n0y9T9zWV8xHh2yQUK+Tlf4VnDwsnsTCW9pWX7EWyZ1MajN2hGWRT+y57rA==\n-----END PUBLIC KEY-----';
    process.env.JWT_ALGORITHM = 'ES256'; // Matching dummy keys
    process.env.OAUTH_TOKEN_ENDPOINT_PATH = '/api/v2/oauth/token'; // For JWT Assertion audience
  });

  afterAll(() => {
    process.env = OLD_ENV; // Restore old environment
  });

  describe('ClientAuthUtils.authenticateClient', () => {
    let mockRequest: NextRequest;
    let mockBody: FormData;

    // Define a more complete mock client that satisfies Prisma's OAuthClient type
    const mockConfidentialClientFull: Client = {
      id: 'client-cuid-confidential',
      clientId: 'confidential-client-string-id',
      clientSecret: 'hashed_secret_value',
      name: 'Test Confidential Client Full',
      clientType: PrismaClientType.CONFIDENTIAL,
      allowedScopes: JSON.stringify(['openid','profile']),
      redirectUris: JSON.stringify(['http://localhost/callback']),
      isActive: true,
      isPublic: false,
      accessTokenLifetime: 3600,
      refreshTokenLifetime: 86400,
      jwksUri: 'https://client.example.com/jwks.json', // For JWT assertion tests
      clientUri: null, logoUri: null, tosUri: null, policyUri: null,
      clientSecretExpiresAt: null, contacts: null, defaultMaxAge: null,
      requireAuthTime: false, requirePkce: true,
      idTokenSignedResponseAlg: 'RS256', idTokenEncryptedResponseAlg: null, idTokenEncryptedResponseEnc: null,
      userinfoSignedResponseAlg: null, userinfoEncryptedResponseAlg: null, userinfoEncryptedResponseEnc: null,
      requestObjectSigningAlg: null, requestObjectEncryptionAlg: null, requestObjectEncryptionEnc: null,
      tokenEndpointAuthMethod: 'client_secret_basic', tokenEndpointAuthSigningAlg: null,
      defaultAcrValues: null, initiateLoginUri: null,
      authorizationSignedResponseAlg: null, authorizationEncryptedResponseAlg: null, authorizationEncryptedResponseEnc: null,
      createdAt: new Date(), updatedAt: new Date(),
    };

     const mockPublicClientFull: Client = {
      ...mockConfidentialClientFull,
      id: 'client-cuid-public',
      clientId: 'public-client-string-id',
      clientSecret: null,
      clientType: PrismaClientType.PUBLIC,
      isPublic: true,
      tokenEndpointAuthMethod: 'none',
    };


    beforeEach(() => {
      mockBody = new FormData();
      // Base request for POST, actual body added per test
      mockRequest = new NextRequest('http://localhost/api/v2/oauth/token', { method: 'POST' });
    });

    describe('HTTP Basic Authentication', () => {
      it('should authenticate a confidential client with valid Basic Auth header', async () => {
        const plainSecret = 'plain_secret_text';
        const basicAuthToken = Buffer.from(`${mockConfidentialClientFull.clientId}:${plainSecret}`).toString('base64');
        mockRequest.headers.set('Authorization', `Basic ${basicAuthToken}`);
        (prisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(mockConfidentialClientFull);
        (bcrypt.compare as jest.Mock).mockResolvedValue(true);

        const client = await ClientAuthUtils.authenticateClient(mockRequest, mockBody);
        expect(client).toEqual(mockConfidentialClientFull);
        expect(prisma.oAuthClient.findUnique).toHaveBeenCalledWith({ where: { clientId: mockConfidentialClientFull.clientId, isActive: true } });
        expect(bcrypt.compare).toHaveBeenCalledWith(plainSecret, mockConfidentialClientFull.clientSecret);
      });

      it('should throw OAuth2Error (INVALID_CLIENT, 401) for invalid Basic Auth format (e.g. bad base64)', async () => {
        mockRequest.headers.set('Authorization', `Basic invalid-base64-string!@#`);
        await expect(ClientAuthUtils.authenticateClient(mockRequest, mockBody))
          .rejects.toThrowError(new OAuth2Error('Invalid Basic authentication header format.', OAuth2ErrorCode.InvalidClient, 401));
      });

      it('should throw OAuth2Error (INVALID_CLIENT, 401) if client not found with Basic Auth', async () => {
        const basicAuthToken = Buffer.from(`unknown-client:secret`).toString('base64');
        mockRequest.headers.set('Authorization', `Basic ${basicAuthToken}`);
        (prisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(null);

        await expect(ClientAuthUtils.authenticateClient(mockRequest, mockBody))
            .rejects.toThrowError(new OAuth2Error('Invalid client ID or client not active.', OAuth2ErrorCode.InvalidClient, 401));
      });

      it('should throw OAuth2Error (INVALID_CLIENT, 401) for incorrect secret in Basic Auth', async () => {
        const basicAuthToken = Buffer.from(`${mockConfidentialClientFull.clientId}:wrong_secret`).toString('base64');
        mockRequest.headers.set('Authorization', `Basic ${basicAuthToken}`);
        (prisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(mockConfidentialClientFull);
        (bcrypt.compare as jest.Mock).mockResolvedValue(false);

        await expect(ClientAuthUtils.authenticateClient(mockRequest, mockBody))
            .rejects.toThrowError(new OAuth2Error('Invalid client secret.', OAuth2ErrorCode.InvalidClient, 401));
      });
    });

    describe('Client Secret in Body (client_secret_post)', () => {
        it('should authenticate with client_id and client_secret in body', async () => {
            mockBody.set('client_id', mockConfidentialClientFull.clientId);
            mockBody.set('client_secret', 'plain_secret_text');
            (prisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(mockConfidentialClientFull);
            (bcrypt.compare as jest.Mock).mockResolvedValue(true);

            const client = await ClientAuthUtils.authenticateClient(mockRequest, mockBody);
            expect(client).toEqual(mockConfidentialClientFull);
        });

        it('should throw ConfigurationError if confidential client has no secret in DB (body auth)', async () => {
            mockBody.set('client_id', mockConfidentialClientFull.clientId);
            mockBody.set('client_secret', 'plain_secret_text');
            (prisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue({ ...mockConfidentialClientFull, clientSecret: null });

            await expect(ClientAuthUtils.authenticateClient(mockRequest, mockBody))
                .rejects.toThrowError(new ConfigurationError('Client secret not configured for this client.', 'CLIENT_CONFIG_MISSING_SECRET'));
        });
    });

    describe('Public Client Authentication', () => {
        it('should authenticate public client with client_id in body and no secret', async () => {
            mockBody.set('client_id', mockPublicClientFull.clientId);
            (prisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(mockPublicClientFull);

            const client = await ClientAuthUtils.authenticateClient(mockRequest, mockBody);
            expect(client).toEqual(mockPublicClientFull);
            expect(bcrypt.compare).not.toHaveBeenCalled();
        });

        it('should throw OAuth2Error if a non-public client attempts public auth style', async () => {
            mockBody.set('client_id', mockConfidentialClientFull.clientId); // Is confidential, but no secret provided
            (prisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(mockConfidentialClientFull);

            await expect(ClientAuthUtils.authenticateClient(mockRequest, mockBody))
                .rejects.toThrowError(new OAuth2Error('Client is not a public client and requires authentication.', OAuth2ErrorCode.InvalidClient, 401));
        });
    });

    describe('JWT Assertion Authentication (private_key_jwt)', () => {
        const mockJwtAssertion = "mocked.jwt.assertion";
        const mockClientIdInJwt = mockConfidentialClientFull.clientId;

        beforeEach(() => {
            mockBody.set('client_assertion_type', 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer');
            mockBody.set('client_assertion', mockJwtAssertion);
            // Mock decodeJwt to provide client_id for DB lookup
            (jose.decodeJwt as jest.Mock).mockReturnValue({ iss: mockClientIdInJwt, sub: mockClientIdInJwt, aud: 'http://localhost/api/v2/oauth/token', jti: 'jwt-id', exp: Date.now()/1000 + 300 });
        });

        it('should authenticate client with valid JWT assertion', async () => {
            (prisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(mockConfidentialClientFull); // Client has jwksUri
            (jose.jwtVerify as jest.Mock).mockResolvedValue({ payload: { /* ... relevant claims ... */ } }); // Simulate successful verification

            const client = await ClientAuthUtils.authenticateClient(mockRequest, mockBody);
            expect(client).toEqual(mockConfidentialClientFull);
            expect(jose.jwtVerify).toHaveBeenCalledWith(
                mockJwtAssertion,
                expect.any(Function), // The JWKS function from createRemoteJWKSet
                expect.objectContaining({
                    issuer: mockClientIdInJwt,
                    audience: 'http://localhost/api/v2/oauth/token'
                })
            );
        });

        it('should throw ConfigurationError if client has no jwksUri for JWT assertion', async () => {
            (prisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue({ ...mockConfidentialClientFull, jwksUri: null });

            await expect(ClientAuthUtils.authenticateClient(mockRequest, mockBody))
                .rejects.toThrowError(new ConfigurationError('Client is not configured for JWT assertion-based authentication (missing jwks_uri).', 'CLIENT_CONFIG_MISSING_JWKS_URI'));
        });

        it('should throw OAuth2Error if JWT assertion iss/sub mismatch', async () => {
            (jose.decodeJwt as jest.Mock).mockReturnValue({ iss: 'client-a', sub: 'client-b' });
            // DB lookup for 'client-a' might still happen
            (prisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(mockConfidentialClientFull);


            await expect(ClientAuthUtils.authenticateClient(mockRequest, mockBody))
                .rejects.toThrowError(new OAuth2Error('Invalid JWT assertion: iss and sub claims are required and must be identical (client_id).', OAuth2ErrorCode.InvalidClient, 400));
        });

        it('should throw OAuth2Error if JWT assertion verification fails (e.g. signature, expiry)', async () => {
            (prisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(mockConfidentialClientFull);
            (jose.jwtVerify as jest.Mock).mockRejectedValue(new jose.errors.JWSSignatureVerificationFailed('Signature verification failed'));

            await expect(ClientAuthUtils.authenticateClient(mockRequest, mockBody))
                .rejects.toThrowError(new OAuth2Error('Client assertion signature verification failed.', OAuth2ErrorCode.InvalidClient, 400));
        });
    });

    it('should throw OAuth2Error (INVALID_CLIENT, 401) if no specific auth method is viable', async () => {
        // Empty body, no auth header
        await expect(ClientAuthUtils.authenticateClient(mockRequest, new FormData()))
            .rejects.toThrowError(new OAuth2Error('Client authentication required but not provided or method not supported.', OAuth2ErrorCode.InvalidClient, 401));
    });
  });

  // TODO: Add tests for PKCEUtils, ScopeUtils, JWTUtils, AuthorizationUtils
});
