# OAuth 2.1 系统 - 运维指南

**文档版本**: 1.0
**最后更新**: 2025-11-20
**目标受众**: DevOps、系统管理员、运维工程师

---

## 1. 日志管理

### 日志级别

```
TRACE   - 最详细的信息
DEBUG   - 调试信息
INFO    - 一般信息
WARN    - 警告信息
ERROR   - 错误信息
FATAL   - 致命错误
```

### 配置日志

```bash
# OAuth Service
RUST_LOG=oauth_service=info,axum=warn

# Admin Portal
LOG_LEVEL=info
```

### 日志查询

```bash
# 查看最近 100 行日志
kubectl logs -f deployment/oauth-service -n oauth-system --tail=100

# 查看特定时间范围的日志
kubectl logs deployment/oauth-service -n oauth-system --since=1h

# 导出日志到文件
kubectl logs deployment/oauth-service -n oauth-system > oauth-logs.txt
```

---

## 2. 性能监控

### 关键指标

| 指标 | 告警阈值 | 说明 |
|------|---------|------|
| CPU 使用率 | > 80% | 需要扩容或优化 |
| 内存使用率 | > 85% | 检查内存泄漏 |
| 磁盘使用率 | > 90% | 清理日志或扩容 |
| 请求延迟 p95 | > 200ms | 性能下降 |
| 错误率 | > 1% | 系统问题 |
| Token 缓存命中率 | < 90% | 缓存配置问题 |

### Prometheus 查询

```promql
# 平均响应延迟
rate(http_request_duration_seconds_sum[5m]) / rate(http_request_duration_seconds_count[5m])

# 错误率
rate(http_requests_total{status=~"5.."}[5m])

# CPU 使用率
process_resident_memory_bytes / 1024 / 1024

# Token 生成速率
rate(tokens_issued_total[1m])
```

---

## 3. 告警规则

```yaml
# prometheus-alerts.yaml
groups:
- name: oauth_system
  rules:

  - alert: HighErrorRate
    expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.01
    for: 5m
    annotations:
      summary: "OAuth Service 错误率过高"

  - alert: HighLatency
    expr: histogram_quantile(0.95, http_request_duration_seconds) > 0.2
    for: 5m
    annotations:
      summary: "OAuth Service 响应延迟过高"

  - alert: CacheHitRateLow
    expr: permission_cache_hit_rate < 0.9
    for: 10m
    annotations:
      summary: "权限缓存命中率过低"

  - alert: DatabaseConnectionPoolExhausted
    expr: db_connections_active / db_connections_max > 0.9
    for: 5m
    annotations:
      summary: "数据库连接池即将耗尽"
```

---

## 4. 常见问题与解决

### 问题 1: 权限缓存命中率低

**症状**: `permission_cache_hit_rate < 90%`

**可能原因**:
- TTL 设置过短
- 用户权限变更频繁
- 缓存容量不足

**解决方案**:
```rust
// 增加缓存 TTL (默认 5 分钟)
const CACHE_TTL: Duration = Duration::from_secs(600);  // 改为 10 分钟

// 增加缓存容量
const MAX_CACHE_ENTRIES: usize = 10000;  // 改为 50000
```

---

### 问题 2: Token 刷新失败

**症状**: 用户报告频繁被强制登出

**排查步骤**:
```bash
# 1. 检查 refresh_tokens 表是否有损坏
mysql> SELECT COUNT(*) FROM refresh_tokens WHERE expires_at IS NULL;

# 2. 检查 refresh_token_lifetime 配置
# 默认: 2592000 秒 (30 天)

# 3. 查看错误日志
kubectl logs deployment/oauth-service -n oauth-system | grep "refresh_token"
```

**解决方案**:
- 清理已过期的 refresh token
- 检查系统时间是否准确
- 增加 refresh token 有效期

---

### 问题 3: 数据库连接泄漏

**症状**: 连接数不断增加

**排查**:
```sql
-- 检查活跃连接数
SELECT COUNT(*) FROM INFORMATION_SCHEMA.PROCESSLIST;

-- 检查锁住的表
SHOW OPEN TABLES WHERE In_use > 0;
```

**解决方案**:
```rust
// 增加连接超时配置
.idle_timeout(Duration::from_secs(300))
.max_lifetime(Duration::from_secs(1800))
.test_on_checkout(true)
```

---

## 5. 定期维护任务

### 每日

