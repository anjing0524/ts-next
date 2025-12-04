# Phase 1: 基础设施准备 - 详细任务分解
## OAuth 2.1 Web UI 嵌入式实现

**阶段**: Phase 1 (基础设施准备)
**预计工作量**: 3-5 天
**目标**: 项目基础设施完成，能够开始开发页面

**成功标准**:
- ✅ `cargo build` 成功编译
- ✅ `cargo test` 所有测试通过
- ✅ 访问 `http://localhost:3001` 无错误
- ✅ 模板文件编译无错误
- ✅ CSS 生成正确

---

## 任务 1.1: 添加 Cargo 依赖 (Day 1, 30 分钟)

### 位置

```
File: apps/oauth-service-rust/Cargo.toml
```

### 当前状态

打开 `Cargo.toml` 查看现有依赖：

```bash
head -50 apps/oauth-service-rust/Cargo.toml
```

### 要做的事

在 `[dependencies]` 部分添加以下依赖：

```toml
# 已有的依赖保持不变
# axum = "0.7"
# tokio = { version = "1", features = ["full"] }
# 等等...

# ===== 新增 Web UI 依赖 =====

# 模板引擎
askama = "0.12"
askama_axum = "0.4"

# HTML 转义和格式化
html-escape = "0.2"

# 调试日志（开发时有用）
tracing = "0.1"
tracing-subscriber = "0.3"

# ===== (现有依赖保持不变) =====
```

### 验证

```bash
cd apps/oauth-service-rust
cargo check
# 应该输出: Finished `dev` profile...
```

如果有错误，检查：
1. Rust 版本 >= 1.70
2. 没有版本冲突
3. 网络连接正常（下载包需要时间）

---

## 任务 1.2: 创建模板目录结构 (Day 1, 15 分钟)

### 目录结构

```bash
# 创建目录
mkdir -p apps/oauth-service-rust/templates
mkdir -p apps/oauth-service-rust/static/styles
mkdir -p apps/oauth-service-rust/static/assets

# 验证
ls -la apps/oauth-service-rust/templates/
ls -la apps/oauth-service-rust/static/
```

最终结构应该是：

```
apps/oauth-service-rust/
├─ templates/                    # ← 新建
│  ├─ layout.html               # ← Task 1.3
│  ├─ login.html                # ← Task 2.2
│  ├─ consent.html              # ← Task 3.2
│  ├─ error.html                # ← Task 2.4
│  └─ success.html              # ← Task 2.4
├─ static/                       # ← 新建
│  ├─ styles/
│  │  └─ tailwind.css           # ← Task 1.4
│  └─ assets/
│     └─ favicon.ico            # ← Task 1.5 (可选)
├─ src/
│  ├─ main.rs
│  ├─ lib.rs
│  ├─ routes/
│  │  ├─ oauth.rs
│  │  └─ consent.rs             # ← Task 3.3 (新建)
│  ├─ templates.rs              # ← Task 1.3 (新建)
│  └─ ...
└─ Cargo.toml
```

### 创建命令

```bash
# 创建所有目录
mkdir -p apps/oauth-service-rust/templates \
         apps/oauth-service-rust/static/styles \
         apps/oauth-service-rust/static/assets

# 验证
find apps/oauth-service-rust -type d -name "templates" -o -name "static" | sort
```

---

## 任务 1.3: 配置 Askama 和创建基础布局模板 (Day 1-2, 2 小时)

### 1.3.1 创建 Askama 配置文件

**位置**: `apps/oauth-service-rust/src/templates.rs` (新建)

```rust
// 这个文件注册 Askama 模板

use askama::Template;

// 声明所有模板（Askama 编译时检查）
// 这些会自动从 templates/ 目录加载

#[derive(Template)]
#[template(path = "layout.html")]
pub struct LayoutTemplate {
    pub title: String,
    pub content: String,
}

// 后续会在这里添加更多模板声明
// 现在只需要这一个基础声明
```

### 1.3.2 在 `lib.rs` 中声明 templates 模块

**位置**: `apps/oauth-service-rust/src/lib.rs`

在文件开头添加：

```rust
pub mod templates;
```

### 1.3.3 创建基础布局模板

