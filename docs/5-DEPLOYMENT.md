# OAuth 2.1 系统 - 部署指南

**文档版本**: 1.0
**最后更新**: 2025-11-20
**目标环境**: Kubernetes / Docker Compose

---

## 快速开始 (Docker Compose)

### 开发环境

```bash
# 1. 克隆项目
git clone https://github.com/example/oauth-system.git
cd oauth-system

# 2. 构建镜像
docker-compose build

# 3. 启动服务
docker-compose up -d

# 4. 检查健康状态
curl http://localhost:6188/health
```

**服务访问地址**:
- Admin Portal: http://localhost:6188
- OAuth Service: http://localhost:6188/api/v2
- Pingora Proxy: http://localhost:6188

---

## Kubernetes 部署 (生产推荐)

### 前置条件

```bash
# 检查 kubectl 版本
kubectl version --client

# 检查集群连接
kubectl cluster-info
```

### 部署步骤

#### 1. 创建 Namespace

```bash
kubectl create namespace oauth-system
```

#### 2. 创建配置和密钥

```bash
# 创建 ConfigMap (配置文件)
kubectl create configmap oauth-config \
  --from-file=apps/oauth-service-rust/config/ \
  -n oauth-system

# 创建 Secret (敏感信息)
kubectl create secret generic oauth-secrets \
  --from-literal=jwt_private_key="$(cat keys/private_key.pem)" \
  --from-literal=jwt_public_key="$(cat keys/public_key.pem)" \
  --from-literal=db_password="CHANGE_ME_IN_PRODUCTION" \
  -n oauth-system
```

#### 3. 创建持久化卷 (数据库)

```yaml
# pvc.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: oauth-db-pvc
  namespace: oauth-system
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 20Gi
```

```bash
kubectl apply -f pvc.yaml
```

#### 4. 部署 OAuth Service

```yaml
# oauth-service-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: oauth-service
  namespace: oauth-system
spec:
  replicas: 3
  selector:
    matchLabels:
      app: oauth-service
  template:
    metadata:
      labels:
        app: oauth-service
    spec:
      containers:
      - name: oauth-service
        image: oauth-service:latest
        imagePullPolicy: Always
        ports:
        - containerPort: 3001
        env:
        - name: DATABASE_URL
          value: "sqlite:./oauth.db"
        - name: JWT_PRIVATE_KEY_PATH
          value: "/run/secrets/jwt_private_key"
        - name: JWT_PUBLIC_KEY_PATH
          value: "/run/secrets/jwt_public_key"
        volumeMounts:
        - name: db-storage
          mountPath: /data
        - name: secrets
          mountPath: /run/secrets
        livenessProbe:
          httpGet:
            path: /health
            port: 3001
          initialDelaySeconds: 10
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3001
          initialDelaySeconds: 5
          periodSeconds: 5
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
      volumes:
      - name: db-storage
        persistentVolumeClaim:
          claimName: oauth-db-pvc
      - name: secrets
        secret:
          secretName: oauth-secrets
```

```bash
kubectl apply -f oauth-service-deployment.yaml
```

#### 5. 创建 Service

```yaml
# oauth-service.yaml
apiVersion: v1
kind: Service
metadata:
  name: oauth-service
  namespace: oauth-system
spec:
  type: ClusterIP
  ports:
  - port: 3001
    targetPort: 3001
  selector:
    app: oauth-service
```

```bash
kubectl apply -f oauth-service.yaml
```

#### 6. 部署 Ingress (外部访问)

```yaml
# ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: oauth-ingress
  namespace: oauth-system
spec:
  ingressClassName: nginx
  rules:
  - host: auth.yourdomain.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: oauth-service
            port:
              number: 3001
  tls:
  - hosts:
    - auth.yourdomain.com
    secretName: oauth-tls-cert
```

---

## 环境变量配置

### OAuth Service (.env)

