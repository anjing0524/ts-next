export class TokenStorage {
  private static instance: TokenStorage;
  private static readonly ACCESS_TOKEN_KEY = 'access_token';
  private static readonly REFRESH_TOKEN_KEY = 'refresh_token';

  static getInstance(): TokenStorage {
    if (!TokenStorage.instance) {
      TokenStorage.instance = new TokenStorage();
    }
    return TokenStorage.instance;
  }

  private isBrowser(): boolean {
    return typeof window !== 'undefined';
  }

  setToken(token: string): void {
    if (this.isBrowser()) {
      sessionStorage.setItem(TokenStorage.ACCESS_TOKEN_KEY, token);
    }
  }

  getToken(): string | null {
    if (this.isBrowser()) {
      return sessionStorage.getItem(TokenStorage.ACCESS_TOKEN_KEY);
    }
    return null;
  }

  setRefreshToken(token: string): void {
    if (this.isBrowser()) {
      sessionStorage.setItem(TokenStorage.REFRESH_TOKEN_KEY, token);
    }
  }

  getRefreshToken(): string | null {
    if (this.isBrowser()) {
      return sessionStorage.getItem(TokenStorage.REFRESH_TOKEN_KEY);
    }
    return null;
  }

  clearTokens(): void {
    if (this.isBrowser()) {
      sessionStorage.removeItem(TokenStorage.ACCESS_TOKEN_KEY);
      sessionStorage.removeItem(TokenStorage.REFRESH_TOKEN_KEY);
    }
  }

  static clearTokens(): void {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(TokenStorage.ACCESS_TOKEN_KEY);
      sessionStorage.removeItem(TokenStorage.REFRESH_TOKEN_KEY);
    }
  }

  static getAccessToken(): string | null {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem(TokenStorage.ACCESS_TOKEN_KEY);
    }
    return null;
  }

  static setTokens(accessToken: string, refreshToken: string, expiresIn?: number): void {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(TokenStorage.ACCESS_TOKEN_KEY, accessToken);
      sessionStorage.setItem(TokenStorage.REFRESH_TOKEN_KEY, refreshToken);
      
      // Store expiration time if provided
      if (expiresIn) {
        const expiresAt = Date.now() + (expiresIn * 1000);
        localStorage.setItem('token_expires_at', expiresAt.toString());
      }
    }
  }

  static getTokenRemainingTime(): number {
    if (typeof window === 'undefined') return 0;
    
    const token = sessionStorage.getItem(TokenStorage.ACCESS_TOKEN_KEY);
    if (!token) return 0;
    
    const expiresAt = localStorage.getItem('token_expires_at');
    if (!expiresAt) return 0;
    
    const remaining = parseInt(expiresAt) - Date.now();
    return Math.max(0, remaining);
  }

  static isTokenExpired(): boolean {
    if (typeof window === 'undefined') return true;
    
    const token = sessionStorage.getItem(TokenStorage.ACCESS_TOKEN_KEY);
    if (!token) return true;
    
    const expiresAt = localStorage.getItem('token_expires_at');
    if (!expiresAt) return true;
    
    return parseInt(expiresAt) <= Date.now();
  }
}