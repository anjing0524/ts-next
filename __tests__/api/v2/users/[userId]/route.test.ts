// __tests__/api/v2/users/[userId]/route.test.ts

import { GET, PUT, PATCH, DELETE } from '@/app/api/v2/users/[userId]/route';
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
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findFirst: jest.fn(), // For email conflict checks
    },
  },
}));

// Mock bcrypt
jest.mock('bcrypt', () => ({
  hash: jest.fn(),
}));

// Mock the requirePermission HOF
const mockPerformingAdmin = { id: 'admin-test-id', clientId: 'admin-client', permissions: ['users:read', 'users:update', 'users:delete'] };
jest.mock('@/lib/auth/middleware', () => ({
  requirePermission: jest.fn((permission) => (handler) => async (req: AuthenticatedRequest, params?: any) => {
    req.user = mockPerformingAdmin;
    return handler(req, params);
  }),
}));

// Helper to create a mock NextRequest / AuthenticatedRequest
function createMockUserIdRequest(
  userId: string,
  method: string = 'GET',
  body: any = null,
  searchParamsString: string = ''
): AuthenticatedRequest {
  const url = `http://localhost/api/v2/users/${userId}${searchParamsString ? '?' + searchParamsString : ''}`;
  const request = new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : null,
  });
  (request as any).user = mockPerformingAdmin;
  return request as AuthenticatedRequest;
}

const mockUser = {
  id: 'user-to-manage-id',
  username: 'manageduser',
  email: 'managed@example.com',
  passwordHash: 'secretHash',
  firstName: 'Managed',
  lastName: 'User',
  displayName: 'Managed D. User',
  isActive: true,
  mustChangePassword: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  // Add other fields to match UserResponse/Prisma User model as needed by tests
  avatar: null, phone: null, organization: null, department: null, workLocation: null,
  emailVerified: null, lastLoginAt: null, createdBy: null, updatedBy: null,
};

// Helper to exclude password hash for response comparison
const MOCK_USER_RESPONSE = (({ passwordHash, ...rest }) => rest)(mockUser);


