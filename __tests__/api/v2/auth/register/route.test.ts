// __tests__/api/v2/auth/register/route.test.ts

import { POST } from '@/app/api/v2/auth/register/route';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcrypt';
import { NextRequest } from 'next/server';
import { ApiResponse } from '@/lib/types/api';
import { AuthenticatedRequest } from '@/lib/auth/types';
import { Prisma } from '@prisma/client'; // For Prisma error types

// Mock Prisma
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  },
}));

// Mock bcrypt
jest.mock('bcrypt', () => ({
  hash: jest.fn(),
}));

// Mock requirePermission HOF
const mockAdminUser = { id: 'admin-user-id', clientId: 'admin-client', permissions: ['auth:register'] };
jest.mock('@/lib/auth/middleware', () => ({
  requirePermission: jest.fn((permission) => (handler) => async (req: AuthenticatedRequest, params?: any) => {
    req.user = mockAdminUser;
    return handler(req, params);
  }),
}));

// Helper to create mock request
function createMockRegisterRequest(body: any): AuthenticatedRequest {
  const request = new NextRequest('http://localhost/api/v2/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  (request as any).user = mockAdminUser;
  return request as AuthenticatedRequest;
}

describe('POST /api/v2/auth/register', () => {
  const validRegisterPayload = {
    username: 'newtestuser',
    email: 'newtest@example.com',
    password: 'StrongPassword123!',
    firstName: 'New',
    lastName: 'User',
    displayName: 'New Test User',
    isActive: true,
    mustChangePassword: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should register a user successfully and return 201', async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValue(null); // No existing user
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashedSecurePassword');
    const createdUserMock = {
      id: 'new-user-guid',
      ...validRegisterPayload,
      // Fields not in UserRegistrationResponse are omitted by Prisma select
      // passwordHash: undefined,
      // failedLoginAttempts: undefined,
      // lockedUntil: undefined,
      createdBy: mockAdminUser.id,
      createdAt: new Date(),
      updatedAt: new Date(),
      emailVerified: null, // Assuming default from schema
      phone: null,
      avatar: null,
      organization: null,
      department: null,
      workLocation: null,
      updatedBy: null, // Assuming default
      lastLoginAt: null, // Assuming default
    };
    // Ensure the mock matches the 'select' statement in the route
    const { passwordHash, failedLoginAttempts, lockedUntil, ...expectedReturnUser } = createdUserMock;

    (prisma.user.create as jest.Mock).mockResolvedValue(expectedReturnUser);

    const req = createMockRegisterRequest(validRegisterPayload);
    const response = await POST(req);
    const body: ApiResponse<any> = await response.json();

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data?.id).toBe('new-user-guid');
    expect(body.data?.username).toBe(validRegisterPayload.username);
    expect(body.data?.email).toBe(validRegisterPayload.email.toLowerCase());
    expect(body.message).toBe('User registered successfully by admin.');
    expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        username: validRegisterPayload.username,
        email: validRegisterPayload.email.toLowerCase(),
        passwordHash: 'hashedSecurePassword',
        createdBy: mockAdminUser.id,
      }),
    }));
  });

  it('should return 400 for invalid JSON body', async () => {
    const req = new NextRequest('http://localhost/api/v2/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"bad json'
    });
    (req as any).user = mockAdminUser; // Attach user for HOF

    const response = await POST(req as AuthenticatedRequest);
    const body: ApiResponse<never> = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe('INVALID_JSON_BODY');
  });

  it('should return 400 for Zod validation failure (e.g., missing required field password)', async () => {
    const { password, ...invalidPayload } = validRegisterPayload; // Password removed
    const req = createMockRegisterRequest(invalidPayload);
    const response = await POST(req);
    const body: ApiResponse<never> = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe('REGISTRATION_VALIDATION_ERROR');
    expect(body.error?.details?.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: ['password'] })
    ]));
  });

  it('should return 409 if username already exists', async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValue({ username: validRegisterPayload.username });
    const req = createMockRegisterRequest(validRegisterPayload);
    const response = await POST(req);
    const body: ApiResponse<never> = await response.json();

    expect(response.status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe('CONFLICT_USER_EXISTS');
    expect(body.error?.message).toContain('username already exists');
  });

  it('should return 409 if email already exists', async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValue({ email: validRegisterPayload.email.toLowerCase() });
    const req = createMockRegisterRequest(validRegisterPayload);
    const response = await POST(req);
    const body: ApiResponse<never> = await response.json();

    expect(response.status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe('CONFLICT_USER_EXISTS');
    expect(body.error?.message).toContain('email already exists');
  });

  it('should return 500 if bcrypt.hash fails', async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);
    (bcrypt.hash as jest.Mock).mockRejectedValue(new Error('bcrypt system error'));
    const req = createMockRegisterRequest(validRegisterPayload);
    const response = await POST(req);
    const body: ApiResponse<never> = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe('INTERNAL_SERVER_ERROR'); // from withErrorHandling
  });

  it('should return 500 (or specific code if caught and rethrown) if prisma.user.create fails with non-P2002 error', async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashedPassword');
    (prisma.user.create as jest.Mock).mockRejectedValue(new Error('Some generic DB error'));

    const req = createMockRegisterRequest(validRegisterPayload);
    const response = await POST(req);
    const body: ApiResponse<never> = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe('INTERNAL_SERVER_ERROR'); // from withErrorHandling
  });

  it('should return 409 if prisma.user.create throws P2002 (unique constraint violation)', async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValue(null); // Assume initial check passed
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashedPassword');
    // Simulate Prisma unique constraint error (P2002)
    const prismaP2002Error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: 'test', meta: { target: ['username'] } }
    );
    (prisma.user.create as jest.Mock).mockRejectedValue(prismaP2002Error);

    const req = createMockRegisterRequest(validRegisterPayload);
    const response = await POST(req);
    const body: ApiResponse<never> = await response.json();

    expect(response.status).toBe(409); // As it's caught and re-thrown as BaseError(409) by the handler
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe('CONFLICT_USER_EXISTS'); // The code from the re-thrown BaseError
    expect(body.error?.message).toContain("username already exists");
  });
});
