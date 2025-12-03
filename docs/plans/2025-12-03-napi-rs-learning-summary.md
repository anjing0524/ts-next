# napi-rs 学习总结文档 (napi-rs Learning Summary)

**学习日期 (Date):** 2025-12-03
**参考资源 (References):**
- 官方文档: https://napi.rs
- GitHub 仓库: https://github.com/napi-rs/napi-rs
- 官方模板: https://github.com/napi-rs/package-template

---

## 一、napi-rs 项目概述 (Project Overview)

### 1.1 核心价值 (Core Value)

napi-rs 是一个使用 Rust 构建 Node.js 原生扩展的框架 (framework for building compiled Node.js add-ons in Rust via Node-API)，主要特点：

- **零配置构建 (Zero-Config Build):** 运行 `napi build` 即可，无需手动配置文件复制或绑定设置
- **消除 node-gyp 依赖 (No node-gyp):** 仅使用 Rust 和 JavaScript 工具链构建
- **跨平台支持广泛 (Broad Platform Support):** 支持 Node.js 10-22，覆盖 macOS, Windows, Linux (gnu/musl), FreeBSD, Android
- **WebAssembly 集成 (WebAssembly Integration):** 无缝支持 WASM，支持 wasm32-wasip1-threads 目标

### 1.2 架构优势 (Architecture Advantages)

```
JavaScript/TypeScript Code
        ↓
N-API 绑定层 (N-API Binding Layer)
        ↓
Rust Native Module
        ↓
系统资源/外部服务 (System Resources/External Services)
```

**关键优势 (Key Benefits):**
- 类型安全 (Type Safety): Rust 类型自动映射到 TypeScript 类型
- 性能 (Performance): 原生性能，无序列化开销
- 内存安全 (Memory Safety): Rust 保证内存安全
- 并发 (Concurrency): 支持 Tokio 异步运行时

---

## 二、标准项目结构 (Standard Project Structure)

### 2.1 官方模板目录结构

```
napi-project/
├── .cargo/                   # Cargo 配置 (Cargo configuration)
├── .github/                  # CI/CD workflows (GitHub Actions)
│   └── workflows/
│       ├── CI.yml            # 持续集成 (continuous integration)
│       └── publish.yml       # 自动发布 (auto publishing)
├── .husky/                   # Git hooks (代码质量检查)
├── src/                      # Rust 源代码 (Rust source code)
│   └── lib.rs                # 主入口文件 (main entry)
├── __test__/                 # JavaScript 测试 (JS tests)
│   └── index.spec.ts         # 测试用例 (test cases)
├── benchmark/                # 性能基准测试 (performance benchmarks)
├── Cargo.toml                # Rust 依赖配置 (Rust dependency manifest)
├── package.json              # Node.js 依赖配置 (Node.js package config)
├── build.rs                  # 构建脚本 (build script)
├── index.js                  # JavaScript 入口 (JS entry point)
├── index.d.ts                # TypeScript 类型定义 (TS type definitions)
└── tsconfig.json             # TypeScript 配置 (TS configuration)
```

### 2.2 关键文件说明 (Key File Descriptions)

#### **src/lib.rs** - Rust 库入口

```rust
// 最小示例 (Minimal Example)
use napi::bindgen_prelude::*;
use napi_derive::napi;

#[napi]
pub fn fibonacci(n: u32) -> u32 {
  match n {
    1 | 2 => 1,
    _ => fibonacci(n - 1) + fibonacci(n - 2),
  }
}
```

#### **build.rs** - 构建脚本

```rust
// 标准构建脚本 (Standard Build Script)
fn main() {
    // 可选：配置检查 (Optional: config check)
    println!("cargo::rustc-check-cfg=cfg(tokio_unstable)");

    // NAPI 构建设置 (NAPI build setup)
    use napi_build::setup;
    setup();
}
```

**作用 (Purpose):**
- 调用 `napi_build::setup()` 设置编译环境
- 配置 Rust 编译器标志 (compiler flags)
- 生成必要的绑定代码 (binding code generation)

