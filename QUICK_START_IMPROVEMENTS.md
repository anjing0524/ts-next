# 快速启动指南：架构改进执行

**文档**: 查看 `ARCHITECTURE_IMPROVEMENT_PLAN.md` 获得完整计划
**时间**: 4 周，10 个 Agent 并行执行
**目标**: 5.5/10 → 9.0/10

---

## 🚀 立即开始（Phase 1 - 第 1 周）

### 第 1 步：Cookie Domain 修复（必须）

这是最紧急的修复，修复生产环境的脆弱点。

**命令**:
```bash
cd /Users/liushuo/code/ts-next-template

# 使用 feature-dev 自动执行代码改动和提交
/feature-dev "Phase 1.1: Cookie Domain 显式配置"
```

**手工检查清单**:
- [ ] `oauth.rs` 添加了 COOKIE_DOMAIN 环境变量读取
- [ ] `.env` 文件有 `COOKIE_DOMAIN=.localhost`
- [ ] `docker-compose.yml` 环境变量配置正确
- [ ] 代码编译通过
- [ ] 登录测试通过，Cookie 有 Domain 属性

---

### 第 2 步：Pingora 日志配置

**命令**:
```bash
/feature-dev "Phase 1.2: Pingora 请求日志中间件"
```

**检查清单**:
- [ ] Pingora 启动时显示日志配置已加载
- [ ] 访问 `/api/v2/health` 时看到日志输出
- [ ] 日志包含 method、uri、status_code、duration_ms

---

### 第 3 步：Admin Portal 前端清理

**命令**:
```bash
/feature-dev "Phase 1.3: 移除 Admin Portal 凭证验证"
```

**检查清单**:
- [ ] `username-password-form.tsx` 中没有凭证强度验证
- [ ] 应用编译成功
- [ ] 登录表单仍然有 HTML required 属性
- [ ] 验证错误完全来自后端

---

## 📅 第 2-4 周 - 自动化执行

一旦 Phase 1 完成，后续的改进可以分配给不同的 Agent 并行执行。

### 设置并行执行

创建文件 `scripts/phase-executor.sh`:

```bash
#!/bin/bash

# Phase 2: Pingora 增强
agent_1_task="Phase 2.1: Pingora 中间件增强" &
agent_2_task="Phase 2.2: 恢复 Admin Portal HTTP 代理层" &

wait $agent_1_task $agent_2_task

# Phase 3: OAuth Service UI
agent_3_task="Phase 3.1: OAuth Service 登录 UI"
agent_4_task="Phase 3.2: OAuth Service 同意 UI"

/feature-dev "$agent_3_task" &
/feature-dev "$agent_4_task" &

wait

# Phase 4: 清理和验证
/feature-dev "Phase 4.1: 删除 Admin Portal 认证 UI"
/feature-dev "Phase 4.2: 修复 Pingora 路由规则"
/ralph-wiggum:ralph-loop "Phase 4.3: 端到端测试验证"
```

### 运行并行执行

```bash
chmod +x scripts/phase-executor.sh
./scripts/phase-executor.sh
```

---

## 🎯 验证每个阶段

### Phase 1 完成标准（3-4 小时）

```bash
# 1. 确保编译通过
cd apps/oauth-service-rust && cargo build --release

# 2. 启动服务
docker-compose up

# 3. 测试登录流程
curl -v http://localhost:6188/api/v2/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123","redirect":""}'

# 4. 检查 Cookie
# 应该看到: Set-Cookie: session_token=xxx; Domain=.localhost; ...
```

### Phase 2 完成标准（5-6 小时）

```bash
# 1. 访问 http://localhost:6188/api/v2/users
# 2. 应该被代理到 OAuth Service
# 3. 检查 Pingora 日志输出
# 4. 应该看到请求记录
```

### Phase 3 完成标准（4-5 小时）

```bash
# 1. 访问 http://localhost:6188/login
# 2. 应该看到 OAuth Service 提供的登录表单
# 3. 完整的登录流程应该工作
```

### Phase 4 完成标准（4-5 小时）

