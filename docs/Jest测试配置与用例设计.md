# Jest测试配置与用例设计文档

> **文档版本**: v1.0.0  
> **创建日期**: 2024-12-19  
> **最后更新**: 2024-12-19  
> **文档状态**: 正式版  
> **维护团队**: 测试团队

## 文档摘要

本文档详细描述了OAuth2.1认证授权中心从Vitest迁移到Jest的完整配置方案，包括测试环境搭建、测试用例设计、模拟策略和最佳实践，确保测试的全面性和可靠性。

## 目录

- [1. Jest迁移概述](#1-jest迁移概述)
- [2. 环境配置](#2-环境配置)
- [3. 测试用例设计](#3-测试用例设计)
- [4. 模拟策略](#4-模拟策略)
- [5. 测试最佳实践](#5-测试最佳实践)
- [6. 持续集成配置](#6-持续集成配置)

## 1. Jest迁移概述

### 1.1 迁移原因

从Vitest迁移到Jest的主要考虑因素：

- **生态成熟度**: Jest拥有更成熟的生态系统和社区支持
- **Next.js集成**: 与Next.js框架的深度集成和优化
- **测试功能**: 更丰富的快照测试、模拟功能和测试报告
- **企业级支持**: 更好的企业级特性和长期维护保证
- **调试体验**: 更好的调试工具和IDE集成

### 1.2 迁移策略

- **渐进式迁移**: 逐步替换现有测试，确保业务连续性
- **配置兼容**: 保持现有测试结构和命名约定
- **覆盖率保持**: 确保迁移后测试覆盖率不降低
- **性能优化**: 利用Jest的并行执行和缓存机制

## 2. 环境配置

### 2.1 依赖包安装

```bash
# 安装Jest核心包
npm install --save-dev jest @types/jest

# 安装Next.js Jest集成
npm install --save-dev @next/jest

# 安装测试工具库
npm install --save-dev @testing-library/react @testing-library/jest-dom @testing-library/user-event

# 安装模拟工具
npm install --save-dev jest-environment-jsdom

# 移除Vitest相关包（如果存在）
npm uninstall vitest @vitest/ui @vitest/coverage-c8
```

### 2.2 Jest配置文件

#### 2.2.1 主配置文件 (jest.config.js)

```javascript
const nextJest = require('next/jest')

const createJestConfig = nextJest({
  // Next.js应用的路径
  dir: './'
})

// Jest的自定义配置
const customJestConfig = {
  // 测试环境配置
  testEnvironment: 'jest-environment-jsdom',
  
  // 模块路径映射
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@/lib/(.*)$': '<rootDir>/lib/$1',
    '^@/app/(.*)$': '<rootDir>/app/$1',
    '^@/components/(.*)$': '<rootDir>/components/$1',
    '^@/types/(.*)$': '<rootDir>/types/$1'
  },
  
  // 测试文件匹配模式
  testMatch: [
    '**/__tests__/**/*.(js|jsx|ts|tsx)',
    '**/*.(test|spec).(js|jsx|ts|tsx)'
  ],
  
  // 忽略的测试文件
  testPathIgnorePatterns: [
    '<rootDir>/.next/',
    '<rootDir>/node_modules/',
    '<rootDir>/coverage/',
    '<rootDir>/dist/'
  ],
  
  // 覆盖率配置
  collectCoverageFrom: [
    'app/**/*.{js,jsx,ts,tsx}',
    'lib/**/*.{js,jsx,ts,tsx}',
    'components/**/*.{js,jsx,ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/.next/**',
    '!**/coverage/**',
    '!**/*.config.js',
    '!**/*.config.ts'
  ],
  
  // 覆盖率阈值
  coverageThreshold: {
    global: {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85
    },
    // 特定目录的覆盖率要求
    './app/api/': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    },
    './lib/auth/': {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95
    }
  },
  
  // 覆盖率报告格式
  coverageReporters: [
    'text',
    'lcov',
    'html',
    'json-summary'
  ],
  
  // 测试设置文件
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  
  // 转换配置
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': ['babel-jest', { presets: ['next/babel'] }]
  },
  
  // 模块文件扩展名
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  
  // 清除模拟
  clearMocks: true,
  
  // 恢复模拟
  restoreMocks: true,
  
  // 测试超时（毫秒）
  testTimeout: 10000,
  
  // 并行执行
  maxWorkers: '50%',
  
  // 详细输出
  verbose: true,
  
  // 错误时停止
  bail: false,
  
  // 监视模式下的通知
  notify: true,
  
  // 快照序列化器
  snapshotSerializers: [
    '@testing-library/jest-dom/serializers'
  ]
}

// 导出Jest配置
module.exports = createJestConfig(customJestConfig)
```

#### 2.2.2 Jest设置文件 (jest.setup.js)

```javascript
// Jest DOM扩展
import '@testing-library/jest-dom'

// 全局测试配置
global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder

// 模拟环境变量
process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only-do-not-use-in-production'
process.env.DATABASE_URL = 'file:./test.db'
process.env.NEXTAUTH_SECRET = 'test-nextauth-secret'
process.env.NEXTAUTH_URL = 'http://localhost:3000'

// 模拟Next.js路由
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn()
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
  redirect: jest.fn(),
  notFound: jest.fn()
}))

// 模拟Next.js服务器组件
jest.mock('next/server', () => ({
  NextRequest: jest.fn(),
  NextResponse: {
    json: jest.fn((data, init) => ({
      json: () => Promise.resolve(data),
      status: init?.status || 200,
      headers: init?.headers || new Headers()
    })),
    redirect: jest.fn()
  }
}))

// 模拟Prisma客户端
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn()
    },
    oAuthClient: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    },
    authorizationCode: {
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn()
    },
    accessToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn()
    },
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
      update: jest.fn()
    },
    role: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn()
    },
    permission: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn()
    },
    userRole: {
      create: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn()
    },
    $transaction: jest.fn()
  }
}))

// 模拟加密库
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn().mockResolvedValue(true),
  genSalt: jest.fn().mockResolvedValue('salt')
}))

// 模拟JWT库
jest.mock('jose', () => ({
  SignJWT: jest.fn().mockImplementation(() => ({
    setProtectedHeader: jest.fn().mockReturnThis(),
    setIssuedAt: jest.fn().mockReturnThis(),
    setExpirationTime: jest.fn().mockReturnThis(),
    setSubject: jest.fn().mockReturnThis(),
    setAudience: jest.fn().mockReturnThis(),
    setIssuer: jest.fn().mockReturnThis(),
    sign: jest.fn().mockResolvedValue('mocked-jwt-token')
  })),
  jwtVerify: jest.fn().mockResolvedValue({
    payload: {
      sub: 'test-user-id',
      client_id: 'test-client-id',
      scope: 'read write',
      permissions: ['users:read', 'users:write']
    }
  }),
  createSecretKey: jest.fn().mockReturnValue('mocked-secret-key')
}))

// 模拟日志记录器
jest.mock('@/lib/utils/logger', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}))

// 全局测试钩子
beforeEach(() => {
  // 清除所有模拟调用记录
  jest.clearAllMocks()
  
  // 重置模拟实现
  jest.resetAllMocks()
})

afterEach(() => {
  // 测试后清理
  jest.restoreAllMocks()
})

// 全局错误处理
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection in test:', reason)
})

// 测试数据库清理（如果使用真实数据库）
afterAll(async () => {
  // 清理测试数据库
  // await prisma.$disconnect()
})
```

### 2.3 TypeScript配置

#### 2.3.1 测试专用tsconfig (tsconfig.test.json)

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "types": ["jest", "@testing-library/jest-dom", "node"]
  },
  "include": [
    "**/*.test.ts",
    "**/*.test.tsx",
    "**/*.spec.ts",
    "**/*.spec.tsx",
    "__tests__/**/*",
    "jest.setup.js"
  ],
  "exclude": ["node_modules", ".next", "coverage"]
}
```

## 3. 测试用例设计

### 3.1 测试分层架构

```
测试金字塔 (Jest实现):

           /\     E2E Tests (10%)
          /  \    - Playwright/Cypress
         /    \   - 完整用户流程
        /______\  - 关键业务场景
       /        \
      /          \  Integration Tests (20%)
     /            \ - API路由测试
    /              \- 数据库集成测试
   /________________\- OAuth流程测试
  /                  \
 /                    \ Unit Tests (70%)
/______________________\- 工具函数测试
                        - 组件测试
                        - 中间件测试
```

### 3.2 单元测试用例设计

#### 3.2.1 OAuth2工具函数测试

```typescript
// __tests__/lib/auth/oauth2.test.ts
import { PKCEUtils, ScopeUtils, AuthorizationUtils } from '@/lib/auth/oauth2'

describe('PKCEUtils', () => {
  describe('generateCodeVerifier', () => {
    it('应该生成符合RFC 7636规范的code_verifier', () => {
      const verifier = PKCEUtils.generateCodeVerifier()
      
      // 验证长度（43-128字符）
      expect(verifier.length).toBeGreaterThanOrEqual(43)
      expect(verifier.length).toBeLessThanOrEqual(128)
      
      // 验证字符集（Base64URL）
      expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/)
    })
    
    it('每次调用应该生成不同的verifier', () => {
      const verifier1 = PKCEUtils.generateCodeVerifier()
      const verifier2 = PKCEUtils.generateCodeVerifier()
      
      expect(verifier1).not.toBe(verifier2)
    })
  })
  
  describe('generateCodeChallenge', () => {
    it('应该为给定的verifier生成正确的challenge', () => {
      const verifier = 'test-verifier-123'
      const challenge = PKCEUtils.generateCodeChallenge(verifier)
      
      // 验证challenge格式
      expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/)
      expect(challenge.length).toBe(43) // SHA256 Base64URL编码长度
    })
    
    it('相同的verifier应该生成相同的challenge', () => {
      const verifier = 'consistent-verifier'
      const challenge1 = PKCEUtils.generateCodeChallenge(verifier)
      const challenge2 = PKCEUtils.generateCodeChallenge(verifier)
      
      expect(challenge1).toBe(challenge2)
    })
  })
  
  describe('verifyCodeChallenge', () => {
    it('应该验证正确的verifier和challenge组合', () => {
      const verifier = PKCEUtils.generateCodeVerifier()
      const challenge = PKCEUtils.generateCodeChallenge(verifier)
      
      const isValid = PKCEUtils.verifyCodeChallenge(verifier, challenge)
      expect(isValid).toBe(true)
    })
    
    it('应该拒绝错误的verifier和challenge组合', () => {
      const verifier = 'correct-verifier'
      const wrongChallenge = 'wrong-challenge'
      
      const isValid = PKCEUtils.verifyCodeChallenge(verifier, wrongChallenge)
      expect(isValid).toBe(false)
    })
    
    it('应该拒绝不支持的challenge方法', () => {
      const verifier = 'test-verifier'
      const challenge = 'test-challenge'
      
      const isValid = PKCEUtils.verifyCodeChallenge(verifier, challenge, 'plain')
      expect(isValid).toBe(false)
    })
  })
})

describe('ScopeUtils', () => {
  describe('validateScopes', () => {
    it('应该验证有效的作用域', () => {
      const validScopes = ['read', 'write', 'admin']
      const requestedScopes = ['read', 'write']
      
      const result = ScopeUtils.validateScopes(requestedScopes, validScopes)
      expect(result.isValid).toBe(true)
      expect(result.validScopes).toEqual(['read', 'write'])
    })
    
    it('应该拒绝无效的作用域', () => {
      const validScopes = ['read', 'write']
      const requestedScopes = ['read', 'admin'] // admin不在有效列表中
      
      const result = ScopeUtils.validateScopes(requestedScopes, validScopes)
      expect(result.isValid).toBe(false)
      expect(result.invalidScopes).toContain('admin')
    })
    
    it('应该处理空作用域列表', () => {
      const result = ScopeUtils.validateScopes([], ['read', 'write'])
      expect(result.isValid).toBe(true)
      expect(result.validScopes).toEqual([])
    })
  })
})
```

#### 3.2.2 API路由测试

```typescript
// __tests__/app/api/v2/oauth/token/route.test.ts
import { POST } from '@/app/api/v2/oauth/token/route'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

// 模拟数据
const mockClient = {
  id: 'test-client-id',
  clientSecret: 'hashed-secret',
  redirectUris: ['http://localhost:3000/callback'],
  grantTypes: ['authorization_code', 'refresh_token'],
  isActive: true
}

const mockAuthCode = {
  id: 'test-auth-code',
  code: 'test-authorization-code',
  clientId: 'test-client-id',
  userId: 'test-user-id',
  codeChallenge: 'test-challenge',
  codeChallengeMethod: 'S256',
  scopes: 'read write',
  expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10分钟后过期
  isUsed: false
}

describe('/api/v2/oauth/token', () => {
  beforeEach(() => {
    // 重置模拟
    jest.clearAllMocks()
  })
  
  describe('POST - Authorization Code Grant', () => {
    it('应该成功交换授权码获取访问令牌', async () => {
      // 模拟数据库查询
      ;(prisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(mockClient)
      ;(prisma.authorizationCode.findUnique as jest.Mock).mockResolvedValue(mockAuthCode)
      ;(prisma.accessToken.create as jest.Mock).mockResolvedValue({
        id: 'access-token-id',
        token: 'access-token',
        expiresAt: new Date(Date.now() + 3600000)
      })
      
      // 构造请求
      const request = new NextRequest('http://localhost:3000/api/v2/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from('test-client-id:client-secret').toString('base64')
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: 'test-authorization-code',
          code_verifier: 'test-verifier',
          redirect_uri: 'http://localhost:3000/callback'
        })
      })
      
      // 执行请求
      const response = await POST(request)
      const data = await response.json()
      
      // 验证响应
      expect(response.status).toBe(200)
      expect(data).toHaveProperty('access_token')
      expect(data).toHaveProperty('token_type', 'Bearer')
      expect(data).toHaveProperty('expires_in')
      expect(data).toHaveProperty('scope')
    })
    
    it('应该拒绝无效的客户端认证', async () => {
      ;(prisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(null)
      
      const request = new NextRequest('http://localhost:3000/api/v2/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from('invalid-client:wrong-secret').toString('base64')
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: 'test-code'
        })
      })
      
      const response = await POST(request)
      const data = await response.json()
      
      expect(response.status).toBe(401)
      expect(data.error).toBe('invalid_client')
    })
    
    it('应该拒绝过期的授权码', async () => {
      const expiredAuthCode = {
        ...mockAuthCode,
        expiresAt: new Date(Date.now() - 1000) // 已过期
      }
      
      ;(prisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(mockClient)
      ;(prisma.authorizationCode.findUnique as jest.Mock).mockResolvedValue(expiredAuthCode)
      
      const request = new NextRequest('http://localhost:3000/api/v2/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from('test-client-id:client-secret').toString('base64')
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: 'expired-code',
          code_verifier: 'test-verifier'
        })
      })
      
      const response = await POST(request)
      const data = await response.json()
      
      expect(response.status).toBe(400)
      expect(data.error).toBe('invalid_grant')
      expect(data.error_description).toContain('expired')
    })
    
    it('应该验证PKCE code_verifier', async () => {
      ;(prisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(mockClient)
      ;(prisma.authorizationCode.findUnique as jest.Mock).mockResolvedValue(mockAuthCode)
      
      const request = new NextRequest('http://localhost:3000/api/v2/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from('test-client-id:client-secret').toString('base64')
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: 'test-code',
          code_verifier: 'wrong-verifier' // 错误的verifier
        })
      })
      
      const response = await POST(request)
      const data = await response.json()
      
      expect(response.status).toBe(400)
      expect(data.error).toBe('invalid_grant')
      expect(data.error_description).toContain('PKCE')
    })
  })
  
  describe('POST - Client Credentials Grant', () => {
    it('应该成功处理客户端凭据授权', async () => {
      const clientCredentialsClient = {
        ...mockClient,
        grantTypes: ['client_credentials']
      }
      
      ;(prisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(clientCredentialsClient)
      ;(prisma.accessToken.create as jest.Mock).mockResolvedValue({
        id: 'access-token-id',
        token: 'client-access-token'
      })
      
      const request = new NextRequest('http://localhost:3000/api/v2/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from('test-client-id:client-secret').toString('base64')
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          scope: 'api:read api:write'
        })
      })
      
      const response = await POST(request)
      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(data).toHaveProperty('access_token')
      expect(data).toHaveProperty('token_type', 'Bearer')
      expect(data).not.toHaveProperty('refresh_token') // 客户端凭据模式不返回刷新令牌
    })
  })
  
  describe('POST - Refresh Token Grant', () => {
    it('应该成功刷新访问令牌', async () => {
      const mockRefreshToken = {
        id: 'refresh-token-id',
        token: 'valid-refresh-token',
        clientId: 'test-client-id',
        userId: 'test-user-id',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30天后过期
        isRevoked: false
      }
      
      ;(prisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(mockClient)
      ;(prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue(mockRefreshToken)
      ;(prisma.accessToken.create as jest.Mock).mockResolvedValue({
        id: 'new-access-token-id',
        token: 'new-access-token'
      })
      
      const request = new NextRequest('http://localhost:3000/api/v2/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from('test-client-id:client-secret').toString('base64')
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: 'valid-refresh-token'
        })
      })
      
      const response = await POST(request)
      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(data).toHaveProperty('access_token')
      expect(data).toHaveProperty('refresh_token') // 新的刷新令牌
    })
  })
})
```

### 3.3 集成测试用例设计

#### 3.3.1 完整OAuth2.1流程测试

```typescript
// __tests__/integration/oauth2-flow.test.ts
import { NextRequest } from 'next/server'
import { GET as authorizeGET, POST as authorizePOST } from '@/app/api/v2/oauth/authorize/route'
import { POST as tokenPOST } from '@/app/api/v2/oauth/token/route'
import { PKCEUtils } from '@/lib/auth/oauth2'
import { prisma } from '@/lib/prisma'

