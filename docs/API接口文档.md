# OAuth2.1认证授权中心API文档

> **文档版本**: v3.0  
> **创建日期**: 2024-01-20  
> **最后更新**: 2024-12-21  
> **文档状态**: 正式版  
> **维护团队**: 认证授权团队

## 文档摘要

本文档定义了OAuth2.1认证授权中心API的设计规范、接口定义、安全机制和最佳实践。本系统严格遵循OAuth2.1标准，**绝对不提供任何独立的login API端点**，所有认证操作必须通过标准的OAuth2.1授权码流程完成。

**🚨 重要声明**:
- ❌ **绝对不存在** `/api/v2/auth/login` 端点
- ❌ **完全不支持** 直接用户名/密码认证API
- ❌ **绝不使用** jsonwebtoken库
- ✅ **100%只支持** OAuth2.1授权码流程
- ✅ **强制使用** PKCE (S256)
- ✅ **100%使用** Jose库 (v6.0.11) 处理JWT
- ✅ **固定采用** RSA256签名算法

**技术栈确认**:
```json
{
  "JWT库": "jose@6.0.11",
  "签名算法": "RS256", 
  "认证流程": "OAuth2.1 + 强制PKCE",
  "令牌格式": "JWT (自包含)",
  "框架": "Next.js 15",
  "数据库": "Prisma + SQLite/PostgreSQL",
  "jsonwebtoken": "绝对未使用"
}
```

## 目录

