# OAuth 2.1 Authentication & Authorization System

> A modern, production-ready OAuth 2.1 authorization server with PKCE, built with Rust and Next.js

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Rust](https://img.shields.io/badge/Rust-1.70+-orange.svg)](https://www.rust-lang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16.0-black.svg)](https://nextjs.org/)

---

## 📋 Overview

This project provides a complete OAuth 2.1 authentication and authorization system with:

- ✅ **OAuth 2.1 Compliance** - Follows the latest OAuth 2.1 security standards
- ✅ **Mandatory PKCE** - All authorization code flows require PKCE
- ✅ **RBAC** - Role-Based Access Control with permission caching
- ✅ **Audit Logging** - Comprehensive security event tracking
- ✅ **High Performance** - Rust-powered authorization server (50K+ req/s)
- ✅ **Modern UI** - Next.js 16 admin portal with React 19

---

## 🏗️ Architecture

### System Components

```
┌──────────────────────────────────────────────────────────────┐
│                     Client Applications                       │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │   Pingora Proxy      │  Port: 6188 (HTTP/HTTPS)
              │   (Rust)             │  - Reverse Proxy
              │                      │  - Load Balancing
              │                      │  - SSL Termination
              └──────────┬───────────┘
                         │
          ┌──────────────┴──────────────┐
          │                             │
          ▼                             ▼
┌──────────────────┐          ┌──────────────────┐
│ OAuth Service    │          │  Admin Portal    │
│ (Rust + Axum)    │          │  (Next.js 16)    │
│                  │          │                  │
│ Port: 3001       │          │  Port: 3002      │
│ - Authorization  │          │  - User Mgmt     │
│ - Token Mgmt     │          │  - Client Mgmt   │
│ - User Auth      │          │  - Role Mgmt     │
│ - RBAC           │          │  - Audit Logs    │
└────────┬─────────┘          └──────────────────┘
         │
         ▼
   ┌──────────┐
   │ SQLite   │  (Development)
   │ MySQL    │  (Production)
   └──────────┘
```

### Technology Stack

#### Backend (OAuth Service)
- **Rust 1.70+** - Systems programming language
- **Axum 0.7** - Web framework
- **SQLx** - SQL toolkit (SQLite/MySQL support)
- **Tokio** - Async runtime
- **JWT** - jsonwebtoken crate
- **bcrypt** - Password hashing

#### Frontend (Admin Portal)
- **Next.js 16** - React framework (App Router)
- **React 19** - UI library
- **TypeScript 5** - Type safety
- **TanStack Query** - Server state management
- **Zustand** - Client state management
- **Tailwind CSS** - Styling
- **shadcn/ui** - UI components

#### Infrastructure
- **Pingora** - Cloudflare's proxy (Rust-based)
- **Docker** - Containerization
- **Prometheus** - Metrics (optional)
- **Grafana** - Monitoring (optional)

---

## 🚀 Quick Start

### Prerequisites

- **Rust** 1.70+ ([Install](https://www.rust-lang.org/tools/install))
- **Node.js** 20+ ([Install](https://nodejs.org/))
- **pnpm** 9+ (`npm install -g pnpm`)
- **Docker** (optional, for production deployment)

### 1. Clone Repository

```bash
git clone https://github.com/yourusername/oauth-system.git
cd oauth-system
```

### 2. Setup OAuth Service (Rust)

```bash
cd apps/oauth-service-rust

# Install dependencies (automatic with cargo)
# Create .env file
cp .env.example .env

# Generate JWT keys
mkdir -p keys
openssl genrsa -out keys/private_key.pem 2048
openssl rsa -in keys/private_key.pem -pubout -out keys/public_key.pem

# Run migrations and start server
cargo run
```

**OAuth Service will start on**: `http://localhost:3001`

### 3. Setup Admin Portal (Next.js)

```bash
cd apps/admin-portal

# Install dependencies
pnpm install

# Create .env.local
cp .env.example .env.local

# Start development server
pnpm dev
```

**Admin Portal will start on**: `http://localhost:3002`

### 4. Setup Pingora Proxy (Optional)

```bash
cd apps/pingora-proxy

# Run proxy
cargo run -- --config config/default.yaml
```

**Proxy will start on**: `http://localhost:6188`

### 5. Access the System

- **Admin Portal**: http://localhost:3002
- **OAuth Service**: http://localhost:3001
- **Unified Gateway** (via Pingora): http://localhost:6188

**Default Credentials**:
- Username: `admin`
- Password: `admin123` (⚠️ Change in production!)

---

## 📚 Documentation

### Core Documentation

| Document | Description | Location |
|----------|-------------|----------|
| **OAuth 2.1 Business Flows** | Complete OAuth flows and security | [docs/OAUTH_2.1_BUSINESS_FLOWS.md](docs/OAUTH_2.1_BUSINESS_FLOWS.md) |
| **API Documentation** | REST API reference | [docs/API_DOCUMENTATION.md](docs/API_DOCUMENTATION.md) |
| **Architecture Design** | System architecture | [docs/ARCHITECTURE_DESIGN.md](docs/ARCHITECTURE_DESIGN.md) |
| **Deployment Guide** | Deployment procedures | [docs/DEPLOYMENT_AND_OPERATIONS.md](docs/DEPLOYMENT_AND_OPERATIONS.md) |
| **Production Config** | Configuration guide | [docs/PRODUCTION_CONFIGURATION_GUIDE.md](docs/PRODUCTION_CONFIGURATION_GUIDE.md) |
| **Production Checklist** | Readiness assessment | [docs/PRODUCTION_READINESS_CHECKLIST.md](docs/PRODUCTION_READINESS_CHECKLIST.md) |
| **Delivery Summary** | Project overview | [docs/FINAL_DELIVERY_SUMMARY.md](docs/FINAL_DELIVERY_SUMMARY.md) |

---

## 🔑 Key Features

### OAuth 2.1 Implementation

- ✅ **Authorization Code Flow with PKCE** (mandatory)
- ✅ **Refresh Token Grant** (with token rotation)
- ✅ **Client Credentials Grant** (for service accounts)
- ✅ **Token Introspection** (RFC 7662)
- ✅ **Token Revocation** (RFC 7009)
- ✅ **OpenID Connect** (UserInfo endpoint)

### Security Features

- ✅ **PKCE** - Proof Key for Code Exchange (S256)
- ✅ **JWT** - RS256/HS256 signatures
- ✅ **RBAC** - Fine-grained permission system
- ✅ **CSRF Protection** - State parameter validation
- ✅ **XSS Protection** - HttpOnly cookies
- ✅ **Rate Limiting** - 100 req/min per IP
- ✅ **Audit Logging** - All operations tracked
- ✅ **Data Sanitization** - Automatic PII masking

### Performance Optimizations

- ✅ **Permission Caching** - 5-minute TTL
- ✅ **Connection Pooling** - Optimized DB connections
- ✅ **Database Indexing** - All critical fields
- ✅ **Async I/O** - Tokio async runtime
- ✅ **Code Splitting** - Next.js optimization

---

## 🧪 Testing

### Run Rust Tests

```bash
cd apps/oauth-service-rust
cargo test
```

### Run Admin Portal Tests

```bash
cd apps/admin-portal

# Unit tests
pnpm test

# E2E tests
pnpm test:e2e

# OAuth flow tests
pnpm test:oauth
```

---

## 🐳 Production Deployment

### Docker Compose

```bash
# Build and start all services
docker-compose -f docker-compose.production.yml up -d

# View logs
docker-compose -f docker-compose.production.yml logs -f

# Stop all services
docker-compose -f docker-compose.production.yml down
```

### Kubernetes

```bash
# Deploy to Kubernetes
kubectl apply -f k8s/

# Check status
kubectl get pods -n oauth-system
```

See [Deployment Guide](docs/DEPLOYMENT_AND_OPERATIONS.md) for detailed instructions.

---

## 🔧 Configuration

### OAuth Service (.env)

```bash
# Database
DATABASE_URL=sqlite:./oauth.db  # Development
# DATABASE_URL=mysql://user:pass@host:3306/oauth_db  # Production

# JWT
JWT_ALGORITHM=RS256  # Use RS256 in production
JWT_PRIVATE_KEY_PATH=./keys/private_key.pem
JWT_PUBLIC_KEY_PATH=./keys/public_key.pem

# Server
ISSUER=https://auth.yourdomain.com
NODE_ENV=production
```

### Admin Portal (.env.local)

```bash
# OAuth Client
NEXT_PUBLIC_OAUTH_CLIENT_ID=admin-portal-client
NEXT_PUBLIC_OAUTH_CLIENT_SECRET=your-secret-here
NEXT_PUBLIC_OAUTH_REDIRECT_URI=https://admin.yourdomain.com/auth/callback

# API
NEXT_PUBLIC_API_BASE_URL=https://api.yourdomain.com/api/v2
NEXT_PUBLIC_OAUTH_SERVICE_URL=https://api.yourdomain.com/api/v2
```

---

## 📊 Project Structure

```
oauth-system/
├── apps/
│   ├── oauth-service-rust/     # Rust OAuth Server
│   │   ├── src/
│   │   │   ├── routes/         # API endpoints
│   │   │   ├── services/       # Business logic
│   │   │   ├── middleware/     # Auth, permission, audit
│   │   │   ├── models/         # Data models
│   │   │   └── utils/          # Helpers
│   │   └── migrations/         # Database migrations
│   │
│   ├── admin-portal/           # Next.js Admin UI
│   │   ├── app/                # App router pages
│   │   ├── features/           # Feature modules (DDD)
│   │   ├── lib/                # Utilities
│   │   └── components/         # React components
│   │
│   └── pingora-proxy/          # Reverse Proxy
│       ├── src/                # Proxy logic
│       └── config/             # Proxy configuration
│
├── packages/                   # Shared packages
│   ├── ui/                     # Shared UI components
│   ├── config/                 # Shared configs
│   └── ...
│
├── docs/                       # Documentation
├── k8s/                        # Kubernetes manifests
├── docker-compose.production.yml
└── README.md
```

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- [Cloudflare Pingora](https://github.com/cloudflare/pingora) - High-performance proxy
- [Axum](https://github.com/tokio-rs/axum) - Rust web framework
- [Next.js](https://nextjs.org/) - React framework
- [OAuth 2.1](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-07) - OAuth specification

---

## 📞 Support

For issues and questions:

- **Issues**: [GitHub Issues](https://github.com/yourusername/oauth-system/issues)
- **Documentation**: [docs/](docs/)
- **Email**: support@yourdomain.com

---

**Built with ❤️ using Rust and Next.js**