describe('OAuth2.1 Authorization Code Flow with PKCE', () => {
  let codeVerifier: string
  let codeChallenge: string
  let authorizationCode: string
  
  const testClient = {
    id: 'integration-test-client',
    clientSecret: 'hashed-client-secret',
    redirectUris: ['http://localhost:3000/callback'],
    grantTypes: ['authorization_code'],
    responseTypes: ['code'],
    scopes: ['read', 'write', 'profile'],
    isActive: true,
    requirePkce: true
  }
  
  const testUser = {
    id: 'integration-test-user',
    username: 'testuser',
    email: 'test@example.com',
    passwordHash: 'hashed-password',
    isActive: true
  }
  
  beforeAll(() => {
    // 生成PKCE参数
    codeVerifier = PKCEUtils.generateCodeVerifier()
    codeChallenge = PKCEUtils.generateCodeChallenge(codeVerifier)
  })
  
  beforeEach(() => {
    jest.clearAllMocks()
    
    // 模拟数据库查询
    ;(prisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(testClient)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(testUser)
  })
  
  it('应该完成完整的授权码流程', async () => {
    // 步骤1: 授权请求
    const authorizeUrl = new URL('http://localhost:3000/api/v2/oauth/authorize')
    authorizeUrl.searchParams.set('response_type', 'code')
    authorizeUrl.searchParams.set('client_id', testClient.id)
    authorizeUrl.searchParams.set('redirect_uri', testClient.redirectUris[0])
    authorizeUrl.searchParams.set('scope', 'read write')
    authorizeUrl.searchParams.set('state', 'random-state-value')
    authorizeUrl.searchParams.set('code_challenge', codeChallenge)
    authorizeUrl.searchParams.set('code_challenge_method', 'S256')
    
    const authorizeRequest = new NextRequest(authorizeUrl.toString())
    
    // 模拟用户已登录
    Object.defineProperty(authorizeRequest, 'user', {
      value: testUser,
      writable: true
    })
    
    // 模拟授权码创建
    const mockAuthCode = {
      id: 'test-auth-code-id',
      code: 'generated-authorization-code',
      clientId: testClient.id,
      userId: testUser.id,
      codeChallenge,
      codeChallengeMethod: 'S256',
      scopes: 'read write',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      isUsed: false
    }
    
    ;(prisma.authorizationCode.create as jest.Mock).mockResolvedValue(mockAuthCode)
    
    const authorizeResponse = await authorizeGET(authorizeRequest)
    
    // 验证授权响应
    expect(authorizeResponse.status).toBe(302) // 重定向
    const location = authorizeResponse.headers.get('Location')
    expect(location).toContain('code=')
    expect(location).toContain('state=random-state-value')
    
    // 提取授权码
    const redirectUrl = new URL(location!)
    authorizationCode = redirectUrl.searchParams.get('code')!
    
    // 步骤2: 令牌交换
    ;(prisma.authorizationCode.findUnique as jest.Mock).mockResolvedValue({
      ...mockAuthCode,
      code: authorizationCode
    })
    
    const mockAccessToken = {
      id: 'access-token-id',
      token: 'generated-access-token',
      clientId: testClient.id,
      userId: testUser.id,
      scopes: 'read write',
      expiresAt: new Date(Date.now() + 3600000)
    }
    
    const mockRefreshToken = {
      id: 'refresh-token-id',
      token: 'generated-refresh-token',
      clientId: testClient.id,
      userId: testUser.id,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    }
    
    ;(prisma.accessToken.create as jest.Mock).mockResolvedValue(mockAccessToken)
    ;(prisma.refreshToken.create as jest.Mock).mockResolvedValue(mockRefreshToken)
    
    const tokenRequest = new NextRequest('http://localhost:3000/api/v2/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${testClient.id}:client-secret`).toString('base64')
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: authorizationCode,
        redirect_uri: testClient.redirectUris[0],
        code_verifier: codeVerifier
      })
    })
    
    const tokenResponse = await tokenPOST(tokenRequest)
    const tokenData = await tokenResponse.json()
    
    // 验证令牌响应
    expect(tokenResponse.status).toBe(200)
    expect(tokenData).toHaveProperty('access_token')
    expect(tokenData).toHaveProperty('refresh_token')
    expect(tokenData).toHaveProperty('token_type', 'Bearer')
    expect(tokenData).toHaveProperty('expires_in')
    expect(tokenData).toHaveProperty('scope', 'read write')
    
    // 验证数据库操作
    expect(prisma.authorizationCode.create).toHaveBeenCalled()
    expect(prisma.accessToken.create).toHaveBeenCalled()
    expect(prisma.refreshToken.create).toHaveBeenCalled()
  })
  
  it('应该拒绝错误的PKCE验证', async () => {
    const mockAuthCode = {
      id: 'test-auth-code-id',
      code: 'test-authorization-code',
      clientId: testClient.id,
      userId: testUser.id,
      codeChallenge,
      codeChallengeMethod: 'S256',
      scopes: 'read',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      isUsed: false
    }
    
    ;(prisma.authorizationCode.findUnique as jest.Mock).mockResolvedValue(mockAuthCode)
    
    const tokenRequest = new NextRequest('http://localhost:3000/api/v2/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${testClient.id}:client-secret`).toString('base64')
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: 'test-authorization-code',
        redirect_uri: testClient.redirectUris[0],
        code_verifier: 'wrong-verifier' // 错误的verifier
      })
    })
    
    const tokenResponse = await tokenPOST(tokenRequest)
    const tokenData = await tokenResponse.json()
    
    expect(tokenResponse.status).toBe(400)
    expect(tokenData.error).toBe('invalid_grant')
    expect(tokenData.error_description).toContain('PKCE verification failed')
  })
})
```

### 3.4 安全测试用例设计

#### 3.4.1 权限验证测试

```typescript
// __tests__/security/permission-validation.test.ts
import { requirePermission } from '@/lib/auth/middleware'
import { NextRequest, NextResponse } from 'next/server'
import * as jose from 'jose'

