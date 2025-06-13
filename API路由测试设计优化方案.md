# API路由测试设计优化方案

## 1. 概述

本文档基于《API路由优化报告》，针对新设计的统一路由架构制定全面的测试优化方案。测试设计覆盖6大业务域的所有API端点，确保系统在重构过程中的质量和稳定性。

### 1.1 测试目标

- **功能完整性验证**：确保所有新设计的API端点功能正确
- **向后兼容性保证**：验证v1到v2的平滑迁移
- **安全性测试**：全面验证OAuth2.1和权限控制机制
- **性能基准测试**：确保优化后的性能提升
- **集成测试覆盖**：验证各业务域之间的协作

### 1.2 测试范围

```
测试覆盖范围：
├── 认证域 (auth) - 12个端点
├── OAuth2.1域 (oauth) - 18个端点
├── 用户管理域 (users) - 15个端点
├── 权限管理域 (permissions) - 20个端点
├── 审计监控域 (audit) - 8个端点
└── 系统管理域 (system) - 12个端点

总计：85个新端点 + 向后兼容性测试
```

## 2. 测试架构设计

### 2.1 测试分层策略

```
┌─────────────────────────────────────┐
│           E2E测试层                  │
│     (业务流程端到端验证)              │
├─────────────────────────────────────┤
│           集成测试层                  │
│     (API端点集成验证)                │
├─────────────────────────────────────┤
│           单元测试层                  │
│     (核心逻辑单元验证)                │
├─────────────────────────────────────┤
│           契约测试层                  │
│     (API规范一致性验证)              │
└─────────────────────────────────────┘
```

### 2.2 测试工具链

本方案采用现代化的测试工具链，以Vitest为核心测试框架：

```
测试工具链架构：
├── Vitest - 核心测试框架
│   ├── 快速执行和热重载
│   ├── 原生TypeScript支持
│   ├── 内置代码覆盖率
│   └── 并行测试执行
├── Supertest - API测试工具
├── Artillery - 性能测试工具
├── ESLint - 代码质量检查
└── GitHub Actions - CI/CD集成
```

#### 2.2.1 依赖包安装

```bash
# 安装Vitest及相关测试依赖
npm install -D vitest @vitest/ui @vitest/coverage-v8
npm install -D supertest @types/supertest
npm install -D artillery
npm install -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin
```

#### 2.2.2 Vitest优势

- **性能优越**：基于Vite构建，启动速度比Jest快10倍以上
- **原生ES模块支持**：无需额外配置即可支持ES模块
- **TypeScript原生支持**：无需ts-jest等转换工具
- **智能监听模式**：只重新运行相关测试文件
- **内置UI界面**：提供可视化测试界面
- **兼容Jest API**：大部分Jest测试可直接迁移

### 2.3 测试环境配置

```typescript
// 测试环境配置
interface TestEnvironment {
  database: {
    url: string;
    resetStrategy: 'truncate' | 'migrate';
    seedData: boolean;
  };
  oauth: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  };
  cache: {
    redis: {
      host: string;
      port: number;
      db: number;
    };
  };
  security: {
    jwtSecret: string;
    encryptionKey: string;
  };
}

// Vitest测试设置
// tests/setup.ts
import { beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDatabase, cleanupTestDatabase } from './utils/database';
import { setupTestRedis, cleanupTestRedis } from './utils/redis';

beforeAll(async () => {
  await setupTestDatabase();
  await setupTestRedis();
});

afterAll(async () => {
  await cleanupTestDatabase();
  await cleanupTestRedis();
});

beforeEach(async () => {
  // 每个测试前重置数据库状态
  await resetTestData();
});
```

## 3. 业务域测试设计

### 3.1 认证域 (auth) 测试设计

#### 3.1.1 核心测试用例

```typescript
/**
 * 认证域测试套件
 * 覆盖用户登录、注册、密码管理等核心功能
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../../../app';
import { createTestUser, cleanupTestData } from '../../utils/test-helpers';

describe('Authentication Domain Tests', () => {
  
  describe('POST /api/v2/auth/login', () => {
    it('应该成功登录有效用户', async () => {
      // 测试正常登录流程
    });
    
    it('应该拒绝无效凭据', async () => {
      // 测试错误密码、不存在用户等场景
    });
    
    it('应该处理账户锁定状态', async () => {
      // 测试锁定账户登录尝试
    });
    
    it('应该记录登录审计日志', async () => {
      // 验证审计日志记录
    });
    
    it('应该应用速率限制', async () => {
      // 测试登录频率限制
    });
  });
  
  describe('POST /api/v2/auth/register', () => {
    it('应该成功注册新用户', async () => {
      // 测试用户注册流程
    });
    
    it('应该验证密码强度', async () => {
      // 测试密码策略执行
    });
    
    it('应该防止重复注册', async () => {
      // 测试邮箱/用户名唯一性
    });
  });
  
  describe('Password Management', () => {
    it('POST /api/v2/auth/password/change - 应该成功修改密码', async () => {
      // 测试密码修改流程
    });
    
    it('POST /api/v2/auth/password/reset - 应该处理密码重置', async () => {
      // 测试密码重置流程
    });
    
    it('POST /api/v2/auth/password/forgot - 应该发送重置邮件', async () => {
      // 测试忘记密码流程
    });
  });
  
  describe('Session Management', () => {
    it('GET /api/v2/auth/sessions - 应该返回活跃会话', async () => {
      // 测试会话列表查询
    });
    
    it('DELETE /api/v2/auth/sessions/{id} - 应该终止指定会话', async () => {
      // 测试会话终止功能
    });
  });
});
```

#### 3.1.2 安全测试用例

```typescript
/**
 * 认证安全测试
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../../app';

describe('Authentication Security Tests', () => {
  
  it('应该防止SQL注入攻击', async () => {
    const maliciousInput = "'; DROP TABLE users; --";
    const response = await request(app)
      .post('/api/v2/auth/login')
      .send({
        username: maliciousInput,
        password: 'password'
      });
    
    expect(response.status).toBe(401);
    // 验证数据库完整性
  });
  
  it('应该防止暴力破解攻击', async () => {
    // 连续多次错误登录尝试
    for (let i = 0; i < 6; i++) {
      await request(app)
        .post('/api/v2/auth/login')
        .send({ username: 'test@example.com', password: 'wrong' });
    }
    
    const response = await request(app)
      .post('/api/v2/auth/login')
      .send({ username: 'test@example.com', password: 'correct' });
    
    expect(response.status).toBe(429); // Too Many Requests
  });
  
  it('应该安全处理敏感信息', async () => {
    const response = await request(app)
      .post('/api/v2/auth/login')
      .send({ username: 'test@example.com', password: 'password' });
    
    // 确保响应中不包含敏感信息
    expect(response.body).not.toHaveProperty('password');
    expect(response.body).not.toHaveProperty('passwordHash');
  });
});
```

### 3.2 OAuth2.1域 (oauth) 测试设计

#### 3.2.1 标准端点测试

```typescript
/**
 * OAuth2.1标准端点测试套件
 */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../../app';
import { getAuthorizationCode, getValidAccessToken } from '../../utils/oauth-helpers';

describe('OAuth2.1 Standard Endpoints', () => {
  
  describe('Authorization Code Flow', () => {
    it('GET /api/v2/oauth/authorize - 应该返回授权页面', async () => {
      const response = await request(app)
        .get('/api/v2/oauth/authorize')
        .query({
          client_id: 'test-client',
          response_type: 'code',
          redirect_uri: 'https://example.com/callback',
          scope: 'read write',
          state: 'random-state'
        });
      
      expect(response.status).toBe(200);
      expect(response.text).toContain('授权确认');
    });
    
    it('POST /api/v2/oauth/token - 应该交换访问令牌', async () => {
      // 先获取授权码
      const authCode = await getAuthorizationCode();
      
      const response = await request(app)
        .post('/api/v2/oauth/token')
        .send({
          grant_type: 'authorization_code',
          code: authCode,
          client_id: 'test-client',
          client_secret: 'test-secret',
          redirect_uri: 'https://example.com/callback'
        });
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('access_token');
      expect(response.body).toHaveProperty('token_type', 'Bearer');
      expect(response.body).toHaveProperty('expires_in');
    });
  });
  
  describe('Token Introspection', () => {
    it('POST /api/v2/oauth/introspect - 应该验证令牌有效性', async () => {
      const token = await getValidAccessToken();
      
      const response = await request(app)
        .post('/api/v2/oauth/introspect')
        .auth('client-id', 'client-secret')
        .send({ token });
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('active', true);
      expect(response.body).toHaveProperty('scope');
      expect(response.body).toHaveProperty('exp');
    });
    
    it('应该正确处理无效令牌', async () => {
      const response = await request(app)
        .post('/api/v2/oauth/introspect')
        .auth('client-id', 'client-secret')
        .send({ token: 'invalid-token' });
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('active', false);
    });
  });
  
  describe('Token Revocation', () => {
    it('POST /api/v2/oauth/revoke - 应该撤销访问令牌', async () => {
      const token = await getValidAccessToken();
      
      const response = await request(app)
        .post('/api/v2/oauth/revoke')
        .auth('client-id', 'client-secret')
        .send({ token });
      
      expect(response.status).toBe(200);
      
      // 验证令牌已被撤销
      const introspectResponse = await request(app)
        .post('/api/v2/oauth/introspect')
        .auth('client-id', 'client-secret')
        .send({ token });
      
      expect(introspectResponse.body.active).toBe(false);
    });
  });
});
```

