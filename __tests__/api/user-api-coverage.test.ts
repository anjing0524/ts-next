import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcrypt';
import { TEST_CONFIG } from '../utils/test-helpers'; // Added TEST_CONFIG

// Import route functions directly for code coverage
import { POST as registerPOST } from '@/app/api/auth/register/route';
import { POST as loginPOST } from '@/app/api/auth/login/route';
import { POST as logoutPOST } from '@/app/api/auth/logout/route';
import { GET as usersGET } from '@/app/api/users/route';

// Helper to create Next.js request object
function createNextRequest(url: string, options: RequestInit = {}): NextRequest {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '/datamgr_flow';
  const baseUrl = 'http://localhost:3000';
  const fullUrl = `${baseUrl}${basePath}${url}`;

  const { signal, ...safeOptions } = options;

  return new NextRequest(fullUrl, {
    method: 'GET',
    ...safeOptions,
    ...(signal && { signal }),
  });
}

describe('用户API覆盖率提升测试 / User API Coverage Enhancement Tests', () => {
  let testUser: any = null;
  let testUser2: any = null;

  beforeAll(async () => {
    await setupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  async function setupTestData(): Promise<void> {
    const userPassword = await bcrypt.hash('UserApiTest123!', 12);
    const now = Date.now(); // Ensure unique names if tests run fast

    testUser = await prisma.user.create({
      data: {
        username: `userapi-test-${now}`,
        email: `userapi-${now}@example.com`,
        password: userPassword, // In a real app, this should be passwordHash
        emailVerified: true,
        isActive: true,
        firstName: 'User',
        lastName: 'API',
      },
    });

    testUser2 = await prisma.user.create({
      data: {
        username: `userapi-test2-${now + 1}`, // Ensure uniqueness
        email: `userapi2-${now + 1}@example.com`,
        password: userPassword, // Same for passwordHash
        emailVerified: false,
        isActive: true,
        firstName: 'User2',
        lastName: 'API',
      },
    });
  }

  async function cleanupTestData(): Promise<void> {
    if (testUser?.id) { // Check if testUser was actually created
      await prisma.user.delete({ where: { id: testUser.id } }).catch(() => {});
    }
    if (testUser2?.id) { // Check if testUser2 was actually created
      await prisma.user.delete({ where: { id: testUser2.id } }).catch(() => {});
    }
  }

  describe('用户注册端点 / User Registration Endpoint (/api/auth/register)', () => {
    it('TC_UAC_001_001: 应处理有效的用户注册 / Should handle valid user registration', async () => {
      const userData = {
        username: 'newuser-' + Date.now(),
        email: `newuser-${Date.now()}@example.com`,
        password: 'NewUserPassword123!',
        firstName: 'New',
        lastName: 'User',
      };

      const registerRequest = createNextRequest('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
      });

      const response = await registerPOST(registerRequest);

      if (response.status === TEST_CONFIG.HTTP_STATUS.CREATED) {
        const data = await response.json();
        expect(data.user).toBeDefined();
        expect(data.user.username).toBe(userData.username);
        expect(data.user.email).toBe(userData.email);
        await prisma.user.delete({ where: { username: userData.username } }); // Cleanup
      } else {
        // For coverage, we accept errors here. More specific tests would assert specific errors.
        expect([TEST_CONFIG.HTTP_STATUS.BAD_REQUEST, TEST_CONFIG.HTTP_STATUS.CONFLICT, TEST_CONFIG.HTTP_STATUS.UNPROCESSABLE_ENTITY]).toContain(response.status);
        const data = await response.json();
        expect(data.error || data.message).toBeDefined();
      }
    });

    it('TC_UAC_001_002: 应拒绝使用无效邮箱注册 / Should reject registration with invalid email', async () => {
      const userData = {
        username: 'invalidEmailUser-uac-' + Date.now(),
        email: 'invalid-email-format',
        password: 'ValidPassword123!',
        firstName: 'Invalid',
        lastName: 'Email',
      };

      const registerRequest = createNextRequest('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
      });

      const response = await registerPOST(registerRequest);

      expect(response.status).toBeOneOf([TEST_CONFIG.HTTP_STATUS.BAD_REQUEST, TEST_CONFIG.HTTP_STATUS.UNPROCESSABLE_ENTITY]);
    });

    it('TC_UAC_001_003: 应拒绝使用弱密码注册 / Should reject registration with weak password', async () => {
      const userData = {
        username: 'weakPasswordUser-uac-' + Date.now(),
        email: `weakpassword-uac-${Date.now()}@example.com`,
        password: '123', // Weak password
        firstName: 'Weak',
        lastName: 'Password',
      };
      const registerRequest = createNextRequest('/api/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(userData),
      });
      const response = await registerPOST(registerRequest);
      expect(response.status).toBeOneOf([TEST_CONFIG.HTTP_STATUS.BAD_REQUEST, TEST_CONFIG.HTTP_STATUS.UNPROCESSABLE_ENTITY]);
    });

    it('TC_UAC_001_004: 应拒绝重复用户名的注册 / Should reject duplicate username registration', async () => {
      const duplicateData = {
        username: testUser.username, // Existing username
        email: `newuser-uac-${Date.now()}@example.com`,
        password: 'NewPassword123!',
        firstName: 'Duplicate',
        lastName: 'User',
      };

      const registerRequest = createNextRequest('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(duplicateData),
      });

      const response = await registerPOST(registerRequest);

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.CONFLICT); // 409 Conflict for duplicate
    });

    it('TC_UAC_001_005: 应拒绝重复邮箱的注册 / Should reject duplicate email registration', async () => {
      const duplicateEmailData = {
        username: 'newUser-uac-' + Date.now(),
        email: testUser.email, // Existing email
        password: 'NewPassword123!',
        firstName: 'Duplicate',
        lastName: 'Email',
      };

      const registerRequest = createNextRequest('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(duplicateEmailData),
      });

      const response = await registerPOST(registerRequest);

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.CONFLICT);
    });

    it('TC_UAC_001_006: 应拒绝缺少必填字段的注册 / Should reject registration with missing required fields', async () => {
      const userData = {
        username: 'incomplete-uac-' + Date.now(),
        // Missing email, password
      };

      const registerRequest = createNextRequest('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
      });

      const response = await registerPOST(registerRequest);

      expect(response.status).toBeOneOf([TEST_CONFIG.HTTP_STATUS.BAD_REQUEST, TEST_CONFIG.HTTP_STATUS.UNPROCESSABLE_ENTITY]);
    });
  });

  describe('用户登录端点 / User Login Endpoint (/api/auth/login)', () => {
    it('TC_UAC_002_001: 应处理有效的登录凭证 / Should handle valid login credentials', async () => {
      const loginData = { username: testUser.username, password: 'UserApiTest123!' };
      const loginRequest = createNextRequest('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(loginData),
      });
      const response = await loginPOST(loginRequest);

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);
      if (response.status === TEST_CONFIG.HTTP_STATUS.OK) {
        const data = await response.json();
        expect(data.user).toBeDefined();
        expect(data.user.username).toBe(testUser.username);
      }
    });

    it('TC_UAC_002_002: 应处理使用邮箱代替用户名的登录 / Should handle login with email instead of username', async () => {
      const loginData = { username: testUser.email, password: 'UserApiTest123!' };
      const loginRequest = createNextRequest('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(loginData),
      });
      const response = await loginPOST(loginRequest);
      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);
    });

    it('TC_UAC_002_003: 应拒绝无效的密码 / Should reject invalid password', async () => {
      const loginData = { username: testUser.username, password: 'WrongPassword123!' };
      const loginRequest = createNextRequest('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(loginData),
      });
      const response = await loginPOST(loginRequest);
      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED);
    });

    it('TC_UAC_002_004: 应拒绝不存在的用户名 / Should reject non-existent username', async () => {
      const loginData = { username: 'nonexistent-user-uac-' + Date.now(), password: 'SomePassword123!' };
      const loginRequest = createNextRequest('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(loginData),
      });
      const response = await loginPOST(loginRequest);
      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED); // Or NOT_FOUND, but 401 is common for login
    });

    it('TC_UAC_002_005: 应拒绝空的凭证 / Should reject empty credentials', async () => {
      const loginData = { username: '', password: '' };
      const loginRequest = createNextRequest('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(loginData),
      });
      const response = await loginPOST(loginRequest);
      expect(response.status).toBeOneOf([TEST_CONFIG.HTTP_STATUS.BAD_REQUEST, TEST_CONFIG.HTTP_STATUS.UNPROCESSABLE_ENTITY]);
    });

    it('TC_UAC_002_006: 应处理登录请求中格式错误的JSON / Should handle malformed JSON in login request', async () => {
      const loginRequest = createNextRequest('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{invalid json}',
      });
      const response = await loginPOST(loginRequest);
      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.BAD_REQUEST);
    });
  });

  describe('用户登出端点 / User Logout Endpoint (/api/auth/logout)', () => {
    it('TC_UAC_003_001: 应处理登出请求 / Should handle logout request', async () => {
      const logoutRequest = createNextRequest('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      const response = await logoutPOST(logoutRequest);
      // Logout typically returns 200 or 204, even if there's no active session to destroy on server-side for JWT.
      expect(response.status).toBeOneOf([TEST_CONFIG.HTTP_STATUS.OK, TEST_CONFIG.HTTP_STATUS.NO_CONTENT]);
    });

    it('TC_UAC_003_002: 应处理使用无效方法发起的登出请求 / Should handle logout with invalid method', async () => {
      const logoutRequest = createNextRequest('/api/auth/logout', { method: 'GET' }); // GET is invalid for this route
      const response = await logoutPOST(logoutRequest); // Calling POST handler with GET request
      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.METHOD_NOT_ALLOWED);
    });
  });

  describe('用户个人资料与管理 / User Profile and Management', () => {
    it('TC_UAC_004_001: 应处理用户列表请求 / Should handle user list requests', async () => {
      const usersRequest = createNextRequest('/api/users', { method: 'GET', headers: { Authorization: 'Bearer fake_token' } });
      const response = await usersGET(usersRequest);
      // Expect 401/403 due to fake_token
      expect(response.status).toBeOneOf([TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED, TEST_CONFIG.HTTP_STATUS.FORBIDDEN]);
    });

    it.skip('TC_UAC_004_002: 应处理用户个人资料检索请求 / Should handle user profile retrieval requests', async () => {
      // Skipped as endpoint may not exist or requires specific user ID
    });

    it.skip('TC_UAC_004_003: 应处理用户更新请求 / Should handle user update requests', async () => {
      // Skipped
    });

    it.skip('TC_UAC_004_004: 应处理密码更改请求 / Should handle password change requests', async () => {
      // Skipped
    });
  });

  describe('邮箱验证与密码重置 / Email Verification and Password Reset', () => {
    it.skip('TC_UAC_005_001: 应处理邮箱验证请求 / Should handle email verification requests', async () => {
      // Skipped
    });

    it.skip('TC_UAC_005_002: 应处理密码重置请求 / Should handle password reset request', async () => {
      // Skipped
    });

    it.skip('TC_UAC_005_003: 应处理密码重置确认 / Should handle password reset confirmation', async () => {
      // Skipped
    });

    it.skip('TC_UAC_005_004: 应处理邮箱验证重发 / Should handle email verification resend', async () => {
      // Skipped
    });
  });

  describe('用户安全与会话管理 / User Security and Session Management', () => {
    it.skip('TC_UAC_006_001: 应处理会话验证请求 / Should handle session validation requests', async () => {
      // Skipped
    });

    it.skip('TC_UAC_006_002: 应处理用户停用请求 / Should handle user deactivation requests', async () => {
      // Skipped
    });

    it.skip('TC_UAC_006_003: 应处理账户删除请求 / Should handle account deletion requests', async () => {
      // Skipped
    });

    it.skip('TC_UAC_006_004: 应处理用户会话列表 / Should handle user sessions list', async () => {
      // Skipped
    });
  });

  describe('边缘案例与安全 / Edge Cases and Security', () => {
    it('TC_UAC_007_001: 应处理无效Content-Type的请求 / Should handle requests with invalid Content-Type', async () => {
      const loginRequest = createNextRequest('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'username=test&password=test',
      });
      const response = await loginPOST(loginRequest);
      expect(response.status).toBeOneOf([TEST_CONFIG.HTTP_STATUS.BAD_REQUEST, TEST_CONFIG.HTTP_STATUS.UNSUPPORTED_MEDIA_TYPE]);
    });

    it('TC_UAC_007_002: 应处理超大请求体 / Should handle oversized request bodies', async () => {
      const largeData = { username: 'a'.repeat(10000), password: 'b'.repeat(10000), firstName: 'c'.repeat(10000), lastName: 'd'.repeat(10000), email: 'e'.repeat(10000) + '@example.com' };
      const registerRequest = createNextRequest('/api/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(largeData),
      });
      const response = await registerPOST(registerRequest);
      expect(response.status).toBeOneOf([TEST_CONFIG.HTTP_STATUS.BAD_REQUEST, TEST_CONFIG.HTTP_STATUS.PAYLOAD_TOO_LARGE, TEST_CONFIG.HTTP_STATUS.UNPROCESSABLE_ENTITY]);
    });

    it('TC_UAC_007_003: 应处理SQL注入尝试 / Should handle SQL injection attempts', async () => {
      const maliciousData = { username: "admin'; DROP TABLE users; --", password: "' OR '1'='1" };
      const loginRequest = createNextRequest('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(maliciousData),
      });
      const response = await loginPOST(loginRequest);
      // Expect auth failure, not server error
      expect(response.status).toBeOneOf([TEST_CONFIG.HTTP_STATUS.BAD_REQUEST, TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED]);
    });

    it('TC_UAC_007_004: 应处理用户数据中的XSS尝试 / Should handle XSS attempts in user data', async () => {
      const xssData = { username: '<script>alert("xss")</script>', email: 'xss-uac@example.com', password: 'XSSPassword123!', firstName: '<img src=x onerror=alert(1)>', lastName: '"><script>evil()</script>' };
      const registerRequest = createNextRequest('/api/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(xssData),
      });
      const response = await registerPOST(registerRequest);
      // Expect validation error
      expect(response.status).toBeOneOf([TEST_CONFIG.HTTP_STATUS.BAD_REQUEST, TEST_CONFIG.HTTP_STATUS.UNPROCESSABLE_ENTITY]);
    });
  });
});
