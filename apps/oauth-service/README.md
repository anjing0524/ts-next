# OAuth Service

OAuth 2.1 认证授权服务，基于 Next.js 15 和 Jose 库实现完整的 OAuth 2.1 授权码流程 + PKCE 支持。

## 🎯 功能特性

- **OAuth 2.1 标准实现** - 完全遵循 OAuth 2.1 规范
- **PKCE 强制保护** - 所有客户端必须使用 PKCE (S256) 安全机制
- **JWT 令牌管理** - 使用 Jose 库 (v6.0.11) + RSA256 签名算法
- **OIDC 支持** - 完整的 OpenID Connect 实现
- **多客户端管理** - 支持多个 OAuth 客户端配置
- **权限范围控制** - 细粒度的 API 权限管理
- **令牌撤销** - 支持访问令牌和刷新令牌的撤销
- **密钥轮换** - 支持 JWT 签名密钥的安全轮换

## 🏗️ 技术栈

- **框架**: Next.js 15.3.2
- **认证库**: Jose (v6.0.11) - 绝不使用 jsonwebtoken
- **数据库**: Prisma ORM + SQLite (开发) / PostgreSQL (生产)
- **缓存**: @repo/cache (Redis + 内存缓存)
- **日志**: Winston + 每日轮转文件
- **验证**: Zod 模式验证
- **测试**: Jest + Playwright

## 📍 核心端点

| 端点 | 方法 | 功能描述 |
|------|------|----------|
| `/api/v2/oauth/authorize` | GET | 授权端点 - 启动 OAuth 2.1 流程 |
| `/api/v2/oauth/token` | POST | 令牌端点 - 交换授权码获取 JWT |
| `/api/v2/oauth/revoke` | POST | 令牌撤销端点 |
| `/api/v2/oauth/introspect` | POST | 令牌内省端点 |
| `/api/v2/oauth/userinfo` | GET | 用户信息端点 (OIDC) |
| `/.well-known/jwks.json` | GET | JWKS 公钥端点 |
| `/.well-known/openid-configuration` | GET | OIDC 发现配置 |

## 🚀 快速开始

### 1. 环境配置

```bash
# 复制环境变量模板
cp .env.example .env.local

# 必需的环境变量
DATABASE_URL="file:./dev.db"
JWT_PRIVATE_KEY_PATH="./keys/private.pem"
JWT_PUBLIC_KEY_PATH="./keys/public.pem"
JWT_KEY_ID="oauth-service-key-2024"
REDIS_URL="redis://localhost:6379"
```

### 2. 生成 RSA 密钥对

```bash
# 生成私钥
openssl genrsa -out keys/private.pem 2048

# 生成公钥
openssl rsa -in keys/private.pem -pubout -out keys/public.pem

# 设置权限
chmod 600 keys/private.pem
chmod 644 keys/public.pem
```

### 3. 数据库初始化

```bash
# 生成 Prisma 客户端
pnpm db:generate

# 创建数据库表结构
pnpm db:push

# 初始化 OAuth 客户端数据
pnpm db:seed
```

### 4. 启动开发服务

```bash
# 启动 OAuth 服务 (端口 3001)
pnpm dev

# 或者使用项目根目录命令
pnpm --filter=oauth-service dev
```

## 📊 API 文档

### OAuth 2.1 授权码流程

#### 1. 获取授权码

```http
GET /api/v2/oauth/authorize?
  response_type=code&
  client_id=your_client_id&
  redirect_uri=https://yourapp.com/callback&
  scope=openid profile api:read&
  state=random_state_value&
  code_challenge=base64url_encode(SHA256(code_verifier))&
  code_challenge_method=S256
```

#### 2. 交换授权码获取令牌

```http
POST /api/v2/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&
code=authorization_code_from_callback&
redirect_uri=https://yourapp.com/callback&
client_id=your_client_id&
code_verifier=original_code_verifier
```

#### 响应示例

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "scope": "openid profile api:read"
}
```

### 客户端凭证模式

```http
POST /api/v2/oauth/token
Content-Type: application/x-www-form-urlencoded
Authorization: Basic base64(client_id:client_secret)

grant_type=client_credentials&
scope=api:read api:write
```

### 令牌撤销

```http
POST /api/v2/oauth/revoke
Content-Type: application/x-www-form-urlencoded

token=access_or_refresh_token&
token_type_hint=access_token
```

## 🔐 客户端注册

### 创建 OAuth 客户端

```bash
# 使用 Prisma Studio 创建客户端
pnpm db:studio
```

### 客户端配置示例

```json
{
  "client_id": "web_app_001",
  "client_name": "Web Application",
  "client_secret": "generated_secret",
  "redirect_uris": [
    "http://localhost:3002/auth/callback",
    "https://yourapp.com/auth/callback"
  ],
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "scope": "openid profile api:read api:write",
  "token_endpoint_auth_method": "client_secret_basic"
}
```

## 🧪 测试

### 单元测试

```bash
# 运行所有测试
pnpm test