describe('权限验证安全测试', () => {
  const mockHandler = jest.fn().mockResolvedValue(
    NextResponse.json({ message: 'Success' })
  )
  
  beforeEach(() => {
    jest.clearAllMocks()
  })
  
  it('应该拒绝没有Bearer令牌的请求', async () => {
    const protectedHandler = requirePermission(['users:read'])(mockHandler)
    
    const request = new NextRequest('http://localhost:3000/api/test', {
      headers: {}
    })
    
    const response = await protectedHandler(request)
    
    expect(response.status).toBe(401)
    expect(mockHandler).not.toHaveBeenCalled()
  })
  
  it('应该拒绝无效的JWT令牌', async () => {
    const protectedHandler = requirePermission(['users:read'])(mockHandler)
    
    ;(jose.jwtVerify as jest.Mock).mockRejectedValue(new Error('Invalid token'))
    
    const request = new NextRequest('http://localhost:3000/api/test', {
      headers: {
        'Authorization': 'Bearer invalid-token'
      }
    })
    
    const response = await protectedHandler(request)
    
    expect(response.status).toBe(401)
    expect(mockHandler).not.toHaveBeenCalled()
  })
  
  it('应该拒绝权限不足的请求', async () => {
    const protectedHandler = requirePermission(['users:write'])(mockHandler)
    
    ;(jose.jwtVerify as jest.Mock).mockResolvedValue({
      payload: {
        sub: 'user-id',
        permissions: ['users:read'] // 只有读权限，没有写权限
      }
    })
    
    const request = new NextRequest('http://localhost:3000/api/test', {
      headers: {
        'Authorization': 'Bearer valid-token'
      }
    })
    
    const response = await protectedHandler(request)
    
    expect(response.status).toBe(403)
    expect(mockHandler).not.toHaveBeenCalled()
  })
  
  it('应该允许具有正确权限的请求', async () => {
    const protectedHandler = requirePermission(['users:read'])(mockHandler)
    
    ;(jose.jwtVerify as jest.Mock).mockResolvedValue({
      payload: {
        sub: 'user-id',
        permissions: ['users:read', 'users:write']
      }
    })
    
    const request = new NextRequest('http://localhost:3000/api/test', {
      headers: {
        'Authorization': 'Bearer valid-token'
      }
    })
    
    await protectedHandler(request)
    
    expect(mockHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({
          id: 'user-id',
          permissions: ['users:read', 'users:write']
        })
      })
    )
  })
  
  it('应该防止权限提升攻击', async () => {
    const protectedHandler = requirePermission(['admin:system'])(mockHandler)
    
    // 尝试通过修改JWT payload进行权限提升
    ;(jose.jwtVerify as jest.Mock).mockResolvedValue({
      payload: {
        sub: 'regular-user',
        permissions: ['users:read'],
        // 恶意添加的权限声明
        admin: true,
        role: 'admin'
      }
    })
    
    const request = new NextRequest('http://localhost:3000/api/admin', {
      headers: {
        'Authorization': 'Bearer potentially-tampered-token'
      }
    })
    
    const response = await protectedHandler(request)
    
    // 应该基于permissions数组验证，而不是其他声明
    expect(response.status).toBe(403)
    expect(mockHandler).not.toHaveBeenCalled()
  })
})
```

## 4. 模拟策略

### 4.1 数据库模拟

```typescript
// __tests__/mocks/prisma.ts
export const createMockPrismaClient = () => {
  return {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn()
    },
    oAuthClient: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn()
    },
    authorizationCode: {
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
      update: jest.fn()
    },
    accessToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn()
    },
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn()
    },
    role: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    },
    permission: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    },
    userRole: {
      create: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn()
    },
    rolePermission: {
      create: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn()
    },
    auditLog: {
      create: jest.fn(),
      findMany: jest.fn()
    },
    $transaction: jest.fn(),
    $connect: jest.fn(),
    $disconnect: jest.fn()
  }
}

