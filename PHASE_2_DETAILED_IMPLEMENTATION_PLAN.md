# Phase 2 详细实现计划：完整登录页面

**开始日期**: 2025-12-01
**预计完成**: 5-7 天
**难度级别**: ⭐⭐⭐ (中等)
**目标**: 实现功能完整、样式精美的登录页面

---

## 概览

Phase 2 将把 Phase 1 的登录页面占位符转变为功能完整的生产级别登录界面，包括：
- 完整的 HTML 表单结构
- 前端验证逻辑
- 错误消息显示
- 响应式设计
- 完整的 E2E 测试

---

## 任务分解

### Task 2.1: 完整登录表单 HTML (1.5 小时)

**文件**: `apps/oauth-service-rust/templates/login.html`

**目标**: 将占位符升级为完整的表单结构

**实现内容**:

```html
{% extends "layout.html" %}

{% block title %}登录 - OAuth 授权系统{% endblock %}

{% block extra_head %}
<style>
    .form-group {
        margin-bottom: 1.5rem;
    }
    .form-error {
        color: #dc2626;
        font-size: 0.875rem;
        margin-top: 0.25rem;
    }
    .remember-me {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
</style>
{% endblock %}

{% block content %}
<div class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100
            flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
    <div class="w-full max-w-md bg-white rounded-xl shadow-lg p-8">
        <!-- 品牌和标题 -->
        <div class="text-center mb-8">
            <h1 class="text-3xl font-bold text-gray-900">{{ company_name }}</h1>
            <p class="text-sm text-gray-600 mt-2">OAuth 授权系统登录</p>
        </div>

        <!-- 错误消息 -->
        {% if let Some(error) = error_message %}
        <div class="mb-6 p-4 rounded-lg bg-red-50 border border-red-200">
            <p class="text-red-700 font-medium text-sm">
                <span class="mr-2">⚠️</span>{{ error }}
            </p>
        </div>
        {% endif %}

        <!-- 登录表单 -->
        <form id="login-form" method="POST" action="/api/v2/auth/login" class="space-y-6">
            <!-- 用户名字段 -->
            <div class="form-group">
                <label for="username" class="block text-sm font-medium text-gray-700 mb-2">
                    用户名或邮箱
                </label>
                <input
                    type="text"
                    id="username"
                    name="username"
                    required
                    autofocus
                    placeholder="请输入用户名或邮箱"
                    class="w-full px-4 py-2 rounded-lg border border-gray-300
                           focus:border-blue-500 focus:ring-2 focus:ring-blue-200
                           transition-colors duration-200
                           placeholder-gray-400"
                    aria-label="用户名或邮箱">
                <div class="form-error" id="username-error"></div>
            </div>

            <!-- 密码字段 -->
            <div class="form-group">
                <label for="password" class="block text-sm font-medium text-gray-700 mb-2">
                    密码
                </label>
                <input
                    type="password"
                    id="password"
                    name="password"
                    required
                    placeholder="请输入密码"
                    class="w-full px-4 py-2 rounded-lg border border-gray-300
                           focus:border-blue-500 focus:ring-2 focus:ring-blue-200
                           transition-colors duration-200
                           placeholder-gray-400"
                    aria-label="密码">
                <div class="form-error" id="password-error"></div>
            </div>

            <!-- 记住我和忘记密码 -->
            <div class="flex items-center justify-between text-sm">
                <label class="remember-me">
                    <input
                        type="checkbox"
                        id="remember"
                        name="remember"
                        class="w-4 h-4 rounded border-gray-300
                               text-blue-600 focus:ring-blue-500">
                    <span class="text-gray-700">记住我</span>
                </label>
                <a href="#" class="text-blue-600 hover:text-blue-700 font-medium">
                    忘记密码?
                </a>
            </div>

            <!-- 隐藏字段：重定向 URL -->
            {% if let Some(url) = redirect_url %}
            <input type="hidden" name="redirect" value="{{ url }}">
            {% endif %}

            <!-- 登录按钮 -->
            <button
                type="submit"
                id="submit-btn"
                class="w-full py-2 px-4 rounded-lg font-semibold
                       bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800
                       transition-colors duration-200
                       disabled:opacity-50 disabled:cursor-not-allowed">
                <span id="btn-text">登录</span>
                <span id="btn-loading" class="hidden">
                    <svg class="inline w-4 h-4 mr-2 animate-spin"
                         xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    登录中...
                </span>
            </button>
        </form>

        <!-- 其他登录方式（可选，Phase 3） -->
        <div class="mt-6 border-t border-gray-200 pt-6">
            <div class="text-center text-sm text-gray-600">
                没有账户? <a href="#" class="text-blue-600 hover:text-blue-700 font-medium">注册</a>
            </div>
        </div>
    </div>
</div>
{% endblock %}

{% block extra_script %}
<script>
    // 前端表单验证和提交处理
    const form = document.getElementById('login-form');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const usernameError = document.getElementById('username-error');
    const passwordError = document.getElementById('password-error');
    const submitBtn = document.getElementById('submit-btn');
    const btnText = document.getElementById('btn-text');
    const btnLoading = document.getElementById('btn-loading');

    // 验证函数
    function validateUsername(value) {
        if (!value || value.trim().length === 0) {
            return '用户名不能为空';
        }
        if (value.length < 3) {
            return '用户名至少需要 3 个字符';
        }
        if (value.length > 50) {
            return '用户名不能超过 50 个字符';
        }
        // 允许字母、数字、下划线、点号和@（邮箱）
        if (!/^[a-zA-Z0-9._@-]+$/.test(value)) {
            return '用户名包含无效字符';
        }
        return '';
    }

    function validatePassword(value) {
        if (!value || value.length === 0) {
            return '密码不能为空';
        }
        if (value.length < 6) {
            return '密码至少需要 6 个字符';
        }
        if (value.length > 128) {
            return '密码不能超过 128 个字符';
        }
        return '';
    }

    // 显示错误
    function showError(input, errorElement, message) {
        if (message) {
            input.classList.add('border-red-500');
            input.classList.remove('border-gray-300');
            errorElement.textContent = message;
            errorElement.style.display = 'block';
        } else {
            input.classList.remove('border-red-500');
            input.classList.add('border-gray-300');
            errorElement.textContent = '';
            errorElement.style.display = 'none';
        }
    }

    // 实时验证
    usernameInput.addEventListener('blur', () => {
        const error = validateUsername(usernameInput.value);
        showError(usernameInput, usernameError, error);
    });

    passwordInput.addEventListener('blur', () => {
        const error = validatePassword(passwordInput.value);
        showError(passwordInput, passwordError, error);
    });

    // 表单提交
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // 验证
        const usernameError = validateUsername(usernameInput.value);
        const passwordError = validatePassword(passwordInput.value);

        showError(usernameInput, document.getElementById('username-error'), usernameError);
        showError(passwordInput, document.getElementById('password-error'), passwordError);

        if (usernameError || passwordError) {
            return;
        }

        // 禁用按钮，显示加载状态
        submitBtn.disabled = true;
        btnText.classList.add('hidden');
        btnLoading.classList.remove('hidden');

        try {
            const response = await fetch('/api/v2/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    username: usernameInput.value,
                    password: passwordInput.value,
                    remember: document.getElementById('remember').checked,
                    redirect: form.querySelector('input[name="redirect"]')?.value || '/',
                }),
            });

            const data = await response.json();

            if (response.ok && data.success) {
                // 登录成功，重定向
                if (data.redirect_url) {
                    window.location.href = data.redirect_url;
                } else {
                    window.location.href = '/success';
                }
            } else {
                // 登录失败，显示错误
                const errorMsg = data.error || '登录失败，请检查用户名和密码';
                alert(errorMsg);
                submitBtn.disabled = false;
                btnText.classList.remove('hidden');
                btnLoading.classList.add('hidden');
            }
        } catch (error) {
            console.error('Login error:', error);
            alert('网络错误，请稍后重试');
            submitBtn.disabled = false;
            btnText.classList.remove('hidden');
            btnLoading.classList.add('hidden');
        }
    });
</script>
{% endblock %}
```