#### **index.js** - JavaScript 加载器

```javascript
// 自动生成的平台检测加载器 (Auto-generated platform loader)
// 根据运行时平台加载对应的 .node 文件
// Loads the correct .node file based on runtime platform

const { existsSync, readFileSync } = require('fs')
const { join } = require('path')

const { platform, arch } = process

// 加载逻辑 (Loading logic)
let nativeBinding = null
// ... 平台检测代码 (platform detection code)
```

---

## 三、Cargo.toml 配置详解 (Cargo.toml Configuration)

### 3.1 完整配置示例 (Complete Configuration Example)

```toml
[package]
name = "napi-package-template"    # 项目名称 (project name)
version = "0.1.0"                  # 版本号 (version)
edition = "2021"                   # Rust 版本 (Rust edition)
authors = ["Author Name <email@example.com>"]

# ========== 库配置 (Library Configuration) ==========
[lib]
crate-type = ["cdylib"]            # 必须：C 动态链接库 (Required: C dynamic library)

# ========== 核心依赖 (Core Dependencies) ==========
[dependencies]
napi = "3.0.0"                     # NAPI 核心库 (NAPI core library)
napi-derive = "3.0.0"              # 宏派生 (macro derive)

# 可选功能 (Optional Features)
napi = { version = "3", features = [
    "async",                       # 异步支持 (async support)
    "serde-json",                  # JSON 序列化 (JSON serialization)
    "tokio_rt",                    # Tokio 运行时 (Tokio runtime)
    "error_anyhow",                # Anyhow 错误处理 (Anyhow error handling)
]}

# ========== 构建依赖 (Build Dependencies) ==========
[build-dependencies]
napi-build = "2"                   # 必须：构建工具 (Required: build tools)

# ========== 发布优化 (Release Optimization) ==========
[profile.release]
lto = true                         # 链接时优化 (Link-Time Optimization)
strip = "symbols"                  # 去除调试符号 (Strip debug symbols)
```

### 3.2 重要配置说明 (Important Configuration Notes)

#### **crate-type = ["cdylib"]** - 必须配置

- **作用 (Purpose):** 生成 C-compatible 动态链接库
- **必须性 (Mandatory):** 缺少此配置会导致 `.node` 文件无法生成
- **常见错误 (Common Mistake):** 使用 `"lib"` 或 `"rlib"` 会导致编译失败

#### **napi features 特性标志 (Feature Flags)**

| Feature | 说明 (Description) | 用途 (Use Case) |
|---------|-------------------|---------------|
| `async` | 异步函数支持 | 支持 `async fn` 和 Promise |
| `serde-json` | JSON 序列化 | 自动 JSON ↔ Rust 类型转换 |
| `tokio_rt` | Tokio 运行时 | 异步任务执行 |
| `error_anyhow` | Anyhow 错误 | 简化错误处理 |
| `napi8` | NAPI 8 特性 | 使用最新 N-API 功能 |

#### **[profile.release]** - 发布优化

```toml
[profile.release]
lto = true                # 减少 20-30% 文件大小 (Reduces file size by 20-30%)
strip = "symbols"         # 去除调试符号 (Removes debug symbols)
opt-level = 3             # 最高优化级别 (Max optimization level)
codegen-units = 1         # 更好的优化，但编译更慢 (Better optimization, slower build)
```

---

## 四、package.json 配置详解 (package.json Configuration)

### 4.1 完整配置示例 (Complete Configuration Example)

