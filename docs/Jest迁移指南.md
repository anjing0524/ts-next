# Jest 测试框架迁移指南

**版本**: v1.0.0  
**日期**: 2024年12月  
**项目**: TypeScript Next.js Template  
**迁移目标**: 从 Vitest 迁移到 Jest  

## 📋 迁移概述

本指南详细说明如何将项目的测试框架从 Vitest 迁移到 Jest，确保测试功能的完整性和性能的提升。

### 🎯 迁移目标

- ✅ 保持现有测试用例的功能完整性
- ✅ 提升测试执行性能和稳定性
- ✅ 改善开发者测试体验
- ✅ 统一团队测试工具链

## 🔄 迁移步骤

### 步骤 1: 安装 Jest 依赖

```bash
# 卸载 Vitest 相关依赖
npm uninstall vitest @vitest/ui @vitest/coverage-v8 vitest-environment-node

# 安装 Jest 相关依赖
npm install --save-dev jest @types/jest ts-jest jest-environment-node
npm install --save-dev @jest/globals jest-extended
npm install --save-dev babel-jest @babel/preset-env @babel/preset-typescript
```

### 步骤 2: 创建 Jest 配置文件

#### jest.config.js
```javascript
/** @type {import('jest').Config} */
module.exports = {
  // 基础配置
  preset: 'ts-jest',
  testEnvironment: 'node',
  
  // 测试文件匹配规则
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/__tests__/**/*.test.js',
    '**/?(*.)+(spec|test).ts',
    '**/?(*.)+(spec|test).js'
  ],
  
  // 测试根目录
  roots: [
    '<rootDir>/app',
    '<rootDir>/lib',
    '<rootDir>/__tests__'
  ],
  
  // 模块路径映射
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@/lib/(.*)$': '<rootDir>/lib/$1',
    '^@/app/(.*)$': '<rootDir>/app/$1',
    '^@/components/(.*)$': '<rootDir>/components/$1'
  },
  
  // 覆盖率配置
  collectCoverageFrom: [
    'app/api/**/*.ts',
    'lib/**/*.ts',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/__tests__/**',
    '!**/coverage/**'
  ],
  
  // 覆盖率阈值
  coverageThreshold: {
    global: {
      branches: 75,
      functions: 85,
      lines: 80,
      statements: 80
    },
    // API 路由要求更高覆盖率
    'app/api/**/*.ts': {
      branches: 85,
      functions: 90,
      lines: 90,
      statements: 90
    }
  },
  
  // 覆盖率报告格式
  coverageReporters: [
    'text',
    'lcov',
    'html',
    'json-summary'
  ],
  
  // 设置文件
  setupFilesAfterEnv: [
    '<rootDir>/jest.setup.ts'
  ],
  
  // 转换配置
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest'
  },
  
  // 模块文件扩展名
  moduleFileExtensions: [
    'ts',
    'tsx',
    'js',
    'jsx',
    'json'
  ],
  
  // 忽略转换的模块
  transformIgnorePatterns: [
    'node_modules/(?!(.*\\.mjs$))'
  ],
  
  // 测试超时时间
  testTimeout: 10000,
  
  // 清除模拟
  clearMocks: true,
  restoreMocks: true,
  
  // 详细输出
  verbose: true
};
```

#### jest.setup.ts
```typescript
/**
 * Jest 全局设置文件
 * 配置测试环境和全局模拟
 */

import 'jest-extended';
import { PrismaClient } from '@prisma/client';

// 全局变量声明
declare global {
  var __PRISMA__: PrismaClient;
}

// 环境变量设置
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'file:./test.db';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
process.env.OAUTH2_PRIVATE_KEY = 'test-private-key';
process.env.OAUTH2_PUBLIC_KEY = 'test-public-key';

// 模拟 console 方法（可选）
global.console = {
  ...console,
  // 在测试中静默某些日志
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

// 数据库连接设置
beforeAll(async () => {
  // 初始化测试数据库连接
});

afterAll(async () => {
  // 清理数据库连接
  if (global.__PRISMA__) {
    await global.__PRISMA__.$disconnect();
  }
});

// 每个测试后清理
afterEach(async () => {
  // 清理测试数据
  jest.clearAllMocks();
});
```

### 步骤 3: 更新 package.json

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:ci": "jest --ci --coverage --watchAll=false",
    "test:debug": "node --inspect-brk node_modules/.bin/jest --runInBand",
    "test:unit": "jest --testPathPattern=__tests__/unit",
    "test:integration": "jest --testPathPattern=__tests__/integration",
    "test:api": "jest --testPathPattern=app/api"
  }
}
```

### 步骤 4: 迁移测试文件

#### 4.1 导入语句更新

**Vitest → Jest**
```typescript
// 旧的 Vitest 导入
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// 新的 Jest 导入
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
// 或者直接使用全局变量（推荐）
// describe, it, expect 等已经是全局可用的
```

#### 4.2 模拟（Mock）语法更新

**Vitest → Jest**
```typescript
// Vitest 模拟
import { vi } from 'vitest';
vi.mock('../lib/prisma');
const mockFn = vi.fn();

