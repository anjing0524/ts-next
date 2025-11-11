# Legacy to Consolidated Migration Guide

## Overview
This guide helps migrate from the legacy enhanced/simple/legacy file structure to the new consolidated implementations.

## Files Consolidated

### Token Storage
- **REMOVED**: `simplified-token-storage.ts`
- **REMOVED**: `token-storage.ts` (legacy)
- **CONSOLIDATED**: `token-storage-consolidated.ts` (uses EnhancedTokenStorage)

### API Clients
- **REMOVED**: `enhanced-api-client-with-store.ts`
- **CONSOLIDATED**: `api-client-consolidated.ts` (enhanced features with SSR safety)

## Migration Steps

### 1. Update Imports

#### Before:
```typescript
// Old imports
import { TokenStorage } from '@/lib/auth/token-storage';
import { SimplifiedTokenStorage } from '@/lib/auth/simplified-token-storage';
import { EnhancedAPIClientWithStore } from '@/lib/api/enhanced-api-client-with-store';
```

#### After:
```typescript
// New imports
import { TokenStorage } from '@/lib/auth/token-storage-consolidated';
import { APIClient } from '@/lib/api/api-client-consolidated';
```

### 2. API Usage Changes

#### Before:
```typescript
// EnhancedAPIClientWithStore usage
await EnhancedAPIClientWithStore.request('/api/data', {
  cacheKey: 'my-data',
  showLoading: true,
  loadingKey: 'data-loading'
});
```

#### After:
```typescript
// APIClient usage
await APIClient.request('/api/data', {
  cacheKey: 'my-data',
  showLoading: true,
  loadingKey: 'data-loading'
});
```

### 3. Token Storage Changes

#### Before:
```typescript
// Legacy token storage
TokenStorage.setTokens(accessToken, refreshToken);
```

#### After:
```typescript
// Consolidated token storage (same API)
TokenStorage.setTokens(accessToken, refreshToken);
// Or use the enhanced API
TokenStorage.setTokens({
  accessToken,
  refreshToken,
  expiresIn: 3600,
  csrfToken: TokenStorage.generateCSRFToken()
});
```

## Compatibility Layer

The consolidated implementations maintain backward compatibility:
- All old method signatures are supported
- Enhanced features are available through new options
- SSR safety is built-in
- No breaking changes required

## Features Added

### API Client
- ✅ Circuit breaker pattern
- ✅ Enhanced caching with TTL
- ✅ SSR-safe requests
- ✅ Graceful error handling
- ✅ Request deduplication

### Token Storage
- ✅ HttpOnly cookie security
- ✅ CSRF protection
- ✅ SSR compatibility
- ✅ Token expiration handling
- ✅ Migration from legacy storage

## Testing

Run the migration test suite:
```bash
pnpm test -- --testNamePattern="migration"
```

## Rollback

If issues arise, files are backed up to `/lib/deprecated/` for rollback purposes.