```json
{
  "name": "@napi-rs/package-template",
  "version": "1.0.0",
  "description": "Template project for writing node package with napi-rs",
  "main": "index.js",                     // CommonJS 入口 (CJS entry)
  "types": "index.d.ts",                  // TypeScript 类型 (TS types)

  // ========== NAPI 配置 (NAPI Configuration) ==========
  "napi": {
    "binaryName": "package-template",     // 二进制文件名 (binary filename)
    "targets": [                          // 构建目标 (build targets)
      "x86_64-apple-darwin",              // macOS Intel
      "aarch64-apple-darwin",             // macOS Apple Silicon
      "x86_64-pc-windows-msvc",           // Windows x64
      "x86_64-unknown-linux-gnu",         // Linux x64 (glibc)
      "aarch64-unknown-linux-gnu",        // Linux ARM64
      "x86_64-unknown-linux-musl",        // Linux x64 (musl)
      "aarch64-unknown-linux-musl"        // Linux ARM64 (musl)
    ]
  },

  // ========== Scripts 配置 (Scripts Configuration) ==========
  "scripts": {
    "build": "napi build --release",      // 发布构建 (release build)
    "build:debug": "napi build",          // 调试构建 (debug build)
    "test": "ava",                        // 测试 (tests)
    "prepublishOnly": "napi prepublish -t npm",  // 发布前检查
    "version": "napi version"             // 版本管理 (version management)
  },

  // ========== 开发依赖 (Dev Dependencies) ==========
  "devDependencies": {
    "@napi-rs/cli": "^3.2.0",             // NAPI CLI 工具 (CLI tools)
    "typescript": "^5.0.0",               // TypeScript 支持
    "ava": "^6.4.1",                      // 测试框架 (test framework)
    "prettier": "^3.0.0"                  // 代码格式化 (code formatting)
  },

  // ========== 发布配置 (Publishing Configuration) ==========
  "repository": {
    "type": "git",
    "url": "https://github.com/your-org/your-repo.git"
  },
  "license": "MIT",
  "engines": {
    "node": ">= 10"                       // Node.js 版本要求
  }
}
```

### 4.2 NAPI 配置项详解 (NAPI Configuration Details)

#### **binaryName** - 二进制文件名称

```json
"napi": {
  "binaryName": "my-addon"
}
```

**规则 (Rules):**
- Package `my-addon` → 生成 `my_addon.node`
- Package `my-addon-core` → 生成 `my_addon_core.node`
- 下划线会自动替换连字符 (hyphens auto-convert to underscores)

#### **targets** - 跨平台构建目标

**常用目标 (Common Targets):**

| Target | 平台 (Platform) | 架构 (Arch) | 说明 (Note) |
|--------|----------------|-------------|------------|
| `x86_64-apple-darwin` | macOS | Intel x64 | macOS 10.7+ |
| `aarch64-apple-darwin` | macOS | Apple Silicon | macOS 11+ |
| `x86_64-pc-windows-msvc` | Windows | x64 | Windows 7+ |
| `x86_64-unknown-linux-gnu` | Linux | x64 | glibc 2.17+ |
| `x86_64-unknown-linux-musl` | Linux | x64 | Alpine Linux |
| `aarch64-unknown-linux-gnu` | Linux | ARM64 | Raspberry Pi 3+ |
| `wasm32-wasip1-threads` | WebAssembly | - | 浏览器/Node.js |

### 4.3 npm scripts 详解 (npm Scripts Details)

#### **构建命令 (Build Commands)**

```json
"scripts": {
  "build": "napi build --release",           // 发布构建 (release)
  "build:debug": "napi build",               // 调试构建 (debug)
  "build:watch": "napi build --watch",       // 监听模式 (watch mode)
  "build:cross": "napi build --cross-compile" // 交叉编译 (cross-compile)
}
```

**常用参数 (Common Parameters):**

| 参数 (Parameter) | 说明 (Description) | 示例 (Example) |
|-----------------|-------------------|---------------|
| `--release, -r` | 发布模式构建 (release build) | `napi build -r` |
| `--target, -t` | 指定目标平台 (target platform) | `-t x86_64-apple-darwin` |
| `--platform` | 添加平台后缀 (add platform suffix) | 生成 `addon.darwin-x64.node` |
| `--strip, -s` | 去除符号表 (strip symbols) | 减小文件大小 |
| `--watch, -w` | 监听文件变化 (watch file changes) | 开发模式 |
| `--features, -F` | 启用 Cargo features | `-F async,serde-json` |
| `--dts` | 生成 TypeScript 定义 | 自动生成 `.d.ts` |

