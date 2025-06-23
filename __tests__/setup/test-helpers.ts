// __tests__/setup/test-helpers.ts
// 统一的测试辅助函数，基于TDD最佳实践
// 连接真实Prisma数据库进行集成测试

import { NextRequest } from 'next/server';
import { prisma } from '@repo/database/client';
import * as jose from 'jose';
import crypto from 'crypto';
import { generateCodeVerifier, generateCodeChallenge } from '@repo/lib/auth';

// ===== 测试用户预设 =====

/**
 * 预定义测试用户类型
 */
export interface TestUserType {
  id: string;
  username: string;
  email: string;
  displayName: string;
  isActive: boolean;
  roles: string[];
  permissions: string[];
}

/**
 * 系统预设的测试用户
 */
export const TEST_USERS: Record<string, TestUserType> = {
  SYSTEM_ADMIN: {
    id: 'test-system-admin',
    username: 'system_admin',
    email: 'system.admin@test.com',
    displayName: 'System Administrator',
    isActive: true,
    roles: ['system_admin'],
    permissions: ['system:all', 'admin:all', 'api:all'],
  },
  USER_ADMIN: {
    id: 'test-user-admin',
    username: 'user_admin',
    email: 'user.admin@test.com',
    displayName: 'User Administrator',
    isActive: true,
    roles: ['user_admin'],
    permissions: ['admin:users', 'api:read', 'api:write'],
  },
  PERMISSION_ADMIN: {
    id: 'test-permission-admin',
    username: 'permission_admin',
    email: 'permission.admin@test.com',
    displayName: 'Permission Administrator',
    isActive: true,
    roles: ['permission_admin'],
    permissions: ['admin:permissions', 'admin:roles', 'api:read'],
  },
  REGULAR_USER: {
    id: 'test-regular-user',
    username: 'regular_user',
    email: 'regular.user@test.com',
    displayName: 'Regular User',
    isActive: true,
    roles: ['user'],
    permissions: ['api:read'],
  },
  NO_PERMISSION_USER: {
    id: 'test-no-permission',
    username: 'no_permission_user',
    email: 'no.permission@test.com',
    displayName: 'No Permission User',
    isActive: true,
    roles: [],
    permissions: [],
  },
};

// ===== OAuth客户端预设 =====

/**
 * 预定义测试客户端类型
 */
export interface TestClientType {
  id: string;
  clientId: string;
  clientSecret?: string;
  name: string;
  redirectUris: string[];
  grantTypes: string[];
  responseTypes: string[];
  allowedScopes: string[];
  clientType: 'CONFIDENTIAL' | 'PUBLIC';
  requirePkce: boolean;
}

/**
 * 系统预设的测试客户端
 */
export const TEST_CLIENTS: Record<string, TestClientType> = {
  WEB_APP: {
    id: 'test-web-app',
    clientId: 'test_web_app_client',
    clientSecret: 'test_web_app_secret',
    name: 'Test Web Application',
    redirectUris: ['http://localhost:3000/auth/callback'],
    grantTypes: ['authorization_code', 'refresh_token'],
    responseTypes: ['code'],
    allowedScopes: ['openid', 'profile', 'email', 'read', 'write'],
    clientType: 'CONFIDENTIAL',
    requirePkce: true,
  },
  PUBLIC_CLIENT: {
    id: 'test-public-client',
    clientId: 'test_public_client',
    name: 'Test Public Client',
    redirectUris: ['http://localhost:3000/callback'],
    grantTypes: ['authorization_code'],
    responseTypes: ['code'],
    allowedScopes: ['openid', 'profile', 'read'],
    clientType: 'PUBLIC',
    requirePkce: true,
  },
  MOBILE_APP: {
    id: 'test-mobile-app',
    clientId: 'test_mobile_app',
    name: 'Test Mobile Application',
    redirectUris: ['com.example.app://callback'],
    grantTypes: ['authorization_code', 'refresh_token'],
    responseTypes: ['code'],
    allowedScopes: ['openid', 'profile', 'email', 'read'],
    clientType: 'PUBLIC',
    requirePkce: true,
  },
};

// ===== PKCE工具函数 =====

/**
 * 生成PKCE参数
 */
export interface PKCEParams {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
}

/**
 * 生成PKCE参数
 */
