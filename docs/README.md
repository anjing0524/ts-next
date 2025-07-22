# 项目文档中心

> **最后更新**: 2025-07-22

本目录包含 OAuth2.1 认证授权中心项目的完整技术文档。

## 文档导航

- **[文档导航](./guidelines/文档导航.md)** - 完整文档索引
- **[产品需求](./requirements/产品需求文档.md)** - 业务需求和用户故事
- **[系统设计](./design/详细设计文档.md)** - 架构和技术设计
- **[API规范](./guidelines/API设计规范.md)** - 接口设计标准

## 快速开始

### 1. 环境准备
```bash
# 安装依赖
pnpm install

# 数据库初始化
pnpm db:generate  # 生成 Prisma 客户端
pnpm db:push      # 推送数据库架构
pnpm db:seed      # 初始化数据
```

### 2. 启动服务
```bash
# 启动所有服务
pnpm dev

# 或分别启动
pnpm --filter=oauth-service dev  # 认证服务 (3001)
pnpm --filter=admin-portal dev   # 管理后台 (3002)
pnpm --filter=kline-service dev  # 金融数据服务 (3003)
```

### 3. 访问系统
- **管理后台**: http://localhost:3002
- **认证服务**: http://localhost:3001
- **金融数据服务**: http://localhost:3003
- **默认管理员**: admin / admin123

## 核心功能

### OAuth2.1 安全认证
- PKCE 支持
- 自动令牌刷新
- JWT 权限验证
- RBAC 权限模型

### 金融数据可视化
- WebAssembly 高性能渲染
- 实时K线数据处理
- 自定义指标分析

### 运维支持
- 健康检查端点
- Prometheus 监控指标
- 日志审计系统

## 开发指南

### 项目结构
```
├── apps/
│   ├── oauth-service/     # OAuth2.1 认证服务
│   ├── admin-portal/      # 管理后台
│   ├── kline-service/     # 金融数据服务
│   └── pingora-proxy/     # 反向代理
├── packages/              # 共享包
│   ├── ui/               # UI组件
│   ├── lib/              # 工具库
│   ├── database/         # 数据库模块
│   └── cache/            # 缓存模块
└── docs/                 # 项目文档
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

### WebAssembly 编译
```bash
cd apps/kline-service/wasm-cal
./build.sh  # 编译 WASM 模块
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

### 生产部署
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
   ```bash
   pnpm build
   pnpm start
   ```

## 技术栈
| 类别       | 技术                     |
|------------|--------------------------|
| 前端       | Next.js 15, React 19     |
| UI框架     | shadcn/ui, TailwindCSS 4 |
| 后端       | Node.js, Prisma ORM      |
| 数据库     | SQLite (开发), PostgreSQL|
| 安全认证   | OAuth2.1, JWT            |
| 高性能计算 | Rust, WebAssembly        |
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