- [1. OAuth2.1认证授权流程](#1-oauth21认证授权流程)
- [2. Jose库JWT令牌规范](#2-jose库jwt令牌规范)
- [3. API端点详细设计](#3-api端点详细设计)
- [4. 请求响应格式](#4-请求响应格式)
- [5. 错误处理规范](#5-错误处理规范)
- [6. 安全机制](#6-安全机制)
- [7. 客户端集成指南](#7-客户端集成指南)
- [8. 最佳实践](#8-最佳实践)

## 1. OAuth2.1认证授权流程

### 1.1 架构说明

本认证授权中心采用**去中心化认证设计**，完全基于OAuth2.1标准：

**设计原则**:
- 🔒 **无直接登录API**: 系统内不存在任何login端点
- 🔄 **标准OAuth2.1**: 100%遵循OAuth2.1规范
- 🛡️ **强制PKCE**: 所有客户端必须使用S256方法
- 🔑 **Jose处理**: 所有JWT操作使用Jose库
- 📱 **多端支持**: Web/Mobile/SPA统一流程

### 1.2 完整授权流程

```mermaid
sequenceDiagram
    participant C as 客户端应用
    participant U as 用户浏览器  
    participant AS as 授权服务器<br/>(本系统)
    participant UI as 认证中心UI
    participant RS as 资源服务器
    
    Note over C,RS: OAuth2.1标准流程 - 无login API端点
    
    rect rgb(255, 248, 220)
    Note over C: 步骤1: PKCE参数生成
    C->>C: 1.1 生成code_verifier (随机字符串)
    C->>C: 1.2 计算code_challenge = SHA256(code_verifier)
    C->>C: 1.3 生成state (防CSRF)
    end
    
    rect rgb(230, 255, 230)  
    Note over C,AS: 步骤2-4: 授权请求
    C->>U: 2. 重定向到授权端点
    U->>AS: 3. GET /api/v2/oauth/authorize<br/>+ PKCE参数
    AS->>AS: 4. 验证客户端、redirect_uri、PKCE
    end
    
    rect rgb(255, 230, 230)
    Note over AS,UI: 步骤5-6: 用户认证 (UI层面)
    alt 用户未登录
        AS->>U: 5. 重定向到认证中心UI (/login页面)
        U->>UI: 6. 用户在UI输入凭据并提交
        UI->>AS: 认证成功，建立会话
    end
    end
    
    rect rgb(230, 230, 255)
    Note over AS,C: 步骤7-10: 授权确认与码发放
    AS->>U: 7. 显示授权同意页面
    U->>AS: 8. 用户确认授权
    AS->>AS: 9. 生成授权码 (绑定PKCE challenge)
    AS->>U: 10. 重定向回客户端 (携带授权码)
    end
    
    rect rgb(255, 240, 255)
    Note over C,AS: 步骤11-12: 令牌交换 (Jose库)
    U->>C: 11. 授权码回调
    C->>AS: 12. POST /api/v2/oauth/token<br/>+ code_verifier (PKCE验证)
    AS->>AS: 验证授权码 + PKCE + 客户端
    AS->>AS: 使用Jose库生成JWT (RS256签名)
    AS->>C: 返回JWT令牌 (access_token + refresh_token)
    end
    
    rect rgb(240, 255, 255)
    Note over C,RS: 步骤13: API访问
    C->>RS: 13. API请求 (Bearer JWT令牌)
    RS->>RS: 使用JWKS验证JWT (Jose库)
    RS->>C: 返回API响应
    end
```

### 1.3 端点概览

| 端点路径 | HTTP方法 | 功能描述 | 认证要求 | 状态 |
|----------|----------|----------|----------|------|
| `/api/v2/oauth/authorize` | GET | **启动OAuth2.1授权流程** | 无 | ✅ 核心端点 |
| `/api/v2/oauth/token` | POST | **交换授权码获取JWT令牌** | 客户端认证 | ✅ 核心端点 |
| `/api/v2/oauth/userinfo` | GET | **OIDC用户信息端点** | Bearer令牌(openid scope) | ✅ 已修复端点 |
| `/api/v2/oauth/revoke` | POST | 撤销访问令牌 | 客户端认证 | ✅ 安全端点 |
| `/api/v2/oauth/introspect` | POST | 令牌内省检查 | 客户端认证 | ✅ 验证端点 |
| `/.well-known/jwks.json` | GET | **JWT验证公钥** | 无 | ✅ 必需端点 |
| `/.well-known/openid-configuration` | GET | OIDC发现信息 | 无 | ✅ 发现端点 |

**❌ 不存在的端点 (常见错误)**:

| 错误端点 | 状态 | 正确做法 |
|----------|------|----------|
| `/api/v2/auth/login` | **不存在** | 使用 `/api/v2/oauth/authorize` |
| `/api/v2/auth/logout` | **不存在** | 使用 `/api/v2/oauth/revoke` |
| `/api/v2/login` | **不存在** | 遵循OAuth2.1流程 |
| `/login` (API) | **不存在** | 这是UI页面，非API |

## 2. Jose库JWT令牌规范

### 2.1 JWT结构

本系统使用Jose库生成的JWT令牌具有以下结构：

#### 2.1.1 JWT Header
```json
{
  "alg": "RS256",           // 固定使用RSA256算法
  "kid": "key-2024-01",     // 密钥标识符 (用于JWKS匹配)
  "typ": "JWT"              // 令牌类型
}
```

#### 2.1.2 JWT Payload (访问令牌)
```json
{
  // === OAuth2.1标准声明 ===
  "iss": "https://auth.company.com",        // 签发者
  "aud": "api_resource",                    // 受众 (API资源标识)
  "sub": "user_123",                        // 主体 (用户ID)
  "client_id": "web_client_001",            // 客户端ID
  "iat": 1703001600,                        // 签发时间
  "exp": 1703005200,                        // 过期时间 (通常1小时)
  "jti": "550e8400-e29b-41d4-a716-446655440000", // 唯一令牌ID
  
  // === 权限相关声明 ===
  "scope": "openid profile api:read",      // 权限范围
  "permissions": [                          // 具体权限列表
    "user:profile:read",
    "api:data:read", 
    "system:health:read"
  ],
  
  // === 扩展声明 (可选) ===
  "user_type": "admin",                     // 用户类型
  "tenant_id": "tenant_001",                // 租户ID (多租户场景)
  "session_id": "session_xyz"               // 会话ID
}
```

### 2.2 Jose库核心操作

#### 2.2.1 JWT生成 (系统内部)
```typescript
// 系统内部实现 - lib/auth/oauth2.ts
import * as jose from 'jose';

export class JWTUtils {
  static async createAccessToken(tokenData: {
    client_id: string;
    user_id?: string;
    scope?: string;
    permissions?: string[];
    expiresIn?: string;
  }): Promise<string> {
    // 1. 导入RSA私钥
    const privateKey = await jose.importPKCS8(
      process.env.JWT_PRIVATE_KEY_PEM!,
      'RS256'
    );

    // 2. 构建JWT载荷
    const payload: jose.JWTPayload = {
      client_id: tokenData.client_id,
      sub: tokenData.user_id || tokenData.client_id,
      aud: process.env.JWT_AUDIENCE || 'api_resource',
      iss: process.env.JWT_ISSUER || 'https://auth.company.com',
      jti: crypto.randomUUID(),
      scope: tokenData.scope,
      permissions: tokenData.permissions || [],
    };

    // 3. 生成并签名JWT
    return await new jose.SignJWT(payload)
      .setProtectedHeader({ 
        alg: 'RS256', 
        kid: process.env.JWT_KEY_ID || 'default-kid' 
      })
      .setIssuedAt()
      .setExpirationTime(tokenData.expiresIn || '1h')
      .sign(privateKey);
  }
}
```

#### 2.2.2 JWT验证 (客户端应用)
```typescript
// 客户端应用中的JWT验证
import * as jose from 'jose';

export async function verifyAccessToken(token: string): Promise<jose.JWTPayload> {
  // 1. 从JWKS端点获取公钥 (推荐方式)
  const JWKS = jose.createRemoteJWKSet(
    new URL('https://auth.company.com/.well-known/jwks.json')
  );

  // 2. 验证JWT
  const { payload } = await jose.jwtVerify(token, JWKS, {
    issuer: 'https://auth.company.com',
    audience: 'api_resource',
    algorithms: ['RS256'],
  });

  return payload;
}

// 使用示例
try {
  const payload = await verifyAccessToken(accessToken);
  console.log('用户ID:', payload.sub);
  console.log('客户端ID:', payload.client_id);
  console.log('权限范围:', payload.scope);
  console.log('具体权限:', payload.permissions);
} catch (error) {
  if (error instanceof jose.errors.JWTExpired) {
    console.error('令牌已过期，需要刷新');
  } else if (error instanceof jose.errors.JWSSignatureVerificationFailed) {
    console.error('令牌签名验证失败，可能被篡改');
  } else {
    console.error('令牌验证失败:', error.message);
  }
}
```

## 3. API端点详细设计

### 3.1 授权端点

```http
GET /api/v2/oauth/authorize
```

**功能描述**: 启动OAuth2.1授权码流程，支持OIDC  
**认证要求**: 无需预认证  
**PKCE要求**: 强制必须，只支持S256方法  

#### 3.1.1 请求参数

| 参数名 | 类型 | 必需性 | 描述 | 示例值 |
|--------|------|--------|------|--------|
| `response_type` | string | ✅ 必需 | 响应类型，固定为 `code` | `code` |
| `client_id` | string | ✅ 必需 | 在系统中注册的客户端标识符 | `web_app_001` |
| `redirect_uri` | string | ✅ 必需 | 授权成功后的回调URI，必须完全匹配注册值 | `https://app.com/callback` |
| `scope` | string | ✅ 必需 | 请求的权限范围，空格分隔 | `openid profile api:read` |
| `state` | string | ⚠️ 强烈推荐 | 随机字符串，防止CSRF攻击 | `xyz123random` |
| `code_challenge` | string | ✅ 必需 | PKCE挑战码，SHA256(code_verifier)的base64url编码 | `E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM` |
| `code_challenge_method` | string | ✅ 必需 | PKCE挑战方法，固定为 `S256` | `S256` |
| `nonce` | string | ⚪ 可选 | OIDC随机数，当scope包含openid时推荐使用 | `abc789nonce` |

#### 3.1.2 PKCE参数生成示例

```typescript
// 客户端生成PKCE参数
import crypto from 'crypto';

function generatePKCEParams() {
  // 1. 生成code_verifier (43-128字符)
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  
  // 2. 计算code_challenge = SHA256(code_verifier)
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
  
  return {
    codeVerifier,    // 存储在客户端，稍后交换令牌时使用
    codeChallenge,   // 发送给授权服务器
    codeChallengeMethod: 'S256'
  };
}
```

#### 3.1.3 请求示例

```http
GET /api/v2/oauth/authorize?response_type=code&client_id=web_app_001&redirect_uri=https%3A//app.com/callback&scope=openid%20profile%20api%3Aread&state=xyz123random&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256&nonce=abc789nonce HTTP/1.1
Host: auth.company.com
User-Agent: Mozilla/5.0 (compatible)
```

#### 3.1.4 响应行为

| 场景 | HTTP状态码 | 行为描述 |
|------|------------|----------|
| **用户未登录** | `302 Found` | 重定向到认证中心UI登录页面 `/login` |
| **需要授权同意** | `302 Found` | 重定向到授权同意页面 `/api/v2/oauth/consent` |
| **授权成功** | `302 Found` | 重定向回客户端，携带授权码 |
| **参数错误** | `400 Bad Request` | 返回JSON错误响应 |
| **客户端无效** | `400 Bad Request` | 返回JSON错误响应 |

**成功重定向示例**:
```http
HTTP/1.1 302 Found
Location: https://app.com/callback?code=SplxlOBeZQQYbYS6WxSbIA&state=xyz123random
```

**错误响应示例**:
```json
{
  "error": "invalid_request",
  "error_description": "PKCE is required for this client. code_challenge and code_challenge_method must be provided.",
  "state": "xyz123random"
}
```

### 3.2 令牌端点

```http
POST /api/v2/oauth/token
```

**功能描述**: 交换授权码获取JWT访问令牌  
**认证要求**: 客户端认证 (推荐Authorization Header)  
**内容类型**: `application/x-www-form-urlencoded`  
**响应格式**: JSON  

#### 3.2.1 客户端认证方式

**方式1: HTTP Basic认证 (推荐)**
```http
POST /api/v2/oauth/token
Authorization: Basic d2ViX2FwcF8wMDE6c2VjcmV0X2tleQ==
Content-Type: application/x-www-form-urlencoded
```

**方式2: 请求体认证**
```http
POST /api/v2/oauth/token
Content-Type: application/x-www-form-urlencoded

client_id=web_app_001&client_secret=secret_key&grant_type=authorization_code&...
```

#### 3.2.2 授权码模式参数

| 参数名 | 类型 | 必需性 | 描述 | 示例值 |
|--------|------|--------|------|--------|
| `grant_type` | string | ✅ 必需 | 授权类型，固定为 `authorization_code` | `authorization_code` |
| `code` | string | ✅ 必需 | 从授权端点获取的授权码 | `SplxlOBeZQQYbYS6WxSbIA` |
| `redirect_uri` | string | ✅ 必需 | 必须与授权请求中的完全一致 | `https://app.com/callback` |
| `client_id` | string | ✅ 必需 | 客户端标识符 | `web_app_001` |
| `code_verifier` | string | ✅ 必需 | PKCE验证码，原始的code_verifier | `dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk` |

#### 3.2.3 请求示例

```http
POST /api/v2/oauth/token HTTP/1.1
Host: auth.company.com
Authorization: Basic d2ViX2FwcF8wMDE6c2VjcmV0X2tleQ==
Content-Type: application/x-www-form-urlencoded
Content-Length: 234

grant_type=authorization_code&code=SplxlOBeZQQYbYS6WxSbIA&redirect_uri=https%3A//app.com/callback&client_id=web_app_001&code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
```

#### 3.2.4 成功响应

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsImtpZCI6ImtleS0yMDI0LTAxIn0.eyJpc3MiOiJodHRwczovL2F1dGguY29tcGFueS5jb20iLCJhdWQiOiJhcGlfcmVzb3VyY2UiLCJzdWIiOiJ1c2VyXzEyMyIsImNsaWVudF9pZCI6IndlYl9hcHBfMDAxIiwiaWF0IjoxNzAzMDAxNjAwLCJleHAiOjE3MDMwMDUyMDAsImp0aSI6IjU1MGU4NDAwLWUyOWItNDFkNC1hNzE2LTQ0NjY1NTQ0MDAwMCIsInNjb3BlIjoib3BlbmlkIHByb2ZpbGUgYXBpOnJlYWQiLCJwZXJtaXNzaW9ucyI6WyJ1c2VyOnByb2ZpbGU6cmVhZCIsImFwaTpkYXRhOnJlYWQiXX0.signature",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "eyJhbGciOiJSUzI1NiIsImtpZCI6ImtleS0yMDI0LTAxIn0.eyJpc3MiOiJodHRwczovL2F1dGguY29tcGFueS5jb20iLCJhdWQiOiJhcGlfcmVzb3VyY2UiLCJzdWIiOiJ1c2VyXzEyMyIsImNsaWVudF9pZCI6IndlYl9hcHBfMDAxIiwiaWF0IjoxNzAzMDAxNjAwLCJleHAiOjE3MDU1OTM2MDAsImp0aSI6Ijc3MGU4NDAwLWUyOWItNDFkNC1hNzE2LTQ0NjY1NTQ0MDAwMCIsInR5cCI6InJlZnJlc2hfdG9rZW4ifQ.signature",
  "scope": "openid profile api:read",
  "id_token": "eyJhbGciOiJSUzI1NiIsImtpZCI6ImtleS0yMDI0LTAxIn0.eyJpc3MiOiJodHRwczovL2F1dGguY29tcGFueS5jb20iLCJhdWQiOiJ3ZWJfYXBwXzAwMSIsInN1YiI6InVzZXJfMTIzIiwiaWF0IjoxNzAzMDAxNjAwLCJleHAiOjE3MDMwMDUyMDAsIm5vbmNlIjoiYWJjNzg5bm9uY2UiLCJhdXRoX3RpbWUiOjE3MDMwMDE2MDAsImVtYWlsIjoidXNlckBleGFtcGxlLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJuYW1lIjoi5byg5LiJIiwicHJlZmVycmVkX3VzZXJuYW1lIjoiemhhbmdzYW4ifQ.signature"
}
```

#### 3.2.5 刷新令牌模式

**参数**:
| 参数名 | 类型 | 必需性 | 描述 |
|--------|------|--------|------|
| `grant_type` | string | ✅ 必需 | 固定为 `refresh_token` |
| `refresh_token` | string | ✅ 必需 | 有效的刷新令牌 |
| `scope` | string | ⚪ 可选 | 请求的权限范围 (不能超过原始范围) |

**请求示例**:
```http
POST /api/v2/oauth/token
Authorization: Basic d2ViX2FwcF8wMDE6c2VjcmV0X2tleQ==
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token&refresh_token=eyJhbGciOiJSUzI1NiIs...
```

#### 3.2.6 客户端凭证模式 

**参数**:
| 参数名 | 类型 | 必需性 | 描述 |
|--------|------|--------|------|
| `grant_type` | string | ✅ 必需 | 固定为 `client_credentials` |
| `scope` | string | ⚪ 可选 | 请求的权限范围 |

**请求示例**:
```http
POST /api/v2/oauth/token
Authorization: Basic Y29uZmlkZW50aWFsX2NsaWVudDpjbGllbnRfc2VjcmV0
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&scope=api:read
```

### 3.3 用户信息端点

```http
GET /api/v2/oauth/userinfo
```

**功能描述**: 获取当前用户的详细信息  
**认证要求**: Bearer访问令牌  
**范围要求**: 令牌必须包含 `openid` 范围  

#### 3.3.1 请求示例

```http
GET /api/v2/oauth/userinfo HTTP/1.1
Host: auth.company.com
Authorization: Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6ImtleS0yMDI0LTAxIn0...
Accept: application/json
```

#### 3.3.2 响应示例

```json
{
  "sub": "user_123",
  "email": "user@example.com",
  "email_verified": true,
  "name": "张三",
  "given_name": "三",
  "family_name": "张",
  "preferred_username": "zhangsan",
  "profile": "https://example.com/profiles/zhangsan",
  "picture": "https://example.com/avatars/zhangsan.jpg",
  "website": "https://zhangsan.dev",
  "gender": "male",
  "birthdate": "1990-01-01",
  "zoneinfo": "Asia/Shanghai",
  "locale": "zh-CN",
  "phone_number": "+86-138-0013-8000",
  "phone_number_verified": true,
  "address": {
    "formatted": "北京市朝阳区某某街道123号",
    "street_address": "某某街道123号",
    "locality": "朝阳区",
    "region": "北京市",
    "postal_code": "100000",
    "country": "CN"
  },
  "updated_at": 1703001600
}
```

### 3.4 JWKS端点

```http
GET /.well-known/jwks.json
```

**功能描述**: 提供JWT验证所需的公钥  
**认证要求**: 无需认证  
**缓存策略**: `Cache-Control: public, max-age=3600`  

#### 3.4.1 响应示例

```json
{
  "keys": [
    {
      "kty": "RSA",
      "kid": "key-2024-01",
      "use": "sig",
      "alg": "RS256",
      "n": "0vx7agoebGcQSWuuiUiUJxu2K7YiNj6v...",
      "e": "AQAB",
      "x5c": [
        "MIIDQjCCAiqgAwIBAgIGATz/FuLiMA0GCSqGSIb3DQEBBQUAMGIxCzAJBgNVBAYTAlVTMQswCQYDVQQIEwJDTzEPMA0GA1UEBxMGRGVudmVyMRwwGgYDVQQKExNQaW5nIElkZW50aXR5IENvcnAxFzAVBgNVBAMTDkJyaWFuIENhbXBiZWxsMB4XDTE..."
      ],
      "x5t": "OQmrWuAPiNZmYGg..."
    }
  ]
}
```

### 3.5 OpenID Connect配置端点

```http  
GET /.well-known/openid-configuration
```

**功能描述**: OIDC发现端点，提供服务配置信息  
**认证要求**: 无需认证  

#### 3.5.1 响应示例

```json
{
  "issuer": "https://auth.company.com",
  "authorization_endpoint": "https://auth.company.com/api/v2/oauth/authorize",
  "token_endpoint": "https://auth.company.com/api/v2/oauth/token",
  "userinfo_endpoint": "https://auth.company.com/api/v2/oauth/userinfo",
  "revocation_endpoint": "https://auth.company.com/api/v2/oauth/revoke",
  "introspection_endpoint": "https://auth.company.com/api/v2/oauth/introspect",
  "jwks_uri": "https://auth.company.com/.well-known/jwks.json",
  "response_types_supported": ["code"],
  "subject_types_supported": ["public"],
  "id_token_signing_alg_values_supported": ["RS256"],
  "scopes_supported": ["openid", "profile", "email", "address", "phone"],
  "token_endpoint_auth_methods_supported": [
    "client_secret_basic",
    "client_secret_post",
    "private_key_jwt"
  ],
  "claims_supported": [
    "sub", "iss", "aud", "exp", "iat", "auth_time", "nonce",
    "email", "email_verified", "name", "given_name", "family_name",
    "preferred_username", "profile", "picture", "website", "gender",
    "birthdate", "zoneinfo", "locale", "phone_number", "phone_number_verified",
    "address"
  ],
  "code_challenge_methods_supported": ["S256"],
  "grant_types_supported": [
    "authorization_code",
    "refresh_token", 
    "client_credentials"
  ]
}
```

## 4. 请求响应格式

### 4.1 请求格式

#### 4.1.1 OAuth2.1令牌端点
```http
POST /api/v2/oauth/token
Content-Type: application/x-www-form-urlencoded
Authorization: Basic Y2xpZW50X2lkOmNsaWVudF9zZWNyZXQ=

grant_type=authorization_code&code=abc123&redirect_uri=https%3A//app.com/callback&code_verifier=xyz789
```

#### 4.1.2 API调用
```http
GET /api/v2/users/me
Authorization: Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6IjEyMyJ9...
Accept: application/json
```

### 4.2 成功响应格式

#### 4.2.1 OAuth2.1令牌响应
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsImtpZCI6IjEyMyJ9...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "eyJhbGciOiJSUzI1NiIsImtpZCI6IjEyMyJ9...",
  "scope": "openid profile api:read"
}
```

#### 4.2.2 标准API响应
```json
{
  "data": {
    "id": "user_123",
    "username": "zhangsan",
    "email": "zhangsan@example.com"
  },
  "meta": {
    "timestamp": "2024-12-20T10:30:00Z",
    "version": "v2"
  }
}
```

#### 4.2.3 分页响应
```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "pages": 5
  },
  "meta": {
    "timestamp": "2024-12-20T10:30:00Z"
  }
}
```

## 5. 错误处理规范

### 5.1 OAuth2.1错误格式

符合RFC 6749标准：

```json
{
  "error": "invalid_request",
  "error_description": "Missing required parameter: code_verifier",
  "error_uri": "https://auth.company.com/docs/errors#invalid_request",
  "state": "xyz"
}
```

### 5.2 标准API错误格式

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input parameters",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format"
      }
    ]
  },
  "meta": {
    "timestamp": "2024-12-20T10:30:00Z",
    "request_id": "req_123456"
  }
}
```

### 5.3 HTTP状态码

| 状态码 | 含义 | 使用场景 |
|--------|------|----------|
| `200` | 成功 | 标准成功响应 |
| `201` | 已创建 | 资源创建成功 |
| `400` | 请求错误 | 参数验证失败，OAuth2.1错误 |
| `401` | 未认证 | 缺少或无效的访问令牌 |
| `403` | 权限不足 | 令牌有效但权限不够 |
| `404` | 未找到 | 资源不存在 |
| `429` | 限流 | 请求频率超限 |
| `500` | 服务器错误 | 内部错误 |

## 6. 安全机制

### 6.1 OAuth2.1安全增强

- **强制PKCE**: 所有客户端必须使用PKCE
- **State参数**: 防止CSRF攻击
- **短期令牌**: Access Token默认1小时过期
- **令牌撤销**: 支持主动令牌撤销
- **HTTPS强制**: 生产环境必须使用HTTPS

### 6.2 JWT安全特性

- **RSA256签名**: 使用非对称加密算法
- **令牌绑定**: 令牌绑定特定客户端和用户
- **过期验证**: 自动过期时间检查
- **JTI追踪**: 唯一令牌标识符，支持黑名单
- **公钥分发**: 通过JWKS端点分发验证公钥

### 6.3 API安全措施

- **限流保护**: IP和客户端级别限流
- **输入验证**: Zod schema严格验证
- **权限检查**: 基于角色和权限的访问控制
- **审计日志**: 完整的操作审计记录
- **敏感信息保护**: 不在日志中记录敏感数据

## 7. 客户端集成指南

### 7.1 安全的令牌存储
```typescript
// ✅ 推荐做法
class TokenManager {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  
  // Access Token存储在内存中
  setAccessToken(token: string) {
    this.accessToken = token;
  }
  
  // Refresh Token存储在HttpOnly Cookie中
  setRefreshToken(token: string) {
    // 由服务器设置HttpOnly Cookie
    // document.cookie = `refresh_token=${token}; HttpOnly; Secure; SameSite=Strict`;
  }
  
  // 自动刷新令牌
  async getValidAccessToken(): Promise<string> {
    if (this.accessToken && !this.isTokenExpired(this.accessToken)) {
      return this.accessToken;
    }
    
    // 使用refresh token获取新的access token
    return await this.refreshAccessToken();
  }
}
```

### 7.2 错误处理
```typescript
// ✅ 完整的错误处理
async function apiCall(endpoint: string, options?: RequestInit) {
  try {
    const token = await tokenManager.getValidAccessToken();
    
    const response = await fetch(endpoint, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options?.headers
      }
    });
    
    if (response.status === 401) {
      // 令牌无效，重新认证
      window.location.href = '/oauth/authorize';
      return;
    }
    
    if (response.status === 403) {
      throw new Error('权限不足');
    }
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error_description || 'API调用失败');
    }
    
    return await response.json();
  } catch (error) {
    console.error('API调用错误:', error);
    throw error;
  }
}
```

## 8. 最佳实践

### 8.1 客户端实现

#### 8.1.1 安全的令牌存储
```typescript
// ✅ 推荐做法
class TokenManager {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  
  // Access Token存储在内存中
  setAccessToken(token: string) {
    this.accessToken = token;
  }
  
