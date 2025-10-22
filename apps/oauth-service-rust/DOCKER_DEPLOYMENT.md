# OAuth Service Rust - Docker Deployment Guide

## Overview

This guide explains how to deploy the OAuth Service Rust implementation using Docker and Docker Compose.

## Prerequisites

- Docker 20.10 or later
- Docker Compose 2.0 or later
- JWT RSA key pair (private.pem and public.pem)

## Quick Start

### 1. Build and Run with Docker Compose

```bash
# Build and start the service
docker-compose up -d

# View logs
docker-compose logs -f oauth-service-rust

# Stop the service
docker-compose down
```

### 2. Using Makefile (Recommended)

```bash
# Build and deploy
make deploy

# View logs
make deploy-logs

# Restart service
make deploy-restart

# Stop services
make deploy-stop
```

## Configuration

### Environment Variables

The service can be configured via environment variables in `docker-compose.yml`:

```yaml
environment:
  # Database
  DATABASE_URL: "file:/app/data/oauth.db"

  # JWT Keys
  JWT_PRIVATE_KEY_PATH: "/app/config/jwt/private.pem"
  JWT_PUBLIC_KEY_PATH: "/app/config/jwt/public.pem"
  JWT_ISSUER: "https://oauth.example.com"

  # Logging
  RUST_LOG: "info,oauth_service_rust=debug"
  RUST_BACKTRACE: "1"

  # CORS
  ALLOWED_ORIGINS: "http://localhost:3000,http://localhost:3002"
```

### Volumes

Three volumes are used for data persistence:

- `oauth-data`: SQLite database storage
- `oauth-logs`: Application logs
- `./config/jwt`: JWT key files (read-only mount)

### Ports

- **External Port**: 3005 (configurable)
- **Internal Port**: 3001 (fixed)

The external port is set to 3005 to avoid conflicts with the Node.js OAuth service (port 3001).

## Production Deployment

### 1. Generate Production JWT Keys

```bash
# Generate RSA private key
openssl genrsa -out config/jwt/private.pem 2048

# Extract public key
openssl rsa -in config/jwt/private.pem -pubout -out config/jwt/public.pem

# Set proper permissions
chmod 600 config/jwt/private.pem
chmod 644 config/jwt/public.pem
```

### 2. Update Environment Variables

Create a `.env` file for production:

```bash
# .env
DATABASE_URL=file:/app/data/oauth.db
JWT_ISSUER=https://your-production-domain.com
ALLOWED_ORIGINS=https://your-app.com,https://admin.your-app.com
RUST_LOG=info
```

Update `docker-compose.yml` to use the `.env` file:

```yaml
services:
  oauth-service-rust:
    env_file:
      - .env
```

### 3. Configure Resource Limits

Adjust CPU and memory limits in `docker-compose.yml` based on your needs:

```yaml
deploy:
  resources:
    limits:
      cpus: '2.0'      # Increase for production
      memory: 1024M    # Increase for production
    reservations:
      cpus: '0.5'
      memory: 256M
```

### 4. Setup Reverse Proxy

For production, use a reverse proxy (Nginx, Pingora, or Caddy):

#### Nginx Example

```nginx
upstream oauth_backend {
    server localhost:3005;
}

server {
    listen 80;
    server_name oauth.example.com;

    location / {
        proxy_pass http://oauth_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

#### Caddy Example

```caddyfile
oauth.example.com {
    reverse_proxy localhost:3005
}
```

## Monitoring and Logging

### View Logs

```bash
# Docker Compose logs
docker-compose logs -f oauth-service-rust

# Docker logs
docker logs -f oauth-service-rust

# Using Makefile
make deploy-logs
```

### Log Levels

Configure logging via `RUST_LOG` environment variable:

```bash
# Info level for all modules
RUST_LOG=info

# Debug level for oauth service only
RUST_LOG=info,oauth_service_rust=debug

