import { NextRequest, NextResponse } from 'next/server';
import { GET } from '@/app/api/v2/oauth/userinfo/route';
import { prisma } from '@/lib/prisma';
import { JWTUtils, ScopeUtils, OAuth2ErrorTypes } from '@/lib/auth/oauth2';
import { User } from '@prisma/client';

// Mock TextEncoder/TextDecoder for 'jose' (used by JWTUtils)
global.TextEncoder = require('util').TextEncoder;
global.TextDecoder = require('util').TextDecoder;

// Mock dependencies
vi.mock('@/lib/prisma', () => ({
  prisma: {
    accessToken: {
      findFirst: vi.fn(),
    },
    // User model is implicitly used via `include: { user: true }` in accessToken.findFirst
    // No direct prisma.user.findUnique is in the UserInfo GET handler itself.
  },
}));

vi.mock('@/lib/auth/oauth2', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    JWTUtils: {
      ...actual.JWTUtils,
      verifyAccessToken: vi.fn(),
      getTokenHash: vi.fn((token) => `hashed-${token}`), // Mock hash generation
    },
    ScopeUtils: {
      ...actual.ScopeUtils,
      parseScopes: vi.fn(actual.ScopeUtils.parseScopes), // Use actual implementation but spyable
    },
    // OAuth2ErrorTypes is a const object, no need to mock unless changing values.
  };
});

// Mock errorResponse and successResponse from '@/lib/api/apiResponse'
// The userinfo route uses errorResponse from this path.
// Based on the file content: `import { successResponse, errorResponse }from '@/lib/api/apiResponse';`
// So we mock this path.
vi.mock('@/lib/api/apiResponse', () => ({
    errorResponse: vi.fn((status, message, errorCode, requestId) => ({ // Matches userinfo's usage
        success: false,
        status,
        message,
        errorCode,
        requestId,
    })),
    successResponse: vi.fn((status, data, requestId) => ({ // Not used by userinfo but good to have
        success: true,
        status,
        data,
        requestId,
    })),
}));

// Mock withErrorHandler wrapper
vi.mock('@/lib/api/errorHandler', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        withErrorHandler: vi.fn((handler) => async (req: NextRequest) => {
            // This mock directly calls the handler, bypassing actual error handling for unit tests
            // It also injects a mock requestId as the actual wrapper does.
            (req as any).requestId = 'mock-request-id-from-wrapper';
            return handler(req);
        }),
    };
});


// Helper to create a mock NextRequest
const createMockUserInfoRequest = (headers?: Record<string, string>): NextRequest => {
  const requestHeaders = new Headers(headers);
  return {
    headers: requestHeaders,
    url: 'http://localhost/api/v2/oauth/userinfo',
    method: 'GET',
    // ... other properties if needed
  } as NextRequest;
};