**位置**: `apps/oauth-service-rust/templates/layout.html` (新建)

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{% block title %}OAuth 授权系统{% endblock %}</title>

    <!-- Tailwind CSS (CDN 方式，开发时使用) -->
    <script src="https://cdn.tailwindcss.com"></script>

    <!-- HTMX (用于动态交互) -->
    <script src="https://unpkg.com/htmx.org@1.9.10"></script>

    <!-- 自定义样式 (后续会添加) -->
    <link rel="stylesheet" href="/static/styles/tailwind.css">

    <style>
        /* 基础样式 */
        :root {
            --color-primary: #3B82F6;      /* 蓝色 */
            --color-secondary: #EF4444;    /* 红色 */
            --color-accent: #8B5CF6;       /* 紫色 */
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        }

        /* 深色模式支持 */
        @media (prefers-color-scheme: dark) {
            :root {
                color-scheme: dark;
            }
        }
    </style>

    {% block extra_head %}{% endblock %}
</head>
<body class="bg-white dark:bg-slate-900 text-gray-900 dark:text-white">

    <!-- 导航栏 (可选，现在为空) -->
    <nav class="bg-white dark:bg-slate-800 shadow">
        <div class="container mx-auto px-4 py-4">
            <!-- 品牌 -->
            <div class="flex items-center justify-between">
                <h1 class="text-xl font-bold text-blue-600">OAuth 授权系统</h1>
            </div>
        </div>
    </nav>

    <!-- 主内容区 -->
    <main class="container mx-auto px-4 py-8">
        {% block content %}{% endblock %}
    </main>

    <!-- 页脚 -->
    <footer class="mt-12 py-6 border-t border-gray-200 dark:border-gray-700 text-center text-gray-600 dark:text-gray-400">
        <p>&copy; 2025 OAuth 授权系统. All rights reserved.</p>
    </footer>

    <!-- 脚本 -->
    {% block extra_script %}{% endblock %}
</body>
</html>
```

### 验证

```bash
cd apps/oauth-service-rust
cargo check
# 应该看到: warning: unused variable 或类似
# 如果看到编译错误，检查模板文件是否保存正确
```

---

## 任务 1.4: 配置 Tailwind CSS (Day 2, 1 小时)

### 1.4.1 创建 Tailwind 配置文件

**位置**: `apps/oauth-service-rust/tailwind.config.js` (新建)

```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./templates/**/*.html",
    "./src/**/*.rs",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#EFF6FF',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1D4ED8',
        },
        secondary: {
          50: '#FEF2F2',
          500: '#EF4444',
          600: '#DC2626',
          700: '#B91C1C',
        },
        accent: {
          50: '#FAF5FF',
          500: '#8B5CF6',
          600: '#7C3AED',
          700: '#6D28D9',
        },
      },
    },
  },
  plugins: [
    // 可选：添加更多 Tailwind 插件
    // require('@tailwindcss/forms'),
    // require('@tailwindcss/typography'),
  ],
};
```

### 1.4.2 创建 Tailwind 输入 CSS

**位置**: `apps/oauth-service-rust/static/styles/tailwind.css` (新建)

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* 自定义组件 (可选) */
@layer components {
  .btn-primary {
    @apply px-4 py-2 rounded-lg font-medium
           bg-blue-600 text-white
           hover:bg-blue-700 active:bg-blue-800
           transition-colors duration-200
           disabled:opacity-50 disabled:cursor-not-allowed;
  }

  .btn-secondary {
    @apply px-4 py-2 rounded-lg font-medium
           bg-gray-200 text-gray-900
           hover:bg-gray-300 active:bg-gray-400
           transition-colors duration-200;
  }

  .input-field {
    @apply w-full px-4 py-2 rounded-lg
           border border-gray-300
           focus:border-blue-500 focus:ring-2 focus:ring-blue-200
           transition-colors duration-200;
  }

  .card {
    @apply bg-white rounded-lg shadow-md
           border border-gray-200
           p-6 space-y-4;
  }
}

/* 深色模式支持 */
@media (prefers-color-scheme: dark) {
  .card {
    @apply bg-slate-800 border-slate-700;
  }

  .input-field {
    @apply bg-slate-700 border-slate-600 text-white;
  }
}
```

