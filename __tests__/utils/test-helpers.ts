import { PrismaClient } from '@prisma/client'; // Keep for type annotation in other classes if needed
import { prisma as db } from '@/lib/prisma'; // Import aliased prisma for direct use
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { addMinutes } from 'date-fns';

/**
 * 统一的OAuth测试工具类
 * Unified OAuth Test Utilities
 */

// Types for test entities
export interface TestUser {
  id?: string;
  username: string;
  email: string | null;
  password: string;
  firstName: string;
  lastName: string;
  role?: 'admin' | 'user';
  isActive: boolean;
  emailVerified: boolean;
  plainPassword?: string;
}

export interface TestClient {
  id?: string;
  clientId: string;
  clientSecret?: string | null;
  name: string;
  redirectUris: string[];
  grantTypes: string[];
  responseTypes: string[];
  scope: string[];
  isPublic: boolean;
  isActive: boolean;
  plainSecret?: string;
}

export interface TestScope {
  id?: string;
  name: string;
  description: string;
  isActive: boolean;
  isPublic: boolean;
}

export interface AuthorizeRequest {
  response_type: string;
  client_id: string;
  redirect_uri: string;
  scope: string;
  state?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  nonce?: string;
}

export interface TokenRequest {
  grant_type: string;
  client_id: string;
  client_secret?: string;
  code?: string;
  redirect_uri?: string;
  refresh_token?: string;
  username?: string;
  password?: string;
  scope?: string;
  code_verifier?: string;
}

// Predefined Test Users
export const TEST_USERS: { [key: string]: Partial<TestUser> } = {
  ADMIN: {
    username: 'test-admin',
    email: 'admin@test.com',
    password: 'AdminPassword123!',
    firstName: 'Test',
    lastName: 'Admin',
    role: 'admin',
    isActive: true,
    emailVerified: true,
  },
  REGULAR: {
    username: 'test-user',
    email: 'user@test.com',
    password: 'UserPassword123!',
    firstName: 'Test',
    lastName: 'User',
    role: 'user',
    isActive: true,
    emailVerified: true,
  },
  INACTIVE: {
    username: 'inactive-user',
    email: 'inactive@test.com',
    password: 'InactivePassword123!',
    firstName: 'Inactive',
    lastName: 'User',
    role: 'user',
    isActive: false,
    emailVerified: false,
  },
} as const;

// Predefined Test Clients
export const TEST_CLIENTS: { [key: string]: Partial<TestClient> } = {
  CONFIDENTIAL: {
    clientId: 'confidential-client',
    name: 'Confidential Web Application',
    redirectUris: ['https://app.example.com/callback'],
    grantTypes: ['authorization_code', 'refresh_token', 'client_credentials'],
    responseTypes: ['code'],
    scope: ['openid', 'profile', 'email', 'api:read', 'api:write'],
    isPublic: false,
    isActive: true,
  },
  PUBLIC: {
    clientId: 'public-spa-client',
    name: 'Public SPA Application',
    redirectUris: ['http://localhost:3000/callback'],
    grantTypes: ['authorization_code'],
    responseTypes: ['code'],
    scope: ['openid', 'profile', 'email'],
    isPublic: true,
    isActive: true,
  },
  WEB_APP: {
    clientId: 'web-app-client',
    name: 'Web Application Client',
    redirectUris: ['https://webapp.example.com/auth/callback'],
    grantTypes: ['authorization_code', 'refresh_token'],
    responseTypes: ['code'],
    scope: ['openid', 'profile', 'email', 'offline_access'],
    isPublic: false,
    isActive: true,
  },
  MOBILE: {
    clientId: 'mobile-app-client',
    name: 'Mobile Application',
    redirectUris: ['com.example.mobile://callback'],
    grantTypes: ['authorization_code', 'refresh_token'],
    responseTypes: ['code'],
    scope: ['openid', 'profile', 'email', 'offline_access'],
    isPublic: true,
    isActive: true,
  },
} as const;

