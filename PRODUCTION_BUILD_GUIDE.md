# Admin Portal 生产构建与启动指南

**目的**: 使用生产优化版本运行 Admin Portal，确保 E2E 测试的准确性

## 🔨 Step 1: 构建 Admin Portal

```bash
cd apps/admin-portal

# 构建生产版本
pnpm build

# 预期输出:
# ✓ Compiled successfully
# ✓ Generating static pages
# Route (app)
#   ├ ƒ /admin
#   ├ ƒ /admin/users
#   ...

echo "✅ 构建完成"

# 验证 .next 目录已生成
ls -la .next/
```

## 🚀 Step 2: 重新启动所有服务（生产模式）

### 清理旧进程

```bash
# 如果 dev 服务器仍在运行，停止它 (Ctrl+C)
# 然后启动生产版本

ps aux | grep -E "next|cargo|node" | grep -v grep
# 或杀死特定端口的进程
lsof -ti:3002 | xargs kill -9  # 关闭 3002
```

### 新的服务启动方式

**终端 1: OAuth Service (Rust)**
```bash
cd apps/oauth-service-rust
cargo run

# 预期: ✅ Server running on 0.0.0.0:3001
```

**终端 2: Admin Portal (Next.js 生产)**
```bash
cd apps/admin-portal

# 启动生产服务器
pnpm start

# 预期:
# ▲ Next.js 16.0.0
#
# > next start -p 3002
#
# ▲ Ready on http://localhost:3002
```

**终端 3: Pingora 反向代理**
```bash
cd apps/pingora-proxy
cargo run

# 预期: ✅ Listening on 0.0.0.0:6188
```

## ✅ Step 3: 验证所有服务都已启动

```bash
# 在新终端检查
curl http://localhost:3001/health     # OAuth Service
curl http://localhost:3002/health     # Admin Portal
curl -I http://localhost:6188/health  # Pingora

# 所有都应返回成功响应
```

## 🧪 Step 4: 测试 OAuth 完整流程

### 方法 A: 浏览器手动测试

1. **打开浏览器**: http://localhost:6188/admin
2. **预期**: 被重定向到登录页面
3. **输入凭证**:
   - 用户名: `admin`
   - 密码: `adminpassword` (注意：不是 admin123)
4. **验证**:
   - ✅ 登录成功
   - ✅ 看到管理后台
   - ✅ 用户信息已加载
   - ✅ 没有报错

### 方法 B: cURL 流程测试

```bash
# 1. 获取授权码（需要登录）
curl -v http://localhost:6188/api/v2/oauth/authorize \
  -G \
  -d "client_id=auth-center-admin-client" \
  -d "redirect_uri=http://localhost:6188/auth/callback" \
  -d "response_type=code" \
  -d "scope=openid+profile+email" \
  -d "state=test123" \
  -d "code_challenge=test" \
  -d "code_challenge_method=S256"

# 预期: 302 重定向到登录页面

# 2. 登录（通过 Admin Portal 的 /login 端点）
curl -X POST http://localhost:6188/api/v2/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "adminpassword"
  }' \
  -c cookies.txt

# 预期: 200 OK + session_token cookie

# 3. 使用 token 交换获取 access_token
# (这通常由前端自动完成)
```

## 🧪 Step 5: 运行 E2E 测试

```bash
cd apps/admin-portal

# 现在使用生产构建运行测试
pnpm test:e2e

# 或其他测试选项
pnpm test:e2e:ui       # 交互式 UI
pnpm test:e2e:headed   # 可见浏览器
pnpm test:e2e:debug    # 调试模式
```

### 预期测试覆盖

测试应该验证：

- ✅ 无认证 → 重定向到登录
- ✅ 有效凭证 → 成功登录
- ✅ 无效凭证 → 错误消息
- ✅ CSRF 保护 → 状态验证
- ✅ Token 交换 → 成功
- ✅ 用户信息获取 → 正确
- ✅ 权限检查 → 工作
- ✅ 会话处理 → 正确

## 📊 性能和行为差异

### Dev 模式 vs 生产模式

