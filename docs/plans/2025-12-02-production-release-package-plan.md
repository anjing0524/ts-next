# 生产发布包完整实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**目标:** 在2-3周内交付完整的生产就绪发布包，包含Docker容器化、基础性能优化、关键文档和测试补充。

**架构:** 采用快速MVP路径，按E(部署)→B(稳定性)→D(文档)→C(测试)四个阶段并行推进。每个阶段包含独立的任务模块，可以分工执行。使用灵活并行策略，不相关的任务同时进行。

**技术栈:**
- Docker & Docker Compose
- Kubernetes & Helm Charts
- GitHub Actions CI/CD
- Next.js 16 + Rust Actix-web
- PostgreSQL + Redis
- Prometheus + Grafana

---

## Phase 1: 部署与容器化 (E) - 第1-2周

### Task 1.1: 为admin-portal创建Dockerfile

**文件:**
- Create: `apps/admin-portal/Dockerfile`
- Create: `apps/admin-portal/.dockerignore`
- Modify: `apps/admin-portal/package.json` (如需要添加health check端点)

**Step 1: 创建Dockerfile**

```dockerfile
# apps/admin-portal/Dockerfile
FROM node:18-alpine AS builder

WORKDIR /app

# 安装依赖
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile

# 复制源代码
COPY . .

# 构建应用
RUN pnpm run build

# ===== 生产镜像 =====
FROM node:18-alpine

WORKDIR /app

# 安装pnpm和生产依赖
RUN npm install -g pnpm
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# 从builder阶段复制构建结果
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

EXPOSE 3000

CMD ["pnpm", "start"]
```

**Step 2: 创建.dockerignore**

```
# apps/admin-portal/.dockerignore
node_modules
npm-debug.log
.git
.gitignore
README.md
.next/cache
coverage
.env.local
.env.*.local
```

**Step 3: 验证Dockerfile语法**

运行：
```bash
docker build --dry-run -t admin-portal:test -f apps/admin-portal/Dockerfile .
```

预期：无错误，显示build步骤

**Step 4: 提交**

```bash
git add apps/admin-portal/Dockerfile apps/admin-portal/.dockerignore
git commit -m "feat(docker): Add Dockerfile for admin-portal Next.js app"
```

---

### Task 1.2: 为oauth-service-rust创建Dockerfile

**文件:**
- Create: `apps/oauth-service-rust/Dockerfile`
- Create: `apps/oauth-service-rust/.dockerignore`
- Modify: `apps/oauth-service-rust/Cargo.toml` (确保有release优化)

**Step 1: 创建Dockerfile**

```dockerfile
# apps/oauth-service-rust/Dockerfile
FROM rust:1.75-alpine AS builder

WORKDIR /app

# 安装必要的build工具
RUN apk add --no-cache openssl-dev pkg-config

# 复制Cargo文件
COPY Cargo.toml Cargo.lock ./
COPY src ./src

# 构建应用 (release模式，优化二进制大小)
RUN cargo build --release

# ===== 运行镜像 =====
FROM alpine:3.18

WORKDIR /app

# 安装运行时依赖
RUN apk add --no-cache openssl ca-certificates

# 复制编译的二进制
COPY --from=builder /app/target/release/oauth-service-rust /app/oauth-service

# 创建非root用户
RUN addgroup -g 1000 appuser && \
    adduser -D -u 1000 -G appuser appuser
USER appuser

# 设置环境变量
ENV RUST_LOG=info
ENV PORT=3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

EXPOSE 3001

CMD ["/app/oauth-service"]
```

**Step 2: 创建.dockerignore**

```
# apps/oauth-service-rust/.dockerignore
target
.git
.gitignore
.env
.env.local
*.md
coverage
.DS_Store
```

**Step 3: 验证编译**

运行：
```bash
cd apps/oauth-service-rust && cargo build --release 2>&1 | head -20
```

预期：编译成功（或显示编译进度）

**Step 4: 提交**

```bash
git add apps/oauth-service-rust/Dockerfile apps/oauth-service-rust/.dockerignore
git commit -m "feat(docker): Add Dockerfile for oauth-service Rust app"
```

---

### Task 1.3: 创建Docker Compose文件用于本地开发和演示

**文件:**
- Create: `docker-compose.yml` (项目根目录)
- Create: `docker-compose.prod.yml` (生产配置)
- Create: `.env.example` (示例环境变量)

**Step 1: 创建docker-compose.yml**

```yaml
# docker-compose.yml
version: '3.8'

services:
  # PostgreSQL数据库
  postgres:
    image: postgres:15-alpine
    container_name: ts-next-postgres
    environment:
      POSTGRES_USER: ${DB_USER:-postgres}
      POSTGRES_PASSWORD: ${DB_PASSWORD:-postgres}
      POSTGRES_DB: ${DB_NAME:-oauth_db}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER:-postgres}"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - app-network

  # Redis缓存
  redis:
    image: redis:7-alpine
    container_name: ts-next-redis
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - app-network

  # OAuth Service (Rust)
  oauth-service:
    build:
      context: .
      dockerfile: apps/oauth-service-rust/Dockerfile
    container_name: ts-next-oauth
    environment:
      DATABASE_URL: postgres://${DB_USER:-postgres}:${DB_PASSWORD:-postgres}@postgres:5432/${DB_NAME:-oauth_db}
      REDIS_URL: redis://redis:6379
      RUST_LOG: ${RUST_LOG:-info}
      PORT: 3001
    ports:
      - "3001:3001"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - app-network
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3001/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Admin Portal (Next.js)
  admin-portal:
    build:
      context: .
      dockerfile: apps/admin-portal/Dockerfile
    container_name: ts-next-admin
    environment:
      NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL:-http://localhost:3001}
      PORT: 3000
    ports:
      - "3000:3000"
    depends_on:
      oauth-service:
        condition: service_healthy
    networks:
      - app-network
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  postgres_data:
    driver: local

networks:
  app-network:
    driver: bridge
```

