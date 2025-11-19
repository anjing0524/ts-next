# E2E 测试生产模式详细计划

## 目标
确保 E2E 测试在生产模式下运行，覆盖所有核心业务流程，保证系统质量。

## 1. 环境配置

### 1.1 生产模式配置要求
```bash
# OAuth Service (.env)
NODE_ENV=production
DATABASE_URL=sqlite:./oauth.db
JWT_ALGORITHM=RS256
JWT_PRIVATE_KEY_PATH=./keys/private_key.pem
JWT_PUBLIC_KEY_PATH=./keys/public_key.pem
REQUIRE_PKCE=true
SKIP_DB_INIT=false  # 首次运行，后续设为 true

# Admin Portal (.env.production.local)
NODE_ENV=production
NEXT_PUBLIC_OAUTH_SERVICE_URL=http://localhost:6188
NEXT_PUBLIC_OAUTH_CLIENT_ID=auth-center-admin-client
NEXT_PUBLIC_OAUTH_REDIRECT_URI=http://localhost:6188/auth/callback
NEXT_PUBLIC_API_BASE_URL=http://localhost:6188/api/v2
```

### 1.2 构建步骤
```bash
# 1. 构建 Admin Portal (生产模式)
cd apps/admin-portal
pnpm build

# 2. 编译 OAuth Service (Release 模式)
cd ../oauth-service-rust
cargo build --release

# 3. 编译 Pingora Proxy
cd ../pingora-proxy
cargo build --release
```

### 1.3 服务启动顺序
```bash
# 1. 启动 OAuth Service (端口 3001)
cd apps/oauth-service-rust
./target/release/oauth-service-rust &

# 2. 启动 Admin Portal (端口 3002, 生产模式)
cd apps/admin-portal
pnpm start &

# 3. 启动 Pingora Proxy (端口 6188)
cd apps/pingora-proxy
./target/release/pingora-proxy &
```

## 2. E2E 测试用例覆盖

### 2.1 OAuth 授权流程测试 (优先级: P0)

#### 测试场景 1: 授权码流程 + PKCE
```
前置条件:
- 服务已启动
- 数据库已初始化
- admin 用户存在 (admin/admin123)

测试步骤:
1. 生成 PKCE code_verifier 和 code_challenge
2. 访问 /api/v2/oauth/authorize 发起授权请求
   - client_id: auth-center-admin-client
   - redirect_uri: http://localhost:6188/auth/callback
   - response_type: code
   - state: random_state
   - code_challenge: generated_challenge
   - code_challenge_method: S256
3. 重定向到登录页面 /login
4. 提交登录表单 (admin/admin123)
5. 验证重定向到 redirect_uri 并包含 code 和 state
6. 使用 authorization_code 交换 token
   - grant_type: authorization_code
   - code: received_code
   - code_verifier: original_verifier
   - client_id: auth-center-admin-client
   - redirect_uri: http://localhost:6188/auth/callback
7. 验证返回 access_token 和 refresh_token

预期结果:
- ✅ 授权码成功生成
- ✅ Token 交换成功
- ✅ access_token 包含正确的用户信息和权限
- ✅ PKCE 验证通过
```

#### 测试场景 2: 错误场景 - PKCE 验证失败
```
测试步骤:
1. 使用错误的 code_verifier 交换 token
预期结果:
- ❌ 返回 400 错误
- 错误信息: "Invalid code verifier"
```

### 2.2 用户认证测试 (优先级: P0)

#### 测试场景 3: 用户登录成功
```
API: POST /api/v2/auth/login
请求体:
{
  "username": "admin",
  "password": "admin123"
}

预期结果:
- ✅ 返回 200 状态码
- ✅ 返回 session_token cookie (HttpOnly, Secure in prod)
- ✅ 返回 redirect_url
- ✅ cookie 有效期为 1 小时
```

#### 测试场景 4: 用户登录失败 - 错误密码
```
请求体:
{
  "username": "admin",
  "password": "wrong_password"
}

预期结果:
- ❌ 返回 401 状态码
- 错误信息: "Invalid username or password"
- ✅ failed_login_attempts 计数增加
```

#### 测试场景 5: 账户锁定机制
```
前置条件: 连续 5 次失败登录

预期结果:
- ✅ 账户被锁定 30 分钟
- ❌ 返回错误: "Account is locked until {time}"
```

### 2.3 Token 管理测试 (优先级: P0)

