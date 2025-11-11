# @repo/database 数据库包文档

## 包概述

`@repo/database` 是项目的核心数据库包，提供完整的ORM功能、权限管理、OAuth 2.1认证支持以及MySQL/SQLite双数据库适配。

## 核心功能

### 1. 数据库ORM（Prisma）
- **SQLite**: 开发环境默认数据库（文件式）
- **MySQL**: 生产环境推荐数据库
- **Prisma Client**: 类型安全的ORM客户端
- **自动迁移**: 支持数据库结构版本控制

### 2. 权限管理系统
- **RBAC模型**: 基于角色的访问控制
- **ABAC扩展**: 支持上下文条件的权限控制
- **三种权限类型**:
  - API权限：控制REST API访问
  - 菜单权限：控制UI界面访问
  - 数据权限：控制数据行级/列级访问

### 3. OAuth 2.1认证支持
- **完整OAuth 2.1实现**: 支持授权码、客户端凭证、刷新令牌
- **PKCE支持**: 公共客户端强制要求PKCE
- **JWT令牌**: 支持JWT格式的访问令牌和刷新令牌
- **令牌撤销**: 完整的令牌撤销机制

### 4. 审计与监控
- **审计日志**: 完整的操作审计轨迹
- **登录尝试记录**: 记录所有登录行为
- **密码历史**: 防止密码重复使用

## 数据模型架构

### 认证核心模型
```
User (用户)
├── OAuthClient (OAuth客户端)
├── AuthorizationCode (授权码)
├── AccessToken (访问令牌)
├── RefreshToken (刷新令牌)
└── ConsentGrant (用户同意授权)
```

### 权限管理模型
```
Role (角色)
├── Permission (权限定义)
├── UserRole (用户-角色关联)
├── RolePermission (角色-权限关联)
└── ScopePermission (Scope-权限关联)
```

### 权限类型详细
- **ApiPermission**: HTTP方法级别的API权限
- **MenuPermission**: 前端菜单访问权限
- **DataPermission**: 数据行级/列级权限

### 审计与配置模型
```
AuditLog (审计日志)
SystemConfiguration (系统配置)
SecurityPolicy (安全策略)
TokenBlacklist (令牌黑名单)
```

## 快速开始

### 1. 安装依赖
```bash
pnpm install
```

### 2. 初始化数据库
```bash
# 开发环境（SQLite）
pnpm db:generate && pnpm db:push && pnpm db:seed

# 生产环境（MySQL）
pnpm db:generate && pnpm db:push && pnpm db:seed
```

### 3. 启动数据库管理界面
```bash
pnpm db:studio
```

### 4. 使用示例
```typescript
import { prisma } from '@repo/database/client';

// 创建用户
const user = await prisma.user.create({
  data: {
    username: 'newuser',
    passwordHash: 'hashed_password',
    firstName: '新',
    lastName: '用户',
  }
});

// 查询用户及权限
const userWithRoles = await prisma.user.findUnique({
  where: { username: 'admin' },
  include: {
    userRoles: {
      include: {
        role: {
          include: {
            rolePermissions: {
              include: { permission: true }
            }
          }
        }
      }
    }
  }
});
```

## 环境变量配置

### SQLite配置（开发环境）
```bash
DATABASE_URL="file:./dev.db"
```

### MySQL配置（生产环境）
```bash
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=your_database
```

## 可用脚本

| 命令 | 描述 |
|------|------|
| `pnpm db:generate` | 生成Prisma客户端 |
| `pnpm db:push` | 推送数据库结构 |
| `pnpm db:seed` | 填充初始数据 |
| `pnpm db:migrate` | 创建和应用迁移 |
| `pnpm db:migrate:deploy` | 部署迁移到生产 |
| `pnpm db:studio` | 启动Prisma Studio |
| `pnpm db:reset` | 重置数据库 |

## 默认数据

### 预定义角色
- **SYSTEM_ADMIN**: 系统管理员（拥有所有权限）
- **USER_ADMIN**: 用户管理员
- **PERMISSION_ADMIN**: 权限管理员
- **CLIENT_ADMIN**: 客户端管理员
- **AUDIT_ADMIN**: 审计管理员
- **USER**: 普通用户