// 测试数据工厂
export const createTestUser = (overrides = {}) => ({
  id: 'test-user-id',
  username: 'testuser',
  email: 'test@example.com',
  passwordHash: 'hashed-password',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides
})

export const createTestClient = (overrides = {}) => ({
  id: 'test-client-id',
  clientSecret: 'hashed-client-secret',
  name: 'Test Client',
  redirectUris: ['http://localhost:3000/callback'],
  grantTypes: ['authorization_code', 'refresh_token'],
  responseTypes: ['code'],
  scopes: ['read', 'write'],
  isActive: true,
  requirePkce: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides
})

export const createTestAuthCode = (overrides = {}) => ({
  id: 'test-auth-code-id',
  code: 'test-authorization-code',
  clientId: 'test-client-id',
  userId: 'test-user-id',
  codeChallenge: 'test-challenge',
  codeChallengeMethod: 'S256',
  scopes: 'read write',
  expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  isUsed: false,
  createdAt: new Date(),
  ...overrides
})
```

### 4.2 HTTP请求模拟

```typescript
// __tests__/mocks/http.ts
import { NextRequest } from 'next/server'

export const createMockRequest = ({
  url = 'http://localhost:3000',
  method = 'GET',
  headers = {},
  body = null,
  searchParams = {}
}: {
  url?: string
  method?: string
  headers?: Record<string, string>
  body?: any
  searchParams?: Record<string, string>
} = {}) => {
  const requestUrl = new URL(url)
  
  // 添加查询参数
  Object.entries(searchParams).forEach(([key, value]) => {
    requestUrl.searchParams.set(key, value)
  })
  
  const requestInit: RequestInit = {
    method,
    headers: new Headers(headers)
  }
  
  if (body) {
    if (typeof body === 'string') {
      requestInit.body = body
    } else if (body instanceof URLSearchParams) {
      requestInit.body = body
    } else {
      requestInit.body = JSON.stringify(body)
      if (!headers['Content-Type']) {
        (requestInit.headers as Headers).set('Content-Type', 'application/json')
      }
    }
  }
  
  return new NextRequest(requestUrl.toString(), requestInit)
}

