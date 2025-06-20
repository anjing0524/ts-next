// __tests__/setup/test-helpers.ts
// 统一的测试辅助函数，基于Jest框架
// 连接真实Prisma数据库进行集成测试

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import * as jose from 'jose';
import crypto from 'crypto';

// ===== 测试数据库管理 =====

/**
 * 清理所有测试数据
 */
export async function cleanupTestData(): Promise<void> {
  // 按依赖关系顺序删除
  await prisma.tokenBlacklist.deleteMany();
  await prisma.accessToken.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.authorizationCode.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.oAuthClient.deleteMany();
  await prisma.user.deleteMany();
  await prisma.role.deleteMany();
  await prisma.permission.deleteMany();
  await prisma.scope.deleteMany();
}

/**
 * 初始化测试数据库
 */
export async function initTestDatabase(): Promise<void> {
  await cleanupTestData();
  await createTestPermissions();
  await createTestRoles();
  await createTestScopes();
}

// ===== 测试数据创建 =====

export interface TestUser {
  id: string;
  username: string;
  email: string;
  password: string;
  isActive: boolean;
}

export interface TestClient {
  id: string;
  clientId: string;
  clientSecret?: string;
  name: string;
  redirectUris: string[];
  allowedScopes: string[];
  grantTypes: string[];
  clientType: 'PUBLIC' | 'CONFIDENTIAL';
  requirePkce: boolean;
}

/**
 * 创建测试用户
 */
export async function createTestUser(overrides: Partial<TestUser> = {}): Promise<TestUser> {
  const bcrypt = await import('bcrypt');
  
  const defaultUser: TestUser = {
    id: `test_user_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    username: `testuser_${Date.now()}`,
    email: `test_${Date.now()}@example.com`,
    password: 'TestPassword123!',
    isActive: true,
  };

  const userData = { ...defaultUser, ...overrides };
  const hashedPassword = await bcrypt.hash(userData.password, 12);

  const createdUser = await prisma.user.create({
    data: {
      id: userData.id,
      username: userData.username,
      passwordHash: hashedPassword,
      isActive: userData.isActive,
      firstName: 'Test',
      lastName: 'User',
      displayName: `${userData.username} Display`,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  return {
    ...userData,
    id: createdUser.id,
  };
}

/**
 * 创建测试OAuth客户端
 */
export async function createTestOAuthClient(overrides: Partial<TestClient> = {}): Promise<TestClient> {
  const bcrypt = await import('bcrypt');
  
  const defaultClient: TestClient = {
    id: `test_client_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    clientId: `test_client_${Date.now()}`,
    name: 'Test OAuth Client',
    redirectUris: ['http://localhost:3000/callback', 'https://app.example.com/auth/callback'],
    allowedScopes: ['openid', 'profile', 'email', 'api:read', 'api:write'],
    grantTypes: ['authorization_code', 'refresh_token'],
    clientType: 'CONFIDENTIAL',
    requirePkce: true,
  };

  const clientData = { ...defaultClient, ...overrides };
  
  // 生成客户端密钥（如果是机密客户端）
  let hashedSecret: string | null = null;
  let plainSecret: string | undefined = undefined;
  
  if (clientData.clientType === 'CONFIDENTIAL') {
    plainSecret = `secret_${Date.now()}_${crypto.randomBytes(16).toString('hex')}`;
    hashedSecret = await bcrypt.hash(plainSecret, 12);
  }

  const createdClient = await prisma.oAuthClient.create({
    data: {
      clientId: clientData.clientId,
      name: clientData.name,
      description: `Test client for OAuth2.1 testing`,
      clientSecret: hashedSecret,
      clientType: clientData.clientType,
      redirectUris: JSON.stringify(clientData.redirectUris),
      allowedScopes: JSON.stringify(clientData.allowedScopes),
      grantTypes: JSON.stringify(clientData.grantTypes),
      responseTypes: JSON.stringify(['code']),
      requirePkce: clientData.requirePkce,
      requireConsent: false, // 测试时跳过同意页面
      isActive: true,
      accessTokenTtl: 3600, // 1小时
      refreshTokenTtl: 2592000, // 30天
      authorizationCodeLifetime: 600, // 10分钟
      tokenEndpointAuthMethod: clientData.clientType === 'CONFIDENTIAL' ? 'client_secret_basic' : 'none',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  return {
    ...clientData,
    id: createdClient.id,
    clientSecret: plainSecret,
  };
}

/**
 * 创建测试授权码
 */
export async function createTestAuthCode(params: {
  userId: string;
  clientId: string;
  redirectUri: string;
  scope: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
}): Promise<{
  code: string;
  codeVerifier?: string;
}> {
  const code = crypto.randomBytes(32).toString('base64url');
  const codeVerifier = params.codeChallenge ? generateCodeVerifier() : undefined;
  const actualCodeChallenge = codeVerifier ? generateCodeChallenge(codeVerifier) : params.codeChallenge;

  await prisma.authorizationCode.create({
    data: {
      code,
      userId: params.userId,
      clientId: params.clientId,
      redirectUri: params.redirectUri,
      scope: params.scope,
      codeChallenge: actualCodeChallenge,
      codeChallengeMethod: params.codeChallengeMethod || 'S256',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10分钟后过期
      createdAt: new Date(),
    },
  });

  return {
    code,
    codeVerifier,
  };
}

// ===== PKCE 辅助函数 =====

/**
 * 生成PKCE参数
 */
export function generatePKCEParams(): {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: string;
} {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  
  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: 'S256',
  };
}

function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

// ===== JWT 辅助函数 =====

/**
 * 创建测试JWT令牌
 */
export async function createTestAuthCenterSessionToken(userId: string): Promise<string> {
  const privateKey = await jose.importPKCS8(
    process.env.JWT_PRIVATE_KEY!,
    'RS256'
  );

  const jwt = await new jose.SignJWT({
    sub: userId,
    type: 'auth_center_session',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600, // 1小时
  })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey);

  return jwt;
}

/**
 * 验证JWT结构
 */
export function validateJWTStructure(token: string): {
  header: jose.JWTHeaderParameters;
  payload: jose.JWTPayload;
} {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }

  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());

  return { header, payload };
}