#### 测试场景 6: 刷新 Token
```
API: POST /api/v2/oauth/token
请求体:
{
  "grant_type": "refresh_token",
  "refresh_token": "valid_refresh_token",
  "client_id": "auth-center-admin-client"
}

预期结果:
- ✅ 返回新的 access_token
- ✅ 返回新的 refresh_token (Token Rotation)
- ✅ 旧的 refresh_token 失效
```

#### 测试场景 7: Token 验证
```
API: GET /api/v2/users (需要认证)
Headers: Authorization: Bearer {access_token}

预期结果:
- ✅ access_token 有效时返回 200
- ❌ access_token 过期时返回 401
- ❌ 无效 token 返回 401
```

### 2.4 RBAC 权限测试 (优先级: P0)

#### 测试场景 8: Admin 用户权限
```
用户: admin (super_admin 角色)
测试 API:
- GET /api/v2/users - ✅ 应该成功
- POST /api/v2/users - ✅ 应该成功
- DELETE /api/v2/users/:id - ✅ 应该成功
- GET /api/v2/system/clients - ✅ 应该成功

预期结果:
- admin 用户拥有所有权限
```

#### 测试场景 9: Demo 用户权限限制
```
用户: demo (普通用户角色)
测试 API:
- GET /api/v2/users - ✅ 应该成功 (只读)
- POST /api/v2/users - ❌ 应该返回 403 Forbidden
- DELETE /api/v2/users/:id - ❌ 应该返回 403 Forbidden

预期结果:
- demo 用户只有只读权限
```

### 2.5 Admin Portal 功能测试 (优先级: P1)

#### 测试场景 10: 登录页面
```
URL: http://localhost:6188/login

测试步骤:
1. 访问登录页面
2. 验证页面渲染正确 (无 hydration 错误)
3. 填写表单并提交
4. 验证 CSP 策略不阻止功能
5. 检查 JavaScript 错误

预期结果:
- ✅ 页面正常渲染
- ✅ 无 React Hydration 错误
- ✅ 无 CSP 阻止错误
- ✅ 登录成功后重定向
```

#### 测试场景 11: Dashboard 页面
```
URL: http://localhost:6188/admin

前置条件: 用户已登录

预期结果:
- ✅ 显示用户信息
- ✅ 显示系统统计
- ✅ 所有组件正常渲染
```

#### 测试场景 12: 用户管理页面
```
URL: http://localhost:6188/admin/users

测试功能:
1. 列表展示 - ✅
2. 搜索过滤 - ✅
3. 创建用户 - ✅
4. 编辑用户 - ✅
5. 删除用户 - ✅ (仅 admin)
6. 权限检查 - ✅
```

#### 测试场景 13: 角色管理页面
```
URL: http://localhost:6188/admin/system/roles

测试功能:
1. 角色列表 - ✅
2. 创建角色 - ✅
3. 权限分配 - ✅
4. 删除角色 - ✅
```

#### 测试场景 14: 客户端管理页面
```
URL: http://localhost:6188/admin/system/clients

测试功能:
1. 客户端列表 - ✅
2. 注册新客户端 - ✅
3. 更新客户端配置 - ✅
4. 配置 redirect_uri - ✅
5. 启用/禁用 PKCE - ✅
```

#### 测试场景 15: 审计日志页面
```
URL: http://localhost:6188/admin/system/audits

测试功能:
1. 日志列表展示 - ✅
2. 时间范围筛选 - ✅
3. 事件类型筛选 - ✅
4. 用户筛选 - ✅
5. 日志详情查看 - ✅
```

### 2.6 安全性测试 (优先级: P0)

#### 测试场景 16: CSP 策略验证
```
检查点:
1. script-src 正确配置 - ✅
2. style-src 正确配置 - ✅
3. nonce 正确应用 - ✅
4. 无 unsafe-inline (除必要情况) - ✅

验证方式:
- 检查浏览器控制台无 CSP 错误
- 验证所有功能正常工作
```

#### 测试场景 17: Cookie 安全属性
```
检查 session_token cookie:
- HttpOnly: true - ✅
- Secure: true (生产模式) - ✅
- SameSite: Lax - ✅
- Max-Age: 3600 - ✅
```

#### 测试场景 18: CORS 配置
```
测试跨域请求:
- 允许的域名可以访问 - ✅
- 未授权的域名被拒绝 - ✅
- Preflight 请求正确处理 - ✅
```

## 3. 自动化测试脚本