#### **发布命令 (Publishing Commands)**

```json
"scripts": {
  "prepublishOnly": "napi prepublish -t npm",  // 发布前准备
  "version": "napi version"                    // 版本同步
}
```

**作用 (Purpose):**
- `napi prepublish`: 验证构建产物，准备发布
- `napi version`: 同步 `package.json` 和 `Cargo.toml` 版本号

---

## 五、napi build 命令详解 (napi build Command Details)

### 5.1 构建工作流程 (Build Workflow)

```
1. 读取 Cargo.toml 和 package.json
   ↓
2. 运行 build.rs (调用 napi_build::setup())
   ↓
3. 编译 Rust 代码为 cdylib
   ↓
4. 生成 .node 文件 (e.g., addon.node)
   ↓
5. (可选) 生成 TypeScript 类型定义 (.d.ts)
   ↓
6. 输出到指定目录 (默认当前目录)
```

### 5.2 常用构建模式 (Common Build Modes)

#### **本地开发模式 (Local Development Mode)**

```bash
# 调试构建 (Debug Build)
napi build
# 输出: addon.node (包含调试符号)

# 发布构建 (Release Build)
napi build --release
# 输出: addon.node (优化后，无调试符号)

# 监听模式 (Watch Mode)
napi build --watch
# 文件变化时自动重新构建
```

#### **跨平台构建模式 (Cross-Platform Build Mode)**

```bash
# 指定目标平台 (Specify Target Platform)
napi build --target x86_64-apple-darwin

# 交叉编译 (Cross Compile)
napi build --cross-compile --target aarch64-unknown-linux-gnu

# 构建多个目标 (Build Multiple Targets)
for target in x86_64-apple-darwin aarch64-apple-darwin; do
  napi build --release --target $target
done
```

#### **生成 TypeScript 定义 (Generate TypeScript Definitions)**

```bash
# 自动生成 .d.ts (Auto-generate .d.ts)
napi build --dts index.d.ts

# 带缓存的生成 (With Cache)
napi build --dts index.d.ts --dts-cache
```

### 5.3 构建输出配置 (Build Output Configuration)

```bash
# 自定义输出目录 (Custom Output Directory)
napi build --output-dir ./dist

# 添加平台标识 (Add Platform Identifier)
napi build --platform
# 输出: addon.darwin-x64.node, addon.linux-x64-gnu.node

# 去除符号表 (Strip Symbols)
napi build --release --strip
# 减少 20-30% 文件大小
```

---

## 六、跨平台构建配置 (Cross-Platform Build Configuration)

### 6.1 GitHub Actions CI/CD 配置

```yaml
# .github/workflows/CI.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  build:
    strategy:
      fail-fast: false
      matrix:
        settings:
          - host: macos-latest
            target: x86_64-apple-darwin
            build: |
              napi build --release --target x86_64-apple-darwin
          - host: macos-latest
            target: aarch64-apple-darwin
            build: |
              napi build --release --target aarch64-apple-darwin
          - host: ubuntu-latest
            target: x86_64-unknown-linux-gnu
            build: |
              napi build --release --target x86_64-unknown-linux-gnu
          - host: windows-latest
            target: x86_64-pc-windows-msvc
            build: |
              napi build --release --target x86_64-pc-windows-msvc

    runs-on: ${{ matrix.settings.host }}

    steps:
      - uses: actions/checkout@v4

      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ matrix.settings.target }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install dependencies
        run: npm install

      - name: Build
        run: ${{ matrix.settings.build }}

      - name: Upload artifacts
        uses: actions/upload-artifact@v3
        with:
          name: bindings-${{ matrix.settings.target }}
          path: "*.node"
```

### 6.2 本地交叉编译 (Local Cross-Compilation)

#### **使用 cargo-zigbuild (推荐)**

