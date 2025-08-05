# ts-next-template-monorepo

这是一个基于 Next.js 15 和 TypeScript 的全栈 Monorepo 项目，实现了完整的 OAuth 2.1 认证授权中心与微服务架构。

## 🏗️ 项目架构

本项目采用 Monorepo 架构，使用 Turborepo 进行高效管理，包含 OAuth 2.1 认证服务和金融数据服务等核心组件。

### 📱 应用服务 (apps/)

| 服务 | 端口 | 功能描述 | 技术栈 |
|------|------|----------|--------|
| **oauth-service** | 3001 | OAuth 2.1 认证授权服务，提供完整的授权码流程 + PKCE 支持 | Next.js 15 + Jose + Prisma |
| **admin-portal** | 3002 | 管理后台 + 认证中心 UI，处理所有用户交互页面 | Next.js 15 + shadcn/ui + React Query |
| **kline-service** | 3003 | 金融数据可视化服务，WebAssembly 高性能图表渲染 | Next.js 15 + Rust/WASM |
| **pingora-proxy** | 6188 | 基于 Rust 的高性能反向代理和负载均衡 | Rust + Pingora |
| **test-service** | 动态 | 测试服务，用于集成测试和演示 | Next.js 15 |

### 📦 共享包 (packages/)

| 包名 | 功能描述 |
|------|----------|
| **@repo/ui** | 基于 shadcn/ui 的共享 UI 组件库 |
| **@repo/lib** | 认证工具、JWT 处理、权限管理等核心功能库 |
| **@repo/database** | Prisma ORM 数据库模型和客户端 |
| **@repo/cache** | Redis 和内存缓存抽象层 |
| **@repo/eslint-config** | 共享 ESLint 配置 |
| **@repo/jest-config** | 共享 Jest 测试配置 |
| **@repo/typescript-config** | 共享 TypeScript 配置 |
| **@repo/tailwind-config** | 共享 Tailwind CSS 配置 |
| **@repo/next-config** | 共享 Next.js 配置 |
| **@repo/prettier-config** | 共享 Prettier 配置 |

## 🚀 技术栈

- **前端框架**: Next.js 15.3.2 + React 19
- **认证授权**: OAuth 2.1 + PKCE + JWT (Jose库)
- **数据库**: Prisma ORM + SQLite (开发) / PostgreSQL (生产)
- **样式**: Tailwind CSS 4 + shadcn/ui
- **性能**: Rust/WASM (kline-service) + Pingora代理
- **测试**: Jest + Playwright (E2E)
- **构建**: Turborepo + pnpm workspaces

## 🛠️ 环境准备

### 必需软件

- [Node.js](https://nodejs.org/) (v20.x 或更高版本)
- [pnpm](https://pnpm.io/) (v10.x 或更高版本)
- [Rust](https://www.rust-lang.org/) (最新稳定版) - 用于 pingora-proxy 和 WASM 构建
- [Docker](https://www.docker.com/) (最新稳定版)

### 可选软件

- [kubectl](https://kubernetes.io/docs/tasks/tools/install-kubectl/) - 用于 Kubernetes 部署
- [Redis](https://redis.io/) - 用于缓存服务 (开发环境可选)

## 🚀 快速开始

### 1. 安装依赖

```bash
# 克隆项目
git clone <repository-url>
cd ts-next-template

# 安装所有依赖
pnpm install
```

### 2. 环境配置

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑 .env 文件，配置以下关键变量:
# DATABASE_URL="file:./dev.db"
# JWT_PRIVATE_KEY_PATH="./keys/private.pem"
# JWT_PUBLIC_KEY_PATH="./keys/public.pem"
# REDIS_URL="redis://localhost:6379"
```

### 3. 初始化数据库

```bash
# 生成 Prisma 客户端
pnpm db:generate

# 创建数据库表结构
pnpm db:push

# 初始化测试数据
pnpm db:seed
```

### 4. 构建 WASM 模块 (kline-service)

```bash
# 构建金融图表 WASM 模块
cd apps/kline-service/wasm-cal
./build.sh
```

### 5. 启动开发环境

```bash
# 启动所有服务
pnpm dev

# 或者分别启动特定服务
pnpm --filter=oauth-service dev      # 认证服务 (3001)
pnpm --filter=admin-portal dev       # 管理后台 (3002)
pnpm --filter=kline-service dev      # 金融数据服务 (3003)
pnpm --filter=pingora-proxy dev      # 反向代理 (6188)

# 仅启动认证相关服务 (推荐)
pnpm start:e2e  # 并行启动 admin-portal 与 oauth-service
```

### 6. 访问系统

- **管理后台**: http://localhost:3002
- **认证服务**: http://localhost:3001
- **金融数据服务**: http://localhost:3003
- **默认管理员**: admin@example.com / admin123

## 本地开发

1.  **安装依赖**:

    ```bash
    pnpm install
    ```

2.  **启动开发环境**:

    ```bash
    pnpm dev
    ```

    此命令将启动所有应用。您也可以在特定应用的目录中运行 `pnpm dev` 来单独启动该应用。

    > 若仅需调试 **admin-portal** 与 **oauth-service** 的 OAuth 集成，可执行：
    >
    > ```bash
    > pnpm start:e2e # 并行启动 admin-portal 与 oauth-service，开启 watch 热重载
    > ```

3.  **环境变量**:

    项目根目录下的 `.env` 文件用于配置全局环境变量。各个应用也可以有自己的 `.env` 文件。

## 数据库

本项目使用 Prisma 作为 ORM。

- **生成 Prisma Client**:

  ```bash
  pnpm db:generate
  ```

- **同步数据库结构**:

  ```bash
  pnpm db:push
  ```

- **数据填充**:

  ```bash
  pnpm db:seed
  ```

- **启动 Prisma Studio**:

  ```bash
  pnpm db:studio
  ```

## 测试

- **运行单元测试**:

  ```bash
  pnpm test
  ```

- **运行端到端测试**:

  ```bash
  pnpm e2e
  ```

## 代码规范

- **代码格式化**:

  ```bash
  pnpm format
  ```

- **代码检查**:

  ```bash
  pnpm lint
  ```

## 提交代码

本项目使用 Commitizen 来规范提交信息。

```bash
pnpm commit
```

## 部署

本项目支持使用 Docker 和 Kubernetes 进行部署。

- **构建 Docker 镜像**:

  ```bash
  docker build -t ts-next-template .
  ```

- **使用 Kubernetes 部署**:

  k8s 目录中包含了部署所需的 YAML 文件。

  ```bash
  kubectl apply -f k8s/
  ```

## 贡献

欢迎任何形式的贡献！如果您有任何问题或建议，请随时提 issue 或 pull request。

## 更新API说明

- 会话注销统一调用 `/api/v2/oauth/revoke`
- 客户端密钥轮换API路径为 `/api/v2/clients/[clientId]/secret`

> 详细的项目技术规范与当前状态请参阅 [docs/项目综合规范与状态报告.md](./docs/项目综合规范与状态报告.md)。
