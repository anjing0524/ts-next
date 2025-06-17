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
    // Adjusted mockUser to reflect fields actually in Prisma schema and used by the route
    const mockUser: User = {
      id: 'user123',
      username: 'testuser',
      passwordHash: 'hash', // Required by User type, not directly used in UserInfo response
      isActive: true,      // Required by User type
      createdAt: new Date(), // Required by User type
      updatedAt: new Date(Date.now() - 100000),
      lastLoginAt: null,
      displayName: 'Test Display Name',
      firstName: 'Test',
      lastName: 'User',
      avatar: 'http://example.com/avatar.jpg',
      organization: 'Info Org',
      department: 'Info Dept',
      mustChangePassword: true,  // Required by User type
      failedLoginAttempts: 0,   // Required by User type
      lockedUntil: null,        // Required by User type
      createdBy: null,          // Required by User type
      // Fields like email, emailVerified, phone, phoneVerified, address_formatted are NOT in the Prisma schema
      // So they are removed from this mock if they are not used by the UserInfo construction logic.
      // The route only maps existing Prisma fields.
    };

    const setupSuccessMocks = (tokenScope: string, dbScope?: string) => {
      const jwtPayload = { sub: mockUser.id, scope: tokenScope, jti: 'jti-success', aud: process.env.JWT_AUDIENCE!, iss: process.env.JWT_ISSUER! };
      const dbAccessToken = {
        id: 'dbTokenSuccess',
        tokenHash: `hashed-validtoken-${tokenScope.replace(/\s+/g, '-')}`,
        userId: mockUser.id,
        clientId: 'client1',
        scope: dbScope || tokenScope,
        expiresAt: new Date(Date.now() + 3600 * 1000),
        isRevoked: false, // Added this field as it's in the model now
        user: mockUser,
      };
      (JWTUtils.verifyAccessToken as any).mockResolvedValue({ valid: true, payload: jwtPayload });
      (prisma.accessToken.findFirst as any).mockResolvedValue(dbAccessToken);
      (prisma.tokenBlacklist.findUnique as any).mockResolvedValue(null); // Assume token JTI not blacklisted for success cases
    };

    test('should return 200 with only "sub" if only "openid" scope is granted', async () => {
      setupSuccessMocks('openid');
      const request = createMockUserInfoRequest({ Authorization: 'Bearer validtoken-openid-only' });
      const response = await GET(request);
      const jsonBody = await (response as Response).json();

      expect(response.status).toBe(200);
      expect(jsonBody.sub).toBe(mockUser.id);
      expect(Object.keys(jsonBody).length).toBe(1); // Only sub
    });

    test('should return profile claims for "openid profile" scopes (based on available User fields)', async () => {
      setupSuccessMocks('openid profile');
      const request = createMockUserInfoRequest({ Authorization: 'Bearer validtoken-profile' });
      const response = await GET(request);
      const jsonBody = await (response as Response).json();

      expect(response.status).toBe(200);
      expect(jsonBody.sub).toBe(mockUser.id);
      expect(jsonBody.name).toBe(mockUser.displayName || `${mockUser.firstName || ''} ${mockUser.lastName || ''}`.trim());
      expect(jsonBody.given_name).toBe(mockUser.firstName);
      expect(jsonBody.family_name).toBe(mockUser.lastName);
      expect(jsonBody.preferred_username).toBe(mockUser.username);
      expect(jsonBody.picture).toBe(mockUser.avatar);
      expect(jsonBody.organization).toBe(mockUser.organization);
      expect(jsonBody.department).toBe(mockUser.department);
      expect(jsonBody.updated_at).toBe(Math.floor(mockUser.updatedAt.getTime() / 1000));

      // Ensure claims not in schema or based on non-existent User fields are undefined
      expect(jsonBody.email).toBeUndefined();
      expect(jsonBody.profile).toBeUndefined(); // Was user.profileUrl, not in Prisma User
      expect(jsonBody.website).toBeUndefined(); // Was user.websiteUrl, not in Prisma User
    });

    // Since User model has no email, email_verified, phone_number, phone_number_verified, address fields,
    // tests for 'email', 'phone', 'address' scopes will not return these specific claims.
    // The UserInfoResponse schema already reflects this.

    test('should not return email claims if "email" scope is granted but User model lacks email field', async () => {
      setupSuccessMocks('openid email'); // Token has 'email' scope
      const request = createMockUserInfoRequest({ Authorization: 'Bearer validtoken-email-scope-no-field' });
      const response = await GET(request);
      const jsonBody = await (response as Response).json();

      expect(response.status).toBe(200);
      expect(jsonBody.sub).toBe(mockUser.id);
      expect(jsonBody.email).toBeUndefined();
      expect(jsonBody.email_verified).toBeUndefined();
    });

    test('should return all relevant claims for "openid profile" (as other scopes like email/phone/address have no corresponding User fields)', async () => {
      setupSuccessMocks('openid profile email phone address'); // Token has all these scopes
      const request = createMockUserInfoRequest({ Authorization: 'Bearer validtoken-all-scopes' });
      const response = await GET(request);
      const jsonBody = await (response as Response).json();

      expect(response.status).toBe(200);
      expect(jsonBody.sub).toBe(mockUser.id);
      expect(jsonBody.name).toBe(mockUser.displayName || `${mockUser.firstName || ''} ${mockUser.lastName || ''}`.trim());
      expect(jsonBody.picture).toBe(mockUser.avatar);
      expect(jsonBody.organization).toBe(mockUser.organization);
      expect(jsonBody.department).toBe(mockUser.department);

      // These should be undefined as per current User model and schema
      expect(jsonBody.email).toBeUndefined();
      expect(jsonBody.phone_number).toBeUndefined();
      expect(jsonBody.address).toBeUndefined();

      const expectedKeys = ['sub', 'name', 'given_name', 'family_name', 'preferred_username', 'picture', 'updated_at', 'organization', 'department'];
      Object.keys(jsonBody).forEach(key => {
        expect(expectedKeys).toContain(key);
      });
    });
  });
});