#### 3.2.2 客户端管理测试

```typescript
/**
 * OAuth客户端管理测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../../app';
import { createTestClient } from '../../utils/oauth-helpers';

describe('OAuth Client Management', () => {
  
  describe('Client CRUD Operations', () => {
    it('POST /api/v2/oauth/clients - 应该创建新客户端', async () => {
      const clientData = {
        name: 'Test Application',
        redirectUris: ['https://example.com/callback'],
        scopes: ['read', 'write'],
        grantTypes: ['authorization_code', 'refresh_token']
      };
      
      const response = await request(app)
        .post('/api/v2/oauth/clients')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(clientData);
      
      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('clientId');
      expect(response.body).toHaveProperty('clientSecret');
    });
    
    it('GET /api/v2/oauth/clients - 应该返回客户端列表', async () => {
      const response = await request(app)
        .get('/api/v2/oauth/clients')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
    
    it('PUT /api/v2/oauth/clients/{id} - 应该更新客户端信息', async () => {
      const clientId = await createTestClient();
      
      const updateData = {
        name: 'Updated Application Name',
        redirectUris: ['https://newdomain.com/callback']
      };
      
      const response = await request(app)
        .put(`/api/v2/oauth/clients/${clientId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData);
      
      expect(response.status).toBe(200);
      expect(response.body.name).toBe(updateData.name);
    });
  });
  
  describe('Client Security', () => {
    it('POST /api/v2/oauth/clients/{id}/secret - 应该重置客户端密钥', async () => {
      const clientId = await createTestClient();
      
      const response = await request(app)
        .post(`/api/v2/oauth/clients/${clientId}/secret`)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('clientSecret');
      expect(response.body.clientSecret).toHaveLength(32);
    });
  });
});
```

### 3.3 用户管理域 (users) 测试设计

#### 3.3.1 用户CRUD测试

```typescript
/**
 * 用户管理测试套件
 */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../../app';
import { createTestUser, createLockedUser } from '../../utils/test-helpers';

