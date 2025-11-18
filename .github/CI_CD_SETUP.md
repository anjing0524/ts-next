# CI/CD 设置指南

本文档说明如何配置 GitHub Actions CI/CD 流水线，包括 E2E 测试、通知和部署。

## 目录

1. [GitHub Secrets 配置](#github-secrets-配置)
2. [E2E 测试工作流程](#e2e-测试工作流程)
3. [通知配置](#通知配置)
4. [故障排查](#故障排查)

---

## GitHub Secrets 配置

### 必需的 Secrets

在 GitHub 仓库中配置以下 secrets（Settings → Secrets and variables → Actions）：

#### 1. 邮件通知 Secrets（可选）

如果希望测试失败时发送邮件通知：

```
MAIL_SERVER=smtp.gmail.com
MAIL_PORT=587
MAIL_USERNAME=your-email@gmail.com
MAIL_PASSWORD=your-app-password
NOTIFICATION_EMAIL=team@example.com
```

**Gmail 配置示例**:
1. 启用两步验证
2. 生成应用专用密码：https://myaccount.google.com/apppasswords
3. 使用生成的密码作为 `MAIL_PASSWORD`

**其他邮件服务器**:
- **Outlook/Office365**: `smtp.office365.com:587`
- **SendGrid**: `smtp.sendgrid.net:587`
- **AWS SES**: `email-smtp.us-east-1.amazonaws.com:587`

#### 2. Slack 通知 Secrets（可选）

如果希望测试失败时发送 Slack 通知：

```
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

**获取 Slack Webhook URL**:
1. 访问 https://api.slack.com/apps
2. 创建新应用或选择现有应用
3. 启用 "Incoming Webhooks"
4. 添加 Webhook 到指定频道
5. 复制 Webhook URL

#### 3. Sentry 相关 Secrets（可选）

如果使用 Sentry 错误监控：

```
SENTRY_DSN=https://xxxxx@oXXXXXX.ingest.sentry.io/XXXXXXX
SENTRY_AUTH_TOKEN=your-sentry-auth-token
```

**获取 Sentry Auth Token**:
1. 访问 Sentry → Settings → Account → API → Auth Tokens
2. 创建新 token，选择权限：`project:releases`
3. 复制 token

---

## E2E 测试工作流程

### 工作流程文件

**文件位置**: `.github/workflows/e2e-tests.yml`

### 触发条件

E2E 测试在以下情况自动运行：

1. **Push 到主分支**:
   ```yaml
   on:
     push:
       branches: [main, develop]
   ```

2. **Pull Request**:
   ```yaml
   on:
     pull_request:
       branches: [main, develop]
   ```

3. **手动触发**:
   - 访问 GitHub Actions 页面
   - 选择 "E2E Tests" 工作流程
   - 点击 "Run workflow"

### 工作流程步骤

```
1. 📥 Checkout 代码
2. 📦 安装 pnpm 和 Node.js 20
3. 📦 安装依赖
4. 🔨 构建项目
5. 🗄️ 设置测试数据库
6. 🦀 设置 Rust 工具链
7. 🌐 安装 Playwright 浏览器
8. 🚀 启动服务:
   - OAuth Service (Rust) - 端口 3001
   - Admin Portal - 端口 3002
   - Pingora Proxy - 端口 6188
9. ✅ 健康检查所有服务
10. 🧪 运行 E2E 测试（40 个测试用例）
11. 🛑 停止所有服务
12. 📊 上传测试结果和截图
13. 📝 在 PR 中添加测试结果评论
14. 📧 发送失败通知（邮件 + Slack）
```

### 测试覆盖

- **用户管理** (10 个测试)
- **角色权限** (12 个测试)
- **错误场景** (12 个测试)
- **OAuth 认证** (6 个测试)
- **总计**: 40 个测试用例

---

## 通知配置

### PR 评论通知

**自动启用**，无需配置。

测试完成后，GitHub Actions 会自动在 PR 中添加评论：

```markdown
## E2E Test Results ✅ Passed

📊 **Test Summary:**
- Total: 40
- Passed: 40
- Failed: 0
- Skipped: 0

🎉 All tests passed!

📁 **Artifacts:**
- Test results and screenshots are available in the workflow artifacts
```

### 邮件通知

**需要配置 Secrets**（见上文）。

测试失败时自动发送邮件，内容包括：
- 仓库名称
- 分支名称
- 提交哈希和作者
- 工作流程链接

**示例邮件**:
```
Subject: ❌ E2E Tests Failed - anjing0524/ts-next

E2E tests failed in anjing0524/ts-next

Branch: refs/heads/main
Commit: abc123def456
Author: developer

Workflow: E2E Tests
Run: https://github.com/anjing0524/ts-next/actions/runs/123456789

Please check the workflow logs and test results for details.
```

### Slack 通知

**需要配置 Secrets**（见上文）。

测试失败时自动发送 Slack 消息到指定频道：

```
❌ E2E Tests Failed

Repository: anjing0524/ts-next
Branch: refs/heads/main
Author: developer
Commit: abc123def456

[View Workflow] (按钮)
```

**自定义 Slack 消息**:

编辑 `.github/workflows/e2e-tests.yml` 中的 Slack notification 步骤：

```yaml
- name: 💬 Send Slack notification
  if: failure()
  uses: slackapi/slack-github-action@v1
  with:
    payload: |
      {
        "text": "❌ E2E Tests Failed",
        "blocks": [
          // 自定义消息块
        ]
      }
```

---

## 本地运行 E2E 测试

### 快速开始

```bash
# 1. 启动所有服务（3 个终端窗口）

# 终端 1 - OAuth Service
cd apps/oauth-service-rust
cargo run

# 终端 2 - Admin Portal
pnpm --filter=admin-portal dev

# 终端 3 - Pingora Proxy
cd apps/pingora-proxy
cargo run

# 2. 运行测试（新终端）
cd apps/admin-portal
./run-all-e2e-tests.sh
```

### 测试命令选项

```bash
# Headless 模式（默认）
./run-all-e2e-tests.sh

# UI 模式（推荐，可视化界面）
./run-all-e2e-tests.sh --ui

# Headed 模式（可见浏览器）
./run-all-e2e-tests.sh --headed

# Debug 模式
./run-all-e2e-tests.sh --debug

# 跳过服务检查（如果服务已运行）
./run-all-e2e-tests.sh --skip-service-check
```

### 查看测试报告

```bash
# 生成并打开 HTML 报告
pnpm --filter=admin-portal test:e2e:report

# 查看测试结果文件
cat apps/admin-portal/test-results.json

# 查看失败的截图和视频
ls -la apps/admin-portal/test-results/
```

---

## 故障排查

### 问题 1: 服务启动失败

**症状**: CI/CD 中服务健康检查失败

**原因**:
- 端口被占用
- 数据库未初始化
- 配置错误

**解决方案**:

1. 检查服务日志:
   ```bash
   # 查看 GitHub Actions 日志中的服务输出
   ```

2. 本地复现问题:
   ```bash
   cd apps/oauth-service-rust
   DATABASE_URL="sqlite://test.db" cargo run
   ```

3. 验证数据库:
   ```bash
   cd apps/oauth-service-rust
   DATABASE_URL="sqlite://test.db" sqlx database create
   sqlx migrate run
   ```

### 问题 2: 测试超时

**症状**: 测试在等待元素时超时

**原因**:
- 服务响应慢
- 选择器错误
- 网络延迟

**解决方案**:

1. 增加超时时间（`playwright.config.ts`）:
   ```typescript
   use: {
     actionTimeout: 60000, // 从 30s 增加到 60s
     navigationTimeout: 60000,
   }
   ```

2. 使用更可靠的选择器:
   ```typescript
   // ✅ 好的
   page.getByTestId('username-input')
   page.getByRole('button', { name: '添加用户' })

   // ❌ 避免
   page.locator('.btn-primary')
   ```

3. 添加等待:
   ```typescript
   await page.waitForLoadState('networkidle');
   await page.waitForSelector('[data-testid="table"]');
   ```

### 问题 3: 邮件通知未发送

**症状**: 测试失败但未收到邮件

**原因**:
- Secrets 未配置
- SMTP 凭证错误
- 防火墙阻止

**解决方案**:

1. 验证 Secrets:
   ```bash
   # 在 GitHub Settings → Secrets 中检查
   MAIL_SERVER
   MAIL_PORT
   MAIL_USERNAME
   MAIL_PASSWORD
   NOTIFICATION_EMAIL
   ```

2. 测试 SMTP 连接:
   ```bash
   # 使用 telnet 测试
   telnet smtp.gmail.com 587
   ```

3. 检查防火墙:
   - GitHub Actions runners 可能阻止某些端口
   - 尝试使用其他邮件服务（如 SendGrid）

### 问题 4: Slack 通知未发送

**症状**: 测试失败但 Slack 未收到消息

**原因**:
- Webhook URL 错误
- 频道权限问题

**解决方案**:

1. 验证 Webhook URL:
   ```bash
   curl -X POST -H 'Content-type: application/json' \
     --data '{"text":"Test message"}' \
     YOUR_WEBHOOK_URL
   ```

2. 检查 Slack 应用权限:
   - 确保应用已添加到目标频道
   - 验证 Webhook 权限

3. 查看工作流程日志:
   ```
   # GitHub Actions 日志中查找 Slack notification 步骤
   ```

### 问题 5: 测试在 CI 通过但本地失败

**原因**:
- 环境差异
- 服务配置不同
- 数据库状态

**解决方案**:

1. 使用相同的环境变量:
   ```bash
   export NODE_ENV=test
   export CI=true
   export PLAYWRIGHT_TEST_BASE_URL=http://localhost:6188
   ```

2. 清理本地状态:
   ```bash
   # 删除测试数据库
   rm apps/oauth-service-rust/test.db

   # 重新初始化
   cd apps/oauth-service-rust
   DATABASE_URL="sqlite://test.db" sqlx database create
   sqlx migrate run
   ```

3. 使用 Docker 复现 CI 环境:
   ```bash
   docker run -it --rm \
     -v $(pwd):/workspace \
     -w /workspace \
     node:20 \
     bash -c "pnpm install && pnpm test:e2e"
   ```

---

## 最佳实践

### 1. 保持测试独立

每个测试应该独立运行，不依赖其他测试的状态：

```typescript
test.beforeEach(async ({ page }) => {
  // 每次测试前重新认证
  await authenticate(page);
});
```

### 2. 使用有意义的测试名称

```typescript
// ✅ 好的
test('should create a new user with valid credentials', async ({ page }) => {
  // ...
});

// ❌ 避免
test('test 1', async ({ page }) => {
  // ...
});
```

### 3. 清理测试数据

```typescript
test('should delete user', async ({ page }) => {
  // 创建测试用户
  const testUser = `test_${Date.now()}`;
  await createUser(testUser);

  // 执行测试
  await deleteUser(testUser);

  // 验证删除成功
  await expect(page.getByText(testUser)).not.toBeVisible();
});
```

### 4. 使用显式等待

```typescript
// ✅ 好的 - 显式等待
await expect(page.getByText('用户管理')).toBeVisible();

// ❌ 避免 - 固定延迟
await page.waitForTimeout(3000);
```

### 5. 截图和视频

配置失败时自动截图和录制视频：

```typescript
// playwright.config.ts
use: {
  screenshot: 'only-on-failure',
  video: 'retain-on-failure',
  trace: 'retain-on-failure',
}
```

---

## 性能优化

### 1. 并行执行

```typescript
// playwright.config.ts
workers: process.env.CI ? 1 : undefined, // CI 串行，本地并行
```

### 2. 重用认证状态

```typescript
// 保存认证状态
await page.context().storageState({ path: 'auth.json' });

// 重用认证状态
const context = await browser.newContext({ storageState: 'auth.json' });
```

### 3. 选择性运行测试

```bash
# 仅运行特定文件
playwright test user-management.spec.ts

# 仅运行匹配的测试
playwright test -g "should create user"

# 跳过慢速测试
playwright test --grep-invert "@slow"
```

---

## 相关文档

- [E2E 测试总结](../../apps/admin-portal/E2E_TESTS_SUMMARY.md)
- [集成测试指南](../../apps/admin-portal/INTEGRATION_TESTING_GUIDE.md)
- [生产就绪修复总结](../../PRODUCTION_READINESS_FIXES_SUMMARY.md)
- [Playwright 官方文档](https://playwright.dev/)
- [GitHub Actions 文档](https://docs.github.com/en/actions)

---

**文档版本**: 1.0
**最后更新**: 2024-11-18
**维护者**: DevOps Team
