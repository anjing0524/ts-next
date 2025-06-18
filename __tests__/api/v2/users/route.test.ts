// __tests__/api/v2/users/route.test.ts

import { POST, GET } from '@/app/api/v2/users/route'; // Import the handlers
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcrypt';
import { NextRequest } from 'next/server';
import { ApiResponse } from '@/lib/types/api';
import { AuthenticatedRequest } from '@/lib/auth/types';
// Assuming UserResponse and ListUsersResponse types are implicitly defined by handler return or explicitly imported if available
// For now, we'll use `any` for complex data parts if not easily importable or defined.

// Mock Prisma
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

// Mock bcrypt
jest.mock('bcrypt', () => ({
  hash: jest.fn(),
}));

// Mock the requirePermission HOF to bypass actual permission checks and just run the handler
// This also helps in providing the mock 'req.user' object
const mockPerformingAdmin = { id: 'admin-user-id', clientId: 'admin-client-id', permissions: ['users:create', 'users:list'] };
jest.mock('@/lib/auth/middleware', () => ({
  requirePermission: jest.fn((permission) => (handler) => async (req: AuthenticatedRequest, params?: any) => {
    // Attach a mock user to the request for the handler
    req.user = mockPerformingAdmin;
    return handler(req, params);
  }),
}));


// Helper to create a mock NextRequest / AuthenticatedRequest
function createMockRequest(body: any, method: string = 'POST', searchParamsString: string = ''): AuthenticatedRequest {
  const url = `http://localhost/api/v2/users${searchParamsString ? '?' + searchParamsString : ''}`;
  const request = new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : null,
  });
  // Simulate the properties added by requirePermission
  (request as any).user = mockPerformingAdmin;
  return request as AuthenticatedRequest;
}


