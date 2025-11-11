# 环境变量配置文档

本文档详细说明了 TS Next Template 项目中所有服务的环境变量配置要求，包括开发、测试和生产环境的配置建议。

## 📋 环境变量总览

### 全局环境变量

| 变量名 | 描述 | 默认值 | 必需 |
|--------|------|--------|------|
| `NODE_ENV` | 运行环境 | `development` | ✅ |
| `PORT` | 服务端口 | 各服务默认端口 | ✅ |
| `LOG_LEVEL` | 日志级别 | `info` | ❌ |
| `DATABASE_URL` | 数据库连接字符串 | - | ✅ |

## 🔐 OAuth 服务环境变量

### 核心配置

```bash
# 服务配置
PORT=3001
NODE_ENV=development

# 数据库
DATABASE_URL="file:./dev.db"                    # 开发环境
DATABASE_URL="postgresql://user:pass@localhost:5432/oauth_db"  # 生产环境

# Redis 缓存
REDIS_URL="redis://localhost:6379"
REDIS_PASSWORD=""                               # 可选
REDIS_DB=0
```

### JWT 配置

```bash
# RSA 密钥配置
JWT_PRIVATE_KEY_PATH="./keys/private.pem"
JWT_PUBLIC_KEY_PATH="./keys/public.pem"
JWT_KEY_ID="oauth-service-key-2024"

# JWT 声明配置
JWT_ISSUER="https://auth.yourdomain.com"
JWT_AUDIENCE="ts-next-template"
JWT_EXPIRATION="1h"
JWT_REFRESH_EXPIRATION="30d"

# JWKS 配置
JWKS_URI="https://auth.yourdomain.com/.well-known/jwks.json"
JWKS_CACHE_TTL="3600"
```

### OAuth 配置

```bash
# OAuth 设置
OAUTH_CODE_EXPIRATION="10m"
OAUTH_TOKEN_EXPIRATION="1h"
OAUTH_REFRESH_TOKEN_EXPIRATION="30d"

# PKCE 配置
PKCE_CODE_CHALLENGE_METHOD="S256"
PKCE_REQUIRED=true

# 客户端配置
MAX_CLIENTS_PER_USER=10
CLIENT_SECRET_MIN_LENGTH=32
```

### 安全配置

```bash
# CORS 配置
CORS_ORIGIN="http://localhost:3002,https://yourdomain.com"
CORS_CREDENTIALS=true
CORS_METHODS="GET,POST,PUT,DELETE,OPTIONS"
CORS_HEADERS="Content-Type,Authorization"

# 速率限制
RATE_LIMIT_WINDOW_MS=900000  # 15分钟
RATE_LIMIT_MAX_REQUESTS=100
```

## 🎨 Admin Portal 环境变量

### 前端配置

```bash
# 服务配置
PORT=3002
NODE_ENV=development

# OAuth 服务集成
NEXT_PUBLIC_OAUTH_SERVICE_URL="http://localhost:3001"
NEXTAUTH_URL="http://localhost:3002"
NEXTAUTH_SECRET="your-nextauth-secret-key"

# 客户端配置
NEXT_PUBLIC_OAUTH_CLIENT_ID="admin_portal"
NEXT_PUBLIC_OAUTH_CLIENT_SECRET="your-client-secret"
```

### 数据库配置

```bash
# 数据库连接
DATABASE_URL="file:./dev.db"                    # 开发环境
DATABASE_URL="postgresql://user:pass@localhost:5432/admin_db"  # 生产环境

# 连接池配置
DATABASE_POOL_SIZE=10
DATABASE_POOL_TIMEOUT=5
DATABASE_MAX_CONNECTIONS=20
```

### 缓存配置

```bash
# Redis 缓存
REDIS_URL="redis://localhost:6379"
REDIS_PASSWORD=""
REDIS_DB=1

# 会话配置
SESSION_SECRET="your-session-secret"
SESSION_MAX_AGE=86400  # 24小时
SESSION_SECURE=false   # 生产环境设为 true
```

## 📊 Kline Service 环境变量

### 服务配置

```bash
# 服务配置
PORT=3003
NODE_ENV=development

# 数据库
DATABASE_URL="file:./dev.db"                    # 开发环境
DATABASE_URL="postgresql://user:pass@localhost:5432/kline_db"  # 生产环境

# Redis 缓存
REDIS_URL="redis://localhost:6379"
REDIS_DB=2
```

