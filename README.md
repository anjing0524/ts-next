# ts-next-template-monorepo

这是一个基于 Next.js 和 TypeScript 的全栈 Monorepo 项目模板，集成了完整的开发、测试、部署和运维工具链。

## 项目架构

本项目采用 Monorepo 架构，代码库中包含多个相互独立又可共享代码的应用（apps）和包（packages）。

- **`apps/`**: 存放各个独立的应用服务。
  - **`admin-portal`**: 管理后台前端，基于 Next.js 和 shadcn/ui，提供系统管理、用户管理、权限控制等功能。
  - **`flow-service`**: 可视化流程编排服务，基于 Next.js 和 shadcn/ui，提供流程设计、执行、监控等功能。
  - **`kline-service`**: K线图服务，基于 Next.js 和 WebAssembly，提供高性能的 K 线图展示和数据分析功能。
  - **`oauth-service`**: OAuth 2.0 认证服务，基于 Next.js 和 shadcn/ui，提供用户认证、授权、令牌管理等功能。
  - **`pingora-proxy`**: 基于 Pingora 的高性能反向代理服务，负责流量转发、负载均衡、安全防护等。
  - **`test-service`**: 用于测试和演示的服务。
- **`packages/`**: 存放共享的模块和配置。
  - **`cache`**: 缓存模块，提供 Redis 和内存缓存。
  - **`database`**: 数据库模块，使用 Prisma ORM，支持 SQLite。
  - **`eslint-config`**: 共享的 ESLint 配置。
  - **`jest-config`**: 共享的 Jest 配置。
  - **`lib`**: 共享的工具库，包含认证、中间件、服务等。
  - **`next-config`**: 共享的 Next.js 配置。
  - **`prettier-config`**: 共享的 Prettier 配置。
  - **`tailwind-config`**: 共享的 Tailwind CSS 配置。
  - **`typescript-config`**: 共享的 TypeScript 配置。
  - **`ui`**: 共享的 UI 组件库，基于 shadcn/ui。

## 技术栈

- **前端**: Next.js, React, TypeScript, Tailwind CSS, shadcn/ui
- **后端**: Next.js, Pingora, Rust
- **数据库**: SQLite, Prisma
- **测试**: Jest, Playwright
- **工具**: pnpm, Turbo, Docker, Kubernetes, ESLint, Prettier, Commitizen, Husky, lint-staged

## 环境准备

在开始之前，请确保您已安装以下软件：

- [Node.js](https://nodejs.org/) (v20.x 或更高版本)
- [pnpm](https://pnpm.io/) (v10.x 或更高版本)
- [Rust](https://www.rust-lang.org/) (最新稳定版)
- [Docker](https://www.docker.com/) (最新稳定版)
- [kubectl](https://kubernetes.io/docs/tasks/tools/install-kubectl/) (最新稳定版)

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