describe('API /api/v2/users', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST (createUserHandlerInternal)', () => {
    const validCreateUserData = {
      username: 'newuser',
      email: 'newuser@example.com',
      password: 'Password123!',
      firstName: 'New',
      lastName: 'User',
      displayName: 'Newbie',
      isActive: true,
      mustChangePassword: false,
    };

    it('should create a user successfully (201)', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(null); // No existing user
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashedNewPassword');
      const createdUserMock = {
        id: 'new-user-id',
        ...validCreateUserData,
        passwordHash: undefined, // Not returned
        createdBy: mockPerformingAdmin.id,
        createdAt: new Date(),
        updatedAt: new Date(),
        // Fill other UserResponse fields
        avatar: null, organization: null, department: null, lastLoginAt: null, phone: null, workLocation: null, emailVerified: null,
      };
      (prisma.user.create as jest.Mock).mockResolvedValue(createdUserMock);

      const req = createMockRequest(validCreateUserData);
      const response = await POST(req);
      const body: ApiResponse<any> = await response.json();

      expect(response.status).toBe(201);
      expect(body.success).toBe(true);
      expect(body.data?.id).toBe('new-user-id');
      expect(body.data?.username).toBe(validCreateUserData.username);
      expect(body.data?.email).toBe(validCreateUserData.email.toLowerCase());
      expect(body.message).toBe("User created successfully.");
      expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ username: 'newuser', passwordHash: 'hashedNewPassword' })
      }));
    });

    it('should return 400 for invalid JSON body', async () => {
      const req = new NextRequest('http://localhost/api/v2/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"invalid json',
      });
      (req as any).user = mockPerformingAdmin; // Simulate HOF

      const response = await POST(req as AuthenticatedRequest);
      const body: ApiResponse<never> = await response.json();

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('INVALID_JSON');
    });

    it('should return 400 for Zod validation failure (e.g., missing password)', async () => {
      const invalidData = { ...validCreateUserData, password: '' }; // Missing password
      const req = createMockRequest(invalidData);
      const response = await POST(req);
      const body: ApiResponse<never> = await response.json();

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('USER_VALIDATION_ERROR');
      expect(body.error?.details?.issues).toBeInstanceOf(Array);
      expect(body.error?.details?.issues[0].path).toContain('password');
    });

    it('should return 409 if username already exists', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValue({ id: 'existing-user-id', username: validCreateUserData.username });
      const req = createMockRequest(validCreateUserData);
      const response = await POST(req);
      const body: ApiResponse<never> = await response.json();

      expect(response.status).toBe(409);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('CONFLICT_USER_EXISTS');
      expect(body.error?.message).toContain('username already exists');
    });

    it('should return 500 if bcrypt.hash fails', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockRejectedValue(new Error('bcrypt failed'));
      const req = createMockRequest(validCreateUserData);
      const response = await POST(req);
      const body: ApiResponse<never> = await response.json();

      expect(response.status).toBe(500);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('INTERNAL_SERVER_ERROR');
    });

    it('should return 500 if prisma.user.create fails', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashedNewPassword');
      (prisma.user.create as jest.Mock).mockRejectedValue(new Error('Prisma create failed'));

      const req = createMockRequest(validCreateUserData);
      const response = await POST(req);
      const body: ApiResponse<never> = await response.json();

      expect(response.status).toBe(500);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('INTERNAL_SERVER_ERROR');
    });
  });

  describe('GET (listUsersHandlerInternal)', () => {
    const mockUsersList = [
      { id: 'user1', username: 'userone', email: 'one@example.com', isActive: true, createdAt: new Date() },
      { id: 'user2', username: 'usertwo', email: 'two@example.com', isActive: false, createdAt: new Date() },
    ];

    it('should return a list of users with default pagination (200)', async () => {
      (prisma.user.findMany as jest.Mock).mockResolvedValue(mockUsersList);
      (prisma.user.count as jest.Mock).mockResolvedValue(mockUsersList.length);

      const req = createMockRequest(null, 'GET');
      const response = await GET(req);
      const body: ApiResponse<any> = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data?.users).toEqual(mockUsersList);
      expect(body.data?.total).toBe(mockUsersList.length);
      expect(body.data?.page).toBe(1); // Default page
      expect(body.data?.pageSize).toBe(10); // Default page size
      expect(body.message).toBe("Users listed successfully.");
    });

    it('should return 400 for invalid query parameters (e.g., invalid page)', async () => {
      const req = createMockRequest(null, 'GET', 'page=invalid');
      const response = await GET(req);
      const body: ApiResponse<never> = await response.json();

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('USER_LIST_VALIDATION_ERROR');
      expect(body.error?.details?.issues).toBeInstanceOf(Array);
      expect(body.error?.details?.issues[0].path).toContain('page');
    });

    it('should filter users by isActive=true query parameter', async () => {
      (prisma.user.findMany as jest.Mock).mockResolvedValue([mockUsersList[0]]);
      (prisma.user.count as jest.Mock).mockResolvedValue(1);

      const req = createMockRequest(null, 'GET', 'isActive=true');
      await GET(req);

      expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ isActive: true }),
      }));
    });

    it('should return 500 if prisma.user.findMany fails', async () => {
      (prisma.user.findMany as jest.Mock).mockRejectedValue(new Error('Prisma findMany failed'));
      const req = createMockRequest(null, 'GET');
      const response = await GET(req);
      const body: ApiResponse<never> = await response.json();

      expect(response.status).toBe(500);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('INTERNAL_SERVER_ERROR');
    });
  });
});

// Define components/schemas references for Swagger doc in route.ts
// These are not used by tests directly but good for context.
/*
components:
  schemas:
    UserCreatePayload: // Zod schema based
      type: object
      required: [username, email, password]
      properties:
        # ... properties from userCreatePayloadSchema ...
    UserResponse: // For successful user creation/detail
      type: object
      properties:
        id: { type: string }
        # ... other non-sensitive user fields ...
    ListUsersResponse: // For GET /users
      type: object
      properties:
        users: { type: array, items: { $ref: '#/components/schemas/UserResponse' } }
        total: { type: integer }
        page: { type: integer }
        pageSize: { type: integer }
        totalPages: { type: integer }
    ApiResponseUser:
      type: object
      properties:
        success: { type: boolean }
        data: { $ref: '#/components/schemas/UserResponse' }
        message: { type: string, nullable: true }
    ApiResponseListUsers:
      type: object
      properties:
        success: { type: boolean }
        data: { $ref: '#/components/schemas/ListUsersResponse' }
        message: { type: string, nullable: true }
    ApiResponseError:
      type: object
      properties:
        success: { type: boolean, example: false }
        error: { $ref: '#/components/schemas/ApiError' }
    ApiError:
      type: object
      properties:
        code: { type: string }
        message: { type: string }
        details: { type: object, additionalProperties: true, nullable: true }
  parameters:
    UserListQueryPage:
      name: page
      in: query
      schema: { type: integer, default: 1 }
    UserListQueryPageSize:
      name: pageSize
      in: query
      schema: { type: integer, default: 10 }
    UserListQueryUsername:
      name: username
      in: query
      schema: { type: string }
    # ... other query params
*/