### WASM 配置

```bash
# WASM 模块配置
WASM_MODULE_PATH="./wasm/kline_calculator.wasm"
WASM_CACHE_SIZE=100
WASM_MAX_EXECUTION_TIME=5000  # 5秒
```

### 金融数据配置

```bash
# 市场数据
MARKET_DATA_CACHE_TTL=300     # 5分钟
MAX_KLINE_BARS=1000
DEFAULT_TIMEFRAME="1h"

# API 限制
MAX_CONCURRENT_REQUESTS=50
REQUEST_TIMEOUT=30000
```

## 🔀 Pingora Proxy 环境变量

### 代理配置

```bash
# 服务配置
PORT=6188
NODE_ENV=development

# 上游服务配置
UPSTREAM_OAUTH_SERVICE="http://oauth-service:3001"
UPSTREAM_ADMIN_PORTAL="http://admin-portal:3002"
UPSTREAM_KLINE_SERVICE="http://kline-service:3003"

# 负载均衡配置
LOAD_BALANCE_METHOD="round_robin"
HEALTH_CHECK_INTERVAL=30
FAILOVER_TIMEOUT=5
```

### 缓存配置

```bash
# 缓存配置
CACHE_ENABLED=true
CACHE_TTL=300
CACHE_MAX_SIZE=1000
CACHE_CLEANUP_INTERVAL=600
```

### 安全配置

```bash
# SSL/TLS
SSL_CERT_PATH="/etc/ssl/certs/server.crt"
SSL_KEY_PATH="/etc/ssl/private/server.key"
SSL_ENABLED=false  # 生产环境设为 true

# 安全头部
SECURITY_HEADERS_ENABLED=true
HSTS_MAX_AGE=31536000
```

## 🗄️ 数据库环境变量

### PostgreSQL 配置

```bash
# PostgreSQL 连接
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=password
POSTGRES_DB=main_db

# 连接池配置
DATABASE_POOL_SIZE=20
DATABASE_POOL_TIMEOUT=30
DATABASE_MAX_CONNECTIONS=100
DATABASE_IDLE_TIMEOUT=30000
```

### SQLite 配置

```bash
# SQLite 配置（仅开发环境）
SQLITE_DB_PATH="./dev.db"
SQLITE_CACHE_SIZE=10000
SQLITE_JOURNAL_MODE=WAL
SQLITE_SYNCHRONOUS=NORMAL
```

## 📡 Redis 配置

### 基础配置

```bash
# Redis 连接
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=""
REDIS_DB=0

# 连接池配置
REDIS_POOL_SIZE=10
REDIS_POOL_TIMEOUT=5
REDIS_RETRY_DELAY=1000
REDIS_MAX_RETRIES=3
```

### 高级配置

```bash
# 集群配置
REDIS_CLUSTER_ENABLED=false
REDIS_CLUSTER_NODES="127.0.0.1:7000,127.0.0.1:7001,127.0.0.1:7002"

# Sentinel 配置
REDIS_SENTINEL_ENABLED=false
REDIS_SENTINEL_HOSTS="127.0.0.1:26379,127.0.0.1:26380"
REDIS_SENTINEL_MASTER_NAME="mymaster"
```

## 🔍 日志配置

### 日志级别

```bash
# 日志配置
LOG_LEVEL=info                  # debug, info, warn, error
LOG_FILE_PATH="./logs/app.log"
LOG_MAX_SIZE="10m"
LOG_MAX_FILES=5
LOG_ROTATION=true

# 控制台输出
LOG_CONSOLE=true
LOG_COLORIZE=true
```

### 结构化日志

```bash
# JSON 格式日志
LOG_FORMAT=json                 # json, pretty
LOG_TIMESTAMP_FORMAT=ISO8601
LOG_INCLUDE_STACK_TRACE=true
```

## 🚨 安全配置

### 加密配置

```bash
# 加密设置
ENCRYPTION_KEY="your-32-char-encryption-key"
HASH_SALT_ROUNDS=12
SESSION_SECRET="your-session-secret-key"

# API 安全
API_RATE_LIMIT_ENABLED=true
API_RATE_LIMIT_WINDOW_MS=900000
API_RATE_LIMIT_MAX_REQUESTS=100
```

