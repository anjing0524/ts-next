/**
 * Consolidated API and Auth Library - Unified entry point
 * 
 * This file serves as the single entry point for all API and auth functionality
 * after the consolidation of legacy files.
 */

// API Client (consolidated)
export { APIClient } from './api-client-consolidated';
export { APIClient as EnhancedAPIClient } from './api-client-consolidated';
export type { RequestOptions } from './api-client-consolidated';

// Token Storage (consolidated)
export { TokenStorage } from '../auth/token-storage-consolidated';
export type { TokenStorageOptions } from '../auth/token-storage-consolidated';

// Supporting modules
export { APICacheLayer } from './cache-layer';
export { RetryWithCircuitBreaker } from './retry-with-circuit-breaker';

// Auth-related exports

export { EnhancedTokenStorage as AuthTokenStorage } from '../auth/enhanced-token-storage';

// Utility exports (removed to fix compilation issues)
// Note: Use direct imports instead: import { APIClient } from '@/lib/api'