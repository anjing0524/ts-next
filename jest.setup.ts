import '@testing-library/jest-dom';
import 'jest-extended';

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

// Mock environment variables for testing
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
process.env.DATABASE_URL = 'file:./test.db';

// Global test utilities
global.testUtils = {
  // Helper to create test user
  createTestUser: async (overrides = {}) => {
    const bcrypt = require('bcrypt');
    const { prisma } = require('@/lib/prisma');

    const defaultUser = {
      username: `testuser_${Date.now()}`,
      passwordHash: await bcrypt.hash('testpassword123', 10),
      displayName: 'Test User',
      isActive: true,
      ...overrides,
    };

    return await prisma.user.create({ data: defaultUser });
  },

  // Helper to create test OAuth client
  createTestClient: async (overrides = {}) => {
    const { prisma } = require('@/lib/prisma');
    const bcrypt = require('bcrypt');

    const defaultClient = {
      clientId: `test_client_${Date.now()}`,
      clientSecret: await bcrypt.hash('test_secret', 10),
      name: 'Test Client',
      clientType: 'CONFIDENTIAL',
      redirectUris: JSON.stringify(['http://localhost:3000/callback']),
      grantTypes: JSON.stringify(['authorization_code', 'client_credentials']),
      responseTypes: JSON.stringify(['code']),
      allowedScopes: JSON.stringify(['read', 'write']),
      isActive: true,
      ...overrides,
    };

    return await prisma.oAuthClient.create({ data: defaultClient });
  },

  // Helper to create test JWT token
  createTestJWT: (payload = {}) => {
    const jwt = require('jsonwebtoken');
    const defaultPayload = {
      sub: 'test-user-id',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      ...payload,
    };

    return jwt.sign(defaultPayload, process.env.JWT_SECRET);
  },

  // Helper to clean up test data
  cleanupTestData: async () => {
    const { prisma } = require('@/lib/prisma');

    // Clean up in reverse dependency order
    await prisma.auditLog.deleteMany({});
    await prisma.accessToken.deleteMany({});
    await prisma.refreshToken.deleteMany({});
    await prisma.authorizationCode.deleteMany({});
    await prisma.consentGrant.deleteMany({});
    await prisma.userRole.deleteMany({});
    await prisma.rolePermission.deleteMany({});
    await prisma.oAuthClient.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.role.deleteMany({});
    await prisma.permission.deleteMany({});
    await prisma.scope.deleteMany({});
  },
};

// Extend Jest matchers
declare global {
  var testUtils: {
    createTestUser: (overrides?: any) => Promise<any>;
    createTestClient: (overrides?: any) => Promise<any>;
    createTestJWT: (payload?: any) => string;
    cleanupTestData: () => Promise<void>;
  };
}
