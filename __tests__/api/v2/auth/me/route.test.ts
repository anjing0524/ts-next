// __tests__/api/v2/auth/me/route.test.ts

import { GET } from '@/app/api/v2/auth/me/route';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';
import { ApiResponse } from '@/lib/types/api';
import { AuthenticatedRequest, AuthenticatedUser } from '@/lib/auth/types';

// Mock Prisma
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
  },
}));

// Mock the requirePermission HOF to bypass actual permission checks
// and to allow us to set req.user for testing the handler directly.
let mockAuthUser: AuthenticatedUser | null = null;
jest.mock('@/lib/auth/middleware', () => ({
  requirePermission: jest.fn((permission) => (handler) => async (req: AuthenticatedRequest, params?: any) => {
    if (mockAuthUser === undefined) { // Simulate requirePermission failing to set user (e.g. token issue not caught by HOF itself but handler expects user)
        // This case is more about testing the handler's robustness if req.user is unexpectedly missing
        // For actual requirePermission errors (like no token), those would be tested in middleware.test.ts
        // and would likely respond before handler is even called.
        // Here, we simulate it reaching the handler but req.user is not there.
        (req as any).user = null; // or undefined
    } else {
        req.user = mockAuthUser;
    }
    return handler(req, params);
  }),
}));


// Helper to create a mock AuthenticatedRequest
function createMockMeRequest(user: AuthenticatedUser | null | undefined): AuthenticatedRequest {
  const request = new NextRequest('http://localhost/api/v2/auth/me', {
    method: 'GET',
  });
  // This setup is a bit artificial as requirePermission mock handles req.user directly.
  // The 'user' parameter here is to control what the mock HOF assigns to req.user.
  mockAuthUser = user;
  return request as AuthenticatedRequest;
}

describe('GET /api/v2/auth/me', () => {
  const defaultMockAuthUser: AuthenticatedUser = {
    id: 'user-authed-id',
    permissions: ['auth:me:read', 'some:other:perm'],
    clientId: 'client-for-me-token',
  };

  const prismaUserMock = {
    id: 'user-authed-id',
    username: 'autheduser',
    email: 'authed@example.com',
    isActive: true,
    mustChangePassword: false,
    firstName: 'Authed',
    lastName: 'User',
    displayName: 'Authed Display Name',
    avatar: 'http://example.com/avatar.png',
    phone: '1234567890',
    organization: 'AuthOrg',
    department: 'AuthDept',
    workLocation: 'AuthLocation',
    emailVerified: true,
    lastLoginAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    updatedBy: null,
    // passwordHash and other sensitive fields are not expected in response
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Set a default valid authenticated user for most tests
    mockAuthUser = defaultMockAuthUser;
  });

  it('should return user details successfully (200) if user is authenticated and found', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(prismaUserMock);
    const req = createMockMeRequest(defaultMockAuthUser);
    const response = await GET(req); // GET is already wrapped with withErrorHandling(requirePermission(...))
    const body: ApiResponse<any> = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toBe("User profile fetched successfully.");
    expect(body.data).toBeDefined();
    expect(body.data?.id).toBe(prismaUserMock.id);
    expect(body.data?.username).toBe(prismaUserMock.username);
    expect(body.data?.email).toBe(prismaUserMock.email);
    expect(body.data?.firstName).toBe(prismaUserMock.firstName);
    expect(body.data?.permissions).toEqual(defaultMockAuthUser.permissions);
    expect(body.data?.client_id).toBe(defaultMockAuthUser.clientId);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: defaultMockAuthUser.id },
      select: expect.any(Object), // Check that select is used
    });
  });

  it('should return 500 if req.user is not populated by middleware (SERVER_SETUP_ERROR_ME)', async () => {
    const req = createMockMeRequest(undefined); // req.user will be undefined/null
    const response = await GET(req);
    const body: ApiResponse<never> = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe('SERVER_SETUP_ERROR_ME');
    expect(body.error?.message).toBe('User context not available after authentication. This indicates a server setup error.');
  });

  it('should return 404 if authenticated user is not found in database (USER_NOT_FOUND_FROM_TOKEN_ME)', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    const req = createMockMeRequest(defaultMockAuthUser);
    const response = await GET(req);
    const body: ApiResponse<never> = await response.json();

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe('USER_NOT_FOUND_FROM_TOKEN_ME');
    expect(body.error?.message).toBe('User associated with this token not found.');
  });

  it('should return 401 if user account is inactive (ACCOUNT_INACTIVE_ME)', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ ...prismaUserMock, isActive: false });
    const req = createMockMeRequest(defaultMockAuthUser);
    const response = await GET(req);
    const body: ApiResponse<never> = await response.json();

    // AuthenticationError defaults to 401, but the message implies a state where user *is* authenticated but not usable.
    // The route throws AuthenticationError which results in 401.
    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe('ACCOUNT_INACTIVE_ME');
    expect(body.error?.message).toBe('User account is inactive.');
  });

  it('should return 500 if Prisma query fails (INTERNAL_SERVER_ERROR)', async () => {
    (prisma.user.findUnique as jest.Mock).mockRejectedValue(new Error('Prisma connection failed'));
    const req = createMockMeRequest(defaultMockAuthUser);
    const response = await GET(req);
    const body: ApiResponse<never> = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe('INTERNAL_SERVER_ERROR'); // from withErrorHandling
  });
});

// For Swagger reference in route file:
/*
components:
  schemas:
    UserMeResponseData:
      type: object
      properties:
        id: { type: string }
        username: { type: string, nullable: true }
        email: { type: string, format: email, nullable: true }
        // ... other User fields from UserMeResponse ...
        permissions: { type: array, items: { type: string } }
        client_id: { type: string, nullable: true }
    ApiResponseUserMe:
      allOf:
        - $ref: '#/components/schemas/ApiResponseBase'
        - type: object
          properties:
            data: { $ref: '#/components/schemas/UserMeResponseData' }
    ApiResponseBase:
      type: object
      properties:
        success: { type: boolean }
        message: { type: string, nullable: true }
    ApiError:
      type: object
      properties:
        code: { type: string }
        message: { type: string }
        details: { type: object, additionalProperties: true, nullable: true }
*/
