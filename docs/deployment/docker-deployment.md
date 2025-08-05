# Docker 与 Kubernetes 部署指南

本指南详细介绍了如何将 TS Next Template 项目部署到 Docker 和 Kubernetes 环境，包含完整的微服务架构部署方案。

## 🐳 Docker 部署

### 1. 环境准备

#### 必需软件
- [Docker](https://docs.docker.com/get-docker/) (v24.0+)
- [Docker Compose](https://docs.docker.com/compose/) (v2.0+)
- [kubectl](https://kubernetes.io/docs/tasks/tools/) (用于 Kubernetes)

### 2. 服务镜像构建

#### 2.1 构建所有服务镜像

```bash
# 构建所有服务镜像
pnpm build:docker

# 或者分别构建每个服务
docker build -f apps/oauth-service/Dockerfile -t ts-next/oauth-service:latest .
docker build -f apps/admin-portal/Dockerfile -t ts-next/admin-portal:latest .
docker build -f apps/kline-service/Dockerfile -t ts-next/kline-service:latest .
docker build -f apps/pingora-proxy/Dockerfile -t ts-next/pingora-proxy:latest .
```

#### 2.2 基础镜像构建

使用多阶段构建优化镜像大小：

```dockerfile
# apps/oauth-service/Dockerfile
FROM node:20-alpine AS base
WORKDIR /app

# 安装 pnpm
RUN npm install -g pnpm@10.6.2

# 依赖阶段
FROM base AS deps
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile --prefer-offline

# 构建阶段
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm --filter=oauth-service build

# 生产阶段
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

COPY --from=builder /app/apps/oauth-service/.next/standalone ./
COPY --from=builder /app/apps/oauth-service/.next/static ./.next/static
COPY --from=builder /app/apps/oauth-service/public ./public

EXPOSE 3001
CMD ["node", "server.js"]
```

### 3. Docker Compose 部署

#### 3.1 创建 docker-compose.yml

```yaml
version: '3.8'

services:
  # OAuth 服务
  oauth-service:
    build:
      context: .
      dockerfile: apps/oauth-service/Dockerfile
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://postgres:password@postgres:5432/oauth_db
      - REDIS_URL=redis://redis:6379
      - JWT_PRIVATE_KEY_PATH=/app/keys/private.pem
      - JWT_PUBLIC_KEY_PATH=/app/keys/public.pem
    volumes:
      - ./keys:/app/keys:ro
      - oauth_logs:/app/logs
    depends_on:
      - postgres
      - redis
    networks:
      - app-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # 管理后台
  admin-portal:
    build:
      context: .
      dockerfile: apps/admin-portal/Dockerfile
    ports:
      - "3002:3002"
    environment:
      - NODE_ENV=production
      - NEXT_PUBLIC_OAUTH_SERVICE_URL=http://oauth-service:3001
      - DATABASE_URL=postgresql://postgres:password@postgres:5432/admin_db
    depends_on:
      - postgres
      - oauth-service
    networks:
      - app-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3002/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # 金融数据服务
  kline-service:
    build:
      context: .
      dockerfile: apps/kline-service/Dockerfile
    ports:
      - "3003:3003"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://postgres:password@postgres:5432/kline_db
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - redis
    networks:
      - app-network
    restart: unless-stopped

  # Pingora 代理
  pingora-proxy:
    build:
      context: .
      dockerfile: apps/pingora-proxy/Dockerfile
    ports:
      - "6188:6188"
    environment:
      - NODE_ENV=production
    depends_on:
      - oauth-service
      - admin-portal
      - kline-service
    networks:
      - app-network
    restart: unless-stopped

  # PostgreSQL 数据库
  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=main_db
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init-db.sql:/docker-entrypoint-initdb.d/init-db.sql
    ports:
      - "5432:5432"
    networks:
      - app-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Redis 缓存
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    networks:
      - app-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  postgres_data:
  redis_data:
  oauth_logs:

networks:
  app-network:
    driver: bridge
```

#### 3.2 启动服务

```bash
# 启动所有服务
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f oauth-service
docker-compose logs -f admin-portal

# 停止服务
docker-compose down

# 清理数据卷
docker-compose down -v
```

### 4. 环境变量配置

#### 4.1 生产环境变量 (.env.production)

```bash
# 数据库配置
DATABASE_URL=postgresql://user:password@postgres:5432/main_db
REDIS_URL=redis://redis:6379

# OAuth 配置
JWT_PRIVATE_KEY_PATH=/app/keys/private.pem
JWT_PUBLIC_KEY_PATH=/app/keys/public.pem
JWT_KEY_ID=production-key-2024
JWT_ISSUER=https://your-domain.com
JWT_AUDIENCE=your-app-name

# 服务配置
NEXT_PUBLIC_OAUTH_SERVICE_URL=http://oauth-service:3001
NEXTAUTH_URL=http://admin-portal:3002
NEXTAUTH_SECRET=your-production-secret

# 日志配置
LOG_LEVEL=info
LOG_FILE_PATH=/app/logs/app.log

# 安全配置
NODE_ENV=production
PORT=3001
```

## ☸️ Kubernetes 部署

### 1. 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                        Ingress                              │
│                   (pingora-proxy)                           │
└─────────────────┬───────────────────────────────────────────┘
                  │
    ┌─────────────┼─────────────┐
    │             │             │
┌───▼───┐    ┌───▼───┐    ┌───▼───┐
│oauth- │    │admin- │    │kline- │
│service│    │portal │    │service│
└───┬───┘    └───┬───┘    └───┬───┘
    │            │            │
┌───▼───┐    ┌───▼───┐        │
│postgres│    │redis  │        │
└───────┘    └───────┘        │
                              │
                       ┌──────▼──────┐
                       │WASM计算模块  │
                       └─────────────┘
```

### 2. 命名空间配置

```yaml
# k8s/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: ts-next-template
  labels:
    name: ts-next-template
    environment: production
```

### 3. 服务配置

#### 3.1 OAuth 服务部署

```yaml
# k8s/oauth-service/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: oauth-service
  namespace: ts-next-template
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
        image: ts-next/oauth-service:latest
        ports:
        - containerPort: 3001
        env:
        - name: NODE_ENV
          value: "production"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: postgres-secret
              key: database-url
        - name: REDIS_URL
          value: "redis://redis-service:6379"
        - name: JWT_PRIVATE_KEY
          valueFrom:
            secretKeyRef:
              name: jwt-secret
              key: private-key
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3001
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 3001
          initialDelaySeconds: 5
          periodSeconds: 5
        volumeMounts:
        - name: keys
          mountPath: /app/keys
          readOnly: true
      volumes:
      - name: keys
        secret:
          secretName: jwt-keys
```

#### 3.2 Admin Portal 部署

```yaml
# k8s/admin-portal/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: admin-portal
  namespace: ts-next-template
spec:
  replicas: 2
  selector:
    matchLabels:
      app: admin-portal
  template:
    metadata:
      labels:
        app: admin-portal
    spec:
      containers:
      - name: admin-portal
        image: ts-next/admin-portal:latest
        ports:
        - containerPort: 3002
        env:
        - name: NODE_ENV
          value: "production"
        - name: NEXT_PUBLIC_OAUTH_SERVICE_URL
          value: "http://oauth-service:3001"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: postgres-secret
              key: database-url
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /api/health
            port: 3002
          initialDelaySeconds: 30
          periodSeconds: 10
```

#### 3.3 服务发现配置

```yaml
# k8s/services.yaml
apiVersion: v1
kind: Service
metadata:
  name: oauth-service
  namespace: ts-next-template
spec:
  selector:
    app: oauth-service
  ports:
  - port: 3001
    targetPort: 3001
  type: ClusterIP

---
apiVersion: v1
kind: Service
metadata:
  name: admin-portal
  namespace: ts-next-template
spec:
  selector:
    app: admin-portal
  ports:
  - port: 3002
    targetPort: 3002
  type: ClusterIP

---
apiVersion: v1
kind: Service
metadata:
  name: kline-service
  namespace: ts-next-template
spec:
  selector:
    app: kline-service
  ports:
  - port: 3003
    targetPort: 3003
  type: ClusterIP
```

### 4. 配置管理

#### 4.1 ConfigMap 配置

```yaml
# k8s/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
  namespace: ts-next-template
data:
  NODE_ENV: "production"
  LOG_LEVEL: "info"
  JWT_ISSUER: "https://your-domain.com"
  JWT_AUDIENCE: "ts-next-template"
```

#### 4.2 Secret 配置

```yaml
# k8s/secrets.yaml
apiVersion: v1
kind: Secret
metadata:
  name: postgres-secret
  namespace: ts-next-template
type: Opaque
data:
  username: cG9zdGdyZXM=  # base64 encoded 'postgres'
  password: cGFzc3dvcmQ=  # base64 encoded 'password'
  database-url: cG9zdGdyZXNxbDovL3Bvc3RncmVzOnBhc3N3b3JkQHBvc3RncmVzLXNlcnZpY2U6NTQzMi9tYWluX2Ri

---
apiVersion: v1
kind: Secret
metadata:
  name: jwt-secret
  namespace: ts-next-template
type: Opaque
data:
  private-key: LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0t...  # base64 encoded private key
  public-key: LS0tLS1CRUdJTiBQVUJMSUMgS0VZLS0tLS0...   # base64 encoded public key
```

### 5. Ingress 配置

```yaml
# k8s/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ts-next-ingress
  namespace: ts-next-template
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  tls:
  - hosts:
    - your-domain.com
    secretName: ts-next-tls
  rules:
  - host: your-domain.com
    http:
      paths:
      - path: /oauth
        pathType: Prefix
        backend:
          service:
            name: oauth-service
            port:
              number: 3001
      - path: /admin
        pathType: Prefix
        backend:
          service:
            name: admin-portal
            port:
              number: 3002
      - path: /api/kline
        pathType: Prefix
        backend:
          service:
            name: kline-service
            port:
              number: 3003
```

### 6. 部署脚本

#### 6.1 一键部署脚本

```bash
#!/bin/bash
# scripts/deploy-k8s.sh

set -e

NAMESPACE=${NAMESPACE:-ts-next-template}
IMAGE_TAG=${IMAGE_TAG:-latest}

echo "🚀 Deploying TS Next Template to Kubernetes..."

# 创建命名空间
kubectl create namespace $NAMESPACE --dry-run=client -o yaml | kubectl apply -f -

# 应用配置
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/services.yaml
kubectl apply -f k8s/deployments/
kubectl apply -f k8s/ingress.yaml

# 等待部署完成
kubectl rollout status deployment/oauth-service -n $NAMESPACE
kubectl rollout status deployment/admin-portal -n $NAMESPACE
kubectl rollout status deployment/kline-service -n $NAMESPACE

echo "✅ Deployment completed successfully!"
```

#### 6.2 验证部署

```bash
#!/bin/bash
# scripts/verify-deployment.sh

NAMESPACE=${NAMESPACE:-ts-next-template}

echo "🔍 Checking deployment status..."

# 检查 Pod 状态
kubectl get pods -n $NAMESPACE

# 检查服务状态
kubectl get services -n $NAMESPACE

# 检查 Ingress 状态
kubectl get ingress -n $NAMESPACE

# 测试服务连接
kubectl run test-pod --image=curlimages/curl --rm -it --restart=Never -- \
  curl http://oauth-service:3001/health

echo "✅ All services are running correctly!"
```

### 7. 监控与日志

#### 7.1 监控配置

```yaml
# k8s/monitoring.yaml
apiVersion: v1
kind: ServiceMonitor
metadata:
  name: ts-next-monitor
  namespace: ts-next-template
spec:
  selector:
    matchLabels:
      app: ts-next-template
  endpoints:
  - port: metrics
    interval: 30s
    path: /metrics
```

#### 7.2 日志聚合

```yaml
# k8s/logging.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: fluent-bit-config
  namespace: ts-next-template
data:
  fluent-bit.conf: |
    [SERVICE]
        Flush         1
        Log_Level     info
        Daemon        off

    [INPUT]
        Name              tail
        Path              /var/log/containers/*.log
        Parser            docker
        Tag               kube.*
        Refresh_Interval  5

    [OUTPUT]
        Name  es
        Match *
        Host  elasticsearch.logging.svc.cluster.local
        Port  9200
        Logstash_Format On
        Retry_Limit False
```

## 🚀 生产部署最佳实践

### 1. 安全加固

#### 1.1 网络安全
```yaml
# 网络策略
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: ts-next-network-policy
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: ingress-nginx
```

#### 1.2 RBAC 配置
```yaml
# RBAC 配置
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: ts-next-role
rules:
- apiGroups: [""]
  resources: ["pods", "services", "configmaps"]
  verbs: ["get", "list", "watch"]
```

### 2. 性能优化

#### 2.1 资源限制
```yaml
resources:
  requests:
    memory: "256Mi"
    cpu: "250m"
  limits:
    memory: "512Mi"
    cpu: "500m"
```

#### 2.2 HPA 配置
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: oauth-service-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: oauth-service
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

### 3. 备份策略

#### 3.1 数据库备份
```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: postgres-backup
spec:
  schedule: "0 2 * * *"
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: backup
            image: postgres:15-alpine
            command:
            - pg_dump
            - -h
            - postgres-service
            - -U
            - postgres
            - main_db
            - "> /backup/backup-$(date +%Y%m%d-%H%M%S).sql"
```

## 📋 部署检查清单

### 部署前检查
- [ ] 所有镜像已构建并推送到镜像仓库
- [ ] 所有配置文件已更新为生产环境配置
- [ ] 所有密钥已正确配置
- [ ] 域名和 SSL 证书已配置

### 部署后验证
- [ ] 所有 Pod 正常运行
- [ ] 所有服务可正常访问
- [ ] 数据库连接正常
- [ ] Redis 缓存正常
- [ ] 日志收集正常
- [ ] 监控告警正常

### 故障排除
```bash
# 查看 Pod 状态
kubectl get pods -n ts-next-template

# 查看服务状态
kubectl get svc -n ts-next-template

# 查看日志
kubectl logs -f deployment/oauth-service -n ts-next-template

# 进入 Pod 调试
kubectl exec -it deployment/oauth-service -n ts-next-template -- /bin/sh

# 端口转发调试
kubectl port-forward svc/oauth-service 3001:3001 -n ts-next-template
```

## 🔧 维护与更新

### 滚动更新
```bash
# 更新镜像
kubectl set image deployment/oauth-service oauth-service=ts-next/oauth-service:v2.0.0 -n ts-next-template

# 回滚更新
kubectl rollout undo deployment/oauth-service -n ts-next-template

# 查看更新状态
kubectl rollout status deployment/oauth-service -n ts-next-template
```

### 清理资源
```bash
# 删除所有资源
kubectl delete namespace ts-next-template

# 清理持久卷
kubectl delete pvc --all -n ts-next-template
```