export function generatePKCE(): PKCEParams {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  

  const createdClient = await prisma.oAuthClient.create({
    data: {
      id: clientData.id,
      clientId: clientData.clientId,
      clientSecret: hashedSecret,
      name: clientData.name,
      redirectUris: JSON.stringify(clientData.redirectUris),
      grantTypes: JSON.stringify(clientData.grantTypes || ['authorization_code']), // Provide default if undefined
      responseTypes: JSON.stringify(clientData.responseTypes || ['code']), // Provide default
      allowedScopes: JSON.stringify(clientData.allowedScopes || ['openid']), // Provide default
      clientType: 'CONFIDENTIAL',
      requirePkce: true,
      requireConsent: false,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
  
  return createdClient;

  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: 'S256',
  };

}

// ===== 数据库管理 =====

/**
 * 清理所有测试数据
 */
export async function cleanupTestData(): Promise<void> {
  // 按依赖关系顺序删除
  const tables = [
    'tokenBlacklist',
    'accessToken',
    'refreshToken',
    'authorizationCode',
    'userRole',
    'rolePermission',
    'consentGrant',
    'revokedAuthJti',
    'auditLog',
    'passwordHistory',
    'loginAttempt',
    'oAuthClient',
    'user',
    'role',
    'permission',
    'apiPermission',
    'menuPermission',
    'dataPermission',
    'menu',
    'scope',
    'systemConfiguration',
    'securityPolicy',
  ];

  for (const table of tables) {
    try {
      await (prisma as any)[table].deleteMany();
    } catch (error) {
      // 忽略不存在的表
      console.warn(`表 ${table} 清理失败:`, error);
    }
  }
}

/**
 * 初始化测试数据
 */
export async function initializeTestData(): Promise<void> {
  await createTestPermissions();
  await createTestRoles();
  await createTestRolePermissions();
  await createTestScopes();
  await createTestUsers();
  await createTestClients();
}

// ===== 数据创建函数 =====

/**
 * 创建测试权限
 */
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
        action: 'manage',
        isSystemPerm: true, // Added
      },
    ],
  });

  const permissions = [
    // 系统权限
    { name: 'system:all', displayName: 'System All', description: 'System all permissions', resource: 'system', action: 'all' },
    
    // 管理权限
    { name: 'admin:all', displayName: 'Admin All', description: 'Admin all permissions', resource: 'admin', action: 'all' },
    { name: 'admin:users', displayName: 'User Management', description: 'User management', resource: 'users', action: 'manage' },
    { name: 'admin:permissions', displayName: 'Permission Management', description: 'Permission management', resource: 'permissions', action: 'manage' },
    { name: 'admin:roles', displayName: 'Role Management', description: 'Role management', resource: 'roles', action: 'manage' },
    { name: 'admin:clients', displayName: 'Client Management', description: 'Client management', resource: 'clients', action: 'manage' },
    
    // API权限
    { name: 'api:all', displayName: 'API All', description: 'All API permissions', resource: 'api', action: 'all' },
    { name: 'api:read', displayName: 'API Read', description: 'API read access', resource: 'api', action: 'read' },
    { name: 'api:write', displayName: 'API Write', description: 'API write access', resource: 'api', action: 'write' },
  ];

  for (const permission of permissions) {
    await prisma.permission.upsert({
      where: { name: permission.name },
      update: permission,
      create: permission,
    });
  }

}

/**
 * 创建测试角色
 */
async function createTestRoles(): Promise<void> {
  const roles = [
    { name: 'system_admin', displayName: 'System Administrator', description: 'System administrator with all permissions' },
    { name: 'user_admin', displayName: 'User Administrator', description: 'User management administrator' },
    { name: 'permission_admin', displayName: 'Permission Administrator', description: 'Permission and role management administrator' },
    { name: 'user', displayName: 'Regular User', description: 'Regular user with basic permissions' },
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: role,
      create: role,
    });
  }
}

/**
 * 创建测试角色权限关联
 */
async function createTestRolePermissions(): Promise<void> {
  const rolePermissionMappings = [
    { roleName: 'system_admin', permissionName: 'system:all' },
    { roleName: 'system_admin', permissionName: 'admin:all' },
    { roleName: 'system_admin', permissionName: 'api:all' },
    
    { roleName: 'user_admin', permissionName: 'admin:users' },
    { roleName: 'user_admin', permissionName: 'api:read' },
    { roleName: 'user_admin', permissionName: 'api:write' },
    
    { roleName: 'permission_admin', permissionName: 'admin:permissions' },
    { roleName: 'permission_admin', permissionName: 'admin:roles' },
    { roleName: 'permission_admin', permissionName: 'api:read' },
    
    { roleName: 'user', permissionName: 'api:read' },
  ];

  for (const mapping of rolePermissionMappings) {
    const role = await prisma.role.findUnique({ where: { name: mapping.roleName } });
    const permission = await prisma.permission.findUnique({ where: { name: mapping.permissionName } });
    
    if (role && permission) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id,
          },
        },
        update: {},
        create: {
          roleId: role.id,
          permissionId: permission.id,
        },
      });
    }
  }
}

/**
 * 创建测试作用域
 */
async function createTestScopes(): Promise<void> {
  const scopes = [
    { name: 'openid', displayName: 'OpenID', description: 'OpenID Connect scope' },
    { name: 'profile', displayName: 'Profile', description: 'User profile information' },
    { name: 'email', displayName: 'Email', description: 'User email address' },
    { name: 'read', displayName: 'Read', description: 'Read access' },
    { name: 'write', displayName: 'Write', description: 'Write access' },
  ];

  for (const scope of scopes) {
    await prisma.scope.upsert({
      where: { name: scope.name },
      update: scope,
      create: scope,
    });
  }
}

