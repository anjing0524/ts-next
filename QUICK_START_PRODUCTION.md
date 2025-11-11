# 🚀 Admin Portal 生产启动 - 快速指南

## 📋 前置条件检查

确保你有以下 3 个终端窗口开启：

- **终端 1**: OAuth Service (Rust) - `cargo run`
- **终端 2**: Admin Portal (Next.js) - 当前运行 `pnpm dev`（待替换为 `pnpm start`）
- **终端 3**: Pingora Proxy (Rust) - `cargo run`

---

## ✅ 简单 3 步启动生产版本

### 第 1 步：停止 Dev 服务器（在终端 2 中）

```bash
# 在运行 pnpm dev 的终端中
# 按 Ctrl+C 停止
```

**预期**:
```
> Ctrl+C
```

---

### 第 2 步：启动生产服务器（在终端 2 中）

```bash
cd /Users/liushuo/code/ts-next-template/apps/admin-portal
pnpm start
```

**预期输出**（等待 30-60 秒）：
```
▲ Next.js 16.0.0

> next start -p 3002

▲ Ready on http://localhost:3002
```

---

### 第 3 步：验证生产启动成功（在新终端 4 中）

```bash
# 快速验证脚本
cd /Users/liushuo/code/ts-next-template
./verify-production.sh
```

**预期输出**：
```
======================================
Production Setup Verification
======================================

检查 Admin Portal (3002)... ✅ 运行中
检查 OAuth Service (3001)... ✅ 运行中
检查 Pingora Proxy (6188)... ✅ 运行中

======================================
✅ 所有服务已启动！
======================================
```

---

## 🧪 运行完整测试（自动化）

完成上面 3 步后，在新终端运行自动化测试脚本：

```bash
cd /Users/liushuo/code/ts-next-template
./start-production-and-test.sh
```

这个脚本会自动：
1. ✅ 验证所有服务正在运行
2. ✅ 检查数据库初始化状态
3. ✅ 运行集成检查
4. ✅ 运行 OAuth 流程测试
5. ✅ 运行 E2E 测试套件
6. ✅ 生成最终报告

---

## 🔧 手动测试步骤（如果你想逐步验证）

### 步骤 1: 检查服务健康

```bash
# 在新终端运行
curl http://localhost:3001/health       # OAuth Service
curl http://localhost:3002/health       # Admin Portal (prod)
curl -I http://localhost:6188/health    # Pingora
```

**预期**: 所有返回 200 或 2xx/3xx 状态码

---

### 步骤 2: 运行 OAuth 流程测试

```bash
cd /Users/liushuo/code/ts-next-template
./test-oauth-flow.sh
```

**预期**: 大部分测试通过 (✅)，可能有个别警告

---

### 步骤 3: 运行 E2E 测试

```bash
cd /Users/liushuo/code/ts-next-template/apps/admin-portal

# 选项 A: 标准运行（推荐）
pnpm test:e2e

# 选项 B: 交互式 UI（最好看）
pnpm test:e2e:ui

# 选项 C: 调试模式
pnpm test:e2e:debug
```

**预期**: 所有测试通过

---

## 🌐 手动浏览器测试（可选）

完成上面的自动化测试后，你也可以手动验证：

1. **打开浏览器**: http://localhost:6188/admin
2. **应该看到**: 登录页面或被重定向到登录
3. **输入凭证**:
   - 用户名: `admin`
   - 密码: `adminpassword`
4. **应该看到**: 管理后台仪表盘
5. **检查浏览器 DevTools** (F12):
   - Network 标签: 所有请求都来自 `localhost:6188`
   - Cookies: 有 `access_token` 和 `refresh_token`

---

## 📊 预期结果汇总

| 检查项 | 预期结果 |
|--------|---------|
| 服务启动 | ✅ 都在 Running 状态 |
| 数据库 | ✅ 600K+ 大小，已初始化 |
| OAuth 流程测试 | ✅ 95%+ 通过 |
| E2E 测试 | ✅ 100% 通过 |
| 登录功能 | ✅ 使用 admin/adminpassword 成功 |
| 管理后台 | ✅ 页面加载无错误 |

---

## ❌ 如果出现问题

### Admin Portal 启动失败

```bash
# 清除旧进程
lsof -ti:3002 | xargs kill -9

# 或者使用 fuser
fuser -k 3002/tcp

# 重新启动
pnpm start
```

### 502 Bad Gateway

```bash
# 检查 Pingora 是否运行
curl http://localhost:6188

# 如果返回 502，检查：
# 1. Admin Portal 是否在 3002 端口
# 2. OAuth Service 是否在 3001 端口
# 3. Pingora 配置是否正确
```

### E2E 测试失败

```bash
# 查看详细错误
pnpm test:e2e:debug

# 或使用 UI 查看
pnpm test:e2e:ui

# 生成测试报告
pnpm test:e2e:report
```

---

## 📚 更多文档

- `PRODUCTION_BUILD_GUIDE.md` - 详细的生产部署指南
- `NEXT_STEPS.md` - 下一步优化
- `INTEGRATION_START_GUIDE.md` - 完整的启动和验证指南
- `notes.md` - 完整的进度跟踪记录

---

## 🎯 成功标志

一旦完成以上所有步骤：

✅ Admin Portal 在生产模式下运行
✅ 所有三个服务都在响应
✅ OAuth 流程测试全部通过
✅ E2E 测试全部通过
✅ 可以手动登录和访问管理后台
✅ 数据库已初始化并包含测试数据

**恭喜！集成已完成。** 🎉

---

## 📞 支持

如果遇到任何问题，请查看：
1. 相关错误的 **❌ 如果出现问题** 部分
2. `INTEGRATION_START_GUIDE.md` 的故障排除部分
3. 查看 `notes.md` 中的常见问题

