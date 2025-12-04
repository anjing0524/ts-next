# Phase 1 快速启动指南
## OAuth 2.1 Web UI 基础设施准备

**预计时间**: 3-5 天
**难度级别**: ⭐⭐ (中等)
**目标**: 项目基础设施完成，准备开始页面开发

---

## 方式一：自动化脚本（推荐 - 10 分钟）

### 步骤 1: 运行自动化脚本

```bash
cd apps/oauth-service-rust
bash setup-phase1.sh
```

脚本将自动：
- ✅ 创建目录结构 (templates/, static/)
- ✅ 生成 tailwind.config.js
- ✅ 生成 tailwind.css 输入文件
- ✅ 创建基础布局模板 (layout.html)
- ✅ 创建页面占位符 (login.html, consent.html, error.html, success.html)
- ✅ 验证项目结构

### 步骤 2: 手动添加依赖到 Cargo.toml

编辑 `apps/oauth-service-rust/Cargo.toml`，在 `[dependencies]` 中添加：

```toml
[dependencies]
# ... 现有依赖 ...

# ===== Web UI 依赖 =====
askama = "0.12"
askama_axum = "0.4"
html-escape = "0.2"
tower = "0.4"
tower-http = { version = "0.5", features = ["trace", "fs"] }
tracing = "0.1"
tracing-subscriber = "0.3"
```

### 步骤 3: 验证编译

```bash
cd apps/oauth-service-rust
cargo build
# 应该输出: Finished `debug` profile...
```

**完成!** ✅ 基础设施已准备好

---

## 方式二：手动设置（详细 - 1-2 小时）

如果你想了解每一步的细节，参考：
📖 `/docs/PHASE_1_DETAILED_BREAKDOWN_2025-12-01.md`

该文档包含：
- 每个任务的详细说明
- 每个文件的完整代码
- 验证步骤
- 常见问题解决方案

---

## 启动开发服务器

### 准备工作

```bash
# 全局安装 tailwindcss (如果未安装)
npm install -g tailwindcss

# 全局安装 cargo-watch (可选但推荐)
cargo install cargo-watch
```

### 开发工作流

**在 Terminal 1：运行 Rust 服务器**
```bash
cd apps/oauth-service-rust
cargo watch -q -c -w src -x run
# 或者不带 watch:
# cargo run
```

**在 Terminal 2：编译 Tailwind CSS**
```bash
cd apps/oauth-service-rust
tailwindcss -i static/styles/tailwind.css -o static/styles/main.css --watch
```

**在 Terminal 3：打开浏览器**
```bash
# 自动打开或手动访问
open http://localhost:3001/login
```

---

## 验收检查清单

完成后，运行以下命令验证：

```bash
# ✅ 检查 1: 编译
cargo build --release
# 期望: Finished `release` profile...

# ✅ 检查 2: 测试
cargo test
# 期望: test result: ok.

# ✅ 检查 3: 启动服务
cargo run &
sleep 2

# ✅ 检查 4: 健康检查
curl http://localhost:3001/health
# 期望: OK

# ✅ 检查 5: 登录页面
curl -s http://localhost:3001/login | grep "<html"
# 期望: <html

# ✅ 检查 6: 权限同意页面
curl -s http://localhost:3001/oauth/consent | grep "<html"
# 期望: <html

# 停止服务
pkill -f "target/debug/oauth"
```

所有检查都应该返回预期结果。

---

## 项目结构验证

完成后，项目结构应该是：

```
apps/oauth-service-rust/
├── templates/                    # ✅ 新建
│   ├── layout.html              # ✅ 创建
│   ├── login.html               # ✅ 创建
│   ├── consent.html             # ✅ 创建
│   ├── error.html               # ✅ 创建
│   └── success.html             # ✅ 创建
├── static/                       # ✅ 新建
│   ├── styles/
│   │   └── tailwind.css         # ✅ 创建
│   └── assets/
├── src/
│   ├── main.rs                  # 需要修改
│   ├── lib.rs                   # 需要修改
│   ├── routes/
│   │   └── oauth.rs
│   └── templates.rs             # ⚠️ 待创建 (Task 1.6)
├── build.rs                      # ✅ 创建
├── tailwind.config.js           # ✅ 创建
├── Cargo.toml                   # 需要修改
└── setup-phase1.sh              # ✅ 脚本
```

---

## 常见问题

### Q: `cargo build` 出错

**A:** 检查以下几点：
1. 所有依赖是否添加到 Cargo.toml
2. Rust 版本是否 >= 1.70 (`rustc --version`)
3. 网络连接是否正常 (第一次下载包会比较慢)

### Q: 访问 localhost:3001 显示 404

**A:**
1. 服务器是否在运行? 检查 Terminal 1
2. 路由是否注册? 检查 `src/main.rs` 中的 Router 配置
3. 端口号是否正确? 默认是 3001

### Q: Tailwind CSS 样式没有应用

**A:**
1. 是否运行了 `tailwindcss --watch`? (Terminal 2)
2. HTML 中是否引入了 CSS? `<link rel="stylesheet" href="/static/styles/...">`
3. CSS 文件是否生成? 检查 `static/styles/main.css`

### Q: `askama` 模板编译错误

**A:**
1. 模板文件路径是否正确? 应该在 `templates/` 目录
2. 文件名是否与 `#[template(path = "...")]` 一致?
3. HTML 语法是否正确?

---

## 下一步

Phase 1 完成后，立即开始 **Phase 2: 登录页面完整实现**

Phase 2 将包括：
- 完整的登录表单 HTML
- 用户名和密码输入验证
- 提交处理和错误显示
- 样式和响应式设计
- E2E 测试

预计时间: 5-7 天

---

## 开发建议

### 代码组织

保持 Phase 1 的重点在基础设施，不要在这个阶段添加复杂的业务逻辑。

```
Phase 1: ✅ 基础设施 (模板、样式、路由)
Phase 2: 登录页面实现 (表单、验证、处理)
Phase 3: 权限同意页面 (UI、逻辑)
Phase 4: OAuth 流程修复 (后端逻辑)
```

### 性能优化

现阶段不需要优化，但可以在 Phase 6 (集成测试) 时优化。

### 安全考虑

现阶段主要关注 UI 正确性，安全检查将在后续 Phase 中进行。

---

**准备好了? 让我们开始吧!** 🚀

运行: `bash apps/oauth-service-rust/setup-phase1.sh`