  // Refresh Token存储在HttpOnly Cookie中
  setRefreshToken(token: string) {
    // 由服务器设置HttpOnly Cookie
    // document.cookie = `refresh_token=${token}; HttpOnly; Secure; SameSite=Strict`;
  }
  
  // 自动刷新令牌
  async getValidAccessToken(): Promise<string> {
    if (this.accessToken && !this.isTokenExpired(this.accessToken)) {
      return this.accessToken;
    }
    
    // 使用refresh token获取新的access token
    return await this.refreshAccessToken();
  }
}
```

#### 8.1.2 错误处理
```typescript
// ✅ 完整的错误处理
async function apiCall(endpoint: string, options?: RequestInit) {
  try {
    const token = await tokenManager.getValidAccessToken();
    
    const response = await fetch(endpoint, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options?.headers
      }
    });
    
    if (response.status === 401) {
      // 令牌无效，重新认证
      window.location.href = '/oauth/authorize';
      return;
    }
    
    if (response.status === 403) {
      throw new Error('权限不足');
    }
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error_description || 'API调用失败');
    }
    
    return await response.json();
  } catch (error) {
    console.error('API调用错误:', error);
    throw error;
  }
}
```

### 8.2 服务端实现

#### 8.2.1 JWT中间件
```typescript
// ✅ 使用Jose库的验证中间件
import * as jose from 'jose';

