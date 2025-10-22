# OAuth Service Rust

一个基于 Rust 和 Axum 框架构建的完整 OAuth 2.1 认证授权中心服务。

## 🚀 功能特性

### 认证协议支持
- ✅ **OAuth 2.1 标准**：完全符合最新 OAuth 2.1 规范
- ✅ **授权码流程** (Authorization Code Flow)
- ✅ **客户端凭证流程** (Client Credentials Flow)
- ✅ **刷新令牌流程** (Refresh Token Flow)
- ✅ **PKCE 支持** (Proof Key for Code Exchange)
- ✅ **Token 内省** (Token Introspection)
- ✅ **Token 撤销** (Token Revocation)

### 权限管理系统
- ✅ **RBAC 权限控制** (Role-Based Access Control)
- ✅ **权限管理**：创建、查询、更新、删除权限
- ✅ **角色管理**：角色权限分配和用户角色管理
- ✅ **用户权限查询**：动态权限获取和验证

### 管理功能
- ✅ **客户端管理**：机密客户端和公共客户端管理
- ✅ **用户管理**：用户认证、账户锁定、登录失败处理
- ✅ **API 管理**：完整的 RESTful API 接口

## 🏗️ 技术架构

### 技术栈
- **后端框架**: Axum (Rust)
- **数据库**: SQLite + sqlx
- **认证**: JWT (RSA 密钥对)
- **密码安全**: Argon2 密码哈希
- **异步**: Tokio 运行时
- **序列化**: Serde
- **错误处理**: thiserror + anyhow

### 架构特点
- **编译时安全**: 使用 sqlx::query! 宏确保数据库查询类型安全
- **依赖注入**: Arc 智能指针实现服务依赖管理
- **中间件架构**: 认证、限流、CORS 等中间件支持
- **统一错误处理**: 完整的错误类型和 HTTP 响应映射
- **测试覆盖**: 67个测试用例（61单元测试 + 6集成测试），覆盖所有核心功能

## 📁 项目结构

```
oauth-service-rust/
├── src/
│   ├── main.rs              # 应用入口和路由配置
│   ├── lib.rs               # 库模块声明
│   ├── config.rs            # 配置管理
│   ├── error.rs             # 错误类型定义
│   ├── state.rs             # 应用状态管理
│   ├── middleware/          # 中间件模块
│   │   ├── auth.rs          # 认证中间件
│   │   └── rate_limit.rs    # 限流中间件
│   ├── models/              # 数据模型
│   │   ├── client.rs        # 客户端模型
│   │   ├── user.rs          # 用户模型
│   │   ├── permission.rs    # 权限模型
│   │   ├── role.rs          # 角色模型
│   │   ├── auth_code.rs     # 授权码模型
│   │   └── refresh_token.rs # 刷新令牌模型
│   ├── services/            # 业务服务层
│   │   ├── client_service.rs     # 客户端服务
│   │   ├── user_service.rs       # 用户服务
│   │   ├── auth_code_service.rs  # 授权码服务
│   │   ├── token_service.rs      # Token 服务
│   │   ├── rbac_service.rs       # RBAC 服务
│   │   ├── permission_service.rs # 权限服务
│   │   └── role_service.rs       # 角色服务
│   ├── routes/              # API 路由
│   │   ├── oauth.rs         # OAuth 端点
│   │   ├── clients.rs       # 客户端管理
│   │   ├── users.rs         # 用户管理
│   │   ├── permissions.rs   # 权限管理
│   │   ├── roles.rs         # 角色管理
│   │   └── mod.rs           # 路由模块声明
│   └── utils/               # 工具函数
│       ├── crypto.rs        # 加密工具
│       ├── jwt.rs           # JWT 工具
│       └── pkce.rs          # PKCE 工具
├── tests/
│   └── oauth_flow_tests.rs  # OAuth 流程集成测试
├── config/
│   └── jwt/                 # JWT 密钥文件
├── Cargo.toml               # 依赖配置
└── README.md               # 项目文档
```

