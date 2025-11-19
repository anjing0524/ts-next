# 生产就绪集成测试指南

> 本指南提供详细的步骤来验证 CSP、Sentry 和 Web Vitals 集成是否正常工作。

## 目录

1. [前置条件](#前置条件)
2. [自动化验证](#自动化验证)
3. [Sentry 错误监控测试](#sentry-错误监控测试)
4. [Web Vitals 性能监控测试](#web-vitals-性能监控测试)
5. [CSP 策略验证](#csp-策略验证)
6. [故障排查](#故障排查)

---

## 前置条件

### 1. 运行自动化验证脚本

在开始手动测试之前，先运行自动化验证脚本确保所有文件和配置就绪：

```bash
cd apps/admin-portal
./scripts/verify-integrations.sh
```

**期望输出：**
```
✓ 所有关键集成验证通过！
通过: 20
失败: 0
警告: 0
```

如果有任何失败项，请先修复后再继续。

### 2. 安装依赖

确保所有依赖已安装：

```bash
pnpm install
```

---

## Sentry 错误监控测试

### 步骤 1: 配置 Sentry DSN

#### 1.1 创建 Sentry 项目（如果还没有）

1. 访问 [sentry.io](https://sentry.io)
2. 注册/登录账号
3. 创建新项目：
   - Platform: **Next.js**
   - Alert frequency: 根据需求选择
4. 复制 **DSN** (格式: `https://xxxxxx@oXXXXXX.ingest.sentry.io/XXXXXXX`)

#### 1.2 配置环境变量

创建 `.env.local` 文件（如果不存在）：

```bash
cd apps/admin-portal
cp .env.example .env.local
```

编辑 `.env.local`，添加 Sentry DSN：

```bash
# Sentry 错误监控配置
NEXT_PUBLIC_SENTRY_DSN=https://your-sentry-dsn@oXXXXXX.ingest.sentry.io/XXXXXXX
SENTRY_DSN=https://your-sentry-dsn@oXXXXXX.ingest.sentry.io/XXXXXXX

# Sentry 环境标识
NEXT_PUBLIC_SENTRY_ENVIRONMENT=development
SENTRY_ENVIRONMENT=development

# 应用版本
NEXT_PUBLIC_APP_VERSION=1.0.0-dev
APP_VERSION=1.0.0-dev
```

**注意：** 开发环境不需要配置 `SENTRY_AUTH_TOKEN`（仅生产环境上传 source maps 需要）

### 步骤 2: 启动开发服务器

```bash
cd /home/user/ts-next
pnpm --filter=admin-portal dev
```

等待服务器启动完成，访问 http://localhost:3002

### 步骤 3: 测试客户端错误捕获

#### 3.1 测试组件错误（Error Boundary）

在浏览器控制台执行以下代码：

```javascript
// 触发组件错误
throw new Error('Test Error: Component error from console');
```

**期望结果：**
1. 页面显示 ErrorBoundary 的错误 UI
2. 浏览器控制台显示错误信息
3. Sentry 收到错误报告（查看 Sentry Dashboard）

#### 3.2 测试全局未捕获错误

在浏览器控制台执行：

```javascript
// 触发全局错误
setTimeout(() => {
  throw new Error('Test Error: Unhandled error from setTimeout');
}, 100);
```

**期望结果：**
1. 浏览器控制台显示错误
2. Sentry 收到错误报告，包含错误上下文（filename, lineno, colno）

#### 3.3 测试 Promise Rejection

在浏览器控制台执行：

```javascript
// 触发未处理的 Promise rejection
Promise.reject(new Error('Test Error: Unhandled promise rejection'));
```

**期望结果：**
1. 浏览器控制台显示 unhandled rejection 警告
2. Sentry 收到错误报告，包含 Promise context

### 步骤 4: 验证 Sentry Dashboard

1. 访问 [Sentry Dashboard](https://sentry.io)
2. 进入你的项目
3. 查看 **Issues** 页面
4. 确认收到 3 个测试错误：
   - Component error from console
   - Unhandled error from setTimeout
   - Unhandled promise rejection

**检查错误详情应包含：**
- ✅ Error message 和 stack trace
- ✅ User context (如果已登录)
- ✅ Browser/OS 信息
- ✅ 错误发生的 URL
- ✅ Environment: `development`
- ✅ Release: `1.0.0-dev`

### 步骤 5: 测试 Session Replay（可选）

1. 在应用中正常操作（点击按钮、导航等）
2. 触发一个错误
3. 在 Sentry Dashboard 的错误详情页查看 **Session Replay**
4. 可以看到错误发生前的用户操作录屏

---

## Web Vitals 性能监控测试

### 步骤 1: 打开浏览器开发者工具

1. 访问 http://localhost:3002
2. 打开 Chrome DevTools (F12)
3. 切换到 **Console** 标签页

### 步骤 2: 观察 Web Vitals 日志

刷新页面，在控制台中观察 Web Vitals 指标输出（彩色日志）：

**期望看到以下指标：**

```
[Web Vitals] TTFB: XXXms (good/needs-improvement/poor)
[Web Vitals] FCP: XXXms (good/needs-improvement/poor)
[Web Vitals] LCP: XXXms (good/needs-improvement/poor)
[Web Vitals] CLS: 0.XXX (good/needs-improvement/poor)
[Web Vitals] FID: XXXms (good/needs-improvement/poor)  // 需要用户交互
[Web Vitals] INP: XXXms (good/needs-improvement/poor)  // 需要用户交互
```

**日志颜色：**
- 🟢 **绿色**: good（性能优秀）
- 🟠 **橙色**: needs-improvement（需要改进）
- 🔴 **红色**: poor（性能差）

### 步骤 3: 触发用户交互指标

**FID (First Input Delay)** 和 **INP (Interaction to Next Paint)** 需要用户交互才会触发：

1. 点击页面上的任何按钮或链接
2. 在输入框中输入文字
3. 滚动页面

观察控制台是否输出 FID 和 INP 指标。

### 步骤 4: 检查性能阈值

参考以下 Google 推荐的阈值判断性能：

| 指标 | Good | Needs Improvement | Poor |
|------|------|-------------------|------|
| **LCP** (Largest Contentful Paint) | ≤ 2.5s | 2.5s - 4.0s | > 4.0s |
| **FID** (First Input Delay) | ≤ 100ms | 100ms - 300ms | > 300ms |
| **CLS** (Cumulative Layout Shift) | ≤ 0.1 | 0.1 - 0.25 | > 0.25 |
| **FCP** (First Contentful Paint) | ≤ 1.8s | 1.8s - 3.0s | > 3.0s |
| **TTFB** (Time to First Byte) | ≤ 800ms | 800ms - 1800ms | > 1800ms |
| **INP** (Interaction to Next Paint) | ≤ 200ms | 200ms - 500ms | > 500ms |

### 步骤 5: 验证 Sentry 性能监控集成

1. 访问 Sentry Dashboard
2. 进入 **Performance** 页面
3. 查找类型为 `Web Vital: XXX` 的消息
4. 确认包含以下信息：
   - Metric name (LCP, FID, CLS, etc.)
   - Metric value
   - Rating (good/needs-improvement/poor)
   - Navigation type
   - Tags: `web-vital.name`, `web-vital.rating`

**注意：** 开发环境的 Web Vitals 可能比生产环境差，这是正常的（热更新、source maps 等开销）。

### 步骤 6: 测试自定义分析端点（可选）

如果配置了自定义分析端点：

1. 在 `.env.local` 中添加：
   ```bash
   NEXT_PUBLIC_ANALYTICS_ENDPOINT=https://your-analytics-endpoint.com/vitals
   ```

2. 检查浏览器 Network 标签页
3. 确认有 POST 请求发送到该端点
4. 请求 body 应包含：
   ```json
   {
     "metric": "LCP",
     "value": 1234,
     "rating": "good",
     "id": "v3-1234567890",
     "navigationType": "navigate",
     "timestamp": 1234567890,
     "url": "http://localhost:3002/",
     "userAgent": "Mozilla/5.0..."
   }
   ```

---

## CSP 策略验证

### 步骤 1: 检查 CSP 响应头

#### 1.1 使用浏览器 DevTools

1. 访问 http://localhost:3002
2. 打开 Chrome DevTools (F12)
3. 切换到 **Network** 标签页
4. 刷新页面
5. 点击第一个文档请求（通常是 `localhost` 或路径名）
6. 切换到 **Headers** 标签页
7. 查看 **Response Headers**

#### 1.2 验证 CSP 头部内容

**应该看到以下头部：**

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-XXXXX' 'strict-dynamic'; style-src 'self' 'nonce-XXXXX'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'
X-CSP-Nonce: XXXXX (Base64 编码的随机字符串)
```

**关键检查：**
- ✅ `script-src` 包含 `'nonce-XXXXX'` 和 `'strict-dynamic'`
- ✅ `style-src` 包含 `'nonce-XXXXX'`
- ❌ **不应该** 包含 `'unsafe-inline'`
- ❌ **不应该** 包含 `'unsafe-eval'`
- ✅ `frame-ancestors 'none'` (防止点击劫持)
- ✅ `X-CSP-Nonce` 头部存在且每次请求都不同

#### 1.3 验证其他安全头部

同时检查是否存在以下安全头部：

```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=()
```

生产环境还应该有：
```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

### 步骤 2: 验证 CSP 不阻止合法资源

1. 刷新页面，确保页面正常渲染
2. 检查控制台是否有 CSP 违规错误（应该没有）
3. 测试页面功能：
   - ✅ 导航正常工作
   - ✅ 按钮点击有响应
   - ✅ 样式正确加载
   - ✅ 图片正常显示
   - ✅ 表单提交正常

### 步骤 3: 测试 CSP 阻止恶意脚本

在浏览器控制台尝试执行内联脚本（应该被阻止）：

```javascript
// 这些操作应该被 CSP 阻止
eval('console.log("This should be blocked")');
```

**期望结果：**
- ❌ 代码不执行
- 控制台显示 CSP 违规错误：
  ```
  Refused to evaluate a string as JavaScript because 'unsafe-eval' is not an allowed source of script in the following Content Security Policy directive: "script-src 'self' 'nonce-XXXXX' 'strict-dynamic'".
  ```

### 步骤 4: 验证 Nonce 每次请求都不同

1. 刷新页面多次
2. 每次检查 `X-CSP-Nonce` 响应头
3. 确认 nonce 值每次都不同（128-bit 随机值，Base64 编码）

**示例：**
```
Request 1: X-CSP-Nonce: kQr4qxirROcbvMoKkm7sqqxnx5POFTys
Request 2: X-CSP-Nonce: 9x3mKpL2Yt8nW4vB6cE5jR7zQ1aS0dF2
Request 3: X-CSP-Nonce: pT6yU8iO5rE3wQ2sA9dG1fH4jK7lM0nN
```

### 步骤 5: 使用 CSP Evaluator（可选）

使用 Google 的 [CSP Evaluator](https://csp-evaluator.withgoogle.com/) 验证策略安全性：

1. 复制完整的 CSP 头部值
2. 访问 https://csp-evaluator.withgoogle.com/
3. 粘贴 CSP 策略
4. 点击 **Evaluate**

**期望评分：** A 或 A+

**常见建议：**
- ✅ 使用 nonce 替代 unsafe-inline
- ✅ 使用 strict-dynamic 支持动态脚本加载
- ✅ 避免使用 unsafe-eval
- ✅ 设置 frame-ancestors 防止点击劫持

---

## 故障排查

### Sentry 问题

#### 问题 1: Sentry 没有收到错误

**可能原因：**
1. DSN 配置错误
2. 网络连接问题
3. Sentry 在开发环境被禁用

**排查步骤：**

1. 检查 DSN 配置：
   ```bash
   cat .env.local | grep SENTRY_DSN
   ```

2. 检查 Sentry 是否启用（浏览器控制台）：
   ```javascript
   console.log('SENTRY_DSN:', process.env.NEXT_PUBLIC_SENTRY_DSN);
   ```

3. 检查 Network 标签页，是否有请求发送到 `ingest.sentry.io`

4. 查看浏览器控制台是否有 Sentry 相关错误

5. 临时禁用 `beforeSend` 过滤器（`sentry.client.config.ts`）：
   ```typescript
   // 注释掉 beforeSend 中的早期返回
   // if (SENTRY_ENVIRONMENT === 'development' && !SENTRY_DSN) {
   //   return null;
   // }
   ```

#### 问题 2: Source Maps 未上传

开发环境不需要上传 source maps。生产环境如果需要：

1. 配置 `SENTRY_AUTH_TOKEN` 在 `.env.local`
2. 确保 `next.config.js` 中 `uploadSourceMaps: process.env.NODE_ENV === 'production'`

### Web Vitals 问题

#### 问题 1: 控制台没有 Web Vitals 日志

**可能原因：**
1. 代码未执行（SSR 环境）
2. web-vitals 库加载失败

**排查步骤：**

1. 检查 `WebVitalsReporter` 是否在 `app-providers.tsx` 中
2. 查看 Network 标签页，确认 `web-vitals` 库已加载
3. 在控制台手动导入测试：
   ```javascript
   import('web-vitals').then(({ onLCP }) => {
     onLCP(console.log);
   });
   ```

#### 问题 2: FID/INP 指标没有触发

这是正常的！FID 和 INP 需要用户交互：
- 点击按钮
- 输入文字
- 按键盘键

### CSP 问题

#### 问题 1: CSP 阻止了合法资源

**可能原因：**
1. Nonce 没有正确传递到 HTML
2. 第三方脚本没有 nonce
3. CSP 策略过于严格

**排查步骤：**

1. 检查控制台 CSP 违规错误
2. 查看被阻止的资源 URL
3. 根据资源类型调整策略：
   - 图片：`img-src` 已包含 `https:`
   - 字体：`font-src` 已包含 `data:`
   - 样式：确保使用 nonce
   - 脚本：确保使用 nonce 或 `strict-dynamic`

4. 临时放宽策略测试（仅用于调试）：
   ```typescript
   // proxy.ts - 临时添加
   `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-inline'`,
   ```

#### 问题 2: 每次刷新 nonce 都相同

检查 `generateNonce()` 函数是否每次请求都调用：

```typescript
// proxy.ts - 应该在 proxy() 函数内部
export async function proxy(request: NextRequest) {
  const nonce = generateNonce(); // ✅ 每次请求生成新 nonce
  // ...
}
```

---

## 验证清单

完成所有测试后，确认以下清单：

### Sentry 集成
- [ ] ✅ Sentry 配置文件存在（client, server, edge）
- [ ] ✅ DSN 已配置在 `.env.local`
- [ ] ✅ ErrorBoundary 捕获组件错误
- [ ] ✅ GlobalErrorHandler 捕获全局错误
- [ ] ✅ Sentry Dashboard 收到测试错误
- [ ] ✅ 错误详情包含完整上下文
- [ ] ✅ Session Replay 正常工作（可选）

### Web Vitals 监控
- [ ] ✅ 控制台显示 6 个 Core Web Vitals 指标
- [ ] ✅ 日志颜色编码正确（green/orange/red）
- [ ] ✅ Sentry 收到 Web Vitals 消息
- [ ] ✅ 自定义分析端点接收数据（如果配置）

### CSP 策略
- [ ] ✅ CSP 头部包含 nonce
- [ ] ✅ CSP 不包含 unsafe-inline
- [ ] ✅ CSP 不包含 unsafe-eval
- [ ] ✅ X-CSP-Nonce 头部每次请求都不同
- [ ] ✅ 所有安全头部正确设置
- [ ] ✅ 页面功能正常（无 CSP 违规）
- [ ] ✅ eval() 被正确阻止
- [ ] ✅ CSP Evaluator 评分 A 或 A+

---

## 下一步

完成以上验证后，可以继续：

### 短期任务 (1-2 周)
1. **补充用户管理 E2E 测试**
   - 用户 CRUD 操作
   - 列表分页和搜索
   - 权限控制

2. **补充角色权限 E2E 测试**
   - 角色创建和分配
   - 权限管理
   - 角色-用户关联

3. **添加错误场景 E2E 测试**
   - 网络错误处理
   - 401/403 授权错误
   - 表单验证错误
   - 服务器错误 (500)

### 中期任务 (3-4 周)
4. **集成 next-intl 国际化**
   - 安装 next-intl
   - 创建翻译文件（zh-CN, en-US）
   - 提取硬编码文本
   - 实现语言切换

5. **补充单元测试**
   - Domain 层 Zod schema 测试
   - Application 层 service 测试
   - Utils 函数测试
   - 目标：≥80% 覆盖率

6. **完整的生产部署**
   - 最终安全审计
   - 性能测试
   - 负载测试
   - 渐进式发布计划

---

## 附录

### 有用的资源

- [Sentry Next.js 文档](https://docs.sentry.io/platforms/javascript/guides/nextjs/)
- [Web Vitals 文档](https://web.dev/vitals/)
- [CSP 参考](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [CSP Evaluator](https://csp-evaluator.withgoogle.com/)
- [Next.js Security Headers](https://nextjs.org/docs/app/api-reference/next-config-js/headers)

### 联系支持

如遇到问题，请查阅：
- Sentry 问题：https://github.com/getsentry/sentry-javascript/issues
- Web Vitals 问题：https://github.com/GoogleChrome/web-vitals/issues
- Next.js 问题：https://github.com/vercel/next.js/discussions