```bash
# 数据库
DATABASE_URL=sqlite:./oauth.db        # 开发
# DATABASE_URL=postgresql://user:pass@host:5432/oauth_db  # 生产（自托管 PostgreSQL）
# DATABASE_URL=postgresql://postgres.YOUR_PROJECT:PASSWORD@db.YOUR_PROJECT.supabase.co:5432/postgres?sslmode=require  # Supabase 云数据库

# JWT 配置
JWT_ALGORITHM=RS256
JWT_PRIVATE_KEY_PATH=./keys/private_key.pem
JWT_PUBLIC_KEY_PATH=./keys/public_key.pem

# 服务配置
ISSUER=https://auth.yourdomain.com
NODE_ENV=production
PORT=3001

# 日志
LOG_LEVEL=info
RUST_LOG=oauth_service=info,axum=warn

# CORS
CORS_ORIGIN=https://admin.yourdomain.com,https://yourdomain.com
```

### Admin Portal (.env.local)

```bash
NEXT_PUBLIC_OAUTH_CLIENT_ID=admin-portal-client
NEXT_PUBLIC_OAUTH_CLIENT_SECRET=your_secret_here
NEXT_PUBLIC_OAUTH_REDIRECT_URI=https://admin.yourdomain.com/auth/callback
NEXT_PUBLIC_API_BASE_URL=https://api.yourdomain.com/api/v2
NEXT_PUBLIC_OAUTH_SERVICE_URL=https://api.yourdomain.com/api/v2
```

---

## SSL/TLS 配置

### 生成自签名证书 (开发)

```bash
openssl req -x509 -newkey rsa:4096 -nodes \
  -out cert.pem -keyout key.pem -days 365
```

### Let's Encrypt 证书 (生产)

```bash
# 安装 Certbot
sudo apt-get install certbot

# 生成证书
sudo certbot certonly --standalone -d auth.yourdomain.com

# 证书位置
# /etc/letsencrypt/live/auth.yourdomain.com/fullchain.pem
# /etc/letsencrypt/live/auth.yourdomain.com/privkey.pem
```

---

## 健康检查

### OAuth Service

```bash
curl -v http://localhost:3001/health

Expected Response:
HTTP/1.1 200 OK
{
  "status": "healthy",
  "version": "1.0.0",
  "timestamp": "2025-11-20T10:30:00Z"
}
```

### Admin Portal

```bash
curl -v http://localhost:3002/health

Expected Response:
HTTP/1.1 200 OK
{
  "status": "ok",
  "uptime": 3600
}
```

---

## 数据库初始化（重要）

### 1. 运行数据库迁移

```bash
# SQLite (开发环境)
cd apps/oauth-service-rust
sqlx migrate run

# PostgreSQL (生产环境)
DATABASE_URL=postgresql://user:pass@host/db sqlx migrate run
```

### 2. 初始化系统角色和权限

运行初始化脚本（位于 `migrations/seed_system_roles.sql`）：

```sql
-- 插入系统角色
INSERT INTO roles (id, name, description, is_active) VALUES
    ('super_admin', 'Super Admin', '系统管理员，拥有所有权限', 1),
    ('admin', 'Admin', '业务管理员', 1),
    ('user', 'User', '普通用户', 1);

-- 插入权限
INSERT INTO permissions (id, code, description, category) VALUES
    ('perm_users_list', 'users:list', '列出用户', 'user_management'),
    ('perm_users_create', 'users:create', '创建用户', 'user_management'),
    ('perm_users_read', 'users:read', '读取用户详情', 'user_management'),
    ('perm_users_update', 'users:update', '更新用户', 'user_management'),
    ('perm_users_delete', 'users:delete', '删除用户', 'user_management'),
    ('perm_roles_manage', 'roles:manage', '管理角色', 'role_management'),
    ('perm_audit_view', 'audit:view', '查看审计日志', 'audit'),
    ('perm_audit_export', 'audit:export', '导出审计日志', 'audit');

-- 分配权限给 super_admin（所有权限）
INSERT INTO role_permissions (role_id, permission_id) VALUES
    ('super_admin', 'perm_users_list'),
    ('super_admin', 'perm_users_create'),
    ('super_admin', 'perm_users_read'),
    ('super_admin', 'perm_users_update'),
    ('super_admin', 'perm_users_delete'),
    ('super_admin', 'perm_roles_manage'),
    ('super_admin', 'perm_audit_view'),
    ('super_admin', 'perm_audit_export');

-- 分配权限给 admin（部分权限）
INSERT INTO role_permissions (role_id, permission_id) VALUES
    ('admin', 'perm_users_list'),
    ('admin', 'perm_users_create'),
    ('admin', 'perm_users_read'),
    ('admin', 'perm_users_update'),
    ('admin', 'perm_users_delete'),
    ('admin', 'perm_audit_view');
```