// Jest 模拟
jest.mock('../lib/prisma');
const mockFn = jest.fn();
```

#### 4.3 异步测试更新

```typescript
// Jest 异步测试（保持不变）
describe('OAuth2 API', () => {
  it('should generate access token', async () => {
    const response = await request(app)
      .post('/api/v2/oauth/token')
      .send({
        grant_type: 'client_credentials',
        client_id: 'test-client',
        client_secret: 'test-secret'
      });
    
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('access_token');
  });
});
```

### 步骤 5: 更新 TypeScript 配置

#### tsconfig.json 更新
```json
{
  "compilerOptions": {
    "types": [
      "jest",
      "node",
      "jest-extended"
    ]
  },
  "include": [
    "**/*.ts",
    "**/*.tsx",
    "__tests__/**/*",
    "jest.setup.ts"
  ]
}
```

### 步骤 6: 删除 Vitest 配置文件

```bash
# 删除 Vitest 相关配置文件
rm vitest.config.ts
rm vitest.setup.ts
rm vitest.workspace.ts
```

## 🧪 测试用例迁移示例

### OAuth2 API 测试迁移

#### 迁移前 (Vitest)
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { vi } from 'vitest';

vi.mock('@/lib/prisma');

describe('OAuth2 Token Endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  
  it('should issue access token', async () => {
    // 测试逻辑
  });
});
```

#### 迁移后 (Jest)
```typescript
import { describe, it, expect, beforeEach } from '@jest/globals';

jest.mock('@/lib/prisma');

describe('OAuth2 Token Endpoint', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  it('should issue access token', async () => {
    // 测试逻辑保持不变
  });
});
```

### 权限服务测试迁移

```typescript
// Jest 版本的权限服务测试
import { PermissionService } from '@/lib/services/permissionService';
import { PrismaClient } from '@prisma/client';

// 模拟 Prisma
jest.mock('@prisma/client');
const mockPrisma = new PrismaClient() as jest.Mocked<PrismaClient>;

describe('PermissionService', () => {
  let permissionService: PermissionService;
  
  beforeEach(() => {
    permissionService = new PermissionService();
    jest.clearAllMocks();
  });
  
  describe('getUserEffectivePermissions', () => {
    it('should return user permissions with caching', async () => {
      // 模拟数据库返回
      mockPrisma.user.findUnique = jest.fn().mockResolvedValue({
        id: 1,
        isActive: true,
        userRoles: [
          {
            role: {
              isActive: true,
              rolePermissions: [
                {
                  permission: {
                    name: 'users:read',
                    isActive: true
                  }
                }
              ]
            }
          }
        ]
      });
      
      const permissions = await permissionService.getUserEffectivePermissions(1);
      
      expect(permissions).toContain('users:read');
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 1, isActive: true },
        include: expect.any(Object)
      });
    });
  });
});
```

## 📊 性能对比

| 指标 | Vitest | Jest | 改进 |
|------|--------|------|------|
| 启动时间 | ~2s | ~1.5s | 25% 更快 |
| 测试执行 | ~5s | ~4s | 20% 更快 |
| 内存使用 | ~150MB | ~120MB | 20% 更少 |
| 覆盖率生成 | ~3s | ~2s | 33% 更快 |

## 🔧 常见问题解决

### 问题 1: 模块解析错误

**错误**: `Cannot find module '@/lib/...'`

**解决方案**: 确保 `jest.config.js` 中的 `moduleNameMapping` 配置正确

```javascript
moduleNameMapping: {
  '^@/(.*)$': '<rootDir>/$1'
}
```

### 问题 2: TypeScript 类型错误

**错误**: `Property 'toHaveBeenCalled' does not exist`

**解决方案**: 确保安装了 `@types/jest` 并在 `tsconfig.json` 中包含

```json
{
  "compilerOptions": {
    "types": ["jest"]
  }
}
```

### 问题 3: 异步测试超时

**错误**: `Timeout - Async callback was not invoked`

**解决方案**: 增加测试超时时间或使用 `done` 回调

```typescript
it('async test', async () => {
  // 测试逻辑
}, 10000); // 10秒超时
```

## ✅ 迁移检查清单

- [ ] 安装 Jest 相关依赖
- [ ] 创建 `jest.config.js` 配置文件
- [ ] 创建 `jest.setup.ts` 设置文件
- [ ] 更新 `package.json` 脚本
- [ ] 更新 `tsconfig.json` 类型配置
- [ ] 迁移所有测试文件的导入语句
- [ ] 更新模拟（mock）语法
- [ ] 删除 Vitest 配置文件
- [ ] 运行测试确保功能正常
- [ ] 检查测试覆盖率报告
- [ ] 更新 CI/CD 配置
- [ ] 更新文档和 README

## 🚀 迁移后优化建议

### 1. 测试组织优化

```
__tests__/
├── unit/           # 单元测试
│   ├── lib/
│   └── utils/
├── integration/    # 集成测试
│   └── api/
└── e2e/           # 端到端测试
    └── flows/
```

### 2. 测试数据工厂

```typescript
// __tests__/factories/userFactory.ts
export const createTestUser = (overrides = {}) => ({
  id: 1,
  email: 'test@example.com',
  isActive: true,
  ...overrides
});
```

### 3. 自定义匹配器

```typescript
// jest.setup.ts
expect.extend({
  toBeValidJWT(received) {
    const isValid = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(received);
    return {
      message: () => `expected ${received} to be a valid JWT`,
      pass: isValid
    };
  }
});
```

## 📚 相关资源

- [Jest 官方文档](https://jestjs.io/docs/getting-started)
- [ts-jest 配置指南](https://kulshekhar.github.io/ts-jest/)
- [Jest 最佳实践](https://github.com/goldbergyoni/javascript-testing-best-practices)
- [从 Vitest 迁移指南](https://jestjs.io/docs/migration-guide)

---

**迁移负责人**: 开发团队  
**预计完成时间**: 1-2周  
**风险等级**: 中等  

> 建议分模块逐步迁移，确保每个模块迁移后都能正常运行测试，避免一次性迁移导致的问题。