describe('User Management Domain', () => {
  
  describe('User CRUD Operations', () => {
    it('GET /api/v2/users - 应该返回用户列表', async () => {
      const response = await request(app)
        .get('/api/v2/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ page: 1, limit: 10 });
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('pagination');
    });
    
    it('POST /api/v2/users - 应该创建新用户', async () => {
      const userData = {
        username: 'newuser',
        email: 'newuser@example.com',
        password: 'SecurePassword123!',
        profile: {
          firstName: 'New',
          lastName: 'User'
        }
      };
      
      const response = await request(app)
        .post('/api/v2/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(userData);
      
      expect(response.status).toBe(201);
      expect(response.body.email).toBe(userData.email);
      expect(response.body).not.toHaveProperty('password');
    });
    
    it('GET /api/v2/users/{id} - 应该返回用户详情', async () => {
      const userId = await createTestUser();
      
      const response = await request(app)
        .get(`/api/v2/users/${userId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(response.status).toBe(200);
      expect(response.body.id).toBe(userId);
    });
    
    it('PUT /api/v2/users/{id} - 应该更新用户信息', async () => {
      const userId = await createTestUser();
      
      const updateData = {
        profile: {
          firstName: 'Updated',
          lastName: 'Name'
        }
      };
      
      const response = await request(app)
        .put(`/api/v2/users/${userId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData);
      
      expect(response.status).toBe(200);
      expect(response.body.profile.firstName).toBe('Updated');
    });
  });
  
  describe('User Status Management', () => {
    it('POST /api/v2/users/{id}/lock - 应该锁定用户账户', async () => {
      const userId = await createTestUser();
      
      const response = await request(app)
        .post(`/api/v2/users/${userId}/lock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Security violation' });
      
      expect(response.status).toBe(200);
      
      // 验证用户无法登录
      const loginResponse = await request(app)
        .post('/api/v2/auth/login')
        .send({ username: 'testuser', password: 'password' });
      
      expect(loginResponse.status).toBe(423); // Locked
    });
    
    it('POST /api/v2/users/{id}/unlock - 应该解锁用户账户', async () => {
      const userId = await createLockedUser();
      
      const response = await request(app)
        .post(`/api/v2/users/${userId}/unlock`)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(response.status).toBe(200);
    });
  });
});
```

#### 3.3.2 用户角色权限测试

```typescript
/**
 * 用户角色权限测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../../app';
import { createTestUser, createTestRole, createUserWithRoles } from '../../utils/test-helpers';

describe('User Role and Permission Tests', () => {
  
  describe('Role Assignment', () => {
    it('POST /api/v2/users/{id}/roles - 应该分配角色给用户', async () => {
      const userId = await createTestUser();
      const roleId = await createTestRole();
      
      const response = await request(app)
        .post(`/api/v2/users/${userId}/roles`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ roleIds: [roleId] });
      
      expect(response.status).toBe(200);
    });
    
    it('GET /api/v2/users/{id}/roles - 应该返回用户角色列表', async () => {
      const userId = await createUserWithRoles();
      
      const response = await request(app)
        .get(`/api/v2/users/${userId}/roles`)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
    
    it('DELETE /api/v2/users/{id}/roles/{roleId} - 应该移除用户角色', async () => {
      const { userId, roleId } = await createUserWithRole();
      
      const response = await request(app)
        .delete(`/api/v2/users/${userId}/roles/${roleId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(response.status).toBe(204);
    });
  });
  
  describe('Permission Verification', () => {
    it('GET /api/v2/users/{id}/permissions - 应该返回用户权限列表', async () => {
      const userId = await createUserWithPermissions();
      
      const response = await request(app)
        .get(`/api/v2/users/${userId}/permissions`)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('apiPermissions');
      expect(response.body).toHaveProperty('menuPermissions');
      expect(response.body).toHaveProperty('dataPermissions');
    });
    
    it('POST /api/v2/users/{id}/permissions/verify - 应该验证用户权限', async () => {
      const userId = await createUserWithPermissions();
      
      const response = await request(app)
        .post(`/api/v2/users/${userId}/permissions/verify`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          permissions: [
            { type: 'api', resource: '/api/v2/users', action: 'read' },
            { type: 'menu', resource: 'user-management', action: 'access' }
          ]
        });
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('results');
    });
  });
});
```

### 3.4 权限管理域 (permissions) 测试设计

#### 3.4.1 角色管理测试

```typescript
/**
 * 权限管理域测试套件
 */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../../app';
import { createTestRole, createRoleWithPermissions, createTestPermissions } from '../../utils/test-helpers';

describe('Permission Management Domain', () => {
  
  describe('Role Management', () => {
    it('GET /api/v2/permissions/roles - 应该返回角色列表', async () => {
      const response = await request(app)
        .get('/api/v2/permissions/roles')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
    
    it('POST /api/v2/permissions/roles - 应该创建新角色', async () => {
      const roleData = {
        name: 'Content Manager',
        description: 'Manages content and articles',
        permissions: ['content:read', 'content:write']
      };
      
      const response = await request(app)
        .post('/api/v2/permissions/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(roleData);
      
      expect(response.status).toBe(201);
      expect(response.body.name).toBe(roleData.name);
    });
    
    it('PUT /api/v2/permissions/roles/{id} - 应该更新角色信息', async () => {
      const roleId = await createTestRole();
      
      const updateData = {
        name: 'Updated Role Name',
        description: 'Updated description'
      };
      
      const response = await request(app)
        .put(`/api/v2/permissions/roles/${roleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData);
      
      expect(response.status).toBe(200);
      expect(response.body.name).toBe(updateData.name);
    });
  });
  
  describe('Role Permission Management', () => {
    it('GET /api/v2/permissions/roles/{id}/permissions - 应该返回角色权限', async () => {
      const roleId = await createRoleWithPermissions();
      
      const response = await request(app)
        .get(`/api/v2/permissions/roles/${roleId}/permissions`)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
    
    it('POST /api/v2/permissions/roles/{id}/permissions - 应该分配权限给角色', async () => {
      const roleId = await createTestRole();
      const permissionIds = await createTestPermissions();
      
      const response = await request(app)
        .post(`/api/v2/permissions/roles/${roleId}/permissions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ permissionIds });
      
      expect(response.status).toBe(200);
    });
  });
});
```

#### 3.4.2 类型化权限测试

```typescript
/**
 * 类型化权限管理测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../../app';

describe('Typed Permission Management', () => {
  
  describe('API Permissions', () => {
    it('GET /api/v2/permissions/api - 应该返回API权限列表', async () => {
      const response = await request(app)
        .get('/api/v2/permissions/api')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
    
    it('POST /api/v2/permissions/api - 应该创建API权限', async () => {
      const apiPermission = {
        resource: '/api/v2/users',
        action: 'create',
        description: 'Create new users'
      };
      
      const response = await request(app)
        .post('/api/v2/permissions/api')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(apiPermission);
      
      expect(response.status).toBe(201);
      expect(response.body.resource).toBe(apiPermission.resource);
    });
  });
  
  describe('Menu Permissions', () => {
    it('GET /api/v2/permissions/menu - 应该返回菜单权限列表', async () => {
      const response = await request(app)
        .get('/api/v2/permissions/menu')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
    
    it('POST /api/v2/permissions/menu - 应该创建菜单权限', async () => {
      const menuPermission = {
        menuId: 'user-management',
        action: 'access',
        description: 'Access user management menu'
      };
      
      const response = await request(app)
        .post('/api/v2/permissions/menu')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(menuPermission);
      
      expect(response.status).toBe(201);
    });
  });
  
  describe('Data Permissions', () => {
    it('GET /api/v2/permissions/data - 应该返回数据权限列表', async () => {
      const response = await request(app)
        .get('/api/v2/permissions/data')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(response.status).toBe(200);
    });
    
    it('POST /api/v2/permissions/data - 应该创建数据权限', async () => {
      const dataPermission = {
        resource: 'users',
        scope: 'department',
        condition: 'department_id = :user_department_id',
        description: 'Access users in same department'
      };
      
      const response = await request(app)
        .post('/api/v2/permissions/data')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(dataPermission);
      
      expect(response.status).toBe(201);
    });
  });
});
```

### 3.5 审计监控域 (audit) 测试设计

```typescript
/**
 * 审计监控域测试套件
 */
describe('Audit and Monitoring Domain', () => {
  
  describe('Audit Log Management', () => {
    it('GET /api/v2/audit/logs - 应该返回审计日志列表', async () => {
      const response = await request(app)
        .get('/api/v2/audit/logs')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({
          startDate: '2024-01-01',
          endDate: '2024-12-31',
          action: 'login',
          page: 1,
          limit: 50
        });
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('pagination');
    });
    
    it('GET /api/v2/audit/logs/{id} - 应该返回审计日志详情', async () => {
      const logId = await createTestAuditLog();
      
      const response = await request(app)
        .get(`/api/v2/audit/logs/${logId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(response.status).toBe(200);
      expect(response.body.id).toBe(logId);
    });
    
    it('POST /api/v2/audit/logs/export - 应该导出审计日志', async () => {
      const response = await request(app)
        .post('/api/v2/audit/logs/export')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          format: 'csv',
          filters: {
            startDate: '2024-01-01',
            endDate: '2024-12-31'
          }
        });
      
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/csv');
    });
  });
  
  describe('Audit Statistics', () => {
    it('GET /api/v2/audit/stats - 应该返回审计统计信息', async () => {
      const response = await request(app)
        .get('/api/v2/audit/stats')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('totalLogs');
      expect(response.body).toHaveProperty('actionStats');
      expect(response.body).toHaveProperty('userStats');
    });
    
    it('GET /api/v2/audit/stats/timeline - 应该返回时间线统计', async () => {
      const response = await request(app)
        .get('/api/v2/audit/stats/timeline')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ period: 'daily', days: 30 });
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });
  
  describe('Security Event Monitoring', () => {
    it('GET /api/v2/audit/security-events - 应该返回安全事件列表', async () => {
      const response = await request(app)
        .get('/api/v2/audit/security-events')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
    
    it('GET /api/v2/audit/login-failures - 应该返回登录失败记录', async () => {
      const response = await request(app)
        .get('/api/v2/audit/login-failures')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(response.status).toBe(200);
    });
  });
});
```

### 3.6 系统管理域 (system) 测试设计

```typescript
/**
 * 系统管理域测试套件
 */
describe('System Management Domain', () => {
  
  describe('System Configuration', () => {
    it('GET /api/v2/system/config - 应该返回系统配置列表', async () => {
      const response = await request(app)
        .get('/api/v2/system/config')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
    
    it('PUT /api/v2/system/config/{key} - 应该更新配置项', async () => {
      const response = await request(app)
        .put('/api/v2/system/config/max-login-attempts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ value: '5' });
      
      expect(response.status).toBe(200);
    });
  });
  
  describe('Health Checks', () => {
    it('GET /api/v2/system/health - 应该返回系统健康状态', async () => {
      const response = await request(app)
        .get('/api/v2/system/health');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('checks');
    });
    
    it('GET /api/v2/system/health/database - 应该检查数据库健康状态', async () => {
      const response = await request(app)
        .get('/api/v2/system/health/database');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('responseTime');
    });
  });
  
  describe('System Metrics', () => {
    it('GET /api/v2/system/metrics - 应该返回系统指标', async () => {
      const response = await request(app)
        .get('/api/v2/system/metrics')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('cpu');
      expect(response.body).toHaveProperty('memory');
      expect(response.body).toHaveProperty('disk');
    });
  });
});
```

## 4. 向后兼容性测试

### 4.1 v1到v2迁移测试

```typescript
/**
 * 向后兼容性测试套件
 */
describe('Backward Compatibility Tests', () => {
  
  describe('v1 API Compatibility', () => {
    it('POST /api/v1/auth/register - 应该映射到v2端点', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123'
      };
      
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(userData);
      
      expect(response.status).toBe(201);
      expect(response.body.email).toBe(userData.email);
      
      // 验证数据在v2端点也可访问
      const v2Response = await request(app)
        .get('/api/v2/auth/me')
        .set('Authorization', `Bearer ${response.body.token}`);
      
      expect(v2Response.status).toBe(200);
    });
    
    it('POST /api/v1/permissions/check - 应该映射到v2权限验证', async () => {
      const token = await getValidUserToken();
      
      const response = await request(app)
        .post('/api/v1/permissions/check')
        .set('Authorization', `Bearer ${token}`)
        .send({
          permission: 'users:read'
        });
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('hasPermission');
    });
    
    it('废弃的端点应该返回301重定向', async () => {
      const response = await request(app)
        .post('/api/v1/auth/permissions/check')
        .send({ permission: 'test' });
      
      expect(response.status).toBe(301);
      expect(response.headers.location).toBe('/api/v1/permissions/check');
    });
  });
  
  describe('Response Format Compatibility', () => {
    it('v1响应格式应该保持一致', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${validToken}`);
      
      expect(response.status).toBe(200);
      // 验证v1特定的响应格式
      expect(response.body).toHaveProperty('user');
      expect(response.body).not.toHaveProperty('data'); // v2格式
    });
  });
});
```

### 4.2 数据迁移测试

```typescript
/**
 * 数据迁移测试
 */
describe('Data Migration Tests', () => {
  
  it('应该正确迁移用户数据', async () => {
    // 创建v1格式的用户数据
    const v1User = await createV1User();
    
    // 执行迁移
    await runDataMigration();
    
    // 验证v2端点可以访问迁移后的数据
    const response = await request(app)
      .get(`/api/v2/users/${v1User.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    
    expect(response.status).toBe(200);
    expect(response.body.id).toBe(v1User.id);
  });
  
  it('应该正确迁移权限数据', async () => {
    const v1Permissions = await createV1Permissions();
    
    await runPermissionMigration();
    
    const response = await request(app)
      .get('/api/v2/permissions')
      .set('Authorization', `Bearer ${adminToken}`);
    
    expect(response.status).toBe(200);
    expect(response.body.data.length).toBeGreaterThan(0);
  });
});
```

## 5. 性能测试设计

### 5.1 负载测试

```typescript
/**
 * 性能测试套件
 */
describe('Performance Tests', () => {
  
  describe('Load Testing', () => {
    it('认证端点应该处理高并发请求', async () => {
      const concurrentRequests = 100;
      const promises = [];
      
      for (let i = 0; i < concurrentRequests; i++) {
        promises.push(
          request(app)
            .post('/api/v2/auth/login')
            .send({
              username: `user${i}@example.com`,
              password: 'password'
            })
        );
      }
      
      const startTime = Date.now();
      const responses = await Promise.all(promises);
      const endTime = Date.now();
      
      const successfulResponses = responses.filter(r => r.status === 200);
      const averageResponseTime = (endTime - startTime) / concurrentRequests;
      
      expect(successfulResponses.length).toBeGreaterThan(concurrentRequests * 0.95); // 95%成功率
      expect(averageResponseTime).toBeLessThan(500); // 平均响应时间小于500ms
    });
    
    it('权限检查应该有良好的缓存性能', async () => {
      const userId = await createTestUser();
      
      // 第一次请求（缓存未命中）
      const startTime1 = Date.now();
      await request(app)
        .post(`/api/v2/users/${userId}/permissions/verify`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ permissions: [{ type: 'api', resource: '/api/v2/users', action: 'read' }] });
      const firstRequestTime = Date.now() - startTime1;
      
      // 第二次请求（缓存命中）
      const startTime2 = Date.now();
      await request(app)
        .post(`/api/v2/users/${userId}/permissions/verify`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ permissions: [{ type: 'api', resource: '/api/v2/users', action: 'read' }] });
      const secondRequestTime = Date.now() - startTime2;
      
      // 缓存命中应该显著提升性能
      expect(secondRequestTime).toBeLessThan(firstRequestTime * 0.5);
    });
  });
  
  describe('Database Performance', () => {
    it('用户列表查询应该有良好的分页性能', async () => {
      // 创建大量测试数据
      await createManyUsers(1000);
      
      const startTime = Date.now();
      const response = await request(app)
        .get('/api/v2/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ page: 1, limit: 50 });
      const responseTime = Date.now() - startTime;
      
      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(200); // 响应时间小于200ms
    });
  });
});
```

### 5.2 压力测试

```typescript
/**
 * 压力测试
 */
describe('Stress Tests', () => {
  
  it('OAuth令牌端点应该处理突发流量', async () => {
    const burstSize = 500;
    const promises = [];
    
    // 模拟突发的令牌请求
    for (let i = 0; i < burstSize; i++) {
      promises.push(
        request(app)
          .post('/api/v2/oauth/token')
          .send({
            grant_type: 'client_credentials',
            client_id: 'test-client',
            client_secret: 'test-secret'
          })
      );
    }
    
    const responses = await Promise.all(promises);
    const successfulResponses = responses.filter(r => r.status === 200);
    
    // 至少90%的请求应该成功
    expect(successfulResponses.length).toBeGreaterThan(burstSize * 0.9);
  });
  
  it('系统应该优雅处理资源耗尽', async () => {
    // 模拟大量并发连接
    const connections = [];
    
    try {
      for (let i = 0; i < 1000; i++) {
        connections.push(
          request(app)
            .get('/api/v2/system/health')
            .timeout(10000)
        );
      }
      
      const responses = await Promise.allSettled(connections);
      const errors = responses.filter(r => r.status === 'rejected');
      
      // 系统应该返回适当的错误响应而不是崩溃
      expect(errors.length).toBeLessThan(connections.length);
    } catch (error) {
      // 系统不应该完全崩溃
      expect(error.code).not.toBe('ECONNRESET');
    }
  });
});
```

## 6. 安全测试设计

### 6.1 认证安全测试

```typescript
/**
 * 安全测试套件
 */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../../app';
import { adminToken, userToken } from '../../utils/auth-helpers';

describe('Security Tests', () => {
  
  describe('Authentication Security', () => {
    it('应该防止JWT令牌伪造', async () => {
      const fakeToken = jwt.sign(
        { userId: 'admin', role: 'admin' },
        'wrong-secret'
      );
      
      const response = await request(app)
        .get('/api/v2/users')
        .set('Authorization', `Bearer ${fakeToken}`);
      
      expect(response.status).toBe(401);
    });
    
    it('应该防止令牌重放攻击', async () => {
      const token = await getValidToken();
      
      // 撤销令牌
      await request(app)
        .post('/api/v2/oauth/revoke')
        .auth('client-id', 'client-secret')
        .send({ token });
      
      // 尝试使用已撤销的令牌
      const response = await request(app)
        .get('/api/v2/users')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(401);
    });
    
    it('应该强制执行令牌过期', async () => {
      const expiredToken = jwt.sign(
        { userId: 'test', exp: Math.floor(Date.now() / 1000) - 3600 },
        process.env.JWT_SECRET
      );
      
      const response = await request(app)
        .get('/api/v2/users')
        .set('Authorization', `Bearer ${expiredToken}`);
      
      expect(response.status).toBe(401);
    });
  });
  
  describe('Authorization Security', () => {
    it('应该防止权限提升攻击', async () => {
      const userToken = await getUserToken(); // 普通用户令牌
      
      const response = await request(app)
        .post('/api/v2/users')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          username: 'newadmin',
          email: 'admin@example.com',
          role: 'admin' // 尝试创建管理员
        });
      
      expect(response.status).toBe(403);
    });
    
    it('应该防止横向权限访问', async () => {
      const user1Token = await getUserToken('user1');
      const user2Id = await createUser('user2');
      
      const response = await request(app)
        .get(`/api/v2/users/${user2Id}`)
        .set('Authorization', `Bearer ${user1Token}`);
      
      expect(response.status).toBe(403);
    });
  });
  
  describe('Input Validation Security', () => {
    it('应该防止SQL注入', async () => {
      const maliciousInput = "'; DROP TABLE users; --";
      
      const response = await request(app)
        .get('/api/v2/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ search: maliciousInput });
      
      expect(response.status).toBe(200); // 应该正常处理，不执行恶意SQL
      
      // 验证数据库完整性
      const usersStillExist = await request(app)
        .get('/api/v2/users')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(usersStillExist.status).toBe(200);
    });
    
    it('应该防止XSS攻击', async () => {
      const xssPayload = '<script>alert("XSS")</script>';
      
      const response = await request(app)
        .post('/api/v2/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          username: 'testuser',
          email: 'test@example.com',
          profile: {
            firstName: xssPayload
          }
        });
      
      expect(response.status).toBe(201);
      expect(response.body.profile.firstName).not.toContain('<script>');
    });
  });
});
```

### 6.2 OAuth2.1安全测试

```typescript
/**
 * OAuth2.1安全测试
 */
describe('OAuth2.1 Security Tests', () => {
  
  describe('Authorization Code Flow Security', () => {
    it('应该验证redirect_uri', async () => {
      const response = await request(app)
        .get('/api/v2/oauth/authorize')
        .query({
          client_id: 'test-client',
          response_type: 'code',
          redirect_uri: 'https://malicious-site.com/callback', // 未注册的URI
          scope: 'read'
        });
      
      expect(response.status).toBe(400);
    });
    
    it('应该防止CSRF攻击', async () => {
      const response = await request(app)
        .get('/api/v2/oauth/authorize')
        .query({
          client_id: 'test-client',
          response_type: 'code',
          redirect_uri: 'https://example.com/callback'
          // 缺少state参数
        });
      
      expect(response.status).toBe(400);
    });
    
    it('应该防止授权码重用', async () => {
      const authCode = await getAuthorizationCode();
      
      // 第一次使用授权码
      const firstResponse = await request(app)
        .post('/api/v2/oauth/token')
        .send({
          grant_type: 'authorization_code',
          code: authCode,
          client_id: 'test-client',
          client_secret: 'test-secret'
        });
      
      expect(firstResponse.status).toBe(200);
      
      // 尝试重用授权码
      const secondResponse = await request(app)
        .post('/api/v2/oauth/token')
        .send({
          grant_type: 'authorization_code',
          code: authCode,
          client_id: 'test-client',
          client_secret: 'test-secret'
        });
      
      expect(secondResponse.status).toBe(400);
    });
  });
  
  describe('PKCE Security', () => {
    it('应该要求PKCE用于公共客户端', async () => {
      const response = await request(app)
        .get('/api/v2/oauth/authorize')
        .query({
          client_id: 'public-client',
          response_type: 'code',
          redirect_uri: 'https://example.com/callback'
          // 缺少code_challenge
        });
      
      expect(response.status).toBe(400);
    });
    
    it('应该验证code_verifier', async () => {
      const codeChallenge = 'invalid-challenge';
      const authCode = await getAuthorizationCodeWithPKCE(codeChallenge);
      
      const response = await request(app)
        .post('/api/v2/oauth/token')
        .send({
          grant_type: 'authorization_code',
          code: authCode,
          client_id: 'public-client',
          code_verifier: 'wrong-verifier'
        });
      
      expect(response.status).toBe(400);
    });
  });
});
```

## 7. 集成测试设计

### 7.1 跨域集成测试

```typescript
/**
 * 跨域集成测试
 */
describe('Cross-Domain Integration Tests', () => {
  
  describe('Authentication and Authorization Integration', () => {
    it('完整的用户注册到权限验证流程', async () => {
      // 1. 用户注册
      const registerResponse = await request(app)
        .post('/api/v2/auth/register')
        .send({
          username: 'integrationuser',
          email: 'integration@example.com',
          password: 'SecurePassword123!'
        });
      
      expect(registerResponse.status).toBe(201);
      const userId = registerResponse.body.id;
      
      // 2. 用户登录
      const loginResponse = await request(app)
        .post('/api/v2/auth/login')
        .send({
          username: 'integrationuser',
          password: 'SecurePassword123!'
        });
      
      expect(loginResponse.status).toBe(200);
      const token = loginResponse.body.token;
      
      // 3. 创建角色和权限
      const roleResponse = await request(app)
        .post('/api/v2/permissions/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test Role',
          description: 'Integration test role'
        });
      
      const roleId = roleResponse.body.id;
      
      // 4. 分配角色给用户
      await request(app)
        .post(`/api/v2/users/${userId}/roles`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ roleIds: [roleId] });
      
      // 5. 验证用户权限
      const permissionResponse = await request(app)
        .get(`/api/v2/users/${userId}/permissions`)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(permissionResponse.status).toBe(200);
      expect(permissionResponse.body.roles).toContainEqual(
        expect.objectContaining({ id: roleId })
      );
    });
  });
  
  describe('OAuth and Permission Integration', () => {
    it('OAuth客户端权限范围验证', async () => {
      // 1. 创建OAuth客户端
      const clientResponse = await request(app)
        .post('/api/v2/oauth/clients')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Integration Test Client',
          redirectUris: ['https://example.com/callback'],
          scopes: ['read', 'write']
        });
      
      const clientId = clientResponse.body.clientId;
      const clientSecret = clientResponse.body.clientSecret;
      
      // 2. 获取访问令牌
      const tokenResponse = await request(app)
        .post('/api/v2/oauth/token')
        .send({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
          scope: 'read'
        });
      
      const accessToken = tokenResponse.body.access_token;
      
      // 3. 使用令牌访问API（应该成功）
      const readResponse = await request(app)
        .get('/api/v2/users')
        .set('Authorization', `Bearer ${accessToken}`);
      
      expect(readResponse.status).toBe(200);
      
      // 4. 尝试超出权限范围的操作（应该失败）
      const writeResponse = await request(app)
        .post('/api/v2/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          username: 'newuser',
          email: 'new@example.com'
        });
      
      expect(writeResponse.status).toBe(403);
    });
  });
});
```

### 7.2 数据一致性测试

```typescript
/**
 * 数据一致性测试
 */
describe('Data Consistency Tests', () => {
  
  it('用户删除应该级联清理相关数据', async () => {
    // 1. 创建用户和相关数据
    const userId = await createUserWithCompleteData();
    
    // 2. 验证相关数据存在
    const userRoles = await getUserRoles(userId);
    const userSessions = await getUserSessions(userId);
    const userAuditLogs = await getUserAuditLogs(userId);
    
    expect(userRoles.length).toBeGreaterThan(0);
    expect(userSessions.length).toBeGreaterThan(0);
    expect(userAuditLogs.length).toBeGreaterThan(0);
    
    // 3. 删除用户
    const deleteResponse = await request(app)
      .delete(`/api/v2/users/${userId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    
    expect(deleteResponse.status).toBe(204);
    
    // 4. 验证相关数据已清理
    const remainingRoles = await getUserRoles(userId);
    const remainingSessions = await getUserSessions(userId);
    
    expect(remainingRoles.length).toBe(0);
    expect(remainingSessions.length).toBe(0);
    // 审计日志应该保留用于合规性
    const remainingAuditLogs = await getUserAuditLogs(userId);
    expect(remainingAuditLogs.length).toBeGreaterThan(0);
  });
  
  it('角色权限变更应该实时生效', async () => {
    const userId = await createTestUser();
    const roleId = await createTestRole();
    
    // 1. 分配角色
    await request(app)
      .post(`/api/v2/users/${userId}/roles`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ roleIds: [roleId] });
    
    // 2. 验证权限立即生效
    const permissionResponse = await request(app)
      .post(`/api/v2/users/${userId}/permissions/verify`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        permissions: [{ type: 'api', resource: '/api/v2/users', action: 'read' }]
      });
    
    expect(permissionResponse.body.results[0].hasPermission).toBe(true);
    
    // 3. 移除角色
    await request(app)
      .delete(`/api/v2/users/${userId}/roles/${roleId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    
    // 4. 验证权限立即失效
    const updatedPermissionResponse = await request(app)
      .post(`/api/v2/users/${userId}/permissions/verify`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        permissions: [{ type: 'api', resource: '/api/v2/users', action: 'read' }]
      });
    
    expect(updatedPermissionResponse.body.results[0].hasPermission).toBe(false);
  });
});
```

## 8. 端到端测试设计

### 8.1 业务流程测试

```typescript
/**
 * 端到端业务流程测试
 */
describe('End-to-End Business Flow Tests', () => {
  
  describe('完整的用户生命周期', () => {
    it('从注册到权限管理的完整流程', async () => {
      // 1. 管理员创建组织结构
      const orgResponse = await request(app)
        .post('/api/v2/system/organizations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test Department',
          type: 'department'
        });
      
      const orgId = orgResponse.body.id;
      
      // 2. 创建角色和权限
      const roleResponse = await request(app)
        .post('/api/v2/permissions/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Department Manager',
          description: 'Manages department users',
          organizationId: orgId
        });
      
      const roleId = roleResponse.body.id;
      
      // 3. 用户注册
      const userResponse = await request(app)
        .post('/api/v2/auth/register')
        .send({
          username: 'deptmanager',
          email: 'manager@company.com',
          password: 'SecurePassword123!',
          organizationId: orgId
        });
      
      const userId = userResponse.body.id;
      
      // 4. 管理员分配角色
      await request(app)
        .post(`/api/v2/users/${userId}/roles`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ roleIds: [roleId] });
      
      // 5. 用户登录
      const loginResponse = await request(app)
        .post('/api/v2/auth/login')
        .send({
          username: 'deptmanager',
          password: 'SecurePassword123!'
        });
      
      const userToken = loginResponse.body.token;
      
      // 6. 验证用户可以访问被授权的资源
      const accessResponse = await request(app)
        .get('/api/v2/users')
        .set('Authorization', `Bearer ${userToken}`)
        .query({ organizationId: orgId });
      
      expect(accessResponse.status).toBe(200);
      
      // 7. 验证审计日志记录了完整流程
      const auditResponse = await request(app)
        .get('/api/v2/audit/logs')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ userId, action: 'role_assigned' });
      
      expect(auditResponse.body.data.length).toBeGreaterThan(0);
    });
  });
  
  describe('OAuth2.1完整授权流程', () => {
    it('从客户端注册到API访问的完整流程', async () => {
      // 1. 注册OAuth客户端
      const clientResponse = await request(app)
        .post('/api/v2/oauth/clients')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'E2E Test App',
          redirectUris: ['https://testapp.com/callback'],
          scopes: ['read', 'write'],
          grantTypes: ['authorization_code', 'refresh_token']
        });
      
      const { clientId, clientSecret } = clientResponse.body;
      
      // 2. 用户授权流程
      const authResponse = await request(app)
        .get('/api/v2/oauth/authorize')
        .query({
          client_id: clientId,
          response_type: 'code',
          redirect_uri: 'https://testapp.com/callback',
          scope: 'read write',
          state: 'random-state-123'
        });
      
      expect(authResponse.status).toBe(200);
      
      // 3. 模拟用户同意授权
      const consentResponse = await request(app)
        .post('/api/v2/oauth/authorize')
        .send({
          client_id: clientId,
          response_type: 'code',
          redirect_uri: 'https://testapp.com/callback',
          scope: 'read write',
          state: 'random-state-123',
          consent: true
        })
        .set('Authorization', `Bearer ${userToken}`);
      
      // 4. 提取授权码
      const authCode = extractAuthCodeFromRedirect(consentResponse.headers.location);
      
      // 5. 交换访问令牌
      const tokenResponse = await request(app)
        .post('/api/v2/oauth/token')
        .send({
          grant_type: 'authorization_code',
          code: authCode,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: 'https://testapp.com/callback'
        });
      
      expect(tokenResponse.status).toBe(200);
      const { access_token, refresh_token } = tokenResponse.body;
      
      // 6. 使用访问令牌调用API
      const apiResponse = await request(app)
        .get('/api/v2/users/me')
        .set('Authorization', `Bearer ${access_token}`);
      
      expect(apiResponse.status).toBe(200);
      
      // 7. 使用刷新令牌获取新的访问令牌
      const refreshResponse = await request(app)
        .post('/api/v2/oauth/token')
        .send({
          grant_type: 'refresh_token',
          refresh_token: refresh_token,
          client_id: clientId,
          client_secret: clientSecret
        });
      
      expect(refreshResponse.status).toBe(200);
      expect(refreshResponse.body.access_token).toBeDefined();
    });
  });
});
```

## 9. 自动化测试框架

### 9.1 测试基础设施

```typescript
/**
 * 测试基础设施配置
 */

// 测试数据库配置
export const testDbConfig = {
  host: process.env.TEST_DB_HOST || 'localhost',
  port: parseInt(process.env.TEST_DB_PORT || '5433'),
  database: process.env.TEST_DB_NAME || 'api_test',
  username: process.env.TEST_DB_USER || 'test_user',
  password: process.env.TEST_DB_PASS || 'test_pass',
  synchronize: true,
  dropSchema: true,
  logging: false
};

// 测试应用工厂
export async function createTestApp() {
  const app = await createApp({
    database: testDbConfig,
    redis: {
      host: 'localhost',
      port: 6380, // 测试Redis端口
      db: 1
    },
    jwt: {
      secret: 'test-jwt-secret',
      expiresIn: '1h'
    }
  });
  
  return app;
}

// 测试数据清理
export async function cleanupTestData() {
  const connection = await getConnection();
  const entities = connection.entityMetadatas;
  
  for (const entity of entities) {
    const repository = connection.getRepository(entity.name);
    await repository.clear();
  }
}

// 测试数据种子
export async function seedTestData() {
  // 创建基础角色和权限
  const adminRole = await createRole({
    name: 'admin',
    description: 'System Administrator'
  });
  
  const userRole = await createRole({
    name: 'user',
    description: 'Regular User'
  });
  
  // 创建基础权限
  const permissions = [
    { type: 'api', resource: '/api/v2/users', action: 'read' },
    { type: 'api', resource: '/api/v2/users', action: 'write' },
    { type: 'menu', resource: 'user-management', action: 'access' }
  ];
  
  for (const perm of permissions) {
    await createPermission(perm);
  }
  
  // 创建测试用户
  const adminUser = await createUser({
    username: 'admin',
    email: 'admin@test.com',
    password: 'admin123',
    roles: [adminRole]
  });
  
  const regularUser = await createUser({
    username: 'user',
    email: 'user@test.com',
    password: 'user123',
    roles: [userRole]
  });
  
  return { adminUser, regularUser, adminRole, userRole };
}
```

### 9.2 测试工具类

```typescript
/**
 * 测试工具类
 */

export class TestHelper {
  private app: Application;
  private adminToken: string;
  private userToken: string;
  
  constructor(app: Application) {
    this.app = app;
  }
  
  async initialize() {
    await cleanupTestData();
    const seedData = await seedTestData();
    
    // 获取管理员令牌
    const adminLoginResponse = await request(this.app)
      .post('/api/v2/auth/login')
      .send({
        username: 'admin',
        password: 'admin123'
      });
    
    this.adminToken = adminLoginResponse.body.token;
    
    // 获取普通用户令牌
    const userLoginResponse = await request(this.app)
      .post('/api/v2/auth/login')
      .send({
        username: 'user',
        password: 'user123'
      });
    
    this.userToken = userLoginResponse.body.token;
  }
  
  getAdminToken(): string {
    return this.adminToken;
  }
  
  getUserToken(): string {
    return this.userToken;
  }
  
  async createTestUser(userData: Partial<CreateUserDto> = {}): Promise<string> {
    const defaultData = {
      username: `testuser_${Date.now()}`,
      email: `test_${Date.now()}@example.com`,
      password: 'TestPassword123!'
    };
    
    const response = await request(this.app)
      .post('/api/v2/users')
      .set('Authorization', `Bearer ${this.adminToken}`)
      .send({ ...defaultData, ...userData });
    
    return response.body.id;
  }
  
  async createTestRole(roleData: Partial<CreateRoleDto> = {}): Promise<string> {
    const defaultData = {
      name: `testrole_${Date.now()}`,
      description: 'Test role'
    };
    
    const response = await request(this.app)
      .post('/api/v2/permissions/roles')
      .set('Authorization', `Bearer ${this.adminToken}`)
      .send({ ...defaultData, ...roleData });
    
    return response.body.id;
  }
  
  async createOAuthClient(clientData: Partial<CreateClientDto> = {}): Promise<OAuthClient> {
    const defaultData = {
      name: `testclient_${Date.now()}`,
      redirectUris: ['https://example.com/callback'],
      scopes: ['read', 'write']
    };
    
    const response = await request(this.app)
      .post('/api/v2/oauth/clients')
      .set('Authorization', `Bearer ${this.adminToken}`)
      .send({ ...defaultData, ...clientData });
    
    return response.body;
  }
  
  async getAuthorizationCode(clientId: string, userId?: string): Promise<string> {
    const token = userId ? await this.getUserTokenById(userId) : this.userToken;
    
    const response = await request(this.app)
      .post('/api/v2/oauth/authorize')
      .set('Authorization', `Bearer ${token}`)
      .send({
        client_id: clientId,
        response_type: 'code',
        redirect_uri: 'https://example.com/callback',
        scope: 'read write',
        state: 'test-state',
        consent: true
      });
    
    return this.extractAuthCodeFromRedirect(response.headers.location);
  }
  
  private extractAuthCodeFromRedirect(location: string): string {
    const url = new URL(location);
    return url.searchParams.get('code')!;
  }
  
  async waitForAsyncOperation(operation: () => Promise<any>, timeout = 5000): Promise<any> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        return await operation();
      } catch (error) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    throw new Error('Async operation timed out');
  }
}
```

## 10. 测试数据管理

### 10.1 测试数据工厂

```typescript
/**
 * 测试数据工厂
 */

export class TestDataFactory {
  
  static createUserData(overrides: Partial<CreateUserDto> = {}): CreateUserDto {
    return {
      username: faker.internet.userName(),
      email: faker.internet.email(),
      password: 'TestPassword123!',
      profile: {
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
        phone: faker.phone.number(),
        avatar: faker.image.avatar()
      },
      ...overrides
    };
  }
  
  static createRoleData(overrides: Partial<CreateRoleDto> = {}): CreateRoleDto {
    return {
      name: faker.company.name().toLowerCase().replace(/\s+/g, '-'),
      description: faker.lorem.sentence(),
      ...overrides
    };
  }
  
  static createOAuthClientData(overrides: Partial<CreateClientDto> = {}): CreateClientDto {
    return {
      name: faker.company.name(),
      description: faker.lorem.sentence(),
      redirectUris: [faker.internet.url()],
      scopes: ['read', 'write'],
      grantTypes: ['authorization_code', 'refresh_token'],
      ...overrides
    };
  }
  
  static createPermissionData(overrides: Partial<CreatePermissionDto> = {}): CreatePermissionDto {
    return {
      type: 'api',
      resource: `/api/v2/${faker.lorem.word()}`,
      action: faker.helpers.arrayElement(['read', 'write', 'delete']),
      description: faker.lorem.sentence(),
      ...overrides
    };
  }
  
  static async createCompleteUserWithRoles(helper: TestHelper): Promise<{
    userId: string;
    roleIds: string[];
    permissions: string[];
  }> {
    // 创建权限
    const permissions = [];
    for (let i = 0; i < 3; i++) {
      const permData = this.createPermissionData();
      const permResponse = await request(helper['app'])
        .post('/api/v2/permissions')
        .set('Authorization', `Bearer ${helper.getAdminToken()}`)
        .send(permData);
      permissions.push(permResponse.body.id);
    }
    
    // 创建角色并分配权限
    const roleIds = [];
    for (let i = 0; i < 2; i++) {
      const roleData = this.createRoleData();
      const roleResponse = await request(helper['app'])
        .post('/api/v2/permissions/roles')
        .set('Authorization', `Bearer ${helper.getAdminToken()}`)
        .send(roleData);
      
      const roleId = roleResponse.body.id;
      roleIds.push(roleId);
      
      // 分配权限给角色
      await request(helper['app'])
        .post(`/api/v2/permissions/roles/${roleId}/permissions`)
        .set('Authorization', `Bearer ${helper.getAdminToken()}`)
        .send({ permissionIds: permissions.slice(0, 2) });
    }
    
    // 创建用户并分配角色
    const userData = this.createUserData();
    const userResponse = await request(helper['app'])
      .post('/api/v2/users')
      .set('Authorization', `Bearer ${helper.getAdminToken()}`)
      .send(userData);
    
    const userId = userResponse.body.id;
    
    await request(helper['app'])
      .post(`/api/v2/users/${userId}/roles`)
      .set('Authorization', `Bearer ${helper.getAdminToken()}`)
      .send({ roleIds });
    
    return { userId, roleIds, permissions };
  }
}
```

### 10.2 测试数据清理策略

```typescript
/**
 * 测试数据清理策略
 */

export class TestDataCleaner {
  
  static async cleanupByTestSuite(suiteName: string) {
    // 清理特定测试套件的数据
    const testPrefix = `test_${suiteName}_`;
    
    await this.cleanupUsers(testPrefix);
    await this.cleanupRoles(testPrefix);
    await this.cleanupOAuthClients(testPrefix);
    await this.cleanupAuditLogs(testPrefix);
  }
  
  static async cleanupUsers(prefix: string) {
    const userRepository = getRepository(User);
    await userRepository.delete({
      username: Like(`${prefix}%`)
    });
  }
  
  static async cleanupRoles(prefix: string) {
    const roleRepository = getRepository(Role);
    await roleRepository.delete({
      name: Like(`${prefix}%`)
    });
  }
  
  static async cleanupOAuthClients(prefix: string) {
    const clientRepository = getRepository(OAuthClient);
    await clientRepository.delete({
      name: Like(`${prefix}%`)
    });
  }
  
  static async cleanupAuditLogs(prefix: string) {
    const auditRepository = getRepository(AuditLog);
    await auditRepository.delete({
      userId: Like(`${prefix}%`)
    });
  }
  
  static async fullCleanup() {
    // 完全清理所有测试数据
    const entities = [
      'audit_logs',
      'user_roles',
      'role_permissions',
      'oauth_tokens',
      'oauth_clients',
      'permissions',
      'roles',
      'users'
    ];
    
    const connection = getConnection();
    
    for (const entity of entities) {
       await connection.query(`TRUNCATE TABLE ${entity} CASCADE`);
     }
   }
 }
 ```

## 11. CI/CD集成

### 11.1 GitHub Actions配置

```yaml
# .github/workflows/api-tests.yml
name: API Tests

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:14
        env:
          POSTGRES_PASSWORD: test_pass
          POSTGRES_USER: test_user
          POSTGRES_DB: api_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5433:5432
      
      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 6380:6379
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run linting
      run: npm run lint
    
    - name: Run type checking
      run: npm run type-check
    
    - name: Run unit tests
      run: npm run test:unit
      env:
        NODE_ENV: test
    
    - name: Run integration tests
      run: npm run test:integration
      env:
        NODE_ENV: test
        TEST_DB_HOST: localhost
        TEST_DB_PORT: 5433
        TEST_DB_NAME: api_test
        TEST_DB_USER: test_user
        TEST_DB_PASS: test_pass
        REDIS_HOST: localhost
        REDIS_PORT: 6380
    
    - name: Run E2E tests
      run: npm run test:e2e
      env:
        NODE_ENV: test
        TEST_DB_HOST: localhost
        TEST_DB_PORT: 5433
        TEST_DB_NAME: api_test
        TEST_DB_USER: test_user
        TEST_DB_PASS: test_pass
        REDIS_HOST: localhost
        REDIS_PORT: 6380
    
    - name: Generate test coverage
      run: npm run test:coverage
    
    - name: Upload coverage to Codecov
      uses: codecov/codecov-action@v3
      with:
        file: ./coverage/lcov.info
        flags: unittests
        name: codecov-umbrella
    
    - name: Run security audit
      run: npm audit --audit-level moderate
    
    - name: Run performance tests
      run: npm run test:performance
      if: github.event_name == 'push' && github.ref == 'refs/heads/main'
```

### 11.2 测试脚本配置

```json
{
  "scripts": {
    "test": "vitest",
    "test:unit": "vitest run --config vitest.config.unit.ts",
    "test:integration": "vitest run --config vitest.config.integration.ts",
    "test:e2e": "vitest run --config vitest.config.e2e.ts",
    "test:coverage": "vitest run --coverage",
    "test:performance": "artillery run tests/performance/load-test.yml",
    "test:watch": "vitest",
    "test:ui": "vitest --ui",
    "test:debug": "vitest --inspect-brk",
    "lint": "eslint src tests --ext .ts",
    "type-check": "tsc --noEmit"
  }
}
```

### 11.3 Vitest配置

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: [
      'tests/**/*.{test,spec}.{js,ts}',
      'src/**/*.{test,spec}.{js,ts}'
    ],
    exclude: [
      'node_modules',
      'dist',
      '.next'
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
      include: [
        'src/**/*.ts',
        'app/**/*.ts'
      ],
      exclude: [
        'src/**/*.d.ts',
        'src/migrations/**',
        'src/seeds/**',
        'app/**/layout.tsx',
        'app/**/page.tsx'
      ],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80
      }
    },
    testTimeout: 30000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true // 对于集成测试，避免数据库冲突
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '~': path.resolve(__dirname, './app')
    }
  }
});

// vitest.config.unit.ts
import { defineConfig } from 'vitest/config';
import baseConfig from './vitest.config';

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: ['tests/unit/**/*.{test,spec}.{js,ts}'],
    name: 'unit'
  }
});

// vitest.config.integration.ts
import { defineConfig } from 'vitest/config';
import baseConfig from './vitest.config';

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: ['tests/integration/**/*.{test,spec}.{js,ts}'],
    name: 'integration',
    testTimeout: 60000
  }
});