**Step 2: 创建.env.example**

```bash
# .env.example
# Database Configuration
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=oauth_db
DATABASE_URL=postgres://postgres:postgres@postgres:5432/oauth_db

# Redis Configuration
REDIS_URL=redis://redis:6379

# OAuth Service
RUST_LOG=info
OAUTH_PORT=3001

# Admin Portal
NEXT_PUBLIC_API_URL=http://localhost:3001
ADMIN_PORT=3000

# Node Environment
NODE_ENV=development
```

**Step 3: 验证docker-compose配置**

运行：
```bash
docker-compose config > /dev/null && echo "✓ Config valid"
```

预期：输出 "✓ Config valid"

**Step 4: 提交**

```bash
git add docker-compose.yml .env.example
git commit -m "feat(docker): Add docker-compose configuration for local development"
```

---

### Task 1.4: 创建Kubernetes部署清单 (Helm Charts)

**文件:**
- Create: `k8s/Chart.yaml`
- Create: `k8s/values.yaml`
- Create: `k8s/templates/deployment.yaml`
- Create: `k8s/templates/service.yaml`
- Create: `k8s/templates/configmap.yaml`
- Create: `k8s/templates/secret.yaml`

**Step 1: 创建Helm Chart结构**

```bash
mkdir -p k8s/templates
```

**Step 2: 创建Chart.yaml**

```yaml
# k8s/Chart.yaml
apiVersion: v2
name: ts-next-template
description: A Helm chart for ts-next-template monorepo
type: application
version: 1.0.0
appVersion: "1.0.0"
keywords:
  - oauth
  - nextjs
  - rust
maintainers:
  - name: Your Team
    email: team@example.com
```

**Step 3: 创建values.yaml**

```yaml
# k8s/values.yaml
replicaCount: 2

image:
  registry: docker.io
  pullPolicy: IfNotPresent
  tag: "latest"

oauthService:
  name: oauth-service
  image:
    repository: your-registry/oauth-service
    tag: "1.0.0"
  port: 3001
  replicas: 2
  resources:
    requests:
      memory: "256Mi"
      cpu: "250m"
    limits:
      memory: "512Mi"
      cpu: "500m"

adminPortal:
  name: admin-portal
  image:
    repository: your-registry/admin-portal
    tag: "1.0.0"
  port: 3000
  replicas: 2
  resources:
    requests:
      memory: "256Mi"
      cpu: "250m"
    limits:
      memory: "512Mi"
      cpu: "500m"

database:
  host: postgres
  port: 5432
  name: oauth_db
  user: postgres
  # password应该通过Secret提供

redis:
  host: redis
  port: 6379

ingress:
  enabled: true
  className: "nginx"
  annotations: {}
  hosts:
    - host: "api.example.com"
      paths:
        - path: /
          pathType: Prefix
          service: oauth-service
    - host: "admin.example.com"
      paths:
        - path: /
          pathType: Prefix
          service: admin-portal
  tls: []

service:
  type: ClusterIP
  annotations: {}

persistence:
  enabled: true
  storageClass: "standard"
  size: 10Gi
```

**Step 4: 创建deployment.yaml模板**

```yaml
# k8s/templates/deployment.yaml
---
# OAuth Service Deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "ts-next-template.fullname" . }}-oauth
  labels:
    {{- include "ts-next-template.labels" . | nindent 4 }}
    app: oauth-service
spec:
  replicas: {{ .Values.oauthService.replicas }}
  selector:
    matchLabels:
      {{- include "ts-next-template.selectorLabels" . | nindent 6 }}
      app: oauth-service
  template:
    metadata:
      labels:
        {{- include "ts-next-template.selectorLabels" . | nindent 8 }}
        app: oauth-service
    spec:
      containers:
      - name: oauth-service
        image: "{{ .Values.oauthService.image.repository }}:{{ .Values.oauthService.image.tag }}"
        imagePullPolicy: {{ .Values.image.pullPolicy }}
        ports:
        - name: http
          containerPort: {{ .Values.oauthService.port }}
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: {{ include "ts-next-template.fullname" . }}-secret
              key: database-url
        - name: REDIS_URL
          value: "redis://{{ .Values.redis.host }}:{{ .Values.redis.port }}"
        - name: RUST_LOG
          value: "info"
        livenessProbe:
          httpGet:
            path: /health
            port: http
          initialDelaySeconds: 10
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: http
          initialDelaySeconds: 5
          periodSeconds: 5
        resources:
          {{- toYaml .Values.oauthService.resources | nindent 10 }}

---
# Admin Portal Deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "ts-next-template.fullname" . }}-admin
  labels:
    {{- include "ts-next-template.labels" . | nindent 4 }}
    app: admin-portal
spec:
  replicas: {{ .Values.adminPortal.replicas }}
  selector:
    matchLabels:
      {{- include "ts-next-template.selectorLabels" . | nindent 6 }}
      app: admin-portal
  template:
    metadata:
      labels:
        {{- include "ts-next-template.selectorLabels" . | nindent 8 }}
        app: admin-portal
    spec:
      containers:
      - name: admin-portal
        image: "{{ .Values.adminPortal.image.repository }}:{{ .Values.adminPortal.image.tag }}"
        imagePullPolicy: {{ .Values.image.pullPolicy }}
        ports:
        - name: http
          containerPort: {{ .Values.adminPortal.port }}
        env:
        - name: NEXT_PUBLIC_API_URL
          value: "http://{{ include "ts-next-template.fullname" . }}-oauth:{{ .Values.oauthService.port }}"
        livenessProbe:
          httpGet:
            path: /health
            port: http
          initialDelaySeconds: 10
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: http
          initialDelaySeconds: 5
          periodSeconds: 5
        resources:
          {{- toYaml .Values.adminPortal.resources | nindent 10 }}
```

**Step 5: 创建service.yaml模板**