export const createAuthenticatedRequest = ({
  token = 'valid-access-token',
  user = { id: 'test-user', permissions: ['users:read'] },
  ...requestOptions
}) => {
  const request = createMockRequest({
    ...requestOptions,
    headers: {
      'Authorization': `Bearer ${token}`,
      ...requestOptions.headers
    }
  })
  
  // 添加用户信息到请求对象
  Object.defineProperty(request, 'user', {
    value: user,
    writable: true
  })
  
  return request
}
```

## 5. 测试最佳实践

### 5.1 测试组织原则

1. **AAA模式**: Arrange（准备）、Act（执行）、Assert（断言）
2. **单一职责**: 每个测试只验证一个功能点
3. **独立性**: 测试之间不应相互依赖
4. **可重复性**: 测试结果应该一致和可预测
5. **快速执行**: 单元测试应该快速完成

### 5.2 命名约定

```typescript
// 测试文件命名
// ✅ 好的命名
user.service.test.ts
oauth2.utils.test.ts
api-v2-users.integration.test.ts

// ❌ 避免的命名
test.ts
user_test.ts
TestUser.ts

// 测试用例命名
describe('UserService', () => {
  describe('createUser', () => {
    it('应该成功创建新用户', () => {})
    it('应该拒绝重复的用户名', () => {})
    it('应该验证邮箱格式', () => {})
  })
})
```

### 5.3 测试数据管理

```typescript
// __tests__/fixtures/index.ts
export const testUsers = {
  admin: {
    id: 'admin-user-id',
    username: 'admin',
    email: 'admin@example.com',
    roles: ['admin']
  },
  regular: {
    id: 'regular-user-id',
    username: 'user',
    email: 'user@example.com',
    roles: ['user']
  }
}

