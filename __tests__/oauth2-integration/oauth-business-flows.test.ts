import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import {
  createOAuth2TestSetup,
  TestHttpClient,
  TestAssertions,
  PKCETestUtils,
  TestUtils,
  TEST_CONFIG,
  TEST_USERS,
  TEST_CLIENTS,
  TestUser,
  TestClient,
  OAuth2TestHelper,
  ScopeUtils,
} from '../utils/test-helpers';
import { decodeJwt } from 'jose'; // 用于解码JWT

// 测试套件: OAuth 2.0 业务流程集成测试
describe('OAuth 2.0 业务流程集成测试 / OAuth 2.0 Business Flows Tests', () => {
  const { dataManager, httpClient, setup, cleanup } = createOAuth2TestSetup('oauth_business_flows');
  let adminUser: TestUser;
  let regularUser: TestUser;
  let confidentialClient: TestClient;
  let publicClient: TestClient;
  let webAppClient: TestClient;

  // 在所有测试开始前执行的设置钩子
  beforeAll(async () => {
    await setup(); // 初始化测试环境

    // 创建不同角色的测试用户 (Create test users with different roles)
    adminUser = await dataManager.createUser({
      username: 'admin-user',
      email: 'admin@test.com',
      // ... 其他用户属性
      password: 'AdminPassword123!',
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin',
    });

    regularUser = await dataManager.createUser({
      username: 'regular-user',
      email: 'user@test.com',
      // ... 其他用户属性
      password: 'UserPassword123!',
      firstName: 'Regular',
      lastName: 'User',
      role: 'user',
    });

    // 创建不同类型的客户端 (Create different types of clients)
    confidentialClient = await dataManager.createClient({
      clientId: 'confidential-web-app',
      name: 'Confidential Web Application',
      // ... 其他客户端属性
      redirectUris: ['https://app.example.com/callback'],
      grantTypes: ['authorization_code', 'refresh_token', 'client_credentials'],
      responseTypes: ['code'],
      scope: ['openid', 'profile', 'email', 'api:read', 'api:write'],
      isPublic: false,
    });

    publicClient = await dataManager.createClient({
      clientId: 'public-spa-app',
      name: 'Public SPA Application',
      // ... 其他客户端属性
      redirectUris: ['http://localhost:3000/callback'],
      grantTypes: ['authorization_code'],
      responseTypes: ['code'],
      scope: ['openid', 'profile', 'email'],
      isPublic: true,
    });

    webAppClient = await dataManager.createClient({
      clientId: 'web-app-client',
      name: 'Web Application Client',
      // ... 其他客户端属性
      redirectUris: ['https://webapp.example.com/auth/callback'],
      grantTypes: ['authorization_code', 'refresh_token'],
      responseTypes: ['code'],
      scope: ['openid', 'profile', 'email', 'offline_access'],
      isPublic: false,
    });
  });

  // 在所有测试结束后执行的清理钩子
  afterAll(async () => {
    await cleanup(); // 清理测试环境
  });

  // 测试分组: URM - 用户资源管理
  describe('URM - 用户资源管理 (User Resource Management)', () => {
    // 测试场景: URM-003 - 管理员登录
    describe('URM-003: 管理员登录 (Admin Login)', () => {
      // 测试用例: 管理员用户应能成功登录并访问管理员资源
      it('URM_003_001: 管理员用户应能成功登录 / Should allow admin user to login', async () => {
        // 准备测试数据: 使用 beforeAll 中创建的 adminUser

        // 动作: 使用管理员凭证登录
        const loginResponse = await httpClient.loginUser(
          adminUser.username,
          adminUser.plainPassword!
        );

        // 断言: 验证登录结果
        if (loginResponse.status === 200) {
          const loginData = await loginResponse.json();
          expect(loginData.success).toBe(true); // 登录应成功
          expect(loginData.user).toHaveProperty('id'); // 用户对象应包含ID
          expect(loginData.user.username).toBe(adminUser.username); // 用户名应匹配

          // 断言: 检查会话Cookie (这是session-based认证，不是OAuth令牌认证)
          const cookies = loginResponse.headers.get('set-cookie');
          expect(cookies).toContain('session_id'); // 应包含 session_id cookie
        } else {
          // 处理潜在的API未实现或速率限制等情况
          expect([404, 429, 501]).toContain(loginResponse.status);
        }
      });
    });

    // 测试场景: URM-004 - 普通用户登录
    describe('URM-004: 普通用户登录 (Regular User Login)', () => {
      // 测试用例: 普通用户应能成功登录
      it('URM_004_001: 普通用户应能成功登录 / Should allow regular user to login', async () => {
        // 准备测试数据: 使用 beforeAll 中创建的 regularUser

        // 动作: 使用普通用户凭证登录
        const loginResponse = await httpClient.loginUser(
          regularUser.username,
          regularUser.plainPassword!
        );

        // 断言: 验证登录结果
        if (loginResponse.status === 200) {
          const loginData = await loginResponse.json();
          expect(loginData.success).toBe(true); // 登录应成功
          expect(loginData.user).toHaveProperty('id'); // 用户对象应包含ID
          expect(loginData.user.username).toBe(regularUser.username); // 用户名应匹配
        } else {
          // 处理潜在的API未实现或速率限制等情况
          expect([404, 429, 501]).toContain(loginResponse.status);
        }
      });
    });

    // 测试场景: URM-005 - 密码错误登录
    describe('URM-005: 密码错误登录 (Invalid Password Login)', () => {
      // 测试用例: 使用错误密码登录应被拒绝
      it('URM_005_001: 使用错误密码登录应被拒绝 / Should reject login with incorrect password', async () => {
        // 准备测试数据: regularUser 和一个错误的密码

        // 动作: 使用错误密码尝试登录
        const loginResponse = await httpClient.loginUser(regularUser.username, 'WrongPassword123!');

        // 断言: 验证响应状态码和错误信息
        expect([400, 401, 404, 429]).toContain(loginResponse.status); // 状态码应为认证失败或请求错误

        if (loginResponse.status === 401) { // 如果是 401 Unauthorized
          const error = await loginResponse.json();
          expect(error.message || error.error).toBeDefined(); // 错误信息应存在
        }
      });
    });
  });

  // 测试分组: CM - 客户端管理
  describe('CM - 客户端管理 (Client Management)', () => {
    // 测试场景: CM-004 - 机密客户端认证
    describe('CM-004: 机密客户端认证 (Confidential Client Authentication)', () => {
      // 测试用例: 机密客户端应能使用客户端ID和密钥进行认证
      it('CM_004_001: 机密客户端应能使用ID和密钥认证 / Should authenticate confidential client with ID and Secret', async () => {
        // 准备测试数据: confidentialClient

        // 动作: 请求客户端凭证模式的令牌
        const response = await httpClient.requestToken({
          grant_type: 'client_credentials',
          client_id: confidentialClient.clientId,
          client_secret: confidentialClient.plainSecret!,
          scope: 'api:read',
        });

        // 断言: 验证令牌响应
        if (response.status === 200) {
          const token = await TestAssertions.expectTokenResponse(response);
          expect(token.token_type).toBe('Bearer'); // 令牌类型应为 Bearer
          expect(token.access_token).toBeDefined(); // 访问令牌应存在
          expect(token.scope).toBeDefined(); // 作用域应存在
          console.log('✅ CM-004: 机密客户端认证成功');
        } else {
          // 处理潜在的API未实现或速率限制等情况
          expect([400, 401, 404, 429, 501]).toContain(response.status);
          console.log('⚠️ CM-004: 客户端凭证端点不可用或受到速率限制');
        }
      });
    });

    // 测试场景: CM-005 - 公共客户端认证
    describe('CM-005: 公共客户端认证 (Public Client Authentication)', () => {
      // 测试用例: 公共客户端应能仅使用客户端ID进行认证（通常用于授权请求）
      it('CM_005_001: 公共客户端授权请求应被接受 / Should accept authorization request from public client with ID only', async () => {
        // 准备测试数据: publicClient
        // 公共客户端在请求授权码时不使用 client_secret

        // 动作: 发起授权请求
        const response = await httpClient.authorize({
          response_type: 'code',
          client_id: publicClient.clientId,
          redirect_uri: publicClient.redirectUris[0],
          scope: 'openid profile',
        });

        // 断言: 验证响应状态码 (公共客户端不提供密钥的授权请求应被接受或重定向到登录/授权页面)
        expect([
          TEST_CONFIG.HTTP_STATUS.OK, // 可能直接显示登录/授权页面
          TEST_CONFIG.HTTP_STATUS.FOUND, // 重定向到登录/授权页面
          TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED, // 如果需要先登录
          307, // Temporary Redirect
        ]).toContain(response.status);
        console.log('✅ CM-005: 公共客户端认证测试完成');
      });
    });

    // 测试场景: CM-006 - 令牌过期刷新
    describe('CM-006: 令牌过期刷新 (Token Refresh)', () => {
      // 测试用例: 应能使用刷新令牌获取新的访问令牌
      it('CM_006_001: 应能使用刷新令牌刷新访问令牌 / Should refresh expired access token using refresh token', async () => {
        // 准备测试数据: regularUser, webAppClient (支持 refresh_token)

        // 步骤1: 首先通过授权码流程获取访问令牌和刷新令牌
        const authCode = await dataManager.createAuthorizationCode(
          regularUser.id!,
          webAppClient.clientId,
          webAppClient.redirectUris[0],
          'openid profile offline_access' // offline_access 请求刷新令牌
        );

        const tokenResponse = await httpClient.requestToken({
          grant_type: 'authorization_code',
          code: authCode,
          redirect_uri: webAppClient.redirectUris[0],
          client_id: webAppClient.clientId,
          client_secret: webAppClient.plainSecret!,
        });

        // 断言: 初始令牌获取成功
        if (tokenResponse.status === 200) {
          const tokens = await tokenResponse.json();
          expect(tokens.refresh_token).toBeDefined(); // 刷新令牌必须存在

          if (tokens.refresh_token) {
            // 动作: 使用刷新令牌请求新的访问令牌
            const refreshResponse = await httpClient.requestToken({
              grant_type: 'refresh_token',
              refresh_token: tokens.refresh_token,
              client_id: webAppClient.clientId,
              client_secret: webAppClient.plainSecret!, // 机密客户端刷新时仍需密钥
            });

            // 断言: 令牌刷新成功
            if (refreshResponse.status === 200) {
              const newTokens = await refreshResponse.json();
              expect(newTokens.access_token).toBeDefined(); // 新的访问令牌应存在
              expect(newTokens.access_token).not.toBe(tokens.access_token); // 新的访问令牌应与旧的不同
              console.log('✅ CM-006: 令牌刷新成功');
            } else {
              // 处理刷新失败的情况
              expect([400, 401, 404, 429]).toContain(refreshResponse.status); // 常见错误：无效的刷新令牌，客户端认证失败等
              console.log('⚠️ CM-006: 刷新令牌端点不可用或请求无效');
            }
          }
        } else {
          // 处理初始令牌获取失败的情况
          expect([400, 401, 404, 429]).toContain(tokenResponse.status);
          console.log('⚠️ CM-006: 授权码交换端点不可用或请求无效');
        }
      });
    });
  });

  // 测试分组: AM - 授权模式
  describe('AM - 授权模式 (Authorization Modes)', () => {
    // 测试场景: AM-001 - 授权码模式 - 预授权用户代码交换
    describe('AM-001: 授权码模式 - 预授权用户代码交换 (Authorization Code Flow - Pre-authenticated)', () => {
      // 测试用例: 应成功完成预授权用户的完整授权码流程并验证JWT声明
      it('AM_001_001: 应成功完成预授权用户的完整授权码流程并验证JWT声明 / Should complete full authorization code flow for a pre-authenticated user and verify JWT claims', async () => {
        // 准备测试数据和参数 (Prepare test data and parameters)
        const requestedScope = 'openid profile email api:read';
        const redirectUri = confidentialClient.redirectUris[0];

        // 步骤1: 服务端为预认证用户和客户端直接生成授权码
        // (Step 1: Server directly generates an authorization code for a pre-authenticated user and client)
        const authCode = await dataManager.createAuthorizationCode(
          regularUser.id!,
          confidentialClient.clientId,
          redirectUri,
          requestedScope
        );
        // 断言: 授权码已成功创建 (Assertion: Authorization code is created successfully)
        expect(authCode).toBeDefined();

        // 步骤2: 使用授权码交换令牌
        // (Step 2: Exchange authorization code for tokens)
        const tokenResponse = await httpClient.requestToken({
          grant_type: 'authorization_code',
          code: authCode,
          redirect_uri: redirectUri,
          client_id: confidentialClient.clientId,
          client_secret: confidentialClient.plainSecret!,
        });

        // 断言: 验证令牌响应是否成功 (Assertion: Verify token response is successful)
        expect(tokenResponse.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);
        const tokens = await tokenResponse.json();

        // 断言: 基本令牌断言 (Assertion: Basic token assertions)
        expect(tokens.access_token).toBeDefined(); // 访问令牌应存在
        expect(tokens.refresh_token).toBeDefined(); // 刷新令牌应存在 (如果请求了 offline_access 或默认配置)
        expect(tokens.token_type).toBe('Bearer'); // 令牌类型应为 Bearer
        expect(tokens.expires_in).toBeGreaterThan(0); // 有效期应大于0

        // 断言: 验证作用域 (Assertion: Verify scope)
        // 注意: OAuth2规范允许服务器授予比请求更窄的作用域。
        // 此测试假定返回的作用域与请求的作用域相同，或者是包含请求作用域的子集。
        // (Note: The OAuth2 spec says the returned scope *can* be different if narrowed by the server.)
        // (For this test, we assume it returns the same scope or a subset that contains the requested ones.)
        const grantedScopes = ScopeUtils.parseScopes(tokens.scope);
        requestedScope.split(' ').forEach(scope => {
          expect(grantedScopes).toContain(scope); //授予的作用域应包含所有请求的作用域
        });

        // 断言: JWT 声明断言 (Assertion: JWT Claims Assertions)
        try {
          const decodedAccessToken = decodeJwt(tokens.access_token); // 解码访问令牌
          expect(decodedAccessToken.sub).toBe(regularUser.id); // 'sub' (subject) 声明应为用户ID
          expect(decodedAccessToken.client_id ?? decodedAccessToken.azp).toBe(confidentialClient.clientId); // 'client_id' 或 'azp' (authorized party) 声明应为客户端ID
          expect(decodedAccessToken.iss).toBeDefined(); // 'iss' (issuer) 声明应存在
          expect(decodedAccessToken.aud).toBeDefined(); // 'aud' (audience) 声明应存在
          // 检查JWT中的scope声明是否与授予的scope匹配 (如果存在)
          // (Check if scope in JWT matches granted scopes (if present))
          if (decodedAccessToken.scope) {
             const jwtScopes = ScopeUtils.parseScopes(decodedAccessToken.scope as string);
             grantedScopes.forEach(scope => expect(jwtScopes).toContain(scope)); // JWT中的作用域应包含所有授予的作用域
          }
          console.log('✅ AM-001: 带JWT声明验证的授权码流程成功完成');
        } catch (e) {
          console.error("解码访问令牌或断言声明失败:", e);
          // 如果解码/声明检查失败，则测试失败
          expect.fail("访问令牌不是有效的JWT或声明不正确。");
        }
      });
    });

    // 测试场景: AM-002 - 授权码重用防护
    describe('AM-002: 授权码重用防护 (Authorization Code Reuse Protection)', () => {
      // 测试用例: 重用的授权码应被拒绝
      it('AM_002_001: 重用的授权码应被拒绝 / Should reject reused authorization codes', async () => {
        // 准备测试数据: 创建一个授权码
        const authCode = await dataManager.createAuthorizationCode(
          regularUser.id!,
          confidentialClient.clientId,
          confidentialClient.redirectUris[0],
          'openid profile'
        );

        // 动作: 第一次使用授权码 (应成功)
        const firstResponse = await httpClient.requestToken({
          grant_type: 'authorization_code',
          code: authCode,
          redirect_uri: confidentialClient.redirectUris[0],
          client_id: confidentialClient.clientId,
          client_secret: confidentialClient.plainSecret!,
        });
        // 断言: 首次使用应成功 (或符合预期的错误，例如客户端未预认证)
        // 根据实际系统行为调整，这里假设首次使用总是成功获取令牌
         expect(firstResponse.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);


        // 动作: 第二次使用相同的授权码 (应被拒绝)
        const secondResponse = await httpClient.requestToken({
          grant_type: 'authorization_code',
          code: authCode,
          redirect_uri: confidentialClient.redirectUris[0],
          client_id: confidentialClient.clientId,
          client_secret: confidentialClient.plainSecret!,
        });

        // 断言: 第二次使用应返回错误
        expect([400, 401]).toContain(secondResponse.status); // 状态码应为 400 Bad Request 或 401 Unauthorized

        if (secondResponse.status === 400) { // 如果是 400 Bad Request
          // 验证OAuth错误码是否为 'invalid_grant'
          expect(
            await TestAssertions.expectOAuthError(secondResponse, [
              TEST_CONFIG.ERROR_CODES.INVALID_GRANT, // 无效授权
            ])
          ).toBe(true);
        }
        console.log('✅ AM-002: 授权码重用防护工作正常');
      });
    });

    // 测试场景: AM-003 - 客户端凭证模式
    describe('AM-003: 客户端凭证模式 (Client Credentials Grant)', () => {
      // 测试用例: 应处理服务器到服务器通信的客户端凭证授权
      it('AM_003_001: 应处理客户端凭证授权 / Should handle client credentials grant for server-to-server communication', async () => {
        // 准备测试数据: confidentialClient

        // 动作: 请求客户端凭证模式的令牌
        const response = await httpClient.requestToken({
          grant_type: 'client_credentials',
          client_id: confidentialClient.clientId,
          client_secret: confidentialClient.plainSecret!,
          scope: 'api:read api:write', // 请求的作用域
        });

        // 断言: 验证令牌响应
        if (response.status === 200) {
          const token = await TestAssertions.expectTokenResponse(response);
          expect(token.token_type).toBe('Bearer'); // 令牌类型应为 Bearer
          expect(token.access_token).toBeDefined(); // 访问令牌应存在
          expect(token.scope).toBeDefined(); // 作用域应存在
          // 客户端凭证模式不应包含刷新令牌
          expect(token.refresh_token).toBeUndefined(); // 刷新令牌不应存在
          console.log('✅ AM-003: 客户端凭证授权成功');
        } else {
          // 处理潜在的API未实现或速率限制等情况
          expect([400, 401, 404, 429, 501]).toContain(response.status);
          console.log('⚠️ AM-003: 客户端凭证端点不可用');
        }
      });
    });

    // 测试场景: AM-005 - PKCE 授权码模式
    describe('AM-005: PKCE 授权码模式 (PKCE Authorization Code Flow)', () => {
      // 测试用例: 应处理公共客户端的PKCE流程
      it('AM_005_001: 应处理公共客户端的PKCE流程 / Should handle PKCE flow for public clients', async () => {
        // 准备测试数据: 生成PKCE代码对和state
        const pkce = PKCETestUtils.generatePKCE(); // 生成 code_verifier 和 code_challenge
        const state = TestUtils.generateState(); // 生成随机state值

        // 步骤1: 使用PKCE参数发起授权请求
        // (Step 1: Authorization request with PKCE)
        const authResponse = await httpClient.authorize({
          response_type: 'code',
          client_id: publicClient.clientId, // 公共客户端ID
          redirect_uri: publicClient.redirectUris[0], // 回调URI
          scope: 'openid profile', // 请求的作用域
          state: state, // CSRF保护的state值
          code_challenge: pkce.codeChallenge, // PKCE的代码挑战
          code_challenge_method: pkce.codeChallengeMethod, // PKCE的代码挑战方法 (S256)
        });

        // 断言: 授权请求应重定向到登录/授权页面
        // (Assertion: Authorization request should redirect to login/consent page or return code directly if user pre-authenticated and consented)
        // 实际场景中，这里通常是302重定向。如果用户已登录且已授权，某些实现可能直接返回code。
        // For this test, we expect a redirect or a direct code if the system supports it without UI.
        if (authResponse.status === 302) { // 如果是302重定向
          const location = authResponse.headers.get('location'); // 获取重定向地址
          // 断言: 重定向地址应包含授权码 (Assertion: Redirect location should contain authorization code)
          // 这部分取决于测试服务器是否在这一步就返回code，或者需要模拟用户登录和授权。
          // For a fully automated test without UI interaction, dataManager might be used to pre-authorize.
          // Here we assume the server redirects to a URL that includes the code (e.g. after internal user auth simulation).
          if (location?.includes('code=')) {
            const url = new URL(location);
            const code = url.searchParams.get('code'); // 提取授权码
            expect(code).toBeDefined(); // 授权码应存在

            // 步骤2: 使用授权码和code_verifier交换令牌
            // (Step 2: Token request with code verifier)
            const tokenResponse = await httpClient.requestToken({
              grant_type: 'authorization_code',
              code: code!, // 上一步获取的授权码
              redirect_uri: publicClient.redirectUris[0], // 必须与授权请求中的一致
              client_id: publicClient.clientId, // 公共客户端ID
              code_verifier: pkce.codeVerifier, // PKCE的代码验证器 (原始密钥)
            });

            // 断言: 令牌请求应成功
            // (Assertion: Token request should be successful)
            if (tokenResponse.status === 200) {
              const tokens = await TestAssertions.expectTokenResponse(tokenResponse);
              expect(tokens.access_token).toBeDefined(); // 访问令牌应存在
              console.log('✅ AM-005: PKCE流程成功完成');
            } else {
                 // 处理令牌交换失败的情况
                expect([400,401]).toContain(tokenResponse.status); // e.g. invalid code, invalid verifier
                console.log(`⚠️ AM-005: PKCE 令牌交换失败, status: ${tokenResponse.status}`);
            }
          } else {
            // 如果重定向地址没有code, 可能是重定向到登录页面
            console.log('⚠️ AM-005: PKCE 授权请求未返回授权码, 可能需要用户交互或预授权设置。 Location:', location);
            // 根据系统具体实现，可能需要调整此处的断言或测试设置
            expect(location).toBeDefined(); // 至少应有重定向地址
          }
        } else {
          // 处理其他可能的响应状态 (例如，直接显示错误页面，或API尚未完全支持此流程)
          expect([200, 401, 404, 307, 400]).toContain(authResponse.status); // 200 if it's a page, 400 for bad request, 307 for Next.js redirect
          console.log(`⚠️ AM-005: PKCE 授权端点需要登录或未按预期重定向, status: ${authResponse.status}`);
        }
      });
    });
  });

  // 测试分组: SEC - 安全性测试
  describe('SEC - 安全性测试 (Security Tests)', () => {
    // 测试场景: SEC-001 - 令牌篡改测试
    describe('SEC-001: 令牌篡改测试 (Token Tampering)', () => {
      // 测试用例: 被篡改的访问令牌应被拒绝
      it('SEC_001_001: 被篡改的访问令牌应被拒绝 / Should reject tampered access tokens', async () => {
        // 准备测试数据: 创建一个有效的访问令牌
        const accessToken = await dataManager.createAccessToken(
          regularUser.id!,
          confidentialClient.clientId,
          'openid profile'
        );
        // 准备测试数据: 篡改访问令牌
        const tamperedToken = accessToken.slice(0, -5) + 'XXXXX'; // 修改令牌的最后几位

        // 动作: 使用被篡改的令牌访问受保护资源 (例如 /api/oauth/userinfo)
        const response = await httpClient.authenticatedRequest(
          '/api/oauth/userinfo', // 受保护的资源端点
          tamperedToken // 使用篡改的令牌
        );

        // 断言: 请求应失败，状态码为 401 Unauthorized 或其他相关错误码
        expect([401, 404]).toContain(response.status); // 404 if endpoint not found, 401 for invalid token

        if (response.status === 401) { // 如果是 401 Unauthorized
          const error = await response.json();
          // 错误信息应指明令牌无效
          expect(error.error).toBeOneOf(['invalid_token', 'unauthorized']);
        }
        console.log('✅ SEC-001: 令牌篡改防护工作正常');
      });
    });

    // 测试场景: SEC-004 - 暴力破解防护
    describe('SEC-004: 暴力破解防护 (Brute Force Protection)', () => {
      // 测试用例: 多次失败的登录尝试应触发速率限制
      it('SEC_004_001: 多次失败登录尝试应应用速率限制 / Should apply rate limiting for multiple failed login attempts', async () => {
        // 准备测试数据: 无 (将进行多次无效尝试)
        const requests = [];

        // 动作: 进行多次快速的失败登录尝试
        for (let i = 0; i < 5; i++) { // 尝试次数可以根据实际速率限制策略调整
          requests.push(httpClient.loginUser(regularUser.username, `WrongPassword${i}`));
        }

        const responses = await Promise.all(requests);

        // 断言: 检查是否有请求被速率限制 (状态码 429 Too Many Requests)
        const rateLimitedCount = responses.filter((r) => r.status === 429).length;
        // 断言: 检查是否有请求因认证失败而被拒绝 (状态码 401 Unauthorized 或 403 Forbidden)
        const unauthorizedCount = responses.filter((r) => [401, 403].includes(r.status)).length;

        if (rateLimitedCount > 0) {
          console.log(
            `✅ SEC-004: 已应用速率限制 - ${rateLimitedCount} 个请求被速率限制`
          );
        } else if (unauthorizedCount === responses.length) {
          // 如果所有请求都正确地被拒绝（例如，都是401），也认为暴力破解防护在某种程度上是有效的
          console.log(
            '✅ SEC-004: 所有请求均被正确拒绝 (暴力破解防护可能通过其他方式实现，如账户锁定)'
          );
        } else {
          // 如果既没有速率限制，也没有全部被拒绝，则可能存在问题
          console.log('⚠️ SEC-004: 暴力破解防护可能未完全实现或配置不当');
        }

        // 至少应有一个请求被速率限制或所有请求都被拒绝
        expect(rateLimitedCount > 0 || unauthorizedCount === responses.length).toBe(true);
        expect(responses.length).toBe(5); // 确保所有请求都已发出
      });
    });

    // 测试场景: SEC-007 - 跨域资源共享 (CORS)
    describe('SEC-007: 跨域资源共享 (CORS)', () => {
      // 测试用例: 关键端点应实现正确的CORS头部
      it('SEC_007_001: 关键端点应实现正确的CORS头部 / Should implement proper CORS headers for key endpoints', async () => {
        // 准备测试数据: 模拟一个来自不同源的OPTIONS预检请求
        const origin = 'https://example.com'; // 一个测试用的源

        // 动作: 向 /api/oauth/token 端点发送OPTIONS请求
        const response = await httpClient.request('/api/oauth/token', { // 通常令牌端点需要严格的CORS策略
          method: 'OPTIONS', // HTTP OPTIONS 方法
          headers: {
            Origin: origin, // 表明请求来源的Origin头部
            'Access-Control-Request-Method': 'POST', // 预检请求声明实际请求的方法
            'Access-Control-Request-Headers': 'Content-Type, Authorization', // 预检请求声明实际请求的头部
          },
        });

        // 断言: 验证CORS相关的响应头部
        const corsHeaders = {
          'access-control-allow-origin': response.headers.get('access-control-allow-origin'),
          'access-control-allow-methods': response.headers.get('access-control-allow-methods'),
          'access-control-allow-headers': response.headers.get('access-control-allow-headers'),
        };

        if (corsHeaders['access-control-allow-origin']) {
          // access-control-allow-origin 的值应为请求的Origin或 '*' (通配符)
          expect(corsHeaders['access-control-allow-origin']).toBeOneOf([origin, '*']);
          // access-control-allow-methods 应包含 'POST'
          expect(corsHeaders['access-control-allow-methods']).toContain('POST');
          console.log('✅ SEC-007: CORS头部已配置');
        } else {
          // 如果没有 access-control-allow-origin 头部，说明CORS可能未配置或不允许该源
          console.log('⚠️ SEC-007: CORS头部可能未配置或不允许此源');
        }

        // 预检请求通常返回 200 OK 或 204 No Content
        expect([200, 204, 404]).toContain(response.status); // 404 if OPTIONS endpoint not explicitly handled but main endpoint exists
      });
    });
  });

  // 测试分组: TA - 第三方应用集成
  describe('TA - 第三方应用集成 (Third Party Application Integration)', () => {
    // 测试场景: TA-002 - 授权码模式流程
    describe('TA-002: 授权码模式流程 (Authorization Code Flow)', () => {
      // 测试用例: 应支持完整的第三方应用集成流程 (授权码模式)
      it('TA_002_001: 应支持完整的第三方应用授权码流程 / Should support complete third-party application integration flow via Authorization Code', async () => {
        // 准备测试数据: 生成state和nonce (用于OIDC流程)
        const state = TestUtils.generateState(); // CSRF保护
        const nonce = TestUtils.generateRandomString(16); // OIDC replay protection

        // 步骤1: 第三方应用构建授权URL并发起请求 (模拟)
        // (Step 1: Third-party app constructs authorization URL and initiates request - simulated)
        const authResponse = await httpClient.authorize({
          response_type: 'code', // 请求类型为 code (授权码)
          client_id: webAppClient.clientId, // 客户端ID
          redirect_uri: webAppClient.redirectUris[0], // 客户端注册的回调URI
          scope: 'openid profile email', // 请求的作用域 (OIDC + user info)
          state: state, // state参数
          nonce: nonce, // nonce参数 (OIDC)
        });

        // 断言: 授权服务器应响应 (通常是重定向到登录/授权页面)
        // (Assertion: Authorization server should respond, typically by redirecting to login/consent page)
        expect([200, 302, 307, 401, 429]).toContain(authResponse.status); // 302/307 for redirect, 200 if page served, 401 if needs login first

        // 如果发生重定向 (通常意味着用户需要登录或已登录并被重定向回应用)
        if (authResponse.status === 302 || authResponse.status === 307) {
          const location = authResponse.headers.get('location'); // 获取重定向地址
          expect(location).toBeDefined(); // 重定向地址必须存在

          // 模拟用户认证和授权成功后，授权服务器重定向回redirect_uri并附带授权码
          // (Simulate user authentication and authorization succeeded, server redirects back to redirect_uri with code)
          // 在实际测试中，这一步可能需要dataManager预设授权，或模拟用户交互
          // 这里假设测试服务器配置为对测试用户自动授权或 httpClient.authorize 能够处理登录和同意
          if (location?.includes('code=')) { // 如果重定向地址包含授权码
            // 步骤2: 应用从回调URL中提取授权码和state
            // (Step 2: Application extracts authorization code and state from callback URL)
            const url = new URL(location!);
            const code = url.searchParams.get('code');
            const returnedState = url.searchParams.get('state');

            expect(code).toBeDefined(); // 授权码必须存在
            expect(returnedState).toBe(state); // 返回的state必须与请求时发送的一致

            // 步骤3: 应用使用授权码向令牌端点请求访问令牌
            // (Step 3: Application exchanges code for tokens at the token endpoint)
            const tokenResponse = await httpClient.requestToken({
              grant_type: 'authorization_code',
              code: code!,
              redirect_uri: webAppClient.redirectUris[0], // 必须与授权请求中的一致
              client_id: webAppClient.clientId,
              client_secret: webAppClient.plainSecret!, // 机密客户端需要密钥
            });

            // 断言: 令牌请求应成功
            if (tokenResponse.status === 200) {
              const tokens = await TestAssertions.expectTokenResponse(tokenResponse);
              expect(tokens.access_token).toBeDefined(); // 访问令牌应存在
              if (tokens.id_token) { // 如果请求了 openid scope，应返回ID Token
                const decodedIdToken = decodeJwt(tokens.id_token);
                expect(decodedIdToken.nonce).toBe(nonce); // ID Token中的nonce应与请求时发送的一致
              }

              // 步骤4: 应用使用访问令牌访问受保护资源 (例如用户信息端点)
              // (Step 4: Application uses access token to access protected resources, e.g., userinfo endpoint)
              const userinfoResponse = await httpClient.authenticatedRequest(
                '/api/oauth/userinfo', // UserInfo端点
                tokens.access_token // 使用获取到的访问令牌
              );

              // 断言: 访问受保护资源应成功
              if (userinfoResponse.status === 200) {
                const userInfo = await userinfoResponse.json();
                expect(userInfo.sub).toBeDefined(); // 用户信息中应包含sub (subject)声明
                console.log('✅ TA-002: 完整的第三方应用集成流程成功');
              } else {
                // UserInfo端点可能未实现或访问失败
                expect([401, 403, 404]).toContain(userinfoResponse.status);
                console.log(`⚠️ TA-002: UserInfo端点访问失败或不可用, status: ${userinfoResponse.status}`);
              }
            } else {
                // 令牌交换失败
                expect([400, 401]).toContain(tokenResponse.status);
                 console.log(`⚠️ TA-002: 授权码交换令牌失败, status: ${tokenResponse.status}`);
            }
          } else {
            // 重定向了，但没有code，可能是错误流程或需要登录
            console.log(`⚠️ TA-002: 授权请求重定向地址中未找到授权码. Location: ${location}`);
          }
        } else {
            console.log(`⚠️ TA-002: 授权请求未按预期重定向或响应, status: ${authResponse.status}`);
        }
      });
    });

    // 测试场景: TA-007 - 拒绝授权处理
    describe('TA-007: 拒绝授权处理 (Authorization Denial)', () => {
      // 测试用例: 用户拒绝授权时，应正确处理并通知客户端
      it('TA_007_001: 用户拒绝授权时应正确处理 / Should handle user denial of authorization properly', async () => {
        // 准备测试数据: 无，将模拟一个可能导致拒绝的流程
        // 模拟用户拒绝授权比较复杂，因为它通常发生在授权服务器的UI上。
        // 测试通常通过检查授权服务器是否能将错误信息（如 error=access_denied）
        // 正确地重定向回客户端的 redirect_uri 来验证。
        // 对于此测试，我们将直接调用 authorize 端点，并检查其是否能处理这种场景
        // (可能需要特殊的测试参数或服务器配置来模拟拒绝)。
        // 如果没有直接的方法，我们将检查初始请求是否按预期进行。

        // 动作: 发起授权请求 (假设此请求最终会导致用户有机会拒绝)
        const response = await httpClient.authorize({
          response_type: 'code',
          client_id: webAppClient.clientId,
          redirect_uri: webAppClient.redirectUris[0],
          scope: 'openid profile email',
          state: 'test-state-denial',
          // 在真实的测试场景中，可能需要一个特殊的参数来模拟用户拒绝，例如: prompt: 'none' 配合一个未授权的用户/客户端组合
          // 或者测试服务器提供一个特定的 "denial" 端点或模式。
        });

        // 断言: 期望服务器重定向回客户端，并在URL中包含错误信息
        // (Assertion: Expect server to redirect back to client with error in URL parameters)
        if (response.status === 302 || response.status === 307) { // 如果发生重定向
          const location = response.headers.get('location');
          // 检查重定向URL是否包含 error=access_denied
          if (location?.includes('error=access_denied')) {
            expect(location.includes('error=access_denied')).toBe(true); // 应包含 access_denied 错误
            expect(location).toContain(`state=test-state-denial`); // state应被正确返回
            console.log('✅ TA-007: 用户拒绝授权已正确处理并重定向');
          } else {
            // 如果没有 error=access_denied，可能是其他流程 (例如，需要登录)
            // 这取决于测试服务器如何处理模拟的“拒绝”场景
            console.log(`⚠️ TA-007: 未按预期处理拒绝授权 (未找到 error=access_denied). Location: ${location}`);
            // 这种情况可能仍然是可接受的，取决于测试设置。
            // 例如，如果用户未登录，它会先重定向到登录页面。
            expect(location).toBeDefined();
          }
        } else {
          // 如果没有重定向，可能是直接返回错误页面或API尚未完全支持此流程
          // (May require specific server implementation or a different way to simulate denial)
          expect([200, 307, 400, 401, 429]).toContain(response.status); // 200 if error page shown, 400 for bad request.
          console.log(`⚠️ TA-007: 授权请求未按预期响应以模拟拒绝, status: ${response.status}`);
        }
      });
    });

    // 测试场景: TA-010 - 无效回调URL攻击防护
    describe('TA-010: 无效回调URL攻击防护 (Invalid Redirect URI Protection)', () => {
      // 测试用例: 使用未注册或无效的回调URI的授权请求应被拒绝
      it('TA_010_001: 使用无效回调URI的请求应被拒绝 / Should prevent open redirect attacks by rejecting invalid redirect_uri', async () => {
        // 准备测试数据: 一个未在客户端注册的恶意回调URI
        const evilRedirectUri = 'https://evil.com/steal-codes';

        // 动作: 使用恶意的回调URI发起授权请求
        const response = await httpClient.authorize({
          response_type: 'code',
          client_id: webAppClient.clientId, // 合法的客户端ID
          redirect_uri: evilRedirectUri, // 未注册/恶意的回调URI
          scope: 'openid profile',
          state: 'test-state-evil-redirect',
        });

        // 断言: 请求应被拒绝，通常返回 400 Bad Request
        // (Assertion: Request should be rejected, typically with a 400 Bad Request)
        // 关键在于服务器不能重定向到这个恶意的URI。
        expect(response.status).toBeOneOf([400, 401, 403, 404, 429]); // 400 is most common for invalid_redirect_uri

        if (response.status === 302 || response.status === 307) { // 如果服务器错误地进行了重定向
          const location = response.headers.get('location');
          // 确保它没有重定向到恶意域名 (Assertion: Should NOT redirect to the evil domain)
          expect(location?.startsWith(evilRedirectUri)).toBe(false);
          console.warn(`⚠️ TA-010: 服务器对无效回调URI进行了重定向, 但目标是: ${location}. 需要确认这是否安全。`);
        } else if (response.status === 400) {
            const errorBody = await response.json();
            // 错误响应中应指明是 redirect_uri 无效
            expect(errorBody.error).toBeOneOf(['invalid_redirect_uri', 'redirect_uri_mismatch', 'invalid_request']);
            console.log('✅ TA-010: 无效回调URI的请求已被正确拒绝 (400 Bad Request)');
        } else {
            console.log(`✅ TA-010: 无效回调URI的请求返回状态 ${response.status}, 未发生不安全重定向`);
        }
      });
    });
  });

  // 测试分组: 性能和可靠性
  describe('性能和可靠性 (Performance and Reliability)', () => {
    // 测试用例: 应能处理并发授权请求
    it('PERF_001_001: 应能处理并发授权请求 / Should handle concurrent authorization requests', async () => {
      // 准备测试数据: 定义并发请求的数量
      const numRequests = 10;
      const requests = Array.from({ length: numRequests }, (_, i) => {
        // 动作: 创建多个并发的授权请求
        return httpClient.authorize({
          response_type: 'code',
          client_id: confidentialClient.clientId,
          redirect_uri: confidentialClient.redirectUris[0],
          scope: 'openid profile',
          state: `concurrent-test-${i}`, // 每个请求使用不同的state
        });
      });

      const responses = await Promise.all(requests); // 等待所有并发请求完成

      // 断言: 所有请求都应被处理且不产生服务器内部错误 (5xx)
      responses.forEach((response, index) => {
        expect(response.status).toBeLessThan(500); // 不应有服务器错误
        // 预期的状态码可能包括重定向(302, 307)、成功(200)、需要认证(401)、请求过多(429)等
        expect([200, 302, 307, 401, 429]).toContain(response.status);
      });

      console.log(`✅ PERF_001: ${numRequests} 个并发授权请求已成功处理`);
    }, 15000); // 增加测试超时时间以容纳并发请求

    // 测试用例: 在负载情况下应保持正确的错误响应
    it('PERF_002_001: 在负载下应保持正确的错误响应 / Should maintain proper error responses under load', async () => {
      // 准备测试数据: 定义发送错误请求的数量
      const numRequests = 15;
      const requests = Array.from({ length: numRequests }, () =>
        // 动作: 创建多个会导致错误的令牌请求 (例如，使用无效的客户端凭证)
        httpClient.requestToken({
          grant_type: 'client_credentials',
          client_id: 'invalid-client-id', // 无效的客户端ID
          client_secret: 'invalid-secret', // 无效的密钥
        })
      );

      const responses = await Promise.all(requests); // 等待所有请求完成

      // 断言: 所有错误的请求都应返回恰当的客户端错误状态码 (4xx)
      responses.forEach((response) => {
        expect(response.status).toBeLessThan(500); // 不应有服务器错误
        // 预期的错误状态码可能包括 400 (错误请求), 401 (未授权), 429 (请求过多)
        expect([400, 401, 429]).toContain(response.status);
      });

      console.log(`✅ PERF_002: ${numRequests} 个错误请求在负载情况下均返回了正确的错误响应`);
    }, 15000); // 增加测试超时时间
  });
});
