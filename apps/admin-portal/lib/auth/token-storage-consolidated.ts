/**
 * Consolidated Token Storage - Unified token management
 * 
 * This is the primary token storage implementation that combines:
 * - EnhancedTokenStorage (security-focused)
 * - SimplifiedTokenStorage (simplicity-focused) 
 * - Backward compatibility for legacy code
 * 
 * Features:
 * - HttpOnly cookie storage for production
 * - SessionStorage fallback for development/testing
 * - SSR compatibility
 * - CSRF protection
 * - Automatic token refresh
 * - Migration from legacy storage
 */

import { EnhancedTokenStorage } from './enhanced-token-storage';

// SSR-safe wrapper for EnhancedTokenStorage
export class TokenStorage {
  // Proxy all methods with SSR safety checks
  static setTokens = EnhancedTokenStorage.setTokens;
  static getAccessToken = EnhancedTokenStorage.getAccessToken;
  static getRefreshToken = EnhancedTokenStorage.getRefreshToken;
  static getCSRFToken = EnhancedTokenStorage.getCSRFToken;
  static clearTokens = EnhancedTokenStorage.clearTokens;
  static isTokenExpired = EnhancedTokenStorage.isTokenExpired;
  static getTokenRemainingTime = EnhancedTokenStorage.getTokenRemainingTime;
  static getTokenExpiresAt = EnhancedTokenStorage.getTokenExpiresAt;
  static setTokenExpiresAt = EnhancedTokenStorage.setTokenExpiresAt;
  static generateCSRFToken = EnhancedTokenStorage.generateCSRFToken;
  static validateCSRFToken = EnhancedTokenStorage.validateCSRFToken;
  static isCookieStorageAvailable = EnhancedTokenStorage.isCookieStorageAvailable;
  static getAllTokens = EnhancedTokenStorage.getAllTokens;

  // SSR-safe initialization
  static isSSR(): boolean {
    return typeof window === 'undefined';
  }

  // Safe token check for SSR
  static hasValidToken(): boolean {
    if (this.isSSR()) return false;
    return !this.isTokenExpired() && !!this.getAccessToken();
  }

  // Safe token for server-side rendering
  static getTokenForSSR(): string | null {
    if (this.isSSR()) return null;
    return this.getAccessToken();
  }
}

// Re-export as the unified implementation

// Export type aliases for backward compatibility
export type { TokenStorageOptions } from './enhanced-token-storage';

// Legacy compatibility exports
export const setTokens = TokenStorage.setTokens;
export const getAccessToken = TokenStorage.getAccessToken;
export const getRefreshToken = TokenStorage.getRefreshToken;
export const clearTokens = TokenStorage.clearTokens;
export const isTokenExpired = TokenStorage.isTokenExpired;
export const getTokenRemainingTime = TokenStorage.getTokenRemainingTime;