```bash
# 安装 cargo-zigbuild (Install cargo-zigbuild)
cargo install cargo-zigbuild

# 交叉编译到 Linux (Cross-compile to Linux)
napi build --release --target x86_64-unknown-linux-gnu --cross-compile

# 交叉编译到 macOS ARM64 (Cross-compile to macOS ARM64)
napi build --release --target aarch64-apple-darwin --cross-compile
```

#### **使用 Docker (备选)**

```bash
# 使用官方 Docker 镜像 (Use official Docker image)
docker run --rm -v $(pwd):/build -w /build \
  ghcr.io/napi-rs/napi-rs/nodejs-rust:lts-debian \
  sh -c "npm install && napi build --release"
```

---

## 七、常见配置错误和解决方案 (Common Configuration Errors)

### 7.1 错误 1：Missing build.rs

**错误信息 (Error Message):**
```
error: failed to run custom build command for `my-addon`
```

**原因 (Cause):** 缺少 `build.rs` 文件或未调用 `napi_build::setup()`

**解决方案 (Solution):**
```rust
// build.rs
fn main() {
    napi_build::setup();
}
```

**验证 (Verification):**
```bash
cargo build
# 应该能看到 "Running napi build setup"
```

### 7.2 错误 2：crate-type 配置错误

**错误信息 (Error Message):**
```
cannot find function `napi_register_module_v1` in this scope
```

**原因 (Cause):** `Cargo.toml` 中 `crate-type` 未设置为 `["cdylib"]`

**错误配置 (Wrong Config):**
```toml
[lib]
crate-type = ["lib"]  # ❌ 错误
```

**正确配置 (Correct Config):**
```toml
[lib]
crate-type = ["cdylib"]  # ✅ 正确
```

### 7.3 错误 3：napi CLI 未安装

**错误信息 (Error Message):**
```
sh: napi: command not found
```

**解决方案 (Solution):**
```bash
# 本地安装 (Local install)
npm install -D @napi-rs/cli

# 全局安装 (Global install)
npm install -g @napi-rs/cli

# 使用 npx (Use npx)
npx napi build --release
```

### 7.4 错误 4：TypeScript 定义不匹配

**问题 (Problem):** 手动编写的 `.d.ts` 与 Rust 实现不一致

**解决方案 (Solution):**
```bash
# 使用自动生成 (Use auto-generation)
napi build --dts index.d.ts

# 验证类型 (Verify types)
tsc --noEmit
```

**最佳实践 (Best Practice):**
- 使用 `#[napi]` 宏自动生成类型定义
- 不要手动维护 `.d.ts` 文件

### 7.5 错误 5：符号链接 Cargo.toml 导致构建失败

**问题 (Problem):** 在子目录使用符号链接指向父目录的 `Cargo.toml`

**错误配置 (Wrong Config):**
```bash
# apps/oauth-service-rust/npm/Cargo.toml -> ../Cargo.toml
ln -s ../Cargo.toml npm/Cargo.toml  # ❌ 可能导致问题
```

**原因 (Cause):**
- `napi build` 期望 `Cargo.toml` 在当前目录或 `--manifest-path` 指定的位置
- 符号链接可能导致依赖解析路径错误
- Cargo workspace 结构可能与 napi 期望不一致

**解决方案 (Solution):**

**方案 1: 创建独立的 Cargo.toml (推荐)**
```toml
# apps/oauth-service-rust/npm/Cargo.toml
[package]
name = "oauth-service-napi"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]
path = "../src/lib.rs"  # 指向父目录的源代码

[dependencies]
napi = { version = "2.16", features = ["async", "serde-json"] }
napi-derive = "2.16"

# 引用父 crate 的依赖（如果需要）
oauth-service-rust = { path = ".." }

[build-dependencies]
napi-build = "2.1"
```

**方案 2: 使用 --manifest-path 参数**
```bash
cd apps/oauth-service-rust/npm
napi build --manifest-path ../Cargo.toml --release
```