```yaml
# k8s/templates/service.yaml
---
apiVersion: v1
kind: Service
metadata:
  name: {{ include "ts-next-template.fullname" . }}-oauth
  labels:
    {{- include "ts-next-template.labels" . | nindent 4 }}
spec:
  type: {{ .Values.service.type }}
  ports:
    - port: {{ .Values.oauthService.port }}
      targetPort: http
      protocol: TCP
      name: http
  selector:
    {{- include "ts-next-template.selectorLabels" . | nindent 4 }}
    app: oauth-service

---
apiVersion: v1
kind: Service
metadata:
  name: {{ include "ts-next-template.fullname" . }}-admin
  labels:
    {{- include "ts-next-template.labels" . | nindent 4 }}
spec:
  type: {{ .Values.service.type }}
  ports:
    - port: {{ .Values.adminPortal.port }}
      targetPort: http
      protocol: TCP
      name: http
  selector:
    {{- include "ts-next-template.selectorLabels" . | nindent 4 }}
    app: admin-portal
```

**Step 6: 创建_helpers.tpl (Helm模板助手)**

```yaml
# k8s/templates/_helpers.tpl
{{/*
Expand the name of the chart.
*/}}
{{- define "ts-next-template.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "ts-next-template.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "ts-next-template.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "ts-next-template.labels" -}}
helm.sh/chart: {{ include "ts-next-template.chart" . }}
{{ include "ts-next-template.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "ts-next-template.selectorLabels" -}}
app.kubernetes.io/name: {{ include "ts-next-template.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}
```

**Step 7: 验证Helm chart**

运行：
```bash
helm lint k8s
```

预期：输出验证成功的消息

**Step 8: 提交**

```bash
git add k8s/
git commit -m "feat(k8s): Add Helm charts for Kubernetes deployment"
```

---

### Task 1.5: 创建GitHub Actions CI/CD流水线

**文件:**
- Create: `.github/workflows/build-and-push.yml`
- Create: `.github/workflows/deploy-k8s.yml`
- Create: `.github/workflows/test.yml`

**Step 1: 创建build-and-push.yml**

```yaml
# .github/workflows/build-and-push.yml
name: Build and Push Docker Images

on:
  push:
    branches:
      - main
      - develop
  pull_request:
    branches:
      - main

env:
  REGISTRY: docker.io
  IMAGE_NAME_OAUTH: your-registry/oauth-service
  IMAGE_NAME_ADMIN: your-registry/admin-portal

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
    - name: Checkout code
      uses: actions/checkout@v4

    - name: Set up Docker Buildx
      uses: docker/setup-buildx-action@v3

    - name: Log in to Docker Registry
      if: github.event_name != 'pull_request'
      uses: docker/login-action@v3
      with:
        registry: ${{ env.REGISTRY }}
        username: ${{ secrets.DOCKER_USERNAME }}
        password: ${{ secrets.DOCKER_PASSWORD }}

    - name: Extract metadata for oauth-service
      id: meta-oauth
      uses: docker/metadata-action@v5
      with:
        images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME_OAUTH }}
        tags: |
          type=ref,event=branch
          type=semver,pattern={{version}}
          type=sha

    - name: Build and push oauth-service
      uses: docker/build-push-action@v5
      with:
        context: .
        file: ./apps/oauth-service-rust/Dockerfile
        push: ${{ github.event_name != 'pull_request' }}
        tags: ${{ steps.meta-oauth.outputs.tags }}
        labels: ${{ steps.meta-oauth.outputs.labels }}
        cache-from: type=gha
        cache-to: type=gha,mode=max

    - name: Extract metadata for admin-portal
      id: meta-admin
      uses: docker/metadata-action@v5
      with:
        images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME_ADMIN }}
        tags: |
          type=ref,event=branch
          type=semver,pattern={{version}}
          type=sha

    - name: Build and push admin-portal
      uses: docker/build-push-action@v5
      with:
        context: .
        file: ./apps/admin-portal/Dockerfile
        push: ${{ github.event_name != 'pull_request' }}
        tags: ${{ steps.meta-admin.outputs.tags }}
        labels: ${{ steps.meta-admin.outputs.labels }}
        cache-from: type=gha
        cache-to: type=gha,mode=max
```

**Step 2: 创建test.yml**

```yaml
# .github/workflows/test.yml
name: Tests

on:
  push:
    branches:
      - main
      - develop
  pull_request:

jobs:
  test-admin-portal:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v2
      with:
        version: 8
    - uses: actions/setup-node@v4
      with:
        node-version: '18'
        cache: 'pnpm'

    - name: Install dependencies
      run: pnpm install --frozen-lockfile

    - name: Run tests
      run: pnpm --filter admin-portal run test

    - name: Build
      run: pnpm --filter admin-portal run build

  test-oauth-service:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - uses: dtolnay/rust-toolchain@stable

    - name: Cache cargo registry
      uses: actions/cache@v3
      with:
        path: ~/.cargo/registry
        key: ${{ runner.os }}-cargo-registry-${{ hashFiles('**/Cargo.lock') }}

    - name: Cache cargo index
      uses: actions/cache@v3
      with:
        path: ~/.cargo/git
        key: ${{ runner.os }}-cargo-git-${{ hashFiles('**/Cargo.lock') }}

    - name: Cache cargo build
      uses: actions/cache@v3
      with:
        path: apps/oauth-service-rust/target
        key: ${{ runner.os }}-cargo-build-target-${{ hashFiles('**/Cargo.lock') }}

    - name: Run tests
      run: cd apps/oauth-service-rust && cargo test --verbose

    - name: Build release
      run: cd apps/oauth-service-rust && cargo build --release --verbose
```

**Step 3: 验证workflow文件格式**

运行：
```bash
ls -la .github/workflows/
```

预期：显示三个yaml文件

**Step 4: 提交**

```bash
git add .github/workflows/
git commit -m "feat(ci): Add GitHub Actions CI/CD pipelines for build and test"
```

---

## Phase 2: 性能与稳定性 (B) - 第2周并行

### Task 2.1: 添加Redis缓存层到admin-portal API调用