// ===== HTTP 请求辅助函数 =====

/**
 * 创建测试请求
 */
export function createTestRequest(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: any;
    cookies?: Record<string, string>;
  } = {}
): NextRequest {
  const headers = new Headers(options.headers);
  
  if (options.cookies) {
    const cookieString = Object.entries(options.cookies)
      .map(([key, value]) => `${key}=${value}`)
      .join('; ');
    headers.set('Cookie', cookieString);
  }

  const requestInit: any = {
    method: options.method || 'GET',
    headers,
  };

  if (options.body) {
    if (typeof options.body === 'string') {
      requestInit.body = options.body;
    } else if (options.body instanceof FormData) {
      requestInit.body = options.body;
    } else {
      requestInit.body = JSON.stringify(options.body);
      headers.set('Content-Type', 'application/json');
    }
  }

  return new NextRequest(url, requestInit);
}

/**
 * 创建表单数据
 */
export function createTokenRequestFormData(data: Record<string, string>): FormData {
  const formData = new FormData();
  Object.entries(data).forEach(([key, value]) => {
    formData.append(key, value);
  });
  return formData;
}

// ===== 数据库初始化函数 =====

async function createTestPermissions(): Promise<void> {
  await prisma.permission.createMany({
    data: [
      { 
        name: 'api:read', 
        displayName: 'Read API Access',
        description: 'Read API access',
        resource: 'api',
        action: 'read'
      },
      { 
        name: 'api:write', 
        displayName: 'Write API Access',
        description: 'Write API access',
        resource: 'api',
        action: 'write'
      },
      { 
        name: 'admin:users', 
        displayName: 'User Management',
        description: 'User management',
        resource: 'users',
        action: 'manage'
      },
      { 
        name: 'admin:clients', 
        displayName: 'Client Management',
        description: 'Client management',
        resource: 'clients',
        action: 'manage'
      },
    ],
  });
}

async function createTestRoles(): Promise<void> {
  await prisma.role.createMany({
    data: [
      { name: 'user', displayName: 'Regular User', description: 'Regular user' },
      { name: 'admin', displayName: 'Administrator', description: 'Administrator' },
    ],
  });
}

async function createTestScopes(): Promise<void> {
  await prisma.scope.createMany({
    data: [
      { name: 'openid', description: 'OpenID Connect' },
      { name: 'profile', description: 'Profile information' },
      { name: 'email', description: 'Email address' },
      { name: 'api:read', description: 'Read API access' },
      { name: 'api:write', description: 'Write API access' },
    ],
  });
}

// ===== 测试套件设置 =====

export function setupTestSuite() {
  beforeAll(async () => {
    await initTestDatabase();
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  beforeEach(async () => {
    // 每个测试前不需要清理，因为我们使用事务
  });

  afterEach(async () => {
    // 每个测试后清理数据
    await cleanupTestData();
  });
} 