export const testClients = {
  webApp: {
    id: 'web-app-client',
    name: 'Web Application',
    grantTypes: ['authorization_code'],
    requirePkce: true
  },
  mobileApp: {
    id: 'mobile-app-client',
    name: 'Mobile Application',
    grantTypes: ['authorization_code'],
    requirePkce: true
  },
  service: {
    id: 'service-client',
    name: 'Backend Service',
    grantTypes: ['client_credentials'],
    requirePkce: false
  }
}
```

### 5.4 错误测试模式

```typescript
// 测试错误处理
it('应该处理数据库连接错误', async () => {
  // 模拟数据库错误
  ;(prisma.user.findUnique as jest.Mock).mockRejectedValue(
    new Error('Database connection failed')
  )
  
  const request = createMockRequest({
    url: 'http://localhost:3000/api/v2/users/123'
  })
  
  const response = await GET(request, { params: { id: '123' } })
  
  expect(response.status).toBe(500)
  const data = await response.json()
  expect(data.error).toBe('internal_server_error')
})

// 测试边界条件
it('应该处理空的权限列表', async () => {
  const result = await permissionService.getUserEffectivePermissions('user-with-no-permissions')
  expect(result).toEqual(new Set())
})

// 测试并发场景
it('应该处理并发令牌请求', async () => {
  const requests = Array(10).fill(null).map(() => 
    createTokenRequest()
  )
  
  const responses = await Promise.all(
    requests.map(req => POST(req))
  )
  
  // 验证所有请求都成功处理
  responses.forEach(response => {
    expect(response.status).toBe(200)
  })
})
```

## 6. 持续集成配置

### 6.1 GitHub Actions配置

```yaml
# .github/workflows/test.yml
name: 测试流水线

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    
    strategy:
      matrix:
        node-version: [18.x, 20.x]
    
    steps:
    - uses: actions/checkout@v4
    
    - name: 设置 Node.js ${{ matrix.node-version }}
      uses: actions/setup-node@v4
      with:
        node-version: ${{ matrix.node-version }}
        cache: 'npm'
    
    - name: 安装依赖
      run: npm ci
    
    - name: 运行类型检查
      run: npm run type-check
    
    - name: 运行代码检查
      run: npm run lint
    
    - name: 运行单元测试
      run: npm run test:unit
      env:
        NODE_ENV: test
        JWT_SECRET: test-secret
    
    - name: 运行集成测试
      run: npm run test:integration
      env:
        NODE_ENV: test
        DATABASE_URL: file:./test.db
    
    - name: 生成覆盖率报告
      run: npm run test:coverage
    
    - name: 上传覆盖率到 Codecov
      uses: codecov/codecov-action@v3
      with:
        file: ./coverage/lcov.info
        flags: unittests
        name: codecov-umbrella
    
    - name: 运行安全测试
      run: npm run test:security
    
    - name: 构建项目
      run: npm run build