**文件:**
- Create: `apps/admin-portal/lib/cache/cache-client.ts`
- Modify: `apps/admin-portal/lib/api/resources/system.ts`
- Modify: `apps/admin-portal/lib/api/resources/audit.ts`

**Step 1: 创建缓存客户端**

```typescript
// apps/admin-portal/lib/cache/cache-client.ts
import { createClient } from 'redis';

export interface CacheOptions {
  ttl?: number; // 秒数，默认300
  tags?: string[]; // 用于分组缓存的标签
}

class CacheClient {
  private client = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  });

  async connect() {
    if (!this.client.isOpen) {
      await this.client.connect();
    }
  }

  async get<T>(key: string): Promise<T | null> {
    await this.connect();
    const data = await this.client.get(key);
    return data ? JSON.parse(data) : null;
  }

  async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
    await this.connect();
    const ttl = options?.ttl || 300; // 默认5分钟
    await this.client.setEx(key, ttl, JSON.stringify(value));

    // 如果有标签，将key添加到标签集合中，便于批量清除
    if (options?.tags) {
      for (const tag of options.tags) {
        await this.client.sAdd(`cache:tag:${tag}`, key);
      }
    }
  }

  async invalidate(pattern: string): Promise<void> {
    await this.connect();
    const keys = await this.client.keys(pattern);
    if (keys.length > 0) {
      await this.client.del(keys);
    }
  }

  async invalidateByTag(tag: string): Promise<void> {
    await this.connect();
    const keys = await this.client.sMembers(`cache:tag:${tag}`);
    if (keys.length > 0) {
      await this.client.del(keys);
      await this.client.del(`cache:tag:${tag}`);
    }
  }
}

export const cacheClient = new CacheClient();
```

**Step 2: 修改audit API以使用缓存**

```typescript
// apps/admin-portal/lib/api/resources/audit.ts (修改getAuditLogs方法)

export async function getAuditLogs(params: {
  page?: number;
  limit?: number;
  search?: string;
  action?: string;
  status?: string;
  startDate?: Date;
  endDate?: Date;
}): Promise<AuditLogsResponse> {
  const cacheKey = `audit:logs:${JSON.stringify(params)}`;

  // 尝试从缓存获取
  const cached = await cacheClient.get<AuditLogsResponse>(cacheKey);
  if (cached) {
    return cached;
  }

  // 缓存未命中，从API获取
  const response = await defaultHttpClient.request<AuditLogsResponse>(
    '/admin/audit-logs',
    {
      method: 'GET',
      params,
    }
  );

  // 缓存结果 (5分钟TTL，标签为audit以支持批量清除)
  await cacheClient.set(response.data, cacheKey, {
    ttl: 300,
    tags: ['audit'],
  });

  return response.data;
}
```

**Step 3: 提交**

```bash
git add apps/admin-portal/lib/cache/cache-client.ts
git commit -m "feat(cache): Add Redis cache layer for audit logs API"
```

---

### Task 2.2: 实现API请求去重与请求合并

**文件:**
- Create: `apps/admin-portal/lib/api/decorators/request-dedup.ts`
- Modify: `apps/admin-portal/lib/api/client/http-client.ts`

**Step 1: 创建请求去重装饰器**

```typescript
// apps/admin-portal/lib/api/decorators/request-dedup.ts
type PendingRequest<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: any) => void;
};

const pendingRequests = new Map<string, PendingRequest<any>>();

/**
 * 请求去重装饰器
 * 同时进行的相同请求会被合并，只发送一次HTTP请求
 */
export async function dedupRequest<T>(
  key: string,
  requestFn: () => Promise<T>
): Promise<T> {
  // 如果已有相同的pending请求，直接返回
  if (pendingRequests.has(key)) {
    return pendingRequests.get(key)!.promise;
  }

  // 创建新的pending请求
  let resolve: (value: T) => void;
  let reject: (reason?: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  pendingRequests.set(key, { promise, resolve: resolve!, reject: reject! });

  try {
    const result = await requestFn();
    pendingRequests.get(key)?.resolve(result);
    return result;
  } catch (error) {
    pendingRequests.get(key)?.reject(error);
    throw error;
  } finally {
    // 请求完成后清除pending记录
    pendingRequests.delete(key);
  }
}
```

**Step 2: 在HTTP客户端中集成请求去重**

```typescript
// 在 apps/admin-portal/lib/api/client/http-client.ts 中修改request方法

async request<T>(
  endpoint: string,
  options?: HttpRequestOptions
): Promise<HttpResponse<T>> {
  // 生成缓存key（仅GET请求执行去重）
  const dedupeKey = options?.method === 'GET' || !options?.method
    ? `dedup:${endpoint}:${JSON.stringify(options?.params || {})}`
    : null;

  if (dedupeKey) {
    return dedupRequest(dedupeKey, () => this._makeRequest(endpoint, options));
  } else {
    return this._makeRequest(endpoint, options);
  }
}

private async _makeRequest<T>(
  endpoint: string,
  options?: HttpRequestOptions
): Promise<HttpResponse<T>> {
  // 原有的request逻辑
  // ...
}
```

**Step 3: 提交**

```bash
git add apps/admin-portal/lib/api/decorators/request-dedup.ts
git commit -m "feat(perf): Add request deduplication to prevent duplicate API calls"
```

---

### Task 2.3: 添加性能监控与日志

**文件:**
- Create: `apps/admin-portal/lib/monitoring/performance-monitor.ts`
- Create: `apps/admin-portal/lib/monitoring/logger.ts`

**Step 1: 创建性能监控**

