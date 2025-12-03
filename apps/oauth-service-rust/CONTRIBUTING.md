# 贡献指南 (Contributing Guide)

欢迎为 OAuth Service Rust napi SDK 项目贡献代码！本指南将帮助您了解如何为项目做出贡献。

## 📋 行为准则

请保持友好、尊重的交流环境。我们致力于为所有人提供无骚扰的体验，无论年龄、体型、残疾、种族、性别特征、性别认同和表达、经验水平、国籍、个人外貌、种族、宗教或性取向。

## 🚀 开始贡献

### 1. Fork 项目仓库

1. 访问 [项目仓库](https://github.com/your-org/ts-next-template)
2. 点击右上角的 "Fork" 按钮
3. 克隆您的 Fork 到本地：

```bash
git clone https://github.com/YOUR-USERNAME/ts-next-template.git
cd ts-next-template
```

### 2. 配置远程仓库

```bash
# 添加上游仓库
git remote add upstream https://github.com/your-org/ts-next-template.git

# 验证远程仓库配置
git remote -v
```

### 3. 同步最新代码

```bash
# 获取上游最新更改
git fetch upstream

# 合并到本地分支
git checkout main
git merge upstream/main
```

## 🛠️ 开发流程

### 1. 创建特性分支

```bash
# 从最新 main 分支创建
git checkout -b feature/your-feature-name

# 或者修复 bug
git checkout -b fix/issue-number-description
```

**分支命名约定：**
- `feature/` - 新功能
- `fix/` - Bug 修复
- `docs/` - 文档更新
- `refactor/` - 代码重构
- `test/` - 测试相关
- `chore/` - 维护任务

### 2. 开发环境设置

#### Rust 开发环境

```bash
# 安装 Rust (如果未安装)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 安装 napi-rs CLI
npm install -g @napi-rs/cli

# 验证安装
rustc --version
napi --version
```

#### 构建项目

```bash
cd apps/oauth-service-rust

# 开发构建
cargo build

# 生产构建
cargo build --release

# 构建 napi 模块
napi build
```

### 3. 编写代码

#### 代码风格

**Rust 代码：**
- 遵循 Rust 官方风格指南
- 使用 `cargo fmt` 格式化代码
- 使用 `cargo clippy` 进行代码检查

```bash
# 格式化代码
cargo fmt

# 代码检查
cargo clippy -- -D warnings
```

**TypeScript 类型定义：**
- 保持与 Rust 代码同步
- 使用完整的 JSDoc 注释
- 遵循 TypeScript 最佳实践

#### 模块结构

项目采用模块化设计：

```
src/napi/
├── mod.rs         # 主模块，导出所有功能
├── sdk.rs         # OAuthSDK 主类实现
├── auth.rs        # 认证模块
├── token.rs       # 令牌模块
├── user.rs        # 用户模块
├── rbac.rs        # RBAC 模块
├── client.rs      # 客户端模块
└── audit.rs       # 审计模块
```

**添加新功能步骤：**
1. 在对应模块实现功能
2. 在 `sdk.rs` 中添加方法
3. 在 `napi_binding.rs` 中添加 napi 绑定
4. 更新 TypeScript 类型定义 (`npm/index.d.ts`)
5. 添加单元测试

### 4. 编写测试

#### 单元测试

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_auth_login_success() {
        // 测试代码
    }
}
```

#### 集成测试

```rust
#[cfg(test)]
mod integration_tests {
    #[tokio::test]
    async fn test_full_login_flow() {
        // 需要 OAuth Service 运行的集成测试
    }
}
```

运行测试：

```bash
# 运行所有测试
cargo test

# 运行特定模块测试
cargo test --test auth

# 运行集成测试
cargo test --test integration
```

### 5. 提交更改

#### 提交消息规范

使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

```
<类型>[可选范围]: <描述>

[可选正文]