```

### 6.2 package.json脚本配置

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:unit": "jest --testPathPattern=__tests__/unit",
    "test:integration": "jest --testPathPattern=__tests__/integration",
    "test:security": "jest --testPathPattern=__tests__/security",
    "test:e2e": "jest --testPathPattern=__tests__/e2e",
    "test:ci": "jest --ci --coverage --watchAll=false",
    "type-check": "tsc --noEmit",
    "lint": "eslint . --ext .ts,.tsx,.js,.jsx",
    "lint:fix": "eslint . --ext .ts,.tsx,.js,.jsx --fix"
  }
}
```

### 6.3 覆盖率配置

```javascript
// jest.config.js 中的覆盖率配置
module.exports = {
  // ... 其他配置
  
  // 覆盖率收集
  collectCoverageFrom: [
    'app/**/*.{js,jsx,ts,tsx}',
    'lib/**/*.{js,jsx,ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/.next/**',
    '!**/coverage/**'
  ],
  
  // 覆盖率阈值
  coverageThreshold: {
    global: {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85
    },
    // 关键模块更高的覆盖率要求
    './app/api/v2/oauth/': {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95
    },
    './lib/auth/': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    }
  },
  
  // 覆盖率报告格式
  coverageReporters: [
    'text',
    'text-summary',
    'lcov',
    'html',
    'json-summary'
  ],
  
  // 覆盖率目录
  coverageDirectory: 'coverage'
}
```