describe('OIDC UserInfo Endpoint - /api/v2/oauth/userinfo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('should return 401 if Authorization header is missing', async () => {
    const request = createMockUserInfoRequest();
    await GET(request);

    expect(prisma.accessToken.findFirst).not.toHaveBeenCalled();
    expect(JWTUtils.verifyAccessToken).not.toHaveBeenCalled();
    expect(NextResponse.json).toHaveBeenCalledWith(
        // errorResponse is mocked, so this is the object it returns
        expect.objectContaining({
            status: 401,
            message: expect.stringContaining('未提供访问令牌'), // Access token not provided
            errorCode: 'INVALID_REQUEST', // Corrected this from userinfo's 'UNAUTHORIZED'
        }),
        expect.objectContaining({
            status: 401,
            headers: expect.objectContaining({ 'WWW-Authenticate': expect.stringContaining('Bearer error="invalid_request"') }),
        })
    );
  });

  test('should return 401 if Authorization header is not Bearer', async () => {
    const request = createMockUserInfoRequest({ Authorization: 'Basic someauth' });
    await GET(request);
    expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 401, errorCode: 'INVALID_REQUEST' }),
        expect.objectContaining({ status: 401, headers: expect.objectContaining({ 'WWW-Authenticate': expect.stringContaining('Bearer error="invalid_request"') })})
    );
  });

  test('should return 401 if token verification fails (JWTUtils.verifyAccessToken returns invalid)', async () => {
    (JWTUtils.verifyAccessToken as any).mockResolvedValue({ valid: false, error: 'Token signature invalid' });
    const request = createMockUserInfoRequest({ Authorization: 'Bearer invalidtoken' });
    await GET(request);

    expect(JWTUtils.verifyAccessToken).toHaveBeenCalledWith('invalidtoken');
    expect(NextResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 401, errorCode: 'INVALID_TOKEN', message: expect.stringContaining('无效的访问令牌: Token signature invalid') }),
      expect.objectContaining({ status: 401, headers: expect.objectContaining({ 'WWW-Authenticate': expect.stringContaining('Bearer error="invalid_token"') })})
    );
  });

  test('should return 401 if token is not found in DB or expired in DB', async () => {
    const mockPayload = { sub: 'user123', scope: 'openid profile', jti: 'jti123', aud: 'api_resource_dev', iss: 'http://localhost:3000' };
    (JWTUtils.verifyAccessToken as any).mockResolvedValue({ valid: true, payload: mockPayload });
    (prisma.accessToken.findFirst as any).mockResolvedValue(null); // Token not found in DB

    const request = createMockUserInfoRequest({ Authorization: 'Bearer validjwt-notindb' });
    await GET(request);

    expect(JWTUtils.getTokenHash).toHaveBeenCalledWith('validjwt-notindb');
    expect(prisma.accessToken.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { tokenHash: 'hashed-validjwt-notindb', expiresAt: { gt: expect.any(Date) } },
    }));
    expect(NextResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 401, errorCode: 'INVALID_TOKEN', message: expect.stringContaining('访问令牌无效或已被撤销') }),
      expect.objectContaining({ status: 401 })
    );
  });

  test('should return 403 if "openid" scope is missing', async () => {
    const mockPayload = { sub: 'user123', scope: 'profile email', jti: 'jti123', aud: 'api_resource_dev', iss: 'http://localhost:3000' };
    const mockUser = { id: 'user123', email: 'test@example.com', firstName: 'Test', lastName: 'User', username: 'testuser', avatar: 'url', updatedAt: new Date(), emailVerified: true, phone: '12345', phoneVerified: false, displayName: 'Test D. User' };
    const mockDbAccessToken = {
      id: 'dbTokenId',
      tokenHash: 'hashed-validtoken-noopenid',
      userId: 'user123',
      clientId: 'client1',
      scope: 'profile email', // No openid
      expiresAt: new Date(Date.now() + 3600 * 1000),
      user: mockUser,
    };

    (JWTUtils.verifyAccessToken as any).mockResolvedValue({ valid: true, payload: mockPayload });
    (prisma.accessToken.findFirst as any).mockResolvedValue(mockDbAccessToken);

    const request = createMockUserInfoRequest({ Authorization: 'Bearer validtoken-noopenid' });
    await GET(request);

    expect(ScopeUtils.parseScopes).toHaveBeenCalledWith('profile email'); // From JWT payload
    expect(NextResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 403, errorCode: 'insufficient_scope' }), // Error code is lowercase
      expect.objectContaining({ status: 403 })
    );
  });

  test('should return 404 if user not found for sub claim (but token and openid scope are valid)', async () => {
    const mockPayload = { sub: 'user-does-not-exist', scope: 'openid', jti: 'jti123', aud: 'api_resource_dev', iss: 'http://localhost:3000' };
    const mockDbAccessToken = { // User is null here
      id: 'dbTokenId',
      tokenHash: 'hashed-validtoken-nouser',
      userId: 'user-does-not-exist',
      clientId: 'client1',
      scope: 'openid',
      expiresAt: new Date(Date.now() + 3600 * 1000),
      user: null, // Simulate user not found or inactive and thus not attached
    };
    (JWTUtils.verifyAccessToken as any).mockResolvedValue({ valid: true, payload: mockPayload });
    (prisma.accessToken.findFirst as any).mockResolvedValue(mockDbAccessToken);

    const request = createMockUserInfoRequest({ Authorization: 'Bearer validtoken-nouser' });
    await GET(request);

    expect(NextResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 404, errorCode: 'NOT_FOUND' }),
      expect.objectContaining({ status: 404 })
    );
  });

  describe('Successful UserInfo Responses', () => {
    const mockUser: User = {
      id: 'user123',
      username: 'testuser',
      passwordHash: 'hash',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(Date.now() - 100000), // ensure updated_at is in the past
      lastLoginAt: null,
      displayName: 'Test Display Name',
      firstName: 'Test',
      lastName: 'User',
      avatar: 'http://example.com/avatar.jpg',
      organization: 'Org',
      department: 'Dept',
      mustChangePassword: false,
      failedLoginAttempts: 0,
      lockedUntil: null,
      createdBy: 'admin',
      email: 'test@example.com',
      emailVerified: true,
      phone: '+11234567890',
      phoneVerified: false,
      // Add any other fields from User model that might be used
      profileUrl: 'http://example.com/profile',
      websiteUrl: 'http://example.com/website',
      gender: 'male',
      birthdate: '1990-01-01',
      zoneinfo: 'America/New_York',
      locale: 'en-US',
      address_formatted: '123 Main St, Anytown, USA',
    };

    const setupSuccessMocks = (tokenScope: string, dbScope?: string) => {
      const jwtPayload = { sub: 'user123', scope: tokenScope, jti: 'jti-success', aud: 'api_resource_dev', iss: 'http://localhost:3000' };
      const dbAccessToken = {
        id: 'dbTokenSuccess',
        tokenHash: `hashed-validtoken-${tokenScope.replace(/\s+/g, '-')}`,
        userId: 'user123',
        clientId: 'client1',
        scope: dbScope || tokenScope, // DB scope can sometimes differ slightly, though usually matches JWT
        expiresAt: new Date(Date.now() + 3600 * 1000),
        user: mockUser,
      };
      (JWTUtils.verifyAccessToken as any).mockResolvedValue({ valid: true, payload: jwtPayload });
      (prisma.accessToken.findFirst as any).mockResolvedValue(dbAccessToken);
    };

    test('should return 200 with only "sub" if only "openid" scope is granted', async () => {
      setupSuccessMocks('openid');
      const request = createMockUserInfoRequest({ Authorization: 'Bearer validtoken-openid-only' });
      const response = await GET(request);
      const jsonBody = JSON.parse(await (response as Response).text());


      expect(response.status).toBe(200);
      expect(jsonBody.sub).toBe('user123');
      expect(Object.keys(jsonBody).length).toBe(1); // Only sub
    });

    test('should return profile claims for "openid profile" scopes', async () => {
      setupSuccessMocks('openid profile');
      const request = createMockUserInfoRequest({ Authorization: 'Bearer validtoken-profile' });
      const response = await GET(request);
      const jsonBody = JSON.parse(await (response as Response).text());

      expect(response.status).toBe(200);
      expect(jsonBody.sub).toBe('user123');
      expect(jsonBody.name).toBe('Test User');
      expect(jsonBody.given_name).toBe('Test');
      expect(jsonBody.family_name).toBe('User');
      expect(jsonBody.preferred_username).toBe('testuser');
      expect(jsonBody.nickname).toBe('Test Display Name'); // from displayName
      expect(jsonBody.picture).toBe('http://example.com/avatar.jpg');
      expect(jsonBody.profile).toBe('http://example.com/profile');
      expect(jsonBody.website).toBe('http://example.com/website');
      // gender, birthdate, zoneinfo, locale are not in the current User model used by userinfo endpoint.
      // If they were, they would be tested here. The UserInfo route code has commented out lines for them.
      expect(jsonBody.updated_at).toBe(Math.floor(mockUser.updatedAt.getTime() / 1000));
    });

    test('should return email claims for "openid email" scopes', async () => {
      setupSuccessMocks('openid email');
      const request = createMockUserInfoRequest({ Authorization: 'Bearer validtoken-email' });
      const response = await GET(request);
      const jsonBody = JSON.parse(await (response as Response).text());

      expect(response.status).toBe(200);
      expect(jsonBody.sub).toBe('user123');
      expect(jsonBody.email).toBe('test@example.com');
      expect(jsonBody.email_verified).toBe(true);
    });

    test('should return phone claims for "openid phone" scopes', async () => {
        setupSuccessMocks('openid phone');
        const request = createMockUserInfoRequest({ Authorization: 'Bearer validtoken-phone' });
        const response = await GET(request);
        const jsonBody = JSON.parse(await (response as Response).text());

        expect(response.status).toBe(200);
        expect(jsonBody.sub).toBe('user123');
        expect(jsonBody.phone_number).toBe('+11234567890');
        expect(jsonBody.phone_number_verified).toBe(false);
    });

    test('should return all relevant claims for "openid profile email phone" scopes', async () => {
      setupSuccessMocks('openid profile email phone');
      const request = createMockUserInfoRequest({ Authorization: 'Bearer validtoken-all' });
      const response = await GET(request);
      const jsonBody = JSON.parse(await (response as Response).text());

      expect(response.status).toBe(200);
      // Profile
      expect(jsonBody.sub).toBe('user123');
      expect(jsonBody.name).toBe('Test User');
      expect(jsonBody.picture).toBe('http://example.com/avatar.jpg');
      // Email
      expect(jsonBody.email).toBe('test@example.com');
      expect(jsonBody.email_verified).toBe(true);
      // Phone
      expect(jsonBody.phone_number).toBe('+11234567890');
      expect(jsonBody.phone_number_verified).toBe(false);
      // Ensure no other claims are present
      const expectedKeys = ['sub', 'name', 'given_name', 'family_name', 'preferred_username', 'nickname', 'picture', 'profile', 'website', 'updated_at', 'email', 'email_verified', 'phone_number', 'phone_number_verified'];
      Object.keys(jsonBody).forEach(key => {
        expect(expectedKeys).toContain(key);
      });
    });

     test('email_verified should default to false if not on user model and email scope present', async () => {
      const userWithoutEmailVerified = { ...mockUser };
      delete (userWithoutEmailVerified as any).emailVerified; // Simulate field not existing

      const jwtPayload = { sub: 'user123', scope: 'openid email', jti: 'jti-success-no-email-verified', aud: 'api_resource_dev', iss: 'http://localhost:3000' };
      const dbAccessToken = {
        id: 'dbTokenSuccessNoEmailVerified',
        userId: 'user123',
        user: userWithoutEmailVerified, // Use modified user
        scope: 'openid email',
        expiresAt: new Date(Date.now() + 3600 * 1000),
      };
      (JWTUtils.verifyAccessToken as any).mockResolvedValue({ valid: true, payload: jwtPayload });
      (prisma.accessToken.findFirst as any).mockResolvedValue(dbAccessToken);

      const request = createMockUserInfoRequest({ Authorization: 'Bearer token-no-email-verified-field' });
      const response = await GET(request);
      const jsonBody = JSON.parse(await (response as Response).text());

      expect(response.status).toBe(200);
      expect(jsonBody.email).toBe(mockUser.email);
      expect(jsonBody.email_verified).toBe(false); // Should default to false
    });

  });
});