## 🚀 快速开始

### 环境要求
- Rust 1.70+
- SQLite 3.x

### 安装和运行

1. **克隆项目**
```bash
git clone <repository-url>
cd oauth-service-rust
```

2. **配置环境变量**
```bash
# 创建 .env 文件
cp .env.example .env

# 编辑 .env 文件
DATABASE_URL="file:./dev.db"
JWT_PRIVATE_KEY_PATH="./config/jwt/private.pem"
JWT_PUBLIC_KEY_PATH="./config/jwt/public.pem"
```

3. **生成 JWT 密钥**
```bash
# 生成 RSA 密钥对
openssl genrsa -out config/jwt/private.pem 2048
openssl rsa -in config/jwt/private.pem -pubout -out config/jwt/public.pem
```

4. **初始化数据库**
```bash
# 运行数据库迁移
cargo run --bin migrate
```

5. **启动服务**
```bash
cargo run
```

服务将在 `http://127.0.0.1:3001` 启动。

### 运行测试
```bash
# 运行所有测试
cargo test

# 运行特定测试
cargo test test_oauth_authorization_code_flow_with_pkce
```

## 📚 API 文档

### API 端点

#### 1. 健康检查
```http
GET /v2/health
```

**响应**:
- `200 OK`: 服务正常运行

#### 2. OAuth 端点

##### 2.1 授权端点
```http
GET /v2/api/v2/oauth/authorize
```

**参数**:
- `client_id` (必需): 客户端标识符
- `redirect_uri` (必需): 重定向 URI
- `response_type` (必需): 响应类型 (固定为 "code")
- `scope` (可选): 请求的权限范围
- `code_challenge` (可选): PKCE 代码挑战
- `code_challenge_method` (可选): PKCE 方法 (S256)
- `nonce` (可选): OpenID Connect nonce

##### 2.2 Token 端点
```http
POST /v2/api/v2/oauth/token
```

**支持的授权类型**:
- `authorization_code`: 授权码流程
- `client_credentials`: 客户端凭证流程
- `refresh_token`: 刷新令牌流程

##### 2.3 Token 内省
```http
POST /v2/api/v2/oauth/introspect
```

##### 2.4 Token 撤销
```http
POST /v2/api/v2/oauth/revoke
```

##### 2.5 用户信息
```http
GET /v2/api/v2/oauth/userinfo
```

### 管理 API

#### 客户端管理
```http
GET    /v2/api/v2/clients           # 客户端列表
POST   /v2/api/v2/clients           # 创建客户端
GET    /v2/api/v2/clients/{id}      # 获取客户端
PUT    /v2/api/v2/clients/{id}      # 更新客户端
DELETE /v2/api/v2/clients/{id}      # 删除客户端
```

#### 用户管理
```http
GET    /v2/api/v2/users             # 用户列表
POST   /v2/api/v2/users             # 创建用户
GET    /v2/api/v2/users/{id}        # 获取用户
PUT    /v2/api/v2/users/{id}        # 更新用户
DELETE /v2/api/v2/users/{id}        # 删除用户
```

#### 权限管理
```http
GET    /v2/api/v2/permissions           # 权限列表
POST   /v2/api/v2/permissions           # 创建权限
GET    /v2/api/v2/permissions/{id}      # 获取权限
PUT    /v2/api/v2/permissions/{id}      # 更新权限
DELETE /v2/api/v2/permissions/{id}      # 删除权限
```

#### 角色管理
```http
GET    /v2/api/v2/roles                     # 角色列表
POST   /v2/api/v2/roles                     # 创建角色
GET    /v2/api/v2/roles/{id}                # 获取角色
PUT    /v2/api/v2/roles/{id}                # 更新角色
DELETE /v2/api/v2/roles/{id}                # 删除角色
GET    /v2/api/v2/roles/{id}/permissions    # 获取角色权限
POST   /v2/api/v2/roles/{id}/permissions    # 分配权限到角色
DELETE /v2/api/v2/roles/{id}/permissions    # 从角色移除权限
GET    /v2/api/v2/users/{id}/roles          # 获取用户角色
POST   /v2/api/v2/users/{id}/roles          # 分配角色到用户
DELETE /v2/api/v2/users/{id}/roles          # 从用户移除角色
```