// Constants
export const TEST_CONFIG = {
  PREFIX: 'oauth_test_',
  TIMEOUTS: {
    SHORT: 5000,
    MEDIUM: 10000,
    LONG: 15000,
  },
  RETRY: {
    MAX_ATTEMPTS: 3,
    DELAY_MS: 1000,
  },
  TOKEN_EXPIRES: {
    AUTHORIZATION_CODE: 10 * 60 * 1000, // 10 minutes
    ACCESS_TOKEN: 60 * 60 * 1000, // 1 hour
    REFRESH_TOKEN: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
  RATE_LIMIT: {
    MAX_REQUESTS: 10,
    WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  },
  HTTP_STATUS: {
    OK: 200,
    CREATED: 201,
    NO_CONTENT: 204,
    FOUND: 302,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    METHOD_NOT_ALLOWED: 405,
    CONFLICT: 409,
    UNPROCESSABLE_ENTITY: 422,
    TOO_MANY_REQUESTS: 429,
    INTERNAL_SERVER_ERROR: 500,
    NOT_IMPLEMENTED: 501,
    SERVICE_UNAVAILABLE: 503,
  },
  ERROR_CODES: {
    INVALID_REQUEST: 'invalid_request',
    INVALID_CLIENT: 'invalid_client',
    INVALID_GRANT: 'invalid_grant',
    UNAUTHORIZED_CLIENT: 'unauthorized_client',
    UNSUPPORTED_GRANT_TYPE: 'unsupported_grant_type',
    INVALID_SCOPE: 'invalid_scope',
    ACCESS_DENIED: 'access_denied',
    UNSUPPORTED_RESPONSE_TYPE: 'unsupported_response_type',
    SERVER_ERROR: 'server_error',
    TEMPORARILY_UNAVAILABLE: 'temporarily_unavailable',
    INVALID_TOKEN: 'invalid_token',
    INSUFFICIENT_SCOPE: 'insufficient_scope',
    INVALID_CREDENTIALS: 'invalid_credentials',
    RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded',
  },
} as const;

// Test Scopes
export const TEST_SCOPES = {
  OPENID: 'openid',
  PROFILE: 'profile',
  EMAIL: 'email',
  OFFLINE_ACCESS: 'offline_access',
  API_READ: 'api:read',
  API_WRITE: 'api:write',
  ADMIN: 'admin',
  USER: 'user',
} as const;

// Grant Types
export const GRANT_TYPES = {
  AUTHORIZATION_CODE: 'authorization_code',
  CLIENT_CREDENTIALS: 'client_credentials',
  REFRESH_TOKEN: 'refresh_token',
  PASSWORD: 'password',
  IMPLICIT: 'implicit',
} as const;

// Response Types
export const RESPONSE_TYPES = {
  CODE: 'code',
  TOKEN: 'token',
  ID_TOKEN: 'id_token',
} as const;

// Type exports
export type HttpStatusCode = (typeof TEST_CONFIG.HTTP_STATUS)[keyof typeof TEST_CONFIG.HTTP_STATUS];
export type OAuthErrorCode = (typeof TEST_CONFIG.ERROR_CODES)[keyof typeof TEST_CONFIG.ERROR_CODES];
export type TestScopeValue = (typeof TEST_SCOPES)[keyof typeof TEST_SCOPES];
export type GrantType = (typeof GRANT_TYPES)[keyof typeof GRANT_TYPES];
export type ResponseType = (typeof RESPONSE_TYPES)[keyof typeof RESPONSE_TYPES];

/**
 * 统一的HTTP请求工具 - 替代所有重复的makeRequest函数
 * Unified HTTP request utility - replaces all duplicate makeRequest functions
 */
export class TestHttpClient {
  public baseUrl: string;
  public basePath: string;

  constructor() {
    this.baseUrl = process.env.TEST_BASE_URL || 'http://localhost:3000';
    // 在测试环境中也需要使用basePath，因为Next.js开发服务器使用的是相同的配置
    this.basePath = process.env.NEXT_PUBLIC_BASE_PATH || '/datamgr_flow';
  }

  /**
   * 统一的HTTP请求方法（替代所有重复的makeRequest函数）
   * Unified HTTP request method (replaces all duplicate makeRequest functions)
   */
  async makeRequest(path: string, options: RequestInit = {}): Promise<Response> {
    const fullUrl = `${this.baseUrl}${this.basePath}${path}`;

    const defaultHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const response = await fetch(fullUrl, {
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers,
      },
    });

    // Rate limiting retry
    if (response.status === 429) {
      await this.sleep(1000);
      return fetch(fullUrl, {
        ...options,
        headers: {
          ...defaultHeaders,
          ...options.headers,
        },
      });
    }

    return response;
  }

  /**
   * 发送HTTP请求（保持向后兼容）
   */
  async request(path: string, options: RequestInit = {}): Promise<Response> {
    return this.makeRequest(path, options);
  }

  /**
   * 发送表单请求
   */
  async formRequest(
    path: string,
    data: Record<string, string>,
    options: RequestInit = {}
  ): Promise<Response> {
    const formData = new URLSearchParams();
    Object.entries(data).forEach(([key, value]) => {
      formData.append(key, value);
    });

    return this.makeRequest(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
      ...options,
    });
  }

  /**
   * 发送带认证头的请求
   */
  async authenticatedRequest(
    path: string,
    token: string,
    options: RequestInit = {}
  ): Promise<Response> {
    return this.makeRequest(path, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });
  }

  /**
   * 发送客户端认证请求
   */
  async clientAuthenticatedRequest(
    path: string,
    clientId: string,
    clientSecret: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    return this.makeRequest(path, {
      ...options,
      headers: {
        Authorization: `Basic ${credentials}`,
        ...options.headers,
      },
    });
  }

  /**
   * 用户登录
   */
  async loginUser(username: string, password: string): Promise<Response> {
    return this.makeRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  }

  /**
   * 注册用户
   */
  async registerUser(userData: Partial<TestUser>): Promise<Response> {
    return this.makeRequest('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  }

  /**
   * 发起授权请求
   */
  async authorize(request: AuthorizeRequest): Promise<Response> {
    const params = new URLSearchParams({
      client_id: request.client_id,
      redirect_uri: request.redirect_uri,
      response_type: request.response_type,
      scope: request.scope,
      ...(request.state && { state: request.state }),
      ...(request.code_challenge && { code_challenge: request.code_challenge }),
      ...(request.code_challenge_method && {
        code_challenge_method: request.code_challenge_method,
      }),
      ...(request.nonce && { nonce: request.nonce }),
    });

    return this.makeRequest(`/api/oauth/authorize?${params}`, {
      method: 'GET',
      redirect: 'manual',
    });
  }

  /**
   * 发起令牌请求
   */
  async requestToken(request: TokenRequest): Promise<Response> {
    const body = new URLSearchParams({
      grant_type: request.grant_type,
      client_id: request.client_id,
      ...(request.client_secret && { client_secret: request.client_secret }),
      ...(request.code && { code: request.code }),
      ...(request.redirect_uri && { redirect_uri: request.redirect_uri }),
      ...(request.refresh_token && { refresh_token: request.refresh_token }),
      ...(request.username && { username: request.username }),
      ...(request.password && { password: request.password }),
      ...(request.scope && { scope: request.scope }),
      ...(request.code_verifier && { code_verifier: request.code_verifier }),
    });

    return this.makeRequest('/api/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });
  }

  /**
   * 撤销令牌
   */
  async revokeToken(token: string, clientId: string, clientSecret?: string): Promise<Response> {
    const body = new URLSearchParams({
      token,
      client_id: clientId,
      ...(clientSecret && { client_secret: clientSecret }),
    });

    return this.makeRequest('/api/oauth/revoke', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });
  }

  /**
   * 获取用户信息
   */
  async getUserInfo(token: string): Promise<Response> {
    return this.authenticatedRequest('/api/oauth/userinfo', token);
  }

  /**
   * 获取OpenID配置
   */
  async getOpenIdConfiguration(): Promise<Response> {
    return this.makeRequest('/.well-known/openid-configuration');
  }

  /**
   * 注册客户端
   */
  async registerClient(clientData: Partial<TestClient>): Promise<Response> {
    const apiData = {
      name: clientData.name,
      redirectUris: Array.isArray(clientData.redirectUris)
        ? clientData.redirectUris.join(',')
        : clientData.redirectUris || '',
      jwksUri: '',
      grantTypes: clientData.grantTypes || ['authorization_code'],
      responseTypes: clientData.responseTypes || ['code'],
      scope: clientData.scope || ['openid', 'profile'],
      isPublic: clientData.isPublic || false,
    };

    return this.makeRequest('/api/clients/register', {
      method: 'POST',
      body: JSON.stringify(apiData),
    });
  }

  /**
   * 获取客户端信息
   */
  async getClient(clientId: string, authToken?: string): Promise<Response> {
    if (authToken) {
      return this.authenticatedRequest(`/api/clients/${clientId}`, authToken);
    }
    return this.makeRequest(`/api/clients/${clientId}`);
  }

  /**
   * 内省令牌
   */
  async introspectToken(token: string, clientId: string, clientSecret?: string): Promise<Response> {
    const body = new URLSearchParams({
      token,
      client_id: clientId,
      ...(clientSecret && { client_secret: clientSecret }),
    });

    return this.makeRequest('/api/oauth/introspect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });
  }

  /**
   * 设备授权流程
   */
  async deviceAuthorization(
    clientId: string,
    clientSecret?: string,
    scope?: string
  ): Promise<Response> {
    const body = new URLSearchParams({
      client_id: clientId,
      ...(clientSecret && { client_secret: clientSecret }),
      ...(scope && { scope }),
    });

    return this.makeRequest('/api/oauth/device_authorization', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });
  }

  /**
   * 获取服务器健康状态
   */
  async healthCheck(): Promise<Response> {
    return this.makeRequest('/api/health');
  }

  /**
   * 获取用户资源
   */
  async getUserProfile(token: string): Promise<Response> {
    return this.authenticatedRequest('/api/user/profile', token);
  }

  /**
   * 获取管理员资源
   */
  async getAdminUsers(token: string): Promise<Response> {
    return this.authenticatedRequest('/api/admin/users', token);
  }

  /**
   * 用户注销
   */
  async logout(token?: string): Promise<Response> {
    const options: RequestInit = {
      method: 'POST',
    };

    if (token) {
      options.headers = {
        Authorization: `Bearer ${token}`,
      };
    }

    return this.makeRequest('/api/auth/logout', options);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * 测试数据管理器
 */
export class TestDataManager {
  private prefix: string;
  private createdUsers: string[] = [];
  private createdClients: string[] = [];
  private createdTokens: string[] = [];
  private createdScopes: string[] = [];
  // PrismaClient is no longer stored as a property 'this.prisma'
  // Methods will use the aliased 'db' import directly.

  constructor(prefix: string = TEST_CONFIG.PREFIX) {
    this.prefix = prefix + Date.now() + '_';
  }

  /**
   * 创建预定义的测试用户
   */
  async createTestUser(userType: keyof typeof TEST_USERS): Promise<TestUser> {
    const userData = TEST_USERS[userType];
    if (!userData) {
      throw new Error(`Test user type '${userType}' not found in TEST_USERS`);
    }
    const user = await this.createUser(userData);
    return user;
  }

  /**
   * 创建预定义的测试客户端
   */
  async createTestClient(clientType: keyof typeof TEST_CLIENTS): Promise<TestClient> {
    const clientData = TEST_CLIENTS[clientType];
    if (!clientData) {
      throw new Error(`Test client type '${clientType}' not found in TEST_CLIENTS`);
    }
    const client = await this.createClient(clientData);
    return client;
  }

  /**
   * 创建测试用户
   */
  async createUser(userData: Partial<TestUser>): Promise<TestUser> {
    const username = `${this.prefix}${userData.username || 'user'}_${Date.now()}`;
    const email = userData.email
      ? `${this.prefix}${userData.email.replace('@', '_')}@test.com`
      : `${this.prefix}user_${Date.now()}@test.com`;
    const plainPassword = userData.password || 'TestPassword123!';
    // Using aliased 'db' import directly
    const user = await db.user.create({
      data: {
        username,
        email,
        passwordHash: await bcrypt.hash(plainPassword, 12), // Corrected: password -> passwordHash
        firstName: userData.firstName || 'Test',
        lastName: userData.lastName || 'User',
        // emailVerified: userData.emailVerified ?? true, // Removed: not in schema
        isActive: userData.isActive ?? true,
      },
    });

    this.createdUsers.push(user.id);

    return {
      id: user.id,
      username,
      email: user.email,
      password: user.password,
      firstName: user.firstName || 'Test',
      lastName: user.lastName || 'User',
      role: userData.role || 'user',
      isActive: user.isActive,
      emailVerified: user.emailVerified,
      plainPassword,
    };
  }

  /**
   * 创建测试客户端
   */
  async createClient(clientData: Partial<TestClient>): Promise<TestClient> {
    const clientId = `${this.prefix}${clientData.clientId || 'client'}_${Date.now()}`;
    const plainSecret =
      clientData.clientSecret || `secret_${crypto.randomBytes(16).toString('hex')}`;
    // Using aliased 'db' import directly
    const client = await db.oAuthClient.create({ // Corrected model name to oAuthClient
      data: {
        clientId,
        clientSecret: clientData.isPublic ? null : await bcrypt.hash(plainSecret, 12),
        clientName: clientData.name || 'Test Client', // Corrected: name -> clientName
        clientType: clientData.isPublic ? 'PUBLIC' : 'CONFIDENTIAL', // Correctly use clientType
        redirectUris: JSON.stringify(clientData.redirectUris || ['http://localhost:3000/callback']),
        grantTypes: JSON.stringify(
          clientData.grantTypes || ['authorization_code', 'refresh_token']
        ),
        responseTypes: JSON.stringify(clientData.responseTypes || ['code']),
        allowedScopes: JSON.stringify(clientData.scope || ['openid', 'profile']), // Prisma schema uses allowedScopes
        // isPublic field is not in Prisma schema, clientType is used instead
        isActive: clientData.isActive ?? true,
      },
    });

    this.createdClients.push(client.id);

    return {
      // Return type is TestClient, which might have isPublic and scope.
      // These should be derived from the actual prisma model's state.
      id: client.id,
      clientId: client.clientId,
      clientSecret: client.clientSecret,
      name: client.clientName || '', // Read from clientName for the return object
      redirectUris: JSON.parse(client.redirectUris || '[]'),
      grantTypes: JSON.parse(client.grantTypes || '[]'),
      responseTypes: JSON.parse(client.responseTypes || '[]'),
      scope: JSON.parse(client.allowedScopes || '[]'), // Derive from allowedScopes
      isPublic: client.clientType === 'PUBLIC',      // Derive from clientType
      isActive: client.isActive,
      plainSecret: clientData.isPublic ? undefined : plainSecret,
    };
  }

  /**
   * 创建测试作用域
   */
  async createScope(scopeData: Partial<TestScope>): Promise<TestScope> {
    const name = scopeData.name || `${this.prefix}scope`;
    // Using aliased 'db' import directly
    const scope = await db.scope.upsert({
      where: { name },
      update: {},
      create: {
        name,
        description: scopeData.description || 'Test scope',
        isActive: scopeData.isActive ?? true,
        isPublic: scopeData.isPublic ?? true,
      },
    });

    this.createdScopes.push(scope.id);
    return {
      id: scope.id,
      name: scope.name,
      description: scope.description || 'Test scope',
      isActive: scope.isActive,
      isPublic: scope.isPublic,
    };
  }

  /**
   * 创建访问令牌
   */
  async createAccessToken(
    userId: string,
    clientId: string,
    scope = 'openid profile'
  ): Promise<string> {
    // 导入JWTUtils
    const { JWTUtils } = await import('@/lib/auth/oauth2');
    // Using aliased 'db' import directly

    // 确保客户端存在，并获取其内部ID
    const client = await db.oAuthClient.findUnique({ // Corrected model name
      where: { clientId },
    });

    if (!client) {
      throw new Error(`Client with clientId ${clientId} not found. Cannot create access token.`);
    }

    // 确保用户存在
    const user = await db.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error(`User with ID ${userId} not found. Cannot create access token.`);
    }

    // 使用JWTUtils创建真正的JWT令牌
    const jwtToken = await JWTUtils.createAccessToken({
      client_id: clientId,
      user_id: userId,
      scope,
      permissions: [],
    });

    // 将JWT令牌保存到数据库
    const tokenHash = crypto.createHash('sha256').update(jwtToken).digest('hex');
    await db.accessToken.create({ // Using 'db'
      data: {
        token: jwtToken,
        tokenHash,
        clientId: client.id, // 使用客户端的内部ID，而不是clientId
        userId,
        scope,
        expiresAt: addMinutes(new Date(), 60),
      },
    });

    this.createdTokens.push(jwtToken);
    return jwtToken;
  }

  /**
   * 创建刷新令牌
   */
  async createRefreshToken(
    userId: string,
    clientId: string,
    scope = 'openid profile'
  ): Promise<string> {
    // 导入JWTUtils
    const { JWTUtils } = await import('@/lib/auth/oauth2');
    // Using aliased 'db' import directly

    // 获取客户端的内部ID
    const client = await db.oAuthClient.findUnique({ // Corrected model name
      where: { clientId },
    });

    if (!client) {
      throw new Error(`Client with clientId ${clientId} not found. Cannot create refresh token.`);
    }

    // 使用JWTUtils创建真正的JWT刷新令牌
    const jwtRefreshToken = await JWTUtils.createRefreshToken({
      client_id: clientId,
      user_id: userId,
      scope,
    });

    // 将JWT刷新令牌保存到数据库
    const tokenHash = crypto.createHash('sha256').update(jwtRefreshToken).digest('hex');
    await db.refreshToken.create({ // Using 'db'
      data: {
        token: jwtRefreshToken,
        tokenHash,
        clientId: client.id, // 使用客户端的内部ID
        userId,
        scope,
        expiresAt: addMinutes(new Date(), 7 * 24 * 60), // 7 days
      },
    });

    this.createdTokens.push(jwtRefreshToken);
    return jwtRefreshToken;
  }

  /**
   * 创建授权码
   */
  async createAuthorizationCode(
    userId: string,
    clientId: string,
    redirectUri: string,
    scope = 'openid profile',
    pkceData?: { codeChallenge: string; codeChallengeMethod: string }
  ): Promise<string> {
    const code = `test_code_${crypto.randomBytes(8).toString('hex')}`;
    // Using aliased 'db' import directly

    // 获取客户端的内部ID
    const client = await db.oAuthClient.findUnique({ // Corrected model name
      where: { clientId },
    });

    if (!client) {
      throw new Error(
        `Client with clientId ${clientId} not found. Cannot create authorization code.`
      );
    }

    await db.authorizationCode.create({ // Using 'db'
      data: {
        code,
        clientId: client.id, // 使用客户端的内部ID
        userId,
        redirectUri,
        scope,
        expiresAt: addMinutes(new Date(), 10),
        codeChallenge: pkceData?.codeChallenge,
        codeChallengeMethod: pkceData?.codeChallengeMethod,
      },
    });

    return code;
  }

  /**
   * 设置基础作用域
   */
  async setupBasicScopes(): Promise<void> {
    // Using aliased 'db' import directly
    if (!db.scope?.findMany || !db.scope?.create) { // check properties on 'db'
        console.warn("Prisma client (for scope setup) is not functional via module import. Skipping setupBasicScopes.");
        return;
    }
    // Only create scopes if they don't already exist to avoid conflicts
    const existingScopes = await db.scope.findMany({
      where: {
        name: {
          in: ['openid', 'profile', 'email', 'offline_access', 'api:read', 'api:write'],
        },
      },
    });

    const existingScopeNames = new Set(existingScopes.map((s) => s.name));

    const basicScopes = [
      { name: 'openid', description: 'OpenID Connect', isActive: true, isPublic: true },
      { name: 'profile', description: 'User profile', isActive: true, isPublic: true },
      { name: 'email', description: 'Email address', isActive: true, isPublic: true },
      { name: 'offline_access', description: 'Offline access', isActive: true, isPublic: true },
      { name: 'api:read', description: 'API read access', isActive: true, isPublic: false },
      { name: 'api:write', description: 'API write access', isActive: true, isPublic: false },
    ];

    for (const scopeData of basicScopes) {
      if (!existingScopeNames.has(scopeData.name)) {
        try {
          await db.scope.create({ // Using 'db'
            data: scopeData,
          });
        } catch (error: unknown) {
          // If scope already exists (race condition), ignore the error
          if (
            error &&
            typeof error === 'object' &&
            'code' in error &&
            error.code === 'P2002' &&
            'meta' in error &&
            error.meta &&
            typeof error.meta === 'object' &&
            'target' in error.meta &&
            Array.isArray(error.meta.target) &&
            error.meta.target.includes('name')
          ) {
            console.log(`Scope ${scopeData.name} already exists, skipping...`);
          } else {
            throw error;
          }
        }
      }
    }
  }

  /**
   * 清理测试数据
   */
  async cleanup(): Promise<void> {
    // Using aliased 'db' import directly
    if (!db.accessToken?.deleteMany) { // Check properties on 'db'
        console.error("Prisma client not functional via module import during cleanup. Skipping cleanup.");
        return;
    }
    try {
      // Delete tokens first (they have foreign key constraints)
      await db.accessToken
        .deleteMany({
          where: {
            OR: [
              { client: { clientId: { startsWith: this.prefix } } },
              { user: { username: { startsWith: this.prefix } } },
            ],
          },
        })
        .catch(() => {});

      await db.refreshToken
        .deleteMany({
          where: {
            OR: [
              { client: { clientId: { startsWith: this.prefix } } },
              { user: { username: { startsWith: this.prefix } } },
            ],
          },
        })
        .catch(() => {});

      await db.authorizationCode
        .deleteMany({
          where: {
            OR: [
              { client: { clientId: { startsWith: this.prefix } } },
              { user: { username: { startsWith: this.prefix } } },
            ],
          },
        })
        .catch(() => {});

      // Delete clients and users
      await db.oAuthClient // Corrected model name
        .deleteMany({
          where: { clientId: { startsWith: this.prefix } },
        })
        .catch(() => {});

      await db.user
        .deleteMany({
          where: { username: { startsWith: this.prefix } },
        })
        .catch(() => {});

      // Delete test scopes
      await db.scope
        .deleteMany({
          where: { name: { startsWith: this.prefix } },
        })
        .catch(() => {});

      // Clear tracking arrays
      this.createdUsers.length = 0;
      this.createdClients.length = 0;
      this.createdTokens.length = 0;
      this.createdScopes.length = 0;
    } catch (error) {
      console.error('Failed to cleanup test data:', error);
    }
  }

  /**
   * 完全清理数据库（危险操作，仅用于测试）
   * Complete database cleanup (dangerous operation, for testing only)
   */
  async clearDatabase(): Promise<void> {
    // Using aliased 'db' import directly
    if (!db.accessToken?.deleteMany) { // Check properties on 'db'
        console.error("Prisma client not functional via module import during clearDatabase. Skipping clearDatabase.");
        return;
    }
    try {
      // Delete all tokens first (they have foreign key constraints)
      await db.accessToken.deleteMany({}).catch(() => {});
      await db.refreshToken.deleteMany({}).catch(() => {});
      await db.authorizationCode.deleteMany({}).catch(() => {});

      // Delete user permissions (correct model name)
      await db.userResourcePermission.deleteMany({}).catch(() => {});

      // Delete audit logs and sessions
      await db.auditLog.deleteMany({}).catch(() => {});
      // UserSession model is deprecated/removed in favor of JWTs.
      // await db.userSession.deleteMany({}).catch(() => {})
      await db.consentGrant.deleteMany({}).catch(() => {});

      // Delete clients and users
      await db.oAuthClient.deleteMany({}).catch(() => {}); // Corrected model name
      await db.user.deleteMany({}).catch(() => {});

      // Delete resources, permissions and scopes
      await db.resource.deleteMany({}).catch(() => {});
      await db.permission.deleteMany({}).catch(() => {});
      await db.scope.deleteMany({}).catch(() => {});

      // Clear tracking arrays
      this.createdUsers.length = 0;
      this.createdClients.length = 0;
      this.createdTokens.length = 0;
      this.createdScopes.length = 0;

      console.log('✅ 数据库已完全清理 / Database completely cleared');
    } catch (error) {
      console.error('❌ 清理数据库失败 / Failed to clear database:', error);
      throw error;
    }
  }
}

/**
 * 测试断言工具
 */
export class TestAssertions {
  /**
   * 验证响应状态码
   */
  static expectStatus(response: Response, expectedStatuses: number | number[]): boolean {
    const statuses = Array.isArray(expectedStatuses) ? expectedStatuses : [expectedStatuses];

    if (statuses.includes(response.status)) {
      return true;
    }

    console.log(
      `⚠️ Unexpected response status: ${response.status}, expected one of: ${statuses.join(', ')}`
    );
    return false;
  }

  /**
   * 验证OAuth错误响应
   */
  static async expectOAuthError(
    response: Response,
    expectedErrors: string | string[]
  ): Promise<boolean> {
    const errors = Array.isArray(expectedErrors) ? expectedErrors : [expectedErrors];

    try {
      const data = await response.json();
      return errors.includes(data.error);
    } catch {
      return false;
    }
  }

  /**
   * 验证令牌响应
   */
  static async expectTokenResponse(response: Response): Promise<Record<string, unknown>> {
    const data = await response.json();

    if (!data.access_token) {
      throw new Error('Missing access_token in response');
    }

    return data;
  }

  /**
   * 验证有效的令牌响应格式
   */
  static assertValidTokens(tokens: Record<string, unknown>): void {
    if (!tokens.access_token) {
      throw new Error('Missing access_token in response');
    }

    if (!tokens.token_type || tokens.token_type !== 'Bearer') {
      throw new Error('Invalid token_type in response');
    }

    if (typeof tokens.expires_in !== 'number' || tokens.expires_in <= 0) {
      throw new Error('Invalid expires_in value in response');
    }
  }

  /**
   * 验证授权码响应
   */
  static expectAuthorizationResponse(response: Response): string | null {
    if (response.status !== 302) {
      return null;
    }

    const location = response.headers.get('location');
    if (!location) {
      return null;
    }

    const url = new URL(location);
    return url.searchParams.get('code');
  }

  /**
   * 验证错误响应
   */
  static async validateErrorResponse(response: Response, expectedError: string): Promise<boolean> {
    const data = await response.json();

    if (!data.error) {
      console.error('Missing error field in error response');
      return false;
    }

    if (data.error !== expectedError) {
      console.error(`Expected error ${expectedError}, got ${data.error}`);
      return false;
    }

    return true;
  }

  /**
   * 验证令牌响应格式
   */
  static async validateTokenResponse(response: Response): Promise<Record<string, unknown>> {
    if (response.status !== TEST_CONFIG.HTTP_STATUS.OK) {
      throw new Error(`Expected status 200, got ${response.status}`);
    }

    const data = await response.json();

    if (!data.access_token) {
      throw new Error('Missing access_token in response');
    }

    if (!data.token_type || data.token_type !== 'Bearer') {
      throw new Error('Invalid token_type in response');
    }

    return data;
  }
}

/**
 * PKCE工具
 */
export class PKCETestUtils {
  /**
   * 生成PKCE参数
   */
  static generatePKCE(): {
    codeVerifier: string;
    codeChallenge: string;
    codeChallengeMethod: string;
  } {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

    return {
      codeVerifier,
      codeChallenge,
      codeChallengeMethod: 'S256',
    };
  }

  /**
   * 生成JWT断言用于服务到服务认证
   */
  static async generateJWTAssertion(clientId: string): Promise<string> {
    // 简单的JWT断言生成（实际项目中应该使用适当的JWT库）
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        iss: clientId,
        sub: clientId,
        aud: 'http://localhost:3000/datamgr_flow/api/oauth/token',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
      })
    ).toString('base64url');

    // 简单的测试签名（生产环境应使用真实密钥）
    const signature = crypto
      .createHmac('sha256', 'test-secret')
      .update(`${header}.${payload}`)
      .digest('base64url');

    return `${header}.${payload}.${signature}`;
  }
}