### 3. 创建初始管理员用户

```bash
# 使用管理脚本创建第一个用户
cargo run --bin create-admin -- --username admin --password admin123 --email admin@example.com

# 分配 super_admin 角色
INSERT INTO user_roles (user_id, role_id) VALUES
    ((SELECT id FROM users WHERE username = 'admin'), 'super_admin');
```

**⚠️ 重要**: 生产环境必须修改默认密码！

---

## 数据库迁移

### 初始化数据库

```bash
# 使用 SQLite (开发)
cd apps/oauth-service-rust
sqlx database create
sqlx migrate run

# 使用 PostgreSQL (生产 - 自托管)
# 确保 DATABASE_URL 环境变量已设置
sqlx database create
sqlx migrate run

# 使用 Supabase (生产 - 云数据库)
# 1. 在 Supabase 项目中创建数据库表
# 2. 设置 DATABASE_URL 为 Supabase 连接字符串
# 3. 运行迁移: sqlx migrate run
```

### 跨数据库兼容性验证

数据库迁移脚本使用数据库无关的语法，避免特定数据库的语法：

**避免的语法**:
- SQLite 特定：`AUTOINCREMENT`
- PostgreSQL 特定：`SERIAL`, `RETURNING *`

**推荐做法**:

```bash
# 使用 sqlx-cli 的跨数据库迁移功能
sqlx migrate add --source migrations create_users_table
```

**验证迁移脚本**:

```bash
# 测试 SQLite
DATABASE_URL=sqlite:./test.db sqlx migrate run
sqlx migrate info

# 测试 PostgreSQL
DATABASE_URL=postgresql://localhost/test sqlx migrate run
sqlx migrate info

# 确保两个数据库的迁移状态一致
```

**数据库兼容性检查清单**:
- [ ] 使用标准 SQL 类型 (TEXT, INTEGER, DATETIME)
- [ ] 避免数据库特定函数 (NOW() vs CURRENT_TIMESTAMP)
- [ ] 外键约束语法统一
- [ ] 索引创建语法通用
- [ ] 测试 SQLite 和 PostgreSQL 双环境

---

## 备份策略

### SQLite 备份 (开发环境)

```bash
# 每日备份脚本
#!/bin/bash
BACKUP_DIR="/backups/oauth"
DATE=$(date +%Y%m%d)
sqlite3 oauth.db ".backup $BACKUP_DIR/oauth_$DATE.db"

# 添加到 cron
0 2 * * * /scripts/backup.sh  # 每天凌晨 2 点备份
```

### PostgreSQL 备份 (生产环境)

```bash
# 使用 pg_dump 备份
pg_dump -h localhost -U postgres -d oauth_db > oauth_$DATE.sql

# Supabase 云备份
# Supabase 自动提供日备份和时间点恢复功能
# 访问 Supabase 仪表板 > Backups 查看备份
```

### 备份保留策略

- 每日备份: 保留 7 天
- 每周备份: 保留 4 周
- 每月备份: 保留 12 个月

---

## 监控和告警

### Prometheus 指标

```yaml
# prometheus-config.yaml
global:
  scrape_interval: 15s
scrape_configs:
  - job_name: 'oauth-service'
    static_configs:
      - targets: ['localhost:3001']
  - job_name: 'admin-portal'
    static_configs:
      - targets: ['localhost:3002']
```

### 关键指标

```
# 请求延迟
http_request_duration_seconds
  - quantile (p50, p95, p99)

# 错误率
http_requests_total{status="5xx"}

# Token 生成率
tokens_issued_total

# 权限检查缓存命中率
permission_cache_hit_rate
```

---

## 故障恢复

### 数据库恢复

```bash
# 从备份恢复
cp backup/oauth_20251120.db oauth.db

# 验证数据库
sqlite3 oauth.db "SELECT COUNT(*) FROM users;"
```

### 服务重启

```bash
# 重启 OAuth Service
kubectl restart deployment oauth-service -n oauth-system

# 检查状态
kubectl get pods -n oauth-system
```

---

**文档完成日期**: 2025-11-20
**下一次审查**: 2026-02-20