[可选脚注]
```

**类型 (Type):**
- `feat:` - 新功能
- `fix:` - Bug 修复
- `docs:` - 文档更新
- `style:` - 代码格式（不影响功能）
- `refactor:` - 代码重构
- `test:` - 测试相关
- `chore:` - 维护任务

**示例：**

```bash
# 新功能
git commit -m "feat(auth): add OAuth 2.1 device flow support"

# Bug 修复
git commit -m "fix(token): fix token expiration validation"

# 文档更新
git commit -m "docs(readme): update installation instructions"
```

#### 提交工作流

```bash
# 添加更改
git add .

# 提交
git commit -m "feat: your feature description"

# 推送到您的 Fork
git push origin feature/your-feature-name
```

### 6. 创建 Pull Request

1. 访问您的 Fork 仓库
2. 点击 "Compare & pull request"
3. 填写 PR 描述：
   - **标题:** 简洁描述更改
   - **描述:** 详细说明更改内容、动机、测试情况
   - **关联 Issue:** 使用 `Closes #123` 或 `Fixes #456`

#### PR 模板

```markdown
## 变更描述
<!-- 简要描述此 PR 的变更 -->

## 相关问题
<!-- 关联的 Issue，例如：Closes #123 -->

## 变更类型
- [ ] Bug 修复
- [ ] 新功能
- [ ] 代码重构
- [ ] 文档更新
- [ ] 测试相关
- [ ] 其他

## 测试情况
- [ ] 单元测试已通过
- [ ] 集成测试已通过
- [ ] 手动测试已完成

## 检查清单
- [ ] 代码已格式化 (`cargo fmt`)
- [ ] 代码检查已通过 (`cargo clippy`)
- [ ] 所有测试通过 (`cargo test`)
- [ ] 文档已更新
- [ ] TypeScript 类型定义已同步

## 截图 (如适用)
<!-- UI 变更请提供截图 -->
```

## 🧪 测试要求

### 单元测试覆盖率
- 新功能必须包含单元测试
- Bug 修复必须包含回归测试
- 目标覆盖率 > 80%

### 集成测试
- 影响 API 的更改需要集成测试
- 集成测试需要 OAuth Service 运行在 `localhost:3001`

### 性能测试
- 影响性能的更改需要基准测试
- 使用 `cargo bench` 进行性能测试

## 📝 文档要求

### 代码注释
- 公共 API 必须有完整的文档注释
- 复杂算法必须有解释性注释
- 使用 Rust doc comments (`///`)

```rust
/// 用户登录方法
///
/// # 参数
/// - `username`: 用户名
/// - `password`: 密码
///
/// # 返回值
/// 返回 `LoginResponse` 包含会话令牌和用户信息
///
/// # 错误
/// 返回 `SDKError` 如果登录失败
pub async fn auth_login(&self, username: &str, password: &str) -> Result<LoginResponse, SDKError> {
    // 实现
}
```

### 类型定义
- 所有 TypeScript 类型必须有完整注释
- 保持与 Rust 代码同步更新

## 🚨 常见问题

### 构建失败
```bash
# 清理并重新构建
cargo clean
cargo build

# 更新依赖
cargo update

# 检查 Rust 工具链
rustup update stable
```

### napi 构建错误
```bash
# 重新构建 napi 模块
napi build --release

# 检查系统依赖
# macOS: xcode-select --install
# Linux: sudo apt-get install build-essential
```

### 测试失败
```bash
# 运行特定测试查看详细输出
cargo test --test auth -- --nocapture

# 检查 OAuth Service 是否运行
curl http://localhost:3001/health
```

## 🤝 获得帮助

- **问题讨论:** [GitHub Discussions](https://github.com/your-org/ts-next-template/discussions)
- **Bug 报告:** [GitHub Issues](https://github.com/your-org/ts-next-template/issues)
- **即时交流:** [Slack/Discord 频道]

## 📄 许可证

贡献的代码将采用与本项目相同的 MIT 许可证。

---

感谢您对 OAuth Service Rust napi SDK 项目的贡献！🎉

**最后更新:** 2025-12-03
**维护者:** Admin Portal Team