/**
 * 通用测试工具函数
 */
export class TestUtils {
  /**
   * 等待指定时间
   */
  static sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 生成随机字符串
   */
  static generateRandomString(length = 10): string {
    return crypto.randomBytes(length).toString('hex').substring(0, length);
  }

  /**
   * 生成状态参数
   */
  static generateState(): string {
    return crypto.randomBytes(16).toString('base64url');
  }

  /**
   * 验证URL格式
   */
  static isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 设置测试环境
   */
  static setupTestEnv(): void {
    if (process.env.NODE_ENV !== 'test') {
      console.log('⚠️ Not running in test environment');
    }
  }

  /**
   * 并发执行请求
   */
  static async concurrentRequests<T>(requestFn: () => Promise<T>, count: number): Promise<T[]> {
    const requests = Array.from({ length: count }, () => requestFn());
    return Promise.all(requests);
  }

  /**
   * 重试执行
   */
  static async retry<T>(fn: () => Promise<T>, maxRetries = 3, delay = 1000): Promise<T> {
    let lastError: Error;

    for (let i = 0; i <= maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        if (i < maxRetries) {
          await this.sleep(delay);
          delay *= 2; // Exponential backoff
        }
      }
    }

    throw lastError!;
  }

  /**
   * 生成安全令牌
   */
  static generateSecureToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * 创建令牌哈希
   */
  static createTokenHash(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}