# Trace level for specific module
RUST_LOG=info,oauth_service_rust::services::token_service=trace
```

### Health Checks

The container includes a health check that runs every 30 seconds:

```bash
# Check container health
docker ps

# View health check logs
docker inspect oauth-service-rust | jq '.[0].State.Health'
```

## Database Management

### Backup Database

```bash
# Backup SQLite database
docker exec oauth-service-rust cp /app/data/oauth.db /app/data/oauth.db.backup

# Copy backup to host
docker cp oauth-service-rust:/app/data/oauth.db.backup ./backup/
```

### Restore Database

```bash
# Copy backup to container
docker cp ./backup/oauth.db.backup oauth-service-rust:/app/data/oauth.db

# Restart service
docker-compose restart oauth-service-rust
```

### Access Database

```bash
# Open SQLite shell
docker exec -it oauth-service-rust sqlite3 /app/data/oauth.db
```

## Troubleshooting

### Container Won't Start

1. Check logs:
   ```bash
   docker-compose logs oauth-service-rust
   ```

2. Verify JWT keys exist and have correct permissions:
   ```bash
   ls -la config/jwt/
   ```

3. Ensure database directory is writable:
   ```bash
   docker exec oauth-service-rust ls -la /app/data
   ```

### Port Already in Use

Change the external port in `docker-compose.yml`:

```yaml
ports:
  - "3006:3001"  # Change 3005 to another port
```

### Database Locked

If you see "database is locked" errors:

1. Stop all containers accessing the database
2. Remove lock files:
   ```bash
   docker exec oauth-service-rust rm -f /app/data/oauth.db-shm /app/data/oauth.db-wal
   ```
3. Restart the service

### Memory Issues

Increase memory limits:

```yaml
deploy:
  resources:
    limits:
      memory: 2048M  # Increase to 2GB
```

## Performance Tuning

### Database Optimization

For better SQLite performance, add WAL mode:

```bash
docker exec -it oauth-service-rust sqlite3 /app/data/oauth.db
> PRAGMA journal_mode=WAL;
> PRAGMA synchronous=NORMAL;
> .quit
```

### Connection Pooling

Adjust connection pool settings via environment:

```yaml
environment:
  SQLX_MAX_CONNECTIONS: "100"
  SQLX_MIN_CONNECTIONS: "10"
```

## Multi-Stage Deployment

For blue-green deployment or canary releases:

### Docker Compose Override

Create `docker-compose.override.yml`:

```yaml
version: '3.8'

services:
  oauth-service-rust-blue:
    extends:
      service: oauth-service-rust
    container_name: oauth-service-rust-blue
    ports:
      - "3005:3001"

  oauth-service-rust-green:
    extends:
      service: oauth-service-rust
    container_name: oauth-service-rust-green
    ports:
      - "3006:3001"
```

Deploy both versions:

```bash
docker-compose -f docker-compose.yml -f docker-compose.override.yml up -d
```

## Security Checklist

- [ ] JWT private key is secure (600 permissions)
- [ ] JWT keys are not committed to git
- [ ] Production `.env` file is excluded from git
- [ ] Database volumes are backed up regularly
- [ ] CORS origins are properly configured
- [ ] Container runs as non-root user
- [ ] Resource limits are set
- [ ] Health checks are configured
- [ ] Logs are rotated (use Docker logging driver)
- [ ] TLS/SSL is configured in reverse proxy

## Integration with Pingora Proxy

See [PINGORA_INTEGRATION.md](./PINGORA_INTEGRATION.md) for details on integrating with the Pingora reverse proxy.

## Useful Commands

```bash
# Build image
make docker-build

# Run container
make docker-run

# Stop container
make docker-stop

# Clean up
make docker-clean

# Full deployment
make deploy

# Restart services
make deploy-restart

# View logs
make deploy-logs
```

## References

- [Rust Docker Best Practices](https://docs.docker.com/language/rust/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [SQLite WAL Mode](https://www.sqlite.org/wal.html)