**关键点**:
- 完整的表单结构（用户名、密码、记住我、忘记密码）
- 前端实时验证（blur 事件）
- 表单提交前验证
- 加载状态反馈
- 响应式设计（移动端优化）
- 无障碍考虑（aria-label）

---

### Task 2.2: 表单验证逻辑 (1.5 小时)

**文件**: `apps/oauth-service-rust/src/routes/templates.rs` (更新)

**目标**: 在服务器端实现表单验证和处理

**实现内容** - 在 `login_handler` 中添加：

```rust
// 前端发送的登录请求结构
#[derive(Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
    pub remember: Option<bool>,
    pub redirect: Option<String>,
}

// 验证用户名
fn validate_username(username: &str) -> Result<(), String> {
    if username.is_empty() {
        return Err("用户名不能为空".to_string());
    }
    if username.len() < 3 || username.len() > 50 {
        return Err("用户名长度必须在 3-50 个字符之间".to_string());
    }
    if !username.chars().all(|c| c.is_alphanumeric() || "._@-".contains(c)) {
        return Err("用户名包含无效字符".to_string());
    }
    Ok(())
}

// 验证密码
fn validate_password(password: &str) -> Result<(), String> {
    if password.is_empty() {
        return Err("密码不能为空".to_string());
    }
    if password.len() < 6 || password.len() > 128 {
        return Err("密码长度必须在 6-128 个字符之间".to_string());
    }
    Ok(())
}

// 验证重定向 URL
fn validate_redirect(redirect: &str) -> Result<(), String> {
    if redirect.is_empty() {
        return Ok(());
    }
    if !redirect.starts_with("http://localhost") &&
       !redirect.starts_with("https://") &&
       !redirect.starts_with("/") {
        return Err("无效的重定向 URL".to_string());
    }
    Ok(())
}
```

