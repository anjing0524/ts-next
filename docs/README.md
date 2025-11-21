# OAuth 2.1 认证授权系统 - 生产文档中心

> **这是项目的主文档目录。请始终从 [INDEX.md](./INDEX.md) 开始。**

**最后更新**: 2025-11-20
**文档状态**: ✅ 生产就绪
**覆盖范围**: 需求、设计、API、部署、运维、测试

## 📚 9大核心文档

| # | 文档 | 用途 | 受众 |
|----|------|------|------|
| 1️⃣ | [1-REQUIREMENTS.md](./1-REQUIREMENTS.md) | 完整的需求规范 | 产品、架构师 |
| 2️⃣ | [2-SYSTEM_DESIGN.md](./2-SYSTEM_DESIGN.md) | 系统设计和架构 | 架构师、开发 |
| 3️⃣ | [3-DATABASE_DESIGN.md](./3-DATABASE_DESIGN.md) | 数据库设计 | DBA、开发 |
| 4️⃣ | [4-API_REFERENCE.md](./4-API_REFERENCE.md) | API 完整参考 | 前后端开发 |
| 5️⃣ | [5-DEPLOYMENT.md](./5-DEPLOYMENT.md) | 部署指南 | DevOps |
| 6️⃣ | [6-OPERATIONS.md](./6-OPERATIONS.md) | 运维指南 | SRE、运维 |
| 7️⃣ | [7-TESTING.md](./7-TESTING.md) | 测试策略 | QA、开发 |
| 8️⃣ | [8-OAUTH_FLOWS.md](./8-OAUTH_FLOWS.md) | OAuth 2.1 流程详解 | 所有人 |
| 📖 | **[INDEX.md](./INDEX.md)** | **完整导航和速查** | **所有人** |

## 快速开始

### 1. 环境准备
```bash
# 安装依赖
pnpm install

# 数据库初始化 (SQLite)
pnpm db:generate  # 生成 Prisma 客户端
pnpm db:push      # 推送数据库架构
pnpm db:seed      # 初始化数据
```

### 2. 启动服务
```bash
# 启动所有服务
pnpm dev

# 或分别启动
pnpm --filter=oauth-service-rust dev  # 认证服务 (3001)
pnpm --filter=admin-portal dev   # 管理后台 (3002)
pnpm --filter=pingora-proxy dev  # 反向代理 (6188)
```

### 3. 访问系统

**通过 Pingora 代理访问（推荐）**:
- **应用入口**: http://localhost:6188
  - 管理后台、OAuth Service API、所有应用都通过此地址访问
  - 默认管理员: admin / admin123

**直接访问服务（调试用）**:
- **Admin Portal**: http://localhost:3002
- **OAuth Service**: http://localhost:3001
- **说明**: 这些地址仅用于开发环境本机调试，生产环境应使用 Pingora 代理

## 核心功能

### OAuth2.1 安全认证
- PKCE 支持
- 自动令牌刷新
- JWT 权限验证
- RBAC 权限模型

### 运维支持
- 健康检查端点
- Prometheus 监控指标
- 日志审计系统

## 开发指南

### 项目结构
```
├── apps/
│   ├── oauth-service-rust/     # OAuth2.1 认证服务
│   ├── admin-portal/      # 管理后台
│   └── pingora-proxy/     # 反向代理
├── packages/              # 共享包
│   ├── ui/               # UI组件
│   ├── lib/              # 工具库
│   ├── database/         # 数据库模块
│   └── cache/            # 缓存模块
└── docs/                 # 项目文档中心
    ├── architecture/     # 架构设计
    ├── api/             # API 文档
    ├── deployment/      # 部署运维
    ├── development/     # 开发指南
    ├── reports/         # 交付报告
    └── components/      # 组件文档
```

### 常用命令
```bash
# 测试
pnpm test              # 单元测试
pnpm test:e2e          # 端到端测试

# 代码质量
pnpm lint              # 代码检查
pnpm format            # 代码格式化
pnpm type-check        # 类型检查

# 数据库管理
pnpm db:studio         # 打开数据库管理界面
```

## 部署说明

### 环境变量
```env
# 数据库配置
DATABASE_URL="file:./dev.db"

# JWT 配置
JWT_PRIVATE_KEY_PATH="./private.pem"
JWT_PUBLIC_KEY_PATH="./public.pem"

# 服务端点
AUTH_CENTER_URL="http://localhost:3001"
REDIS_URL="redis://localhost:6379"
```

### 生产部署 (Kubernetes)
1. **配置更新**:
   - 修改默认管理员密码
   - 更新JWT密钥
   - 配置HTTPS证书

2. **数据库迁移**:
   ```bash
   pnpm db:generate
   pnpm db:push
   pnpm db:seed
   ```

3. **构建启动**:
   参考 [5-DEPLOYMENT.md](./5-DEPLOYMENT.md) 进行 Kubernetes 部署。

## 技术栈
| 类别       | 技术                     |
|------------|--------------------------|
| 前端       | Next.js 15, React 19     |
| UI框架     | shadcn/ui, TailwindCSS 4 |
| 后端       | Rust, Actix-web, SQLx    |
| 数据库     | SQLite (开发) / PostgreSQL/Supabase (生产) |
| 安全认证   | OAuth2.1, JWT            |
| 代理       | Pingora                  |
| 测试       | Jest 30, Playwright      |
| 部署       | Docker, Kubernetes       |

## 贡献指南
1. Fork 项目仓库
2. 创建功能分支 (`feat/xxx`)
3. 提交代码变更
4. 创建 Pull Request
5. 通过CI测试后合并

## 许可证
MIT License