export async function jwtMiddleware(request: Request) {
  const authorization = request.headers.get('authorization');
  
  if (!authorization?.startsWith('Bearer ')) {
    return { error: 'Missing or invalid authorization header' };
  }
  
  const token = authorization.substring(7);
  
  try {
    const JWKS = jose.createRemoteJWKSet(
      new URL(process.env.JWKS_URI!)
    );
    
    const { payload } = await jose.jwtVerify(token, JWKS, {
      issuer: process.env.JWT_ISSUER,
      audience: process.env.JWT_AUDIENCE,
      algorithms: ['RS256'],
    });
    
    return { 
      userId: payload.sub,
      clientId: payload.client_id,
      scopes: payload.scope?.split(' ') || [],
      permissions: payload.permissions || []
    };
  } catch (error) {
    return { error: 'Invalid token' };
  }
}
```

#### 8.2.2 权限检查
```typescript
// ✅ 权限检查装饰器
function requireScope(requiredScope: string) {
  return function(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function(...args: any[]) {
      const authContext = args[0].authContext; // 从请求中获取认证上下文
      
      if (!authContext.scopes.includes(requiredScope)) {
        throw new Error(`Required scope: ${requiredScope}`);
      }
      
      return originalMethod.apply(this, args);
    };
  };
}