---

### Task 2.3: 登录提交处理器 (2 小时)

**文件**: `apps/oauth-service-rust/src/routes/oauth.rs` (更新 login_endpoint)

**目标**: 实现完整的登录逻辑

**实现步骤**:

1. **接收请求** - 解析 JSON 登录请求
2. **验证输入** - 运行所有验证函数
3. **查询用户** - 从数据库获取用户记录
4. **验证密码** - 使用 bcrypt 比对密码
5. **检查账户状态** - 确保账户已激活
6. **加载权限** - 获取用户的 RBAC 权限
7. **签发会话令牌** - 创建安全会话
8. **设置 Cookie** - HttpOnly, Secure, SameSite
9. **更新登录记录** - last_login 时间戳
10. **审计日志** - 记录登录事件
11. **返回响应** - 重定向或成功消息

**安全考虑**:
- ✅ 密码使用 bcrypt 加密存储和验证
- ✅ HttpOnly Cookie 防 XSS
- ✅ Secure 标志防中间人攻击
- ✅ SameSite=Lax 防 CSRF
- ✅ 速率限制防暴力破解
- ✅ 审计日志记录所有登录尝试

---

### Task 2.4: 错误消息和响应式设计 (1 小时)

**目标**: 完善用户体验

**错误处理**:
- 网络错误: "网络连接失败，请检查你的网络"
- 验证错误: 在对应字段下显示
- 服务器错误: "服务器错误，请稍后重试"
- 登录失败: "用户名或密码错误"
- 账户禁用: "账户已被禁用，请联系管理员"

**响应式设计**:
- 📱 移动端 (< 640px): 单列，全宽表单
- 📱 平板 (640px - 1024px): 居中卡片，最大宽度 28rem
- 💻 桌面 (> 1024px): 居中卡片，背景渐变

---

### Task 2.5: E2E 测试 (2 小时)

**文件**: `apps/oauth-service-rust/tests/e2e_login_phase2.rs` (新建)

**测试用例**:

```rust
#[tokio::test]
async fn test_login_page_loads() {
    // 验证 /login 页面能正常加载
    // 验证表单元素存在
    // 验证样式已应用
}

#[tokio::test]
async fn test_form_validation_empty_username() {
    // 提交空用户名
    // 验证错误消息显示
}

#[tokio::test]
async fn test_form_validation_short_password() {
    // 提交短密码（< 6 字符）
    // 验证错误消息显示
}

#[tokio::test]
async fn test_successful_login() {
    // 创建测试用户
    // 提交有效凭证
    // 验证重定向或成功消息
    // 验证 session cookie 已设置
}

#[tokio::test]
async fn test_invalid_credentials() {
    // 提交错误密码
    // 验证登录失败错误消息
    // 验证 cookie 未设置
}

#[tokio::test]
async fn test_disabled_account() {
    // 创建禁用账户
    // 尝试登录
    // 验证 "账户已被禁用" 错误
}

#[tokio::test]
async fn test_rate_limiting() {
    // 连续提交多个错误的登录尝试
    // 验证速率限制触发
}

#[tokio::test]
async fn test_csrf_protection() {
    // 验证 state 参数处理
    // 验证无效的 state 被拒绝
}
```

---

## 实现时间表

| Task | 预计时间 | 优先级 |
|------|---------|--------|
| 2.1: 完整表单 HTML | 1.5h | 🔴 高 |
| 2.2: 表单验证逻辑 | 1.5h | 🔴 高 |
| 2.3: 登录处理器 | 2h | 🔴 高 |
| 2.4: 错误和响应式 | 1h | 🟡 中 |
| 2.5: E2E 测试 | 2h | 🟡 中 |
| 文档和总结 | 1h | 🟢 低 |
| **总计** | **8.5h** | |

**日历分配**:
- Day 1: Tasks 2.1 + 2.2 (3h)
- Day 2: Task 2.3 + 2.4 (3h)
- Day 3: Task 2.5 + 文档 (2.5h)

---

## 验收标准

### 功能验收
- ✅ 登录表单完整且美观
- ✅ 前端验证工作正常
- ✅ 服务器端验证完整
- ✅ 密码加密存储和验证
- ✅ 会话管理正确
- ✅ 错误消息清晰友好
- ✅ 重定向正常工作

### 安全验收
- ✅ 密码使用 bcrypt（非明文）
- ✅ HttpOnly Cookie 防 XSS
- ✅ Secure 标志启用
- ✅ SameSite 防 CSRF
- ✅ 速率限制有效
- ✅ 审计日志记录

### 质量验收
- ✅ E2E 测试通过（100% 覆盖主流程）
- ✅ 代码编译无错误和警告
- ✅ 响应式设计测试通过
- ✅ 文档完整更新
- ✅ 性能指标达成（<1s 页面加载）

---

## 依赖关系

**依赖**:
- Phase 1 基础设施 ✅ 已完成
- 数据库用户表（应该已有）
- bcrypt crate（已在 Cargo.toml）
- tokio 运行时（已有）

**后续依赖**:
- Phase 3: 权限同意页面（需要登录会话）
- Phase 4: OAuth 流程修复（需要会话标识）

---

## 开发建议

### 本地测试

```bash
# Terminal 1: Rust 服务器
cargo watch -q -c -w src -x run

# Terminal 2: 测试运行
cargo test --test e2e_login_phase2

# Terminal 3: 浏览器测试
open http://localhost:3001/login
```

### 调试技巧

1. **查看数据库**:
   ```bash
   sqlite3 oauth.db "SELECT id, username, email FROM users LIMIT 5;"
   ```

2. **检查 Cookie**:
   ```bash
   # 在浏览器开发工具中查看 Application > Cookies
   ```

3. **查看日志**:
   ```bash
   # 查看服务器日志（cargo watch 输出）
   ```

---

## 风险和缓解

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| 数据库连接超时 | 低 | 高 | 实现连接池重试 |
| 密码验证失败 | 低 | 高 | 充分的单元测试 |
| 会话令牌过期 | 中 | 中 | 实现刷新机制 |
| 性能问题 | 低 | 中 | 缓存用户权限 |

---

## 下一步（Phase 3）

Phase 3 将实现权限同意页面：
- 展示请求的权限范围
- 用户同意确认
- 授权码发放
- 错误处理

**预计**: 3-5 天

---

**准备好了吗？让我们开始 Phase 2！** 🚀