**方案 3: 在父目录构建并复制产物**
```bash
cd apps/oauth-service-rust
cargo build --release
cp target/release/liboauth_service_rust.node npm/oauth_service_napi.node
```

**验证 (Verification):**
```bash
cd apps/oauth-service-rust/npm
napi build --release
# 应该能成功生成 oauth_service_napi.node
```

---

## 八、与 Node.js Native Addon 的正确集成 (Integration with Node.js)

### 8.1 在 Node.js 项目中使用 (Usage in Node.js Projects)

#### **方式 1: 本地依赖 (Local Dependency)**

```json
// package.json
{
  "dependencies": {
    "my-native-addon": "file:../my-addon/npm"
  }
}
```

```javascript
// 使用 (Usage)
const { myFunction } = require('my-native-addon');
console.log(myFunction(42));
```

#### **方式 2: npm 发布 (npm Publishing)**

```bash
# 发布到 npm (Publish to npm)
cd my-addon
npm publish

# 安装 (Install)
npm install @scope/my-addon
```

#### **方式 3: 平台特定包 (Platform-Specific Packages)**

```json
// package.json
{
  "name": "@scope/my-addon",
  "optionalDependencies": {
    "@scope/my-addon-darwin-x64": "1.0.0",
    "@scope/my-addon-darwin-arm64": "1.0.0",
    "@scope/my-addon-linux-x64-gnu": "1.0.0",
    "@scope/my-addon-win32-x64-msvc": "1.0.0"
  }
}
```

**优势 (Advantages):**
- npm 自动选择正确的平台包 (npm auto-selects correct platform package)
- 减少下载体积 (reduces download size)
- 支持预编译二进制 (supports pre-compiled binaries)

### 8.2 Next.js Server Actions 集成 (Next.js Server Actions Integration)

```typescript
// lib/native-sdk.ts
import { createSDK } from 'my-native-addon';

let sdkInstance: ReturnType<typeof createSDK> | null = null;

export function getSDK() {
  if (typeof window !== 'undefined') {
    throw new Error('SDK can only be used on server side');
  }

  if (!sdkInstance) {
    sdkInstance = createSDK({
      config: process.env.CONFIG_VALUE,
    });
  }

  return sdkInstance;
}
```

```typescript
// app/actions/data.ts
'use server';

import { getSDK } from '@/lib/native-sdk';

export async function fetchData() {
  const sdk = getSDK();
  return await sdk.getData();
}
```

---

## 九、最佳实践总结 (Best Practices Summary)

### 9.1 项目设置 (Project Setup)

✅ **DO:**
- 使用 `napi new` 创建项目或克隆官方模板
- 确保 `Cargo.toml` 中 `crate-type = ["cdylib"]`
- 添加 `build.rs` 并调用 `napi_build::setup()`
- 在 `package.json` 中配置 `napi.targets` 列出所有目标平台
- 使用 `napi build --dts` 自动生成 TypeScript 定义

❌ **DON'T:**
- 手动编写 `.d.ts` 文件（容易不一致）
- 使用 `crate-type = ["lib"]` 或 `["rlib"]`
- 忘记添加 `napi-build` 到 `[build-dependencies]`
- 在 npm 目录使用符号链接的 `Cargo.toml`（可能导致路径问题）

### 9.2 开发流程 (Development Workflow)

✅ **DO:**
- 开发时使用 `napi build --watch` 监听文件变化
- 使用 `cargo test` 测试 Rust 逻辑
- 使用 JavaScript 测试框架（Jest/AVA）测试 JS 绑定
- 在 CI/CD 中构建所有目标平台
- 使用 `lto = true` 和 `strip = "symbols"` 优化发布版本

❌ **DON'T:**
- 在 Rust 测试中测试 napi 绑定（需要 Node.js 运行时）
- 忘记在 CI 中测试不同 Node.js 版本
- 直接提交 `.node` 文件到 git（应该在 `.gitignore` 中）