```typescript
// apps/admin-portal/lib/monitoring/performance-monitor.ts
export class PerformanceMonitor {
  static measure<T>(
    name: string,
    fn: () => T | Promise<T>
  ): T | Promise<T> {
    const startTime = performance.now();

    try {
      const result = fn();

      if (result instanceof Promise) {
        return result.finally(() => {
          const duration = performance.now() - startTime;
          this.log(name, duration);
        });
      } else {
        const duration = performance.now() - startTime;
        this.log(name, duration);
        return result;
      }
    } catch (error) {
      const duration = performance.now() - startTime;
      this.logError(name, duration, error);
      throw error;
    }
  }

  private static log(name: string, duration: number) {
    const level = duration > 1000 ? 'warn' : 'info';
    console.log(`[PERF] ${name}: ${duration.toFixed(2)}ms [${level}]`);
  }

  private static logError(name: string, duration: number, error: any) {
    console.error(`[PERF-ERROR] ${name}: ${duration.toFixed(2)}ms`, error);
  }
}
```

**Step 2: 创建结构化日志**

```typescript
// apps/admin-portal/lib/monitoring/logger.ts
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, any>;
  error?: { message: string; stack?: string };
}

class Logger {
  private isDev = process.env.NODE_ENV === 'development';

  log(message: string, context?: Record<string, any>) {
    this.write(LogLevel.INFO, message, context);
  }

  warn(message: string, context?: Record<string, any>) {
    this.write(LogLevel.WARN, message, context);
  }

  error(message: string, error?: Error, context?: Record<string, any>) {
    this.write(LogLevel.ERROR, message, {
      ...context,
      error: error ? { message: error.message, stack: error.stack } : undefined,
    });
  }

  private write(level: LogLevel, message: string, context?: Record<string, any>) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
    };

    // 生产环境发送到日志服务，开发环境输出到控制台
    if (this.isDev) {
      console.log(JSON.stringify(entry, null, 2));
    } else {
      // TODO: 集成到 ELK、Datadog、或其他日志服务
      console.log(JSON.stringify(entry));
    }
  }
}

export const logger = new Logger();
```

**Step 3: 提交**

```bash
git add apps/admin-portal/lib/monitoring/
git commit -m "feat(monitoring): Add performance monitoring and structured logging"
```

---

## Phase 3: 文档与开发体验 (D) - 第2-3周并行

### Task 3.1: 创建API文档 (OpenAPI/Swagger)

**文件:**
- Create: `docs/openapi/openapi.yaml`
- Create: `docs/API_DOCUMENTATION.md`

**Step 1: 创建OpenAPI规范文件**

```yaml
# docs/openapi/openapi.yaml
openapi: 3.0.0
info:
  title: TS-Next-Template API
  description: OAuth 2.1 compliant authorization server with admin portal
  version: 1.0.0
  contact:
    name: Your Team
    email: team@example.com
  license:
    name: MIT

servers:
  - url: http://localhost:3001
    description: Development server
  - url: https://api.example.com
    description: Production server

paths:
  /oauth/authorize:
    get:
      operationId: authorizeRequest
      summary: OAuth Authorization Endpoint
      tags:
        - OAuth
      parameters:
        - name: client_id
          in: query
          required: true
          schema:
            type: string
        - name: redirect_uri
          in: query
          required: true
          schema:
            type: string
            format: uri
        - name: scope
          in: query
          required: true
          schema:
            type: string
        - name: response_type
          in: query
          required: true
          schema:
            type: string
            enum: [code]
        - name: state
          in: query
          required: true
          schema:
            type: string
      responses:
        '302':
          description: Redirect to authorization consent screen
          headers:
            Location:
              schema:
                type: string
                format: uri
        '400':
          description: Invalid request

  /oauth/token:
    post:
      operationId: tokenRequest
      summary: OAuth Token Endpoint
      tags:
        - OAuth
      requestBody:
        required: true
        content:
          application/x-www-form-urlencoded:
            schema:
              type: object
              properties:
                grant_type:
                  type: string
                  enum: [authorization_code, refresh_token]
                code:
                  type: string
                redirect_uri:
                  type: string
                  format: uri
                client_id:
                  type: string
                client_secret:
                  type: string
              required: [grant_type, client_id, client_secret]
      responses:
        '200':
          description: Token response
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/TokenResponse'
        '400':
          description: Invalid request

  /admin/audit-logs:
    get:
      operationId: getAuditLogs
      summary: Get audit logs
      tags:
        - Admin
      parameters:
        - name: page
          in: query
          schema:
            type: integer
            default: 1
        - name: limit
          in: query
          schema:
            type: integer
            default: 20
        - name: search
          in: query
          schema:
            type: string
        - name: action
          in: query
          schema:
            type: string
        - name: status
          in: query
          schema:
            type: string
      responses:
        '200':
          description: Audit logs response
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/AuditLogsResponse'
        '401':
          description: Unauthorized

components:
  schemas:
    TokenResponse:
      type: object
      properties:
        accessToken:
          type: string
        refreshToken:
          type: string
        expiresIn:
          type: integer
        tokenType:
          type: string
          default: Bearer
      required:
        - accessToken
        - refreshToken
        - expiresIn

    AuditLog:
      type: object
      properties:
        id:
          type: string
        timestamp:
          type: string
          format: date-time
        userId:
          type: string
          nullable: true
        action:
          type: string
        status:
          type: string
          enum: [SUCCESS, FAILURE, PENDING, ACCESS_DENIED]
        details:
          type: object
          nullable: true

    AuditLogsResponse:
      type: object
      properties:
        data:
          type: array
          items:
            $ref: '#/components/schemas/AuditLog'
        meta:
          type: object
          properties:
            page:
              type: integer
            limit:
              type: integer
            total:
              type: integer
            pages:
              type: integer

  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT

security:
  - bearerAuth: []
```

**Step 2: 创建API文档Markdown**

```markdown
# API 文档

## 概述

本API遵循OAuth 2.1标准，提供授权认证和管理功能。

### 基础URL

- 开发环境: `http://localhost:3001`
- 生产环境: `https://api.example.com`

### 认证

使用Bearer Token进行认证：

```
Authorization: Bearer <access_token>
```

---

## OAuth 2.1 流程

### 1. 授权请求 (Authorization Code Flow)

**端点:** `GET /oauth/authorize`

