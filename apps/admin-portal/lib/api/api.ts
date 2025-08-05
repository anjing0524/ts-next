/**
 * API Library - Unified exports
 * 
 * This file provides a single entry point for all API functionality
 */

// Import consolidated implementations
import { APIClient as APIClientImpl } from './api-client-consolidated';
import { TokenStorage as TokenStorageImpl } from '../auth/token-storage-consolidated';
import { EnhancedTokenStorage } from '../auth/enhanced-token-storage';

// Re-export the consolidated API client as the primary implementation
export const APIClient = APIClientImpl;
export const EnhancedAPIClient = APIClientImpl;

// Export types
export type { RequestOptions } from './api-client-consolidated';
export type { TokenStorageOptions } from '../auth/token-storage-consolidated';

// Export supporting modules
export { APICacheLayer } from './cache-layer';
export { RetryWithCircuitBreaker } from './retry-with-circuit-breaker';
export { EnhancedTokenStorage } from '../auth/enhanced-token-storage';

// Legacy compatibility exports for TokenStorage
export const TokenStorage = {
  // Static methods (new API)
  setTokens: TokenStorageImpl.setTokens,
  getAccessToken: TokenStorageImpl.getAccessToken,
  getRefreshToken: TokenStorageImpl.getRefreshToken,
  clearTokens: TokenStorageImpl.clearTokens,
  isTokenExpired: TokenStorageImpl.isTokenExpired,
  getTokenRemainingTime: TokenStorageImpl.getTokenRemainingTime,
  
  // Instance methods (legacy compatibility)
  getInstance: () => ({
    setToken: TokenStorageImpl.setTokens,
    getToken: TokenStorageImpl.getAccessToken,
    setRefreshToken: TokenStorageImpl.setTokens,
    getRefreshToken: TokenStorageImpl.getRefreshToken,
    clearTokens: TokenStorageImpl.clearTokens,
  }),
};

// Legacy static methods for backward compatibility
export const setTokens = TokenStorageImpl.setTokens;
export const getAccessToken = TokenStorageImpl.getAccessToken;
export const getRefreshToken = TokenStorageImpl.getRefreshToken;
export const clearTokens = TokenStorageImpl.clearTokens;
export const isTokenExpired = TokenStorageImpl.isTokenExpired;
export const getTokenRemainingTime = TokenStorageImpl.getTokenRemainingTime;

// Default exports
export default {
  APIClient: APIClientImpl,
  TokenStorage: TokenStorage,
  EnhancedTokenStorage,
};