## 总结

本文档提供了从Vitest迁移到Jest的完整方案，包括：

1. **环境配置**: 详细的Jest配置和设置
2. **测试用例设计**: 单元测试、集成测试、安全测试的具体实现
3. **模拟策略**: 数据库、HTTP请求等的模拟方法
4. **最佳实践**: 测试组织、命名约定、错误处理
5. **持续集成**: CI/CD流水线配置

通过遵循本文档的指导，可以建立一个健壮、可维护的测试体系，确保OAuth2.1认证授权中心的质量和安全性。

### 关键收益

- **提高代码质量**: 通过全面的测试覆盖确保代码的正确性
- **增强安全性**: 通过专门的安全测试验证权限控制和数据保护
- **提升开发效率**: 通过自动化测试减少手动测试工作量
- **降低维护成本**: 通过良好的测试结构便于后续维护和扩展
- **保证交付质量**: 通过CI/CD集成确保每次发布的质量

### 后续计划

1. **第一阶段**: 完成Jest环境配置和基础测试用例
2. **第二阶段**: 实现完整的单元测试和集成测试
3. **第三阶段**: 添加性能测试和E2E测试
4. **第四阶段**: 优化测试流程和持续集成配置

---

**文档维护**: 本文档将随着项目发展持续更新，确保测试策略与实际需求保持一致。