**参数:**
- `client_id` (required): OAuth应用ID
- `redirect_uri` (required): 重定向URI
- `scope` (required): 请求的权限范围
- `response_type` (required): 必须为 `code`
- `state` (required): CSRF保护令牌

**响应:** 302重定向到同意页面

### 2. 获取Token

**端点:** `POST /oauth/token`

**请求体:**
```json
{
  "grant_type": "authorization_code",
  "code": "authorization_code",
  "client_id": "client_id",
  "client_secret": "client_secret",
  "redirect_uri": "https://your-app.com/callback"
}
```

**响应:**
```json
{
  "accessToken": "eyJhbGc...",
  "refreshToken": "refresh_token",
  "expiresIn": 3600,
  "tokenType": "Bearer"
}
```

---

## 管理API

### 获取审计日志

**端点:** `GET /admin/audit-logs`

**查询参数:**
- `page`: 页码 (默认: 1)
- `limit`: 每页数量 (默认: 20)
- `search`: 搜索关键词
- `action`: 操作类型 (CREATE, UPDATE, DELETE, READ, EXPORT)
- `status`: 状态 (SUCCESS, FAILURE, PENDING, ACCESS_DENIED)

**响应:**
```json
{
  "data": [
    {
      "id": "audit_123",
      "timestamp": "2025-12-02T10:30:00Z",
      "userId": "user_456",
      "action": "CREATE",
      "status": "SUCCESS",
      "details": { }
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "pages": 5
  }
}
```

---

## 错误处理

所有错误响应遵循标准HTTP状态码：

- `400 Bad Request`: 请求参数无效
- `401 Unauthorized`: 认证失败
- `403 Forbidden`: 权限不足
- `500 Internal Server Error`: 服务器错误

**错误响应格式:**
```json
{
  "error": "error_code",
  "error_description": "Human-readable error description"
}
```
```

**Step 3: 提交**

```bash
git add docs/openapi/ docs/API_DOCUMENTATION.md
git commit -m "docs(api): Add OpenAPI specification and API documentation"
```

---

### Task 3.2: 创建快速开始指南

**文件:**
- Create: `docs/GETTING_STARTED.md`
- Create: `DEVELOPMENT.md`

**Step 1: 创建GETTING_STARTED.md**

```markdown
# 快速开始指南

## 前置要求

- Docker & Docker Compose (推荐)
- 或 Node.js 18+, Rust 1.75+, PostgreSQL 15

## 方式1: 使用Docker Compose (推荐)

### 1. 克隆仓库

\`\`\`bash
git clone https://github.com/your-org/ts-next-template.git
cd ts-next-template
\`\`\`

### 2. 配置环境变量

\`\`\`bash
cp .env.example .env.local
# 编辑.env.local，设置必要的配置
\`\`\`

### 3. 启动所有服务

\`\`\`bash
docker-compose up -d
\`\`\`

### 4. 等待服务就绪

\`\`\`bash
# 检查OAuth Service
curl http://localhost:3001/health

# 检查Admin Portal
curl http://localhost:3000/health
\`\`\`

### 5. 访问应用

- Admin Portal: http://localhost:3000
- OAuth Service API: http://localhost:3001

## 方式2: 本地开发

### 1. 安装依赖

\`\`\`bash
pnpm install
cd apps/oauth-service-rust && cargo build
\`\`\`

### 2. 启动数据库

\`\`\`bash
docker-compose up postgres redis -d
\`\`\`

### 3. 运行迁移

\`\`\`bash
# TODO: 添加数据库迁移命令
\`\`\`

### 4. 启动应用

\`\`\`bash
# Terminal 1: OAuth Service
cd apps/oauth-service-rust
cargo run

# Terminal 2: Admin Portal
pnpm --filter admin-portal dev
\`\`\`

## 常见问题

### 端口已被占用

如果看到端口已被占用的错误，修改docker-compose.yml中的端口映射：

\`\`\`yaml
services:
  oauth-service:
    ports:
      - "3001:3001"  # 改为其他端口，如 "3002:3001"
\`\`\`

### 数据库连接失败

确保PostgreSQL容器正在运行：

\`\`\`bash
docker-compose ps
docker-compose logs postgres
\`\`\`

### 构建失败

清除Docker缓存并重新构建：

\`\`\`bash
docker-compose build --no-cache
\`\`\`

## 下一步

- 查看 [API文档](./docs/API_DOCUMENTATION.md)
- 阅读 [架构设计](./docs/2-SYSTEM_DESIGN.md)
- 参考 [开发指南](./DEVELOPMENT.md)
```

**Step 2: 创建DEVELOPMENT.md**

```markdown
# 开发指南

## 项目结构

\`\`\`
ts-next-template/
├── apps/
│   ├── admin-portal/          # Next.js管理后台
│   │   ├── app/               # Next.js应用目录
│   │   ├── lib/               # 共享库代码
│   │   └── features/          # 功能模块
│   └── oauth-service-rust/    # Rust OAuth服务
│       ├── src/
│       └── Cargo.toml
├── k8s/                       # Kubernetes配置
├── .github/workflows/         # CI/CD流水线
└── docs/                      # 文档
\`\`\`

## 开发工作流

### 1. 创建功能分支

\`\`\`bash
git checkout -b feat/my-feature main
\`\`\`

### 2. 进行开发

编辑代码，确保：
- TypeScript严格模式启用
- 通过eslint检查
- 添加单元测试

### 3. 提交代码

遵循Conventional Commits:

\`\`\`bash
git add .
git commit -m "feat(component): Add new feature description"
\`\`\`

### 4. 推送并创建PR

\`\`\`bash
git push origin feat/my-feature
# 在GitHub创建Pull Request
\`\`\`

## 运行测试

### Admin Portal

\`\`\`bash
pnpm --filter admin-portal test
pnpm --filter admin-portal test:e2e
\`\`\`

### OAuth Service

\`\`\`bash
cd apps/oauth-service-rust
cargo test
\`\`\`

## 代码风格

### TypeScript

- 使用Prettier进行代码格式化
- 使用ESLint进行代码检查
- 遵循[Google TypeScript风格指南](https://google.github.io/styleguide/tsguide.html)

\`\`\`bash
pnpm run lint
pnpm run format
\`\`\`

### Rust

- 使用rustfmt进行代码格式化
- 使用clippy进行代码检查

\`\`\`bash
cd apps/oauth-service-rust
cargo fmt
cargo clippy
\`\`\`

## 数据库操作

### 运行迁移

\`\`\`bash
# TODO: 添加数据库迁移工具配置
\`\`\`

### 重置数据库

\`\`\`bash
docker-compose down -v postgres
docker-compose up postgres -d
\`\`\`

## 生成API文档

\`\`\`bash
# 从OpenAPI生成客户端代码
npx openapi-generator-cli generate -i docs/openapi/openapi.yaml -g typescript-fetch -o generated/api
\`\`\`

## 故障排除

### 清除所有本地状态

\`\`\`bash
# 删除node_modules和pnpm缓存
rm -rf node_modules
pnpm store prune

# 删除Rust build cache
cd apps/oauth-service-rust && cargo clean

# 重新安装
pnpm install
cargo build
\`\`\`
```