### 1.4.3 配置 build.rs (用于编译时生成 CSS)

**位置**: `apps/oauth-service-rust/build.rs` (新建)

```rust
// 这个脚本在编译时执行，用于生成 CSS

use std::process::Command;

fn main() {
    // 检查 tailwindcss 是否安装
    // (在开发环境中手动运行 tailwind)

    // 告诉 cargo 监听这些文件的变化
    println!("cargo:watch-file=build.rs");
    println!("cargo:watch-file=tailwind.config.js");
    println!("cargo:watch-file=static/styles/tailwind.css");

    // 可选：自动运行 tailwind 编译
    // 但需要先全局安装: npm install -g tailwindcss
    // 这里简化处理，让开发者手动运行
}
```

### 1.4.4 Tailwind CSS 编译指令

在开发时，你需要运行这条命令来编译 CSS：

```bash
# 安装 tailwindcss (全局或本地)
npm install -g tailwindcss

# 在项目根目录或 oauth-service-rust 目录运行：
cd apps/oauth-service-rust
tailwindcss -i static/styles/tailwind.css -o static/styles/main.css --watch

# 输出:
# Rebuilding...
# Done in 123ms.
```

**注意**: 保持这个命令运行（开发时），每当 HTML 或 CSS 改变时，它会自动重新生成 `main.css`。

### 验证

```bash
# 检查是否生成了 CSS 文件
ls -la apps/oauth-service-rust/static/styles/

# 应该看到:
# -rw-r--r-- ... tailwind.css
# -rw-r--r-- ... main.css (如果运行过编译命令)
```

---

## 任务 1.5: 配置 Rust 代码以提供静态文件 (Day 2, 1.5 小时)

### 1.5.1 更新 main.rs 以支持静态文件服务

**位置**: `apps/oauth-service-rust/src/main.rs`

查找现有的 router 配置，在路由中添加静态文件服务：

```rust
// 在 main.rs 的顶部，添加 import
use std::path::Path;
use tower_http::services::ServeDir;
use tower_http::trace::TraceLayer;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // 现有的初始化代码...

    // 创建路由
    let app = Router::new()
        // 现有的 API 路由
        .route("/api/v2/oauth/authorize", get(oauth_authorize))
        .route("/api/v2/auth/login", post(login_endpoint))
        // ... 其他路由

        // ===== 新增：静态文件服务 =====
        .nest_service("/static", ServeDir::new("static"))

        // ===== 新增：健康检查端点 =====
        .route("/health", get(health_check))

        // ===== 中间件 =====
        .layer(TraceLayer::new_for_http())
        .with_state(app_state);

    // 启动服务器
    let listener = tokio::net::TcpListener::bind("127.0.0.1:3001")
        .await?;

    println!("🚀 OAuth Service started at http://127.0.0.1:3001");

    axum::serve(listener, app).await?;

    Ok(())
}

// ===== 新增：健康检查处理器 =====
async fn health_check() -> &'static str {
    "OK"
}
```

### 1.5.2 更新 Cargo.toml 以添加 tower_http

**位置**: `apps/oauth-service-rust/Cargo.toml`

```toml
[dependencies]
# ... 其他依赖 ...

# 用于提供静态文件
tower = "0.4"
tower-http = { version = "0.5", features = ["trace", "fs"] }
```

### 验证

```bash
cd apps/oauth-service-rust
cargo build
# 应该成功编译

# 启动服务器
cargo run

# 在另一个终端测试
curl http://localhost:3001/health
# 应该返回: OK
```

---

## 任务 1.6: 配置 Askama 模板路由 (Day 2, 1.5 小时)

### 1.6.1 创建模板路由处理器

**位置**: `apps/oauth-service-rust/src/routes/templates.rs` (新建)