/**
 * OAuth2集成测试助手
 */
export class OAuth2TestHelper extends TestHttpClient {
  private dataManager: TestDataManager;
  private createdTestUsers: TestUser[] = [];
  private createdTestClients: TestClient[] = [];

  constructor(dataManager: TestDataManager) {
    super();
    this.dataManager = dataManager;
  }

  /**
   * 创建预定义的测试用户
   */
  async createTestUser(userType: keyof typeof TEST_USERS): Promise<TestUser> {
    const userData = TEST_USERS[userType];
    const user = await this.dataManager.createUser(userData);
    this.createdTestUsers.push(user);
    return user;
  }

  /**
   * 创建预定义的测试客户端
   */
  async createTestClient(clientType: keyof typeof TEST_CLIENTS): Promise<TestClient> {
    const clientData = TEST_CLIENTS[clientType];
    if (!clientData) {
      throw new Error(`Test client type '${clientType}' not found in TEST_CLIENTS`);
    }
    const client = await this.dataManager.createClient(clientData);
    this.createdTestClients.push(client);
    return client;
  }

  /**
   * 完整的授权码流程测试
   */
  async fullAuthorizationCodeFlow(
    user: TestUser,
    client: TestClient
  ): Promise<{
    authCode: string | null;
    accessToken: string | null;
    refreshToken: string | null;
  }> {
    // Step 1: 获取授权码
    const authResponse = await this.authorize({
      response_type: 'code',
      client_id: client.clientId,
      redirect_uri: client.redirectUris[0],
      scope: 'openid profile',
      state: TestUtils.generateState(),
    });

    const authCode = TestAssertions.expectAuthorizationResponse(authResponse);

    if (!authCode) {
      return { authCode: null, accessToken: null, refreshToken: null };
    }

    // Step 2: 交换令牌
    const tokenResponse = await this.requestToken({
      grant_type: 'authorization_code',
      code: authCode,
      redirect_uri: client.redirectUris[0],
      client_id: client.clientId,
      client_secret: client.plainSecret,
    });

    if (tokenResponse.status === 200) {
      const tokenData = await tokenResponse.json();
      return {
        authCode,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
      };
    }

    return { authCode, accessToken: null, refreshToken: null };
  }