**Step 3: 提交**

```bash
git add docs/GETTING_STARTED.md DEVELOPMENT.md
git commit -m "docs: Add getting started and development guides"
```

---

## Phase 4: 测试补充 (C) - 第3周

### Task 4.1: 补充集成测试

**文件:**
- Create: `apps/admin-portal/__tests__/integration/api.integration.test.ts`
- Create: `apps/oauth-service-rust/tests/integration_tests.rs`

**Step 1: 创建Next.js集成测试**

```typescript
// apps/admin-portal/__tests__/integration/api.integration.test.ts
import { api } from '@/lib/api';

describe('API Integration Tests', () => {
  beforeAll(async () => {
    // 初始化数据库连接
    process.env.NODE_ENV = 'test';
  });

  describe('Audit Logs API', () => {
    test('should fetch audit logs with filters', async () => {
      const response = await api.getAuditLogs({
        page: 1,
        limit: 10,
        action: 'CREATE',
        status: 'SUCCESS',
      });

      expect(response).toHaveProperty('data');
      expect(response).toHaveProperty('meta');
      expect(Array.isArray(response.data)).toBe(true);
      expect(response.meta.page).toBe(1);
    });

    test('should handle pagination correctly', async () => {
      const page1 = await api.getAuditLogs({ page: 1, limit: 5 });
      const page2 = await api.getAuditLogs({ page: 2, limit: 5 });

      expect(page1.data.length).toBeLessThanOrEqual(5);
      expect(page2.data.length).toBeLessThanOrEqual(5);
      // 确保两页数据不重复
      const ids1 = page1.data.map(log => log.id);
      const ids2 = page2.data.map(log => log.id);
      expect(new Set([...ids1, ...ids2]).size).toBe(ids1.length + ids2.length);
    });

    test('should cache API responses', async () => {
      const start1 = performance.now();
      const result1 = await api.getAuditLogs({ page: 1, limit: 10 });
      const duration1 = performance.now() - start1;

      const start2 = performance.now();
      const result2 = await api.getAuditLogs({ page: 1, limit: 10 });
      const duration2 = performance.now() - start2;

      expect(result1).toEqual(result2);
      // 第二次请求应该更快（来自缓存）
      expect(duration2).toBeLessThan(duration1);
    });
  });

  describe('OAuth Service', () => {
    test('should handle token requests', async () => {
      const response = await api.submitConsent('approve', {
        client_id: 'test_client',
        scope: 'openid profile',
      });

      expect(response).toBeDefined();
    });
  });
});
```

**Step 2: 创建Rust集成测试**

```rust
// apps/oauth-service-rust/tests/integration_tests.rs
use actix_web::{test, web, App};
use oauth_service::handlers;
use oauth_service::db::Database;

#[actix_web::test]
async fn test_authorize_endpoint() {
    let app = test::init_service(
        App::new()
            .service(handlers::authorize)
    ).await;

    let req = test::TestRequest::get()
        .uri("/oauth/authorize?client_id=test&redirect_uri=http://localhost:3000/callback&scope=openid&response_type=code&state=state123")
        .to_request();

    let resp = test::call_service(&app, req).await;
    assert!(resp.status().is_redirection());
}

#[actix_web::test]
async fn test_token_endpoint() {
    let app = test::init_service(
        App::new()
            .service(handlers::token)
    ).await;

    let req = test::TestRequest::post()
        .uri("/oauth/token")
        .set_payload(
            "grant_type=authorization_code\
             &code=test_code\
             &client_id=test_client\
             &client_secret=secret\
             &redirect_uri=http://localhost:3000/callback"
        )
        .to_request();

    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), actix_web::http::StatusCode::OK);
}

#[actix_web::test]
async fn test_health_check() {
    let app = test::init_service(
        App::new()
            .service(handlers::health)
    ).await;

    let req = test::TestRequest::get()
        .uri("/health")
        .to_request();

    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), actix_web::http::StatusCode::OK);
}
```

**Step 3: 提交**

```bash
git add apps/admin-portal/__tests__/integration/ apps/oauth-service-rust/tests/
git commit -m "test: Add comprehensive integration tests for APIs"
```

---

### Task 4.2: 添加E2E测试场景

**文件:**
- Create: `apps/admin-portal/__tests__/e2e/audit-logs.e2e.test.ts`
- Create: `apps/admin-portal/__tests__/e2e/oauth-flow.e2e.test.ts`

**Step 1: 创建审计日志E2E测试**