describe('API /api/v2/users/{userId}', () => {
  const targetUserId = 'user-to-manage-id';
  const routeContext = { params: { userId: targetUserId } };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --- GET Tests ---
  describe('GET /api/v2/users/{userId}', () => {
    it('should return user details if user found (200)', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      const req = createMockUserIdRequest(targetUserId, 'GET');
      const response = await GET(req, routeContext);
      const body: ApiResponse<any> = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toEqual(MOCK_USER_RESPONSE); // Prisma select excludes passwordHash
      expect(body.message).toBe("User details fetched successfully.");
    });

    it('should return 404 if user not found', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      const req = createMockUserIdRequest(targetUserId, 'GET');
      const response = await GET(req, routeContext);
      const body: ApiResponse<never> = await response.json();

      expect(response.status).toBe(404);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('USER_NOT_FOUND');
    });
  });

  // --- PUT Tests ---
  describe('PUT /api/v2/users/{userId}', () => {
    const updatePayload = {
      firstName: 'UpdatedFirst',
      lastName: 'UpdatedLast',
      email: 'updated@example.com',
      isActive: false,
    };

    it('should update user successfully (200)', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser); // For existing user check
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(null); // No email conflict
      const updatedUserMock = { ...mockUser, ...updatePayload, email: updatePayload.email.toLowerCase(), updatedAt: new Date() };
      (prisma.user.update as jest.Mock).mockResolvedValue(updatedUserMock);

      const req = createMockUserIdRequest(targetUserId, 'PUT', updatePayload);
      const response = await PUT(req, routeContext);
      const body: ApiResponse<any> = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data?.firstName).toBe('UpdatedFirst');
      expect(body.data?.email).toBe('updated@example.com');
      expect(body.message).toBe("User updated successfully.");
    });

    it('should return 404 if user to update not found', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      const req = createMockUserIdRequest(targetUserId, 'PUT', updatePayload);
      const response = await PUT(req, routeContext);
      const body: ApiResponse<never> = await response.json();

      expect(response.status).toBe(404);
      expect(body.error?.code).toBe('USER_NOT_FOUND_ON_PUT');
    });

    it('should return 400 for invalid JSON body', async () => {
        const req = new NextRequest(`http://localhost/api/v2/users/${targetUserId}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"bad json'
        });
        (req as any).user = mockPerformingAdmin;
        const response = await PUT(req as AuthenticatedRequest, routeContext);
        const body: ApiResponse<never> = await response.json();
        expect(response.status).toBe(400);
        expect(body.error?.code).toBe('INVALID_JSON_BODY_PUT');
    });

    it('should return 400 for Zod validation failure on update payload', async () => {
        const invalidPayload = { ...updatePayload, email: 'not-an-email' };
        const req = createMockUserIdRequest(targetUserId, 'PUT', invalidPayload);
        const response = await PUT(req, routeContext);
        const body: ApiResponse<never> = await response.json();
        expect(response.status).toBe(400);
        expect(body.error?.code).toBe('USER_UPDATE_VALIDATION_ERROR');
    });

    it('should return 409 if updated email conflicts with another user', async () => {
        (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
        (prisma.user.findFirst as jest.Mock).mockResolvedValue({ id: 'other-user-id', email: updatePayload.email.toLowerCase() }); // Conflict
        const req = createMockUserIdRequest(targetUserId, 'PUT', updatePayload);
        const response = await PUT(req, routeContext);
        const body: ApiResponse<never> = await response.json();
        expect(response.status).toBe(409);
        expect(body.error?.code).toBe('EMAIL_CONFLICT_ON_PUT');
    });
  });

  // --- PATCH Tests ---
  describe('PATCH /api/v2/users/{userId}', () => {
    const patchPayload = { displayName: 'Patched User' };

    it('should patch user successfully (200)', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      const patchedUserMock = { ...mockUser, ...patchPayload, updatedAt: new Date() };
      (prisma.user.update as jest.Mock).mockResolvedValue(patchedUserMock);
      (bcrypt.hash as jest.Mock).mockResolvedValue('newHashedPasswordFromPatch');


      const req = createMockUserIdRequest(targetUserId, 'PATCH', patchPayload);
      const response = await PATCH(req, routeContext);
      const body: ApiResponse<any> = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data?.displayName).toBe('Patched User');
      expect(body.message).toBe("User partially updated successfully.");
    });
     it('should patch user password successfully (200)', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      const passwordPatch = { password: 'NewPassword123!', mustChangePassword: false };
      const patchedUserMock = { ...mockUser, mustChangePassword: false, updatedAt: new Date() };
      (prisma.user.update as jest.Mock).mockResolvedValue(patchedUserMock);
      (bcrypt.hash as jest.Mock).mockResolvedValue('newHashedPasswordFromPatch');

      const req = createMockUserIdRequest(targetUserId, 'PATCH', passwordPatch);
      const response = await PATCH(req, routeContext);
      const body: ApiResponse<any> = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(bcrypt.hash).toHaveBeenCalledWith('NewPassword123!', 12);
      expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
          data: expect.objectContaining({ passwordHash: 'newHashedPasswordFromPatch', mustChangePassword: false })
      }));
    });


    it('should return 400 if PATCH body is empty', async () => {
        const req = createMockUserIdRequest(targetUserId, 'PATCH', {});
        const response = await PATCH(req, routeContext);
        const body: ApiResponse<never> = await response.json();
        expect(response.status).toBe(400);
        expect(body.error?.code).toBe('EMPTY_PATCH_BODY');
    });

    it('should return 400 if PATCH attempts to update username', async () => {
        const req = createMockUserIdRequest(targetUserId, 'PATCH', { username: 'newusername' });
        const response = await PATCH(req, routeContext);
        const body: ApiResponse<never> = await response.json();
        expect(response.status).toBe(400);
        expect(body.error?.code).toBe('USERNAME_MODIFICATION_NOT_ALLOWED');
    });
  });

  // --- DELETE Tests ---
  describe('DELETE /api/v2/users/{userId}', () => {
    it('should delete user successfully (200 with success message)', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser); // User exists
      (prisma.user.delete as jest.Mock).mockResolvedValue(mockUser); // Deletion successful

      const req = createMockUserIdRequest(targetUserId, 'DELETE');
      const response = await DELETE(req, routeContext);
      const body: ApiResponse<null> = await response.json();

      expect(response.status).toBe(200); // Changed from 204 to 200 to allow ApiResponse body
      expect(body.success).toBe(true);
      expect(body.message).toBe('User deleted successfully.');
      expect(body.data).toBeNull();
    });

    it('should return 403 if admin tries to self-delete', async () => {
      const selfDeleteContext = { params: { userId: mockPerformingAdmin.id } };
      const req = createMockUserIdRequest(mockPerformingAdmin.id, 'DELETE');
      const response = await DELETE(req, selfDeleteContext);
      const body: ApiResponse<never> = await response.json();

      expect(response.status).toBe(403);
      expect(body.error?.code).toBe('SELF_DELETION_NOT_ALLOWED');
    });

    it('should return 404 if user to delete not found', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      const req = createMockUserIdRequest(targetUserId, 'DELETE');
      const response = await DELETE(req, routeContext);
      const body: ApiResponse<never> = await response.json();

      expect(response.status).toBe(404);
      expect(body.error?.code).toBe('USER_NOT_FOUND_ON_DELETE');
    });

    it('should return 409 if Prisma delete fails due to foreign key constraint (P2003)', async () => {
        (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
        (prisma.user.delete as jest.Mock).mockRejectedValue(
            new Prisma.PrismaClientKnownRequestError('Foreign key constraint failed', { code: 'P2003', clientVersion: 'x.y.z', meta: { field_name: 'some_relation_field'} })
        );
        const req = createMockUserIdRequest(targetUserId, 'DELETE');
        const response = await DELETE(req, routeContext);
        const body: ApiResponse<never> = await response.json();

        expect(response.status).toBe(409);
        expect(body.error?.code).toBe('CONFLICT_FOREIGN_KEY_ON_DELETE');
    });
  });
});
