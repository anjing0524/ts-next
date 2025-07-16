# 技术栈版本对照表

**文档版本**: v1.2.0
**创建日期**: 2025-01-28
**最后更新**: 2025-07-08
**维护团队**: 技术团队
**状态**: 正式版

## 版本对照表

### 前端框架
| 技术栈 | 统一版本 | 项目配置位置 | 说明 |
|---|---|---|---|
| Next.js | `^15.3.2` | `package.json`, `apps/*/package.json` | 核心前端框架 |
| React | `^19.1.0` | `apps/*/package.json` | UI库 |
| React DOM | `^19.1.0` | `apps/*/package.json` | DOM渲染 |

### 开发语言
| 技术栈 | 统一版本 | 项目配置位置 | 说明 |
|---|---|---|---|
| TypeScript | `^5.8.2` | `package.json`, `apps/*/tsconfig.json` | 开发语言 |
| Node.js | `20.x` | `.node-version` | 运行环境 |

### 测试框架
| 技术栈 | 统一版本 | 项目配置位置 | 说明 |
|---|---|---|---|
| Jest | `^30.0.0` | `package.json`, `packages/jest-config` | 单元/集成测试 |
| Playwright | `^1.53.1` | `package.json`, `playwright.config.ts` | E2E测试框架 |
| Testing Library | `^16.3.0` | `apps/admin-portal/package.json` | 组件测试 |

### 样式与UI
| 技术栈 | 统一版本 | 项目配置位置 | 说明 |
|---|---|---|---|
| TailwindCSS | `^4.1.5` | `apps/*/tailwind.config.ts` | CSS框架 |
| Lucide React | `^0.513.0` | `apps/admin-portal/package.json` | 图标库 |
| TanStack Table | `^8.14.7` | `apps/admin-portal/package.json` | 表格组件 |

### 数据库与ORM
| 技术栈 | 统一版本 | 项目配置位置 | 说明 |
|---|---|---|---|
| Prisma | `^6.10.1` | `packages/database/package.json` | ORM |
| SQLite | - | `packages/database/prisma/schema.prisma` | 开发数据库 |
| MySQL | - | `packages/database/prisma/schema.prisma` | 生产数据库 |

### 构建与包管理
| 技术栈 | 统一版本 | 项目配置位置 | 说明 |
|---|---|---|---|
| Turborepo | `^2.5.4` | `turbo.json` | Monorepo管理 |
| PNPM | `10.6.2` | `package.json` (`packageManager`) | 包管理器 |
| ESLint | `^9.21.0` | `packages/eslint-config` | 代码检查 |
| Prettier | `^3.5.3` | `packages/prettier-config` | 代码格式化 |

### 认证与安全
| 技术栈 | 统一版本 | 项目配置位置 | 说明 |
|---|---|---|---|
| Jose | `^6.0.11` | `apps/oauth-service/package.json` | JWT处理 (签名、验证) |
| Bcrypt | `^6.0.0` | `apps/oauth-service/package.json` | 密码哈希 |
| Zod | `^3.24.2` | `apps/oauth-service/package.json` | 数据验证 |

### 日志与监控
| 技术栈 | 统一版本 | 项目配置位置 | 说明 |
|---|---|---|---|
| Winston | `^3.17.0` | `apps/oauth-service/package.json` | 日志框架 |
| Winston Daily Rotate | `^5.0.0` | `apps/oauth-service/package.json` | 日志轮换 |

### 工具库
| 技术栈 | 统一版本 | 项目配置位置 | 说明 |
|---|---|---|---|
| date-fns | `^4.1.0` | `apps/oauth-service/package.json` | 日期处理 |
| UUID | `^11.1.0` | `apps/oauth-service/package.json` | UUID生成 |
| Nanoid | `^5.0.4` | `packages/lib/package.json` | ID生成 |

## 标准化与统一建议

- **版本统一**: 项目中各依赖版本已基本统一。建议在后续开发中，通过 `pnpm up -L` 命令来升级依赖，以保持一致性。
- **配置集中化**:
  - **ESLint**: 规则已集中在 `@repo/eslint-config`。
  - **Prettier**: 配置已集中在 `@repo/prettier-config`。
  - **TypeScript**: 基础配置已集中在 `@repo/typescript-config`。
  - **Jest**: 基础配置已集中在 `@repo/jest-config`。
- **安全库**: 核心安全库（`jose`, `bcrypt`, `zod`）已统一在 `@repo/lib` 中管理和导出，各应用应通过 `@repo/lib` 消费，避免直接依赖。

---

**注意**: 此版本对照表基于 **2025-07-08** 的代码分析结果。建议在每次依赖更新后同步修改此文档。