```typescript
// apps/admin-portal/__tests__/e2e/audit-logs.e2e.test.ts
import { chromium, Browser, Page } from 'playwright';

describe('Audit Logs E2E Tests', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch();
    page = await browser.newPage();
  });

  afterAll(async () => {
    await browser.close();
  });

  test('should display audit logs page with filters', async () => {
    await page.goto('http://localhost:3000/admin/system/audits');

    // 等待表格加载
    await page.waitForSelector('[role="table"]');

    // 验证过滤器存在
    expect(await page.locator('input[placeholder="Search logs..."]').count()).toBeGreaterThan(0);
    expect(await page.locator('text=All Actions').count()).toBeGreaterThan(0);
  });

  test('should filter audit logs by action', async () => {
    await page.goto('http://localhost:3000/admin/system/audits');

    // 选择CREATE动作
    await page.selectOption('select', 'CREATE');

    // 点击应用过滤
    await page.click('button:has-text("Apply Filters")');

    // 等待结果更新
    await page.waitForTimeout(500);

    // 验证表格更新
    const rows = await page.locator('tbody tr');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should reset filters', async () => {
    await page.goto('http://localhost:3000/admin/system/audits');

    // 输入搜索
    await page.fill('input[placeholder="Search logs..."]', 'test');

    // 点击重置
    await page.click('button:has-text("Reset")');

    // 验证搜索框清空
    const searchValue = await page.inputValue('input[placeholder="Search logs..."]');
    expect(searchValue).toBe('');
  });
});
```

**Step 2: 创建OAuth流程E2E测试**

```typescript
// apps/admin-portal/__tests__/e2e/oauth-flow.e2e.test.ts
import { chromium, Browser, Page } from 'playwright';

describe('OAuth Flow E2E Tests', () => {
  let browser: Browser;
  let userPage: Page;
  let clientPage: Page;

  beforeAll(async () => {
    browser = await chromium.launch();
  });

  afterAll(async () => {
    await browser.close();
  });

  test('should complete authorization code flow', async () => {
    // 1. 客户端应用发起授权请求
    clientPage = await browser.newPage();
    await clientPage.goto('http://localhost:3000/login');

    // 点击OAuth登录
    await clientPage.click('button:has-text("Login with OAuth")');

    // 2. 重定向到认证服务器
    await clientPage.waitForURL('**/oauth/authorize**');
    expect(clientPage.url()).toContain('client_id=');

    // 3. 用户登录（如需要）
    userPage = clientPage;
    await userPage.fill('input[name="username"]', 'testuser');
    await userPage.fill('input[name="password"]', 'password123');
    await userPage.click('button:has-text("Sign In")');

    // 4. 用户授权
    await userPage.waitForSelector('button:has-text("Approve")');
    await userPage.click('button:has-text("Approve")');

    // 5. 重定向回客户端应用
    await clientPage.waitForURL('**/callback**');
    expect(clientPage.url()).toContain('code=');

    // 6. 验证已登录
    await clientPage.waitForURL('**/dashboard**');
    expect(await clientPage.locator('text=Welcome').count()).toBeGreaterThan(0);
  });
});
```

**Step 3: 提交**

```bash
git add apps/admin-portal/__tests__/e2e/
git commit -m "test(e2e): Add end-to-end tests for audit logs and OAuth flow"
```

---

## 最终步骤：打包与部署

### Task 5.1: 创建发布脚本

**文件:**
- Create: `scripts/release.sh`
- Create: `scripts/deploy.sh`

**Step 1: 创建release.sh**

```bash
#!/bin/bash
# scripts/release.sh

set -e

VERSION=${1:-1.0.0}
TAG="v${VERSION}"

echo "🚀 Releasing version ${VERSION}"

# 1. 验证没有未提交的改动
if [ -n "$(git status --porcelain)" ]; then
  echo "❌ Working directory not clean"
  exit 1
fi

# 2. 创建标签
echo "📝 Creating git tag ${TAG}"
git tag -a "${TAG}" -m "Release ${VERSION}"

# 3. 推送标签到远程
echo "📤 Pushing tag to remote"
git push origin "${TAG}"

# 4. GitHub Actions会自动构建和推送镜像

echo "✅ Release ${VERSION} created successfully!"
echo "GitHub Actions will now build and push Docker images"
```

**Step 2: 创建deploy.sh**

```bash
#!/bin/bash
# scripts/deploy.sh

set -e

NAMESPACE=${1:-default}
VERSION=${2:-latest}
RELEASE_NAME=ts-next-template

echo "🚀 Deploying to Kubernetes namespace: ${NAMESPACE}"

# 1. 创建/更新命名空间
kubectl create namespace "${NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f -

# 2. 创建Secret（如果不存在）
kubectl create secret generic db-credentials \
  --from-literal=password="${DB_PASSWORD}" \
  --namespace="${NAMESPACE}" \
  --dry-run=client -o yaml | kubectl apply -f -

# 3. 使用Helm部署
helm upgrade --install "${RELEASE_NAME}" ./k8s \
  --namespace="${NAMESPACE}" \
  --values k8s/values.yaml \
  --set image.tag="${VERSION}" \
  --wait

echo "✅ Deployment complete!"
echo "Checking status:"
kubectl get pods -n "${NAMESPACE}"
```

**Step 3: 提交**

```bash
chmod +x scripts/release.sh scripts/deploy.sh
git add scripts/
git commit -m "build: Add release and deployment scripts"
```

---

## 验证清单

- [ ] 所有Phase 1任务完成（Docker/K8s/CI-CD）
- [ ] 所有Phase 2任务完成（缓存/去重/监控）
- [ ] 所有Phase 3任务完成（文档/快速开始）
- [ ] 所有Phase 4任务完成（集成/E2E测试）
- [ ] 本地Docker Compose测试通过
- [ ] Kubernetes部署文档完整
- [ ] CI/CD流水线可执行
- [ ] API文档生成正确
- [ ] 测试覆盖率提升

---

## 执行注意事项

1. **并行执行**: Phase 1-4可以并行进行，但建议优先完成Phase 1
2. **频繁提交**: 每个Task完成后立即提交
3. **测试验证**: 每个Task完成后运行对应的测试
4. **文档同步**: 完成任务时同时更新相关文档

---

**计划创建于**: 2025-12-02
**预计完成时间**: 2-3周
**优先级**: 快速生产就绪（MVP路径）
