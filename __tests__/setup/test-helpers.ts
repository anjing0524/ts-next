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
  await prisma.consentGrant.deleteMany();
  await prisma.revokedAuthJti.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.passwordHistory.deleteMany();
  await prisma.loginAttempt.deleteMany();
  await prisma.oAuthClient.deleteMany();
  await prisma.user.deleteMany();
  await prisma.role.deleteMany();
  await prisma.permission.deleteMany();
  await prisma.apiPermission.deleteMany();
  await prisma.menuPermission.deleteMany();
  await prisma.dataPermission.deleteMany();
  await prisma.menu.deleteMany();
  await prisma.scope.deleteMany();
  await prisma.systemConfiguration.deleteMany();
  await prisma.securityPolicy.deleteMany();
}

/**
 * 初始化测试数据
 */
export async function initializeTestData(): Promise<void> {
  await createTestPermissions();
  await createTestRoles();
  await createTestRolePermissions();
}

// ===== 测试数据创建 =====

export interface TestUser {
  id: string;
  username: string;
  email?: string;
  isActive: boolean;
}

export interface TestClient {
  id: string;
  clientId: string;
  clientSecret?: string;
  name: string;
  redirectUris: string[];
  grantTypes: string[];
  responseTypes: string[];
  allowedScopes: string[];
}

/**
 * 创建测试用户
 */
export async function createTestUser(userData: TestUser): Promise<any> {
  const hashedPassword = await hashPassword('testpassword123');
  
  const createdUser = await prisma.user.create({
    data: {
      id: userData.id,
      username: userData.username,
      passwordHash: hashedPassword,
      isActive: userData.isActive,
      displayName: `${userData.username} Display`,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
  
  return createdUser;
}

/**
 * 创建测试OAuth客户端
 */
export async function createTestClient(clientData: TestClient): Promise<any> {
  const hashedSecret = clientData.clientSecret ? await hashPassword(clientData.clientSecret) : undefined;
  
  const createdClient = await prisma.oAuthClient.create({
    data: {
      id: clientData.id,
      clientId: clientData.clientId,
      clientSecret: hashedSecret,
      name: clientData.name,
      redirectUris: JSON.stringify(clientData.redirectUris),
      grantTypes: JSON.stringify(clientData.grantTypes),
      responseTypes: JSON.stringify(clientData.responseTypes),
      allowedScopes: JSON.stringify(clientData.allowedScopes),
      clientType: 'CONFIDENTIAL',
      requirePkce: true,
      requireConsent: false,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
  
  return createdClient;
}

/**
 * 创建测试访问令牌
 */
export async function createTestAccessToken(userId: string, clientId: string, scopes: string[] = ['read']): Promise<string> {
  const token = generateRandomToken();
  const tokenHash = await hashToken(token);
  
  await prisma.accessToken.create({
    data: {
      token,
      tokenHash,
      userId,
      clientId,
      scope: JSON.stringify(scopes),
      expiresAt: new Date(Date.now() + 3600000), // 1小时后过期
      createdAt: new Date(),
    },
  });
  
  return token;
}

// ===== 权限和角色管理 =====

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

async function createTestRolePermissions(): Promise<void> {
  const roles = await prisma.role.findMany();
  const permissions = await prisma.permission.findMany();
  
  const userRole = roles.find(r => r.name === 'user');
  const adminRole = roles.find(r => r.name === 'admin');
  const readPermission = permissions.find(p => p.name === 'api:read');
  const writePermission = permissions.find(p => p.name === 'api:write');
  const userMgmtPermission = permissions.find(p => p.name === 'admin:users');
  const clientMgmtPermission = permissions.find(p => p.name === 'admin:clients');
  
  if (userRole && adminRole && readPermission && writePermission && userMgmtPermission && clientMgmtPermission) {
    await prisma.rolePermission.createMany({
      data: [
        { roleId: userRole.id, permissionId: readPermission.id },
        { roleId: adminRole.id, permissionId: readPermission.id },
        { roleId: adminRole.id, permissionId: writePermission.id },
        { roleId: adminRole.id, permissionId: userMgmtPermission.id },
        { roleId: adminRole.id, permissionId: clientMgmtPermission.id },
      ],
    });
  }
}

// ===== JWT工具函数 =====

/**
 * 创建测试JWT令牌（用于认证中心会话）
 */
export async function createTestAuthCenterSessionToken(userId: string): Promise<string> {
  const privateKey = process.env.JWT_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('JWT_PRIVATE_KEY environment variable is required');
  }
  
  const key = await jose.importPKCS8(privateKey, 'RS256');
  
  const jwt = await new jose.SignJWT({
    sub: userId,
    aud: 'auth-center',
    iss: 'auth-center',
    permissions: ['user:read'],
  })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(key);
  
  return jwt;
}

// ===== HTTP请求工具 =====

export interface RequestOptions {
  method?: string;
  body?: any;
  headers?: Record<string, string>;
  query?: Record<string, string>;
}

/**
 * 创建测试请求对象
 */
export function createTestRequest(url: string, options: RequestOptions = {}): NextRequest {
  const fullUrl = new URL(url, 'http://localhost:3000');
  
  // 添加查询参数
  if (options.query) {
    Object.entries(options.query).forEach(([key, value]) => {
      fullUrl.searchParams.set(key, value);
    });
  }
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  
  const requestInit: any = {
    method: options.method || 'GET',
    headers,
  };
  
  if (options.body && options.method !== 'GET') {
    requestInit.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
  }
  
  return new NextRequest(fullUrl, requestInit);
}

// ===== 工具函数 =====

/**
 * 生成随机令牌
 */
function generateRandomToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * 对密码进行哈希
 */
async function hashPassword(password: string): Promise<string> {
  // 简化的哈希实现，实际应用中应使用bcrypt
  return crypto.createHash('sha256').update(password).digest('hex');
}

/**
 * 对令牌进行哈希
 */
async function hashToken(token: string): Promise<string> {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ===== 导出Jest函数以便在测试中使用 =====
export { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach }; 