### 默认管理员账户
- **用户名**: `admin`
- **密码**: `adminpassword`
- **角色**: SYSTEM_ADMIN

### 测试用户
- **用户名**: `testuser`
- **密码**: `password`
- **角色**: USER

## OAuth客户端配置

### 已配置的客户端

#### 1. 管理员门户客户端
- **clientId**: `admin-portal-client`
- **clientSecret**: `admin-portal-secret-key-change-this-in-production`
- **类型**: CONFIDENTIAL
- **重定向URI**: `http://localhost:3002/auth/callback`

#### 2. 认证中心管理客户端
- **clientId**: `auth-center-admin-client`
- **clientSecret**: `authcenteradminclientsecret`
- **类型**: CONFIDENTIAL
- **重定向URI**: `http://localhost:3002/auth/callback`

#### 3. 公共测试客户端
- **clientId**: `public-test-client`
- **类型**: PUBLIC
- **重定向URI**: `http://localhost:3001/callback`

## 使用MySQL

### 切换到MySQL
1. 修改 `prisma/schema.prisma`:
```prisma
datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}
```

2. 设置环境变量:
```bash
DATABASE_URL="mysql://user:password@localhost:3306/database_name"
```

3. 重新生成并推送:
```bash
pnpm db:generate && pnpm db:push && pnpm db:seed
```

### MySQL连接池
```typescript
import mysqlPool, { checkPoolHealth, closePool } from '@repo/database/mysql-client';

// 检查连接健康
const health = await checkPoolHealth();
console.log('MySQL健康状态:', health);

// 关闭连接池
await closePool();
```

## 权限验证示例

### 检查用户权限
```typescript
import { prisma } from '@repo/database/client';

// 检查用户是否具有特定权限
async function checkUserPermission(userId: string, permissionName: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      userRoles: {
        include: {
          role: {
            include: {
              rolePermissions: {
                include: { permission: true }
              }
            }
          }
        }
      }
    }
  });

  return user?.userRoles.some(ur => 
    ur.role.rolePermissions.some(rp => rp.permission.name === permissionName)
  ) || false;
}
```

### 创建自定义权限
```typescript
const customPermission = await prisma.permission.create({
  data: {
    name: 'custom:api:access',
    displayName: '自定义API访问',
    description: '访问自定义API端点',
    type: 'API',
    resource: '/api/custom',
    action: 'GET',
  }
});
```

## 开发最佳实践

### 1. 权限定义规范
- **命名格式**: `resource:action` 或 `type:resource:action`
- **示例**: `user:create`, `menu:dashboard:view`

### 2. 数据库迁移
```bash
# 创建新的迁移
pnpm db:migrate --name add_new_feature

# 应用迁移到生产
pnpm db:migrate:deploy
```

### 3. 测试数据管理
```bash
# 重置测试数据库
pnpm db:reset

# 重新填充数据
pnpm db:seed
```

### 4. 审计日志使用
```typescript
await prisma.auditLog.create({
  data: {
    action: 'USER_LOGIN_SUCCESS',
    actorType: 'USER',
    actorId: userId,
    status: 'SUCCESS',
    ipAddress: clientIP,
    details: { userAgent }
  }
});
```

## 故障排除

### 常见问题

#### 1. 连接问题
```bash
# 检查MySQL服务状态
systemctl status mysql

# 检查端口占用
netstat -tlnp | grep 3306
```

#### 2. 权限问题
```bash
# 检查数据库用户权限
mysql -u root -p
SHOW GRANTS FOR 'user'@'localhost';
```

#### 3. 迁移失败
```bash
# 重置数据库状态
pnpm db:reset

# 手动清理
rm prisma/dev.db
pnpm db:push && pnpm db:seed
```

## 扩展阅读

- [Prisma官方文档](https://www.prisma.io/docs/)
- [OAuth 2.1规范](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1)
- [RBAC最佳实践](https://csrc.nist.gov/projects/role-based-access-control)

## 联系支持

如有问题，请查看项目GitHub Issues或联系开发团队。