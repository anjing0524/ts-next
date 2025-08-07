# 项目技术指南

## 架构服务

| 服务          | 功能                   | 端口 |
| ------------- | ---------------------- | ---- |
| oauth-service | OAuth 2.1服务          | 3001 |
| admin-portal  | 管理后台+认证UI        | 3002 |
| kline-service | 金融图表服务(WASM计算) | 3003 |
| pingora-proxy | 反向代理               | 6188 |

## 共享包

- `@repo/ui`: UI组件库
- `@repo/lib`: 工具函数
- `@repo/database`: 数据库ORM
- `@repo/cache`: 缓存层

## 关键命令

```bash
# 开发
pnpm install           # 安装依赖
pnpm dev               # 启动所有服务
pnpm --filter=oauth-service dev  # 启动指定服务

# 数据库
pnpm db:generate && pnpm db:push && pnpm db:seed  # 初始化数据库
pnpm db:studio         # 打开数据库管理

# 测试
pnpm test              # 单元测试
pnpm e2e               # 端到端测试

# 构建与质量
pnpm build             # 构建项目
pnpm lint              # 代码检查
pnpm format            # 代码格式化
```

## 环境变量

```bash
DATABASE_URL="file:./dev.db"
JWT_PRIVATE_KEY_PATH="./test-private.pem"
REDIS_URL="redis://localhost:6379"
```

## 技术栈

- 前端: Next.js, React, TypeScript, TailwindCSS
- 后端: Node.js, Prisma, JWT
- 性能: Rust/WASM, Pingora代理
- 测试: Jest, Playwright
- 工程: TurboRepo, pnpm

## 开发流程

1. 安装依赖
2. 初始化数据库
3. 启动开发服务
4. 运行测试

## WASM构建

```bash
cd apps/kline-service/wasm-cal && ./build.sh
```

### TDD（测试驱动开发）

1. 编写测试，根据输入/输出对•使用 TDD，它将避免生成模拟实现（mock）
2. 运行测试并确认失败• 显式要求“此阶段不要写实现代码”
3. 满意后提交测试用例
4. 编写通过测试的实现代码• 不要改动测试代码• 自动多轮执行“写代码 → 跑测试 → 修复代码 → 再跑测试”
5. 必要时调用 Subagent 验证实现是否过拟合测试用例
6. 测试全部通过后再提交最终实现

## 开发注意事项

- 更新代码的时候记得实时更新Claude.md
- 保持中文对话