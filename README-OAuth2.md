# OAuth 2.0 认证授权中心

基于 OAuth 2.0 最佳实践构建的完整认证授权系统，支持多种认证流程、细粒度权限控制和全面的安全特性。

## 🚀 特性

### OAuth 2.0 支持
- ✅ Authorization Code Grant (PKCE 支持)
- ✅ Refresh Token Grant
- ✅ Client Credentials Grant
- ✅ JWT Access Tokens
- ✅ OpenID Connect (ID Tokens)

### 安全特性
- 🔒 PKCE (Proof Key for Code Exchange) 支持
- 🔒 JWT 客户端认证 (private_key_jwt)
- 🔒 Token 撤销 (RFC 7009)
- 🔒 Rate Limiting
- 🔒 审计日志
- 🔒 Token 哈希存储

### 权限管理
- 👥 细粒度资源权限系统
- 👥 基于角色的访问控制
- 👥 权限过期时间支持
- 👥 用户同意管理

## 📋 数据库架构

### 核心实体

#### User (用户)
```prisma
model User {
  id                String    @id @default(uuid())
  username          String    @unique
  email             String?   @unique
  password          String
  firstName         String?
  lastName          String?
  isActive          Boolean   @default(true)
  emailVerified     Boolean   @default(false)
  twoFactorEnabled  Boolean   @default(false)
  // ... 更多字段
}
```

#### Client (OAuth 客户端)
```prisma
model Client {
  id                      String   @id @default(uuid())
  clientId                String   @unique
  clientSecret            String?  // 公共客户端为空
  redirectUris            String   // JSON array
  name                    String
  jwksUri                 String?  // JWT 客户端认证
  tokenEndpointAuthMethod String   @default("client_secret_basic")
  isPublic                Boolean  @default(false)
  requirePkce             Boolean  @default(false)
  // ... 更多字段
}
```

#### Resource & Permission (资源和权限)
```prisma
model Resource {
  id          String   @id @default(uuid())
  name        String   @unique  // e.g., "user_profile"
  description String?
  apiPath     String?  // API 路径模式
}

model Permission {
  id          String   @id @default(uuid())
  name        String   @unique  // e.g., "read", "write"
  description String?
}

model UserResourcePermission {
  userId       String
  resourceId   String
  permissionId String
  expiresAt    DateTime? // 权限过期时间
  // ... 更多字段
}
```

## 🔧 API 端点

### OAuth 2.0 核心端点

#### 1. 授权端点
```
GET /api/oauth/authorize
```

**参数:**
- `client_id` (必需): 客户端ID
- `redirect_uri` (必需): 重定向URI
- `response_type` (必需): 必须为 "code"
- `scope` (可选): 请求的作用域
- `state` (推荐): 防 CSRF 状态参数
- `code_challenge` (PKCE): 代码挑战
- `code_challenge_method` (PKCE): 必须为 "S256"
- `nonce` (OIDC): 随机数
- `prompt` (可选): none, login, consent

**示例:**
```bash
curl "https://your-domain.com/api/oauth/authorize?client_id=your-client-id&redirect_uri=https://client.example.com/callback&response_type=code&scope=profile%20email&state=xyz&code_challenge=abc123&code_challenge_method=S256"
```

#### 2. Token 端点
```
POST /api/oauth/token
```

**Authorization Code Grant:**
```bash
curl -X POST https://your-domain.com/api/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code&code=AUTH_CODE&redirect_uri=REDIRECT_URI&client_id=CLIENT_ID&client_secret=CLIENT_SECRET&code_verifier=CODE_VERIFIER"
```

**Refresh Token Grant:**
```bash
curl -X POST https://your-domain.com/api/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=refresh_token&refresh_token=REFRESH_TOKEN&client_id=CLIENT_ID&client_secret=CLIENT_SECRET"
```

**Client Credentials Grant:**
```bash
curl -X POST https://your-domain.com/api/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&scope=api&client_id=CLIENT_ID&client_secret=CLIENT_SECRET"
```

#### 3. Token 撤销端点
```
POST /api/oauth/revoke
```

```bash
curl -X POST https://your-domain.com/api/oauth/revoke \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "token=TOKEN_TO_REVOKE&token_type_hint=access_token&client_id=CLIENT_ID&client_secret=CLIENT_SECRET"
```

### 管理 API

#### 客户端注册
```
POST /api/clients/register
```

```bash
curl -X POST https://your-domain.com/api/clients/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Application",
    "redirectUris": "https://myapp.com/callback,https://myapp.com/callback2",
    "jwksUri": "https://myapp.com/.well-known/jwks.json"
  }'
```

#### 权限管理
```
GET /api/permissions?userId=USER_ID
POST /api/permissions
DELETE /api/permissions?userId=USER_ID&resource=RESOURCE&permission=PERMISSION
```

**授予权限:**
```bash
curl -X POST https://your-domain.com/api/permissions \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-id",
    "resourceName": "user_profile",
    "permissionName": "read",
    "expiresAt": "2024-12-31T23:59:59Z"
  }'
```

## 🛡️ 使用中间件保护 API

### 基本认证
```typescript
import { withAuth } from '@/lib/auth/middleware';

export const GET = withAuth(
  async (request, context) => {
    // context.user_id, context.client_id, context.scopes, context.permissions
    return NextResponse.json({ message: 'Hello, authenticated user!' });
  },
  {
    requiredScopes: ['profile'],
    requireUserContext: true,
  }
);
```