### 9.3 性能优化 (Performance Optimization)

✅ **DO:**
- 使用 `#[napi(js_name = "...")]` 自定义 JavaScript 函数名
- 对频繁调用的函数使用 `#[inline]`
- 使用 `serde-json` feature 自动序列化/反序列化
- 利用 `async` feature 支持异步操作
- 使用 Tokio 运行时处理 I/O 密集任务

❌ **DON'T:**
- 在同步函数中执行阻塞 I/O（会阻塞 Node.js 事件循环）
- 过度使用 `serde_json::Value`（性能开销大）
- 忘记处理 Rust panic（会导致 Node.js 崩溃）

### 9.4 类型安全 (Type Safety)

✅ **DO:**
- 使用 `#[napi(object)]` 定义复杂对象
- 使用 `Result<T, napi::Error>` 处理错误
- 为公共 API 编写完整的 TypeScript 类型定义
- 使用 `#[napi(ts_type = "...")]` 自定义 TypeScript 类型

❌ **DON'T:**
- 使用 `any` 作为返回类型
- 忽略 Rust 的 `Result` 类型（直接 `unwrap()`）
- 在 JavaScript 和 Rust 之间传递裸指针

---

## 十、与当前项目的对比分析 (Comparison with Current Project)

### 10.1 当前项目状态 (Current Project Status)

**项目路径 (Project Path):** `/Users/liushuo/code/ts-next-template/apps/oauth-service-rust`

**当前配置 (Current Configuration):**

#### **Cargo.toml**
```toml
[package]
name = "oauth-service-rust"
version = "0.1.0"
edition = "2021"

[dependencies]
# ... 其他依赖
napi = { version = "2.16", features = ["async", "serde-json"] }
napi-derive = "2.16"
napi-build = "2.1"  # ❌ 应该在 [build-dependencies]

[lib]
crate-type = ["cdylib"]  # ✅ 正确
```

#### **npm/package.json**
```json
{
  "name": "oauth-service-napi",
  "version": "0.1.0",
  "napi": {
    "name": "oauth-service-napi",
    "triples": [
      "x86_64-apple-darwin",
      "aarch64-apple-darwin",
      "x86_64-unknown-linux-gnu",
      "aarch64-unknown-linux-gnu",
      "x86_64-pc-windows-msvc"
    ]
  },
  "scripts": {
    "build": "napi build --release",
    "build:debug": "napi build"
  }
}
```

#### **npm/Cargo.toml**
```bash
# 当前是符号链接 (Currently a symbolic link)
lrwxr-xr-x  1 liushuo  staff  13 Dec  3 14:26 Cargo.toml -> ../Cargo.toml
```

### 10.2 需要修复的问题 (Issues to Fix)

#### **问题 1: napi-build 依赖位置错误**

**当前 (Current):**
```toml
[dependencies]
napi-build = "2.1"  # ❌ 错误位置
```

**应该 (Should be):**
```toml
[build-dependencies]
napi-build = "2.1"  # ✅ 正确位置
```

#### **问题 2: 缺少 build.rs**

**检查结果 (Check Result):**
```bash
# 未找到 build.rs (build.rs not found)
```

**应该创建 (Should create):**
```rust
// apps/oauth-service-rust/build.rs
fn main() {
    napi_build::setup();
}
```

#### **问题 3: npm/Cargo.toml 符号链接问题**

**当前 (Current):**
```bash
npm/Cargo.toml -> ../Cargo.toml  # 符号链接
```

**建议 (Recommendation):**
创建独立的 `npm/Cargo.toml` 用于 napi 构建：

```toml
# apps/oauth-service-rust/npm/Cargo.toml
[package]
name = "oauth-service-napi"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]
path = "../src/lib.rs"

[dependencies]
napi = { version = "2.16", features = ["async", "serde-json"] }
napi-derive = "2.16"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
reqwest = { version = "0.11", features = ["json"] }
tokio = { version = "1", features = ["full"] }

[build-dependencies]
napi-build = "2.1"
```