/**
 * 创建测试用户
 */
async function createTestUsers(): Promise<void> {
  for (const [key, userData] of Object.entries(TEST_USERS)) {
    const hashedPassword = await hashPassword('testpassword123');
    
    // 创建用户
    const user = await prisma.user.upsert({
      where: { username: userData.username },
      update: {
        email: userData.email,
        displayName: userData.displayName,
        isActive: userData.isActive,
        passwordHash: hashedPassword,
      },
      create: {
        id: userData.id,
        username: userData.username,
        email: userData.email,
        displayName: userData.displayName,
        isActive: userData.isActive,
        passwordHash: hashedPassword,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // 分配角色
    for (const roleName of userData.roles) {
      const role = await prisma.role.findUnique({ where: { name: roleName } });
      if (role) {
        await prisma.userRole.upsert({
          where: {
            userId_roleId: {
              userId: user.id,
              roleId: role.id,
            },
          },
          update: {},
          create: {
            userId: user.id,
            roleId: role.id,
          },
        });
      }
    }
  }
}

/**
 * 创建测试客户端
 */

export async function createTestAuthCenterSessionToken(userId: string): Promise<string> {
  const privateKeyPem = process.env.JWT_PRIVATE_KEY_PEM;
  if (!privateKeyPem) {
    throw new Error('JWT_PRIVATE_KEY_PEM environment variable is required for createTestAuthCenterSessionToken');
  }
  
  const key = await jose.importPKCS8(privateKeyPem, 'RS256');
  
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

async function createTestClients(): Promise<void> {
  for (const [key, clientData] of Object.entries(TEST_CLIENTS)) {
    const hashedSecret = clientData.clientSecret ? await hashPassword(clientData.clientSecret) : undefined;
    
    await prisma.oAuthClient.upsert({
      where: { clientId: clientData.clientId },
      update: {
        name: clientData.name,
        clientSecret: hashedSecret,
        redirectUris: JSON.stringify(clientData.redirectUris),
        grantTypes: JSON.stringify(clientData.grantTypes),
        responseTypes: JSON.stringify(clientData.responseTypes),
        allowedScopes: JSON.stringify(clientData.allowedScopes),
        clientType: clientData.clientType,
        requirePkce: clientData.requirePkce,
        isActive: true,
      },
      create: {
        id: clientData.id,
        clientId: clientData.clientId,
        clientSecret: hashedSecret,
        name: clientData.name,
        redirectUris: JSON.stringify(clientData.redirectUris),
        grantTypes: JSON.stringify(clientData.grantTypes),
        responseTypes: JSON.stringify(clientData.responseTypes),
        allowedScopes: JSON.stringify(clientData.allowedScopes),
        clientType: clientData.clientType,
        requirePkce: clientData.requirePkce,
        requireConsent: false,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

}

// ===== 辅助工具函数 =====

/**
 * 创建测试请求
 */
export interface RequestOptions {
  method?: string;
  body?: any;
  headers?: Record<string, string>;
  query?: Record<string, string>;
}

/**
 * 创建测试请求
 */
export function createTestRequest(url: string, options: RequestOptions = {}): NextRequest {
  const { method = 'GET', body, headers = {}, query = {} } = options;
  
  // 构建完整URL
  const baseUrl = 'http://localhost:3000';
  const fullUrl = new URL(url, baseUrl);
  
  // 添加查询参数
  Object.entries(query).forEach(([key, value]) => {
    fullUrl.searchParams.set(key, value);
  });
  
  // 构建请求配置
  const requestInit: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };
  
  if (body && method !== 'GET') {
    requestInit.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  
  return new NextRequest(fullUrl.toString(), requestInit);
}

/**
 * 生成随机令牌
 */
export function generateRandomToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * 哈希密码
 */
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 哈希令牌
 */
async function hashToken(token: string): Promise<string> {
  return hashPassword(token);
}

/**
 * 创建JWT令牌（用于测试）
 */
export async function createTestJWT(payload: Record<string, any>, secret: string = 'test-secret'): Promise<string> {
  const algorithm = 'HS256';
  const secretKey = new TextEncoder().encode(secret);
  
  const jwt = await new jose.SignJWT(payload)
    .setProtectedHeader({ alg: algorithm })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secretKey);
    
  return jwt;
}

/**
 * 验证JWT令牌（用于测试）
 */
export async function verifyTestJWT(token: string, secret: string = 'test-secret'): Promise<any> {
  const secretKey = new TextEncoder().encode(secret);
  
  const { payload } = await jose.jwtVerify(token, secretKey);
  return payload;
} 