```rust
use askama_axum::Template;
use axum::response::Html;

// 登录页面模板 (待实现)
#[derive(Template)]
#[template(path = "login.html")]
pub struct LoginTemplate {
    pub company_name: String,
    pub redirect_url: String,
    pub error_message: Option<String>,
}

// 权限同意页面模板 (待实现)
#[derive(Template)]
#[template(path = "consent.html")]
pub struct ConsentTemplate {
    pub company_name: String,
    pub client_name: String,
    pub user_email: String,
}

// 错误页面模板
#[derive(Template)]
#[template(path = "error.html")]
pub struct ErrorTemplate {
    pub error_code: String,
    pub error_message: String,
}

// 显示登录页面的处理器
pub async fn show_login_page() -> Result<LoginTemplate, String> {
    Ok(LoginTemplate {
        company_name: "OAuth 授权系统".to_string(),
        redirect_url: "/api/v2/oauth/authorize".to_string(),
        error_message: None,
    })
}

// 显示权限同意页面的处理器
pub async fn show_consent_page() -> Result<ConsentTemplate, String> {
    Ok(ConsentTemplate {
        company_name: "OAuth 授权系统".to_string(),
        client_name: "示例应用".to_string(),
        user_email: "user@example.com".to_string(),
    })
}

// 显示错误页面的处理器
pub async fn show_error_page(
    error_code: String,
    error_message: String,
) -> Result<ErrorTemplate, String> {
    Ok(ErrorTemplate {
        error_code,
        error_message,
    })
}
```

### 1.6.2 在 main.rs 中注册这些路由

```rust
// 在 main.rs 顶部添加
mod routes;
use routes::templates;

// 在 Router::new() 中添加
let app = Router::new()
    // ===== 新增：模板路由 =====
    .route("/login", get(templates::show_login_page))
    .route("/oauth/consent", get(templates::show_consent_page))

    // ===== 现有的 API 路由 =====
    .route("/api/v2/oauth/authorize", get(oauth_authorize))
    .route("/api/v2/auth/login", post(login_endpoint))

    // ... 其他路由
```

### 验证

```bash
cd apps/oauth-service-rust
cargo build
# 应该成功编译

cargo run

# 在另一个终端测试
curl http://localhost:3001/login
# 应该返回 HTML 内容（虽然此时是空的）
```

---

## 任务 1.7: 创建完整的模板占位符文件 (Day 2, 30 分钟)

现在创建所有模板文件（暂时为空占位符，之后会填充）。

### 1.7.1 创建 login.html

**位置**: `apps/oauth-service-rust/templates/login.html`

```html
{% extends "layout.html" %}

{% block title %}登录 - OAuth 授权系统{% endblock %}

{% block content %}
<div class="flex items-center justify-center min-h-[600px]">
    <div class="w-full max-w-md">
        <h1 class="text-3xl font-bold mb-8">{{ company_name }}</h1>

        {% if let Some(error) = error_message %}
        <div class="mb-4 p-4 rounded-lg bg-red-50 border border-red-200">
            <p class="text-red-700">{{ error }}</p>
        </div>
        {% endif %}

        <p class="text-gray-600 mb-4">登录表单将在这里显示</p>
        <p class="text-sm text-gray-500">Redirect URL: {{ redirect_url }}</p>
    </div>
</div>
{% endblock %}
```

### 1.7.2 创建 consent.html

**位置**: `apps/oauth-service-rust/templates/consent.html`

```html
{% extends "layout.html" %}

{% block title %}权限授权 - OAuth 授权系统{% endblock %}

{% block content %}
<div class="flex items-center justify-center min-h-[600px]">
    <div class="w-full max-w-lg">
        <h1 class="text-3xl font-bold mb-8">权限授权请求</h1>

        <div class="card">
            <p class="text-lg font-semibold">{{ client_name }}</p>
            <p class="text-gray-600">申请访问你的信息</p>

            <p class="mt-4 text-sm text-gray-600">当前用户: <strong>{{ user_email }}</strong></p>

            <p class="mt-4 text-sm text-gray-500">权限同意表单将在这里显示</p>
        </div>
    </div>
</div>
{% endblock %}
```

### 1.7.3 创建 error.html

**位置**: `apps/oauth-service-rust/templates/error.html`

```html
{% extends "layout.html" %}

{% block title %}错误 - OAuth 授权系统{% endblock %}

{% block content %}
<div class="flex items-center justify-center min-h-[600px]">
    <div class="w-full max-w-md card">
        <h1 class="text-2xl font-bold text-red-600 mb-4">{{ error_code }}</h1>
        <p class="text-gray-700">{{ error_message }}</p>
        <a href="/login" class="mt-4 inline-block text-blue-600 hover:underline">
            返回登录
        </a>
    </div>
</div>
{% endblock %}
```