  /**
   * 清理创建的测试数据
   */
  async cleanup(): Promise<void> {
    this.createdTestUsers.length = 0;
    this.createdTestClients.length = 0;
  }
}

/**
 * OAuth流程测试助手
 */
export class OAuthFlowTestHelper {
  constructor(private httpClient: TestHttpClient) {}

  /**
   * 测试授权码流程
   */
  async testAuthorizationCodeFlow(
    client: TestClient,
    user: TestUser
  ): Promise<{
    success: boolean;
    authCode?: string;
    accessToken?: string;
    refreshToken?: string;
    error?: string;
  }> {
    try {
      // 1. 授权请求
      const authResponse = await this.httpClient.authorize({
        response_type: 'code',
        client_id: client.clientId,
        redirect_uri: client.redirectUris[0],
        scope: 'openid profile',
        state: TestUtils.generateState(),
      });

      const authCode = TestAssertions.expectAuthorizationResponse(authResponse);
      if (!authCode) {
        return { success: false, error: 'Failed to get authorization code' };
      }

      // 2. 令牌请求
      const tokenResponse = await this.httpClient.requestToken({
        grant_type: 'authorization_code',
        code: authCode,
        redirect_uri: client.redirectUris[0],
        client_id: client.clientId,
        client_secret: client.plainSecret,
      });

      if (tokenResponse.status === 200) {
        const tokenData = await tokenResponse.json();
        return {
          success: true,
          authCode,
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
        };
      }

      return { success: false, error: `Token request failed: ${tokenResponse.status}` };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * 测试客户端凭证流程
   */
  async testClientCredentialsFlow(client: TestClient): Promise<{
    success: boolean;
    accessToken?: string;
    error?: string;
  }> {
    try {
      const tokenResponse = await this.httpClient.requestToken({
        grant_type: 'client_credentials',
        client_id: client.clientId,
        client_secret: client.plainSecret,
        scope: 'api:read',
      });

      if (tokenResponse.status === 200) {
        const tokenData = await tokenResponse.json();
        return {
          success: true,
          accessToken: tokenData.access_token,
        };
      }

      return {
        success: false,
        error: `Client credentials request failed: ${tokenResponse.status}`,
      };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * 测试刷新令牌流程
   */
  async testRefreshTokenFlow(
    client: TestClient,
    refreshToken: string
  ): Promise<{
    success: boolean;
    accessToken?: string;
    newRefreshToken?: string;
    error?: string;
  }> {
    try {
      const tokenResponse = await this.httpClient.requestToken({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: client.clientId,
        client_secret: client.plainSecret,
      });

      if (tokenResponse.status === 200) {
        const tokenData = await tokenResponse.json();
        return {
          success: true,
          accessToken: tokenData.access_token,
          newRefreshToken: tokenData.refresh_token,
        };
      }

      return { success: false, error: `Refresh token request failed: ${tokenResponse.status}` };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }
}

// Create instances for convenience
const defaultHttpClient = new TestHttpClient();

/**
 * 创建标准测试设置
 */
export function createTestSetup(testName: string) {
  const dataManager = new TestDataManager(`${testName}_`);

  return {
    dataManager,
    httpClient: defaultHttpClient,

    async setup() {
      TestUtils.setupTestEnv();
      await dataManager.setupBasicScopes();
      return dataManager;
    },

    async cleanup() {
      await dataManager.cleanup();
    },
  };
}

/**
 * 创建OAuth2集成测试设置
 */
export function createOAuth2TestSetup(testName: string) {
  const dataManager = new TestDataManager(`${testName}_`);
  const oauth2Helper = new OAuth2TestHelper(dataManager);

  return {
    dataManager,
    httpClient: defaultHttpClient,
    oauth2Helper,

    async setup() {
      TestUtils.setupTestEnv();
      await dataManager.setupBasicScopes();
      return { dataManager, oauth2Helper };
    },

    async cleanup() {
      await oauth2Helper.cleanup();
      await dataManager.cleanup();
    },
  };
}

// Default exports for convenience
export const httpClient = defaultHttpClient;
export const testAssertions = TestAssertions;
export const pkceUtils = PKCETestUtils;
export const testUtils = TestUtils;

// Aliases for backward compatibility
export const HTTP_STATUS = TEST_CONFIG.HTTP_STATUS;
export const ERROR_CODES = TEST_CONFIG.ERROR_CODES;
