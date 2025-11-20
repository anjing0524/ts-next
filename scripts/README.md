# 脚本整理说明

## 目录结构

```
scripts/
├── integration/          # 集成检查脚本
│   └── check-integration.sh
├── testing/             # 测试脚本
│   ├── test-oauth-flow.sh
│   └── test-e2e.sh
├── deployment/          # 部署脚本
└── development/         # 开发辅助脚本
```

## 脚本说明

### Integration（集成）

#### check-integration.sh
**用途**: 检查所有服务的集成状态

**功能**:
- 检查服务健康状态（OAuth Service, Admin Portal, Pingora）
- 验证文件结构和配置
- 测试路由和认证流程
- 检查数据库状态

**使用方法**:
```bash
./scripts/integration/check-integration.sh
```

**前置条件**:
- 所有服务已启动（OAuth Service:3001, Admin Portal:3002, Pingora:6188）
- 数据库已初始化

---

### Testing（测试）

#### test-oauth-flow.sh
**用途**: 测试完整的 OAuth 2.1 认证流程

**功能**:
- 服务可用性检查
- OAuth 端点测试
- 登录功能测试
- Token 交换测试
- API 端点检查
- Cookie 验证

**使用方法**:
```bash
./scripts/testing/test-oauth-flow.sh
```

**前置条件**:
- OAuth Service 运行在 3001 端口
- Admin Portal 运行在 3002 端口
- Pingora 运行在 6188 端口
- 测试用户已存在（admin/adminpassword）

#### test-e2e.sh
**用途**: 运行端到端测试套件

**功能**:
- 初始化测试数据库
- 运行 Playwright E2E 测试
- 生成测试报告

**使用方法**:
```bash
./scripts/testing/test-e2e.sh
```

**前置条件**:
- pnpm 已安装
- Playwright 已配置好

---

## K8s 相关脚本

K8s 相关的脚本保留在 `k8s/` 目录下：

### k8s/deploy.sh
**用途**: 部署应用到 Kubernetes 集群

**使用方法**:
```bash
cd k8s
./deploy.sh --deploy
./deploy.sh --deploy --image myapp:v1.0
./deploy.sh --deploy --namespace production
```

### k8s/verify.sh
**用途**: 验证 K8s 部署状态

**使用方法**:
```bash
cd k8s
./verify.sh
```

### k8s/redis/deploy.sh
**用途**: 单独部署 Redis 到 K8s

---

## 删除的过时脚本

以下脚本已删除（冗余或过时）:

### 根目录
- ❌ `start-production-and-test.sh` - 硬编码路径，功能重复
- ❌ `start-all-services.sh` - 硬编码路径
- ❌ `run-e2e-tests.sh` - 功能已集成到 test-e2e.sh
- ❌ `run-integration-tests.sh` - 过时
- ❌ `verify_integration.sh` - 过时
- ❌ `verify-production.sh` - 过时

### scripts/ 目录（旧）
- ❌ `scripts/build-prod.sh` - 引用错误的目录名
- ❌ `scripts/start-oauth-service.sh` - 硬编码路径
- ❌ `scripts/start-admin-portal.sh` - 硬编码路径
- ❌ `scripts/start-pingora-proxy.sh` - 硬编码路径
- ❌ `scripts/build-zmq-logger-client.sh` - 不适用

### apps/admin-portal/
- ❌ `apps/admin-portal/run-oauth-e2e-tests.sh` - 冗余
- ❌ `apps/admin-portal/run-all-e2e-tests.sh` - 冗余
- ❌ `apps/admin-portal/scripts/verify-integrations.sh` - 冗余
- ❌ `apps/admin-portal/scripts/start-services.sh` - 冗余
- ❌ `apps/admin-portal/scripts/run-oauth-tests.sh` - 冗余

---

## 保留的其他脚本

### .husky/_/husky.sh
Git Hooks 脚本，无需移动。

### apps/kline-service/wasm-cal/build.sh
K线服务的 WebAssembly 构建脚本，保留在原位置。

---

## 使用建议

1. **开发环境启动服务**: 使用 pnpm 命令
   ```bash
   pnpm dev
   # 或分别启动
   pnpm --filter=oauth-service-rust dev
   pnpm --filter=admin-portal dev
   pnpm --filter=pingora-proxy dev
   ```

2. **检查集成状态**:
   ```bash
   ./scripts/integration/check-integration.sh
   ```

3. **测试 OAuth 流程**:
   ```bash
   ./scripts/testing/test-oauth-flow.sh
   ```

4. **运行 E2E 测试**:
   ```bash
   cd apps/admin-portal
   pnpm test:e2e
   ```

5. **K8s 部署**:
   ```bash
   cd k8s
   ./deploy.sh --deploy
   ./verify.sh
   ```

---

## 维护指南

1. 所有新增脚本应放在 `scripts/` 相应分类目录下
2. 脚本应避免硬编码路径，使用相对路径或环境变量
3. 每个脚本应包含清晰的注释说明用途和使用方法
4. 更新此 README 以记录新增或修改的脚本