### 权限检查
```typescript
export const PUT = withAuth(
  async (request, context) => {
    // 检查特定权限
    if (!context.permissions.includes('user_profile:write')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }
    
    // 实现逻辑
    return NextResponse.json({ message: 'Updated successfully' });
  },
  {
    requiredPermissions: ['user_profile:write'],
    requireUserContext: true,
  }
);
```

### 资源级权限检查
```typescript
import { hasResourcePermission } from '@/lib/auth/middleware';

export const GET = withAuth(
  async (request, context) => {
    const userId = request.nextUrl.searchParams.get('userId');
    
    // 用户只能访问自己的资源，或者有管理员权限
    if (context.user_id !== userId) {
      const hasAdminPermission = await hasResourcePermission(
        context.user_id!,
        'user_profile',
        'read_any'
      );
      
      if (!hasAdminPermission) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
    }
    
    // 返回用户数据
    return NextResponse.json({ user: userData });
  },
  {
    requiredScopes: ['profile'],
    requireUserContext: true,
  }
);
```

## 🔐 客户端认证方法

### 1. Client Secret Basic
```bash
curl -X POST https://your-domain.com/api/oauth/token \
  -H "Authorization: Basic $(echo -n 'client_id:client_secret' | base64)" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code&code=AUTH_CODE&redirect_uri=REDIRECT_URI"
```

### 2. Client Secret Post
```bash
curl -X POST https://your-domain.com/api/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code&code=AUTH_CODE&redirect_uri=REDIRECT_URI&client_id=CLIENT_ID&client_secret=CLIENT_SECRET"
```

### 3. Private Key JWT (推荐用于服务器端应用)
```bash
curl -X POST https://your-domain.com/api/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code&code=AUTH_CODE&redirect_uri=REDIRECT_URI&client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer&client_assertion=JWT_ASSERTION"
```

## 🔧 配置

### 环境变量
```env
# JWT 配置
JWT_ACCESS_TOKEN_SECRET=your-secret-key-min-32-chars
JWT_ISSUER=https://your-domain.com
JWT_AUDIENCE=your-api-audience

# 数据库
DATABASE_URL=mysql://user:password@localhost:3306/oauth2

# 可选配置
NODE_ENV=production
PORT=3000
```

### Prisma 设置
```bash
# 生成 Prisma 客户端
npx prisma generate

# 运行数据库迁移
npx prisma db push

# 查看数据库
npx prisma studio
```

## 📊 监控和审计

系统自动记录所有重要事件到 `AuditLog` 表：

- 用户登录/登出
- Token 颁发/刷新/撤销
- 权限授予/撤销
- API 访问
- 错误和安全事件

```sql
-- 查看最近的审计日志
SELECT 
  action,
  success,
  userId,
  clientId,
  ipAddress,
  createdAt,
  errorMessage
FROM AuditLog 
ORDER BY createdAt DESC 
LIMIT 100;
```

## 🛠️ 开发工具

### JWT 调试
使用 [jwt.io](https://jwt.io) 解析和验证 JWT tokens。

### PKCE 生成器
```javascript
// 生成 PKCE 参数
import { PKCEUtils } from '@/lib/auth/oauth2';

const codeVerifier = PKCEUtils.generateCodeVerifier();
const codeChallenge = PKCEUtils.generateCodeChallenge(codeVerifier);

console.log('Code Verifier:', codeVerifier);
console.log('Code Challenge:', codeChallenge);
```

### 测试客户端
```bash
# 创建测试客户端
curl -X POST https://your-domain.com/api/clients/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Client",
    "redirectUris": "http://localhost:3000/callback"
  }'
```

## 🔒 安全最佳实践

### 1. PKCE (推荐用于所有客户端)
- 公共客户端必须使用 PKCE
- 即使是机密客户端也建议使用 PKCE

### 2. 状态参数
- 始终使用 `state` 参数防止 CSRF 攻击
- 生成随机、不可预测的状态值

### 3. 作用域限制
- 请求最小必要的作用域
- 定期审查和清理不必要的权限

### 4. Token 生命周期
- Access Token: 1小时
- Refresh Token: 30天
- Authorization Code: 10分钟

### 5. 客户端配置
```json
{
  "requirePkce": true,
  "requireConsent": true,
  "tokenEndpointAuthMethod": "private_key_jwt"
}
```

## 📚 参考文档

- [RFC 6749 - OAuth 2.0](https://tools.ietf.org/html/rfc6749)
- [RFC 7636 - PKCE](https://tools.ietf.org/html/rfc7636)
- [RFC 7009 - Token Revocation](https://tools.ietf.org/html/rfc7009)
- [RFC 7523 - JWT Client Authentication](https://tools.ietf.org/html/rfc7523)
- [OpenID Connect Core](https://openid.net/specs/openid-connect-core-1_0.html)

## 🚀 部署

### 生产环境检查清单

- [ ] 设置强密码和密钥
- [ ] 配置 HTTPS
- [ ] 设置速率限制
- [ ] 配置日志记录
- [ ] 设置监控和告警
- [ ] 备份数据库
- [ ] 测试所有认证流程

### Docker 部署
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npx prisma generate
EXPOSE 3000
CMD ["npm", "start"]
```

---

这个 OAuth 2.0 认证授权中心提供了企业级的安全性和灵活性，支持现代应用程序的所有认证需求。通过遵循最佳实践和标准规范，确保了系统的安全性和互操作性。 