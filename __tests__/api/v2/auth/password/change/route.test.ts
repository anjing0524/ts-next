// __tests__/api/v2/auth/password/change/route.test.ts

import { POST } from '@/app/api/v2/auth/password/change/route';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcrypt';
import { NextRequest } from 'next/server';
import { ApiResponse } from '@/lib/types/api';
import { AuthenticatedRequest, AuthenticatedUser } from '@/lib/auth/types';

// Mock Prisma
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    passwordHistory: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    // Mock $transaction to just execute the callback
    $transaction: jest.fn(async (callback) => callback(prisma)),
  },
}));

// Mock bcrypt
jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

// Mock requirePermission HOF
const mockAuthedUser: AuthenticatedUser = { id: 'user-authed-id-pwd-change', permissions: ['auth:password:change'], clientId: 'test-client' };
jest.mock('@/lib/auth/middleware', () => ({
  requirePermission: jest.fn((permission) => (handler) => async (req: AuthenticatedRequest, params?: any) => {
    req.user = mockAuthedUser; // Attach mock user
    return handler(req, params);
  }),
}));

// Helper to create mock request
function createMockChangePasswordRequest(body: any): AuthenticatedRequest {
  const request = new NextRequest('http://localhost/api/v2/auth/password/change', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  (request as any).user = mockAuthedUser;
  return request as AuthenticatedRequest;
}

describe('POST /api/v2/auth/password/change', () => {
  const currentPassword = 'OldPassword123!';
  const newPassword = 'NewPassword456!';
  const mockUserFromDb = {
    id: mockAuthedUser.id,
    passwordHash: 'hashedOldPassword',
    isActive: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mocks to default successful behavior for most tests
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUserFromDb);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true); // Current password matches
    (prisma.passwordHistory.findMany as jest.Mock).mockResolvedValue([]); // No recent password conflict
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashedNewPassword');
    (prisma.user.update as jest.Mock).mockResolvedValue({ ...mockUserFromDb, passwordHash: 'hashedNewPassword' });
    (prisma.passwordHistory.create as jest.Mock).mockResolvedValue({});
  });

  it('should change password successfully (200)', async () => {
    const req = createMockChangePasswordRequest({ currentPassword, newPassword });
    const response = await POST(req);
    const body: ApiResponse<null> = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Password changed successfully.');
    expect(body.data).toBeNull();
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { passwordHash: 'hashedNewPassword', mustChangePassword: false, updatedBy: mockAuthedUser.id }
    }));
    expect(prisma.passwordHistory.create).toHaveBeenCalledWith(expect.objectContaining({
      data: { userId: mockAuthedUser.id, passwordHash: 'hashedOldPassword' }
    }));
  });

  it('should return 400 for invalid JSON body', async () => {
    const req = new NextRequest('http://localhost/api/v2/auth/password/change', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"bad json'
    });
    (req as any).user = mockAuthedUser;
    const response = await POST(req as AuthenticatedRequest);
    const body: ApiResponse<never> = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe('INVALID_JSON_BODY_PWD_CHANGE');
  });

  it('should return 400 if currentPassword or newPassword is missing', async () => {
    const req = createMockChangePasswordRequest({ currentPassword }); // newPassword missing
    const response = await POST(req);
    const body: ApiResponse<never> = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe('MISSING_PASSWORDS_PWD_CHANGE');
  });

  it('should return 404 if authenticated user not found in DB (ResourceNotFoundError)', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    const req = createMockChangePasswordRequest({ currentPassword, newPassword });
    const response = await POST(req);
    const body: ApiResponse<never> = await response.json();

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe('AUTH_USER_NOT_FOUND_PWD_CHANGE');
  });

  it('should return 401 if user account is inactive (AuthenticationError)', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ ...mockUserFromDb, isActive: false });
    const req = createMockChangePasswordRequest({ currentPassword, newPassword });
    const response = await POST(req);
    const body: ApiResponse<never> = await response.json();

    expect(response.status).toBe(401); // AuthenticationError maps to 401
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe('ACCOUNT_INACTIVE_PWD_CHANGE');
  });

  it('should return 401 if current password does not match (AuthenticationError)', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(false); // Current password mismatch
    const req = createMockChangePasswordRequest({ currentPassword, newPassword });
    const response = await POST(req);
    const body: ApiResponse<never> = await response.json();

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe('INVALID_CURRENT_PASSWORD');
  });

  it('should return 400 if new password is too short (ValidationError)', async () => {
    const req = createMockChangePasswordRequest({ currentPassword, newPassword: 'short' });
    const response = await POST(req);
    const body: ApiResponse<never> = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe('PASSWORD_POLICY_LENGTH_PWD_CHANGE');
  });

  it('should return 400 if new password is same as current (ValidationError)', async () => {
    const req = createMockChangePasswordRequest({ currentPassword, newPassword: currentPassword });
    const response = await POST(req);
    const body: ApiResponse<never> = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe('PASSWORD_POLICY_SAME_AS_CURRENT_PWD_CHANGE');
  });

  it('should return 400 if new password is in recent history (ValidationError)', async () => {
    (prisma.passwordHistory.findMany as jest.Mock).mockResolvedValue([{ passwordHash: 'hashedNewPassword' }]);
    // Mock bcrypt.compare to return true for the history check
    (bcrypt.compare as jest.Mock).mockImplementation((pwd, hash) => Promise.resolve(pwd === newPassword && hash === 'hashedNewPassword'));

    const req = createMockChangePasswordRequest({ currentPassword, newPassword });
    const response = await POST(req);
    const body: ApiResponse<never> = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe('PASSWORD_RECENTLY_USED_PWD_CHANGE');
  });

  it('should return 500 if prisma transaction fails', async () => {
    (prisma.$transaction as jest.Mock).mockRejectedValue(new Error('Prisma transaction failed'));
    const req = createMockChangePasswordRequest({ currentPassword, newPassword });
    const response = await POST(req);
    const body: ApiResponse<never> = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe('INTERNAL_SERVER_ERROR');
  });
});
