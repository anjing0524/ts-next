# OAuth 2.1 System - Deployment and Operations Guide

**Document Version**: 1.0
**Last Updated**: 2025-11-17
**Audience**: DevOps Engineers, System Administrators, Operations Teams

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation Guide](#installation-guide)
3. [Docker Deployment](#docker-deployment)
4. [Kubernetes Deployment](#kubernetes-deployment)
5. [Database Setup](#database-setup)
6. [SSL/TLS Configuration](#ssltls-configuration)
7. [Environment Variables](#environment-variables)
8. [Health Checks and Monitoring](#health-checks-and-monitoring)
9. [Backup and Recovery](#backup-and-recovery)
10. [Troubleshooting](#troubleshooting)
11. [Maintenance Tasks](#maintenance-tasks)
12. [Scaling Guide](#scaling-guide)

---

## Prerequisites

### System Requirements

#### Minimum Hardware Requirements

**Development/Staging Environment:**
- CPU: 2+ cores
- RAM: 4 GB
- Disk: 20 GB (SSD recommended)
- Network: 100 Mbps minimum

**Production Environment:**
- CPU: 4+ cores (8 recommended)
- RAM: 8 GB minimum (16 GB recommended)
- Disk: 50+ GB (SSD required)
- Network: 1 Gbps minimum
- High availability setup: 3+ nodes for clustering

#### OS Requirements

- **Linux**: Ubuntu 20.04 LTS or later, CentOS 8.0+, or RHEL 8.0+
- **Kernel**: 4.15+ with cgroup v2 support
- **Container Runtime**: Docker 20.10+ or containerd 1.5+
- **Orchestration**: Kubernetes 1.24+ (for K8s deployments)

### Software Dependencies

#### Docker Deployment

```bash
# Docker & Docker Compose
- docker >= 20.10.0
- docker-compose >= 2.0.0 (or Docker Compose V2)
- docker-buildx (for multi-platform builds)

# System tools
- curl >= 7.68
- openssl >= 1.1.1
- git >= 2.30
- jq >= 1.6
```

#### Kubernetes Deployment

```bash
- kubectl >= 1.24.0
- helm >= 3.10.0 (optional, for package management)
- kustomize >= 4.5.0 (included in kubectl)

# Cluster requirements
- Container runtime (Docker, containerd, or cri-o)
- Storage provisioner (local, NFS, or cloud provider)
- Ingress controller (nginx-ingress, traefik, etc.)
- Optional: metrics-server, prometheus-operator
```

#### Source Code Build

```bash
- Node.js >= 18.0.0 (use .node-version: 18.20.0)
- pnpm >= 10.6.2
- Rust >= 1.70.0 (for oauth-service-rust, pingora-proxy)
- Cargo (comes with Rust)
```

### Network Requirements

- **Ports to be exposed**:
  - 80/tcp: HTTP traffic
  - 443/tcp: HTTPS traffic (TLS)
  - 3000/tcp: Grafana (internal only)
  - 3001/tcp: OAuth Service (internal only)
  - 3002/tcp: Admin Portal (internal only)
  - 9090/tcp: Prometheus (internal only)
  - 3100/tcp: Loki (internal only)
  - 3306/tcp: MySQL (internal, if used)
  - 6379/tcp: Redis (internal, if used)

- **Firewall Rules**:
  - Allow inbound 80, 443 from internet
  - Restrict other ports to internal networks
  - Allow inter-container/pod communication
  - Allow outbound for certificate renewal (port 443 to Let's Encrypt)

### SSL/TLS Certificates

- Valid TLS certificates from trusted CA (Let's Encrypt, DigiCert, etc.)
- Wildcard certificates for subdomains (recommended)
- Certificate management tool: certbot, cert-manager (K8s), or acme.sh
- Certificate validity: minimum 30-day renewal window

### DNS Configuration

```
yourdomain.com          → Pingora Proxy (main entry point)
api.yourdomain.com      → OAuth Service (backend API)
admin.yourdomain.com    → Admin Portal (management UI)
auth.yourdomain.com     → Auth endpoints (OIDC endpoints)
```

---

## Installation Guide

### Step 1: Prepare the Deployment Environment

```bash
# Clone the repository
git clone https://github.com/your-org/ts-next.git
cd ts-next

# Verify Node.js version
node --version  # Should be 18.x or higher
pnpm --version  # Should be 10.6.2+

# Verify git status
git status
git log --oneline -5
```

### Step 2: Generate JWT Keys

Required for OAuth Service (RS256 algorithm):

```bash
# Create keys directory
mkdir -p apps/oauth-service-rust/keys

# Generate private key (2048-bit RSA)
openssl genrsa -out apps/oauth-service-rust/keys/private_key.pem 2048

# Generate public key from private key
openssl rsa -in apps/oauth-service-rust/keys/private_key.pem \
  -pubout -out apps/oauth-service-rust/keys/public_key.pem

# Verify keys were generated
ls -la apps/oauth-service-rust/keys/

# Set proper permissions
chmod 600 apps/oauth-service-rust/keys/private_key.pem
chmod 644 apps/oauth-service-rust/keys/public_key.pem

# Verify key format
openssl rsa -in apps/oauth-service-rust/keys/private_key.pem -check -noout
```

### Step 3: Create Environment Files

#### Create `.env.oauth-service`

```bash
# OAuth Service Configuration
NODE_ENV=production
RUST_LOG=info,oauth_service_rust=debug

# Database
DATABASE_URL=sqlite:/app/data/oauth.db
# For MySQL: DATABASE_URL=mysql://oauth_user:password@mysql:3306/oauth_db
DB_MAX_CONNECTIONS=20

# JWT Configuration
JWT_ALGORITHM=RS256
JWT_PRIVATE_KEY_PATH=/app/keys/private_key.pem
JWT_PUBLIC_KEY_PATH=/app/keys/public_key.pem
JWT_EXPIRATION_HOURS=24
JWT_REFRESH_EXPIRATION_DAYS=30

# Service Configuration
ISSUER=https://auth.yourdomain.com
SERVER_HOST=0.0.0.0
SERVER_PORT=3001

# Logging
ENABLE_AUDIT_LOG=true
LOG_OUTPUT=file
LOG_FILE_PATH=/app/logs/oauth-service.log
LOG_LEVEL=debug

# CORS
ALLOWED_ORIGINS=https://admin.yourdomain.com,https://yourdomain.com

# Session
SESSION_SECRET=your-secret-key-min-32-chars-long-xxxxxxxxxxxx
SKIP_DB_INIT=false
```

#### Create `.env.admin-portal`

```bash
# Admin Portal Configuration
NODE_ENV=production
NEXT_TELEMETRY_DISABLED=1

# Server
PORT=3002
HOSTNAME=0.0.0.0

# OAuth Configuration
NEXT_PUBLIC_OAUTH_SERVICE_URL=https://api.yourdomain.com/api/v2
NEXT_PUBLIC_API_BASE_URL=https://api.yourdomain.com/api/v2
NEXT_PUBLIC_OAUTH_CLIENT_ID=admin-portal-client
NEXT_PUBLIC_OAUTH_REDIRECT_URI=https://admin.yourdomain.com/auth/callback
NEXT_PUBLIC_OAUTH_SCOPE=openid profile email offline_access

# API Configuration
OAUTH_CLIENT_SECRET=your-client-secret-xxxxxxxxxxxxxxxxxxxx
OAUTH_CODE_VERIFIER=your-code-verifier-xxxxxxxxxxxxxxxx
```

#### Create `.env` (for Docker Compose secrets)

```bash
# MySQL
MYSQL_ROOT_PASSWORD=your-secure-root-password-xxxxxxxxxxxx
MYSQL_PASSWORD=your-mysql-user-password-xxxxxxxxx

# Redis
REDIS_PASSWORD=your-redis-password-xxxxxxxxxx

# Grafana
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=your-grafana-password-xxxxxxxxxxxxx
```

### Step 4: Verify File Permissions

```bash
# Ensure proper ownership
chmod 600 .env .env.oauth-service .env.admin-portal
ls -la .env*

# Verify keys are accessible
ls -la apps/oauth-service-rust/keys/
```

### Step 5: Initialize Build Artifacts

#### For Docker Deployment

```bash
# Build Docker images
docker-compose -f docker-compose.production.yml build --no-cache

# Verify images
docker images | grep oauth
```

#### For Source Deployment

```bash
# Install dependencies
pnpm install

# Build all services
pnpm build

# Verify builds
ls -la apps/oauth-service-rust/target/release/
ls -la apps/admin-portal/.next/
ls -la apps/pingora-proxy/target/release/
```

---

## Docker Deployment

### Using Docker Compose (Single Host)

#### Starting Services

```bash
# Navigate to project root
cd /home/user/ts-next

# Start all services in background
docker-compose -f docker-compose.production.yml up -d

# View logs
docker-compose -f docker-compose.production.yml logs -f

# Check service status
docker-compose -f docker-compose.production.yml ps
```

#### Service Health Verification

```bash
# Check individual service health
docker-compose -f docker-compose.production.yml ps --services | while read service; do
  echo "Checking $service..."
  docker-compose -f docker-compose.production.yml exec -T $service curl http://localhost:$(docker-compose -f docker-compose.production.yml port $service 2>/dev/null | cut -d: -f2)/health 2>/dev/null || echo "Failed to check $service"
done

# Verify OAuth Service
curl -f http://localhost:3001/health

# Verify Admin Portal
curl -f http://localhost:3002/api/health

# Verify Pingora Proxy
curl -f http://localhost:80/health

# Verify Prometheus
curl -f http://localhost:9090/-/healthy

# Verify Grafana
curl -f http://localhost:3000/api/health
```

#### Stopping Services

```bash
# Graceful shutdown (30 second timeout)
docker-compose -f docker-compose.production.yml down

# With volume cleanup (data loss)
docker-compose -f docker-compose.production.yml down -v

# Force stop (immediate)
docker-compose -f docker-compose.production.yml kill
```

### Docker Volume Management

```bash
# List all volumes
docker volume ls | grep oauth

# Inspect a volume
docker volume inspect oauth-db-data

# Backup a volume
docker run --rm -v oauth-db-data:/data -v $(pwd):/backup \
  alpine tar czf /backup/oauth-db-backup-$(date +%Y%m%d).tar.gz /data

# Restore a volume
docker run --rm -v oauth-db-data:/data -v $(pwd):/backup \
  alpine tar xzf /backup/oauth-db-backup-20240101.tar.gz -C /

# Remove unused volumes
docker volume prune
```

### Resource Limits and Monitoring

#### View Docker Statistics

```bash
# Monitor all container resource usage
docker stats

# Monitor specific container
docker stats oauth-service-rust

# Format output to CSV
docker stats --format "table {{.Container}}\t{{.MemUsage}}\t{{.CPUPerc}}" --no-stream
```

#### Update Resource Limits

Edit `docker-compose.production.yml`:

```yaml
oauth-service:
  deploy:
    resources:
      limits:
        cpus: '2.0'        # Increase to 2 CPUs
        memory: 1024M      # Increase to 1 GB
      reservations:
        cpus: '1.0'
        memory: 512M
```

Apply changes:

```bash
docker-compose -f docker-compose.production.yml up -d oauth-service
```

### Network Configuration

#### View Network Details

```bash
# List networks
docker network ls | grep oauth

# Inspect network
docker network inspect oauth-network

# Check DNS resolution (from inside container)
docker-compose -f docker-compose.production.yml exec oauth-service \
  nslookup mysql
```

#### Custom Network Configuration

```yaml
# In docker-compose.production.yml
networks:
  oauth-network:
    driver: bridge
    driver_opts:
      com.docker.network.bridge.enable_ip_masquerade: "true"
      com.docker.network.bridge.enable_icc: "true"
    ipam:
      config:
        - subnet: 172.20.0.0/16
          gateway: 172.20.0.1
```

---

## Kubernetes Deployment

### Cluster Preparation

#### Verify Cluster Access

```bash
# Check cluster connectivity
kubectl cluster-info

# Get cluster version
kubectl version --short

# List available nodes
kubectl get nodes -o wide

# Check node resources
kubectl describe nodes
```

#### Create Namespace

```bash
# Create namespace for OAuth system
kubectl create namespace oauth-system

# Verify creation
kubectl get namespace oauth-system

# Set as default
kubectl config set-context --current --namespace=oauth-system
```

### Storage Configuration

#### Create Persistent Volumes

```bash
# Apply storage configuration
kubectl apply -f k8s/mysql/pv.yaml
kubectl apply -f k8s/mysql/pvc.yaml

# Verify PVs
kubectl get pv
kubectl get pvc -n oauth-system

# Check mount status
kubectl describe pvc -n oauth-system
```

### Secrets Management

#### Create Secrets from Environment Files

```bash
# Create secrets from files
kubectl create secret generic oauth-secrets \
  --from-file=.env.oauth-service \
  --from-file=.env.admin-portal \
  -n oauth-system

# Create database secrets
kubectl create secret generic mysql-secret \
  --from-literal=MYSQL_ROOT_PASSWORD='your-root-password' \
  --from-literal=MYSQL_PASSWORD='your-password' \
  -n oauth-system

# Create Redis secrets
kubectl create secret generic redis-secret \
  --from-literal=REDIS_PASSWORD='your-password' \
  -n oauth-system

# Verify secrets
kubectl get secrets -n oauth-system
```

#### Manage Secrets Securely

```bash
# Update a secret
kubectl delete secret mysql-secret -n oauth-system
kubectl create secret generic mysql-secret \
  --from-literal=MYSQL_ROOT_PASSWORD='new-password' \
  -n oauth-system

# Rotate secrets (requires pod restart)
kubectl rollout restart deployment/mysql-deployment -n oauth-system

# View secret metadata (not values)
kubectl get secret mysql-secret -n oauth-system -o yaml
```

### ConfigMap Management

#### Create ConfigMaps

```bash
# Create from files
kubectl create configmap app-config \
  --from-file=./k8s/app/configmap.yaml \
  -n oauth-system

# Create from literal values
kubectl create configmap oauth-config \
  --from-literal=NODE_ENV=production \
  --from-literal=LOG_LEVEL=info \
  -n oauth-system

# Verify ConfigMaps
kubectl get configmaps -n oauth-system
```

### Deployment

#### Deploy Using Kustomize

```bash
# Deploy entire stack (K8s v1.14+)
kubectl apply -k k8s/

# Verify deployments
kubectl get deployments -n oauth-system

# Check pod status
kubectl get pods -n oauth-system -w

# View detailed pod information
kubectl describe pod <pod-name> -n oauth-system

# View pod logs
kubectl logs <pod-name> -n oauth-system
kubectl logs <pod-name> -n oauth-system --previous  # Previous container logs
```

#### Deploy Individual Components

```bash
# Deploy MySQL
kubectl apply -f k8s/mysql/secret.yaml
kubectl apply -f k8s/mysql/service.yaml
kubectl apply -f k8s/mysql/pv.yaml
kubectl apply -f k8s/mysql/pvc.yaml
kubectl apply -f k8s/mysql/deployment.yaml

# Deploy Redis
kubectl apply -f k8s/redis/secret.yaml
kubectl apply -f k8s/redis/service.yaml
kubectl apply -f k8s/redis/deployment.yaml

# Deploy App
kubectl apply -f k8s/app/configmap.yaml
kubectl apply -f k8s/app/service.yaml
kubectl apply -f k8s/app/pv.yaml
kubectl apply -f k8s/app/pvc.yaml
kubectl apply -f k8s/app/deployment.yaml
kubectl apply -f k8s/app/ingress.yaml
```

### Ingress Configuration

#### Configure Ingress Controller

```yaml
# k8s/app/ingress.yaml example
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: oauth-ingress
  namespace: oauth-system
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - yourdomain.com
        - api.yourdomain.com
        - admin.yourdomain.com
      secretName: oauth-tls
  rules:
    - host: yourdomain.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: pingora-service
                port:
                  number: 80
    - host: api.yourdomain.com
      http:
        paths:
          - path: /api/v2
            pathType: Prefix
            backend:
              service:
                name: oauth-service
                port:
                  number: 3001
```

#### Install and Configure cert-manager

```bash
# Install cert-manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml

# Verify installation
kubectl get pods --namespace cert-manager

# Create ClusterIssuer for Let's Encrypt
kubectl apply -f - <<EOF
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@yourdomain.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
EOF

# Create certificate
kubectl apply -f - <<EOF
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: oauth-cert
  namespace: oauth-system
spec:
  secretName: oauth-tls
  issuerRef:
    name: letsencrypt-prod
    kind: ClusterIssuer
  dnsNames:
    - yourdomain.com
    - api.yourdomain.com
    - admin.yourdomain.com
    - auth.yourdomain.com
EOF
```

### Monitoring and Logging

#### Check Deployment Status

```bash
# Get all resources
kubectl get all -n oauth-system

# Check events
kubectl get events -n oauth-system --sort-by='.lastTimestamp'

# View specific resource
kubectl describe deployment oauth-deployment -n oauth-system
```

#### Pod Management

```bash
# Execute command in pod
kubectl exec -it <pod-name> -n oauth-system -- /bin/bash

# Port-forward to service
kubectl port-forward svc/oauth-service 3001:3001 -n oauth-system

# Get pod resource usage
kubectl top pod -n oauth-system
```

---

## Database Setup

### SQLite Configuration (Development/Small Deployments)

#### Initialize SQLite Database

```bash
# SQLite is embedded in the Rust service
# Database file location: /app/data/oauth.db

# For Docker:
docker-compose -f docker-compose.production.yml exec oauth-service \
  ls -la /app/data/

# Verify database
docker-compose -f docker-compose.production.yml exec oauth-service \
  sqlite3 /app/data/oauth.db ".tables"
```

#### SQLite Backup

```bash
# Backup from Docker volume
docker run --rm -v oauth-db-data:/data -v $(pwd):/backup \
  sqlite3 tar czf /backup/sqlite-backup-$(date +%Y%m%d-%H%M%S).tar.gz /data

# Or directly:
docker cp oauth-service-rust:/app/data/oauth.db ./oauth-backup-$(date +%Y%m%d).db
```

### MySQL Configuration (Production)

#### Initialize MySQL Database

```bash
# Environment variables
MYSQL_ROOT_PASSWORD="your-secure-password"
MYSQL_USER="oauth_user"
MYSQL_PASSWORD="user-password"
MYSQL_DATABASE="oauth_db"

# Start MySQL service
docker-compose -f docker-compose.production.yml up -d mysql

# Wait for MySQL to be ready
docker-compose -f docker-compose.production.yml exec mysql \
  mysqladmin ping -h localhost -u root -p"$MYSQL_ROOT_PASSWORD" --wait=10
```

#### Create Database and User

```bash
# Connect to MySQL
docker-compose -f docker-compose.production.yml exec mysql mysql -u root -p"$MYSQL_ROOT_PASSWORD"

# SQL commands
CREATE DATABASE oauth_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'oauth_user'@'%' IDENTIFIED BY 'user-password';
GRANT ALL PRIVILEGES ON oauth_db.* TO 'oauth_user'@'%';
FLUSH PRIVILEGES;
EXIT;
```

#### Run Migrations

```bash
# Automatic migration on container start
# Edit docker-compose.production.yml MySQL service:
volumes:
  - ./apps/oauth-service-rust/migrations/mysql:/docker-entrypoint-initdb.d:ro

# Manual migration
docker-compose -f docker-compose.production.yml exec oauth-service \
  mysql -h mysql -u oauth_user -p"$MYSQL_PASSWORD" oauth_db \
  < apps/oauth-service-rust/migrations/mysql/001_init.sql
```

#### MySQL Performance Tuning

```bash
# Edit docker-compose.production.yml MySQL command section
command: >
  --character-set-server=utf8mb4
  --collation-server=utf8mb4_unicode_ci
  --default-authentication-plugin=mysql_native_password
  --max-connections=200
  --innodb-buffer-pool-size=2G
  --innodb-log-file-size=512M
  --tmp-table-size=256M
  --max-heap-table-size=256M
  --query-cache-size=64M
  --query-cache-type=1

# For production servers:
mysql> SET GLOBAL innodb_buffer_pool_size = 2147483648;  # 2GB
mysql> SET GLOBAL max_connections = 500;
mysql> SHOW VARIABLES LIKE 'innodb%';
mysql> SHOW VARIABLES LIKE 'max_connections';
```

#### Database Monitoring

```bash
# Check database size
docker-compose -f docker-compose.production.yml exec mysql \
  mysql -u root -p"$MYSQL_ROOT_PASSWORD" -e \
  "SELECT table_schema, ROUND(SUM(data_length+index_length)/1024/1024,2) as 'Size in MB' FROM information_schema.tables GROUP BY table_schema;"

# Check table status
docker-compose -f docker-compose.production.yml exec mysql \
  mysql -u oauth_user -p"$MYSQL_PASSWORD" oauth_db -e "SHOW TABLE STATUS;"

# Monitor connections
docker-compose -f docker-compose.production.yml exec mysql \
  mysql -u root -p"$MYSQL_ROOT_PASSWORD" -e "SHOW PROCESSLIST;"
```

### Database Migrations

#### Verify Migration Status

```bash
# Check applied migrations
docker-compose -f docker-compose.production.yml exec mysql \
  mysql -u oauth_user -p"$MYSQL_PASSWORD" oauth_db \
  -e "SELECT * FROM schema_migrations;"
```

#### Apply New Migrations

```bash
# Place migration file in apps/oauth-service-rust/migrations/mysql/
# Format: NNN_description.sql (e.g., 002_add_audit_log.sql)

# Run migration
docker-compose -f docker-compose.production.yml exec oauth-service \
  mysql -h mysql -u oauth_user -p"$MYSQL_PASSWORD" oauth_db \
  < apps/oauth-service-rust/migrations/mysql/002_add_audit_log.sql

# Verify
docker-compose -f docker-compose.production.yml exec mysql \
  mysql -u oauth_user -p"$MYSQL_PASSWORD" oauth_db \
  -e "SHOW TABLES;"
```

### Redis Configuration (Optional)

#### Initialize Redis

```bash
# Start Redis service
docker-compose -f docker-compose.production.yml up -d redis

# Verify connection
docker-compose -f docker-compose.production.yml exec redis \
  redis-cli ping
```

#### Redis Configuration

Edit `redis.conf`:

```conf
# Network
port 6379
bind 0.0.0.0
tcp-backlog 511

# Memory
maxmemory 512mb
maxmemory-policy allkeys-lru

# Persistence
save 900 1
save 300 10
save 60 10000
appendonly yes
appendfsync everysec

# Replication (if needed)
# slaveof <ip> <port>

# Security
requirepass your-redis-password

# Logging
loglevel notice
logfile "/var/log/redis/redis-server.log"
```

#### Redis Monitoring

```bash
# Check memory usage
docker-compose -f docker-compose.production.yml exec redis \
  redis-cli INFO memory

# Check keys
docker-compose -f docker-compose.production.yml exec redis \
  redis-cli INFO keyspace

# Flush cache (caution!)
docker-compose -f docker-compose.production.yml exec redis \
  redis-cli FLUSHALL

# Monitor commands
docker-compose -f docker-compose.production.yml exec redis \
  redis-cli MONITOR
```

---

## SSL/TLS Configuration

### Certificate Generation

#### Using Let's Encrypt (Certbot)

```bash
# Install certbot
apt-get update && apt-get install -y certbot python3-certbot-nginx

# Generate certificates
certbot certonly --standalone \
  -d yourdomain.com \
  -d api.yourdomain.com \
  -d admin.yourdomain.com \
  -d auth.yourdomain.com \
  --email admin@yourdomain.com \
  --agree-tos \
  --non-interactive

# Verify certificates
ls -la /etc/letsencrypt/live/yourdomain.com/
```

#### Using OpenSSL (Self-Signed for Testing)

```bash
# Generate private key
openssl genrsa -out cert.key 2048

# Generate self-signed certificate
openssl req -new -x509 -key cert.key -out cert.crt -days 365 \
  -subj "/CN=yourdomain.com/O=Your Company/C=US"

# Verify certificate
openssl x509 -in cert.crt -text -noout
```

### Certificate Installation

#### For Docker Deployment

```bash
# Copy certificates to letsencrypt volume
docker run --rm -v letsencrypt-certs:/certs -v /etc/letsencrypt/live:/source \
  alpine cp -r /source/yourdomain.com /certs/

# Verify in container
docker-compose -f docker-compose.production.yml exec pingora-proxy \
  ls -la /etc/letsencrypt/live/yourdomain.com/
```

#### For Kubernetes Deployment

```bash
# Create TLS secret from certificates
kubectl create secret tls oauth-tls \
  --cert=/etc/letsencrypt/live/yourdomain.com/fullchain.pem \
  --key=/etc/letsencrypt/live/yourdomain.com/privkey.pem \
  -n oauth-system

# Verify secret
kubectl get secret oauth-tls -n oauth-system -o yaml
```

### Pingora Proxy Configuration

Configure Pingora proxy to use SSL/TLS certificates:

```yaml
# apps/pingora-proxy/config/production.yaml
listeners:
  - address: "0.0.0.0:443"
    tls: true
    cert_path: "/etc/letsencrypt/live/yourdomain.com/fullchain.pem"
    key_path: "/etc/letsencrypt/live/yourdomain.com/privkey.pem"

# Redirect HTTP to HTTPS
  - address: "0.0.0.0:80"
    tls: false
    redirect_https: true
```

### Certificate Renewal

#### Automatic Renewal (Docker)

```bash
# Create renewal cron job
docker run --rm -d \
  --name certbot-renewal \
  -v /etc/letsencrypt:/etc/letsencrypt \
  -v letsencrypt-certs:/certs \
  -p 80:80 \
  certbot/certbot \
  renew --quiet --agree-tos

# Or use host cron:
0 0 * * * certbot renew --quiet && \
  docker run --rm -v /etc/letsencrypt/live:/source -v letsencrypt-certs:/certs \
  alpine cp -r /source/yourdomain.com /certs/
```

#### Manual Renewal

```bash
# Renew specific domain
certbot renew --domain yourdomain.com --force-renewal

# Verify renewal
certbot certificates

# Copy to Docker volume
docker run --rm -v letsencrypt-certs:/certs -v /etc/letsencrypt/live:/source \
  alpine cp -r /source/yourdomain.com /certs/
```

### Certificate Monitoring

```bash
# Check certificate expiry
openssl x509 -in cert.crt -noout -dates

# Check certificate in Kubernetes
kubectl get secret oauth-tls -n oauth-system -o jsonpath='{.data.tls\.crt}' | \
  base64 -d | openssl x509 -noout -dates

# Monitor expiry with script
#!/bin/bash
CERT_FILE="/etc/letsencrypt/live/yourdomain.com/cert.pem"
EXPIRY_DATE=$(openssl x509 -enddate -noout -in "$CERT_FILE" | cut -d= -f2)
EXPIRY_EPOCH=$(date -d "$EXPIRY_DATE" +%s)
CURRENT_EPOCH=$(date +%s)
DAYS_LEFT=$(( ($EXPIRY_EPOCH - $CURRENT_EPOCH) / 86400 ))
echo "Certificate expires in $DAYS_LEFT days"
[ $DAYS_LEFT -lt 30 ] && echo "WARNING: Certificate expiring soon!"
```

---

## Environment Variables

### OAuth Service Environment Variables

```bash
# .env.oauth-service

# ===== Core Configuration =====
NODE_ENV=production              # Environment: development|staging|production
RUST_LOG=info                    # Rust logging level
SERVICE_NAME=oauth-service-rust  # Service identifier

# ===== Database Configuration =====
DATABASE_URL=sqlite:/app/data/oauth.db
# For MySQL: mysql://oauth_user:password@mysql:3306/oauth_db
# For PostgreSQL: postgresql://user:password@postgres:5432/oauth_db
DB_MAX_CONNECTIONS=20            # Connection pool size
DB_CONNECTION_TIMEOUT=30         # Seconds
DB_IDLE_TIMEOUT=300              # Seconds
SKIP_DB_INIT=false               # Skip automatic initialization

# ===== JWT Configuration =====
JWT_ALGORITHM=RS256              # RS256, HS256, ES256
JWT_PRIVATE_KEY_PATH=/app/keys/private_key.pem
JWT_PUBLIC_KEY_PATH=/app/keys/public_key.pem
JWT_EXPIRATION_HOURS=24          # Access token expiration
JWT_REFRESH_EXPIRATION_DAYS=30   # Refresh token expiration
JWT_ISSUER=https://auth.yourdomain.com

# ===== Server Configuration =====
ISSUER=https://auth.yourdomain.com
SERVER_HOST=0.0.0.0
SERVER_PORT=3001
API_BASE_PATH=/api/v2
REQUEST_TIMEOUT=30               # Seconds

# ===== Logging Configuration =====
ENABLE_AUDIT_LOG=true            # Enable audit logging
LOG_OUTPUT=file                  # file|console|both
LOG_FILE_PATH=/app/logs/oauth-service.log
LOG_LEVEL=debug                  # debug|info|warn|error
LOG_FORMAT=json                  # json|text
LOG_ROTATION_SIZE=52428800       # 50 MB
LOG_RETENTION_DAYS=30            # Keep logs for 30 days

# ===== CORS Configuration =====
ALLOWED_ORIGINS=https://admin.yourdomain.com,https://yourdomain.com
ALLOWED_METHODS=GET,POST,PUT,DELETE,OPTIONS
ALLOWED_HEADERS=Content-Type,Authorization,X-Requested-With

# ===== Session Configuration =====
SESSION_SECRET=your-secret-key-min-32-chars-long-xxxxxxxxxxxx
SESSION_COOKIE_SECURE=true       # HTTPS only
SESSION_COOKIE_HTTPONLY=true     # JS cannot access
SESSION_COOKIE_SAMESITE=Lax      # CSRF protection
SESSION_TIMEOUT_MINUTES=60       # Session expiration

# ===== OAuth2 Configuration =====
OAUTH2_ENABLE_PKCE=true
OAUTH2_PKCE_CHALLENGE_LENGTH=128
OAUTH2_AUTHORIZATION_CODE_TTL=600  # 10 minutes
OAUTH2_ACCESS_TOKEN_TTL=3600       # 1 hour
OAUTH2_REFRESH_TOKEN_TTL=2592000   # 30 days

# ===== Rate Limiting =====
RATE_LIMIT_ENABLED=true
RATE_LIMIT_REQUESTS=1000           # Requests per window
RATE_LIMIT_WINDOW_SECONDS=60       # Rolling window
RATE_LIMIT_BYPASS_KEYS=admin-key   # Bypass tokens (comma-separated)

# ===== Security =====
ENABLE_HTTPS_REDIRECT=true
ENABLE_HSTS=true
HSTS_MAX_AGE=31536000              # 1 year
HSTS_INCLUDE_SUBDOMAINS=true
HSTS_PRELOAD=true
ENABLE_CONTENT_SECURITY_POLICY=true

# ===== Monitoring =====
METRICS_ENABLED=true
METRICS_PORT=9091
TRACE_ENABLED=false
TRACE_SAMPLE_RATE=0.1
```

### Admin Portal Environment Variables

```bash
# .env.admin-portal

# ===== Core Configuration =====
NODE_ENV=production
NEXT_TELEMETRY_DISABLED=1

# ===== Server Configuration =====
PORT=3002
HOSTNAME=0.0.0.0

# ===== OAuth Client Configuration =====
NEXT_PUBLIC_OAUTH_SERVICE_URL=https://api.yourdomain.com/api/v2
NEXT_PUBLIC_API_BASE_URL=https://api.yourdomain.com/api/v2
NEXT_PUBLIC_OAUTH_CLIENT_ID=admin-portal-client
NEXT_PUBLIC_OAUTH_REDIRECT_URI=https://admin.yourdomain.com/auth/callback
NEXT_PUBLIC_OAUTH_SCOPE=openid profile email offline_access

# ===== Backend OAuth Configuration =====
OAUTH_CLIENT_SECRET=your-client-secret-xxxxxxxxxxxxxxxxxxxx
OAUTH_CODE_VERIFIER=your-code-verifier-xxxxxxxxxxxxxxxx

# ===== Feature Flags =====
NEXT_PUBLIC_ENABLE_DARK_MODE=true
NEXT_PUBLIC_ENABLE_ANALYTICS=true
NEXT_PUBLIC_ANALYTICS_ID=your-analytics-id

# ===== API Configuration =====
NEXT_PUBLIC_API_TIMEOUT=30000    # 30 seconds
NEXT_PUBLIC_RETRY_ATTEMPTS=3
NEXT_PUBLIC_RETRY_DELAY=1000     # 1 second

# ===== Logging =====
NEXT_PUBLIC_LOG_LEVEL=info       # debug|info|warn|error
NEXT_PUBLIC_LOG_OUTPUT=console   # console|file

# ===== Security Headers =====
NEXT_PUBLIC_CSP_ENABLED=true
NEXT_PUBLIC_CSP_NONCE=true
```

### Docker Compose Secrets

```bash
# .env (used by docker-compose)

# ===== MySQL Configuration =====
MYSQL_ROOT_PASSWORD=your-secure-root-password-xxxxxxxxxxxx
MYSQL_PASSWORD=your-mysql-user-password-xxxxxxxxx
MYSQL_INITDB_SKIP_TZINFO=yes

# ===== Redis Configuration =====
REDIS_PASSWORD=your-redis-password-xxxxxxxxxx

# ===== Grafana Configuration =====
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=your-grafana-password-xxxxxxxxxxxxx

# ===== Let's Encrypt (Certbot) =====
LETSENCRYPT_EMAIL=admin@yourdomain.com
LETSENCRYPT_DOMAIN=yourdomain.com
```

### Environment Variable Validation

```bash
# Script to validate environment variables
#!/bin/bash

# Required variables
REQUIRED_VARS=(
  "NODE_ENV"
  "DATABASE_URL"
  "JWT_PRIVATE_KEY_PATH"
  "JWT_PUBLIC_KEY_PATH"
  "ISSUER"
  "SESSION_SECRET"
)

for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var}" ]; then
    echo "ERROR: Required variable $var is not set"
    exit 1
  fi
done

# Validate key paths
if [ ! -f "${JWT_PRIVATE_KEY_PATH}" ]; then
  echo "ERROR: Private key not found at ${JWT_PRIVATE_KEY_PATH}"
  exit 1
fi

echo "✅ All environment variables validated"
```

---

## Health Checks and Monitoring

### Built-in Health Check Endpoints

#### OAuth Service Health

```bash
# Basic health check
curl -f http://localhost:3001/health

# Detailed health status
curl http://localhost:3001/health -H "Content-Type: application/json"

# Response:
{
  "status": "healthy",
  "service": "oauth-service",
  "version": "1.0.0",
  "timestamp": "2024-01-15T10:30:00Z",
  "dependencies": {
    "database": "connected",
    "cache": "connected"
  }
}
```

#### Admin Portal Health

```bash
# Health check endpoint
curl -f http://localhost:3002/api/health

# Response includes:
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

#### Pingora Proxy Health

```bash
# Proxy health check
curl -f http://localhost:80/health

# With verbose output
curl -v http://localhost:80/health
```

### Docker Health Checks

Configured in `docker-compose.production.yml`:

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
  interval: 30s      # Check every 30 seconds
  timeout: 10s       # Wait 10 seconds for response
  retries: 3         # Fail after 3 failures
  start_period: 30s  # Grace period before first check
```

View health status:

```bash
# Check container health
docker-compose -f docker-compose.production.yml ps

# View health status history
docker inspect oauth-service-rust --format='{{json .State.Health}}'

# Get logs from health checks
docker logs oauth-service-rust | grep -i health
```

### Kubernetes Liveness and Readiness Probes

```yaml
# In k8s deployment
livenessProbe:
  httpGet:
    path: /health
    port: 3001
  initialDelaySeconds: 30
  periodSeconds: 30
  timeoutSeconds: 5
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /health
    port: 3001
  initialDelaySeconds: 10
  periodSeconds: 15
  timeoutSeconds: 5
  failureThreshold: 3

# Check probe status
kubectl get pod <pod-name> -n oauth-system -o jsonpath='{.status.conditions}'
```

### Prometheus Monitoring

#### Prometheus Configuration

```yaml
# monitoring/prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    monitor: 'oauth-monitor'

scrape_configs:
  - job_name: 'oauth-service'
    static_configs:
      - targets: ['oauth-service:9091']
    scrape_interval: 10s

  - job_name: 'mysql'
    static_configs:
      - targets: ['mysql:3306']

  - job_name: 'redis'
    static_configs:
      - targets: ['redis:6379']

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']
```

#### Access Prometheus

```bash
# Local access
docker-compose -f docker-compose.production.yml port prometheus
# Output: 0.0.0.0:9090

# Via browser
open http://localhost:9090

# Query metrics
curl 'http://localhost:9090/api/v1/query?query=up'

# PromQL queries
http_requests_total{service="oauth-service"}
rate(http_requests_total[5m])
histogram_quantile(0.95, http_request_duration_seconds_bucket)
```

### Grafana Dashboards

#### Access Grafana

```bash
# Get Grafana service port
docker-compose -f docker-compose.production.yml port grafana
# Output: 0.0.0.0:3000

# Default credentials
username: admin
password: (from GRAFANA_ADMIN_PASSWORD env var)

# Via browser
open http://localhost:3000
```

#### Create Dashboard

1. Grafana UI → Dashboards → New Dashboard
2. Add Panel → Select Prometheus data source
3. Write PromQL query:
   ```
   rate(http_requests_total{service="oauth-service"}[5m])
   ```
4. Configure visualization (graph, gauge, table, etc.)
5. Set alert thresholds if needed
6. Save dashboard

#### Pre-configured Dashboards

Import community dashboards:
- Node Exporter Full: 1860
- MySQL Exporter: 7362
- Redis Exporter: 11835

### Loki Log Aggregation

#### Access Loki

```bash
# Loki push gateway
curl -X POST http://localhost:3100/loki/api/v1/push \
  -H "Content-Type: application/json" \
  -d '{
    "streams": [{
      "stream": {"job": "oauth-service"},
      "values": [["1631875200000000000", "Log message"]]
    }]
  }'

# Query logs
curl 'http://localhost:3100/loki/api/v1/query?query={job="oauth-service"}'
```

#### Loki Configuration

```yaml
# monitoring/loki-config.yml
auth_enabled: false

ingester:
  chunk_idle_period: 3m
  chunk_retain_period: 1m
  max_chunk_age: 1h

limits_config:
  enforce_metric_name: false
  reject_old_samples: true
  reject_old_samples_max_age: 168h

schema_config:
  configs:
    - from: 2020-10-24
      store: boltdb-shipper
      object_store: filesystem
      schema:
        version: v11
        index:
          prefix: index_
          period: 24h

server:
  http_listen_port: 3100
  log_level: info
```

### Custom Metrics

#### OAuth Service Metrics

Enable metrics in environment:

```bash
METRICS_ENABLED=true
METRICS_PORT=9091
```

Common metrics:
- `oauth_authorization_requests_total` - Total authorization requests
- `oauth_token_issued_total` - Total tokens issued
- `oauth_token_revoked_total` - Total tokens revoked
- `oauth_login_attempts_total` - Total login attempts
- `oauth_login_failures_total` - Failed login attempts
- `oauth_authorization_latency_ms` - Authorization request latency
- `oauth_database_connections_active` - Active database connections
- `oauth_cache_hits_total` - Cache hit count
- `oauth_cache_misses_total` - Cache miss count

#### Create Custom Alerts

```yaml
# monitoring/alert-rules.yml
groups:
  - name: oauth_alerts
    interval: 30s
    rules:
      - alert: HighErrorRate
        expr: |
          (sum(rate(http_requests_total{status=~"5.."}[5m])) by (service)) /
          (sum(rate(http_requests_total[5m])) by (service)) > 0.05
        for: 5m
        annotations:
          summary: "High error rate detected on {{ $labels.service }}"

      - alert: HighLatency
        expr: histogram_quantile(0.95, http_request_duration_seconds_bucket) > 1
        for: 10m
        annotations:
          summary: "High request latency detected"

      - alert: DatabaseConnectionPoolExhausted
        expr: oauth_database_connections_active / oauth_database_connections_max > 0.8
        for: 5m
        annotations:
          summary: "Database connection pool nearly exhausted"
```

---

## Backup and Recovery

### Database Backup Strategies

#### SQLite Backup

```bash
# On-demand backup
docker cp oauth-service-rust:/app/data/oauth.db \
  /backup/oauth-$(date +%Y%m%d-%H%M%S).db

# Verify backup
sqlite3 /backup/oauth-20240115-101500.db ".tables"

# Automated backup (cron job)
0 2 * * * docker cp oauth-service-rust:/app/data/oauth.db \
  /backup/oauth-$(date +\%Y\%m\%d).db && \
  find /backup -name "oauth-*.db" -mtime +30 -delete
```

#### MySQL Backup

```bash
# Full database dump
docker-compose -f docker-compose.production.yml exec mysql \
  mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" --all-databases > \
  /backup/mysql-full-$(date +%Y%m%d-%H%M%S).sql

# Single database dump
docker-compose -f docker-compose.production.yml exec mysql \
  mysqldump -u oauth_user -p"$MYSQL_PASSWORD" oauth_db > \
  /backup/oauth-db-$(date +%Y%m%d).sql

# With compression
mysqldump -u oauth_user -p oauth_db | gzip > \
  /backup/oauth-db-$(date +%Y%m%d).sql.gz

# Automated backup script
#!/bin/bash
BACKUP_DIR="/backup/mysql"
MYSQL_ROOT_PASSWORD="your-password"
RETENTION_DAYS=30

mkdir -p "$BACKUP_DIR"

# Full backup
docker-compose -f docker-compose.production.yml exec mysql \
  mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" --all-databases --quick --lock-tables=false | \
  gzip > "$BACKUP_DIR/full-$(date +%Y%m%d-%H%M%S).sql.gz"

# Cleanup old backups
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +$RETENTION_DAYS -delete

# Backup size
du -sh "$BACKUP_DIR"
```

#### Streaming Binary Log Backup (Incremental)

```bash
# Enable binary logging in MySQL
docker-compose -f docker-compose.production.yml exec mysql \
  mysql -u root -p"$MYSQL_ROOT_PASSWORD" -e \
  "SET GLOBAL binlog_format='ROW';"

# Backup binary logs
docker-compose -f docker-compose.production.yml exec mysql \
  mysqlbinlog --read-from-remote-server -u root -p"$MYSQL_ROOT_PASSWORD" \
  mysql-bin.000001 > /backup/binlog-000001.sql
```

#### Volume-level Backup (Docker)

```bash
# Backup entire volume
docker run --rm -v oauth-db-data:/data -v /backup:/backup \
  alpine tar czf /backup/oauth-db-vol-$(date +%Y%m%d).tar.gz /data

# Backup multiple volumes
docker run --rm \
  -v oauth-db-data:/db-data \
  -v ./mysql-data:/mysql-data \
  -v /backup:/backup \
  alpine tar czf /backup/full-backup-$(date +%Y%m%d).tar.gz \
  /db-data /mysql-data

# Verify backup
tar tzf /backup/oauth-db-vol-20240115.tar.gz | head -20
```

### Redis Backup

```bash
# Enable RDB (snapshot) persistence
docker-compose -f docker-compose.production.yml exec redis \
  redis-cli BGSAVE

# Enable AOF (append-only file) persistence
docker-compose -f docker-compose.production.yml exec redis \
  redis-cli CONFIG SET appendonly yes

# Backup RDB file
docker cp oauth-redis:/data/dump.rdb /backup/redis-dump-$(date +%Y%m%d).rdb

# Backup AOF file
docker cp oauth-redis:/data/appendonly.aof /backup/redis-aof-$(date +%Y%m%d).aof
```

### Recovery Procedures

#### SQLite Recovery

```bash
# Verify backup integrity
sqlite3 /backup/oauth-20240115-101500.db "SELECT COUNT(*) FROM oauth_user;"

# Restore from backup
docker-compose -f docker-compose.production.yml down oauth-service

docker run --rm \
  -v oauth-db-data:/app/data \
  -v /backup:/backup \
  alpine cp /backup/oauth-20240115-101500.db /app/data/oauth.db

docker-compose -f docker-compose.production.yml up -d oauth-service
```

#### MySQL Recovery

```bash
# Restore from full backup
docker-compose -f docker-compose.production.yml exec mysql \
  mysql -u root -p"$MYSQL_ROOT_PASSWORD" < /backup/oauth-db-20240115.sql

# Restore from compressed backup
gunzip < /backup/oauth-db-20240115.sql.gz | \
docker-compose -f docker-compose.production.yml exec -T mysql \
  mysql -u root -p"$MYSQL_ROOT_PASSWORD"

# Restore single table
docker-compose -f docker-compose.production.yml exec mysql \
  mysql -u oauth_user -p"$MYSQL_PASSWORD" oauth_db < \
  /backup/oauth_user_table-20240115.sql

# Restore with progress indicator
pv /backup/oauth-db-20240115.sql.gz | gunzip | \
docker-compose -f docker-compose.production.yml exec -T mysql \
  mysql -u root -p"$MYSQL_ROOT_PASSWORD"
```

#### Point-in-Time Recovery (PITR)

```bash
# Restore from full backup first
mysql -u root -p < /backup/full-20240115.sql

# Apply binary logs until specific time
mysqlbinlog --stop-datetime="2024-01-15 14:00:00" \
  /backup/binlog-000001.sql | mysql -u root -p

# Verify recovery
mysql -e "SELECT * FROM oauth_db.oauth_user LIMIT 1;"
```

### Backup Verification

```bash
# Script to verify backups
#!/bin/bash

BACKUP_DIR="/backup"
ALERT_EMAIL="admin@yourdomain.com"

check_backup() {
  local backup_file=$1
  local backup_age=$(($(date +%s) - $(stat -f%m "$backup_file" 2>/dev/null || stat -c%Y "$backup_file")))
  local backup_age_hours=$((backup_age / 3600))

  if [ $backup_age_hours -gt 25 ]; then
    echo "WARNING: Backup $backup_file is older than 24 hours" | \
    mail -s "Backup Verification Alert" "$ALERT_EMAIL"
    return 1
  fi

  # Verify backup integrity
  if [[ "$backup_file" == *.gz ]]; then
    gunzip -t "$backup_file" > /dev/null 2>&1 || return 1
  fi

  return 0
}

# Check all backups
for backup in $BACKUP_DIR/*.{db,sql.gz}; do
  check_backup "$backup"
done

echo "✅ Backup verification completed"
```

### Disaster Recovery Plan

```
Tier 1: Backup Frequency
- Critical data (user accounts): Every 1 hour
- Transaction logs (MySQL binlog): Continuous streaming
- Application data: Every 4 hours
- Configuration: Every 24 hours

Tier 2: Backup Retention
- Daily backups: 7 days
- Weekly backups: 4 weeks
- Monthly backups: 12 months
- Annual archive: Indefinite

Tier 3: Recovery Time Objectives (RTO)
- Critical systems: 1 hour
- Standard services: 4 hours
- Non-critical: 24 hours

Tier 4: Recovery Point Objectives (RPO)
- Critical data: 1 hour
- Standard data: 4 hours
- Non-critical: 24 hours
```

---

## Troubleshooting

### Common Issues and Solutions

#### Issue: Services Failing to Start

**Symptom**: `docker-compose up -d` fails or containers exit immediately

```bash
# Check container logs
docker logs oauth-service-rust

# Check exit code
docker inspect oauth-service-rust --format='{{.State.ExitCode}}'

# Common exit codes:
# 0: Successful exit
# 1: General error
# 137: Killed (out of memory)
# 139: Segmentation fault
```

**Solutions**:

1. **Check environment variables**:
   ```bash
   docker inspect oauth-service-rust --format='{{json .Config.Env}}' | jq
   ```

2. **Check volume mounts**:
   ```bash
   docker inspect oauth-service-rust -f '{{json .Mounts}}' | jq
   ```

3. **Verify dependencies are running**:
   ```bash
   docker-compose -f docker-compose.production.yml ps
   ```

#### Issue: High Memory Usage

**Symptom**: Container constantly restarting or system slowdown

```bash
# Check memory usage
docker stats oauth-service-rust

# Increase memory limit
docker-compose -f docker-compose.production.yml stop
# Edit docker-compose.production.yml
# Increase memory limits in deploy.resources.limits.memory
docker-compose -f docker-compose.production.yml up -d
```

#### Issue: Database Connection Errors

**Symptom**: "Connection refused" or "timeout" errors in logs

```bash
# Check database health
docker-compose -f docker-compose.production.yml exec mysql \
  mysqladmin ping -h localhost -u root -p"$MYSQL_ROOT_PASSWORD"

# Check connection pool
docker-compose -f docker-compose.production.yml exec oauth-service \
  curl -s http://localhost:3001/metrics | grep connection

# Increase connection limit
# Edit docker-compose.production.yml MySQL command:
--max-connections=300
```

#### Issue: TLS Certificate Errors

**Symptom**: "Certificate verification failed" or "untrusted certificate"

```bash
# Check certificate validity
openssl x509 -in /etc/letsencrypt/live/yourdomain.com/cert.pem \
  -noout -dates

# Verify certificate chain
openssl s_client -connect yourdomain.com:443 \
  -CApath /etc/ssl/certs

# Force certificate renewal
certbot renew --force-renewal --domain yourdomain.com

# Restart services with new certificate
docker-compose -f docker-compose.production.yml restart pingora-proxy
```

#### Issue: Slow Requests or Timeouts

**Symptom**: 504 Gateway Timeout, slow response times

```bash
# Check service health
curl -v http://localhost:3001/health

# Monitor request latency
docker-compose -f docker-compose.production.yml logs oauth-service \
  | grep latency

# Check database query performance
docker-compose -f docker-compose.production.yml exec mysql \
  mysql -u oauth_user -p"$MYSQL_PASSWORD" oauth_db \
  -e "SHOW FULL PROCESSLIST;"

# Enable query logging
docker-compose -f docker-compose.production.yml exec mysql \
  mysql -u root -p"$MYSQL_ROOT_PASSWORD" \
  -e "SET GLOBAL slow_query_log = 'ON';"
```

#### Issue: Disk Space Issues

**Symptom**: "No space left on device" errors

```bash
# Check disk usage
df -h

# Identify large files/directories
du -sh /* | sort -hr

# Clean up Docker
docker system df
docker system prune -a

# Clean up logs
docker-compose -f docker-compose.production.yml logs --tail 0 -t | head -1

# Rotate logs manually
truncate -s 0 /var/lib/docker/containers/*/*-json.log
```

#### Issue: Kubernetes Pod Not Starting

**Symptom**: `CrashLoopBackOff` or `Pending` status

```bash
# Check pod status
kubectl describe pod <pod-name> -n oauth-system

# View pod events
kubectl get events -n oauth-system --sort-by='.lastTimestamp'

# Check resource availability
kubectl top nodes
kubectl describe nodes

# Check PVC mounting
kubectl get pvc -n oauth-system
kubectl describe pvc <pvc-name> -n oauth-system
```

### Debugging Commands

```bash
# Deep dive into service logs
docker-compose -f docker-compose.production.yml logs --follow --tail 100 oauth-service

# Execute command in running container
docker-compose -f docker-compose.production.yml exec oauth-service \
  curl http://localhost:3001/health

# Interactive shell access
docker-compose -f docker-compose.production.yml exec oauth-service \
  /bin/bash

# View container network configuration
docker inspect oauth-service-rust --format='{{json .NetworkSettings}}'

# Monitor system calls (requires strace)
docker-compose -f docker-compose.production.yml exec oauth-service \
  strace -e trace=network curl http://localhost:3001/health

# Kubernetes pod debugging
kubectl debug <pod-name> -it -n oauth-system -- /bin/bash
kubectl logs <pod-name> -n oauth-system --previous
kubectl port-forward <pod-name> 3001:3001 -n oauth-system
```

---

## Maintenance Tasks

### Log Management

#### Log Rotation (Docker)

Configure in `docker-compose.production.yml`:

```yaml
logging:
  driver: "json-file"
  options:
    max-size: "50m"      # Rotate when 50 MB reached
    max-file: "5"        # Keep 5 rotated files
    labels: "service=oauth"
```

Manual log rotation:

```bash
# Rotate logs
docker-compose -f docker-compose.production.yml restart oauth-service

# Clear logs
truncate -s 0 /var/lib/docker/containers/*/*-json.log

# Archive logs
find /var/lib/docker/containers -name "*-json.log" \
  -mtime +7 -exec gzip {} \;
```

#### Log Cleanup (System)

```bash
# Remove old log files
find /app/logs -name "*.log" -mtime +30 -delete

# Archive logs older than 7 days
find /app/logs -name "*.log" -mtime +7 -exec gzip {} \;

# Compress rotated logs
find /app/logs -name "*.log.[0-9]" -exec gzip {} \;

# Cleanup script (cron)
0 0 * * * find /app/logs -name "*.log" -mtime +30 -delete
```

### Database Maintenance

#### MySQL Maintenance

```bash
# Analyze tables for query optimizer
docker-compose -f docker-compose.production.yml exec mysql \
  mysql -u oauth_user -p"$MYSQL_PASSWORD" oauth_db \
  -e "ANALYZE TABLE oauth_user, oauth_client, oauth_token;"

# Optimize tables to reclaim space
docker-compose -f docker-compose.production.yml exec mysql \
  mysql -u oauth_user -p"$MYSQL_PASSWORD" oauth_db \
  -e "OPTIMIZE TABLE oauth_user, oauth_client, oauth_token;"

# Check table integrity
docker-compose -f docker-compose.production.yml exec mysql \
  mysql -u oauth_user -p"$MYSQL_PASSWORD" oauth_db \
  -e "CHECK TABLE oauth_user, oauth_client, oauth_token;"

# Fix corrupted tables
docker-compose -f docker-compose.production.yml exec mysql \
  mysql -u oauth_user -p"$MYSQL_PASSWORD" oauth_db \
  -e "REPAIR TABLE oauth_user;"

# Vacuum / Clean up
docker-compose -f docker-compose.production.yml exec mysql \
  mysql -u root -p"$MYSQL_ROOT_PASSWORD" \
  -e "FLUSH TABLES;" && \
  "FLUSH PRIVILEGES;"

# Scheduled maintenance (cron)
0 2 * * 0 docker-compose -f docker-compose.production.yml exec -T mysql \
  mysql -u root -p"$MYSQL_ROOT_PASSWORD" -e \
  "OPTIMIZE TABLE oauth_db.*; ANALYZE TABLE oauth_db.*;"
```

#### Remove Expired Tokens

```bash
# Script to clean up expired OAuth tokens
#!/bin/bash

docker-compose -f docker-compose.production.yml exec mysql \
  mysql -u oauth_user -p"$MYSQL_PASSWORD" oauth_db << EOF
DELETE FROM oauth_token WHERE expires_at < NOW();
DELETE FROM oauth_session WHERE expires_at < NOW();
OPTIMIZE TABLE oauth_token;
EOF
```

### Cache Maintenance

#### Redis Cache Cleanup

```bash
# Monitor cache size
docker-compose -f docker-compose.production.yml exec redis \
  redis-cli INFO memory

# Clear specific key pattern
docker-compose -f docker-compose.production.yml exec redis \
  redis-cli KEYS "session:*" | \
  xargs docker-compose -f docker-compose.production.yml exec -T redis \
  redis-cli DEL

# Flush entire cache (caution!)
docker-compose -f docker-compose.production.yml exec redis \
  redis-cli FLUSHALL

# Scheduled cache cleanup (cron)
0 3 * * * docker-compose -f docker-compose.production.yml exec -T redis \
  redis-cli EVAL "return redis.call('del', unpack(redis.call('keys', ARGV[1])))" 0 "session:*"
```

### System Updates

#### Update Docker Images

```bash
# Pull latest base images
docker-compose -f docker-compose.production.yml pull

# Rebuild services
docker-compose -f docker-compose.production.yml build --no-cache

# Update and restart
docker-compose -f docker-compose.production.yml up -d --force-recreate
```

#### Update Application Code

```bash
# Pull latest code
git pull origin main

# Rebuild application image
docker-compose -f docker-compose.production.yml build --no-cache oauth-service

# Deploy new version
docker-compose -f docker-compose.production.yml up -d oauth-service

# Verify deployment
curl -f http://localhost:3001/health
```

### Security Updates

```bash
# Check for vulnerable dependencies
docker-compose -f docker-compose.production.yml exec oauth-service \
  npm audit

# Update packages
docker-compose -f docker-compose.production.yml exec oauth-service \
  npm update

# Scan Docker images for vulnerabilities
trivy image liushuodocker/ts-next:latest

# Remove unused images
docker image prune -a

# Update security patches on host
apt-get update && apt-get upgrade -y
```

### Scheduled Maintenance Window

```bash
# Maintenance notification script
#!/bin/bash

MAINTENANCE_WINDOW="2024-01-20 02:00:00 UTC"
SLACK_WEBHOOK="https://hooks.slack.com/services/YOUR/WEBHOOK"

echo "OAuth System Maintenance: $MAINTENANCE_WINDOW"

# Notify via Slack
curl -X POST "$SLACK_WEBHOOK" \
  -H "Content-Type: application/json" \
  -d "{\"text\": \"🔧 OAuth System Maintenance Starting: $MAINTENANCE_WINDOW\"}"

# Start backup
docker-compose -f docker-compose.production.yml exec mysql \
  mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" --all-databases | \
  gzip > /backup/pre-maintenance-$(date +%Y%m%d).sql.gz

# Stop services gracefully
docker-compose -f docker-compose.production.yml stop --time=60

# Perform maintenance
echo "Running maintenance tasks..."

# Restart services
docker-compose -f docker-compose.production.yml up -d

# Verify services
./health-check.sh

# Notify completion
curl -X POST "$SLACK_WEBHOOK" \
  -H "Content-Type: application/json" \
  -d "{\"text\": \"✅ OAuth System Maintenance Completed\"}"
```

---

## Scaling Guide

### Horizontal Scaling (Adding Servers)

#### Load Balancing Strategy

Use Pingora Proxy (already configured) or deploy additional instances:

```yaml
# docker-compose.production.yml - add multiple instances
oauth-service-1:
  image: oauth-service-rust:latest
  ports:
    - "3001:3001"

oauth-service-2:
  image: oauth-service-rust:latest
  ports:
    - "3011:3001"

oauth-service-3:
  image: oauth-service-rust:latest
  ports:
    - "3021:3001"

# Pingora Proxy forwards to all instances
```

#### Kubernetes Horizontal Pod Autoscaler

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: oauth-service-hpa
  namespace: oauth-system
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: oauth-service
  minReplicas: 3
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
        - type: Percent
          value: 100
          periodSeconds: 30
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Pods
          value: 1
          periodSeconds: 60
```

Apply HPA:

```bash
kubectl apply -f hpa.yaml -n oauth-system
kubectl get hpa -n oauth-system
kubectl describe hpa oauth-service-hpa -n oauth-system
```

### Vertical Scaling (More Resources per Server)

#### Docker Compose Resource Updates

Edit `docker-compose.production.yml`:

```yaml
oauth-service:
  deploy:
    resources:
      limits:
        cpus: '4.0'        # Increase CPU
        memory: 2048M      # Increase memory
      reservations:
        cpus: '2.0'
        memory: 1024M

admin-portal:
  deploy:
    resources:
      limits:
        cpus: '4.0'
        memory: 2048M
      reservations:
        cpus: '2.0'
        memory: 1024M
```

Restart services:

```bash
docker-compose -f docker-compose.production.yml up -d --force-recreate
```

#### Kubernetes Resource Updates

```bash
# Edit deployment
kubectl set resources deployment oauth-service \
  --limits=cpu=4,memory=2Gi \
  --requests=cpu=2,memory=1Gi \
  -n oauth-system

# Verify changes
kubectl describe deployment oauth-service -n oauth-system
```

### Database Scaling

#### MySQL Replication (Master-Slave)

```sql
-- On Master server
CREATE USER 'repl'@'%' IDENTIFIED BY 'repl-password';
GRANT REPLICATION SLAVE ON *.* TO 'repl'@'%';
SHOW MASTER STATUS;

-- On Slave server
CHANGE MASTER TO
  MASTER_HOST='master-ip',
  MASTER_USER='repl',
  MASTER_PASSWORD='repl-password',
  MASTER_LOG_FILE='mysql-bin.000001',
  MASTER_LOG_POS=154;

START SLAVE;
SHOW SLAVE STATUS\G
```

#### MySQL Sharding

For very large datasets, implement sharding:

```
User ID 1-1000000 → oauth-db-1
User ID 1000001-2000000 → oauth-db-2
User ID 2000001-3000000 → oauth-db-3
```

Application routing:

```rust
fn get_shard(user_id: u64) -> String {
    match user_id {
        1..=1000000 => "oauth-db-1".to_string(),
        1000001..=2000000 => "oauth-db-2".to_string(),
        2000001..=3000000 => "oauth-db-3".to_string(),
        _ => "oauth-db-1".to_string(),
    }
}
```

### Redis Clustering

Enable Redis cluster mode for high availability:

```bash
# Generate cluster config
for i in {1..6}; do
  docker-compose -f docker-compose.production.yml up -d redis-$i
done

# Initialize cluster
docker-compose -f docker-compose.production.yml exec redis-1 \
  redis-cli --cluster create \
  redis-1:6379 redis-2:6379 redis-3:6379 \
  redis-4:6379 redis-5:6379 redis-6:6379 \
  --cluster-replicas 1
```

### Caching Strategy

#### Application-level Caching

```rust
// Cache authorization checks
const CACHE_TTL: Duration = Duration::from_secs(300); // 5 minutes

let cached_auth = cache.get(&format!("auth:{}", user_id)).await;
if cached_auth.is_some() {
    return cached_auth;
}

// Perform authorization
let result = authorize_user(user_id).await;
cache.set(&format!("auth:{}", user_id), &result, CACHE_TTL).await;
result
```

#### CDN Integration

For serving static assets:

```
Admin Portal Assets → CDN (Cloudflare, AWS CloudFront)
Admin Portal → Origin (3002)
```

### Session Management at Scale

#### Distributed Session Store (Redis)

```rust
// Instead of in-memory sessions, use Redis
use redis::Client;

let redis_client = Client::open("redis://redis:6379")?;
let mut connection = redis_client.get_connection()?;

// Store session
redis::cmd("SET")
    .arg(&format!("session:{}", session_id))
    .arg(&session_data)
    .arg("EX")
    .arg(3600)
    .execute(&mut connection);
```

#### Sticky Sessions (Optional)

```yaml
# Pingora Proxy - sticky session by cookie
upstream oauth_backends {
    hash $cookie_sessionid consistent;
    server oauth-service-1:3001;
    server oauth-service-2:3001;
    server oauth-service-3:3001;
}
```

### Monitoring Scaled Infrastructure

#### Dashboard for Multiple Nodes

```yaml
# Grafana dashboard: Node Overview
SELECT up{job="node-exporter"}
SELECT 100 * (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes))
SELECT rate(node_disk_io_time_ms_total[5m])
SELECT rate(node_network_receive_bytes_total[5m])
```

#### Distributed Tracing

```bash
# Install Jaeger for distributed tracing
docker-compose -f docker-compose.production.yml up -d jaeger

# Configure services to report to Jaeger
JAEGER_AGENT_HOST=jaeger
JAEGER_AGENT_PORT=6831
JAEGER_TRACE_ENABLED=true
```

### Cost Optimization

```
Resource Usage Monitoring:
- Track CPU utilization per service
- Monitor memory consumption
- Analyze network bandwidth usage
- Review storage growth trends

Optimization Opportunities:
- Reduce resource requests when utilization low
- Implement auto-scaling down during off-peak hours
- Remove unused services and volumes
- Consolidate databases if possible
- Use spot instances for non-critical workloads
```

---

## Appendices

### A. Quick Reference Commands

```bash
# Start all services
docker-compose -f docker-compose.production.yml up -d

# Check health
curl http://localhost:3001/health
curl http://localhost:3002/api/health

# View logs
docker logs oauth-service-rust -f

# Stop services
docker-compose -f docker-compose.production.yml down

# Backup database
docker cp oauth-service-rust:/app/data/oauth.db backup.db
```

### B. Useful Tools

- **Docker Desktop**: GUI for managing containers
- **Portainer**: Web UI for Docker management
- **ctop**: Container top monitoring tool
- **Prometheus**: Metrics collection
- **Grafana**: Metrics visualization
- **AlertManager**: Alerting system
- **Loki**: Log aggregation

### C. Related Documentation

- [Architecture Guide](/home/user/ts-next/docs/ARCHITECTURE.md)
- [API Documentation](/home/user/ts-next/docs/API_DOCUMENTATION.md)
- [Database Design](/home/user/ts-next/DATABASE_DESIGN.md)
- [OAuth 2.1 Business Flows](/home/user/ts-next/docs/OAUTH_2.1_BUSINESS_FLOWS.md)

### D. Support and Escalation

For issues requiring immediate attention:

1. **Check logs**: `docker logs <service>`
2. **Monitor resources**: `docker stats`
3. **Review metrics**: Prometheus/Grafana dashboards
4. **Execute health checks**: `curl /health` endpoints
5. **Contact support team** with collected diagnostics

---

**Document Maintained By**: DevOps Team
**Last Review Date**: 2025-11-17
**Next Review Date**: 2025-12-17
**Version Control**: Git repository at /home/user/ts-next/docs/