### 验证

```bash
cargo build
cargo run

# 测试各个页面
curl http://localhost:3001/login | head -20
curl http://localhost:3001/oauth/consent | head -20
```

---

## 任务 1.8: 配置模板热重载 (可选, Day 2-3, 30 分钟)

为了在开发时改进体验，可以配置热重载（改变文件时自动刷新）。

### 开发时的最佳实践

```bash
# 终端 1: 运行 Rust 服务器
cd apps/oauth-service-rust
cargo watch -q -c -w src -x run

# 终端 2: 编译 Tailwind CSS
cd apps/oauth-service-rust
tailwindcss -i static/styles/tailwind.css -o static/styles/main.css --watch

# 终端 3: 在浏览器中打开
open http://localhost:3001/login
```

当你改变任何 `.rs` 或 `.html` 文件时，服务器会自动重启。

---

## Phase 1 验收检查清单

完成以上所有任务后，验证：

```bash
# ✅ 检查 1: Cargo 编译
cd apps/oauth-service-rust
cargo build --release
# 应该看到: Finished `release` profile...

# ✅ 检查 2: 单元测试
cargo test
# 应该看到: test result: ok. ...

# ✅ 检查 3: 启动服务
cargo run &
sleep 2

# ✅ 检查 4: 测试端点
curl -s http://localhost:3001/health
# 应该返回: OK

# ✅ 检查 5: 测试登录页面
curl -s http://localhost:3001/login | grep -o "<html"
# 应该返回: <html

# ✅ 检查 6: 测试权限同意页面
curl -s http://localhost:3001/oauth/consent | grep -o "<html"
# 应该返回: <html

# ✅ 检查 7: 验证静态文件
curl -s http://localhost:3001/static/styles/tailwind.css | head -5
# 应该返回 CSS 内容

# ✅ 检查 8: 杀死服务
pkill -f "target/debug/oauth"
```

---

## 预期结果

Phase 1 完成后，你应该有：

```
✅ 完整的 Rust 项目结构
✅ Askama 模板引擎集成
✅ Tailwind CSS 样式系统
✅ 基础布局模板
✅ 登录、同意、错误页面的占位符
✅ 静态文件服务配置
✅ 健康检查端点
✅ 无编译错误

可以开始 Phase 2 (登录页面完整实现)
```

---

## 常见问题和解决方案

### Q1: `cargo build` 出错：找不到模板文件

**解决**: 确保 templates 目录在 `apps/oauth-service-rust/templates/` 中，文件名与 `#[template(path = "...")]` 完全一致。

### Q2: Tailwind CSS 没有生效

**解决**:
1. 确保运行了 `tailwindcss` 命令
2. 检查 `tailwind.config.js` 中的 `content` 路径是否正确
3. 在 HTML 中引入 CSS: `<link rel="stylesheet" href="/static/styles/main.css">`

### Q3: `tower_http` 编译错误

**解决**: 确保在 `Cargo.toml` 中添加了正确的依赖版本。

### Q4: 访问 `localhost:3001` 显示 404

**解决**:
1. 确保服务器正在运行 (`cargo run`)
2. 检查路由是否正确注册在 `main.rs` 中
3. 检查端口号是否为 3001

---

## 下一步

Phase 1 完成后，立即开始 **Phase 2: 登录页面实现**

在 Phase 2 中，你将：
1. 完整实现 login.html 模板 (带表单)
2. 实现 show_login_page 处理器 (带参数验证)
3. 修改 login_endpoint (添加审计日志等)
4. 实现 validate_redirect() 函数
5. 添加 E2E 测试验证

---

**时间分配总结**:
- Task 1.1: 30 分钟
- Task 1.2: 15 分钟
- Task 1.3: 2 小时
- Task 1.4: 1 小时
- Task 1.5: 1.5 小时
- Task 1.6: 1.5 小时
- Task 1.7: 30 分钟
- Task 1.8: 30 分钟 (可选)

**总计**: 7-8 小时 (分散在 2-3 天内)

---

祝你编码愉快! 🚀

