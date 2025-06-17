# 部署和运维文档

> **文档版本**: v1.0.0  
> **创建日期**: 2024-01-20  
> **最后更新**: 2024-01-20  
> **文档状态**: 正式版  
> **维护团队**: 运维团队

## 文档摘要

本文档详细描述了OAuth2.1认证授权中心的部署流程、环境配置、监控方案、故障处理和运维最佳实践，确保系统的高可用性、安全性和可维护性。

## 目录

- [1. 系统架构](#1-系统架构)
- [2. 环境要求](#2-环境要求)
- [3. 部署流程](#3-部署流程)
- [4. 配置管理](#4-配置管理)
- [5. 监控方案](#5-监控方案)
- [6. 日志管理](#6-日志管理)
- [7. 备份策略](#7-备份策略)
- [8. 安全运维](#8-安全运维)
- [9. 故障处理](#9-故障处理)
- [10. 性能优化](#10-性能优化)

## 1. 系统架构

### 1.1 整体架构

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Load Balancer │    │   Web Gateway   │    │   API Gateway   │
│    (Nginx)      │────│   (Nginx)       │────│   (Kong/Envoy)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Application Layer                        │
├─────────────────┬─────────────────┬─────────────────────────────┤
│   Next.js App   │   Auth Service  │      Permission Service     │
│   (Frontend)    │   (OAuth2.1)    │         (RBAC)              │
└─────────────────┴─────────────────┴─────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Data Layer                              │
├─────────────────┬─────────────────┬─────────────────────────────┤
│   PostgreSQL    │      Redis      │        File Storage         │
│   (Primary DB)  │    (Cache)      │        (MinIO/S3)           │
└─────────────────┴─────────────────┴─────────────────────────────┘
```

### 1.2 部署拓扑

```
生产环境:
├── 负载均衡层 (2台)
│   ├── Nginx Primary
│   └── Nginx Secondary
├── 应用层 (3台)
│   ├── App Server 1
│   ├── App Server 2
│   └── App Server 3
├── 数据层
│   ├── PostgreSQL Cluster (1主2从)
│   ├── Redis Cluster (3主3从)
│   └── MinIO Cluster (4节点)
└── 基础监控
    ├── 应用日志
    ├── 健康检查
    └── 基础指标
```

## 2. 环境要求

### 2.1 硬件要求

#### 2.1.1 生产环境

| 组件         | CPU  | 内存 | 存储      | 网络   | 数量 |
| ------------ | ---- | ---- | --------- | ------ | ---- |
| 负载均衡     | 4核  | 8GB  | 100GB SSD | 1Gbps  | 2台  |
| 应用服务器   | 8核  | 16GB | 200GB SSD | 1Gbps  | 3台  |
| 数据库主节点 | 16核 | 32GB | 1TB SSD   | 10Gbps | 1台  |
| 数据库从节点 | 8核  | 16GB | 1TB SSD   | 1Gbps  | 2台  |
| Redis节点    | 4核  | 16GB | 200GB SSD | 1Gbps  | 6台  |
| 日志节点     | 4核  | 8GB  | 200GB SSD | 1Gbps  | 1台  |

#### 2.1.2 测试环境

| 组件       | CPU | 内存 | 存储      | 网络  | 数量 |
| ---------- | --- | ---- | --------- | ----- | ---- |
| 应用服务器 | 4核 | 8GB  | 100GB SSD | 1Gbps | 2台  |
| 数据库     | 4核 | 8GB  | 200GB SSD | 1Gbps | 1台  |
| Redis      | 2核 | 4GB  | 50GB SSD  | 1Gbps | 1台  |

### 2.2 软件要求

```bash
# 操作系统
Ubuntu 22.04 LTS / CentOS 8 / RHEL 8

# 运行时环境
Node.js >= 18.17.0
npm >= 9.0.0
Docker >= 24.0.0
Docker Compose >= 2.20.0

# 数据库
PostgreSQL >= 14.0
Redis >= 7.0

# 反向代理
Nginx >= 1.22

# 基础监控工具
Docker >= 20.10
Docker Compose >= 2.0
Elasticsearch >= 8.0
Logstash >= 8.0
Kibana >= 8.0
```

## 3. 部署流程

### 3.1 环境准备

#### 3.1.1 系统初始化

```bash
#!/bin/bash
# 系统初始化脚本

# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装基础工具
sudo apt install -y curl wget git vim htop iotop net-tools

# 配置时区
sudo timedatectl set-timezone Asia/Shanghai

# 配置NTP
sudo apt install -y ntp
sudo systemctl enable ntp
sudo systemctl start ntp

# 配置防火墙
sudo ufw enable
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# 优化内核参数
echo 'net.core.somaxconn = 65535' | sudo tee -a /etc/sysctl.conf
echo 'net.ipv4.tcp_max_syn_backlog = 65535' | sudo tee -a /etc/sysctl.conf
echo 'fs.file-max = 1000000' | sudo tee -a /etc/sysctl.conf
sudo sysctl -p

# 配置文件描述符限制
echo '* soft nofile 65535' | sudo tee -a /etc/security/limits.conf
echo '* hard nofile 65535' | sudo tee -a /etc/security/limits.conf
```

#### 3.1.2 Docker环境

```bash
#!/bin/bash
# Docker安装脚本

# 安装Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# 配置Docker用户组
sudo usermod -aG docker $USER

# 安装Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 配置Docker镜像加速
sudo mkdir -p /etc/docker
cat <<EOF | sudo tee /etc/docker/daemon.json
{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com"
  ],
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "100m",
    "max-file": "3"
  },
  "storage-driver": "overlay2"
}
EOF

# 启动Docker服务
sudo systemctl enable docker
sudo systemctl start docker
```

### 3.2 应用部署

#### 3.2.1 Docker Compose配置

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  app:
    image: oauth2-auth-center:latest
    container_name: oauth2-app
    restart: unless-stopped
    ports:
      - '3000:3000'
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
      - JWT_SECRET=${JWT_SECRET}
      - OAUTH_CLIENT_SECRET=${OAUTH_CLIENT_SECRET}
    volumes:
      - ./logs:/app/logs
      - ./uploads:/app/uploads
    depends_on:
      - postgres
      - redis
    networks:
      - oauth2-network
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:3000/health']
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  postgres:
    image: postgres:14-alpine
    container_name: oauth2-postgres
    restart: unless-stopped
    environment:
      - POSTGRES_DB=${POSTGRES_DB}
      - POSTGRES_USER=${POSTGRES_USER}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./backups:/backups
    ports:
      - '5432:5432'
    networks:
      - oauth2-network
    command: >
      postgres
      -c max_connections=200
      -c shared_buffers=256MB
      -c effective_cache_size=1GB
      -c maintenance_work_mem=64MB
      -c checkpoint_completion_target=0.9
      -c wal_buffers=16MB
      -c default_statistics_target=100

  redis:
    image: redis:7-alpine
    container_name: oauth2-redis
    restart: unless-stopped
    ports:
      - '6379:6379'
    volumes:
      - redis_data:/data
      - ./redis.conf:/usr/local/etc/redis/redis.conf
    networks:
      - oauth2-network
    command: redis-server /usr/local/etc/redis/redis.conf

  nginx:
    image: nginx:alpine
    container_name: oauth2-nginx
    restart: unless-stopped
    ports:
      - '80:80'
      - '443:443'
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
      - ./logs/nginx:/var/log/nginx
    depends_on:
      - app
    networks:
      - oauth2-network

  # 基础健康检查服务（可选）
  healthcheck:
    image: nginx:alpine
    container_name: oauth2-healthcheck
    restart: unless-stopped
    ports:
      - '8080:80'
    volumes:
      - ./healthcheck.html:/usr/share/nginx/html/index.html
    networks:
      - oauth2-network

volumes:
  postgres_data:
  redis_data:

networks:
  oauth2-network:
    driver: bridge
```

#### 3.2.2 部署脚本

```bash
#!/bin/bash
# deploy.sh - 应用部署脚本

set -e

# 配置变量
APP_NAME="oauth2-auth-center"
DOCKER_REGISTRY="your-registry.com"
VERSION=${1:-latest}
ENVIRONMENT=${2:-production}

echo "开始部署 $APP_NAME:$VERSION 到 $ENVIRONMENT 环境"

# 1. 拉取最新代码
echo "拉取最新代码..."
git pull origin main

# 2. 构建Docker镜像
echo "构建Docker镜像..."
docker build -t $DOCKER_REGISTRY/$APP_NAME:$VERSION .
docker tag $DOCKER_REGISTRY/$APP_NAME:$VERSION $DOCKER_REGISTRY/$APP_NAME:latest

# 3. 推送镜像到仓库
echo "推送镜像到仓库..."
docker push $DOCKER_REGISTRY/$APP_NAME:$VERSION
docker push $DOCKER_REGISTRY/$APP_NAME:latest

# 4. 备份当前数据
echo "备份数据库..."
./scripts/backup-database.sh

# 5. 停止旧服务
echo "停止旧服务..."
docker-compose -f docker-compose.prod.yml down

# 6. 拉取新镜像
echo "拉取新镜像..."
docker-compose -f docker-compose.prod.yml pull

# 7. 运行数据库迁移
echo "运行数据库迁移..."
docker-compose -f docker-compose.prod.yml run --rm app npm run db:migrate

# 8. 启动新服务
echo "启动新服务..."
docker-compose -f docker-compose.prod.yml up -d

# 9. 健康检查
echo "等待服务启动..."
sleep 30

echo "执行健康检查..."
for i in {1..10}; do
  if curl -f http://localhost:3000/health; then
    echo "服务启动成功！"
    break
  else
    echo "等待服务启动... ($i/10)"
    sleep 10
  fi
done

# 10. 清理旧镜像
echo "清理旧镜像..."
docker image prune -f

echo "部署完成！"
```

### 3.3 Nginx配置

```nginx
# nginx.conf
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
    use epoll;
    multi_accept on;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # 日志格式
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for" '
                    '$request_time $upstream_response_time';

    access_log /var/log/nginx/access.log main;

    # 基础配置
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    client_max_body_size 100M;

    # Gzip压缩
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/json
        application/javascript
        application/xml+rss
        application/atom+xml
        image/svg+xml;

    # 上游服务器
    upstream oauth2_app {
        least_conn;
        server app1:3000 max_fails=3 fail_timeout=30s;
        server app2:3000 max_fails=3 fail_timeout=30s;
        server app3:3000 max_fails=3 fail_timeout=30s;
        keepalive 32;
    }

    # HTTP重定向到HTTPS
    server {
        listen 80;
        server_name auth.example.com;
        return 301 https://$server_name$request_uri;
    }

    # HTTPS服务器
    server {
        listen 443 ssl http2;
        server_name auth.example.com;

        # SSL配置
        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/key.pem;
        ssl_session_timeout 1d;
        ssl_session_cache shared:SSL:50m;
        ssl_session_tickets off;

        # 现代SSL配置
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
        ssl_prefer_server_ciphers off;

        # HSTS
        add_header Strict-Transport-Security "max-age=63072000" always;

        # 安全头部
        add_header X-Frame-Options DENY;
        add_header X-Content-Type-Options nosniff;
        add_header X-XSS-Protection "1; mode=block";
        add_header Referrer-Policy "strict-origin-when-cross-origin";
        add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'; frame-ancestors 'none';";

        # 代理配置
        location / {
            proxy_pass http://oauth2_app;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
            proxy_connect_timeout 30s;
            proxy_send_timeout 30s;
            proxy_read_timeout 30s;
        }

        # 健康检查
        location /health {
            proxy_pass http://oauth2_app/health;
            access_log off;
        }

        # 静态文件缓存
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            proxy_pass http://oauth2_app;
            expires 1y;
            add_header Cache-Control "public, immutable";
        }

        # API限流
        location /api/ {
            limit_req zone=api burst=20 nodelay;
            proxy_pass http://oauth2_app;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }

    # 限流配置
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;
}
```

## 4. 配置管理

### 4.1 环境变量

```bash
# .env.production
# 应用配置
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# 数据库配置
DATABASE_URL=postgresql://username:password@postgres:5432/oauth2_db
DATABASE_POOL_MIN=5
DATABASE_POOL_MAX=20
DATABASE_TIMEOUT=30000

# Redis配置
REDIS_URL=redis://redis:6379/0
REDIS_PASSWORD=your_redis_password
REDIS_DB=0
REDIS_POOL_MIN=5
REDIS_POOL_MAX=20

# JWT配置
JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
JWT_ALGORITHM=RS256

# OAuth2配置
OAUTH_ISSUER=https://auth.example.com
OAUTH_CLIENT_SECRET=your_oauth_client_secret
OAUTH_AUTHORIZATION_CODE_EXPIRES_IN=600
OAUTH_ACCESS_TOKEN_EXPIRES_IN=3600
OAUTH_REFRESH_TOKEN_EXPIRES_IN=604800

# 加密配置
ENCRYPTION_KEY=your_32_character_encryption_key
HASH_SALT_ROUNDS=12

# 邮件配置
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=noreply@example.com
SMTP_PASSWORD=your_smtp_password
SMTP_FROM=OAuth2 Auth Center <noreply@example.com>

# 文件存储配置
FILE_STORAGE_TYPE=minio
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=your_minio_access_key
MINIO_SECRET_KEY=your_minio_secret_key
MINIO_BUCKET=oauth2-files

# 监控配置
PROMETHEUS_ENABLED=true
PROMETHEUS_PORT=9464
LOG_LEVEL=info
LOG_FORMAT=json

# 安全配置
RATE_LIMIT_WINDOW=900000
RATE_LIMIT_MAX=100
SESSION_SECRET=your_session_secret
CSRF_SECRET=your_csrf_secret

# 第三方服务
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
GRAFANA_PASSWORD=your_grafana_password
```

### 4.2 配置验证

```typescript
// config/validation.ts
import Joi from 'joi';

export const configSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').required(),
  PORT: Joi.number().port().default(3000),
  HOST: Joi.string().default('0.0.0.0'),

  // 数据库配置验证
  DATABASE_URL: Joi.string().uri().required(),
  DATABASE_POOL_MIN: Joi.number().min(1).default(5),
  DATABASE_POOL_MAX: Joi.number().min(1).default(20),

  // Redis配置验证
  REDIS_URL: Joi.string().uri().required(),
  REDIS_PASSWORD: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),

  // JWT配置验证
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),

  // OAuth2配置验证
  OAUTH_ISSUER: Joi.string().uri().required(),
  OAUTH_CLIENT_SECRET: Joi.string().min(32).required(),

  // 安全配置验证
  ENCRYPTION_KEY: Joi.string().length(32).required(),
  HASH_SALT_ROUNDS: Joi.number().min(10).max(15).default(12),

  // 监控配置验证
  SENTRY_DSN: Joi.string().uri().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
});

// 配置加载和验证
export function loadConfig() {
  const { error, value } = configSchema.validate(process.env, {
    allowUnknown: true,
    stripUnknown: true,
  });

  if (error) {
    throw new Error(`配置验证失败: ${error.message}`);
  }

  return value;
}
```

## 5. 基础监控方案

### 5.1 健康检查配置

```typescript
// lib/health.ts
export interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  services: {
    database: boolean;
    redis: boolean;
    application: boolean;
  };
  uptime: number;
}

export async function checkHealth(): Promise<HealthStatus> {
  const checks = {
    database: await checkDatabase(),
    redis: await checkRedis(),
    application: true,
  };

  const allHealthy = Object.values(checks).every(Boolean);

  return {
    status: allHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    services: checks,
    uptime: process.uptime(),
  };
}

async function checkDatabase(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

async function checkRedis(): Promise<boolean> {
  try {
    await redis.ping();
    return true;
  } catch {
    return false;
  }
}
```

### 5.2 基础监控指标

```typescript
// lib/metrics.ts
export interface BasicMetrics {
  uptime: number;
  memoryUsage: NodeJS.MemoryUsage;
  activeConnections: number;
  requestCount: number;
  errorCount: number;
  responseTime: {
    avg: number;
    p95: number;
  };
}

export class MetricsCollector {
  private requestCount = 0;
  private errorCount = 0;
  private responseTimes: number[] = [];
  private startTime = Date.now();

  incrementRequest() {
    this.requestCount++;
  }

  incrementError() {
    this.errorCount++;
  }

  recordResponseTime(time: number) {
    this.responseTimes.push(time);
    // 保持最近1000个请求的响应时间
    if (this.responseTimes.length > 1000) {
      this.responseTimes.shift();
    }
  }

  getMetrics(): BasicMetrics {
    const sortedTimes = this.responseTimes.sort((a, b) => a - b);
    const avg =
      sortedTimes.length > 0 ? sortedTimes.reduce((a, b) => a + b, 0) / sortedTimes.length : 0;
    const p95Index = Math.floor(sortedTimes.length * 0.95);
    const p95 = sortedTimes[p95Index] || 0;

    return {
      uptime: Date.now() - this.startTime,
      memoryUsage: process.memoryUsage(),
      activeConnections: 0, // 从连接池获取
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      responseTime: { avg, p95 },
    };
  }

  reset() {
    this.requestCount = 0;
    this.errorCount = 0;
    this.responseTimes = [];
  }
}

// API端点
// GET /api/health - 健康检查
// GET /api/metrics - 基础指标
```

### 5.3 简单告警机制

```typescript
// lib/alerts.ts
export interface AlertRule {
  name: string;
  condition: (metrics: BasicMetrics) => boolean;
  message: string;
  severity: 'low' | 'medium' | 'high';
}

export const alertRules: AlertRule[] = [
  {
    name: 'high_error_rate',
    condition: (metrics) => {
      const errorRate = metrics.errorCount / metrics.requestCount;
      return errorRate > 0.05; // 5%错误率
    },
    message: '错误率超过5%',
    severity: 'high',
  },
  {
    name: 'high_response_time',
    condition: (metrics) => metrics.responseTime.p95 > 2000, // 2秒
    message: '95%响应时间超过2秒',
    severity: 'medium',
  },
  {
    name: 'high_memory_usage',
    condition: (metrics) => {
      const usedMB = metrics.memoryUsage.heapUsed / 1024 / 1024;
      return usedMB > 512; // 512MB
    },
    message: '内存使用超过512MB',
    severity: 'medium',
  },
];

export function checkAlerts(metrics: BasicMetrics): AlertRule[] {
  return alertRules.filter((rule) => rule.condition(metrics));
}
```

## 6. 日志管理

### 6.1 日志配置

```typescript
// lib/logger.ts
import winston from 'winston';
import 'winston-daily-rotate-file';

const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: {
    service: 'oauth2-auth-center',
    version: process.env.APP_VERSION || '1.0.0',
  },
  transports: [
    // 控制台输出
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
    }),

    // 错误日志文件
    new winston.transports.DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '14d',
      zippedArchive: true,
    }),

    // 应用日志文件
    new winston.transports.DailyRotateFile({
      filename: 'logs/app-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d',
      zippedArchive: true,
    }),

    // 审计日志文件
    new winston.transports.DailyRotateFile({
      filename: 'logs/audit-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'info',
      maxSize: '20m',
      maxFiles: '90d',
      zippedArchive: true,
      format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    }),
  ],
});

// 审计日志记录器
export const auditLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  defaultMeta: {
    type: 'audit',
    service: 'oauth2-auth-center',
  },
  transports: [
    new winston.transports.DailyRotateFile({
      filename: 'logs/audit-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '90d',
      zippedArchive: true,
    }),
  ],
});

export default logger;
```

### 6.2 日志轮转配置

```bash
# /etc/logrotate.d/oauth2-app
/app/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 0644 app app
    postrotate
        # 重新加载应用以使用新的日志文件
        docker exec oauth2-app kill -USR1 1
    endscript
}

# Nginx日志轮转
/var/log/nginx/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0644 nginx nginx
    postrotate
        nginx -s reload
    endscript
}
```

### 6.3 日志查看脚本

```bash
#!/bin/bash
# scripts/view-logs.sh

# 查看应用日志
view_app_logs() {
    echo "=== 应用日志 ==="
    tail -f /app/logs/app-$(date +%Y-%m-%d).log | jq .
}

# 查看错误日志
view_error_logs() {
    echo "=== 错误日志 ==="
    tail -f /app/logs/error-$(date +%Y-%m-%d).log | jq .
}

# 查看审计日志
view_audit_logs() {
    echo "=== 审计日志 ==="
    tail -f /app/logs/audit-$(date +%Y-%m-%d).log | jq .
}

# 搜索日志
search_logs() {
    local keyword=$1
    local date=${2:-$(date +%Y-%m-%d)}

    echo "搜索关键词: $keyword, 日期: $date"
    grep -i "$keyword" /app/logs/*-$date.log | jq .
}

# 统计错误
count_errors() {
    local date=${1:-$(date +%Y-%m-%d)}

    echo "错误统计 ($date):"
    grep '"level":"error"' /app/logs/error-$date.log | wc -l
}

case "$1" in
    "app") view_app_logs ;;
    "error") view_error_logs ;;
    "audit") view_audit_logs ;;
    "search") search_logs "$2" "$3" ;;
    "count") count_errors "$2" ;;
    *) echo "用法: $0 {app|error|audit|search <keyword> [date]|count [date]}" ;;
esac
```

## 7. 备份策略

### 7.1 数据库备份

```bash
#!/bin/bash
# scripts/backup-database.sh

set -e

# 配置变量
BACKUP_DIR="/backups/postgres"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30
DB_HOST="postgres"
DB_NAME="oauth2_db"
DB_USER="postgres"

# 创建备份目录
mkdir -p $BACKUP_DIR

echo "开始备份数据库: $DB_NAME"

# 全量备份
pg_dump -h $DB_HOST -U $DB_USER -d $DB_NAME -F c -b -v -f "$BACKUP_DIR/full_backup_$DATE.dump"

# 压缩备份文件
gzip "$BACKUP_DIR/full_backup_$DATE.dump"

echo "数据库备份完成: full_backup_$DATE.dump.gz"

# 清理过期备份
find $BACKUP_DIR -name "full_backup_*.dump.gz" -mtime +$RETENTION_DAYS -delete

echo "清理完成，保留最近 $RETENTION_DAYS 天的备份"

# 验证备份文件
if [ -f "$BACKUP_DIR/full_backup_$DATE.dump.gz" ]; then
    echo "备份验证成功"
else
    echo "备份验证失败" >&2
    exit 1
fi

# 上传到云存储（可选）
if [ "$UPLOAD_TO_S3" = "true" ]; then
    aws s3 cp "$BACKUP_DIR/full_backup_$DATE.dump.gz" "s3://$S3_BUCKET/database-backups/"
    echo "备份已上传到S3"
fi
```

### 7.2 Redis备份

```bash
#!/bin/bash
# scripts/backup-redis.sh

set -e

# 配置变量
BACKUP_DIR="/backups/redis"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=7
REDIS_HOST="redis"
REDIS_PORT=6379

# 创建备份目录
mkdir -p $BACKUP_DIR

echo "开始备份Redis数据"

# 触发Redis保存
redis-cli -h $REDIS_HOST -p $REDIS_PORT BGSAVE

# 等待保存完成
while [ $(redis-cli -h $REDIS_HOST -p $REDIS_PORT LASTSAVE) -eq $(redis-cli -h $REDIS_HOST -p $REDIS_PORT LASTSAVE) ]; do
    sleep 1
done

# 复制RDB文件
docker cp redis:/data/dump.rdb "$BACKUP_DIR/redis_backup_$DATE.rdb"

# 压缩备份文件
gzip "$BACKUP_DIR/redis_backup_$DATE.rdb"

echo "Redis备份完成: redis_backup_$DATE.rdb.gz"

# 清理过期备份
find $BACKUP_DIR -name "redis_backup_*.rdb.gz" -mtime +$RETENTION_DAYS -delete

echo "清理完成，保留最近 $RETENTION_DAYS 天的备份"
```

### 7.3 自动备份计划

```bash
# crontab配置
# 每天凌晨2点进行数据库全量备份
0 2 * * * /opt/oauth2/scripts/backup-database.sh >> /var/log/backup.log 2>&1

# 每4小时进行Redis备份
0 */4 * * * /opt/oauth2/scripts/backup-redis.sh >> /var/log/backup.log 2>&1

# 每周日进行配置文件备份
0 3 * * 0 /opt/oauth2/scripts/backup-configs.sh >> /var/log/backup.log 2>&1

# 每月1号清理日志文件
0 4 1 * * /opt/oauth2/scripts/cleanup-logs.sh >> /var/log/cleanup.log 2>&1
```

## 8. 安全运维

### 8.1 安全检查清单

```markdown
# 安全运维检查清单

## 系统安全

- [ ] 操作系统补丁更新
- [ ] 防火墙规则配置
- [ ] SSH密钥认证
- [ ] 禁用root远程登录
- [ ] 安全审计日志启用
- [ ] 文件权限检查
- [ ] 用户权限审查

## 应用安全

- [ ] SSL/TLS证书有效性
- [ ] 密钥轮换
- [ ] 依赖包安全扫描
- [ ] 代码安全审计
- [ ] 配置文件权限
- [ ] 敏感信息加密
- [ ] API访问控制

## 数据安全

- [ ] 数据库访问控制
- [ ] 数据加密检查
- [ ] 备份文件安全
- [ ] 数据脱敏验证
- [ ] 审计日志完整性
- [ ] 数据保留策略

## 网络安全

- [ ] 网络分段配置
- [ ] VPN访问控制
- [ ] DDoS防护
- [ ] 入侵检测系统
- [ ] 流量监控
- [ ] 端口扫描检查
```

### 8.2 安全监控脚本

```bash
#!/bin/bash
# scripts/security-check.sh

set -e

LOG_FILE="/var/log/security-check.log"
DATE=$(date '+%Y-%m-%d %H:%M:%S')

echo "[$DATE] 开始安全检查" >> $LOG_FILE

# 检查失败登录尝试
echo "检查失败登录尝试..." >> $LOG_FILE
failed_logins=$(grep "Failed password" /var/log/auth.log | wc -l)
if [ $failed_logins -gt 10 ]; then
    echo "警告: 检测到 $failed_logins 次失败登录尝试" >> $LOG_FILE
    # 发送告警
    curl -X POST "$WEBHOOK_URL" -d "{\"text\":\"安全警告: 检测到异常登录尝试\"}"
fi

# 检查端口开放情况
echo "检查端口开放情况..." >> $LOG_FILE
open_ports=$(nmap -sT localhost | grep "open" | wc -l)
echo "当前开放端口数: $open_ports" >> $LOG_FILE

# 检查系统资源使用
echo "检查系统资源使用..." >> $LOG_FILE
cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
mem_usage=$(free | grep Mem | awk '{printf "%.2f", $3/$2 * 100.0}')
disk_usage=$(df -h / | awk 'NR==2 {print $5}' | cut -d'%' -f1)

echo "CPU使用率: ${cpu_usage}%" >> $LOG_FILE
echo "内存使用率: ${mem_usage}%" >> $LOG_FILE
echo "磁盘使用率: ${disk_usage}%" >> $LOG_FILE

# 检查SSL证书过期时间
echo "检查SSL证书..." >> $LOG_FILE
cert_expiry=$(openssl x509 -in /etc/nginx/ssl/cert.pem -noout -enddate | cut -d= -f2)
expiry_timestamp=$(date -d "$cert_expiry" +%s)
current_timestamp=$(date +%s)
days_until_expiry=$(( (expiry_timestamp - current_timestamp) / 86400 ))

echo "SSL证书剩余天数: $days_until_expiry" >> $LOG_FILE
if [ $days_until_expiry -lt 30 ]; then
    echo "警告: SSL证书将在 $days_until_expiry 天后过期" >> $LOG_FILE
    curl -X POST "$WEBHOOK_URL" -d "{\"text\":\"SSL证书即将过期，剩余 $days_until_expiry 天\"}"
fi

# 检查Docker容器状态
echo "检查Docker容器状态..." >> $LOG_FILE
stopped_containers=$(docker ps -a --filter "status=exited" --format "table {{.Names}}" | tail -n +2)
if [ ! -z "$stopped_containers" ]; then
    echo "警告: 发现停止的容器: $stopped_containers" >> $LOG_FILE
fi

echo "[$DATE] 安全检查完成" >> $LOG_FILE
```

## 9. 故障处理

### 9.1 故障处理流程

```mermaid
flowchart TD
    A[故障发生] --> B[告警触发]
    B --> C[故障确认]
    C --> D[影响评估]
    D --> E[应急响应]
    E --> F[问题定位]
    F --> G[解决方案]
    G --> H[实施修复]
    H --> I[验证修复]
    I --> J[服务恢复]
    J --> K[事后分析]
    K --> L[改进措施]
```

### 9.2 常见故障处理

#### 9.2.1 应用无响应

```bash
#!/bin/bash
# 应用无响应故障处理

echo "检查应用状态..."
docker ps | grep oauth2-app

echo "检查应用日志..."
docker logs --tail 100 oauth2-app

echo "检查系统资源..."
top -bn1 | head -20
free -h
df -h

echo "检查网络连接..."
netstat -tlnp | grep :3000

echo "重启应用服务..."
docker-compose restart app

echo "等待服务启动..."
sleep 30

echo "验证服务状态..."
curl -f http://localhost:3000/health || echo "服务仍未恢复"
```

#### 9.2.2 数据库连接失败

```bash
#!/bin/bash
# 数据库连接故障处理

echo "检查数据库容器状态..."
docker ps | grep postgres

echo "检查数据库日志..."
docker logs --tail 50 oauth2-postgres

echo "测试数据库连接..."
docker exec oauth2-postgres pg_isready -U postgres

echo "检查数据库连接数..."
docker exec oauth2-postgres psql -U postgres -c "SELECT count(*) FROM pg_stat_activity;"

echo "检查数据库锁..."
docker exec oauth2-postgres psql -U postgres -c "SELECT * FROM pg_locks WHERE NOT granted;"

echo "重启数据库服务..."
docker-compose restart postgres

echo "等待数据库启动..."
sleep 60

echo "验证数据库连接..."
docker exec oauth2-postgres pg_isready -U postgres
```

#### 9.2.3 Redis连接失败

```bash
#!/bin/bash
# Redis连接故障处理

echo "检查Redis容器状态..."
docker ps | grep redis

echo "检查Redis日志..."
docker logs --tail 50 oauth2-redis

echo "测试Redis连接..."
docker exec oauth2-redis redis-cli ping

echo "检查Redis内存使用..."
docker exec oauth2-redis redis-cli info memory

echo "检查Redis连接数..."
docker exec oauth2-redis redis-cli info clients

echo "重启Redis服务..."
docker-compose restart redis

echo "等待Redis启动..."
sleep 30

echo "验证Redis连接..."
docker exec oauth2-redis redis-cli ping
```

### 9.3 故障恢复脚本

```bash
#!/bin/bash
# scripts/disaster-recovery.sh

set -e

BACKUP_DATE=${1:-$(date -d "yesterday" +%Y%m%d)}
RECOVERY_MODE=${2:-"full"}

echo "开始灾难恢复，备份日期: $BACKUP_DATE，恢复模式: $RECOVERY_MODE"

case $RECOVERY_MODE in
    "database")
        echo "恢复数据库..."
        docker-compose stop app
        docker-compose stop postgres

        # 恢复数据库
        gunzip -c "/backups/postgres/full_backup_${BACKUP_DATE}_*.dump.gz" | \
        docker exec -i oauth2-postgres pg_restore -U postgres -d oauth2_db --clean --if-exists

        docker-compose start postgres
        docker-compose start app
        ;;

    "redis")
        echo "恢复Redis..."
        docker-compose stop redis

        # 恢复Redis
        gunzip -c "/backups/redis/redis_backup_${BACKUP_DATE}_*.rdb.gz" > /tmp/dump.rdb
        docker cp /tmp/dump.rdb oauth2-redis:/data/dump.rdb

        docker-compose start redis
        ;;

    "full")
        echo "完整系统恢复..."
        docker-compose down

        # 恢复数据库
        docker-compose up -d postgres
        sleep 30
        gunzip -c "/backups/postgres/full_backup_${BACKUP_DATE}_*.dump.gz" | \
        docker exec -i oauth2-postgres pg_restore -U postgres -d oauth2_db --clean --if-exists

        # 恢复Redis
        gunzip -c "/backups/redis/redis_backup_${BACKUP_DATE}_*.rdb.gz" > /tmp/dump.rdb
        docker-compose up -d redis
        sleep 10
        docker cp /tmp/dump.rdb oauth2-redis:/data/dump.rdb
        docker-compose restart redis

        # 启动应用
        docker-compose up -d
        ;;

    *)
        echo "未知恢复模式: $RECOVERY_MODE"
        exit 1
        ;;
esac

echo "等待服务启动..."
sleep 60

echo "验证服务状态..."
curl -f http://localhost:3000/health && echo "恢复成功" || echo "恢复失败"
```

## 10. 性能优化

### 10.1 数据库优化

```sql
-- 数据库性能优化脚本

-- 创建索引
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_access_tokens_user_id ON access_tokens(user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_access_tokens_expires_at ON access_tokens(expires_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_authorization_codes_client_id ON authorization_codes(client_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);

-- 分区表（审计日志）
CREATE TABLE audit_logs_y2024m01 PARTITION OF audit_logs
FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

CREATE TABLE audit_logs_y2024m02 PARTITION OF audit_logs
FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');

-- 清理过期数据
DELETE FROM access_tokens WHERE expires_at < NOW() - INTERVAL '1 day';
DELETE FROM authorization_codes WHERE expires_at < NOW() - INTERVAL '1 hour';
DELETE FROM refresh_tokens WHERE expires_at < NOW() - INTERVAL '1 day';

-- 更新统计信息
ANALYZE;

-- 重建索引（定期维护）
REINDEX INDEX CONCURRENTLY idx_users_email;
REINDEX INDEX CONCURRENTLY idx_access_tokens_user_id;
```

### 10.2 应用优化

```typescript
// 性能优化配置
export const performanceConfig = {
  // 数据库连接池
  database: {
    pool: {
      min: 5,
      max: 20,
      acquireTimeoutMillis: 30000,
      createTimeoutMillis: 30000,
      destroyTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      reapIntervalMillis: 1000,
      createRetryIntervalMillis: 200,
    },
    // 查询超时
    timeout: 30000,
    // 慢查询日志
    slowQueryThreshold: 1000,
  },

  // Redis配置
  redis: {
    // 连接池
    pool: {
      min: 5,
      max: 20,
    },
    // 重试配置
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
    // 键过期时间
    defaultTTL: 3600,
    // 缓存策略
    cacheStrategies: {
      userSession: 1800,
      permissions: 3600,
      oauthTokens: 900,
      systemConfig: 7200,
    },
  },

  // 缓存配置
  cache: {
    // 内存缓存
    memory: {
      max: 1000,
      ttl: 300,
    },
    // 分布式缓存
    distributed: {
      keyPrefix: 'oauth2:',
      compression: true,
    },
  },

  // API限流
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15分钟
    max: 100, // 限制每个IP 15分钟内最多100个请求
    standardHeaders: true,
    legacyHeaders: false,
    // 特殊端点限流
    endpoints: {
      '/api/auth/login': { windowMs: 15 * 60 * 1000, max: 5 },
      '/api/auth/register': { windowMs: 60 * 60 * 1000, max: 3 },
      '/api/oauth/token': { windowMs: 60 * 1000, max: 10 },
    },
  },
};
```

### 10.3 缓存策略

```typescript
// lib/cache/strategy.ts
import Redis from 'ioredis';
import NodeCache from 'node-cache';

// 多级缓存策略
export class CacheStrategy {
  private memoryCache: NodeCache;
  private redisCache: Redis;

  constructor() {
    this.memoryCache = new NodeCache({
      stdTTL: 300, // 5分钟
      checkperiod: 60, // 1分钟检查一次过期
      maxKeys: 1000,
    });

    this.redisCache = new Redis({
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
    });
  }

  // 获取缓存
  async get(key: string): Promise<any> {
    // 先从内存缓存获取
    let value = this.memoryCache.get(key);
    if (value !== undefined) {
      return value;
    }

    // 从Redis获取
    const redisValue = await this.redisCache.get(key);
    if (redisValue) {
      value = JSON.parse(redisValue);
      // 回写到内存缓存
      this.memoryCache.set(key, value, 300);
      return value;
    }

    return null;
  }

  // 设置缓存
  async set(key: string, value: any, ttl: number = 3600): Promise<void> {
    // 设置内存缓存
    this.memoryCache.set(key, value, Math.min(ttl, 300));

    // 设置Redis缓存
    await this.redisCache.setex(key, ttl, JSON.stringify(value));
  }

  // 删除缓存
  async del(key: string): Promise<void> {
    this.memoryCache.del(key);
    await this.redisCache.del(key);
  }

  // 批量删除
  async delPattern(pattern: string): Promise<void> {
    const keys = await this.redisCache.keys(pattern);
    if (keys.length > 0) {
      await this.redisCache.del(...keys);
      // 清理内存缓存中匹配的键
      const memoryKeys = this.memoryCache.keys();
      memoryKeys.forEach((key) => {
        if (key.match(pattern.replace('*', '.*'))) {
          this.memoryCache.del(key);
        }
      });
    }
  }
}
```

### 10.4 性能监控

```typescript
// lib/performance/monitor.ts
export interface PerformanceMetrics {
  responseTime: number;
  memoryUsage: NodeJS.MemoryUsage;
  cpuUsage: NodeJS.CpuUsage;
  activeConnections: number;
}

export class PerformanceMonitor {
  private startTime = process.hrtime();
  private startCpuUsage = process.cpuUsage();

  // 记录请求开始时间
  startRequest(): { start: [number, number]; cpuStart: NodeJS.CpuUsage } {
    return {
      start: process.hrtime(),
      cpuStart: process.cpuUsage(),
    };
  }

  // 计算请求性能指标
  endRequest(context: { start: [number, number]; cpuStart: NodeJS.CpuUsage }): PerformanceMetrics {
    const responseTime = process.hrtime(context.start);
    const responseTimeMs = responseTime[0] * 1000 + responseTime[1] / 1000000;

    return {
      responseTime: responseTimeMs,
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(context.cpuStart),
      activeConnections: 0, // 从连接池获取
    };
  }

  // 获取系统性能概览
  getSystemMetrics(): PerformanceMetrics {
    const uptime = process.hrtime(this.startTime);
    const uptimeMs = uptime[0] * 1000 + uptime[1] / 1000000;

    return {
      responseTime: uptimeMs,
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(this.startCpuUsage),
      activeConnections: 0,
    };
  }
}
```

````

## 11. 运维最佳实践

### 11.1 日常运维检查

```bash
#!/bin/bash
# scripts/daily-check.sh

echo "=== OAuth2.1认证授权中心日常检查 ==="
echo "检查时间: $(date)"
echo

# 1. 服务状态检查
echo "1. 检查服务状态"
docker-compose ps
echo

# 2. 健康检查
echo "2. 应用健康检查"
curl -s http://localhost:3000/health | jq .
echo

# 3. 资源使用情况
echo "3. 系统资源使用"
echo "CPU使用率:"
top -bn1 | grep "Cpu(s)" | awk '{print $2}'
echo "内存使用:"
free -h
echo "磁盘使用:"
df -h
echo

# 4. 数据库状态
echo "4. 数据库状态"
docker exec oauth2-postgres pg_isready -U postgres
docker exec oauth2-postgres psql -U postgres -c "SELECT count(*) as active_connections FROM pg_stat_activity;"
echo

# 5. Redis状态
echo "5. Redis状态"
docker exec oauth2-redis redis-cli ping
docker exec oauth2-redis redis-cli info memory | grep used_memory_human
echo

# 6. 日志错误检查
echo "6. 检查错误日志"
echo "应用错误 (最近1小时):"
docker logs --since 1h oauth2-app 2>&1 | grep -i error | wc -l
echo "Nginx错误 (最近1小时):"
docker logs --since 1h oauth2-nginx 2>&1 | grep -i error | wc -l
echo

# 7. SSL证书检查
echo "7. SSL证书状态"
openssl x509 -in /etc/nginx/ssl/cert.pem -noout -enddate
echo

# 8. 备份状态检查
echo "8. 备份文件检查"
echo "最新数据库备份:"
ls -la /backups/postgres/ | tail -1
echo "最新Redis备份:"
ls -la /backups/redis/ | tail -1
echo

echo "=== 日常检查完成 ==="
````

### 11.2 性能调优脚本

```bash
#!/bin/bash
# scripts/performance-tuning.sh

echo "开始性能调优..."

# 1. 系统内核参数优化
echo "优化系统内核参数..."
cat >> /etc/sysctl.conf << EOF
# 网络优化
net.core.somaxconn = 65535
net.core.netdev_max_backlog = 5000
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.tcp_fin_timeout = 30
net.ipv4.tcp_keepalive_time = 1200
net.ipv4.tcp_max_tw_buckets = 5000

# 文件描述符
fs.file-max = 1000000
fs.nr_open = 1000000

# 内存管理
vm.swappiness = 10
vm.dirty_ratio = 15
vm.dirty_background_ratio = 5
EOF

sysctl -p

# 2. Docker容器资源限制
echo "优化Docker容器资源配置..."
cat > docker-compose.override.yml << EOF
version: '3.8'
services:
  app:
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 4G
        reservations:
          cpus: '1.0'
          memory: 2G
    ulimits:
      nofile:
        soft: 65535
        hard: 65535

  postgres:
    deploy:
      resources:
        limits:
          cpus: '4.0'
          memory: 8G
        reservations:
          cpus: '2.0'
          memory: 4G

  redis:
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 2G
        reservations:
          cpus: '0.5'
          memory: 1G
EOF

# 3. PostgreSQL配置优化
echo "优化PostgreSQL配置..."
cat > postgresql.conf << EOF
# 内存配置
shared_buffers = 2GB
effective_cache_size = 6GB
maintenance_work_mem = 512MB
work_mem = 64MB

# 连接配置
max_connections = 200

# WAL配置
wal_buffers = 16MB
checkpoint_completion_target = 0.9
checkpoint_timeout = 10min
max_wal_size = 2GB
min_wal_size = 1GB

# 查询优化
random_page_cost = 1.1
effective_io_concurrency = 200

# 日志配置
log_min_duration_statement = 1000
log_checkpoints = on
log_connections = on
log_disconnections = on
log_lock_waits = on
EOF

# 4. Redis配置优化
echo "优化Redis配置..."
cat > redis.conf << EOF
# 内存配置
maxmemory 1gb
maxmemory-policy allkeys-lru

# 持久化配置
save 900 1
save 300 10
save 60 10000

# 网络配置
tcp-keepalive 300
timeout 0

# 性能配置
hash-max-ziplist-entries 512
hash-max-ziplist-value 64
list-max-ziplist-size -2
set-max-intset-entries 512
zset-max-ziplist-entries 128
zset-max-ziplist-value 64

# 安全配置
requirepass ${REDIS_PASSWORD}
EOF

echo "性能调优完成，请重启服务使配置生效"
```

### 11.3 容量规划

```markdown
# 容量规划指南

## 用户规模预估

| 用户规模   | 并发用户 | QPS   | 数据库   | Redis   | 应用服务器 |
| ---------- | -------- | ----- | -------- | ------- | ---------- |
| 1万用户    | 100      | 500   | 2核4GB   | 1核2GB  | 2核4GB     |
| 10万用户   | 1000     | 2000  | 4核8GB   | 2核4GB  | 4核8GB     |
| 100万用户  | 5000     | 10000 | 8核16GB  | 4核8GB  | 8核16GB    |
| 1000万用户 | 20000    | 50000 | 16核32GB | 8核16GB | 16核32GB   |

## 存储容量规划

### 数据库存储

- 用户表: 每用户约1KB
- 令牌表: 每令牌约500B
- 审计日志: 每条约2KB
- 预估增长率: 20%/年

### 日志存储

- 应用日志: 100MB/天
- 访问日志: 500MB/天
- 审计日志: 200MB/天
- 保留期: 90天

### 备份存储

- 数据库备份: 数据库大小 × 1.5
- 日志备份: 日志大小 × 0.3 (压缩后)
- 保留期: 30天
```

## 12. 应急预案

### 12.1 应急响应流程

```markdown
# 应急响应预案

## 响应级别

### P0 - 严重故障

- 服务完全不可用
- 数据丢失风险
- 安全漏洞
- 响应时间: 15分钟内

### P1 - 重要故障

- 核心功能异常
- 性能严重下降
- 响应时间: 1小时内

### P2 - 一般故障

- 非核心功能异常
- 轻微性能问题
- 响应时间: 4小时内

## 联系方式

- 运维负责人: +86-xxx-xxxx-xxxx
- 开发负责人: +86-xxx-xxxx-xxxx
- 安全负责人: +86-xxx-xxxx-xxxx
- 产品负责人: +86-xxx-xxxx-xxxx
```

### 12.2 快速恢复脚本

```bash
#!/bin/bash
# scripts/emergency-recovery.sh

set -e

EMERGENCY_TYPE=${1:-"unknown"}

echo "开始应急恢复，故障类型: $EMERGENCY_TYPE"

case $EMERGENCY_TYPE in
    "service_down")
        echo "服务宕机恢复..."
        docker-compose down
        docker-compose up -d
        sleep 60
        curl -f http://localhost:3000/health
        ;;

    "database_corruption")
        echo "数据库损坏恢复..."
        ./scripts/disaster-recovery.sh $(date -d "yesterday" +%Y%m%d) database
        ;;

    "high_load")
        echo "高负载处理..."
        # 启用限流
        docker exec oauth2-nginx nginx -s reload
        # 扩容应用实例
        docker-compose up -d --scale app=3
        ;;

    "security_breach")
        echo "安全事件处理..."
        # 立即撤销所有令牌
        docker exec oauth2-redis redis-cli FLUSHDB
        # 强制用户重新登录
        docker exec oauth2-postgres psql -U postgres -d oauth2_db -c "UPDATE access_tokens SET expires_at = NOW();"
        # 记录安全事件
        echo "$(date): 安全事件 - 所有令牌已撤销" >> /var/log/security-incidents.log
        ;;

    *)
        echo "未知故障类型: $EMERGENCY_TYPE"
        echo "可用选项: service_down, database_corruption, high_load, security_breach"
        exit 1
        ;;
esac

echo "应急恢复完成，请验证服务状态"
```

## 总结

本文档提供了OAuth2.1认证授权中心的完整部署和运维方案，主要包括：

### 已完成的工作

1. **系统架构设计** - 定义了生产和测试环境的部署拓扑
2. **环境配置** - 提供了详细的硬件软件要求和配置
3. **自动化部署** - 基于Docker Compose的容器化部署方案
4. **基础监控** - 健康检查、性能监控和简单告警机制
5. **日志管理** - Winston日志配置和日志轮转策略
6. **备份策略** - 数据库和Redis的备份恢复方案
7. **安全配置** - 基础安全检查和配置
8. **故障处理** - 常见故障的处理流程和脚本
9. **性能优化** - 数据库、应用和缓存的优化配置
10. **运维实践** - 日常检查、性能调优和应急预案

### 核心特性

- **简化部署** - 专注于自动化构建部署，避免复杂的监控系统
- **容器化** - 完全基于Docker的部署方案
- **高可用** - 负载均衡和故障恢复机制
- **安全性** - SSL/TLS加密和基础安全配置
- **可维护** - 详细的运维脚本和文档

### 下一步建议

1.  **立即执行** - 按照文档进行环境搭建和部署测试
2.  **逐步完善** - 根据实际使用情况调整配置参数
3.  **持续优化** - 定期进行性能调优和安全检查
4.  **文档维护** - 根据实际部署经验更新文档内容
    ;;
        *)
            echo "未知故障类型，执行通用恢复流程..."
            docker-compose restart
            ;;
    esac

echo "应急恢复完成"

```

---

## 文档维护

**维护周期**: 每月更新
**责任人**: 运维团队
**审核人**: 技术负责人
**版本控制**: Git版本管理

### 更新记录

| 版本 | 日期 | 更新内容 | 更新人 |
|------|------|----------|--------|
| v1.0.0 | 2024-01-20 | 初始版本 | 运维团队 |

---

**注意事项**:
1. 所有运维操作必须在测试环境验证后再在生产环境执行
2. 重要操作前必须进行数据备份
3. 遵循最小权限原则，避免使用root权限
4. 定期更新系统补丁和依赖包
5. 严格执行变更管理流程
```