### 3.1 E2E 测试脚本结构
```
tests/e2e/
├── setup/
│   ├── start-production.sh      # 启动生产模式服务
│   ├── check-health.sh           # 健康检查
│   └── cleanup.sh                # 清理环境
├── auth/
│   ├── oauth-flow.spec.ts        # OAuth 授权流程
│   ├── login.spec.ts             # 登录测试
│   └── token.spec.ts             # Token 管理
├── rbac/
│   ├── admin-permissions.spec.ts # Admin 权限
│   └── user-permissions.spec.ts  # 普通用户权限
├── portal/
│   ├── login-page.spec.ts        # 登录页面
│   ├── dashboard.spec.ts         # Dashboard
│   ├── users.spec.ts             # 用户管理
│   ├── roles.spec.ts             # 角色管理
│   ├── clients.spec.ts           # 客户端管理
│   └── audits.spec.ts            # 审计日志
└── security/
    ├── csp.spec.ts               # CSP 策略
    ├── cookies.spec.ts           # Cookie 安全
    └── cors.spec.ts              # CORS 配置
```

### 3.2 执行命令
```bash
# 运行所有 E2E 测试 (生产模式)
./run-e2e-tests.sh --mode=production

# 运行特定测试套件
./run-e2e-tests.sh --suite=auth
./run-e2e-tests.sh --suite=portal
./run-e2e-tests.sh --suite=security

# 生成测试报告
./run-e2e-tests.sh --report
```

## 4. 当前问题修复清单

### 4.1 已发现问题
1. ❌ **密码哈希问题** - Seed 数据中的密码哈希不正确
   - 解决方案: 重新生成正确的 bcrypt 哈希

2. ❌ **客户端ID不匹配** - 代码使用 `admin-portal-client`，数据库使用 `auth-center-admin-client`
   - 解决方案: 统一为 `auth-center-admin-client`

3. ❌ **InvalidAlgorithm 错误** - JWT 算法配置问题
   - 待调查: 检查 JWT 配置和密钥加载

4. ⚠️ **React Hydration 警告** - 生产构建可能存在 hydration 不匹配
   - 待调查: 检查 server/client 渲染差异

5. ⚠️ **CSP 策略冲突** - CSP 可能阻止某些功能
   - 待验证: 确认 CSP 不影响核心功能

### 4.2 修复优先级
```
P0 (必须修复):
- InvalidAlgorithm 错误
- 密码哈希问题
- 客户端ID不匹配

P1 (重要):
- React Hydration 问题
- CSP 策略优化

P2 (可选):
- 性能优化
- 日志完善
```

## 5. 验收标准

### 5.1 功能验收
- ✅ 所有 P0 测试用例通过率 100%
- ✅ 所有 P1 测试用例通过率 ≥ 95%
- ✅ 无阻塞性 bug

### 5.2 性能验收
- 登录响应时间 < 500ms
- Token 交换响应时间 < 200ms
- 页面首次加载时间 < 2s

### 5.3 安全验收
- 所有安全测试用例通过
- 无高危或中危安全漏洞
- CSP 策略正确配置且不影响功能

## 6. 测试执行时间表

### 第一阶段 (0-2小时): 环境准备
- 修复当前已知问题
- 配置生产环境
- 构建所有服务

### 第二阶段 (2-4小时): 核心功能测试
- OAuth 授权流程
- 用户认证
- Token 管理
- RBAC 权限

### 第三阶段 (4-6小时): Portal 功能测试
- 所有管理页面
- 表单提交
- 数据展示
- 交互功能

### 第四阶段 (6-8小时): 安全与性能测试
- CSP 策略验证
- Cookie 安全
- CORS 配置
- 性能基准测试

### 第五阶段 (8-10小时): 修复与验证
- 修复所有失败的测试
- 回归测试
- 最终验收

## 7. 风险与缓解

### 风险1: 数据库迁移失败
- **缓解**: 备份数据库，提供回滚方案
- **应急**: 使用已知良好的 seed 数据

### 风险2: 生产构建错误
- **缓解**: 本地测试所有构建步骤
- **应急**: 使用开发模式进行初步测试

### 风险3: 测试环境不稳定
- **缓解**: 使用 Docker 容器隔离环境
- **应急**: 重启服务并重新初始化

## 8. 成功指标

- ✅ 100% P0 测试通过
- ✅ ≥95% P1 测试通过
- ✅ 0 个 P0/P1 未解决 bug
- ✅ 所有核心业务流程可用
- ✅ 生产模式稳定运行 > 4 小时无崩溃