// vitest.config.e2e.ts
import { defineConfig } from 'vitest/config';
import baseConfig from './vitest.config';

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: ['tests/e2e/**/*.{test,spec}.{js,ts}'],
    name: 'e2e',
    testTimeout: 120000
  }
});
```

## 12. 性能测试

### 12.1 负载测试配置

```yaml
# tests/performance/load-test.yml
config:
  target: 'http://localhost:3000'
  phases:
    - duration: 60
      arrivalRate: 10
      name: "Warm up"
    - duration: 120
      arrivalRate: 50
      name: "Ramp up load"
    - duration: 300
      arrivalRate: 100
      name: "Sustained load"
  processor: "./performance-processor.js"
  
scenarios:
  - name: "Authentication Flow"
    weight: 30
    flow:
      - post:
          url: "/api/v2/auth/login"
          json:
            username: "testuser"
            password: "testpass"
          capture:
            - json: "$.token"
              as: "authToken"
      - get:
          url: "/api/v2/users/me"
          headers:
            Authorization: "Bearer {{ authToken }}"
  
  - name: "User Management"
    weight: 25
    flow:
      - function: "generateAuthToken"
      - get:
          url: "/api/v2/users"
          headers:
            Authorization: "Bearer {{ authToken }}"
      - post:
          url: "/api/v2/users"
          headers:
            Authorization: "Bearer {{ authToken }}"
          json:
            username: "{{ $randomString() }}"
            email: "{{ $randomString() }}@test.com"
            password: "TestPass123!"
  
  - name: "Permission Verification"
    weight: 20
    flow:
      - function: "generateAuthToken"
      - post:
          url: "/api/v2/users/{{ userId }}/permissions/verify"
          headers:
            Authorization: "Bearer {{ authToken }}"
          json:
            permissions:
              - type: "api"
                resource: "/api/v2/users"
                action: "read"
  
  - name: "OAuth Flow"
    weight: 15
    flow:
      - get:
          url: "/api/v2/oauth/authorize"
          qs:
            client_id: "{{ clientId }}"
            response_type: "code"
            redirect_uri: "https://example.com/callback"
            scope: "read write"
      - post:
          url: "/api/v2/oauth/token"
          json:
            grant_type: "authorization_code"
            code: "{{ authCode }}"
            client_id: "{{ clientId }}"
            client_secret: "{{ clientSecret }}"
  
  - name: "Audit Logs"
    weight: 10
    flow:
      - function: "generateAuthToken"
      - get:
          url: "/api/v2/audit/logs"
          headers:
            Authorization: "Bearer {{ authToken }}"
          qs:
            limit: 50
            offset: 0