### 监控配置

```bash
# 监控配置
METRICS_ENABLED=true
METRICS_PORT=9090
HEALTH_CHECK_ENABLED=true
HEALTH_CHECK_PORT=3001
```

## 🌍 环境特定配置

### 开发环境 (.env.development)

```bash
# 开发环境配置
NODE_ENV=development
LOG_LEVEL=debug
CORS_ORIGIN="http://localhost:3000,http://localhost:3002"
DATABASE_URL="file:./dev.db"
REDIS_URL="redis://localhost:6379"
JWT_EXPIRATION="24h"
```

### 测试环境 (.env.test)

```bash
# 测试环境配置
NODE_ENV=test
LOG_LEVEL=info
DATABASE_URL="file:./test.db"
REDIS_URL="redis://localhost:6380"
JWT_EXPIRATION="1h"
TEST_USER_EMAIL="test@example.com"
TEST_USER_PASSWORD="test123"
```

### 生产环境 (.env.production)

```bash
# 生产环境配置
NODE_ENV=production
LOG_LEVEL=info
CORS_ORIGIN="https://yourdomain.com"
DATABASE_URL="postgresql://user:pass@prod-db:5432/prod_db"
REDIS_URL="redis://prod-redis:6379"
JWT_EXPIRATION="1h"
JWT_REFRESH_EXPIRATION="7d"
SSL_ENABLED=true
SECURITY_HEADERS_ENABLED=true
```

## 📝 环境变量模板

### 创建环境文件

```bash
# 创建开发环境配置
cp .env.example .env.development

# 创建生产环境配置
cp .env.example .env.production

# 创建本地环境配置
cp .env.example .env.local
```

### 验证环境变量

```bash
# 检查必需的环境变量
./scripts/check-env.sh

# 验证环境变量格式
./scripts/validate-env.sh

# 生成环境变量文档
./scripts/generate-env-docs.sh
```

## 🔧 环境变量管理最佳实践

### 1. 敏感信息管理

- 永远不要将敏感信息提交到版本控制
- 使用环境特定的配置文件
- 使用密钥管理服务（如 AWS Secrets Manager、HashiCorp Vault）

### 2. 配置验证

```typescript
// 环境变量验证示例
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: z.coerce.number().min(1000).max(65535),
  DATABASE_URL: z.string().url(),
  JWT_PRIVATE_KEY_PATH: z.string(),
  REDIS_URL: z.string().url(),
});

const env = envSchema.parse(process.env);
```

### 3. 环境变量优先级

1. 命令行参数
2. 环境变量
3. `.env.local` 文件
4. `.env.[environment]` 文件
5. `.env` 文件

### 4. 容器环境配置

#### Docker Compose

```yaml
# docker-compose.yml
services:
  oauth-service:
    environment:
      - NODE_ENV=production
      - PORT=3001
      - DATABASE_URL=${DATABASE_URL}
    env_file:
      - .env.production
```

#### Kubernetes ConfigMap

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  NODE_ENV: "production"
  LOG_LEVEL: "info"
  JWT_ISSUER: "https://yourdomain.com"
```

## 📊 环境变量监控

### 健康检查

```bash
# 检查环境变量配置
./scripts/health-check.sh

# 验证数据库连接
./scripts/check-db.sh

# 验证 Redis 连接
./scripts/check-redis.sh

# 验证 JWT 密钥
./scripts/check-jwt-keys.sh
```

### 配置热重载

```bash
# 开发环境支持配置热重载
pnpm dev:watch

# 自动重启服务
nodemon --watch .env.local --exec "pnpm dev"
```

## 🎯 常见问题

### Q: 如何处理不同环境的密钥？
A: 使用环境特定的密钥文件和密钥管理服务。

### Q: 如何验证环境变量是否正确？
A: 使用配置验证脚本和启动时的健康检查。

### Q: 如何处理敏感信息？
A: 使用 Docker secrets、Kubernetes secrets 或外部密钥管理服务。

### Q: 如何管理大量环境变量？
A: 使用配置管理工具和分组管理策略。

## 📞 支持与更新

- 配置文件变更时，请及时更新本文档
- 新环境变量添加时，请同步更新所有环境模板
- 定期检查环境变量的安全性和有效性