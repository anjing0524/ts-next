# 下一步: 生产构建 + E2E 测试

**当前状态**: ✅ Admin Portal 已构建生产版本，所有服务正在运行

## 🔄 立即行动清单

### Step 1: 停止 Dev 服务器并启动生产版本

**当前**:
- ❌ 终端 2 运行 `pnpm dev` (开发模式)

**改为**:
- ✅ 终端 2 运行 `pnpm start` (生产模式)

### Step 2: 切换 Admin Portal 到生产模式

在 **终端 2** 中:

```bash
# 第一步：停止 dev 服务器
# 在运行 pnpm dev 的终端中按 Ctrl+C

# 第二步：启动生产服务器
cd /Users/liushuo/code/ts-next-template/apps/admin-portal

# 这将启动经过优化的生产版本
pnpm start

# 预期日志:
# ▲ Next.js 16.0.0
# > next start -p 3002
# ▲ Ready on http://localhost:3002
```

## ✅ 验证三个服务都在运行

```bash
# 在新终端运行以下检查
curl http://localhost:3001/health       # OAuth Service
curl http://localhost:3002/health       # Admin Portal (生产)
curl -I http://localhost:6188/health    # Pingora

# 所有都应该返回 200 OK 或类似成功响应
```

## 🧪 运行 OAuth 流程测试

```bash
# 制作脚本可执行
chmod +x /Users/liushuo/code/ts-next-template/test-oauth-flow.sh

# 运行流程测试
cd /Users/liushuo/code/ts-next-template
./test-oauth-flow.sh

# 预期: 大部分测试通过 ✅
```

## 🧪 手动验证（浏览器）

1. **打开浏览器**: http://localhost:6188/admin
2. **预期行为**:
   - ✅ 被重定向到登录页面 (http://localhost:6188/login?redirect=...)
   - ✅ 看到登录表单和演示账户提示
3. **输入凭证**:
   - 用户名: `admin`
   - 密码: `adminpassword` ⚠️ (注意不是 admin123)
4. **登录后**:
   - ✅ 看到管理后台仪表盘
   - ✅ URL 为 http://localhost:6188/admin
   - ✅ 用户菜单显示用户信息
5. **检查浏览器开发者工具** (F12):
   - Network 标签: 所有请求都来自 localhost:6188
   - Application/Cookies:
     - ✅ `session_token` (来自 OAuth Service)
     - ✅ `access_token` (来自 Admin Portal)
     - ✅ `refresh_token`

## 🧪 运行 E2E 测试

一旦生产版本启动并验证工作:

```bash
cd /Users/liushuo/code/ts-next-template/apps/admin-portal

# 运行所有 E2E 测试
pnpm test:e2e

# 或者选择测试运行器:
pnpm test:e2e:ui       # 交互式 UI (推荐)
pnpm test:e2e:headed   # 可见浏览器
pnpm test:e2e:debug    # 调试模式

# 查看测试报告
pnpm test:e2e:report
```

## 📊 预期测试结果

E2E 测试应该验证:

1. ✅ **登录流程**: 访问受保护页面 → 重定向到登录 → 输入凭证 → 成功认证
2. ✅ **OAuth 完整流程**: authorize → login → callback → token exchange
3. ✅ **权限检查**: 无权限用户被拒绝访问
4. ✅ **CSRF 防护**: 无效的 state 参数被拒绝
5. ✅ **错误处理**: 无效凭证显示错误消息
6. ✅ **会话管理**: Token 过期后需要重新登录
7. ✅ **用户信息**: 登录后显示正确的用户信息

## 🚨 常见问题排查

### ❌ Admin Portal 3002 端口已占用

```bash
# 查找并杀死占用进程
lsof -ti:3002 | xargs kill -9

# 重新启动
pnpm start
```

### ❌ 登录失败 "Invalid credentials"

```bash
# 确认使用正确的凭证:
# 用户名: admin
# 密码: adminpassword (不是 admin123)

# 检查数据库是否正确初始化
ls -lh packages/database/prisma/dev.db
# 应该 > 0 字节（不是空文件）
```

### ❌ "Redirect URL validation failed"

```bash
# 这意味着 redirect 参数格式不正确
# 这通常由 proxy.ts 的 validateRedirectUrl() 函数检查

# 清除 cookies 并重新开始
document.cookie.split(";").forEach(c => {
  const name = c.split("=")[0].trim();
  document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
});
```

### ❌ 所有请求都失败 (502/503)

```bash
# 检查 OAuth Service 是否运行
curl http://localhost:3001/health

# 如果返回 Connection refused，则 OAuth Service 未启动
# 在终端 1 中重启它
cd apps/oauth-service-rust && cargo run
```

## 📈 下一步优化

测试成功通过后:

1. **性能优化**:
   - 检查 Lighthouse 分数
   - 优化关键路径
   - 配置 CDN 缓存

2. **安全加强**:
   - 配置 HTTPS (生产环境必需)
   - 设置安全头部
   - 配置 CSP (Content Security Policy)

3. **生产部署**:
   - 配置域名 SSL/TLS
   - 设置正确的 OAuth 回调 URL
   - 配置监控和日志
   - 设置备份和灾难恢复

4. **文档更新**:
   - 更新部署文档
   - 编写故障排除指南
   - 记录架构决策

## 📚 相关文档

- `PRODUCTION_BUILD_GUIDE.md` - 详细的生产构建指南
- `INTEGRATION_START_GUIDE.md` - 基础启动指南
- `INTEGRATION_COMPLETION_SESSION_9.md` - 技术实现细节
- `E2E_TESTING_GUIDE.md` - 完整的测试指南

---

## 🎯 目标

```
当前: Admin Portal dev 模式 + 服务运行
   ↓
Step 1: 切换到 Admin Portal 生产模式
   ↓
Step 2: 验证所有服务正常
   ↓
Step 3: 手动测试 OAuth 流程
   ↓
Step 4: 运行 E2E 测试套件
   ↓
目标: ✅ 所有测试通过，生产就绪
```

---

**预计完成时间**: 10-15 分钟

**关键点**: 确保使用 `pnpm start` (生产) 而不是 `pnpm dev` (开发)