# 运行测试并监视更改
pnpm test:watch

# 运行测试覆盖率
pnpm test:coverage
```

### 集成测试

```bash
# 启动测试环境
pnpm start:e2e

# 运行 OAuth 2.1 流程测试
pnpm test:e2e:integration
```

### 手动测试

1. **访问认证页面**:
   ```
   http://localhost:3001/api/v2/oauth/authorize?response_type=code&client_id=test_client&redirect_uri=http://localhost:3002/auth/callback&scope=openid profile&code_challenge=test&code_challenge_method=S256
   ```

2. **测试令牌端点**:
   ```bash
   curl -X POST http://localhost:3001/api/v2/oauth/token \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "grant_type=client_credentials&client_id=test_client&client_secret=test_secret&scope=api:read"
   ```

## 📁 项目结构

```
oauth-service/
├── app/
│   ├── api/v2/oauth/
│   │   ├── authorize/route.ts      # 授权端点
│   │   ├── token/route.ts          # 令牌端点
│   │   ├── revoke/route.ts         # 撤销端点
│   │   ├── introspect/route.ts     # 内省端点
│   │   └── userinfo/route.ts       # 用户信息端点
│   └── .well-known/
│       ├── jwks.json/route.ts      # JWKS 端点
│       └── openid-configuration/route.ts  # OIDC 配置
├── lib/
│   ├── auth/
│   │   ├── oauth2.ts              # OAuth 2.1 核心逻辑
│   │   ├── jwt.ts                 # JWT 工具类
│   │   └── pkce.ts                # PKCE 验证
│   └── db/
│       └── oauth.ts               # OAuth 数据库操作
├── prisma/
│   └── schema.prisma              # 数据库模型
└── tests/
    ├── unit/
    └── e2e/
```

## 🔧 配置说明

### 环境变量

| 变量名 | 描述 | 示例 |
|--------|------|------|
| `DATABASE_URL` | 数据库连接字符串 | `file:./dev.db` |
| `JWT_PRIVATE_KEY_PATH` | RSA 私钥文件路径 | `./keys/private.pem` |
| `JWT_PUBLIC_KEY_PATH` | RSA 公钥文件路径 | `./keys/public.pem` |
| `JWT_KEY_ID` | JWT 密钥 ID | `oauth-service-key-2024` |
| `JWT_ISSUER` | JWT 签发者 | `https://auth.company.com` |
| `JWT_AUDIENCE` | JWT 受众 | `api.company.com` |
| `REDIS_URL` | Redis 连接字符串 | `redis://localhost:6379` |
| `LOG_LEVEL` | 日志级别 | `info` |

### OAuth 配置

在 `lib/auth/oauth2.ts` 中可以配置：
- 令牌过期时间
- 支持的授权类型
- 权限范围定义
- 客户端验证规则

## 🚨 安全注意事项

1. **强制 HTTPS**: 生产环境必须使用 HTTPS
2. **密钥管理**: 定期轮换 RSA 密钥对
3. **客户端密钥**: 为每个客户端生成强密钥
4. **重定向 URI**: 严格验证客户端重定向 URI
5. **PKCE 验证**: 所有授权码流程必须验证 PKCE 参数
6. **令牌存储**: 安全存储访问令牌和刷新令牌
7. **CORS 配置**: 正确配置跨域请求

## 🔍 调试与监控

### 日志查看

```bash
# 查看实时日志
tail -f logs/oauth-service.log

# 查看错误日志
tail -f logs/oauth-service-error.log
```

### 健康检查

```http
GET /health
```

### 指标监控

- 令牌颁发数量
- 授权成功率
- 错误率统计
- 响应时间监控

## 📝 常见问题

### Q: 如何处理令牌过期？
A: 使用刷新令牌获取新的访问令牌，参考 `/api/v2/oauth/token` 的 `refresh_token` 模式。

### Q: 如何撤销用户访问权限？
A: 调用 `/api/v2/oauth/revoke` 端点撤销特定令牌。

### Q: 如何验证 JWT 签名？
A: 使用 `/.well-known/jwks.json` 端点获取公钥进行验证。

### Q: 支持哪些权限范围？
A: 当前支持: `openid`, `profile`, `email`, `api:read`, `api:write`, `admin`。

## 🤝 与其他服务集成

- **admin-portal**: 管理后台通过此服务进行用户认证
- **kline-service**: 金融数据服务使用此服务验证 API 访问
- **pingora-proxy**: 反向代理可以验证 JWT 令牌

## 📞 支持与联系

- **文档**: [JWT 认证授权使用说明](/docs/guidelines/JWT认证授权使用说明.md)
- **问题反馈**: 创建 GitHub Issue
- **技术支持**: 联系认证授权团队