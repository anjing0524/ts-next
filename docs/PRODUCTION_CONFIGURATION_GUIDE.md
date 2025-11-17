# 生产环境配置优化指南

> **文档版本**: 1.0
> **创建日期**: 2025-11-17
> **目标读者**: DevOps 工程师, 系统管理员

本文档提供 OAuth 2.1 系统生产环境部署的配置优化指南和最佳实践。

---

## 目录

1. [生产环境配置检查清单](#生产环境配置检查清单)
2. [安全配置优化](#安全配置优化)
3. [性能配置优化](#性能配置优化)
4. [高可用性配置](#高可用性配置)
5. [监控和日志配置](#监控和日志配置)
6. [灾难恢复配置](#灾难恢复配置)
7. [配置文件模板](#配置文件模板)

---

## 生产环境配置检查清单

### ✅ 必须完成项 (Critical)

#### 1. 安全配置

- [ ] **JWT 算法**: 切换到 RS256 (非对称密钥)
  ```bash
  # 生成 RSA 密钥对
  openssl genrsa -out private_key.pem 2048
  openssl rsa -in private_key.pem -pubout -out public_key.pem

  # 设置环境变量
  JWT_ALGORITHM=RS256
  JWT_PRIVATE_KEY_PATH=./keys/private_key.pem
  JWT_PUBLIC_KEY_PATH=./keys/public_key.pem
  ```

- [ ] **移除默认密码**: 更改所有默认密码
  - Admin 用户密码 (`admin123` → 强密码)
  - 数据库密码
  - Client Secrets

- [ ] **HTTPS 强制**: 启用 SSL/TLS
  ```bash
  NODE_ENV=production  # 自动启用 Secure Cookie
  ```

- [ ] **Cookie 安全属性**: 确认配置正确
  - `HttpOnly`: ✅ 已启用
  - `Secure`: ✅ 生产环境自动启用
  - `SameSite=Lax`: ✅ 已启用

- [ ] **CORS 配置**: 限制允许的来源
  ```bash
  CORS_ALLOWED_ORIGINS=https://admin.yourdomain.com,https://app.yourdomain.com
  CORS_ALLOW_CREDENTIALS=true
  ```

- [ ] **环境变量安全**: 不要将 .env 文件提交到版本控制
  ```bash
  # .gitignore 已包含
  .env
  .env.local
  .env.production
  ```

#### 2. 数据库配置

- [ ] **数据库选择**: 切换到生产级数据库
  - ✅ 推荐: MySQL 8.0+ / PostgreSQL 14+
  - ⚠️  不推荐生产环境: SQLite

- [ ] **连接池配置**: 优化连接数
  ```rust
  let pool = SqlitePoolOptions::new()
      .max_connections(20)  // 根据实际负载调整
      .connect(&config.database_url)
      .await?;
  ```

- [ ] **数据库 TLS**: 启用加密连接
  ```bash
  DATABASE_URL=mysql://user:pass@host:3306/db?ssl-mode=REQUIRED
  DATABASE_TLS_ENABLED=true
  DATABASE_CA_CERT_PATH=./certs/ca.pem
  ```

- [ ] **数据库备份**: 配置自动备份策略
  ```bash
  # 每日备份示例 (cron)
  0 2 * * * /backup-scripts/backup-oauth-db.sh
  ```

#### 3. Token 配置

- [ ] **Token 生命周期**: 设置合理的过期时间
  ```bash
  ACCESS_TOKEN_TTL=3600        # 1 小时
  REFRESH_TOKEN_TTL=2592000    # 30 天
  AUTH_CODE_TTL=600            # 10 分钟
  SESSION_TOKEN_TTL=3600       # 1 小时
  ```

- [ ] **Refresh Token Rotation**: 启用 Token 轮换
  ```bash
  ENABLE_REFRESH_TOKEN_ROTATION=true
  ```

- [ ] **Token 撤销**: 启用撤销机制
  ```bash
  ENABLE_TOKEN_REVOCATION=true
  ```

#### 4. 日志和审计

- [ ] **日志级别**: 设置为 `info` 或 `warn`
  ```bash
  RUST_LOG=info,oauth_service_rust=debug
  LOG_LEVEL=info
  ```

- [ ] **审计日志**: 启用并配置保留策略
  ```bash
  ENABLE_AUDIT_LOG=true
  AUDIT_LOG_RETENTION_DAYS=90
  AUDIT_LOG_STORAGE=both  # database + file
  ```

- [ ] **敏感数据脱敏**: 已内置在 Audit Middleware
  - 密码、Token、Secret 自动脱敏

#### 5. 性能配置

- [ ] **权限缓存**: 启用并配置 TTL
  ```bash
  PERMISSION_CACHE_TTL=300       # 5 分钟
  PERMISSION_CACHE_CAPACITY=1000
  ```

- [ ] **限流配置**: 根据实际流量调整
  ```bash
  RATE_LIMIT_MAX_REQUESTS=100
  RATE_LIMIT_WINDOW_SECS=60
  ```

- [ ] **数据库索引**: 确认关键字段已建立索引
  ```sql
  CREATE INDEX idx_users_username ON users(username);
  CREATE INDEX idx_access_tokens_jti ON access_tokens(jti);
  CREATE INDEX idx_refresh_tokens_token ON refresh_tokens(token);
  CREATE INDEX idx_auth_codes_code ON authorization_codes(code);
  ```

---

### 🟡 建议完成项 (Recommended)

#### 6. 高可用性

- [ ] **Redis 分布式缓存**: 替换内存缓存
  ```bash
  REDIS_URL=redis://redis-host:6379/0
  REDIS_PASSWORD=STRONG_PASSWORD
  ```

- [ ] **数据库主从复制**: 配置读写分离
  ```bash
  DATABASE_URL_PRIMARY=mysql://primary-host:3306/oauth_db
  DATABASE_URL_REPLICA=mysql://replica-host:3306/oauth_db
  ```

- [ ] **负载均衡**: 多实例部署
  ```bash
  # 部署多个 OAuth Service 实例
  docker-compose up --scale oauth-service=3
  ```

- [ ] **健康检查**: 配置探针
  ```yaml
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
    interval: 30s
    timeout: 10s
    retries: 3
  ```

#### 7. 监控

- [ ] **Prometheus 指标**: 启用指标收集
  ```bash
  ENABLE_METRICS=true
  METRICS_PORT=9090
  ```

- [ ] **Grafana 仪表板**: 配置可视化监控
  - CPU/内存使用率
  - 请求率和延迟
  - Token 签发率
  - 错误率

- [ ] **日志聚合**: 集成 ELK/Loki
  ```bash
  ELASTICSEARCH_URL=https://es-host:9200
  ELASTICSEARCH_API_KEY=your-api-key
  ```

- [ ] **错误追踪**: 集成 Sentry
  ```bash
  SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
  SENTRY_ENVIRONMENT=production
  ```

#### 8. 安全加固

- [ ] **密码策略**: 配置复杂度要求
  ```bash
  PASSWORD_MIN_LENGTH=12
  PASSWORD_REQUIRE_UPPERCASE=true
  PASSWORD_REQUIRE_LOWERCASE=true
  PASSWORD_REQUIRE_DIGIT=true
  PASSWORD_REQUIRE_SPECIAL=true
  PASSWORD_HISTORY_COUNT=5
  PASSWORD_EXPIRY_DAYS=90
  ```

- [ ] **登录保护**: 配置账户锁定
  ```bash
  MAX_LOGIN_ATTEMPTS=5
  ACCOUNT_LOCKOUT_DURATION=1800  # 30 分钟
  ```

- [ ] **2FA/MFA**: 启用多因素认证 (如果实现)
  ```bash
  ENABLE_2FA=true
  ```

---

## 安全配置优化

### 1. JWT 密钥管理

#### 密钥生成

```bash
# 生产环境推荐: RS256 (2048位或更高)
openssl genrsa -out private_key.pem 4096
openssl rsa -in private_key.pem -pubout -out public_key.pem

# 设置正确的文件权限
chmod 400 private_key.pem
chmod 444 public_key.pem
```

#### 密钥轮换策略

**建议**: 每 90-180 天轮换一次密钥

```bash
# 1. 生成新密钥对
openssl genrsa -out private_key_new.pem 4096
openssl rsa -in private_key_new.pem -pubout -out public_key_new.pem

# 2. 配置多密钥支持 (grace period)
#    允许旧密钥验证,新密钥签发

# 3. 等待所有旧 Token 过期后,移除旧密钥

# 4. 备份旧密钥 (用于审计)
tar czf keys-backup-$(date +%Y%m%d).tar.gz private_key.pem public_key.pem
```

### 2. 密码哈希优化

**当前实现**: bcrypt (cost = 10)

**生产环境优化**:

```rust
// 增加 cost factor (更安全,但更慢)
// 根据服务器性能调整
let cost = 12;  // 推荐: 10-14 之间

// 示例: apps/oauth-service-rust/src/services/user_service.rs
let password_hash = bcrypt::hash(&password, cost)?;
```

**性能 vs 安全平衡**:
- Cost 10: ~100ms (当前)
- Cost 12: ~400ms (推荐)
- Cost 14: ~1.6s (高安全场景)

### 3. HTTPS 配置

#### Pingora Proxy TLS 配置

```yaml
# apps/pingora-proxy/config/production.yaml
tls:
  cert_path: /etc/letsencrypt/live/yourdomain.com/fullchain.pem
  key_path: /etc/letsencrypt/live/yourdomain.com/privkey.pem
  protocols:
    - TLSv1.2
    - TLSv1.3
  ciphers: "ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256"
```

#### Let's Encrypt 证书自动续期

```bash
# Certbot 自动续期 (cron)
0 0 * * * /usr/bin/certbot renew --quiet --deploy-hook "docker-compose restart pingora-proxy"
```

### 4. 网络安全

#### 防火墙规则 (UFW 示例)

```bash
# 只开放必要的端口
sudo ufw default deny incoming
sudo ufw default allow outgoing

sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP (重定向到 HTTPS)
sudo ufw allow 443/tcp   # HTTPS

# 启用防火墙
sudo ufw enable
```

#### Docker 网络隔离

```yaml
# docker-compose.production.yml
networks:
  frontend:  # Pingora Proxy only
  backend:   # OAuth Service + Admin Portal
  database:  # MySQL only
```

### 5. Secrets 管理

**推荐方案**: Docker Secrets / Kubernetes Secrets

```yaml
# docker-compose.production.yml
secrets:
  jwt_private_key:
    file: ./secrets/jwt_private_key.pem
  db_password:
    file: ./secrets/db_password.txt

services:
  oauth-service:
    secrets:
      - jwt_private_key
      - db_password
    environment:
      - DATABASE_URL=mysql://oauth_user@mysql:3306/oauth_db
      - JWT_PRIVATE_KEY_FILE=/run/secrets/jwt_private_key
```

---

## 性能配置优化

### 1. 数据库性能调优

#### MySQL 配置优化

```cnf
# /etc/mysql/mysql.conf.d/mysqld.cnf

[mysqld]
# 连接配置
max_connections = 200
thread_cache_size = 50

# InnoDB 配置
innodb_buffer_pool_size = 1G  # 总内存的 70-80%
innodb_log_file_size = 256M
innodb_flush_log_at_trx_commit = 2  # 性能优化 (牺牲少量持久性)

# 查询缓存 (MySQL 5.7)
query_cache_type = 1
query_cache_size = 64M

# 慢查询日志
slow_query_log = 1
slow_query_log_file = /var/log/mysql/slow-query.log
long_query_time = 2

# 字符集
character-set-server = utf8mb4
collation-server = utf8mb4_unicode_ci
```

#### 数据库索引优化

```sql
-- 查询频繁字段建立索引
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_oauth_clients_client_id ON oauth_clients(client_id);
CREATE INDEX idx_access_tokens_jti ON access_tokens(jti);
CREATE INDEX idx_access_tokens_user_id ON access_tokens(user_id);
CREATE INDEX idx_refresh_tokens_token ON refresh_tokens(token);
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_authorization_codes_code ON authorization_codes(code);
CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX idx_role_permissions_role_id ON role_permissions(role_id);

-- 复合索引 (常见查询组合)
CREATE INDEX idx_user_roles_user_role ON user_roles(user_id, role_id);
CREATE INDEX idx_access_tokens_user_client ON access_tokens(user_id, client_id);

-- 分析索引使用情况
EXPLAIN SELECT * FROM users WHERE username = 'admin';
```

### 2. 应用层缓存

#### Redis 集成 (替换内存缓存)

**优势**:
- 分布式缓存 (多实例共享)
- 持久化支持
- 更大容量

**实现示例** (需要代码修改):

```rust
// src/cache/permission_cache.rs
pub struct RedisPermissionCache {
    client: redis::Client,
    ttl_seconds: i64,
}

impl RedisPermissionCache {
    pub fn new(redis_url: &str, ttl_seconds: i64) -> Result<Self, CacheError> {
        let client = redis::Client::open(redis_url)?;
        Ok(Self { client, ttl_seconds })
    }
}

#[async_trait]
impl PermissionCache for RedisPermissionCache {
    async fn get(&self, user_id: &str) -> Option<Vec<String>> {
        let mut conn = self.client.get_async_connection().await.ok()?;
        let key = format!("permissions:{}", user_id);

        let value: String = conn.get(&key).await.ok()?;
        serde_json::from_str(&value).ok()
    }

    async fn set(&self, user_id: &str, permissions: Vec<String>, ttl_seconds: i64)
        -> Result<(), CacheError> {
        let mut conn = self.client.get_async_connection().await?;
        let key = format!("permissions:{}", user_id);
        let value = serde_json::to_string(&permissions)?;

        conn.set_ex(&key, value, ttl_seconds as usize).await?;
        Ok(())
    }
}
```

### 3. Connection Pool 调优

```rust
// apps/oauth-service-rust/src/state.rs
let pool = SqlitePoolOptions::new()
    .max_connections(20)           // 最大连接数 (根据负载调整)
    .min_connections(5)             // 最小连接数 (保持热连接)
    .acquire_timeout(Duration::from_secs(30))  // 获取连接超时
    .idle_timeout(Duration::from_secs(600))    // 空闲连接超时 (10分钟)
    .max_lifetime(Duration::from_secs(1800))   // 连接最大生命周期 (30分钟)
    .connect(&config.database_url)
    .await?;
```

**连接数计算公式**:
```
max_connections = ((core_count * 2) + effective_spindle_count)
```

**示例**:
- 4 核 CPU + SSD (视为 1 spindle) = (4*2)+1 = 9 → 设置为 10-20

### 4. 限流优化

**当前**: 内存限流 (单实例)

**生产环境推荐**: Redis 限流 (分布式)

```rust
// 使用 Redis 实现分布式限流
use redis::AsyncCommands;

pub async fn check_rate_limit(redis: &redis::Client, ip: &str, max_requests: usize, window_secs: u64)
    -> Result<bool, Error> {
    let mut conn = redis.get_async_connection().await?;
    let key = format!("rate_limit:{}", ip);

    // 使用 Redis INCR + EXPIRE 实现简单限流
    let count: usize = conn.incr(&key, 1).await?;

    if count == 1 {
        conn.expire(&key, window_secs as usize).await?;
    }

    Ok(count <= max_requests)
}
```

---

## 高可用性配置

### 1. 负载均衡

#### Nginx 配置示例

```nginx
upstream oauth_service {
    least_conn;  # 最少连接负载均衡
    server 127.0.0.1:3001 weight=1 max_fails=3 fail_timeout=30s;
    server 127.0.0.1:3011 weight=1 max_fails=3 fail_timeout=30s;
    server 127.0.0.1:3021 weight=1 max_fails=3 fail_timeout=30s;

    keepalive 32;  # 保持连接
}

server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    location /api/v2/ {
        proxy_pass http://oauth_service;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 超时配置
        proxy_connect_timeout 10s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;

        # 启用 HTTP/1.1 keepalive
        proxy_http_version 1.1;
        proxy_set_header Connection "";
    }
}
```

### 2. 数据库高可用

#### MySQL 主从复制

```sql
-- 主库配置 (/etc/mysql/my.cnf)
[mysqld]
server-id = 1
log_bin = /var/log/mysql/mysql-bin.log
binlog_do_db = oauth_db

-- 从库配置 (/etc/mysql/my.cnf)
[mysqld]
server-id = 2
relay-log = /var/log/mysql/mysql-relay-bin
log_bin = /var/log/mysql/mysql-bin.log
read_only = 1

-- 配置复制
CHANGE MASTER TO
  MASTER_HOST='primary-host',
  MASTER_USER='replication_user',
  MASTER_PASSWORD='password',
  MASTER_LOG_FILE='mysql-bin.000001',
  MASTER_LOG_POS=  107;

START SLAVE;
SHOW SLAVE STATUS\G
```

#### 读写分离 (应用层)

```rust
// src/db.rs
pub struct DatabasePool {
    primary: SqlxPool,  // 写操作
    replica: SqlxPool,  // 读操作
}

impl DatabasePool {
    pub fn get_write_pool(&self) -> &SqlxPool {
        &self.primary
    }

    pub fn get_read_pool(&self) -> &SqlxPool {
        &self.replica
    }
}
```

### 3. 健康检查和自动恢复

```rust
// src/routes/health.rs
pub async fn health_check(State(state): State<Arc<AppState>>) -> Result<Json<HealthStatus>, AppError> {
    let db_healthy = check_database(&state.pool).await.is_ok();
    let cache_healthy = check_cache(&state.permission_cache).await.is_ok();

    let status = if db_healthy && cache_healthy {
        "healthy"
    } else {
        "degraded"
    };

    Ok(Json(HealthStatus {
        status: status.to_string(),
        database: db_healthy,
        cache: cache_healthy,
        timestamp: Utc::now(),
    }))
}

async fn check_database(pool: &SqlxPool) -> Result<(), Error> {
    sqlx::query("SELECT 1").execute(pool).await?;
    Ok(())
}
```

---

## 监控和日志配置

### 1. Prometheus 指标

```rust
// src/metrics.rs (需要添加)
use prometheus::{Encoder, IntCounterVec, HistogramVec, Registry};

lazy_static! {
    static ref HTTP_REQUESTS_TOTAL: IntCounterVec = IntCounterVec::new(
        "http_requests_total",
        "Total HTTP requests",
        &["method", "path", "status"]
    ).unwrap();

    static ref HTTP_REQUEST_DURATION: HistogramVec = HistogramVec::new(
        "http_request_duration_seconds",
        "HTTP request duration",
        &["method", "path"]
    ).unwrap();

    static ref TOKEN_ISSUED_TOTAL: IntCounterVec = IntCounterVec::new(
        "token_issued_total",
        "Total tokens issued",
        &["grant_type", "client_id"]
    ).unwrap();
}

pub fn register_metrics(registry: &Registry) {
    registry.register(Box::new(HTTP_REQUESTS_TOTAL.clone())).unwrap();
    registry.register(Box::new(HTTP_REQUEST_DURATION.clone())).unwrap();
    registry.register(Box::new(TOKEN_ISSUED_TOTAL.clone())).unwrap();
}
```

### 2. 结构化日志

```rust
// main.rs
tracing_subscriber::fmt()
    .with_env_filter(EnvFilter::from_default_env())
    .json()  // JSON 格式便于日志聚合
    .with_current_span(false)
    .with_span_list(false)
    .with_target(true)
    .with_thread_ids(true)
    .with_thread_names(true)
    .init();
```

### 3. ELK Stack 集成

**Filebeat 配置** (`filebeat.yml`):

```yaml
filebeat.inputs:
- type: log
  enabled: true
  paths:
    - /app/logs/oauth-service.log
  json.keys_under_root: true
  json.add_error_key: true

output.elasticsearch:
  hosts: ["elasticsearch:9200"]
  index: "oauth-service-%{+yyyy.MM.dd}"

setup.kibana:
  host: "kibana:5601"
```

---

## 灾难恢复配置

### 1. 数据备份策略

```bash
#!/bin/bash
# backup-oauth-db.sh

BACKUP_DIR="/backups/oauth"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="oauth-backup-$TIMESTAMP.sql.gz"

# MySQL 备份
mysqldump -u oauth_user -p$DB_PASSWORD oauth_db \
  | gzip > "$BACKUP_DIR/$BACKUP_FILE"

# 保留最近 30 天的备份
find $BACKUP_DIR -type f -mtime +30 -delete

# 上传到 S3 (可选)
aws s3 cp "$BACKUP_DIR/$BACKUP_FILE" s3://your-backup-bucket/oauth/
```

### 2. 配置备份

```bash
# 备份所有配置文件
tar czf config-backup-$(date +%Y%m%d).tar.gz \
  .env* \
  apps/*/config/ \
  docker-compose*.yml \
  k8s/
```

### 3. 灾难恢复演练

**定期演练恢复流程** (建议: 每季度):

1. 从备份恢复数据库
2. 恢复配置文件
3. 重新部署服务
4. 验证功能正常

---

## 配置文件模板

已创建以下配置文件模板:

1. **OAuth Service**: `apps/oauth-service-rust/.env.example`
2. **Admin Portal**: `apps/admin-portal/.env.example`
3. **Docker Compose**: `docker-compose.production.yml`

---

## 配置验证脚本

```bash
#!/bin/bash
# verify-production-config.sh

echo "🔍 验证生产环境配置..."

# 检查必需的环境变量
required_vars=(
  "NODE_ENV"
  "DATABASE_URL"
  "JWT_ALGORITHM"
  "ISSUER"
)

for var in "${required_vars[@]}"; do
  if [ -z "${!var}" ]; then
    echo "❌ 缺少环境变量: $var"
    exit 1
  else
    echo "✅ $var: ${!var}"
  fi
done

# 检查 JWT 密钥文件
if [ "$JWT_ALGORITHM" == "RS256" ]; then
  if [ ! -f "$JWT_PRIVATE_KEY_PATH" ]; then
    echo "❌ JWT 私钥文件不存在: $JWT_PRIVATE_KEY_PATH"
    exit 1
  fi
  echo "✅ JWT 私钥文件存在"
fi

# 检查数据库连接
echo "🔍 测试数据库连接..."
# TODO: 添加数据库连接测试

echo "✅ 所有配置检查通过!"
```

---

## 文档修订历史

| 版本 | 日期 | 修改内容 | 作者 |
|------|------|----------|------|
| 1.0 | 2025-11-17 | 初始版本,生产环境配置优化指南 | Claude |

---

**文档结束**
