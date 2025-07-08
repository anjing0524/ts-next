# Lib 工具函数索引

本索引自动生成，列出了 `packages/lib` 包中部分核心工具函数的 **推荐导入路径**。所有工具都应通过子路径（如 `@repo/lib/auth`）导入，而不是深层文件路径。

## 认证 (`@repo/lib/auth`)

| 函数/类 | 描述 |
| --- | --- |
| `JWTUtils` | 一个包含静态方法的类，用于生成、验证和解码JWT。 |
| `PKCEUtils` | 用于在Node.js环境中生成和验证OAuth 2.1的PKCE代码的工具类。 |
| `ScopeUtils` | 用于验证和处理OAuth作用域的工具。 |
| `AuthorizationUtils` | 处理认证和授权相关逻辑的工具。 |
| `getUserIdFromRequest` | 从Next.js的请求对象中解析并验证JWT，返回用户ID。 |
| `PasswordComplexitySchema` | 使用Zod定义的密码复杂度验证规则。 |
| `generateSecurePassword` | 生成一个符合预定义复杂度要求的安全随机密码。 |
| `checkPasswordHistory` | 检查新密码是否在用户的近期密码历史中已存在。 |

## 浏览器工具 (`@repo/lib/utils`)

| 函数/类 | 描述 |
| --- | --- |
| `BrowserPKCEUtils` | 一个包含静态方法的类，用于在 **浏览器** ���境中生成和验证OAuth 2.1的PKCE代码。 |
| `getTimeWheelInstance` | 获取时间轮算法的单例。 |
| `logger` | 一个预配置的 `winston` logger实例，支持控制台和按日轮转的文件日志。 |
| `withErrorHandling` | 一个高阶函数，用于包装API路由以提供统一的错误处理。 |
| `RateLimitUtils` | 用于实现和管理API速率限制的工具类。 |

---
*文档最后更新于 2025-07-07*