```

### 12.2 性能测试处理器

```javascript
// tests/performance/performance-processor.js
module.exports = {
  generateAuthToken,
  generateTestData,
  validateResponse
};

function generateAuthToken(context, events, done) {
  // 生成测试用的认证令牌
  context.vars.authToken = 'test-admin-token';
  context.vars.userId = 'test-user-id';
  context.vars.clientId = 'test-client-id';
  context.vars.clientSecret = 'test-client-secret';
  context.vars.authCode = 'test-auth-code';
  return done();
}

function generateTestData(context, events, done) {
  context.vars.randomUsername = `user_${Math.random().toString(36).substr(2, 9)}`;
  context.vars.randomEmail = `${context.vars.randomUsername}@test.com`;
  return done();
}

function validateResponse(requestParams, response, context, ee, next) {
  if (response.statusCode !== 200) {
    ee.emit('error', `Unexpected status code: ${response.statusCode}`);
  }
  return next();
}
```

### 12.3 压力测试

```typescript
/**
 * 压力测试套件
 */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../../app';
import { createTestUser, createTestRole } from '../../utils/test-helpers';

describe('Stress Tests', () => {
  
  describe('高并发用户认证', () => {
    it('应该能处理1000个并发登录请求', async () => {
      const concurrentRequests = 1000;
      const promises = [];
      
      for (let i = 0; i < concurrentRequests; i++) {
        const promise = request(app)
          .post('/api/v2/auth/login')
          .send({
            username: `user${i}`,
            password: 'testpass'
          });
        promises.push(promise);
      }
      
      const startTime = Date.now();
      const responses = await Promise.allSettled(promises);
      const endTime = Date.now();
      
      const successfulResponses = responses.filter(
        result => result.status === 'fulfilled' && result.value.status === 200
      );
      
      const responseTime = endTime - startTime;
      const averageResponseTime = responseTime / concurrentRequests;
      
      expect(successfulResponses.length).toBeGreaterThan(concurrentRequests * 0.95); // 95%成功率
      expect(averageResponseTime).toBeLessThan(1000); // 平均响应时间小于1秒
    });
  });
  
  describe('权限验证性能', () => {
    it('应该能快速处理大量权限验证请求', async () => {
      const userId = await createTestUser();
      const roleId = await createTestRole();
      
      // 分配角色
      await request(app)
        .post(`/api/v2/users/${userId}/roles`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ roleIds: [roleId] });
      
      const verificationRequests = 500;
      const promises = [];
      
      for (let i = 0; i < verificationRequests; i++) {
        const promise = request(app)
          .post(`/api/v2/users/${userId}/permissions/verify`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            permissions: [
              { type: 'api', resource: '/api/v2/users', action: 'read' }
            ]
          });
        promises.push(promise);
      }
      
      const startTime = Date.now();
      const responses = await Promise.all(promises);
      const endTime = Date.now();
      
      const responseTime = endTime - startTime;
      const averageResponseTime = responseTime / verificationRequests;
      
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.results[0].hasPermission).toBe(true);
      });
      
      expect(averageResponseTime).toBeLessThan(100); // 平均响应时间小于100ms
    });
  });
  
  describe('数据库连接池测试', () => {
    it('应该能处理数据库连接池耗尽的情况', async () => {
      const maxConnections = 20; // 假设连接池大小为20
      const promises = [];
      
      // 创建超过连接池大小的并发请求
      for (let i = 0; i < maxConnections + 10; i++) {
        const promise = request(app)
          .get('/api/v2/users')
          .set('Authorization', `Bearer ${adminToken}`);
        promises.push(promise);
      }
      
      const responses = await Promise.allSettled(promises);
      
      const successfulResponses = responses.filter(
        result => result.status === 'fulfilled' && result.value.status === 200
      );
      
      // 所有请求都应该成功，即使超过了连接池大小
      expect(successfulResponses.length).toBe(maxConnections + 10);
    });
  });
});
```

## 13. 质量保证

### 13.1 代码质量检查

```typescript
/**
 * 代码质量检查配置
 */