```bash
# 1. Admin Portal 不再有 /login 和 /oauth/consent
# 2. 完整的端到端测试通过
# 3. 架构评分达到 9.0/10
```

---

## 📊 进度追踪

创建文件 `PROGRESS.md` 来追踪进度：

```markdown
# 架构改进进度

## Phase 1: 基础修复 (Week 1)
- [x] Task 1.1: Cookie Domain 配置 (2025-11-29)
- [x] Task 1.2: Pingora 日志 (2025-11-29)
- [x] Task 1.3: 前端清理 (2025-11-29)
- Status: ✅ 完成

## Phase 2: Pingora 增强 (Week 2)
- [ ] Task 2.1: 中间件增强
- [ ] Task 2.2: 代理层恢复
- Status: 🔄 执行中

## Phase 3: OAuth UI (Week 3)
- [ ] Task 3.1: 登录 UI
- [ ] Task 3.2: 同意 UI
- Status: ⏳ 待执行

## Phase 4: 清理验证 (Week 4)
- [ ] Task 4.1: 删除认证 UI
- [ ] Task 4.2: 路由规则
- [ ] Task 4.3: 端到端测试
- Status: ⏳ 待执行

## 总体进度
- 当前评分: 5.5/10
- 目标评分: 9.0/10
- 完成度: 25% (Phase 1/4)
```

---

## 🔗 相关文档

| 文档 | 用途 |
|------|------|
| `ARCHITECTURE_IMPROVEMENT_PLAN.md` | 完整的 4 周计划，包含所有代码改动 |
| `02-CRITICAL_ARCHITECTURE_FLAWS_2025-11-28.md` | 问题分析（为什么需要这些改进） |
| `02-IMMEDIATE_ACTION_REQUIRED.md` | Cookie Domain 详细说明 |
| `PROGRESS.md` | 进度追踪（自己创建） |

---

## 💡 关键点理解

### 为什么要做这 4 个 Phase？

```
Phase 1: 修复立即的风险（Cookie domain）
  ↓ 让系统更稳定

Phase 2: 增强基础设施（日志、中间件、代理）
  ↓ 为下一步做准备

Phase 3: 符合 OAuth 标准（UI 迁移）
  ↓ Admin Portal 完全清晰的角色

Phase 4: 验证和清理
  ↓ 架构设计完整
```

### Admin Portal 的最终角色

```
现在（有问题）:
  ├─ OAuth 客户端
  ├─ UI 层
  └─ 验证逻辑 ❌

改进后（清晰）:
  ├─ OAuth 客户端 ✅
  └─ UI 层（管理界面、仪表板等） ✅
```

### 为什么要恢复代理层？

```
删除代理层的问题:
  ❌ 无法添加请求/响应处理
  ❌ 无法添加缓存
  ❌ 无法添加限流
  ❌ 无法添加日志

正确实现代理层的好处:
  ✅ 能做到上面的所有事
  ✅ 完整缓冲，不产生流式响应
  ✅ Pingora 作为真正的网关
```

---

## 🎓 学习资源

如果不熟悉某些概念：

- **HTTP 代理**: 查看 `ARCHITECTURE_IMPROVEMENT_PLAN.md` Task 2.2
- **Cookie Domain**: 查看 `02-IMMEDIATE_ACTION_REQUIRED.md`
- **OAuth 标准**: 查看 `02-CRITICAL_ARCHITECTURE_FLAWS_2025-11-28.md` 第 2 章
- **Pingora 配置**: 查看 `ARCHITECTURE_IMPROVEMENT_PLAN.md` Task 2.1

---

## ⚠️ 风险和缓解

| 风险 | 缓解措施 |
|------|---------|
| 代码改动失败 | 每个 Phase 有验收标准，不符合就回滚 |
| 服务中断 | 逐 Phase 部署，有测试覆盖 |
| Cookie 不兼容 | 在所有浏览器中测试 |

---

**预计总时间**: 25-30 小时（分 4 周）
**建议开始时间**: 明天 (2025-11-29)
**下一个 Milestone**: Phase 1 完成（周三）

👉 **现在就开始**: `/feature-dev "Phase 1.1: Cookie Domain 显式配置"`

