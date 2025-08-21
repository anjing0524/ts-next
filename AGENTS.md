# AGENTS.md - Development Guide

## Essential Commands
- **Build**: `pnpm build` | **Dev**: `pnpm dev` | **Test**: `pnpm test` 
- **Single service**: `pnpm --filter=<service> dev/test/build`
- **Database**: `pnpm db:generate && pnpm db:push && pnpm db:seed` (init) | `pnpm db:studio` (manage)
- **Lint/Format**: `pnpm lint` | `pnpm format` | `pnpm type-check`
- **WASM**: `pnpm wasm:build` | `pnpm wasm:test` | `cd apps/kline-service/wasm-cal && wasm-pack test --headless --chrome` (single test)
- **E2E**: `pnpm e2e` | `pnpm test:e2e:admin` (admin portal E2E)

## Architecture
- **Monorepo**: TurboRepo with pnpm workspaces
- **Services**: oauth-service (3001), admin-portal (3002), kline-service (3003), ws-kline-service (3004), pingora-proxy (6188)
- **Packages**: @repo/ui, @repo/lib, @repo/database, @repo/cache, @repo/config
- **Tech Stack**: Next.js/React/TS frontend, Node.js backend, Rust/WASM for performance, Prisma ORM, Redis cache
- **Data**: FlatBuffers for serialization, WebSocket for real-time data

## Code Style  
- **TypeScript**: Strict mode, noUncheckedIndexedAccess enabled
- **Formatting**: Prettier (100 chars, 2 spaces, single quotes, semicolons)
- **Linting**: ESLint flat config with TypeScript/Next.js rules  
- **Rust**: Standard formatting, Chinese comments allowed in domain files
- **Commits**: Conventional commits with commitlint
- **Pre-commit**: Auto-format and lint via husky + lint-staged

## Development Notes
- Always run database init sequence before first dev
- WASM builds required for kline-service functionality  
- Use turbo for parallel builds and caching
- All services must pass type-check before deployment
- Update CLAUDE.md when making significant changes