// ESLint配置
// .eslintrc.js
module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint/eslint-plugin'],
  extends: [
    '@typescript-eslint/recommended',
    'prettier',
    'prettier/@typescript-eslint',
  ],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: ['.eslintrc.js'],
  rules: {
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'error',
    '@typescript-eslint/explicit-module-boundary-types': 'error',
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': 'error',
    'prefer-const': 'error',
    'no-var': 'error'
  },
};
```

### 13.2 安全测试

```typescript
/**
 * 安全测试套件
 */
describe('Security Tests', () => {
  
  describe('SQL注入防护', () => {
    it('应该防止SQL注入攻击', async () => {
      const maliciousInput = "'; DROP TABLE users; --";
      
      const response = await request(app)
        .get('/api/v2/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ search: maliciousInput });
      
      expect(response.status).toBe(200);
      
      // 验证数据库表仍然存在
      const usersResponse = await request(app)
        .get('/api/v2/users')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(usersResponse.status).toBe(200);
    });
  });
  
  describe('XSS防护', () => {
    it('应该过滤恶意脚本', async () => {
      const xssPayload = '<script>alert("XSS")</script>';
      
      const response = await request(app)
        .post('/api/v2/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          username: 'testuser',
          email: 'test@example.com',
          password: 'TestPass123!',
          profile: {
            firstName: xssPayload
          }
        });
      
      expect(response.status).toBe(201);
      
      const userId = response.body.id;
      const getUserResponse = await request(app)
        .get(`/api/v2/users/${userId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(getUserResponse.body.profile.firstName).not.toContain('<script>');
    });
  });
  
  describe('认证绕过测试', () => {
    it('应该拒绝无效的JWT令牌', async () => {
      const invalidToken = 'invalid.jwt.token';
      
      const response = await request(app)
        .get('/api/v2/users')
        .set('Authorization', `Bearer ${invalidToken}`);
      
      expect(response.status).toBe(401);
    });
    
    it('应该拒绝过期的JWT令牌', async () => {
      // 创建一个过期的令牌
      const expiredToken = jwt.sign(
        { userId: 'test-user-id' },
        'jwt-secret',
        { expiresIn: '-1h' }
      );
      
      const response = await request(app)
        .get('/api/v2/users')
        .set('Authorization', `Bearer ${expiredToken}`);
      
      expect(response.status).toBe(401);
    });
  });
  
  describe('权限提升测试', () => {
    it('普通用户不应该能访问管理员功能', async () => {
      const response = await request(app)
        .post('/api/v2/users')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          username: 'newuser',
          email: 'new@example.com',
          password: 'TestPass123!'
        });
      
      expect(response.status).toBe(403);
    });
  });
  
  describe('速率限制测试', () => {
    it('应该限制登录尝试次数', async () => {
      const maxAttempts = 5;
      const promises = [];
      
      for (let i = 0; i < maxAttempts + 2; i++) {
        const promise = request(app)
          .post('/api/v2/auth/login')
          .send({
            username: 'testuser',
            password: 'wrongpassword'
          });
        promises.push(promise);
      }
      
      const responses = await Promise.all(promises);
      
      // 前5次应该返回401，后面的应该返回429
      const unauthorizedResponses = responses.filter(r => r.status === 401);
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      
      expect(unauthorizedResponses.length).toBe(maxAttempts);
      expect(rateLimitedResponses.length).toBe(2);
    });
  });
});
```

## 14. 实施建议

### 14.1 分阶段实施计划

#### 第一阶段：基础测试框架搭建（1-2周）

1. **测试环境配置**
   - 配置测试数据库和Redis
   - 设置Jest测试框架
   - 创建测试工具类和辅助函数

2. **单元测试实施**
   - 为核心业务逻辑编写单元测试
   - 实现测试数据工厂
   - 达到80%的代码覆盖率

3. **CI/CD集成**
   - 配置GitHub Actions
   - 设置自动化测试流水线
   - 集成代码质量检查

#### 第二阶段：集成测试实施（2-3周）

1. **API集成测试**
   - 实现统一路由架构的集成测试
   - 覆盖OAuth2.1认证流程
   - 测试权限管理系统

2. **数据一致性测试**
   - 实现事务测试
   - 测试数据完整性约束
   - 验证级联操作

3. **错误处理测试**
   - 测试异常情况处理
   - 验证错误响应格式
   - 测试降级策略

#### 第三阶段：端到端测试和性能优化（2-3周）

1. **端到端测试**
   - 实现完整业务流程测试
   - 测试用户生命周期
   - 验证系统集成点

2. **性能测试**
   - 实施负载测试
   - 进行压力测试
   - 优化性能瓶颈

3. **安全测试**
   - 实施安全测试套件
   - 进行渗透测试
   - 修复安全漏洞

### 14.2 质量保证措施

1. **代码审查**
   - 所有测试代码必须经过代码审查
   - 确保测试用例的有效性和完整性
   - 验证测试数据的合理性

2. **测试覆盖率**
   - 单元测试覆盖率不低于80%
   - 集成测试覆盖所有API端点
   - 端到端测试覆盖主要业务流程

3. **持续监控**
   - 监控测试执行时间
   - 跟踪测试失败率
   - 定期评估测试有效性

### 14.3 团队培训

1. **测试最佳实践培训**
   - 测试驱动开发(TDD)方法
   - 测试用例设计原则
   - 测试数据管理策略

2. **工具使用培训**
   - Vitest测试框架使用
   - 测试工具类使用
   - CI/CD流水线操作

3. **质量意识培养**
   - 代码质量标准
   - 测试重要性认知
   - 持续改进文化

## 15. 预期收益

### 15.1 质量提升

1. **缺陷减少**
   - 生产环境缺陷减少70%
   - 关键功能稳定性提升90%
   - 用户体验显著改善

2. **代码质量**
   - 代码覆盖率达到80%以上
   - 代码可维护性提升
   - 技术债务减少

### 15.2 开发效率

1. **快速反馈**
   - 问题发现时间缩短80%
   - 修复成本降低60%
   - 发布周期缩短50%

2. **开发信心**
   - 重构风险降低
   - 新功能开发更安全
   - 团队开发效率提升

### 15.3 运维保障

1. **系统稳定性**
   - 系统可用性提升至99.9%
   - 性能问题提前发现
   - 容量规划更准确

2. **安全保障**
   - 安全漏洞提前发现
   - 合规性要求满足
   - 风险控制能力增强

## 16. 结论

本API路由测试设计优化方案基于现有的API路由优化报告，提供了全面的测试策略和实施方案。通过分层测试架构、自动化测试框架、CI/CD集成和质量保证措施，能够有效保障API路由优化后的系统质量和稳定性。

方案的核心优势包括：

1. **全面覆盖**：从单元测试到端到端测试的完整覆盖
2. **自动化程度高**：CI/CD集成实现自动化测试和部署
3. **质量保证**：多层次的质量检查和安全测试
4. **可维护性强**：模块化的测试架构和工具类设计
5. **性能优化**：专门的性能测试和压力测试

建议按照分阶段实施计划逐步推进，确保每个阶段的质量和效果，最终实现API路由系统的高质量交付和稳定运行。
```