- ✅ 检查监控面板 (Grafana)
- ✅ 查看错误日志
- ✅ 验证备份完成
- ✅ 检查磁盘空间

### 每周

- ✅ 清理过期授权码
- ✅ 清理过期令牌黑名单
- ✅ 检查 SSL 证书有效期
- ✅ 验证高可用切换

### 每月

- ✅ 归档旧审计日志
- ✅ 数据库优化 (VACUUM, ANALYZE)
- ✅ 安全补丁更新
- ✅ 容量规划评估

---

## 6. 数据库维护

### 清理过期数据

```sql
-- 清理过期授权码
DELETE FROM auth_codes WHERE expires_at < NOW();

-- 清理已使用的授权码 (7 天)
DELETE FROM auth_codes WHERE is_used = 1 AND created_at < DATE_SUB(NOW(), INTERVAL 7 DAY);

-- 清理撤销的令牌黑名单 (7 天)
DELETE FROM revoked_access_tokens WHERE revoked_at < DATE_SUB(NOW(), INTERVAL 7 DAY);

-- 归档旧审计日志 (2 年)
DELETE FROM audit_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL 2 YEAR);
```

### 数据库优化

```sql
-- SQLite 优化 (开发环境)
VACUUM;
ANALYZE;

-- PostgreSQL 优化 (生产环境)
VACUUM ANALYZE users;
VACUUM ANALYZE refresh_tokens;
VACUUM ANALYZE audit_logs;
REINDEX TABLE users;
REINDEX TABLE refresh_tokens;

-- Supabase PostgreSQL 优化
-- 使用 Supabase 仪表板的性能优化工具
-- 或连接到数据库执行上述 PostgreSQL 命令
```

---

## 7. 证书管理

### 检查证书有效期

```bash
# 检查 Let's Encrypt 证书
openssl x509 -in /etc/letsencrypt/live/auth.yourdomain.com/fullchain.pem -text -noout | grep "Not After"

# Kubernetes Secret 中的证书
kubectl get secret oauth-tls-cert -n oauth-system -o jsonpath='{.data.tls\.crt}' | base64 -d | openssl x509 -text -noout
```

### 更新证书

```bash
# Let's Encrypt 自动续期 (Certbot)
sudo certbot renew --quiet

# 手动更新 Kubernetes Secret
kubectl create secret tls oauth-tls-cert \
  --cert=path/to/cert.pem \
  --key=path/to/key.pem \
  -n oauth-system --dry-run=client -o yaml | kubectl apply -f -

# 重启 Ingress 使新证书生效
kubectl rollout restart deployment/ingress-nginx -n ingress-nginx
```

---

## 8. 扩缩容

### 水平扩容

```bash
# 增加 OAuth Service 副本数
kubectl scale deployment oauth-service -n oauth-system --replicas=5

# 查看扩容进度
kubectl rollout status deployment/oauth-service -n oauth-system
```

### 垂直扩容 (增加资源限制)

```yaml
# 修改 deployment
resources:
  requests:
    memory: "512Mi"    # 增加到 512Mi
    cpu: "500m"        # 增加到 500m
  limits:
    memory: "1Gi"      # 增加到 1Gi
    cpu: "1000m"       # 增加到 1 核
```

---

## 9. 故障恢复清单

### 数据库故障

```bash
# 1. 停止 OAuth Service
kubectl scale deployment oauth-service --replicas=0 -n oauth-system

# 2. 恢复数据库备份
kubectl cp backup/oauth_20251120.db oauth-service-pod:/data/oauth.db -n oauth-system

# 3. 重启服务
kubectl scale deployment oauth-service --replicas=3 -n oauth-system

# 4. 验证恢复
curl http://localhost:6188/health
```

### 服务故障

```bash
# 1. 检查 Pod 状态
kubectl describe pod oauth-service-xxx -n oauth-system

# 2. 查看日志
kubectl logs oauth-service-xxx -n oauth-system

# 3. 删除 Pod (重新创建)
kubectl delete pod oauth-service-xxx -n oauth-system

# 4. 检查新 Pod 是否就绪
kubectl get pods -w -n oauth-system
```

---

## 10. 安全加固

### 禁用不安全的算法

```rust
// Rust - OAuth Service
// 只允许 RS256 (不允许 HS256 在生产)
let validation = Validation::new(jsonwebtoken::Algorithm::RS256);

// 禁用不安全的 TLS 版本
// 仅使用 TLS 1.3
```

