# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Next.js 15 + TypeScript enterprise monorepo with OAuth 2.1 authentication center, financial data visualization, and WebAssembly high-performance computing. Built with TurboRepo, Rust, and modern DevOps practices.

## Architecture

### Services
- **oauth-service** (3001): OAuth 2.1 authentication service with PKCE, JWT, and comprehensive client management
- **admin-portal** (3002): Management dashboard with shadcn/ui, React 19, and full OAuth integration
- **kline-service** (3003): Financial charting service with WebAssembly + Rust for high-performance rendering
- **pingora-proxy**: Rust-based reverse proxy using Cloudflare Pingora framework

### Shared Packages
- `@repo/ui`: Shared UI component library
- `@repo/lib`: Shared utilities and middleware
- `@repo/database`: Prisma ORM with SQLite
- `@repo/cache`: Redis caching layer
- `@repo/eslint-config`: ESLint configurations
- `@repo/jest-config`: Jest testing configurations
- `@repo/typescript-config`: TypeScript configurations

## Essential Commands

### Development
```bash
pnpm install              # Install dependencies
pnpm dev                  # Start all services in parallel
pnpm start:e2e           # Start OAuth integration (admin-portal + oauth-service)
pnpm --filter=oauth-service dev  # Start specific service
```

### Database
```bash
pnpm db:generate         # Generate Prisma Client
pnpm db:push            # Sync database schema
pnpm db:seed            # Seed database with test data
pnpm db:studio          # Launch Prisma Studio UI
```

### Testing
```bash
pnpm test               # Run all unit tests
pnpm e2e               # Run end-to-end tests
pnpm e2e:ui            # Run Playwright UI tests
pnpm test:e2e:admin    # Admin portal integration tests
```

### Build & Quality
```bash
pnpm build              # Build all services
pnpm lint               # Run ESLint
pnpm format             # Format code
pnpm type-check         # Type checking
```

### Environment Setup
```bash
# Core environment variables
DATABASE_URL="file:./dev.db"
JWT_PRIVATE_KEY_PATH="./test-private.pem"
JWT_PUBLIC_KEY_PATH="./test-public.pem"
AUTH_CENTER_LOGIN_PAGE_URL="http://localhost:3001"
REDIS_URL="redis://localhost:6379"
```

## Service Ports
- oauth-service: 3001
- admin-portal: 3002
- kline-service: 3003
- pingora-proxy: 6188
- redis: 6379

## Key Technologies
- **Frontend**: Next.js 15, React 19, TypeScript 5.8, Tailwind CSS 4.1
- **Backend**: Node.js, Prisma ORM, JWT authentication
- **Performance**: Rust + WebAssembly, Pingora proxy
- **Database**: SQLite with Prisma
- **Testing**: Jest 30 + Playwright
- **Monorepo**: TurboRepo + pnpm

## Development Workflow
1. `pnpm install` → setup dependencies
2. `pnpm db:generate && pnpm db:push && pnpm db:seed` → initialize database
3. `pnpm dev` → start development environment
4. `pnpm test` → run tests
5. `pnpm commit` → commit with Commitizen

## WebAssembly Build
```bash
cd apps/kline-service/wasm-cal
./build.sh  # Build WASM modules
```

## Health Checks
```bash
curl http://localhost:3001/api/health  # oauth-service
curl http://localhost:3002/api/health  # admin-portal
curl http://localhost:3003/api/health  # kline-service
```