// 使用示例
class UserController {
  @requireScope('user:read')
  async getUser(request: AuthenticatedRequest) {
    // 实现用户获取逻辑
  }
  
  @requireScope('user:write')
  async updateUser(request: AuthenticatedRequest) {
    // 实现用户更新逻辑
  }
}
```

### 8.3 监控与日志

#### 8.3.1 审计日志
```typescript
// ✅ 结构化审计日志
interface AuditEvent {
  timestamp: string;
  userId?: string;
  clientId?: string;
  action: string;
  resource: string;
  success: boolean;
  errorMessage?: string;
  ipAddress?: string;
  userAgent?: string;
}

async function logAuditEvent(event: AuditEvent) {
  const auditLog = {
    ...event,
    timestamp: new Date().toISOString(),
    id: crypto.randomUUID()
  };
  
  // 记录到数据库或日志系统
  await prisma.auditLog.create({ data: auditLog });
  
  // 安全敏感事件额外告警
  if (!event.success && ['token_issued', 'permission_granted'].includes(event.action)) {
    await sendSecurityAlert(auditLog);
  }
}
```

---

**注意**: 本系统完全基于OAuth2.1标准实现，不提供独立的login端点。所有认证操作必须通过标准的OAuth2.1授权码流程完成。JWT令牌使用Jose库处理，确保安全性和标准兼容性。