| 特性 | Dev 模式 | 生产模式 |
|------|---------|---------|
| **构建速度** | 快（热重载） | 慢（一次性） |
| **文件大小** | 大（含调试信息） | 小（优化后） |
| **缓存** | 不缓存 | 激进缓存 |
| **错误显示** | 详细 | 简略 |
| **性能** | 较慢 | 最优 |
| **真实度** | 低 | 高 ✅ |
| **适合测试** | 否 | 是 ✅ |

### 为什么生产模式更适合 E2E 测试

1. **真实的文件加载**: 生产版本使用优化后的代码和资源
2. **正确的缓存行为**: 模拟真实用户的缓存体验
3. **生产优化**: 代码分割、压缩等都已应用
4. **稳定的路由**: 没有热重载导致的不稳定性
5. **准确的性能指标**: 测试反映真实生产性能
6. **错误捕获准确**: 生产环境的错误处理逻辑

## 🔍 故障排除

### ❌ "Port 3002 already in use"

```bash
# 查找并杀死占用端口的进程
lsof -ti:3002 | xargs kill -9

# 或
fuser -k 3002/tcp
```

### ❌ "Build failed"

```bash
# 清除构建缓存
rm -rf .next/

# 重新构建
pnpm build
```

### ❌ ".next 目录不存在"

```bash
# 确保已构建
pnpm build

# 验证
ls -la .next/
```

### ❌ "Module not found" 错误

```bash
# 重新安装依赖
rm -rf node_modules
pnpm install

# 重新构建
pnpm build
```

## 📝 完整的服务启动脚本

创建 `start-production.sh`:

```bash
#!/bin/bash

set -e

PROJECT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== Admin Portal & OAuth Service 生产启动 ===${NC}"
echo ""

# Step 1: 构建 Admin Portal
echo -e "${GREEN}📦 Step 1: 构建 Admin Portal...${NC}"
cd "$PROJECT_ROOT/apps/admin-portal"
if [ ! -d ".next" ]; then
  pnpm build
else
  echo "✅ 已有构建版本，跳过"
fi

# Step 2: 验证数据库
echo ""
echo -e "${GREEN}🗄️  Step 2: 验证数据库...${NC}"
if [ -f "$PROJECT_ROOT/packages/database/prisma/dev.db" ]; then
  db_size=$(ls -lh "$PROJECT_ROOT/packages/database/prisma/dev.db" | awk '{print $5}')
  echo "✅ 数据库已初始化 ($db_size)"
else
  echo "❌ 数据库不存在，请先运行: pnpm db:push && pnpm db:seed"
  exit 1
fi

# Step 3: 启动说明
echo ""
echo -e "${BLUE}=== 服务启动说明 ===${NC}"
echo ""
echo "请在 3 个不同的终端中启动以下命令："
echo ""
echo -e "${GREEN}终端 1: OAuth Service${NC}"
echo "cd $PROJECT_ROOT/apps/oauth-service-rust && cargo run"
echo ""
echo -e "${GREEN}终端 2: Admin Portal (生产)${NC}"
echo "cd $PROJECT_ROOT/apps/admin-portal && pnpm start"
echo ""
echo -e "${GREEN}终端 3: Pingora 代理${NC}"
echo "cd $PROJECT_ROOT/apps/pingora-proxy && cargo run"
echo ""
echo -e "${BLUE}=== 访问信息 ===${NC}"
echo "主入口: http://localhost:6188"
echo "管理后台: http://localhost:6188/admin"
echo "登录凭证: admin / adminpassword"
echo ""
```

使用方法:
```bash
chmod +x start-production.sh
./start-production.sh
```

## 📚 相关文档

- `INTEGRATION_START_GUIDE.md` - 基础启动指南
- `INTEGRATION_COMPLETION_SESSION_9.md` - 技术细节
- `E2E_TESTING_GUIDE.md` - E2E 测试指南

---

**建议**: 对于生产环境和准确的集成测试，始终使用 `pnpm build && pnpm start` 而不是 `pnpm dev`。