### 10.3 推荐的修复步骤 (Recommended Fix Steps)

```bash
# Step 1: 创建 build.rs (Create build.rs)
cat > apps/oauth-service-rust/build.rs << 'EOF'
fn main() {
    napi_build::setup();
}
EOF

# Step 2: 修复 Cargo.toml (Fix Cargo.toml)
# 将 napi-build 从 [dependencies] 移到 [build-dependencies]

# Step 3: 创建独立的 npm/Cargo.toml (Create standalone npm/Cargo.toml)
rm apps/oauth-service-rust/npm/Cargo.toml  # 删除符号链接
# 然后创建新的 Cargo.toml（内容见上文）

# Step 4: 验证构建 (Verify build)
cd apps/oauth-service-rust/npm
napi build --release

# Step 5: 验证输出 (Verify output)
ls -la *.node
# 应该看到 oauth_service_napi.node
```

---

## 十一、参考资源 (Reference Resources)

### 11.1 官方文档 (Official Documentation)

- 📚 **官方网站 (Official Website):** https://napi.rs
- 📦 **GitHub 仓库 (GitHub Repository):** https://github.com/napi-rs/napi-rs
- 🎓 **文档 (Documentation):** https://napi.rs/docs
- 🌟 **官方模板 (Official Template):** https://github.com/napi-rs/package-template

### 11.2 示例项目 (Example Projects)

- **napi-rs/examples:** https://github.com/napi-rs/napi-rs/tree/main/examples
  - `examples/napi`: 标准示例 (standard example)
  - `examples/napi-compat-mode`: 兼容模式 (compatibility mode)
  - `examples/napi-shared`: 共享库 (shared library)

### 11.3 社区资源 (Community Resources)

- 💬 **Discord 社区 (Discord Community):** https://discord.gg/SpWzYHsKHs
- 📖 **Rust Book:** https://doc.rust-lang.org/book/
- 🔧 **Node-API 文档 (Node-API Docs):** https://nodejs.org/api/n-api.html

---

## 十二、总结 (Conclusion)

### 12.1 核心要点 (Key Takeaways)

1. **项目结构 (Project Structure):**
   - `Cargo.toml` 必须设置 `crate-type = ["cdylib"]`
   - 必须创建 `build.rs` 并调用 `napi_build::setup()`
   - `package.json` 需要配置 `napi.targets` 和构建脚本

2. **依赖管理 (Dependency Management):**
   - `napi` 和 `napi-derive` 放在 `[dependencies]`
   - `napi-build` 放在 `[build-dependencies]`
   - 使用 features 启用需要的功能（async, serde-json）

3. **构建流程 (Build Process):**
   - 使用 `napi build` 命令构建
   - 自动生成平台特定的 `.node` 文件
   - 可选生成 TypeScript 类型定义

4. **跨平台支持 (Cross-Platform Support):**
   - 配置多个 targets 在 `package.json`
   - 使用 GitHub Actions 自动构建多平台
   - 发布平台特定的 npm 包

5. **常见错误 (Common Mistakes):**
   - 忘记设置 `crate-type = ["cdylib"]`
   - `napi-build` 放在错误的依赖部分
   - 使用符号链接的 `Cargo.toml` 可能导致构建问题
   - 在 Rust 测试中测试 napi 绑定

### 12.2 下一步行动 (Next Steps)

基于学习内容，建议对当前项目进行以下改进：

1. ✅ 创建 `build.rs` 文件
2. ✅ 修复 `Cargo.toml` 中 `napi-build` 的位置
3. ✅ 将 `npm/Cargo.toml` 从符号链接改为独立文件
4. ✅ 验证 `napi build` 命令能成功执行
5. ✅ 添加 GitHub Actions 进行多平台构建
6. ✅ 生成并验证 TypeScript 类型定义

---

**文档版本 (Document Version):** 1.0.0
**最后更新 (Last Updated):** 2025-12-03
**作者 (Author):** Admin Portal Team
