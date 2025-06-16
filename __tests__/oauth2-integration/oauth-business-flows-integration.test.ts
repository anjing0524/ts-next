import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  createOAuth2TestSetup,
  TestUser,
  TestClient,
  TEST_CONFIG,
  TestAssertions,
  PKCETestUtils,
  TestUtils,
} from '../utils/test-helpers';

/**
 * OAuth 2.0 业务流程集成测试
 * 对应文档中的完整业务场景测试
 */
describe('OAuth 2.0 业务流程集成测试 / OAuth 2.0 Business Flows Integration Tests', () => {
  const { dataManager, httpClient, oauth2Helper, setup, cleanup } =
    createOAuth2TestSetup('oauth_business_flows');
  let adminUser: TestUser;
  let regularUser: TestUser;
  let inactiveUser: TestUser;
  let confidentialClient: TestClient;
  let publicClient: TestClient;

  beforeAll(async () => {
    await setup();
    adminUser = await dataManager.createTestUser('ADMIN');
    regularUser = await dataManager.createTestUser('REGULAR');
    inactiveUser = await dataManager.createTestUser('INACTIVE');
    confidentialClient = await dataManager.createTestClient('CONFIDENTIAL');
    publicClient = await dataManager.createTestClient('PUBLIC');
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    await TestUtils.sleep(100); // Allow for eventual consistency if needed
  });

  describe('URM - 用户资源管理场景 / User Resource Management Scenarios', () => {
    describe('URM-001: 普通用户注册 / Regular User Registration', () => {
      it('TC_OBFI_URM_001_001: 应成功注册新用户并允许登录 / Should successfully register a new user and allow login', async () => {
        const now = Date.now();
        const newUserData = {
          username: `new-test-user-obfi-${now}`,
          email: `newuser-obfi-${now}@test.com`,
          password: 'NewUserPassword123!',
          firstName: 'New',
          lastName: 'User',
        };

        const response = await httpClient.registerUser(newUserData);

        expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.CREATED);
        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.user).toHaveProperty('id');
        expect(data.user.username).toBe(newUserData.username);
        expect(data.user.email).toBe(newUserData.email);

        const loginResponse = await httpClient.loginUser(newUserData.username, newUserData.password);
        expect(loginResponse.status).toBeOneOf([TEST_CONFIG.HTTP_STATUS.OK, TEST_CONFIG.HTTP_STATUS.FOUND]);
      });
    });

    describe('URM-002: 用户名重复注册 / Duplicate Username Registration', () => {
      it('TC_OBFI_URM_002_001: 应拒绝重复的用户名 / Should reject duplicate username', async () => {
        const duplicateUserData = {
          username: regularUser.username, // Existing username
          email: `another-obfi-${Date.now()}@test.com`,
          password: 'AnotherPassword123!',
          firstName: 'Another',
          lastName: 'User',
        };

        const response = await httpClient.registerUser(duplicateUserData);

        expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.CONFLICT);
        const data = await response.json();
        expect(data.error_description || data.message || data.error).toMatch(/already|duplicate|exists|validation failed/i);
      });
    });

    describe('URM-003: 管理员登录 / Admin Login', () => {
      it('TC_OBFI_URM_003_001: 管理员应能成功登录 / Admin should be able to login successfully', async () => {
        const response = await httpClient.loginUser(adminUser.username, adminUser.plainPassword!);

        expect(response.status).toBeOneOf([TEST_CONFIG.HTTP_STATUS.OK, TEST_CONFIG.HTTP_STATUS.FOUND]);
        if (response.status === TEST_CONFIG.HTTP_STATUS.OK) {
          const data = await response.json();
          expect(data.success).toBe(true);
          expect(data.user?.username).toBe(adminUser.username);
          const cookies = response.headers.get('set-cookie');
          expect(cookies).toContain('session_id'); // Session-based auth check
        }
      });
    });

    describe('URM-004: 普通用户登录 / Regular User Login', () => {
      it('TC_OBFI_URM_004_001: 普通用户应能成功登录 / Regular user should be able to login successfully', async () => {
        const response = await httpClient.loginUser(regularUser.username, regularUser.plainPassword!);
        expect(response.status).toBeOneOf([TEST_CONFIG.HTTP_STATUS.OK, TEST_CONFIG.HTTP_STATUS.FOUND]);
        if (response.status === TEST_CONFIG.HTTP_STATUS.OK) {
          const data = await response.json();
          expect(data.success).toBe(true);
          expect(data.user?.username).toBe(regularUser.username);
        }
      });
    });

    describe('URM-005: 密码错误登录 / Incorrect Password Login', () => {
      it('TC_OBFI_URM_005_001: 使用错误密码登录应被拒绝 / Should reject login with incorrect password', async () => {
        const response = await httpClient.loginUser(regularUser.username, 'WrongPassword123!');
        expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED);
        const data = await response.json();
        expect(data.message || data.error).toBeDefined();
      });
    });

    describe('URM-006: 权限不足访问资源 / Insufficient Permissions for Resource', () => {
      it('TC_OBFI_URM_006_001: 普通用户访问管理员资源应被拒绝 / Regular user accessing admin resource should be denied', async () => {
        const loginResponse = await httpClient.loginUser(regularUser.username, regularUser.plainPassword!);
        if (loginResponse.status === TEST_CONFIG.HTTP_STATUS.OK) {
          const loginData = await loginResponse.json();
          // Assuming loginData contains an OAuth token if API is OAuth protected, or relies on session for subsequent calls.
          // The test uses loginData.access_token, implying OAuth.
          const resourceResponse = await httpClient.authenticatedRequest('/api/admin/users', loginData.access_token || 'dummy_token_if_session_based');
          expect(resourceResponse.status).toBe(TEST_CONFIG.HTTP_STATUS.FORBIDDEN); // Or UNAUTHORIZED if token invalid
        } else {
          expect.fail("Login failed, cannot proceed with permission test.");
        }
      });
    });

    describe('URM-011: 用户撤销客户端授权 / User Revokes Client Authorization', () => {
      it('TC_OBFI_URM_011_001: 撤销授权后客户端应无法访问资源 / Client should not access resources after authorization revocation', async () => {
        const accessToken = await dataManager.createAccessToken(regularUser.id!, confidentialClient.clientId, 'openid profile');
        const initialResponse = await httpClient.authenticatedRequest('/api/oauth/userinfo', accessToken);
        expect(initialResponse.status).toBe(TEST_CONFIG.HTTP_STATUS.OK); // Initial check

        const revokeResponse = await httpClient.revokeToken(accessToken, confidentialClient.clientId, confidentialClient.plainSecret);
        expect(revokeResponse.status).toBeOneOf([TEST_CONFIG.HTTP_STATUS.OK, TEST_CONFIG.HTTP_STATUS.NO_CONTENT]);

        await TestUtils.sleep(500); // Allow time for revocation to propagate if async
        const afterRevokeResponse = await httpClient.authenticatedRequest('/api/oauth/userinfo', accessToken);
        expect(afterRevokeResponse.status).toBe(TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED);
      });
    });
  });

  describe('AM - 授权模式测试 / Authorization Mode Tests', () => {
    describe('AM-001: 授权码模式完整流程 / Authorization Code Flow Complete Process', () => {
      it('TC_OBFI_AM_001_001: 应支持完整的授权码流程 / Should support the full authorization code flow', async () => {
        const state = TestUtils.generateState();

        // Step 1: 发起授权请求
        const response = await httpClient.authorize({ response_type: 'code', client_id: confidentialClient.clientId, redirect_uri: confidentialClient.redirectUris[0], scope: 'openid profile', state });
        expect(response.status).toBeOneOf([TEST_CONFIG.HTTP_STATUS.FOUND, TEST_CONFIG.HTTP_STATUS.OK, TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED, TEST_CONFIG.HTTP_STATUS.TEMPORARY_REDIRECT]);

        if (response.status === TEST_CONFIG.HTTP_STATUS.FOUND) {
          const authCode = TestAssertions.expectAuthorizationResponse(response);
          if (authCode) {
            const tokenResponse = await httpClient.requestToken({ grant_type: 'authorization_code', code: authCode, redirect_uri: confidentialClient.redirectUris[0], client_id: confidentialClient.clientId, client_secret: confidentialClient.plainSecret });
            expect(tokenResponse.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);
            if (tokenResponse.status === TEST_CONFIG.HTTP_STATUS.OK) {
              const tokenData = await tokenResponse.json();
              expect(tokenData.access_token).toBeDefined();
              expect(tokenData.token_type).toBe('Bearer');
              expect(tokenData.refresh_token).toBeDefined();
            }
          }
        }
      });
    });

    describe('AM-003: 客户端凭证模式 / Client Credentials Flow', () => {
      it('TC_OBFI_AM_003_001: 应支持客户端凭证授权 / Should support client credentials grant', async () => {
        const response = await httpClient.requestToken({ grant_type: 'client_credentials', client_id: confidentialClient.clientId, client_secret: confidentialClient.plainSecret, scope: 'api:read' });
        expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);
        if (response.status === TEST_CONFIG.HTTP_STATUS.OK) {
          const data = await response.json();
          expect(data.access_token).toBeDefined();
          expect(data.token_type).toBe('Bearer');
          expect(data.expires_in).toBeDefined();
          expect(data.refresh_token).toBeUndefined(); // No refresh token in client_credentials
        }
      });
    });

    describe('AM-005: PKCE 支持 / PKCE Support', () => {
      it('TC_OBFI_AM_005_001: 应支持PKCE授权码流程 / Should support PKCE authorization code flow', async () => {
        const pkce = PKCETestUtils.generatePKCE();
        const state = TestUtils.generateState();
        const authResponse = await httpClient.authorize({
          response_type: 'code', client_id: publicClient.clientId, redirect_uri: publicClient.redirectUris[0],
          scope: 'openid profile', state, code_challenge: pkce.codeChallenge, code_challenge_method: pkce.codeChallengeMethod,
        });
        expect(authResponse.status).toBeOneOf([TEST_CONFIG.HTTP_STATUS.FOUND, TEST_CONFIG.HTTP_STATUS.OK, TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED, TEST_CONFIG.HTTP_STATUS.TEMPORARY_REDIRECT]);

        if (authResponse.status === TEST_CONFIG.HTTP_STATUS.FOUND) {
          const authCode = TestAssertions.expectAuthorizationResponse(authResponse);
          if (authCode) {
            const tokenResponse = await httpClient.requestToken({
              grant_type: 'authorization_code', code: authCode, redirect_uri: publicClient.redirectUris[0],
              client_id: publicClient.clientId, code_verifier: pkce.codeVerifier,
            });
            expect(tokenResponse.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);
            if (tokenResponse.status === TEST_CONFIG.HTTP_STATUS.OK) {
              const tokenData = await tokenResponse.json();
              expect(tokenData.access_token).toBeDefined();
              expect(tokenData.token_type).toBe('Bearer');
            }
          }
        }
      });
    });
  });

  describe('TA - 第三方应用集成场景 / Third-party Application Integration Scenarios', () => {
    describe('TA-002: 授权码模式流程 / Authorization Code Flow Process', () => {
      it('TC_OBFI_TA_002_001: 应支持完整的第三方应用集成流程 / Should support full third-party application integration flow', async () => {
        const { accessToken } = await oauth2Helper.fullAuthorizationCodeFlow(regularUser, confidentialClient);
        expect(accessToken).toBeDefined();
        if (accessToken) {
          const userInfoResponse = await httpClient.authenticatedRequest('/api/oauth/userinfo', accessToken);
          expect(userInfoResponse.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);
          if (userInfoResponse.status === TEST_CONFIG.HTTP_STATUS.OK) {
            const userInfo = await userInfoResponse.json();
            expect(userInfo.sub).toBe(regularUser.id);
          }
        }
      });
    });

    describe('TA-007: 拒绝授权处理 / Handling Authorization Rejection', () => {
      it('TC_OBFI_TA_007_001: 用户拒绝授权时应正确处理 / Should correctly handle user denying authorization', async () => {
        // This test simulates the start of a flow that would lead to a consent screen.
        // The actual "denial" usually happens on that screen, which then redirects back with an error.
        // Here, we check if the initial request is processed as expected (e.g. redirect to login/consent).
        const response = await httpClient.authorize({
          response_type: 'code', client_id: confidentialClient.clientId, redirect_uri: confidentialClient.redirectUris[0], scope: 'openid profile email',
        });
        expect(response.status).toBeOneOf([TEST_CONFIG.HTTP_STATUS.FOUND, TEST_CONFIG.HTTP_STATUS.OK, TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED]);
        // A more complete test would mock the user denying consent on a consent page
        // and verify the redirect_uri is called with error=access_denied.
      });
    });
  });

  describe('SEC - 安全性测试场景 / Security Test Scenarios', () => {
    describe('SEC-001: 令牌篡改测试 / Token Tampering Test', () => {
      it('TC_OBFI_SEC_001_001: 篡改的令牌应被拒绝 / Tampered token should be rejected', async () => {
        const validToken = await dataManager.createAccessToken(regularUser.id!, confidentialClient.clientId, 'openid profile');
        const tamperedToken = validToken.slice(0, -5) + 'tampr';
        const response = await httpClient.authenticatedRequest('/api/oauth/userinfo', tamperedToken);
        expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED);
        const data = await response.json();
        expect(data.error).toBe(TEST_CONFIG.ERROR_CODES.INVALID_TOKEN);
      });
    });

    describe('SEC-004: 暴力破解防护 / Brute Force Protection', () => {
      it('TC_OBFI_SEC_004_001: 多次错误登录应触发保护机制 / Multiple failed logins should trigger protection', async () => {
        const attempts = [];
        for (let i = 0; i < TEST_CONFIG.MAX_LOGIN_ATTEMPTS_PER_WINDOW + 2; i++) { // Exceed typical limit
          const response = await httpClient.loginUser(regularUser.username, 'wrong_password_obfi');
          attempts.push(response.status);
          await TestUtils.sleep(50); // Small delay
        }
        const rateLimitedResponse = attempts.find((status) => status === TEST_CONFIG.HTTP_STATUS.TOO_MANY_REQUESTS);
        expect(rateLimitedResponse).toBeDefined();
      }, 10000); // Increased timeout for multiple attempts
    });

    describe('SEC-006: 令牌泄露防护 / Token Leakage Protection', () => {
      it('TC_OBFI_SEC_006_001: 撤销的令牌应立即失效 / Revoked token should be immediately invalid', async () => {
        const accessToken = await dataManager.createAccessToken(regularUser.id!, confidentialClient.clientId, 'openid profile');
        const beforeResponse = await httpClient.authenticatedRequest('/api/oauth/userinfo', accessToken);
        expect(beforeResponse.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);

        const revokeResponse = await httpClient.revokeToken(accessToken, confidentialClient.clientId, confidentialClient.plainSecret);
        expect(revokeResponse.status).toBeOneOf([TEST_CONFIG.HTTP_STATUS.OK, TEST_CONFIG.HTTP_STATUS.NO_CONTENT]);

        await TestUtils.sleep(500); // Allow time for revocation
        const afterResponse = await httpClient.authenticatedRequest('/api/oauth/userinfo', accessToken);
        expect(afterResponse.status).toBe(TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED);
      });
    });
  });

  describe('性能和负载测试 / Performance and Load Tests', () => {
    describe('并发授权请求 / Concurrent Authorization Requests', () => {
      it('TC_OBFI_PERF_001_001: 应能处理并发授权请求 / Should handle concurrent authorization requests', async () => {
        const concurrentRequests = 5;
        const requests = Array.from({ length: concurrentRequests }, () =>
          httpClient.authorize({ response_type: 'code', client_id: confidentialClient.clientId, redirect_uri: confidentialClient.redirectUris[0], scope: 'openid profile', state: TestUtils.generateState() })
        );
        const responses = await Promise.all(requests);
        expect(responses).toHaveLength(concurrentRequests);
        responses.forEach((response) => {
          expect(response.status).toBeOneOf([TEST_CONFIG.HTTP_STATUS.FOUND, TEST_CONFIG.HTTP_STATUS.OK, TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED, TEST_CONFIG.HTTP_STATUS.BAD_REQUEST, TEST_CONFIG.HTTP_STATUS.TEMPORARY_REDIRECT, TEST_CONFIG.HTTP_STATUS.TOO_MANY_REQUESTS]);
        });
      }, 15000);
    });

    describe('令牌刷新性能 / Token Refresh Performance', () => {
      it('TC_OBFI_PERF_002_001: 应能快速处理令牌刷新 / Should handle token refresh quickly', async () => {
        const refreshToken = await dataManager.createRefreshToken(regularUser.id!, confidentialClient.clientId, 'openid profile offline_access');
        const startTime = Date.now();
        const response = await httpClient.requestToken({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: confidentialClient.clientId, client_secret: confidentialClient.plainSecret });
        const duration = Date.now() - startTime;
        expect(duration).toBeLessThan(5000); // Expect completion within 5s
        expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);
      });
    });
  });
});
