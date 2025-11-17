# 生产环境部署和运维文档

**版本**: 1.0
**最后更新**: 2024-11-12
**适用环境**: 生产环境

---

## 目录

1. [系统要求](#系统要求)
2. [部署架构](#部署架构)
3. [部署前检查](#部署前检查)
4. [部署步骤](#部署步骤)
5. [环境变量配置](#环境变量配置)
6. [数据库迁移](#数据库迁移)
7. [SSL/TLS 配置](#ssltls-配置)
8. [负载均衡配置](#负载均衡配置)
9. [监控和日志](#监控和日志)
10. [备份策略](#备份策略)
11. [故障排除](#故障排除)
12. [安全加固](#安全加固)

---

## 系统要求

### 硬件要求

#### 最小配置（测试环境）
- **CPU**: 2 核
- **内存**: 4 GB
- **存储**: 20 GB SSD
- **网络**: 10 Mbps

#### 推荐配置（生产环境）
- **CPU**: 4 核 以上
- **内存**: 8 GB 以上
- **存储**: 50 GB SSD 以上
- **网络**: 100 Mbps 以上

#### 高可用配置
- **CPU**: 8 核 以上（每个服务实例 2 核）
- **内存**: 16 GB 以上
- **存储**: 100 GB SSD 以上（RAID 10）
- **网络**: 1 Gbps 以上

### 软件要求

#### 操作系统
- ✅ **Ubuntu**: 20.04 LTS / 22.04 LTS / 24.04 LTS
- ✅ **Debian**: 11 / 12
- ✅ **CentOS**: 8 Stream / 9 Stream
- ✅ **RHEL**: 8 / 9

#### 运行时
- **Node.js**: v20.x LTS 或更高
- **Rust**: 1.88.0 或更高
- **pnpm**: 10.x 或更高

#### 数据库
- **开发/小规模**: SQLite 3.35+
- **生产环境**: PostgreSQL 14+ 或 MySQL 8.0+

#### 其他依赖
- **Git**: 用于代码部署
- **Systemd**: 用于服务管理
- **Nginx**: 反向代理（可选，推荐用 Pingora）
- **Docker**: 容器化部署（可选）

---

## 部署架构

### 单服务器架构（小规模）

```
┌─────────────────────────────────────────────────────────────┐
│                      物理服务器                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Pingora (端口 443/6188)                │   │
│  │                  SSL Termination                     │   │
│  └──────────────────────┬──────────────────────────────┘   │
│                         │                                    │
│           ┌─────────────┴─────────────┐                     │
│           │                           │                     │
│  ┌────────▼──────────┐      ┌────────▼──────────┐         │
│  │ OAuth Service     │      │ Admin Portal      │         │
│  │ Rust (3001)       │      │ Next.js (3002)    │         │
│  └────────┬──────────┘      └───────────────────┘         │
│           │                                                  │
│  ┌────────▼──────────┐                                     │
│  │ SQLite / Postgres │                                     │
│  │ Database          │                                     │
│  └───────────────────┘                                     │
└─────────────────────────────────────────────────────────────┘
```

**适用场景**:
- < 1,000 用户
- < 100 并发请求
- 非关键业务

**优点**:
- 部署简单
- 成本低
- 维护方便

**缺点**:
- 无高可用
- 单点故障

---

### 高可用架构（大规模）

```
┌─────────────────────────────────────────────────────────────┐
│                       负载均衡器                             │
│                 (Nginx / HAProxy / AWS ELB)                 │
└──────────────────────┬──────────────────────────────────────┘
                       │
         ┌─────────────┴─────────────┐
         │                           │
┌────────▼──────────┐      ┌─────────▼─────────┐
│   Pingora 实例 1  │      │   Pingora 实例 2  │
│   (端口 6188)     │      │   (端口 6188)     │
└────────┬──────────┘      └─────────┬─────────┘
         │                           │
         └─────────────┬─────────────┘
                       │
         ┌─────────────┴─────────────┐
         │                           │
┌────────▼──────────┐      ┌─────────▼─────────┐
│ OAuth Service 1   │      │ OAuth Service 2   │
│ Rust (3001)       │      │ Rust (3001)       │
└────────┬──────────┘      └─────────┬─────────┘
         │                           │
         └─────────────┬─────────────┘
                       │
         ┌─────────────┴─────────────┐
         │                           │
┌────────▼──────────┐      ┌─────────▼─────────┐
│ Admin Portal 1    │      │ Admin Portal 2    │
│ Next.js (3002)    │      │ Next.js (3002)    │
└───────────────────┘      └───────────────────┘
                       │
         ┌─────────────┴─────────────┐
         │                           │
┌────────▼──────────┐      ┌─────────▼─────────┐
│ PostgreSQL 主节点 │◄────►│ PostgreSQL 从节点 │
│ (5432)            │      │ (5432) 只读副本   │
└───────────────────┘      └───────────────────┘
         │
┌────────▼──────────┐
│ Redis 集群        │
│ (缓存 + Session)  │
└───────────────────┘
```

**适用场景**:
- \> 10,000 用户
- \> 1,000 并发请求
- 关键业务

**优点**:
- 高可用（99.9%+）
- 水平扩展
- 故障自动转移

**缺点**:
- 复杂度高
- 成本高

---

## 部署前检查

### 1. 安全检查清单

- [ ] 修改所有默认密码（admin/admin123）
- [ ] 生成生产级 JWT 密钥对（RS256, 2048位）
- [ ] 更新 OAuth client_secret（至少 32 字符）
- [ ] 配置 HTTPS（SSL/TLS 证书）
- [ ] 启用防火墙（仅开放必要端口）
- [ ] 配置 IP 白名单（如果适用）
- [ ] 禁用测试/演示账户
- [ ] 启用审计日志
- [ ] 配置 CORS 策略
- [ ] 设置速率限制

### 2. 配置检查清单

- [ ] 数据库连接字符串（生产数据库）
- [ ] JWT 密钥路径（私钥 + 公钥）
- [ ] 重定向 URI（生产域名）
- [ ] 日志级别（ERROR 或 WARN）
- [ ] 会话过期时间
- [ ] Token 有效期配置
- [ ] SMTP 邮件配置（密码重置）
- [ ] 备份策略配置

### 3. 性能检查清单

- [ ] 数据库连接池大小
- [ ] 缓存配置（Redis 或内存）
- [ ] 静态资源 CDN 配置
- [ ] Gzip/Brotli 压缩
- [ ] HTTP/2 启用
- [ ] 数据库索引优化
- [ ] 定期清理过期数据

---

## 部署步骤

### 方式 1: 系统服务部署（推荐）

#### 步骤 1: 准备服务器

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装依赖
sudo apt install -y build-essential pkg-config libssl-dev

# 安装 Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 安装 pnpm
curl -fsSL https://get.pnpm.io/install.sh | sh -

# 安装 Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source $HOME/.cargo/env
```

#### 步骤 2: 克隆代码

```bash
# 创建部署目录
sudo mkdir -p /opt/oauth-platform
sudo chown $USER:$USER /opt/oauth-platform

# 克隆代码
cd /opt/oauth-platform
git clone https://github.com/your-org/ts-next.git .
git checkout main  # 或生产分支
```

#### 步骤 3: 配置环境变量

```bash
# OAuth Service 配置
cd /opt/oauth-platform/apps/oauth-service-rust
cat > .env << 'EOF'
DATABASE_URL=postgres://oauth_user:secure_password@localhost:5432/oauth_db
RUST_LOG=warn
JWT_PRIVATE_KEY_PATH=/opt/oauth-platform/keys/private.pem
JWT_PUBLIC_KEY_PATH=/opt/oauth-platform/keys/public.pem
JWT_ALGORITHM=RS256
ISSUER=https://auth.yourdomain.com
SKIP_DB_INIT=true
EOF

# Admin Portal 配置
cd /opt/oauth-platform/apps/admin-portal
cat > .env.production << 'EOF'
NEXT_PUBLIC_OAUTH_SERVICE_URL=https://api.yourdomain.com
NEXT_PUBLIC_OAUTH_CLIENT_ID=admin-portal-prod
NEXT_PUBLIC_OAUTH_REDIRECT_URI=https://admin.yourdomain.com/auth/callback
NODE_ENV=production
EOF
```

#### 步骤 4: 生成 JWT 密钥

```bash
# 创建密钥目录
mkdir -p /opt/oauth-platform/keys

# 生成 RS256 密钥对（2048位）
openssl genrsa -out /opt/oauth-platform/keys/private.pem 2048
openssl rsa -in /opt/oauth-platform/keys/private.pem -pubout -out /opt/oauth-platform/keys/public.pem

# 设置权限
chmod 600 /opt/oauth-platform/keys/private.pem
chmod 644 /opt/oauth-platform/keys/public.pem
```

#### 步骤 5: 初始化数据库

```bash
# 安装 PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# 创建数据库用户和数据库
sudo -u postgres psql << EOF
CREATE USER oauth_user WITH PASSWORD 'secure_password';
CREATE DATABASE oauth_db OWNER oauth_user;
GRANT ALL PRIVILEGES ON DATABASE oauth_db TO oauth_user;
EOF

# 运行迁移脚本
cd /opt/oauth-platform/apps/oauth-service-rust
psql -U oauth_user -d oauth_db -f migrations/001_initial_schema.sql
psql -U oauth_user -d oauth_db -f migrations/002_seed_data.sql
psql -U oauth_user -d oauth_db -f migrations/003_init_admin_portal_client.sql
```

#### 步骤 6: 构建应用

```bash
# 安装依赖
cd /opt/oauth-platform
pnpm install

# 构建 Admin Portal
pnpm --filter=admin-portal build

# 构建 OAuth Service (Release)
cd /opt/oauth-platform/apps/oauth-service-rust
cargo build --release

# 构建 Pingora Proxy (Release)
cd /opt/oauth-platform/apps/pingora-proxy
cargo build --release
```

#### 步骤 7: 创建 Systemd 服务

**OAuth Service**:

```bash
sudo tee /etc/systemd/system/oauth-service.service > /dev/null << 'EOF'
[Unit]
Description=OAuth Service Rust
After=network.target postgresql.service

[Service]
Type=simple
User=oauth
Group=oauth
WorkingDirectory=/opt/oauth-platform/apps/oauth-service-rust
Environment="RUST_LOG=warn"
ExecStart=/opt/oauth-platform/apps/oauth-service-rust/target/release/oauth-service-rust
Restart=always
RestartSec=10

# 安全加固
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/oauth-platform/apps/oauth-service-rust

[Install]
WantedBy=multi-user.target
EOF
```

**Admin Portal**:

```bash
sudo tee /etc/systemd/system/admin-portal.service > /dev/null << 'EOF'
[Unit]
Description=Admin Portal Next.js
After=network.target

[Service]
Type=simple
User=oauth
Group=oauth
WorkingDirectory=/opt/oauth-platform/apps/admin-portal
Environment="NODE_ENV=production"
Environment="PORT=3002"
ExecStart=/usr/bin/pnpm start
Restart=always
RestartSec=10

# 安全加固
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
```

**Pingora Proxy**:

```bash
sudo tee /etc/systemd/system/pingora-proxy.service > /dev/null << 'EOF'
[Unit]
Description=Pingora Reverse Proxy
After=network.target

[Service]
Type=simple
User=oauth
Group=oauth
WorkingDirectory=/opt/oauth-platform/apps/pingora-proxy
ExecStart=/opt/oauth-platform/apps/pingora-proxy/target/release/pingora-proxy
Restart=always
RestartSec=10

# 安全加固
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
```

#### 步骤 8: 创建服务用户

```bash
# 创建专用用户（无登录权限）
sudo useradd -r -s /bin/false oauth

# 设置目录权限
sudo chown -R oauth:oauth /opt/oauth-platform
```

#### 步骤 9: 启动服务

```bash
# 重新加载 systemd
sudo systemctl daemon-reload

# 启动服务
sudo systemctl start oauth-service
sudo systemctl start admin-portal
sudo systemctl start pingora-proxy

# 设置开机自启
sudo systemctl enable oauth-service
sudo systemctl enable admin-portal
sudo systemctl enable pingora-proxy

# 检查状态
sudo systemctl status oauth-service
sudo systemctl status admin-portal
sudo systemctl status pingora-proxy
```

#### 步骤 10: 验证部署

```bash
# 检查 OAuth Service
curl http://localhost:3001/health
# 应返回: OK

# 检查 Admin Portal
curl http://localhost:3002/health
# 应返回 HTML

# 检查 Pingora
curl http://localhost:6188/health
# 应返回 HTML（Admin Portal）

# 检查 OAuth API 路由
curl http://localhost:6188/api/v2/oauth/authorize?client_id=test
# 应返回 400 错误（参数缺失，但路由正常）
```

---

### 方式 2: Docker 部署

#### Docker Compose 配置

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: oauth-db
    environment:
      POSTGRES_USER: oauth_user
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: oauth_db
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./apps/oauth-service-rust/migrations:/docker-entrypoint-initdb.d
    ports:
      - "5432:5432"
    restart: unless-stopped

  oauth-service:
    build:
      context: .
      dockerfile: apps/oauth-service-rust/Dockerfile
    container_name: oauth-service
    environment:
      DATABASE_URL: postgres://oauth_user:${DB_PASSWORD}@postgres:5432/oauth_db
      RUST_LOG: warn
      JWT_PRIVATE_KEY_PATH: /keys/private.pem
      JWT_PUBLIC_KEY_PATH: /keys/public.pem
    volumes:
      - ./keys:/keys:ro
    ports:
      - "3001:3001"
    depends_on:
      - postgres
    restart: unless-stopped

  admin-portal:
    build:
      context: .
      dockerfile: apps/admin-portal/Dockerfile
    container_name: admin-portal
    environment:
      NEXT_PUBLIC_OAUTH_SERVICE_URL: https://api.yourdomain.com
      NEXT_PUBLIC_OAUTH_CLIENT_ID: admin-portal-prod
      NEXT_PUBLIC_OAUTH_REDIRECT_URI: https://admin.yourdomain.com/auth/callback
      NODE_ENV: production
    ports:
      - "3002:3002"
    depends_on:
      - oauth-service
    restart: unless-stopped

  pingora:
    build:
      context: .
      dockerfile: apps/pingora-proxy/Dockerfile
    container_name: pingora
    ports:
      - "443:443"
      - "6188:6188"
    volumes:
      - ./apps/pingora-proxy/config:/app/config:ro
      - ./ssl:/ssl:ro
    depends_on:
      - oauth-service
      - admin-portal
    restart: unless-stopped

volumes:
  postgres_data:
```

#### 启动 Docker 部署

```bash
# 构建镜像
docker-compose build

# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

---

## 环境变量配置

### OAuth Service Rust

| 变量名 | 必需 | 默认值 | 说明 |
|--------|------|--------|------|
| `DATABASE_URL` | ✓ | - | 数据库连接字符串 |
| `RUST_LOG` | ✗ | info | 日志级别：error, warn, info, debug, trace |
| `JWT_PRIVATE_KEY_PATH` | ✓ | - | JWT 私钥路径 |
| `JWT_PUBLIC_KEY_PATH` | ✓ | - | JWT 公钥路径 |
| `JWT_ALGORITHM` | ✗ | RS256 | JWT 算法：HS256 或 RS256 |
| `ISSUER` | ✗ | http://localhost:3001 | JWT Issuer |
| `ACCESS_TOKEN_TTL` | ✗ | 3600 | Access Token 有效期（秒） |
| `REFRESH_TOKEN_TTL` | ✗ | 604800 | Refresh Token 有效期（秒） |
| `SKIP_DB_INIT` | ✗ | false | 跳过数据库初始化 |

### Admin Portal

| 变量名 | 必需 | 默认值 | 说明 |
|--------|------|--------|------|
| `NEXT_PUBLIC_OAUTH_SERVICE_URL` | ✓ | - | OAuth Service URL |
| `NEXT_PUBLIC_OAUTH_CLIENT_ID` | ✓ | - | OAuth 客户端 ID |
| `NEXT_PUBLIC_OAUTH_REDIRECT_URI` | ✓ | - | OAuth 回调 URI |
| `NODE_ENV` | ✗ | development | 环境：development, production |
| `PORT` | ✗ | 3000 | 监听端口 |

### Pingora Proxy

配置文件：`apps/pingora-proxy/config/production.yaml`

```yaml
services:
  - name: 'unified-gateway'
    bind_address: '0.0.0.0:443'
    default_backend: 'admin-portal'
    backends:
      admin-portal:
        upstreams:
          - '127.0.0.1:3002'
        tls: false
      oauth-service-rust:
        upstreams:
          - '127.0.0.1:3001'
        tls: false
    routes:
      - path_prefix: '/api/v2/'
        backend: 'oauth-service-rust'
    health_check:
      timeout_ms: 1000
      frequency_secs: 10
    tls:
      certificate: '/ssl/cert.pem'
      private_key: '/ssl/key.pem'
```

---

## 数据库迁移

### PostgreSQL 迁移

#### 从 SQLite 迁移到 PostgreSQL

1. **导出 SQLite 数据**:

```bash
sqlite3 dev.db .dump > sqlite_dump.sql
```

2. **转换为 PostgreSQL 格式**:

```bash
# 使用 pgloader
pgloader sqlite_dump.sql postgresql://oauth_user:password@localhost:5432/oauth_db
```

3. **手动调整**:

```sql
-- 修改自增 ID
ALTER TABLE users ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- 修改时间戳
ALTER TABLE users ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
```

#### 创建数据库备份

```bash
# 备份整个数据库
pg_dump -U oauth_user -d oauth_db -F c -b -v -f oauth_db_backup.dump

# 恢复数据库
pg_restore -U oauth_user -d oauth_db -v oauth_db_backup.dump
```

---

## SSL/TLS 配置

### 使用 Let's Encrypt（推荐）

```bash
# 安装 Certbot
sudo apt install -y certbot

# 申请证书
sudo certbot certonly --standalone \
  -d api.yourdomain.com \
  -d admin.yourdomain.com \
  --email your-email@example.com \
  --agree-tos

# 证书路径
# - 证书: /etc/letsencrypt/live/yourdomain.com/fullchain.pem
# - 私钥: /etc/letsencrypt/live/yourdomain.com/privkey.pem

# 自动续期（Cron Job）
echo "0 0 * * * root certbot renew --quiet && systemctl reload pingora-proxy" | sudo tee -a /etc/crontab
```

### Pingora TLS 配置

编辑 `apps/pingora-proxy/config/production.yaml`:

```yaml
services:
  - name: 'unified-gateway'
    bind_address: '0.0.0.0:443'
    tls:
      certificate: '/etc/letsencrypt/live/yourdomain.com/fullchain.pem'
      private_key: '/etc/letsencrypt/live/yourdomain.com/privkey.pem'
      min_version: 'TLS1.2'
      ciphers:
        - 'TLS_AES_128_GCM_SHA256'
        - 'TLS_AES_256_GCM_SHA384'
        - 'TLS_CHACHA20_POLY1305_SHA256'
```

---

## 负载均衡配置

### Nginx 负载均衡

```nginx
upstream pingora_backend {
    least_conn;  # 最少连接算法
    server 192.168.1.101:6188 max_fails=3 fail_timeout=30s;
    server 192.168.1.102:6188 max_fails=3 fail_timeout=30s;
    keepalive 32;
}

server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://pingora_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 监控和日志

### 日志管理

#### 日志路径

```
/opt/oauth-platform/logs/
├── oauth-service.log        # OAuth Service 日志
├── admin-portal.log         # Admin Portal 日志
├── pingora-proxy.log        # Pingora 日志
└── audit/                   # 审计日志目录
    └── YYYY-MM-DD.log
```

#### 日志轮转配置

创建 `/etc/logrotate.d/oauth-platform`:

```
/opt/oauth-platform/logs/*.log {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 oauth oauth
    sharedscripts
    postrotate
        systemctl reload oauth-service
        systemctl reload admin-portal
        systemctl reload pingora-proxy
    endscript
}
```

### Prometheus 监控

#### 安装 Prometheus

```bash
# 下载 Prometheus
wget https://github.com/prometheus/prometheus/releases/download/v2.45.0/prometheus-2.45.0.linux-amd64.tar.gz
tar -xzf prometheus-2.45.0.linux-amd64.tar.gz
sudo mv prometheus-2.45.0.linux-amd64 /opt/prometheus
```

#### Prometheus 配置

`/opt/prometheus/prometheus.yml`:

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'oauth-service'
    static_configs:
      - targets: ['localhost:3001']

  - job_name: 'admin-portal'
    static_configs:
      - targets: ['localhost:3002']

  - job_name: 'pingora'
    static_configs:
      - targets: ['localhost:6188']

  - job_name: 'postgres'
    static_configs:
      - targets: ['localhost:9187']
```

---

## 备份策略

### 数据库备份

#### 每日自动备份

```bash
#!/bin/bash
# /opt/oauth-platform/scripts/backup-database.sh

BACKUP_DIR="/backups/database"
DATE=$(date +%Y-%m-%d_%H-%M-%S)
BACKUP_FILE="$BACKUP_DIR/oauth_db_$DATE.dump"

mkdir -p $BACKUP_DIR

# 备份数据库
pg_dump -U oauth_user -d oauth_db -F c -b -v -f $BACKUP_FILE

# 压缩
gzip $BACKUP_FILE

# 删除 30 天前的备份
find $BACKUP_DIR -name "*.dump.gz" -mtime +30 -delete

echo "Backup completed: $BACKUP_FILE.gz"
```

#### Cron Job

```bash
# 每天凌晨 2 点执行备份
0 2 * * * /opt/oauth-platform/scripts/backup-database.sh >> /var/log/database-backup.log 2>&1
```

### 配置文件备份

```bash
#!/bin/bash
# /opt/oauth-platform/scripts/backup-config.sh

BACKUP_DIR="/backups/config"
DATE=$(date +%Y-%m-%d)

mkdir -p $BACKUP_DIR

# 备份配置文件
tar -czf $BACKUP_DIR/config_$DATE.tar.gz \
    /opt/oauth-platform/apps/oauth-service-rust/.env \
    /opt/oauth-platform/apps/admin-portal/.env.production \
    /opt/oauth-platform/apps/pingora-proxy/config/ \
    /opt/oauth-platform/keys/

# 删除 90 天前的备份
find $BACKUP_DIR -name "*.tar.gz" -mtime +90 -delete
```

---

## 故障排除

### 常见问题

#### 1. OAuth Service 无法启动

**症状**: `systemctl status oauth-service` 显示失败

**排查步骤**:

```bash
# 查看详细日志
sudo journalctl -u oauth-service -n 100 --no-pager

# 检查数据库连接
psql -U oauth_user -d oauth_db -c "SELECT 1"

# 检查 JWT 密钥权限
ls -la /opt/oauth-platform/keys/

# 手动运行测试
cd /opt/oauth-platform/apps/oauth-service-rust
RUST_LOG=debug ./target/release/oauth-service-rust
```

**解决方案**:
- 数据库连接失败 → 检查 DATABASE_URL
- 密钥读取失败 → 检查文件权限和路径
- 端口占用 → 使用 `lsof -i :3001` 查找占用进程

#### 2. Admin Portal 构建失败

**症状**: `pnpm build` 报错

**排查步骤**:

```bash
# 清理缓存
pnpm store prune
rm -rf node_modules .next

# 重新安装依赖
pnpm install

# 检查 Node.js 版本
node --version  # 应该是 v20.x

# 详细构建日志
pnpm build --verbose
```

#### 3. Pingora 路由不工作

**症状**: `/api/v2/` 请求返回 404

**排查步骤**:

```bash
# 检查 Pingora 日志
tail -f /opt/oauth-platform/apps/pingora-proxy/pingora.log

# 测试后端服务
curl http://localhost:3001/health
curl http://localhost:3002/health

# 检查配置文件
cat /opt/oauth-platform/apps/pingora-proxy/config/default.yaml

# 重启 Pingora
sudo systemctl restart pingora-proxy
```

---

## 安全加固

### 1. 防火墙配置

```bash
# UFW 配置
sudo ufw default deny incoming
sudo ufw default allow outgoing

# 允许 SSH
sudo ufw allow 22/tcp

# 允许 HTTPS
sudo ufw allow 443/tcp

# 启用防火墙
sudo ufw enable
```

### 2. Fail2ban 防暴力破解

```bash
# 安装 Fail2ban
sudo apt install -y fail2ban

# 配置 OAuth 服务保护
sudo tee /etc/fail2ban/jail.d/oauth.conf > /dev/null << 'EOF'
[oauth-login]
enabled = true
filter = oauth-login
logpath = /opt/oauth-platform/logs/oauth-service.log
maxretry = 5
bantime = 3600
findtime = 600
EOF

# 创建过滤规则
sudo tee /etc/fail2ban/filter.d/oauth-login.conf > /dev/null << 'EOF'
[Definition]
failregex = ^.*"error":"invalid_credentials".*"remote_addr":"<HOST>".*$
ignoreregex =
EOF

# 重启 Fail2ban
sudo systemctl restart fail2ban
```

### 3. 定期安全更新

```bash
# 启用自动安全更新
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

---

## 性能调优

### PostgreSQL 优化

编辑 `/etc/postgresql/14/main/postgresql.conf`:

```ini
# 内存配置
shared_buffers = 2GB
effective_cache_size = 6GB
maintenance_work_mem = 512MB
work_mem = 64MB

# 连接配置
max_connections = 200

# 写性能
wal_buffers = 16MB
checkpoint_completion_target = 0.9

# 查询优化
random_page_cost = 1.1
effective_io_concurrency = 200
```

### Rust 服务优化

编辑 `Cargo.toml`:

```toml
[profile.release]
opt-level = 3
lto = true
codegen-units = 1
panic = 'abort'
```

---

## 维护计划

### 日常维护（每日）
- [ ] 检查服务状态
- [ ] 查看错误日志
- [ ] 监控资源使用

### 每周维护
- [ ] 数据库备份验证
- [ ] 日志归档清理
- [ ] 性能指标审查

### 每月维护
- [ ] 安全更新
- [ ] 密码轮换
- [ ] 数据库优化（VACUUM）
- [ ] 证书续期检查

---

**最后更新**: 2024-11-12
**下次审查**: 2025-02-12