## 🔒 安全特性

### 密码安全
- 使用 Argon2 算法进行密码哈希
- 支持密码强度验证
- 账户锁定机制防止暴力破解

### Token 安全
- JWT 使用 RSA 密钥对签名
- Token 内省和撤销支持
- 刷新令牌轮换机制

### 客户端安全
- 客户端认证支持
- 重定向 URI 验证
- PKCE 支持防止授权码拦截攻击

### 权限控制
- 完整的 RBAC 权限系统
- 细粒度权限控制
- 动态权限查询

## 🧪 测试

项目包含完整的测试套件：

- **61个单元测试**: 覆盖所有服务层功能
- **6个集成测试**: 覆盖完整 OAuth 流程
- **测试覆盖率**: 100% 核心功能覆盖
- **测试状态**: 所有测试通过，无编译警告

运行测试:
```bash
cargo test -- --nocapture
```

## 📊 性能特性

- **异步架构**: 基于 Tokio 的高性能异步运行时
- **连接池**: SQLite 连接池优化数据库访问
- **内存安全**: Rust 的所有权系统确保内存安全
- **零成本抽象**: Rust 的零成本抽象提供高性能

## 🔧 开发指南

### 代码规范
- 使用 `snake_case` 命名规范
- 遵循 Rust 官方编码规范
- 使用 `clippy` 和 `rustfmt` 确保代码质量

### 错误处理
- 统一的错误类型定义
- 完整的错误转换和响应映射
- 详细的错误信息和状态码

### 数据库设计
- 使用 `snake_case` 字段名
- 外键约束和级联删除
- 索引优化查询性能

## 📖 完整文档

项目包含详细的文档，涵盖架构、优化、部署等多个方面。

**文档导航**: 查看 [DOCUMENTATION_INDEX.md](DOCUMENTATION_INDEX.md) 获取完整的文档索引和使用指南。

### 核心文档

- **[ARCHITECTURE_EXECUTIVE_SUMMARY.md](ARCHITECTURE_EXECUTIVE_SUMMARY.md)** - 架构总结与改进计划
- **[ARCHITECTURE_DEEP_ANALYSIS.md](ARCHITECTURE_DEEP_ANALYSIS.md)** - 深度架构分析与最佳实践
- **[QUICK_REFERENCE.md](QUICK_REFERENCE.md)** - API 快速参考与常用命令
- **[IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md)** - 实现指南与设计模式

### 优化报告

- **[OPTIMIZATION_COMPLETED.md](OPTIMIZATION_COMPLETED.md)** - Phase 1 优化（安全 & 权限）
- **[PHASE_2_OPTIMIZATION_COMPLETED.md](PHASE_2_OPTIMIZATION_COMPLETED.md)** - Phase 2 优化（性能）
- **[PHASE_3_OPTIMIZATION_COMPLETED.md](PHASE_3_OPTIMIZATION_COMPLETED.md)** - Phase 3 优化（架构一致性）

### 部署与评估

- **[DOCKER_DEPLOYMENT.md](DOCKER_DEPLOYMENT.md)** - Docker 部署指南
- **[TDD_EVALUATION_REPORT.md](TDD_EVALUATION_REPORT.md)** - 测试驱动开发评估报告

**项目评分**: ⭐ 8.5/10 (生产就绪，持续优化中)

## 🤝 贡献指南

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🆘 支持

如有问题，请：
1. 查看 [Issues](../../issues)
2. 创建新的 Issue 描述问题
3. 联系维护团队

---

**OAuth Service Rust** - 一个现代化、安全、高性能的认证授权中心服务。