### 定期安全审计

```bash
# 检查依赖漏洞 (Rust)
cargo audit

# 检查 Node 依赖
npm audit

# 进行渗透测试 (OWASP Top 10)
# 使用 OWASP ZAP 或类似工具
```

---

## 9. 密钥管理

### JWT 签名密钥生成

#### 初始生成（RSA-2048）

```bash
# 生成私钥
openssl genrsa -out private_key.pem 2048

# 从私钥生成公钥
openssl rsa -in private_key.pem -pubout -out public_key.pem

# 验证密钥对
openssl rsa -in private_key.pem -check
openssl rsa -pubin -in public_key.pem -text -noout

# 设置安全权限
chmod 600 private_key.pem
chmod 644 public_key.pem
```

#### 密钥轮换（90 天周期）

**阶段 1: 生成新密钥**

```bash
# 生成新的密钥对
openssl genrsa -out private_key_new.pem 2048
openssl rsa -in private_key_new.pem -pubout -out public_key_new.pem
```

**阶段 2: 双密钥并存期（7 天）**

```yaml
# 更新 Kubernetes Secret，支持新旧密钥
apiVersion: v1
kind: Secret
metadata:
  name: oauth-secrets
data:
  jwt_private_key: <old_key_base64>
  jwt_public_key: <old_key_base64>
  jwt_private_key_new: <new_key_base64>
  jwt_public_key_new: <new_key_base64>
```

```rust
// OAuth Service 配置（支持多公钥验证）
pub struct JwtKeys {
    signing_key: RsaPrivateKey,     // 用于签发新 token
    verification_keys: Vec<RsaPublicKey>,  // 用于验证新旧 token
}
```

**阶段 3: 切换为活跃密钥**

```bash
# 7 天后，移除旧密钥
kubectl create secret generic oauth-secrets \
  --from-file=jwt_private_key=private_key_new.pem \
  --from-file=jwt_public_key=public_key_new.pem \
  -n oauth-system --dry-run=client -o yaml | kubectl apply -f -

# 重启服务以加载新密钥
kubectl rollout restart deployment/oauth-service -n oauth-system
```

**阶段 4: 归档旧密钥（6 个月后销毁）**

```bash
# 移动到归档目录
mv private_key_old.pem keys/archive/private_key_$(date +%Y%m%d).pem

# 6 个月后安全删除
shred -vfz -n 10 keys/archive/private_key_*.pem
```

### OAuth 客户端密钥轮换（180 天周期）

```sql
-- 生成新的客户端密钥
UPDATE oauth_clients
SET secret_hash = '<new_bcrypt_hash>',
    updated_at = NOW()
WHERE id = 'admin-portal-client';

-- 记录轮换审计日志
INSERT INTO audit_logs (user_id, action_type, resource_type, resource_id, created_at)
VALUES ('system', 'CLIENT_SECRET_ROTATED', 'oauth_client', 'admin-portal-client', NOW());
```

**⚠️ 重要**: 客户端密钥轮换后，必须立即更新客户端应用的配置并重启。

### 数据库加密密钥（365 天周期）

使用 KMS (Key Management Service) 管理：

```bash
# AWS KMS 示例
aws kms create-key --description "OAuth Service DB Encryption Key"

# 更新环境变量
export DB_ENCRYPTION_KEY_ID=<new_kms_key_id>

# 重新加密敏感数据列
-- 使用新密钥重新加密
```

### Session 加密密钥（30 天周期）

```bash
# 生成新的 session 密钥（256-bit）
openssl rand -base64 32 > session_key_new.txt

# 更新环境变量
kubectl set env deployment/oauth-service \
  SESSION_ENCRYPTION_KEY=$(cat session_key_new.txt) \
  -n oauth-system
```

### 密钥轮换检查清单

- [ ] 提前 7 天通知相关团队
- [ ] 备份当前密钥到安全位置
- [ ] 生成新密钥并验证有效性
- [ ] 更新 Kubernetes Secret / 环境变量
- [ ] 重启服务并验证功能正常
- [ ] 监控错误日志（验证失败）
- [ ] 7 天双密钥并存期无异常后删除旧密钥
- [ ] 记录密钥轮换审计日志
- [ ] 归档旧密钥（标记销毁日期）

---

**文档完成日期**: 2025-11-20
**下一次审查**: 2026-02-20
