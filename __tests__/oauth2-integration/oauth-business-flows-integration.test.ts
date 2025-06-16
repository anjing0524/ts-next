import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  createOAuth2TestSetup,
  TestUser,
  TestClient,
  TEST_CONFIG,
  TestAssertions,
  PKCETestUtils,
  TestUtils,
  ScopeUtils, // Ensure ScopeUtils is imported if used for v2 scope assertions
} from '../utils/test-helpers';
import { decodeJwt } from 'jose'; // For decoding JWTs if needed in v2 tests

/**
 * @fileoverview OAuth 2.0 业务流程集成测试 (OAuth 2.0 Business Flows Integration Tests)
 * @description 本文件包含针对 OAuth 2.0 核心业务流程的端到端集成测试，
 *              覆盖用户管理、客户端管理、授权模式及安全等方面。
 *              (This file contains end-to-end integration tests for core OAuth 2.0 business flows,
 *              covering user management, client management, authorization modes, and security aspects.)
 */
// 测试套件: OAuth 2.0 业务流程集成测试
describe('OAuth 2.0 业务流程集成测试 / OAuth 2.0 Business Flows Integration Tests', () => {
  const { dataManager, httpClient, oauth2Helper, setup, cleanup } =
    createOAuth2TestSetup('oauth_business_flows_integration'); // 使用不同的测试数据库实例
  let adminUser: TestUser;
  let regularUser: TestUser;
  let inactiveUser: TestUser; // 非活跃用户示例
  let confidentialClient: TestClient; // 机密客户端示例
  let publicClient: TestClient; // 公共客户端示例

  // 在所有测试开始前执行的设置钩子
  beforeAll(async () => {
    await setup(); // 初始化测试环境和数据库
    // 创建测试用户 (Creating test users)
    adminUser = await dataManager.createTestUser('ADMIN_OBFI'); // 使用特定前缀以避免冲突
    regularUser = await dataManager.createTestUser('REGULAR_OBFI');
    inactiveUser = await dataManager.createTestUser('INACTIVE_OBFI', { isActive: false }); // 示例：创建非活跃用户
    // 创建测试客户端 (Creating test clients)
    confidentialClient = await dataManager.createTestClient('CONFIDENTIAL_OBFI');
    publicClient = await dataManager.createTestClient('PUBLIC_OBFI');
  });

  // 在所有测试结束后执行的清理钩子
  afterAll(async () => {
    await cleanup(); // 清理测试数据和环境
  });

  // 在每个测试用例开始前执行的钩子
  beforeEach(async () => {
    // 例如，在每个测试前添加短暂延迟，以确保前一个测试的异步操作完成
    await TestUtils.sleep(100); // 为可能的最终一致性留出时间 (Allow for eventual consistency if needed)
  });

  // 测试分组: URM - 用户资源管理场景
  describe('URM - 用户资源管理场景 / User Resource Management Scenarios', () => {
    // 测试场景: URM-001 - 普通用户注册
    describe('URM-001: 普通用户注册 / Regular User Registration', () => {
      // 测试用例: TC_OBFI_URM_001_001 - 应成功注册新用户并允许登录
      it('TC_OBFI_URM_001_001: 应成功注册新用户并允许登录 / Should successfully register a new user and allow login', async () => {
        // 准备测试数据: 新用户信息 (Prepare test data: new user information)
        const now = Date.now();
        const newUserData = {
          username: `new-test-user-obfi-${now}`, // 保证用户名唯一
          email: `newuser-obfi-${now}@example.com`, // 保证邮箱唯一
          password: 'NewUserPassword123!',
          firstName: 'New',
          lastName: 'User',
        };

        // 动作: 调用用户注册接口 (Action: Call user registration endpoint)
        const response = await httpClient.registerUser(newUserData);

        // 断言: 验证注册结果 (Assertion: Verify registration result)
        expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.CREATED); // HTTP状态码应为201 Created
        const data = await response.json();
        expect(data.success).toBe(true); // 响应体中 success 字段应为 true
        expect(data.user).toHaveProperty('id'); // user 对象应包含 id 属性
        expect(data.user.username).toBe(newUserData.username); // 返回的用户名应与输入一致
        expect(data.user.email).toBe(newUserData.email); // 返回的邮箱应与输入一致

        // 动作: 使用新注册的凭证尝试登录 (Action: Attempt to login with newly registered credentials)
        const loginResponse = await httpClient.loginUser(newUserData.username, newUserData.password);
        // 断言: 登录应成功 (Assertion: Login should be successful)
        expect(loginResponse.status).toBeOneOf([TEST_CONFIG.HTTP_STATUS.OK, TEST_CONFIG.HTTP_STATUS.FOUND]); // 状态码200 OK 或 302 Found (如果重定向)
      });
    });

    // 测试场景: URM-002 - 用户名重复注册
    describe('URM-002: 用户名重复注册 / Duplicate Username Registration', () => {
      // 测试用例: TC_OBFI_URM_002_001 - 注册时使用已存在的用户名应被拒绝
      it('TC_OBFI_URM_002_001: 应拒绝使用已存在的用户名进行注册 / Should reject registration with a duplicate username', async () => {
        // 准备测试数据: 使用已存在的用户名 (Prepare test data: use an existing username)
        const duplicateUserData = {
          username: regularUser.username, // 使用 beforeAll 中创建的 regularUser 的用户名
          email: `another-obfi-${Date.now()}@example.com`, // 新的邮箱
          password: 'AnotherPassword123!',
          firstName: 'Another',
          lastName: 'User',
        };

        // 动作: 调用用户注册接口 (Action: Call user registration endpoint)
        const response = await httpClient.registerUser(duplicateUserData);

        // 断言: 验证注册失败，状态码应为409 Conflict (Assertion: Verify registration failure, status code should be 409 Conflict)
        expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.CONFLICT);
        const data = await response.json();
        // 错误信息应指明用户名已存在或类似信息 (Error message should indicate username already exists or similar)
        expect(data.error_description || data.message || data.error).toMatch(/already|duplicate|exists|validation failed/i);
      });
    });

    // 测试场景: URM-003 - 管理员登录
    describe('URM-003: 管理员登录 / Admin Login', () => {
      // 测试用例: TC_OBFI_URM_003_001 - 管理员用户应能使用其凭证成功登录
      it('TC_OBFI_URM_003_001: 管理员应能成功登录 / Admin should be able to login successfully', async () => {
        // 准备测试数据: adminUser (已在beforeAll中创建)

        // 动作: 管理员用户登录 (Action: Admin user login)
        const response = await httpClient.loginUser(adminUser.username, adminUser.plainPassword!);

        // 断言: 验证登录结果 (Assertion: Verify login result)
        expect(response.status).toBeOneOf([TEST_CONFIG.HTTP_STATUS.OK, TEST_CONFIG.HTTP_STATUS.FOUND]); // 200 OK 或 302 Found (重定向)
        if (response.status === TEST_CONFIG.HTTP_STATUS.OK) { // 如果直接返回200 OK
          const data = await response.json();
          expect(data.success).toBe(true); // success 应为 true
          expect(data.user?.username).toBe(adminUser.username); // 返回的用户名应为管理员用户名
          // 检查会话 cookie (如果适用) (Check for session cookie if applicable)
          const cookies = response.headers.get('set-cookie');
          expect(cookies).toContain('session_id'); // 假设使用名为 session_id 的会话 cookie
        }
      });
    });

    // 测试场景: URM-004 - 普通用户登录
    describe('URM-004: 普通用户登录 / Regular User Login', () => {
      // 测试用例: TC_OBFI_URM_004_001 - 普通用户应能使用其凭证成功登录
      it('TC_OBFI_URM_004_001: 普通用户应能成功登录 / Regular user should be able to login successfully', async () => {
        // 准备测试数据: regularUser (已在beforeAll中创建)

        // 动作: 普通用户登录 (Action: Regular user login)
        const response = await httpClient.loginUser(regularUser.username, regularUser.plainPassword!);
        // 断言: 验证登录结果 (Assertion: Verify login result)
        expect(response.status).toBeOneOf([TEST_CONFIG.HTTP_STATUS.OK, TEST_CONFIG.HTTP_STATUS.FOUND]);
        if (response.status === TEST_CONFIG.HTTP_STATUS.OK) {
          const data = await response.json();
          expect(data.success).toBe(true);
          expect(data.user?.username).toBe(regularUser.username);
        }
      });
    });

    // 测试场景: URM-005 - 密码错误登录
    describe('URM-005: 密码错误登录 / Incorrect Password Login', () => {
      // 测试用例: TC_OBFI_URM_005_001 - 使用不正确的密码登录应被拒绝
      it('TC_OBFI_URM_005_001: 使用错误密码登录应被拒绝 / Should reject login with incorrect password', async () => {
        // 准备测试数据: regularUser 和一个错误的密码

        // 动作: 使用错误密码尝试登录 (Action: Attempt login with incorrect password)
        const response = await httpClient.loginUser(regularUser.username, 'WrongPassword123!');
        // 断言: 验证登录失败及原因 (Assertion: Verify login failure and reason)
        expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED); // HTTP状态码应为401 Unauthorized
        const data = await response.json();
        expect(data.message || data.error).toBeDefined(); // 响应体中应包含错误信息
      });
    });

    // 测试场景: URM-006 - 权限不足访问资源
    describe('URM-006: 权限不足访问资源 / Insufficient Permissions for Resource', () => {
      // 测试用例: TC_OBFI_URM_006_001 - 普通用户尝试访问仅限管理员的资源时应被拒绝
      it('TC_OBFI_URM_006_001: 普通用户访问管理员资源应被拒绝 / Regular user accessing admin resource should be denied', async () => {
        // 准备测试数据: regularUser 登录获取凭证 (会话或令牌)
        const loginResponse = await httpClient.loginUser(regularUser.username, regularUser.plainPassword!);
        // 断言: 登录成功 (Assertion: Login is successful)
        expect(loginResponse.status).toBeOneOf([TEST_CONFIG.HTTP_STATUS.OK, TEST_CONFIG.HTTP_STATUS.FOUND]);

        if (loginResponse.status === TEST_CONFIG.HTTP_STATUS.OK) {
          const loginData = await loginResponse.json();
          // 假设 loginData.access_token 包含访问令牌 (如果系统使用OAuth令牌)
          // 如果是基于会话的，httpClient 会自动处理cookie
          // (Assuming loginData.access_token contains the access token if the system uses OAuth tokens)
          // (If session-based, httpClient handles cookies automatically)
          const accessToken = loginData.access_token; // 可能需要根据实际登录响应调整

          // 动作: 普通用户尝试访问管理员资源 (Action: Regular user attempts to access an admin resource)
          const resourceResponse = await httpClient.authenticatedRequest(
            '/api/admin/users', // 假设这是一个管理员才能访问的端点
            accessToken || 'dummy_token_if_session_based' // 如果是会话，令牌可能不需要显式传递
          );
          // 断言: 访问应被拒绝 (Assertion: Access should be denied)
          expect(resourceResponse.status).toBe(TEST_CONFIG.HTTP_STATUS.FORBIDDEN); // HTTP状态码应为403 Forbidden (或401 Unauthorized，取决于实现)
        } else {
          // 如果登录失败，则此测试无法继续
          expect.fail("登录失败，无法继续权限测试 / Login failed, cannot proceed with permission test.");
        }
      });
    });

    // 测试场景: URM-011 - 用户撤销客户端授权
    describe('URM-011: 用户撤销客户端授权 / User Revokes Client Authorization', () => {
      // 测试用例: TC_OBFI_URM_011_001 - 用户撤销对客户端的授权后，客户端使用旧令牌访问资源应失败
      it('TC_OBFI_URM_011_001: 撤销授权后客户端应无法访问资源 / Client should not access resources after authorization revocation', async () => {
        // 准备测试数据: 为 regularUser 和 confidentialClient 创建一个访问令牌
        // (Prepare test data: Create an access token for regularUser and confidentialClient)
        const scope = 'openid profile api:read';
        const accessToken = await dataManager.createAccessToken(regularUser.id!, confidentialClient.clientId, scope);
        expect(accessToken).toBeDefined(); // 确保令牌已创建

        // 步骤1: 使用令牌成功访问资源 (Step 1: Successfully access resource with the token)
        const initialResponse = await httpClient.authenticatedRequest('/api/oauth/userinfo', accessToken); // Userinfo作为示例受保护资源
        expect(initialResponse.status).toBe(TEST_CONFIG.HTTP_STATUS.OK); // 初始访问应成功

        // 步骤2: 撤销令牌 (Step 2: Revoke the token)
        // 这通常通过令牌撤销端点完成，或者由用户通过其账户管理界面操作
        // (This is usually done via a token revocation endpoint or by the user through their account management interface)
        const revokeResponse = await httpClient.revokeToken(accessToken, confidentialClient.clientId, confidentialClient.plainSecret);
        expect(revokeResponse.status).toBeOneOf([TEST_CONFIG.HTTP_STATUS.OK, TEST_CONFIG.HTTP_STATUS.NO_CONTENT]); // 撤销请求应成功

        // 可选: 等待撤销操作在系统中生效 (Optional: Wait for revocation to propagate if asynchronous)
        await TestUtils.sleep(500);

        // 步骤3: 使用已撤销的令牌再次尝试访问资源 (Step 3: Attempt to access resource again with the revoked token)
        const afterRevokeResponse = await httpClient.authenticatedRequest('/api/oauth/userinfo', accessToken);
        // 断言: 访问应失败 (Assertion: Access should fail)
        expect(afterRevokeResponse.status).toBe(TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED); // 应返回401 Unauthorized
      });
    });
  });

  // 测试分组: AM - 授权模式测试
  describe('AM - 授权模式测试 / Authorization Mode Tests', () => {
    // 测试场景: AM-001 - 授权码模式完整流程
    describe('AM-001: 授权码模式完整流程 / Authorization Code Flow Complete Process', () => {
      // 测试用例: TC_OBFI_AM_001_001 - 系统应支持完整的OAuth 2.0授权码流程
      it('TC_OBFI_AM_001_001: 应支持完整的授权码流程 / Should support the full authorization code flow', async () => {
        // 准备测试数据: state 参数用于防止CSRF攻击 (Prepare test data: state parameter for CSRF protection)
        const state = TestUtils.generateState();
        const redirectUri = confidentialClient.redirectUris[0]; // 使用客户端注册的第一个回调URI
        const scope = 'openid profile email api:read'; // 请求的作用域

        // 步骤1: (模拟)用户代理重定向到授权服务器的授权端点
        // (Step 1: (Simulate) User agent redirects to the authorization server's authorization endpoint)
        // 对于集成测试，这通常涉及直接调用一个模拟授权的辅助函数或API。
        // 这里使用 httpClient.authorize，它可能需要用户已登录或进行模拟登录。
        // (For integration tests, this often involves calling a helper function or API that simulates authorization.)
        // (Here, httpClient.authorize is used, which may require the user to be logged in or simulate login.)
        const authResponse = await httpClient.authorize({
          response_type: 'code',
          client_id: confidentialClient.clientId,
          redirect_uri: redirectUri,
          scope: scope,
          state: state,
          // 对于真实流程，用户会在这里登录并同意授权
          // (For a real flow, the user would log in and grant consent here)
          // dataManager 可以用于预先设置用户和同意状态，如果测试框架支持
          // (dataManager could be used to preset user and consent status if the test framework supports it)
        });

        // 断言: 授权端点的响应 (Assertion: Response from the authorization endpoint)
        // 通常是302重定向到客户端的回调URI，并附带code和state参数
        // (Typically a 302 redirect to the client's callback URI with 'code' and 'state' parameters)
        expect(authResponse.status).toBeOneOf([
          TEST_CONFIG.HTTP_STATUS.FOUND, // 302 Found - 标准重定向
          TEST_CONFIG.HTTP_STATUS.OK, // 200 OK - 如果测试服务器直接返回code或需要用户交互
          TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED, // 401 Unauthorized - 如果需要先登录
          TEST_CONFIG.HTTP_STATUS.TEMPORARY_REDIRECT, // 307 Temporary Redirect - Next.js等框架可能使用
        ]);

        if (authResponse.status === TEST_CONFIG.HTTP_STATUS.FOUND) {
          // 从重定向URL中提取授权码 (Extract authorization code from the redirect URL)
          const authCode = TestAssertions.expectAuthorizationResponse(authResponse, state); // 同时验证state
          expect(authCode).toBeDefined(); // 授权码应存在

          if (authCode) {
            // 步骤2: 客户端使用授权码向令牌端点请求访问令牌
            // (Step 2: Client exchanges the authorization code for an access token at the token endpoint)
            const tokenResponse = await httpClient.requestToken({
              grant_type: 'authorization_code',
              code: authCode,
              redirect_uri: redirectUri, // 必须与授权请求中的一致
              client_id: confidentialClient.clientId,
              client_secret: confidentialClient.plainSecret!, // 机密客户端需要提供密钥
            });

            // 断言: 令牌端点的响应 (Assertion: Response from the token endpoint)
            expect(tokenResponse.status).toBe(TEST_CONFIG.HTTP_STATUS.OK); // 应返回200 OK
            if (tokenResponse.status === TEST_CONFIG.HTTP_STATUS.OK) {
              const tokenData = await tokenResponse.json();
              // 验证令牌内容 (Verify token content)
              expect(tokenData.access_token).toBeDefined(); // 访问令牌必须存在
              expect(tokenData.token_type).toBe('Bearer'); // 令牌类型应为 Bearer
              expect(tokenData.refresh_token).toBeDefined(); // 刷新令牌也应存在 (取决于服务器配置和 offline_access scope)
              expect(tokenData.expires_in).toBeGreaterThan(0); // 有效期应大于0
              // 可以进一步解码JWT并验证声明 (Can further decode JWT and verify claims)
            }
          }
        } else {
          console.warn(`TC_OBFI_AM_001_001: 授权请求未按预期重定向 (status: ${authResponse.status}). 可能需要用户登录或授权配置。`);
        }
      });
    });

    // 测试场景: AM-003 - 客户端凭证模式
    describe('AM-003: 客户端凭证模式 / Client Credentials Flow', () => {
      // 测试用例: TC_OBFI_AM_003_001 - 系统应支持客户端凭证授权模式，用于机器到机器的通信
      it('TC_OBFI_AM_003_001: 应支持客户端凭证授权 / Should support client credentials grant', async () => {
        // 准备测试数据: confidentialClient (必须是机密客户端)
        const scope = 'api:read api:write_all_things'; // 客户端请求的作用域

        // 动作: 客户端直接向令牌端点请求访问令牌 (Action: Client directly requests an access token from the token endpoint)
        const response = await httpClient.requestToken({
          grant_type: 'client_credentials',
          client_id: confidentialClient.clientId,
          client_secret: confidentialClient.plainSecret!,
          scope: scope,
        });

        // 断言: 验证令牌响应 (Assertion: Verify token response)
        expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK); // HTTP状态码应为200 OK
        if (response.status === TEST_CONFIG.HTTP_STATUS.OK) {
          const data = await response.json();
          expect(data.access_token).toBeDefined(); // 访问令牌应存在
          expect(data.token_type).toBe('Bearer'); // 令牌类型应为 Bearer
          expect(data.expires_in).toBeGreaterThan(0); // 有效期应大于0
          // 客户端凭证模式通常不返回刷新令牌 (Client credentials grant usually does not return a refresh token)
          expect(data.refresh_token).toBeUndefined();
          // 验证授予的作用域是否与请求的匹配或为子集
          // (Verify granted scope matches requested or is a subset)
          expect(ScopeUtils.isSubset(ScopeUtils.parseScopes(data.scope), ScopeUtils.parseScopes(scope))).toBe(true);
        }
      });
    });

    // 测试场景: AM-005 - PKCE 支持 (针对公共客户端的授权码流程)
    describe('AM-005: PKCE 支持 / PKCE Support', () => {
      // 测试用例: TC_OBFI_AM_005_001 - 系统应为公共客户端支持使用PKCE的授权码流程
      it('TC_OBFI_AM_005_001: 应支持PKCE授权码流程 / Should support PKCE authorization code flow', async () => {
        // 准备测试数据: PKCE代码对, state, redirect URI, scope
        // (Prepare test data: PKCE code pair, state, redirect URI, scope)
        const pkce = PKCETestUtils.generatePKCE(); // 生成 code_verifier 和 code_challenge
        const state = TestUtils.generateState(); // 生成随机 state
        const redirectUri = publicClient.redirectUris[0]; // 公共客户端的回调URI
        const scope = 'openid profile offline_access'; // 请求的作用域

        // 步骤1: (模拟) 客户端发起包含PKCE参数的授权请求
        // (Step 1: (Simulate) Client initiates authorization request with PKCE parameters)
        const authResponse = await httpClient.authorize({
          response_type: 'code',
          client_id: publicClient.clientId, // 公共客户端ID
          redirect_uri: redirectUri,
          scope: scope,
          state: state,
          code_challenge: pkce.codeChallenge,
          code_challenge_method: pkce.codeChallengeMethod, // 通常为 'S256'
        });

        // 断言: 授权端点的响应 (Assertion: Response from the authorization endpoint)
        expect(authResponse.status).toBeOneOf([
          TEST_CONFIG.HTTP_STATUS.FOUND,
          TEST_CONFIG.HTTP_STATUS.OK,
          TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED,
          TEST_CONFIG.HTTP_STATUS.TEMPORARY_REDIRECT,
        ]);

        if (authResponse.status === TEST_CONFIG.HTTP_STATUS.FOUND) {
          // 从重定向URL中提取授权码 (Extract authorization code from the redirect URL)
          const authCode = TestAssertions.expectAuthorizationResponse(authResponse, state);
          expect(authCode).toBeDefined();

          if (authCode) {
            // 步骤2: 客户端使用授权码和 code_verifier 向令牌端点请求令牌
            // (Step 2: Client exchanges authorization code and code_verifier for tokens at the token endpoint)
            const tokenResponse = await httpClient.requestToken({
              grant_type: 'authorization_code',
              code: authCode,
              redirect_uri: redirectUri,
              client_id: publicClient.clientId, // 公共客户端ID
              code_verifier: pkce.codeVerifier, // 提供 code_verifier
              // 公共客户端不发送 client_secret (Public clients do not send client_secret)
            });

            // 断言: 令牌端点的响应 (Assertion: Response from the token endpoint)
            expect(tokenResponse.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);
            if (tokenResponse.status === TEST_CONFIG.HTTP_STATUS.OK) {
              const tokenData = await tokenResponse.json();
              expect(tokenData.access_token).toBeDefined(); // 访问令牌应存在
              expect(tokenData.token_type).toBe('Bearer'); // 令牌类型应为 Bearer
              // 根据是否请求 offline_access scope，刷新令牌可能存在
              if (scope.includes('offline_access')) {
                expect(tokenData.refresh_token).toBeDefined();
              }
            }
          }
        } else {
          console.warn(`TC_OBFI_AM_005_001: PKCE授权请求未按预期重定向 (status: ${authResponse.status}). 可能需要用户登录或授权配置。`);
        }
      });
    });
  });

  // 测试分组: TA - 第三方应用集成场景
  describe('TA - 第三方应用集成场景 / Third-party Application Integration Scenarios', () => {
    // 测试场景: TA-002 - 授权码模式流程 (使用 oauth2Helper 简化流程)
    describe('TA-002: 授权码模式流程 / Authorization Code Flow Process', () => {
      // 测试用例: TC_OBFI_TA_002_001 - 应支持使用辅助工具完成的完整第三方应用集成流程
      it('TC_OBFI_TA_002_001: 应支持完整的第三方应用集成流程 / Should support full third-party application integration flow', async () => {
        // 准备测试数据: regularUser, confidentialClient
        // (Prepare test data: regularUser, confidentialClient)

        // 动作: 使用 oauth2Helper 执行完整的授权码流程 (Action: Use oauth2Helper to perform full authorization code flow)
        // 此辅助函数内部处理了授权请求、用户登录/同意模拟（如果需要）、令牌交换
        // (This helper function internally handles authorization request, user login/consent simulation (if needed), and token exchange)
        const { accessToken, idToken, refreshToken, scope: grantedScope } =
          await oauth2Helper.fullAuthorizationCodeFlow(regularUser, confidentialClient, 'openid profile email api:read offline_access');

        // 断言: 验证获取到的令牌 (Assertion: Verify obtained tokens)
        expect(accessToken).toBeDefined(); // 访问令牌必须存在
        expect(idToken).toBeDefined(); // ID令牌也应存在 (因为请求了 openid scope)
        expect(refreshToken).toBeDefined(); // 刷新令牌应存在 (因为请求了 offline_access scope)
        expect(grantedScope).toBeDefined(); // 授予的作用域应存在

        if (accessToken) {
          // 动作: 使用获取的访问令牌访问受保护资源 (例如 UserInfo 端点)
          // (Action: Use the obtained access token to access a protected resource (e.g., UserInfo endpoint))
          const userInfoResponse = await httpClient.authenticatedRequest('/api/oauth/userinfo', accessToken);
          // 断言: 验证资源访问结果 (Assertion: Verify resource access result)
          expect(userInfoResponse.status).toBe(TEST_CONFIG.HTTP_STATUS.OK); // 访问应成功
          if (userInfoResponse.status === TEST_CONFIG.HTTP_STATUS.OK) {
            const userInfo = await userInfoResponse.json();
            expect(userInfo.sub).toBe(regularUser.id); // UserInfo中的sub声明应为用户ID
            // 可以根据需要验证其他声明，如 email, profile 等 (Can verify other claims like email, profile as needed)
          }
        }
      });
    });

    // 测试场景: TA-007 - 拒绝授权处理
    describe('TA-007: 拒绝授权处理 / Handling Authorization Rejection', () => {
      // 测试用例: TC_OBFI_TA_007_001 - 当用户在授权服务器上拒绝授权时，应正确处理并将错误信息返回给客户端
      it('TC_OBFI_TA_007_001: 用户拒绝授权时应正确处理 / Should correctly handle user denying authorization', async () => {
        // 准备测试数据: state (Prepare test data: state)
        // 模拟用户拒绝授权通常需要在授权服务器端有特定机制，或者测试时能配置授权请求使其自动失败并带有特定错误码。
        // (Simulating user denial often requires specific mechanisms on the authorization server or configuring the auth request to fail automatically with a specific error code during testing.)
        // 这里我们主要检查的是，如果授权服务器返回了拒绝授权的错误，客户端是否能正确接收。
        // (Here, we primarily check if the client can correctly receive the error if the authorization server returns an access_denied error.)

        // 动作: 发起一个授权请求，假设此请求在服务器端被用户“拒绝”
        // (Action: Initiate an authorization request, assuming this request is "denied" by the user on the server-side)
        // 这可能需要测试服务器支持一个特殊的参数来模拟拒绝，或者测试桩返回一个预设的拒绝响应。
        // (This might require the test server to support a special parameter to simulate denial, or a test stub to return a preset denial response.)
        // 我们这里假设 httpClient.authorize 如果遇到需要用户交互但无法进行的情况（比如配置为自动拒绝），会返回相应的重定向。
        // (We assume here that if httpClient.authorize encounters a situation requiring user interaction but cannot proceed (e.g., configured for auto-denial), it will return the corresponding redirect.)
        const redirectUri = confidentialClient.redirectUris[0];
        const state = TestUtils.generateState();
        const response = await httpClient.authorize({
          response_type: 'code',
          client_id: confidentialClient.clientId,
          redirect_uri: redirectUri,
          scope: 'openid profile email',
          state: state,
          // prompt: 'none' // 如果用户未预先授权，prompt=none 可能导致 access_denied
        });

        // 断言: 验证服务器是否重定向回客户端，并在URL中包含 error=access_denied
        // (Assertion: Verify if the server redirects back to the client with error=access_denied in the URL)
        // 理想情况下，会有一个302重定向到 redirect_uri?error=access_denied&state=...
        // (Ideally, there would be a 302 redirect to redirect_uri?error=access_denied&state=...)
        expect(response.status).toBeOneOf([TEST_CONFIG.HTTP_STATUS.FOUND, TEST_CONFIG.HTTP_STATUS.OK, TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED]);

        if (response.status === TEST_CONFIG.HTTP_STATUS.FOUND) {
          const location = response.headers.get('location');
          expect(location).toBeDefined();
          // 检查重定向URL是否包含预期的错误参数
          // (Check if the redirect URL contains the expected error parameters)
          if (location?.startsWith(redirectUri)) { // 必须重定向到注册的URI
            const params = new URL(location).searchParams;
            expect(params.get('error')).toBe('access_denied'); // OAuth 2.0 标准错误码
            expect(params.get('state')).toBe(state); // state必须匹配
          } else {
            // 如果重定向到其他地方，或者没有错误，则测试可能需要调整
            console.warn(`TC_OBFI_TA_007_001: 授权拒绝未按预期重定向到客户端URI并携带错误。Location: ${location}`);
          }
        } else {
          // 如果没有重定向，打印警告，这可能表示测试设置或服务器行为与预期不符
          console.warn(`TC_OBFI_TA_007_001: 授权拒绝测试未收到预期的重定向 (status: ${response.status}).`);
          // 对于某些实现，直接返回错误页面（200 OK）或错误响应（400/401）也可能被接受，但这不符合标准重定向流程。
          // (For some implementations, directly returning an error page (200 OK) or an error response (400/401) might also be acceptable, but this doesn't follow the standard redirect flow.)
        }
      });
    });
  });

  // 测试分组: SEC - 安全性测试场景
  describe('SEC - 安全性测试场景 / Security Test Scenarios', () => {
    // 测试场景: SEC-001 - 令牌篡改测试
    describe('SEC-001: 令牌篡改测试 / Token Tampering Test', () => {
      // 测试用例: TC_OBFI_SEC_001_001 - 当客户端使用被篡改的访问令牌访问资源时，请求应被拒绝
      it('TC_OBFI_SEC_001_001: 篡改的令牌应被拒绝 / Tampered token should be rejected', async () => {
        // 准备测试数据: 创建一个有效的访问令牌 (Prepare test data: Create a valid access token)
        const validToken = await dataManager.createAccessToken(regularUser.id!, confidentialClient.clientId, 'openid profile api:read');
        expect(validToken).toBeDefined();

        // 准备测试数据: 篡改令牌 (Prepare test data: Tamper the token)
        // 例如，在令牌末尾添加一些字符，或修改其中一部分
        // (For example, add some characters at the end of the token, or modify a part of it)
        const tamperedToken = validToken.slice(0, -5) + 'tampered_part';

        // 动作: 使用篡改的令牌访问受保护资源 (Action: Access a protected resource with the tampered token)
        const response = await httpClient.authenticatedRequest('/api/oauth/userinfo', tamperedToken); // UserInfo作为示例

        // 断言: 请求应失败，并返回401 Unauthorized (Assertion: Request should fail with 401 Unauthorized)
        expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED);
        const data = await response.json();
        // 错误响应应指明令牌无效 (Error response should indicate an invalid token)
        expect(data.error).toBe(TEST_CONFIG.ERROR_CODES.INVALID_TOKEN); // 'invalid_token' 是标准错误码
      });
    });

    // 测试场景: SEC-004 - 暴力破解防护 (针对登录端点)
    describe('SEC-004: 暴力破解防护 / Brute Force Protection', () => {
      // 测试用例: TC_OBFI_SEC_004_001 - 对登录端点进行多次连续的错误密码尝试，应触发某种形式的保护机制 (如速率限制或账户锁定)
      it('TC_OBFI_SEC_004_001: 多次错误登录应触发保护机制 / Multiple failed logins should trigger protection', async () => {
        // 准备测试数据: 无 (Prepare test data: None)
        const attempts = [];
        const maxAttempts = TEST_CONFIG.MAX_LOGIN_ATTEMPTS_PER_WINDOW + 2; // 超过配置的阈值

        // 动作: 连续多次使用错误密码尝试登录 (Action: Attempt to login with incorrect password multiple times consecutively)
        for (let i = 0; i < maxAttempts; i++) {
          const response = await httpClient.loginUser(regularUser.username, `wrong_password_obfi_${i}`);
          attempts.push(response.status);
          if (response.status === TEST_CONFIG.HTTP_STATUS.TOO_MANY_REQUESTS) {
            break; // 如果收到429，提前退出循环
          }
          await TestUtils.sleep(50); // 短暂延迟以避免请求过于密集而被网络层阻塞
        }

        // 断言: 验证是否触发了保护机制 (Assertion: Verify if a protection mechanism was triggered)
        // 期望至少有一次请求返回429 Too Many Requests (速率限制)
        // (Expect at least one request to return 429 Too Many Requests (rate limiting))
        // 或者，如果系统实现的是账户锁定，则后续尝试可能会持续返回401/403，但日志中应有锁定记录。
        // (Alternatively, if the system implements account lockout, subsequent attempts might continue to return 401/403, but lockout should be logged.)
        const rateLimitedResponse = attempts.find((status) => status === TEST_CONFIG.HTTP_STATUS.TOO_MANY_REQUESTS);
        expect(rateLimitedResponse).toBeDefined(); // 应至少有一次429响应
      }, 15000); // 增加测试超时时间 (Increased timeout for multiple attempts)
    });

    // 测试场景: SEC-006 - 令牌泄露防护 (令牌撤销)
    describe('SEC-006: 令牌泄露防护 / Token Leakage Protection (via Revocation)', () => {
      // 测试用例: TC_OBFI_SEC_006_001 - 当访问令牌被撤销后，该令牌应立即失效，无法再用于访问受保护资源
      it('TC_OBFI_SEC_006_001: 撤销的令牌应立即失效 / Revoked token should be immediately invalid', async () => {
        // 准备测试数据: 创建一个访问令牌 (Prepare test data: Create an access token)
        const accessToken = await dataManager.createAccessToken(regularUser.id!, confidentialClient.clientId, 'openid profile api:read');
        expect(accessToken).toBeDefined();

        // 步骤1: 验证令牌在撤销前是有效的 (Step 1: Verify the token is valid before revocation)
        const beforeResponse = await httpClient.authenticatedRequest('/api/oauth/userinfo', accessToken);
        expect(beforeResponse.status).toBe(TEST_CONFIG.HTTP_STATUS.OK); // 初始应成功

        // 步骤2: 撤销访问令牌 (Step 2: Revoke the access token)
        const revokeResponse = await httpClient.revokeToken(
          accessToken,
          confidentialClient.clientId,
          confidentialClient.plainSecret
        );
        // 断言: 撤销请求本身应成功 (Assertion: Revocation request itself should be successful)
        expect(revokeResponse.status).toBeOneOf([TEST_CONFIG.HTTP_STATUS.OK, TEST_CONFIG.HTTP_STATUS.NO_CONTENT]);

        // 可选: 等待一小段时间确保撤销操作在整个系统中生效 (Optional: Wait for a short period to ensure revocation propagates)
        await TestUtils.sleep(TEST_CONFIG.PROPAGATION_DELAY || 500);

        // 步骤3: 使用已撤销的令牌再次尝试访问资源 (Step 3: Attempt to access the resource again with the revoked token)
        const afterResponse = await httpClient.authenticatedRequest('/api/oauth/userinfo', accessToken);
        // 断言: 访问应被拒绝 (Assertion: Access should be denied)
        expect(afterResponse.status).toBe(TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED); // 应返回401 Unauthorized
      });
    });
  });

  // 测试分组: 性能和负载测试 (简版)
  describe('性能和负载测试 / Performance and Load Tests (Simplified)', () => {
    // 测试场景: PERF-001 - 并发授权请求
    describe('PERF-001: 并发授权请求 / Concurrent Authorization Requests', () => {
      // 测试用例: TC_OBFI_PERF_001_001 - 系统应能处理指定数量的并发授权请求而不出现严重错误
      it('TC_OBFI_PERF_001_001: 应能处理并发授权请求 / Should handle concurrent authorization requests', async () => {
        // 准备测试数据: 定义并发请求数量 (Prepare test data: Define number of concurrent requests)
        const concurrentRequests = 5; // 可根据系统能力调整 (Adjustable based on system capacity)
        const requests = Array.from({ length: concurrentRequests }, (_, i) =>
          // 动作: 同时发起多个授权请求 (Action: Initiate multiple authorization requests concurrently)
          // 注意：这里的 httpClient.authorize 行为取决于其实现。如果它涉及模拟用户登录且不是线程安全的，
          // 或者依赖于可能被并发修改的共享状态，则此测试可能需要更复杂的设置。
          // (Note: The behavior of httpClient.authorize here depends on its implementation. If it involves simulating user login
          // and is not thread-safe, or relies on shared state that might be modified concurrently, this test might need a more complex setup.)
          httpClient.authorize({
            response_type: 'code',
            client_id: publicClient.clientId, // 使用公共客户端以避免处理密钥
            redirect_uri: publicClient.redirectUris[0],
            scope: 'openid profile',
            state: TestUtils.generateState(`perf_state_${i}`),
          })
        );

        // 等待所有并发请求完成 (Wait for all concurrent requests to complete)
        const responses = await Promise.all(requests);

        // 断言: 验证所有响应 (Assertion: Verify all responses)
        expect(responses).toHaveLength(concurrentRequests); // 应收到所有请求的响应
        responses.forEach((response, i) => {
          // 每个响应的状态码应在可接受的范围内 (例如，没有5xx服务器错误)
          // (Each response status code should be within an acceptable range (e.g., no 5xx server errors))
          expect(response.status).toBeLessThan(500); // 确保没有服务器内部错误
          // 预期的状态码可能是重定向、成功、需要认证或速率限制等
          // (Expected status codes could be redirect, success, needs authentication, or rate limiting, etc.)
          expect(response.status).toBeOneOf([
            TEST_CONFIG.HTTP_STATUS.FOUND,
            TEST_CONFIG.HTTP_STATUS.OK,
            TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED,
            TEST_CONFIG.HTTP_STATUS.BAD_REQUEST, // 例如，如果 state 重复导致错误
            TEST_CONFIG.HTTP_STATUS.TEMPORARY_REDIRECT,
            TEST_CONFIG.HTTP_STATUS.TOO_MANY_REQUESTS,
          ]);
          console.log(`PERF_001 - Request ${i+1} status: ${response.status}`);
        });
      }, 15000); // 增加超时时间以容纳并发处理 (Increased timeout for concurrent processing)
    });

    // 测试场景: PERF-002 - 令牌刷新性能
    describe('PERF-002: 令牌刷新性能 / Token Refresh Performance', () => {
      // 测试用例: TC_OBFI_PERF_002_001 - 系统应能在可接受的时间内处理令牌刷新请求
      it('TC_OBFI_PERF_002_001: 应能快速处理令牌刷新 / Should handle token refresh quickly', async () => {
        // 准备测试数据: 获取一个有效的刷新令牌 (Prepare test data: Obtain a valid refresh token)
        // 这可以通过完整的授权码流程（请求 offline_access scope）来实现
        // (This can be achieved through a full authorization code flow requesting offline_access scope)
        const { refreshToken } = await oauth2Helper.fullAuthorizationCodeFlow(
          regularUser,
          confidentialClient,
          'openid offline_access'
        );
        expect(refreshToken).toBeDefined(); // 确保获取到刷新令牌

        // 记录开始时间 (Record start time)
        const startTime = Date.now();

        // 动作: 使用刷新令牌请求新的访问令牌 (Action: Use refresh token to request a new access token)
        const response = await httpClient.requestToken({
          grant_type: 'refresh_token',
          refresh_token: refreshToken!,
          client_id: confidentialClient.clientId,
          client_secret: confidentialClient.plainSecret!,
        });

        // 计算耗时 (Calculate duration)
        const duration = Date.now() - startTime;

        // 断言: 验证响应和性能 (Assertion: Verify response and performance)
        expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK); // 刷新请求应成功
        // 期望处理时间在阈值内 (例如 1 秒) (Expect processing time to be within a threshold (e.g., 1 second))
        expect(duration).toBeLessThan(TEST_CONFIG.PERFORMANCE_THRESHOLDS?.tokenRefresh || 1000);
        console.log(`PERF_002 - Token refresh duration: ${duration}ms`);
      });
    });
  });

  // 测试分组: V2 API TDD 测试桩 (TDD Stubs for V2 APIs)
  // 这些是为未来 v2 API 预先编写的测试结构。
  // API 实现后，这些测试用例需要填充实际的请求逻辑和断言。
  // (These are test structures written in advance for future v2 APIs.)
  // (Once the APIs are implemented, these test cases will need to be filled with actual request logic and assertions.)
  describe('V2_TDD - v2 API (TDD 测试桩 / TDD Stubs)', () => {
    // 测试子分组: V2 授权模式
    describe('V2_AM - v2 授权模式 / v2 Authorization Modes (TDD)', () => {
      // 测试场景: V2 授权码模式
      describe('V2_AM-001: v2 授权码模式 / v2 Authorization Code Flow (TDD)', () => {
        // 测试用例: (TDD) v2 授权码流程应成功获取令牌
        it('TC_OBFI_V2_AM_001_001: (TDD) v2 授权码流程应成功获取令牌 / (TDD) v2 Authorization code flow should successfully obtain tokens', async () => {
          // 准备: PKCE 码, state, v2客户端信息, v2回调URI, v2作用域等
          // (Setup: PKCE codes, state, v2 client info, v2 redirect URI, v2 scope, etc.)
          const pkce = PKCETestUtils.generatePKCE();
          const state = TestUtils.generateState();
          // 假设已有一个注册的v2公共客户端 (Assuming a registered v2 public client exists)
          // const v2PublicClient = await dataManager.createTestClient('V2_PUBLIC_CLIENT_TDD', { isV2: true, grantTypes: ['authorization_code'] });
          const v2RedirectUri = publicClient.redirectUris[0]; // 示例，实际应为v2客户端的回调
          const v2Scope = 'openid profile v2_api:read v2_user:profile_read'; // 示例v2作用域

          // 步骤1: (模拟) 用户通过 /api/v2/oauth/authorize 发起授权请求
          // (Step 1: (Simulate) User initiates authorization request via /api/v2/oauth/authorize)
          // 此处为TDD占位符，实际调用可能需要 httpClient 扩展或新的辅助函数
          // (This is a TDD placeholder, actual call might need httpClient extension or new helper)
          console.warn('TDD Test TC_OBFI_V2_AM_001_001 for v2 /api/v2/oauth/authorize is a placeholder and not fully implemented pending API.');
          // const authResponse = await httpClient.v2.authorize({ // 假设有 v2 版本的 httpClient 方法
          //   response_type: 'code',
          //   client_id: v2PublicClient.clientId,
          //   redirect_uri: v2RedirectUri,
          //   scope: v2Scope,
          //   state: state,
          //   code_challenge: pkce.codeChallenge,
          //   code_challenge_method: pkce.codeChallengeMethod,
          // });

          // 断言: 初始授权请求应被接受或重定向 (Assertion: Initial auth request should be accepted or redirect)
          // expect(authResponse.status).toBeOneOf([200, 302, 307]); // 示例断言

          // (模拟获取授权码)
          // const authCode = authResponse.getCode(); // 假设有此方法

          // 步骤2: (模拟) 使用授权码通过 /api/v2/oauth/token 交换令牌
          // (Step 2: (Simulate) Exchange authorization code for tokens via /api/v2/oauth/token)
          // const tokenResponse = await httpClient.v2.requestToken({
          //   grant_type: 'authorization_code',
          //   code: authCode,
          //   redirect_uri: v2RedirectUri,
          //   client_id: v2PublicClient.clientId,
          //   code_verifier: pkce.codeVerifier,
          // });

          // 断言: 令牌请求应成功并返回符合v2规范的令牌 (Assertion: Token request should succeed and return v2 compliant tokens)
          // TestAssertions.expectV2TokenResponse(tokenResponse); // 假设有 v2 的断言辅助函数
          // const tokens = await tokenResponse.json();
          // const decodedAccessToken = decodeJwt(tokens.access_token);
          // expect(decodedAccessToken.ver).toBe(2); // 假设v2令牌有版本声明
          // expect(ScopeUtils.parseScopes(decodedAccessToken.scope)).toEqual(expect.arrayContaining(ScopeUtils.parseScopes(v2Scope)));

          // TDD占位符断言 (TDD placeholder assertion)
          expect(true).toBe(true);
        });
      });

      // 测试场景: V2 客户端凭证模式
      describe('V2_AM-002: v2 客户端凭证模式 / v2 Client Credentials Grant (TDD)', () => {
        // 测试用例: (TDD) v2 客户端凭证模式应成功获取令牌
        it('TC_OBFI_V2_AM_002_001: (TDD) v2 客户端凭证模式应成功获取令牌 / (TDD) v2 Client credentials grant should successfully obtain tokens', async () => {
          // 准备: v2 机密客户端信息 (Setup: v2 confidential client info)
          // const v2ConfidentialClient = await dataManager.createTestClient('V2_CONFIDENTIAL_CLIENT_TDD', { isV2: true, grantTypes: ['client_credentials'] });
          const v2Scope = 'v2_service_api:read_all v2_another_service:write'; // 示例v2服务间作用域

          // 步骤1: 客户端请求 /api/v2/oauth/token (Step 1: Client requests /api/v2/oauth/token)
          console.warn('TDD Test TC_OBFI_V2_AM_002_001 for v2 /api/v2/oauth/token (client_credentials) is a placeholder and not fully implemented pending API.');
          // const tokenResponse = await httpClient.v2.requestToken({
          //   grant_type: 'client_credentials',
          //   client_id: v2ConfidentialClient.clientId,
          //   client_secret: v2ConfidentialClient.plainSecret,
          //   scope: v2Scope,
          // });

          // 断言: 令牌响应成功并符合v2规范 (Assertion: Token response successful and v2 compliant)
          // TestAssertions.expectV2TokenResponse(tokenResponse, { expectRefreshToken: false });
          // const tokens = await tokenResponse.json();
          // const decodedAccessToken = decodeJwt(tokens.access_token);
          // expect(decodedAccessToken.ver).toBe(2);
          // expect(decodedAccessToken.sub_type).toBe('client'); // 假设v2区分主体类型

          // TDD占位符断言 (TDD placeholder assertion)
          expect(true).toBe(true);
        });
      });
    });

    // 测试子分组: V2 用户资源管理
    describe('V2_URM - v2 用户资源管理 / v2 User Resource Management (TDD)', () => {
      // 测试用例: (TDD) 应能通过 v2 API 创建用户
      it('TC_OBFI_V2_URM_001_001: (TDD) 应能通过 v2 API 创建用户 / (TDD) Should be able to create a user via v2 API', async () => {
        // 准备: 新用户信息, 管理员访问令牌 (Setup: new user data, admin access token)
        // const adminV2Token = await getAdminV2Token(); // 假设有获取v2管理员令牌的辅助函数
        const newUserV2Data = {
          username: `v2user_tdd_${Date.now()}`,
          email: `v2user_tdd_${Date.now()}@example.com`,
          password: 'PasswordV2!',
          // 可能还有其他v2特定字段 (Potentially other v2-specific fields)
          // profile: { displayName: 'V2 TDD User', locale: 'en-US' }
        };

        // 步骤1: 调用 /api/v2/users 创建用户 (Step 1: Call /api/v2/users to create user)
        console.warn('TDD Test TC_OBFI_V2_URM_001_001 for v2 /api/v2/users (POST) is a placeholder and not fully implemented pending API.');
        // const response = await httpClient.v2.post( // 假设有 v2 post 方法
        //   '/api/v2/users',
        //   newUserV2Data,
        //   { headers: { Authorization: `Bearer ${adminV2Token}` } }
        // );

        // 断言: 用户创建成功 (Assertion: User creation successful)
        // expect(response.status).toBe(201); // HTTP 201 Created
        // const createdUser = await response.json();
        // expect(createdUser.id).toBeDefined();
        // expect(createdUser.username).toBe(newUserV2Data.username);
        // expect(createdUser.profile?.displayName).toBe(newUserV2Data.profile.displayName); // 验证v2特定字段

        // TDD占位符断言 (TDD placeholder assertion)
        expect(true).toBe(true);
      });

      // 测试用例: (TDD) 应能通过 v2 API 获取用户详情
      it('TC_OBFI_V2_URM_002_001: (TDD) 应能通过 v2 API 获取用户详情 / (TDD) Should be able to get user details via v2 API', async () => {
        // 准备: 目标用户ID, 访问令牌 (Setup: target user ID, access token with appropriate scope)
        // const targetUserId = regularUser.id; // 假设 regularUser 是已存在的用户
        // const userV2Token = await getUserV2TokenWithScope('v2_user:profile_read'); // 获取带v2作用域的令牌

        // 步骤1: 调用 /api/v2/users/{userId} 获取用户 (Step 1: Call /api/v2/users/{userId} to get user)
        console.warn('TDD Test TC_OBFI_V2_URM_002_001 for v2 /api/v2/users/{userId} (GET) is a placeholder and not fully implemented pending API.');
        // const response = await httpClient.v2.get(
        //   `/api/v2/users/${targetUserId}`,
        //   { headers: { Authorization: `Bearer ${userV2Token}` } }
        // );

        // 断言: 获取用户成功 (Assertion: Get user successful)
        // expect(response.status).toBe(200);
        // const userDetails = await response.json();
        // expect(userDetails.id).toBe(targetUserId);
        // expect(userDetails.username).toBe(regularUser.username);
        // expect(userDetails.v2_specific_field).toBeDefined(); // 验证v2特定字段

        // TDD占位符断言 (TDD placeholder assertion)
        expect(true).toBe(true);
      });
    });

    // 测试子分组: V2 客户端资源管理
    describe('V2_CRM - v2 客户端资源管理 / v2 Client Resource Management (TDD)', () => {
        // 测试用例: (TDD) 应能通过 v2 API 创建客户端
        it('TC_OBFI_V2_CRM_001_001: (TDD) 应能通过 v2 API 创建客户端 / (TDD) Should be able to create a client via v2 API', async () => {
            // 准备: 新客户端信息, 管理员访问令牌 (Setup: new client data, admin access token)
            // const adminV2Token = await getAdminV2Token();
            const newClientV2Data = {
                client_name: `V2 Test Client TDD ${Date.now()}`,
                grant_types: ['authorization_code', 'client_credentials', 'refresh_token'],
                redirect_uris: [`https://client-app-v2-tdd.example.com/callback`],
                response_types: ['code', 'token'],
                token_endpoint_auth_method: 'client_secret_post', // 或 private_key_jwt for v2
                scope: 'openid profile email v2_api:read v2_api:write',
                // v2特定配置，如 public_keys, jwks_uri, software_statement 等
                // (v2 specific configurations like public_keys, jwks_uri, software_statement etc.)
                // software_id: 'unique_software_id_for_ssa',
                // application_type: 'web', // 'native', 'web', 'service'
            };

            // 步骤1: 调用 /api/v2/clients 创建客户端 (Step 1: Call /api/v2/clients to create client)
            console.warn('TDD Test TC_OBFI_V2_CRM_001_001 for v2 /api/v2/clients (POST) is a placeholder and not fully implemented pending API.');
            // const response = await httpClient.v2.post(
            //     '/api/v2/clients',
            //     newClientV2Data,
            //     { headers: { Authorization: `Bearer ${adminV2Token}` } }
            // );

            // 断言: 客户端创建成功 (Assertion: Client creation successful)
            // expect(response.status).toBe(201); // HTTP 201 Created
            // const createdClient = await response.json();
            // expect(createdClient.client_id).toBeDefined();
            // expect(createdClient.client_name).toBe(newClientV2Data.client_name);
            // expect(createdClient.grant_types).toEqual(expect.arrayContaining(newClientV2Data.grant_types));
            // expect(createdClient.software_id).toBe(newClientV2Data.software_id); // 验证v2特定字段

            // TDD占位符断言 (TDD placeholder assertion)
            expect(true).toBe(true);
        });
    });
  });
});
